import type { OrderBookLevel } from "../models/OrderBookLevel";
import type { VWAPResult } from "../models/VWAPResult";

export class VWAPCalculator {
  calculate(
    levels: OrderBookLevel[],
    requestedQuantity: number,
  ): VWAPResult {
    if (
      !Number.isFinite(requestedQuantity) ||
      requestedQuantity <= 0
    ) {
      throw new Error(
        "Requested quantity must be positive.",
      );
    }

    let remaining =
      requestedQuantity;

    let filledQuantity = 0;

    let totalCost = 0;

    for (const level of levels) {
      if (remaining <= 0) {
        break;
      }

      if (
        !level ||
        !Number.isFinite(
          level.price,
        ) ||
        !Number.isFinite(
          level.quantity,
        ) ||
        level.price <= 0 ||
        level.quantity <= 0
      ) {
        throw new Error(
          "VWAP levels must contain positive finite price and quantity.",
        );
      }

      const fillQuantity =
        Math.min(
          remaining,
          level.quantity,
        );

      totalCost +=
        fillQuantity *
        level.price;

      filledQuantity +=
        fillQuantity;

      remaining -=
        fillQuantity;
    }

    const averagePrice =
      filledQuantity > 0
        ? totalCost /
          filledQuantity
        : 0;

    const fillPercent =
      requestedQuantity > 0
        ? (filledQuantity /
            requestedQuantity) *
          100
        : 0;

    return {
      requestedQuantity,

      filledQuantity,

      averagePrice,

      totalCost,

      unfilledQuantity:
        remaining,

      fillPercent,

      partialFill:
        remaining > 0,
    };
  }
}

export const vwapCalculator =
  new VWAPCalculator();
