import {
  exchangeCapabilityService,
} from "../../execution/capabilities/services/ExchangeCapabilityService";

import {
  exchangeOrderValidator,
} from "../../execution/capabilities/validation/ExchangeOrderValidator";

import type {
  ExchangeOrderValidationIssue,
} from "../../execution/capabilities/validation/ExchangeOrderValidation";

import type {
  ExchangeMarketCapability,
} from "../../execution/capabilities/models/ExchangeCapability";

import type {
  ExecutionLeg,
  ExecutionPlan,
} from "../models/ExecutionPlan";

export type ExecutionPlanValidationCode =
  | "INVALID_PLAN_ID"
  | "INVALID_MARKET"
  | "INVALID_CAPITAL"
  | "INVALID_STATUS"
  | "PLAN_EXPIRED"
  | "INVALID_TIMEOUT"
  | "INVALID_CREATED_AT"
  | "INVALID_EXPIRATION"
  | "INVALID_BUY_LEG"
  | "INVALID_SELL_LEG"
  | "SAME_EXCHANGE"
  | "MARKET_MISMATCH"
  | "CAPABILITY_NOT_FOUND"
  | "CAPABILITY_LOOKUP_FAILED"
  | "ORDER_VALIDATION_FAILED";

export interface ExecutionPlanValidationIssue {
  code:
    ExecutionPlanValidationCode;

  leg:
    | "PLAN"
    | "BUY"
    | "SELL";

  message:
    string;

  orderIssues?:
    readonly ExchangeOrderValidationIssue[];
}

export interface ExecutionPlanLegValidation {
  valid:
    boolean;

  exchange:
    string;

  market:
    string;

  capability:
    ExchangeMarketCapability | null;

  orderIssues:
    readonly ExchangeOrderValidationIssue[];

  reasons:
    readonly string[];
}

export interface ExecutionPlanValidationResult {
  valid:
    boolean;

  planId:
    string;

  buy:
    ExecutionPlanLegValidation;

  sell:
    ExecutionPlanLegValidation;

  issues:
    readonly ExecutionPlanValidationIssue[];

  reasons:
    readonly string[];

  validatedAt:
    number;
}

export interface ExecutionPlanValidationOptions {
  validationMode?:
    | "EXCHANGE_ORDER"
    | "ISOLATED_PAPER_SIMULATION";
}

export class ExecutionPlanValidator {
  async validate(
    plan:
      ExecutionPlan,

    options:
      ExecutionPlanValidationOptions = {},
  ): Promise<ExecutionPlanValidationResult> {
    const validatedAt =
      Date.now();

    const issues:
      ExecutionPlanValidationIssue[] =
      [];

    const validationMode =
      options.validationMode ===
        "ISOLATED_PAPER_SIMULATION" &&
      plan.mode ===
        "PAPER"
        ? "ISOLATED_PAPER_SIMULATION"
        : "EXCHANGE_ORDER";

    this.validatePlanStructure(
      plan,
      validatedAt,
      issues,
    );

    const buy =
      await this.validateLeg(
        plan.buy,
        "BUY",
        validationMode,
      );

    const sell =
      await this.validateLeg(
        plan.sell,
        "SELL",
        validationMode,
      );

    if (!buy.valid) {
      issues.push({
        code:
          this.resolveLegIssueCode(
            buy,
          ),

        leg:
          "BUY",

        message:
          buy.reasons.join(
            " | ",
          ),

        orderIssues:
          buy.orderIssues,
      });
    }

    if (!sell.valid) {
      issues.push({
        code:
          this.resolveLegIssueCode(
            sell,
          ),

        leg:
          "SELL",

        message:
          sell.reasons.join(
            " | ",
          ),

        orderIssues:
          sell.orderIssues,
      });
    }

    const reasons =
      issues.map(
        (issue) =>
          `${issue.leg}: ${issue.message}`,
      );

    return {
      valid:
        issues.length === 0,

      planId:
        plan.id,

      buy,

      sell,

      issues,

      reasons,

      validatedAt,
    };
  }

  private validatePlanStructure(
    plan:
      ExecutionPlan,

    now:
      number,

    issues:
      ExecutionPlanValidationIssue[],
  ): void {
    if (!plan.id.trim()) {
      issues.push({
        code:
          "INVALID_PLAN_ID",

        leg:
          "PLAN",

        message:
          "Execution plan ID is required.",
      });
    }

    const market =
      plan.market
        .trim()
        .toUpperCase();

    if (!market) {
      issues.push({
        code:
          "INVALID_MARKET",

        leg:
          "PLAN",

        message:
          "Execution plan market is required.",
      });
    }

    if (
      !Number.isFinite(
        plan.capital,
      ) ||
      plan.capital <= 0
    ) {
      issues.push({
        code:
          "INVALID_CAPITAL",

        leg:
          "PLAN",

        message:
          "Execution plan capital must be positive.",
      });
    }

    if (
      plan.status !==
      "READY"
    ) {
      issues.push({
        code:
          "INVALID_STATUS",

        leg:
          "PLAN",

        message:
          `Execution plan must be READY before execution. Current status: ${plan.status}.`,
      });
    }

    if (
      !Number.isSafeInteger(
        plan.createdAt,
      ) ||
      plan.createdAt <= 0
    ) {
      issues.push({
        code:
          "INVALID_CREATED_AT",

        leg:
          "PLAN",

        message:
          "Execution plan createdAt timestamp is invalid.",
      });
    }

    if (
      !Number.isSafeInteger(
        plan.timeoutMs,
      ) ||
      plan.timeoutMs <= 0
    ) {
      issues.push({
        code:
          "INVALID_TIMEOUT",

        leg:
          "PLAN",

        message:
          "Execution plan timeout must be a positive integer.",
      });
    }

    if (
      plan.expiresAt !==
      undefined
    ) {
      if (
        !Number.isSafeInteger(
          plan.expiresAt,
        ) ||
        plan.expiresAt <=
          plan.createdAt
      ) {
        issues.push({
          code:
            "INVALID_EXPIRATION",

          leg:
            "PLAN",

          message:
            "Execution plan expiration timestamp is invalid.",
        });
      } else if (
        now >
        plan.expiresAt
      ) {
        issues.push({
          code:
            "PLAN_EXPIRED",

          leg:
            "PLAN",

          message:
            `Execution plan expired ${now - plan.expiresAt} ms ago.`,
        });
      }
    } else if (
      Number.isSafeInteger(
        plan.createdAt,
      ) &&
      Number.isSafeInteger(
        plan.timeoutMs,
      ) &&
      now >
        plan.createdAt +
          plan.timeoutMs
    ) {
      issues.push({
        code:
          "PLAN_EXPIRED",

        leg:
          "PLAN",

        message:
          "Execution plan exceeded its execution timeout.",
      });
    }

    const buyExchange =
      plan.buy.exchange
        .trim()
        .toLowerCase();

    const sellExchange =
      plan.sell.exchange
        .trim()
        .toLowerCase();

    if (
      buyExchange &&
      sellExchange &&
      buyExchange ===
        sellExchange
    ) {
      issues.push({
        code:
          "SAME_EXCHANGE",

        leg:
          "PLAN",

        message:
          "Buy and sell execution legs must use different exchanges.",
      });
    }

    const buyMarket =
      plan.buy.market
        .trim()
        .toUpperCase();

    const sellMarket =
      plan.sell.market
        .trim()
        .toUpperCase();

    if (
      market &&
      (
        buyMarket !==
          market ||
        sellMarket !==
          market
      )
    ) {
      issues.push({
        code:
          "MARKET_MISMATCH",

        leg:
          "PLAN",

        message:
          "Execution leg markets must match the execution plan market.",
      });
    }

    if (
      !this.isStructurallyValidLeg(
        plan.buy,
        "BUY",
      )
    ) {
      issues.push({
        code:
          "INVALID_BUY_LEG",

        leg:
          "BUY",

        message:
          "Buy execution leg contains invalid execution data.",
      });
    }

    if (
      !this.isStructurallyValidLeg(
        plan.sell,
        "SELL",
      )
    ) {
      issues.push({
        code:
          "INVALID_SELL_LEG",

        leg:
          "SELL",

        message:
          "Sell execution leg contains invalid execution data.",
      });
    }
  }

  private async validateLeg(
    leg:
      ExecutionLeg,

    expectedSide:
      "BUY" | "SELL",

    validationMode:
      | "EXCHANGE_ORDER"
      | "ISOLATED_PAPER_SIMULATION",
  ): Promise<ExecutionPlanLegValidation> {
    const exchange =
      leg.exchange
        .trim()
        .toLowerCase();

    const market =
      leg.market
        .trim()
        .toUpperCase();

    if (
      !this.isStructurallyValidLeg(
        leg,
        expectedSide,
      )
    ) {
      return {
        valid:
          false,

        exchange,

        market,

        capability:
          null,

        orderIssues:
          [],

        reasons: [
          `${expectedSide} execution leg is structurally invalid.`,
        ],
      };
    }

    let capability:
      ExchangeMarketCapability | null =
      null;

    try {
      capability =
        await exchangeCapabilityService
          .getCapability({
            exchange,

            market,

            product:
              "spot",
          });
    } catch (
      error: unknown
    ) {
      return {
        valid:
          false,

        exchange,

        market,

        capability:
          null,

        orderIssues:
          [],

        reasons: [
          error instanceof Error
            ? `Capability lookup failed: ${error.message}`
            : "Capability lookup failed with an unknown error.",
        ],
      };
    }

    if (!capability) {
      return {
        valid:
          false,

        exchange,

        market,

        capability:
          null,

        orderIssues:
          [],

        reasons: [
          `No execution capability is available for ${exchange}:${market}.`,
        ],
      };
    }

    const orderType =
      leg.orderType ??
      "limit";

    const validation =
      exchangeOrderValidator.validate({
        exchange,

        market,

        product:
          "spot",

        side:
          expectedSide ===
          "BUY"
            ? "buy"
            : "sell",

        orderType,

        timeInForce:
          leg.timeInForce,

        quantity:
          leg.quantity,

        price:
          orderType ===
          "limit"
            ? leg.limitPrice
            : undefined,

        capability,

        validationMode,
      });

    return {
      valid:
        validation.valid,

      exchange,

      market,

      capability,

      orderIssues:
        validation.issues,

      reasons:
        validation.reasons,
    };
  }

  private isStructurallyValidLeg(
    leg:
      ExecutionLeg,

    expectedSide:
      "BUY" | "SELL",
  ): boolean {
    if (
      !leg.exchange.trim()
    ) {
      return false;
    }

    if (
      !leg.market.trim()
    ) {
      return false;
    }

    if (
      leg.side !==
      expectedSide
    ) {
      return false;
    }

    if (
      !Number.isFinite(
        leg.quantity,
      ) ||
      leg.quantity <= 0
    ) {
      return false;
    }

    const orderType =
      leg.orderType ??
      "limit";

    if (
      orderType ===
        "limit" &&
      (
        !Number.isFinite(
          leg.limitPrice,
        ) ||
        leg.limitPrice <= 0
      )
    ) {
      return false;
    }

    return true;
  }

  private resolveLegIssueCode(
    result:
      ExecutionPlanLegValidation,
  ): ExecutionPlanValidationCode {
    if (
      result.capability ===
      null
    ) {
      const capabilityLookupFailed =
        result.reasons.some(
          (reason) =>
            reason
              .toLowerCase()
              .includes(
                "lookup failed",
              ),
        );

      return capabilityLookupFailed
        ? "CAPABILITY_LOOKUP_FAILED"
        : "CAPABILITY_NOT_FOUND";
    }

    return "ORDER_VALIDATION_FAILED";
  }
}

export const executionPlanValidator =
  new ExecutionPlanValidator();
