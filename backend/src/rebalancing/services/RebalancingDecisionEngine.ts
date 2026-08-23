import type {
  CapitalAllocationAndImbalanceReport,
  ExchangeImbalanceAssessment,
} from "./CapitalAllocationAndImbalanceService";

export type RebalancingDecisionState =
  | "BLOCKED"
  | "NO_REBALANCE_REQUIRED"
  | "NATURAL_REBALANCE_AVAILABLE"
  | "SOFT_REBALANCE_PREFERRED"
  | "HARD_REBALANCE_ANALYSIS_REQUIRED";

export interface RebalancingPlanningPolicy {
  readonly policyId: string;
  readonly revision: number;
  readonly minimumUsefulMoveUsdt: number;
  readonly maximumPlannedMoves: number;
}

export interface RebalancingPlanningContext {
  readonly naturalRebalanceCandidateKeys?: readonly string[];
  readonly executionRecoveryPending?: boolean;
  readonly settlementReconciliationPending?: boolean;
  readonly emergencyStopActive?: boolean;
}

export interface RebalancingRouteProposal {
  readonly sequence: number;
  readonly sourceExchange: string;
  readonly destinationExchange: string;
  readonly amountUsdt: number;
  readonly sourceTransferableBeforeUsdt: number;
  readonly sourceTransferableAfterUsdt: number;
  readonly destinationDeficitBeforeUsdt: number;
  readonly destinationDeficitAfterUsdt: number;
  readonly routeLevel: 5;
  readonly kind: "CROSS_EXCHANGE_CAPITAL_MOVE_ANALYSIS";
  readonly submissionState: "ANALYSIS_ONLY";
  readonly transferAsset: null;
  readonly transferNetwork: null;
  readonly estimatedCostUsdt: null;
  readonly reason: string;
}

export interface RebalancingDecisionPlan {
  readonly version: "124.0";
  readonly generatedAt: number;
  readonly state: RebalancingDecisionState;
  readonly currentAction:
    | "BLOCK"
    | "NO_ACTION"
    | "PRIORITIZE_NATURAL_REVERSE"
    | "PREFER_INVENTORY_AWARE_TRADES"
    | "WAIT_FOR_OPERATOR_APPROVED_HARD_REBALANCE_INFRASTRUCTURE";
  readonly policy: RebalancingPlanningPolicy;
  readonly naturalRebalanceCandidateKeys: readonly string[];
  readonly desiredMoves: readonly RebalancingRouteProposal[];
  readonly unresolvedDeficitUsdt: number;
  readonly unusedTransferableSurplusUsdt: number;
  readonly blockers: readonly string[];
  readonly reasons: readonly string[];
  readonly safety: {
    readonly readOnly: true;
    readonly reservedCapitalExcluded: true;
    readonly neverDrainRuleApplied: true;
    readonly activeExecutionProtected: true;
    readonly partialFillRecoveryProtected: true;
    readonly noTransferLoops: true;
    readonly transferSubmissionAllowed: false;
    readonly withdrawalSubmissionAllowed: false;
    readonly liveOrderSubmissionAllowed: false;
  };
}

export const DEFAULT_REBALANCING_PLANNING_POLICY:
  RebalancingPlanningPolicy = {
  policyId: "cat-pro-read-only-route-plan-v1",
  revision: 1,
  minimumUsefulMoveUsdt: 1,
  maximumPlannedMoves: 4,
};

/**
 * Produces the smallest useful direct source-to-destination move set from the
 * already reservation-aware imbalance report. It deliberately cannot choose
 * a transfer asset/network or submit financial actions; those require later,
 * separately authorized infrastructure and authoritative cost/health checks.
 */
export class RebalancingDecisionEngine {
  plan(
    report: CapitalAllocationAndImbalanceReport,
    context: RebalancingPlanningContext = {},
    policy: RebalancingPlanningPolicy =
      DEFAULT_REBALANCING_PLANNING_POLICY,
    now = Date.now(),
  ): RebalancingDecisionPlan {
    const blockers = this.validate(report, context, policy, now);
    const naturalKeys = [...new Set(
      (context.naturalRebalanceCandidateKeys ?? [])
        .map((key) => key.trim())
        .filter(Boolean),
    )].sort();

    if (blockers.length > 0) {
      return this.result({
        now,
        state: "BLOCKED",
        currentAction: "BLOCK",
        policy,
        naturalKeys,
        desiredMoves: [],
        unresolvedDeficitUsdt:
          report.summary.totalDeficitToTargetUsdt,
        unusedTransferableSurplusUsdt:
          report.summary.totalTransferableSurplusUsdt,
        blockers,
        reasons: [
          "Rebalancing analysis is blocked until authoritative evidence and execution recovery are safe.",
        ],
      });
    }

    const desiredMoves = this.buildDirectMoveSet(report.exchanges, policy);
    const plannedAmount = desiredMoves.reduce(
      (total, move) => total + move.amountUsdt,
      0,
    );
    const unresolvedDeficitUsdt = Math.max(
      0,
      report.summary.totalDeficitToTargetUsdt - plannedAmount,
    );
    const unusedTransferableSurplusUsdt = Math.max(
      0,
      report.summary.totalTransferableSurplusUsdt - plannedAmount,
    );
    const hasImbalance =
      report.summary.criticalLow > 0 ||
      report.summary.underfunded > 0 ||
      report.summary.overfunded > 0 ||
      report.summary.criticalHigh > 0;
    const hasCriticalImbalance =
      report.summary.criticalLow > 0 ||
      report.summary.criticalHigh > 0;
    const state: RebalancingDecisionState = !hasImbalance
      ? "NO_REBALANCE_REQUIRED"
      : naturalKeys.length > 0
        ? "NATURAL_REBALANCE_AVAILABLE"
        : hasCriticalImbalance
          ? "HARD_REBALANCE_ANALYSIS_REQUIRED"
          : "SOFT_REBALANCE_PREFERRED";
    const currentAction: RebalancingDecisionPlan["currentAction"] =
      state === "NO_REBALANCE_REQUIRED"
        ? "NO_ACTION"
        : state === "NATURAL_REBALANCE_AVAILABLE"
          ? "PRIORITIZE_NATURAL_REVERSE"
          : state === "SOFT_REBALANCE_PREFERRED"
            ? "PREFER_INVENTORY_AWARE_TRADES"
            : "WAIT_FOR_OPERATOR_APPROVED_HARD_REBALANCE_INFRASTRUCTURE";

    return this.result({
      now,
      state,
      currentAction,
      policy,
      naturalKeys,
      desiredMoves,
      unresolvedDeficitUsdt,
      unusedTransferableSurplusUsdt,
      blockers: [],
      reasons: [
        state === "NO_REBALANCE_REQUIRED"
          ? "Every exchange is within the configured allocation band."
          : state === "NATURAL_REBALANCE_AVAILABLE"
            ? "A qualified positive-net reverse route can improve inventory without a withdrawal."
            : state === "SOFT_REBALANCE_PREFERRED"
              ? "Prefer profitable inventory-aware opportunities before considering a transfer."
              : "Critical allocation imbalance exists, but hard moves remain analysis-only until transfer cost, health, address and operator gates exist.",
        `${desiredMoves.length} direct no-loop capital move(s) were analyzed; none were submitted.`,
      ],
    });
  }

  private buildDirectMoveSet(
    exchanges: readonly ExchangeImbalanceAssessment[],
    policy: RebalancingPlanningPolicy,
  ): RebalancingRouteProposal[] {
    const sources = exchanges
      .filter((exchange) =>
        exchange.surplusAboveTargetUsdt >= policy.minimumUsefulMoveUsdt &&
        exchange.transferableSurplusUsdt >= policy.minimumUsefulMoveUsdt,
      )
      .map((exchange) => ({
        exchange: exchange.exchange,
        remaining: Math.min(
          exchange.surplusAboveTargetUsdt,
          exchange.transferableSurplusUsdt,
        ),
      }))
      .sort((first, second) =>
        second.remaining - first.remaining ||
        first.exchange.localeCompare(second.exchange),
      );
    const destinations = exchanges
      .filter((exchange) =>
        exchange.deficitToTargetUsdt >= policy.minimumUsefulMoveUsdt,
      )
      .map((exchange) => ({
        exchange: exchange.exchange,
        remaining: exchange.deficitToTargetUsdt,
      }))
      .sort((first, second) =>
        second.remaining - first.remaining ||
        first.exchange.localeCompare(second.exchange),
      );
    const moves: RebalancingRouteProposal[] = [];

    for (const destination of destinations) {
      for (const source of sources) {
        if (
          moves.length >= policy.maximumPlannedMoves ||
          destination.remaining < policy.minimumUsefulMoveUsdt
        ) {
          break;
        }
        if (
          source.exchange === destination.exchange ||
          source.remaining < policy.minimumUsefulMoveUsdt
        ) {
          continue;
        }

        const amount = Math.min(source.remaining, destination.remaining);
        if (amount < policy.minimumUsefulMoveUsdt) {
          continue;
        }
        const sourceBefore = source.remaining;
        const destinationBefore = destination.remaining;
        source.remaining -= amount;
        destination.remaining -= amount;
        moves.push({
          sequence: moves.length + 1,
          sourceExchange: source.exchange,
          destinationExchange: destination.exchange,
          amountUsdt: this.round(amount),
          sourceTransferableBeforeUsdt: this.round(sourceBefore),
          sourceTransferableAfterUsdt: this.round(source.remaining),
          destinationDeficitBeforeUsdt: this.round(destinationBefore),
          destinationDeficitAfterUsdt: this.round(destination.remaining),
          routeLevel: 5,
          kind: "CROSS_EXCHANGE_CAPITAL_MOVE_ANALYSIS",
          submissionState: "ANALYSIS_ONLY",
          transferAsset: null,
          transferNetwork: null,
          estimatedCostUsdt: null,
          reason:
            "Direct analytical move uses only transferable surplus after reservations and never-drain limits.",
        });
      }
      if (moves.length >= policy.maximumPlannedMoves) {
        break;
      }
    }

    return moves;
  }

  private validate(
    report: CapitalAllocationAndImbalanceReport,
    context: RebalancingPlanningContext,
    policy: RebalancingPlanningPolicy,
    now: number,
  ): string[] {
    const blockers = [...report.blockers];
    if (report.state !== "READY") {
      blockers.push(`Allocation report state is ${report.state}.`);
    }
    if (!Number.isSafeInteger(now) || now <= 0 || now < report.generatedAt) {
      blockers.push("Planning timestamp is invalid or predates allocation evidence.");
    }
    if (
      !policy.policyId.trim() ||
      !Number.isSafeInteger(policy.revision) ||
      policy.revision <= 0 ||
      !Number.isFinite(policy.minimumUsefulMoveUsdt) ||
      policy.minimumUsefulMoveUsdt <= 0 ||
      !Number.isSafeInteger(policy.maximumPlannedMoves) ||
      policy.maximumPlannedMoves <= 0
    ) {
      blockers.push("Rebalancing planning policy is invalid.");
    }
    if (context.executionRecoveryPending) {
      blockers.push("Execution recovery is pending.");
    }
    if (context.settlementReconciliationPending) {
      blockers.push("Settlement reconciliation is pending.");
    }
    if (context.emergencyStopActive) {
      blockers.push("System emergency stop is active.");
    }
    return [...new Set(blockers)];
  }

  private result(input: {
    now: number;
    state: RebalancingDecisionState;
    currentAction: RebalancingDecisionPlan["currentAction"];
    policy: RebalancingPlanningPolicy;
    naturalKeys: readonly string[];
    desiredMoves: readonly RebalancingRouteProposal[];
    unresolvedDeficitUsdt: number;
    unusedTransferableSurplusUsdt: number;
    blockers: readonly string[];
    reasons: readonly string[];
  }): RebalancingDecisionPlan {
    return this.deepFreeze({
      version: "124.0" as const,
      generatedAt: input.now,
      state: input.state,
      currentAction: input.currentAction,
      policy: structuredClone(input.policy),
      naturalRebalanceCandidateKeys: [...input.naturalKeys],
      desiredMoves: [...input.desiredMoves],
      unresolvedDeficitUsdt: this.round(input.unresolvedDeficitUsdt),
      unusedTransferableSurplusUsdt:
        this.round(input.unusedTransferableSurplusUsdt),
      blockers: [...input.blockers],
      reasons: [...input.reasons],
      safety: {
        readOnly: true as const,
        reservedCapitalExcluded: true as const,
        neverDrainRuleApplied: true as const,
        activeExecutionProtected: true as const,
        partialFillRecoveryProtected: true as const,
        noTransferLoops: true as const,
        transferSubmissionAllowed: false as const,
        withdrawalSubmissionAllowed: false as const,
        liveOrderSubmissionAllowed: false as const,
      },
    });
  }

  private round(value: number): number {
    return Number.isFinite(value)
      ? Math.round((value + Number.EPSILON) * 100_000_000) / 100_000_000
      : 0;
  }

  private deepFreeze<T>(value: T): T {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const nested of Object.values(value)) this.deepFreeze(nested);
    }
    return value;
  }
}

export const rebalancingDecisionEngine =
  new RebalancingDecisionEngine();
