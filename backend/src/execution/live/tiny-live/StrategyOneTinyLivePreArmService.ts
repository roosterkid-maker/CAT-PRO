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
import type {ArbitrageLiveExecutionResult} from "../../../arbitrage/execution/models/ArbitrageLiveExecutionResult";
import {JsonlSnapshotStore} from "../../../core/persistence/JsonlSnapshotStore";
import {strategyOneExecutionPolicyService} from "../../../trading/policy/StrategyOneExecutionPolicyService";
import {strategyOneLiveVenueContractRegistry} from "../contracts/StrategyOneLiveVenueContractRegistry";
import {
  strategyOneTinyLiveActionAuthorityService,
  type StrategyOneTinyLivePreview,
} from "./StrategyOneTinyLiveActionAuthorityService";

export type StrategyOneTinyLivePreArmState =
  | "ARMED"
  | "CLAIMED"
  | "COMPLETED"
  | "FAILED_SAFE"
  | "DISARMED"
  | "EXPIRED";

export interface StrategyOneTinyLivePreArmRecord {
  readonly schemaVersion: "125.0";
  readonly id: string;
  readonly state: StrategyOneTinyLivePreArmState;
  readonly market: string;
  readonly buyExchange: "binance" | "bybit";
  readonly sellExchange: "binance" | "bybit";
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
  readonly maximumAttempts: 1;
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
  readonly now?: number;
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

    const active = [...this.latest.values()].filter((record) => record.state === "ARMED");

    if (active.length > 1) {
      throw new Error("Multiple durable Strategy #1 Tiny-LIVE pre-arms are active.");
    }

    this.activeArmId = active[0]?.id ?? null;
  }

  arm(input: StrategyOneTinyLivePreArmRequest): StrategyOneTinyLivePreArmRecord {
    const now = input.now ?? this.dependencies.now();
    validateTime(now);
    this.expireActiveArm(now);

    const market = normalizeMarket(input.market);
    const buyExchange = normalizePilotExchange(input.buyExchange);
    const sellExchange = normalizePilotExchange(input.sellExchange);
    const durationMinutes = input.durationMinutes ?? DEFAULT_DURATION_MINUTES;
    const capitalPerLegInr = this.dependencies.getCapitalPerLegInr();
    const requiredArmPhrase = armPhrase({
      market,
      buyExchange,
      sellExchange,
      capitalPerLegInr,
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
      durationMinutes > MAXIMUM_DURATION_MINUTES
    ) {
      throw new Error(
        `Pre-arm duration must be ${MINIMUM_DURATION_MINUTES}–${MAXIMUM_DURATION_MINUTES} whole minutes.`,
      );
    }

    if (
      !Number.isSafeInteger(capitalPerLegInr) ||
      capitalPerLegInr < 100 ||
      capitalPerLegInr > 500
    ) {
      throw new Error("Active Tiny-LIVE capital must remain inside the hard ₹100–₹500 per-leg range.");
    }

    if (!market.endsWith("USDT") || market.length < 7 || market.length > 24) {
      throw new Error("The first pre-armed lane requires an exact Binance/Bybit USDT spot market.");
    }

    if (buyExchange === sellExchange) {
      throw new Error("BUY and SELL exchanges must be different.");
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

    for (const venue of [buyExchange, sellExchange]) {
      const contract = this.dependencies.getVenueContract(venue, route, now);

      if (
        !contract ||
        contract.maximumOrderBookAgeMs === null ||
        !contract.supportedTimeInForce.includes("FOK") ||
        !contract.authoritativeFillConfirmationReady
      ) {
        throw new Error(`${venue} FOK/private-fill/timing contract is not ready.`);
      }
    }

    const expiresAt = now + durationMinutes * 60_000;
    const id = `tiny-live-prearm-${hash({
      route,
      capitalPerLegInr,
      calibrationId: calibration.id,
      armedAt: now,
      expiresAt,
    }).slice(0, 32)}`;
    const record = freeze({
      schemaVersion: "125.0" as const,
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
      maximumAttempts: 1 as const,
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
      !this.dependencies.runtimeGateEnabled()
    ) {
      return null;
    }

    const opportunity = snapshot.opportunities
      .filter((item) => routeMatches(arm, item) && item.decision === "EXECUTE")
      .sort((first, second) => second.netProfitPercent - first.netProfitPercent)[0];

    if (!opportunity) {
      return null;
    }

    this.triggerInProgress = true;

    try {
      return await this.trigger(arm, opportunity);
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
      records,
      persistence: this.store.getDiagnostics(),
      limits: {
        minimumDurationMinutes: MINIMUM_DURATION_MINUTES,
        defaultDurationMinutes: DEFAULT_DURATION_MINUTES,
        maximumDurationMinutes: MAXIMUM_DURATION_MINUTES,
        maximumCapitalPerLegInr: 500,
        maximumAttemptsPerArm: 1,
      },
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
  }): string {
    return armPhrase({
      market: normalizeMarket(input.market),
      buyExchange: normalizePilotExchange(input.buyExchange),
      sellExchange: normalizePilotExchange(input.sellExchange),
      capitalPerLegInr: input.capitalPerLegInr,
    });
  }

  private async trigger(
    armSnapshot: StrategyOneTinyLivePreArmRecord,
    candidate: ArbitrageOpportunity,
  ): Promise<StrategyOneTinyLivePreArmRecord | null> {
    const evaluatedAt = this.dependencies.now();
    const active = this.getActiveArm(evaluatedAt);

    if (!active || active.id !== armSnapshot.id || !routeMatches(active, candidate)) {
      return null;
    }

    let preview: StrategyOneTinyLivePreview;

    try {
      preview = this.dependencies.previewAction(candidate.id, evaluatedAt);
    } catch (error: unknown) {
      this.recordBlocked(candidate.id, evaluatedAt, message(error));
      return null;
    }

    const authority = preview.authority;

    if (!preview.approvedForAuthorization || !authority) {
      this.recordBlocked(
        candidate.id,
        evaluatedAt,
        preview.blockers[0] ?? "Fresh action-time preflight blocked the route.",
      );
      return null;
    }

    if (
      authority.market !== active.market ||
      authority.buyExchange !== active.buyExchange ||
      authority.sellExchange !== active.sellExchange ||
      authority.capitalPerLegInr !== active.capitalPerLegInr
    ) {
      this.recordBlocked(
        candidate.id,
        evaluatedAt,
        "Fresh authority did not preserve the exact pre-armed route and capital.",
      );
      return null;
    }

    const currentOpportunity = this.dependencies.getOpportunity(candidate.id);

    if (!currentOpportunity || !routeMatches(active, currentOpportunity)) {
      this.recordBlocked(
        candidate.id,
        evaluatedAt,
        "The exact opportunity expired before durable pre-arm claim.",
      );
      return null;
    }

    const claimed = freeze({
      ...clone(active),
      state: "CLAIMED" as const,
      claimedAt: evaluatedAt,
      opportunityId: candidate.id,
      authorityId: authority.id,
    });

    // This durable transition removes the arm before the three-second order
    // authority is minted. Every later failure is therefore fail-safe/no-retry.
    this.persist(claimed);
    this.lastEvaluation = freeze({
      evaluatedAt,
      opportunityId: candidate.id,
      outcome: "CLAIMED" as const,
      reason: "One-shot arm claimed before order authority.",
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

      const result = await this.dependencies.execute(currentOpportunity, authorized.id);
      const completedAt = this.dependencies.now();
      const completed = freeze({
        ...clone(claimed),
        state: "COMPLETED" as const,
        completedAt,
        executionStatus: result.status,
        failureReason:
          result.status === "BLOCKED"
            ? result.reasons[0] ?? "Coordinator blocked the one-shot attempt."
            : null,
      });

      this.persist(completed);
      this.lastEvaluation = freeze({
        evaluatedAt: completedAt,
        opportunityId: candidate.id,
        outcome: "COMPLETED" as const,
        reason: `Coordinator completed with ${result.status}. No automatic retry is permitted.`,
      });
      return clone(completed);
    } catch (error: unknown) {
      const failedAt = this.dependencies.now();
      const failed = freeze({
        ...clone(claimed),
        state: "FAILED_SAFE" as const,
        completedAt: failedAt,
        failureReason: message(error),
      });

      this.persist(failed);
      this.lastEvaluation = freeze({
        evaluatedAt: failedAt,
        opportunityId: candidate.id,
        outcome: "FAILED_SAFE" as const,
        reason: `${message(error)} No automatic retry is permitted.`,
      });
      return clone(failed);
    }
  }

  private recordBlocked(opportunityId: string, evaluatedAt: number, reason: string): void {
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
  return arm.market === normalizeMarket(opportunity.pair.market) &&
    arm.buyExchange === opportunity.pair.buy.exchange.trim().toLowerCase() &&
    arm.sellExchange === opportunity.pair.sell.exchange.trim().toLowerCase();
}

function armPhrase(input: {
  market: string;
  buyExchange: "binance" | "bybit";
  sellExchange: "binance" | "bybit";
  capitalPerLegInr: number;
}): string {
  return `ARM ONE-SHOT ${input.market} ${input.buyExchange.toUpperCase()} ${input.sellExchange.toUpperCase()} INR${input.capitalPerLegInr}`;
}

function normalizeMarket(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/gu, "");
}

function normalizePilotExchange(value: string): "binance" | "bybit" {
  const normalized = value.trim().toLowerCase();

  if (normalized !== "binance" && normalized !== "bybit") {
    throw new Error("Initial one-shot Tiny-LIVE lane is restricted to Binance and Bybit.");
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

  return item.schemaVersion === "125.0" &&
    typeof item.id === "string" && item.id.startsWith("tiny-live-prearm-") &&
    states.includes(item.state as StrategyOneTinyLivePreArmState) &&
    typeof item.market === "string" && item.market.endsWith("USDT") &&
    (item.buyExchange === "binance" || item.buyExchange === "bybit") &&
    (item.sellExchange === "binance" || item.sellExchange === "bybit") &&
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
    item.maximumAttempts === 1;
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
    previous.armedAt === next.armedAt &&
    previous.expiresAt === next.expiresAt;

  if (!immutableMatch) {
    return false;
  }

  const allowed: Record<StrategyOneTinyLivePreArmState, readonly StrategyOneTinyLivePreArmState[]> = {
    ARMED: ["CLAIMED", "DISARMED", "EXPIRED"],
    CLAIMED: ["COMPLETED", "FAILED_SAFE"],
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
      next.completedAt === null;
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
