import {
  getExchangeTakerFeePercent,
} from "../../../arbitrage/config/fees";

import {
  getStrategyOneTinyLiveCashCostProfile,
} from "../evidence/StrategyOneTinyLiveCashCostService";

import type {
  ArbitragePnLRecord,
  TakerFeeResolver,
} from "../history/ArbitragePnLReport";

/*
 * Daily realized-loss stop. Once today's realized net (IST calendar day)
 * reaches -limit, the live runner halts new attempts for the rest of that
 * day. The halt reason carries the IST day it was set on, so it lifts at
 * the next IST midnight; every other halt kind keeps its own release path.
 */
export const DAILY_LOSS_HALT_MARKER =
  "DAILY_LOSS_LIMIT";

const IST_OFFSET_MS =
  330 * 60_000;

/* Used only when no live USDT/INR quote exists: a high rate overstates a
 * USDT loss in rupees, so the stop can only trip earlier, never later. */
export const FALLBACK_USDT_INR_RATE =
  100;

export function loadDailyLossLimitInr(
  environment: NodeJS.ProcessEnv = process.env,
): number {
  const raw =
    environment.CAT_PRO_LIVE_DAILY_LOSS_LIMIT_INR?.trim();
  const value =
    raw ? Number(raw) : 500;

  if (!Number.isFinite(value) || value <= 0 || value > 5_000) {
    throw new Error(
      "CAT_PRO_LIVE_DAILY_LOSS_LIMIT_INR must be a positive rupee amount up to ₹5,000.",
    );
  }

  return value;
}

export function istDayKey(
  timestamp: number,
): string {
  return new Date(timestamp + IST_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
}

export function dailyLossHaltReason(
  day: string,
  realizedNetInr: number,
  limitInr: number,
): string {
  return `${DAILY_LOSS_HALT_MARKER}[${day}]: realized net ₹${realizedNetInr.toFixed(2)} today reached the -₹${limitInr} daily loss stop. New live attempts resume after IST midnight.`;
}

/* Returns the IST day a daily-loss halt was set on, or null for any other halt. */
export function dailyLossHaltDay(
  haltedReason: string | null,
): string | null {
  const match =
    haltedReason?.match(/^DAILY_LOSS_LIMIT\[(\d{4}-\d{2}-\d{2})\]/);
  return match ? match[1] : null;
}

export function realizedNetInrForIstDay(
  records: readonly ArbitragePnLRecord[],
  now: number,
  usdtInrRate: number | null,
): number {
  const day =
    istDayKey(now);
  const rate =
    usdtInrRate !== null && Number.isFinite(usdtInrRate) && usdtInrRate > 0
      ? usdtInrRate
      : FALLBACK_USDT_INR_RATE;

  let total = 0;

  for (const record of records) {
    if (
      record.status !== "COMPLETED" ||
      !Number.isFinite(record.netProfit) ||
      istDayKey(record.completedAt) !== day
    ) {
      continue;
    }

    total +=
      record.market.toUpperCase().endsWith("INR")
        ? record.netProfit
        : record.netProfit * rate;
  }

  return total;
}

/* Taker fee including the venue's GST-style surcharge, as the P&L report prices it. */
export const takerFeeWithSurcharge: TakerFeeResolver = (
  exchange,
  market,
  side,
) => {
  const fee =
    getExchangeTakerFeePercent(exchange, market);

  if (fee === null) {
    return null;
  }

  try {
    return fee *
      (1 +
        getStrategyOneTinyLiveCashCostProfile(exchange, market, side)
          .tradingFeeSurchargeMultiplier);
  } catch {
    return fee;
  }
};

/* Mid of the strongest two-sided USDT/INR quote the scanner is using, if any. */
export function usdtInrMid(
  conversion: ReadonlyArray<{
    readonly bid: number | null;
    readonly ask: number | null;
  }>,
): number | null {
  for (const quote of conversion) {
    if (
      quote.bid !== null &&
      quote.ask !== null &&
      quote.bid > 0 &&
      quote.ask >= quote.bid
    ) {
      return (quote.bid + quote.ask) / 2;
    }
  }

  return null;
}
