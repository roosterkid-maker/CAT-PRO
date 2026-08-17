import {
  Router,
} from "express";

import {
  sharedRecoveryIntentService,
} from "../services/SharedRecoveryIntentService";

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

export default router;
