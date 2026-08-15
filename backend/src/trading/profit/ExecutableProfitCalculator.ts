import {
  getExchangeFees,
} from "../../arbitrage/config/fees";

export interface ExecutableProfitInput {
  market: string;

  capital: number;

  buyExchange: string;

  sellExchange: string;

  buyPrice: number;

  sellPrice: number;

  buySlippagePercent: number;

  sellSlippagePercent: number;

  safetyBufferPercent: number;

  minimumProfitPercent: number;
}

export interface ExecutableProfitResult {
  executable: boolean;

  quantity: number;

  effectiveBuyPrice: number;

  effectiveSellPrice: number;

  buyNotional: number;

  sellNotional: number;

  grossProfit: number;

  tradingFees: number;

  slippageCost: number;

  safetyBuffer: number;

  executableProfit: number;

  executableProfitPercent: number;

  reasons: string[];
}

export class ExecutableProfitCalculator {
  calculate(
    input: ExecutableProfitInput,
  ): ExecutableProfitResult {
    this.validateInput(input);

    const buyFees =
      getExchangeFees(
        input.buyExchange,
        input.market,
      );

    const sellFees =
      getExchangeFees(
        input.sellExchange,
        input.market,
      );

    const quantity =
      input.capital /
      input.buyPrice;

    const effectiveBuyPrice =
      input.buyPrice *
      (
        1 +
        input.buySlippagePercent /
          100
      );

    const effectiveSellPrice =
      input.sellPrice *
      (
        1 -
        input.sellSlippagePercent /
          100
      );

    const rawBuyNotional =
      input.buyPrice *
      quantity;

    const rawSellNotional =
      input.sellPrice *
      quantity;

    const buyNotional =
      effectiveBuyPrice *
      quantity;

    const sellNotional =
      effectiveSellPrice *
      quantity;

    const buyFee =
      buyNotional *
      (
        buyFees.takerPercent /
        100
      );

    const sellFee =
      sellNotional *
      (
        sellFees.takerPercent /
        100
      );

    const tradingFees =
      buyFee +
      sellFee;

    const buySlippageCost =
      Math.max(
        0,
        buyNotional -
          rawBuyNotional,
      );

    const sellSlippageCost =
      Math.max(
        0,
        rawSellNotional -
          sellNotional,
      );

    const slippageCost =
      buySlippageCost +
      sellSlippageCost;

    const safetyBuffer =
      input.capital *
      (
        input.safetyBufferPercent /
        100
      );

    const grossProfit =
      rawSellNotional -
      rawBuyNotional;

    const executableProfit =
      grossProfit -
      tradingFees -
      slippageCost -
      safetyBuffer;

    const executableProfitPercent =
      buyNotional > 0
        ? (
            executableProfit /
            buyNotional
          ) * 100
        : 0;

    const reasons: string[] = [];

    if (
      effectiveSellPrice <=
      effectiveBuyPrice
    ) {
      reasons.push(
        "Effective sell price does not exceed effective buy price.",
      );
    }

    if (
      executableProfit <= 0
    ) {
      reasons.push(
        "Trade is not profitable after fees, slippage, and safety buffer.",
      );
    }

    if (
      executableProfitPercent <
      input.minimumProfitPercent
    ) {
      reasons.push(
        `Executable profit ${executableProfitPercent.toFixed(
          4,
        )}% is below minimum ${input.minimumProfitPercent.toFixed(
          4,
        )}%.`,
      );
    }

    return {
      executable:
        reasons.length === 0,

      quantity,

      effectiveBuyPrice,

      effectiveSellPrice,

      buyNotional,

      sellNotional,

      grossProfit,

      tradingFees,

      slippageCost,

      safetyBuffer,

      executableProfit,

      executableProfitPercent,

      reasons,
    };
  }

  private validateInput(
    input: ExecutableProfitInput,
  ): void {
    this.requireNonEmptyString(
      input.market,
      "Market",
    );

    this.requireNonEmptyString(
      input.buyExchange,
      "Buy exchange",
    );

    this.requireNonEmptyString(
      input.sellExchange,
      "Sell exchange",
    );

    this.requirePositive(
      input.capital,
      "Capital",
    );

    this.requirePositive(
      input.buyPrice,
      "Buy price",
    );

    this.requirePositive(
      input.sellPrice,
      "Sell price",
    );

    this.requireNonNegative(
      input.buySlippagePercent,
      "Buy slippage percent",
    );

    this.requireNonNegative(
      input.sellSlippagePercent,
      "Sell slippage percent",
    );

    this.requireNonNegative(
      input.safetyBufferPercent,
      "Safety buffer percent",
    );

    this.requireNonNegative(
      input.minimumProfitPercent,
      "Minimum profit percent",
    );
  }

  private requirePositive(
    value: number,
    name: string,
  ): void {
    if (
      !Number.isFinite(value) ||
      value <= 0
    ) {
      throw new Error(
        `${name} must be a positive finite number.`,
      );
    }
  }

  private requireNonNegative(
    value: number,
    name: string,
  ): void {
    if (
      !Number.isFinite(value) ||
      value < 0
    ) {
      throw new Error(
        `${name} must be a non-negative finite number.`,
      );
    }
  }

  private requireNonEmptyString(
    value: string,
    name: string,
  ): void {
    if (
      typeof value !== "string" ||
      value.trim().length === 0
    ) {
      throw new Error(
        `${name} is required.`,
      );
    }
  }
}

export const executableProfitCalculator =
  new ExecutableProfitCalculator();
