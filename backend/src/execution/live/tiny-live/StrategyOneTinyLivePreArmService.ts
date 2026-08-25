import {createHash} from "node:crypto";
import {resolve} from "node:path";

import type {ArbitrageOpportunity} from "../../../arbitrage/models/ArbitrageOpportunity";
import type {OpportunitySnapshot} from "../../../arbitrage/services/OpportunityService";
import {opportunityService} from "../../../arbitrage/services/OpportunityService";
import {arbitrageExecutionCoordinator} from "../../../arbitrage/execution/ArbitrageExecutionCoordinator";
import {
  strategyOneTimingCalibrationService,
  type StrategyOneTimingCalibrationRecord,
} from "../../../arbitrage/execution/StrategyOneTimingCalibrationService";
import {
  isExactStrategyOnePilotRoute,
  type StrategyOnePilotExchange,
} from "../../../arbitrage/execution/StrategyOnePilotEquivalentPaperEvidenceService";
import type {ArbitrageLiveExecutionResult} from "../../../arbitrage/execution/models/ArbitrageLiveExecutionResult";
import {
  STRATEGY_ONE_TINY_LIVE_ROUTE_POOL_ID,
  STRATEGY_ONE_TINY_LIVE_ROUTE_POOL_POLICY,
  isStrategyOneTinyLiveDynamicRoute,
} from "../../../arbitrage/execution/StrategyOneTinyLiveBasketPolicy";
import {JsonlSnapshotStore} from "../../../core/persistence/JsonlSnapshotStore";
import {strategyOneExecutionPolicyService} from "../../../trading/policy/StrategyOneExecutionPolicyService";
import {
  isStrategyOneVenueOrderContractReady,
  strategyOneLiveVenueContractRegistry,
} from "../contracts/StrategyOneLiveVenueContractRegistry";
import {
  strategyOneTinyLiveActionAuthorityService,
  type StrategyOneTinyLivePreview,
} from "./StrategyOneTinyLiveActionAuthorityService";
import {
  strategyOneActionTimeBookRefreshService,
  type StrategyOneActionTimeBookRefreshResult,
  type StrategyOneAuthorizedFinalBookRefreshResult,
} from "./StrategyOneActionTimeBookRefreshService";

export type StrategyOneTinyLivePreArmState =
  | "ARMED"
  | "CLAIMED"
  | "COMPLETED"
  | "FAILED_SAFE"
  | "DISARMED"
  | "EXPIRED";

export interface StrategyOneTinyLivePreArmAttempt {
  readonly attemptNumber: number;
  readonly opportunityId: string;
  readonly authorityId: string | null;
  readonly claimedAt: number;
  readonly completedAt: number;
  readonly executionStatus: ArbitrageLiveExecutionResult["status"] | "FAILED_SAFE";
  readonly success: boolean;
  readonly requestedQuantity: number | null;
  readonly matchedFilledQuantity: number | null;
  readonly unmatchedBuyQuantity: number | null;
  readonly unmatchedSellQuantity: number | null;
  readonly executionTimeMs: number | null;
  readonly buyStatus: string | null;
  readonly sellStatus: string | null;
  readonly reason: string;
  /**
   * Complete ordered coordinator evidence for this attempt. Older records may
   * contain only `reason`; new records retain every fail-closed sub-reason so
   * an order-time rejection remains diagnosable after restart.
   */
  readonly reasons?: readonly string[];
  readonly recoveryRequired: boolean;
  readonly possibleExposure: boolean;
  readonly market?: string;
  readonly buyExchange?: string;
  readonly sellExchange?: string;
}

export interface StrategyOneTinyLivePreArmRecord {
  readonly schemaVersion: "125.0" | "150.0" | "182.0" | "188.0";
  readonly id: string;
  readonly state: StrategyOneTinyLivePreArmState;
  readonly market: string;
  readonly buyExchange: StrategyOnePilotExchange;
  readonly sellExchange: StrategyOnePilotExchange;
  readonly capitalPerLegInr: number;
  readonly requiredArmPhrase: string;
  readonly armedAt: number;
  readonly expiresAt: number;
  readonly claimedAt: number | null;
  readonly opportunityId: string | null;
  readonly authorityId: string | null;
  readonly completedAt: number | null;
  readonly executionStatus: ArbitrageLiveExecutionResult["status"] | null;
  readonly failureReason: string | null;
  readonly automaticRetryAllowed: false;
  readonly automaticFundMovementAllowed: false;
  readonly maximumAttempts: 1 | 2 | 9 | 10;
  readonly attemptsUsed?: number;
  readonly attempts?: readonly StrategyOneTinyLivePreArmAttempt[];
  readonly nextAttemptNotBefore?: number | null;
  readonly routeScope?: "EXACT_ROUTE" | "DYNAMIC_POOL";
  readonly routePoolId?: typeof STRATEGY_ONE_TINY_LIVE_ROUTE_POOL_ID;
}

export interface StrategyOneTinyLivePreArmDependencies {
  runtimeGateEnabled(): boolean;
  getCapitalPerLegInr(): number;
  getActionDiagnostics(now: number): {
    readonly maximumDailyAttempts: number;
    readonly attemptsToday: number;
    readonly blockingAuthorityPresent: boolean;
  };
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
  getOpportunity(id: string): ArbitrageOpportunity | null;
  previewAction(opportunityId: string, now: number): StrategyOneTinyLivePreview;
  refreshActionCandidate(input: {
    readonly market: string;
    readonly buyExchange: string;
    readonly sellExchange: string;
  }): Promise<StrategyOneActionTimeBookRefreshResult>;
  refreshAuthorizedFinalBooks(input: {
    readonly market: string;
    readonly buyExchange: string;
    readonly sellExchange: string;
  }): Promise<StrategyOneAuthorizedFinalBookRefreshResult>;
  authorizeAction(id: string, phrase: string, now: number): {
    readonly id: string;
    readonly state: string;
  };
  execute(
    opportunity: ArbitrageOpportunity,
    authorityId: string,
  ): Promise<ArbitrageLiveExecutionResult>;
  now(): number;
}

export interface StrategyOneTinyLivePreArmRequest {
  readonly market: string;
  readonly buyExchange: string;
  readonly sellExchange: string;
  readonly confirmation: string;
  readonly durationMinutes?: number;
  readonly maximumAttempts?: 1 | 2 | 9 | 10;
  readonly now?: number;
  readonly routePoolId?: string;
}

const DEFAULT_FILE = resolve(
  process.cwd(),
  "logs",
  "live",
  "strategy-one-tiny-live-pre-arms.jsonl",
);

const MINIMUM_DURATION_MINUTES = 1;
const DEFAULT_DURATION_MINUTES = 15;
const MAXIMUM_DURATION_MINUTES = 30;
const MAXIMUM_BATCH_DURATION_MINUTES = 180;
const LEGACY_BATCH_ATTEMPTS = 2;
const REDUCED_DYNAMIC_POOL_ATTEMPTS = 9;
const MAXIMUM_BATCH_ATTEMPTS = 10;
const BETWEEN_ATTEMPTS_COOLDOWN_MS = 5_000;
const BLOCKED_REEVALUATION_INTERVAL_MS = 250;

const DEFAULT_DEPENDENCIES: StrategyOneTinyLivePreArmDependencies = {
  runtimeGateEnabled: () =>
    process.env.TRADING_MODE?.trim().toLowerCase() === "live" &&
    process.env.LIVE_TRADING_ENABLED?.trim().toLowerCase() === "true" &&
    process.env.ARBITRAGE_LIVE_CONFIRMATION?.trim() ===
      "ENABLE_CONFIRMED_ARBITRAGE_EXECUTION" &&
    process.env.STRATEGY_ONE_LIVE_RUNTIME_CONFIRMATION?.trim() ===
      "ENABLE_STRATEGY_ONE_TINY_LIVE_RUNTIME",
  getCapitalPerLegInr: () =>
    strategyOneExecutionPolicyService.getActivePolicy().values.tinyLive.capitalPerLegInr,
  getActionDiagnostics: (now) =>
    strategyOneTinyLiveActionAuthorityService.getDiagnostics(now),
  getCalibration: (input) =>
    strategyOneTimingCalibrationService.getApprovedRouteCalibration(input),
  getVenueContract: (exchange, route, now) =>
    strategyOneLiveVenueContractRegistry.getOrderTimeSafetyContract(
      exchange,
      route,
      now,
    ),
  getOpportunity: (id) => opportunityService.getOpportunityById(id),
  previewAction: (opportunityId, now) =>
    strategyOneTinyLiveActionAuthorityService.preview(opportunityId, now),
  refreshActionCandidate: (input) =>
    strategyOneActionTimeBookRefreshService.refresh(input),
  refreshAuthorizedFinalBooks: (input) =>
    strategyOneActionTimeBookRefreshService
      .refreshForAuthorizedAttempt(input),
  authorizeAction: (id, phrase, now) =>
    strategyOneTinyLiveActionAuthorityService.authorize(id, phrase, now),
  execute: (opportunity, authorityId) =>
    arbitrageExecutionCoordinator.execute(opportunity, {
      actionAuthorityId: authorityId,
      timeoutMs: 3_000,
      pollingIntervalMs: 100,
      cancelOnTimeout: true,
    }),
  now: Date.now,
};

/**
 * Durable one-shot consent for the first Strategy #1 Tiny-LIVE lane.
 *
 * The arm is route-bound and contains no order authority. When the event-driven
 * scanner later publishes an exact matching opportunity, the service reruns
 * the complete action-time preflight, durably claims the arm, mints the existing
 * three-second authority, and hands it to the sole execution coordinator. The
 * arm is consumed before order authority exists, so a crash cannot retry it.
 */
export class StrategyOneTinyLivePreArmService {
  private readonly dependencies: StrategyOneTinyLivePreArmDependencies;
  private readonly store: JsonlSnapshotStore<StrategyOneTinyLivePreArmRecord>;
  private readonly latest = new Map<string, StrategyOneTinyLivePreArmRecord>();
  private activeArmId: string | null = null;
  private triggerInProgress = false;
  private nextEvaluationAt = 0;
  private lastEvaluation: {
    readonly evaluatedAt: number;
    readonly opportunityId: string;
    readonly outcome: "BLOCKED" | "CLAIMED" | "COMPLETED" | "FAILED_SAFE";
    readonly reason: string;
  } | null = null;
  private candidatesEvaluated = 0;
  private preflightBlocks = 0;
  private refreshesRequested = 0;
  private refreshesRecovered = 0;
  private coordinatorStarts = 0;

  constructor(
    dependencies: Partial<StrategyOneTinyLivePreArmDependencies> = {},
    filePath = DEFAULT_FILE,
  ) {
    this.dependencies = {...DEFAULT_DEPENDENCIES, ...dependencies};
    this.store = new JsonlSnapshotStore({filePath, isPayload: isPreArmRecord});

    for (const record of this.store.readAll()) {
      const previous = this.latest.get(record.id) ?? null;

      if (!isValidTransition(previous, record)) {
        throw new Error(
          `Strategy #1 Tiny-LIVE pre-arm journal has an invalid transition for ${record.id}.`,
        );
      }

      this.latest.set(record.id, freeze(clone(record)));
    }

    const active = [...this.latest.values()].filter((record) =>
      record.state === "ARMED");

    if (active.length > 1) {
      throw new Error("Multiple durable Strategy #1 Tiny-LIVE pre-arms are active.");
    }

    this.activeArmId = active[0]?.id ?? null;
  }

  arm(input: StrategyOneTinyLivePreArmRequest): StrategyOneTinyLivePreArmRecord {
    if (input.routePoolId !== undefined) {
      return this.armDynamicPool(input);
    }

    const now = input.now ?? this.dependencies.now();
    validateTime(now);
    this.expireActiveArm(now);

    const market = normalizeMarket(input.market);
    const buyExchange = normalizePilotExchange(input.buyExchange);
    const sellExchange = normalizePilotExchange(input.sellExchange);
    const durationMinutes = input.durationMinutes ?? DEFAULT_DURATION_MINUTES;
    const maximumAttempts = input.maximumAttempts ?? 1;
    const capitalPerLegInr = this.dependencies.getCapitalPerLegInr();
    const requiredArmPhrase = armPhrase({
      market,
      buyExchange,
      sellExchange,
      capitalPerLegInr,
      maximumAttempts,
      durationMinutes,
    });

    if (!this.dependencies.runtimeGateEnabled()) {
      throw new Error("Strategy #1 Tiny-LIVE runtime gate is disabled; pre-arm was not created.");
    }

    if (this.activeArmId !== null) {
      throw new Error("Another Strategy #1 one-shot pre-arm is already active.");
    }

    if (
      !Number.isSafeInteger(durationMinutes) ||
      durationMinutes < MINIMUM_DURATION_MINUTES ||
      durationMinutes > (
        maximumAttempts > 1
          ? MAXIMUM_BATCH_DURATION_MINUTES
          : MAXIMUM_DURATION_MINUTES
      )
    ) {
      throw new Error(
        maximumAttempts > 1
          ? `Controlled batch duration must be ${MINIMUM_DURATION_MINUTES}–${MAXIMUM_BATCH_DURATION_MINUTES} whole minutes.`
          : `One-shot duration must be ${MINIMUM_DURATION_MINUTES}–${MAXIMUM_DURATION_MINUTES} whole minutes.`,
      );
    }

    if (
      maximumAttempts !== 1 &&
      maximumAttempts !== LEGACY_BATCH_ATTEMPTS &&
      maximumAttempts !== MAXIMUM_BATCH_ATTEMPTS
    ) {
      throw new Error("Tiny-LIVE pre-arm supports only 1, 2 or 10 controlled attempts.");
    }

    if (
      !Number.isSafeInteger(capitalPerLegInr) ||
      capitalPerLegInr < 100 ||
      capitalPerLegInr > 500
    ) {
      throw new Error("Active Tiny-LIVE capital must remain inside the hard ₹100–₹500 per-leg range.");
    }

    if (!market.endsWith("USDT") || market.length < 7 || market.length > 24) {
      throw new Error("The pre-armed lane requires an exact audited USDT spot market.");
    }

    if (buyExchange === sellExchange) {
      throw new Error("BUY and SELL exchanges must be different.");
    }

    if (!isExactStrategyOnePilotRoute({market, buyExchange, sellExchange})) {
      throw new Error("The requested one-shot route is not an explicitly audited Strategy #1 lane.");
    }

    if (input.confirmation.trim() !== requiredArmPhrase) {
      throw new Error(`Exact pre-arm confirmation is required: ${requiredArmPhrase}`);
    }

    const action = this.dependencies.getActionDiagnostics(now);

    if (action.blockingAuthorityPresent) {
      throw new Error("An existing Tiny-LIVE authority or unresolved attempt blocks pre-arming.");
    }

    if (action.attemptsToday >= action.maximumDailyAttempts) {
      throw new Error("Tiny-LIVE daily attempt cap is exhausted.");
    }

    if (action.attemptsToday + maximumAttempts > action.maximumDailyAttempts) {
      throw new Error("Requested Tiny-LIVE batch exceeds the remaining daily attempt cap.");
    }

    const route = {market, buyExchange, sellExchange};
    const calibration = this.dependencies.getCalibration({...route, now});

    if (!calibration) {
      throw new Error("A current explicitly approved timing calibration is required for this exact route.");
    }

    if (
      calibration.scope === "BOOTSTRAP_FIRST_TINY_LIVE_ATTEMPT" &&
      action.attemptsToday > 0
    ) {
      throw new Error("Bootstrap calibration permits only the first Tiny-LIVE attempt.");
    }

    if (
      maximumAttempts === LEGACY_BATCH_ATTEMPTS &&
      calibration.scope !== "BOOTSTRAP_CONTROLLED_TWO_ATTEMPT_BATCH" &&
      calibration.scope !== "CONTINUOUS_TINY_LIVE"
    ) {
      throw new Error(
        "A current explicitly approved controlled-two-attempt or continuous timing calibration is required.",
      );
    }

    if (
      maximumAttempts === MAXIMUM_BATCH_ATTEMPTS &&
      calibration.scope !== "CONTINUOUS_TINY_LIVE"
    ) {
      throw new Error(
        "A 10-attempt batch requires a current CONTINUOUS_TINY_LIVE timing calibration backed by authenticated private-fill timing evidence.",
      );
    }

    for (const venue of [buyExchange, sellExchange]) {
      const contract = this.dependencies.getVenueContract(venue, route, now);

      if (!isStrategyOneVenueOrderContractReady(contract)) {
        throw new Error(`${venue} time-in-force/private-fill/timing contract is not ready.`);
      }
    }

    const expiresAt = now + durationMinutes * 60_000;
    const id = `tiny-live-prearm-${hash({
      route,
      capitalPerLegInr,
      calibrationId: calibration.id,
      maximumAttempts,
      armedAt: now,
      expiresAt,
    }).slice(0, 32)}`;
    const record = freeze({
      schemaVersion: maximumAttempts === 1
        ? "125.0" as const
        : maximumAttempts === LEGACY_BATCH_ATTEMPTS
          ? "150.0" as const
          : "182.0" as const,
      id,
      state: "ARMED" as const,
      ...route,
      capitalPerLegInr,
      requiredArmPhrase,
      armedAt: now,
      expiresAt,
      claimedAt: null,
      opportunityId: null,
      authorityId: null,
      completedAt: null,
      executionStatus: null,
      failureReason: null,
      automaticRetryAllowed: false as const,
      automaticFundMovementAllowed: false as const,
      maximumAttempts,
      attemptsUsed: 0,
      attempts: [],
      nextAttemptNotBefore: null,
      routeScope: "EXACT_ROUTE" as const,
    });

    this.persist(record);
    return clone(record);
  }

  disarm(
    idValue: string,
    confirmationValue: string,
    now = this.dependencies.now(),
  ): StrategyOneTinyLivePreArmRecord {
    validateTime(now);
    this.expireActiveArm(now);
    const current = this.require(idValue, "ARMED");

    if (confirmationValue.trim() !== `DISARM ${current.id}`) {
      throw new Error(`Exact disarm confirmation is required: DISARM ${current.id}`);
    }

    const record = freeze({
      ...clone(current),
      state: "DISARMED" as const,
      completedAt: now,
      failureReason: "Operator disarmed the unused one-shot authority.",
    });

    this.persist(record);
    return clone(record);
  }

  async observeSnapshot(
    snapshot: OpportunitySnapshot,
  ): Promise<StrategyOneTinyLivePreArmRecord | null> {
    const observedAt = this.dependencies.now();
    const arm = this.getActiveArm(observedAt);

    if (
      !arm ||
      this.triggerInProgress ||
      observedAt < this.nextEvaluationAt ||
      observedAt < (arm.nextAttemptNotBefore ?? 0) ||
      !this.dependencies.runtimeGateEnabled()
    ) {
      return null;
    }

    const opportunities = snapshot.opportunities
      .filter((item) =>
        routeMatches(arm, item) &&
        item.decision === "EXECUTE" &&
        !(arm.attempts ?? []).some((attempt) => attempt.opportunityId === item.id))
      .sort((first, second) =>
        second.netProfitPercent - first.netProfitPercent);

    if (opportunities.length === 0) {
      return null;
    }

    this.triggerInProgress = true;

    try {
      for (const opportunity of opportunities) {
        const result = await this.trigger(arm, opportunity);

        if (result || this.activeArmId === null) {
          return result;
        }
      }

      return null;
    } finally {
      this.triggerInProgress = false;
    }
  }

  getActiveArm(now = this.dependencies.now()): StrategyOneTinyLivePreArmRecord | null {
    validateTime(now);
    this.expireActiveArm(now);

    if (this.activeArmId === null) {
      return null;
    }

    const active = this.latest.get(this.activeArmId);
    return active?.state === "ARMED" ? clone(active) : null;
  }

  getRecord(
    idValue:
      string,
    now =
      this.dependencies.now(),
  ): StrategyOneTinyLivePreArmRecord | null {
    validateTime(
      now,
    );
    this.expireActiveArm(
      now,
    );

    const record =
      this.latest
        .get(
          idValue
            .trim(),
        );

    return record
      ? clone(
          record,
        )
      : null;
  }

  getDiagnostics(now = this.dependencies.now()) {
    validateTime(now);
    const activeArm = this.getActiveArm(now);
    const records = [...this.latest.values()]
      .sort((first, second) => second.armedAt - first.armedAt)
      .slice(0, 20)
      .map(clone);

    return freeze({
      schemaVersion: "125.0" as const,
      generatedAt: now,
      runtimeGateEnabled: this.dependencies.runtimeGateEnabled(),
      activeArm,
      triggerInProgress: this.triggerInProgress,
      lastEvaluation: this.lastEvaluation ? clone(this.lastEvaluation) : null,
      pipelineTelemetry: {
        candidatesEvaluated: this.candidatesEvaluated,
        preflightBlocks: this.preflightBlocks,
        refreshesRequested: this.refreshesRequested,
        refreshesRecovered: this.refreshesRecovered,
        coordinatorStarts: this.coordinatorStarts,
      },
      records,
      actionTimeBookRefresh:
        strategyOneActionTimeBookRefreshService.getDiagnostics(),
      persistence: this.store.getDiagnostics(),
      limits: {
        minimumDurationMinutes: MINIMUM_DURATION_MINUTES,
        defaultDurationMinutes: DEFAULT_DURATION_MINUTES,
        maximumDurationMinutes: MAXIMUM_DURATION_MINUTES,
        maximumBatchDurationMinutes: MAXIMUM_BATCH_DURATION_MINUTES,
        maximumCapitalPerLegInr: 500,
        maximumAttemptsPerArm: MAXIMUM_BATCH_ATTEMPTS,
      },
      routePool: STRATEGY_ONE_TINY_LIVE_ROUTE_POOL_POLICY,
      pilotBasket: null,
      safety: {
        exactRouteBound: true,
        freshActionTimePreflightRequired: true,
        durableClaimBeforeOrderAuthority: true,
        existingCoordinatorOnly: true,
        automaticRetryAllowed: false,
        automaticFundMovementAllowed: false,
        withdrawalAllowed: false,
      },
    });
  }

  static requiredArmPhrase(input: {
    market: string;
    buyExchange: string;
    sellExchange: string;
    capitalPerLegInr: number;
    maximumAttempts?: 1 | 2 | 9 | 10;
    durationMinutes?: number;
  }): string {
    return armPhrase({
      market: normalizeMarket(input.market),
      buyExchange: normalizePilotExchange(input.buyExchange),
      sellExchange: normalizePilotExchange(input.sellExchange),
      capitalPerLegInr: input.capitalPerLegInr,
      maximumAttempts: input.maximumAttempts ?? 1,
      durationMinutes: input.durationMinutes ?? DEFAULT_DURATION_MINUTES,
    });
  }

  static requiredBasketArmPhrase(): string {
    return dynamicPoolArmPhrase();
  }

  static requiredRoutePoolArmPhrase(
    maximumAttempts: 9 | 10 = STRATEGY_ONE_TINY_LIVE_ROUTE_POOL_POLICY.maximumAttempts,
  ): string {
    return dynamicPoolArmPhrase(maximumAttempts);
  }

  private armDynamicPool(
    input: StrategyOneTinyLivePreArmRequest,
  ): StrategyOneTinyLivePreArmRecord {
    const now = input.now ?? this.dependencies.now();
    validateTime(now);
    this.expireActiveArm(now);

    const policy = STRATEGY_ONE_TINY_LIVE_ROUTE_POOL_POLICY;
    const durationMinutes = input.durationMinutes ?? policy.durationMinutes;
    const maximumAttempts = input.maximumAttempts ?? policy.maximumAttempts;
    const capitalPerLegInr = this.dependencies.getCapitalPerLegInr();

    if (input.routePoolId?.trim() !== policy.id) {
      throw new Error("Unknown Strategy #1 dynamic route-pool policy.");
    }

    if (!this.dependencies.runtimeGateEnabled()) {
      throw new Error("Strategy #1 Tiny-LIVE runtime gate is disabled; route-pool pre-arm was not created.");
    }

    if (this.activeArmId !== null) {
      throw new Error("Another Strategy #1 Tiny-LIVE pre-arm is already active.");
    }

    if (
      durationMinutes !== policy.durationMinutes ||
      (
        maximumAttempts !== REDUCED_DYNAMIC_POOL_ATTEMPTS &&
        maximumAttempts !== policy.maximumAttempts
      )
    ) {
      throw new Error("The dynamic route pool supports only 9 or 10 attempts over exactly 180 minutes.");
    }

    const requiredArmPhrase = dynamicPoolArmPhrase(maximumAttempts);

    if (capitalPerLegInr !== policy.capitalPerLegInr) {
      throw new Error(
        `The dynamic route pool requires the active policy capital to remain exactly ₹${policy.capitalPerLegInr}/leg so venue minimums are not bypassed.`,
      );
    }

    if (input.confirmation.trim() !== requiredArmPhrase) {
      throw new Error(`Exact route-pool confirmation is required: ${requiredArmPhrase}`);
    }

    const action = this.dependencies.getActionDiagnostics(now);

    if (action.blockingAuthorityPresent) {
      throw new Error("An existing Tiny-LIVE authority or unresolved attempt blocks route-pool pre-arming.");
    }

    if (action.attemptsToday + maximumAttempts > action.maximumDailyAttempts) {
      throw new Error(
        `The ${maximumAttempts}-attempt route pool exceeds the remaining Tiny-LIVE daily attempt cap.`,
      );
    }

    const expiresAt = now + policy.durationMinutes * 60_000;
    const id = `tiny-live-prearm-${hash({
      routePoolId: policy.id,
      capitalPerLegInr,
      maximumAttempts,
      armedAt: now,
      expiresAt,
    }).slice(0, 32)}`;
    const record = freeze({
      schemaVersion: "188.0" as const,
      id,
      state: "ARMED" as const,
      market: "DYNAMIC_POOL",
      buyExchange: "coindcx" as const,
      sellExchange: "binance" as const,
      capitalPerLegInr,
      requiredArmPhrase,
      armedAt: now,
      expiresAt,
      claimedAt: null,
      opportunityId: null,
      authorityId: null,
      completedAt: null,
      executionStatus: null,
      failureReason: null,
      automaticRetryAllowed: false as const,
      automaticFundMovementAllowed: false as const,
      maximumAttempts,
      attemptsUsed: 0,
      attempts: [],
      nextAttemptNotBefore: null,
      routeScope: "DYNAMIC_POOL" as const,
      routePoolId: policy.id,
    });

    this.persist(record);
    return clone(record);
  }

  private async trigger(
    armSnapshot: StrategyOneTinyLivePreArmRecord,
    candidate: ArbitrageOpportunity,
  ): Promise<StrategyOneTinyLivePreArmRecord | null> {
    let evaluatedAt = this.dependencies.now();
    let active = this.getActiveArm(evaluatedAt);
    let actionCandidate = candidate;

    if (!active || active.id !== armSnapshot.id || !routeMatches(active, candidate)) {
      return null;
    }

    this.candidatesEvaluated += 1;

    let preview: StrategyOneTinyLivePreview;

    try {
      preview = this.dependencies.previewAction(actionCandidate.id, evaluatedAt);
    } catch (error: unknown) {
      this.recordBlocked(actionCandidate.id, evaluatedAt, message(error));
      return null;
    }

    if (
      !preview.approvedForAuthorization &&
      shouldRefreshActionBooks(
        preview,
        active,
        actionCandidate,
      )
    ) {
      this.refreshesRequested += 1;
      let refresh:
        StrategyOneActionTimeBookRefreshResult;

      try {
        refresh =
          await this.dependencies
            .refreshActionCandidate({
              market:
                normalizeMarket(actionCandidate.pair.market),
              buyExchange:
                actionCandidate.pair.buy.exchange,
              sellExchange:
                actionCandidate.pair.sell.exchange,
            });
      } catch (
        error:
          unknown
      ) {
        evaluatedAt =
          this.dependencies
            .now();

        this.recordBlocked(
          actionCandidate.id,
          evaluatedAt,
          `ACTION_TIME_BOOK_REFRESH: ${message(error)}`,
        );

        return null;
      }

      evaluatedAt =
        this.dependencies
          .now();

      active =
        this.getActiveArm(
          evaluatedAt,
        );

      if (
        !active ||
        active.id !==
          armSnapshot.id
      ) {
        return null;
      }

      if (
        refresh.state !==
          "REFRESHED" ||
        !refresh.opportunity ||
        !routeMatches(
          active,
          refresh.opportunity,
        )
      ) {
        this.recordBlocked(
          actionCandidate.id,
          evaluatedAt,
          `ACTION_TIME_BOOK_REFRESH: ${refresh.blocker ?? "Fresh exact-route opportunity is unavailable."}`,
        );

        return null;
      }

      actionCandidate =
        refresh.opportunity;
      this.refreshesRecovered += 1;

      try {
        preview =
          this.dependencies
            .previewAction(
              actionCandidate.id,
              evaluatedAt,
            );
      } catch (
        error:
          unknown
      ) {
        this.recordBlocked(
          actionCandidate.id,
          evaluatedAt,
          `POST_REFRESH_PREFLIGHT: ${message(error)}`,
        );

        return null;
      }
    }

    const authority = preview.authority;

    if (!preview.approvedForAuthorization || !authority) {
      this.recordBlocked(
        actionCandidate.id,
        evaluatedAt,
        preview.blockers[0] ?? "Fresh action-time preflight blocked the route.",
      );
      return null;
    }

    if (
      !armAllowsRoute(active, {
        market: authority.market,
        buyExchange: authority.buyExchange,
        sellExchange: authority.sellExchange,
      }) ||
      authority.capitalPerLegInr !== active.capitalPerLegInr
    ) {
      this.recordBlocked(
        actionCandidate.id,
        evaluatedAt,
        "Fresh authority did not preserve the exact pre-armed route and capital.",
      );
      return null;
    }

    const currentOpportunity = this.dependencies.getOpportunity(actionCandidate.id);

    if (!currentOpportunity || !routeMatches(active, currentOpportunity)) {
      this.recordBlocked(
        actionCandidate.id,
        evaluatedAt,
        "The exact opportunity expired before durable pre-arm claim.",
      );
      return null;
    }

    const attemptNumber = Math.min(
      active.maximumAttempts,
      getAttemptsUsed(active) + 1,
    );

    const claimed = freeze({
      ...clone(active),
      state: "CLAIMED" as const,
      claimedAt: evaluatedAt,
      opportunityId: actionCandidate.id,
      authorityId: authority.id,
    });

    // This durable transition removes the arm before the three-second order
    // authority is minted. Every later failure is therefore fail-safe/no-retry.
    this.persist(claimed);
    this.lastEvaluation = freeze({
      evaluatedAt,
      opportunityId: actionCandidate.id,
      outcome: "CLAIMED" as const,
      reason: `Attempt ${attemptNumber}/${active.maximumAttempts} claimed durably before order authority.`,
    });

    try {
      const authorized = this.dependencies.authorizeAction(
        authority.id,
        authority.requiredAuthorizationPhrase,
        this.dependencies.now(),
      );

      if (authorized.state !== "AUTHORIZED") {
        throw new Error("Exact one-time action authority was not authorized.");
      }

      const finalBookRefresh =
        await this.dependencies
          .refreshAuthorizedFinalBooks({
            market:
              authority.market,
            buyExchange:
              authority.buyExchange,
            sellExchange:
              authority.sellExchange,
          });

      if (
        finalBookRefresh.state !==
          "REFRESHED"
      ) {
        throw new Error(
          `AUTHORIZED_FINAL_BOOK_REFRESH: ${finalBookRefresh.blocker ?? "Fresh public depth is unavailable."}`,
        );
      }

      this.coordinatorStarts += 1;
      const result = await this.dependencies.execute(currentOpportunity, authorized.id);
      const completedAt = this.dependencies.now();
      const attempt = summarizeAttempt({
        attemptNumber,
        opportunityId: actionCandidate.id,
        authorityId: authorized.id,
        claimedAt: evaluatedAt,
        completedAt,
        result,
      });
      const attempts = [
        ...(claimed.attempts ?? []),
        attempt,
      ];
      const cleanCompletion = isCleanCompletion(result);
      const hasAnotherAuthorizedSlot =
        cleanCompletion &&
        attemptNumber < claimed.maximumAttempts &&
        completedAt + BETWEEN_ATTEMPTS_COOLDOWN_MS < claimed.expiresAt;

      if (hasAnotherAuthorizedSlot) {
        const resumed = freeze({
          ...clone(claimed),
          state: "ARMED" as const,
          claimedAt: null,
          opportunityId: null,
          authorityId: null,
          completedAt: null,
          executionStatus: null,
          failureReason: null,
          attemptsUsed: attemptNumber,
          attempts,
          nextAttemptNotBefore: completedAt + BETWEEN_ATTEMPTS_COOLDOWN_MS,
        });

        this.persist(resumed);
        this.lastEvaluation = freeze({
          evaluatedAt: completedAt,
          opportunityId: actionCandidate.id,
          outcome: "COMPLETED" as const,
          reason: `Attempt ${attemptNumber}/${claimed.maximumAttempts} completed cleanly; the independent next slot becomes eligible after the durable cooldown.`,
        });

        return clone(resumed);
      }

      const completed = freeze({
        ...clone(claimed),
        state: cleanCompletion ? "COMPLETED" as const : "FAILED_SAFE" as const,
        completedAt,
        executionStatus: result.status,
        failureReason: cleanCompletion
          ? null
          : result.reasons[0] ?? `Coordinator ended with ${result.status}.`,
        attemptsUsed: attemptNumber,
        attempts,
        nextAttemptNotBefore: null,
      });

      this.persist(completed);
      this.lastEvaluation = freeze({
        evaluatedAt: completedAt,
        opportunityId: actionCandidate.id,
        outcome: cleanCompletion ? "COMPLETED" as const : "FAILED_SAFE" as const,
        reason: cleanCompletion
          ? `Attempt ${attemptNumber}/${claimed.maximumAttempts} completed cleanly; batch is terminal.`
          : `Attempt ${attemptNumber}/${claimed.maximumAttempts} ended ${result.status}; remaining slots were cancelled and no automatic retry is permitted.`,
      });
      return clone(completed);
    } catch (error: unknown) {
      const failedAt = this.dependencies.now();
      const attempts = [
        ...(claimed.attempts ?? []),
        summarizeFailedAttempt({
          attemptNumber,
          opportunityId: actionCandidate.id,
          authorityId: authority.id,
          claimedAt: evaluatedAt,
          completedAt: failedAt,
          reason: message(error),
          market: normalizeMarket(actionCandidate.pair.market),
          buyExchange: actionCandidate.pair.buy.exchange,
          sellExchange: actionCandidate.pair.sell.exchange,
        }),
      ];
      const failed = freeze({
        ...clone(claimed),
        state: "FAILED_SAFE" as const,
        completedAt: failedAt,
        failureReason: message(error),
        attemptsUsed: attemptNumber,
        attempts,
        nextAttemptNotBefore: null,
      });

      this.persist(failed);
      this.lastEvaluation = freeze({
        evaluatedAt: failedAt,
        opportunityId: actionCandidate.id,
        outcome: "FAILED_SAFE" as const,
        reason: `Attempt ${attemptNumber}/${claimed.maximumAttempts} failed safely: ${message(error)} Remaining slots were cancelled; no automatic retry is permitted.`,
      });
      return clone(failed);
    }
  }

  private recordBlocked(opportunityId: string, evaluatedAt: number, reason: string): void {
    this.preflightBlocks += 1;
    this.nextEvaluationAt = evaluatedAt + BLOCKED_REEVALUATION_INTERVAL_MS;
    this.lastEvaluation = freeze({
      evaluatedAt,
      opportunityId,
      outcome: "BLOCKED" as const,
      reason,
    });
  }

  private expireActiveArm(now: number): void {
    if (this.activeArmId === null) {
      return;
    }

    const current = this.latest.get(this.activeArmId);

    if (!current || current.state !== "ARMED") {
      this.activeArmId = null;
      return;
    }

    if (current.expiresAt >= now) {
      return;
    }

    this.persist(freeze({
      ...clone(current),
      state: "EXPIRED" as const,
      completedAt: now,
      failureReason: "Unused one-shot pre-arm expired.",
    }));
  }

  private require(
    idValue: string,
    state: StrategyOneTinyLivePreArmState,
  ): StrategyOneTinyLivePreArmRecord {
    const record = this.latest.get(idValue.trim());

    if (!record || record.state !== state) {
      throw new Error(`Tiny-LIVE pre-arm must be in ${state} state.`);
    }

    return record;
  }

  private persist(record: StrategyOneTinyLivePreArmRecord): void {
    this.store.append(record);
    this.latest.set(record.id, freeze(clone(record)));
    this.activeArmId = record.state === "ARMED" ? record.id :
      this.activeArmId === record.id ? null : this.activeArmId;
  }
}

function routeMatches(
  arm: StrategyOneTinyLivePreArmRecord,
  opportunity: ArbitrageOpportunity,
): boolean {
  return armAllowsRoute(arm, {
    market: opportunity.pair.market,
    buyExchange: opportunity.pair.buy.exchange,
    sellExchange: opportunity.pair.sell.exchange,
  });
}

function armAllowsRoute(
  arm: StrategyOneTinyLivePreArmRecord,
  route: {
    readonly market: string;
    readonly buyExchange: string;
    readonly sellExchange: string;
  },
): boolean {
  if (arm.routeScope === "DYNAMIC_POOL") {
    return arm.routePoolId === STRATEGY_ONE_TINY_LIVE_ROUTE_POOL_ID &&
      isStrategyOneTinyLiveDynamicRoute(route);
  }

  return arm.market === normalizeMarket(route.market) &&
    arm.buyExchange === route.buyExchange.trim().toLowerCase() &&
    arm.sellExchange === route.sellExchange.trim().toLowerCase();
}

function shouldRefreshActionBooks(
  preview:
    StrategyOneTinyLivePreview,
  arm:
    StrategyOneTinyLivePreArmRecord,
  candidate:
    ArbitrageOpportunity,
): boolean {
  const route = {
    market: normalizeMarket(candidate.pair.market),
    buyExchange: candidate.pair.buy.exchange.trim().toLowerCase(),
    sellExchange: candidate.pair.sell.exchange.trim().toLowerCase(),
  };

  if (
    !armAllowsRoute(arm, route) ||
    !isStrategyOneTinyLiveDynamicRoute(route)
  ) {
    return false;
  }

  const selected =
    preview.preflight
      ?.preview
      .selected ??
    null;

  if (
    !selected ||
    selected.market !==
      route.market ||
    selected.buyExchange !==
      route.buyExchange ||
    selected.sellExchange !==
      route.sellExchange
  ) {
    return false;
  }

  const freshness =
    selected.checks
      .find(
        (
          check,
        ) =>
          check.key ===
          "CURRENT_DISPATCH_RESERVED_FRESHNESS",
      );

  const fundingRulesRefreshable =
    selected.funding.fundingBoundary ===
      "AUTHENTICATED_LIVE_READINESS" &&
    selected.funding.buyFunding.sufficient &&
    selected.funding.sellFunding.sufficient &&
    selected.funding.quantityNeverIncreased &&
    selected.funding.quantityNormalization?.state ===
      "BLOCKED" &&
    selected.funding.quantityNormalization.incrementEvidenceComplete;

  return (
    freshness?.state ===
      "BLOCKED" &&
    selected.checks
      .every(
        (
          check,
        ) =>
          check.state ===
            "PASS" ||
          check.key ===
            "CURRENT_DISPATCH_RESERVED_FRESHNESS" ||
          check.key ===
            "POST_STRESS_DEPTH_AND_ECONOMICS" ||
          (
            check.key ===
              "FRESH_TWO_LEG_FUNDING_AND_RULES" &&
            fundingRulesRefreshable
          ),
      )
  );
}

function armPhrase(input: {
  market: string;
  buyExchange: StrategyOnePilotExchange;
  sellExchange: StrategyOnePilotExchange;
  capitalPerLegInr: number;
  maximumAttempts: 1 | 2 | 9 | 10;
  durationMinutes: number;
}): string {
  if (input.maximumAttempts === 1) {
    return `ARM ONE-SHOT ${input.market} ${input.buyExchange.toUpperCase()} ${input.sellExchange.toUpperCase()} INR${input.capitalPerLegInr}`;
  }

  const label = input.maximumAttempts === LEGACY_BATCH_ATTEMPTS
    ? "TWO-SLOT"
    : "TEN-SLOT";
  return `ARM ${label} ${input.market} ${input.buyExchange.toUpperCase()} ${input.sellExchange.toUpperCase()} INR${input.capitalPerLegInr} ATTEMPTS${input.maximumAttempts} MINUTES${input.durationMinutes}`;
}

function dynamicPoolArmPhrase(
  maximumAttempts: 9 | 10 = STRATEGY_ONE_TINY_LIVE_ROUTE_POOL_POLICY.maximumAttempts,
): string {
  const policy = STRATEGY_ONE_TINY_LIVE_ROUTE_POOL_POLICY;
  return `ARM DYNAMIC-POOL USDT INR${policy.capitalPerLegInr} ATTEMPTS${maximumAttempts} MINUTES${policy.durationMinutes}`;
}

function getAttemptsUsed(record: StrategyOneTinyLivePreArmRecord): number {
  return record.attemptsUsed ?? record.attempts?.length ?? (
    record.state === "CLAIMED" ||
    record.state === "COMPLETED" ||
    record.state === "FAILED_SAFE"
      ? 1
      : 0
  );
}

function isCleanCompletion(result: ArbitrageLiveExecutionResult): boolean {
  return result.success &&
    result.status === "COMPLETED" &&
    !result.recoveryRequired &&
    result.possibleExposure !== true &&
    result.unmatchedBuyQuantity === 0 &&
    result.unmatchedSellQuantity === 0;
}

function summarizeAttempt(input: {
  attemptNumber: number;
  opportunityId: string;
  authorityId: string;
  claimedAt: number;
  completedAt: number;
  result: ArbitrageLiveExecutionResult;
}): StrategyOneTinyLivePreArmAttempt {
  const reasons = input.result.reasons.length > 0
    ? [...input.result.reasons]
    : [
        isCleanCompletion(input.result)
          ? "Both exact legs completed with balanced terminal evidence."
          : `Coordinator ended with ${input.result.status}.`,
      ];
  const reason = reasons[0];

  if (reason === undefined) {
    throw new Error("Tiny-LIVE attempt summary requires durable reason evidence.");
  }

  return freeze({
    attemptNumber: input.attemptNumber,
    opportunityId: input.opportunityId,
    authorityId: input.authorityId,
    claimedAt: input.claimedAt,
    completedAt: input.completedAt,
    executionStatus: input.result.status,
    success: isCleanCompletion(input.result),
    requestedQuantity: input.result.requestedQuantity,
    matchedFilledQuantity: input.result.matchedFilledQuantity,
    unmatchedBuyQuantity: input.result.unmatchedBuyQuantity,
    unmatchedSellQuantity: input.result.unmatchedSellQuantity,
    executionTimeMs: input.result.executionTimeMs,
    buyStatus: input.result.buyResult?.status ?? null,
    sellStatus: input.result.sellResult?.status ?? null,
    reason,
    reasons,
    recoveryRequired: input.result.recoveryRequired,
    possibleExposure: input.result.possibleExposure === true,
    market: input.result.market,
    buyExchange: input.result.buyExchange,
    sellExchange: input.result.sellExchange,
  });
}

function summarizeFailedAttempt(input: {
  attemptNumber: number;
  opportunityId: string;
  authorityId: string | null;
  claimedAt: number;
  completedAt: number;
  reason: string;
  market: string;
  buyExchange: string;
  sellExchange: string;
}): StrategyOneTinyLivePreArmAttempt {
  return freeze({
    attemptNumber: input.attemptNumber,
    opportunityId: input.opportunityId,
    authorityId: input.authorityId,
    claimedAt: input.claimedAt,
    completedAt: input.completedAt,
    executionStatus: "FAILED_SAFE" as const,
    success: false,
    requestedQuantity: null,
    matchedFilledQuantity: null,
    unmatchedBuyQuantity: null,
    unmatchedSellQuantity: null,
    executionTimeMs: null,
    buyStatus: null,
    sellStatus: null,
    reason: input.reason,
    reasons: [input.reason],
    recoveryRequired: false,
    possibleExposure: false,
    market: input.market,
    buyExchange: input.buyExchange,
    sellExchange: input.sellExchange,
  });
}

function normalizeMarket(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/gu, "");
}

function normalizePilotExchange(value: string): StrategyOnePilotExchange {
  const normalized = value.trim().toLowerCase();

  if (normalized !== "binance" && normalized !== "bybit" && normalized !== "coindcx") {
    throw new Error("One-shot Tiny-LIVE venue is not an audited Strategy #1 venue.");
  }

  return normalized;
}

function isPreArmRecord(value: unknown): value is StrategyOneTinyLivePreArmRecord {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const item = value as Partial<StrategyOneTinyLivePreArmRecord>;
  const states: readonly StrategyOneTinyLivePreArmState[] = [
    "ARMED",
    "CLAIMED",
    "COMPLETED",
    "FAILED_SAFE",
    "DISARMED",
    "EXPIRED",
  ];

  const legacy = item.schemaVersion === "125.0";
  const batch = item.schemaVersion === "150.0";
  const tenAttemptBatch = item.schemaVersion === "182.0";
  const dynamicPoolBatch = item.schemaVersion === "188.0";
  const attempts = item.attempts ?? [];
  const attemptsUsed = item.attemptsUsed ?? (legacy ? undefined : 0);

  const exactRouteRecord = (item.routeScope === undefined || item.routeScope === "EXACT_ROUTE") &&
    typeof item.market === "string" && item.market.endsWith("USDT") &&
    (item.buyExchange === "binance" || item.buyExchange === "bybit" || item.buyExchange === "coindcx") &&
    (item.sellExchange === "binance" || item.sellExchange === "bybit" || item.sellExchange === "coindcx") &&
    isExactStrategyOnePilotRoute({
      market: item.market,
      buyExchange: item.buyExchange,
      sellExchange: item.sellExchange,
    });
  const dynamicPoolRecord = dynamicPoolBatch &&
    item.routeScope === "DYNAMIC_POOL" &&
    item.routePoolId === STRATEGY_ONE_TINY_LIVE_ROUTE_POOL_ID &&
    item.market === "DYNAMIC_POOL" &&
    item.buyExchange === "coindcx" &&
    item.sellExchange === "binance";

  return (legacy || batch || tenAttemptBatch || dynamicPoolBatch) &&
    typeof item.id === "string" && item.id.startsWith("tiny-live-prearm-") &&
    states.includes(item.state as StrategyOneTinyLivePreArmState) &&
    (exactRouteRecord || dynamicPoolRecord) &&
    item.buyExchange !== item.sellExchange &&
    Number.isSafeInteger(item.capitalPerLegInr) &&
    (item.capitalPerLegInr ?? 0) >= 100 &&
    (item.capitalPerLegInr ?? 0) <= 500 &&
    typeof item.requiredArmPhrase === "string" &&
    isPositiveTime(item.armedAt) &&
    isPositiveTime(item.expiresAt) &&
    (item.claimedAt === null || isPositiveTime(item.claimedAt)) &&
    (item.completedAt === null || isPositiveTime(item.completedAt)) &&
    (item.opportunityId === null || typeof item.opportunityId === "string") &&
    (item.authorityId === null || typeof item.authorityId === "string") &&
    (item.executionStatus === null || typeof item.executionStatus === "string") &&
    (item.failureReason === null || typeof item.failureReason === "string") &&
    item.automaticRetryAllowed === false &&
    item.automaticFundMovementAllowed === false &&
    (
      item.maximumAttempts === 1 ||
      item.maximumAttempts === 2 ||
      item.maximumAttempts === 9 ||
      item.maximumAttempts === 10
    ) &&
    (legacy
      ? item.maximumAttempts === 1
      : (
        batch
          ? item.maximumAttempts === LEGACY_BATCH_ATTEMPTS
          : tenAttemptBatch
            ? item.maximumAttempts === MAXIMUM_BATCH_ATTEMPTS
            : dynamicPoolBatch && (
              item.maximumAttempts === REDUCED_DYNAMIC_POOL_ATTEMPTS ||
              item.maximumAttempts === MAXIMUM_BATCH_ATTEMPTS
            )
      ) &&
        Number.isSafeInteger(attemptsUsed) &&
        (attemptsUsed ?? -1) >= 0 &&
        (attemptsUsed ?? ((item.maximumAttempts ?? 0) + 1)) <= item.maximumAttempts &&
        Array.isArray(attempts) &&
        attempts.length === attemptsUsed &&
        attempts.every((attempt, index) =>
          isPreArmAttempt(attempt) && attempt.attemptNumber === index + 1) &&
        (item.nextAttemptNotBefore === null || isPositiveTime(item.nextAttemptNotBefore)));
}

function isPreArmAttempt(value: unknown): value is StrategyOneTinyLivePreArmAttempt {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const item = value as Partial<StrategyOneTinyLivePreArmAttempt>;
  return Number.isSafeInteger(item.attemptNumber) &&
    (item.attemptNumber ?? 0) >= 1 &&
    (item.attemptNumber ?? 11) <= MAXIMUM_BATCH_ATTEMPTS &&
    typeof item.opportunityId === "string" &&
    (item.authorityId === null || typeof item.authorityId === "string") &&
    isPositiveTime(item.claimedAt) &&
    isPositiveTime(item.completedAt) &&
    typeof item.executionStatus === "string" &&
    typeof item.success === "boolean" &&
    nullableFinite(item.requestedQuantity) &&
    nullableFinite(item.matchedFilledQuantity) &&
    nullableFinite(item.unmatchedBuyQuantity) &&
    nullableFinite(item.unmatchedSellQuantity) &&
    nullableFinite(item.executionTimeMs) &&
    (item.buyStatus === null || typeof item.buyStatus === "string") &&
    (item.sellStatus === null || typeof item.sellStatus === "string") &&
    typeof item.reason === "string" &&
    (
      item.reasons === undefined ||
      (
        Array.isArray(item.reasons) &&
        item.reasons.length >= 1 &&
        item.reasons.every((reason) => typeof reason === "string" && reason.length > 0) &&
        item.reasons[0] === item.reason
      )
    ) &&
    typeof item.recoveryRequired === "boolean" &&
    typeof item.possibleExposure === "boolean";
}

function nullableFinite(value: unknown): boolean {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function isValidTransition(
  previous: StrategyOneTinyLivePreArmRecord | null,
  next: StrategyOneTinyLivePreArmRecord,
): boolean {
  if (!previous) {
    return next.state === "ARMED" &&
      next.claimedAt === null &&
      next.opportunityId === null &&
      next.authorityId === null &&
      next.completedAt === null;
  }

  const immutableMatch =
    previous.id === next.id &&
    previous.market === next.market &&
    previous.buyExchange === next.buyExchange &&
    previous.sellExchange === next.sellExchange &&
    previous.capitalPerLegInr === next.capitalPerLegInr &&
    previous.requiredArmPhrase === next.requiredArmPhrase &&
    previous.maximumAttempts === next.maximumAttempts &&
    previous.routeScope === next.routeScope &&
    previous.routePoolId === next.routePoolId &&
    previous.schemaVersion === next.schemaVersion &&
    previous.armedAt === next.armedAt &&
    previous.expiresAt === next.expiresAt;

  if (!immutableMatch) {
    return false;
  }

  const allowed: Record<StrategyOneTinyLivePreArmState, readonly StrategyOneTinyLivePreArmState[]> = {
    ARMED: ["CLAIMED", "DISARMED", "EXPIRED"],
    CLAIMED: next.schemaVersion === "150.0" || next.schemaVersion === "182.0" || next.schemaVersion === "188.0"
      ? ["ARMED", "COMPLETED", "FAILED_SAFE"]
      : ["COMPLETED", "FAILED_SAFE"],
    COMPLETED: [],
    FAILED_SAFE: [],
    DISARMED: [],
    EXPIRED: [],
  };

  if (!allowed[previous.state].includes(next.state)) {
    return false;
  }

  if (next.state === "CLAIMED") {
    return next.claimedAt !== null &&
      next.opportunityId !== null &&
      next.authorityId !== null &&
      next.completedAt === null &&
      getAttemptsUsed(next) === getAttemptsUsed(previous);
  }

  if (
    (next.schemaVersion === "150.0" || next.schemaVersion === "182.0" || next.schemaVersion === "188.0") &&
    previous.state === "CLAIMED"
  ) {
    const appended = next.attempts?.[next.attempts.length - 1] ?? null;
    const expectedAttemptsUsed = getAttemptsUsed(previous) + 1;

    if (
      getAttemptsUsed(next) !== expectedAttemptsUsed ||
      next.attempts?.length !== expectedAttemptsUsed ||
      !appended ||
      appended.opportunityId !== previous.opportunityId ||
      appended.authorityId !== previous.authorityId
    ) {
      return false;
    }

    if (next.state === "ARMED") {
      return appended.success &&
        next.claimedAt === null &&
        next.opportunityId === null &&
        next.authorityId === null &&
        next.completedAt === null &&
        next.nextAttemptNotBefore !== null;
    }
  }

  return next.completedAt !== null;
}

function validateTime(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("Tiny-LIVE pre-arm timestamp must be positive.");
  }
}

function isPositiveTime(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown Tiny-LIVE pre-arm failure.";
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

export const strategyOneTinyLivePreArmService =
  new StrategyOneTinyLivePreArmService();
