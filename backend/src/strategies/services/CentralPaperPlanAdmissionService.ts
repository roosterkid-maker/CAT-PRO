import type {TradingAccount} from "../../trading/account/TradingAccount";
import type {CentralStrategyExecutionPlan} from "../models/CentralStrategyExecutionPlan";
import type {StrategyId} from "../models/StrategyMetadata";

const RUNTIME_RESOLVABLE_PLAN_BLOCKERS = new Set([
  "ACCOUNT_BALANCE_EVIDENCE_REQUIRED",
  "CAPITAL_RESERVATION_REQUIRED",
  "RISK_APPROVAL_REQUIRED",
  "CENTRAL_PAPER_ADAPTER_NOT_ADMITTED",
  "POSITION_EVIDENCE_MISSING",
  "MARGIN_EVIDENCE_MISSING",
  "LIQUIDATION_CONTROL_MISSING",
  "REDUCE_ONLY_UNVERIFIED",
  "DERIVATIVE_ADAPTER_MISSING",
  "SEQUENTIAL_LEG_FAILURE_RECOVERY_REQUIRED",
  "WALK_FORWARD_PROMOTION_EVIDENCE_REQUIRED",
  "REGIME_ADMISSION_REQUIRED",
  "MAKER_QUANTITY_EVIDENCE_REQUIRED",
  "MAKER_FILL_EVIDENCE_REQUIRED",
  "HEDGE_QUANTITY_EVIDENCE_REQUIRED",
  "HEDGE_BALANCE_EVIDENCE_REQUIRED",
  "QUEUE_POSITION_UNKNOWN",
  "FILL_PROBABILITY_UNKNOWN",
  "POST_ONLY_EXECUTION_UNVERIFIED",
]);

export interface CentralPaperAdmissionConfigurationInput {
  readonly enabled?: boolean;
  readonly allowedStrategies?: readonly StrategyId[];
  readonly maximumEvidenceAgeMs?: number;
  readonly maximumCapitalPerPlan?: number;
}

export interface CentralPaperPlanEvidence {
  readonly planId: string;
  readonly generatedAt: number;
  readonly expiresAt: number;
  readonly account: TradingAccount;
  readonly capital: {
    readonly assessmentId: string;
    readonly planId: string;
    readonly requestedAmount: number | null;
    readonly currency: "INR";
    readonly conversionEvidenceIds: readonly string[];
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
    readonly balanceVerified: boolean;
    /** Verified wallet inventory or fee-adjusted proceeds from the prior sequential leg. */
    readonly fundingVerified?: boolean;
    readonly fundingSource?: "AUTHENTICATED_ACCOUNT_BALANCE" | "PREVIOUS_LEG_MODELED_PROCEEDS";
    readonly externalBalanceRequired?: boolean;
    readonly paperAdapterSupported: boolean;
    readonly marketRulesVerified: boolean;
    readonly feeEvidenceFresh: boolean;
    readonly quoteFresh: boolean;
  }[];
  readonly controls: {
    readonly planId: string;
    readonly paperSimulatorAvailable: boolean;
    readonly failureRecoveryAvailable: boolean;
    readonly accountingJournalAvailable: boolean;
    readonly settlementAvailable: boolean;
    readonly liveAdapterReachable: false;
  };
  readonly statisticalPromotion: {
    readonly planId: string;
    readonly walkForwardPassed: boolean;
    readonly regimeAdmitted: boolean;
  } | null;
}

export interface CentralPaperPlanAdmission {
  readonly version: "36.0";
  readonly id: string;
  readonly generatedAt: number;
  readonly planId: string;
  readonly strategyId: StrategyId;
  readonly state: "ELIGIBLE_FOR_CENTRAL_PAPER_QUEUE" | "BLOCKED";
  readonly blockers: readonly string[];
  readonly intrinsicPlanBlockers: readonly string[];
  readonly approvedCapitalInr: number | null;
  readonly gates: {
    readonly runtimeEnabled: boolean;
    readonly strategyAllowed: boolean;
    readonly planCurrent: boolean;
    readonly evidenceCurrent: boolean;
    readonly accountReady: boolean;
    readonly capitalApproved: boolean;
    readonly riskApproved: boolean;
    readonly everyLegReady: boolean;
    readonly controlsReady: boolean;
    readonly researchPromotionReady: boolean;
  };
  readonly capitalReservationMutationPerformed: false;
  readonly executionHandoffAllowed: false;
  readonly paperExecutionPerformed: false;
  readonly liveExecutionAllowed: false;
  readonly orderSubmissionAllowed: false;
}

export class CentralPaperPlanAdmissionService {
  private readonly enabled: boolean;
  private readonly allowedStrategies: ReadonlySet<StrategyId>;
  private readonly maximumEvidenceAgeMs: number;
  private readonly maximumCapitalPerPlan: number;

  constructor(input: CentralPaperAdmissionConfigurationInput = {}) {
    this.enabled = input.enabled ?? false;
    this.allowedStrategies = new Set(input.allowedStrategies ?? []);
    this.maximumEvidenceAgeMs = input.maximumEvidenceAgeMs ?? 15_000;
    this.maximumCapitalPerPlan = input.maximumCapitalPerPlan ?? 100_000;
    if (!Number.isSafeInteger(this.maximumEvidenceAgeMs) || this.maximumEvidenceAgeMs <= 0) {
      throw new Error("Central PAPER admission maximumEvidenceAgeMs must be a positive safe integer.");
    }
    if (!Number.isFinite(this.maximumCapitalPerPlan) || this.maximumCapitalPerPlan <= 0) {
      throw new Error("Central PAPER admission maximumCapitalPerPlan must be positive.");
    }
  }

  evaluate(plan: CentralStrategyExecutionPlan, evidence: CentralPaperPlanEvidence | null, now = Date.now()): CentralPaperPlanAdmission {
    if (!Number.isSafeInteger(now) || now <= 0) throw new Error("Central PAPER admission timestamp must be positive.");
    const blockers: string[] = [];
    const intrinsicPlanBlockers = plan.executionReadinessBlockers.filter((item) => !RUNTIME_RESOLVABLE_PLAN_BLOCKERS.has(item));
    const runtimeEnabled = this.enabled;
    const strategyAllowed = this.allowedStrategies.has(plan.strategyId);
    const planCurrent = plan.generatedAt <= now && plan.expiresAt >= now;
    if (!runtimeEnabled) blockers.push("CENTRAL_PAPER_RUNTIME_DISABLED");
    if (!strategyAllowed) blockers.push("STRATEGY_NOT_ALLOWLISTED_FOR_CENTRAL_PAPER");
    if (plan.generatedAt > now) blockers.push("PLAN_GENERATED_IN_FUTURE");
    if (plan.expiresAt < now) blockers.push("PLAN_EXPIRED");
    blockers.push(...intrinsicPlanBlockers);

    const evidenceCurrent = evidence !== null && evidence.planId === plan.id && evidence.generatedAt <= now && evidence.expiresAt >= now && now - evidence.generatedAt <= this.maximumEvidenceAgeMs;
    if (!evidence) blockers.push("CENTRAL_PAPER_ADMISSION_EVIDENCE_MISSING");
    else if (!evidenceCurrent) blockers.push("CENTRAL_PAPER_ADMISSION_EVIDENCE_STALE_OR_MISMATCHED");

    const accountReady = Boolean(evidenceCurrent && evidence && evidence.account.mode === "PAPER" && evidence.account.enabled && !evidence.account.emergencyStop &&
      evidence.capital.currency === "INR" && evidence.capital.requestedAmount !== null &&
      evidence.capital.requestedAmount <= evidence.account.availableCapital && evidence.capital.requestedAmount <= evidence.account.limits.maximumCapitalPerTrade);
    if (!accountReady) blockers.push("PAPER_ACCOUNT_NOT_READY");

    const capitalApproved = Boolean(evidenceCurrent && evidence && evidence.capital.planId === plan.id && evidence.capital.approved &&
      evidence.capital.reservationMutationPerformed === false && evidence.capital.requestedAmount !== null &&
      evidence.capital.conversionEvidenceIds.length > 0 && Number.isFinite(evidence.capital.requestedAmount) &&
      evidence.capital.requestedAmount > 0 && evidence.capital.requestedAmount <= this.maximumCapitalPerPlan);
    if (!capitalApproved) blockers.push("READ_ONLY_CAPITAL_ASSESSMENT_NOT_APPROVED");

    const riskApproved = Boolean(evidenceCurrent && evidence && evidence.risk.planId === plan.id && evidence.risk.approved && (evidence.risk.level === "LOW" || evidence.risk.level === "MEDIUM") && Number.isFinite(evidence.risk.score) && evidence.risk.score >= 60 && evidence.risk.score <= 100);
    if (!riskApproved) blockers.push("CENTRAL_RISK_APPROVAL_NOT_READY");

    const everyLegReady = Boolean(evidenceCurrent && evidence && plan.legs.length > 0 && plan.legs.every((planLeg) => {
      const matches = evidence.legs.filter((item) => item.legId === planLeg.id);
      const evidenceLeg = matches[0];
      const fundingVerified = evidenceLeg?.fundingVerified ?? evidenceLeg?.balanceVerified ?? false;
      return matches.length === 1 && fundingVerified && evidenceLeg?.paperAdapterSupported && evidenceLeg.marketRulesVerified && evidenceLeg.feeEvidenceFresh && evidenceLeg.quoteFresh && planLeg.quantity !== null;
    }));
    if (!everyLegReady) blockers.push("ONE_OR_MORE_PAPER_LEGS_NOT_READY");

    const controlsReady = Boolean(evidenceCurrent && evidence && evidence.controls.planId === plan.id && evidence.controls.paperSimulatorAvailable && evidence.controls.failureRecoveryAvailable && evidence.controls.accountingJournalAvailable && evidence.controls.settlementAvailable && evidence.controls.liveAdapterReachable === false);
    if (!controlsReady) blockers.push("CENTRAL_PAPER_CONTROLS_NOT_READY");

    const researchPromotionReady = plan.strategyId !== "statistical-arbitrage" || Boolean(evidenceCurrent && evidence?.statisticalPromotion?.planId === plan.id && evidence.statisticalPromotion.walkForwardPassed && evidence.statisticalPromotion.regimeAdmitted);
    if (!researchPromotionReady) blockers.push("STATISTICAL_RESEARCH_PROMOTION_NOT_READY");

    const uniqueBlockers = Array.from(new Set(blockers));
    return deepFreeze({
      version: "36.0",
      id: `central-paper-admission:${plan.id}:${now}`,
      generatedAt: now,
      planId: plan.id,
      strategyId: plan.strategyId,
      state: uniqueBlockers.length === 0 ? "ELIGIBLE_FOR_CENTRAL_PAPER_QUEUE" : "BLOCKED",
      blockers: uniqueBlockers,
      intrinsicPlanBlockers,
      approvedCapitalInr: capitalApproved && evidence ? evidence.capital.requestedAmount : null,
      gates: {runtimeEnabled, strategyAllowed, planCurrent, evidenceCurrent, accountReady, capitalApproved, riskApproved, everyLegReady, controlsReady, researchPromotionReady},
      capitalReservationMutationPerformed: false,
      executionHandoffAllowed: false,
      paperExecutionPerformed: false,
      liveExecutionAllowed: false,
      orderSubmissionAllowed: false,
    });
  }
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}
