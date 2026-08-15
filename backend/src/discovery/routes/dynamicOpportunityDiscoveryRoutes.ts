import {
  Router,
} from "express";

import {
  dynamicOpportunityDiscoveryService,
} from "../services/DynamicOpportunityDiscoveryService";

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
        dynamicOpportunityDiscoveryService
          .getSnapshot(),
    });
  },
);

export default router;
