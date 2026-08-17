import { randomUUID } from "node:crypto";
import { defaultArbitragePolicy } from "./config/policy";

import {
  exchangeCapabilityService,
} from "../execution/capabilities/services/ExchangeCapabilityService";

import {
  centralPaperCapitalValuationService,
} from "../strategies/services/CentralPaperCapitalValuationService";

import type { ArbitrageOpportunity } from "./models/ArbitrageOpportunity";
import type { ExchangePair } from "./models/ExchangePair";

export class SpreadEngine {
  calculate(
    pair: ExchangePair,
  ): ArbitrageOpportunity | null {
    const buyPrice =
      pair.buy.bestAskPrice;

    const sellPrice =
      pair.sell.bestBidPrice;

    const buyAvailableQty =
      pair.buy.bestAskQty;

    const sellAvailableQty =
      pair.sell.bestBidQty;

    if (
      !pair.buy.executable ||
      !pair.sell.executable ||
      buyPrice === null ||
      sellPrice === null ||
      buyAvailableQty === null ||
      sellAvailableQty === null ||
      !Number.isFinite(buyPrice) ||
      !Number.isFinite(sellPrice) ||
      !Number.isFinite(buyAvailableQty) ||
      !Number.isFinite(sellAvailableQty) ||
      buyPrice <= 0 ||
      sellPrice <= 0 ||
      buyAvailableQty <= 0 ||
      sellAvailableQty <= 0
    ) {
      return null;
    }

    const rawSpread =
      sellPrice - buyPrice;

    if (rawSpread <= 0) {
      return null;
    }

    const rawSpreadPercent =
      (rawSpread / buyPrice) * 100;

    const buyCapability =
      exchangeCapabilityService
        .getCachedCapability(
          pair.buy.exchange,
          pair.market,
          "spot",
        );

    const sellCapability =
      exchangeCapabilityService
        .getCachedCapability(
          pair.sell.exchange,
          pair.market,
          "spot",
        );

    const quoteAsset =
      buyCapability?.quoteAsset
        .trim()
        .toUpperCase() ??
      null;

    if (
      !quoteAsset ||
      sellCapability?.quoteAsset
        .trim()
        .toUpperCase() !==
        quoteAsset
    ) {
      return null;
    }

    const requestedCapitalInr =
      defaultArbitragePolicy.referenceCapital;

    const capitalConversion =
      centralPaperCapitalValuationService
        .convertInrToAsset(
          quoteAsset,
          requestedCapitalInr,
          `spread:${pair.market}:${pair.buy.exchange}:${pair.sell.exchange}`,
        );

    const requestedQuoteCapital =
      capitalConversion?.targetQuantity ??
      null;

    if (
      requestedQuoteCapital === null ||
      !Number.isFinite(
        requestedQuoteCapital,
      ) ||
      requestedQuoteCapital <=
        0
    ) {
      return null;
    }

    const requiredQty =
      requestedQuoteCapital /
      buyPrice;

    if (
      !Number.isFinite(requiredQty) ||
      requiredQty <= 0
    ) {
      return null;
    }

    const availableExecutableQty =
      Math.min(
        buyAvailableQty,
        sellAvailableQty,
      );

    if (
      !Number.isFinite(
        availableExecutableQty,
      ) ||
      availableExecutableQty <= 0
    ) {
      return null;
    }

    const executableQty =
      Math.min(
        requiredQty,
        availableExecutableQty,
      );

    const executableQuoteCapital =
      executableQty *
      buyPrice;

    const executableCapitalInr =
      requestedCapitalInr *
      (
        executableQuoteCapital /
        requestedQuoteCapital
      );

    const liquidityPercent =
      Math.min(
        100,
        (availableExecutableQty /
          requiredQty) *
          100,
      );

    const enoughLiquidity =
      liquidityPercent >=
      defaultArbitragePolicy
        .minimumLiquidityPercent;

    return {
      id: randomUUID(),
      pair,

      buyPrice,
      sellPrice,

      buyAvailableQty,
      sellAvailableQty,

      requestedCapitalInr,
      quoteAsset,
      requestedQuoteCapital,
      executableQuoteCapital,
      executableCapitalInr,

      requiredQty,
      availableExecutableQty,
      executableQty,

      liquidityScore:
        Math.round(
          Math.max(
            0,
            liquidityPercent,
          ),
        ),

      enoughLiquidity,
      freshnessScore: 0,
feeScore: 0,
spreadScore: 0,

decision: "SKIP",

analysisSummary: [],

      rawSpread,
      rawSpreadPercent,

      estimatedFees: 0,

      netProfit: rawSpread,
      netProfitPercent:
        rawSpreadPercent,

      usedLastPriceFallback: false,

      quotesAreFresh: true,

      score: 0,

      timestamp: Math.max(
        pair.buy.timestamp,
        pair.sell.timestamp,
      ),
    };
  }
}

export const spreadEngine =
  new SpreadEngine();
