import {
  createHash,
} from "node:crypto";

import {
  getExchangeTakerFeePercent,
} from "../config/fees";

import type {
  ArbitrageOpportunity,
} from "../models/ArbitrageOpportunity";

import {
  liveExecutionService,
} from "../../execution/live/LiveExecutionService";

import type {
  LiveExecutionRequest,
} from "../../execution/live/models/LiveExecutionRequest";

import {
  arbitragePnLService,
} from "../metrics/ArbitragePnLService";

import type {
  ArbitrageLiveExecutionResult,
} from "./models/ArbitrageLiveExecutionResult";

import type {
  LiveExecutionAdapter,
} from "../../execution/live/contracts/LiveExecutionAdapter";

import type {
  LiveExecutionExchangeStatus,
} from "../../execution/live/LiveExecutionService";

import {
  strategyOneOrderTimeSafetyService,
  type StrategyOneOrderTimeSafetyReport,
} from "./StrategyOneOrderTimeSafetyService";

import {
  strategyOneExecutionTimingEvidenceService,
} from "./StrategyOneExecutionTimingEvidenceService";

import {
  sharedRecoveryIntentService,
} from "../../recovery/services/SharedRecoveryIntentService";

import {
  strategyOneTwoLegLiveExecutionService,
  type StrategyOneTwoLegExecutionResult,
} from "../../execution/live/arbitrage/StrategyOneTwoLegLiveExecutionService";

import type {
  SharedRecoveryIntent,
  SharedRecoveryIntentProposal,
} from "../../recovery/models/SharedRecoveryIntent";

import {
  strategyOneTinyLiveActionAuthorityService,
  type StrategyOneTinyLiveAuthorityRecord,
} from "../../execution/live/tiny-live/StrategyOneTinyLiveActionAuthorityService";

import {
  capitalReservationService,
} from "../../trading/capital/CapitalReservationService";

import type {
  CapitalReservation,
  CreateCapitalReservationRequest,
  CreateCapitalReservationResult,
} from "../../trading/capital/CapitalReservation";

const LIVE_CONFIRMATION =
  "ENABLE_CONFIRMED_ARBITRAGE_EXECUTION";

export interface ArbitrageExecutionOptions {
  timeoutMs?: number;

  pollingIntervalMs?: number;

  cancelOnTimeout?: boolean;

  actionAuthorityId?: string;
}

export interface ArbitrageExecutionCoordinatorDependencies {
  readonly liveExecution: {
    hasAdapter(
      exchange: string,
    ): boolean;

    getAdapter(
      exchange: string,
    ): LiveExecutionAdapter;

    getExchangeStatus(
      exchange: string,
    ): LiveExecutionExchangeStatus;
  };

  readonly orderTimeSafety: {
    evaluate(input: {
      opportunity: ArbitrageOpportunity;
      quantity: number;
      now?: number;
    }): StrategyOneOrderTimeSafetyReport;
  };

  readonly timingEvidence: {
    observeLastLook(
      report: StrategyOneOrderTimeSafetyReport,
      observedAt?: number,
    ): void;
    observeLiveDispatch(input: {
      readonly lastLook: StrategyOneOrderTimeSafetyReport;
      readonly buyDispatchAt: number;
      readonly sellDispatchAt: number;
    }): void;
    recordObserverFailure(): void;
  };

  readonly twoLegExecution: {
    executeOrReconcile(input: {
      readonly sessionId: string;
      readonly opportunityId: string;
      readonly lastLookDecisionId: string;
      readonly buyRequest: LiveExecutionRequest;
      readonly sellRequest: LiveExecutionRequest;
      readonly allowNewSubmission: boolean;
      readonly now?: number;
    }): Promise<StrategyOneTwoLegExecutionResult>;
  };

  readonly recoveryIntent: {
    stage(
      proposal: SharedRecoveryIntentProposal,
      now?: number,
    ): SharedRecoveryIntent;
  };

  readonly capitalReservations: {
    reserve(
      request: CreateCapitalReservationRequest,
    ): CreateCapitalReservationResult;
    commit(
      reservationId: string,
      reason?: string,
    ): CapitalReservation | null;
    release(
      reservationId: string,
      reason?: string,
    ): CapitalReservation | null;
  };

  readonly getTakerFeePercent: (
    exchange: string,
    market: string,
    now: number,
  ) => number | null;

  readonly recordPnL: (
    result: ArbitrageLiveExecutionResult,
  ) => void;

  readonly liveConfirmationPresent:
    () => boolean;

  readonly consumeActionAuthority: (input: {
    readonly authorityId: string;
    readonly opportunity: ArbitrageOpportunity;
    readonly now: number;
  }) => StrategyOneTinyLiveAuthorityRecord;

  readonly bindActionAuthorityPair: (
    authorityId: string,
    pairSessionId: string,
    now: number,
  ) => StrategyOneTinyLiveAuthorityRecord;

  readonly finalizeActionAuthority: (
    authorityId: string,
    result: ArbitrageLiveExecutionResult,
    now: number,
  ) => StrategyOneTinyLiveAuthorityRecord;

  readonly now:
    () => number;
}

const DEFAULT_DEPENDENCIES:
  ArbitrageExecutionCoordinatorDependencies = {
  liveExecution:
    liveExecutionService,
  orderTimeSafety:
    strategyOneOrderTimeSafetyService,
  timingEvidence:
    strategyOneExecutionTimingEvidenceService,
  twoLegExecution:
    strategyOneTwoLegLiveExecutionService,
  recoveryIntent:
    sharedRecoveryIntentService,
  capitalReservations:
    capitalReservationService,
  getTakerFeePercent:
    getExchangeTakerFeePercent,
  recordPnL:
    (result) => {
      arbitragePnLService.record(
        result,
        {
          persist:
            true,
        },
      );
    },
  liveConfirmationPresent:
    () =>
      process.env
        .ARBITRAGE_LIVE_CONFIRMATION
        ?.trim() ===
      LIVE_CONFIRMATION,
  consumeActionAuthority:
    (input) => strategyOneTinyLiveActionAuthorityService.consume(input),
  bindActionAuthorityPair:
    (authorityId, pairSessionId, now) =>
      strategyOneTinyLiveActionAuthorityService.bindPair(
        authorityId,
        pairSessionId,
        now,
      ),
  finalizeActionAuthority:
    (authorityId, result, now) =>
      strategyOneTinyLiveActionAuthorityService.finalize(
        authorityId,
        result,
        now,
      ),
  now:
    Date.now,
};

export class ArbitrageExecutionCoordinator {
  private readonly dependencies:
    ArbitrageExecutionCoordinatorDependencies;

  constructor(
    dependencies:
      Partial<ArbitrageExecutionCoordinatorDependencies> = {},
  ) {
    this.dependencies = {
      ...DEFAULT_DEPENDENCIES,
      ...dependencies,
    };
  }

  async execute(
    opportunity: ArbitrageOpportunity,
    options:
      ArbitrageExecutionOptions = {},
  ): Promise<ArbitrageLiveExecutionResult> {
    const startedAt =
      this.dependencies
        .now();

    const preflightReasons =
      this.validateOpportunity(
        opportunity,
      );

    const buyExchange =
      opportunity.pair.buy.exchange
        .trim()
        .toLowerCase();

    const sellExchange =
      opportunity.pair.sell.exchange
        .trim()
        .toLowerCase();

    if (
      !this.dependencies.liveExecution.hasAdapter(
        buyExchange,
      )
    ) {
      preflightReasons.push(
        `Live execution adapter is missing for buy exchange: ${buyExchange}.`,
      );
    }

    if (
      !this.dependencies.liveExecution.hasAdapter(
        sellExchange,
      )
    ) {
      preflightReasons.push(
        `Live execution adapter is missing for sell exchange: ${sellExchange}.`,
      );
    }

    if (
      !this.dependencies
        .liveConfirmationPresent()
    ) {
      preflightReasons.push(
        "Explicit arbitrage live-execution confirmation is missing.",
      );
    }

    const actionAuthorityId =
      options.actionAuthorityId?.trim() ?? "";

    if (!actionAuthorityId) {
      preflightReasons.push(
        "A one-time Strategy #1 Tiny-LIVE action authority is required.",
      );
    }

    if (
      preflightReasons.length >
      0
    ) {
      return this.createBlockedResult(
        opportunity,
        buyExchange,
        sellExchange,
        startedAt,
        preflightReasons,
      );
    }

    const buyAdapterStatus =
      this.dependencies
        .liveExecution
        .getExchangeStatus(
          buyExchange,
        );

    const sellAdapterStatus =
      this.dependencies
        .liveExecution
        .getExchangeStatus(
          sellExchange,
        );

    if (
      !buyAdapterStatus
        .adapterConnected
    ) {
      preflightReasons.push(
        `Buy exchange LIVE execution availability is blocked: ${buyExchange} (liveEnabled=${buyAdapterStatus.liveExecutionEnabled}, verification=${buyAdapterStatus.verificationState}).`,
      );
    }

    if (
      !sellAdapterStatus
        .adapterConnected
    ) {
      preflightReasons.push(
        `Sell exchange LIVE execution availability is blocked: ${sellExchange} (liveEnabled=${sellAdapterStatus.liveExecutionEnabled}, verification=${sellAdapterStatus.verificationState}).`,
      );
    }

    if (
      preflightReasons.length >
      0
    ) {
      return this.createBlockedResult(
        opportunity,
        buyExchange,
        sellExchange,
        startedAt,
        preflightReasons,
      );
    }

    let consumedAuthority:
      StrategyOneTinyLiveAuthorityRecord;

    try {
      consumedAuthority =
        this.dependencies.consumeActionAuthority({
          authorityId: actionAuthorityId,
          opportunity,
          now: this.dependencies.now(),
        });
    } catch (error: unknown) {
      return this.createBlockedResult(
        opportunity,
        buyExchange,
        sellExchange,
        startedAt,
        [
          this.getErrorMessage(
            "One-time Tiny-LIVE action authority was rejected",
            error,
          ),
        ],
      );
    }

    const authorityQuantity =
      consumedAuthority.exactQuantity;

    if (
      !Number.isFinite(authorityQuantity) ||
      authorityQuantity <= 0 ||
      authorityQuantity > opportunity.availableExecutableQty + 1e-12
    ) {
      const blocked = this.createBlockedResult(
        opportunity,
        buyExchange,
        sellExchange,
        startedAt,
        ["Authorized quantity exceeds current executable depth or is invalid."],
        null,
        authorityQuantity,
      );
      this.finalizeAuthoritySafely(actionAuthorityId, blocked);
      return blocked;
    }

    /*
     * This synchronous decision is intentionally the final data/economics
     * read before adapter access. A stale book, missing calibrated TTL,
     * unsupported FOK mapping, absent fill stream, partial depth, or eroded
     * profit produces zero adapter execute() calls.
     */
    const lastLook =
      this.dependencies
        .orderTimeSafety
        .evaluate({
          opportunity,
          quantity:
            authorityQuantity,
          now:
            this.dependencies
              .now(),
        });

    try {
      this.dependencies
        .timingEvidence
        .observeLastLook(
          lastLook,
          this.dependencies
            .now(),
        );
    } catch {
      try {
        this.dependencies
          .timingEvidence
          .recordObserverFailure();
      } catch {
        /* Timing diagnostics cannot change the last-look decision. */
      }
    }

    if (
      lastLook.decision !==
        "APPROVED" ||
      lastLook.selectedBuyTimeInForce ===
        null ||
      lastLook.selectedSellTimeInForce ===
        null ||
      lastLook.buyLimitPrice ===
        null ||
      lastLook.sellLimitPrice ===
        null
    ) {
      const blocked = this.createBlockedResult(
        opportunity,
        buyExchange,
        sellExchange,
        startedAt,
        [
          "Strategy #1 order-time last-look blocked exchange submission.",
          ...lastLook.reasons,
        ],
        lastLook,
        authorityQuantity,
      );
      this.finalizeAuthoritySafely(actionAuthorityId, blocked);
      return blocked;
    }

    const quantity =
      authorityQuantity;

    const executionIdentity =
      createHash("sha256")
        .update(
          JSON.stringify({
            opportunityId: opportunity.id,
            lastLookDecisionId: lastLook.decisionId,
            policyHash: lastLook.policyHash,
            market: lastLook.market,
            buyExchange,
            sellExchange,
            quantity,
          }),
        )
        .digest("hex");
    const executionSuffix =
      executionIdentity.slice(0, 24);
    const twoLegSessionId =
      `strategy-one:${executionIdentity}`;

    let assets: {
      asset: string;
      quoteAsset: string;
    };

    try {
      assets =
        this.resolveAssets(
          opportunity,
        );
    } catch (error: unknown) {
      const blocked = this.createBlockedResult(
        opportunity,
        buyExchange,
        sellExchange,
        startedAt,
        [
          this.getErrorMessage(
            "Atomic exchange-asset reservation could not resolve the market assets",
            error,
          ),
        ],
        lastLook,
        authorityQuantity,
      );
      this.finalizeAuthoritySafely(actionAuthorityId, blocked);
      return blocked;
    }
    const reservationNow =
      this.dependencies.now();
    const buyFeePercent =
      this.dependencies.getTakerFeePercent(
        buyExchange,
        opportunity.pair.market,
        reservationNow,
      );

    if (
      !Number.isFinite(buyFeePercent) ||
      (buyFeePercent ?? -1) < 0 ||
      assets.asset === "QUOTE" ||
      assets.quoteAsset === "QUOTE"
    ) {
      const blocked = this.createBlockedResult(
        opportunity,
        buyExchange,
        sellExchange,
        startedAt,
        [
          "Atomic exchange-asset reservation could not derive fresh fee and exact asset evidence.",
        ],
        lastLook,
        authorityQuantity,
      );
      this.finalizeAuthoritySafely(actionAuthorityId, blocked);
      return blocked;
    }

    const reservation =
      this.dependencies.capitalReservations.reserve({
        ownerType:
          "EXECUTION_PLAN",
        ownerId:
          twoLegSessionId,
        amount:
          consumedAuthority.capitalPerLegInr,
        ttlMs:
          60_000,
        inventoryRequirements: [
          {
            exchange:
              buyExchange,
            asset:
              assets.quoteAsset,
            amount:
              quantity *
              lastLook.buyLimitPrice *
              (1 + (buyFeePercent ?? 0) / 100),
          },
          {
            exchange:
              sellExchange,
            asset:
              assets.asset,
            amount:
              quantity,
          },
        ],
      });

    if (
      !reservation.approved ||
      !reservation.reservation
    ) {
      const blocked = this.createBlockedResult(
        opportunity,
        buyExchange,
        sellExchange,
        startedAt,
        [
          "Atomic two-leg wallet reservation blocked exchange dispatch.",
          ...reservation.reasons,
        ],
        lastLook,
        authorityQuantity,
      );
      this.finalizeAuthoritySafely(actionAuthorityId, blocked);
      return blocked;
    }

    const capitalReservationId =
      reservation.reservation.id;

    try {
      this.dependencies.bindActionAuthorityPair(
        actionAuthorityId,
        twoLegSessionId,
        this.dependencies.now(),
      );
    } catch (error: unknown) {
      const blocked = this.createBlockedResult(
        opportunity,
        buyExchange,
        sellExchange,
        startedAt,
        [
          this.getErrorMessage(
            "Tiny-LIVE pair authority binding failed before exchange dispatch",
            error,
          ),
        ],
        lastLook,
        authorityQuantity,
      );
      this.dependencies.capitalReservations.release(
        capitalReservationId,
        "Tiny-LIVE pair authority binding failed before exchange dispatch.",
      );
      this.finalizeAuthoritySafely(actionAuthorityId, blocked);
      return blocked;
    }

    const commonOptions = {
      timeoutMs:
        options.timeoutMs ??
        10_000,

      pollingIntervalMs:
        options.pollingIntervalMs ??
        1_000,

      cancelOnTimeout:
        options.cancelOnTimeout ??
        true,
    };

    const buyRequest:
      LiveExecutionRequest = {
      exchange:
        buyExchange,

      product:
        "SPOT",

      market:
        opportunity.pair.market,

      side:
        "buy",

      orderType:
        "limit",

      timeInForce:
        lastLook.selectedBuyTimeInForce,

      quantity,

      price:
        lastLook.buyLimitPrice,

      clientOrderId:
        this.createClientOrderId(
          "arb-buy",
          executionSuffix,
        ),

      ...commonOptions,
    };

    const sellRequest:
      LiveExecutionRequest = {
      exchange:
        sellExchange,

      product:
        "SPOT",

      market:
        opportunity.pair.market,

      side:
        "sell",

      orderType:
        "limit",

      timeInForce:
        lastLook.selectedSellTimeInForce,

      quantity,

      price:
        lastLook.sellLimitPrice,

      clientOrderId:
        this.createClientOrderId(
          "arb-sell",
          executionSuffix,
        ),

      ...commonOptions,
    };

    /*
     * The pair owner journals one immutable two-leg identity before either
     * central gateway call. Both legs then dispatch concurrently. A timeout,
     * crash, missing acknowledgement, or evidence gap is POSSIBLE_EXPOSURE
     * and is never converted into an automatic retry.
     */
    let twoLegExecution:
      StrategyOneTwoLegExecutionResult | null =
      null;
    let twoLegFailure:
      unknown =
      null;

    try {
      twoLegExecution =
        await this.dependencies
          .twoLegExecution
          .executeOrReconcile({
            sessionId:
              twoLegSessionId,
            opportunityId:
              opportunity.id,
            lastLookDecisionId:
              lastLook.decisionId,
            buyRequest,
            sellRequest,
            allowNewSubmission:
              true,
            now:
              this.dependencies
                .now(),
          });
    } catch (
      error: unknown
    ) {
      twoLegFailure =
        error;
    }

    const buyDispatchAt =
      twoLegExecution
        ?.buyDispatchedAt ??
      null;
    const sellDispatchAt =
      twoLegExecution
        ?.sellDispatchedAt ??
      null;

    if (
      buyDispatchAt !==
        null &&
      sellDispatchAt !==
        null
    ) {
      try {
        this.dependencies
          .timingEvidence
          .observeLiveDispatch({
            lastLook,
            buyDispatchAt,
            sellDispatchAt,
          });
      } catch {
        try {
          this.dependencies
            .timingEvidence
            .recordObserverFailure();
        } catch {
          /* Timing diagnostics cannot change a durable gateway result. */
        }
      }
    }

    const dispatchSkewMs =
      buyDispatchAt !==
        null &&
      sellDispatchAt !==
        null
        ? Math.abs(
            sellDispatchAt -
              buyDispatchAt,
          )
        : null;

    const buyResult =
      twoLegExecution
        ?.buyResponse
        ?.record
        ?.result ??
      null;

    const sellResult =
      twoLegExecution
        ?.sellResponse
        ?.record
        ?.result ??
      null;

    const reasons:
      string[] = [
        ...(
          twoLegExecution
            ?.session
            .reasons ??
          []
        ),
      ];

    if (twoLegFailure) {
      reasons.push(
        this.getErrorMessage(
          "Durable two-leg execution failed",
          twoLegFailure,
        ),
      );
    }

    if (
      buyResult?.failureReason
    ) {
      reasons.push(
        `Buy leg: ${buyResult.failureReason}`,
      );
    }

    if (
      sellResult?.failureReason
    ) {
      reasons.push(
        `Sell leg: ${sellResult.failureReason}`,
      );
    }

    const buyFilledQuantity =
      this.toNonNegativeNumber(
        buyResult?.filledQuantity ??
        0,
      );

    const sellFilledQuantity =
      this.toNonNegativeNumber(
        sellResult?.filledQuantity ??
        0,
      );

    const matchedFilledQuantity =
      Math.min(
        buyFilledQuantity,
        sellFilledQuantity,
      );

    const unmatchedBuyQuantity =
      Math.max(
        0,
        buyFilledQuantity -
          sellFilledQuantity,
      );

    const unmatchedSellQuantity =
      Math.max(
        0,
        sellFilledQuantity -
          buyFilledQuantity,
      );

    const knownResidualRecoveryRequired =
      unmatchedBuyQuantity > 0 ||
      unmatchedSellQuantity > 0;

    const possibleExposure =
      twoLegFailure !==
        null ||
      twoLegExecution
        ?.possibleExposure ===
        true;

    const recoveryRequired =
      knownResidualRecoveryRequired ||
      possibleExposure;

    const bothFilled =
      buyResult?.status ===
        "FILLED" &&
      sellResult?.status ===
        "FILLED" &&
      twoLegExecution
        ?.session
        .state ===
        "COMPLETED" &&
      !recoveryRequired;

    const anyFill =
      buyFilledQuantity > 0 ||
      sellFilledQuantity > 0;

    if (knownResidualRecoveryRequired) {
      reasons.push(
        "Buy and sell filled quantities do not match. Audited residual recovery is required.",
      );
    }

    if (possibleExposure) {
      reasons.push(
        "At least one exchange outcome is uncertain. New LIVE submissions and automatic retries must remain blocked until authoritative reconciliation.",
      );
    }

    if (
      !buyResult ||
      !sellResult
    ) {
      reasons.push(
        "One or more execution legs did not return a result.",
      );
    }

    if (
      buyResult &&
      buyResult.status !==
        "FILLED" &&
      !buyResult.failureReason
    ) {
      reasons.push(
        `Buy leg ended with status ${buyResult.status}.`,
      );
    }

    if (
      sellResult &&
      sellResult.status !==
        "FILLED" &&
      !sellResult.failureReason
    ) {
      reasons.push(
        `Sell leg ended with status ${sellResult.status}.`,
      );
    }

    const completedAt =
      this.dependencies
        .now();

    let recoveryIntent:
      SharedRecoveryIntent |
      null =
      null;

    if (knownResidualRecoveryRequired) {
      try {
        recoveryIntent =
          this.stageRecoveryIntent({
            opportunity,
            lastLook,
            buyFilledQuantity,
            sellFilledQuantity,
            unmatchedBuyQuantity,
            unmatchedSellQuantity,
            createdAt:
              completedAt,
          });

        reasons.push(
          "Residual exposure was staged as immutable recovery evidence; automatic recovery order submission remains disabled.",
        );
      } catch (
        error: unknown
      ) {
        reasons.push(
          this.getErrorMessage(
            "Residual recovery intent staging failed closed",
            error,
          ),
        );
      }
    }

    const executionResult:
      ArbitrageLiveExecutionResult = {
      success:
        bothFilled,

      status:
        bothFilled
          ? "COMPLETED"
          : possibleExposure
            ? "POSSIBLE_EXPOSURE"
            : knownResidualRecoveryRequired
            ? "RECOVERY_REQUIRED"
            : anyFill
              ? "PARTIALLY_COMPLETED"
              : "FAILED",

      opportunityId:
        opportunity.id,

      market:
        opportunity.pair.market,

      requestedQuantity:
        quantity,

      buyExchange,

      sellExchange,

      buyResult,

      sellResult,

      twoLegSessionId,

      matchedFilledQuantity,

      unmatchedBuyQuantity,

      unmatchedSellQuantity,

      startedAt,

      completedAt,

      executionTimeMs:
        completedAt -
        startedAt,

      dispatchSkewMs,

      lastLook,

      recoveryRequired,

      possibleExposure,

      recoveryIntent,

      reasons: [
        ...new Set(
          reasons,
        ),
      ],
    };

    if (!recoveryRequired) {
      const finalizedReservation =
        anyFill
          ? this.dependencies.capitalReservations.commit(
              capitalReservationId,
              "Strategy #1 two-leg execution ended with balanced authoritative fill evidence.",
            )
          : this.dependencies.capitalReservations.release(
              capitalReservationId,
              "Strategy #1 two-leg execution ended without a fill or residual exposure.",
            );

      if (!finalizedReservation) {
        executionResult.reasons.push(
          "Atomic wallet reservation was already absent or expired during finalization.",
        );
      }
    } else {
      executionResult.reasons.push(
        "Atomic exchange-asset holds remain active while residual or possible exposure requires authoritative reconciliation.",
      );
    }

    /*
     * P&L service records only results where both
     * execution-leg results are available.
     */
    this.dependencies
      .recordPnL(
        executionResult,
      );

    try {
      this.dependencies.finalizeActionAuthority(
        actionAuthorityId,
        executionResult,
        this.dependencies.now(),
      );
    } catch (error: unknown) {
      executionResult.reasons.push(
        this.getErrorMessage(
          "Tiny-LIVE authority finalization failed; further attempts remain fail-closed",
          error,
        ),
      );
    }

    return executionResult;
  }

  private validateOpportunity(
    opportunity: ArbitrageOpportunity,
  ): string[] {
    const reasons:
      string[] = [];

    if (
      opportunity.decision !==
      "EXECUTE"
    ) {
      reasons.push(
        `Opportunity decision is ${opportunity.decision}, not EXECUTE.`,
      );
    }

    if (
      !opportunity.quotesAreFresh
    ) {
      reasons.push(
        "Opportunity quotes are not fresh.",
      );
    }

    if (
      !opportunity.enoughLiquidity
    ) {
      reasons.push(
        "Opportunity does not have enough liquidity.",
      );
    }

    if (
      !Number.isFinite(
        opportunity.executableQty,
      ) ||
      opportunity.executableQty <=
        0
    ) {
      reasons.push(
        "Executable quantity must be positive.",
      );
    }

    if (
      !Number.isFinite(
        opportunity.buyPrice,
      ) ||
      opportunity.buyPrice <=
        0
    ) {
      reasons.push(
        "Buy price is invalid.",
      );
    }

    if (
      !Number.isFinite(
        opportunity.sellPrice,
      ) ||
      opportunity.sellPrice <=
        0
    ) {
      reasons.push(
        "Sell price is invalid.",
      );
    }

    if (
      opportunity.sellPrice <=
      opportunity.buyPrice
    ) {
      reasons.push(
        "Sell price must exceed buy price.",
      );
    }

    if (
      !Number.isFinite(
        opportunity.netProfit,
      ) ||
      opportunity.netProfit <=
        0 ||
      !Number.isFinite(
        opportunity.netProfitPercent,
      ) ||
      opportunity.netProfitPercent <=
        0
    ) {
      reasons.push(
        "Opportunity does not contain positive net profit.",
      );
    }

    const buyExchange =
      opportunity.pair.buy.exchange
        .trim()
        .toLowerCase();

    const sellExchange =
      opportunity.pair.sell.exchange
        .trim()
        .toLowerCase();

    if (
      !buyExchange ||
      !sellExchange
    ) {
      reasons.push(
        "Buy and sell exchanges are required.",
      );
    }

    if (
      buyExchange ===
      sellExchange
    ) {
      reasons.push(
        "Cross-exchange arbitrage requires two different exchanges.",
      );
    }

    return reasons;
  }

  private createBlockedResult(
    opportunity:
      ArbitrageOpportunity,
    buyExchange: string,
    sellExchange: string,
    startedAt: number,
    reasons: string[],
    lastLook:
      StrategyOneOrderTimeSafetyReport |
      null =
      null,
    requestedQuantity =
      opportunity.executableQty,
  ): ArbitrageLiveExecutionResult {
    const completedAt =
      this.dependencies
        .now();

    return {
      success:
        false,

      status:
        "BLOCKED",

      opportunityId:
        opportunity.id,

      market:
        opportunity.pair.market,

      requestedQuantity:
        requestedQuantity,

      buyExchange,

      sellExchange,

      buyResult:
        null,

      sellResult:
        null,

      matchedFilledQuantity:
        0,

      unmatchedBuyQuantity:
        0,

      unmatchedSellQuantity:
        0,

      startedAt,

      completedAt,

      executionTimeMs:
        completedAt -
        startedAt,

      dispatchSkewMs:
        null,

      lastLook,

      recoveryRequired:
        false,

      recoveryIntent:
        null,

      reasons: [
        ...new Set(
          reasons,
        ),
      ],
    };
  }

  private stageRecoveryIntent(
    input: {
      opportunity:
        ArbitrageOpportunity;
      lastLook:
        StrategyOneOrderTimeSafetyReport;
      buyFilledQuantity: number;
      sellFilledQuantity: number;
      unmatchedBuyQuantity: number;
      unmatchedSellQuantity: number;
      createdAt: number;
    },
  ): SharedRecoveryIntent {
    const longResidual =
      input.unmatchedBuyQuantity >
      0;
    const quantity =
      longResidual
        ? input.unmatchedBuyQuantity
        : input.unmatchedSellQuantity;
    const venue =
      longResidual
        ? input.lastLook.buyExchange
        : input.lastLook.sellExchange;
    const side =
      longResidual
        ? "SELL" as const
        : "BUY" as const;
    const referencePrice =
      longResidual
        ? input.lastLook.sellLimitPrice
        : input.lastLook.buyLimitPrice;

    if (
      quantity <= 0 ||
      referencePrice ===
        null ||
      referencePrice <= 0
    ) {
      throw new Error(
        "Residual quantity or reference price is invalid.",
      );
    }

    const assets =
      this.resolveAssets(
        input.opportunity,
      );
    const sourceValidationHash =
      createHash(
        "sha256",
      )
        .update(
          JSON.stringify({
            opportunityId:
              input.opportunity.id,
            lastLookDecisionId:
              input.lastLook.decisionId,
            buyFilledQuantity:
              input.buyFilledQuantity,
            sellFilledQuantity:
              input.sellFilledQuantity,
            quantity,
            venue,
            side,
            referencePrice,
          }),
        )
        .digest(
          "hex",
        );

    return this.dependencies
      .recoveryIntent
      .stage(
        {
          sourceStrategyId:
            "cross-exchange-arbitrage",
          sourceEvidenceId:
            input.lastLook.decisionId,
          sourceValidationHash,
          sourceType:
            "STRATEGY_RESIDUAL_EXPOSURE",
          mode:
            "LIVE",
          severity:
            "CRITICAL",
          routeId:
            `${input.lastLook.buyExchange}->${input.lastLook.sellExchange}:${input.lastLook.market}`,
          asset:
            assets.asset,
          quoteAsset:
            assets.quoteAsset,
          residualDirection:
            longResidual
              ? "LONG"
              : "SHORT",
          venue,
          market:
            input.lastLook.market,
          side,
          quantity,
          referencePrice,
          estimatedQuoteValue:
            quantity *
            referencePrice,
          sourceCreatedAt:
            input.createdAt,
          sourceExpiresAt:
            input.createdAt +
            60_000,
        },
        input.createdAt,
      );
  }

  private resolveAssets(
    opportunity:
      ArbitrageOpportunity,
  ): {
    asset: string;
    quoteAsset: string;
  } {
    const market =
      opportunity.pair.market
        .trim()
        .toUpperCase()
        .replace(
          /[^A-Z0-9]/gu,
          "",
        );
    const quoteAsset =
      opportunity.quoteAsset
        ?.trim()
        .toUpperCase() ||
      [
        "USDT",
        "USDC",
        "INR",
        "BTC",
        "ETH",
      ].find(
        (candidate) =>
          market.endsWith(
            candidate,
          ),
      ) ||
      "QUOTE";
    const asset =
      market.endsWith(
        quoteAsset,
      )
        ? market.slice(
            0,
            -quoteAsset.length,
          )
        : market;

    if (
      !asset ||
      !quoteAsset
    ) {
      throw new Error(
        "Residual recovery assets could not be derived from the opportunity.",
      );
    }

    return {
      asset,
      quoteAsset,
    };
  }

  private createClientOrderId(
    prefix: string,
    suffix: string,
  ): string {
    /*
     * Binance client-order IDs allow at most 36
     * characters. Keep IDs compact and unique.
     */
    const normalizedPrefix =
      prefix
        .replace(
          /[^a-zA-Z0-9_-]/g,
          "",
        )
        .slice(
          0,
          10,
        );

    const compactSuffix =
      suffix
        .replace(
          /[^a-zA-Z0-9_-]/g,
          "",
        )
        .slice(
          -24,
        );

    return `${normalizedPrefix}-${compactSuffix}`
      .slice(
        0,
        36,
      );
  }

  private toNonNegativeNumber(
    value: number,
  ): number {
    return (
      Number.isFinite(value) &&
      value >= 0
    )
      ? value
      : 0;
  }

  private getErrorMessage(
    prefix: string,
    error: unknown,
  ): string {
    return error instanceof Error
      ? `${prefix}: ${error.message}`
      : `${prefix}: unknown error.`;
  }

  private finalizeAuthoritySafely(
    authorityId: string,
    result: ArbitrageLiveExecutionResult,
  ): void {
    try {
      this.dependencies.finalizeActionAuthority(
        authorityId,
        result,
        this.dependencies.now(),
      );
    } catch {
      /* Durable unfinalized authority remains a hard block for another attempt. */
    }
  }
}

export const arbitrageExecutionCoordinator =
  new ArbitrageExecutionCoordinator();
