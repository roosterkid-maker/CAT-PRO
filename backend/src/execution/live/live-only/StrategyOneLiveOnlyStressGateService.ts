import type {
  ArbitrageOpportunity,
} from "../../../arbitrage/models/ArbitrageOpportunity";

import {
  getExchangeTakerFeePercent,
} from "../../../arbitrage/config/fees";

import {
  STRATEGY_ONE_LIVE_DISPATCH_RESERVED_MAXIMUM_BOOK_AGE_MS,
  STRATEGY_ONE_LIVE_MAXIMUM_BOOK_SKEW_MS,
} from "../../../arbitrage/execution/StrategyOneLiveTimingPolicy";

import {
  orderBookService,
} from "../../../orderbook/services/OrderBookService";

import {
  vwapCalculator,
} from "../../../orderbook/calculators/VWAPCalculator";

import {
  getStrategyOneTinyLiveCashCostProfile,
} from "../evidence/StrategyOneTinyLiveCashCostService";

const ADVERSE_MOVE_RESERVE_PERCENT_PER_LEG =
  0.02;

const SAFETY_BUFFER_PERCENT =
  0.05;

export interface StrategyOneLiveOnlyStressReport {
  readonly schemaVersion: "1.0";
  readonly evaluatedAt: number;
  readonly status: "PASSED" | "BLOCKED";
  readonly quantity: number;
  readonly buyBookAgeMs: number | null;
  readonly sellBookAgeMs: number | null;
  readonly bookSkewMs: number | null;
  readonly buyFillPercent: number | null;
  readonly sellFillPercent: number | null;
  readonly buyVwap: number | null;
  readonly sellVwap: number | null;
  readonly tradingFees: number | null;
  readonly statutoryCashWithholding: number | null;
  readonly safetyBuffer: number | null;
  readonly postStressNetProfit: number | null;
  readonly postStressNetProfitPercent: number | null;
  readonly deployableCashPostStressNetProfit: number | null;
  readonly deployableCashPostStressNetProfitPercent: number | null;
  readonly minimumNetProfitPercent: number;
  readonly adverseMoveReservePercentPerLeg: number;
  readonly safetyBufferPercent: number;
  readonly cashCostEvidenceIds: readonly string[];
  readonly reasons: readonly string[];
}

/**
 * Current-book LIVE economics gate.  It intentionally has no dependency on
 * PAPER execution, PAPER accounting or historical evidence services.
 */
export class StrategyOneLiveOnlyStressGateService {
  evaluate(input: {
    readonly opportunity: ArbitrageOpportunity;
    readonly quantity: number;
    readonly minimumNetProfitPercent: number;
    readonly now?: number;
  }): StrategyOneLiveOnlyStressReport {
    const now =
      input.now ??
      Date.now();
    const reasons:
      string[] =
      [];
    const market =
      input.opportunity.pair.market
        .trim()
        .toUpperCase();
    const buyExchange =
      input.opportunity.pair.buy.exchange
        .trim()
        .toLowerCase();
    const sellExchange =
      input.opportunity.pair.sell.exchange
        .trim()
        .toLowerCase();

    if (
      !Number.isSafeInteger(now) ||
      now <= 0
    ) {
      throw new Error(
        "LIVE-only stress evaluation time must be a positive safe integer.",
      );
    }

    if (
      !Number.isFinite(input.quantity) ||
      input.quantity <= 0
    ) {
      reasons.push(
        "LIVE-only stress quantity must be positive.",
      );
    }

    if (
      !Number.isFinite(input.minimumNetProfitPercent) ||
      input.minimumNetProfitPercent < 0
    ) {
      throw new Error(
        "LIVE-only post-stress minimum must be a non-negative finite percentage.",
      );
    }

    const buyBook =
      orderBookService.get(
        buyExchange,
        market,
      );
    const sellBook =
      orderBookService.get(
        sellExchange,
        market,
      );
    const buyBookAgeMs =
      buyBook
        ? now - buyBook.timestamp
        : null;
    const sellBookAgeMs =
      sellBook
        ? now - sellBook.timestamp
        : null;
    const bookSkewMs =
      buyBook && sellBook
        ? Math.abs(
            buyBook.timestamp -
              sellBook.timestamp,
          )
        : null;

    this.validateBook(
      "BUY",
      buyBookAgeMs,
      reasons,
    );
    this.validateBook(
      "SELL",
      sellBookAgeMs,
      reasons,
    );

    if (
      bookSkewMs === null ||
      !Number.isSafeInteger(bookSkewMs) ||
      bookSkewMs >
        STRATEGY_ONE_LIVE_MAXIMUM_BOOK_SKEW_MS
    ) {
      reasons.push(
        `LIVE-only books exceed the ${STRATEGY_ONE_LIVE_MAXIMUM_BOOK_SKEW_MS} ms timestamp-skew ceiling.`,
      );
    }

    let buyFillPercent:
      number | null =
      null;
    let sellFillPercent:
      number | null =
      null;
    let buyVwap:
      number | null =
      null;
    let sellVwap:
      number | null =
      null;
    let tradingFees:
      number | null =
      null;
    let statutoryCashWithholding:
      number | null =
      null;
    let safetyBuffer:
      number | null =
      null;
    let postStressNetProfit:
      number | null =
      null;
    let postStressNetProfitPercent:
      number | null =
      null;
    let deployableCashPostStressNetProfit:
      number | null =
      null;
    let deployableCashPostStressNetProfitPercent:
      number | null =
      null;
    const cashCostEvidenceIds:
      string[] =
      [];

    if (
      buyBook &&
      sellBook &&
      Number.isFinite(input.quantity) &&
      input.quantity > 0
    ) {
      try {
        const buyWalk =
          vwapCalculator.calculate(
            buyBook.asks,
            input.quantity,
          );
        const sellWalk =
          vwapCalculator.calculate(
            sellBook.bids,
            input.quantity,
          );
        const tolerance =
          Math.max(
            1e-12,
            input.quantity * 1e-9,
          );

        buyFillPercent =
          buyWalk.fillPercent;
        sellFillPercent =
          sellWalk.fillPercent;
        buyVwap =
          buyWalk.averagePrice;
        sellVwap =
          sellWalk.averagePrice;

        if (
          buyWalk.filledQuantity <
            input.quantity - tolerance
        ) {
          reasons.push(
            `LIVE-only BUY depth is partial (${buyWalk.fillPercent.toFixed(2)}%).`,
          );
        }

        if (
          sellWalk.filledQuantity <
            input.quantity - tolerance
        ) {
          reasons.push(
            `LIVE-only SELL depth is partial (${sellWalk.fillPercent.toFixed(2)}%).`,
          );
        }

        const buyFeePercent =
          getExchangeTakerFeePercent(
            buyExchange,
            market,
            now,
          );
        const sellFeePercent =
          getExchangeTakerFeePercent(
            sellExchange,
            market,
            now,
          );

        if (
          buyFeePercent === null ||
          sellFeePercent === null ||
          !Number.isFinite(buyFeePercent) ||
          !Number.isFinite(sellFeePercent) ||
          buyFeePercent < 0 ||
          sellFeePercent < 0
        ) {
          reasons.push(
            "LIVE-only taker-fee evidence is unavailable or invalid.",
          );
        } else if (
          !Number.isFinite(buyWalk.totalCost) ||
          !Number.isFinite(sellWalk.totalCost) ||
          buyWalk.totalCost <= 0 ||
          sellWalk.totalCost <= 0
        ) {
          reasons.push(
            "LIVE-only exact-depth notionals are invalid.",
          );
        } else {
          const adverseRatio =
            ADVERSE_MOVE_RESERVE_PERCENT_PER_LEG /
            100;
          const stressedBuyNotional =
            buyWalk.totalCost *
            (1 + adverseRatio);
          const stressedSellNotional =
            sellWalk.totalCost *
            (1 - adverseRatio);
          const buyCashCost =
            getStrategyOneTinyLiveCashCostProfile(
              buyExchange,
              market,
              "BUY",
            );
          const sellCashCost =
            getStrategyOneTinyLiveCashCostProfile(
              sellExchange,
              market,
              "SELL",
            );

          cashCostEvidenceIds.push(
            buyCashCost.evidenceId,
            sellCashCost.evidenceId,
          );
          tradingFees =
            stressedBuyNotional *
              (buyFeePercent / 100) *
              (1 + buyCashCost.tradingFeeSurchargeMultiplier) +
            stressedSellNotional *
              (sellFeePercent / 100) *
              (1 + sellCashCost.tradingFeeSurchargeMultiplier);
          statutoryCashWithholding =
            stressedBuyNotional *
              (buyCashCost.withholdingPercent / 100) +
            stressedSellNotional *
              (sellCashCost.withholdingPercent / 100);
          safetyBuffer =
            stressedBuyNotional *
            (SAFETY_BUFFER_PERCENT / 100);
          postStressNetProfit =
            stressedSellNotional -
            stressedBuyNotional -
            tradingFees -
            safetyBuffer;
          postStressNetProfitPercent =
            (postStressNetProfit /
              stressedBuyNotional) *
            100;
          deployableCashPostStressNetProfit =
            postStressNetProfit -
            statutoryCashWithholding;
          deployableCashPostStressNetProfitPercent =
            (deployableCashPostStressNetProfit /
              stressedBuyNotional) *
            100;

          if (
            !Number.isFinite(postStressNetProfitPercent) ||
            postStressNetProfitPercent + 1e-12 <
              input.minimumNetProfitPercent
          ) {
            reasons.push(
              `LIVE-only post-stress economic net ${Number.isFinite(postStressNetProfitPercent) ? `${postStressNetProfitPercent.toFixed(4)}%` : "invalid"} is below ${input.minimumNetProfitPercent.toFixed(4)}%.`,
            );
          }
        }
      } catch (
        error:
          unknown
      ) {
        reasons.push(
          error instanceof Error
            ? `LIVE-only exact-depth stress failed: ${error.message}`
            : "LIVE-only exact-depth stress failed.",
        );
      }
    }

    const passed =
      reasons.length === 0 &&
      buyFillPercent !== null &&
      sellFillPercent !== null &&
      buyVwap !== null &&
      sellVwap !== null &&
      tradingFees !== null &&
      statutoryCashWithholding !== null &&
      safetyBuffer !== null &&
      postStressNetProfit !== null &&
      postStressNetProfitPercent !== null &&
      deployableCashPostStressNetProfit !== null &&
      deployableCashPostStressNetProfitPercent !== null;

    return Object.freeze({
      schemaVersion:
        "1.0" as const,
      evaluatedAt:
        now,
      status:
        passed
          ? "PASSED" as const
          : "BLOCKED" as const,
      quantity:
        input.quantity,
      buyBookAgeMs,
      sellBookAgeMs,
      bookSkewMs,
      buyFillPercent,
      sellFillPercent,
      buyVwap,
      sellVwap,
      tradingFees,
      statutoryCashWithholding,
      safetyBuffer,
      postStressNetProfit,
      postStressNetProfitPercent,
      deployableCashPostStressNetProfit,
      deployableCashPostStressNetProfitPercent,
      minimumNetProfitPercent:
        input.minimumNetProfitPercent,
      adverseMoveReservePercentPerLeg:
        ADVERSE_MOVE_RESERVE_PERCENT_PER_LEG,
      safetyBufferPercent:
        SAFETY_BUFFER_PERCENT,
      cashCostEvidenceIds:
        Object.freeze([
          ...cashCostEvidenceIds,
        ]),
      reasons:
        Object.freeze(
          passed
            ? [
                `Exact current depth retains ${postStressNetProfitPercent?.toFixed(4)}% economic net after fees, adverse-move reserve and safety buffer.`,
              ]
            : [
                ...new Set(reasons),
              ],
        ),
    });
  }

  private validateBook(
    side: "BUY" | "SELL",
    ageMs: number | null,
    reasons: string[],
  ): void {
    if (
      ageMs === null ||
      !Number.isSafeInteger(ageMs) ||
      ageMs < 0 ||
      ageMs >
        STRATEGY_ONE_LIVE_DISPATCH_RESERVED_MAXIMUM_BOOK_AGE_MS
    ) {
      reasons.push(
        `LIVE-only ${side} book is unavailable or older than ${STRATEGY_ONE_LIVE_DISPATCH_RESERVED_MAXIMUM_BOOK_AGE_MS} ms (age=${ageMs ?? "unavailable"}).`,
      );
    }
  }
}

export const strategyOneLiveOnlyStressGateService =
  new StrategyOneLiveOnlyStressGateService();
