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

const DAY_MS =
  24 * 60 * 60 * 1_000;

export type StrategyOneTradeFlowWindowId =
  | "TODAY"
  | "7D"
  | "14D"
  | "LIFETIME";

export interface StrategyOneTradeFlowMarketRank {
  readonly rank: number;
  readonly market: string;
  readonly baseAsset: string;
  readonly quoteAsset: string;
  readonly settlements: number;
  readonly settlementSharePercent: number;
  readonly totalQuantity: number;
  readonly capitalTurnoverInr: number;
  readonly realizedPnlInr: number;
  readonly profitableSettlements: number;
  readonly negativeSettlements: number;
  readonly winRatePercent: number;
  readonly leadingBuyExchange: string;
  readonly leadingSellExchange: string;
  readonly lastSettledAt: number;
}

export interface StrategyOneTradeFlowExchangeRank {
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

export interface StrategyOneTradeFlowRouteRank {
  readonly rank: number;
  readonly routeKey: string;
  readonly market: string;
  readonly buyExchange: string;
  readonly sellExchange: string;
  readonly settlements: number;
  readonly settlementSharePercent: number;
  readonly capitalTurnoverInr: number;
  readonly realizedPnlInr: number;
  readonly winRatePercent: number;
  readonly lastSettledAt: number;
}

export interface StrategyOneTradeFlowInventoryRank {
  readonly rank: number;
  readonly exchange: string;
  readonly asset: string;
  readonly buySettlements: number;
  readonly sellSettlements: number;
  readonly boughtQuantity: number;
  readonly soldQuantity: number;
  readonly netQuantity: number;
  readonly direction:
    | "ACCUMULATING"
    | "DISTRIBUTING"
    | "BALANCED";
  readonly lastSettledAt: number;
}

export interface StrategyOneTradeFlowWindow {
  readonly id: StrategyOneTradeFlowWindowId;
  readonly label: string;
  readonly startAt: number | null;
  readonly endAt: number;
  readonly summary: {
    readonly settlements: number;
    readonly profitableSettlements: number;
    readonly negativeSettlements: number;
    readonly flatSettlements: number;
    readonly uniqueMarkets: number;
    readonly uniqueRoutes: number;
    readonly activeExchanges: number;
    readonly capitalTurnoverInr: number;
    readonly realizedPnlInr: number;
    readonly deployableCashPnlInr: number;
    readonly feesInr: number;
    readonly tdsWithheldInr: number;
    readonly winRatePercent: number;
  };
  readonly markets: readonly StrategyOneTradeFlowMarketRank[];
  readonly buyExchanges: readonly StrategyOneTradeFlowExchangeRank[];
  readonly sellExchanges: readonly StrategyOneTradeFlowExchangeRank[];
  readonly routes: readonly StrategyOneTradeFlowRouteRank[];
  readonly inventoryFlows: readonly StrategyOneTradeFlowInventoryRank[];
}

export interface StrategyOneTradeFlowReport {
  readonly version: "117.0";
  readonly generatedAt: number;
  readonly sourceRevision: number;
  readonly mode: "PAPER_ANALYTICS_ONLY";
  readonly basis: "UNIQUE_CREDIBLE_CLOSED_STRATEGY_ONE_SETTLEMENTS";
  readonly timezone: "Asia/Kolkata";
  readonly evidence: {
    readonly storedTrades: number;
    readonly storedStrategyOneSettlements: number;
    readonly uniqueStrategyOneSettlements: number;
    readonly credibleSettlements: number;
    readonly excludedDistortedSettlements: number;
    readonly duplicateIdsIgnored: number;
  };
  readonly windows: Readonly<
    Record<
      StrategyOneTradeFlowWindowId,
      StrategyOneTradeFlowWindow
    >
  >;
  readonly interpretation: {
    readonly exchangePnlWarning: string;
    readonly inventoryFlowMeaning: string;
    readonly quantityWarning: string;
  };
  readonly safety: {
    readonly readOnly: true;
    readonly paperEvidenceOnly: true;
    readonly balanceMutated: false;
    readonly transferInitiated: false;
    readonly withdrawalInitiated: false;
    readonly liveExecutionAllowed: false;
    readonly orderSubmissionAllowed: false;
  };
}

interface StrategyOneTradeFlowDependencies {
  getTrades(): readonly PaperTrade[];
  getSettledRevision(): number;
}

interface ClosedTrade extends PaperTrade {
  actualProfit: number;
  closedAt: number;
}

interface MutableAggregate {
  key: string;
  market: string;
  baseAsset: string;
  quoteAsset: string;
  buyExchange: string;
  sellExchange: string;
  settlements: number;
  profitableSettlements: number;
  negativeSettlements: number;
  totalQuantity: number;
  capitalTurnoverInr: number;
  realizedPnlInr: number;
  deployableCashPnlInr: number;
  feesInr: number;
  tdsWithheldInr: number;
  lastSettledAt: number;
  markets: Set<string>;
  buyExchanges: Map<string, number>;
  sellExchanges: Map<string, number>;
}

interface MutableInventoryFlow {
  exchange: string;
  asset: string;
  buySettlements: number;
  sellSettlements: number;
  boughtQuantity: number;
  soldQuantity: number;
  lastSettledAt: number;
}

const DEFAULT_DEPENDENCIES:
  StrategyOneTradeFlowDependencies = {
  getTrades: () =>
    paperTradeStore
      .getAllForReadOnlyAggregation(),
  getSettledRevision: () =>
    paperTradeStore
      .getSettledRevision(),
};

/**
 * Compact, revision-cached read model for Strategy #1 settlement flow.
 * It never reaches balances, capital controls, transfers, LIVE execution, or
 * exchange adapters. Full historical aggregation runs only when terminal
 * PAPER evidence changes or the authoritative IST accounting day rolls over.
 */
export class StrategyOneTradeFlowReportService {
  private readonly dependencies:
    StrategyOneTradeFlowDependencies;

  private cachedReport:
    StrategyOneTradeFlowReport | null =
    null;

  private cachedRevision =
    -1;

  private cachedIstDayKey =
    Number.NaN;

  constructor(
    dependencies:
      Partial<StrategyOneTradeFlowDependencies> = {},
  ) {
    this.dependencies = {
      ...DEFAULT_DEPENDENCIES,
      ...dependencies,
    };
  }

  getReport(
    now =
      Date.now(),
  ): StrategyOneTradeFlowReport {
    assertTimestamp(
      now,
    );

    const revision =
      this.dependencies
        .getSettledRevision();

    if (
      !Number.isSafeInteger(
        revision,
      ) ||
      revision <
        0
    ) {
      throw new Error(
        "Strategy #1 trade-flow revision must be a non-negative safe integer.",
      );
    }

    const istDayKey =
      getIstDayKey(
        now,
      );

    if (
      this.cachedReport !==
        null &&
      this.cachedRevision ===
        revision &&
      this.cachedIstDayKey ===
        istDayKey
    ) {
      return this.cachedReport;
    }

    const report =
      this.buildReport(
        this.dependencies
          .getTrades(),
        revision,
        now,
      );

    this.cachedReport =
      report;
    this.cachedRevision =
      revision;
    this.cachedIstDayKey =
      istDayKey;

    return report;
  }

  private buildReport(
    trades:
      readonly PaperTrade[],
    revision:
      number,
    now:
      number,
  ): StrategyOneTradeFlowReport {
    const storedStrategyOneSettlements =
      trades.filter(
        isClosedStrategyOneSettlement,
      );

    const uniqueById =
      new Map<
        string,
        ClosedTrade
      >();

    for (
      const trade
      of storedStrategyOneSettlements
    ) {
      if (
        !uniqueById.has(
          trade.id,
        )
      ) {
        uniqueById.set(
          trade.id,
          trade,
        );
      }
    }

    const uniqueSettlements =
      [
        ...uniqueById.values(),
      ];

    const credibleSettlements =
      uniqueSettlements.filter(
        (
          trade,
        ) =>
          evaluateExecutedPriceCredibility(
            trade.buyPrice,
            trade.actualSellPrice ??
              trade.sellPrice,
          ).credible,
      );

    const dayStart =
      getIstDayStart(
        now,
      );

    const windows:
      StrategyOneTradeFlowReport["windows"] = {
      TODAY:
        this.buildWindow(
          "TODAY",
          "Today",
          dayStart,
          now,
          credibleSettlements,
        ),
      "7D":
        this.buildWindow(
          "7D",
          "Last 7 days",
          dayStart -
            6 * DAY_MS,
          now,
          credibleSettlements,
        ),
      "14D":
        this.buildWindow(
          "14D",
          "Last 14 days",
          dayStart -
            13 * DAY_MS,
          now,
          credibleSettlements,
        ),
      LIFETIME:
        this.buildWindow(
          "LIFETIME",
          "Lifetime",
          null,
          now,
          credibleSettlements,
        ),
    };

    return deepFreeze({
      version:
        "117.0" as const,
      generatedAt:
        now,
      sourceRevision:
        revision,
      mode:
        "PAPER_ANALYTICS_ONLY" as const,
      basis:
        "UNIQUE_CREDIBLE_CLOSED_STRATEGY_ONE_SETTLEMENTS" as const,
      timezone:
        "Asia/Kolkata" as const,
      evidence: {
        storedTrades:
          trades.length,
        storedStrategyOneSettlements:
          storedStrategyOneSettlements.length,
        uniqueStrategyOneSettlements:
          uniqueSettlements.length,
        credibleSettlements:
          credibleSettlements.length,
        excludedDistortedSettlements:
          uniqueSettlements.length -
          credibleSettlements.length,
        duplicateIdsIgnored:
          storedStrategyOneSettlements.length -
          uniqueSettlements.length,
      },
      windows,
      interpretation: {
        exchangePnlWarning:
          "Exchange rankings show route-associated P&L. One cycle touches both venues, so BUY and SELL venue P&L columns must not be added together.",
        inventoryFlowMeaning:
          "BUY adds base-asset inventory at the buy venue; SELL consumes the same base asset at the sell venue. This is inventory-flow evidence, not an automatic transfer instruction.",
        quantityWarning:
          "Quantities are ranked within each asset. Units of different coins are never added together as comparable economic value.",
      },
      safety: {
        readOnly:
          true as const,
        paperEvidenceOnly:
          true as const,
        balanceMutated:
          false as const,
        transferInitiated:
          false as const,
        withdrawalInitiated:
          false as const,
        liveExecutionAllowed:
          false as const,
        orderSubmissionAllowed:
          false as const,
      },
    });
  }

  private buildWindow(
    id:
      StrategyOneTradeFlowWindowId,
    label:
      string,
    startAt:
      number | null,
    endAt:
      number,
    allSettlements:
      readonly ClosedTrade[],
  ): StrategyOneTradeFlowWindow {
    const settlements =
      allSettlements.filter(
        (
          trade,
        ) =>
          trade.closedAt <=
            endAt &&
          (
            startAt ===
              null ||
            trade.closedAt >=
              startAt
          ),
      );

    const marketAggregates =
      new Map<
        string,
        MutableAggregate
      >();
    const routeAggregates =
      new Map<
        string,
        MutableAggregate
      >();
    const buyExchangeAggregates =
      new Map<
        string,
        MutableAggregate
      >();
    const sellExchangeAggregates =
      new Map<
        string,
        MutableAggregate
      >();
    const inventoryFlows =
      new Map<
        string,
        MutableInventoryFlow
      >();
    const activeExchanges =
      new Set<string>();

    let profitableSettlements =
      0;
    let negativeSettlements =
      0;
    let capitalTurnoverInr =
      0;
    let realizedPnlInr =
      0;
    let deployableCashPnlInr =
      0;
    let feesInr =
      0;
    let tdsWithheldInr =
      0;

    for (
      const trade
      of settlements
    ) {
      const market =
        normalizeMarket(
          trade.market,
        );
      const buyExchange =
        normalizeExchange(
          trade.buyExchange,
        );
      const sellExchange =
        normalizeExchange(
          trade.sellExchange,
        );
      const assets =
        splitMarket(
          market,
        );
      const routeKey =
        `${market}|${buyExchange}>${sellExchange}`;

      this.addTrade(
        marketAggregates,
        market,
        trade,
        market,
        buyExchange,
        sellExchange,
        assets,
      );
      this.addTrade(
        routeAggregates,
        routeKey,
        trade,
        market,
        buyExchange,
        sellExchange,
        assets,
      );
      this.addTrade(
        buyExchangeAggregates,
        buyExchange,
        trade,
        market,
        buyExchange,
        sellExchange,
        assets,
      );
      this.addTrade(
        sellExchangeAggregates,
        sellExchange,
        trade,
        market,
        buyExchange,
        sellExchange,
        assets,
      );

      this.addInventoryFlow(
        inventoryFlows,
        buyExchange,
        assets.baseAsset,
        "BUY",
        trade.quantity,
        trade.closedAt,
      );
      this.addInventoryFlow(
        inventoryFlows,
        sellExchange,
        assets.baseAsset,
        "SELL",
        trade.quantity,
        trade.closedAt,
      );

      activeExchanges.add(
        buyExchange,
      );
      activeExchanges.add(
        sellExchange,
      );

      if (
        trade.actualProfit >
          0
      ) {
        profitableSettlements +=
          1;
      } else if (
        trade.actualProfit <
          0
      ) {
        negativeSettlements +=
          1;
      }

      capitalTurnoverInr +=
        finiteOrZero(
          trade.capital,
        );
      realizedPnlInr +=
        trade.actualProfit;
      deployableCashPnlInr +=
        finiteOrZero(
          trade.deployableCashProfit ??
            trade.actualProfit,
        );
      feesInr +=
        finiteOrZero(
          trade.estimatedFees,
        );
      tdsWithheldInr +=
        finiteOrZero(
          trade.tdsWithheld ??
            0,
        );
    }

    const markets =
      [
        ...marketAggregates.values(),
      ]
        .sort(
          compareAggregates,
        )
        .map(
          (
            aggregate,
            index,
          ) => ({
            rank:
              index +
              1,
            market:
              aggregate.market,
            baseAsset:
              aggregate.baseAsset,
            quoteAsset:
              aggregate.quoteAsset,
            settlements:
              aggregate.settlements,
            settlementSharePercent:
              percent(
                aggregate.settlements,
                settlements.length,
              ),
            totalQuantity:
              round(
                aggregate.totalQuantity,
                12,
              ),
            capitalTurnoverInr:
              round(
                aggregate.capitalTurnoverInr,
              ),
            realizedPnlInr:
              round(
                aggregate.realizedPnlInr,
              ),
            profitableSettlements:
              aggregate.profitableSettlements,
            negativeSettlements:
              aggregate.negativeSettlements,
            winRatePercent:
              percent(
                aggregate.profitableSettlements,
                aggregate.settlements,
              ),
            leadingBuyExchange:
              leadingKey(
                aggregate.buyExchanges,
              ),
            leadingSellExchange:
              leadingKey(
                aggregate.sellExchanges,
              ),
            lastSettledAt:
              aggregate.lastSettledAt,
          }));

    const routes =
      [
        ...routeAggregates.values(),
      ]
        .sort(
          compareAggregates,
        )
        .map(
          (
            aggregate,
            index,
          ) => ({
            rank:
              index +
              1,
            routeKey:
              aggregate.key,
            market:
              aggregate.market,
            buyExchange:
              aggregate.buyExchange,
            sellExchange:
              aggregate.sellExchange,
            settlements:
              aggregate.settlements,
            settlementSharePercent:
              percent(
                aggregate.settlements,
                settlements.length,
              ),
            capitalTurnoverInr:
              round(
                aggregate.capitalTurnoverInr,
              ),
            realizedPnlInr:
              round(
                aggregate.realizedPnlInr,
              ),
            winRatePercent:
              percent(
                aggregate.profitableSettlements,
                aggregate.settlements,
              ),
            lastSettledAt:
              aggregate.lastSettledAt,
          }));

    return {
      id,
      label,
      startAt,
      endAt,
      summary: {
        settlements:
          settlements.length,
        profitableSettlements,
        negativeSettlements,
        flatSettlements:
          settlements.length -
          profitableSettlements -
          negativeSettlements,
        uniqueMarkets:
          marketAggregates.size,
        uniqueRoutes:
          routeAggregates.size,
        activeExchanges:
          activeExchanges.size,
        capitalTurnoverInr:
          round(
            capitalTurnoverInr,
          ),
        realizedPnlInr:
          round(
            realizedPnlInr,
          ),
        deployableCashPnlInr:
          round(
            deployableCashPnlInr,
          ),
        feesInr:
          round(
            feesInr,
          ),
        tdsWithheldInr:
          round(
            tdsWithheldInr,
          ),
        winRatePercent:
          percent(
            profitableSettlements,
            settlements.length,
          ),
      },
      markets,
      buyExchanges:
        this.toExchangeRanks(
          buyExchangeAggregates,
          "BUY",
          settlements.length,
        ),
      sellExchanges:
        this.toExchangeRanks(
          sellExchangeAggregates,
          "SELL",
          settlements.length,
        ),
      routes,
      inventoryFlows:
        this.toInventoryRanks(
          inventoryFlows,
        ),
    };
  }

  private addTrade(
    aggregates:
      Map<string, MutableAggregate>,
    key:
      string,
    trade:
      ClosedTrade,
    market:
      string,
    buyExchange:
      string,
    sellExchange:
      string,
    assets: {
      baseAsset: string;
      quoteAsset: string;
    },
  ): void {
    const aggregate =
      aggregates.get(
        key,
      ) ?? {
        key,
        market,
        baseAsset:
          assets.baseAsset,
        quoteAsset:
          assets.quoteAsset,
        buyExchange,
        sellExchange,
        settlements:
          0,
        profitableSettlements:
          0,
        negativeSettlements:
          0,
        totalQuantity:
          0,
        capitalTurnoverInr:
          0,
        realizedPnlInr:
          0,
        deployableCashPnlInr:
          0,
        feesInr:
          0,
        tdsWithheldInr:
          0,
        lastSettledAt:
          0,
        markets:
          new Set<string>(),
        buyExchanges:
          new Map<string, number>(),
        sellExchanges:
          new Map<string, number>(),
      };

    aggregate.settlements +=
      1;
    aggregate.totalQuantity +=
      finiteOrZero(
        trade.quantity,
      );
    aggregate.capitalTurnoverInr +=
      finiteOrZero(
        trade.capital,
      );
    aggregate.realizedPnlInr +=
      trade.actualProfit;
    aggregate.deployableCashPnlInr +=
      finiteOrZero(
        trade.deployableCashProfit ??
          trade.actualProfit,
      );
    aggregate.feesInr +=
      finiteOrZero(
        trade.estimatedFees,
      );
    aggregate.tdsWithheldInr +=
      finiteOrZero(
        trade.tdsWithheld ??
          0,
      );
    aggregate.lastSettledAt =
      Math.max(
        aggregate.lastSettledAt,
        trade.closedAt,
      );
    aggregate.markets.add(
      market,
    );
    increment(
      aggregate.buyExchanges,
      buyExchange,
    );
    increment(
      aggregate.sellExchanges,
      sellExchange,
    );

    if (
      trade.actualProfit >
        0
    ) {
      aggregate.profitableSettlements +=
        1;
    } else if (
      trade.actualProfit <
        0
    ) {
      aggregate.negativeSettlements +=
        1;
    }

    aggregates.set(
      key,
      aggregate,
    );
  }

  private addInventoryFlow(
    flows:
      Map<string, MutableInventoryFlow>,
    exchange:
      string,
    asset:
      string,
    side:
      "BUY" | "SELL",
    quantity:
      number,
    closedAt:
      number,
  ): void {
    const key =
      `${exchange}|${asset}`;
    const flow =
      flows.get(
        key,
      ) ?? {
        exchange,
        asset,
        buySettlements:
          0,
        sellSettlements:
          0,
        boughtQuantity:
          0,
        soldQuantity:
          0,
        lastSettledAt:
          0,
      };

    if (
      side ===
        "BUY"
    ) {
      flow.buySettlements +=
        1;
      flow.boughtQuantity +=
        finiteOrZero(
          quantity,
        );
    } else {
      flow.sellSettlements +=
        1;
      flow.soldQuantity +=
        finiteOrZero(
          quantity,
        );
    }

    flow.lastSettledAt =
      Math.max(
        flow.lastSettledAt,
        closedAt,
      );

    flows.set(
      key,
      flow,
    );
  }

  private toExchangeRanks(
    aggregates:
      ReadonlyMap<string, MutableAggregate>,
    side:
      "BUY" | "SELL",
    totalSettlements:
      number,
  ): StrategyOneTradeFlowExchangeRank[] {
    return [
      ...aggregates.values(),
    ]
      .sort(
        compareAggregates,
      )
      .map(
        (
          aggregate,
          index,
        ) => ({
          rank:
            index +
            1,
          side,
          exchange:
            aggregate.key,
          settlements:
            aggregate.settlements,
          settlementSharePercent:
            percent(
              aggregate.settlements,
              totalSettlements,
            ),
          uniqueMarkets:
            aggregate.markets.size,
          capitalTurnoverInr:
            round(
              aggregate.capitalTurnoverInr,
            ),
          associatedRoutePnlInr:
            round(
              aggregate.realizedPnlInr,
            ),
          lastSettledAt:
            aggregate.lastSettledAt,
        }));
  }

  private toInventoryRanks(
    flows:
      ReadonlyMap<string, MutableInventoryFlow>,
  ): StrategyOneTradeFlowInventoryRank[] {
    return [
      ...flows.values(),
    ]
      .sort(
        (
          first,
          second,
        ) =>
          (
            second.buySettlements +
            second.sellSettlements
          ) -
            (
              first.buySettlements +
              first.sellSettlements
            ) ||
          second.lastSettledAt -
            first.lastSettledAt ||
          first.exchange.localeCompare(
            second.exchange,
          ) ||
          first.asset.localeCompare(
            second.asset,
          ),
      )
      .map(
        (
          flow,
          index,
        ) => {
          const netQuantity =
            round(
              flow.boughtQuantity -
                flow.soldQuantity,
              12,
            );

          return {
            rank:
              index +
              1,
            exchange:
              flow.exchange,
            asset:
              flow.asset,
            buySettlements:
              flow.buySettlements,
            sellSettlements:
              flow.sellSettlements,
            boughtQuantity:
              round(
                flow.boughtQuantity,
                12,
              ),
            soldQuantity:
              round(
                flow.soldQuantity,
                12,
              ),
            netQuantity,
            direction:
              Math.abs(
                netQuantity,
              ) <
                1e-12
                ? "BALANCED" as const
                : netQuantity >
                    0
                  ? "ACCUMULATING" as const
                  : "DISTRIBUTING" as const,
            lastSettledAt:
              flow.lastSettledAt,
          };
        });
  }
}

function isClosedStrategyOneSettlement(
  trade:
    PaperTrade,
): trade is ClosedTrade {
  return (
    trade.strategyAttribution
      ?.attributionStatus ===
      "ATTRIBUTED" &&
    trade.strategyAttribution
      .strategyId ===
      CROSS_EXCHANGE_ARBITRAGE_STRATEGY_ID &&
    trade.status ===
      "closed" &&
    typeof trade.closedAt ===
      "number" &&
    Number.isSafeInteger(
      trade.closedAt,
    ) &&
    trade.closedAt >
      0 &&
    typeof trade.actualProfit ===
      "number" &&
    Number.isFinite(
      trade.actualProfit,
    )
  );
}

function compareAggregates(
  first:
    MutableAggregate,
  second:
    MutableAggregate,
): number {
  return (
    second.settlements -
      first.settlements ||
    second.capitalTurnoverInr -
      first.capitalTurnoverInr ||
    second.lastSettledAt -
      first.lastSettledAt ||
    first.key.localeCompare(
      second.key,
    )
  );
}

function normalizeMarket(
  market:
    string,
): string {
  return market
    .trim()
    .toUpperCase()
    .replace(
      /[^A-Z0-9]/g,
      "",
    );
}

function normalizeExchange(
  exchange:
    string,
): string {
  return exchange
    .trim()
    .toLowerCase();
}

function splitMarket(
  market:
    string,
): {
  baseAsset: string;
  quoteAsset: string;
} {
  const quoteAssets = [
    "USDT",
    "USDC",
    "BUSD",
    "INR",
    "BTC",
    "ETH",
  ];

  for (
    const quoteAsset
    of quoteAssets
  ) {
    if (
      market.endsWith(
        quoteAsset,
      ) &&
      market.length >
        quoteAsset.length
    ) {
      return {
        baseAsset:
          market.slice(
            0,
            -quoteAsset.length,
          ),
        quoteAsset,
      };
    }
  }

  return {
    baseAsset:
      market ||
      "UNKNOWN",
    quoteAsset:
      "UNKNOWN",
  };
}

function increment(
  counts:
    Map<string, number>,
  key:
    string,
): void {
  counts.set(
    key,
    (
      counts.get(
        key,
      ) ??
      0
    ) +
      1,
  );
}

function leadingKey(
  counts:
    ReadonlyMap<string, number>,
): string {
  return [
    ...counts.entries(),
  ]
    .sort(
      (
        first,
        second,
      ) =>
        second[1] -
          first[1] ||
        first[0].localeCompare(
          second[0],
        ),
    )[0]?.[0] ??
    "unknown";
}

function getIstDayKey(
  timestamp:
    number,
): number {
  return Math.floor(
    (
      timestamp +
      IST_OFFSET_MS
    ) /
      DAY_MS,
  );
}

function getIstDayStart(
  timestamp:
    number,
): number {
  return getIstDayKey(
    timestamp,
  ) *
    DAY_MS -
    IST_OFFSET_MS;
}

function assertTimestamp(
  timestamp:
    number,
): void {
  if (
    !Number.isSafeInteger(
      timestamp,
    ) ||
    timestamp <=
      0
  ) {
    throw new Error(
      "Strategy #1 trade-flow timestamp must be a positive safe integer.",
    );
  }
}

function finiteOrZero(
  value:
    number,
): number {
  return Number.isFinite(
    value,
  )
    ? value
    : 0;
}

function percent(
  numerator:
    number,
  denominator:
    number,
): number {
  return denominator >
    0
    ? round(
        numerator /
          denominator *
          100,
        2,
      )
    : 0;
}

function round(
  value:
    number,
  decimals =
    2,
): number {
  const multiplier =
    10 **
    decimals;

  return Math.round(
    (
      value +
      Number.EPSILON
    ) *
      multiplier,
  ) /
    multiplier;
}

function deepFreeze<
  T,
>(
  value:
    T,
): T {
  if (
    value !==
      null &&
    typeof value ===
      "object" &&
    !Object.isFrozen(
      value,
    )
  ) {
    Object.freeze(
      value,
    );

    for (
      const child
      of Object.values(
        value as Record<string, unknown>,
      )
    ) {
      deepFreeze(
        child,
      );
    }
  }

  return value;
}

export const strategyOneTradeFlowReportService =
  new StrategyOneTradeFlowReportService();
