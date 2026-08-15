import {
  Router,
} from "express";

import {
  operatorSettingsService,
} from "../services/OperatorSettingsService";

import {
  paperCapitalConfigurationService,
} from "../../trading/capital/PaperCapitalConfigurationService";

import {
  tradingAccountService,
} from "../../trading/account/TradingAccountService";

import {
  PAPER_TRADING_DATA_RESET_CONFIRMATION,
  paperTradingDataResetService,
} from "../../trading/services/PaperTradingDataResetService";

const router =
  Router();

/*
 * V19 BUILD 10
 *
 * GET /api/operator-settings
 *
 * Read-only operator configuration surface.
 *
 * No mutation endpoints are intentionally exposed here.
 */
router.get(
  "/",

  (
    _request,
    response,
  ) => {
    try {
      response.json({
        success:
          true,

        data:
          operatorSettingsService
            .getReport(),
      });
    } catch (
      error:
        unknown
    ) {
      response
        .status(
          500,
        )
        .json({
          success:
            false,

          message:
            error instanceof Error
              ? error.message
              : "Unable to generate operator settings report.",
        });
    }
  },
);

router.put(
  "/paper-capital",

  (
    request,
    response,
  ) => {
    response.setHeader(
      "Cache-Control",
      "no-store",
    );

    if (
      tradingAccountService
        .getAccount()
        .mode !==
        "PAPER"
    ) {
      return response
        .status(409)
        .json({
          success:
            false,

          message:
            "PAPER capital configuration can only be changed while the trading account is in PAPER mode.",
        });
    }

    try {
      paperCapitalConfigurationService
        .updateConfiguration(
          {
            capitalBudgetInr:
              request.body?.capitalBudgetInr,

            minimumCapitalPerTrade:
              request.body?.minimumCapitalPerTrade,

            maximumCapitalPerTrade:
              request.body?.maximumCapitalPerTrade,

            capitalStep:
              request.body?.capitalStep,

            maximumExecutionsPerBatch:
              request.body?.maximumExecutionsPerBatch,

            maximumBatchCapital:
              request.body?.maximumBatchCapital,
          },

          request.body?.confirmation,
        );

      return response.json({
        success:
          true,

        data:
          operatorSettingsService
            .getReport(),
      });
    } catch (
      error:
        unknown
    ) {
      return response
        .status(400)
        .json({
          success:
            false,

          message:
            error instanceof Error
              ? error.message
              : "PAPER capital configuration update failed.",
        });
    }
  },
);

router.put(
  "/paper-daily-attempt-limit",

  (
    request,
    response,
  ) => {
    response.setHeader(
      "Cache-Control",
      "no-store",
    );

    if (
      request.body?.confirmation !==
        "UPDATE_PAPER_DAILY_ATTEMPT_LIMIT"
    ) {
      return response
        .status(400)
        .json({
          success:
            false,

          message:
            "Daily PAPER attempt limit update requires explicit confirmation.",
        });
    }

    try {
      tradingAccountService
        .updateMaximumDailyTrades(
          request.body
            ?.maximumDailyAttempts,
        );

      return response.json({
        success:
          true,

        data:
          operatorSettingsService
            .getReport(),
      });
    } catch (
      error:
        unknown
    ) {
      return response
        .status(400)
        .json({
          success:
            false,

          message:
            error instanceof Error
              ? error.message
              : "Daily PAPER attempt limit update failed.",
        });
    }
  },
);

router.post(
  "/paper-data/reset",

  (
    request,
    response,
  ) => {
    response.setHeader(
      "Cache-Control",
      "no-store",
    );

    try {
      const reset =
        paperTradingDataResetService
          .reset(
            request.body
              ?.confirmation,
          );

      return response.json({
        success:
          true,

        data:
          operatorSettingsService
            .getReport(),

        reset,
      });
    } catch (
      error:
        unknown
    ) {
      const confirmationMissing =
        request.body
          ?.confirmation !==
        PAPER_TRADING_DATA_RESET_CONFIRMATION;

      return response
        .status(
          confirmationMissing
            ? 400
            : 409,
        )
        .json({
          success:
            false,

          message:
            error instanceof Error
              ? error.message
              : "PAPER trading data reset failed.",
        });
    }
  },
);

export default router;
