import {createHash} from "node:crypto";
import {resolve} from "node:path";

import type {ArbitrageOpportunity} from "../../../arbitrage/models/ArbitrageOpportunity";
import {opportunityService} from "../../../arbitrage/services/OpportunityService";
import {
  strategyOneTimingCalibrationService,
  type StrategyOneExecutionTimingQualification,
} from "../../../arbitrage/execution/StrategyOneTimingCalibrationService";
import {JsonlSnapshotStore} from "../../../core/persistence/JsonlSnapshotStore";
import {
  isStrategyOneVenueOrderContractReady,
  strategyOneLiveVenueContractRegistry,
} from "../contracts/StrategyOneLiveVenueContractRegistry";
import {strategyOneTwoLegRecoveryResolutionService} from "../recovery/StrategyOneTwoLegRecoveryResolutionService";
import {strategyOneTwoLegLiveExecutionService} from "../arbitrage/StrategyOneTwoLegLiveExecutionService";
import type {ArbitrageLiveExecutionResult} from "../../../arbitrage/execution/models/ArbitrageLiveExecutionResult";
import {
  strategyOnePilotPreflightService,
  type StrategyOnePilotPreflightRunReport,
} from "./StrategyOnePilotPreflightService";

import {
  strategyOneExecutionPolicyService,
} from "../../../trading/policy/StrategyOneExecutionPolicyService";

import {
  isExactStrategyOnePilotRoute,
} from "../../../arbitrage/execution/StrategyOnePilotEquivalentPaperEvidenceService";

export type StrategyOneTinyLiveAuthorityState =
  | "PREVIEWED"
  | "AUTHORIZED"
  | "CONSUMED"
  | "PAIR_BOUND"
  | "FINALIZED"
  | "RESOLVED";

export interface StrategyOneTinyLiveAuthorityRecord {
  readonly schemaVersion: "111.0" | "189.0";
  readonly id: string;
  readonly state: StrategyOneTinyLiveAuthorityState;
  readonly opportunityId: string;
  readonly market: string;
  readonly buyExchange: string;
  readonly sellExchange: string;
  readonly capitalPerLegInr: number;
  readonly exactQuantity: number;
  readonly preflightHash: string;
  readonly calibrationId: string;
  readonly calibrationScope: StrategyOneExecutionTimingQualification["scope"];
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
  }): StrategyOneExecutionTimingQualification | null;
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
    strategyOneTimingCalibrationService.getDynamicPoolRouteQualification(input),
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
      "ENABLE_CONFIRMED_ARBITRAGE_EXECUTION" &&
    process.env.STRATEGY_ONE_LIVE_RUNTIME_CONFIRMATION?.trim() ===
      "ENABLE_STRATEGY_ONE_TINY_LIVE_RUNTIME",
  getTinyLiveCapitalPerLegInr: () =>
    strategyOneExecutionPolicyService
      .getActivePolicy()
      .values
      .tinyLive
      .capitalPerLegInr,
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
    private readonly authorityTtlMs = 3_000,
    private readonly maximumDailyAttempts = 10,
  ) {
    this.dependencies = {...DEFAULT_DEPENDENCIES, ...dependencies};

    if (
      !Number.isSafeInteger(previewTtlMs) ||
      previewTtlMs <= 0 ||
      !Number.isSafeInteger(authorityTtlMs) ||
      authorityTtlMs <= 0 ||
      authorityTtlMs > 10_000 ||
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
    const exactQuantity = selected?.funding.executableQuantity ?? null;
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
      !isExactStrategyOnePilotRoute(
        route,
      )
    ) {
      blockers.push("Strategy #1 LIVE route is not an explicitly audited SPOT lane.");
    }

    const calibration = route
      ? this.dependencies.getCalibration({...route, now})
      : null;
    const routeAttempts = route
      ? this.routeAttempts(route, now)
      : 0;

    if (!calibration) {
      blockers.push("Current exact-route timing evidence is not qualified for the dynamic pool.");
    } else if (
      calibration.scope === "BOOTSTRAP_FIRST_TINY_LIVE_ATTEMPT" &&
      routeAttempts > 0
    ) {
      blockers.push(
        "Bootstrap timing calibration permits only the first attempt on this exact route; authenticated fill timing must be reviewed before another route attempt.",
      );
    } else if (
      calibration.scope === "BOOTSTRAP_CONTROLLED_TWO_ATTEMPT_BATCH" &&
      routeAttempts >= 2
    ) {
      blockers.push(
        "Controlled bootstrap timing calibration permits at most two Tiny-LIVE attempts on this exact route.",
      );
    }

    if (route) {
      for (const venue of [route.buyExchange, route.sellExchange]) {
        const contract = this.dependencies.getVenueContract(venue, route, now);

        if (!isStrategyOneVenueOrderContractReady(contract)) {
          blockers.push(`${venue} exact time-in-force/private-fill/timing contract is not ready.`);
        }
      }
    }

    if (
      blockers.length > 0 ||
      !opportunity ||
      !preflight ||
      !selected ||
      !route ||
      !calibration ||
      exactQuantity === null ||
      capitalPerLegInr === null
    ) {
      return previewResult(now, null, preflight, blockers);
    }

    const preflightHash = preflightFingerprint(preflight);
    const id = `tiny-live-${hash({
      opportunityId,
      route,
      exactQuantity,
      preflightHash,
      calibrationId: calibration.id,
      previewedAt: now,
    }).slice(0, 32)}`;
    const record = freeze({
      schemaVersion: calibration.scope === "DYNAMIC_POOL"
        ? "189.0" as const
        : "111.0" as const,
      id,
      state: "PREVIEWED" as const,
      opportunityId,
      ...route,
      capitalPerLegInr,
      exactQuantity,
      preflightHash,
      calibrationId: calibration.id,
      calibrationScope: calibration.scope,
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
      fresh.calibrationId !== current.calibrationId
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

    if (
      current.authorityExpiresAt === null ||
      current.authorityExpiresAt < now ||
      current.opportunityId !== input.opportunity.id ||
      current.market !== normalizeMarket(input.opportunity.pair.market) ||
      current.buyExchange !== normalizeExchange(input.opportunity.pair.buy.exchange) ||
      current.sellExchange !== normalizeExchange(input.opportunity.pair.sell.exchange)
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

    const preflight = this.dependencies.runPreflight({
      confirmationToken: "RUN_STRATEGY_ONE_PILOT_PREFLIGHT_ONLY",
      expectedOpportunityId: opportunityId,
      now,
    });
    const selected = preflight.preview.selected;

    if (!preflight.approvedForActivationReview || !selected) {
      throw new Error(`Tiny-LIVE preflight changed: ${preflight.blockers.join(" | ")}`);
    }

    const calibration = this.dependencies.getCalibration({
      market: selected.market,
      buyExchange: selected.buyExchange,
      sellExchange: selected.sellExchange,
      now,
    });
    const exactQuantity = selected.funding.executableQuantity;
    const route = {
      market: selected.market,
      buyExchange: selected.buyExchange,
      sellExchange: selected.sellExchange,
    };
    const routeAttempts = this.routeAttempts(route, now);

    if (!calibration || exactQuantity === null || exactQuantity <= 0) {
      throw new Error("Fresh dynamic timing qualification or exact funded quantity is unavailable.");
    }


    if (
      calibration.scope === "BOOTSTRAP_FIRST_TINY_LIVE_ATTEMPT" &&
      routeAttempts > 0
    ) {
      throw new Error(
        "Bootstrap timing calibration permits only the first Tiny-LIVE attempt on this exact route.",
      );
    }

    if (
      calibration.scope === "BOOTSTRAP_CONTROLLED_TWO_ATTEMPT_BATCH" &&
      routeAttempts >= 2
    ) {
      throw new Error(
        "Controlled bootstrap timing calibration permits at most two Tiny-LIVE attempts on this exact route.",
      );
    }

    for (const venue of [route.buyExchange, route.sellExchange]) {
      const contract = this.dependencies.getVenueContract(venue, route, now);

      if (!isStrategyOneVenueOrderContractReady(contract)) {
        throw new Error(`${venue} action-time LIVE contract is no longer ready.`);
      }
    }

    return {
      preflightHash: preflightFingerprint(preflight),
      exactQuantity,
      capitalPerLegInr:
        preflight.preview.requestedCapitalPerLegInr,
      calibrationId: calibration.id,
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

  private routeAttempts(
    route: {
      readonly market: string;
      readonly buyExchange: string;
      readonly sellExchange: string;
    },
    now: number,
  ): number {
    const day = kolkataDay(now);
    const market = normalizeMarket(route.market);
    const buyExchange = normalizeExchange(route.buyExchange);
    const sellExchange = normalizeExchange(route.sellExchange);

    return [...this.latest.values()].filter((record) =>
      record.consumedAt !== null &&
      kolkataDay(record.consumedAt) === day &&
      record.market === market &&
      record.buyExchange === buyExchange &&
      record.sellExchange === sellExchange).length;
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
  ];
  const nullableTimes = [
    item.authorizedAt,
    item.authorityExpiresAt,
    item.consumedAt,
    item.pairBoundAt,
    item.finalizedAt,
    item.resolvedAt,
  ];

  return (item.schemaVersion === "111.0" || item.schemaVersion === "189.0") &&
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
      item.calibrationScope === "BOOTSTRAP_CONTROLLED_TWO_ATTEMPT_BATCH" ||
      item.calibrationScope === "CONTINUOUS_TINY_LIVE" ||
      item.calibrationScope === "DYNAMIC_POOL") &&
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
    previous.preflightHash === next.preflightHash &&
    previous.calibrationId === next.calibrationId &&
    previous.calibrationScope === next.calibrationScope &&
    previous.requiredAuthorizationPhrase === next.requiredAuthorizationPhrase &&
    previous.previewedAt === next.previewedAt;

  if (!immutableMatch) {
    return false;
  }

  const allowed: Record<StrategyOneTinyLiveAuthorityState, readonly StrategyOneTinyLiveAuthorityState[]> = {
    PREVIEWED: ["AUTHORIZED"],
    AUTHORIZED: ["CONSUMED"],
    CONSUMED: ["PAIR_BOUND", "FINALIZED", "RESOLVED"],
    PAIR_BOUND: ["FINALIZED", "RESOLVED"],
    FINALIZED: ["RESOLVED"],
    RESOLVED: [],
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
  /*
   * Both preview and authorization run the complete fail-closed preflight.
   * Their semantic evidence must match, but naturally increasing observation
   * ages and evaluation timestamps are not evidence mutations.  Keep the
   * underlying book/balance timestamps, thresholds, quantities, economics,
   * gate states and blockers in the fingerprint.  If elapsed time crosses a
   * safety boundary, the second preflight blocks before this comparison.
   */
  const volatileObservationFields = new Set([
    "ageMs",
    "checkedAt",
    "evaluatedAt",
    "generatedAt",
    "snapshotAgeMs",
    "sourceOpportunityAgeMs",
  ]);

  return createHash("sha256")
    .update(JSON.stringify(value, (key, item) =>
      volatileObservationFields.has(key)
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
