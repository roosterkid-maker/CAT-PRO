import {
  evaluateExecutedPriceCredibility,
} from "../../trading/analysis/CrossVenuePriceCredibilityService";

import type {
  PaperTrade,
} from "../../trading/models/PaperTrade";

import {
  paperTradeStore,
} from "../../trading/services/PaperTradeStore";

import {
  CROSS_EXCHANGE_ARBITRAGE_STRATEGY_ID,
} from "../models/StrategyMetadata";

const IST_OFFSET_MS =
  5.5 * 60 * 60 * 1_000;

const MINUTE_MS =
  60 * 1_000;

const HOUR_MS =
  60 * MINUTE_MS;

const DAY_MS =
  24 * HOUR_MS;

const REPORT_CACHE_BUCKET_MS =
  30 * 1_000;

const MAX_CUSTOM_WINDOW_MS =
  31 * DAY_MS;

const MAX_REPORT_CACHE_ENTRIES =
  24;

const TOP_RANK_LIMIT =
  10;

export type TradeIntelligenceWindowId =
  | "TODAY"
  | "24H"
  | "48H"
  | "7D"
  | "14D"
  | "CUSTOM";

export interface TradeIntelligenceQuery {
  readonly window?: TradeIntelligenceWindowId;
  readonly startAt?: number;
  readonly endAt?: number;
}

export interface TradeIntelligenceRouteRank {
  readonly rank: number;
  readonly routeKey: string;
  readonly market: string;
  readonly buyExchange: string;
  readonly sellExchange: string;
  readonly settlements: number;
  readonly successfulSettlements: number;
  readonly settlementSharePercent: number;
  readonly successRatePercent: number;
  readonly capitalTurnoverInr: number;
  readonly realizedPnlInr: number;
  readonly averagePnlInr: number;
  readonly deployableCashPnlInr: number;
  readonly feesInr: number;
  readonly tdsWithheldInr: number;
  readonly capitalEfficiencyPercent: number;
  readonly bestIstHour: number;
  readonly lastSettledAt: number;
}

export interface TradeIntelligenceMarketRank {
  readonly rank: number;
  readonly market: string;
  readonly baseAsset: string;
  readonly quoteAsset: string;
  readonly settlements: number;
  readonly successfulSettlements: number;
  readonly settlementSharePercent: number;
  readonly successRatePercent: number;
  readonly uniqueRoutes: number;
  readonly leadingBuyExchange: string;
  readonly leadingSellExchange: string;
  readonly capitalTurnoverInr: number;
  readonly realizedPnlInr: number;
  readonly averagePnlInr: number;
  readonly capitalEfficiencyPercent: number;
  readonly bestIstHour: number;
  readonly lastSettledAt: number;
}

export interface TradeIntelligenceExchangeRank {
  readonly rank: number;
  readonly side: "BUY" | "SELL";
  readonly exchange: string;
  readonly settlements: number;
  readonly settlementSharePercent: number;
  readonly uniqueMarkets: number;
  readonly capitalTurnoverInr: number;
  readonly associatedRoutePnlInr: number;
  readonly lastSettledAt: number;
}

export interface TradeIntelligenceHourBucket {
  readonly hour: number;
  readonly label: string;
  readonly state: "DATA" | "ZERO" | "NO_DATA";
  readonly settlements: number;
  readonly successfulSettlements: number;
  readonly capitalTurnoverInr: number;
  readonly realizedPnlInr: number;
  readonly averagePnlInr: number;
}

export interface TradeIntelligenceTradeDetail {
  readonly rank: number;
  readonly id: string;
  readonly settledAt: number;
  readonly market: string;
  readonly buyExchange: string;
  readonly sellExchange: string;
  readonly capitalInr: number;
  readonly quantity: number;
  readonly buyPrice: number;
  readonly sellPrice: number;
  readonly feesInr: number;
  readonly tdsWithheldInr: number;
  readonly realizedPnlInr: number;
  readonly deployableCashPnlInr: number;
  readonly returnPercent: number;
  readonly executionDurationMs: number;
  readonly evidenceBadge: "CREDIBLE_STRATEGY_1_PAPER";
}

export interface StrategyOneTradeIntelligenceReport {
  readonly version: "154.0";
  readonly generatedAt: number;
  readonly sourceRevision: number;
  readonly timezone: "Asia/Kolkata";
  readonly mode: "PAPER";
  readonly basis: "UNIQUE_CREDIBLE_CLOSED_STRATEGY_ONE_SETTLEMENTS";
  readonly window: {
    readonly id: TradeIntelligenceWindowId;
    readonly label: string;
    readonly startAt: number;
    readonly endAt: number;
  };
  readonly evidence: {
    readonly storedPaperTrades: number;
    readonly attributedClosedStrategyOne: number;
    readonly uniqueStrategyOneSettlements: number;
    readonly credibleStrategyOneSettlements: number;
    readonly selectedCredibleSettlements: number;
    readonly exclusions: {
      readonly duplicateIdsIgnored: number;
      readonly distortedSettlements: number;
      readonly openOrFailed: number;
      readonly unattributedOrOtherStrategy: number;
      readonly missingSettlementEconomics: number;
      readonly syntheticDemos: 0;
    };
    readonly syntheticDemoNote: string;
  };
  readonly summary: {
    readonly settlements: number;
    readonly successfulSettlements: number;
    readonly negativeSettlements: number;
    readonly flatSettlements: number;
    readonly uniqueMarkets: number;
    readonly uniqueRoutes: number;
    readonly activeExchanges: number;
    readonly capitalTurnoverInr: number;
    readonly realizedPnlInr: number;
    readonly averagePnlInr: number;
    readonly medianPnlInr: number;
    readonly deployableCashPnlInr: number;
    readonly feesInr: number;
    readonly tdsWithheldInr: number;
    readonly successRatePercent: number;
    readonly capitalEfficiencyPercent: number;
    readonly lastSettledAt: number | null;
  };
  readonly routes: readonly TradeIntelligenceRouteRank[];
  readonly markets: readonly TradeIntelligenceMarketRank[];
  readonly buyExchanges: readonly TradeIntelligenceExchangeRank[];
  readonly sellExchanges: readonly TradeIntelligenceExchangeRank[];
  readonly routeMatrix: readonly TradeIntelligenceRouteRank[];
  readonly hourlyIst: readonly TradeIntelligenceHourBucket[];
  readonly topSuccessfulTrades: readonly TradeIntelligenceTradeDetail[];
  readonly presentation: {
    readonly noData: boolean;
    readonly liveEvidenceAvailable: false;
    readonly exchangePnlWarning: string;
    readonly turnoverDefinition: string;
    readonly refreshAfterMs: 30_000;
    readonly maximumDetailRows: 10;
  };
  readonly safety: {
    readonly readOnly: true;
    readonly paperEvidenceOnly: true;
    readonly balancesRead: false;
    readonly balanceMutated: false;
    readonly transferInitiated: false;
    readonly withdrawalInitiated: false;
    readonly liveExecutionAllowed: false;
    readonly orderSubmissionAllowed: false;
  };
}

interface Dependencies {
  getTrades(): readonly PaperTrade[];
  getSettledRevision(): number;
}

interface ClosedTrade extends PaperTrade {
  actualProfit: number;
  closedAt: number;
}

interface SourceProjection {
  readonly revision: number;
  readonly storedPaperTrades: number;
  readonly attributedClosedStrategyOne: number;
  readonly uniqueStrategyOneSettlements: number;
  readonly credible: readonly ClosedTrade[];
  readonly exclusions: StrategyOneTradeIntelligenceReport["evidence"]["exclusions"];
}

interface MutableAggregate {
  key: string;
  market: string;
  baseAsset: string;
  quoteAsset: string;
  buyExchange: string;
  sellExchange: string;
  settlements: number;
  successfulSettlements: number;
  totalQuantity: number;
  capitalTurnoverInr: number;
  realizedPnlInr: number;
  deployableCashPnlInr: number;
  feesInr: number;
  tdsWithheldInr: number;
  lastSettledAt: number;
  markets: Set<string>;
  routes: Set<string>;
  buyExchanges: Map<string, number>;
  sellExchanges: Map<string, number>;
  hours: Map<number, number>;
}

const DEFAULT_DEPENDENCIES: Dependencies = {
  getTrades: () =>
    paperTradeStore.getAllForReadOnlyAggregation(),
  getSettledRevision: () =>
    paperTradeStore.getSettledRevision(),
};

/**
 * A bounded, revision-cached PAPER read model. It has no dependency on order,
 * balance, transfer, withdrawal, policy or execution-control services.
 */
export class StrategyOneTradeIntelligenceService {
  private readonly dependencies: Dependencies;

  private sourceProjection: SourceProjection | null =
    null;

  private readonly reportCache =
    new Map<string, StrategyOneTradeIntelligenceReport>();

  constructor(
    dependencies: Partial<Dependencies> = {},
  ) {
    this.dependencies = {
      ...DEFAULT_DEPENDENCIES,
      ...dependencies,
    };
  }

  getReport(
    query: TradeIntelligenceQuery = {},
    now = Date.now(),
  ): StrategyOneTradeIntelligenceReport {
    assertTimestamp(now, "now");

    const reportNow =
      Math.floor(now / REPORT_CACHE_BUCKET_MS) * REPORT_CACHE_BUCKET_MS;

    const revision =
      this.dependencies.getSettledRevision();

    if (!Number.isSafeInteger(revision) || revision < 0) {
      throw new Error(
        "Trade Intelligence source revision must be a non-negative safe integer.",
      );
    }

    const window =
      resolveWindow(query, reportNow);

    const cacheKey = [
      revision,
      window.id,
      window.startAt,
      window.endAt,
      reportNow,
    ].join("|");

    const cached =
      this.reportCache.get(cacheKey);

    if (cached) {
      return cached;
    }

    const source =
      this.getSourceProjection(revision);

    const report =
      this.buildReport(source, window, reportNow);

    this.reportCache.set(cacheKey, report);

    while (this.reportCache.size > MAX_REPORT_CACHE_ENTRIES) {
      const oldestKey =
        this.reportCache.keys().next().value as string | undefined;

      if (!oldestKey) {
        break;
      }

      this.reportCache.delete(oldestKey);
    }

    return report;
  }

  private getSourceProjection(
    revision: number,
  ): SourceProjection {
    if (this.sourceProjection?.revision === revision) {
      return this.sourceProjection;
    }

    const trades =
      this.dependencies.getTrades();
    const uniqueById =
      new Map<string, ClosedTrade>();
    let attributedClosedStrategyOne =
      0;
    let duplicateIdsIgnored =
      0;
    let distortedSettlements =
      0;
    let openOrFailed =
      0;
    let unattributedOrOtherStrategy =
      0;
    let missingSettlementEconomics =
      0;

    for (const trade of trades) {
      if (!isAttributedStrategyOne(trade)) {
        unattributedOrOtherStrategy += 1;
        continue;
      }

      if (trade.status !== "closed") {
        openOrFailed += 1;
        continue;
      }

      if (!hasSettlementEconomics(trade)) {
        missingSettlementEconomics += 1;
        continue;
      }

      attributedClosedStrategyOne += 1;

      if (uniqueById.has(trade.id)) {
        duplicateIdsIgnored += 1;
        continue;
      }

      uniqueById.set(trade.id, trade);
    }

    const credible: ClosedTrade[] = [];

    for (const trade of uniqueById.values()) {
      const priceCredibility =
        evaluateExecutedPriceCredibility(
          trade.buyPrice,
          trade.actualSellPrice ?? trade.sellPrice,
        );

      if (priceCredibility.credible) {
        credible.push(trade);
      } else {
        distortedSettlements += 1;
      }
    }

    credible.sort(
      (first, second) =>
        first.closedAt - second.closedAt ||
        first.id.localeCompare(second.id),
    );

    this.sourceProjection = deepFreeze({
      revision,
      storedPaperTrades: trades.length,
      attributedClosedStrategyOne,
      uniqueStrategyOneSettlements: uniqueById.size,
      credible,
      exclusions: {
        duplicateIdsIgnored,
        distortedSettlements,
        openOrFailed,
        unattributedOrOtherStrategy,
        missingSettlementEconomics,
        syntheticDemos: 0 as const,
      },
    });
    this.reportCache.clear();

    return this.sourceProjection;
  }

  private buildReport(
    source: SourceProjection,
    window: ResolvedWindow,
    now: number,
  ): StrategyOneTradeIntelligenceReport {
    const settlements =
      source.credible.filter(
        (trade) =>
          trade.closedAt >= window.startAt &&
          trade.closedAt <= window.endAt,
      );

    const marketAggregates =
      new Map<string, MutableAggregate>();
    const routeAggregates =
      new Map<string, MutableAggregate>();
    const buyExchangeAggregates =
      new Map<string, MutableAggregate>();
    const sellExchangeAggregates =
      new Map<string, MutableAggregate>();
    const hourlyTrades =
      Array.from({length: 24}, () => [] as ClosedTrade[]);
    const activeExchanges =
      new Set<string>();

    let successfulSettlements = 0;
    let negativeSettlements = 0;
    let capitalTurnoverInr = 0;
    let realizedPnlInr = 0;
    let deployableCashPnlInr = 0;
    let feesInr = 0;
    let tdsWithheldInr = 0;
    let lastSettledAt: number | null = null;

    for (const trade of settlements) {
      const market = normalizeMarket(trade.market);
      const buyExchange = normalizeExchange(trade.buyExchange);
      const sellExchange = normalizeExchange(trade.sellExchange);
      const assets = splitMarket(market);
      const routeKey = `${market}|${buyExchange}>${sellExchange}`;

      addTrade(
        marketAggregates,
        market,
        trade,
        market,
        buyExchange,
        sellExchange,
        assets,
      );
      addTrade(
        routeAggregates,
        routeKey,
        trade,
        market,
        buyExchange,
        sellExchange,
        assets,
      );
      addTrade(
        buyExchangeAggregates,
        buyExchange,
        trade,
        market,
        buyExchange,
        sellExchange,
        assets,
      );
      addTrade(
        sellExchangeAggregates,
        sellExchange,
        trade,
        market,
        buyExchange,
        sellExchange,
        assets,
      );

      hourlyTrades[getIstHour(trade.closedAt)]?.push(trade);
      activeExchanges.add(buyExchange);
      activeExchanges.add(sellExchange);

      if (trade.actualProfit > 0) {
        successfulSettlements += 1;
      } else if (trade.actualProfit < 0) {
        negativeSettlements += 1;
      }

      capitalTurnoverInr += finiteOrZero(trade.capital);
      realizedPnlInr += trade.actualProfit;
      deployableCashPnlInr += finiteOrZero(
        trade.deployableCashProfit ?? trade.actualProfit,
      );
      feesInr += finiteOrZero(trade.estimatedFees);
      tdsWithheldInr += finiteOrZero(trade.tdsWithheld ?? 0);
      lastSettledAt = Math.max(lastSettledAt ?? 0, trade.closedAt);
    }

    const routes = toRouteRanks(routeAggregates, settlements.length);
    const noData = settlements.length === 0;

    return deepFreeze({
      version: "154.0" as const,
      generatedAt: now,
      sourceRevision: source.revision,
      timezone: "Asia/Kolkata" as const,
      mode: "PAPER" as const,
      basis: "UNIQUE_CREDIBLE_CLOSED_STRATEGY_ONE_SETTLEMENTS" as const,
      window,
      evidence: {
        storedPaperTrades: source.storedPaperTrades,
        attributedClosedStrategyOne: source.attributedClosedStrategyOne,
        uniqueStrategyOneSettlements: source.uniqueStrategyOneSettlements,
        credibleStrategyOneSettlements: source.credible.length,
        selectedCredibleSettlements: settlements.length,
        exclusions: source.exclusions,
        syntheticDemoNote:
          "Synthetic demo outcomes never enter PaperTradeStore and therefore cannot increase this report.",
      },
      summary: {
        settlements: settlements.length,
        successfulSettlements,
        negativeSettlements,
        flatSettlements:
          settlements.length - successfulSettlements - negativeSettlements,
        uniqueMarkets: marketAggregates.size,
        uniqueRoutes: routeAggregates.size,
        activeExchanges: activeExchanges.size,
        capitalTurnoverInr: round(capitalTurnoverInr),
        realizedPnlInr: round(realizedPnlInr),
        averagePnlInr: round(divide(realizedPnlInr, settlements.length)),
        medianPnlInr: round(median(settlements.map((trade) => trade.actualProfit))),
        deployableCashPnlInr: round(deployableCashPnlInr),
        feesInr: round(feesInr),
        tdsWithheldInr: round(tdsWithheldInr),
        successRatePercent: percent(successfulSettlements, settlements.length),
        capitalEfficiencyPercent: percent(realizedPnlInr, capitalTurnoverInr),
        lastSettledAt,
      },
      routes,
      markets: toMarketRanks(marketAggregates, settlements.length),
      buyExchanges: toExchangeRanks(
        buyExchangeAggregates,
        "BUY",
        settlements.length,
      ),
      sellExchanges: toExchangeRanks(
        sellExchangeAggregates,
        "SELL",
        settlements.length,
      ),
      routeMatrix: routes,
      hourlyIst: hourlyTrades.map((trades, hour) => {
        const pnl = sum(trades, (trade) => trade.actualProfit);
        return {
          hour,
          label: `${padHour(hour)}:00–${padHour((hour + 1) % 24)}:00`,
          state: noData ? "NO_DATA" as const : trades.length > 0 ? "DATA" as const : "ZERO" as const,
          settlements: trades.length,
          successfulSettlements: trades.filter((trade) => trade.actualProfit > 0).length,
          capitalTurnoverInr: round(sum(trades, (trade) => finiteOrZero(trade.capital))),
          realizedPnlInr: round(pnl),
          averagePnlInr: round(divide(pnl, trades.length)),
        };
      }),
      topSuccessfulTrades: settlements
        .filter((trade) => trade.actualProfit > 0)
        .sort(
          (first, second) =>
            second.actualProfit - first.actualProfit ||
            second.closedAt - first.closedAt ||
            first.id.localeCompare(second.id),
        )
        .slice(0, TOP_RANK_LIMIT)
        .map((trade, index) => toTradeDetail(trade, index + 1)),
      presentation: {
        noData,
        liveEvidenceAvailable: false as const,
        exchangePnlWarning:
          "Venue P&L is route-associated: one cycle touches both BUY and SELL venues, so venue P&L columns must never be added together.",
        turnoverDefinition:
          "Turnover counts one allocated capital amount per completed cross-exchange cycle; it does not double-count both legs.",
        refreshAfterMs: 30_000 as const,
        maximumDetailRows: 10 as const,
      },
      safety: {
        readOnly: true as const,
        paperEvidenceOnly: true as const,
        balancesRead: false as const,
        balanceMutated: false as const,
        transferInitiated: false as const,
        withdrawalInitiated: false as const,
        liveExecutionAllowed: false as const,
        orderSubmissionAllowed: false as const,
      },
    });
  }
}

interface ResolvedWindow {
  readonly id: TradeIntelligenceWindowId;
  readonly label: string;
  readonly startAt: number;
  readonly endAt: number;
}

function resolveWindow(
  query: TradeIntelligenceQuery,
  now: number,
): ResolvedWindow {
  const id = query.window ?? "48H";

  switch (id) {
    case "TODAY":
      return {id, label: "Today (IST)", startAt: getIstDayStart(now), endAt: now};
    case "24H":
      return {id, label: "Rolling 24 hours", startAt: now - DAY_MS, endAt: now};
    case "48H":
      return {id, label: "Rolling 48 hours", startAt: now - 2 * DAY_MS, endAt: now};
    case "7D":
      return {id, label: "Rolling 7 days", startAt: now - 7 * DAY_MS, endAt: now};
    case "14D":
      return {id, label: "Rolling 14 days", startAt: now - 14 * DAY_MS, endAt: now};
    case "CUSTOM": {
      const startAt = query.startAt;
      const endAt = query.endAt;

      assertTimestamp(startAt, "custom startAt");
      assertTimestamp(endAt, "custom endAt");

      if (startAt >= endAt) {
        throw new Error("Custom Trade Intelligence startAt must be before endAt.");
      }

      if (endAt > now + MINUTE_MS) {
        throw new Error("Custom Trade Intelligence endAt cannot be in the future.");
      }

      if (endAt - startAt > MAX_CUSTOM_WINDOW_MS) {
        throw new Error("Custom Trade Intelligence window cannot exceed 31 days.");
      }

      return {id, label: "Custom IST range", startAt, endAt};
    }
    default:
      throw new Error(`Unsupported Trade Intelligence window: ${String(id)}.`);
  }
}

function isAttributedStrategyOne(trade: PaperTrade): boolean {
  return (
    trade.strategyAttribution?.attributionStatus === "ATTRIBUTED" &&
    trade.strategyAttribution.strategyId === CROSS_EXCHANGE_ARBITRAGE_STRATEGY_ID
  );
}

function hasSettlementEconomics(trade: PaperTrade): trade is ClosedTrade {
  return (
    typeof trade.closedAt === "number" &&
    Number.isSafeInteger(trade.closedAt) &&
    trade.closedAt > 0 &&
    typeof trade.actualProfit === "number" &&
    Number.isFinite(trade.actualProfit) &&
    Number.isFinite(trade.buyPrice) &&
    Number.isFinite(trade.actualSellPrice ?? trade.sellPrice)
  );
}

function addTrade(
  aggregates: Map<string, MutableAggregate>,
  key: string,
  trade: ClosedTrade,
  market: string,
  buyExchange: string,
  sellExchange: string,
  assets: {baseAsset: string; quoteAsset: string},
): void {
  const routeKey = `${market}|${buyExchange}>${sellExchange}`;
  const aggregate = aggregates.get(key) ?? {
    key,
    market,
    baseAsset: assets.baseAsset,
    quoteAsset: assets.quoteAsset,
    buyExchange,
    sellExchange,
    settlements: 0,
    successfulSettlements: 0,
    totalQuantity: 0,
    capitalTurnoverInr: 0,
    realizedPnlInr: 0,
    deployableCashPnlInr: 0,
    feesInr: 0,
    tdsWithheldInr: 0,
    lastSettledAt: 0,
    markets: new Set<string>(),
    routes: new Set<string>(),
    buyExchanges: new Map<string, number>(),
    sellExchanges: new Map<string, number>(),
    hours: new Map<number, number>(),
  };

  aggregate.settlements += 1;
  aggregate.successfulSettlements += trade.actualProfit > 0 ? 1 : 0;
  aggregate.totalQuantity += finiteOrZero(trade.quantity);
  aggregate.capitalTurnoverInr += finiteOrZero(trade.capital);
  aggregate.realizedPnlInr += trade.actualProfit;
  aggregate.deployableCashPnlInr += finiteOrZero(
    trade.deployableCashProfit ?? trade.actualProfit,
  );
  aggregate.feesInr += finiteOrZero(trade.estimatedFees);
  aggregate.tdsWithheldInr += finiteOrZero(trade.tdsWithheld ?? 0);
  aggregate.lastSettledAt = Math.max(aggregate.lastSettledAt, trade.closedAt);
  aggregate.markets.add(market);
  aggregate.routes.add(routeKey);
  increment(aggregate.buyExchanges, buyExchange);
  increment(aggregate.sellExchanges, sellExchange);
  increment(aggregate.hours, getIstHour(trade.closedAt));
  aggregates.set(key, aggregate);
}

function toRouteRanks(
  aggregates: ReadonlyMap<string, MutableAggregate>,
  totalSettlements: number,
): TradeIntelligenceRouteRank[] {
  return [...aggregates.values()]
    .sort(compareAggregates)
    .slice(0, TOP_RANK_LIMIT)
    .map((aggregate, index) => ({
      rank: index + 1,
      routeKey: aggregate.key,
      market: aggregate.market,
      buyExchange: aggregate.buyExchange,
      sellExchange: aggregate.sellExchange,
      settlements: aggregate.settlements,
      successfulSettlements: aggregate.successfulSettlements,
      settlementSharePercent: percent(aggregate.settlements, totalSettlements),
      successRatePercent: percent(aggregate.successfulSettlements, aggregate.settlements),
      capitalTurnoverInr: round(aggregate.capitalTurnoverInr),
      realizedPnlInr: round(aggregate.realizedPnlInr),
      averagePnlInr: round(divide(aggregate.realizedPnlInr, aggregate.settlements)),
      deployableCashPnlInr: round(aggregate.deployableCashPnlInr),
      feesInr: round(aggregate.feesInr),
      tdsWithheldInr: round(aggregate.tdsWithheldInr),
      capitalEfficiencyPercent: percent(aggregate.realizedPnlInr, aggregate.capitalTurnoverInr),
      bestIstHour: leadingNumberKey(aggregate.hours),
      lastSettledAt: aggregate.lastSettledAt,
    }));
}

function toMarketRanks(
  aggregates: ReadonlyMap<string, MutableAggregate>,
  totalSettlements: number,
): TradeIntelligenceMarketRank[] {
  return [...aggregates.values()]
    .sort(compareAggregates)
    .slice(0, TOP_RANK_LIMIT)
    .map((aggregate, index) => ({
      rank: index + 1,
      market: aggregate.market,
      baseAsset: aggregate.baseAsset,
      quoteAsset: aggregate.quoteAsset,
      settlements: aggregate.settlements,
      successfulSettlements: aggregate.successfulSettlements,
      settlementSharePercent: percent(aggregate.settlements, totalSettlements),
      successRatePercent: percent(aggregate.successfulSettlements, aggregate.settlements),
      uniqueRoutes: aggregate.routes.size,
      leadingBuyExchange: leadingKey(aggregate.buyExchanges),
      leadingSellExchange: leadingKey(aggregate.sellExchanges),
      capitalTurnoverInr: round(aggregate.capitalTurnoverInr),
      realizedPnlInr: round(aggregate.realizedPnlInr),
      averagePnlInr: round(divide(aggregate.realizedPnlInr, aggregate.settlements)),
      capitalEfficiencyPercent: percent(aggregate.realizedPnlInr, aggregate.capitalTurnoverInr),
      bestIstHour: leadingNumberKey(aggregate.hours),
      lastSettledAt: aggregate.lastSettledAt,
    }));
}

function toExchangeRanks(
  aggregates: ReadonlyMap<string, MutableAggregate>,
  side: "BUY" | "SELL",
  totalSettlements: number,
): TradeIntelligenceExchangeRank[] {
  return [...aggregates.values()]
    .sort(compareAggregates)
    .slice(0, TOP_RANK_LIMIT)
    .map((aggregate, index) => ({
      rank: index + 1,
      side,
      exchange: aggregate.key,
      settlements: aggregate.settlements,
      settlementSharePercent: percent(aggregate.settlements, totalSettlements),
      uniqueMarkets: aggregate.markets.size,
      capitalTurnoverInr: round(aggregate.capitalTurnoverInr),
      associatedRoutePnlInr: round(aggregate.realizedPnlInr),
      lastSettledAt: aggregate.lastSettledAt,
    }));
}

function toTradeDetail(
  trade: ClosedTrade,
  rank: number,
): TradeIntelligenceTradeDetail {
  return {
    rank,
    id: trade.id,
    settledAt: trade.closedAt,
    market: normalizeMarket(trade.market),
    buyExchange: normalizeExchange(trade.buyExchange),
    sellExchange: normalizeExchange(trade.sellExchange),
    capitalInr: round(finiteOrZero(trade.capital)),
    quantity: round(finiteOrZero(trade.quantity), 12),
    buyPrice: round(finiteOrZero(trade.buyPrice), 12),
    sellPrice: round(finiteOrZero(trade.actualSellPrice ?? trade.sellPrice), 12),
    feesInr: round(finiteOrZero(trade.estimatedFees)),
    tdsWithheldInr: round(finiteOrZero(trade.tdsWithheld ?? 0)),
    realizedPnlInr: round(trade.actualProfit),
    deployableCashPnlInr: round(
      finiteOrZero(trade.deployableCashProfit ?? trade.actualProfit),
    ),
    returnPercent: round(
      Number.isFinite(trade.actualProfitPercent)
        ? trade.actualProfitPercent ?? 0
        : divide(trade.actualProfit, trade.capital) * 100,
      4,
    ),
    executionDurationMs: Math.max(0, trade.closedAt - trade.openedAt),
    evidenceBadge: "CREDIBLE_STRATEGY_1_PAPER" as const,
  };
}

function compareAggregates(first: MutableAggregate, second: MutableAggregate): number {
  return (
    second.settlements - first.settlements ||
    second.realizedPnlInr - first.realizedPnlInr ||
    second.lastSettledAt - first.lastSettledAt ||
    first.key.localeCompare(second.key)
  );
}

function normalizeMarket(market: string): string {
  return market.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function normalizeExchange(exchange: string): string {
  return exchange.trim().toLowerCase();
}

function splitMarket(market: string): {baseAsset: string; quoteAsset: string} {
  for (const quoteAsset of ["USDT", "USDC", "BUSD", "INR", "BTC", "ETH"]) {
    if (market.endsWith(quoteAsset) && market.length > quoteAsset.length) {
      return {baseAsset: market.slice(0, -quoteAsset.length), quoteAsset};
    }
  }

  return {baseAsset: market || "UNKNOWN", quoteAsset: "UNKNOWN"};
}

function increment<K>(counts: Map<K, number>, key: K): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function leadingKey(counts: ReadonlyMap<string, number>): string {
  return [...counts.entries()]
    .sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0]))[0]?.[0] ?? "unknown";
}

function leadingNumberKey(counts: ReadonlyMap<number, number>): number {
  return [...counts.entries()]
    .sort((first, second) => second[1] - first[1] || first[0] - second[0])[0]?.[0] ?? 0;
}

function getIstDayStart(timestamp: number): number {
  return Math.floor((timestamp + IST_OFFSET_MS) / DAY_MS) * DAY_MS - IST_OFFSET_MS;
}

function getIstHour(timestamp: number): number {
  return Math.floor((timestamp + IST_OFFSET_MS) / HOUR_MS) % 24;
}

function assertTimestamp(
  timestamp: number | undefined,
  label: string,
): asserts timestamp is number {
  if (!Number.isSafeInteger(timestamp) || (timestamp ?? 0) <= 0) {
    throw new Error(`Trade Intelligence ${label} must be a positive safe-integer timestamp.`);
  }
}

function sum<T>(values: readonly T[], selector: (value: T) => number): number {
  let total = 0;
  for (const value of values) total += selector(value);
  return total;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((first, second) => first - second);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0
    ? ((ordered[middle - 1] ?? 0) + (ordered[middle] ?? 0)) / 2
    : ordered[middle] ?? 0;
}

function divide(numerator: number, denominator: number): number {
  return denominator !== 0 ? numerator / denominator : 0;
}

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function percent(numerator: number, denominator: number): number {
  return round(divide(numerator, denominator) * 100, 2);
}

function round(value: number, decimals = 2): number {
  const multiplier = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * multiplier) / multiplier;
}

function padHour(hour: number): string {
  return String(hour).padStart(2, "0");
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

export const strategyOneTradeIntelligenceService =
  new StrategyOneTradeIntelligenceService();
