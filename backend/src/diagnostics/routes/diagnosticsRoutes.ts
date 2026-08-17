import {
  Router,
} from "express";

import {
  tradingDiagnosticsService,
} from "../TradingDiagnosticsService";

import {
  orderBookSubscriptionWatchdogService,
} from "../services/OrderBookSubscriptionWatchdogService";

import {
  authenticatedPrivateFillEventOwner,
} from "../../execution/live/fills/AuthenticatedPrivateFillEventOwner";

import {
  authenticatedPrivateFillStreamService,
} from "../../execution/live/fills/AuthenticatedPrivateFillStreamService";

import {
  strategyOneExecutionTimingEvidenceService,
} from "../../arbitrage/execution/StrategyOneExecutionTimingEvidenceService";

import {
  strategyOnePilotEquivalentPaperEvidenceService,
} from "../../arbitrage/execution/StrategyOnePilotEquivalentPaperEvidenceService";

import {
  strategyOneLiveVenueContractRegistry,
} from "../../execution/live/contracts/StrategyOneLiveVenueContractRegistry";

import {
  strategyOneTwoLegLiveExecutionService,
} from "../../execution/live/arbitrage/StrategyOneTwoLegLiveExecutionService";

const router =
  Router();

router.get(
  "/",
  (
    _request,
    response,
  ) => {
    response.json({
      success:
        true,

      data:
        tradingDiagnosticsService
          .getReport(),
    });
  },
);

/*
 * V19.14
 *
 * Read-only visibility into the order-book
 * subscription watchdog.
 *
 * This endpoint itself performs no recovery
 * and mutates no trading policy.
 */
router.get(
  "/order-book-subscriptions",
  (
    _request,
    response,
  ) => {
    response.json({
      success:
        true,

      data:
        orderBookSubscriptionWatchdogService
          .getReport(),
    });
  },
);

router.get(
  "/authenticated-private-fills",
  (
    _request,
    response,
  ) => {
    response.json({
      success:
        true,
      data: {
        transport:
          authenticatedPrivateFillStreamService
            .getDiagnostics(),
        owner:
          authenticatedPrivateFillEventOwner
            .getDiagnostics(),
      },
    });
  },
);

router.get(
  "/strategy-one-execution-timing",
  (
    _request,
    response,
  ) => {
    response.json({
      success:
        true,
      data:
        strategyOneExecutionTimingEvidenceService
          .getReport(),
    });
  },
);

router.get(
  "/strategy-one-pilot-equivalent-paper",
  (
    _request,
    response,
  ) => {
    response.json({
      success: true,
      data: strategyOnePilotEquivalentPaperEvidenceService.getReport(),
    });
  },
);

router.get(
  "/strategy-one-live-venue-contracts",
  (
    _request,
    response,
  ) => {
    response.json({
      success:
        true,
      data:
        strategyOneLiveVenueContractRegistry
          .getReport(),
    });
  },
);

router.get(
  "/strategy-one-two-leg-live-sessions",
  (
    _request,
    response,
  ) => {
    response.json({
      success:
        true,
      data:
        strategyOneTwoLegLiveExecutionService
          .getDiagnostics(),
    });
  },
);

export default router;
