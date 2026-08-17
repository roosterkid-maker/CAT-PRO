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
  HedgeInventoryShadowFillSimulation,
  HedgeInventoryShadowFillSimulationAssessment,
  HedgeInventoryShadowFillSimulationSnapshot,
} from "./HedgeInventoryShadowFillSimulator";

export interface HedgeInventoryResidualReconciliationEvidenceRecord {
  readonly id: string;
  readonly sourceSimulationId: string;
  readonly sourcePlanProposalId: string;
  readonly sourcePlanValidationHash: string;
  readonly routeId: string;
  readonly asset: string;
  readonly quoteAsset: string;
  readonly venue: string;
  readonly market: string;
  readonly side: "BUY" | "SELL";
  readonly observedAt: number;
  readonly requestedQuantity: number;
  readonly filledQuantity: number;
  readonly residualQuantity: number;
  readonly referencePrice: number;
  readonly residualExposureQuoteValue: number;
  readonly source: "SHADOW_LEDGER_REPLAY";
}

export interface HedgeInventoryResidualReconciliationEvidenceSnapshot {
  readonly generatedAt: number;
  readonly evidenceStatus: StrategyEvidenceStatus;
  readonly records: readonly HedgeInventoryResidualReconciliationEvidenceRecord[];
}

export interface HedgeInventoryResidualReconciliationEvidenceSource {
  getResidualReconciliationEvidence(
    now?: number,
  ): HedgeInventoryResidualReconciliationEvidenceSnapshot | null;
}

export type HedgeInventoryResidualRecoverySeverity =
  | "NONE"
  | "WARNING"
  | "CRITICAL";

export type HedgeInventoryResidualRecommendedAction =
  | "NONE"
  | "REVIEW_RESIDUAL_HEDGE"
  | "ESCALATE_RESIDUAL_EXPOSURE";

export interface HedgeInventoryResidualReconciliationRecord {
  readonly id: string;
  readonly strategyId: "hedge-inventory-management";
  readonly sourceSimulationId: string;
  readonly sourcePlanProposalId: string;
  readonly sourceEvidenceId: string;
  readonly routeId: string;
  readonly asset: string;
  readonly quoteAsset: string;
  readonly venue: string;
  readonly market: string;
  readonly side: "BUY" | "SELL";
  readonly residualDirection: "LONG" | "SHORT" | "FLAT";
  readonly requestedQuantity: number;
  readonly reconciledFilledQuantity: number;
  readonly reconciledResidualQuantity: number;
  readonly referencePrice: number;
  readonly reconciledResidualExposureQuoteValue: number;
  readonly recoveryRequired: boolean;
  readonly severity: HedgeInventoryResidualRecoverySeverity;
  readonly recommendedAction: HedgeInventoryResidualRecommendedAction;
  readonly reconciledAt: number;
  readonly evidenceObservedAt: number;
  readonly method: "EXACT_MATCH_SHADOW_LEDGER_RECONCILIATION_V22_15";
  readonly liveReconciliationRecordCreated: false;
  readonly recoveryIncidentCreated: false;
  readonly recoveryActionAuthorized: false;
  readonly balanceMutationAuthorized: false;
  readonly executionAuthorized: false;
  readonly orderSubmissionAuthorized: false;
}

export type HedgeInventoryResidualReconciliationAssessmentBlocker =
  | "FILL_SIMULATION_NOT_ELIGIBLE"
  | "RECONCILIATION_EVIDENCE_NOT_FOUND"
  | "RECONCILIATION_EVIDENCE_AMBIGUOUS"
  | "RECONCILIATION_EVIDENCE_LINEAGE_MISMATCH"
  | "INVALID_RECONCILIATION_EVIDENCE_CONTRACT"
  | "RECONCILIATION_EVIDENCE_FROM_FUTURE"
  | "RECONCILIATION_EVIDENCE_STALE"
  | "RECONCILIATION_EVIDENCE_PRECEDES_SIMULATION"
  | "RECONCILIATION_QUANTITY_OR_VALUE_DRIFT";

export type HedgeInventoryResidualReconciliationGlobalBlocker =
  | "STRATEGY_CONFIGURATION_NOT_READY"
  | "SHADOW_FILL_SIMULATION_CONFIGURATION_NOT_READY"
  | "RESIDUAL_RECONCILIATION_CONFIGURATION_NOT_READY"
  | "SHADOW_FILL_SIMULATION_EVIDENCE_UNAVAILABLE"
  | "RESIDUAL_RECONCILIATION_EVIDENCE_UNAVAILABLE"
  | "INVALID_RESIDUAL_RECONCILIATION_EVIDENCE_TIMESTAMP"
  | "RESIDUAL_RECONCILIATION_EVIDENCE_FROM_FUTURE"
  | "RESIDUAL_RECONCILIATION_EVIDENCE_STALE";

export type HedgeInventoryPostResidualReconciliationGate =
  | "CANONICAL_EXECUTION_PLAN_NOT_CREATED"
  | "RECOVERY_ACTION_NOT_CREATED"
  | "INTENT_EXECUTION_NOT_AUTHORIZED";

export interface HedgeInventoryResidualReconciliationAssessment {
  readonly id: string;
  readonly fillSimulationAssessmentId: string;
  readonly simulationId: string | null;
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
    | "RECONCILED_CLOSED"
    | "RECOVERY_REQUIRED"
    | "RECONCILIATION_REJECTED"
    | "NOT_APPLICABLE"
    | "BLOCKED";
  readonly sourceFillSimulationState: HedgeInventoryShadowFillSimulationAssessment["state"];
  readonly evidenceAgeMs: number | null;
  readonly reconciliation: HedgeInventoryResidualReconciliationRecord | null;
  readonly recoveryRequired: boolean | null;
  readonly blockers: readonly HedgeInventoryResidualReconciliationAssessmentBlocker[];
  readonly remainingGates: readonly HedgeInventoryPostResidualReconciliationGate[];
  readonly liveReconciliationRecordCreated: false;
  readonly recoveryIncidentCreated: false;
  readonly recoveryActionCreated: false;
  readonly executionAuthorized: false;
  readonly actionable: false;
}

export interface HedgeInventoryResidualReconciliationSnapshot {
  readonly version: "22.15";
  readonly strategyId: "hedge-inventory-management";
  readonly generatedAt: number;
  readonly evidenceStatus: StrategyEvidenceStatus;
  readonly configurationState: string;
  readonly shadowFillSimulationConfigurationState: string;
  readonly residualReconciliationConfigurationState: string;
  readonly sourceFillSimulationGeneratedAt: number | null;
  readonly sourceReconciliationEvidenceGeneratedAt: number | null;
  readonly thresholds: {
    readonly maximumEvidenceAgeMs: number;
    readonly residualQuantityTolerance: number;
    readonly criticalResidualExposureQuoteValue: number;
  };
  readonly summary: {
    readonly eligibleSimulations: number;
    readonly reconciledClosed: number;
    readonly recoveryRequired: number;
    readonly warningResiduals: number;
    readonly criticalResiduals: number;
    readonly rejectedReconciliations: number;
    readonly notApplicableSimulations: number;
    readonly blockedSimulations: number;
    readonly totalReconciledResidualQuantity: number;
    readonly totalReconciledResidualExposureQuoteValue: number;
    readonly liveReconciliationRecordsCreated: 0;
    readonly recoveryIncidentsCreated: 0;
    readonly recoveryActionsCreated: 0;
    readonly executableRecoveryActions: 0;
    readonly actionableRecoveryActions: 0;
  };
  readonly assessments: readonly HedgeInventoryResidualReconciliationAssessment[];
  readonly blockers: readonly HedgeInventoryResidualReconciliationGlobalBlocker[];
  readonly notes: readonly string[];
  readonly safety: {
    readonly readOnlyShadowReconciliationOnly: true;
    readonly exactSimulationAndLedgerLineageRequired: true;
    readonly liveReconciliationEngineCalled: false;
    readonly executionRecoveryEngineCalled: false;
    readonly recoveryIncidentCreationAllowed: false;
    readonly recoveryActionCreationAllowed: false;
    readonly portfolioMutationAllowed: false;
    readonly balanceMutationAllowed: false;
    readonly capitalReservationMutationAllowed: false;
    readonly executionAuthorized: false;
    readonly paperExecutionAllowed: false;
    readonly liveExecutionAllowed: false;
    readonly orderSubmissionAllowed: false;
  };
}

const CLOSED_GATES = [
  "CANONICAL_EXECUTION_PLAN_NOT_CREATED",
  "INTENT_EXECUTION_NOT_AUTHORIZED",
] as const satisfies readonly HedgeInventoryPostResidualReconciliationGate[];

const RECOVERY_GATES = [
  "CANONICAL_EXECUTION_PLAN_NOT_CREATED",
  "RECOVERY_ACTION_NOT_CREATED",
  "INTENT_EXECUTION_NOT_AUTHORIZED",
] as const satisfies readonly HedgeInventoryPostResidualReconciliationGate[];

const NOTES = [
  "V22.15 reconciles only eligible V22.14 SHADOW simulations against fresh, exact-lineage SHADOW ledger replay evidence.",
  "A non-dust residual is classified as recovery-required evidence; warning or critical severity does not create a recovery incident or authorize a recovery action.",
  "The LIVE reconciliation and execution-recovery engines are not dependencies and no portfolio, balance, capital, PAPER, LIVE or order state is mutated.",
] as const;

const SAFETY = {
  readOnlyShadowReconciliationOnly: true,
  exactSimulationAndLedgerLineageRequired: true,
  liveReconciliationEngineCalled: false,
  executionRecoveryEngineCalled: false,
  recoveryIncidentCreationAllowed: false,
  recoveryActionCreationAllowed: false,
  portfolioMutationAllowed: false,
  balanceMutationAllowed: false,
  capitalReservationMutationAllowed: false,
  executionAuthorized: false,
  paperExecutionAllowed: false,
  liveExecutionAllowed: false,
  orderSubmissionAllowed: false,
} as const;

export class HedgeInventoryResidualReconciliationEvaluator {
  evaluate(
    configuration: HedgeInventoryManagementConfiguration,
    simulations: HedgeInventoryShadowFillSimulationSnapshot,
    evidence: HedgeInventoryResidualReconciliationEvidenceSnapshot | null,
    now = Date.now(),
  ): HedgeInventoryResidualReconciliationSnapshot {
    this.validateNow(now);

    const globalBlocker =
      this.resolveGlobalBlocker(
        configuration,
        simulations,
        evidence,
        now,
      );

    if (globalBlocker !== null) {
      return this.unavailable(
        configuration,
        simulations,
        evidence,
        now,
        globalBlocker,
      );
    }

    const source =
      evidence as HedgeInventoryResidualReconciliationEvidenceSnapshot;
    const assessments =
      simulations.assessments.map(
        (assessment) =>
          this.evaluateAssessment(
            configuration,
            assessment,
            source.records,
            now,
          ),
      );
    const reconciliations =
      assessments
        .map((assessment) => assessment.reconciliation)
        .filter(
          (record): record is HedgeInventoryResidualReconciliationRecord =>
            record !== null,
        );

    return immutableClone({
      version: "22.15",
      strategyId: HEDGE_INVENTORY_MANAGEMENT_STRATEGY_ID,
      generatedAt: now,
      evidenceStatus:
        assessments.length > 0
          ? "AVAILABLE"
          : "NO_DATA",
      configurationState: configuration.state,
      shadowFillSimulationConfigurationState:
        configuration.shadowFillSimulation.state,
      residualReconciliationConfigurationState:
        configuration.residualReconciliation.state,
      sourceFillSimulationGeneratedAt: simulations.generatedAt,
      sourceReconciliationEvidenceGeneratedAt: source.generatedAt,
      thresholds: this.thresholds(configuration),
      summary: {
        eligibleSimulations:
          assessments.filter(
            (assessment) =>
              assessment.sourceFillSimulationState === "SIMULATED_FULL_FILL" ||
              assessment.sourceFillSimulationState === "SIMULATED_PARTIAL_FILL",
          ).length,
        reconciledClosed: this.countState(assessments, "RECONCILED_CLOSED"),
        recoveryRequired: this.countState(assessments, "RECOVERY_REQUIRED"),
        warningResiduals:
          reconciliations.filter((record) => record.severity === "WARNING").length,
        criticalResiduals:
          reconciliations.filter((record) => record.severity === "CRITICAL").length,
        rejectedReconciliations:
          this.countState(assessments, "RECONCILIATION_REJECTED"),
        notApplicableSimulations:
          this.countState(assessments, "NOT_APPLICABLE"),
        blockedSimulations: this.countState(assessments, "BLOCKED"),
        totalReconciledResidualQuantity:
          sum(reconciliations.map((record) => record.reconciledResidualQuantity)),
        totalReconciledResidualExposureQuoteValue:
          sum(reconciliations.map((record) => record.reconciledResidualExposureQuoteValue)),
        liveReconciliationRecordsCreated: 0,
        recoveryIncidentsCreated: 0,
        recoveryActionsCreated: 0,
        executableRecoveryActions: 0,
        actionableRecoveryActions: 0,
      },
      assessments,
      blockers: [],
      notes: NOTES,
      safety: SAFETY,
    });
  }

  private evaluateAssessment(
    configuration: HedgeInventoryManagementConfiguration,
    assessment: HedgeInventoryShadowFillSimulationAssessment,
    evidence: readonly HedgeInventoryResidualReconciliationEvidenceRecord[],
    now: number,
  ): HedgeInventoryResidualReconciliationAssessment {
    const simulation = assessment.simulation;
    const common = {
      id: `${assessment.id}:residual-reconciliation`,
      fillSimulationAssessmentId: assessment.id,
      simulationId: simulation?.id ?? null,
      planProposalId: assessment.planProposalId,
      intentId: assessment.intentId,
      routeId: assessment.routeId,
      asset: assessment.asset,
      quoteAsset: assessment.quoteAsset,
      venue: assessment.venue,
      market: assessment.market,
      side: assessment.side,
      sourceFillSimulationState: assessment.state,
      liveReconciliationRecordCreated: false as const,
      recoveryIncidentCreated: false as const,
      recoveryActionCreated: false as const,
      executionAuthorized: false as const,
      actionable: false as const,
    };

    if (
      simulation === null ||
      (
        assessment.state !== "SIMULATED_FULL_FILL" &&
        assessment.state !== "SIMULATED_PARTIAL_FILL"
      )
    ) {
      if (
        assessment.state === "NOT_APPLICABLE" ||
        assessment.state === "SIMULATION_REJECTED"
      ) {
        return {
          ...common,
          evidenceStatus: "AVAILABLE",
          state: "NOT_APPLICABLE",
          evidenceAgeMs: null,
          reconciliation: null,
          recoveryRequired: null,
          blockers: ["FILL_SIMULATION_NOT_ELIGIBLE"],
          remainingGates: [],
        };
      }

      return this.blocked(
        common,
        null,
        "FILL_SIMULATION_NOT_ELIGIBLE",
      );
    }

    const matches =
      evidence.filter(
        (record) => record.sourceSimulationId === simulation.id,
      );

    if (matches.length === 0) {
      return this.blocked(common, null, "RECONCILIATION_EVIDENCE_NOT_FOUND");
    }
    if (matches.length !== 1) {
      return this.blocked(common, null, "RECONCILIATION_EVIDENCE_AMBIGUOUS");
    }

    const record = matches[0]!;
    const evidenceAgeMs = now - record.observedAt;

    if (!this.lineageMatches(simulation, record)) {
      return this.blocked(
        common,
        evidenceAgeMs,
        "RECONCILIATION_EVIDENCE_LINEAGE_MISMATCH",
      );
    }
    if (!this.isValidContract(record)) {
      return this.blocked(
        common,
        evidenceAgeMs,
        "INVALID_RECONCILIATION_EVIDENCE_CONTRACT",
      );
    }
    if (record.observedAt > now) {
      return this.blocked(
        common,
        evidenceAgeMs,
        "RECONCILIATION_EVIDENCE_FROM_FUTURE",
      );
    }
    if (evidenceAgeMs > configuration.residualReconciliation.maximumEvidenceAgeMs!) {
      return this.blocked(
        common,
        evidenceAgeMs,
        "RECONCILIATION_EVIDENCE_STALE",
      );
    }
    if (record.observedAt < simulation.simulatedAt) {
      return this.blocked(
        common,
        evidenceAgeMs,
        "RECONCILIATION_EVIDENCE_PRECEDES_SIMULATION",
      );
    }
    if (!this.valuesMatch(simulation, record)) {
      return {
        ...common,
        evidenceStatus: "AVAILABLE",
        state: "RECONCILIATION_REJECTED",
        evidenceAgeMs,
        reconciliation: null,
        recoveryRequired: null,
        blockers: ["RECONCILIATION_QUANTITY_OR_VALUE_DRIFT"],
        remainingGates: RECOVERY_GATES,
      };
    }

    const recoveryRequired =
      record.residualQuantity >
        configuration.residualReconciliation.residualQuantityTolerance!;
    const severity:
      HedgeInventoryResidualRecoverySeverity =
      !recoveryRequired
        ? "NONE"
        : record.residualExposureQuoteValue >=
            configuration.residualReconciliation.criticalResidualExposureQuoteValue!
          ? "CRITICAL"
          : "WARNING";
    const recommendedAction:
      HedgeInventoryResidualRecommendedAction =
      severity === "NONE"
        ? "NONE"
        : severity === "CRITICAL"
          ? "ESCALATE_RESIDUAL_EXPOSURE"
          : "REVIEW_RESIDUAL_HEDGE";
    const reconciliation =
      this.createRecord(
        simulation,
        record,
        recoveryRequired,
        severity,
        recommendedAction,
        now,
      );

    return {
      ...common,
      evidenceStatus: "AVAILABLE",
      state: recoveryRequired ? "RECOVERY_REQUIRED" : "RECONCILED_CLOSED",
      evidenceAgeMs,
      reconciliation,
      recoveryRequired,
      blockers: [],
      remainingGates: recoveryRequired ? RECOVERY_GATES : CLOSED_GATES,
    };
  }

  private createRecord(
    simulation: HedgeInventoryShadowFillSimulation,
    evidence: HedgeInventoryResidualReconciliationEvidenceRecord,
    recoveryRequired: boolean,
    severity: HedgeInventoryResidualRecoverySeverity,
    recommendedAction: HedgeInventoryResidualRecommendedAction,
    now: number,
  ): HedgeInventoryResidualReconciliationRecord {
    const residualDirection =
      !recoveryRequired
        ? "FLAT" as const
        : simulation.side === "SELL"
          ? "LONG" as const
          : "SHORT" as const;
    const payload = {
      strategyId: HEDGE_INVENTORY_MANAGEMENT_STRATEGY_ID,
      sourceSimulationId: simulation.id,
      sourcePlanProposalId: simulation.sourcePlanProposalId,
      sourceEvidenceId: evidence.id,
      routeId: simulation.routeId,
      asset: simulation.asset,
      quoteAsset: simulation.quoteAsset,
      venue: simulation.venue,
      market: simulation.market,
      side: simulation.side,
      residualDirection,
      requestedQuantity: evidence.requestedQuantity,
      reconciledFilledQuantity: evidence.filledQuantity,
      reconciledResidualQuantity: evidence.residualQuantity,
      referencePrice: evidence.referencePrice,
      reconciledResidualExposureQuoteValue: evidence.residualExposureQuoteValue,
      recoveryRequired,
      severity,
      recommendedAction,
      reconciledAt: now,
      evidenceObservedAt: evidence.observedAt,
      method: "EXACT_MATCH_SHADOW_LEDGER_RECONCILIATION_V22_15" as const,
      liveReconciliationRecordCreated: false as const,
      recoveryIncidentCreated: false as const,
      recoveryActionAuthorized: false as const,
      balanceMutationAuthorized: false as const,
      executionAuthorized: false as const,
      orderSubmissionAuthorized: false as const,
    };
    const hash =
      createHash("sha256")
        .update(JSON.stringify(payload), "utf8")
        .digest("hex");

    return immutableClone({
      id: `hedge-shadow-residual-reconciliation-${hash}`,
      ...payload,
    });
  }

  private lineageMatches(
    simulation: HedgeInventoryShadowFillSimulation,
    evidence: HedgeInventoryResidualReconciliationEvidenceRecord,
  ): boolean {
    return (
      evidence.sourcePlanProposalId === simulation.sourcePlanProposalId &&
      evidence.sourcePlanValidationHash === simulation.sourcePlanValidationHash &&
      evidence.routeId === simulation.routeId &&
      evidence.asset === simulation.asset &&
      evidence.quoteAsset === simulation.quoteAsset &&
      evidence.venue === simulation.venue &&
      evidence.market === simulation.market &&
      evidence.side === simulation.side
    );
  }

  private isValidContract(
    evidence: HedgeInventoryResidualReconciliationEvidenceRecord,
  ): boolean {
    const text = [
      evidence.id,
      evidence.sourceSimulationId,
      evidence.sourcePlanProposalId,
      evidence.sourcePlanValidationHash,
      evidence.routeId,
      evidence.asset,
      evidence.quoteAsset,
      evidence.venue,
      evidence.market,
    ];
    const numbers = [
      evidence.observedAt,
      evidence.requestedQuantity,
      evidence.filledQuantity,
      evidence.residualQuantity,
      evidence.referencePrice,
      evidence.residualExposureQuoteValue,
    ];

    return (
      text.every((value) => value.trim().length > 0) &&
      evidence.source === "SHADOW_LEDGER_REPLAY" &&
      numbers.every(Number.isFinite) &&
      evidence.observedAt > 0 &&
      evidence.requestedQuantity > 0 &&
      evidence.filledQuantity > 0 &&
      evidence.residualQuantity >= 0 &&
      evidence.referencePrice > 0 &&
      evidence.residualExposureQuoteValue >= 0 &&
      approximatelyEqual(
        evidence.filledQuantity + evidence.residualQuantity,
        evidence.requestedQuantity,
      )
    );
  }

  private valuesMatch(
    simulation: HedgeInventoryShadowFillSimulation,
    evidence: HedgeInventoryResidualReconciliationEvidenceRecord,
  ): boolean {
    return (
      approximatelyEqual(evidence.requestedQuantity, simulation.requestedQuantity) &&
      approximatelyEqual(evidence.filledQuantity, simulation.simulatedFilledQuantity) &&
      approximatelyEqual(evidence.residualQuantity, simulation.simulatedResidualQuantity) &&
      approximatelyEqual(evidence.referencePrice, simulation.referencePrice) &&
      approximatelyEqual(
        evidence.residualExposureQuoteValue,
        simulation.residualExposureQuoteValue,
      )
    );
  }

  private blocked(
    common: Omit<
      HedgeInventoryResidualReconciliationAssessment,
      | "evidenceStatus"
      | "state"
      | "evidenceAgeMs"
      | "reconciliation"
      | "recoveryRequired"
      | "blockers"
      | "remainingGates"
    >,
    evidenceAgeMs: number | null,
    blocker: HedgeInventoryResidualReconciliationAssessmentBlocker,
  ): HedgeInventoryResidualReconciliationAssessment {
    return {
      ...common,
      evidenceStatus: "NO_DATA",
      state: "BLOCKED",
      evidenceAgeMs,
      reconciliation: null,
      recoveryRequired: null,
      blockers: [blocker],
      remainingGates: [],
    };
  }

  private resolveGlobalBlocker(
    configuration: HedgeInventoryManagementConfiguration,
    simulations: HedgeInventoryShadowFillSimulationSnapshot,
    evidence: HedgeInventoryResidualReconciliationEvidenceSnapshot | null,
    now: number,
  ): HedgeInventoryResidualReconciliationGlobalBlocker | null {
    if (configuration.state !== "FOUNDATION_READY") {
      return "STRATEGY_CONFIGURATION_NOT_READY";
    }
    if (configuration.shadowFillSimulation.state !== "READY") {
      return "SHADOW_FILL_SIMULATION_CONFIGURATION_NOT_READY";
    }
    if (configuration.residualReconciliation.state !== "READY") {
      return "RESIDUAL_RECONCILIATION_CONFIGURATION_NOT_READY";
    }
    if (simulations.evidenceStatus !== "AVAILABLE") {
      return "SHADOW_FILL_SIMULATION_EVIDENCE_UNAVAILABLE";
    }
    if (evidence === null || evidence.evidenceStatus !== "AVAILABLE") {
      return "RESIDUAL_RECONCILIATION_EVIDENCE_UNAVAILABLE";
    }
    if (!Number.isFinite(evidence.generatedAt) || evidence.generatedAt <= 0) {
      return "INVALID_RESIDUAL_RECONCILIATION_EVIDENCE_TIMESTAMP";
    }
    if (evidence.generatedAt > now) {
      return "RESIDUAL_RECONCILIATION_EVIDENCE_FROM_FUTURE";
    }
    if (
      now - evidence.generatedAt >
        configuration.residualReconciliation.maximumEvidenceAgeMs!
    ) {
      return "RESIDUAL_RECONCILIATION_EVIDENCE_STALE";
    }
    return null;
  }

  private unavailable(
    configuration: HedgeInventoryManagementConfiguration,
    simulations: HedgeInventoryShadowFillSimulationSnapshot,
    evidence: HedgeInventoryResidualReconciliationEvidenceSnapshot | null,
    now: number,
    blocker: HedgeInventoryResidualReconciliationGlobalBlocker,
  ): HedgeInventoryResidualReconciliationSnapshot {
    return immutableClone({
      version: "22.15",
      strategyId: HEDGE_INVENTORY_MANAGEMENT_STRATEGY_ID,
      generatedAt: now,
      evidenceStatus: "NO_DATA",
      configurationState: configuration.state,
      shadowFillSimulationConfigurationState:
        configuration.shadowFillSimulation.state,
      residualReconciliationConfigurationState:
        configuration.residualReconciliation.state,
      sourceFillSimulationGeneratedAt:
        Number.isFinite(simulations.generatedAt) ? simulations.generatedAt : null,
      sourceReconciliationEvidenceGeneratedAt:
        evidence && Number.isFinite(evidence.generatedAt) ? evidence.generatedAt : null,
      thresholds: this.thresholds(configuration),
      summary: {
        eligibleSimulations: 0,
        reconciledClosed: 0,
        recoveryRequired: 0,
        warningResiduals: 0,
        criticalResiduals: 0,
        rejectedReconciliations: 0,
        notApplicableSimulations: 0,
        blockedSimulations: 0,
        totalReconciledResidualQuantity: 0,
        totalReconciledResidualExposureQuoteValue: 0,
        liveReconciliationRecordsCreated: 0,
        recoveryIncidentsCreated: 0,
        recoveryActionsCreated: 0,
        executableRecoveryActions: 0,
        actionableRecoveryActions: 0,
      },
      assessments: [],
      blockers: [blocker],
      notes: NOTES,
      safety: SAFETY,
    });
  }

  private thresholds(
    configuration: HedgeInventoryManagementConfiguration,
  ): HedgeInventoryResidualReconciliationSnapshot["thresholds"] {
    return {
      maximumEvidenceAgeMs:
        configuration.residualReconciliation.maximumEvidenceAgeMs ?? 0,
      residualQuantityTolerance:
        configuration.residualReconciliation.residualQuantityTolerance ?? 0,
      criticalResidualExposureQuoteValue:
        configuration.residualReconciliation.criticalResidualExposureQuoteValue ?? 0,
    };
  }

  private countState(
    assessments: readonly HedgeInventoryResidualReconciliationAssessment[],
    state: HedgeInventoryResidualReconciliationAssessment["state"],
  ): number {
    return assessments.filter((assessment) => assessment.state === state).length;
  }

  private validateNow(now: number): void {
    if (!Number.isFinite(now) || now <= 0) {
      throw new Error(
        "Hedge residual-reconciliation timestamp must be positive and finite.",
      );
    }
  }
}

function approximatelyEqual(first: number, second: number): boolean {
  const scale = Math.max(1, Math.abs(first), Math.abs(second));
  return Math.abs(first - second) <= Number.EPSILON * scale * 16;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function immutableClone<T>(value: T): T {
  return deepFreeze(structuredClone(value));
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

