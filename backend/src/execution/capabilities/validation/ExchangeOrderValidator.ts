import {
  canonicalizeExchangeCapabilityMarket,
} from "../models/ExchangeCapability";

import {
  createExchangeOrderValidationResult,
  type ExchangeOrderValidationIssue,
  type ExchangeOrderValidationRequest,
  type ExchangeOrderValidationResult,
  type NormalizedExchangeOrder,
} from "./ExchangeOrderValidation";

export class ExchangeOrderValidator {
  validate(
    request: ExchangeOrderValidationRequest,
  ): ExchangeOrderValidationResult {
    const issues: ExchangeOrderValidationIssue[] = [];

    const exchange =
      request.exchange
        .trim()
        .toLowerCase();

    const market =
      request.market
        .trim()
        .toUpperCase();

    const canonicalMarket =
      canonicalizeExchangeCapabilityMarket(
        market,
      );

    const product =
      request.product ??
      "spot";

    const isolatedPaperSimulation =
      request.validationMode ===
        "ISOLATED_PAPER_SIMULATION";

    if (!exchange) {
      issues.push({
        code: "INVALID_EXCHANGE",
        field: "exchange",
        message:
          "Exchange is required.",
      });
    }

    if (!market) {
      issues.push({
        code: "INVALID_MARKET",
        field: "market",
        message:
          "Market is required.",
      });
    }

    const capability =
      request.capability;

    const capabilityExchange =
      capability.exchange
        .trim()
        .toLowerCase();

    const capabilityMarket =
      capability.market
        .trim()
        .toUpperCase();

    const canonicalCapabilityMarket =
      canonicalizeExchangeCapabilityMarket(
        capabilityMarket,
      );

    if (
      exchange &&
      (
        capabilityExchange !== exchange ||
        canonicalCapabilityMarket !== canonicalMarket ||
        capability.product !== product
      )
    ) {
      issues.push({
        code: "CAPABILITY_MISMATCH",
        field: "capability",
        message:
          "Exchange capability does not match the requested exchange, market, or product.",
      });
    }

    if (
      !capability.tradingEnabled
    ) {
      issues.push({
        code: "TRADING_DISABLED",
        field: "capability",
        message:
          "Trading is disabled for this market.",
      });
    }

    if (
      capability.maintenanceMode
    ) {
      issues.push({
        code: "MAINTENANCE_MODE",
        field: "capability",
        message:
          "Exchange market is currently in maintenance mode.",
      });
    }

    if (
      !capability.order
        .supportedOrderTypes
        .includes(
          request.orderType,
        )
    ) {
      issues.push({
        code: "UNSUPPORTED_ORDER_TYPE",
        field: "orderType",
        message:
          `Order type ${request.orderType} is not supported for this market.`,
      });
    }

    const timeInForce =
      request.timeInForce ??
      null;

    if (
      timeInForce !== null &&
      !capability.order
        .supportedTimeInForce
        .includes(
          timeInForce,
        )
    ) {
      issues.push({
        code: "UNSUPPORTED_TIME_IN_FORCE",
        field: "timeInForce",
        message:
          `Time in force ${timeInForce} is not supported for this market.`,
      });
    }

    const quantity =
      request.quantity;

    if (
      !Number.isFinite(
        quantity,
      ) ||
      quantity <= 0
    ) {
      issues.push({
        code: "INVALID_QUANTITY",
        field: "quantity",
        message:
          "Order quantity must be a positive finite number.",
      });
    }

    if (
      Number.isFinite(
        quantity,
      ) &&
      quantity > 0
    ) {
      this.validateQuantity(
        quantity,
        capability.quantity.minimumQuantity,
        capability.quantity.maximumQuantity,
        capability.quantity.quantityStep,
        capability.quantity.quantityPrecision,
        issues,
      );
    }

    const isLimitOrder =
      request.orderType ===
      "limit";

    const isMarketOrder =
      request.orderType ===
      "market";

    if (
      capability.quantity
        .quantityStep ===
        null &&
      capability.quantity
        .quantityPrecision ===
        null &&
      !isolatedPaperSimulation
    ) {
      issues.push({
        code:
          "CAPABILITY_DATA_INVALID",
        field:
          "capability",
        message:
          "Quantity increment/precision evidence is unavailable for this market.",
      });
    }

    if (
      isLimitOrder &&
      capability.price
        .priceStep ===
        null &&
      capability.price
        .pricePrecision ===
        null &&
      !isolatedPaperSimulation
    ) {
      issues.push({
        code:
          "CAPABILITY_DATA_INVALID",
        field:
          "capability",
        message:
          "Limit-price increment/precision evidence is unavailable for this market.",
      });
    }

    if (
      capability.notional
        .minimumNotional ===
        null
    ) {
      issues.push({
        code:
          "CAPABILITY_DATA_INVALID",
        field:
          "capability",
        message:
          "Minimum order-notional evidence is unavailable for this market.",
      });
    }

    let normalizedPrice:
      number | null =
      null;

    if (isLimitOrder) {
      if (
        request.price ===
        undefined
      ) {
        issues.push({
          code: "PRICE_REQUIRED",
          field: "price",
          message:
            "Limit orders require a price.",
        });
      } else if (
        !Number.isFinite(
          request.price,
        ) ||
        request.price <= 0
      ) {
        issues.push({
          code: "INVALID_PRICE",
          field: "price",
          message:
            "Limit order price must be a positive finite number.",
        });
      } else {
        normalizedPrice =
          request.price;

        this.validatePrice(
          request.price,
          capability.price.minimumPrice,
          capability.price.maximumPrice,
          capability.price.priceStep,
          capability.price.pricePrecision,
          issues,
        );
      }
    }

    if (
      isMarketOrder &&
      request.price !==
        undefined
    ) {
      issues.push({
        code: "PRICE_NOT_ALLOWED",
        field: "price",
        message:
          "Market orders must not include a fixed execution price.",
      });
    }

    let notional:
      number | null =
      null;

    if (
      Number.isFinite(
        quantity,
      ) &&
      quantity > 0 &&
      normalizedPrice !==
        null
    ) {
      notional =
        quantity *
        normalizedPrice;

      this.validateNotional(
        notional,
        capability.notional.minimumNotional,
        capability.notional.maximumNotional,
        issues,
      );
    }

    const normalizedOrder:
      NormalizedExchangeOrder | null =
      issues.length === 0
        ? {
            exchange,
            market,
            product,
            side:
              request.side,

            orderType:
              request.orderType,

            timeInForce,

            quantity,

            price:
              normalizedPrice,

            notional,
          }
        : null;

    return createExchangeOrderValidationResult(
      normalizedOrder,
      issues,
    );
  }

  private validateQuantity(
    quantity: number,

    minimumQuantity:
      number | null,

    maximumQuantity:
      number | null,

    quantityStep:
      number | null,

    quantityPrecision:
      number | null,

    issues:
      ExchangeOrderValidationIssue[],
  ): void {
    if (
      minimumQuantity !==
        null &&
      quantity <
        minimumQuantity
    ) {
      issues.push({
        code: "QUANTITY_BELOW_MINIMUM",
        field: "quantity",
        message:
          `Quantity ${quantity} is below minimum ${minimumQuantity}.`,
      });
    }

    if (
      maximumQuantity !==
        null &&
      quantity >
        maximumQuantity
    ) {
      issues.push({
        code: "QUANTITY_ABOVE_MAXIMUM",
        field: "quantity",
        message:
          `Quantity ${quantity} exceeds maximum ${maximumQuantity}.`,
      });
    }

    if (
      quantityStep !==
        null &&
      !this.isStepAligned(
        quantity,
        quantityStep,
      )
    ) {
      issues.push({
        code: "QUANTITY_STEP_MISMATCH",
        field: "quantity",
        message:
          `Quantity ${quantity} does not align with step size ${quantityStep}.`,
      });
    }

    if (
      quantityPrecision !==
        null &&
      this.exceedsAllowedPrecision(
        quantity,
        quantityPrecision,
      )
    ) {
      issues.push({
        code: "QUANTITY_PRECISION_EXCEEDED",
        field: "quantity",
        message:
          `Quantity precision exceeds allowed ${quantityPrecision} decimal places.`,
      });
    }
  }

  private validatePrice(
    price: number,

    minimumPrice:
      number | null,

    maximumPrice:
      number | null,

    priceStep:
      number | null,

    pricePrecision:
      number | null,

    issues:
      ExchangeOrderValidationIssue[],
  ): void {
    if (
      minimumPrice !==
        null &&
      price <
        minimumPrice
    ) {
      issues.push({
        code: "PRICE_BELOW_MINIMUM",
        field: "price",
        message:
          `Price ${price} is below minimum ${minimumPrice}.`,
      });
    }

    if (
      maximumPrice !==
        null &&
      price >
        maximumPrice
    ) {
      issues.push({
        code: "PRICE_ABOVE_MAXIMUM",
        field: "price",
        message:
          `Price ${price} exceeds maximum ${maximumPrice}.`,
      });
    }

    if (
      priceStep !==
        null &&
      !this.isStepAligned(
        price,
        priceStep,
      )
    ) {
      issues.push({
        code: "PRICE_STEP_MISMATCH",
        field: "price",
        message:
          `Price ${price} does not align with tick size ${priceStep}.`,
      });
    }

    if (
      pricePrecision !==
        null &&
      this.exceedsAllowedPrecision(
        price,
        pricePrecision,
      )
    ) {
      issues.push({
        code: "PRICE_PRECISION_EXCEEDED",
        field: "price",
        message:
          `Price precision exceeds allowed ${pricePrecision} decimal places.`,
      });
    }
  }

  private validateNotional(
    notional: number,

    minimumNotional:
      number | null,

    maximumNotional:
      number | null,

    issues:
      ExchangeOrderValidationIssue[],
  ): void {
    if (
      minimumNotional !==
        null &&
      notional <
        minimumNotional
    ) {
      issues.push({
        code: "NOTIONAL_BELOW_MINIMUM",
        field: "notional",
        message:
          `Order notional ${notional} is below minimum ${minimumNotional}.`,
      });
    }

    if (
      maximumNotional !==
        null &&
      notional >
        maximumNotional
    ) {
      issues.push({
        code: "NOTIONAL_ABOVE_MAXIMUM",
        field: "notional",
        message:
          `Order notional ${notional} exceeds maximum ${maximumNotional}.`,
      });
    }
  }

  private isStepAligned(
    value: number,
    step: number,
  ): boolean {
    if (
      !Number.isFinite(
        step,
      ) ||
      step <= 0
    ) {
      return true;
    }

    const ratio =
      value / step;

    const nearestInteger =
      Math.round(
        ratio,
      );

    const difference =
      Math.abs(
        ratio -
          nearestInteger,
      );

    return (
      difference <=
      1e-8
    );
  }

  private exceedsAllowedPrecision(
    value:
      number,

    precision:
      number,
  ): boolean {
    if (
      !Number.isFinite(
        value,
      ) ||
      !Number.isSafeInteger(
        precision,
      ) ||
      precision <
        0 ||
      precision >
        15
    ) {
      return true;
    }

    const scale =
      10 **
      precision;

    const scaledValue =
      value *
      scale;

    const difference =
      Math.abs(
        scaledValue -
          Math.round(
            scaledValue,
          ),
      );

    const tolerance =
      Math.max(
        1e-8,
        Math.abs(
          scaledValue,
        ) *
          Number.EPSILON *
          8,
      );

    return (
      difference >
      tolerance
    );
  }
}

export const exchangeOrderValidator =
  new ExchangeOrderValidator();
