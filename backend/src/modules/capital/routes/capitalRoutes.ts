import { Router } from "express";

import { capitalController } from "../controllers/CapitalController";

const capitalRoutes = Router();

capitalRoutes.get(
  "/state",
  capitalController.getState.bind(
    capitalController,
  ),
);

capitalRoutes.post(
  "/initialize",
  capitalController.initialize.bind(
    capitalController,
  ),
);

capitalRoutes.post(
  "/allocation/check",
  capitalController.checkAllocation.bind(
    capitalController,
  ),
);

capitalRoutes.post(
  "/allocate",
  capitalController.allocate.bind(
    capitalController,
  ),
);

capitalRoutes.post(
  "/release",
  capitalController.release.bind(
    capitalController,
  ),
);

capitalRoutes.post(
  "/reserve",
  capitalController.reserve.bind(
    capitalController,
  ),
);

capitalRoutes.post(
  "/profit",
  capitalController.recordProfit.bind(
    capitalController,
  ),
);

capitalRoutes.post(
  "/loss",
  capitalController.recordLoss.bind(
    capitalController,
  ),
);

capitalRoutes.post(
  "/daily/reset",
  capitalController.resetDailyMetrics.bind(
    capitalController,
  ),
);

export default capitalRoutes;