import type { ExecutionContext } from "../models/ExecutionContext";

export class ExecutionCalculator {
  calculate(
    buyPrice: number,
    buyAvailableQty: number,
    sellAvailableQty: number,
    requestedQuoteCapital: number,
  ): ExecutionContext {
    if (
      !Number.isFinite(buyPrice) ||
      buyPrice <= 0
    ) {
      throw new Error(
        "Buy price must be a positive number.",
      );
    }

    if (
      !Number.isFinite(buyAvailableQty) ||
      buyAvailableQty <= 0
    ) {
      throw new Error(
        "Buy-side liquidity is unavailable.",
      );
    }

    if (
      !Number.isFinite(sellAvailableQty) ||
      sellAvailableQty <= 0
    ) {
      throw new Error(
        "Sell-side liquidity is unavailable.",
      );
    }

    if (
      !Number.isFinite(requestedQuoteCapital) ||
      requestedQuoteCapital <= 0
    ) {
      throw new Error(
        "Requested capital must be a positive number.",
      );
    }

    const requestedQty =
      requestedQuoteCapital / buyPrice;

    const availableQty = Math.min(
      buyAvailableQty,
      sellAvailableQty,
    );

    const executableQty = Math.max(
      0,
      Math.min(
        requestedQty,
        availableQty,
      ),
    );

    const executableCapital =
      executableQty * buyPrice;

    const unfilledQty = Math.max(
      0,
      requestedQty - executableQty,
    );

    const unfilledCapital = Math.max(
      0,
      requestedQuoteCapital -
        executableCapital,
    );

    const fillPercent =
      requestedQty > 0
        ? Math.max(
            0,
            Math.min(
              100,
              (executableQty /
                requestedQty) *
                100,
            ),
          )
        : 0;

    const liquidityPercent =
      requestedQty > 0
        ? Math.max(
            0,
            Math.min(
              100,
              (availableQty /
                requestedQty) *
                100,
            ),
          )
        : 0;

    const enoughLiquidity =
      fillPercent >= 100;

    const partialFill =
      executableQty > 0 &&
      fillPercent < 100;

    return {
      requestedCapital:
        requestedQuoteCapital,

      requestedQty,

      availableQty,

      executableQty,

      executableCapital,

      unfilledQty,

      unfilledCapital,

      liquidityPercent,

      fillPercent,

      partialFill,

      enoughLiquidity,
    };
  }
}

export const executionCalculator =
  new ExecutionCalculator();
