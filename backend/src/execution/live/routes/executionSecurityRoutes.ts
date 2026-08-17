import {
  Router,
} from "express";

import {
  credentialSafetyService,
} from "../security/CredentialSafetyService";

const router =
  Router();

/*
 * VERSION 18 BUILD 10
 *
 * GET /api/execution/security
 *
 * Configuration-health diagnostics only.
 *
 * Actual API key / secret values are NEVER
 * returned.
 */
router.get(
  "/",

  (
    _request,
    response,
  ) => {
    const report =
      credentialSafetyService
        .getReport();

    response
      .status(
        report
          .blockers
          .length >
          0
          ? 503
          : 200,
      )
      .json({
        success:
          report
            .blockers
            .length ===
          0,

        data:
          report,
      });
  },
);

export default router;