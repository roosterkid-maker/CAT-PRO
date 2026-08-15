import type {
  ArbitrageOpportunity,
} from "../models/ArbitrageOpportunity";

import {
  liveExecutionService,
} from "../../execution/live/LiveExecutionService";

import type {
  LiveExecutionRequest,
} from "../../execution/live/models/LiveExecutionRequest";

import {
  arbitragePnLService,
} from "../metrics/ArbitragePnLService";

import type {
  ArbitrageLiveExecutionResult,
} from "./models/ArbitrageLiveExecutionResult";

const LIVE_CONFIRMATION =
  "ENABLE_CONFIRMED_ARBITRAGE_EXECUTION";

export interface ArbitrageExecutionOptions {
  timeoutMs?: number;

  pollingIntervalMs?: number;

  cancelOnTimeout?: boolean;
}

export class ArbitrageExecutionCoordinator {
  async execute(
    opportunity: ArbitrageOpportunity,
    options:
      ArbitrageExecutionOptions = {},
  ): Promise<ArbitrageLiveExecutionResult> {
    const startedAt =
      Date.now();

    const preflightReasons =
      this.validateOpportunity(
        opportunity,
      );

    const buyExchange =
      opportunity.pair.buy.exchange
        .trim()
        .toLowerCase();

    const sellExchange =
      opportunity.pair.sell.exchange
        .trim()
        .toLowerCase();

    if (
      !liveExecutionService.hasAdapter(
        buyExchange,
      )
    ) {
      preflightReasons.push(
        `Live execution adapter is missing for buy exchange: ${buyExchange}.`,
      );
    }

    if (
      !liveExecutionService.hasAdapter(
        sellExchange,
      )
    ) {
      preflightReasons.push(
        `Live execution adapter is missing for sell exchange: ${sellExchange}.`,
      );
    }

    if (
      process.env
        .ARBITRAGE_LIVE_CONFIRMATION
        ?.trim() !==
      LIVE_CONFIRMATION
    ) {
      preflightReasons.push(
        "Explicit arbitrage live-execution confirmation is missing.",
      );
    }

    if (
      preflightReasons.length >
      0
    ) {
      return this.createBlockedResult(
        opportunity,
        buyExchange,
        sellExchange,
        startedAt,
        preflightReasons,
      );
    }

    const buyAdapter =
      liveExecutionService.getAdapter(
        buyExchange,
      );

    const sellAdapter =
      liveExecutionService.getAdapter(
        sellExchange,
      );

    const buyAdapterStatus =
      liveExecutionService
        .getExchangeStatus(
          buyExchange,
        );

    const sellAdapterStatus =
      liveExecutionService
        .getExchangeStatus(
          sellExchange,
        );

    if (
      !buyAdapterStatus
        .adapterConnected
    ) {
      preflightReasons.push(
        `Buy exchange LIVE execution availability is blocked: ${buyExchange} (liveEnabled=${buyAdapterStatus.liveExecutionEnabled}, verification=${buyAdapterStatus.verificationState}).`,
      );
    }

    if (
      !sellAdapterStatus
        .adapterConnected
    ) {
      preflightReasons.push(
        `Sell exchange LIVE execution availability is blocked: ${sellExchange} (liveEnabled=${sellAdapterStatus.liveExecutionEnabled}, verification=${sellAdapterStatus.verificationState}).`,
      );
    }

    if (
      preflightReasons.length >
      0
    ) {
      return this.createBlockedResult(
        opportunity,
        buyExchange,
        sellExchange,
        startedAt,
        preflightReasons,
      );
    }

    const quantity =
      opportunity.executableQty;

    const executionSuffix =
      `${opportunity.id}-${Date.now()}`;

    const commonOptions = {
      timeoutMs:
        options.timeoutMs ??
        10_000,

      pollingIntervalMs:
        options.pollingIntervalMs ??
        1_000,

      cancelOnTimeout:
        options.cancelOnTimeout ??
        true,
    };

    const buyRequest:
      LiveExecutionRequest = {
      exchange:
        buyExchange,

      market:
        opportunity.pair.market,

      side:
        "buy",

      orderType:
        "limit",

      quantity,

      price:
        opportunity.buyPrice,

      clientOrderId:
        this.createClientOrderId(
          "arb-buy",
          executionSuffix,
        ),

      ...commonOptions,
    };

    const sellRequest:
      LiveExecutionRequest = {
      exchange:
        sellExchange,

      market:
        opportunity.pair.market,

      side:
        "sell",

      orderType:
        "limit",

      quantity,

      price:
        opportunity.sellPrice,

      clientOrderId:
        this.createClientOrderId(
          "arb-sell",
          executionSuffix,
        ),

      ...commonOptions,
    };

    /*
     * Cross-exchange spot arbitrage assumes balances
     * are already pre-positioned on both exchanges.
     *
     * Both legs are submitted concurrently to reduce
     * directional exposure. Execution is not atomic:
     * either leg can still fail or partially fill.
     */
    const [
      buySettlement,
      sellSettlement,
    ] =
      await Promise.allSettled([
        buyAdapter.execute(
          buyRequest,
        ),

        sellAdapter.execute(
          sellRequest,
        ),
      ]);

    const buyResult =
      buySettlement.status ===
      "fulfilled"
        ? buySettlement.value
        : null;

    const sellResult =
      sellSettlement.status ===
      "fulfilled"
        ? sellSettlement.value
        : null;

    const reasons:
      string[] = [];

    if (
      buySettlement.status ===
      "rejected"
    ) {
      reasons.push(
        this.getErrorMessage(
          "Buy leg failed",
          buySettlement.reason,
        ),
      );
    }

    if (
      sellSettlement.status ===
      "rejected"
    ) {
      reasons.push(
        this.getErrorMessage(
          "Sell leg failed",
          sellSettlement.reason,
        ),
      );
    }

    if (
      buyResult?.failureReason
    ) {
      reasons.push(
        `Buy leg: ${buyResult.failureReason}`,
      );
    }

    if (
      sellResult?.failureReason
    ) {
      reasons.push(
        `Sell leg: ${sellResult.failureReason}`,
      );
    }

    const buyFilledQuantity =
      this.toNonNegativeNumber(
        buyResult?.filledQuantity ??
        0,
      );

    const sellFilledQuantity =
      this.toNonNegativeNumber(
        sellResult?.filledQuantity ??
        0,
      );

    const matchedFilledQuantity =
      Math.min(
        buyFilledQuantity,
        sellFilledQuantity,
      );

    const unmatchedBuyQuantity =
      Math.max(
        0,
        buyFilledQuantity -
          sellFilledQuantity,
      );

    const unmatchedSellQuantity =
      Math.max(
        0,
        sellFilledQuantity -
          buyFilledQuantity,
      );

    const recoveryRequired =
      unmatchedBuyQuantity > 0 ||
      unmatchedSellQuantity > 0;

    const bothFilled =
      buyResult?.status ===
        "FILLED" &&
      sellResult?.status ===
        "FILLED" &&
      !recoveryRequired;

    const anyFill =
      buyFilledQuantity > 0 ||
      sellFilledQuantity > 0;

    if (recoveryRequired) {
      reasons.push(
        "Buy and sell filled quantities do not match. Manual or automated hedge recovery is required.",
      );
    }

    if (
      !buyResult ||
      !sellResult
    ) {
      reasons.push(
        "One or more execution legs did not return a result.",
      );
    }

    if (
      buyResult &&
      buyResult.status !==
        "FILLED" &&
      !buyResult.failureReason
    ) {
      reasons.push(
        `Buy leg ended with status ${buyResult.status}.`,
      );
    }

    if (
      sellResult &&
      sellResult.status !==
        "FILLED" &&
      !sellResult.failureReason
    ) {
      reasons.push(
        `Sell leg ended with status ${sellResult.status}.`,
      );
    }

    const completedAt =
      Date.now();

    const executionResult:
      ArbitrageLiveExecutionResult = {
      success:
        bothFilled,

      status:
        bothFilled
          ? "COMPLETED"
          : recoveryRequired
            ? "RECOVERY_REQUIRED"
            : anyFill
              ? "PARTIALLY_COMPLETED"
              : "FAILED",

      opportunityId:
        opportunity.id,

      market:
        opportunity.pair.market,

      requestedQuantity:
        quantity,

      buyExchange,

      sellExchange,

      buyResult,

      sellResult,

      matchedFilledQuantity,

      unmatchedBuyQuantity,

      unmatchedSellQuantity,

      startedAt,

      completedAt,

      executionTimeMs:
        completedAt -
        startedAt,

      recoveryRequired,

      reasons: [
        ...new Set(
          reasons,
        ),
      ],
    };

    /*
     * P&L service records only results where both
     * execution-leg results are available.
     */
    arbitragePnLService.record(
  executionResult,
  {
    persist:
      true,
  },
);

    return executionResult;
  }

  private validateOpportunity(
    opportunity: ArbitrageOpportunity,
  ): string[] {
    const reasons:
      string[] = [];

    if (
      opportunity.decision !==
      "EXECUTE"
    ) {
      reasons.push(
        `Opportunity decision is ${opportunity.decision}, not EXECUTE.`,
      );
    }

    if (
      !opportunity.quotesAreFresh
    ) {
      reasons.push(
        "Opportunity quotes are not fresh.",
      );
    }

    if (
      !opportunity.enoughLiquidity
    ) {
      reasons.push(
        "Opportunity does not have enough liquidity.",
      );
    }

    if (
      !Number.isFinite(
        opportunity.executableQty,
      ) ||
      opportunity.executableQty <=
        0
    ) {
      reasons.push(
        "Executable quantity must be positive.",
      );
    }

    if (
      !Number.isFinite(
        opportunity.buyPrice,
      ) ||
      opportunity.buyPrice <=
        0
    ) {
      reasons.push(
        "Buy price is invalid.",
      );
    }

    if (
      !Number.isFinite(
        opportunity.sellPrice,
      ) ||
      opportunity.sellPrice <=
        0
    ) {
      reasons.push(
        "Sell price is invalid.",
      );
    }

    if (
      opportunity.sellPrice <=
      opportunity.buyPrice
    ) {
      reasons.push(
        "Sell price must exceed buy price.",
      );
    }

    if (
      !Number.isFinite(
        opportunity.netProfit,
      ) ||
      opportunity.netProfit <=
        0 ||
      !Number.isFinite(
        opportunity.netProfitPercent,
      ) ||
      opportunity.netProfitPercent <=
        0
    ) {
      reasons.push(
        "Opportunity does not contain positive net profit.",
      );
    }

    const buyExchange =
      opportunity.pair.buy.exchange
        .trim()
        .toLowerCase();

    const sellExchange =
      opportunity.pair.sell.exchange
        .trim()
        .toLowerCase();

    if (
      !buyExchange ||
      !sellExchange
    ) {
      reasons.push(
        "Buy and sell exchanges are required.",
      );
    }

    if (
      buyExchange ===
      sellExchange
    ) {
      reasons.push(
        "Cross-exchange arbitrage requires two different exchanges.",
      );
    }

    return reasons;
  }

  private createBlockedResult(
    opportunity:
      ArbitrageOpportunity,
    buyExchange: string,
    sellExchange: string,
    startedAt: number,
    reasons: string[],
  ): ArbitrageLiveExecutionResult {
    const completedAt =
      Date.now();

    return {
      success:
        false,

      status:
        "BLOCKED",

      opportunityId:
        opportunity.id,

      market:
        opportunity.pair.market,

      requestedQuantity:
        opportunity.executableQty,

      buyExchange,

      sellExchange,

      buyResult:
        null,

      sellResult:
        null,

      matchedFilledQuantity:
        0,

      unmatchedBuyQuantity:
        0,

      unmatchedSellQuantity:
        0,

      startedAt,

      completedAt,

      executionTimeMs:
        completedAt -
        startedAt,

      recoveryRequired:
        false,

      reasons: [
        ...new Set(
          reasons,
        ),
      ],
    };
  }

  private createClientOrderId(
    prefix: string,
    suffix: string,
  ): string {
    /*
     * Binance client-order IDs allow at most 36
     * characters. Keep IDs compact and unique.
     */
    const normalizedPrefix =
      prefix
        .replace(
          /[^a-zA-Z0-9_-]/g,
          "",
        )
        .slice(
          0,
          10,
        );

    const compactSuffix =
      suffix
        .replace(
          /[^a-zA-Z0-9_-]/g,
          "",
        )
        .slice(
          -24,
        );

    return `${normalizedPrefix}-${compactSuffix}`
      .slice(
        0,
        36,
      );
  }

  private toNonNegativeNumber(
    value: number,
  ): number {
    return (
      Number.isFinite(value) &&
      value >= 0
    )
      ? value
      : 0;
  }

  private getErrorMessage(
    prefix: string,
    error: unknown,
  ): string {
    return error instanceof Error
      ? `${prefix}: ${error.message}`
      : `${prefix}: unknown error.`;
  }
}

export const arbitrageExecutionCoordinator =
  new ArbitrageExecutionCoordinator();
