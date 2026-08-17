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

    /*
     * Summing decimal exchange quantities can
     * produce a tiny IEEE-754 overshoot (for
     * example 100.00000000000001%). Keep the
     * public percentage contract bounded while
     * preserving the exact executable quantity.
     */
    const fillPercent =
      requestedQuantity > 0
        ? Math.max(
            0,
            Math.min(
              100,
              (executableQuantity /
                requestedQuantity) *
                100,
            ),
          )
        : 0;

    return {
      requestedQuantity,

      executableQuantity,

      executableCapital,

      averagePrice,

      remainingQuantity:
        Math.max(
          0,
          remaining,
        ),

      fillPercent,

      fullyExecutable:
        remaining <= 0,

      consumedLevels,
    };
  }
}

export const depthCalculator =
  new DepthCalculator();
