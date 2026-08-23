import type {StrategySignalListener} from "../contracts/StrategyController";
import type {StrategySignal} from "../models/StrategySignal";
import type {CentralStrategyExecutionPlan, CentralStrategyRouteFamily} from "../models/CentralStrategyExecutionPlan";
import {CentralStrategyExecutionPlanCompiler} from "./CentralStrategyExecutionPlanCompiler";
import {CentralPaperPlanAdmissionService} from "./CentralPaperPlanAdmissionService";
import type {CentralPaperPlanAdmission} from "./CentralPaperPlanAdmissionService";

export type {CentralStrategyRouteFamily} from "../models/CentralStrategyExecutionPlan";

export type CentralStrategyAdmissionDecision =
  | "EXISTING_STRATEGY_ONE_ORCHESTRATOR_OWNED"
  | "SHADOW_SIGNAL_ADMITTED"
  | "DUPLICATE_SIGNAL_REJECTED"
  | "ECONOMIC_OWNERSHIP_CONFLICT_REJECTED";

export interface CentralStrategyAdmissionRecord {
  readonly id: string;
  readonly generatedAt: number;
  readonly strategyId: string;
  readonly signalId: string;
  readonly signalKind: StrategySignal["kind"];
  readonly routeFamily: CentralStrategyRouteFamily;
  readonly economicOwnershipKey: string;
  readonly decision: CentralStrategyAdmissionDecision;
  readonly ownerStrategyId: string;
  readonly ownerSignalId: string;
  readonly ownershipExpiresAt: number;
  readonly blockers: readonly string[];
  readonly plan: CentralStrategyExecutionPlan | null;
  readonly paperAdmission: CentralPaperPlanAdmission | null;
  readonly signalExecutionAuthorized: false;
  readonly executionHandoffAllowed: false;
  readonly automaticExecutionAllowed: false;
  readonly paperExecutionAllowed: false;
  readonly liveExecutionAllowed: false;
  readonly orderSubmissionAllowed: false;
}

export interface CentralStrategySignalSource {
  subscribeToSignals(listener: StrategySignalListener): () => void;
}

export type CentralStrategyAdmissionListener = (record: CentralStrategyAdmissionRecord) => void;

interface OwnershipClaim {
  readonly strategyId: string;
  readonly signalId: string;
  readonly expiresAt: number;
}

export class CentralStrategyExecutionAdmissionService {
  private readonly records: CentralStrategyAdmissionRecord[] = [];
  private readonly claims = new Map<string, OwnershipClaim>();
  private readonly signalIds = new Map<string, number>();
  private unsubscribe: (() => void) | null = null;
  private readonly listeners = new Set<CentralStrategyAdmissionListener>();

  constructor(
    private readonly source: CentralStrategySignalSource,
    private readonly maximumRecords = 1_000,
    private readonly compiler = new CentralStrategyExecutionPlanCompiler(),
    private readonly paperAdmissionService = new CentralPaperPlanAdmissionService(),
  ) {
    if (!Number.isSafeInteger(maximumRecords) || maximumRecords <= 0) {
      throw new Error("Central strategy admission maximumRecords must be a positive integer.");
    }
  }

  start(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = this.source.subscribeToSignals((signal) => {
      try { this.admit(signal); }
      catch (error: unknown) {
        console.error("[CentralStrategyAdmission] Signal rejected:", error instanceof Error ? error.message : error);
      }
    });
  }

  stop(): void { this.unsubscribe?.(); this.unsubscribe = null; }
  isRunning(): boolean { return this.unsubscribe !== null; }

  admit(signal: StrategySignal, now = Date.now()): CentralStrategyAdmissionRecord {
    if (signal.executionAuthorized !== false || signal.automaticExecutionAllowed !== false) {
      throw new Error("Central admission accepts only non-executable strategy signals.");
    }
    if (!Number.isSafeInteger(now) || now <= 0 || signal.expiresAt < now) {
      throw new Error("Central admission requires a current non-expired signal.");
    }
    this.prune(now);
    const route = routeIdentity(signal);
    const duplicateExpiry = this.signalIds.get(signal.id);
    const existing = this.claims.get(route.ownershipKey);
    let decision: CentralStrategyAdmissionDecision;
    let ownerStrategyId = signal.strategyId;
    let ownerSignalId = signal.id;
    let ownershipExpiresAt = signal.expiresAt;
    let blockers: readonly string[];
    let plan: CentralStrategyExecutionPlan | null = null;
    let paperAdmission: CentralPaperPlanAdmission | null = null;

    if (duplicateExpiry !== undefined && duplicateExpiry >= now) {
      decision = "DUPLICATE_SIGNAL_REJECTED";
      blockers = ["SIGNAL_ID_ALREADY_OBSERVED"];
    } else if (existing && existing.expiresAt >= now && existing.signalId !== signal.id) {
      decision = "ECONOMIC_OWNERSHIP_CONFLICT_REJECTED";
      ownerStrategyId = existing.strategyId;
      ownerSignalId = existing.signalId;
      ownershipExpiresAt = existing.expiresAt;
      blockers = ["ECONOMIC_ROUTE_ALREADY_OWNED"];
    } else {
      decision = signal.kind === "CROSS_EXCHANGE_ARBITRAGE_OPPORTUNITY"
        ? "EXISTING_STRATEGY_ONE_ORCHESTRATOR_OWNED"
        : "SHADOW_SIGNAL_ADMITTED";
      plan = this.compiler.compile(signal, now);
      paperAdmission = signal.kind === "CROSS_EXCHANGE_ARBITRAGE_OPPORTUNITY"
        ? null
        : this.paperAdmissionService.evaluate(plan, null, now);
      blockers = plan.executionReadinessBlockers;
      this.claims.set(route.ownershipKey, {strategyId: signal.strategyId, signalId: signal.id, expiresAt: signal.expiresAt});
      this.signalIds.set(signal.id, signal.expiresAt);
    }

    const record = deepFreeze({id: `central-admission:${signal.id}:${now}`, generatedAt: now,
      strategyId: signal.strategyId, signalId: signal.id, signalKind: signal.kind,
      routeFamily: route.family, economicOwnershipKey: route.ownershipKey, decision,
      ownerStrategyId, ownerSignalId, ownershipExpiresAt, blockers,
      plan,
      paperAdmission,
      signalExecutionAuthorized: false as const, executionHandoffAllowed: false as const,
      automaticExecutionAllowed: false as const, paperExecutionAllowed: false as const,
      liveExecutionAllowed: false as const, orderSubmissionAllowed: false as const});
    this.records.push(record);
    if (this.records.length > this.maximumRecords) this.records.splice(0, this.records.length - this.maximumRecords);
    for (const listener of this.listeners) {
      try { listener(structuredClone(record)); }
      catch (error: unknown) { console.error("[CentralStrategyAdmission] Listener failed:", error instanceof Error ? error.message : error); }
    }
    return structuredClone(record);
  }

  subscribeToAdmissions(listener: CentralStrategyAdmissionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  evaluatePaperPlan(plan: CentralStrategyExecutionPlan, evidence: import("./CentralPaperPlanAdmissionService").CentralPaperPlanEvidence | null, now = Date.now()): CentralPaperPlanAdmission {
    return this.paperAdmissionService.evaluate(plan, evidence, now);
  }

  getDiagnostics(now = Date.now()) {
    this.prune(now);
    const records = this.records.slice().reverse().map((record) => structuredClone(record));
    return deepFreeze({generatedAt: now, version: "35.0" as const, running: this.isRunning(),
      records: records.length, activeOwnershipClaims: this.claims.size,
      canonicalPlansCompiled: records.filter((item) => item.plan !== null).length,
      sharedPlansBlockedFromPromotion: records.filter((item) => item.plan?.promotionState === "BLOCKED").length,
      centralPaperAdmissionsEvaluated: records.filter((item) => item.paperAdmission !== null).length,
      decisions: {existingStrategyOneOwner: records.filter((item) => item.decision === "EXISTING_STRATEGY_ONE_ORCHESTRATOR_OWNED").length,
        shadowAdmitted: records.filter((item) => item.decision === "SHADOW_SIGNAL_ADMITTED").length,
        duplicatesRejected: records.filter((item) => item.decision === "DUPLICATE_SIGNAL_REJECTED").length,
        ownershipConflictsRejected: records.filter((item) => item.decision === "ECONOMIC_OWNERSHIP_CONFLICT_REJECTED").length},
      recent: records.slice(0, 100),
      safety: {singleSignalAdmissionSurface: true, signalLevelDeduplication: true,
        economicOwnershipDeduplication: true, strategyOneExecutionPathReused: true,
        canonicalPlanCompilerSharedByAllStrategies: true,
        centralPaperAdmissionFailClosed: true,
        parallelExecutionEngineCreated: false, executionHandoffAllowed: false,
        paperExecutionAllowed: false, liveExecutionAllowed: false, orderSubmissionAllowed: false}});
  }

  private prune(now: number): void {
    for (const [key, claim] of this.claims) if (claim.expiresAt < now) this.claims.delete(key);
    for (const [signalId, expiresAt] of this.signalIds) if (expiresAt < now) this.signalIds.delete(signalId);
  }
}

function routeIdentity(signal: StrategySignal): {family: CentralStrategyRouteFamily; ownershipKey: string} {
  switch (signal.kind) {
    case "CROSS_EXCHANGE_ARBITRAGE_OPPORTUNITY":
      return {family: "SPOT_TWO_VENUE", ownershipKey: key("SPOT", signal.evidence.market,
        ...[signal.evidence.buyExchange, signal.evidence.sellExchange].sort())};
    case "XEMM_SAFE_MAKER_PRICE":
      return {family: "SPOT_TWO_VENUE", ownershipKey: key("SPOT", signal.evidence.market,
        ...[signal.evidence.makerExchange, signal.evidence.hedgeExchange].sort())};
    case "TRIANGULAR_ARBITRAGE_SHADOW_PATH":
      return {family: "SPOT_TRIANGULAR", ownershipKey: key("SPOT_TRI", signal.evidence.exchange,
        ...signal.evidence.legs.map((leg) => leg.market).sort())};
    case "SPOT_PERPETUAL_BASIS_SHADOW_OPPORTUNITY":
      return {family: "SPOT_PERPETUAL", ownershipKey: key("SPOT_PERP", signal.evidence.market,
        signal.evidence.spotExchange, signal.evidence.perpetualExchange)};
    case "FUNDING_RATE_ARBITRAGE_SHADOW_OPPORTUNITY":
      return {family: "PERPETUAL_TWO_VENUE", ownershipKey: key("PERP", signal.evidence.market,
        ...[signal.evidence.longExchange, signal.evidence.shortExchange].sort())};
    case "PERPETUAL_PERPETUAL_ARBITRAGE_SHADOW_OPPORTUNITY":
      return {family: "PERPETUAL_TWO_VENUE", ownershipKey: key("PERP", signal.evidence.market,
        ...[signal.evidence.longExchange, signal.evidence.shortExchange].sort())};
    case "DYNAMIC_MARKET_MAKING_SHADOW_QUOTE_PLAN":
      return {family: "SPOT_MARKET_MAKING", ownershipKey: key("SPOT_MM", signal.evidence.exchange, signal.evidence.market)};
    case "STATISTICAL_ARBITRAGE_SHADOW_PAIR":
      return {family: "PERPETUAL_STATISTICAL_PAIR", ownershipKey: key("PERP_PAIR", signal.evidence.exchange,
        ...[signal.evidence.leftMarket, signal.evidence.rightMarket].sort())};
  }
}

function key(...parts: readonly string[]): string { return parts.map((part) => part.trim().toUpperCase()).join(":"); }
function deepFreeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; for (const nested of Object.values(value)) deepFreeze(nested); return Object.freeze(value); }
