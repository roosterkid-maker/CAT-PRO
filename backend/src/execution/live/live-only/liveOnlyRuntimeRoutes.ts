import {
  Router,
} from "express";

import {
  getLiveOnlyRuntimePolicy,
  isLiveOnlyRuntimeProfile,
} from "../../../config/LiveOnlyRuntimePolicy";

import {
  strategyOneLiveOnlyRunnerService,
} from "./StrategyOneLiveOnlyRunnerService";

import {
  loadRebalancingExecutionConfig,
} from "../../../rebalancing/execution/RebalancingExecutionConfig";

import {
  rebalancingExecutionRunner,
} from "../../../rebalancing/execution/RebalancingExecutionRunner";

import {
  opportunityService,
} from "../../../arbitrage/services/OpportunityService";

import {
  exchangeFleetRegistry,
} from "../../../exchanges/core/ExchangeFleetRegistry";

import {
  strategyOneLiveOnlyPreflightService,
} from "./StrategyOneLiveOnlyPreflightService";

import {
  strategyOneLiveOnlyIntelligenceService,
} from "./StrategyOneLiveOnlyIntelligenceService";

import {
  opportunityCapitalStudyService,
} from "../../../rebalancing/services/OpportunityCapitalStudyService";

const router =
  Router();

router.get(
  "/",
  (
    _request,
    response,
  ) => {
    const rebalancing =
      getCapitalManagerReport();

    response.setHeader(
      "Cache-Control",
      "no-store",
    );

    response.json({
      success:
        true,
      data: {
        profileSelected:
          isLiveOnlyRuntimeProfile(),
        policy:
          getLiveOnlyRuntimePolicy(),
        runner:
          strategyOneLiveOnlyRunnerService
            .getDiagnostics(),
        capitalManager: {
          ...rebalancing,
        },
        capitalStudy:
          opportunityCapitalStudyService
            .getReport(),
      },
    });
  },
);

router.get(
  "/intelligence",
  (
    _request,
    response,
  ) => {
    const now =
      Date.now();
    const runtime =
      strategyOneLiveOnlyRunnerService
        .getDiagnostics(
          now,
        );
    const fleet =
      exchangeFleetRegistry
        .getReport();

    response.setHeader(
      "Cache-Control",
      "no-store",
    );

    response.json({
      success:
        true,
      data:
        strategyOneLiveOnlyIntelligenceService
          .build({
            opportunities:
              opportunityService
                .getLastOpportunities(),
            policy:
              getLiveOnlyRuntimePolicy(),
            runtime,
            capitalManager:
              getCapitalManagerReport(),
            capitalStudy:
              opportunityCapitalStudyService
                .getReport(
                  now,
                ),
            recentAttempts:
              runtime.recentAttempts,
            exchangeFoundations:
              fleet.foundationExchanges,
            evaluatePreflight:
              (
                opportunity,
                evaluatedAt,
              ) =>
                strategyOneLiveOnlyPreflightService
                  .evaluate(
                    opportunity,
                    evaluatedAt,
                  ),
            now,
          }),
    });
  },
);

function getCapitalManagerReport() {
  const rebalancing =
    loadRebalancingExecutionConfig();

  return {
    enabled:
      rebalancing.enabled,
    sameExchangeEnabled:
      rebalancing.sameExchangeEnabled,
    crossExchangeEnabled:
      rebalancing.crossExchangeEnabled,
    maximumPerTransferUsdt:
      rebalancing.maximumPerTransferUsdt,
    maximumPerDaySameExchangeUsdt:
      rebalancing.maximumPerDaySameExchangeUsdt,
    maximumPerDayCrossExchangeUsdt:
      rebalancing.maximumPerDayCrossExchangeUsdt,
    withdrawalWhitelistEntries:
      rebalancing.withdrawalWhitelist.length,
    dedicatedBinanceCredentialsConfigured:
      Boolean(
        process.env.CAT_PRO_REBALANCER_BINANCE_API_KEY
          ?.trim() &&
        process.env.CAT_PRO_REBALANCER_BINANCE_API_SECRET
          ?.trim(),
      ),
    runner:
      rebalancingExecutionRunner
        .getStatus(),
  };
}

export default router;
