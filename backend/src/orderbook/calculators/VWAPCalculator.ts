import type { OrderBookLevel } from "../models/OrderBookLevel";
import type { VWAPResult } from "../models/VWAPResult";

export class VWAPCalculator {
  calculate(
    levels: OrderBookLevel[],
    requestedQuantity: number,
  ): VWAPResult {
    let remaining =
      requestedQuantity;

    let filled = 0;

    let totalCost = 0;

    for (const level of levels) {
      if (remaining <= 0) {
        break;
      }

      const fillQuantity =
        Math.min(
          remaining,
          level.quantity,
        );

      filled += fillQuantity;

      totalCost +=
        fillQuantity *
        level.price;

      remaining -=
        fillQuantity;
    }

    const averagePrice =
      filled > 0
        ? totalCost / filled
        : 0;

    return {
      requestedQuantity,

      filledQuantity: filled,

      averagePrice,

      totalCost,

      unfilledQuantity:
        remaining,

      fillPercent:
        requestedQuantity > 0
          ? (filled /
              requestedQuantity) *
            100
          : 0,

      partialFill:
        remaining > 0,
    };
  }
}

export const vwapCalculator =
  new VWAPCalculator();