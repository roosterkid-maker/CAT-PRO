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

  quantity?: number;

  buyFeePercent?: number;

  sellFeePercent?: number;

  tdsWithholdingPercent?: number;
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

  buyCost: number;

  sellProceeds: number;

  buyFee: number;

  sellFee: number;

  buySlippageReserve: number;

  sellSlippageReserve: number;

  economicNetProfit: number;

  economicNetProfitPercent: number;

  tdsWithheld: number;

  deployableCashProceeds: number;

  deployableCashProfit: number;

  postTradeCashBalanceImpact: number;

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
      input.quantity ??
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

    const buyCost =
      input.buyPrice *
      quantity;

    const sellProceeds =
      input.sellPrice *
      quantity;

    const buyFeePercent =
      input.buyFeePercent ??
      buyFees.takerPercent;

    const sellFeePercent =
      input.sellFeePercent ??
      sellFees.takerPercent;

    const buyFee =
      buyCost *
      (
        buyFeePercent /
        100
      );

    const sellFee =
      sellProceeds *
      (
        sellFeePercent /
        100
      );

    const tradingFees =
      buyFee +
      sellFee;

    const buySlippageReserve =
      buyCost *
      (
        input.buySlippagePercent /
        100
      );

    const sellSlippageReserve =
      sellProceeds *
      (
        input.sellSlippagePercent /
        100
      );

    const slippageCost =
      buySlippageReserve +
      sellSlippageReserve;

    const safetyBuffer =
      buyCost *
      (
        input.safetyBufferPercent /
        100
      );

    const grossProfit =
      sellProceeds -
      buyCost;

    const executableProfit =
      grossProfit -
      tradingFees -
      slippageCost -
      safetyBuffer;

    const executableProfitPercent =
      buyCost > 0
        ? (
            executableProfit /
            buyCost
          ) * 100
        : 0;

    const tdsWithholdingPercent =
      input.tdsWithholdingPercent ??
      0;

    const tdsWithheld =
      sellProceeds *
      (
        tdsWithholdingPercent /
        100
      );

    const deployableCashProceeds =
      sellProceeds -
      sellFee -
      tdsWithheld;

    const deployableCashProfit =
      executableProfit -
      tdsWithheld;

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

      buyNotional:
        buyCost,

      sellNotional:
        sellProceeds,

      grossProfit,

      tradingFees,

      slippageCost,

      safetyBuffer,

      executableProfit,

      executableProfitPercent,

      buyCost,

      sellProceeds,

      buyFee,

      sellFee,

      buySlippageReserve,

      sellSlippageReserve,

      economicNetProfit:
        executableProfit,

      economicNetProfitPercent:
        executableProfitPercent,

      tdsWithheld,

      deployableCashProceeds,

      deployableCashProfit,

      postTradeCashBalanceImpact:
        deployableCashProfit,

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

    if (
      input.quantity !== undefined
    ) {
      this.requirePositive(
        input.quantity,
        "Quantity",
      );

      if (
        input.quantity *
          input.buyPrice >
        input.capital +
          Math.max(
            1e-9,
            input.capital *
              1e-9,
          )
      ) {
        throw new Error(
          "Quantity exceeds the capital-bounded BUY notional.",
        );
      }
    }

    for (
      const [
        value,
        name,
      ] of [
        [
          input.buyFeePercent,
          "Buy fee percent",
        ],
        [
          input.sellFeePercent,
          "Sell fee percent",
        ],
        [
          input.tdsWithholdingPercent,
          "TDS withholding percent",
        ],
      ] as const
    ) {
      if (value !== undefined) {
        this.requireNonNegative(
          value,
          name,
        );
      }
    }
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
