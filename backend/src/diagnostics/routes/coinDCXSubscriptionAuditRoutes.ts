import {
  Router,
} from "express";

import {
  coinDCXStaleRecoveryForensicsService,
} from "../services/CoinDCXStaleRecoveryForensicsService";

import {
  coinDCXSubscriptionAuditService,
} from "../services/CoinDCXSubscriptionAuditService";

import {
  coinDCXProtectedRestOrderBookService,
} from "../../exchanges/coindcx/CoinDCXProtectedRestOrderBookService";

import {
  coinDCXOrderBookIntegrityService,
} from "../../exchanges/coindcx/CoinDCXOrderBookIntegrityService";

const router =
  Router();

router.get(
  "/protected-rest-orderbook",
  (_request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.json({
      success: true,
      data: coinDCXProtectedRestOrderBookService.getDiagnostics(),
    });
  },
);

router.get(
  "/",
  (
    request,
    response,
  ) => {
    const report =
      coinDCXSubscriptionAuditService
        .getReport();

    const rawLimit =
      request.query.limit;

    const parsedLimit =
      typeof rawLimit ===
        "string"
        ? Number(
            rawLimit,
          )
        : null;

    const limit =
      parsedLimit !==
        null &&
      Number.isFinite(
        parsedLimit,
      )
        ? Math.min(
            1_000,
            Math.max(
              1,
              Math.floor(
                parsedLimit,
              ),
            ),
          )
        : null;

    /*
     * V20.9 Build 4C
     *
     * The existing subscription audit contract is preserved.
     * A new read-only forensic section is appended.
     */
    const forensics =
      coinDCXStaleRecoveryForensicsService
        .generate(
          report
            .summary
            .generatedAt,

          limit ??
            100,
        );

    const bookIntegrity =
      coinDCXOrderBookIntegrityService
        .getReport(
          report.summary.generatedAt,
        );

    response.json({
      success:
        true,

      data: {
        summary:
          report.summary,

        records:
          limit ===
            null
            ? report.records
            : report.records.slice(
                0,
                limit,
              ),

        forensics,

        bookIntegrity: {
          ...bookIntegrity,

          records:
            limit ===
              null
              ? bookIntegrity.records
              : bookIntegrity.records.slice(
                  0,
                  limit,
                ),
        },
      },
    });
  },
);

export default router;
