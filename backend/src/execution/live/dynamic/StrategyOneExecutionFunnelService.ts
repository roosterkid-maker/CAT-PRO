import type {
  ArbitrageOpportunity,
} from "../../../arbitrage/models/ArbitrageOpportunity";

import {
  opportunityService,
} from "../../../arbitrage/services/OpportunityService";

import type {
  ExecutableQuote,
} from "../../../core/models/ExecutableQuote";

import {
  marketCache,
} from "../../../services/cache.service";

import {
  strategyOneTwoLegLiveExecutionService,
  type StrategyOneTwoLegSessionRecord,
} from "../arbitrage/StrategyOneTwoLegLiveExecutionService";

import {
  isStrategyOneDirectionalRoute,
  normalizeStrategyOneExchange,
} from "../scope/StrategyOneExchangeScope";

import {
  strategyOneTinyLiveActionAuthorityService,
  type StrategyOneTinyLiveAuthorityRecord,
} from "../tiny-live/StrategyOneTinyLiveActionAuthorityService";

import {
  getTinyLiveMinimumNetProfitPercent,
} from "../tiny-live/StrategyOneControlledLiveConfiguration";

import {
  strategyOneExecutionFunnelMeter,
  type StrategyOneExecutionFunnelMeterSnapshot,
} from "./StrategyOneExecutionFunnelMeter";

interface StrategyOneExecutionFunnelDependencies {
  getMarketCacheDiagnostics(): ReturnType<typeof marketCache.getDiagnostics>;
  getExecutableQuotes(): readonly ExecutableQuote[];
  getCurrentOpportunities(): readonly ArbitrageOpportunity[];
  getMeter(): StrategyOneExecutionFunnelMeterSnapshot;
  getAuthorities(): readonly StrategyOneTinyLiveAuthorityRecord[];
  getSessions(): readonly StrategyOneTwoLegSessionRecord[];
  getMinimumNetProfitPercent(): number;
}

const DEFAULT_DEPENDENCIES:
  StrategyOneExecutionFunnelDependencies = {
  getMarketCacheDiagnostics: () =>
    marketCache.getDiagnostics(),
  getExecutableQuotes: () =>
    marketCache.getExecutable(),
  getCurrentOpportunities: () =>
    opportunityService
      .getLastOpportunitySnapshot()
      ?.opportunities ??
    [],
  getMeter: () =>
    strategyOneExecutionFunnelMeter
      .getSnapshot(),
  getAuthorities: () =>
    strategyOneTinyLiveActionAuthorityService
      .getDiagnostics()
      .records,
  getSessions: () =>
    strategyOneTwoLegLiveExecutionService
      .listSessions(),
  getMinimumNetProfitPercent: () =>
    getTinyLiveMinimumNetProfitPercent(),
};

export class StrategyOneExecutionFunnelService {
  private readonly dependencies:
    StrategyOneExecutionFunnelDependencies;

  constructor(
    dependencies:
      Partial<StrategyOneExecutionFunnelDependencies> = {},
  ) {
    this.dependencies = {
      ...DEFAULT_DEPENDENCIES,
      ...dependencies,
    };
  }

  getReport(
    now = Date.now(),
  ) {
    if (
      !Number.isSafeInteger(
        now,
      ) ||
      now <= 0
    ) {
      throw new Error(
        "Strategy #1 execution-funnel timestamp is invalid.",
      );
    }

    const cache =
      this.dependencies
        .getMarketCacheDiagnostics();
    const quotes =
      coreQuotes(
        this.dependencies
          .getExecutableQuotes(),
      );
    const currentRoutes =
      currentDirectionalRoutes(
        quotes,
      );
    const opportunities =
      this.dependencies
        .getCurrentOpportunities()
        .filter(
          (opportunity) =>
            isStrategyOneDirectionalRoute(
              opportunity.pair.buy.exchange,
              opportunity.pair.sell.exchange,
            ),
        );
    const meter =
      this.dependencies
        .getMeter();
    const authorities =
      this.dependencies
        .getAuthorities();
    const sessions =
      this.dependencies
        .getSessions();
    const minimumNetProfitPercent =
      this.dependencies
        .getMinimumNetProfitPercent();
    const realized =
      realizedNetProfit(
        sessions,
      );

    return deepFreeze({
      schemaVersion:
        "1.0" as const,
      generatedAt:
        now,
      strategy:
        "CROSS_EXCHANGE_ARBITRAGE_STRATEGY_ONE" as const,
      product:
        "SPOT" as const,
      scopes: {
        marketUpdates:
          "PROCESS_LIFETIME_EXECUTABLE_MUTATIONS" as const,
        discovery:
          "CURRENT_CORE_EXECUTABLE_QUOTE_SNAPSHOT" as const,
        dynamicAndPreflight:
          meter.scope,
        authorityAndExecution:
          "DURABLE_JOURNAL_LIFETIME" as const,
      },
      counters: {
        marketUpdates:
          cache.executableMarketMutations,
        sharedMarkets:
          new Set(
            currentRoutes.map(
              (route) =>
                route.market,
            ),
          ).size,
        evaluatedRoutes:
          currentRoutes.length,
        grossSpreadPositive:
          currentRoutes.filter(
            (route) =>
              route.sellBestBid >
              route.buyBestAsk,
          ).length,
        netProfitPositive:
          opportunities.filter(
            (opportunity) =>
              opportunity.netProfitPercent >
              0,
          ).length,
        qualifiedRoutes:
          opportunities.filter(
            (opportunity) =>
              opportunity.netProfitPercent >=
              minimumNetProfitPercent,
          ).length,
        dynamicExecuteRecommendations:
          meter.dynamicExecuteRecommendations,
        dynamicWaitRecommendations:
          meter.dynamicWaitRecommendations,
        preflightAttempts:
          meter.preflightAttempts,
        preflightPassed:
          meter.preflightPassed,
        preflightRejected:
          meter.preflightRejected,
        authoritiesPreviewed:
          authorities.length,
        authoritiesArmed:
          authorities.filter(
            (authority) =>
              authority.authorizedAt !==
              null,
          ).length,
        authoritiesConsumed:
          authorities.filter(
            (authority) =>
              authority.consumedAt !==
              null,
          ).length,
        orderPairsSubmitted:
          sessions.filter(
            bothOrdersSubmitted,
          ).length,
        buyOrdersAccepted:
          sessions.filter(
            (session) =>
              orderAccepted(
                session.buyResponse,
              ),
          ).length,
        sellOrdersAccepted:
          sessions.filter(
            (session) =>
              orderAccepted(
                session.sellResponse,
              ),
          ).length,
        buyFilled:
          sessions.filter(
            (session) =>
              orderFilled(
                session.buyResponse,
              ),
          ).length,
        sellFilled:
          sessions.filter(
            (session) =>
              orderFilled(
                session.sellResponse,
              ),
          ).length,
        completedTrades:
          sessions.filter(
            (session) =>
              session.state ===
              "COMPLETED",
          ).length,
        recoveryRequired:
          sessions.filter(
            (session) =>
              session.state ===
                "RECOVERY_REQUIRED" ||
              session.state ===
                "POSSIBLE_EXPOSURE",
          ).length,
        failedAttempts:
          sessions.filter(
            (session) =>
              session.state ===
              "FAILED",
          ).length,
        realizedNetProfit:
          realized.value,
      },
      realizedNetProfit: {
        value:
          realized.value,
        asset:
          realized.asset,
        status:
          realized.status,
        explanation:
          realized.explanation,
      },
      rejectionAnalytics: {
        counts:
          meter.rejectionCounts,
        recentDetailedRejections:
          meter.recentDetailedRejections,
        maximumRecentDetails:
          50,
      },
      safety: {
        readOnly:
          true as const,
        liveOrderAuthorityGranted:
          false as const,
        capitalReserved:
          false as const,
        orderSubmitted:
          false as const,
        nonCoreExchangesExcluded:
          true as const,
        paperProfitIncluded:
          false as const,
      },
    });
  }
}

interface CurrentDirectionalRoute {
  readonly market: string;
  readonly buyExchange: string;
  readonly sellExchange: string;
  readonly buyBestAsk: number;
  readonly sellBestBid: number;
}

function coreQuotes(
  quotes: readonly ExecutableQuote[],
): readonly ExecutableQuote[] {
  return quotes.filter(
    (quote) =>
      [
        "binance",
        "bybit",
        "coindcx",
      ].includes(
        normalizeStrategyOneExchange(
          quote.exchange,
        ),
      ) &&
      quote.executable &&
      positive(
        quote.bestAskPrice,
      ) &&
      positive(
        quote.bestBidPrice,
      ),
  );
}

function currentDirectionalRoutes(
  quotes: readonly ExecutableQuote[],
): readonly CurrentDirectionalRoute[] {
  const byMarket =
    new Map<string, ExecutableQuote[]>();

  for (const quote of quotes) {
    const market =
      quote.market
        .trim()
        .toUpperCase();
    const current =
      byMarket.get(
        market,
      ) ??
      [];
    current.push(
      quote,
    );
    byMarket.set(
      market,
      current,
    );
  }

  const routes:
    CurrentDirectionalRoute[] = [];

  for (
    const [
      market,
      marketQuotes,
    ] of byMarket
  ) {
    for (const buy of marketQuotes) {
      for (const sell of marketQuotes) {
        if (
          buy === sell ||
          !isStrategyOneDirectionalRoute(
            buy.exchange,
            sell.exchange,
          )
        ) {
          continue;
        }

        routes.push({
          market,
          buyExchange:
            normalizeStrategyOneExchange(
              buy.exchange,
            ),
          sellExchange:
            normalizeStrategyOneExchange(
              sell.exchange,
            ),
          buyBestAsk:
            buy.bestAskPrice as number,
          sellBestBid:
            sell.bestBidPrice as number,
        });
      }
    }
  }

  return routes;
}

function bothOrdersSubmitted(
  session: StrategyOneTwoLegSessionRecord,
): boolean {
  return (
    session.buyResponse
      ?.record
      ?.orderSubmissionPerformed ===
      true &&
    session.sellResponse
      ?.record
      ?.orderSubmissionPerformed ===
      true
  );
}

function orderAccepted(
  response:
    StrategyOneTwoLegSessionRecord["buyResponse"],
): boolean {
  return Boolean(
    response
      ?.record
      ?.result
      ?.orderId,
  );
}

function orderFilled(
  response:
    StrategyOneTwoLegSessionRecord["buyResponse"],
): boolean {
  return (
    response
      ?.record
      ?.result
      ?.status ===
      "FILLED" &&
    (
      response.record.result.filledQuantity ??
      0
    ) >
      0
  );
}

function realizedNetProfit(
  sessions: readonly StrategyOneTwoLegSessionRecord[],
): {
  readonly value: number | null;
  readonly asset: string | null;
  readonly status:
    | "NO_COMPLETED_LIVE_TRADE"
    | "AUTHORITATIVE_QUOTE_ASSET_TOTAL"
    | "EVIDENCE_INCOMPLETE";
  readonly explanation: string;
} {
  const completed =
    sessions.filter(
      (session) =>
        session.state ===
        "COMPLETED",
    );

  if (completed.length === 0) {
    return {
      value:
        0,
      asset:
        null,
      status:
        "NO_COMPLETED_LIVE_TRADE",
      explanation:
        "No genuine completed LIVE Strategy #1 pair exists; PAPER or fixture P&L is excluded.",
    };
  }

  let total =
    0;
  let commonAsset:
    string | null = null;

  for (const session of completed) {
    const buy =
      session.buyResponse
        ?.record
        ?.feeEvidence;
    const sell =
      session.sellResponse
        ?.record
        ?.feeEvidence;
    const quoteAsset =
      inferQuoteAsset(
        session.buyRequest.market,
      );

    if (
      !buy?.complete ||
      !sell?.complete ||
      !quoteAsset ||
      buy.fees.some(
        (fee) =>
          fee.asset.toUpperCase() !==
          quoteAsset,
      ) ||
      sell.fees.some(
        (fee) =>
          fee.asset.toUpperCase() !==
          quoteAsset,
      ) ||
      (
        commonAsset !== null &&
        commonAsset !==
          quoteAsset
      )
    ) {
      return {
        value:
          null,
        asset:
          null,
        status:
          "EVIDENCE_INCOMPLETE",
        explanation:
          "Completed pair evidence cannot be reduced to one quote-asset P&L without inventing fee conversion or tax-settlement evidence.",
      };
    }

    commonAsset =
      quoteAsset;
    const fees =
      [
        ...buy.fees,
        ...sell.fees,
      ].reduce(
        (sum, fee) =>
          sum +
          fee.amount,
        0,
      );
    total +=
      sell.observedQuoteQuantity -
      buy.observedQuoteQuantity -
      fees;
  }

  return {
    value:
      normalize(
        total,
      ),
    asset:
      commonAsset,
    status:
      "AUTHORITATIVE_QUOTE_ASSET_TOTAL",
    explanation:
      "Calculated only from completed LIVE pair fill evidence whose fees are entirely denominated in one common quote asset.",
  };
}

function inferQuoteAsset(
  marketValue: string,
): string | null {
  const market =
    marketValue
      .trim()
      .toUpperCase()
      .replace(
        /[^A-Z0-9]/gu,
        "",
      );

  for (
    const quote
    of [
      "USDT",
      "USDC",
      "INR",
      "BTC",
      "ETH",
    ]
  ) {
    if (
      market.endsWith(
        quote,
      ) &&
      market.length >
        quote.length
    ) {
      return quote;
    }
  }

  return null;
}

function positive(
  value: number | null,
): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(
      value,
    ) &&
    value > 0
  );
}

function normalize(
  value: number,
): number {
  return Number(
    value.toPrecision(
      15,
    ),
  );
}

function deepFreeze<T>(
  value: T,
): T {
  if (
    value !== null &&
    typeof value === "object" &&
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

export const strategyOneExecutionFunnelService =
  new StrategyOneExecutionFunnelService();
