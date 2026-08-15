import {
  Router,
} from "express";

import {
  liveExecutionService,
} from "../LiveExecutionService";

import {
  executionAdapterVerificationService,
} from "../verification/ExecutionAdapterVerificationService";

const router =
  Router();

router.get(
  "/",
  (
    _request,
    response,
  ) => {
    response
      .status(
        200,
      )
      .json({
        generatedAt:
          Date.now(),

        version:
          "19.26",

        verificationPurpose:
          "AUTHENTICATED_READ_ONLY",

        verificationTtlMs:
          executionAdapterVerificationService
            .getVerificationTtlMs(),

        liveTradingEnabled:
          false,

        liveSubmissionAllowed:
          false,

        exchanges:
          liveExecutionService
            .getMonitoredExchangeStatuses(),

        notes: [
          "Verification evidence is derived from existing signed read-only balance synchronization.",

          "No order endpoint is called by verification.",

          "No balances or credentials are returned by this endpoint.",

          "Bybit read-only readiness is reported without registering a LIVE order adapter.",

          "LIVE execution capability remains disabled.",
        ],
      });
  },
);

export default router;
