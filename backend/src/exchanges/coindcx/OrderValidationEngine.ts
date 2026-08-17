import type { MarketInfo } from "./registry";

export interface OrderValidationRequest {
  market: MarketInfo;

  price: number;

  quantity: number;
}

export interface OrderValidationResult {
  valid: boolean;

  normalizedPrice: number;

  normalizedQuantity: number;

  notional: number;

  reasons: string[];
}

export class OrderValidationEngine {
  validate(
    request: OrderValidationRequest,
  ): OrderValidationResult {
    const reasons: string[] = [];

    const quantity =
      this.round(
        request.quantity,
        request.market.quantityPrecision,
      );

    const price =
      this.round(
        request.price,
        request.market.pricePrecision,
      );

    const notional =
      quantity * price;

    if (
      quantity <
      request.market.minimumQuantity
    ) {
      reasons.push(
        `Minimum quantity is ${request.market.minimumQuantity}.`,
      );
    }

    if (
      request.market.maximumQuantity !== null &&
      quantity >
        request.market.maximumQuantity
    ) {
      reasons.push(
        `Maximum quantity is ${request.market.maximumQuantity}.`,
      );
    }

    if (
      price <
      request.market.minimumPrice
    ) {
      reasons.push(
        `Minimum price is ${request.market.minimumPrice}.`,
      );
    }

    if (
      request.market.maximumPrice !== null &&
      price >
        request.market.maximumPrice
    ) {
      reasons.push(
        `Maximum price is ${request.market.maximumPrice}.`,
      );
    }

    if (
      notional <
      request.market.minimumNotional
    ) {
      reasons.push(
        `Minimum notional is ${request.market.minimumNotional}.`,
      );
    }

    return {
      valid:
        reasons.length === 0,

      normalizedPrice:
        price,

      normalizedQuantity:
        quantity,

      notional,

      reasons,
    };
  }

  private round(
    value: number,
    precision: number,
  ): number {
    const factor =
      Math.pow(
        10,
        precision,
      );

    return (
      Math.round(
        value * factor,
      ) / factor
    );
  }
}

export const orderValidationEngine =
  new OrderValidationEngine();