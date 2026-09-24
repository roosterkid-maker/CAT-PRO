import type {
  ArbitragePnLRecord,
} from "./ArbitragePnLReport";

import type {
  InrRouteLegFill,
  InrRouteSession,
} from "../inr-routes/InrRouteSessionExecutor";

/*
 * One list of real live arbitrage trades, both legs side by side, from the
 * two live owners: Strategy #1 (USDT<->USDT paired executions) and the INR
 * route executor (USDT<->INR, INR<->INR sessions). Attempts where nothing
 * filled are left out; one-legged fills and unhedged remainders stay in,
 * flagged, because they are the ones that need attention.
 */
export type LiveTradeRoute = "USDT_USDT" | "INR_USDT" | "INR_INR";

export type LiveTradeStatus =
  | "COMPLETED"
  | "DUST_RESIDUAL"
  | "ONE_LEG_FILLED"
  | "RECOVERY_REQUIRED"
  | "POSSIBLE_EXPOSURE";

export interface LiveTradeLeg {
  readonly venue: string;
  readonly market: string;
  readonly averagePrice: number | null;
  readonly quantity: number | null;
}

export interface LiveTrade {
  readonly id: string;
  readonly at: number;
  readonly route: LiveTradeRoute;
  readonly coin: string;
  readonly status: LiveTradeStatus;
  readonly buy: LiveTradeLeg;
  readonly sell: LiveTradeLeg;
  readonly matchedQuantity: number;
  /** Buy-side notional in INR. */
  readonly notionalInr: number | null;
  readonly netInr: number | null;
  readonly netPercent: number | null;
  readonly residualQuantity: number;
}

export interface LiveTradesReport {
  readonly generatedAt: number;
  readonly trades: readonly LiveTrade[];
  readonly totals: {
    readonly trades: number;
    readonly completed: number;
    readonly needingAttention: number;
    readonly netInr: number;
  };
}

export function buildLiveTradesReport(input: {
  readonly strategyOne: readonly ArbitragePnLRecord[];
  readonly inrSessions: readonly InrRouteSession[];
  readonly usdtInrRate: number | null;
  readonly limit: number;
  readonly now: number;
}): LiveTradesReport {
  const rate = input.usdtInrRate !== null && input.usdtInrRate > 0 ? input.usdtInrRate : null;
  const trades: LiveTrade[] = [];

  for (const record of input.strategyOne) {
    if (record.status === "NOT_FILLED") continue;
    const coin = record.market.toUpperCase().replace(/USDT$/u, "");
    const notionalUsdt = record.matchedQuantity * record.buyAveragePrice;
    trades.push({
      id: `s1:${record.opportunityId}`,
      at: record.completedAt,
      route: "USDT_USDT",
      coin,
      status: record.status === "ONE_LEG_FILLED" ? "ONE_LEG_FILLED" : record.recoveryRequired ? "RECOVERY_REQUIRED" : "COMPLETED",
      buy: {venue: record.buyExchange, market: record.market, averagePrice: record.buyAveragePrice || null, quantity: record.matchedQuantity || null},
      sell: {venue: record.sellExchange, market: record.market, averagePrice: record.sellAveragePrice || null, quantity: record.matchedQuantity || null},
      matchedQuantity: record.matchedQuantity,
      notionalInr: rate !== null && notionalUsdt > 0 ? notionalUsdt * rate : null,
      netInr: rate !== null && record.status === "COMPLETED" ? record.netProfit * rate : null,
      netPercent: record.status === "COMPLETED" ? record.netProfitPercent : null,
      residualQuantity: 0,
    });
  }

  for (const session of input.inrSessions) {
    const status = sessionStatus(session);
    if (status === null) continue;
    const buyFills = session.primarySide === "buy" ? (session.primary ? [session.primary] : []) : session.hedges;
    const sellFills = session.primarySide === "sell" ? (session.primary ? [session.primary] : []) : session.hedges;
    const buy = aggregate(buyFills);
    const sell = aggregate(sellFills);
    const matched = Math.min(buy.quantity ?? 0, sell.quantity ?? 0);
    const notionalInr = buy.averagePrice !== null ? matched * buy.averagePrice * session.route.buyToInr : null;
    const netInr = session.realizedNetInr;
    trades.push({
      id: `inr:${session.sessionId}`,
      at: session.updatedAt,
      route: session.route.kind === "INR_INR" ? "INR_INR" : "INR_USDT",
      coin: session.route.coin,
      status,
      buy: {venue: session.route.buyVenue, market: session.route.buyVenueMarket, ...buy},
      sell: {venue: session.route.sellVenue, market: session.route.sellVenueMarket, ...sell},
      matchedQuantity: matched,
      notionalInr,
      netInr,
      netPercent: netInr !== null && notionalInr !== null && notionalInr > 0 ? (netInr / notionalInr) * 100 : null,
      residualQuantity: session.residualQuantity,
    });
  }

  trades.sort((first, second) => second.at - first.at);
  const shown = trades.slice(0, Math.max(1, input.limit));

  return {
    generatedAt: input.now,
    trades: shown,
    totals: {
      trades: shown.length,
      completed: shown.filter((trade) => trade.status === "COMPLETED" || trade.status === "DUST_RESIDUAL").length,
      needingAttention: shown.filter((trade) =>
        trade.status === "ONE_LEG_FILLED" || trade.status === "RECOVERY_REQUIRED" || trade.status === "POSSIBLE_EXPOSURE").length,
      netInr: shown.reduce((sum, trade) => sum + (trade.netInr ?? 0), 0),
    },
  };
}

function sessionStatus(session: InrRouteSession): LiveTradeStatus | null {
  switch (session.state) {
    case "COMPLETED":
    case "DUST_RESIDUAL":
    case "RECOVERY_REQUIRED":
    case "POSSIBLE_EXPOSURE":
      return session.state;
    case "PREPARED":
    case "PRIMARY_DISPATCHED":
    case "HEDGING":
      // Interrupted mid-attempt: orders may be live.
      return "POSSIBLE_EXPOSURE";
    default:
      return null;
  }
}

function aggregate(fills: readonly InrRouteLegFill[]): {averagePrice: number | null; quantity: number | null} {
  let quantity = 0;
  let notional = 0;
  for (const fill of fills) {
    if ((fill.filledQuantity ?? 0) > 0 && fill.averagePrice) {
      quantity += fill.filledQuantity as number;
      notional += (fill.filledQuantity as number) * fill.averagePrice;
    }
  }
  return quantity > 0 ? {averagePrice: notional / quantity, quantity} : {averagePrice: null, quantity: null};
}
