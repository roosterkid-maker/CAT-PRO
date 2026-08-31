import {
  Router,
} from "express";

import {
  exchangeClockSafetyService,
} from "../time/ExchangeClockSafetyService";

import {
  exchangeClockSynchronizationRunner,
} from "../time/ExchangeClockSynchronizationRunner";

import {
  binanceHttpClient,
} from "../../../exchanges/binance/api/BinanceHttpClient";

function getBinanceRestProtectionDiagnostics() {
  const diagnostics =
    binanceHttpClient
      .getClockDiagnostics();

  return {
    rateLimitCooldown:
      diagnostics
        .rateLimitCooldown,

    requestWeightGovernor:
      diagnostics
        .requestWeightGovernor,
  };
}

const router =
  Router();

/*
 * VERSION 18 BUILD 9
 *
 * GET /api/execution/clock
 *
 * Read-only clock health diagnostics.
 */
router.get(
  "/",
  (
    _request,
    response,
  ) => {
    response.json({
      success:
        true,

      data: {
        ...exchangeClockSafetyService
          .getReport(),

        synchronization:
          exchangeClockSynchronizationRunner
            .getStatus(),

        binanceRestProtection:
          getBinanceRestProtectionDiagnostics(),
      },
    });
  },
);

/*
 * POST /api/execution/clock/synchronize
 *
 * Synchronizes supported authoritative
 * exchange clocks.
 *
 * This performs only server-time reads.
 *
 * No order submission.
 * No cancellation.
 */
router.post(
  "/synchronize",
  async (
    _request,
    response,
  ) => {
    try {
      const report =
        await exchangeClockSynchronizationRunner
          .synchronizeNow() ??
        exchangeClockSafetyService
          .getReport();

      response.json({
        success:
          report
            .allServerSynchronizedClocksHealthy,

        data: {
          ...report,

          synchronization:
            exchangeClockSynchronizationRunner
              .getStatus(),

          binanceRestProtection:
            getBinanceRestProtectionDiagnostics(),
        },
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
              : "Exchange clock synchronization failed.",
        });
    }
  },
);

export default router;
