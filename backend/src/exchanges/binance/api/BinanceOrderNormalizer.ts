import type {
  BinanceMarketRules,
} from "./BinanceMarketRulesApi";

export interface NormalizeBinanceOrderInput {
  price: number;

  quantity: number;

  rules:
    BinanceMarketRules;
}

export interface NormalizedBinanceOrder {
  valid: boolean;

  normalizedPrice: number;

  normalizedQuantity: number;

  notional: number;

  reasons: string[];
}

export class BinanceOrderNormalizer {
  normalize(
    input:
      NormalizeBinanceOrderInput,
  ): NormalizedBinanceOrder {
    const reasons: string[] = [];

    const {
      rules,
    } = input;

    if (
      !Number.isFinite(
        input.price,
      ) ||
      input.price <= 0
    ) {
      reasons.push(
        "Order price must be positive.",
      );
    }

    if (
      !Number.isFinite(
        input.quantity,
      ) ||
      input.quantity <= 0
    ) {
      reasons.push(
        "Order quantity must be positive.",
      );
    }

    if (
      reasons.length > 0
    ) {
      return {
        valid: false,

        normalizedPrice: 0,

        normalizedQuantity: 0,

        notional: 0,

        reasons,
      };
    }

    const normalizedPrice =
      this.floorToStep(
        input.price,
        rules.priceStep,
      );

    const normalizedQuantity =
      this.floorToStep(
        input.quantity,
        rules.quantityStep,
      );

    const notional =
      normalizedPrice *
      normalizedQuantity;

    if (
      normalizedPrice <= 0
    ) {
      reasons.push(
        "Normalized Binance price is zero.",
      );
    }

    if (
      normalizedQuantity <= 0
    ) {
      reasons.push(
        "Normalized Binance quantity is zero.",
      );
    }

    if (
      rules.minimumPrice > 0 &&
      normalizedPrice <
        rules.minimumPrice
    ) {
      reasons.push(
        `Price is below minimum ${rules.minimumPrice}.`,
      );
    }

    if (
      rules.maximumPrice > 0 &&
      normalizedPrice >
        rules.maximumPrice
    ) {
      reasons.push(
        `Price exceeds maximum ${rules.maximumPrice}.`,
      );
    }

    if (
      rules.minimumQuantity > 0 &&
      normalizedQuantity <
        rules.minimumQuantity
    ) {
      reasons.push(
        `Quantity is below minimum ${rules.minimumQuantity}.`,
      );
    }

    if (
      rules.maximumQuantity > 0 &&
      normalizedQuantity >
        rules.maximumQuantity
    ) {
      reasons.push(
        `Quantity exceeds maximum ${rules.maximumQuantity}.`,
      );
    }

    if (
      rules.minimumNotional > 0 &&
      notional <
        rules.minimumNotional
    ) {
      reasons.push(
        `Notional ${notional} is below minimum ${rules.minimumNotional}.`,
      );
    }

    if (
      rules.maximumNotional !==
        null &&
      notional >
        rules.maximumNotional
    ) {
      reasons.push(
        `Notional ${notional} exceeds maximum ${rules.maximumNotional}.`,
      );
    }

    if (
      rules.status !==
      "TRADING"
    ) {
      reasons.push(
        `Binance symbol status is ${rules.status}.`,
      );
    }

    if (
      !rules.spotTradingAllowed
    ) {
      reasons.push(
        "Spot trading is not allowed for this symbol.",
      );
    }

    return {
      valid:
        reasons.length === 0,

      normalizedPrice,

      normalizedQuantity,

      notional,

      reasons,
    };
  }

  private floorToStep(
    value: number,
    step: number,
  ): number {
    if (
      !Number.isFinite(step) ||
      step <= 0
    ) {
      return value;
    }

    const precision =
      this.getPrecision(
        step,
      );

    const units =
      Math.floor(
        (
          value +
          Number.EPSILON
        ) /
        step,
      );

    return Number(
      (
        units *
        step
      ).toFixed(
        precision,
      ),
    );
  }

  private getPrecision(
    value: number,
  ): number {
    const normalized =
      value.toString();

    if (
      normalized.includes(
        "e-",
      )
    ) {
      const exponent =
        Number(
          normalized.split(
            "e-",
          )[1],
        );

      return Number.isFinite(
        exponent,
      )
        ? exponent
        : 8;
    }

    const decimalIndex =
      normalized.indexOf(
        ".",
      );

    return decimalIndex === -1
      ? 0
      : normalized.length -
          decimalIndex -
          1;
  }
}

export const binanceOrderNormalizer =
  new BinanceOrderNormalizer();