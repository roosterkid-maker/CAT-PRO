import {
  Router,
} from "express";

import {
  exchangeFleetRegistry,
} from "../core/ExchangeFleetRegistry";

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
        exchangeFleetRegistry
          .getReport(),
    });
  },
);

export default router;
