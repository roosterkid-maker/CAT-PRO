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
