import crypto from "node:crypto";

import type {
  ExecutionPlan,
} from "../models/ExecutionPlan";

import type {
  ExecutionPlanningRequest,
} from "../models/ExecutionPlanningRequest";

import {
  strategyOneExecutionPolicyService,
} from "../policy/StrategyOneExecutionPolicyService";

export class ExecutionPlanner {
  createPlan(
    request:
      ExecutionPlanningRequest,
  ): ExecutionPlan {
    if (
      !request.decision.approved
    ) {
      throw new Error(
        "Trading decision is not approved.",
      );
    }

    this.validateRequest(
      request,
    );

    const createdAt =
      Date.now();

    const quantity =
      request.quantity;

    const quoteToAccountConversionRate =
      request.quoteToAccountConversionRate;

    const grossProfit =
      (
        request.sellPrice -
        request.buyPrice
      ) *
      quantity *
      quoteToAccountConversionRate;

    const grossProfitPercent =
      (
        (
          request.sellPrice -
          request.buyPrice
        ) /
        request.buyPrice
      ) *
      100;

    const expectedFeesQuote =
      request.expectedFees ??
      0;

    const expectedFees =
      expectedFeesQuote *
      quoteToAccountConversionRate;

    const expectedNetProfit =
      grossProfit -
      expectedFees;

    const expectedProfitCapital =
      request.reservationCapital;

    const expectedNetProfitPercent =
      expectedProfitCapital >
      0
        ? (
            expectedNetProfit /
            expectedProfitCapital
          ) *
          100
        : 0;

    const timeoutMs =
      request.timeoutMs ??
      3_000;

    const maximumSlippagePercent =
      request
        .maximumSlippagePercent ??
      0.05;

    const expiresAt =
      createdAt +
      timeoutMs;

    const activePolicy =
      strategyOneExecutionPolicyService
        .getActivePolicy();

    const basePlan = {
      version:
        1,

      policyIdentity: {
        policyId:
          activePolicy.policyId,

        revision:
          activePolicy.revision,

        policyHash:
          activePolicy.policyHash,
      },

      market:
        request.market
          .trim()
          .toUpperCase(),

      mode:
        request.mode ??
        "PAPER",

      strategy:
        request.strategy ??
        "PARALLEL",

      status:
        "READY" as const,

      capital:
        request.reservationCapital,

      expectedProfit:
        grossProfit,

      expectedProfitPercent:
        grossProfitPercent,

      expectedFees,

      expectedNetProfit,

      expectedNetProfitPercent,

      maximumSlippagePercent,

      expectedSlippagePercent:
        request
          .expectedSlippagePercent,

      riskScore:
        request.decision
          .riskScore,

      executionScore:
        request.decision
          .executionScore,

      timeoutMs,

      buy: {
        exchange:
          request.buyExchange
            .trim()
            .toLowerCase(),

        market:
          request.market
            .trim()
            .toUpperCase(),

        side:
          "BUY" as const,

        quantity,

        limitPrice:
          request.buyPrice,

        orderType:
          "limit" as const,

        baseAsset:
          request.baseAsset
            ?.trim()
            .toUpperCase(),

        quoteAsset:
          request.quoteAsset
            ?.trim()
            .toUpperCase(),

        balanceReservationAmount:
          quantity *
            request.buyPrice +
          expectedFeesQuote,
      },

      sell: {
        exchange:
          request.sellExchange
            .trim()
            .toLowerCase(),

        market:
          request.market
            .trim()
            .toUpperCase(),

        side:
          "SELL" as const,

        quantity,

        limitPrice:
          request.sellPrice,

        orderType:
          "limit" as const,

        baseAsset:
          request.baseAsset
            ?.trim()
            .toUpperCase(),

        quoteAsset:
          request.quoteAsset
            ?.trim()
            .toUpperCase(),

        balanceReservationAmount:
          quantity,
      },

      createdAt,

      expiresAt,

      opportunityTimestamp:
        request
          .opportunityTimestamp,
    };

    const validationHash =
      this.createValidationHash(
        basePlan,
      );

    return {
      id:
        crypto.randomUUID(),

      ...basePlan,

      validationHash,
    };
  }

  private validateRequest(
    request:
      ExecutionPlanningRequest,
  ): void {
    if (
      !request.market.trim()
    ) {
      throw new Error(
        "Execution plan requires a market.",
      );
    }

    if (
      !request.buyExchange
        .trim()
    ) {
      throw new Error(
        "Execution plan requires a buy exchange.",
      );
    }

    if (
      !request.sellExchange
        .trim()
    ) {
      throw new Error(
        "Execution plan requires a sell exchange.",
      );
    }

    if (
      !Number.isFinite(
        request.buyPrice,
      ) ||
      request.buyPrice <=
        0
    ) {
      throw new Error(
        "Execution plan buy price must be positive.",
      );
    }

    if (
      !Number.isFinite(
        request.sellPrice,
      ) ||
      request.sellPrice <=
        0
    ) {
      throw new Error(
        "Execution plan sell price must be positive.",
      );
    }

    if (
      !Number.isFinite(
        request.decision
          .allocatedCapital,
      ) ||
      request.decision
        .allocatedCapital <=
        0
    ) {
      throw new Error(
        "Execution plan requires positive allocated capital.",
      );
    }

    if (
      !Number.isFinite(
        request.quantity,
      ) ||
      request.quantity <=
        0
    ) {
      throw new Error(
        "Execution plan requires an explicitly converted positive quantity.",
      );
    }

    if (
      !Number.isFinite(
        request.reservationCapital,
      ) ||
      request.reservationCapital <=
        0
    ) {
      throw new Error(
        "Execution plan requires explicit positive account-currency reservation capital.",
      );
    }

    if (
      !Number.isFinite(
        request.quoteToAccountConversionRate,
      ) ||
      request.quoteToAccountConversionRate <=
        0
    ) {
      throw new Error(
        "Execution plan requires an explicit positive quote-to-account conversion rate.",
      );
    }

    if (
      request.expectedFees !==
        undefined &&
      (
        !Number.isFinite(
          request.expectedFees,
        ) ||
        request.expectedFees <
          0
      )
    ) {
      throw new Error(
        "Expected execution fees must be finite and non-negative.",
      );
    }

    if (
      request.timeoutMs !==
        undefined &&
      (
        !Number.isSafeInteger(
          request.timeoutMs,
        ) ||
        request.timeoutMs <=
          0
      )
    ) {
      throw new Error(
        "Execution timeout must be a positive integer.",
      );
    }

    if (
      request
        .maximumSlippagePercent !==
        undefined &&
      (
        !Number.isFinite(
          request
            .maximumSlippagePercent,
        ) ||
        request
          .maximumSlippagePercent <
          0
      )
    ) {
      throw new Error(
        "Maximum slippage percent must be finite and non-negative.",
      );
    }

    if (
      request
        .expectedSlippagePercent !==
        undefined &&
      (
        !Number.isFinite(
          request
            .expectedSlippagePercent,
        ) ||
        request
          .expectedSlippagePercent <
          0
      )
    ) {
      throw new Error(
        "Expected slippage percent must be finite and non-negative.",
      );
    }

    if (
      request
        .opportunityTimestamp !==
        undefined &&
      (
        !Number.isSafeInteger(
          request
            .opportunityTimestamp,
        ) ||
        request
          .opportunityTimestamp <=
          0
      )
    ) {
      throw new Error(
        "Opportunity timestamp must be a positive integer.",
      );
    }
  }

  private createValidationHash(
    plan: {
      version: number;

      policyIdentity: {
        policyId: string;

        revision: number;

        policyHash: string;
      };

      market: string;

      mode: string;

      strategy: string;

      capital: number;

      expectedProfit: number;

      expectedProfitPercent: number;

      expectedFees: number;

      expectedNetProfit: number;

      expectedNetProfitPercent: number;

      maximumSlippagePercent: number;

      expectedSlippagePercent?:
        number;

      riskScore?:
        number;

      executionScore?:
        number;

      timeoutMs: number;

      buy: {
        exchange: string;

        market: string;

        side: string;

        quantity: number;

        limitPrice: number;

        orderType:
          string;

        baseAsset?:
          string;

        quoteAsset?:
          string;

        balanceReservationAmount?:
          number;
      };

      sell: {
        exchange: string;

        market: string;

        side: string;

        quantity: number;

        limitPrice: number;

        orderType:
          string;

        baseAsset?:
          string;

        quoteAsset?:
          string;

        balanceReservationAmount?:
          number;
      };

      createdAt: number;

      expiresAt: number;

      opportunityTimestamp?:
        number;
    },
  ): string {
    const payload =
      JSON.stringify(
        plan,
      );

    return crypto
      .createHash(
        "sha256",
      )
      .update(
        payload,
      )
      .digest(
        "hex",
      );
  }
}

export const executionPlanner =
  new ExecutionPlanner();
