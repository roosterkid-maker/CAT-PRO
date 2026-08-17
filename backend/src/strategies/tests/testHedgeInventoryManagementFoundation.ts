import assert
  from "node:assert/strict";

import {
  CrossExchangeArbitrageStrategyController,
} from "../cross-exchange-arbitrage/CrossExchangeArbitrageStrategyController";

import type {
  CrossExchangeOpportunitySnapshotSource,
} from "../cross-exchange-arbitrage/CrossExchangeArbitrageStrategyController";

import {
  CrossExchangeMarketMakingStrategyController,
} from "../cross-exchange-market-making/CrossExchangeMarketMakingStrategyController";

import {
  HedgeInventoryManagementStrategyController,
} from "../hedge-inventory-management/HedgeInventoryManagementStrategyController";

import {
  StrategyOrchestrator,
} from "../services/StrategyOrchestrator";

import {
  StrategyReadModelService,
} from "../services/StrategyReadModelService";

import {
  StrategyRegistry,
} from "../services/StrategyRegistry";

const EMPTY_OPPORTUNITY_SOURCE:
  CrossExchangeOpportunitySnapshotSource = {
  getLastOpportunitySnapshot: () =>
    null,

  subscribeToOpportunitySnapshots: () =>
    () => {},
};

function main():
  void {
  const controller =
    new HedgeInventoryManagementStrategyController();

  const metadata =
    controller.getMetadata();

  assert.deepEqual(
    {
      id:
        metadata.id,
      strategyNumber:
        metadata.strategyNumber,
      version:
        metadata.version,
      category:
        metadata.category,
      controllerMode:
        metadata.controllerMode,
      signalSource:
        metadata.signalSource,
      capabilities:
        metadata.capabilities,
    },
    {
      id:
        "hedge-inventory-management",
      strategyNumber:
        3,
      version:
        "22.18",
      category:
        "HEDGE_INVENTORY_MANAGEMENT",
      controllerMode:
        "SHADOW_ONLY",
      signalSource:
        "PortfolioSnapshot",
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
    },
  );

  const defaultConfiguration =
    controller.getConfiguration();

  assert.equal(
    defaultConfiguration.state,
    "DISABLED",
  );

  assert.equal(
    defaultConfiguration.enabled,
    false,
  );

  assert.equal(
    defaultConfiguration.mode,
    "SHADOW",
  );

  assert.equal(
    defaultConfiguration.valuationQuoteAsset,
    null,
  );

  assert.deepEqual(
    defaultConfiguration.assetAllowlist,
    [],
    "V22.18 must not infer managed assets.",
  );

  assert.deepEqual(
    defaultConfiguration.targetInventoryByAsset,
    {},
  );

  assert.deepEqual(
    defaultConfiguration.hedgeVenueAllowlist,
    [],
    "V22.18 must not infer hedge venues.",
  );

  assert.deepEqual(
    defaultConfiguration.marketRules,
    {
      enabled:
        false,
      maximumCapabilityAgeMs:
        null,
      maximumQuantizationLossPercent:
        null,
      state:
        "DISABLED",
      blockers: [
        "MARKET_RULE_FEASIBILITY_DISABLED",
        "MAXIMUM_CAPABILITY_AGE_REQUIRED",
        "MAXIMUM_QUANTIZATION_LOSS_REQUIRED",
      ],
    },
  );

  assert.deepEqual(
    defaultConfiguration.routeEconomics,
    {
      enabled:
        false,
      maximumOrderBookAgeMs:
        null,
      maximumFeeAgeMs:
        null,
      maximumSlippagePercent:
        null,
      state:
        "DISABLED",
      blockers: [
        "ROUTE_ECONOMICS_DISABLED",
        "MAXIMUM_ORDER_BOOK_AGE_REQUIRED",
        "MAXIMUM_FEE_AGE_REQUIRED",
        "MAXIMUM_SLIPPAGE_REQUIRED",
      ],
    },
  );

  assert.deepEqual(
    defaultConfiguration.postRuleEconomics,
    {
      enabled:
        false,
      state:
        "DISABLED",
      blockers: [
        "POST_RULE_ECONOMICS_REVALIDATION_DISABLED",
      ],
    },
  );

  assert.deepEqual(
    defaultConfiguration.basisRisk,
    {
      enabled:
        false,
      maximumEvidenceAgeMs:
        null,
      maximumBasisDeviationPercent:
        null,
      minimumCorrelationCoefficient:
        null,
      minimumCorrelationObservations:
        null,
      state:
        "DISABLED",
      blockers: [
        "BASIS_RISK_EVALUATION_DISABLED",
        "MAXIMUM_BASIS_EVIDENCE_AGE_REQUIRED",
        "MAXIMUM_BASIS_DEVIATION_REQUIRED",
        "MINIMUM_CORRELATION_REQUIRED",
        "MINIMUM_CORRELATION_OBSERVATIONS_REQUIRED",
      ],
    },
  );

  assert.deepEqual(
    defaultConfiguration.riskApproval,
    {
      enabled:
        false,
      maximumAssessmentAgeMs:
        null,
      state:
        "DISABLED",
      blockers: [
        "RISK_ENGINE_APPROVAL_EVALUATION_DISABLED",
        "MAXIMUM_RISK_ASSESSMENT_AGE_REQUIRED",
      ],
    },
  );

  assert.deepEqual(
    defaultConfiguration.capitalReservation,
    {
      enabled:
        false,
      maximumEvidenceAgeMs:
        null,
      minimumRemainingTtlMs:
        null,
      state:
        "DISABLED",
      blockers: [
        "CAPITAL_RESERVATION_EVIDENCE_DISABLED",
        "MAXIMUM_RESERVATION_EVIDENCE_AGE_REQUIRED",
        "MINIMUM_RESERVATION_TTL_REQUIRED",
      ],
    },
  );

  assert.deepEqual(
    defaultConfiguration.intentProposal,
    {
      enabled:
        false,
      maximumCapitalReservationAgeMs:
        null,
      proposalTtlMs:
        null,
      maximumRecursionDepth:
        null,
      state:
        "DISABLED",
      blockers: [
        "HEDGE_INTENT_PROPOSAL_DISABLED",
        "MAXIMUM_RESERVATION_SOURCE_AGE_REQUIRED",
        "HEDGE_INTENT_PROPOSAL_TTL_REQUIRED",
        "RECURSION_DEPTH_MUST_BE_ZERO",
      ],
    },
  );

  assert.deepEqual(
    defaultConfiguration.intentPersistence,
    {
      enabled:
        false,
      maximumProposalAgeMs:
        null,
      state:
        "DISABLED",
      blockers: [
        "STRATEGY_INTENT_PERSISTENCE_DISABLED",
        "MAXIMUM_PROPOSAL_AGE_REQUIRED",
      ],
    },
  );

  assert.deepEqual(
    defaultConfiguration.intentLifecycle,
    {
      enabled:
        false,
      maximumIntentAgeMs:
        null,
      state:
        "DISABLED",
      blockers: [
        "INTENT_LIFECYCLE_REVALIDATION_DISABLED",
        "MAXIMUM_INTENT_AGE_REQUIRED",
      ],
    },
  );

  assert.deepEqual(
    defaultConfiguration.intentPreflight,
    {
      enabled:
        false,
      maximumLifecycleAgeMs:
        null,
      state:
        "DISABLED",
      blockers: [
        "INTENT_LAST_LOOK_PREFLIGHT_DISABLED",
        "MAXIMUM_LIFECYCLE_AGE_REQUIRED",
      ],
    },
  );

  assert.deepEqual(
    defaultConfiguration.executionPlanProposal,
    {
      enabled: false,
      maximumPreflightAgeMs: null,
      proposalTtlMs: null,
      state: "DISABLED",
      blockers: [
        "SHADOW_EXECUTION_PLAN_PROPOSAL_DISABLED",
        "MAXIMUM_PREFLIGHT_AGE_REQUIRED",
        "EXECUTION_PLAN_PROPOSAL_TTL_REQUIRED",
      ],
    },
  );

  assert.deepEqual(
    defaultConfiguration.shadowFillSimulation,
    {
      enabled: false,
      maximumEvidenceAgeMs: null,
      maximumSlippagePercent: null,
      state: "DISABLED",
      blockers: [
        "SHADOW_HEDGE_FILL_SIMULATION_DISABLED",
        "MAXIMUM_FILL_EVIDENCE_AGE_REQUIRED",
        "MAXIMUM_SIMULATED_SLIPPAGE_REQUIRED",
      ],
    },
  );

  assert.deepEqual(
    defaultConfiguration.residualReconciliation,
    {
      enabled: false,
      maximumEvidenceAgeMs: null,
      residualQuantityTolerance: null,
      criticalResidualExposureQuoteValue: null,
      state: "DISABLED",
      blockers: [
        "SHADOW_RESIDUAL_RECONCILIATION_DISABLED",
        "MAXIMUM_RECONCILIATION_EVIDENCE_AGE_REQUIRED",
        "RESIDUAL_QUANTITY_TOLERANCE_REQUIRED",
        "CRITICAL_RESIDUAL_EXPOSURE_REQUIRED",
      ],
    },
  );

  assert.deepEqual(
    defaultConfiguration.recoveryProposal,
    {
      enabled: false,
      maximumReconciliationAgeMs: null,
      proposalTtlMs: null,
      maximumProposalQuoteValue: null,
      state: "DISABLED",
      blockers: [
        "SHADOW_RECOVERY_PROPOSAL_DISABLED",
        "MAXIMUM_RECONCILIATION_AGE_REQUIRED",
        "RECOVERY_PROPOSAL_TTL_REQUIRED",
        "MAXIMUM_RECOVERY_PROPOSAL_QUOTE_VALUE_REQUIRED",
      ],
    },
  );

  assert.deepEqual(
    defaultConfiguration.recoveryProposalLifecycle,
    {
      enabled: false,
      maximumProposalAgeMs: null,
      maximumOperatorDecisionAgeMs: null,
      state: "DISABLED",
      blockers: [
        "RECOVERY_PROPOSAL_LIFECYCLE_DISABLED",
        "MAXIMUM_RECOVERY_PROPOSAL_AGE_REQUIRED",
        "MAXIMUM_OPERATOR_DECISION_AGE_REQUIRED",
      ],
    },
  );

  assert.deepEqual(
    defaultConfiguration.recoveryActionHandoff,
    {
      enabled: false,
      maximumLifecycleAgeMs: null,
      handoffTtlMs: null,
      maximumHandoffQuoteValue: null,
      state: "DISABLED",
      blockers: [
        "SHADOW_RECOVERY_ACTION_HANDOFF_DISABLED",
        "MAXIMUM_RECOVERY_LIFECYCLE_AGE_REQUIRED",
        "RECOVERY_ACTION_HANDOFF_TTL_REQUIRED",
        "MAXIMUM_RECOVERY_HANDOFF_QUOTE_VALUE_REQUIRED",
      ],
    },
  );

  assert.deepEqual(
    defaultConfiguration.blockers,
    [
      "STRATEGY_DISABLED",
      "VALUATION_QUOTE_ASSET_REQUIRED",
      "ASSET_ALLOWLIST_REQUIRED",
      "TARGET_INVENTORY_REQUIRED",
      "MAXIMUM_DEVIATION_QUOTE_VALUE_REQUIRED",
      "EXPOSURE_LIMIT_QUOTE_VALUE_REQUIRED",
      "HEDGE_RATIO_REQUIRED",
      "HEDGE_VENUE_ALLOWLIST_REQUIRED",
      "MAXIMUM_EXPOSURE_AGE_REQUIRED",
    ],
  );

  assert.equal(
    Object.isFrozen(
      defaultConfiguration,
    ),
    true,
  );

  assert.equal(
    Object.isFrozen(
      defaultConfiguration
        .safety,
    ),
    true,
  );

  assert.deepEqual(
    defaultConfiguration.safety,
    {
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
  );

  let forwardedSignals =
    0;

  const unsubscribe =
    controller.subscribeToSignals(
      () => {
        forwardedSignals +=
          1;
      },
    );

  controller.start();
  controller.start();

  assert.equal(
    controller.isRunning(),
    false,
    "Default-disabled V22.18 must remain stopped.",
  );

  assert.equal(
    controller
      .getRuntimeSnapshot(
        1_000,
      )
      .startCount,
    0,
  );

  assert.deepEqual(
    controller.getSignals(),
    [],
  );

  assert.equal(
    forwardedSignals,
    0,
    "V22.18 foundation must not manufacture exposure or hedge signals.",
  );

  controller.stop();
  unsubscribe();

  const configured =
    new HedgeInventoryManagementStrategyController({
      enabled:
        true,
      mode:
        "SHADOW",
      valuationQuoteAsset:
        " usdt ",
      assetAllowlist: [
        "eth",
        "BTC",
        "eth",
      ],
      targetInventoryByAsset: {
        btc:
          0.25,
        ETH:
          2,
      },
      maximumDeviationQuoteValue:
        100,
      exposureLimitQuoteValue:
        500,
      hedgeRatio:
        0.75,
      hedgeVenueAllowlist: [
        " Binance ",
        "coindcx",
        "binance",
      ],
      maximumExposureAgeMs:
        30_000,
    });

  assert.deepEqual(
    configured.getConfiguration(),
    {
      version:
        "22.18",
      strategyId:
        "hedge-inventory-management",
      enabled:
        true,
      mode:
        "SHADOW",
      valuationQuoteAsset:
        "USDT",
      assetAllowlist: [
        "BTC",
        "ETH",
      ],
      targetInventoryByAsset: {
        BTC:
          0.25,
        ETH:
          2,
      },
      maximumDeviationQuoteValue:
        100,
      exposureLimitQuoteValue:
        500,
      hedgeRatio:
        0.75,
      hedgeVenueAllowlist: [
        "binance",
        "coindcx",
      ],
      maximumExposureAgeMs:
        30_000,
      routeEconomics: {
        enabled:
          false,
        maximumOrderBookAgeMs:
          null,
        maximumFeeAgeMs:
          null,
        maximumSlippagePercent:
          null,
        state:
          "DISABLED",
        blockers: [
          "ROUTE_ECONOMICS_DISABLED",
          "MAXIMUM_ORDER_BOOK_AGE_REQUIRED",
          "MAXIMUM_FEE_AGE_REQUIRED",
          "MAXIMUM_SLIPPAGE_REQUIRED",
        ],
      },
      marketRules: {
        enabled:
          false,
        maximumCapabilityAgeMs:
          null,
        maximumQuantizationLossPercent:
          null,
        state:
          "DISABLED",
        blockers: [
          "MARKET_RULE_FEASIBILITY_DISABLED",
          "MAXIMUM_CAPABILITY_AGE_REQUIRED",
          "MAXIMUM_QUANTIZATION_LOSS_REQUIRED",
        ],
      },
      postRuleEconomics: {
        enabled:
          false,
        state:
          "DISABLED",
        blockers: [
          "POST_RULE_ECONOMICS_REVALIDATION_DISABLED",
        ],
      },
      basisRisk: {
        enabled:
          false,
        maximumEvidenceAgeMs:
          null,
        maximumBasisDeviationPercent:
          null,
        minimumCorrelationCoefficient:
          null,
        minimumCorrelationObservations:
          null,
        state:
          "DISABLED",
        blockers: [
          "BASIS_RISK_EVALUATION_DISABLED",
          "MAXIMUM_BASIS_EVIDENCE_AGE_REQUIRED",
          "MAXIMUM_BASIS_DEVIATION_REQUIRED",
          "MINIMUM_CORRELATION_REQUIRED",
          "MINIMUM_CORRELATION_OBSERVATIONS_REQUIRED",
        ],
      },
      riskApproval: {
        enabled:
          false,
        maximumAssessmentAgeMs:
          null,
        state:
          "DISABLED",
        blockers: [
          "RISK_ENGINE_APPROVAL_EVALUATION_DISABLED",
          "MAXIMUM_RISK_ASSESSMENT_AGE_REQUIRED",
        ],
      },
      capitalReservation: {
        enabled:
          false,
        maximumEvidenceAgeMs:
          null,
        minimumRemainingTtlMs:
          null,
        state:
          "DISABLED",
        blockers: [
          "CAPITAL_RESERVATION_EVIDENCE_DISABLED",
          "MAXIMUM_RESERVATION_EVIDENCE_AGE_REQUIRED",
          "MINIMUM_RESERVATION_TTL_REQUIRED",
        ],
      },
      intentProposal: {
        enabled:
          false,
        maximumCapitalReservationAgeMs:
          null,
        proposalTtlMs:
          null,
        maximumRecursionDepth:
          null,
        state:
          "DISABLED",
        blockers: [
          "HEDGE_INTENT_PROPOSAL_DISABLED",
          "MAXIMUM_RESERVATION_SOURCE_AGE_REQUIRED",
          "HEDGE_INTENT_PROPOSAL_TTL_REQUIRED",
          "RECURSION_DEPTH_MUST_BE_ZERO",
        ],
      },
      intentPersistence: {
        enabled:
          false,
        maximumProposalAgeMs:
          null,
        state:
          "DISABLED",
        blockers: [
          "STRATEGY_INTENT_PERSISTENCE_DISABLED",
          "MAXIMUM_PROPOSAL_AGE_REQUIRED",
        ],
      },
      intentLifecycle: {
        enabled:
          false,
        maximumIntentAgeMs:
          null,
        state:
          "DISABLED",
        blockers: [
          "INTENT_LIFECYCLE_REVALIDATION_DISABLED",
          "MAXIMUM_INTENT_AGE_REQUIRED",
        ],
      },
      intentPreflight: {
        enabled:
          false,
        maximumLifecycleAgeMs:
          null,
        state:
          "DISABLED",
        blockers: [
          "INTENT_LAST_LOOK_PREFLIGHT_DISABLED",
          "MAXIMUM_LIFECYCLE_AGE_REQUIRED",
        ],
      },
      executionPlanProposal: {
        enabled: false,
        maximumPreflightAgeMs: null,
        proposalTtlMs: null,
        state: "DISABLED",
        blockers: [
          "SHADOW_EXECUTION_PLAN_PROPOSAL_DISABLED",
          "MAXIMUM_PREFLIGHT_AGE_REQUIRED",
          "EXECUTION_PLAN_PROPOSAL_TTL_REQUIRED",
        ],
      },
      shadowFillSimulation: {
        enabled: false,
        maximumEvidenceAgeMs: null,
        maximumSlippagePercent: null,
        state: "DISABLED",
        blockers: [
          "SHADOW_HEDGE_FILL_SIMULATION_DISABLED",
          "MAXIMUM_FILL_EVIDENCE_AGE_REQUIRED",
          "MAXIMUM_SIMULATED_SLIPPAGE_REQUIRED",
        ],
      },
      residualReconciliation: {
        enabled: false,
        maximumEvidenceAgeMs: null,
        residualQuantityTolerance: null,
        criticalResidualExposureQuoteValue: null,
        state: "DISABLED",
        blockers: [
          "SHADOW_RESIDUAL_RECONCILIATION_DISABLED",
          "MAXIMUM_RECONCILIATION_EVIDENCE_AGE_REQUIRED",
          "RESIDUAL_QUANTITY_TOLERANCE_REQUIRED",
          "CRITICAL_RESIDUAL_EXPOSURE_REQUIRED",
        ],
      },
      recoveryProposal: {
        enabled: false,
        maximumReconciliationAgeMs: null,
        proposalTtlMs: null,
        maximumProposalQuoteValue: null,
        state: "DISABLED",
        blockers: [
          "SHADOW_RECOVERY_PROPOSAL_DISABLED",
          "MAXIMUM_RECONCILIATION_AGE_REQUIRED",
          "RECOVERY_PROPOSAL_TTL_REQUIRED",
          "MAXIMUM_RECOVERY_PROPOSAL_QUOTE_VALUE_REQUIRED",
        ],
      },
      recoveryProposalLifecycle: {
        enabled: false,
        maximumProposalAgeMs: null,
        maximumOperatorDecisionAgeMs: null,
        state: "DISABLED",
        blockers: [
          "RECOVERY_PROPOSAL_LIFECYCLE_DISABLED",
          "MAXIMUM_RECOVERY_PROPOSAL_AGE_REQUIRED",
          "MAXIMUM_OPERATOR_DECISION_AGE_REQUIRED",
        ],
      },
      recoveryActionHandoff: {
        enabled: false,
        maximumLifecycleAgeMs: null,
        handoffTtlMs: null,
        maximumHandoffQuoteValue: null,
        state: "DISABLED",
        blockers: [
          "SHADOW_RECOVERY_ACTION_HANDOFF_DISABLED",
          "MAXIMUM_RECOVERY_LIFECYCLE_AGE_REQUIRED",
          "RECOVERY_ACTION_HANDOFF_TTL_REQUIRED",
          "MAXIMUM_RECOVERY_HANDOFF_QUOTE_VALUE_REQUIRED",
        ],
      },
      state:
        "FOUNDATION_READY",
      blockers:
        [],
      safety:
        defaultConfiguration.safety,
    },
  );

  configured.start();
  configured.start();

  assert.equal(
    configured.isRunning(),
    true,
  );

  assert.equal(
    configured
      .getRuntimeSnapshot(
        Date.now(),
      )
      .startCount,
    1,
  );

  assert.deepEqual(
    configured.getSignals(),
    [],
  );

  configured.stop();
  configured.stop();

  assert.equal(
    configured
      .getRuntimeSnapshot(
        Date.now(),
      )
      .stopCount,
    1,
  );

  assert.throws(
    () =>
      new HedgeInventoryManagementStrategyController({
        mode:
          "PAPER" as "SHADOW",
      }),
    /SHADOW-only/,
  );

  assert.throws(
    () =>
      new HedgeInventoryManagementStrategyController({
        enabled:
          true,
        assetAllowlist: [
          "BTC",
        ],
        targetInventoryByAsset: {
          ETH:
            1,
        },
      }),
    /not allowlisted/,
  );

  assert.throws(
    () =>
      new HedgeInventoryManagementStrategyController({
        maximumDeviationQuoteValue:
          500,
        exposureLimitQuoteValue:
          100,
      }),
    /greater than or equal/,
  );

  assert.throws(
    () =>
      new HedgeInventoryManagementStrategyController({
        hedgeRatio:
          1.01,
      }),
    /less than or equal to 1/,
  );

  const registry =
    new StrategyRegistry();

  registry.register(
    new CrossExchangeArbitrageStrategyController(
      {},
      EMPTY_OPPORTUNITY_SOURCE,
    ),
  );

  registry.register(
    new CrossExchangeMarketMakingStrategyController(),
  );

  const registered =
    registry
      .getControllers()
      .map(
        (registeredController) =>
          registeredController
            .getMetadata()
            .id,
      );

  assert.deepEqual(
    registered,
    [
      "cross-exchange-arbitrage",
      "cross-exchange-market-making",
    ],
    "Hedge/inventory must remain reusable recovery evidence without occupying an actual trading-strategy slot.",
  );

  const orchestrator =
    new StrategyOrchestrator(
      registry,
    );

  const readModel =
    new StrategyReadModelService(
      registry,
      orchestrator,
    );

  assert.equal(
    readModel
      .getAll(
        2_000,
      )
      .strategyCount,
    2,
  );

  const detail =
    readModel.getById(
      "hedge-inventory-management",
      2_000,
    );

  assert.equal(
    detail,
    null,
    "Shared hedge/recovery capability must not appear as an independent strategy read model.",
  );

  for (
    const forbiddenMethod
    of [
      "assessExposure",
      "createHedgeProposal",
      "createHedgeIntent",
      "mutatePortfolio",
      "mutateBalance",
      "reserveCapital",
      "recover",
      "submitOrder",
      "execute",
    ]
  ) {
    assert.equal(
      forbiddenMethod in
        configured,
      false,
      `V22.18 controller must not expose ${forbiddenMethod}.`,
    );
  }

  console.log(
    "Hedge / inventory-management V22.18 foundation test passed.",
  );

  console.log(
    "Hedge/inventory stayed outside the trading-strategy registry and default-disabled; no exposure, signal, intent, portfolio, balance, recovery, PAPER, LIVE, capital or order action occurred.",
  );
}

try {
  main();
} catch (
  error:
    unknown
) {
  console.error(
    error instanceof Error
      ? error.message
      : error,
  );

  process.exitCode =
    1;
}
