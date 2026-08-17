import {
  Router,
} from "express";

import {
  capitalReservationService,
} from "../../../trading/capital/CapitalReservationService";

import {
  capitalController,
} from "../controllers/CapitalController";

const capitalRoutes =
  Router();

capitalRoutes.get(
  "/state",
  capitalController.getState.bind(
    capitalController,
  ),
);

/*
 * Version 13.2
 *
 * GET /api/capital/reservations
 *
 * Read-only reservation diagnostics.
 */
capitalRoutes.get(
  "/reservations",
  (
    _request,
    response,
  ) => {
    response.status(200).json({
      success:
        true,

      data:
        capitalReservationService
          .getDiagnostics(),
    });
  },
);

/*
 * GET /api/capital/reservations/:id
 *
 * Inspect one active or historical
 * capital reservation.
 */
capitalRoutes.get(
  "/reservations/:id",
  (
    request,
    response,
  ) => {
    const reservation =
      capitalReservationService
        .getById(
          request.params.id,
        );

    if (!reservation) {
      response.status(404).json({
        success:
          false,

        error:
          "Capital reservation not found.",
      });

      return;
    }

    response.status(200).json({
      success:
        true,

      data:
        reservation,
    });
  },
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