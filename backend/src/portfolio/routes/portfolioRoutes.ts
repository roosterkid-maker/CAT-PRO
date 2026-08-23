import {
  Router,
} from "express";

import {
  exposureService,
} from "../services/ExposureService";

import {
  portfolioService,
} from "../services/PortfolioService";

import {
  exchangeBalancePortfolioService,
} from "../services/ExchangeBalancePortfolioService";

import {
  exchangeBalanceSynchronizationService,
} from "../../trading/account/ExchangeBalanceSynchronizationService";

import {
  positionService,
} from "../services/PositionService";

import {
  normalizedInventorySnapshotService,
} from "../../rebalancing/services/NormalizedInventorySnapshotService";

import {
  capitalAllocationAndImbalanceService,
} from "../../rebalancing/services/CapitalAllocationAndImbalanceService";

import {
  rebalancingDecisionEngine,
} from "../../rebalancing/services/RebalancingDecisionEngine";

import {
  capitalManagerSafetyContextService,
} from "../../rebalancing/services/CapitalManagerSafetyContextService";

import {
  tradingAccountService,
} from "../../trading/account/TradingAccountService";

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
        portfolioService
          .getSnapshot(),
    });
  },
);

router.get(
  "/positions",
  (
    _request,
    response,
  ) => {
    response.json({
      success:
        true,

      data:
        positionService
          .getSnapshot(),
    });
  },
);

/*
 * Read-only authenticated wallet evidence for
 * every configured CAT PRO exchange.
 */
router.get(
  "/exchange-balances",
  (
    _request,
    response,
  ) => {
    response.json({
      success:
        true,
      data:
        exchangeBalancePortfolioService
          .getReport(),
    });
  },
);

/*
 * Read-only normalized inventory truth for capital-rebalancing analysis.
 * This endpoint has no order, transfer, withdrawal or balance-mutation path.
 */
router.get(
  "/rebalancing-inventory",
  (
    _request,
    response,
  ) => {
    response.setHeader(
      "Cache-Control",
      "no-store",
    );

    response.json({
      success:
        true,
      data:
        normalizedInventorySnapshotService
          .getSnapshot(),
    });
  },
);

/*
 * Read-only five-exchange allocation and imbalance analysis. The service
 * deliberately has no route to submit an order, transfer or withdrawal.
 */
router.get(
  "/rebalancing-status",
  (
    _request,
    response,
  ) => {
    response.setHeader(
      "Cache-Control",
      "no-store",
    );

    const now = Date.now();
    const inventory = normalizedInventorySnapshotService
      .getSnapshot(now);

    const allocation = capitalAllocationAndImbalanceService
      .evaluate(
        inventory,
        undefined,
        now,
      );
    const account = tradingAccountService
      .getAccount();

    response.json({
      success:
        true,
      data: {
        allocation,
        plan:
          rebalancingDecisionEngine
            .plan(
              allocation,
              capitalManagerSafetyContextService
                .getContext(
                  account,
                  now,
                ),
              undefined,
              now,
            ),
      },
    });
  },
);

/*
 * Manual refresh performs only the exchange
 * account-balance read contracts. It never
 * submits, cancels, transfers, or withdraws.
 */
router.post(
  "/exchange-balances/refresh",
  async (
    _request,
    response,
  ) => {
    await exchangeBalanceSynchronizationService
      .synchronizeAll();

    response.json({
      success:
        true,
      data:
        exchangeBalancePortfolioService
          .getReport(),
    });
  },
);

/*
 * Version 13.4
 *
 * GET /api/portfolio/exposure
 */
router.get(
  "/exposure",
  (
    _request,
    response,
  ) => {
    response.json({
      success:
        true,

      data:
        exposureService
          .getSnapshot(),
    });
  },
);

/*
 * Version 13.4
 *
 * POST /api/portfolio/exposure/check
 *
 * Example body:
 *
 * {
 *   "capital": 10000,
 *   "market": "BTCUSDT",
 *   "buyExchange": "binance",
 *   "sellExchange": "bybit"
 * }
 */
router.post(
  "/exposure/check",
  (
    request,
    response,
  ) => {
    if (
      !request.body ||
      typeof request.body !==
        "object"
    ) {
      response
        .status(
          400,
        )
        .json({
          success:
            false,

          message:
            "Request body is required.",
        });

      return;
    }

    const result =
      exposureService
        .assessProposedExposure({
          capital:
            Number(
              request.body
                .capital,
            ),

          market:
            String(
              request.body
                .market ??
                "",
            ),

          buyExchange:
            String(
              request.body
                .buyExchange ??
                "",
            ),

          sellExchange:
            String(
              request.body
                .sellExchange ??
                "",
            ),
        });

    response.json({
      success:
        true,

      data:
        result,
    });
  },
);

router.get(
  "/summary",
  (
    _request,
    response,
  ) => {
    response.json({
      success:
        true,

      data:
        portfolioService
          .getSummary(),
    });
  },
);

export default router;
