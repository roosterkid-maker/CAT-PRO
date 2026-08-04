import { Router } from "express";

import { portfolioService } from "../services/PortfolioService";

const router = Router();

router.get(
  "/summary",
  (_request, response) => {
    response.json({
      success: true,
      data: portfolioService.getSummary(),
    });
  },
);

export default router;