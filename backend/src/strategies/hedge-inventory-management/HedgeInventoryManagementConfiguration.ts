/*
 * ============================================================
 * CAT PRO V22.18
 * STRATEGY #3 — HEDGE / INVENTORY MANAGEMENT
 * CONFIGURATION FOUNDATION
 * ============================================================
 *
 * SHADOW only and default disabled.
 *
 * This configuration describes the bounded inputs required by a future
 * read-only exposure assessment. It grants no balance, portfolio, capital,
 * recovery, PAPER, LIVE, hedge-execution or order authority.
 */

import {
  HEDGE_INVENTORY_MANAGEMENT_STRATEGY_ID,
} from "../models/StrategyMetadata";

export type HedgeInventoryManagementMode =
  "SHADOW";

export type HedgeInventoryManagementConfigurationState =
  | "DISABLED"
  | "INCOMPLETE"
  | "FOUNDATION_READY";

export type HedgeInventoryManagementConfigurationBlocker =
  | "STRATEGY_DISABLED"
  | "VALUATION_QUOTE_ASSET_REQUIRED"
  | "ASSET_ALLOWLIST_REQUIRED"
  | "TARGET_INVENTORY_REQUIRED"
  | "MAXIMUM_DEVIATION_QUOTE_VALUE_REQUIRED"
  | "EXPOSURE_LIMIT_QUOTE_VALUE_REQUIRED"
  | "HEDGE_RATIO_REQUIRED"
  | "HEDGE_VENUE_ALLOWLIST_REQUIRED"
  | "MAXIMUM_EXPOSURE_AGE_REQUIRED";

export type HedgeInventoryRouteEconomicsConfigurationState =
  | "DISABLED"
  | "INCOMPLETE"
  | "READY";

export type HedgeInventoryRouteEconomicsConfigurationBlocker =
  | "ROUTE_ECONOMICS_DISABLED"
  | "MAXIMUM_ORDER_BOOK_AGE_REQUIRED"
  | "MAXIMUM_FEE_AGE_REQUIRED"
  | "MAXIMUM_SLIPPAGE_REQUIRED";

export interface HedgeInventoryRouteEconomicsConfigurationInput {
  readonly enabled?: boolean;
  readonly maximumOrderBookAgeMs?: number | null;
  readonly maximumFeeAgeMs?: number | null;
  readonly maximumSlippagePercent?: number | null;
}

export type HedgeInventoryMarketRuleConfigurationState =
  | "DISABLED"
  | "INCOMPLETE"
  | "READY";

export type HedgeInventoryMarketRuleConfigurationBlocker =
  | "MARKET_RULE_FEASIBILITY_DISABLED"
  | "MAXIMUM_CAPABILITY_AGE_REQUIRED"
  | "MAXIMUM_QUANTIZATION_LOSS_REQUIRED";

export interface HedgeInventoryMarketRuleConfigurationInput {
  readonly enabled?: boolean;
  readonly maximumCapabilityAgeMs?: number | null;
  readonly maximumQuantizationLossPercent?: number | null;
}

export type HedgeInventoryPostRuleEconomicsConfigurationState =
  | "DISABLED"
  | "READY";

export type HedgeInventoryPostRuleEconomicsConfigurationBlocker =
  "POST_RULE_ECONOMICS_REVALIDATION_DISABLED";

export interface HedgeInventoryPostRuleEconomicsConfigurationInput {
  readonly enabled?: boolean;
}

export type HedgeInventoryBasisRiskConfigurationState =
  | "DISABLED"
  | "INCOMPLETE"
  | "READY";

export type HedgeInventoryBasisRiskConfigurationBlocker =
  | "BASIS_RISK_EVALUATION_DISABLED"
  | "MAXIMUM_BASIS_EVIDENCE_AGE_REQUIRED"
  | "MAXIMUM_BASIS_DEVIATION_REQUIRED"
  | "MINIMUM_CORRELATION_REQUIRED"
  | "MINIMUM_CORRELATION_OBSERVATIONS_REQUIRED";

export interface HedgeInventoryBasisRiskConfigurationInput {
  readonly enabled?: boolean;
  readonly maximumEvidenceAgeMs?: number | null;
  readonly maximumBasisDeviationPercent?: number | null;
  readonly minimumCorrelationCoefficient?: number | null;
  readonly minimumCorrelationObservations?: number | null;
}

export type HedgeInventoryRiskApprovalConfigurationState =
  | "DISABLED"
  | "INCOMPLETE"
  | "READY";

export type HedgeInventoryRiskApprovalConfigurationBlocker =
  | "RISK_ENGINE_APPROVAL_EVALUATION_DISABLED"
  | "MAXIMUM_RISK_ASSESSMENT_AGE_REQUIRED";

export interface HedgeInventoryRiskApprovalConfigurationInput {
  readonly enabled?: boolean;
  readonly maximumAssessmentAgeMs?: number | null;
}

export type HedgeInventoryCapitalReservationConfigurationState =
  | "DISABLED"
  | "INCOMPLETE"
  | "READY";

export type HedgeInventoryCapitalReservationConfigurationBlocker =
  | "CAPITAL_RESERVATION_EVIDENCE_DISABLED"
  | "MAXIMUM_RESERVATION_EVIDENCE_AGE_REQUIRED"
  | "MINIMUM_RESERVATION_TTL_REQUIRED";

export interface HedgeInventoryCapitalReservationConfigurationInput {
  readonly enabled?: boolean;
  readonly maximumEvidenceAgeMs?: number | null;
  readonly minimumRemainingTtlMs?: number | null;
}

export type HedgeInventoryIntentProposalConfigurationState =
  | "DISABLED"
  | "INCOMPLETE"
  | "READY";

export type HedgeInventoryIntentProposalConfigurationBlocker =
  | "HEDGE_INTENT_PROPOSAL_DISABLED"
  | "MAXIMUM_RESERVATION_SOURCE_AGE_REQUIRED"
  | "HEDGE_INTENT_PROPOSAL_TTL_REQUIRED"
  | "RECURSION_DEPTH_MUST_BE_ZERO";

export interface HedgeInventoryIntentProposalConfigurationInput {
  readonly enabled?: boolean;
  readonly maximumCapitalReservationAgeMs?: number | null;
  readonly proposalTtlMs?: number | null;
  readonly maximumRecursionDepth?: number | null;
}

export type HedgeInventoryIntentPersistenceConfigurationState =
  | "DISABLED"
  | "INCOMPLETE"
  | "READY";

export type HedgeInventoryIntentPersistenceConfigurationBlocker =
  | "STRATEGY_INTENT_PERSISTENCE_DISABLED"
  | "MAXIMUM_PROPOSAL_AGE_REQUIRED";

export interface HedgeInventoryIntentPersistenceConfigurationInput {
  readonly enabled?: boolean;
  readonly maximumProposalAgeMs?: number | null;
}

export type HedgeInventoryIntentLifecycleConfigurationState =
  | "DISABLED"
  | "INCOMPLETE"
  | "READY";

export type HedgeInventoryIntentLifecycleConfigurationBlocker =
  | "INTENT_LIFECYCLE_REVALIDATION_DISABLED"
  | "MAXIMUM_INTENT_AGE_REQUIRED";

export interface HedgeInventoryIntentLifecycleConfigurationInput {
  readonly enabled?: boolean;
  readonly maximumIntentAgeMs?: number | null;
}

export type HedgeInventoryIntentPreflightConfigurationState =
  | "DISABLED"
  | "INCOMPLETE"
  | "READY";

export type HedgeInventoryIntentPreflightConfigurationBlocker =
  | "INTENT_LAST_LOOK_PREFLIGHT_DISABLED"
  | "MAXIMUM_LIFECYCLE_AGE_REQUIRED";

export interface HedgeInventoryIntentPreflightConfigurationInput {
  readonly enabled?: boolean;
  readonly maximumLifecycleAgeMs?: number | null;
}

export type HedgeInventoryExecutionPlanProposalConfigurationState =
  | "DISABLED"
  | "INCOMPLETE"
  | "READY";

export type HedgeInventoryExecutionPlanProposalConfigurationBlocker =
  | "SHADOW_EXECUTION_PLAN_PROPOSAL_DISABLED"
  | "MAXIMUM_PREFLIGHT_AGE_REQUIRED"
  | "EXECUTION_PLAN_PROPOSAL_TTL_REQUIRED";

export interface HedgeInventoryExecutionPlanProposalConfigurationInput {
  readonly enabled?: boolean;
  readonly maximumPreflightAgeMs?: number | null;
  readonly proposalTtlMs?: number | null;
}

export type HedgeInventoryShadowFillSimulationConfigurationState =
  | "DISABLED"
  | "INCOMPLETE"
  | "READY";

export type HedgeInventoryShadowFillSimulationConfigurationBlocker =
  | "SHADOW_HEDGE_FILL_SIMULATION_DISABLED"
  | "MAXIMUM_FILL_EVIDENCE_AGE_REQUIRED"
  | "MAXIMUM_SIMULATED_SLIPPAGE_REQUIRED";

export interface HedgeInventoryShadowFillSimulationConfigurationInput {
  readonly enabled?: boolean;
  readonly maximumEvidenceAgeMs?: number | null;
  readonly maximumSlippagePercent?: number | null;
}

export type HedgeInventoryResidualReconciliationConfigurationState =
  | "DISABLED"
  | "INCOMPLETE"
  | "READY";

export type HedgeInventoryResidualReconciliationConfigurationBlocker =
  | "SHADOW_RESIDUAL_RECONCILIATION_DISABLED"
  | "MAXIMUM_RECONCILIATION_EVIDENCE_AGE_REQUIRED"
  | "RESIDUAL_QUANTITY_TOLERANCE_REQUIRED"
  | "CRITICAL_RESIDUAL_EXPOSURE_REQUIRED";

export interface HedgeInventoryResidualReconciliationConfigurationInput {
  readonly enabled?: boolean;
  readonly maximumEvidenceAgeMs?: number | null;
  readonly residualQuantityTolerance?: number | null;
  readonly criticalResidualExposureQuoteValue?: number | null;
}

export type HedgeInventoryRecoveryProposalConfigurationState =
  | "DISABLED"
  | "INCOMPLETE"
  | "READY";

export type HedgeInventoryRecoveryProposalConfigurationBlocker =
  | "SHADOW_RECOVERY_PROPOSAL_DISABLED"
  | "MAXIMUM_RECONCILIATION_AGE_REQUIRED"
  | "RECOVERY_PROPOSAL_TTL_REQUIRED"
  | "MAXIMUM_RECOVERY_PROPOSAL_QUOTE_VALUE_REQUIRED";

export interface HedgeInventoryRecoveryProposalConfigurationInput {
  readonly enabled?: boolean;
  readonly maximumReconciliationAgeMs?: number | null;
  readonly proposalTtlMs?: number | null;
  readonly maximumProposalQuoteValue?: number | null;
}

export type HedgeInventoryRecoveryProposalLifecycleConfigurationState =
  | "DISABLED"
  | "INCOMPLETE"
  | "READY";

export type HedgeInventoryRecoveryProposalLifecycleConfigurationBlocker =
  | "RECOVERY_PROPOSAL_LIFECYCLE_DISABLED"
  | "MAXIMUM_RECOVERY_PROPOSAL_AGE_REQUIRED"
  | "MAXIMUM_OPERATOR_DECISION_AGE_REQUIRED";

export interface HedgeInventoryRecoveryProposalLifecycleConfigurationInput {
  readonly enabled?: boolean;
  readonly maximumProposalAgeMs?: number | null;
  readonly maximumOperatorDecisionAgeMs?: number | null;
}

export type HedgeInventoryRecoveryActionHandoffConfigurationState =
  | "DISABLED"
  | "INCOMPLETE"
  | "READY";

export type HedgeInventoryRecoveryActionHandoffConfigurationBlocker =
  | "SHADOW_RECOVERY_ACTION_HANDOFF_DISABLED"
  | "MAXIMUM_RECOVERY_LIFECYCLE_AGE_REQUIRED"
  | "RECOVERY_ACTION_HANDOFF_TTL_REQUIRED"
  | "MAXIMUM_RECOVERY_HANDOFF_QUOTE_VALUE_REQUIRED";

export interface HedgeInventoryRecoveryActionHandoffConfigurationInput {
  readonly enabled?: boolean;
  readonly maximumLifecycleAgeMs?: number | null;
  readonly handoffTtlMs?: number | null;
  readonly maximumHandoffQuoteValue?: number | null;
}

export interface HedgeInventoryManagementConfigurationInput {
  readonly enabled?:
    boolean;

  readonly mode?:
    HedgeInventoryManagementMode;

  readonly valuationQuoteAsset?:
    string | null;

  readonly assetAllowlist?:
    readonly string[];

  readonly targetInventoryByAsset?:
    Readonly<Record<string, number>>;

  readonly maximumDeviationQuoteValue?:
    number | null;

  readonly exposureLimitQuoteValue?:
    number | null;

  readonly hedgeRatio?:
    number | null;

  readonly hedgeVenueAllowlist?:
    readonly string[];

  readonly maximumExposureAgeMs?:
    number | null;

  readonly routeEconomics?:
    HedgeInventoryRouteEconomicsConfigurationInput;

  readonly marketRules?:
    HedgeInventoryMarketRuleConfigurationInput;

  readonly postRuleEconomics?:
    HedgeInventoryPostRuleEconomicsConfigurationInput;

  readonly basisRisk?:
    HedgeInventoryBasisRiskConfigurationInput;

  readonly riskApproval?:
    HedgeInventoryRiskApprovalConfigurationInput;

  readonly capitalReservation?:
    HedgeInventoryCapitalReservationConfigurationInput;

  readonly intentProposal?:
    HedgeInventoryIntentProposalConfigurationInput;

  readonly intentPersistence?:
    HedgeInventoryIntentPersistenceConfigurationInput;

  readonly intentLifecycle?:
    HedgeInventoryIntentLifecycleConfigurationInput;

  readonly intentPreflight?:
    HedgeInventoryIntentPreflightConfigurationInput;

  readonly executionPlanProposal?:
    HedgeInventoryExecutionPlanProposalConfigurationInput;

  readonly shadowFillSimulation?:
    HedgeInventoryShadowFillSimulationConfigurationInput;

  readonly residualReconciliation?:
    HedgeInventoryResidualReconciliationConfigurationInput;

  readonly recoveryProposal?:
    HedgeInventoryRecoveryProposalConfigurationInput;

  readonly recoveryProposalLifecycle?:
    HedgeInventoryRecoveryProposalLifecycleConfigurationInput;

  readonly recoveryActionHandoff?:
    HedgeInventoryRecoveryActionHandoffConfigurationInput;
}

export interface HedgeInventoryManagementConfiguration {
  readonly version:
    "22.18";

  readonly strategyId:
    "hedge-inventory-management";

  readonly enabled:
    boolean;

  readonly mode:
    "SHADOW";

  readonly valuationQuoteAsset:
    string | null;

  readonly assetAllowlist:
    readonly string[];

  readonly targetInventoryByAsset:
    Readonly<Record<string, number>>;

  readonly maximumDeviationQuoteValue:
    number | null;

  readonly exposureLimitQuoteValue:
    number | null;

  readonly hedgeRatio:
    number | null;

  readonly hedgeVenueAllowlist:
    readonly string[];

  readonly maximumExposureAgeMs:
    number | null;

  readonly routeEconomics: {
    readonly enabled: boolean;
    readonly maximumOrderBookAgeMs: number | null;
    readonly maximumFeeAgeMs: number | null;
    readonly maximumSlippagePercent: number | null;
    readonly state: HedgeInventoryRouteEconomicsConfigurationState;
    readonly blockers: readonly HedgeInventoryRouteEconomicsConfigurationBlocker[];
  };

  readonly marketRules: {
    readonly enabled: boolean;
    readonly maximumCapabilityAgeMs: number | null;
    readonly maximumQuantizationLossPercent: number | null;
    readonly state: HedgeInventoryMarketRuleConfigurationState;
    readonly blockers: readonly HedgeInventoryMarketRuleConfigurationBlocker[];
  };

  readonly postRuleEconomics: {
    readonly enabled: boolean;
    readonly state: HedgeInventoryPostRuleEconomicsConfigurationState;
    readonly blockers: readonly HedgeInventoryPostRuleEconomicsConfigurationBlocker[];
  };

  readonly basisRisk: {
    readonly enabled: boolean;
    readonly maximumEvidenceAgeMs: number | null;
    readonly maximumBasisDeviationPercent: number | null;
    readonly minimumCorrelationCoefficient: number | null;
    readonly minimumCorrelationObservations: number | null;
    readonly state: HedgeInventoryBasisRiskConfigurationState;
    readonly blockers: readonly HedgeInventoryBasisRiskConfigurationBlocker[];
  };

  readonly riskApproval: {
    readonly enabled: boolean;
    readonly maximumAssessmentAgeMs: number | null;
    readonly state: HedgeInventoryRiskApprovalConfigurationState;
    readonly blockers: readonly HedgeInventoryRiskApprovalConfigurationBlocker[];
  };

  readonly capitalReservation: {
    readonly enabled: boolean;
    readonly maximumEvidenceAgeMs: number | null;
    readonly minimumRemainingTtlMs: number | null;
    readonly state: HedgeInventoryCapitalReservationConfigurationState;
    readonly blockers: readonly HedgeInventoryCapitalReservationConfigurationBlocker[];
  };

  readonly intentProposal: {
    readonly enabled: boolean;
    readonly maximumCapitalReservationAgeMs: number | null;
    readonly proposalTtlMs: number | null;
    readonly maximumRecursionDepth: number | null;
    readonly state: HedgeInventoryIntentProposalConfigurationState;
    readonly blockers: readonly HedgeInventoryIntentProposalConfigurationBlocker[];
  };

  readonly intentPersistence: {
    readonly enabled: boolean;
    readonly maximumProposalAgeMs: number | null;
    readonly state: HedgeInventoryIntentPersistenceConfigurationState;
    readonly blockers: readonly HedgeInventoryIntentPersistenceConfigurationBlocker[];
  };

  readonly intentLifecycle: {
    readonly enabled: boolean;
    readonly maximumIntentAgeMs: number | null;
    readonly state: HedgeInventoryIntentLifecycleConfigurationState;
    readonly blockers: readonly HedgeInventoryIntentLifecycleConfigurationBlocker[];
  };

  readonly intentPreflight: {
    readonly enabled: boolean;
    readonly maximumLifecycleAgeMs: number | null;
    readonly state: HedgeInventoryIntentPreflightConfigurationState;
    readonly blockers: readonly HedgeInventoryIntentPreflightConfigurationBlocker[];
  };

  readonly executionPlanProposal: {
    readonly enabled: boolean;
    readonly maximumPreflightAgeMs: number | null;
    readonly proposalTtlMs: number | null;
    readonly state: HedgeInventoryExecutionPlanProposalConfigurationState;
    readonly blockers: readonly HedgeInventoryExecutionPlanProposalConfigurationBlocker[];
  };

  readonly shadowFillSimulation: {
    readonly enabled: boolean;
    readonly maximumEvidenceAgeMs: number | null;
    readonly maximumSlippagePercent: number | null;
    readonly state: HedgeInventoryShadowFillSimulationConfigurationState;
    readonly blockers: readonly HedgeInventoryShadowFillSimulationConfigurationBlocker[];
  };

  readonly residualReconciliation: {
    readonly enabled: boolean;
    readonly maximumEvidenceAgeMs: number | null;
    readonly residualQuantityTolerance: number | null;
    readonly criticalResidualExposureQuoteValue: number | null;
    readonly state: HedgeInventoryResidualReconciliationConfigurationState;
    readonly blockers: readonly HedgeInventoryResidualReconciliationConfigurationBlocker[];
  };

  readonly recoveryProposal: {
    readonly enabled: boolean;
    readonly maximumReconciliationAgeMs: number | null;
    readonly proposalTtlMs: number | null;
    readonly maximumProposalQuoteValue: number | null;
    readonly state: HedgeInventoryRecoveryProposalConfigurationState;
    readonly blockers: readonly HedgeInventoryRecoveryProposalConfigurationBlocker[];
  };

  readonly recoveryProposalLifecycle: {
    readonly enabled: boolean;
    readonly maximumProposalAgeMs: number | null;
    readonly maximumOperatorDecisionAgeMs: number | null;
    readonly state: HedgeInventoryRecoveryProposalLifecycleConfigurationState;
    readonly blockers: readonly HedgeInventoryRecoveryProposalLifecycleConfigurationBlocker[];
  };

  readonly recoveryActionHandoff: {
    readonly enabled: boolean;
    readonly maximumLifecycleAgeMs: number | null;
    readonly handoffTtlMs: number | null;
    readonly maximumHandoffQuoteValue: number | null;
    readonly state: HedgeInventoryRecoveryActionHandoffConfigurationState;
    readonly blockers: readonly HedgeInventoryRecoveryActionHandoffConfigurationBlocker[];
  };

  readonly state:
    HedgeInventoryManagementConfigurationState;

  readonly blockers:
    readonly HedgeInventoryManagementConfigurationBlocker[];

  readonly safety: {
    readonly shadowEvidenceOnly:
      true;

    readonly readOnlyExposureAssessmentAllowed:
      true;

    readonly readOnlyRouteEconomicsAllowed:
      true;

    readonly readOnlyMarketRuleFeasibilityAllowed:
      true;

    readonly readOnlyPostRuleEconomicsRevalidationAllowed:
      true;

    readonly readOnlyBasisCorrelationRiskEvaluationAllowed:
      true;

    readonly readOnlyRiskEngineApprovalEvaluationAllowed:
      true;

    readonly readOnlyCapitalReservationEvidenceAllowed:
      true;

    readonly boundedHedgeIntentProposalAllowed:
      true;

    readonly canonicalStrategyIntentPersistenceAllowed:
      true;

    readonly readOnlyIntentLifecycleRevalidationAllowed:
      true;

    readonly terminalIntentRevocationEvidenceAllowed:
      true;

    readonly readOnlyIntentLastLookPreflightAllowed:
      true;

    readonly boundedShadowExecutionPlanProposalAllowed:
      true;

    readonly readOnlyShadowFillSimulationAllowed:
      true;

    readonly readOnlyResidualReconciliationAllowed:
      true;

    readonly boundedShadowRecoveryProposalAllowed:
      true;

    readonly readOnlyRecoveryProposalLifecycleAllowed:
      true;

    readonly explicitRecoveryOperatorDecisionEvidenceAllowed:
      true;

    readonly boundedShadowRecoveryActionHandoffAllowed:
      true;

    readonly hedgeProposalGenerationAllowed:
      true;

    readonly portfolioMutationAllowed:
      false;

    readonly balanceMutationAllowed:
      false;

    readonly recoveryActionAllowed:
      false;

    readonly capitalReservationAllowed:
      false;

    readonly paperExecutionAllowed:
      false;

    readonly liveExecutionAllowed:
      false;

    readonly orderSubmissionAllowed:
      false;
  };
}

const ASSET_PATTERN =
  /^[A-Z0-9]+$/;

const VENUE_PATTERN =
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function createHedgeInventoryManagementConfiguration(
  input:
    HedgeInventoryManagementConfigurationInput = {},
): HedgeInventoryManagementConfiguration {
  const mode =
    input.mode ??
    "SHADOW";

  if (
    mode !==
      "SHADOW"
  ) {
    throw new Error(
      "Hedge / inventory management is SHADOW-only in V22.18.",
    );
  }

  if (
    input.enabled !==
      undefined &&
    typeof input.enabled !==
      "boolean"
  ) {
    throw new Error(
      "Hedge / inventory enabled must be a boolean.",
    );
  }

  const enabled =
    input.enabled ??
    false;

  const valuationQuoteAsset =
    normalizeOptionalAsset(
      input.valuationQuoteAsset,
      "valuationQuoteAsset",
    );

  const assetAllowlist =
    normalizeAssetAllowlist(
      input.assetAllowlist ??
        [],
    );

  const targetInventoryByAsset =
    normalizeTargetInventory(
      input.targetInventoryByAsset ??
        {},
      assetAllowlist,
    );

  const maximumDeviationQuoteValue =
    normalizeOptionalPositiveNumber(
      input.maximumDeviationQuoteValue,
      "maximumDeviationQuoteValue",
    );

  const exposureLimitQuoteValue =
    normalizeOptionalPositiveNumber(
      input.exposureLimitQuoteValue,
      "exposureLimitQuoteValue",
    );

  if (
    maximumDeviationQuoteValue !==
      null &&
    exposureLimitQuoteValue !==
      null &&
    exposureLimitQuoteValue <
      maximumDeviationQuoteValue
  ) {
    throw new Error(
      "Hedge / inventory exposureLimitQuoteValue must be greater than or equal to maximumDeviationQuoteValue.",
    );
  }

  const hedgeRatio =
    normalizeHedgeRatio(
      input.hedgeRatio,
    );

  const hedgeVenueAllowlist =
    normalizeVenueAllowlist(
      input.hedgeVenueAllowlist ??
        [],
    );

  const maximumExposureAgeMs =
    normalizeOptionalPositiveSafeInteger(
      input.maximumExposureAgeMs,
      "maximumExposureAgeMs",
    );

  const routeEconomics =
    normalizeRouteEconomics(
      input.routeEconomics,
    );

  const marketRules =
    normalizeMarketRules(
      input.marketRules,
    );

  const postRuleEconomics =
    normalizePostRuleEconomics(
      input.postRuleEconomics,
    );

  const basisRisk =
    normalizeBasisRisk(
      input.basisRisk,
    );

  const riskApproval =
    normalizeRiskApproval(
      input.riskApproval,
    );

  const capitalReservation =
    normalizeCapitalReservation(
      input.capitalReservation,
    );

  const intentProposal =
    normalizeIntentProposal(
      input.intentProposal,
    );

  const intentPersistence =
    normalizeIntentPersistence(
      input.intentPersistence,
    );

  const intentLifecycle =
    normalizeIntentLifecycle(
      input.intentLifecycle,
    );

  const intentPreflight =
    normalizeIntentPreflight(
      input.intentPreflight,
    );

  const executionPlanProposal =
    normalizeExecutionPlanProposal(
      input.executionPlanProposal,
    );

  const shadowFillSimulation =
    normalizeShadowFillSimulation(
      input.shadowFillSimulation,
    );

  const residualReconciliation =
    normalizeResidualReconciliation(
      input.residualReconciliation,
    );

  const recoveryProposal =
    normalizeRecoveryProposal(
      input.recoveryProposal,
    );

  const recoveryProposalLifecycle =
    normalizeRecoveryProposalLifecycle(
      input.recoveryProposalLifecycle,
    );

  const recoveryActionHandoff =
    normalizeRecoveryActionHandoff(
      input.recoveryActionHandoff,
    );

  const blockers:
    HedgeInventoryManagementConfigurationBlocker[] =
    [];

  if (
    !enabled
  ) {
    blockers.push(
      "STRATEGY_DISABLED",
    );
  }

  if (
    valuationQuoteAsset ===
      null
  ) {
    blockers.push(
      "VALUATION_QUOTE_ASSET_REQUIRED",
    );
  }

  if (
    assetAllowlist.length ===
      0
  ) {
    blockers.push(
      "ASSET_ALLOWLIST_REQUIRED",
    );
  }

  if (
    assetAllowlist.length ===
      0 ||
    assetAllowlist.some(
      (asset) =>
        targetInventoryByAsset[
          asset
        ] ===
          undefined,
    )
  ) {
    blockers.push(
      "TARGET_INVENTORY_REQUIRED",
    );
  }

  if (
    maximumDeviationQuoteValue ===
      null
  ) {
    blockers.push(
      "MAXIMUM_DEVIATION_QUOTE_VALUE_REQUIRED",
    );
  }

  if (
    exposureLimitQuoteValue ===
      null
  ) {
    blockers.push(
      "EXPOSURE_LIMIT_QUOTE_VALUE_REQUIRED",
    );
  }

  if (
    hedgeRatio ===
      null
  ) {
    blockers.push(
      "HEDGE_RATIO_REQUIRED",
    );
  }

  if (
    hedgeVenueAllowlist.length ===
      0
  ) {
    blockers.push(
      "HEDGE_VENUE_ALLOWLIST_REQUIRED",
    );
  }

  if (
    maximumExposureAgeMs ===
      null
  ) {
    blockers.push(
      "MAXIMUM_EXPOSURE_AGE_REQUIRED",
    );
  }

  const state:
    HedgeInventoryManagementConfigurationState =
    !enabled
      ? "DISABLED"
      : blockers.length >
          0
        ? "INCOMPLETE"
        : "FOUNDATION_READY";

  return deepFreeze({
    version:
      "22.18",

    strategyId:
      HEDGE_INVENTORY_MANAGEMENT_STRATEGY_ID,

    enabled,

    mode,

    valuationQuoteAsset,

    assetAllowlist,

    targetInventoryByAsset,

    maximumDeviationQuoteValue,

    exposureLimitQuoteValue,

    hedgeRatio,

    hedgeVenueAllowlist,

    maximumExposureAgeMs,

    routeEconomics,

    marketRules,

    postRuleEconomics,

    basisRisk,

    riskApproval,

    capitalReservation,

    intentProposal,

    intentPersistence,

    intentLifecycle,

    intentPreflight,

    executionPlanProposal,

    shadowFillSimulation,

    residualReconciliation,

    recoveryProposal,

    recoveryProposalLifecycle,

    recoveryActionHandoff,

    state,

    blockers,

    safety: {
      shadowEvidenceOnly:
        true,

      readOnlyExposureAssessmentAllowed:
        true,

      readOnlyRouteEconomicsAllowed:
        true,

      readOnlyMarketRuleFeasibilityAllowed:
        true,

      readOnlyPostRuleEconomicsRevalidationAllowed:
        true,

      readOnlyBasisCorrelationRiskEvaluationAllowed:
        true,

      readOnlyRiskEngineApprovalEvaluationAllowed:
        true,

      readOnlyCapitalReservationEvidenceAllowed:
        true,

      boundedHedgeIntentProposalAllowed:
        true,

      canonicalStrategyIntentPersistenceAllowed:
        true,

      readOnlyIntentLifecycleRevalidationAllowed:
        true,

      terminalIntentRevocationEvidenceAllowed:
        true,

      readOnlyIntentLastLookPreflightAllowed:
        true,

      boundedShadowExecutionPlanProposalAllowed:
        true,

      readOnlyShadowFillSimulationAllowed:
        true,

      readOnlyResidualReconciliationAllowed:
        true,

      boundedShadowRecoveryProposalAllowed:
        true,

      readOnlyRecoveryProposalLifecycleAllowed:
        true,

      explicitRecoveryOperatorDecisionEvidenceAllowed:
        true,

      boundedShadowRecoveryActionHandoffAllowed:
        true,

      hedgeProposalGenerationAllowed:
        true,

      portfolioMutationAllowed:
        false,

      balanceMutationAllowed:
        false,

      recoveryActionAllowed:
        false,

      capitalReservationAllowed:
        false,

      paperExecutionAllowed:
        false,

      liveExecutionAllowed:
        false,

      orderSubmissionAllowed:
        false,
    },
  });
}

function normalizeRecoveryActionHandoff(
  input:
    HedgeInventoryRecoveryActionHandoffConfigurationInput | undefined,
): HedgeInventoryManagementConfiguration["recoveryActionHandoff"] {
  if (
    input !== undefined &&
    (
      typeof input !== "object" ||
      input === null ||
      Array.isArray(input)
    )
  ) {
    throw new Error(
      "Hedge / inventory recoveryActionHandoff must be an object.",
    );
  }

  if (
    input?.enabled !== undefined &&
    typeof input.enabled !== "boolean"
  ) {
    throw new Error(
      "Hedge / inventory recoveryActionHandoff.enabled must be a boolean.",
    );
  }

  const enabled = input?.enabled ?? false;
  const maximumLifecycleAgeMs =
    normalizeOptionalPositiveSafeInteger(
      input?.maximumLifecycleAgeMs,
      "recoveryActionHandoff.maximumLifecycleAgeMs",
    );
  const handoffTtlMs =
    normalizeOptionalPositiveSafeInteger(
      input?.handoffTtlMs,
      "recoveryActionHandoff.handoffTtlMs",
    );
  const maximumHandoffQuoteValue =
    normalizeOptionalPositiveNumber(
      input?.maximumHandoffQuoteValue,
      "recoveryActionHandoff.maximumHandoffQuoteValue",
    );
  const blockers:
    HedgeInventoryRecoveryActionHandoffConfigurationBlocker[] = [];

  if (!enabled) {
    blockers.push("SHADOW_RECOVERY_ACTION_HANDOFF_DISABLED");
  }
  if (maximumLifecycleAgeMs === null) {
    blockers.push("MAXIMUM_RECOVERY_LIFECYCLE_AGE_REQUIRED");
  }
  if (handoffTtlMs === null) {
    blockers.push("RECOVERY_ACTION_HANDOFF_TTL_REQUIRED");
  }
  if (maximumHandoffQuoteValue === null) {
    blockers.push("MAXIMUM_RECOVERY_HANDOFF_QUOTE_VALUE_REQUIRED");
  }

  return {
    enabled,
    maximumLifecycleAgeMs,
    handoffTtlMs,
    maximumHandoffQuoteValue,
    state:
      !enabled
        ? "DISABLED"
        : blockers.length > 0
          ? "INCOMPLETE"
          : "READY",
    blockers,
  };
}

function normalizeRecoveryProposalLifecycle(
  input:
    HedgeInventoryRecoveryProposalLifecycleConfigurationInput | undefined,
): HedgeInventoryManagementConfiguration["recoveryProposalLifecycle"] {
  if (
    input !== undefined &&
    (
      typeof input !== "object" ||
      input === null ||
      Array.isArray(input)
    )
  ) {
    throw new Error(
      "Hedge / inventory recoveryProposalLifecycle must be an object.",
    );
  }

  if (
    input?.enabled !== undefined &&
    typeof input.enabled !== "boolean"
  ) {
    throw new Error(
      "Hedge / inventory recoveryProposalLifecycle.enabled must be a boolean.",
    );
  }

  const enabled = input?.enabled ?? false;
  const maximumProposalAgeMs =
    normalizeOptionalPositiveSafeInteger(
      input?.maximumProposalAgeMs,
      "recoveryProposalLifecycle.maximumProposalAgeMs",
    );
  const maximumOperatorDecisionAgeMs =
    normalizeOptionalPositiveSafeInteger(
      input?.maximumOperatorDecisionAgeMs,
      "recoveryProposalLifecycle.maximumOperatorDecisionAgeMs",
    );
  const blockers:
    HedgeInventoryRecoveryProposalLifecycleConfigurationBlocker[] = [];

  if (!enabled) {
    blockers.push("RECOVERY_PROPOSAL_LIFECYCLE_DISABLED");
  }
  if (maximumProposalAgeMs === null) {
    blockers.push("MAXIMUM_RECOVERY_PROPOSAL_AGE_REQUIRED");
  }
  if (maximumOperatorDecisionAgeMs === null) {
    blockers.push("MAXIMUM_OPERATOR_DECISION_AGE_REQUIRED");
  }

  return {
    enabled,
    maximumProposalAgeMs,
    maximumOperatorDecisionAgeMs,
    state:
      !enabled
        ? "DISABLED"
        : blockers.length > 0
          ? "INCOMPLETE"
          : "READY",
    blockers,
  };
}

function normalizeRecoveryProposal(
  input:
    HedgeInventoryRecoveryProposalConfigurationInput | undefined,
): HedgeInventoryManagementConfiguration["recoveryProposal"] {
  if (
    input !== undefined &&
    (
      typeof input !== "object" ||
      input === null ||
      Array.isArray(input)
    )
  ) {
    throw new Error(
      "Hedge / inventory recoveryProposal must be an object.",
    );
  }

  if (
    input?.enabled !== undefined &&
    typeof input.enabled !== "boolean"
  ) {
    throw new Error(
      "Hedge / inventory recoveryProposal.enabled must be a boolean.",
    );
  }

  const enabled =
    input?.enabled ?? false;
  const maximumReconciliationAgeMs =
    normalizeOptionalPositiveSafeInteger(
      input?.maximumReconciliationAgeMs,
      "recoveryProposal.maximumReconciliationAgeMs",
    );
  const proposalTtlMs =
    normalizeOptionalPositiveSafeInteger(
      input?.proposalTtlMs,
      "recoveryProposal.proposalTtlMs",
    );
  const maximumProposalQuoteValue =
    normalizeOptionalPositiveNumber(
      input?.maximumProposalQuoteValue,
      "recoveryProposal.maximumProposalQuoteValue",
    );
  const blockers:
    HedgeInventoryRecoveryProposalConfigurationBlocker[] =
    [];

  if (!enabled) {
    blockers.push(
      "SHADOW_RECOVERY_PROPOSAL_DISABLED",
    );
  }
  if (maximumReconciliationAgeMs === null) {
    blockers.push(
      "MAXIMUM_RECONCILIATION_AGE_REQUIRED",
    );
  }
  if (proposalTtlMs === null) {
    blockers.push(
      "RECOVERY_PROPOSAL_TTL_REQUIRED",
    );
  }
  if (maximumProposalQuoteValue === null) {
    blockers.push(
      "MAXIMUM_RECOVERY_PROPOSAL_QUOTE_VALUE_REQUIRED",
    );
  }

  return {
    enabled,
    maximumReconciliationAgeMs,
    proposalTtlMs,
    maximumProposalQuoteValue,
    state:
      !enabled
        ? "DISABLED"
        : blockers.length > 0
          ? "INCOMPLETE"
          : "READY",
    blockers,
  };
}

function normalizeResidualReconciliation(
  input:
    HedgeInventoryResidualReconciliationConfigurationInput | undefined,
): HedgeInventoryManagementConfiguration["residualReconciliation"] {
  if (
    input !== undefined &&
    (
      typeof input !== "object" ||
      input === null ||
      Array.isArray(input)
    )
  ) {
    throw new Error(
      "Hedge / inventory residualReconciliation must be an object.",
    );
  }

  if (
    input?.enabled !== undefined &&
    typeof input.enabled !== "boolean"
  ) {
    throw new Error(
      "Hedge / inventory residualReconciliation.enabled must be a boolean.",
    );
  }

  const enabled =
    input?.enabled ?? false;
  const maximumEvidenceAgeMs =
    normalizeOptionalPositiveSafeInteger(
      input?.maximumEvidenceAgeMs,
      "residualReconciliation.maximumEvidenceAgeMs",
    );
  const residualQuantityTolerance =
    normalizeOptionalPositiveNumber(
      input?.residualQuantityTolerance,
      "residualReconciliation.residualQuantityTolerance",
    );
  const criticalResidualExposureQuoteValue =
    normalizeOptionalPositiveNumber(
      input?.criticalResidualExposureQuoteValue,
      "residualReconciliation.criticalResidualExposureQuoteValue",
    );
  const blockers:
    HedgeInventoryResidualReconciliationConfigurationBlocker[] =
    [];

  if (!enabled) {
    blockers.push(
      "SHADOW_RESIDUAL_RECONCILIATION_DISABLED",
    );
  }
  if (maximumEvidenceAgeMs === null) {
    blockers.push(
      "MAXIMUM_RECONCILIATION_EVIDENCE_AGE_REQUIRED",
    );
  }
  if (residualQuantityTolerance === null) {
    blockers.push(
      "RESIDUAL_QUANTITY_TOLERANCE_REQUIRED",
    );
  }
  if (criticalResidualExposureQuoteValue === null) {
    blockers.push(
      "CRITICAL_RESIDUAL_EXPOSURE_REQUIRED",
    );
  }

  return {
    enabled,
    maximumEvidenceAgeMs,
    residualQuantityTolerance,
    criticalResidualExposureQuoteValue,
    state:
      !enabled
        ? "DISABLED"
        : blockers.length > 0
          ? "INCOMPLETE"
          : "READY",
    blockers,
  };
}

function normalizeShadowFillSimulation(
  input:
    HedgeInventoryShadowFillSimulationConfigurationInput | undefined,
): HedgeInventoryManagementConfiguration["shadowFillSimulation"] {
  if (
    input !== undefined &&
    (
      typeof input !== "object" ||
      input === null ||
      Array.isArray(input)
    )
  ) {
    throw new Error(
      "Hedge / inventory shadowFillSimulation must be an object.",
    );
  }

  if (
    input?.enabled !== undefined &&
    typeof input.enabled !== "boolean"
  ) {
    throw new Error(
      "Hedge / inventory shadowFillSimulation.enabled must be a boolean.",
    );
  }

  const enabled =
    input?.enabled ?? false;

  const maximumEvidenceAgeMs =
    normalizeOptionalPositiveSafeInteger(
      input?.maximumEvidenceAgeMs,
      "shadowFillSimulation.maximumEvidenceAgeMs",
    );

  const maximumSlippagePercent =
    normalizeOptionalNonNegativePercent(
      input?.maximumSlippagePercent,
      "shadowFillSimulation.maximumSlippagePercent",
    );

  const blockers:
    HedgeInventoryShadowFillSimulationConfigurationBlocker[] =
    [];

  if (!enabled) {
    blockers.push(
      "SHADOW_HEDGE_FILL_SIMULATION_DISABLED",
    );
  }

  if (maximumEvidenceAgeMs === null) {
    blockers.push(
      "MAXIMUM_FILL_EVIDENCE_AGE_REQUIRED",
    );
  }

  if (maximumSlippagePercent === null) {
    blockers.push(
      "MAXIMUM_SIMULATED_SLIPPAGE_REQUIRED",
    );
  }

  return {
    enabled,
    maximumEvidenceAgeMs,
    maximumSlippagePercent,
    state:
      !enabled
        ? "DISABLED"
        : blockers.length > 0
          ? "INCOMPLETE"
          : "READY",
    blockers,
  };
}

function normalizeExecutionPlanProposal(
  input:
    HedgeInventoryExecutionPlanProposalConfigurationInput | undefined,
): HedgeInventoryManagementConfiguration["executionPlanProposal"] {
  if (
    input !== undefined &&
    (
      typeof input !== "object" ||
      input === null ||
      Array.isArray(input)
    )
  ) {
    throw new Error(
      "Hedge / inventory executionPlanProposal must be an object.",
    );
  }

  if (
    input?.enabled !== undefined &&
    typeof input.enabled !== "boolean"
  ) {
    throw new Error(
      "Hedge / inventory executionPlanProposal.enabled must be a boolean.",
    );
  }

  const enabled =
    input?.enabled ?? false;

  const maximumPreflightAgeMs =
    normalizeOptionalPositiveSafeInteger(
      input?.maximumPreflightAgeMs,
      "executionPlanProposal.maximumPreflightAgeMs",
    );

  const proposalTtlMs =
    normalizeOptionalPositiveSafeInteger(
      input?.proposalTtlMs,
      "executionPlanProposal.proposalTtlMs",
    );

  const blockers:
    HedgeInventoryExecutionPlanProposalConfigurationBlocker[] =
    [];

  if (!enabled) {
    blockers.push(
      "SHADOW_EXECUTION_PLAN_PROPOSAL_DISABLED",
    );
  }

  if (maximumPreflightAgeMs === null) {
    blockers.push(
      "MAXIMUM_PREFLIGHT_AGE_REQUIRED",
    );
  }

  if (proposalTtlMs === null) {
    blockers.push(
      "EXECUTION_PLAN_PROPOSAL_TTL_REQUIRED",
    );
  }

  return {
    enabled,
    maximumPreflightAgeMs,
    proposalTtlMs,
    state:
      !enabled
        ? "DISABLED"
        : blockers.length > 0
          ? "INCOMPLETE"
          : "READY",
    blockers,
  };
}

function normalizeIntentPreflight(
  input:
    HedgeInventoryIntentPreflightConfigurationInput | undefined,
): HedgeInventoryManagementConfiguration["intentPreflight"] {
  if (
    input !== undefined &&
    (
      typeof input !== "object" ||
      input === null ||
      Array.isArray(input)
    )
  ) {
    throw new Error(
      "Hedge / inventory intentPreflight must be an object.",
    );
  }

  if (
    input?.enabled !== undefined &&
    typeof input.enabled !== "boolean"
  ) {
    throw new Error(
      "Hedge / inventory intentPreflight.enabled must be a boolean.",
    );
  }

  const enabled =
    input?.enabled ?? false;

  const maximumLifecycleAgeMs =
    normalizeOptionalPositiveSafeInteger(
      input?.maximumLifecycleAgeMs,
      "intentPreflight.maximumLifecycleAgeMs",
    );

  const blockers:
    HedgeInventoryIntentPreflightConfigurationBlocker[] =
    [];

  if (!enabled) {
    blockers.push(
      "INTENT_LAST_LOOK_PREFLIGHT_DISABLED",
    );
  }

  if (maximumLifecycleAgeMs === null) {
    blockers.push(
      "MAXIMUM_LIFECYCLE_AGE_REQUIRED",
    );
  }

  return {
    enabled,
    maximumLifecycleAgeMs,
    state:
      !enabled
        ? "DISABLED"
        : blockers.length > 0
          ? "INCOMPLETE"
          : "READY",
    blockers,
  };
}

function normalizeIntentLifecycle(
  input:
    HedgeInventoryIntentLifecycleConfigurationInput | undefined,
): HedgeInventoryManagementConfiguration["intentLifecycle"] {
  if (
    input !== undefined &&
    (
      typeof input !== "object" ||
      input === null ||
      Array.isArray(input)
    )
  ) {
    throw new Error(
      "Hedge / inventory intentLifecycle must be an object.",
    );
  }

  if (
    input?.enabled !== undefined &&
    typeof input.enabled !== "boolean"
  ) {
    throw new Error(
      "Hedge / inventory intentLifecycle.enabled must be a boolean.",
    );
  }

  const enabled =
    input?.enabled ?? false;

  const maximumIntentAgeMs =
    normalizeOptionalPositiveSafeInteger(
      input?.maximumIntentAgeMs,
      "intentLifecycle.maximumIntentAgeMs",
    );

  const blockers:
    HedgeInventoryIntentLifecycleConfigurationBlocker[] =
    [];

  if (!enabled) {
    blockers.push(
      "INTENT_LIFECYCLE_REVALIDATION_DISABLED",
    );
  }

  if (maximumIntentAgeMs === null) {
    blockers.push(
      "MAXIMUM_INTENT_AGE_REQUIRED",
    );
  }

  return {
    enabled,
    maximumIntentAgeMs,
    state:
      !enabled
        ? "DISABLED"
        : blockers.length > 0
          ? "INCOMPLETE"
          : "READY",
    blockers,
  };
}

function normalizeIntentPersistence(
  input:
    HedgeInventoryIntentPersistenceConfigurationInput | undefined,
): HedgeInventoryManagementConfiguration["intentPersistence"] {
  if (
    input !== undefined &&
    (
      typeof input !== "object" ||
      input === null ||
      Array.isArray(input)
    )
  ) {
    throw new Error(
      "Hedge / inventory intentPersistence must be an object.",
    );
  }

  if (
    input?.enabled !== undefined &&
    typeof input.enabled !== "boolean"
  ) {
    throw new Error(
      "Hedge / inventory intentPersistence.enabled must be a boolean.",
    );
  }

  const enabled =
    input?.enabled ?? false;

  const maximumProposalAgeMs =
    normalizeOptionalPositiveSafeInteger(
      input?.maximumProposalAgeMs,
      "intentPersistence.maximumProposalAgeMs",
    );

  const blockers:
    HedgeInventoryIntentPersistenceConfigurationBlocker[] =
    [];

  if (!enabled) {
    blockers.push(
      "STRATEGY_INTENT_PERSISTENCE_DISABLED",
    );
  }

  if (maximumProposalAgeMs === null) {
    blockers.push(
      "MAXIMUM_PROPOSAL_AGE_REQUIRED",
    );
  }

  return {
    enabled,
    maximumProposalAgeMs,
    state:
      !enabled
        ? "DISABLED"
        : blockers.length > 0
          ? "INCOMPLETE"
          : "READY",
    blockers,
  };
}

function normalizeIntentProposal(
  input:
    HedgeInventoryIntentProposalConfigurationInput | undefined,
): HedgeInventoryManagementConfiguration["intentProposal"] {
  if (
    input !== undefined &&
    (
      typeof input !== "object" ||
      input === null ||
      Array.isArray(input)
    )
  ) {
    throw new Error(
      "Hedge / inventory intentProposal must be an object.",
    );
  }

  if (
    input?.enabled !== undefined &&
    typeof input.enabled !== "boolean"
  ) {
    throw new Error(
      "Hedge / inventory intentProposal.enabled must be a boolean.",
    );
  }

  const enabled =
    input?.enabled ?? false;

  const maximumCapitalReservationAgeMs =
    normalizeOptionalPositiveSafeInteger(
      input?.maximumCapitalReservationAgeMs,
      "intentProposal.maximumCapitalReservationAgeMs",
    );

  const proposalTtlMs =
    normalizeOptionalPositiveSafeInteger(
      input?.proposalTtlMs,
      "intentProposal.proposalTtlMs",
    );

  const maximumRecursionDepth =
    normalizeOptionalNonNegativeSafeInteger(
      input?.maximumRecursionDepth,
      "intentProposal.maximumRecursionDepth",
    );

  const blockers:
    HedgeInventoryIntentProposalConfigurationBlocker[] =
    [];

  if (!enabled) {
    blockers.push(
      "HEDGE_INTENT_PROPOSAL_DISABLED",
    );
  }

  if (maximumCapitalReservationAgeMs === null) {
    blockers.push(
      "MAXIMUM_RESERVATION_SOURCE_AGE_REQUIRED",
    );
  }

  if (proposalTtlMs === null) {
    blockers.push(
      "HEDGE_INTENT_PROPOSAL_TTL_REQUIRED",
    );
  }

  if (maximumRecursionDepth !== 0) {
    blockers.push(
      "RECURSION_DEPTH_MUST_BE_ZERO",
    );
  }

  return {
    enabled,
    maximumCapitalReservationAgeMs,
    proposalTtlMs,
    maximumRecursionDepth,
    state:
      !enabled
        ? "DISABLED"
        : blockers.length > 0
          ? "INCOMPLETE"
          : "READY",
    blockers,
  };
}

function normalizeCapitalReservation(
  input:
    HedgeInventoryCapitalReservationConfigurationInput | undefined,
): HedgeInventoryManagementConfiguration["capitalReservation"] {
  if (
    input !== undefined &&
    (
      typeof input !== "object" ||
      input === null ||
      Array.isArray(input)
    )
  ) {
    throw new Error(
      "Hedge / inventory capitalReservation must be an object.",
    );
  }

  if (
    input?.enabled !== undefined &&
    typeof input.enabled !== "boolean"
  ) {
    throw new Error(
      "Hedge / inventory capitalReservation.enabled must be a boolean.",
    );
  }

  const enabled =
    input?.enabled ?? false;

  const maximumEvidenceAgeMs =
    normalizeOptionalPositiveSafeInteger(
      input?.maximumEvidenceAgeMs,
      "capitalReservation.maximumEvidenceAgeMs",
    );

  const minimumRemainingTtlMs =
    normalizeOptionalPositiveSafeInteger(
      input?.minimumRemainingTtlMs,
      "capitalReservation.minimumRemainingTtlMs",
    );

  const blockers:
    HedgeInventoryCapitalReservationConfigurationBlocker[] =
    [];

  if (!enabled) {
    blockers.push(
      "CAPITAL_RESERVATION_EVIDENCE_DISABLED",
    );
  }

  if (maximumEvidenceAgeMs === null) {
    blockers.push(
      "MAXIMUM_RESERVATION_EVIDENCE_AGE_REQUIRED",
    );
  }

  if (minimumRemainingTtlMs === null) {
    blockers.push(
      "MINIMUM_RESERVATION_TTL_REQUIRED",
    );
  }

  return {
    enabled,
    maximumEvidenceAgeMs,
    minimumRemainingTtlMs,
    state:
      !enabled
        ? "DISABLED"
        : blockers.length > 0
          ? "INCOMPLETE"
          : "READY",
    blockers,
  };
}

function normalizeRiskApproval(
  input:
    HedgeInventoryRiskApprovalConfigurationInput | undefined,
): HedgeInventoryManagementConfiguration["riskApproval"] {
  if (
    input !== undefined &&
    (
      typeof input !== "object" ||
      input === null ||
      Array.isArray(input)
    )
  ) {
    throw new Error(
      "Hedge / inventory riskApproval must be an object.",
    );
  }

  if (
    input?.enabled !== undefined &&
    typeof input.enabled !== "boolean"
  ) {
    throw new Error(
      "Hedge / inventory riskApproval.enabled must be a boolean.",
    );
  }

  const enabled =
    input?.enabled ?? false;

  const maximumAssessmentAgeMs =
    normalizeOptionalPositiveSafeInteger(
      input?.maximumAssessmentAgeMs,
      "riskApproval.maximumAssessmentAgeMs",
    );

  const blockers:
    HedgeInventoryRiskApprovalConfigurationBlocker[] =
    [];

  if (!enabled) {
    blockers.push(
      "RISK_ENGINE_APPROVAL_EVALUATION_DISABLED",
    );
  }

  if (maximumAssessmentAgeMs === null) {
    blockers.push(
      "MAXIMUM_RISK_ASSESSMENT_AGE_REQUIRED",
    );
  }

  return {
    enabled,
    maximumAssessmentAgeMs,
    state:
      !enabled
        ? "DISABLED"
        : blockers.length > 0
          ? "INCOMPLETE"
          : "READY",
    blockers,
  };
}

function normalizeBasisRisk(
  input:
    HedgeInventoryBasisRiskConfigurationInput | undefined,
): HedgeInventoryManagementConfiguration["basisRisk"] {
  if (
    input !== undefined &&
    (
      typeof input !== "object" ||
      input === null ||
      Array.isArray(input)
    )
  ) {
    throw new Error(
      "Hedge / inventory basisRisk must be an object.",
    );
  }

  if (
    input?.enabled !== undefined &&
    typeof input.enabled !== "boolean"
  ) {
    throw new Error(
      "Hedge / inventory basisRisk.enabled must be a boolean.",
    );
  }

  const enabled =
    input?.enabled ?? false;

  const maximumEvidenceAgeMs =
    normalizeOptionalPositiveSafeInteger(
      input?.maximumEvidenceAgeMs,
      "basisRisk.maximumEvidenceAgeMs",
    );

  const maximumBasisDeviationPercent =
    normalizeOptionalNonNegativePercent(
      input?.maximumBasisDeviationPercent,
      "basisRisk.maximumBasisDeviationPercent",
    );

  const minimumCorrelationCoefficient =
    normalizeOptionalCorrelationCoefficient(
      input?.minimumCorrelationCoefficient,
      "basisRisk.minimumCorrelationCoefficient",
    );

  const minimumCorrelationObservations =
    normalizeOptionalPositiveSafeInteger(
      input?.minimumCorrelationObservations,
      "basisRisk.minimumCorrelationObservations",
    );

  const blockers:
    HedgeInventoryBasisRiskConfigurationBlocker[] =
    [];

  if (!enabled) {
    blockers.push(
      "BASIS_RISK_EVALUATION_DISABLED",
    );
  }

  if (maximumEvidenceAgeMs === null) {
    blockers.push(
      "MAXIMUM_BASIS_EVIDENCE_AGE_REQUIRED",
    );
  }

  if (maximumBasisDeviationPercent === null) {
    blockers.push(
      "MAXIMUM_BASIS_DEVIATION_REQUIRED",
    );
  }

  if (minimumCorrelationCoefficient === null) {
    blockers.push(
      "MINIMUM_CORRELATION_REQUIRED",
    );
  }

  if (minimumCorrelationObservations === null) {
    blockers.push(
      "MINIMUM_CORRELATION_OBSERVATIONS_REQUIRED",
    );
  }

  return {
    enabled,
    maximumEvidenceAgeMs,
    maximumBasisDeviationPercent,
    minimumCorrelationCoefficient,
    minimumCorrelationObservations,
    state:
      !enabled
        ? "DISABLED"
        : blockers.length > 0
          ? "INCOMPLETE"
          : "READY",
    blockers,
  };
}

function normalizePostRuleEconomics(
  input:
    HedgeInventoryPostRuleEconomicsConfigurationInput | undefined,
): HedgeInventoryManagementConfiguration["postRuleEconomics"] {
  if (
    input !== undefined &&
    (
      typeof input !== "object" ||
      input === null ||
      Array.isArray(input)
    )
  ) {
    throw new Error(
      "Hedge / inventory postRuleEconomics must be an object.",
    );
  }

  if (
    input?.enabled !== undefined &&
    typeof input.enabled !== "boolean"
  ) {
    throw new Error(
      "Hedge / inventory postRuleEconomics.enabled must be a boolean.",
    );
  }

  const enabled =
    input?.enabled ?? false;

  return {
    enabled,
    state:
      enabled
        ? "READY"
        : "DISABLED",
    blockers:
      enabled
        ? []
        : [
            "POST_RULE_ECONOMICS_REVALIDATION_DISABLED",
          ],
  };
}

function normalizeMarketRules(
  input:
    HedgeInventoryMarketRuleConfigurationInput | undefined,
): HedgeInventoryManagementConfiguration["marketRules"] {
  if (
    input !== undefined &&
    (
      typeof input !== "object" ||
      input === null ||
      Array.isArray(input)
    )
  ) {
    throw new Error(
      "Hedge / inventory marketRules must be an object.",
    );
  }

  if (
    input?.enabled !== undefined &&
    typeof input.enabled !== "boolean"
  ) {
    throw new Error(
      "Hedge / inventory marketRules.enabled must be a boolean.",
    );
  }

  const enabled =
    input?.enabled ?? false;

  const maximumCapabilityAgeMs =
    normalizeOptionalPositiveSafeInteger(
      input?.maximumCapabilityAgeMs,
      "marketRules.maximumCapabilityAgeMs",
    );

  const maximumQuantizationLossPercent =
    normalizeOptionalNonNegativePercent(
      input?.maximumQuantizationLossPercent,
      "marketRules.maximumQuantizationLossPercent",
    );

  const blockers:
    HedgeInventoryMarketRuleConfigurationBlocker[] =
    [];

  if (!enabled) {
    blockers.push(
      "MARKET_RULE_FEASIBILITY_DISABLED",
    );
  }

  if (maximumCapabilityAgeMs === null) {
    blockers.push(
      "MAXIMUM_CAPABILITY_AGE_REQUIRED",
    );
  }

  if (maximumQuantizationLossPercent === null) {
    blockers.push(
      "MAXIMUM_QUANTIZATION_LOSS_REQUIRED",
    );
  }

  return {
    enabled,
    maximumCapabilityAgeMs,
    maximumQuantizationLossPercent,
    state:
      !enabled
        ? "DISABLED"
        : blockers.length > 0
          ? "INCOMPLETE"
          : "READY",
    blockers,
  };
}

function normalizeRouteEconomics(
  input:
    HedgeInventoryRouteEconomicsConfigurationInput | undefined,
): HedgeInventoryManagementConfiguration["routeEconomics"] {
  if (
    input !== undefined &&
    (
      typeof input !== "object" ||
      input === null ||
      Array.isArray(input)
    )
  ) {
    throw new Error(
      "Hedge / inventory routeEconomics must be an object.",
    );
  }

  if (
    input?.enabled !== undefined &&
    typeof input.enabled !== "boolean"
  ) {
    throw new Error(
      "Hedge / inventory routeEconomics.enabled must be a boolean.",
    );
  }

  const enabled =
    input?.enabled ?? false;

  const maximumOrderBookAgeMs =
    normalizeOptionalPositiveSafeInteger(
      input?.maximumOrderBookAgeMs,
      "routeEconomics.maximumOrderBookAgeMs",
    );

  const maximumFeeAgeMs =
    normalizeOptionalPositiveSafeInteger(
      input?.maximumFeeAgeMs,
      "routeEconomics.maximumFeeAgeMs",
    );

  const maximumSlippagePercent =
    normalizeOptionalNonNegativePercent(
      input?.maximumSlippagePercent,
      "routeEconomics.maximumSlippagePercent",
    );

  const blockers:
    HedgeInventoryRouteEconomicsConfigurationBlocker[] =
    [];

  if (!enabled) {
    blockers.push("ROUTE_ECONOMICS_DISABLED");
  }

  if (maximumOrderBookAgeMs === null) {
    blockers.push("MAXIMUM_ORDER_BOOK_AGE_REQUIRED");
  }

  if (maximumFeeAgeMs === null) {
    blockers.push("MAXIMUM_FEE_AGE_REQUIRED");
  }

  if (maximumSlippagePercent === null) {
    blockers.push("MAXIMUM_SLIPPAGE_REQUIRED");
  }

  return {
    enabled,
    maximumOrderBookAgeMs,
    maximumFeeAgeMs,
    maximumSlippagePercent,
    state:
      !enabled
        ? "DISABLED"
        : blockers.length > 0
          ? "INCOMPLETE"
          : "READY",
    blockers,
  };
}

function normalizeOptionalNonNegativePercent(
  value:
    number | null | undefined,
  fieldName:
    string,
): number | null {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  if (
    !Number.isFinite(value) ||
    value < 0 ||
    value >= 100
  ) {
    throw new Error(
      `Hedge / inventory ${fieldName} must be a finite number greater than or equal to 0 and less than 100.`,
    );
  }

  return value;
}

function normalizeOptionalCorrelationCoefficient(
  value:
    number | null | undefined,
  fieldName:
    string,
): number | null {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  if (
    !Number.isFinite(value) ||
    value < -1 ||
    value > 1
  ) {
    throw new Error(
      `Hedge / inventory ${fieldName} must be a finite number from -1 through 1.`,
    );
  }

  return value;
}

function normalizeOptionalAsset(
  value:
    string | null | undefined,
  fieldName:
    string,
): string | null {
  if (
    value ===
      undefined ||
    value ===
      null
  ) {
    return null;
  }

  if (
    typeof value !==
      "string"
  ) {
    throw new Error(
      `Hedge / inventory ${fieldName} must be a string or null.`,
    );
  }

  const normalized =
    value
      .trim()
      .toUpperCase();

  if (
    !ASSET_PATTERN.test(
      normalized,
    )
  ) {
    throw new Error(
      `Hedge / inventory ${fieldName} is invalid: ${value}`,
    );
  }

  return normalized;
}

function normalizeAssetAllowlist(
  values:
    readonly string[],
): readonly string[] {
  if (
    !Array.isArray(
      values,
    )
  ) {
    throw new Error(
      "Hedge / inventory assetAllowlist must be an array.",
    );
  }

  const normalized =
    values.map(
      (value) => {
        const asset =
          normalizeOptionalAsset(
            value,
            "assetAllowlist entry",
          );

        if (
          asset ===
            null
        ) {
          throw new Error(
            "Hedge / inventory assetAllowlist entries cannot be null.",
          );
        }

        return asset;
      },
    );

  return [
    ...new Set(
      normalized,
    ),
  ].sort();
}

function normalizeTargetInventory(
  values:
    Readonly<Record<string, number>>,
  assetAllowlist:
    readonly string[],
): Readonly<Record<string, number>> {
  if (
    typeof values !==
      "object" ||
    values ===
      null ||
    Array.isArray(
      values,
    )
  ) {
    throw new Error(
      "Hedge / inventory targetInventoryByAsset must be an object.",
    );
  }

  const normalized:
    Record<string, number> =
    {};

  for (
    const [
      rawAsset,
      quantity,
    ]
    of Object.entries(
      values,
    )
  ) {
    const asset =
      normalizeOptionalAsset(
        rawAsset,
        "targetInventoryByAsset key",
      );

    if (
      asset ===
        null
    ) {
      throw new Error(
        "Hedge / inventory targetInventoryByAsset keys cannot be null.",
      );
    }

    if (
      !Number.isFinite(
        quantity,
      ) ||
      quantity <
        0
    ) {
      throw new Error(
        `Hedge / inventory target quantity must be a non-negative finite number: ${rawAsset}`,
      );
    }

    if (
      normalized[
        asset
      ] !==
        undefined
    ) {
      throw new Error(
        `Hedge / inventory target asset is duplicated after normalization: ${asset}`,
      );
    }

    normalized[
      asset
    ] =
      quantity;
  }

  const allowed =
    new Set(
      assetAllowlist,
    );

  for (
    const asset
    of Object.keys(
      normalized,
    )
  ) {
    if (
      !allowed.has(
        asset,
      )
    ) {
      throw new Error(
        `Hedge / inventory target asset is not allowlisted: ${asset}`,
      );
    }
  }

  return Object.fromEntries(
    Object.entries(
      normalized,
    ).sort(
      ([first], [second]) =>
        first.localeCompare(
          second,
        ),
    ),
  );
}

function normalizeOptionalPositiveNumber(
  value:
    number | null | undefined,
  fieldName:
    string,
): number | null {
  if (
    value ===
      undefined ||
    value ===
      null
  ) {
    return null;
  }

  if (
    !Number.isFinite(
      value,
    ) ||
    value <=
      0
  ) {
    throw new Error(
      `Hedge / inventory ${fieldName} must be a positive finite number.`,
    );
  }

  return value;
}

function normalizeHedgeRatio(
  value:
    number | null | undefined,
): number | null {
  const normalized =
    normalizeOptionalPositiveNumber(
      value,
      "hedgeRatio",
    );

  if (
    normalized !==
      null &&
    normalized >
      1
  ) {
    throw new Error(
      "Hedge / inventory hedgeRatio must be greater than 0 and less than or equal to 1.",
    );
  }

  return normalized;
}

function normalizeVenueAllowlist(
  values:
    readonly string[],
): readonly string[] {
  if (
    !Array.isArray(
      values,
    )
  ) {
    throw new Error(
      "Hedge / inventory hedgeVenueAllowlist must be an array.",
    );
  }

  const normalized =
    values.map(
      (value) => {
        if (
          typeof value !==
            "string"
        ) {
          throw new Error(
            "Hedge / inventory hedgeVenueAllowlist entries must be strings.",
          );
        }

        const venue =
          value
            .trim()
            .toLowerCase();

        if (
          !VENUE_PATTERN.test(
            venue,
          )
        ) {
          throw new Error(
            `Hedge / inventory venue is invalid: ${value}`,
          );
        }

        return venue;
      },
    );

  return [
    ...new Set(
      normalized,
    ),
  ].sort();
}

function normalizeOptionalPositiveSafeInteger(
  value:
    number | null | undefined,
  fieldName:
    string,
): number | null {
  if (
    value ===
      undefined ||
    value ===
      null
  ) {
    return null;
  }

  if (
    !Number.isSafeInteger(
      value,
    ) ||
    value <=
      0
  ) {
    throw new Error(
      `Hedge / inventory ${fieldName} must be a positive safe integer.`,
    );
  }

  return value;
}

function normalizeOptionalNonNegativeSafeInteger(
  value:
    number | null | undefined,
  fieldName:
    string,
): number | null {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  if (
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new Error(
      `Hedge / inventory ${fieldName} must be a non-negative safe integer.`,
    );
  }

  return value;
}

function deepFreeze<T>(
  value:
    T,
): T {
  if (
    value ===
      null ||
    typeof value !==
      "object" ||
    Object.isFrozen(
      value,
    )
  ) {
    return value;
  }

  for (
    const nested
    of Object.values(
      value,
    )
  ) {
    deepFreeze(
      nested,
    );
  }

  return Object.freeze(
    value,
  );
}

