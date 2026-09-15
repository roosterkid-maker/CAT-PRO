import {
  Router,
} from "express";

import {
  sharedRecoveryIntentService,
} from "../services/SharedRecoveryIntentService";

import {
  sharedRecoveryHaltGateService,
} from "../services/SharedRecoveryHaltGateService";

import {
  sharedRecoveryResolutionService,
} from "../services/SharedRecoveryResolutionService";

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
        sharedRecoveryIntentService
          .getReport(),
    });
  },
);

router.get(
  "/halt",
  (
    _request,
    response,
  ) => {
    response.json({
      success:
        true,
      data:
        sharedRecoveryHaltGateService
          .getReport(),
    });
  },
);

/*
 * Explicit, evidence-bound resolution for a staged SharedRecoveryIntent
 * (e.g. a triangular-arbitrage cycle left holding an intermediate-asset
 * residual after a partial/failed leg). The caller must supply a LIVE,
 * freshly-queried authoritative balance for the exact asset and exchange
 * named on the intent's leg - not a cached snapshot - proving zero borrow
 * and (for a LONG residual) that the remaining balance still covers the
 * full staged quantity, or (for a SHORT residual) that the balance is
 * simply non-negative. This endpoint performs no exchange I/O itself; it
 * only journals the operator-supplied evidence and validates it against
 * the immutable staged intent. SharedRecoveryIntentService itself has no
 * resolve/clear method by design - this is a separate resolution ledger.
 */
router.post(
  "/:intentId/resolve-by-balance",
  (
    request,
    response,
  ) => {
    try {
      const resolutionNote =
        typeof request.body?.resolutionNote === "string"
          ? request.body.resolutionNote
          : "";
      const body = request.body ?? {};

      const resolution =
        sharedRecoveryResolutionService
          .resolveByAuthoritativeBalance(
            request.params.intentId,
            {
              exchange:
                typeof body.exchange === "string" ? body.exchange : "",
              asset:
                typeof body.asset === "string" ? body.asset : "",
              availableBalance:
                typeof body.availableBalance === "number"
                  ? body.availableBalance
                  : Number.NaN,
              borrowedAmount:
                typeof body.borrowedAmount === "number"
                  ? body.borrowedAmount
                  : Number.NaN,
              queriedAt:
                typeof body.queriedAt === "number"
                  ? body.queriedAt
                  : Number.NaN,
              evidenceSource:
                typeof body.evidenceSource === "string"
                  ? body.evidenceSource
                  : "",
            },
            resolutionNote,
          );

      response.json({
        success: true,
        data: {
          resolution,
          halt: sharedRecoveryHaltGateService.getReport(),
        },
      });
    } catch (error: unknown) {
      response.status(409).json({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Shared recovery balance-coverage resolution failed.",
        halt: sharedRecoveryHaltGateService.getReport(),
      });
    }
  },
);

export default router;
