import type {
  ExecutionHistoryItem,
} from "./ExecutionHistoryService";

/*
 * Realized arbitrage P&L from the live order history.
 *
 * Each arbitrage attempt submits two legs whose client order ids share a
 * suffix (`arb-buy-<id>` / `arb-sell-<id>`). A cycle is COMPLETED when both
 * legs filled; gross = matched quantity x (sell - buy average fill). Venue
 * fee lines come back in mixed assets (base coin on some venues, quote on
 * others), so fees are estimated at each venue's taker rate (with GST
 * surcharge) on the filled notional instead of summing raw fee amounts.
 * A cycle where only one leg filled needs recovery and carries no P&L.
 */

export interface ArbitragePnLRecord {
  readonly opportunityId: string;
  readonly market: string;
  readonly buyExchange: string;
  readonly sellExchange: string;
  readonly status: "COMPLETED" | "ONE_LEG_FILLED" | "NOT_FILLED";
  readonly matchedQuantity: number;
  readonly buyAveragePrice: number;
  readonly sellAveragePrice: number;
  readonly grossProfit: number;
  readonly totalFees: number;
  readonly netProfit: number;
  readonly netProfitPercent: number;
  readonly recoveryRequired: boolean;
  readonly completedAt: number;
}

export interface ArbitragePnLReport {
  readonly timestamp: number;
  readonly totalCycles: number;
  readonly completedCycles: number;
  readonly profitableCycles: number;
  readonly lossCycles: number;
  readonly recoveryRequiredCycles: number;
  readonly totalMatchedQuantity: number;
  readonly grossProfit: number;
  readonly totalFees: number;
  readonly netProfit: number;
  readonly averageNetProfit: number;
  readonly winRatePercent: number;
  readonly feesEstimated: true;
  readonly latest: readonly ArbitragePnLRecord[];
}

/** Effective taker fee percent (including any GST surcharge) for a leg. */
export type TakerFeeResolver = (exchange: string, market: string, side: "BUY" | "SELL") => number | null;

export function buildArbitragePnLReport(
  executions: readonly ExecutionHistoryItem[],
  takerFeePercent: TakerFeeResolver,
  limit: number,
  now: number,
): ArbitragePnLReport {
  const legs = new Map<string, {buy?: ExecutionHistoryItem; sell?: ExecutionHistoryItem}>();
  for (const execution of executions) {
    const match = execution.clientOrderId?.match(/^arb-(buy|sell)-(.+)$/u);
    if (!match) continue;
    const entry = legs.get(match[2]) ?? {};
    // Keep the latest terminal record per leg.
    const side = match[1] as "buy" | "sell";
    if (!entry[side] || entry[side]!.timestamp <= execution.timestamp) entry[side] = execution;
    legs.set(match[2], entry);
  }

  const records: ArbitragePnLRecord[] = [];
  for (const [id, {buy, sell}] of legs) {
    const buyFilled = buy?.status === "FILLED" && buy.filledQuantity > 0;
    const sellFilled = sell?.status === "FILLED" && sell.filledQuantity > 0;
    const matchedQuantity = buyFilled && sellFilled ? Math.min(buy.filledQuantity, sell.filledQuantity) : 0;
    const buyPrice = buyFilled ? buy.averageFillPrice : 0;
    const sellPrice = sellFilled ? sell.averageFillPrice : 0;
    const grossProfit = matchedQuantity * (sellPrice - buyPrice);
    const market = (buy ?? sell)!.market;
    const buyFee = buy ? takerFeePercent(buy.exchange, market, "BUY") ?? 0 : 0;
    const sellFee = sell ? takerFeePercent(sell.exchange, market, "SELL") ?? 0 : 0;
    const totalFees = matchedQuantity > 0
      ? matchedQuantity * buyPrice * (buyFee / 100) + matchedQuantity * sellPrice * (sellFee / 100)
      : 0;
    const netProfit = grossProfit - totalFees;
    const costBasis = matchedQuantity * buyPrice;

    records.push({
      opportunityId: id,
      market,
      buyExchange: buy?.exchange ?? "unknown",
      sellExchange: sell?.exchange ?? "unknown",
      status: matchedQuantity > 0 ? "COMPLETED" : buyFilled || sellFilled ? "ONE_LEG_FILLED" : "NOT_FILLED",
      matchedQuantity,
      buyAveragePrice: buyPrice,
      sellAveragePrice: sellPrice,
      grossProfit,
      totalFees,
      netProfit,
      netProfitPercent: costBasis > 0 ? (netProfit / costBasis) * 100 : 0,
      recoveryRequired: buyFilled !== sellFilled,
      completedAt: Math.max(buy?.timestamp ?? 0, sell?.timestamp ?? 0),
    });
  }

  records.sort((first, second) => second.completedAt - first.completedAt);
  const completed = records.filter((record) => record.status === "COMPLETED");
  const sum = (pick: (record: ArbitragePnLRecord) => number) => completed.reduce((total, record) => total + pick(record), 0);
  const netProfit = sum((record) => record.netProfit);

  return {
    timestamp: now,
    totalCycles: records.length,
    completedCycles: completed.length,
    profitableCycles: completed.filter((record) => record.netProfit > 0).length,
    lossCycles: completed.filter((record) => record.netProfit <= 0).length,
    recoveryRequiredCycles: records.filter((record) => record.recoveryRequired).length,
    totalMatchedQuantity: sum((record) => record.matchedQuantity),
    grossProfit: sum((record) => record.grossProfit),
    totalFees: sum((record) => record.totalFees),
    netProfit,
    averageNetProfit: completed.length ? netProfit / completed.length : 0,
    winRatePercent: completed.length ? (completed.filter((record) => record.netProfit > 0).length / completed.length) * 100 : 0,
    feesEstimated: true,
    latest: records.slice(0, Math.max(1, limit)),
  };
}
