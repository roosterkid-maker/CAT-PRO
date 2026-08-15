import {
  Router,
} from "express";

import {
  tradingDiagnosticsService,
} from "../TradingDiagnosticsService";

import {
  orderBookSubscriptionWatchdogService,
} from "../services/OrderBookSubscriptionWatchdogService";

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

export default router;