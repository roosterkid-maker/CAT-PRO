import {
  createHash,
} from "node:crypto";

import type {
  StrategyEvidenceStatus,
} from "../models/StrategyEvidenceStatus";

import {
  HEDGE_INVENTORY_MANAGEMENT_STRATEGY_ID,
} from "../models/StrategyMetadata";

import type {
  HedgeInventoryManagementConfiguration,
} from "./HedgeInventoryManagementConfiguration";

import type {
  HedgeInventoryShadowExecutionPlanAssessment,
  HedgeInventoryShadowExecutionPlanProposal,
  HedgeInventoryShadowExecutionPlanSnapshot,
} from "./HedgeInventoryShadowExecutionPlanPlanner";

export interface HedgeInventoryShadowFillEvidenceRecord {
  readonly id: string;
  readonly sourcePlanProposalId: string;
  readonly sourcePlanValidationHash: string;
  readonly routeId: string;
  readonly asset: string;
  readonly quoteAsset: string;
  readonly venue: string;
  readonly market: string;
  readonly side: "BUY" | "SELL";
  readonly requestedQuantity: number;
  readonly observedAt: number;
  readonly executableQuantity: number;
  readonly vwapPrice: number;
  readonly feeQuoteValue: number;
  readonly slippagePercent: number;
  readonly source: "SHADOW_ORDER_BOOK_REPLAY";
}

export interface HedgeInventoryShadowFillEvidenceSnapshot {
  readonly generatedAt: number;
  readonly evidenceStatus: StrategyEvidenceStatus;
  readonly records: readonly HedgeInventoryShadowFillEvidenceRecord[];
}

export interface HedgeInventoryShadowFillEvidenceSource {
  getShadowFillEvidence(
    now?: number,
  ): HedgeInventoryShadowFillEvidenceSnapshot | null;
}

export interface HedgeInventoryShadowFillSimulation {
  readonly id: string;
  readonly strategyId: "hedge-inventory-management";
  readonly sourcePlanProposalId: string;
  readonly sourcePlanValidationHash: string;
  readonly sourceEvidenceId: string;
  readonly routeId: string;
  readonly asset: string;
  readonly quoteAsset: string;
  readonly venue: string;
  readonly market: string;
  readonly side: "BUY" | "SELL";
  readonly requestedQuantity: number;
  readonly simulatedFilledQuantity: number;
  readonly simulatedResidualQuantity: number;
  readonly fillRatioPercent: number;
  readonly referencePrice: number;
  readonly simulatedVwapPrice: number;
  readonly simulatedGrossQuoteValue: number;
  readonly simulatedFeeQuoteValue: number;
  readonly quoteFlow: "COST" | "PROCEEDS";
  readonly simulatedQuoteValueAfterFees: number;
  readonly simulatedSlippagePercent: number;
  readonly simulatedSlippageQuoteValue: number;
  readonly residualExposureQuoteValue: number;
  readonly simulatedAt: number;
  readonly evidenceObservedAt: number;
  readonly method: "EXACT_MATCH_SHADOW_ORDER_BOOK_REPLAY_V22_14";
  readonly exchangeFill: false;
  readonly balanceMutationAuthorized: false;
  readonly capitalReservationMutationAuthorized: false;
  readonly executionAuthorized: false;
  readonly orderSubmissionAuthorized: false;
}

export type HedgeInventoryShadowFillSimulationAssessmentBlocker =
  | "PLAN_PROPOSAL_NOT_READY"
  | "PLAN_PROPOSAL_EXPIRED"
  | "FILL_EVIDENCE_NOT_FOUND"
  | "FILL_EVIDENCE_AMBIGUOUS"
  | "FILL_EVIDENCE_LINEAGE_MISMATCH"
  | "INVALID_FILL_EVIDENCE_CONTRACT"
  | "FILL_EVIDENCE_FROM_FUTURE"
  | "FILL_EVIDENCE_STALE"
  | "FILL_EVIDENCE_PRECEDES_PLAN_PROPOSAL"
  | "SIMULATED_SLIPPAGE_LIMIT_EXCEEDED";

export type HedgeInventoryShadowFillSimulationGlobalBlocker =
  | "STRATEGY_CONFIGURATION_NOT_READY"
  | "EXECUTION_PLAN_PROPOSAL_CONFIGURATION_NOT_READY"
  | "SHADOW_FILL_SIMULATION_CONFIGURATION_NOT_READY"
  | "EXECUTION_PLAN_PROPOSAL_EVIDENCE_UNAVAILABLE"
  | "SHADOW_FILL_EVIDENCE_UNAVAILABLE"
  | "INVALID_SHADOW_FILL_EVIDENCE_TIMESTAMP"
  | "SHADOW_FILL_EVIDENCE_FROM_FUTURE"
  | "SHADOW_FILL_EVIDENCE_STALE";

export type HedgeInventoryPostShadowFillSimulationGate =
  | "CANONICAL_EXECUTION_PLAN_NOT_CREATED"
  | "EXECUTION_RECONCILIATION_NOT_RUN"
  | "INTENT_EXECUTION_NOT_AUTHORIZED";

export interface HedgeInventoryShadowFillSimulationAssessment {
  readonly id: string;
  readonly planAssessmentId: string;
  readonly planProposalId: string | null;
  readonly intentId: string;
  readonly routeId: string;
  readonly asset: string;
  readonly quoteAsset: string;
  readonly venue: string;
  readonly market: string;
  readonly side: "BUY" | "SELL";
  readonly evidenceStatus: StrategyEvidenceStatus;
  readonly state:
    | "SIMULATED_FULL_FILL"
    | "SIMULATED_PARTIAL_FILL"
    | "SIMULATION_REJECTED"
    | "NOT_APPLICABLE"
    | "BLOCKED";
  readonly sourcePlanState: HedgeInventoryShadowExecutionPlanAssessment["state"];
  readonly evidenceAgeMs: number | null;
  readonly simulation: HedgeInventoryShadowFillSimulation | null;
  readonly blockers: readonly HedgeInventoryShadowFillSimulationAssessmentBlocker[];
  readonly remainingGates: readonly HedgeInventoryPostShadowFillSimulationGate[];
  readonly simulatedFillGenerated: boolean;
  readonly exchangeFillCreated: false;
  readonly executionReconciled: false;
  readonly executionAuthorized: false;
  readonly actionable: false;
}

export interface HedgeInventoryShadowFillSimulationSnapshot {
  readonly version: "22.14";
  readonly strategyId: "hedge-inventory-management";
  readonly generatedAt: number;
  readonly evidenceStatus: StrategyEvidenceStatus;
  readonly configurationState: string;
  readonly executionPlanProposalConfigurationState: string;
  readonly shadowFillSimulationConfigurationState: string;
  readonly sourceExecutionPlanProposalGeneratedAt: number | null;
  readonly sourceFillEvidenceGeneratedAt: number | null;
  readonly thresholds: {
    readonly maximumEvidenceAgeMs: number;
    readonly maximumSlippagePercent: number;
  };
  readonly summary: {
    readonly planProposalsEvaluated: number;
    readonly simulatedFullFills: number;
    readonly simulatedPartialFills: number;
    readonly rejectedSimulations: number;
    readonly notApplicablePlans: number;
    readonly blockedPlans: number;
    readonly totalRequestedQuantity: number;
    readonly totalSimulatedFilledQuantity: number;
    readonly totalSimulatedResidualQuantity: number;
    readonly totalSimulatedGrossQuoteValue: number;
    readonly totalSimulatedFeeQuoteValue: number;
    readonly totalSimulatedSlippageQuoteValue: number;
    readonly totalResidualExposureQuoteValue: number;
    readonly actualExchangeFills: 0;
    readonly canonicalExecutionPlansCreated: 0;
    readonly executablePlans: 0;
    readonly actionablePlans: 0;
  };
  readonly assessments: readonly HedgeInventoryShadowFillSimulationAssessment[];
  readonly blockers: readonly HedgeInventoryShadowFillSimulationGlobalBlocker[];
  readonly notes: readonly string[];
  readonly safety: {
    readonly readOnlyShadowSimulationOnly: true;
    readonly exactPlanAndEvidenceLineageRequired: true;
    readonly feesVwapSlippageAndResidualModeled: true;
    readonly exchangeFillCreated: false;
    readonly canonicalExecutionPlannerCalled: false;
    readonly executionReconciliationAllowed: false;
    readonly portfolioMutationAllowed: false;
    readonly balanceMutationAllowed: false;
    readonly capitalReservationMutationAllowed: false;
    readonly executionAuthorized: false;
    readonly paperExecutionAllowed: false;
    readonly liveExecutionAllowed: false;
    readonly orderSubmissionAllowed: false;
  };
}

const REMAINING_GATES = [
  "CANONICAL_EXECUTION_PLAN_NOT_CREATED",
  "EXECUTION_RECONCILIATION_NOT_RUN",
  "INTENT_EXECUTION_NOT_AUTHORIZED",
] as const satisfies readonly HedgeInventoryPostShadowFillSimulationGate[];

const NOTES = [
  "V22.14 models full or partial SHADOW fills only from fresh evidence exactly matching the V22.13 plan proposal identity, validation hash and complete route leg.",
  "VWAP, fee, adverse slippage and residual exposure are explicit modeled evidence; no exchange fill, balance, portfolio or capital-reservation state is mutated.",
  "A simulated fill is analytical evidence only and grants no canonical plan, reconciliation, execution, PAPER, LIVE or order-submission authority.",
] as const;

const SAFETY = {
  readOnlyShadowSimulationOnly: true,
  exactPlanAndEvidenceLineageRequired: true,
  feesVwapSlippageAndResidualModeled: true,
  exchangeFillCreated: false,
  canonicalExecutionPlannerCalled: false,
  executionReconciliationAllowed: false,
  portfolioMutationAllowed: false,
  balanceMutationAllowed: false,
  capitalReservationMutationAllowed: false,
  executionAuthorized: false,
  paperExecutionAllowed: false,
  liveExecutionAllowed: false,
  orderSubmissionAllowed: false,
} as const;

export class HedgeInventoryShadowFillSimulator {
  evaluate(
    configuration: HedgeInventoryManagementConfiguration,
    plans: HedgeInventoryShadowExecutionPlanSnapshot,
    fillEvidence: HedgeInventoryShadowFillEvidenceSnapshot | null,
    now = Date.now(),
  ): HedgeInventoryShadowFillSimulationSnapshot {
    this.validateNow(now);

    const globalBlocker =
      this.resolveGlobalBlocker(
        configuration,
        plans,
        fillEvidence,
        now,
      );

    if (globalBlocker !== null) {
      return this.unavailable(
        configuration,
        plans,
        fillEvidence,
        now,
        globalBlocker,
      );
    }

    const evidence =
      fillEvidence as HedgeInventoryShadowFillEvidenceSnapshot;

    const assessments =
      plans.assessments.map(
        (assessment) =>
          this.evaluateAssessment(
            configuration,
            assessment,
            evidence.records,
            now,
          ),
      );

    const simulations =
      assessments
        .map((assessment) => assessment.simulation)
        .filter(
          (simulation): simulation is HedgeInventoryShadowFillSimulation =>
            simulation !== null,
        );

    return immutableClone({
      version: "22.14",
      strategyId: HEDGE_INVENTORY_MANAGEMENT_STRATEGY_ID,
      generatedAt: now,
      evidenceStatus:
        assessments.length > 0
          ? "AVAILABLE"
          : "NO_DATA",
      configurationState: configuration.state,
      executionPlanProposalConfigurationState:
        configuration.executionPlanProposal.state,
      shadowFillSimulationConfigurationState:
        configuration.shadowFillSimulation.state,
      sourceExecutionPlanProposalGeneratedAt: plans.generatedAt,
      sourceFillEvidenceGeneratedAt: evidence.generatedAt,
      thresholds: this.thresholds(configuration),
      summary: {
        planProposalsEvaluated:
          assessments.filter(
            (assessment) => assessment.sourcePlanState === "PLAN_PROPOSAL_READY",
          ).length,
        simulatedFullFills:
          this.countState(assessments, "SIMULATED_FULL_FILL"),
        simulatedPartialFills:
          this.countState(assessments, "SIMULATED_PARTIAL_FILL"),
        rejectedSimulations:
          this.countState(assessments, "SIMULATION_REJECTED"),
        notApplicablePlans:
          this.countState(assessments, "NOT_APPLICABLE"),
        blockedPlans:
          this.countState(assessments, "BLOCKED"),
        totalRequestedQuantity:
          sum(simulations.map((simulation) => simulation.requestedQuantity)),
        totalSimulatedFilledQuantity:
          sum(simulations.map((simulation) => simulation.simulatedFilledQuantity)),
        totalSimulatedResidualQuantity:
          sum(simulations.map((simulation) => simulation.simulatedResidualQuantity)),
        totalSimulatedGrossQuoteValue:
          sum(simulations.map((simulation) => simulation.simulatedGrossQuoteValue)),
        totalSimulatedFeeQuoteValue:
          sum(simulations.map((simulation) => simulation.simulatedFeeQuoteValue)),
        totalSimulatedSlippageQuoteValue:
          sum(simulations.map((simulation) => simulation.simulatedSlippageQuoteValue)),
        totalResidualExposureQuoteValue:
          sum(simulations.map((simulation) => simulation.residualExposureQuoteValue)),
        actualExchangeFills: 0,
        canonicalExecutionPlansCreated: 0,
        executablePlans: 0,
        actionablePlans: 0,
      },
      assessments,
      blockers: [],
      notes: NOTES,
      safety: SAFETY,
    });
  }

  private evaluateAssessment(
    configuration: HedgeInventoryManagementConfiguration,
    assessment: HedgeInventoryShadowExecutionPlanAssessment,
    records: readonly HedgeInventoryShadowFillEvidenceRecord[],
    now: number,
  ): HedgeInventoryShadowFillSimulationAssessment {
    const proposal =
      assessment.proposal;

    const common = {
      id: `${assessment.id}:shadow-fill-simulation`,
      planAssessmentId: assessment.id,
      planProposalId: proposal?.id ?? null,
      intentId: assessment.intentId,
      routeId: assessment.routeId,
      asset: assessment.asset,
      quoteAsset: assessment.quoteAsset,
      venue: assessment.venue,
      market: assessment.market,
      side: assessment.side,
      sourcePlanState: assessment.state,
      exchangeFillCreated: false as const,
      executionReconciled: false as const,
      executionAuthorized: false as const,
      actionable: false as const,
    };

    if (assessment.state !== "PLAN_PROPOSAL_READY" || proposal === null) {
      if (assessment.state === "NOT_APPLICABLE") {
        return {
          ...common,
          evidenceStatus: "AVAILABLE",
          state: "NOT_APPLICABLE",
          evidenceAgeMs: null,
          simulation: null,
          blockers: ["PLAN_PROPOSAL_NOT_READY"],
          remainingGates: [],
          simulatedFillGenerated: false,
        };
      }

      return this.blocked(
        common,
        null,
        "PLAN_PROPOSAL_NOT_READY",
      );
    }

    if (proposal.expiresAt <= now) {
      return this.blocked(
        common,
        null,
        "PLAN_PROPOSAL_EXPIRED",
      );
    }

    const matches =
      records.filter(
        (record) => record.sourcePlanProposalId === proposal.id,
      );

    if (matches.length === 0) {
      return this.blocked(
        common,
        null,
        "FILL_EVIDENCE_NOT_FOUND",
      );
    }

    if (matches.length !== 1) {
      return this.blocked(
        common,
        null,
        "FILL_EVIDENCE_AMBIGUOUS",
      );
    }

    const record =
      matches[0]!;

    const evidenceAgeMs =
      now - record.observedAt;

    if (!this.lineageMatches(proposal, record)) {
      return this.blocked(
        common,
        evidenceAgeMs,
        "FILL_EVIDENCE_LINEAGE_MISMATCH",
      );
    }

    if (!this.isValidEvidenceContract(proposal, record)) {
      return this.blocked(
        common,
        evidenceAgeMs,
        "INVALID_FILL_EVIDENCE_CONTRACT",
      );
    }

    if (record.observedAt > now) {
      return this.blocked(
        common,
        evidenceAgeMs,
        "FILL_EVIDENCE_FROM_FUTURE",
      );
    }

    if (evidenceAgeMs > configuration.shadowFillSimulation.maximumEvidenceAgeMs!) {
      return this.blocked(
        common,
        evidenceAgeMs,
        "FILL_EVIDENCE_STALE",
      );
    }

    if (record.observedAt < proposal.createdAt) {
      return this.blocked(
        common,
        evidenceAgeMs,
        "FILL_EVIDENCE_PRECEDES_PLAN_PROPOSAL",
      );
    }

    const slippagePercent =
      this.adverseSlippagePercent(
        proposal,
        record.vwapPrice,
      );

    if (!approximatelyEqual(record.slippagePercent, slippagePercent)) {
      return this.blocked(
        common,
        evidenceAgeMs,
        "INVALID_FILL_EVIDENCE_CONTRACT",
      );
    }

    if (slippagePercent > configuration.shadowFillSimulation.maximumSlippagePercent!) {
      return {
        ...common,
        evidenceStatus: "AVAILABLE",
        state: "SIMULATION_REJECTED",
        evidenceAgeMs,
        simulation: null,
        blockers: ["SIMULATED_SLIPPAGE_LIMIT_EXCEEDED"],
        remainingGates: [],
        simulatedFillGenerated: false,
      };
    }

    const simulation =
      this.createSimulation(
        proposal,
        record,
        slippagePercent,
        now,
      );

    return {
      ...common,
      evidenceStatus: "AVAILABLE",
      state:
        approximatelyEqual(
          simulation.simulatedResidualQuantity,
          0,
        )
          ? "SIMULATED_FULL_FILL"
          : "SIMULATED_PARTIAL_FILL",
      evidenceAgeMs,
      simulation,
      blockers: [],
      remainingGates: REMAINING_GATES,
      simulatedFillGenerated: true,
    };
  }

  private createSimulation(
    proposal: HedgeInventoryShadowExecutionPlanProposal,
    record: HedgeInventoryShadowFillEvidenceRecord,
    slippagePercent: number,
    now: number,
  ): HedgeInventoryShadowFillSimulation {
    const filledQuantity =
      record.executableQuantity;
    const residualQuantity =
      approximatelyEqual(filledQuantity, proposal.leg.quantity)
        ? 0
        : proposal.leg.quantity - filledQuantity;
    const grossQuoteValue =
      filledQuantity * record.vwapPrice;
    const quoteFlow =
      proposal.leg.side === "BUY"
        ? "COST" as const
        : "PROCEEDS" as const;
    const quoteValueAfterFees =
      quoteFlow === "COST"
        ? grossQuoteValue + record.feeQuoteValue
        : grossQuoteValue - record.feeQuoteValue;
    const adversePriceDifference =
      proposal.leg.side === "BUY"
        ? Math.max(0, record.vwapPrice - proposal.leg.referencePrice)
        : Math.max(0, proposal.leg.referencePrice - record.vwapPrice);

    const payload = {
      strategyId: HEDGE_INVENTORY_MANAGEMENT_STRATEGY_ID,
      sourcePlanProposalId: proposal.id,
      sourcePlanValidationHash: proposal.validationHash,
      sourceEvidenceId: record.id,
      routeId: proposal.routeId,
      asset: proposal.asset,
      quoteAsset: proposal.quoteAsset,
      venue: proposal.leg.venue,
      market: proposal.leg.market,
      side: proposal.leg.side,
      requestedQuantity: proposal.leg.quantity,
      simulatedFilledQuantity: filledQuantity,
      simulatedResidualQuantity: residualQuantity,
      fillRatioPercent: (filledQuantity / proposal.leg.quantity) * 100,
      referencePrice: proposal.leg.referencePrice,
      simulatedVwapPrice: record.vwapPrice,
      simulatedGrossQuoteValue: grossQuoteValue,
      simulatedFeeQuoteValue: record.feeQuoteValue,
      quoteFlow,
      simulatedQuoteValueAfterFees: quoteValueAfterFees,
      simulatedSlippagePercent: slippagePercent,
      simulatedSlippageQuoteValue: adversePriceDifference * filledQuantity,
      residualExposureQuoteValue: residualQuantity * proposal.leg.referencePrice,
      simulatedAt: now,
      evidenceObservedAt: record.observedAt,
      method: "EXACT_MATCH_SHADOW_ORDER_BOOK_REPLAY_V22_14" as const,
      exchangeFill: false as const,
      balanceMutationAuthorized: false as const,
      capitalReservationMutationAuthorized: false as const,
      executionAuthorized: false as const,
      orderSubmissionAuthorized: false as const,
    };

    const validationHash =
      createHash("sha256")
        .update(JSON.stringify(payload), "utf8")
        .digest("hex");

    return immutableClone({
      id: `hedge-shadow-fill-simulation-${validationHash}`,
      ...payload,
    });
  }

  private lineageMatches(
    proposal: HedgeInventoryShadowExecutionPlanProposal,
    record: HedgeInventoryShadowFillEvidenceRecord,
  ): boolean {
    return (
      record.sourcePlanValidationHash === proposal.validationHash &&
      record.routeId === proposal.routeId &&
      record.asset === proposal.asset &&
      record.quoteAsset === proposal.quoteAsset &&
      record.venue === proposal.leg.venue &&
      record.market === proposal.leg.market &&
      record.side === proposal.leg.side &&
      approximatelyEqual(record.requestedQuantity, proposal.leg.quantity)
    );
  }

  private isValidEvidenceContract(
    proposal: HedgeInventoryShadowExecutionPlanProposal,
    record: HedgeInventoryShadowFillEvidenceRecord,
  ): boolean {
    const requiredText = [
      record.id,
      record.sourcePlanProposalId,
      record.sourcePlanValidationHash,
      record.routeId,
      record.asset,
      record.quoteAsset,
      record.venue,
      record.market,
    ];

    return (
      requiredText.every((value) => value.trim().length > 0) &&
      record.source === "SHADOW_ORDER_BOOK_REPLAY" &&
      Number.isFinite(record.observedAt) &&
      record.observedAt > 0 &&
      Number.isFinite(record.requestedQuantity) &&
      record.requestedQuantity > 0 &&
      Number.isFinite(record.executableQuantity) &&
      record.executableQuantity > 0 &&
      record.executableQuantity <= proposal.leg.quantity &&
      Number.isFinite(record.vwapPrice) &&
      record.vwapPrice > 0 &&
      Number.isFinite(record.feeQuoteValue) &&
      record.feeQuoteValue >= 0 &&
      record.feeQuoteValue <= record.executableQuantity * record.vwapPrice &&
      Number.isFinite(record.slippagePercent) &&
      record.slippagePercent >= 0
    );
  }

  private adverseSlippagePercent(
    proposal: HedgeInventoryShadowExecutionPlanProposal,
    vwapPrice: number,
  ): number {
    const priceDifference =
      proposal.leg.side === "BUY"
        ? Math.max(0, vwapPrice - proposal.leg.referencePrice)
        : Math.max(0, proposal.leg.referencePrice - vwapPrice);

    return (
      priceDifference /
      proposal.leg.referencePrice
    ) * 100;
  }

  private blocked(
    common: Omit<
      HedgeInventoryShadowFillSimulationAssessment,
      | "evidenceStatus"
      | "state"
      | "evidenceAgeMs"
      | "simulation"
      | "blockers"
      | "remainingGates"
      | "simulatedFillGenerated"
    >,
    evidenceAgeMs: number | null,
    blocker: HedgeInventoryShadowFillSimulationAssessmentBlocker,
  ): HedgeInventoryShadowFillSimulationAssessment {
    return {
      ...common,
      evidenceStatus: "NO_DATA",
      state: "BLOCKED",
      evidenceAgeMs,
      simulation: null,
      blockers: [blocker],
      remainingGates: [],
      simulatedFillGenerated: false,
    };
  }

  private resolveGlobalBlocker(
    configuration: HedgeInventoryManagementConfiguration,
    plans: HedgeInventoryShadowExecutionPlanSnapshot,
    fillEvidence: HedgeInventoryShadowFillEvidenceSnapshot | null,
    now: number,
  ): HedgeInventoryShadowFillSimulationGlobalBlocker | null {
    if (configuration.state !== "FOUNDATION_READY") {
      return "STRATEGY_CONFIGURATION_NOT_READY";
    }
    if (configuration.executionPlanProposal.state !== "READY") {
      return "EXECUTION_PLAN_PROPOSAL_CONFIGURATION_NOT_READY";
    }
    if (configuration.shadowFillSimulation.state !== "READY") {
      return "SHADOW_FILL_SIMULATION_CONFIGURATION_NOT_READY";
    }
    if (plans.evidenceStatus !== "AVAILABLE") {
      return "EXECUTION_PLAN_PROPOSAL_EVIDENCE_UNAVAILABLE";
    }
    if (
      fillEvidence === null ||
      fillEvidence.evidenceStatus !== "AVAILABLE"
    ) {
      return "SHADOW_FILL_EVIDENCE_UNAVAILABLE";
    }
    if (
      !Number.isFinite(fillEvidence.generatedAt) ||
      fillEvidence.generatedAt <= 0
    ) {
      return "INVALID_SHADOW_FILL_EVIDENCE_TIMESTAMP";
    }
    if (fillEvidence.generatedAt > now) {
      return "SHADOW_FILL_EVIDENCE_FROM_FUTURE";
    }
    if (
      now - fillEvidence.generatedAt >
        configuration.shadowFillSimulation.maximumEvidenceAgeMs!
    ) {
      return "SHADOW_FILL_EVIDENCE_STALE";
    }
    return null;
  }

  private unavailable(
    configuration: HedgeInventoryManagementConfiguration,
    plans: HedgeInventoryShadowExecutionPlanSnapshot,
    fillEvidence: HedgeInventoryShadowFillEvidenceSnapshot | null,
    now: number,
    blocker: HedgeInventoryShadowFillSimulationGlobalBlocker,
  ): HedgeInventoryShadowFillSimulationSnapshot {
    return immutableClone({
      version: "22.14",
      strategyId: HEDGE_INVENTORY_MANAGEMENT_STRATEGY_ID,
      generatedAt: now,
      evidenceStatus: "NO_DATA",
      configurationState: configuration.state,
      executionPlanProposalConfigurationState:
        configuration.executionPlanProposal.state,
      shadowFillSimulationConfigurationState:
        configuration.shadowFillSimulation.state,
      sourceExecutionPlanProposalGeneratedAt:
        Number.isFinite(plans.generatedAt)
          ? plans.generatedAt
          : null,
      sourceFillEvidenceGeneratedAt:
        fillEvidence && Number.isFinite(fillEvidence.generatedAt)
          ? fillEvidence.generatedAt
          : null,
      thresholds: this.thresholds(configuration),
      summary: {
        planProposalsEvaluated: 0,
        simulatedFullFills: 0,
        simulatedPartialFills: 0,
        rejectedSimulations: 0,
        notApplicablePlans: 0,
        blockedPlans: 0,
        totalRequestedQuantity: 0,
        totalSimulatedFilledQuantity: 0,
        totalSimulatedResidualQuantity: 0,
        totalSimulatedGrossQuoteValue: 0,
        totalSimulatedFeeQuoteValue: 0,
        totalSimulatedSlippageQuoteValue: 0,
        totalResidualExposureQuoteValue: 0,
        actualExchangeFills: 0,
        canonicalExecutionPlansCreated: 0,
        executablePlans: 0,
        actionablePlans: 0,
      },
      assessments: [],
      blockers: [blocker],
      notes: NOTES,
      safety: SAFETY,
    });
  }

  private thresholds(
    configuration: HedgeInventoryManagementConfiguration,
  ): HedgeInventoryShadowFillSimulationSnapshot["thresholds"] {
    return {
      maximumEvidenceAgeMs:
        configuration.shadowFillSimulation.maximumEvidenceAgeMs ?? 0,
      maximumSlippagePercent:
        configuration.shadowFillSimulation.maximumSlippagePercent ?? 0,
    };
  }

  private countState(
    assessments: readonly HedgeInventoryShadowFillSimulationAssessment[],
    state: HedgeInventoryShadowFillSimulationAssessment["state"],
  ): number {
    return assessments.filter(
      (assessment) => assessment.state === state,
    ).length;
  }

  private validateNow(now: number): void {
    if (!Number.isFinite(now) || now <= 0) {
      throw new Error(
        "Hedge SHADOW fill-simulation timestamp must be positive and finite.",
      );
    }
  }
}

function approximatelyEqual(first: number, second: number): boolean {
  const scale =
    Math.max(1, Math.abs(first), Math.abs(second));

  return Math.abs(first - second) <= Number.EPSILON * scale * 16;
}

function sum(values: readonly number[]): number {
  return values.reduce(
    (total, value) => total + value,
    0,
  );
}

function immutableClone<T>(value: T): T {
  return deepFreeze(
    structuredClone(value),
  );
}

function deepFreeze<T>(value: T): T {
  if (
    value === null ||
    typeof value !== "object" ||
    Object.isFrozen(value)
  ) {
    return value;
  }

  for (const nested of Object.values(value)) {
    deepFreeze(nested);
  }

  return Object.freeze(value);
}

