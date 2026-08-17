import type {
  StrategyMetadata,
} from "../models/StrategyMetadata";

import type {
  StrategyRuntimeSnapshot,
} from "../models/StrategyRuntimeSnapshot";

import type {
  StrategySignal,
} from "../models/StrategySignal";

import type {
  StrategyEvidenceStatus,
} from "../models/StrategyEvidenceStatus";

import type {
  StrategyIntent,
} from "../models/StrategyIntent";

export interface StrategyLifecycleEvidence {
  readonly evidenceStatus:
    StrategyEvidenceStatus;
}

export interface StrategyFillAndHedgeEvidence {
  readonly evidenceStatus:
    StrategyEvidenceStatus;
}

export interface StrategyShadowAnalyticsEvidence {
  readonly evidenceStatus:
    StrategyEvidenceStatus;
}

export interface StrategyExposureEvidence {
  readonly evidenceStatus:
    StrategyEvidenceStatus;
}

export interface StrategyHedgeTargetEvidence {
  readonly evidenceStatus:
    StrategyEvidenceStatus;
}

export interface StrategyHedgeRouteEvidence {
  readonly evidenceStatus:
    StrategyEvidenceStatus;
}

export interface StrategyHedgeMarketRuleEvidence {
  readonly evidenceStatus:
    StrategyEvidenceStatus;
}

export interface StrategyHedgePostRuleEconomicsEvidence {
  readonly evidenceStatus:
    StrategyEvidenceStatus;
}

export interface StrategyHedgeBasisRiskEvidence {
  readonly evidenceStatus:
    StrategyEvidenceStatus;
}

export interface StrategyHedgeRiskApprovalEvidence {
  readonly evidenceStatus:
    StrategyEvidenceStatus;
}

export interface StrategyHedgeCapitalReservationEvidence {
  readonly evidenceStatus:
    StrategyEvidenceStatus;
}

export interface StrategyHedgeIntentProposalEvidence {
  readonly evidenceStatus:
    StrategyEvidenceStatus;
}

export interface StrategyHedgeIntentPersistenceEvidence {
  readonly evidenceStatus:
    StrategyEvidenceStatus;
}

export interface StrategyHedgeIntentLifecycleEvidence {
  readonly evidenceStatus:
    StrategyEvidenceStatus;
}

export interface StrategyHedgeIntentLastLookEvidence {
  readonly evidenceStatus:
    StrategyEvidenceStatus;
}

export interface StrategyHedgeExecutionPlanProposalEvidence {
  readonly evidenceStatus:
    StrategyEvidenceStatus;
}

export interface StrategyHedgeShadowFillSimulationEvidence {
  readonly evidenceStatus:
    StrategyEvidenceStatus;
}

export interface StrategyHedgeResidualReconciliationEvidence {
  readonly evidenceStatus:
    StrategyEvidenceStatus;
}

export interface StrategyHedgeRecoveryProposalEvidence {
  readonly evidenceStatus:
    StrategyEvidenceStatus;
}

export interface StrategyHedgeRecoveryProposalLifecycleEvidence {
  readonly evidenceStatus:
    StrategyEvidenceStatus;
}

export interface StrategyHedgeRecoveryActionHandoffEvidence {
  readonly evidenceStatus:
    StrategyEvidenceStatus;
}

export type StrategySignalListener = (
  signal:
    StrategySignal,
) => void;

/**
 * Strategy controllers observe and normalize evidence.
 *
 * Deliberately absent from this contract:
 * - intent creation
 * - account or capital mutation
 * - Paper execution
 * - LIVE execution
 * - order submission
 */
export interface StrategyController {
  getMetadata():
    StrategyMetadata;

  /**
   * Optional immutable, read-only configuration evidence.
   *
   * This is intentionally not a mutation surface. Strategy-specific
   * configuration is supplied at construction/bootstrap time.
   */
  getConfiguration?():
    unknown;

  /** Strategy-owned immutable evidence used for exact blocker counts. */
  getDiagnosticEvidence?():
    unknown;

  /**
   * Optional immutable SHADOW lifecycle evidence.
   * It is a read model only and does not expose lifecycle mutation.
   */
  getLifecycleSnapshot?(
    now?:
      number,
  ):
    StrategyLifecycleEvidence;

  getFillAndHedgeSnapshot?(
    now?:
      number,
  ):
    StrategyFillAndHedgeEvidence;

  getShadowAnalyticsSnapshot?(
    now?:
      number,
  ):
    StrategyShadowAnalyticsEvidence;

  getExposureSnapshot?(
    now?:
      number,
  ):
    StrategyExposureEvidence;

  getHedgeTargetSnapshot?(
    now?:
      number,
  ):
    StrategyHedgeTargetEvidence;

  getHedgeRouteSnapshot?(
    now?:
      number,
  ):
    StrategyHedgeRouteEvidence;

  getHedgeMarketRuleSnapshot?(
    now?:
      number,
  ):
    StrategyHedgeMarketRuleEvidence;

  getHedgePostRuleEconomicsSnapshot?(
    now?:
      number,
  ):
    StrategyHedgePostRuleEconomicsEvidence;

  getHedgeBasisRiskSnapshot?(
    now?:
      number,
  ):
    StrategyHedgeBasisRiskEvidence;

  getHedgeRiskApprovalSnapshot?(
    now?:
      number,
  ):
    StrategyHedgeRiskApprovalEvidence;

  getHedgeCapitalReservationSnapshot?(
    now?:
      number,
  ):
    StrategyHedgeCapitalReservationEvidence;

  getHedgeIntentProposalSnapshot?(
    now?:
      number,
  ):
    StrategyHedgeIntentProposalEvidence;

  getHedgeIntentPersistenceSnapshot?(
    now?:
      number,
  ):
    StrategyHedgeIntentPersistenceEvidence;

  getHedgeIntentLifecycleSnapshot?(
    now?:
      number,
  ):
    StrategyHedgeIntentLifecycleEvidence;

  getHedgeIntentLastLookSnapshot?(
    now?:
      number,
  ):
    StrategyHedgeIntentLastLookEvidence;

  getHedgeExecutionPlanProposalSnapshot?(
    now?:
      number,
  ):
    StrategyHedgeExecutionPlanProposalEvidence;

  getHedgeShadowFillSimulationSnapshot?(
    now?:
      number,
  ):
    StrategyHedgeShadowFillSimulationEvidence;

  getHedgeResidualReconciliationSnapshot?(
    now?:
      number,
  ):
    StrategyHedgeResidualReconciliationEvidence;

  getHedgeRecoveryProposalSnapshot?(
    now?:
      number,
  ):
    StrategyHedgeRecoveryProposalEvidence;

  getHedgeRecoveryProposalLifecycleSnapshot?(
    now?:
      number,
  ):
    StrategyHedgeRecoveryProposalLifecycleEvidence;

  getHedgeRecoveryActionHandoffSnapshot?(
    now?:
      number,
  ):
    StrategyHedgeRecoveryActionHandoffEvidence;

  getIntents?(
    now?:
      number,
  ):
    readonly StrategyIntent[];

  start():
    void;

  stop():
    void;

  isRunning():
    boolean;

  getRuntimeSnapshot(
    now?:
      number,
  ):
    StrategyRuntimeSnapshot;

  getSignals(
    now?:
      number,
  ):
    readonly StrategySignal[];

  subscribeToSignals(
    listener:
      StrategySignalListener,
  ):
    () => void;
}
