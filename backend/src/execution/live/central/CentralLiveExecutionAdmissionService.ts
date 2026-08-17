import {createHash} from "node:crypto";
import type {CentralExecutionPattern, CentralStrategyExecutionPlan} from "../../../strategies/models/CentralStrategyExecutionPlan";
import type {StrategyId} from "../../../strategies/models/StrategyMetadata";

export const CENTRAL_LIVE_ACTION_CONFIRMATION = "CONFIRM_CENTRAL_STRATEGY_LIVE_ACTION";

export interface CentralLiveAdmissionEvidence {
  readonly planId: string;
  readonly generatedAt: number;
  readonly expiresAt: number;
  readonly paperSoak: {
    readonly strategyId: StrategyId;
    readonly state: "SOAK_ACCEPTED" | "SOAK_IN_PROGRESS" | "NO_DATA";
    readonly closedCycles: number;
    readonly consecutivePasses: number;
  };
  readonly capital: {
    readonly assessmentId: string;
    readonly planId: string;
    readonly requestedInr: number;
    readonly approved: boolean;
    readonly reservationMutationPerformed: false;
  };
  readonly risk: {
    readonly assessmentId: string;
    readonly planId: string;
    readonly approved: boolean;
    readonly level: "LOW" | "MEDIUM" | "HIGH" | "BLOCKED";
    readonly score: number;
  };
  readonly legs: readonly {
    readonly legId: string;
    readonly adapterRegistered: boolean;
    readonly authenticatedReadFresh: boolean;
    readonly productSupported: boolean;
    readonly orderTypeSupported: boolean;
    readonly marketRulesFresh: boolean;
    readonly feeEvidenceFresh: boolean;
    readonly quoteFresh: boolean;
    readonly positionEvidenceFresh?: boolean;
    readonly marginEvidenceFresh?: boolean;
    readonly liquidationControlReady?: boolean;
    readonly reduceOnlyExitVerified?: boolean;
  }[];
  readonly controls: {
    readonly planId: string;
    readonly lifecyclePattern: CentralExecutionPattern;
    readonly lifecycleHandlerId: string;
    readonly lifecycleHandlerRegistered: boolean;
    readonly admissionJournalAvailable: boolean;
    readonly sharedRecoveryAvailable: boolean;
    readonly settlementAvailable: boolean;
    readonly reconciliationAvailable: boolean;
  };
  readonly actionAuthority: {
    readonly operatorActionId: string;
    readonly planId: string;
    readonly confirmation: string;
    readonly confirmedAt: number;
    readonly expiresAt: number;
  };
}

export interface CentralLiveAdmissionConfiguration {
  readonly compileTimeGateEnabled?: boolean;
  readonly allowedStrategies?: readonly StrategyId[];
  readonly registeredPatterns?: readonly CentralExecutionPattern[];
  readonly maximumEvidenceAgeMs?: number;
  readonly maximumActionAgeMs?: number;
  readonly maximumCapitalPerPlanInr?: number;
}

export interface CentralLiveExecutionAdmission {
  readonly version: "69.0";
  readonly id: string;
  readonly generatedAt: number;
  readonly planId: string;
  readonly strategyId: StrategyId;
  readonly pattern: CentralExecutionPattern;
  readonly state: "ELIGIBLE_FOR_CENTRAL_LIVE_QUEUE" | "BLOCKED";
  readonly blockers: readonly string[];
  readonly approvedCapitalInr: number | null;
  readonly lifecycleHandlerId: string | null;
  readonly actionAuthorityId: string | null;
  readonly actionAuthorityExpiresAt: number | null;
  readonly gates: {
    readonly compileTimeGateEnabled: boolean;
    readonly strategyAllowed: boolean;
    readonly planCurrent: boolean;
    readonly evidenceCurrent: boolean;
    readonly paperSoakAccepted: boolean;
    readonly capitalApproved: boolean;
    readonly riskApproved: boolean;
    readonly everyLegReady: boolean;
    readonly lifecycleHandlerReady: boolean;
    readonly controlsReady: boolean;
    readonly actionAuthorityFresh: boolean;
  };
  readonly handoffEligible: boolean;
  readonly capitalReservationMutationPerformed: false;
  readonly executionStarted: false;
  readonly orderSubmissionPerformed: false;
}

export class CentralLiveExecutionAdmissionService {
  private readonly compileTimeGateEnabled: boolean;
  private readonly allowedStrategies: ReadonlySet<StrategyId>;
  private readonly registeredPatterns: ReadonlySet<CentralExecutionPattern>;
  private readonly maximumEvidenceAgeMs: number;
  private readonly maximumActionAgeMs: number;
  private readonly maximumCapitalPerPlanInr: number;

  constructor(configuration: CentralLiveAdmissionConfiguration = {}) {
    this.compileTimeGateEnabled = configuration.compileTimeGateEnabled ?? false;
    this.allowedStrategies = new Set(configuration.allowedStrategies ?? []);
    this.registeredPatterns = new Set(configuration.registeredPatterns ?? []);
    this.maximumEvidenceAgeMs = configuration.maximumEvidenceAgeMs ?? 10_000;
    this.maximumActionAgeMs = configuration.maximumActionAgeMs ?? 30_000;
    this.maximumCapitalPerPlanInr = configuration.maximumCapitalPerPlanInr ?? 10_000;
    if (!Number.isSafeInteger(this.maximumEvidenceAgeMs) || this.maximumEvidenceAgeMs <= 0) throw new Error("Central LIVE maximum evidence age must be positive.");
    if (!Number.isSafeInteger(this.maximumActionAgeMs) || this.maximumActionAgeMs <= 0) throw new Error("Central LIVE maximum action age must be positive.");
    if (!Number.isFinite(this.maximumCapitalPerPlanInr) || this.maximumCapitalPerPlanInr <= 0) throw new Error("Central LIVE maximum capital per plan must be positive.");
  }

  evaluate(plan: CentralStrategyExecutionPlan, evidence: CentralLiveAdmissionEvidence | null, now = Date.now()): CentralLiveExecutionAdmission {
    if (!Number.isSafeInteger(now) || now <= 0) throw new Error("Central LIVE admission timestamp must be positive.");
    const blockers: string[] = [];
    const strategyAllowed = this.allowedStrategies.has(plan.strategyId);
    const planCurrent = plan.expiresAt >= now;
    if (!this.compileTimeGateEnabled) blockers.push("CENTRAL_LIVE_COMPILE_TIME_GATE_DISABLED");
    if (!strategyAllowed) blockers.push("STRATEGY_NOT_ALLOWLISTED_FOR_CENTRAL_LIVE");
    if (!planCurrent) blockers.push("PLAN_EXPIRED");

    const evidenceCurrent = evidence !== null && evidence.planId === plan.id && evidence.generatedAt <= now &&
      evidence.expiresAt >= now && now - evidence.generatedAt <= this.maximumEvidenceAgeMs;
    if (!evidence) blockers.push("CENTRAL_LIVE_ADMISSION_EVIDENCE_MISSING");
    else if (!evidenceCurrent) blockers.push("CENTRAL_LIVE_ADMISSION_EVIDENCE_STALE_OR_MISMATCHED");

    const paperSoakAccepted = Boolean(evidenceCurrent && evidence && evidence.paperSoak.strategyId === plan.strategyId &&
      evidence.paperSoak.state === "SOAK_ACCEPTED" && evidence.paperSoak.closedCycles > 0 && evidence.paperSoak.consecutivePasses > 0);
    if (!paperSoakAccepted) blockers.push("ACCEPTED_REAL_PAPER_SOAK_REQUIRED");

    const capitalApproved = Boolean(evidenceCurrent && evidence && evidence.capital.planId === plan.id && evidence.capital.assessmentId.trim() &&
      evidence.capital.approved && evidence.capital.reservationMutationPerformed === false && Number.isFinite(evidence.capital.requestedInr) &&
      evidence.capital.requestedInr > 0 && evidence.capital.requestedInr <= this.maximumCapitalPerPlanInr);
    if (!capitalApproved) blockers.push("READ_ONLY_LIVE_CAPITAL_ASSESSMENT_NOT_APPROVED");

    const riskApproved = Boolean(evidenceCurrent && evidence && evidence.risk.planId === plan.id && evidence.risk.assessmentId.trim() &&
      evidence.risk.approved && (evidence.risk.level === "LOW" || evidence.risk.level === "MEDIUM") &&
      Number.isFinite(evidence.risk.score) && evidence.risk.score >= 70 && evidence.risk.score <= 100);
    if (!riskApproved) blockers.push("CENTRAL_LIVE_RISK_APPROVAL_NOT_READY");

    const everyLegReady = Boolean(evidenceCurrent && evidence && plan.legs.length > 0 && plan.legs.every((leg) => {
      const matches = evidence.legs.filter((item) => item.legId === leg.id);
      const item = matches[0];
      const commonReady = matches.length === 1 && leg.quantity !== null && Boolean(item?.adapterRegistered && item.authenticatedReadFresh &&
        item.productSupported && item.orderTypeSupported && item.marketRulesFresh && item.feeEvidenceFresh && item.quoteFresh);
      return commonReady && (leg.product !== "PERPETUAL" || Boolean(item?.positionEvidenceFresh && item.marginEvidenceFresh &&
        item.liquidationControlReady && item.reduceOnlyExitVerified));
    }));
    if (!everyLegReady) blockers.push("ONE_OR_MORE_LIVE_LEGS_NOT_READY");

    const lifecycleHandlerReady = Boolean(evidenceCurrent && evidence && this.registeredPatterns.has(plan.pattern) &&
      evidence.controls.planId === plan.id && evidence.controls.lifecyclePattern === plan.pattern &&
      evidence.controls.lifecycleHandlerRegistered && evidence.controls.lifecycleHandlerId.trim() &&
      handlerMatches(plan.pattern, evidence.controls.lifecycleHandlerId));
    if (!lifecycleHandlerReady) blockers.push("CENTRAL_LIVE_LIFECYCLE_HANDLER_NOT_READY");

    const controlsReady = Boolean(lifecycleHandlerReady && evidence && evidence.controls.admissionJournalAvailable &&
      evidence.controls.sharedRecoveryAvailable && evidence.controls.settlementAvailable && evidence.controls.reconciliationAvailable);
    if (!controlsReady) blockers.push("CENTRAL_LIVE_CONTROLS_NOT_READY");

    const unresolvedPlanBlockers = plan.executionReadinessBlockers.filter((item) => {
      if (!lifecycleHandlerReady || !controlsReady || !everyLegReady) return true;
      if (plan.pattern === "PASSIVE_MAKER_THEN_HEDGE") {
        return item !== "MAKER_FILL_EVIDENCE_REQUIRED" && item !== "HEDGE_BALANCE_EVIDENCE_REQUIRED";
      }
      if (plan.pattern === "SEQUENTIAL_THREE_LEG") return item !== "SEQUENTIAL_LEG_FAILURE_RECOVERY_REQUIRED";
      if (plan.pattern === "TWO_SIDED_PASSIVE_MAKER") {
        return item !== "QUEUE_POSITION_UNKNOWN" && item !== "POST_ONLY_EXECUTION_UNVERIFIED";
      }
      if (plan.pattern === "PARALLEL_TWO_LEG" || plan.pattern === "PARALLEL_STATISTICAL_PAIR") {
        return !DERIVATIVE_RUNTIME_BLOCKERS.has(item);
      }
      return true;
    });
    blockers.push(...unresolvedPlanBlockers.map((item) => `PLAN:${item}`));

    const actionAuthorityFresh = Boolean(evidenceCurrent && evidence && evidence.actionAuthority.planId === plan.id &&
      evidence.actionAuthority.operatorActionId.trim() && evidence.actionAuthority.confirmation === CENTRAL_LIVE_ACTION_CONFIRMATION &&
      evidence.actionAuthority.confirmedAt <= now && evidence.actionAuthority.expiresAt >= now &&
      now - evidence.actionAuthority.confirmedAt <= this.maximumActionAgeMs && evidence.actionAuthority.expiresAt <= plan.expiresAt);
    if (!actionAuthorityFresh) blockers.push("FRESH_ACTION_TIME_OPERATOR_CONFIRMATION_REQUIRED");

    const uniqueBlockers = [...new Set(blockers)];
    const handoffEligible = uniqueBlockers.length === 0;
    return freeze({
      version: "69.0" as const,
      id: `central-live-admission:${plan.id}:${admissionEvidenceHash(plan, evidence, now)}`,
      generatedAt: now,
      planId: plan.id,
      strategyId: plan.strategyId,
      pattern: plan.pattern,
      state: handoffEligible ? "ELIGIBLE_FOR_CENTRAL_LIVE_QUEUE" as const : "BLOCKED" as const,
      blockers: uniqueBlockers,
      approvedCapitalInr: capitalApproved && evidence ? evidence.capital.requestedInr : null,
      lifecycleHandlerId: lifecycleHandlerReady && evidence ? evidence.controls.lifecycleHandlerId.trim() : null,
      actionAuthorityId: actionAuthorityFresh && evidence ? evidence.actionAuthority.operatorActionId.trim() : null,
      actionAuthorityExpiresAt: actionAuthorityFresh && evidence ? evidence.actionAuthority.expiresAt : null,
      gates: {compileTimeGateEnabled: this.compileTimeGateEnabled, strategyAllowed, planCurrent, evidenceCurrent, paperSoakAccepted,
        capitalApproved, riskApproved, everyLegReady, lifecycleHandlerReady, controlsReady, actionAuthorityFresh},
      handoffEligible,
      capitalReservationMutationPerformed: false as const,
      executionStarted: false as const,
      orderSubmissionPerformed: false as const,
    });
  }
}

const DERIVATIVE_RUNTIME_BLOCKERS = new Set([
  "POSITION_EVIDENCE_MISSING", "MARGIN_EVIDENCE_MISSING", "LIQUIDATION_CONTROL_MISSING",
  "REDUCE_ONLY_UNVERIFIED", "DERIVATIVE_ADAPTER_MISSING",
]);
function handlerMatches(pattern: CentralExecutionPattern, handlerId: string): boolean {
  if (pattern === "PASSIVE_MAKER_THEN_HEDGE") return handlerId.trim() === "central-passive-maker-hedge-v80";
  if (pattern === "SEQUENTIAL_THREE_LEG") return handlerId.trim() === "central-sequential-three-leg-v71";
  if (pattern === "TWO_SIDED_PASSIVE_MAKER") return handlerId.trim() === "central-two-sided-passive-maker-v72";
  if (pattern === "PARALLEL_TWO_LEG") return handlerId.trim() === "central-parallel-derivative-v74";
  if (pattern === "PARALLEL_STATISTICAL_PAIR") return handlerId.trim() === "central-statistical-derivative-v74";
  return false;
}

function admissionEvidenceHash(plan: CentralStrategyExecutionPlan, evidence: CentralLiveAdmissionEvidence | null, now: number): string {
  return createHash("sha256").update(JSON.stringify({planId: plan.id, strategyId: plan.strategyId, pattern: plan.pattern, now, evidence})).digest("hex");
}

function freeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freeze(nested);
  return Object.freeze(value);
}
