import { depthCalculator } from "../../../orderbook/calculators/DepthCalculator";
import { orderBookService } from "../../../orderbook/services/OrderBookService";

import type { ExecutionContext } from "../../models/ExecutionContext";

import type { ExecutionStage } from "../ExecutionStage";
import type { ExecutionStageResult } from "../ExecutionStageResult";

export class DepthStage
  implements ExecutionStage
{
  readonly name = "Depth";

  execute(
    context: ExecutionContext,
  ): ExecutionStageResult {
    const orderBook =
      orderBookService.get(
        context.request.buyExchange,
        context.request.market,
      );

    if (!orderBook) {
      return {
        success: false,
        context,
        reason:
          `Buy order book unavailable for ${context.request.buyExchange}:${context.request.market}.`,
      };
    }

    const bestAsk =
      orderBook.asks[0];

    if (
      !bestAsk ||
      !Number.isFinite(bestAsk.price) ||
      bestAsk.price <= 0
    ) {
      return {
        success: false,
        context,
        reason:
          "Buy order book does not contain a valid ask price.",
      };
    }

    const requestedQuantity =
      context.request.capital /
      bestAsk.price;

    if (
      !Number.isFinite(
        requestedQuantity,
      ) ||
      requestedQuantity <= 0
    ) {
      return {
        success: false,
        context,
        reason:
          "Unable to calculate a valid requested quantity.",
      };
    }

    const depth =
      depthCalculator.analyze(
        orderBook.asks,
        requestedQuantity,
      );

    context.depth = depth;

    if (
      depth.executableQuantity <= 0
    ) {
      return {
        success: false,
        context,
        reason:
          "No executable buy-side depth is available.",
      };
    }

    return {
      success: true,
      context,
    };
  }
}

export const depthStage =
  new DepthStage();