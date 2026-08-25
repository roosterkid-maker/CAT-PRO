import {createHash} from "node:crypto";
import {resolve} from "node:path";

import type {ArbitrageOpportunity} from "../../../arbitrage/models/ArbitrageOpportunity";
import {opportunityService} from "../../../arbitrage/services/OpportunityService";
import {
  strategyOneTimingCalibrationService,
  type StrategyOneTimingCalibrationRecord,
} from "../../../arbitrage/execution/StrategyOneTimingCalibrationService";
import {JsonlSnapshotStore} from "../../../core/persistence/JsonlSnapshotStore";
import {strategyOneLiveVenueContractRegistry} from "../contracts/StrategyOneLiveVenueContractRegistry";
import {strategyOneTwoLegRecoveryResolutionService} from "../recovery/StrategyOneTwoLegRecoveryResolutionService";
import {strategyOneTwoLegLiveExecutionService} from "../arbitrage/StrategyOneTwoLegLiveExecutionService";
import type {ArbitrageLiveExecutionResult} from "../../../arbitrage/execution/models/ArbitrageLiveExecutionResult";
import {
  strategyOnePilotPreflightService,
  type StrategyOnePilotPreflightRunReport,
} from "./StrategyOnePilotPreflightService";

import {
  DEFAULT_STRATEGY_ONE_AUTHORITY_TTL_MS,
  getStrategyOneTinyLiveDailyAttemptCap,
  getStrategyOneTinyLiveMaximumCapitalPerLegInr,
} from "./StrategyOneControlledLiveConfiguration";

import {
  isStrategyOneDirectionalRoute,
} from "../scope/StrategyOneExchangeScope";

import {
  strategyOneControlledLiveRuntimeService,
} from "../dynamic/StrategyOneControlledLiveRuntimeService";

export type StrategyOneTinyLiveAuthorityState =
  | "PREVIEWED"
  | "AUTHORIZED"
  | "CONSUMED"
  | "PAIR_BOUND"
  | "FINALIZED"
  | "RESOLVED"
  | "CANCELLED";

export interface StrategyOneTinyLiveAuthorityRecord {
  readonly schemaVersion: "111.0";
  readonly id: string;
  readonly state: StrategyOneTinyLiveAuthorityState;
  readonly opportunityId: string;
  readonly market: string;
  readonly buyExchange: string;
  readonly sellExchange: string;
  readonly capitalPerLegInr: number;
  readonly exactQuantity: number;
  readonly maximumBuyPrice?: number;
  readonly minimumSellPrice?: number;
  readonly buyQuoteTimestamp?: number;
  readonly sellQuoteTimestamp?: number;
  readonly preflightHash: string;
  readonly calibrationId: string;
  readonly calibrationScope: StrategyOneTimingCalibrationRecord["scope"];
  readonly requiredAuthorizationPhrase: string;
  readonly previewedAt: number;
  readonly authorizedAt: number | null;
  readonly authorityExpiresAt: number | null;
  readonly consumedAt: number | null;
  readonly pairBoundAt: number | null;
  readonly pairSessionId: string | null;
  readonly finalizedAt: number | null;
  readonly finalOutcome: ArbitrageLiveExecutionResult["status"] | null;
  readonly requiresRecovery: boolean;
  readonly resolvedAt: number | null;
  readonly cancelledAt?: number | null;
  readonly liveOrderSubmissionAuthorized: boolean;
  readonly automaticRetryAllowed: false;
  readonly automaticFundMovementAllowed: false;
}

export interface StrategyOneTinyLivePreview {
  readonly schemaVersion: "111.0";
  readonly generatedAt: number;
  readonly approvedForAuthorization: boolean;
  readonly authority: StrategyOneTinyLiveAuthorityRecord | null;
  readonly preflight: StrategyOnePilotPreflightRunReport | null;
  readonly blockers: readonly string[];
  readonly safety: {
    readonly liveOrderSubmissionPerformed: false;
    readonly capitalReserved: false;
    readonly exactActionPhraseRequired: true;
    readonly oneTimeAuthority: true;
  };
}

export interface StrategyOneTinyLiveActionAuthorityDependencies {
  getOpportunity(id: string): ArbitrageOpportunity | null;
  runPreflight(input: {
    confirmationToken: string;
    expectedOpportunityId: string;
    now?: number;
  }): StrategyOnePilotPreflightRunReport;
  getCalibration(input: {
    market: string;
    buyExchange: string;
    sellExchange: string;
    now?: number;
  }): StrategyOneTimingCalibrationRecord | null;
  getVenueContract(
    exchange: string,
    route: {
      market: string;
      buyExchange: string;
      sellExchange: string;
    },
    now?: number,
  ): ReturnType<typeof strategyOneLiveVenueContractRegistry.getOrderTimeSafetyContract>;
  isPairResolved(sessionId: string): boolean;
  pairSessionExists(sessionId: string): boolean;
  runtimeGateEnabled(): boolean;
  getTinyLiveCapitalPerLegInr(): number;
  runCanonicalPreflight(input: {
    opportunityId: string;
    now: number;
  }): {
    readonly approvedForOneTimeArm: boolean;
    readonly opportunityId: string;
    readonly recommendedQuantity: number | null;
    readonly blockers: readonly string[];
    readonly fingerprintMaterial: string;
  };
}

const DEFAULT_FILE = resolve(
  process.cwd(),
  "logs",
  "live",
  "strategy-one-tiny-live-authorities.jsonl",
);

const DEFAULT_DEPENDENCIES: StrategyOneTinyLiveActionAuthorityDependencies = {
  getOpportunity: (id) => opportunityService.getOpportunityById(id),
  runPreflight: (input) => strategyOnePilotPreflightService.run(input),
  getCalibration: (input) =>
    strategyOneTimingCalibrationService.getApprovedRouteCalibration(input),
  getVenueContract: (exchange, route, now) =>
    strategyOneLiveVenueContractRegistry.getOrderTimeSafetyContract(
      exchange,
      route,
      now,
    ),
  isPairResolved: (sessionId) =>
    strategyOneTwoLegRecoveryResolutionService.isSessionResolved(sessionId),
  pairSessionExists: (sessionId) =>
    strategyOneTwoLegLiveExecutionService.getSession(sessionId) !== null,
  runtimeGateEnabled: () =>
    process.env.TRADING_MODE?.trim().toLowerCase() === "live" &&
    process.env.LIVE_TRADING_ENABLED?.trim().toLowerCase() === "true" &&
    process.env.ARBITRAGE_LIVE_CONFIRMATION?.trim() ===
      "ENABLE_STRATEGY_ONE_TINY_LIVE_RUNTIME" &&
    process.env.STRATEGY_ONE_LIVE_RUNTIME_CONFIRMATION?.trim() ===
      "ENABLE_STRATEGY_ONE_TINY_LIVE_RUNTIME",
  getTinyLiveCapitalPerLegInr: () =>
    getStrategyOneTinyLiveMaximumCapitalPerLegInr(),
  runCanonicalPreflight: (input) => {
    const report =
      strategyOneControlledLiveRuntimeService
        .runCanonicalPreflight(
          input.opportunityId,
          "RUN_STRATEGY_ONE_CONTROLLED_PREFLIGHT_ONLY",
          input.now,
        );

    return {
      approvedForOneTimeArm:
        report.approvedForOneTimeArm,
      opportunityId:
        report.opportunityId,
      recommendedQuantity:
        report.dynamicRecommendation
          .recommendedQuantity,
      blockers:
        report.blockers,
      fingerprintMaterial:
        JSON.stringify(
          {
            opportunityId:
              report.opportunityId,
            routeKey:
              report.routeKey,
            approvedForOneTimeArm:
              report.approvedForOneTimeArm,
            decision:
              report.dynamicRecommendation
                .decision,
            recommendedQuantity:
              report.dynamicRecommendation
                .recommendedQuantity,
            economics:
              report.dynamicRecommendation
                .economics,
            gates:
              report.gates.map(
                (gate) => [
                  gate.code,
                  gate.passed,
                ],
              ),
            blockers:
              report.blockers,
          },
        ),
    };
  },
};

/**
 * One-time action authority for the first controlled Strategy #1 LIVE lane.
 * It owns no adapter. Consumption is durably recorded before coordinator
 * access and binding is durable before the pair owner can cross its dispatch
 * boundary.
 */
export class StrategyOneTinyLiveActionAuthorityService {
  private readonly dependencies: StrategyOneTinyLiveActionAuthorityDependencies;
  private readonly store:
    JsonlSnapshotStore<StrategyOneTinyLiveAuthorityRecord>;
  private readonly latest =
    new Map<string, StrategyOneTinyLiveAuthorityRecord>();

  constructor(
    dependencies: Partial<StrategyOneTinyLiveActionAuthorityDependencies> = {},
    filePath = DEFAULT_FILE,
    private readonly previewTtlMs = 30_000,
    private readonly authorityTtlMs = DEFAULT_STRATEGY_ONE_AUTHORITY_TTL_MS,
    private readonly maximumDailyAttempts = getStrategyOneTinyLiveDailyAttemptCap(),
  ) {
    this.dependencies = {...DEFAULT_DEPENDENCIES, ...dependencies};

    if (
      !Number.isSafeInteger(previewTtlMs) ||
      previewTtlMs <= 0 ||
      !Number.isSafeInteger(authorityTtlMs) ||
      authorityTtlMs <= 0 ||
      authorityTtlMs > 5 * 60_000 ||
      !Number.isSafeInteger(maximumDailyAttempts) ||
      maximumDailyAttempts <= 0 ||
      maximumDailyAttempts > 10
    ) {
      throw new Error("Strategy #1 Tiny-LIVE authority limits are invalid.");
    }

    this.store = new JsonlSnapshotStore({filePath, isPayload: isAuthority});

    for (const record of this.store.readAll()) {
      const previous = this.latest.get(record.id) ?? null;

      if (!isValidRestoredTransition(previous, record)) {
        throw new Error(
          `Strategy #1 Tiny-LIVE authority journal has an invalid transition for ${record.id}.`,
        );
      }

      this.latest.set(record.id, freeze(clone(record)));
    }
  }

  preview(
    opportunityIdValue: string,
    now = Date.now(),
  ): StrategyOneTinyLivePreview {
    validateTime(now);
    const opportunityId = opportunityIdValue.trim();
    const blockers: string[] = [];

    if (!opportunityId) {
      blockers.push("Current opportunity ID is required.");
    }

    if (!this.dependencies.runtimeGateEnabled()) {
      blockers.push("Strategy #1 Tiny-LIVE runtime gate is disabled at process startup.");
    }

    if (this.hasBlockingAuthority(now)) {
      blockers.push("Another Tiny-LIVE authority or unresolved attempt is active.");
    }

    const dailyAttempts = this.dailyAttempts(now);

    if (dailyAttempts >= this.maximumDailyAttempts) {
      blockers.push(
        `Tiny-LIVE daily attempt cap ${this.maximumDailyAttempts} is exhausted.`,
      );
    }

    const opportunity = opportunityId
      ? this.dependencies.getOpportunity(opportunityId)
      : null;

    if (!opportunity) {
      blockers.push("The exact current opportunity is unavailable or stale.");
    }

    let canonical:
      ReturnType<
        StrategyOneTinyLiveActionAuthorityDependencies["runCanonicalPreflight"]
      > | null = null;

    if (opportunity) {
      try {
        canonical =
          this.dependencies
            .runCanonicalPreflight({
              opportunityId:
                opportunity.id,
              now,
            });
      } catch (error: unknown) {
        blockers.push(
          message(
            error,
          ),
        );
      }
    }

    if (
      !canonical?.approvedForOneTimeArm ||
      canonical.opportunityId !==
        opportunityId ||
      canonical.recommendedQuantity ===
        null ||
      canonical.recommendedQuantity <=
        0
    ) {
      blockers.push(
        ...(
          canonical?.blockers ??
          [
            "Canonical controlled-live preflight did not approve one-time authority review.",
          ]
        ),
      );
    }

    let preflight: StrategyOnePilotPreflightRunReport | null = null;

    if (opportunity) {
      try {
        preflight = this.dependencies.runPreflight({
          confirmationToken: "RUN_STRATEGY_ONE_PILOT_PREFLIGHT_ONLY",
          expectedOpportunityId: opportunity.id,
          now,
        });
      } catch (error: unknown) {
        blockers.push(message(error));
      }
    }

    if (!preflight?.approvedForActivationReview) {
      blockers.push(...(preflight?.blockers ?? ["Action-time pilot preflight did not pass."]));
    }

    const selected = preflight?.preview.selected ?? null;
    const exactQuantity =
      canonical?.recommendedQuantity ??
      null;
    const capitalPerLegInr =
      preflight?.preview.requestedCapitalPerLegInr ??
      null;

    if (!selected || selected.opportunityId !== opportunityId) {
      blockers.push("Action-time preflight did not retain the exact requested opportunity.");
    }

    if (!Number.isFinite(exactQuantity) || (exactQuantity ?? 0) <= 0) {
      blockers.push("Exact two-exchange funded quantity is unavailable.");
    }

    if (
      !Number.isSafeInteger(
        capitalPerLegInr,
      ) ||
      (capitalPerLegInr ?? 0) <
        100 ||
      (capitalPerLegInr ?? 0) >
        500
    ) {
      blockers.push("Exact active-policy Tiny-LIVE capital is unavailable or outside the hard ₹100–₹500 range.");
    }

    const route = selected
      ? {
          market: selected.market,
          buyExchange: selected.buyExchange,
          sellExchange: selected.sellExchange,
        }
      : null;

    if (
      route &&
      !isStrategyOneDirectionalRoute(
        route.buyExchange,
        route.sellExchange,
      )
    ) {
      blockers.push("Strategy #1 controlled LIVE requires a directional route among Binance, Bybit and CoinDCX SPOT.");
    }

    const observedCalibration = route
      ? this.dependencies.getCalibration({...route, now})
      : null;

    if (
      observedCalibration?.scope === "BOOTSTRAP_FIRST_TINY_LIVE_ATTEMPT" &&
      dailyAttempts > 0
    ) {
      blockers.push(
        "Bootstrap timing calibration permits only the first attempt; authenticated fill timing must be reviewed before another attempt.",
      );
    }

    if (route) {
      for (const venue of [route.buyExchange, route.sellExchange]) {
        const contract = this.dependencies.getVenueContract(venue, route, now);

        if (
          !contract ||
          contract.maximumOrderBookAgeMs === null ||
          !contract.supportedTimeInForce.includes("FOK") ||
          !contract.authoritativeFillConfirmationReady
        ) {
          blockers.push(`${venue} exact FOK/private-fill/timing contract is not ready.`);
        }
      }
    }

    if (
      blockers.length > 0 ||
      !opportunity ||
      !preflight ||
      !selected ||
      !route ||
      exactQuantity === null ||
      capitalPerLegInr === null
    ) {
      return previewResult(now, null, preflight, blockers);
    }

    const preflightHash =
      createHash("sha256")
        .update(
          `${preflightFingerprint(preflight)}:${canonical?.fingerprintMaterial ?? "CANONICAL_PREFLIGHT_MISSING"}`,
        )
        .digest(
          "hex",
        );
    const id = `tiny-live-${hash({
      opportunityId,
      route,
      exactQuantity,
      preflightHash,
      calibrationId:
        observedCalibration?.id ??
        "configured-order-time-safety-v1",
      previewedAt: now,
    }).slice(0, 32)}`;
    const record = freeze({
      schemaVersion: "111.0" as const,
      id,
      state: "PREVIEWED" as const,
      opportunityId,
      ...route,
      capitalPerLegInr,
      exactQuantity,
      maximumBuyPrice:
        opportunity.buyPrice,
      minimumSellPrice:
        opportunity.sellPrice,
      buyQuoteTimestamp:
        opportunity.pair.buy.timestamp,
      sellQuoteTimestamp:
        opportunity.pair.sell.timestamp,
      preflightHash,
      calibrationId:
        observedCalibration?.id ??
        "configured-order-time-safety-v1",
      calibrationScope:
        observedCalibration?.scope ??
        "CONTINUOUS_TINY_LIVE",
      requiredAuthorizationPhrase: `AUTHORIZE ${id}`,
      previewedAt: now,
      authorizedAt: null,
      authorityExpiresAt: now + this.previewTtlMs,
      consumedAt: null,
      pairBoundAt: null,
      pairSessionId: null,
      finalizedAt: null,
      finalOutcome: null,
      requiresRecovery: false,
      resolvedAt: null,
      cancelledAt: null,
      liveOrderSubmissionAuthorized: false,
      automaticRetryAllowed: false as const,
      automaticFundMovementAllowed: false as const,
    });

    this.persist(record);
    return previewResult(now, record, preflight, []);
  }

  authorize(
    idValue: string,
    phraseValue: string,
    now = Date.now(),
  ): StrategyOneTinyLiveAuthorityRecord {
    validateTime(now);
    const current = this.require(idValue, "PREVIEWED");

    if (
      current.authorityExpiresAt === null ||
      current.authorityExpiresAt < now
    ) {
      throw new Error("Tiny-LIVE action preview expired; generate a fresh preview.");
    }

    if (phraseValue.trim() !== current.requiredAuthorizationPhrase) {
      throw new Error("Exact one-time Tiny-LIVE authorization phrase is required.");
    }

    if (!this.dependencies.runtimeGateEnabled()) {
      throw new Error("Strategy #1 Tiny-LIVE runtime gate is disabled.");
    }

    if (this.hasBlockingAuthority(now)) {
      throw new Error("Another Tiny-LIVE authority or unresolved attempt is active.");
    }

    if (this.dailyAttempts(now) >= this.maximumDailyAttempts) {
      throw new Error("Tiny-LIVE daily attempt cap is exhausted.");
    }

    const fresh = this.previewEvidence(current.opportunityId, now);

    if (
      fresh.preflightHash !== current.preflightHash ||
      fresh.exactQuantity !== current.exactQuantity ||
      fresh.capitalPerLegInr !== current.capitalPerLegInr ||
      fresh.calibrationId !== current.calibrationId ||
      fresh.maximumBuyPrice !== current.maximumBuyPrice ||
      fresh.minimumSellPrice !== current.minimumSellPrice ||
      fresh.buyQuoteTimestamp !== current.buyQuoteTimestamp ||
      fresh.sellQuoteTimestamp !== current.sellQuoteTimestamp
    ) {
      throw new Error("Tiny-LIVE evidence changed after preview; refresh and review again.");
    }

    const authorized = freeze({
      ...clone(current),
      state: "AUTHORIZED" as const,
      authorizedAt: now,
      authorityExpiresAt: now + this.authorityTtlMs,
      liveOrderSubmissionAuthorized: true,
    });

    this.persist(authorized);
    return clone(authorized);
  }

  consume(input: {
    readonly authorityId: string;
    readonly opportunity: ArbitrageOpportunity;
    readonly now?: number;
  }): StrategyOneTinyLiveAuthorityRecord {
    const now = input.now ?? Date.now();
    validateTime(now);
    const current = this.require(input.authorityId, "AUTHORIZED");

    const fresh =
      this.previewEvidence(
        input.opportunity.id,
        now,
      );

    if (
      current.authorityExpiresAt === null ||
      current.authorityExpiresAt < now ||
      current.opportunityId !== input.opportunity.id ||
      current.market !== normalizeMarket(input.opportunity.pair.market) ||
      current.buyExchange !== normalizeExchange(input.opportunity.pair.buy.exchange) ||
      current.sellExchange !== normalizeExchange(input.opportunity.pair.sell.exchange) ||
      fresh.preflightHash !== current.preflightHash ||
      fresh.exactQuantity !== current.exactQuantity ||
      fresh.maximumBuyPrice !== current.maximumBuyPrice ||
      fresh.minimumSellPrice !== current.minimumSellPrice ||
      fresh.buyQuoteTimestamp !== current.buyQuoteTimestamp ||
      fresh.sellQuoteTimestamp !== current.sellQuoteTimestamp
    ) {
      throw new Error("Tiny-LIVE action authority is expired or not bound to this exact opportunity.");
    }

    const consumed = freeze({
      ...clone(current),
      state: "CONSUMED" as const,
      consumedAt: now,
      liveOrderSubmissionAuthorized: false,
    });

    this.persist(consumed);
    return clone(consumed);
  }

  cancel(
    authorityId: string,
    confirmationValue: string,
    now = Date.now(),
  ): StrategyOneTinyLiveAuthorityRecord {
    validateTime(now);

    const current =
      this.latest.get(
        authorityId.trim(),
      );

    if (
      !current ||
      (
        current.state !== "PREVIEWED" &&
        current.state !== "AUTHORIZED"
      )
    ) {
      throw new Error(
        "Only an unused PREVIEWED or AUTHORIZED Tiny-LIVE authority can be cancelled.",
      );
    }

    if (
      confirmationValue.trim() !==
      `CANCEL ${current.id}`
    ) {
      throw new Error(
        "Exact Tiny-LIVE authority cancellation phrase is required.",
      );
    }

    const cancelled =
      freeze({
        ...clone(current),
        state:
          "CANCELLED" as const,
        cancelledAt:
          now,
        liveOrderSubmissionAuthorized:
          false,
      });

    this.persist(
      cancelled,
    );

    return clone(
      cancelled,
    );
  }

  cancelUnusedForEmergencyStop(
    now = Date.now(),
  ): StrategyOneTinyLiveAuthorityRecord[] {
    validateTime(
      now,
    );

    const cancelled:
      StrategyOneTinyLiveAuthorityRecord[] = [];

    for (
      const current
      of this.latest.values()
    ) {
      if (
        current.state !== "PREVIEWED" &&
        current.state !== "AUTHORIZED"
      ) {
        continue;
      }

      const record =
        freeze({
          ...clone(current),
          state:
            "CANCELLED" as const,
          cancelledAt:
            now,
          liveOrderSubmissionAuthorized:
            false,
        });

      this.persist(
        record,
      );
      cancelled.push(
        clone(
          record,
        ),
      );
    }

    return cancelled;
  }

  bindPair(
    authorityId: string,
    pairSessionIdValue: string,
    now = Date.now(),
  ): StrategyOneTinyLiveAuthorityRecord {
    validateTime(now);
    const current = this.require(authorityId, "CONSUMED");
    const pairSessionId = pairSessionIdValue.trim();

    if (!pairSessionId) {
      throw new Error("Durable Strategy #1 pair session ID is required.");
    }

    const bound = freeze({
      ...clone(current),
      state: "PAIR_BOUND" as const,
      pairBoundAt: now,
      pairSessionId,
    });

    this.persist(bound);
    return clone(bound);
  }

  finalize(
    authorityId: string,
    result: ArbitrageLiveExecutionResult,
    now = Date.now(),
  ): StrategyOneTinyLiveAuthorityRecord {
    validateTime(now);
    const current = this.latest.get(authorityId.trim());

    if (!current || (current.state !== "CONSUMED" && current.state !== "PAIR_BOUND")) {
      throw new Error("Consumed Tiny-LIVE authority is required for finalization.");
    }

    const requiresRecovery =
      result.status === "POSSIBLE_EXPOSURE" ||
      result.status === "RECOVERY_REQUIRED" ||
      result.status === "PARTIALLY_COMPLETED";
    const finalized = freeze({
      ...clone(current),
      state: "FINALIZED" as const,
      finalizedAt: now,
      finalOutcome: result.status,
      requiresRecovery,
      liveOrderSubmissionAuthorized: false,
    });

    this.persist(finalized);
    return clone(finalized);
  }

  resolve(
    authorityId: string,
    confirmationValue: string,
    now = Date.now(),
  ): StrategyOneTinyLiveAuthorityRecord {
    validateTime(now);
    const current = this.latest.get(authorityId.trim());

    if (!current) {
      throw new Error("Tiny-LIVE authority is unknown.");
    }

    if (confirmationValue.trim() !== `RESOLVE ${current.id}`) {
      throw new Error("Exact Tiny-LIVE resolution phrase is required.");
    }

    const preDispatchConsumed =
      current.state === "CONSUMED" && current.pairSessionId === null;
    const pairResolved =
      current.pairSessionId !== null &&
      this.dependencies.isPairResolved(current.pairSessionId);
    const boundButNeverPrepared =
      current.pairSessionId !== null &&
      !this.dependencies.pairSessionExists(current.pairSessionId);

    if (!preDispatchConsumed && !pairResolved && !boundButNeverPrepared) {
      throw new Error(
        "Tiny-LIVE authority cannot resolve until pre-dispatch absence or evidence-bound pair recovery is proven.",
      );
    }

    const resolved = freeze({
      ...clone(current),
      state: "RESOLVED" as const,
      requiresRecovery: false,
      resolvedAt: now,
      liveOrderSubmissionAuthorized: false,
    });

    this.persist(resolved);
    return clone(resolved);
  }

  get(
    authorityId: string,
  ): StrategyOneTinyLiveAuthorityRecord | null {
    const value = this.latest.get(authorityId.trim());
    return value ? clone(value) : null;
  }

  getDiagnostics(
    now = Date.now(),
  ) {
    validateTime(now);
    const records = [...this.latest.values()]
      .sort((first, second) => second.previewedAt - first.previewedAt)
      .map(clone);

    return freeze({
      schemaVersion: "111.0" as const,
      generatedAt: now,
      runtimeGateEnabled: this.dependencies.runtimeGateEnabled(),
      maximumDailyAttempts: this.maximumDailyAttempts,
      attemptsToday: this.dailyAttempts(now),
      blockingAuthorityPresent: this.hasBlockingAuthority(now),
      records,
      persistence: this.store.getDiagnostics(),
      safety: {
        capitalPerLegInr:
          this.dependencies
            .getTinyLiveCapitalPerLegInr(),
        maximumConcurrentAttempts: 1,
        oneTimeAuthority: true,
        authorityTtlMs: this.authorityTtlMs,
        journalBeforeCoordinatorAccess: true,
        pairBindingBeforeExchangeDispatch: true,
        automaticRetryAllowed: false,
        automaticFundMovementAllowed: false,
      },
    });
  }

  private previewEvidence(
    opportunityId: string,
    now: number,
  ) {
    const opportunity = this.dependencies.getOpportunity(opportunityId);

    if (!opportunity) {
      throw new Error("The exact opportunity expired before authorization.");
    }

    const canonical =
      this.dependencies
        .runCanonicalPreflight({
          opportunityId,
          now,
        });

    if (
      !canonical.approvedForOneTimeArm ||
      canonical.opportunityId !==
        opportunityId ||
      canonical.recommendedQuantity ===
        null ||
      canonical.recommendedQuantity <=
        0
    ) {
      throw new Error(
        `Canonical controlled-live preflight blocked one-time authority: ${canonical.blockers.join(" | ")}`,
      );
    }

    const preflight = this.dependencies.runPreflight({
      confirmationToken: "RUN_STRATEGY_ONE_PILOT_PREFLIGHT_ONLY",
      expectedOpportunityId: opportunityId,
      now,
    });
    const selected = preflight.preview.selected;

    if (!preflight.approvedForActivationReview || !selected) {
      throw new Error(`Tiny-LIVE preflight changed: ${preflight.blockers.join(" | ")}`);
    }

    const observedCalibration = this.dependencies.getCalibration({
      market: selected.market,
      buyExchange: selected.buyExchange,
      sellExchange: selected.sellExchange,
      now,
    });
    const exactQuantity =
      canonical.recommendedQuantity;

    if (exactQuantity === null || exactQuantity <= 0) {
      throw new Error("Exact funded quantity is unavailable.");
    }


    if (
      observedCalibration?.scope === "BOOTSTRAP_FIRST_TINY_LIVE_ATTEMPT" &&
      this.dailyAttempts(now) > 0
    ) {
      throw new Error(
        "Bootstrap timing calibration permits only the first Tiny-LIVE attempt.",
      );
    }

    const route = {
      market: selected.market,
      buyExchange: selected.buyExchange,
      sellExchange: selected.sellExchange,
    };

    for (const venue of [route.buyExchange, route.sellExchange]) {
      const contract = this.dependencies.getVenueContract(venue, route, now);

      if (
        !contract ||
        contract.maximumOrderBookAgeMs === null ||
        !contract.supportedTimeInForce.includes("FOK") ||
        !contract.authoritativeFillConfirmationReady
      ) {
        throw new Error(`${venue} action-time LIVE contract is no longer ready.`);
      }
    }

    return {
      preflightHash:
        createHash("sha256")
          .update(
            `${preflightFingerprint(preflight)}:${canonical.fingerprintMaterial}`,
          )
          .digest(
            "hex",
          ),
      exactQuantity,
      maximumBuyPrice:
        opportunity.buyPrice,
      minimumSellPrice:
        opportunity.sellPrice,
      buyQuoteTimestamp:
        opportunity.pair.buy.timestamp,
      sellQuoteTimestamp:
        opportunity.pair.sell.timestamp,
      capitalPerLegInr:
        preflight.preview.requestedCapitalPerLegInr,
      calibrationId:
        observedCalibration?.id ??
        "configured-order-time-safety-v1",
    };
  }

  private require(
    idValue: string,
    state: StrategyOneTinyLiveAuthorityState,
  ): StrategyOneTinyLiveAuthorityRecord {
    const record = this.latest.get(idValue.trim());

    if (!record || record.state !== state) {
      throw new Error(`Tiny-LIVE authority must be in ${state} state.`);
    }

    return record;
  }

  private hasBlockingAuthority(now: number): boolean {
    return [...this.latest.values()].some((record) =>
      (record.state === "AUTHORIZED" &&
        record.authorityExpiresAt !== null &&
        record.authorityExpiresAt >= now) ||
      record.state === "CONSUMED" ||
      record.state === "PAIR_BOUND" ||
      (record.state === "FINALIZED" && record.requiresRecovery));
  }

  private dailyAttempts(now: number): number {
    const day = kolkataDay(now);

    return [...this.latest.values()].filter((record) =>
      record.consumedAt !== null && kolkataDay(record.consumedAt) === day).length;
  }

  private persist(record: StrategyOneTinyLiveAuthorityRecord): void {
    this.store.append(record);
    this.latest.set(record.id, freeze(clone(record)));
  }
}

function previewResult(
  generatedAt: number,
  authority: StrategyOneTinyLiveAuthorityRecord | null,
  preflight: StrategyOnePilotPreflightRunReport | null,
  blockers: readonly string[],
): StrategyOneTinyLivePreview {
  return freeze({
    schemaVersion: "111.0" as const,
    generatedAt,
    approvedForAuthorization: authority !== null && blockers.length === 0,
    authority: authority ? clone(authority) : null,
    preflight: preflight ? clone(preflight) : null,
    blockers: [...new Set(blockers)],
    safety: {
      liveOrderSubmissionPerformed: false as const,
      capitalReserved: false as const,
      exactActionPhraseRequired: true as const,
      oneTimeAuthority: true as const,
    },
  });
}

function isAuthority(value: unknown): value is StrategyOneTinyLiveAuthorityRecord {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const item = value as Partial<StrategyOneTinyLiveAuthorityRecord>;
  const states: readonly StrategyOneTinyLiveAuthorityState[] = [
    "PREVIEWED",
    "AUTHORIZED",
    "CONSUMED",
    "PAIR_BOUND",
    "FINALIZED",
    "RESOLVED",
    "CANCELLED",
  ];
  const nullableTimes = [
    item.authorizedAt,
    item.authorityExpiresAt,
    item.consumedAt,
    item.pairBoundAt,
    item.finalizedAt,
    item.resolvedAt,
    item.cancelledAt ?? null,
  ];

  return item.schemaVersion === "111.0" &&
    typeof item.id === "string" && item.id.startsWith("tiny-live-") &&
    states.includes(item.state as StrategyOneTinyLiveAuthorityState) &&
    typeof item.opportunityId === "string" && item.opportunityId.length > 0 &&
    typeof item.market === "string" && item.market.length > 0 &&
    typeof item.buyExchange === "string" && item.buyExchange.length > 0 &&
    typeof item.sellExchange === "string" && item.sellExchange.length > 0 &&
    item.buyExchange !== item.sellExchange &&
    Number.isSafeInteger(item.capitalPerLegInr) &&
    (item.capitalPerLegInr ?? 0) >= 100 &&
    (item.capitalPerLegInr ?? 0) <= 500 &&
    typeof item.exactQuantity === "number" &&
    Number.isFinite(item.exactQuantity) && item.exactQuantity > 0 &&
    typeof item.preflightHash === "string" && item.preflightHash.length === 64 &&
    typeof item.calibrationId === "string" && item.calibrationId.length > 0 &&
    (item.calibrationScope === "BOOTSTRAP_FIRST_TINY_LIVE_ATTEMPT" ||
      item.calibrationScope === "CONTINUOUS_TINY_LIVE") &&
    item.requiredAuthorizationPhrase === `AUTHORIZE ${item.id}` &&
    isPositiveTime(item.previewedAt) &&
    nullableTimes.every((timestamp) => timestamp === null || isPositiveTime(timestamp)) &&
    (item.pairSessionId === null ||
      (typeof item.pairSessionId === "string" && item.pairSessionId.length > 0)) &&
    (item.finalOutcome === null || typeof item.finalOutcome === "string") &&
    typeof item.requiresRecovery === "boolean" &&
    typeof item.liveOrderSubmissionAuthorized === "boolean" &&
    item.automaticRetryAllowed === false &&
    item.automaticFundMovementAllowed === false;
}

function isValidRestoredTransition(
  previous: StrategyOneTinyLiveAuthorityRecord | null,
  next: StrategyOneTinyLiveAuthorityRecord,
): boolean {
  if (!previous) {
    return next.state === "PREVIEWED" &&
      next.authorizedAt === null &&
      next.consumedAt === null &&
      next.pairSessionId === null &&
      !next.liveOrderSubmissionAuthorized;
  }

  const immutableMatch =
    previous.id === next.id &&
    previous.opportunityId === next.opportunityId &&
    previous.market === next.market &&
    previous.buyExchange === next.buyExchange &&
    previous.sellExchange === next.sellExchange &&
    previous.capitalPerLegInr === next.capitalPerLegInr &&
    previous.exactQuantity === next.exactQuantity &&
    previous.maximumBuyPrice === next.maximumBuyPrice &&
    previous.minimumSellPrice === next.minimumSellPrice &&
    previous.buyQuoteTimestamp === next.buyQuoteTimestamp &&
    previous.sellQuoteTimestamp === next.sellQuoteTimestamp &&
    previous.preflightHash === next.preflightHash &&
    previous.calibrationId === next.calibrationId &&
    previous.calibrationScope === next.calibrationScope &&
    previous.requiredAuthorizationPhrase === next.requiredAuthorizationPhrase &&
    previous.previewedAt === next.previewedAt;

  if (!immutableMatch) {
    return false;
  }

  const allowed: Record<StrategyOneTinyLiveAuthorityState, readonly StrategyOneTinyLiveAuthorityState[]> = {
    PREVIEWED: ["AUTHORIZED", "CANCELLED"],
    AUTHORIZED: ["CONSUMED", "CANCELLED"],
    CONSUMED: ["PAIR_BOUND", "FINALIZED", "RESOLVED"],
    PAIR_BOUND: ["FINALIZED", "RESOLVED"],
    FINALIZED: ["RESOLVED"],
    RESOLVED: [],
    CANCELLED: [],
  };

  return allowed[previous.state].includes(next.state) &&
    (next.state === "AUTHORIZED"
      ? next.liveOrderSubmissionAuthorized && next.authorizedAt !== null
      : !next.liveOrderSubmissionAuthorized);
}

function isPositiveTime(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function kolkataDay(timestamp: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(timestamp));
}

function normalizeMarket(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/gu, "");
}

function normalizeExchange(value: string): string {
  return value.trim().toLowerCase();
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function preflightFingerprint(
  value: StrategyOnePilotPreflightRunReport,
): string {
  return createHash("sha256")
    .update(JSON.stringify(value, (key, item) =>
      key === "generatedAt" || key === "ageMs"
        ? undefined
        : item))
    .digest("hex");
}

function validateTime(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("Tiny-LIVE authority timestamp must be positive.");
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown Tiny-LIVE preflight failure.";
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

export const strategyOneTinyLiveActionAuthorityService =
  new StrategyOneTinyLiveActionAuthorityService();
