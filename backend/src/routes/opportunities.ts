import { Router } from "express";

import { opportunityMapper } from "../arbitrage/mappers/OpportunityMapper";
import { opportunityService } from "../arbitrage/services/OpportunityService";

const router = Router();

router.get("/", (_request, response) => {
  const opportunities =
    opportunityService.getLastOpportunities();

  const data =
    opportunityMapper.toDtoList(opportunities);

  response.json({
    success: true,
    count: data.length,
    data,
  });
});

export default router;
