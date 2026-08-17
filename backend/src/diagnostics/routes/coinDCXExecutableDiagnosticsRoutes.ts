import {
  Router,
} from "express";

import {
  coinDCXExecutableDiagnosticsService,
} from "../services/CoinDCXExecutableDiagnosticsService";

const router =
  Router();

router.get(
  "/",
  (
    request,
    response,
  ) => {
    const rawLimit =
      request.query.limit;

    const limit =
      typeof rawLimit ===
        "string" &&
      rawLimit.trim().length >
        0
        ? Number(
            rawLimit,
          )
        : null;

    const report =
      coinDCXExecutableDiagnosticsService
        .generate(
          limit,
        );

    response.json({
      success:
        true,

      data:
        report,
    });
  },
);

export default router;