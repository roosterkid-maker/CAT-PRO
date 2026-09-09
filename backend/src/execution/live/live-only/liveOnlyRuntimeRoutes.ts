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

const router =
  Router();

router.get(
  "/",
  (
    _request,
    response,
  ) => {
    const rebalancing =
      loadRebalancingExecutionConfig();

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
        },
      },
    });
  },
);

export default router;
