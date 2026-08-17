import {
  Router,
} from "express";

import {
  arbitragePnLService,
} from "../metrics/ArbitragePnLService";

export const arbitragePnLRoutes =
  Router();

arbitragePnLRoutes.get(
  "/",
  (
    request,
    response,
  ) => {
    const requestedLimit =
      Number(
        request.query.limit ??
        20,
      );

    const report =
      arbitragePnLService.getReport(
        requestedLimit,
      );

    response
      .status(200)
      .json(
        report,
      );
  },
);