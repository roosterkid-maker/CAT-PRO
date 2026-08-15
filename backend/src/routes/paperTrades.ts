import { Router } from "express";

import { paperTradingService } from "../trading/services/PaperTradingService";

const router = Router();

router.get("/", (_request, response) => {
  const trades = paperTradingService.getTrades();

  response.json({
    success: true,
    count: trades.length,
    data: trades,
  });
});

router.get("/:id", (request, response) => {
  const trade = paperTradingService.getTrade(
    request.params.id,
  );

  if (!trade) {
    response.status(404).json({
      success: false,
      message: "Paper trade not found.",
    });

    return;
  }

  response.json({
    success: true,
    data: trade,
  });
});

router.post("/", (_request, response) => {
  response.status(410).json({
    success: false,
    message:
      "Legacy paper-trade creation is retired. Use /api/paper/execute so INR capital is converted through the authoritative quote-currency evidence path.",
  });
});

export default router;
