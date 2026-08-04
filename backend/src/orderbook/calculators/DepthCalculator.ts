import type { OrderBookLevel } from "../models/OrderBookLevel";
import type { DepthAnalysis } from "../models/DepthAnalysis";

export class DepthCalculator {
  analyze(
    levels: OrderBookLevel[],
    requestedQuantity: number,
  ): DepthAnalysis {
    let remaining =
      requestedQuantity;

    let executableQuantity = 0;

    let executableCapital = 0;

    let consumedLevels = 0;

    for (const level of levels) {
      if (remaining <= 0) {
        break;
      }

      const quantity = Math.min(
        remaining,
        level.quantity,
      );

      executableQuantity += quantity;

      executableCapital +=
        quantity * level.price;

      remaining -= quantity;

      consumedLevels++;
    }

    const averagePrice =
      executableQuantity > 0
        ? executableCapital /
          executableQuantity
        : 0;

    const fillPercent =
      requestedQuantity > 0
        ? (executableQuantity /
            requestedQuantity) *
          100
        : 0;

    return {
      requestedQuantity,

      executableQuantity,

      executableCapital,

      averagePrice,

      remainingQuantity:
        remaining,

      fillPercent,

      fullyExecutable:
        remaining <= 0,

      consumedLevels,
    };
  }
}

export const depthCalculator =
  new DepthCalculator();