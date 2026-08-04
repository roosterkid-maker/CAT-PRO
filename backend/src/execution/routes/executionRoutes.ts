import { Router } from "express";

import { orderBookService } from "../../orderbook/services/OrderBookService";
import { executionSimulator } from "../services/ExecutionSimulator";

const router = Router();

router.get(
  "/order-books",
  (_request, response) => {
    const books =
      orderBookService.getAll();

    response.json({
      success: true,

      count: books.length,

      data: books.map((book) => ({
        exchange: book.exchange,
        market: book.market,
        bids: book.bids.length,
        asks: book.asks.length,
        timestamp: book.timestamp,
      })),
    });
  },
);

router.post(
  "/simulate",
  (request, response) => {
    try {
      if (
        !request.body ||
        typeof request.body !==
          "object"
      ) {
        response.status(400).json({
          success: false,
          message:
            "Request body is required.",
        });

        return;
      }

      const result =
        executionSimulator.simulate(
          request.body,
        );

      response.json({
        success: true,
        data: result,
      });
    } catch (error) {
      response.status(400).json({
        success: false,

        message:
          error instanceof Error
            ? error.message
            : "Execution simulation failed.",
      });
    }
  },
);

export default router;