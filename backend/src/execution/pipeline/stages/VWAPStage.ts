import { orderBookService } from "../../../orderbook/services/OrderBookService";
import { vwapCalculator } from "../../../orderbook/calculators/VWAPCalculator";

import type { ExecutionContext } from "../../models/ExecutionContext";

import type { ExecutionStage } from "../ExecutionStage";
import type { ExecutionStageResult } from "../ExecutionStageResult";

export class VWAPStage
  implements ExecutionStage
{
  readonly name = "VWAP";

  execute(
    context: ExecutionContext,
  ): ExecutionStageResult {
    const buyBook =
      orderBookService.get(
        context.request.buyExchange,
        context.request.market,
      );

    const sellBook =
      orderBookService.get(
        context.request.sellExchange,
        context.request.market,
      );

    if (!buyBook) {
      return {
        success: false,
        context,
        reason:
          "Buy order book unavailable.",
      };
    }

    if (!sellBook) {
      return {
        success: false,
        context,
        reason:
          "Sell order book unavailable.",
      };
    }

    if (!context.depth) {
      return {
        success: false,
        context,
        reason:
          "Depth analysis missing.",
      };
    }

    const quantity =
      context.depth.executableQuantity;

    const buyVWAP =
      vwapCalculator.calculate(
        buyBook.asks,
        quantity,
      );

    const sellVWAP =
      vwapCalculator.calculate(
        sellBook.bids,
        quantity,
      );

    context.buyVWAP =
      buyVWAP;

    context.sellVWAP =
      sellVWAP;

    return {
      success: true,
      context,
    };
  }
}

export const vwapStage =
  new VWAPStage();