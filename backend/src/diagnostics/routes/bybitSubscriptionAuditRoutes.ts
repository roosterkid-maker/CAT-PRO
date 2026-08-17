import {
  Router,
} from "express";

import {
  bybitExecutionUniverseService,
} from "../../execution-quality/services/BybitExecutionUniverseService";

import {
  bybitSubscriptionAuditService,
} from "../services/BybitSubscriptionAuditService";

const router =
  Router();

router.get(
  "/",
  (
    request,
    response,
  ) => {
    const limit =
      resolveLimit(
        request.query.limit,
      );

    const report =
      bybitSubscriptionAuditService
        .getReport();

    response.json({
      success:
        true,

      data: {
        ...report,

        records:
          report.records.slice(
            0,
            limit,
          ),
      },
    });
  },
);

/*
 * V19.18
 *
 * Dynamic execution-quality universe.
 *
 * Read-only endpoint.
 *
 * This does not:
 * - widen freshness thresholds
 * - mutate MarketCache
 * - subscribe/unsubscribe markets
 * - enable LIVE execution
 */
router.get(
  "/execution-universe",
  (
    request,
    response,
  ) => {
    const limit =
      resolveLimit(
        request.query.limit,
      );

    const report =
      bybitExecutionUniverseService
        .getReport();

    response.json({
      success:
        true,

      data: {
        ...report,

        markets:
          report.markets.slice(
            0,
            limit,
          ),
      },
    });
  },
);

function resolveLimit(
  rawLimit:
    unknown,
): number {
  const parsedLimit =
    typeof rawLimit ===
      "string"
      ? Number(
          rawLimit,
        )
      : Number.NaN;

  return Number.isSafeInteger(
    parsedLimit,
  ) &&
    parsedLimit >
      0
    ? Math.min(
        parsedLimit,
        200,
      )
    : 50;
}

export default router;