import type {
  PortfolioSnapshot,
} from "../../portfolio/models/PortfolioSnapshot";

import type {
  StrategyController,
  StrategySignalListener,
} from "../contracts/StrategyController";

import {
  HEDGE_INVENTORY_MANAGEMENT_STRATEGY_ID,
} from "../models/StrategyMetadata";

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
  StrategyIntent,
} from "../models/StrategyIntent";

import {
  StrategyIntentService,
} from "../services/StrategyIntentService";

import {
  createHedgeInventoryManagementConfiguration,
} from "./HedgeInventoryManagementConfiguration";

import type {
  HedgeInventoryManagementConfiguration,
  HedgeInventoryManagementConfigurationInput,
} from "./HedgeInventoryManagementConfiguration";

import {
  HedgeInventoryExposureEvaluator,
} from "./HedgeInventoryExposureEvaluator";

import type {
  HedgeInventoryExposureSnapshot,
  HedgeInventoryExposureSnapshotSource,
} from "./HedgeInventoryExposureEvaluator";

import {
  HedgeInventoryShadowTargetPlanner,
} from "./HedgeInventoryShadowTargetPlanner";

import type {
  HedgeInventoryShadowTargetSnapshot,
} from "./HedgeInventoryShadowTargetPlanner";

import {
  HedgeInventoryRouteEconomicsEvaluator,
} from "./HedgeInventoryRouteEconomicsEvaluator";

import type {
  HedgeInventoryRouteEconomicsSnapshot,
  HedgeInventoryRouteEvidenceSnapshot,
  HedgeInventoryRouteEvidenceSource,
} from "./HedgeInventoryRouteEconomicsEvaluator";

import {
  HedgeInventoryMarketRuleEvaluator,
} from "./HedgeInventoryMarketRuleEvaluator";

import type {
  HedgeInventoryMarketRuleEvidenceSnapshot,
  HedgeInventoryMarketRuleEvidenceSource,
  HedgeInventoryMarketRuleSnapshot,
} from "./HedgeInventoryMarketRuleEvaluator";

import {
  HedgeInventoryPostRuleEconomicsEvaluator,
} from "./HedgeInventoryPostRuleEconomicsEvaluator";

import type {
  HedgeInventoryPostRuleEconomicsSnapshot,
} from "./HedgeInventoryPostRuleEconomicsEvaluator";

import {
  HedgeInventoryBasisRiskEvaluator,
} from "./HedgeInventoryBasisRiskEvaluator";

import type {
  HedgeInventoryBasisRiskEvidenceSnapshot,
  HedgeInventoryBasisRiskEvidenceSource,
  HedgeInventoryBasisRiskSnapshot,
} from "./HedgeInventoryBasisRiskEvaluator";

import {
  HedgeInventoryRiskApprovalEvaluator,
} from "./HedgeInventoryRiskApprovalEvaluator";

import type {
  HedgeInventoryRiskApprovalEvidenceSnapshot,
  HedgeInventoryRiskApprovalEvidenceSource,
  HedgeInventoryRiskApprovalSnapshot,
} from "./HedgeInventoryRiskApprovalEvaluator";

import {
  HedgeInventoryCapitalReservationEvaluator,
} from "./HedgeInventoryCapitalReservationEvaluator";

import {
  HedgeInventoryIntentProposalPlanner,
} from "./HedgeInventoryIntentProposalPlanner";

import type {
  HedgeInventoryIntentProposalSnapshot,
} from "./HedgeInventoryIntentProposalPlanner";

import {
  HedgeInventoryIntentPersistenceService,
} from "./HedgeInventoryIntentPersistenceService";

import type {
  HedgeInventoryIntentPersistenceSnapshot,
} from "./HedgeInventoryIntentPersistenceService";

import {
  HedgeInventoryIntentLifecycleService,
} from "./HedgeInventoryIntentLifecycleService";

import type {
  HedgeInventoryIntentLifecycleSnapshot,
} from "./HedgeInventoryIntentLifecycleService";

import {
  HedgeInventoryIntentLastLookEvaluator,
} from "./HedgeInventoryIntentLastLookEvaluator";

import type {
  HedgeInventoryIntentLastLookSnapshot,
} from "./HedgeInventoryIntentLastLookEvaluator";

import {
  HedgeInventoryShadowExecutionPlanPlanner,
} from "./HedgeInventoryShadowExecutionPlanPlanner";

import type {
  HedgeInventoryShadowExecutionPlanSnapshot,
} from "./HedgeInventoryShadowExecutionPlanPlanner";

import {
  HedgeInventoryShadowFillSimulator,
} from "./HedgeInventoryShadowFillSimulator";

import type {
  HedgeInventoryShadowFillEvidenceSnapshot,
  HedgeInventoryShadowFillEvidenceSource,
  HedgeInventoryShadowFillSimulationSnapshot,
} from "./HedgeInventoryShadowFillSimulator";

import {
  HedgeInventoryResidualReconciliationEvaluator,
} from "./HedgeInventoryResidualReconciliationEvaluator";

import type {
  HedgeInventoryResidualReconciliationEvidenceSnapshot,
  HedgeInventoryResidualReconciliationEvidenceSource,
  HedgeInventoryResidualReconciliationSnapshot,
} from "./HedgeInventoryResidualReconciliationEvaluator";

import {
  HedgeInventoryShadowRecoveryProposalPlanner,
} from "./HedgeInventoryShadowRecoveryProposalPlanner";

import type {
  HedgeInventoryShadowRecoveryProposalSnapshot,
} from "./HedgeInventoryShadowRecoveryProposalPlanner";

import {
  HedgeInventoryRecoveryProposalLifecycleEvaluator,
} from "./HedgeInventoryRecoveryProposalLifecycleEvaluator";

import type {
  HedgeInventoryRecoveryOperatorDecisionEvidenceSnapshot,
  HedgeInventoryRecoveryOperatorDecisionEvidenceSource,
  HedgeInventoryRecoveryProposalLifecycleSnapshot,
} from "./HedgeInventoryRecoveryProposalLifecycleEvaluator";

import {
  HedgeInventoryShadowRecoveryActionHandoffPlanner,
} from "./HedgeInventoryShadowRecoveryActionHandoffPlanner";

import type {
  HedgeInventoryShadowRecoveryActionHandoffSnapshot,
} from "./HedgeInventoryShadowRecoveryActionHandoffPlanner";

import type {
  HedgeInventoryCapitalReservationEvidenceSnapshot,
  HedgeInventoryCapitalReservationEvidenceSource,
  HedgeInventoryCapitalReservationSnapshot,
} from "./HedgeInventoryCapitalReservationEvaluator";

const EMPTY_EXPOSURE_SOURCE:
  HedgeInventoryExposureSnapshotSource = {
  getPortfolioSnapshot: () =>
    null,
};

const EMPTY_ROUTE_EVIDENCE_SOURCE:
  HedgeInventoryRouteEvidenceSource = {
  getRouteEvidence: () =>
    null,
};

const EMPTY_MARKET_RULE_EVIDENCE_SOURCE:
  HedgeInventoryMarketRuleEvidenceSource = {
  getMarketRuleEvidence: () =>
    null,
};

const EMPTY_BASIS_RISK_EVIDENCE_SOURCE:
  HedgeInventoryBasisRiskEvidenceSource = {
  getBasisRiskEvidence: () =>
    null,
};

const EMPTY_RISK_APPROVAL_EVIDENCE_SOURCE:
  HedgeInventoryRiskApprovalEvidenceSource = {
  getRiskApprovalEvidence: () =>
    null,
};

const EMPTY_CAPITAL_RESERVATION_EVIDENCE_SOURCE:
  HedgeInventoryCapitalReservationEvidenceSource = {
  getCapitalReservationEvidence: () =>
    null,
};

const EMPTY_SHADOW_FILL_EVIDENCE_SOURCE:
  HedgeInventoryShadowFillEvidenceSource = {
  getShadowFillEvidence: () =>
    null,
};

const EMPTY_RESIDUAL_RECONCILIATION_EVIDENCE_SOURCE:
  HedgeInventoryResidualReconciliationEvidenceSource = {
  getResidualReconciliationEvidence: () =>
    null,
};

const EMPTY_RECOVERY_OPERATOR_DECISION_EVIDENCE_SOURCE:
  HedgeInventoryRecoveryOperatorDecisionEvidenceSource = {
  getRecoveryOperatorDecisionEvidence: () =>
    null,
};

const METADATA:
  StrategyMetadata = {
  id:
    HEDGE_INVENTORY_MANAGEMENT_STRATEGY_ID,

  strategyNumber:
    3,

  displayName:
    "Hedge / Inventory Management",

  version:
    "22.18",

  category:
    "HEDGE_INVENTORY_MANAGEMENT",

  description:
    "Default-disabled SHADOW-only inventory deviation, hedge-target sizing, route economics, market-rule feasibility, post-quantization economics, basis/correlation screening, RiskEngine approval, capital reservation, bounded intents, immutable lifecycle, last-look preflight, exact-match fill simulation, residual reconciliation, bounded recovery proposals, explicit operator decisions and bounded recovery handoffs with actions blocked.",

  controllerMode:
    "SHADOW_ONLY",

  signalSource:
    "PortfolioSnapshot",

  legacyHistoryAttribution:
    "UNATTRIBUTED_LEGACY",

  capabilities: {
    signalAdaptation:
      false,

    intentGeneration:
      true,

    automaticExecution:
      false,

    paperExecution:
      false,

    liveExecution:
      false,
  },
};

/**
 * V22.18 adds an operator-approved bounded SHADOW recovery-action handoff.
 * Sources are injected and bootstrap remains default-disabled with empty
 * sources. The controller never creates, commits or releases reservations and
 * has no account, balance-mutation, recovery, PAPER, LIVE or order dependency.
 */
export class HedgeInventoryManagementStrategyController
implements StrategyController {
  private readonly configuration:
    HedgeInventoryManagementConfiguration;

  private readonly listeners =
    new Set<
      StrategySignalListener
    >();

  private running =
    false;

  private startCount =
    0;

  private stopCount =
    0;

  private processedSnapshots =
    0;

  private duplicateSnapshotsIgnored =
    0;

  private lastStartedAt:
    number | null =
    null;

  private lastStoppedAt:
    number | null =
    null;

  private lastSnapshotGeneratedAt:
    number | null =
    null;

  private lastSnapshotReceivedAt:
    number | null =
    null;

  private lastSnapshotAssessmentCount:
    number | null =
    null;

  private lastPortfolioSnapshot:
    PortfolioSnapshot | null =
    null;

  private lastError:
    string | null =
    null;

  constructor(
    configuration:
      HedgeInventoryManagementConfigurationInput = {},

    private readonly exposureSource:
      HedgeInventoryExposureSnapshotSource =
        EMPTY_EXPOSURE_SOURCE,

    private readonly routeEvidenceSource:
      HedgeInventoryRouteEvidenceSource =
        EMPTY_ROUTE_EVIDENCE_SOURCE,

    private readonly marketRuleEvidenceSource:
      HedgeInventoryMarketRuleEvidenceSource =
        EMPTY_MARKET_RULE_EVIDENCE_SOURCE,

    private readonly basisRiskEvidenceSource:
      HedgeInventoryBasisRiskEvidenceSource =
        EMPTY_BASIS_RISK_EVIDENCE_SOURCE,

    private readonly riskApprovalEvidenceSource:
      HedgeInventoryRiskApprovalEvidenceSource =
        EMPTY_RISK_APPROVAL_EVIDENCE_SOURCE,

    private readonly capitalReservationEvidenceSource:
      HedgeInventoryCapitalReservationEvidenceSource =
        EMPTY_CAPITAL_RESERVATION_EVIDENCE_SOURCE,

    private readonly exposureEvaluator:
      HedgeInventoryExposureEvaluator =
        new HedgeInventoryExposureEvaluator(),

    private readonly targetPlanner:
      HedgeInventoryShadowTargetPlanner =
        new HedgeInventoryShadowTargetPlanner(),

    private readonly routeEconomicsEvaluator:
      HedgeInventoryRouteEconomicsEvaluator =
        new HedgeInventoryRouteEconomicsEvaluator(),

    private readonly marketRuleEvaluator:
      HedgeInventoryMarketRuleEvaluator =
        new HedgeInventoryMarketRuleEvaluator(),

    private readonly postRuleEconomicsEvaluator:
      HedgeInventoryPostRuleEconomicsEvaluator =
        new HedgeInventoryPostRuleEconomicsEvaluator(),

    private readonly basisRiskEvaluator:
      HedgeInventoryBasisRiskEvaluator =
        new HedgeInventoryBasisRiskEvaluator(),

    private readonly riskApprovalEvaluator:
      HedgeInventoryRiskApprovalEvaluator =
        new HedgeInventoryRiskApprovalEvaluator(),

    private readonly capitalReservationEvaluator:
      HedgeInventoryCapitalReservationEvaluator =
        new HedgeInventoryCapitalReservationEvaluator(),

    private readonly intentProposalPlanner:
      HedgeInventoryIntentProposalPlanner =
        new HedgeInventoryIntentProposalPlanner(),

    private readonly intentService:
      StrategyIntentService =
        new StrategyIntentService(),

    private readonly intentPersistenceService:
      HedgeInventoryIntentPersistenceService =
        new HedgeInventoryIntentPersistenceService(
          intentService,
        ),

    private readonly intentLifecycleService:
      HedgeInventoryIntentLifecycleService =
        new HedgeInventoryIntentLifecycleService(),

    private readonly intentLastLookEvaluator:
      HedgeInventoryIntentLastLookEvaluator =
        new HedgeInventoryIntentLastLookEvaluator(),

    private readonly shadowExecutionPlanPlanner:
      HedgeInventoryShadowExecutionPlanPlanner =
        new HedgeInventoryShadowExecutionPlanPlanner(),

    private readonly shadowFillEvidenceSource:
      HedgeInventoryShadowFillEvidenceSource =
        EMPTY_SHADOW_FILL_EVIDENCE_SOURCE,

    private readonly shadowFillSimulator:
      HedgeInventoryShadowFillSimulator =
        new HedgeInventoryShadowFillSimulator(),

    private readonly residualReconciliationEvidenceSource:
      HedgeInventoryResidualReconciliationEvidenceSource =
        EMPTY_RESIDUAL_RECONCILIATION_EVIDENCE_SOURCE,

    private readonly residualReconciliationEvaluator:
      HedgeInventoryResidualReconciliationEvaluator =
        new HedgeInventoryResidualReconciliationEvaluator(),

    private readonly shadowRecoveryProposalPlanner:
      HedgeInventoryShadowRecoveryProposalPlanner =
        new HedgeInventoryShadowRecoveryProposalPlanner(),

    private readonly recoveryOperatorDecisionEvidenceSource:
      HedgeInventoryRecoveryOperatorDecisionEvidenceSource =
        EMPTY_RECOVERY_OPERATOR_DECISION_EVIDENCE_SOURCE,

    private readonly recoveryProposalLifecycleEvaluator:
      HedgeInventoryRecoveryProposalLifecycleEvaluator =
        new HedgeInventoryRecoveryProposalLifecycleEvaluator(),

    private readonly shadowRecoveryActionHandoffPlanner:
      HedgeInventoryShadowRecoveryActionHandoffPlanner =
        new HedgeInventoryShadowRecoveryActionHandoffPlanner(),
  ) {
    this.configuration =
      createHedgeInventoryManagementConfiguration(
        configuration,
      );
  }

  getMetadata():
    StrategyMetadata {
    return structuredClone(
      METADATA,
    );
  }

  getConfiguration():
    HedgeInventoryManagementConfiguration {
    return this.configuration;
  }

  start():
    void {
    if (
      this.running ||
      this.configuration
        .state !==
        "FOUNDATION_READY"
    ) {
      return;
    }

    this.running =
      true;

    this.startCount +=
      1;

    this.lastStartedAt =
      Date.now();
  }

  stop():
    void {
    if (
      !this.running
    ) {
      return;
    }

    this.running =
      false;

    this.stopCount +=
      1;

    this.lastStoppedAt =
      Date.now();
  }

  isRunning():
    boolean {
    return this.running;
  }

  /**
   * Pulls one immutable PortfolioSnapshot through the injected read-only
   * source. It performs no timer, balance refresh, account action or hedge.
   */
  refreshExposureEvidence(
    now =
      Date.now(),
  ):
    HedgeInventoryExposureSnapshot {
    if (
      !this.running
    ) {
      return this.getExposureSnapshot(
        now,
      );
    }

    let sourceSnapshot:
      PortfolioSnapshot | null;

    try {
      sourceSnapshot =
        this.exposureSource
          .getPortfolioSnapshot(
            now,
          );
    } catch (
      error:
        unknown
    ) {
      this.lastError =
        error instanceof Error
          ? error.message
          : "Unknown PortfolioSnapshot source error.";

      this.lastPortfolioSnapshot =
        null;

      return this.getExposureSnapshot(
        now,
      );
    }

    if (
      sourceSnapshot ===
        null
    ) {
      this.lastPortfolioSnapshot =
        null;

      this.lastError =
        null;

      return this.getExposureSnapshot(
        now,
      );
    }

    if (
      sourceSnapshot.generatedAt ===
        this.lastSnapshotGeneratedAt
    ) {
      this.duplicateSnapshotsIgnored +=
        1;

      return this.getExposureSnapshot(
        now,
      );
    }

    this.lastPortfolioSnapshot =
      structuredClone(
        sourceSnapshot,
      );

    const exposure =
      this.exposureEvaluator
        .evaluate(
          this.configuration,
          this.lastPortfolioSnapshot,
          this.running,
          now,
        );

    this.processedSnapshots +=
      1;

    this.lastSnapshotGeneratedAt =
      sourceSnapshot.generatedAt;

    this.lastSnapshotReceivedAt =
      now;

    this.lastSnapshotAssessmentCount =
      exposure.summary
        .assessedAssets;

    this.lastError =
      null;

    return exposure;
  }

  getExposureSnapshot(
    now =
      Date.now(),
  ):
    HedgeInventoryExposureSnapshot {
    return this.exposureEvaluator
      .evaluate(
        this.configuration,
        this.lastPortfolioSnapshot,
        this.running,
        now,
      );
  }

  getHedgeTargetSnapshot(
    now =
      Date.now(),
  ):
    HedgeInventoryShadowTargetSnapshot {
    return this.targetPlanner
      .plan(
        this.configuration,
        this.getExposureSnapshot(
          now,
        ),
        now,
      );
  }

  getHedgeRouteSnapshot(
    now =
      Date.now(),
  ):
    HedgeInventoryRouteEconomicsSnapshot {
    const targets =
      this.getHedgeTargetSnapshot(
        now,
      );

    let routeEvidence =
      null;

    if (
      this.configuration
        .routeEconomics
        .state ===
        "READY"
    ) {
      try {
        routeEvidence =
          this.routeEvidenceSource
            .getRouteEvidence(
              now,
            );
      } catch {
        routeEvidence =
          null;
      }
    }

    return this.routeEconomicsEvaluator
      .evaluate(
        this.configuration,
        targets,
        routeEvidence,
        now,
      );
  }

  getHedgeMarketRuleSnapshot(
    now =
      Date.now(),
  ):
    HedgeInventoryMarketRuleSnapshot {
    const routes =
      this.getHedgeRouteSnapshot(
        now,
      );

    let marketRuleEvidence:
      HedgeInventoryMarketRuleEvidenceSnapshot | null =
      null;

    if (
      this.configuration.routeEconomics.state === "READY" &&
      this.configuration.marketRules.state === "READY"
    ) {
      try {
        marketRuleEvidence =
          this.marketRuleEvidenceSource
            .getMarketRuleEvidence(
              now,
            );
      } catch {
        marketRuleEvidence =
          null;
      }
    }

    return this.marketRuleEvaluator
      .evaluate(
        this.configuration,
        routes,
        marketRuleEvidence,
        now,
      );
  }

  getHedgePostRuleEconomicsSnapshot(
    now =
      Date.now(),
  ):
    HedgeInventoryPostRuleEconomicsSnapshot {
    const routes =
      this.getHedgeRouteSnapshot(
        now,
      );

    let marketRuleEvidence:
      HedgeInventoryMarketRuleEvidenceSnapshot | null =
      null;

    if (
      this.configuration.routeEconomics.state === "READY" &&
      this.configuration.marketRules.state === "READY"
    ) {
      try {
        marketRuleEvidence =
          this.marketRuleEvidenceSource
            .getMarketRuleEvidence(
              now,
            );
      } catch {
        marketRuleEvidence =
          null;
      }
    }

    const marketRules =
      this.marketRuleEvaluator.evaluate(
        this.configuration,
        routes,
        marketRuleEvidence,
        now,
      );

    let routeEvidence:
      HedgeInventoryRouteEvidenceSnapshot | null =
      null;

    if (
      this.configuration.routeEconomics.state === "READY" &&
      this.configuration.marketRules.state === "READY" &&
      this.configuration.postRuleEconomics.state === "READY"
    ) {
      try {
        routeEvidence =
          this.routeEvidenceSource
            .getRouteEvidence(
              now,
            );
      } catch {
        routeEvidence =
          null;
      }
    }

    return this.postRuleEconomicsEvaluator.evaluate(
      this.configuration,
      routes,
      marketRules,
      routeEvidence,
      now,
    );
  }

  getHedgeBasisRiskSnapshot(
    now =
      Date.now(),
  ):
    HedgeInventoryBasisRiskSnapshot {
    const postRuleEconomics =
      this.getHedgePostRuleEconomicsSnapshot(
        now,
      );

    let basisRiskEvidence:
      HedgeInventoryBasisRiskEvidenceSnapshot | null =
      null;

    if (
      this.configuration.postRuleEconomics.state === "READY" &&
      this.configuration.basisRisk.state === "READY"
    ) {
      try {
        basisRiskEvidence =
          this.basisRiskEvidenceSource
            .getBasisRiskEvidence(
              now,
            );
      } catch {
        basisRiskEvidence =
          null;
      }
    }

    return this.basisRiskEvaluator.evaluate(
      this.configuration,
      postRuleEconomics,
      basisRiskEvidence,
      now,
    );
  }

  getHedgeRiskApprovalSnapshot(
    now =
      Date.now(),
  ):
    HedgeInventoryRiskApprovalSnapshot {
    const basisRisk =
      this.getHedgeBasisRiskSnapshot(
        now,
      );

    let riskApprovalEvidence:
      HedgeInventoryRiskApprovalEvidenceSnapshot | null =
      null;

    if (
      this.configuration.basisRisk.state === "READY" &&
      this.configuration.riskApproval.state === "READY"
    ) {
      try {
        riskApprovalEvidence =
          this.riskApprovalEvidenceSource
            .getRiskApprovalEvidence(
              now,
            );
      } catch {
        riskApprovalEvidence =
          null;
      }
    }

    return this.riskApprovalEvaluator.evaluate(
      this.configuration,
      basisRisk,
      riskApprovalEvidence,
      now,
    );
  }

  getHedgeCapitalReservationSnapshot(
    now =
      Date.now(),
  ):
    HedgeInventoryCapitalReservationSnapshot {
    const riskApproval =
      this.getHedgeRiskApprovalSnapshot(
        now,
      );

    let capitalReservationEvidence:
      HedgeInventoryCapitalReservationEvidenceSnapshot | null =
      null;

    if (
      this.configuration.riskApproval.state === "READY" &&
      this.configuration.capitalReservation.state === "READY"
    ) {
      try {
        capitalReservationEvidence =
          this.capitalReservationEvidenceSource
            .getCapitalReservationEvidence(
              now,
            );
      } catch {
        capitalReservationEvidence =
          null;
      }
    }

    return this.capitalReservationEvaluator.evaluate(
      this.configuration,
      riskApproval,
      capitalReservationEvidence,
      now,
    );
  }

  getHedgeIntentProposalSnapshot(
    now =
      Date.now(),
  ):
    HedgeInventoryIntentProposalSnapshot {
    const capitalReservation =
      this.getHedgeCapitalReservationSnapshot(
        now,
      );

    return this.intentProposalPlanner.evaluate(
      this.configuration,
      capitalReservation,
      now,
    );
  }

  processHedgeIntentProposals(
    now =
      Date.now(),
  ):
    HedgeInventoryIntentPersistenceSnapshot {
    return this.intentPersistenceService.persist(
      this.configuration,
      this.getHedgeIntentProposalSnapshot(
        now,
      ),
      now,
    );
  }

  getHedgeIntentPersistenceSnapshot(
    now =
      Date.now(),
  ):
    HedgeInventoryIntentPersistenceSnapshot {
    return this.intentPersistenceService.evaluate(
      this.configuration,
      this.getHedgeIntentProposalSnapshot(
        now,
      ),
      this.intentService.getIntents(
        HEDGE_INVENTORY_MANAGEMENT_STRATEGY_ID,
        1_000,
      ),
      now,
    );
  }

  processHedgeIntentLifecycle(
    now =
      Date.now(),
  ):
    HedgeInventoryIntentLifecycleSnapshot {
    return this.intentLifecycleService.process(
      this.configuration,
      this.getHedgeIntentProposalSnapshot(
        now,
      ),
      this.intentService.getIntents(
        HEDGE_INVENTORY_MANAGEMENT_STRATEGY_ID,
        1_000,
      ),
      now,
    );
  }

  getHedgeIntentLifecycleSnapshot(
    now =
      Date.now(),
  ):
    HedgeInventoryIntentLifecycleSnapshot {
    return this.intentLifecycleService.evaluate(
      this.configuration,
      this.getHedgeIntentProposalSnapshot(
        now,
      ),
      this.intentService.getIntents(
        HEDGE_INVENTORY_MANAGEMENT_STRATEGY_ID,
        1_000,
      ),
      now,
    );
  }

  getHedgeIntentLastLookSnapshot(
    now =
      Date.now(),
  ):
    HedgeInventoryIntentLastLookSnapshot {
    return this.intentLastLookEvaluator.evaluate(
      this.configuration,
      this.getHedgeIntentLifecycleSnapshot(
        now,
      ),
      now,
    );
  }

  getHedgeExecutionPlanProposalSnapshot(
    now =
      Date.now(),
  ):
    HedgeInventoryShadowExecutionPlanSnapshot {
    return this.shadowExecutionPlanPlanner.evaluate(
      this.configuration,
      this.getHedgeIntentLastLookSnapshot(
        now,
      ),
      now,
    );
  }

  getHedgeShadowFillSimulationSnapshot(
    now =
      Date.now(),
  ):
    HedgeInventoryShadowFillSimulationSnapshot {
    const plans =
      this.getHedgeExecutionPlanProposalSnapshot(
        now,
      );

    let fillEvidence:
      HedgeInventoryShadowFillEvidenceSnapshot | null =
      null;

    if (
      this.configuration
        .shadowFillSimulation
        .state ===
        "READY" &&
      plans.evidenceStatus ===
        "AVAILABLE"
    ) {
      try {
        fillEvidence =
          this.shadowFillEvidenceSource
            .getShadowFillEvidence(
              now,
            );
      } catch {
        fillEvidence =
          null;
      }
    }

    return this.shadowFillSimulator
      .evaluate(
        this.configuration,
        plans,
        fillEvidence,
        now,
      );
  }

  getHedgeResidualReconciliationSnapshot(
    now =
      Date.now(),
  ):
    HedgeInventoryResidualReconciliationSnapshot {
    const simulations =
      this.getHedgeShadowFillSimulationSnapshot(
        now,
      );

    let evidence:
      HedgeInventoryResidualReconciliationEvidenceSnapshot | null =
      null;

    if (
      this.configuration
        .residualReconciliation
        .state ===
        "READY" &&
      simulations.evidenceStatus ===
        "AVAILABLE"
    ) {
      try {
        evidence =
          this.residualReconciliationEvidenceSource
            .getResidualReconciliationEvidence(
              now,
            );
      } catch {
        evidence =
          null;
      }
    }

    return this.residualReconciliationEvaluator
      .evaluate(
        this.configuration,
        simulations,
        evidence,
        now,
      );
  }

  getHedgeRecoveryProposalSnapshot(
    now =
      Date.now(),
  ):
    HedgeInventoryShadowRecoveryProposalSnapshot {
    return this.shadowRecoveryProposalPlanner
      .evaluate(
        this.configuration,
        this.getHedgeResidualReconciliationSnapshot(
          now,
        ),
        now,
      );
  }

  getHedgeRecoveryProposalLifecycleSnapshot(
    now =
      Date.now(),
  ):
    HedgeInventoryRecoveryProposalLifecycleSnapshot {
    const proposals =
      this.getHedgeRecoveryProposalSnapshot(
        now,
      );

    let operatorEvidence:
      HedgeInventoryRecoveryOperatorDecisionEvidenceSnapshot | null =
      null;

    if (
      this.configuration
        .recoveryProposalLifecycle
        .state ===
        "READY" &&
      proposals.evidenceStatus ===
        "AVAILABLE"
    ) {
      try {
        operatorEvidence =
          this.recoveryOperatorDecisionEvidenceSource
            .getRecoveryOperatorDecisionEvidence(
              now,
            );
      } catch {
        operatorEvidence =
          null;
      }
    }

    return this.recoveryProposalLifecycleEvaluator
      .evaluate(
        this.configuration,
        proposals,
        operatorEvidence,
        now,
      );
  }

  getHedgeRecoveryActionHandoffSnapshot(
    now =
      Date.now(),
  ):
    HedgeInventoryShadowRecoveryActionHandoffSnapshot {
    const proposals =
      this.getHedgeRecoveryProposalSnapshot(
        now,
      );

    return this.shadowRecoveryActionHandoffPlanner
      .evaluate(
        this.configuration,
        proposals,
        this.getHedgeRecoveryProposalLifecycleSnapshot(
          now,
        ),
        now,
      );
  }

  getIntents(
    now =
      Date.now(),
  ):
    readonly StrategyIntent[] {
    return this.intentService
      .getIntents(
        HEDGE_INVENTORY_MANAGEMENT_STRATEGY_ID,
        1_000,
      )
      .filter(
        (intent) =>
          intent.expiresAt > now &&
          !this.intentLifecycleService.isTerminal(
            intent.id,
          ),
      );
  }

  getRuntimeSnapshot(
    now =
      Date.now(),
  ):
    StrategyRuntimeSnapshot {
    const exposure =
      this.getExposureSnapshot(
        now,
      );

    return {
      strategyId:
        HEDGE_INVENTORY_MANAGEMENT_STRATEGY_ID,

      generatedAt:
        now,

      running:
        this.running,

      startCount:
        this.startCount,

      stopCount:
        this.stopCount,

      lastStartedAt:
        this.lastStartedAt,

      lastStoppedAt:
        this.lastStoppedAt,

      processedSnapshots:
        this.processedSnapshots,

      duplicateSnapshotsIgnored:
        this.duplicateSnapshotsIgnored,

      totalSignalsObserved:
        0,

      currentSignalCount:
        0,

      lastSnapshotGeneratedAt:
        this.lastSnapshotGeneratedAt,

      lastSnapshotReceivedAt:
        this.lastSnapshotReceivedAt,

      lastSnapshotOpportunityCount:
        this.lastSnapshotAssessmentCount,

      lastSignalObservedAt:
        null,

      lastError:
        this.lastError,

      evidence: {
        snapshot:
          exposure.evidenceStatus,

        signals:
          "NO_DATA",

        performance:
          "NO_DATA",
      },

      legacyHistoryAttribution:
        "UNATTRIBUTED_LEGACY",

      safety: {
        readOnly:
          true,

        signalExecutionAllowed:
          false,

        intentExecutionAllowed:
          false,

        automaticExecutionAllowed:
          false,
      },
    };
  }

  getSignals():
    readonly StrategySignal[] {
    return [];
  }

  subscribeToSignals(
    listener:
      StrategySignalListener,
  ):
    () => void {
    this.listeners.add(
      listener,
    );

    return () => {
      this.listeners.delete(
        listener,
      );
    };
  }
}

