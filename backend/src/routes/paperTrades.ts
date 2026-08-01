import { Router } from "express";

import { opportunityService } from "../arbitrage/services/OpportunityService";
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

router.post("/", (request, response) => {
  try {
    const market = String(
      request.body?.market ?? "",
    ).toUpperCase();

    const buyExchange = String(
      request.body?.buyExchange ?? "",
    ).toLowerCase();

    const sellExchange = String(
      request.body?.sellExchange ?? "",
    ).toLowerCase();

    const capital = Number(
      request.body?.capital,
    );

    const opportunity = opportunityService
      .getOpportunities()
      .find(
        (item) =>
          item.pair.market === market &&
          item.pair.buy.exchange === buyExchange &&
          item.pair.sell.exchange === sellExchange,
      );

    if (!opportunity) {
      response.status(404).json({
        success: false,
        message:
          "Matching live opportunity was not found.",
      });

      return;
    }

    const trade = paperTradingService.openTrade(
      opportunity,
      capital,
    );

    response.status(201).json({
      success: true,
      data: trade,
    });
  } catch (error) {
    response.status(400).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unable to create paper trade.",
    });
  }
});

export default router;