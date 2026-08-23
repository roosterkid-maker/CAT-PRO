import type {
  StrategyEvidenceStatus,
  StrategyLegacyAttribution,
} from "../models/StrategyEvidenceStatus";

import type {
  StrategyMetadata,
} from "../models/StrategyMetadata";

import type {
  StrategyLifecycleEvidence,
  StrategyFillAndHedgeEvidence,
  StrategyShadowAnalyticsEvidence,
  StrategyExposureEvidence,
  StrategyHedgeTargetEvidence,
  StrategyHedgeRouteEvidence,
  StrategyHedgeMarketRuleEvidence,
  StrategyHedgePostRuleEconomicsEvidence,
  StrategyHedgeBasisRiskEvidence,
  StrategyHedgeRiskApprovalEvidence,
  StrategyHedgeCapitalReservationEvidence,
  StrategyHedgeIntentProposalEvidence,
  StrategyHedgeIntentPersistenceEvidence,
  StrategyHedgeIntentLifecycleEvidence,
  StrategyHedgeIntentLastLookEvidence,
  StrategyHedgeExecutionPlanProposalEvidence,
  StrategyHedgeShadowFillSimulationEvidence,
  StrategyHedgeResidualReconciliationEvidence,
  StrategyHedgeRecoveryProposalEvidence,
  StrategyHedgeRecoveryProposalLifecycleEvidence,
  StrategyHedgeRecoveryActionHandoffEvidence,
} from "../contracts/StrategyController";

import type {
  StrategyRuntimeSnapshot,
} from "../models/StrategyRuntimeSnapshot";

import type {
  StrategySignal,
} from "../models/StrategySignal";

import type {
  StrategyPerformanceAnalytics,
} from "../models/StrategyPerformanceAnalytics";

import type {
  StrategyIntent,
} from "../models/StrategyIntent";

import type {
  StrategyAttributionCoverage,
  StrategyAttributionEvidenceSummary,
} from "../models/StrategyAttribution";

import type {
  StrategyOrchestrator,
} from "./StrategyOrchestrator";

import {
  buildStrategyBlockerDiagnostics,
} from "./StrategyBlockerDiagnosticsService";

import type {
  StrategyBlockerDiagnostics,
} from "./StrategyBlockerDiagnosticsService";

import type {
  StrategyRegistry,
} from "./StrategyRegistry";

export interface StrategyListItemReadModel {
  readonly metadata:
    StrategyMetadata;

  readonly runtime:
    StrategyRuntimeSnapshot;
}

export interface StrategyCollectionReadModel {
  readonly generatedAt:
    number;

  readonly version:
    "20.5";

  readonly mode:
    "READ_ONLY_STRATEGY_ANALYTICS";

  readonly evidenceStatus:
    StrategyEvidenceStatus;

  readonly orchestratorRunning:
    boolean;

  readonly strategyCount:
    number;

  readonly strategies:
    readonly StrategyListItemReadModel[];

  readonly safety: StrategySafetyReadModel;
}

export interface StrategyDetailReadModel
extends StrategyListItemReadModel {
  readonly blockerDiagnostics:
    StrategyBlockerDiagnostics;

  readonly configuration: {
    readonly evidenceStatus:
      StrategyEvidenceStatus;

    readonly value:
      unknown | null;
  };

  readonly lifecycle: {
    readonly evidenceStatus:
      StrategyEvidenceStatus;

    readonly value:
      StrategyLifecycleEvidence | null;
  };

  readonly fillAndHedge: {
    readonly evidenceStatus:
      StrategyEvidenceStatus;

    readonly value:
      StrategyFillAndHedgeEvidence | null;
  };

  readonly shadowAnalytics: {
    readonly evidenceStatus:
      StrategyEvidenceStatus;

    readonly value:
      StrategyShadowAnalyticsEvidence | null;
  };

  readonly exposure: {
    readonly evidenceStatus:
      StrategyEvidenceStatus;

    readonly value:
      StrategyExposureEvidence | null;
  };

  readonly hedgeTargets: {
    readonly evidenceStatus:
      StrategyEvidenceStatus;

    readonly value:
      StrategyHedgeTargetEvidence | null;
  };

  readonly hedgeRoutes: {
    readonly evidenceStatus:
      StrategyEvidenceStatus;

    readonly value:
      StrategyHedgeRouteEvidence | null;
  };

  readonly hedgeMarketRules: {
    readonly evidenceStatus:
      StrategyEvidenceStatus;

    readonly value:
      StrategyHedgeMarketRuleEvidence | null;
  };

  readonly hedgePostRuleEconomics: {
    readonly evidenceStatus:
      StrategyEvidenceStatus;

    readonly value:
      StrategyHedgePostRuleEconomicsEvidence | null;
  };

  readonly hedgeBasisRisk: {
    readonly evidenceStatus:
      StrategyEvidenceStatus;

    readonly value:
      StrategyHedgeBasisRiskEvidence | null;
  };

  readonly hedgeRiskApproval: {
    readonly evidenceStatus:
      StrategyEvidenceStatus;

    readonly value:
      StrategyHedgeRiskApprovalEvidence | null;
  };

  readonly hedgeCapitalReservation: {
    readonly evidenceStatus:
      StrategyEvidenceStatus;

    readonly value:
      StrategyHedgeCapitalReservationEvidence | null;
  };

  readonly hedgeIntentProposal: {
    readonly evidenceStatus:
      StrategyEvidenceStatus;

    readonly value:
      StrategyHedgeIntentProposalEvidence | null;
  };

  readonly hedgeIntentPersistence: {
    readonly evidenceStatus:
      StrategyEvidenceStatus;

    readonly value:
      StrategyHedgeIntentPersistenceEvidence | null;
  };

  readonly hedgeIntentLifecycle: {
    readonly evidenceStatus:
      StrategyEvidenceStatus;

    readonly value:
      StrategyHedgeIntentLifecycleEvidence | null;
  };

  readonly hedgeIntentLastLook: {
    readonly evidenceStatus:
      StrategyEvidenceStatus;

    readonly value:
      StrategyHedgeIntentLastLookEvidence | null;
  };

  readonly hedgeExecutionPlanProposal: {
    readonly evidenceStatus:
      StrategyEvidenceStatus;

    readonly value:
      StrategyHedgeExecutionPlanProposalEvidence | null;
  };

  readonly hedgeShadowFillSimulation: {
    readonly evidenceStatus:
      StrategyEvidenceStatus;

    readonly value:
      StrategyHedgeShadowFillSimulationEvidence | null;
  };

  readonly hedgeResidualReconciliation: {
    readonly evidenceStatus:
      StrategyEvidenceStatus;

    readonly value:
      StrategyHedgeResidualReconciliationEvidence | null;
  };

  readonly hedgeRecoveryProposal: {
    readonly evidenceStatus:
      StrategyEvidenceStatus;

    readonly value:
      StrategyHedgeRecoveryProposalEvidence | null;
  };

  readonly hedgeRecoveryProposalLifecycle: {
    readonly evidenceStatus:
      StrategyEvidenceStatus;

    readonly value:
      StrategyHedgeRecoveryProposalLifecycleEvidence | null;
  };

  readonly hedgeRecoveryActionHandoff: {
    readonly evidenceStatus:
      StrategyEvidenceStatus;

    readonly value:
      StrategyHedgeRecoveryActionHandoffEvidence | null;
  };

  readonly signals: {
    readonly evidenceStatus:
      StrategyEvidenceStatus;

    readonly records:
      readonly StrategySignal[];
  };

  readonly intents: {
    readonly evidenceStatus:
      StrategyEvidenceStatus;

    readonly records:
      readonly StrategyIntent[];
  };

  readonly analytics: {
    readonly evidenceStatus:
      StrategyEvidenceStatus;

    readonly legacyHistoryAttribution:
      StrategyLegacyAttribution;

    readonly metrics:
      StrategyPerformanceAnalytics | null;

    readonly reason:
      string;
  };

  readonly attribution: StrategyAttributionReadModel;

  readonly safety:
    StrategySafetyReadModel;
}

export interface StrategyAttributionEvidenceSource {
  getSummary(
    strategyId: string,
    now?: number,
  ): StrategyAttributionEvidenceSummary;

  getPerformance?(
    strategyId: string,
    now?: number,
  ): StrategyPerformanceAnalytics;
}

export interface StrategyIntentEvidenceSource {
  getIntents(
    strategyId: string,
    limit?: number,
  ): readonly StrategyIntent[];
}

export interface StrategyAttributionReadModel {
  readonly evidenceStatus: StrategyEvidenceStatus;

  readonly intentEvidenceStatus:
    StrategyEvidenceStatus;

  readonly intentId:
    string | null;

  readonly attributedShadowOutcomes: {
    readonly evidenceStatus:
      | "AVAILABLE"
      | "NO_DATA"
      | "NOT_REPORTED";

    readonly count: number | null;
  };

  readonly attributedPaperTrades: {
    readonly evidenceStatus:
      | "AVAILABLE"
      | "NO_DATA"
      | "NOT_REPORTED";

    readonly count: number | null;
  };

  readonly shadowCoverage:
    StrategyAttributionCoverage | null;

  readonly paperCoverage:
    StrategyAttributionCoverage | null;
}

export interface StrategySafetyReadModel {
  readonly readOnly:
    true;

  readonly signalExecutionAllowed:
    false;

  readonly intentGenerationAllowed:
    boolean;

  readonly intentExecutionAllowed:
    false;

  readonly automaticExecutionAllowed:
    false;

  readonly paperExecutionAllowed:
    false;

  readonly liveExecutionAllowed:
    false;

  readonly capitalReservationAllowed:
    false;

  readonly orderSubmissionAllowed:
    false;
}

const STRATEGY_FOUNDATION_SAFETY:
  StrategySafetyReadModel = {
  readOnly:
    true,

  signalExecutionAllowed:
    false,

  intentGenerationAllowed:
    false,

  intentExecutionAllowed:
    false,

  automaticExecutionAllowed:
    false,

  paperExecutionAllowed:
    false,

  liveExecutionAllowed:
    false,

  capitalReservationAllowed:
    false,

  orderSubmissionAllowed:
    false,
};

export class StrategyReadModelService {
  private attributionEvidenceSource:
    StrategyAttributionEvidenceSource | null;

  private readonly intentEvidenceSource:
    StrategyIntentEvidenceSource | null;

  constructor(
    private readonly registry:
      StrategyRegistry,

    private readonly orchestrator:
      StrategyOrchestrator,

    attributionEvidenceSource:
      StrategyAttributionEvidenceSource | null =
        null,

    intentEvidenceSource:
      StrategyIntentEvidenceSource | null =
        null,
  ) {
    this.attributionEvidenceSource =
      attributionEvidenceSource;

    this.intentEvidenceSource =
      intentEvidenceSource;
  }

  setAttributionEvidenceSource(
    source: StrategyAttributionEvidenceSource,
  ): void {
    if (
      this.attributionEvidenceSource &&
      this.attributionEvidenceSource !== source
    ) {
      throw new Error(
        "Strategy attribution evidence source is already configured.",
      );
    }

    this.attributionEvidenceSource =
      source;
  }

  getAll(
    now =
      Date.now(),
  ): StrategyCollectionReadModel {
    const registrySnapshot =
      this.orchestrator
        .getRegistrySnapshot(
          now,
        );

    return immutableClone({
      generatedAt:
        now,

      version:
        "20.5",

      mode:
        "READ_ONLY_STRATEGY_ANALYTICS",

      evidenceStatus:
        registrySnapshot
          .strategyCount >
        0
          ? "AVAILABLE"
          : "NO_DATA",

      orchestratorRunning:
        this.orchestrator
          .isRunning(),

      strategyCount:
        registrySnapshot
          .strategyCount,

      strategies:
        registrySnapshot
          .strategies,

      safety:
        STRATEGY_FOUNDATION_SAFETY,
    });
  }

  /**
   * Lightweight controller-owned diagnostics for fleet/readiness summaries.
   *
   * This deliberately skips attribution and performance history aggregation,
   * lifecycle snapshots, intent history and every other detailed read-model
   * section. Fleet endpoints call it for all eight strategies, so routing
   * those requests through getById() would repeatedly scan the complete PAPER
   * ledger and can monopolize the Node.js event loop.
   */
  getBlockerDiagnosticsById(
    strategyId:
      string,

    now =
      Date.now(),
  ): StrategyBlockerDiagnostics | null {
    const controller =
      this.registry.get(
        strategyId,
      );

    if (!controller) {
      return null;
    }

    const runtime =
      controller.getRuntimeSnapshot(
        now,
      );

    const configuration =
      controller.getConfiguration?.() ??
      null;

    return buildStrategyBlockerDiagnostics(
      runtime,
      {
        configuration,
        strategy:
          controller.getDiagnosticEvidence?.() ??
          null,
      },
      now,
    );
  }

  getById(
    strategyId:
      string,

    now =
      Date.now(),
  ): StrategyDetailReadModel | null {
    const controller =
      this.registry.get(
        strategyId,
      );

    if (
      !controller
    ) {
      return null;
    }

    const metadata =
      controller.getMetadata();

    const runtime =
      controller
        .getRuntimeSnapshot(
          now,
        );

    const signals =
      controller.getSignals(
        now,
      );

    const configuration =
      controller
        .getConfiguration?.() ??
      null;

    const diagnosticEvidence = {
      configuration,
      strategy:
        controller
          .getDiagnosticEvidence?.() ??
        null,
    };

    const blockerDiagnostics =
      buildStrategyBlockerDiagnostics(
        runtime,
        diagnosticEvidence,
        now,
      );

    const lifecycle =
      controller
        .getLifecycleSnapshot?.(
          now,
        ) ??
      null;

    const fillAndHedge =
      controller
        .getFillAndHedgeSnapshot?.(
          now,
        ) ??
      null;

    const shadowAnalytics =
      controller
        .getShadowAnalyticsSnapshot?.(
          now,
        ) ??
      null;

    const exposure =
      controller
        .getExposureSnapshot?.(
          now,
        ) ??
      null;

    const hedgeTargets =
      controller
        .getHedgeTargetSnapshot?.(
          now,
        ) ??
      null;

    const hedgeRoutes =
      controller
        .getHedgeRouteSnapshot?.(
          now,
        ) ??
      null;

    const hedgeMarketRules =
      controller
        .getHedgeMarketRuleSnapshot?.(
          now,
        ) ??
      null;

    const hedgePostRuleEconomics =
      controller
        .getHedgePostRuleEconomicsSnapshot?.(
          now,
        ) ??
      null;

    const hedgeBasisRisk =
      controller
        .getHedgeBasisRiskSnapshot?.(
          now,
        ) ??
      null;

    const hedgeRiskApproval =
      controller
        .getHedgeRiskApprovalSnapshot?.(
          now,
        ) ??
      null;

    const hedgeCapitalReservation =
      controller
        .getHedgeCapitalReservationSnapshot?.(
          now,
        ) ??
      null;

    const hedgeIntentProposal =
      controller
        .getHedgeIntentProposalSnapshot?.(
          now,
        ) ??
      null;

    const hedgeIntentPersistence =
      controller
        .getHedgeIntentPersistenceSnapshot?.(
          now,
        ) ??
      null;

    const hedgeIntentLifecycle =
      controller
        .getHedgeIntentLifecycleSnapshot?.(
          now,
        ) ??
      null;

    const hedgeIntentLastLook =
      controller
        .getHedgeIntentLastLookSnapshot?.(
          now,
        ) ??
      null;

    const hedgeExecutionPlanProposal =
      controller
        .getHedgeExecutionPlanProposalSnapshot?.(
          now,
        ) ??
      null;

    const hedgeShadowFillSimulation =
      controller
        .getHedgeShadowFillSimulationSnapshot?.(
          now,
        ) ??
      null;

    const hedgeResidualReconciliation =
      controller
        .getHedgeResidualReconciliationSnapshot?.(
          now,
        ) ??
      null;

    const hedgeRecoveryProposal =
      controller
        .getHedgeRecoveryProposalSnapshot?.(
          now,
        ) ??
      null;

    const hedgeRecoveryProposalLifecycle =
      controller
        .getHedgeRecoveryProposalLifecycleSnapshot?.(
          now,
        ) ??
      null;

    const hedgeRecoveryActionHandoff =
      controller
        .getHedgeRecoveryActionHandoffSnapshot?.(
          now,
        ) ??
      null;

    const attributionEvidence =
      this.attributionEvidenceSource
        ?.getSummary(
          metadata.id,
          now,
        ) ??
      null;

    const performance =
      this.attributionEvidenceSource
        ?.getPerformance?.(
          metadata.id,
          now,
        ) ??
      null;

    const externalIntents =
      this.intentEvidenceSource
        ?.getIntents(
          metadata.id,
          100,
        ) ??
      [];

    const controllerIntents =
      controller
        .getIntents?.(
          now,
        ) ??
      [];

    const intents =
      Array.from(
        new Map(
          [
            ...externalIntents,
            ...controllerIntents,
          ].map(
            (intent) => [
              intent.id,
              intent,
            ] as const,
          ),
        ).values(),
      ).sort(
        (first, second) =>
          second.createdAt -
            first.createdAt ||
          first.id.localeCompare(
            second.id,
          ),
      ).slice(
        0,
        100,
      );

    const intentEvidenceReported =
      this.intentEvidenceSource !==
        null ||
      controller.getIntents !==
        undefined;

    return immutableClone({
      metadata,

      runtime,

      blockerDiagnostics,

      configuration: {
        evidenceStatus:
          configuration ===
            null
            ? "NOT_REPORTED"
            : "AVAILABLE",

        value:
          configuration,
      },

      lifecycle: {
        evidenceStatus:
          lifecycle
            ?.evidenceStatus ??
          "NOT_REPORTED",

        value:
          lifecycle,
      },

      fillAndHedge: {
        evidenceStatus:
          fillAndHedge
            ?.evidenceStatus ??
          "NOT_REPORTED",

        value:
          fillAndHedge,
      },

      shadowAnalytics: {
        evidenceStatus:
          shadowAnalytics
            ?.evidenceStatus ??
          "NOT_REPORTED",

        value:
          shadowAnalytics,
      },

      exposure: {
        evidenceStatus:
          exposure
            ?.evidenceStatus ??
          "NOT_REPORTED",

        value:
          exposure,
      },

      hedgeTargets: {
        evidenceStatus:
          hedgeTargets
            ?.evidenceStatus ??
          "NOT_REPORTED",

        value:
          hedgeTargets,
      },

      hedgeRoutes: {
        evidenceStatus:
          hedgeRoutes
            ?.evidenceStatus ??
          "NOT_REPORTED",

        value:
          hedgeRoutes,
      },

      hedgeMarketRules: {
        evidenceStatus:
          hedgeMarketRules
            ?.evidenceStatus ??
          "NOT_REPORTED",

        value:
          hedgeMarketRules,
      },

      hedgePostRuleEconomics: {
        evidenceStatus:
          hedgePostRuleEconomics
            ?.evidenceStatus ??
          "NOT_REPORTED",

        value:
          hedgePostRuleEconomics,
      },

      hedgeBasisRisk: {
        evidenceStatus:
          hedgeBasisRisk
            ?.evidenceStatus ??
          "NOT_REPORTED",

        value:
          hedgeBasisRisk,
      },

      hedgeRiskApproval: {
        evidenceStatus:
          hedgeRiskApproval
            ?.evidenceStatus ??
          "NOT_REPORTED",

        value:
          hedgeRiskApproval,
      },

      hedgeCapitalReservation: {
        evidenceStatus:
          hedgeCapitalReservation
            ?.evidenceStatus ??
          "NOT_REPORTED",

        value:
          hedgeCapitalReservation,
      },

      hedgeIntentProposal: {
        evidenceStatus:
          hedgeIntentProposal
            ?.evidenceStatus ??
          "NOT_REPORTED",

        value:
          hedgeIntentProposal,
      },

      hedgeIntentPersistence: {
        evidenceStatus:
          hedgeIntentPersistence
            ?.evidenceStatus ??
          "NOT_REPORTED",

        value:
          hedgeIntentPersistence,
      },

      hedgeIntentLifecycle: {
        evidenceStatus:
          hedgeIntentLifecycle
            ?.evidenceStatus ??
          "NOT_REPORTED",

        value:
          hedgeIntentLifecycle,
      },

      hedgeIntentLastLook: {
        evidenceStatus:
          hedgeIntentLastLook
            ?.evidenceStatus ??
          "NOT_REPORTED",

        value:
          hedgeIntentLastLook,
      },

      hedgeExecutionPlanProposal: {
        evidenceStatus:
          hedgeExecutionPlanProposal
            ?.evidenceStatus ??
          "NOT_REPORTED",

        value:
          hedgeExecutionPlanProposal,
      },

      hedgeShadowFillSimulation: {
        evidenceStatus:
          hedgeShadowFillSimulation
            ?.evidenceStatus ??
          "NOT_REPORTED",

        value:
          hedgeShadowFillSimulation,
      },

      hedgeResidualReconciliation: {
        evidenceStatus:
          hedgeResidualReconciliation
            ?.evidenceStatus ??
          "NOT_REPORTED",

        value:
          hedgeResidualReconciliation,
      },

      hedgeRecoveryProposal: {
        evidenceStatus:
          hedgeRecoveryProposal
            ?.evidenceStatus ??
          "NOT_REPORTED",

        value:
          hedgeRecoveryProposal,
      },

      hedgeRecoveryProposalLifecycle: {
        evidenceStatus:
          hedgeRecoveryProposalLifecycle
            ?.evidenceStatus ??
          "NOT_REPORTED",

        value:
          hedgeRecoveryProposalLifecycle,
      },

      hedgeRecoveryActionHandoff: {
        evidenceStatus:
          hedgeRecoveryActionHandoff
            ?.evidenceStatus ??
          "NOT_REPORTED",

        value:
          hedgeRecoveryActionHandoff,
      },

      signals: {
        evidenceStatus:
          runtime.evidence
            .signals,

        records:
          signals,
      },

      intents: {
        evidenceStatus:
          intentEvidenceReported
            ? intents.length >
              0
              ? "AVAILABLE"
              : "NO_DATA"
            : "NOT_REPORTED",

        records:
          intents,
      },

      analytics: {
        evidenceStatus:
          performance
            ?.evidenceStatus ??
          "NOT_REPORTED",

        legacyHistoryAttribution:
          "UNATTRIBUTED_LEGACY",

        metrics:
          performance,

        reason:
          performance
            ? "Metrics include only evidence carrying explicit matching strategy attribution."
            : "Strategy performance evidence source is not configured; legacy/global records are not inferred.",
      },

      attribution:
        this.toAttributionReadModel(
          attributionEvidence,
          intents,
        ),

      safety:
        {
          ...STRATEGY_FOUNDATION_SAFETY,
          intentGenerationAllowed:
            metadata.capabilities
              .intentGeneration,
        },
    });
  }

  private toAttributionReadModel(
    evidence:
      StrategyAttributionEvidenceSummary | null,

    intents:
      readonly StrategyIntent[],
  ): StrategyAttributionReadModel {
    if (!evidence) {
      return {
        evidenceStatus:
          "NOT_REPORTED",

        intentEvidenceStatus:
          this.intentEvidenceSource
            ? intents.length >
              0
              ? "AVAILABLE"
              : "NO_DATA"
            : "NOT_REPORTED",

        intentId:
          intents[0]
            ?.id ??
          null,

        attributedShadowOutcomes: {
          evidenceStatus:
            "NOT_REPORTED",

          count:
            null,
        },

        attributedPaperTrades: {
          evidenceStatus:
            "NOT_REPORTED",

          count:
            null,
        },

        shadowCoverage:
          null,

        paperCoverage:
          null,
      };
    }

    const attributedShadowOutcomes =
      evidence
        .shadowOutcomes
        .attributedToStrategy;

    const attributedPaperTrades =
      evidence
        .paperTrades
        .attributedToStrategy;

    const totalEvidence =
      evidence
        .shadowOutcomes
        .totalRecords +
      evidence
        .paperTrades
        .totalRecords;

    return {
      evidenceStatus:
        totalEvidence > 0
          ? "AVAILABLE"
          : "NO_DATA",

      intentEvidenceStatus:
        this.intentEvidenceSource
          ? intents.length >
            0
            ? "AVAILABLE"
            : "NO_DATA"
          : "NOT_REPORTED",

      intentId:
        intents[0]
          ?.id ??
        null,

      attributedShadowOutcomes: {
        evidenceStatus:
          attributedShadowOutcomes > 0
            ? "AVAILABLE"
            : "NO_DATA",

        count:
          attributedShadowOutcomes,
      },

      attributedPaperTrades: {
        evidenceStatus:
          attributedPaperTrades > 0
            ? "AVAILABLE"
            : "NO_DATA",

        count:
          attributedPaperTrades,
      },

      shadowCoverage:
        evidence.shadowOutcomes,

      paperCoverage:
        evidence.paperTrades,
    };
  }
}

function immutableClone<T>(
  value:
    T,
): T {
  return deepFreeze(
    structuredClone(
      value,
    ),
  );
}

function deepFreeze<T>(
  value:
    T,
): T {
  if (
    typeof value !==
      "object" ||
    value ===
      null ||
    Object.isFrozen(
      value,
    )
  ) {
    return value;
  }

  for (
    const nestedValue
    of Object.values(
      value,
    )
  ) {
    deepFreeze(
      nestedValue,
    );
  }

  return Object.freeze(
    value,
  );
}
