import { Router } from "express";

import { healthService } from "../health/HealthService";

const router = Router();

router.get("/", (_request, response) => {
  const report = healthService.getReport();

  response.json({
    success: true,
    data: report,
  });
});

export default router;