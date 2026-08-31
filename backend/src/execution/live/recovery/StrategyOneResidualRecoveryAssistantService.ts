import {
  createHash,
} from "node:crypto";

import {
  resolve,
} from "node:path";

import {
  getExchangeTakerFeePercent,
} from "../../../arbitrage/config/fees";

import type {
  OrderBook,
} from "../../../orderbook/models/OrderBook";

import {
  vwapCalculator,
} from "../../../orderbook/calculators/VWAPCalculator";

import {
  orderBookService,
} from "../../../orderbook/services/OrderBookService";

import {
  JsonlSnapshotStore,
} from "../../../core/persistence/JsonlSnapshotStore";

import type {
  ExchangeMarketCapability,
} from "../../capabilities/models/ExchangeCapability";

import {
  exchangeCapabilityService,
} from "../../capabilities/services/ExchangeCapabilityService";

import {
  strategyOneLiveVenueContractRegistry,
  type StrategyOneTimeInForce,
  type StrategyOneVenueOrderContract,
} from "../contracts/StrategyOneLiveVenueContractRegistry";

import {
  strategyOneTwoLegLiveExecutionService,
  type StrategyOneTwoLegExecutionResult,
  type StrategyOneTwoLegSessionRecord,
} from "../arbitrage/StrategyOneTwoLegLiveExecutionService";

import {
  tradingAccountService,
  type ExchangeBalanceSnapshot,
} from "../../../trading/account/TradingAccountService";

export type StrategyOneResidualRecoveryAssistantState =
  | "BLOCKED"
  | "BALANCED_NO_ACTION"
  | "READY_FOR_OPERATOR_REVIEW"
  | "OPERATOR_APPROVED_EVIDENCE_ONLY";

export interface StrategyOneResidualRecoveryPreview {
  readonly schemaVersion: "142.0";
  readonly id: string;
  readonly sessionId: string;
  readonly sourceSessionFingerprint: string;
  readonly state: StrategyOneResidualRecoveryAssistantState;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly approvedAt: number | null;
  readonly opportunityId: string;
  readonly market: string;
  readonly buyExchange: string;
  readonly sellExchange: string;
  readonly authoritative: {
    readonly reconciledBeforeAssessment: true;
    readonly bothLegsTerminal: boolean;
    readonly buyStatus: string | null;
    readonly sellStatus: string | null;
    readonly buyFilledQuantity: number | null;
    readonly sellFilledQuantity: number | null;
    readonly buyAverageFillPrice: number | null;
    readonly sellAverageFillPrice: number | null;
  };
  readonly residual: {
    readonly direction: "LONG" | "SHORT" | null;
    readonly venue: string | null;
    readonly side: "BUY" | "SELL" | null;
    readonly exactQuantity: number;
    readonly executableQuantity: number | null;
    readonly dustQuantity: number | null;
    readonly referenceEntryPrice: number | null;
  };
  readonly executionPreview: {
    readonly selectedTimeInForce: StrategyOneTimeInForce | null;
    readonly boundedCancelRequired: boolean;
    readonly maximumBookAgeMs: number | null;
    readonly bookTimestamp: number | null;
    readonly bookAgeMs: number | null;
    readonly fillPercent: number | null;
    readonly vwapPrice: number | null;
    readonly limitPrice: number | null;
    readonly takerFeePercent: number | null;
    readonly estimatedFeeQuote: number | null;
    readonly estimatedAdverseMoveLossQuote: number | null;
    readonly estimatedTotalLossQuote: number | null;
    readonly maximumAllowedLossQuote: number | null;
    readonly balanceAsset: string | null;
    readonly requiredBalance: number | null;
    readonly availableBalance: number | null;
    readonly balanceAgeMs: number | null;
  };
  readonly oneTimeLossAuthorization: {
    readonly maximumLossQuote: number;
    readonly confirmation: string;
    readonly authorizedAt: number;
  } | null;
  readonly blockers: readonly string[];
  readonly requiredApprovalPhrase: string | null;
  readonly safety: {
    readonly authoritativeReadReconciliationOnly: true;
    readonly exactResidualNeverIncreased: true;
    readonly fullDepthRequired: true;
    readonly currentRulesRequired: true;
    readonly freshBalanceRequired: true;
    readonly maximumLossCapRequired: true;
    readonly approvalIsEvidenceOnly: true;
    readonly automaticRetryAllowed: false;
    readonly automaticRecoveryOrderAllowed: false;
    readonly orderSubmissionAllowed: false;
    readonly orderSubmissionPerformed: false;
    readonly transferAllowed: false;
    readonly withdrawalAllowed: false;
  };
}

export interface StrategyOneApprovedResidualExecutionBoundary {
  readonly approvedPreview: StrategyOneResidualRecoveryPreview;
  readonly actionTimePreview: StrategyOneResidualRecoveryPreview;
}

interface PersistedSnapshot {
  readonly schemaVersion: "142.0";
  readonly savedAt: number;
  readonly previews: readonly StrategyOneResidualRecoveryPreview[];
}

interface PairPort {
  getSession(sessionId: string): StrategyOneTwoLegSessionRecord | null;
  reconcileSession(
    sessionId: string,
    now?: number,
  ): Promise<StrategyOneTwoLegExecutionResult>;
}

export interface StrategyOneResidualRecoveryAssistantDependencies {
  currentTime(): number;
  getOrderBook(exchange: string, market: string): OrderBook | null;
  getCapability(exchange: string, market: string): ExchangeMarketCapability | null;
  getBalance(exchange: string, asset: string): ExchangeBalanceSnapshot | null;
  getTakerFeePercent(exchange: string, market: string, now: number): number | null;
  getVenueContract(
    exchange: string,
    route: {
      readonly market: string;
      readonly buyExchange: string;
      readonly sellExchange: string;
    },
    now: number,
  ): StrategyOneVenueOrderContract | null;
}

export interface StrategyOneResidualRecoveryAssistantConfiguration {
  readonly previewTtlMs: number;
  readonly maximumCapabilityAgeMs: number;
  readonly maximumBalanceAgeMs: number;
  readonly maximumLossPercentOfResidual: number;
  readonly maximumOperatorAuthorizedLossQuote: number;
  readonly maximumResidualQuoteValue: number;
  readonly maximumPreviews: number;
}

const DEFAULT_FILE =
  resolve(
    process.cwd(),
    "logs",
    "live",
    "strategy-one-residual-recovery-assistant.jsonl",
  );

const DEFAULT_CONFIGURATION:
  StrategyOneResidualRecoveryAssistantConfiguration = {
  previewTtlMs: 30_000,
  maximumCapabilityAgeMs: 300_000,
  maximumBalanceAgeMs: 15_000,
  maximumLossPercentOfResidual: 1,
  maximumOperatorAuthorizedLossQuote: 1,
  maximumResidualQuoteValue: 10_000,
  maximumPreviews: 500,
};

const DEFAULT_DEPENDENCIES:
  StrategyOneResidualRecoveryAssistantDependencies = {
  currentTime:
    () => Date.now(),
  getOrderBook:
    (exchange, market) =>
      orderBookService.get(exchange, market),
  getCapability:
    (exchange, market) =>
      exchangeCapabilityService.getCachedCapability(exchange, market, "spot"),
  getBalance:
    (exchange, asset) =>
      tradingAccountService.getExchangeBalance(exchange, asset),
  getTakerFeePercent:
    getExchangeTakerFeePercent,
  getVenueContract:
    (exchange, route, now) =>
      strategyOneLiveVenueContractRegistry.getOrderTimeSafetyContract(
        exchange,
        route,
        now,
      ),
};

/**
 * Evidence-only recovery assistant for Strategy #1 two-leg LIVE sessions.
 *
 * An explicit inspection first invokes the existing pair owner's
 * allowNewSubmission=false reconciliation path. Only terminal, authoritative
 * unequal fills can produce a recovery preview. The preview then requires a
 * fresh complete book, current SPOT rules, a fresh wallet balance, explicit
 * fees and a bounded incremental-loss estimate. Approval is persisted as an
 * operator decision only; this class deliberately exposes no execution,
 * cancel, transfer or withdrawal port.
 */
export class StrategyOneResidualRecoveryAssistantService {
  private readonly dependencies:
    StrategyOneResidualRecoveryAssistantDependencies;
  private readonly configuration:
    StrategyOneResidualRecoveryAssistantConfiguration;
  private readonly store:
    JsonlSnapshotStore<PersistedSnapshot>;
  private readonly previews =
    new Map<string, StrategyOneResidualRecoveryPreview>();
  private readonly inFlight =
    new Map<string, Promise<StrategyOneResidualRecoveryPreview>>();

  constructor(
    private readonly pairs: PairPort = strategyOneTwoLegLiveExecutionService,
    dependencies:
      Partial<StrategyOneResidualRecoveryAssistantDependencies> = {},
    configuration:
      Partial<StrategyOneResidualRecoveryAssistantConfiguration> = {},
    filePath = DEFAULT_FILE,
  ) {
    this.dependencies = {
      ...DEFAULT_DEPENDENCIES,
      ...dependencies,
    };
    this.configuration = {
      ...DEFAULT_CONFIGURATION,
      ...configuration,
    };
    validateConfiguration(this.configuration);

    this.store =
      new JsonlSnapshotStore({
        filePath,
        isPayload: isSnapshot,
      });

    const latest =
      this.store.readAll().at(-1);

    if (latest) {
      for (const preview of latest.previews) {
        this.previews.set(preview.id, freeze(clone(preview)));
      }
    }
  }

  inspectSession(
    sessionIdValue: string,
    now = Date.now(),
    oneTimeLossAuthorization: {
      readonly maximumLossQuote: number;
      readonly confirmation: string;
    } | null = null,
  ): Promise<StrategyOneResidualRecoveryPreview> {
    const sessionId =
      requireIdentifier(sessionIdValue, "session");
    validateTime(now);

    const inFlightKey =
      oneTimeLossAuthorization
        ? `${sessionId}:${createHash("sha256")
            .update(JSON.stringify(oneTimeLossAuthorization))
            .digest("hex")}`
        : sessionId;
    const active =
      this.inFlight.get(inFlightKey);

    if (active) {
      return active;
    }

    const work =
      this.inspectInternal(sessionId, now, oneTimeLossAuthorization)
        .finally(() => {
          this.inFlight.delete(inFlightKey);
        });

    this.inFlight.set(inFlightKey, work);
    return work;
  }

  approvePreview(
    previewIdValue: string,
    confirmationValue: string,
    now = Date.now(),
  ): StrategyOneResidualRecoveryPreview {
    const previewId =
      requireIdentifier(previewIdValue, "preview");
    validateTime(now);
    const current =
      this.previews.get(previewId);

    if (!current) {
      throw new Error("Strategy #1 recovery preview is unavailable.");
    }

    if (current.state === "OPERATOR_APPROVED_EVIDENCE_ONLY") {
      return clone(current);
    }

    if (
      current.state !== "READY_FOR_OPERATOR_REVIEW" ||
      current.expiresAt <= now ||
      !current.requiredApprovalPhrase
    ) {
      throw new Error("A current ready Strategy #1 recovery preview is required.");
    }

    if (confirmationValue.trim() !== current.requiredApprovalPhrase) {
      throw new Error("Exact Strategy #1 recovery approval phrase is required.");
    }

    const session =
      this.pairs.getSession(current.sessionId);

    if (
      !session ||
      fingerprint(session) !== current.sourceSessionFingerprint
    ) {
      throw new Error(
        "Strategy #1 material recovery evidence changed; inspect again before approval.",
      );
    }

    const approved =
      freeze({
        ...clone(current),
        state: "OPERATOR_APPROVED_EVIDENCE_ONLY" as const,
        approvedAt: now,
      });

    this.setAndPersist(approved, now);
    return clone(approved);
  }

  getPreview(
    previewIdValue: string,
  ): StrategyOneResidualRecoveryPreview | null {
    const preview =
      this.previews.get(
        requireIdentifier(previewIdValue, "preview"),
      );

    return preview ? clone(preview) : null;
  }

  /**
   * Revalidates an explicitly approved preview immediately before a separate
   * recovery execution owner is allowed to journal an order. This method only
   * performs known-order reconciliation and cached evidence reads; it has no
   * exchange order submission port.
   */
  async getApprovedExecutionBoundary(
    previewIdValue: string,
    now = Date.now(),
  ): Promise<StrategyOneApprovedResidualExecutionBoundary> {
    validateTime(now);
    const approved =
      this.previews.get(
        requireIdentifier(previewIdValue, "preview"),
      );

    if (
      !approved ||
      approved.state !== "OPERATOR_APPROVED_EVIDENCE_ONLY" ||
      approved.approvedAt === null
    ) {
      throw new Error(
        "A current explicitly approved Strategy #1 recovery preview is required.",
      );
    }

    const known = this.pairs.getSession(approved.sessionId);

    if (
      !known ||
      fingerprint(known) !== approved.sourceSessionFingerprint
    ) {
      throw new Error(
        "Strategy #1 material recovery evidence changed; inspect and approve again.",
      );
    }

    let session: StrategyOneTwoLegSessionRecord;

    try {
      session = (
        await this.pairs.reconcileSession(approved.sessionId, now)
      ).session;
    } catch (error: unknown) {
      throw new Error(
        `Action-time recovery reconciliation failed: ${message(error)}`,
      );
    }

    const assessmentTime = Math.max(
      now,
      this.dependencies.currentTime(),
    );
    validateTime(assessmentTime);

    if (approved.expiresAt <= assessmentTime) {
      throw new Error(
        "The approved Strategy #1 recovery preview expired; inspect and approve again.",
      );
    }

    if (fingerprint(session) !== approved.sourceSessionFingerprint) {
      throw new Error(
        "Strategy #1 material recovery evidence changed during action-time reconciliation.",
      );
    }

    const actionTime = this.buildPreview(
      session,
      assessmentTime,
      null,
      approved.oneTimeLossAuthorization,
    );

    if (actionTime.state !== "READY_FOR_OPERATOR_REVIEW") {
      throw new Error(
        `Action-time recovery evidence is blocked: ${actionTime.blockers.join(" | ")}`,
      );
    }

    assertSameRecoveryIntent(approved, actionTime);
    assertNoWorseRecoveryPrice(approved, actionTime);

    return freeze({
      approvedPreview: clone(approved),
      actionTimePreview: clone(actionTime),
    });
  }

  getDiagnostics(
    now = Date.now(),
  ) {
    validateTime(now);
    const previews =
      [...this.previews.values()]
        .sort((first, second) => second.createdAt - first.createdAt)
        .map(clone);

    return freeze({
      schemaVersion: "142.0" as const,
      generatedAt: now,
      mode: "EVIDENCE_BOUND_RESIDUAL_RECOVERY_ASSISTANT" as const,
      previews,
      summary: {
        total: previews.length,
        readyForOperatorReview: previews.filter(
          (preview) =>
            preview.state === "READY_FOR_OPERATOR_REVIEW" &&
            preview.expiresAt > now,
        ).length,
        approvedEvidenceOnly: previews.filter(
          (preview) =>
            preview.state === "OPERATOR_APPROVED_EVIDENCE_ONLY",
        ).length,
        blocked: previews.filter(
          (preview) => preview.state === "BLOCKED",
        ).length,
        balancedNoAction: previews.filter(
          (preview) => preview.state === "BALANCED_NO_ACTION",
        ).length,
        inFlightInspections: this.inFlight.size,
      },
      persistence: this.store.getDiagnostics(),
      safety: safety(),
    });
  }

  private async inspectInternal(
    sessionId: string,
    now: number,
    oneTimeLossAuthorization: {
      readonly maximumLossQuote: number;
      readonly confirmation: string;
    } | null,
  ): Promise<StrategyOneResidualRecoveryPreview> {
    const known =
      this.pairs.getSession(sessionId);

    if (!known) {
      throw new Error("No persisted Strategy #1 two-leg session exists.");
    }

    let session:
      StrategyOneTwoLegSessionRecord;
    let reconciliationFailure:
      string | null = null;

    try {
      const reconciled =
        await this.pairs.reconcileSession(sessionId, now);
      session = reconciled.session;
    } catch (error: unknown) {
      session =
        this.pairs.getSession(sessionId) ?? known;
      reconciliationFailure =
        error instanceof Error
          ? error.message
          : "Unknown authoritative reconciliation failure.";
    }

    // Reconciliation and authenticated reads are asynchronous. The caller's
    // timestamp marks when inspection started, so a book refreshed during
    // those reads can legitimately be newer than that timestamp. Assess
    // freshness against the completion-time clock while preserving injected
    // future timestamps used by deterministic callers.
    const assessmentTime = Math.max(
      now,
      this.dependencies.currentTime(),
    );
    validateTime(assessmentTime);

    const preview =
      this.buildPreview(
        session,
        assessmentTime,
        reconciliationFailure,
        oneTimeLossAuthorization,
      );
    this.setAndPersist(preview, assessmentTime);
    return clone(preview);
  }

  private buildPreview(
    session: StrategyOneTwoLegSessionRecord,
    now: number,
    reconciliationFailure: string | null,
    requestedOneTimeLossAuthorization: {
      readonly maximumLossQuote: number;
      readonly confirmation: string;
      readonly authorizedAt?: number;
    } | null = null,
  ): StrategyOneResidualRecoveryPreview {
    const blockers:
      string[] = [];
    const buy =
      session.buyResponse?.record?.result ?? null;
    const sell =
      session.sellResponse?.record?.result ?? null;
    const bothLegsTerminal =
      Boolean(
        buy &&
        sell &&
        terminal(buy.status) &&
        terminal(sell.status),
      );

    if (reconciliationFailure) {
      blockers.push(
        `Authoritative reconciliation failed: ${reconciliationFailure}`,
      );
    }

    if (!bothLegsTerminal) {
      blockers.push(
        "Both exchange legs require authoritative terminal evidence before residual assessment.",
      );
    }

    const buyFilled =
      finiteNonNegative(buy?.filledQuantity) ?? null;
    const sellFilled =
      finiteNonNegative(sell?.filledQuantity) ?? null;
    const exactResidual =
      buyFilled !== null && sellFilled !== null
        ? Math.abs(buyFilled - sellFilled)
        : 0;
    const tolerance =
      Math.max(
        1e-12,
        Math.max(buyFilled ?? 0, sellFilled ?? 0) * 1e-9,
      );
    const balanced =
      bothLegsTerminal && exactResidual <= tolerance;
    const longResidual =
      bothLegsTerminal &&
      buyFilled !== null &&
      sellFilled !== null &&
      buyFilled > sellFilled + tolerance;
    const shortResidual =
      bothLegsTerminal &&
      buyFilled !== null &&
      sellFilled !== null &&
      sellFilled > buyFilled + tolerance;
    const direction =
      longResidual
        ? "LONG" as const
        : shortResidual
          ? "SHORT" as const
          : null;
    const venue =
      longResidual
        ? normalizeExchange(session.buyRequest.exchange)
        : shortResidual
          ? normalizeExchange(session.sellRequest.exchange)
          : null;
    const side =
      longResidual
        ? "SELL" as const
        : shortResidual
          ? "BUY" as const
          : null;
    const market =
      normalizeMarket(session.buyRequest.market);
    const buyExchange =
      normalizeExchange(session.buyRequest.exchange);
    const sellExchange =
      normalizeExchange(session.sellRequest.exchange);
    const referenceEntryPrice =
      longResidual
        ? finitePositive(buy?.averageFillPrice) ?? null
        : shortResidual
          ? finitePositive(sell?.averageFillPrice) ?? null
          : null;
    const route = {
      market,
      buyExchange,
      sellExchange,
    };
    const oneTimeLossAuthorization =
      validateOneTimeLossAuthorization(
        requestedOneTimeLossAuthorization,
        market,
        side,
        exactResidual,
        now,
        this.configuration.maximumOperatorAuthorizedLossQuote,
        blockers,
      );

    let executableQuantity:
      number | null = null;
    let dustQuantity:
      number | null = null;
    let selectedTimeInForce:
      StrategyOneTimeInForce | null = null;
    let boundedCancelRequired =
      false;
    let maximumBookAgeMs:
      number | null = null;
    let bookTimestamp:
      number | null = null;
    let bookAgeMs:
      number | null = null;
    let fillPercent:
      number | null = null;
    let vwapPrice:
      number | null = null;
    let limitPrice:
      number | null = null;
    let takerFeePercent:
      number | null = null;
    let estimatedFeeQuote:
      number | null = null;
    let estimatedAdverseMoveLossQuote:
      number | null = null;
    let estimatedTotalLossQuote:
      number | null = null;
    let maximumAllowedLossQuote:
      number | null = null;
    let balanceAsset:
      string | null = null;
    let requiredBalance:
      number | null = null;
    let availableBalance:
      number | null = null;
    let balanceAgeMs:
      number | null = null;

    if (
      bothLegsTerminal &&
      !balanced &&
      direction &&
      venue &&
      side
    ) {
      const capability =
        this.dependencies.getCapability(venue, market);
      const contract =
        this.dependencies.getVenueContract(venue, route, now);
      const book =
        this.dependencies.getOrderBook(venue, market);

      this.validateCapability(
        capability,
        side,
        exactResidual,
        now,
        blockers,
      );

      if (capability) {
        executableQuantity =
          normalizeQuantityDown(
            exactResidual,
            capability.quantity.quantityStep,
          );
        dustQuantity =
          executableQuantity === null
            ? null
            : Math.max(0, exactResidual - executableQuantity);

        if (
          dustQuantity !== null &&
          dustQuantity > tolerance
        ) {
          blockers.push(
            `Exact residual ${exactResidual} cannot be flattened without leaving ${dustQuantity} quantity under current step rules.`,
          );
        }

        if (
          executableQuantity !== null &&
          executableQuantity > exactResidual + tolerance
        ) {
          blockers.push(
            "Recovery normalization attempted to increase residual exposure.",
          );
        }
      }

      if (!contract) {
        blockers.push(
          "Audited Strategy #1 venue order contract is unavailable.",
        );
      } else {
        maximumBookAgeMs =
          contract.maximumOrderBookAgeMs;
        selectedTimeInForce =
          contract.requiredTimeInForce ?? null;
        boundedCancelRequired =
          selectedTimeInForce === "GTC";

        if (
          !selectedTimeInForce ||
          !contract.supportedTimeInForce.includes(selectedTimeInForce)
        ) {
          blockers.push(
            "Exact audited recovery time-in-force mapping is unavailable.",
          );
        }

        if (!contract.authoritativeFillConfirmationReady) {
          blockers.push(
            "Authenticated private fill confirmation is not ready on the recovery venue.",
          );
        }

        if (!contract.authoritativeFeeReconciliationReady) {
          blockers.push(
            "Authoritative per-order fill-fee reconciliation is not ready on the recovery venue.",
          );
        }

        if (
          maximumBookAgeMs === null ||
          !Number.isSafeInteger(maximumBookAgeMs) ||
          maximumBookAgeMs <= 0
        ) {
          blockers.push(
            "Approved route timing calibration is unavailable for recovery review.",
          );
        }
      }

      if (!book) {
        blockers.push("Fresh recovery-venue order book is unavailable.");
      } else {
        bookTimestamp =
          Number.isSafeInteger(book.timestamp)
            ? book.timestamp
            : null;
        bookAgeMs =
          bookTimestamp === null
            ? null
            : now - bookTimestamp;

        if (
          bookAgeMs === null ||
          bookAgeMs < 0 ||
          maximumBookAgeMs === null ||
          bookAgeMs > maximumBookAgeMs
        ) {
          blockers.push(
            `Recovery book is not within the approved freshness boundary (${bookAgeMs ?? "unknown"}/${maximumBookAgeMs ?? "unapproved"} ms).`,
          );
        }

        if (
          executableQuantity !== null &&
          executableQuantity > 0
        ) {
          const levels =
            side === "SELL"
              ? book.bids
              : book.asks;

          try {
            const vwap =
              vwapCalculator.calculate(levels, executableQuantity);
            fillPercent = vwap.fillPercent;
            vwapPrice =
              vwap.averagePrice > 0
                ? vwap.averagePrice
                : null;

            if (
              vwap.partialFill ||
              vwap.filledQuantity + tolerance < executableQuantity ||
              Math.abs(vwap.fillPercent - 100) > 1e-9
            ) {
              blockers.push(
                "Fresh recovery book cannot fill the complete exact residual quantity.",
              );
            }

            limitPrice =
              capability
                ? recoveryLimitPrice(
                    levels,
                    executableQuantity,
                    capability.price.priceStep,
                    side,
                  )
                : null;

            if (limitPrice === null) {
              blockers.push(
                "A direction-safe recovery limit price cannot be normalized from current rules.",
              );
            }
          } catch (error: unknown) {
            blockers.push(
              `Recovery depth evaluation failed: ${message(error)}`,
            );
          }
        }
      }

      takerFeePercent =
        this.dependencies.getTakerFeePercent(venue, market, now);

      if (
        takerFeePercent === null ||
        !Number.isFinite(takerFeePercent) ||
        takerFeePercent < 0
      ) {
        blockers.push("Recovery taker-fee evidence is unavailable.");
        takerFeePercent = null;
      }

      if (
        executableQuantity !== null &&
        executableQuantity > 0 &&
        vwapPrice !== null &&
        referenceEntryPrice !== null &&
        takerFeePercent !== null
      ) {
        const recoveryNotional =
          executableQuantity * vwapPrice;
        const referenceNotional =
          executableQuantity * referenceEntryPrice;
        estimatedFeeQuote =
          recoveryNotional * takerFeePercent / 100;
        estimatedAdverseMoveLossQuote =
          side === "SELL"
            ? Math.max(0, referenceNotional - recoveryNotional)
            : Math.max(0, recoveryNotional - referenceNotional);
        estimatedTotalLossQuote =
          estimatedAdverseMoveLossQuote + estimatedFeeQuote;
        maximumAllowedLossQuote =
          oneTimeLossAuthorization?.maximumLossQuote ??
          referenceNotional *
            this.configuration.maximumLossPercentOfResidual / 100;

        if (
          referenceNotional >
          this.configuration.maximumResidualQuoteValue
        ) {
          blockers.push(
            `Residual quote value ${referenceNotional} exceeds assistant cap ${this.configuration.maximumResidualQuoteValue}.`,
          );
        }

        if (estimatedTotalLossQuote > maximumAllowedLossQuote) {
          blockers.push(
            `Estimated recovery loss ${estimatedTotalLossQuote} exceeds cap ${maximumAllowedLossQuote}.`,
          );
        }

        if (capability) {
          const minimumNotional =
            capability.notional.minimumNotional;
          const maximumNotional =
            capability.notional.maximumNotional;

          if (
            minimumNotional === null ||
            recoveryNotional < minimumNotional
          ) {
            blockers.push(
              "Recovery notional is below the current exchange minimum or minimum evidence is missing.",
            );
          }

          if (
            maximumNotional !== null &&
            recoveryNotional > maximumNotional
          ) {
            blockers.push(
              "Recovery notional exceeds the current exchange maximum.",
            );
          }
        }

        balanceAsset =
          side === "SELL"
            ? capability?.baseAsset ?? null
            : capability?.quoteAsset ?? null;
        requiredBalance =
          side === "SELL"
            ? executableQuantity
            : recoveryNotional + estimatedFeeQuote;

        if (!balanceAsset) {
          blockers.push("Recovery balance asset is unresolved.");
        } else {
          const balance =
            this.dependencies.getBalance(venue, balanceAsset);

          if (!balance) {
            blockers.push(
              `Authenticated ${venue} ${balanceAsset} balance is unavailable.`,
            );
          } else {
            availableBalance =
              finiteNonNegative(balance.availableBalance) ?? null;
            balanceAgeMs =
              now - balance.synchronizedAt;

            if (
              balanceAgeMs < 0 ||
              balanceAgeMs > this.configuration.maximumBalanceAgeMs
            ) {
              blockers.push(
                `Recovery balance is stale (${balanceAgeMs} ms).`,
              );
            }

            if (
              availableBalance === null ||
              requiredBalance === null ||
              availableBalance + tolerance < requiredBalance
            ) {
              blockers.push(
                "Authenticated recovery-venue balance is insufficient for the exact residual.",
              );
            }
          }
        }
      } else if (!referenceEntryPrice) {
        blockers.push(
          "Authoritative residual entry price is unavailable.",
        );
      }
    }

    const baseRecord = {
      schemaVersion: "142.0" as const,
      sessionId: session.sessionId,
      sourceSessionFingerprint: fingerprint(session),
      createdAt: now,
      expiresAt: now + this.configuration.previewTtlMs,
      approvedAt: null,
      opportunityId: session.opportunityId,
      market,
      buyExchange,
      sellExchange,
      authoritative: {
        reconciledBeforeAssessment: true as const,
        bothLegsTerminal,
        buyStatus: buy?.status ?? null,
        sellStatus: sell?.status ?? null,
        buyFilledQuantity: buyFilled,
        sellFilledQuantity: sellFilled,
        buyAverageFillPrice:
          finitePositive(buy?.averageFillPrice) ?? null,
        sellAverageFillPrice:
          finitePositive(sell?.averageFillPrice) ?? null,
      },
      residual: {
        direction,
        venue,
        side,
        exactQuantity: exactResidual,
        executableQuantity,
        dustQuantity,
        referenceEntryPrice,
      },
      executionPreview: {
        selectedTimeInForce,
        boundedCancelRequired,
        maximumBookAgeMs,
        bookTimestamp,
        bookAgeMs,
        fillPercent,
        vwapPrice,
        limitPrice,
        takerFeePercent,
        estimatedFeeQuote,
        estimatedAdverseMoveLossQuote,
        estimatedTotalLossQuote,
        maximumAllowedLossQuote,
        balanceAsset,
        requiredBalance,
        availableBalance,
        balanceAgeMs,
      },
      oneTimeLossAuthorization,
      blockers: [...new Set(blockers)],
      safety: safety(),
    };
    const id =
      `recovery-preview-${createHash("sha256")
        .update(JSON.stringify(baseRecord))
        .digest("hex")
        .slice(0, 32)}`;
    const state:
      StrategyOneResidualRecoveryAssistantState =
      balanced
        ? "BALANCED_NO_ACTION"
        : blockers.length === 0
          ? "READY_FOR_OPERATOR_REVIEW"
          : "BLOCKED";
    const requiredApprovalPhrase =
      state === "READY_FOR_OPERATOR_REVIEW"
        ? `APPROVE RECOVERY PREVIEW ${id}`
        : null;

    return freeze({
      ...baseRecord,
      id,
      state,
      requiredApprovalPhrase,
    });
  }

  private validateCapability(
    capability: ExchangeMarketCapability | null,
    side: "BUY" | "SELL",
    exactResidual: number,
    now: number,
    blockers: string[],
  ): void {
    if (!capability) {
      blockers.push("Current recovery-venue SPOT order rules are unavailable.");
      return;
    }

    const capabilityAgeMs =
      now - capability.synchronizedAt;

    if (
      capabilityAgeMs < 0 ||
      capabilityAgeMs > this.configuration.maximumCapabilityAgeMs
    ) {
      blockers.push(
        `Recovery-venue order rules are stale (${capabilityAgeMs} ms).`,
      );
    }

    if (!capability.tradingEnabled || capability.maintenanceMode) {
      blockers.push("Recovery-venue SPOT trading is unavailable.");
    }

    if (
      !capability.order.supportedOrderTypes.includes("limit") ||
      !capability.order.supportsClientOrderId ||
      !capability.order.supportsOrderStatusPolling
    ) {
      blockers.push(
        "Recovery venue lacks the audited limit/client-ID/status contract.",
      );
    }

    if (
      capability.quantity.quantityStep === null ||
      capability.quantity.quantityStep <= 0 ||
      capability.price.priceStep === null ||
      capability.price.priceStep <= 0 ||
      capability.quantity.minimumQuantity === null ||
      capability.notional.minimumNotional === null
    ) {
      blockers.push("Complete recovery quantity/price/notional rules are required.");
    }

    if (
      capability.quantity.minimumQuantity !== null &&
      exactResidual < capability.quantity.minimumQuantity
    ) {
      blockers.push("Exact residual is below the current minimum quantity.");
    }

    if (
      capability.quantity.maximumQuantity !== null &&
      exactResidual > capability.quantity.maximumQuantity
    ) {
      blockers.push("Exact residual exceeds the current maximum quantity.");
    }

    if (side !== "BUY" && side !== "SELL") {
      blockers.push("Recovery side is invalid.");
    }
  }

  private setAndPersist(
    preview: StrategyOneResidualRecoveryPreview,
    savedAt: number,
  ): void {
    const next =
      new Map(this.previews);
    next.delete(preview.id);
    next.set(preview.id, freeze(clone(preview)));

    while (next.size > this.configuration.maximumPreviews) {
      const oldest = next.keys().next().value;

      if (typeof oldest !== "string") {
        break;
      }

      next.delete(oldest);
    }

    this.store.append({
      schemaVersion: "142.0",
      savedAt,
      previews: [...next.values()].map(clone),
    });
    this.previews.clear();

    for (const [id, value] of next) {
      this.previews.set(id, value);
    }
  }
}

function recoveryLimitPrice(
  levels: OrderBook["bids"],
  quantity: number,
  priceStep: number | null,
  side: "BUY" | "SELL",
): number | null {
  if (
    priceStep === null ||
    !Number.isFinite(priceStep) ||
    priceStep <= 0
  ) {
    return null;
  }

  let remaining = quantity;
  let boundaryPrice: number | null = null;

  for (const level of levels) {
    if (
      !Number.isFinite(level.price) ||
      level.price <= 0 ||
      !Number.isFinite(level.quantity) ||
      level.quantity <= 0
    ) {
      return null;
    }

    const consumed =
      Math.min(remaining, level.quantity);
    remaining -= consumed;
    boundaryPrice = level.price;

    if (remaining <= 1e-12) {
      break;
    }
  }

  if (remaining > 1e-12 || boundaryPrice === null) {
    return null;
  }

  const steps =
    boundaryPrice / priceStep;
  const normalized =
    side === "SELL"
      ? Math.floor(steps + 1e-12) * priceStep
      : Math.ceil(steps - 1e-12) * priceStep;

  return normalized > 0 && Number.isFinite(normalized)
    ? normalized
    : null;
}

function normalizeQuantityDown(
  quantity: number,
  step: number | null,
): number | null {
  if (
    !Number.isFinite(quantity) ||
    quantity <= 0 ||
    step === null ||
    !Number.isFinite(step) ||
    step <= 0
  ) {
    return null;
  }

  const normalized =
    Math.floor(quantity / step + 1e-12) * step;

  return normalized > 0 && Number.isFinite(normalized)
    ? normalized
    : null;
}

function terminal(value: string): boolean {
  return value === "FILLED" ||
    value === "CANCELLED" ||
    value === "REJECTED" ||
    value === "FAILED";
}

function finitePositive(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function finiteNonNegative(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

/**
 * Fingerprint only durable order and financial evidence.
 *
 * Read-only reconciliation intentionally rewrites transport metadata such as
 * updatedAt, dispatch timestamps, gateway timestamps, lastError and diagnostic
 * reasons. Hashing the entire session therefore made an unchanged terminal
 * exposure look different at the mandatory action-time reconciliation and
 * prevented every recovery from reaching the journal-before-I/O boundary.
 *
 * Requests, authority flags, gateway/order identity, terminal status, fills,
 * prices and authoritative fee evidence remain covered so a material change
 * still invalidates the operator approval.
 */
function fingerprint(session: StrategyOneTwoLegSessionRecord): string {
  return createHash("sha256")
    .update(JSON.stringify({
      schemaVersion: session.schemaVersion,
      sessionId: session.sessionId,
      requestHash: session.requestHash,
      opportunityId: session.opportunityId,
      lastLookDecisionId: session.lastLookDecisionId,
      buyIdempotencyKey: session.buyIdempotencyKey,
      sellIdempotencyKey: session.sellIdempotencyKey,
      buyRequest: session.buyRequest,
      sellRequest: session.sellRequest,
      state: session.state,
      buyResponse: gatewayEvidence(session.buyResponse),
      sellResponse: gatewayEvidence(session.sellResponse),
      automaticRetryAllowed: session.automaticRetryAllowed,
      automaticRecoveryOrderAllowed: session.automaticRecoveryOrderAllowed,
      newOrderSubmissionAllowed: session.newOrderSubmissionAllowed,
    }))
    .digest("hex");
}

function gatewayEvidence(
  response: StrategyOneTwoLegSessionRecord["buyResponse"],
) {
  const record = response?.record;
  const result = record?.result;
  const feeEvidence = record?.feeEvidence;

  if (!response) {
    return null;
  }

  return {
    state: response.state,
    record: record
      ? {
        id: record.id,
        idempotencyKey: record.idempotencyKey,
        requestHash: record.requestHash,
        request: record.request,
        state: record.state,
        result: result
          ? {
            success: result.success,
            exchange: result.exchange,
            product: result.product ?? null,
            reduceOnly: result.reduceOnly ?? null,
            positionMode: result.positionMode ?? null,
            positionSide: result.positionSide ?? null,
            market: result.market,
            side: result.side,
            orderId: result.orderId,
            clientOrderId: result.clientOrderId,
            status: result.status,
            requestedQuantity: result.requestedQuantity,
            filledQuantity: result.filledQuantity,
            remainingQuantity: result.remainingQuantity,
            requestedPrice: result.requestedPrice,
            averageFillPrice: result.averageFillPrice,
            feeAmount: result.feeAmount,
            authoritativeFeeQuoteAmount:
              result.authoritativeFeeQuoteAmount ?? null,
            authoritativeWithholdingQuoteAmount:
              result.authoritativeWithholdingQuoteAmount ?? null,
            authoritativeCashDeductionQuoteAmount:
              result.authoritativeCashDeductionQuoteAmount ?? null,
            authoritativeWithholdingEvidenceComplete:
              result.authoritativeWithholdingEvidenceComplete ?? null,
            authoritativeFeeEvidenceId:
              result.authoritativeFeeEvidenceId ?? null,
            cancelled: result.cancelled,
            timedOut: result.timedOut,
          }
          : null,
        feeEvidence: feeEvidence
          ? {
            version: feeEvidence.version,
            id: feeEvidence.id,
            exchange: feeEvidence.exchange,
            product: feeEvidence.product,
            market: feeEvidence.market,
            orderId: feeEvidence.orderId,
            expectedFilledQuantity: feeEvidence.expectedFilledQuantity,
            observedFilledQuantity: feeEvidence.observedFilledQuantity,
            observedQuoteQuantity: feeEvidence.observedQuoteQuantity,
            averageFillPrice: feeEvidence.averageFillPrice,
            fills: feeEvidence.fills,
            fees: feeEvidence.fees,
            withholdings: feeEvidence.withholdings,
            quoteAsset: feeEvidence.quoteAsset,
            totalFeeQuoteAmount: feeEvidence.totalFeeQuoteAmount,
            totalWithholdingQuoteAmount:
              feeEvidence.totalWithholdingQuoteAmount,
            totalCashDeductionQuoteAmount:
              feeEvidence.totalCashDeductionQuoteAmount,
            withholdingEvidenceComplete:
              feeEvidence.withholdingEvidenceComplete,
            complete: feeEvidence.complete,
            source: feeEvidence.source,
          }
          : null,
        cancellationRequested: record.cancelRequestedAt !== null,
        orderSubmissionPerformed: record.orderSubmissionPerformed,
      }
      : null,
  };
}

function safety() {
  return freeze({
    authoritativeReadReconciliationOnly: true as const,
    exactResidualNeverIncreased: true as const,
    fullDepthRequired: true as const,
    currentRulesRequired: true as const,
    freshBalanceRequired: true as const,
    maximumLossCapRequired: true as const,
    approvalIsEvidenceOnly: true as const,
    automaticRetryAllowed: false as const,
    automaticRecoveryOrderAllowed: false as const,
    orderSubmissionAllowed: false as const,
    orderSubmissionPerformed: false as const,
    transferAllowed: false as const,
    withdrawalAllowed: false as const,
  });
}

function validateOneTimeLossAuthorization(
  requested: {
    readonly maximumLossQuote: number;
    readonly confirmation: string;
    readonly authorizedAt?: number;
  } | null,
  market: string,
  side: "BUY" | "SELL" | null,
  exactQuantity: number,
  now: number,
  hardMaximumLossQuote: number,
  blockers: string[],
): StrategyOneResidualRecoveryPreview["oneTimeLossAuthorization"] {
  if (!requested) {
    return null;
  }

  if (
    !Number.isFinite(requested.maximumLossQuote) ||
    requested.maximumLossQuote <= 0 ||
    requested.maximumLossQuote > hardMaximumLossQuote
  ) {
    blockers.push(
      `One-time operator loss cap must be positive and at most ${hardMaximumLossQuote} quote units.`,
    );
    return null;
  }

  if (
    (side !== "BUY" && side !== "SELL") ||
    !Number.isFinite(exactQuantity) ||
    exactQuantity <= 0
  ) {
    blockers.push(
      "One-time operator loss authorization requires an exact directional residual.",
    );
    return null;
  }

  const baseAsset =
    market.endsWith("USDT")
      ? market.slice(0, -4)
      : market;
  const expected =
    `APPROVE ONE-TIME ${baseAsset} RECOVERY ${side} ${formatApprovalNumber(exactQuantity)} MAX LOSS ${requested.maximumLossQuote.toFixed(2)} USDT`;

  if (requested.confirmation.trim() !== expected) {
    blockers.push(
      "Exact one-time residual loss authorization phrase is required.",
    );
    return null;
  }

  return freeze({
    maximumLossQuote: requested.maximumLossQuote,
    confirmation: expected,
    authorizedAt:
      Number.isSafeInteger(requested.authorizedAt) &&
      (requested.authorizedAt ?? 0) > 0
        ? requested.authorizedAt as number
        : now,
  });
}

function formatApprovalNumber(value: number): string {
  return Number.isInteger(value)
    ? value.toFixed(0)
    : value.toString();
}

function validateConfiguration(
  configuration: StrategyOneResidualRecoveryAssistantConfiguration,
): void {
  if (
    !Number.isSafeInteger(configuration.previewTtlMs) ||
    configuration.previewTtlMs <= 0 ||
    !Number.isSafeInteger(configuration.maximumCapabilityAgeMs) ||
    configuration.maximumCapabilityAgeMs <= 0 ||
    !Number.isSafeInteger(configuration.maximumBalanceAgeMs) ||
    configuration.maximumBalanceAgeMs <= 0 ||
    !Number.isFinite(configuration.maximumLossPercentOfResidual) ||
    configuration.maximumLossPercentOfResidual <= 0 ||
    configuration.maximumLossPercentOfResidual > 100 ||
    !Number.isFinite(configuration.maximumOperatorAuthorizedLossQuote) ||
    configuration.maximumOperatorAuthorizedLossQuote <= 0 ||
    configuration.maximumOperatorAuthorizedLossQuote >
      configuration.maximumResidualQuoteValue ||
    !Number.isFinite(configuration.maximumResidualQuoteValue) ||
    configuration.maximumResidualQuoteValue <= 0 ||
    !Number.isSafeInteger(configuration.maximumPreviews) ||
    configuration.maximumPreviews <= 0
  ) {
    throw new Error("Strategy #1 residual recovery configuration is invalid.");
  }
}

function isSnapshot(value: unknown): value is PersistedSnapshot {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const snapshot = value as Partial<PersistedSnapshot>;
  return snapshot.schemaVersion === "142.0" &&
    Number.isSafeInteger(snapshot.savedAt) &&
    Array.isArray(snapshot.previews) &&
    snapshot.previews.every((preview) =>
      typeof preview === "object" &&
      preview !== null &&
      (preview as Partial<StrategyOneResidualRecoveryPreview>).schemaVersion === "142.0" &&
      typeof (preview as Partial<StrategyOneResidualRecoveryPreview>).id === "string");
}

function requireIdentifier(value: string, label: string): string {
  const normalized = value.trim();

  if (!/^[A-Za-z0-9_.:/-]{8,240}$/u.test(normalized)) {
    throw new Error(`Strategy #1 recovery ${label} identity is invalid.`);
  }

  return normalized;
}

function validateTime(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("Strategy #1 residual recovery timestamp must be positive.");
  }
}

function normalizeExchange(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeMarket(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/gu, "");
}

function assertSameRecoveryIntent(
  approved: StrategyOneResidualRecoveryPreview,
  current: StrategyOneResidualRecoveryPreview,
): void {
  const unchanged =
    approved.sessionId === current.sessionId &&
    approved.sourceSessionFingerprint === current.sourceSessionFingerprint &&
    normalizeMarket(approved.market) === normalizeMarket(current.market) &&
    normalizeExchange(approved.residual.venue ?? "") ===
      normalizeExchange(current.residual.venue ?? "") &&
    approved.residual.side === current.residual.side &&
    approved.residual.direction === current.residual.direction &&
    approved.residual.exactQuantity === current.residual.exactQuantity &&
    approved.residual.executableQuantity === current.residual.executableQuantity &&
    approved.residual.dustQuantity === current.residual.dustQuantity &&
    approved.executionPreview.selectedTimeInForce ===
      current.executionPreview.selectedTimeInForce;

  if (!unchanged) {
    throw new Error(
      "Action-time recovery identity, quantity, venue, side or time-in-force changed; inspect and approve again.",
    );
  }
}

function assertNoWorseRecoveryPrice(
  approved: StrategyOneResidualRecoveryPreview,
  current: StrategyOneResidualRecoveryPreview,
): void {
  const approvedPrice = approved.executionPreview.limitPrice;
  const currentPrice = current.executionPreview.limitPrice;
  const side = approved.residual.side;

  const priceIsWorse =
    (side === "SELL" &&
      approvedPrice !== null &&
      currentPrice !== null &&
      currentPrice < approvedPrice) ||
    (side === "BUY" &&
      approvedPrice !== null &&
      currentPrice !== null &&
      currentPrice > approvedPrice);
  const approvedAuthorization =
    approved.oneTimeLossAuthorization;
  const currentAuthorization =
    current.oneTimeLossAuthorization;
  const currentEstimatedLoss =
    current.executionPreview.estimatedTotalLossQuote;
  const authorizedWorsePrice =
    priceIsWorse &&
    approvedAuthorization !== null &&
    currentAuthorization !== null &&
    currentAuthorization.maximumLossQuote ===
      approvedAuthorization.maximumLossQuote &&
    currentAuthorization.confirmation ===
      approvedAuthorization.confirmation &&
    currentEstimatedLoss !== null &&
    currentEstimatedLoss <=
      approvedAuthorization.maximumLossQuote + 1e-12;

  if (
    approvedPrice === null ||
    currentPrice === null ||
    (side !== "SELL" && side !== "BUY") ||
    (priceIsWorse && !authorizedWorsePrice)
  ) {
    throw new Error(
      "Action-time recovery price is worse than the explicitly approved limit; inspect and approve again.",
    );
  }
}

function message(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Unknown recovery preview failure.";
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function freeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }

  for (const child of Object.values(value)) {
    freeze(child);
  }

  return Object.freeze(value);
}

export const strategyOneResidualRecoveryAssistantService =
  new StrategyOneResidualRecoveryAssistantService();
