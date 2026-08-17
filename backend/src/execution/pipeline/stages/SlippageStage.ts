import { slippageCalculator } from "../../../orderbook/calculators/SlippageCalculator";
import { orderBookService } from "../../../orderbook/services/OrderBookService";

import type { ExecutionContext } from "../../models/ExecutionContext";

import type { ExecutionStage } from "../ExecutionStage";
import type { ExecutionStageResult } from "../ExecutionStageResult";

export class SlippageStage
  implements ExecutionStage
{
  readonly name = "Slippage";

  execute(
    context: ExecutionContext,
  ): ExecutionStageResult {
    if (
      !context.buyVWAP ||
      !context.sellVWAP
    ) {
      return {
        success: false,
        context,
        reason:
          "VWAP calculation is missing.",
      };
    }

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
          `Buy order book unavailable for ${context.request.buyExchange}:${context.request.market}.`,
      };
    }

    if (!sellBook) {
      return {
        success: false,
        context,
        reason:
          `Sell order book unavailable for ${context.request.sellExchange}:${context.request.market}.`,
      };
    }

    const bestAsk =
      buyBook.asks[0];

    const bestBid =
      sellBook.bids[0];

    if (
      !bestAsk ||
      !Number.isFinite(bestAsk.price) ||
      bestAsk.price <= 0
    ) {
      return {
        success: false,
        context,
        reason:
          "Buy order book does not contain a valid best ask.",
      };
    }

    if (
      !bestBid ||
      !Number.isFinite(bestBid.price) ||
      bestBid.price <= 0
    ) {
      return {
        success: false,
        context,
        reason:
          "Sell order book does not contain a valid best bid.",
      };
    }

    if (
      context.buyVWAP.filledQuantity <= 0 ||
      context.sellVWAP.filledQuantity <= 0
    ) {
      return {
        success: false,
        context,
        reason:
          "VWAP calculation did not produce an executable fill.",
      };
    }

    context.buySlippage =
      slippageCalculator.calculate(
        bestAsk.price,
        context.buyVWAP.averagePrice,
        context.buyVWAP.filledQuantity,
      );

    /*
     * SlippageCalculator calculates:
     * averageFillPrice - idealPrice.
     *
     * For the sell side, a lower VWAP than the best bid is adverse.
     * Reversing the inputs makes adverse sell slippage positive.
     */
    context.sellSlippage =
      slippageCalculator.calculate(
        context.sellVWAP.averagePrice,
        bestBid.price,
        context.sellVWAP.filledQuantity,
      );

    return {
      success: true,
      context,
    };
  }
}

export const slippageStage =
  new SlippageStage();