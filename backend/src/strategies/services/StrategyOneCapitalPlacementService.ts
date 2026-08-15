import {
  exchangeFleetRegistry,
} from "../../exchanges/core/ExchangeFleetRegistry";

import {
  evaluateExecutedPriceCredibility,
} from "../../trading/analysis/CrossVenuePriceCredibilityService";

import type {
  PaperTrade,
} from "../../trading/models/PaperTrade";

import {
  CROSS_EXCHANGE_ARBITRAGE_STRATEGY_ID,
} from "../models/StrategyMetadata";

const MINIMUM_ROUTE_SAMPLE =
  20;

const HIGH_CONFIDENCE_SAMPLE =
  100;

const TINY_LIVE_PILOT_PER_LEG_INR =
  100;

export type StrategyOneCapitalPlacementConfidence =
  | "LOW"
  | "MEDIUM"
  | "HIGH";

export interface StrategyOneCapitalPlacementVenueRank {
  readonly rank: number;
  readonly side: "BUY" | "SELL";
  readonly exchange: string;
  readonly uniqueSettlements: number;
  readonly uniqueMarkets: number;
  readonly profitableSettlements: number;
  readonly negativeSettlements: number;
  readonly winRatePercent: number;
  readonly settlementSharePercent: number;
  readonly totalCapitalInr: number;
  readonly realizedPnlInr: number;
  readonly deployableCashPnlInr: number;
  readonly feesInr: number;
  readonly tdsWithheldInr: number;
  readonly averageNetReturnPercent: number;
  readonly liveAdapterRegistered: boolean;
  readonly confidence: StrategyOneCapitalPlacementConfidence;
}

export interface StrategyOneCapitalPlacementRouteRank {
  readonly rank: number;
  readonly routeKey: string;
  readonly market: string;
  readonly baseAsset: string;
  readonly quoteAsset: string;
  readonly buyExchange: string;
  readonly sellExchange: string;
  readonly uniqueSettlements: number;
  readonly profitableSettlements: number;
  readonly negativeSettlements: number;
  readonly winRatePercent: number;
  readonly totalCapitalInr: number;
  readonly realizedPnlInr: number;
  readonly deployableCashPnlInr: number;
  readonly feesInr: number;
  readonly tdsWithheldInr: number;
  readonly averageNetReturnPercent: number;
  readonly lastSettledAt: number;
  readonly buyAdapterRegistered: boolean;
  readonly sellAdapterRegistered: boolean;
  readonly liveAdapterFoundationReady: boolean;
  readonly confidence: StrategyOneCapitalPlacementConfidence;
}

export interface StrategyOneCapitalPlacementReport {
  readonly version: "91.0";
  readonly generatedAt: number;
  readonly mode: "HISTORICAL_ADVISORY_ONLY";
  readonly basis: "UNIQUE_CREDIBLE_CLOSED_STRATEGY_ONE_SETTLEMENTS";
  readonly minimumRouteSample: number;
  readonly evidence: {
    readonly storedStrategyOneSettlements: number;
    readonly uniqueStrategyOneSettlements: number;
    readonly credibleSettlements: number;
    readonly excludedDistortedSettlements: number;
    readonly duplicateIdsIgnored: number;
  };
  readonly buyVenues: readonly StrategyOneCapitalPlacementVenueRank[];
  readonly sellVenues: readonly StrategyOneCapitalPlacementVenueRank[];
  readonly routes: readonly StrategyOneCapitalPlacementRouteRank[];
  readonly pilot: {
    readonly state:
      | "NO_DATA"
      | "NO_ADAPTER_READY_ROUTE"
      | "COLLECTING"
      | "CANDIDATE_FOR_PREFLIGHT";
    readonly requestedPerLegInr: 100;
    readonly minimumTwoLegInventoryInr: 200;
    readonly recommendedRoute: StrategyOneCapitalPlacementRouteRank | null;
    readonly reasons: readonly string[];
    readonly preflightRequired: true;
    readonly currentOrderRulesVerified: false;
    readonly currentBalancesVerified: false;
  };
  readonly safety: {
    readonly advisoryOnly: true;
    readonly historicalEvidenceDoesNotAuthorizeLive: true;
    readonly automaticFundMovementAllowed: false;
    readonly transferInitiated: false;
    readonly withdrawalInitiated: false;
    readonly balanceMutated: false;
    readonly liveExecutionAllowed: false;
    readonly orderSubmissionAllowed: false;
  };
}

interface MutablePlacementAggregate {
  key: string;
  market: string;
  buyExchange: string;
  sellExchange: string;
  baseAsset: string;
  quoteAsset: string;
  uniqueSettlements: number;
  profitableSettlements: number;
  negativeSettlements: number;
  totalCapitalInr: number;
  realizedPnlInr: number;
  deployableCashPnlInr: number;
  feesInr: number;
  tdsWithheldInr: number;
  totalReturnPercent: number;
  lastSettledAt: number;
  markets: Set<string>;
}

export interface StrategyOneCapitalPlacementDependencies {
  getLiveAdapterExchanges(): readonly string[];
}

const DEFAULT_DEPENDENCIES:
  StrategyOneCapitalPlacementDependencies = {
  getLiveAdapterExchanges:
    () =>
      exchangeFleetRegistry
        .getReport()
        .exchanges
        .filter(
          (exchange) =>
            exchange.liveOrderAdapter
              .adapterRegistered,
        )
        .map(
          (exchange) =>
            exchange.exchange,
        ),
};

/**
 * Converts durable Strategy #1 settlement evidence into a read-only capital
 * placement ranking. It never reads or mutates wallet balances and never
 * reaches an order, transfer, withdrawal, or LIVE-control path.
 */
export class StrategyOneCapitalPlacementService {
  private readonly dependencies:
    StrategyOneCapitalPlacementDependencies;

  constructor(
    dependencies:
      Partial<StrategyOneCapitalPlacementDependencies> = {},
  ) {
    this.dependencies = {
      ...DEFAULT_DEPENDENCIES,
      ...dependencies,
    };
  }

  getReport(
    trades:
      readonly PaperTrade[],
    now =
      Date.now(),
  ): StrategyOneCapitalPlacementReport {
    if (
      !Number.isSafeInteger(
        now,
      ) ||
      now <=
        0
    ) {
      throw new Error(
        "Strategy #1 capital-placement timestamp must be a positive safe integer.",
      );
    }

    const storedStrategyOneSettlements =
      trades.filter(
        isStoredStrategyOneSettlement,
      );

    const uniqueById =
      new Map<
        string,
        PaperTrade & {
          actualProfit: number;
          closedAt: number;
        }
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
        (trade) =>
          evaluateExecutedPriceCredibility(
            trade.buyPrice,
            trade.actualSellPrice ??
              trade.sellPrice,
          ).credible,
      );

    const routeAggregates =
      new Map<
        string,
        MutablePlacementAggregate
      >();

    const liveAdapterExchanges =
      new Set(
        this.dependencies
          .getLiveAdapterExchanges()
          .map(
            (exchange) =>
              exchange
                .trim()
                .toLowerCase(),
          )
          .filter(
            Boolean,
          ),
      );

    const buyVenueAggregates =
      new Map<
        string,
        MutablePlacementAggregate
      >();

    const sellVenueAggregates =
      new Map<
        string,
        MutablePlacementAggregate
      >();

    for (
      const trade
      of credibleSettlements
    ) {
      const market =
        trade.market
          .trim()
          .toUpperCase();

      const buyExchange =
        trade.buyExchange
          .trim()
          .toLowerCase();

      const sellExchange =
        trade.sellExchange
          .trim()
          .toLowerCase();

      const assets =
        splitMarket(
          market,
        );

      const routeKey =
        `${market}|${buyExchange}>${sellExchange}`;

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
        buyVenueAggregates,
        buyExchange,
        trade,
        market,
        buyExchange,
        sellExchange,
        assets,
      );

      this.addTrade(
        sellVenueAggregates,
        sellExchange,
        trade,
        market,
        buyExchange,
        sellExchange,
        assets,
      );
    }

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
          ) =>
            this.toRouteRank(
              aggregate,
              index +
                1,
              liveAdapterExchanges,
            ),
        );

    const buyVenues =
      this.toVenueRanks(
        buyVenueAggregates,
        "BUY",
        credibleSettlements.length,
        liveAdapterExchanges,
      );

    const sellVenues =
      this.toVenueRanks(
        sellVenueAggregates,
        "SELL",
        credibleSettlements.length,
        liveAdapterExchanges,
      );

    const adapterReadyRoutes =
      routes.filter(
        (route) =>
          route.liveAdapterFoundationReady &&
          route.deployableCashPnlInr >
            0,
      );

    const recommendedRoute =
      adapterReadyRoutes[
        0
      ] ??
      null;

    const pilotState:
      StrategyOneCapitalPlacementReport["pilot"]["state"] =
      routes.length ===
        0
        ? "NO_DATA"
        : recommendedRoute ===
            null
          ? "NO_ADAPTER_READY_ROUTE"
          : recommendedRoute
                .uniqueSettlements <
              MINIMUM_ROUTE_SAMPLE
            ? "COLLECTING"
            : "CANDIDATE_FOR_PREFLIGHT";

    return freeze({
      version:
        "91.0" as const,
      generatedAt:
        now,
      mode:
        "HISTORICAL_ADVISORY_ONLY" as const,
      basis:
        "UNIQUE_CREDIBLE_CLOSED_STRATEGY_ONE_SETTLEMENTS" as const,
      minimumRouteSample:
        MINIMUM_ROUTE_SAMPLE,
      evidence: {
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
      buyVenues,
      sellVenues,
      routes,
      pilot: {
        state:
          pilotState,
        requestedPerLegInr:
          TINY_LIVE_PILOT_PER_LEG_INR,
        minimumTwoLegInventoryInr:
          TINY_LIVE_PILOT_PER_LEG_INR *
          2 as 200,
        recommendedRoute,
        reasons:
          buildPilotReasons(
            pilotState,
            recommendedRoute,
          ),
        preflightRequired:
          true as const,
        currentOrderRulesVerified:
          false as const,
        currentBalancesVerified:
          false as const,
      },
      safety: {
        advisoryOnly:
          true as const,
        historicalEvidenceDoesNotAuthorizeLive:
          true as const,
        automaticFundMovementAllowed:
          false as const,
        transferInitiated:
          false as const,
        withdrawalInitiated:
          false as const,
        balanceMutated:
          false as const,
        liveExecutionAllowed:
          false as const,
        orderSubmissionAllowed:
          false as const,
      },
    });
  }

  private addTrade(
    aggregates:
      Map<string, MutablePlacementAggregate>,
    key:
      string,
    trade:
      PaperTrade & {
        actualProfit: number;
        closedAt: number;
      },
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
        buyExchange,
        sellExchange,
        baseAsset:
          assets.baseAsset,
        quoteAsset:
          assets.quoteAsset,
        uniqueSettlements:
          0,
        profitableSettlements:
          0,
        negativeSettlements:
          0,
        totalCapitalInr:
          0,
        realizedPnlInr:
          0,
        deployableCashPnlInr:
          0,
        feesInr:
          0,
        tdsWithheldInr:
          0,
        totalReturnPercent:
          0,
        lastSettledAt:
          0,
        markets:
          new Set<string>(),
      };

    aggregate.uniqueSettlements +=
      1;

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

    aggregate.totalCapitalInr +=
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

    aggregate.totalReturnPercent +=
      finiteOrZero(
        trade.actualProfitPercent ??
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

    aggregates.set(
      key,
      aggregate,
    );
  }

  private toRouteRank(
    aggregate:
      MutablePlacementAggregate,
    rank:
      number,
    liveAdapterExchanges:
      ReadonlySet<string>,
  ): StrategyOneCapitalPlacementRouteRank {
    const buyAdapterRegistered =
      liveAdapterExchanges.has(
        aggregate.buyExchange,
      );

    const sellAdapterRegistered =
      liveAdapterExchanges.has(
        aggregate.sellExchange,
      );

    return {
      rank,
      routeKey:
        aggregate.key,
      market:
        aggregate.market,
      baseAsset:
        aggregate.baseAsset,
      quoteAsset:
        aggregate.quoteAsset,
      buyExchange:
        aggregate.buyExchange,
      sellExchange:
        aggregate.sellExchange,
      uniqueSettlements:
        aggregate.uniqueSettlements,
      profitableSettlements:
        aggregate.profitableSettlements,
      negativeSettlements:
        aggregate.negativeSettlements,
      winRatePercent:
        percent(
          aggregate.profitableSettlements,
          aggregate.uniqueSettlements,
        ),
      totalCapitalInr:
        round(
          aggregate.totalCapitalInr,
        ),
      realizedPnlInr:
        round(
          aggregate.realizedPnlInr,
        ),
      deployableCashPnlInr:
        round(
          aggregate.deployableCashPnlInr,
        ),
      feesInr:
        round(
          aggregate.feesInr,
        ),
      tdsWithheldInr:
        round(
          aggregate.tdsWithheldInr,
        ),
      averageNetReturnPercent:
        round(
          aggregate.totalReturnPercent /
            aggregate.uniqueSettlements,
          4,
        ),
      lastSettledAt:
        aggregate.lastSettledAt,
      buyAdapterRegistered,
      sellAdapterRegistered,
      liveAdapterFoundationReady:
        buyAdapterRegistered &&
        sellAdapterRegistered,
      confidence:
        confidenceFor(
          aggregate.uniqueSettlements,
        ),
    };
  }

  private toVenueRanks(
    aggregates:
      ReadonlyMap<string, MutablePlacementAggregate>,
    side:
      "BUY" | "SELL",
    totalSettlements:
      number,
    liveAdapterExchanges:
      ReadonlySet<string>,
  ): StrategyOneCapitalPlacementVenueRank[] {
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
          uniqueSettlements:
            aggregate.uniqueSettlements,
          uniqueMarkets:
            aggregate.markets.size,
          profitableSettlements:
            aggregate.profitableSettlements,
          negativeSettlements:
            aggregate.negativeSettlements,
          winRatePercent:
            percent(
              aggregate.profitableSettlements,
              aggregate.uniqueSettlements,
            ),
          settlementSharePercent:
            percent(
              aggregate.uniqueSettlements,
              totalSettlements,
            ),
          totalCapitalInr:
            round(
              aggregate.totalCapitalInr,
            ),
          realizedPnlInr:
            round(
              aggregate.realizedPnlInr,
            ),
          deployableCashPnlInr:
            round(
              aggregate.deployableCashPnlInr,
            ),
          feesInr:
            round(
              aggregate.feesInr,
            ),
          tdsWithheldInr:
            round(
              aggregate.tdsWithheldInr,
            ),
          averageNetReturnPercent:
            round(
              aggregate.totalReturnPercent /
                aggregate.uniqueSettlements,
              4,
            ),
          liveAdapterRegistered:
            liveAdapterExchanges.has(
              aggregate.key,
            ),
          confidence:
            confidenceFor(
              aggregate.uniqueSettlements,
            ),
        }));
  }
}

function isStoredStrategyOneSettlement(
  trade:
    PaperTrade,
): trade is PaperTrade & {
  actualProfit: number;
  closedAt: number;
} {
  return (
    trade.strategyAttribution
      ?.attributionStatus ===
      "ATTRIBUTED" &&
    trade.strategyAttribution
      .strategyId ===
      CROSS_EXCHANGE_ARBITRAGE_STRATEGY_ID &&
    trade.status ===
      "closed" &&
    typeof trade.actualProfit ===
      "number" &&
    Number.isFinite(
      trade.actualProfit,
    ) &&
    typeof trade.closedAt ===
      "number" &&
    Number.isSafeInteger(
      trade.closedAt,
    ) &&
    trade.closedAt >
      0
  );
}

function compareAggregates(
  first:
    MutablePlacementAggregate,
  second:
    MutablePlacementAggregate,
): number {
  return (
    second.uniqueSettlements -
      first.uniqueSettlements ||
    second.deployableCashPnlInr -
      first.deployableCashPnlInr ||
    second.realizedPnlInr -
      first.realizedPnlInr ||
    second.totalReturnPercent /
        second.uniqueSettlements -
      first.totalReturnPercent /
        first.uniqueSettlements ||
    first.key.localeCompare(
      second.key,
    )
  );
}

function confidenceFor(
  settlements:
    number,
): StrategyOneCapitalPlacementConfidence {
  if (
    settlements >=
    HIGH_CONFIDENCE_SAMPLE
  ) {
    return "HIGH";
  }

  return settlements >=
    MINIMUM_ROUTE_SAMPLE
    ? "MEDIUM"
    : "LOW";
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
  decimalPlaces =
    2,
): number {
  if (
    !Number.isFinite(
      value,
    )
  ) {
    return 0;
  }

  const multiplier =
    10 **
    decimalPlaces;

  return Math.round(
    (
      value +
      Number.EPSILON
    ) *
      multiplier,
  ) /
    multiplier;
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

function buildPilotReasons(
  state:
    StrategyOneCapitalPlacementReport["pilot"]["state"],
  route:
    StrategyOneCapitalPlacementRouteRank | null,
): string[] {
  switch (
    state
  ) {
    case "NO_DATA":
      return [
        "No unique credible closed Strategy #1 settlement exists yet.",
      ];

    case "NO_ADAPTER_READY_ROUTE":
      return [
        "Historical routes exist, but no positive route currently has audited order-adapter foundations on both exchanges.",
      ];

    case "COLLECTING":
      return [
        `${route?.routeKey ?? "Candidate route"} has only ${route?.uniqueSettlements ?? 0}/${MINIMUM_ROUTE_SAMPLE} minimum historical settlements.`,
        "Continue PAPER evidence while checking current order rules and both authenticated balances.",
      ];

    case "CANDIDATE_FOR_PREFLIGHT":
      return [
        `${route?.routeKey ?? "Candidate route"} has the strongest adapter-ready durable settlement count.`,
        "Historical ranking is not a current opportunity; current depth, rules, fees and two-leg balances must pass Tiny-LIVE preflight.",
      ];
  }
}

function splitMarket(
  market:
    string,
): {
  baseAsset: string;
  quoteAsset: string;
} {
  const normalized =
    market
      .trim()
      .toUpperCase();

  const separated =
    normalized
      .split(
        /[_\-/]/,
      )
      .filter(
        Boolean,
      );

  if (
    separated.length >=
    2
  ) {
    return {
      baseAsset:
        separated[
          0
        ]!,
      quoteAsset:
        separated
          .slice(
            1,
          )
          .join(
            "",
          ),
    };
  }

  const quoteAssets = [
    "USDT",
    "USDC",
    "BUSD",
    "INR",
    "BTC",
    "ETH",
  ];

  const quoteAsset =
    quoteAssets.find(
      (candidate) =>
        normalized.endsWith(
          candidate,
        ) &&
        normalized.length >
          candidate.length,
    ) ??
    "QUOTE";

  return {
    baseAsset:
      quoteAsset ===
        "QUOTE"
        ? normalized
        : normalized.slice(
            0,
            -quoteAsset.length,
          ),
    quoteAsset,
  };
}

function freeze<T>(
  value:
    T,
): T {
  if (
    typeof value !==
      "object" ||
    value ===
      null ||
    Object.isFrozen(
      value,
    )
  ) {
    return value;
  }

  for (
    const nested
    of Object.values(
      value,
    )
  ) {
    freeze(
      nested,
    );
  }

  return Object.freeze(
    value,
  );
}

export const strategyOneCapitalPlacementService =
  new StrategyOneCapitalPlacementService();
