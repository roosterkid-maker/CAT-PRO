export type CrossExchangeMarketMakingAggressorSide =
  | "BUY"
  | "SELL";

export type CrossExchangeMarketMakingPublicTradeSource =
  | "BINANCE_AGG_TRADE"
  | "BYBIT_PUBLIC_TRADE";

export interface CrossExchangeMarketMakingPublicTrade {
  readonly id:
    string;

  readonly exchange:
    string;

  readonly market:
    string;

  readonly price:
    number;

  readonly quantity:
    number;

  readonly occurredAt:
    number;

  readonly aggressorSide:
    CrossExchangeMarketMakingAggressorSide;

  readonly source:
    CrossExchangeMarketMakingPublicTradeSource;
}

export interface CrossExchangeMarketMakingPublicTradeTapeDiagnostics {
  readonly watchedRoutes:
    number;

  readonly retainedTrades:
    number;

  readonly acceptedTrades:
    number;

  readonly ignoredUnwatchedTrades:
    number;

  readonly rejectedInvalidTrades:
    number;

  readonly duplicateTradesIgnored:
    number;

  readonly evictedTrades:
    number;

  readonly maximumTradesPerRoute:
    number;

  readonly safety: {
    readonly publicMarketDataOnly:
      true;

    readonly exchangeFillClaimed:
      false;

    readonly orderSubmissionAllowed:
      false;
  };
}

const DEFAULT_MAXIMUM_TRADES_PER_ROUTE =
  10_000;

/**
 * Bounded public-trade evidence for explicitly watched XEMM maker routes.
 *
 * This service records exchange-reported public prints. It does not claim
 * that any print filled a simulated order; queue allocation remains a
 * separate, explicitly modeled SHADOW concern.
 */
export class CrossExchangeMarketMakingPublicTradeTapeService {
  private readonly watchedRoutes =
    new Set<string>();

  private readonly tradesByRoute =
    new Map<
      string,
      CrossExchangeMarketMakingPublicTrade[]
    >();

  private readonly tradeIdsByRoute =
    new Map<
      string,
      Set<string>
    >();

  private acceptedTrades =
    0;

  private ignoredUnwatchedTrades =
    0;

  private rejectedInvalidTrades =
    0;

  private duplicateTradesIgnored =
    0;

  private evictedTrades =
    0;

  constructor(
    private readonly maximumTradesPerRoute =
      DEFAULT_MAXIMUM_TRADES_PER_ROUTE,
  ) {
    if (
      !Number.isSafeInteger(
        maximumTradesPerRoute,
      ) ||
      maximumTradesPerRoute <
        1
    ) {
      throw new Error(
        "maximumTradesPerRoute must be a positive safe integer.",
      );
    }
  }

  watch(
    exchange:
      string,
    markets:
      readonly string[],
  ): void {
    const normalizedExchange =
      normalizeExchange(
        exchange,
      );

    if (
      !normalizedExchange
    ) {
      return;
    }

    for (
      const market
      of markets
    ) {
      const normalizedMarket =
        normalizeMarket(
          market,
        );

      if (
        normalizedMarket
      ) {
        this.watchedRoutes.add(
          routeKey(
            normalizedExchange,
            normalizedMarket,
          ),
        );
      }
    }
  }

  isWatched(
    exchange:
      string,
    market:
      string,
  ): boolean {
    return this.watchedRoutes.has(
      routeKey(
        normalizeExchange(
          exchange,
        ),
        normalizeMarket(
          market,
        ),
      ),
    );
  }

  getWatchedMarkets(
    exchange:
      string,
  ): readonly string[] {
    const normalizedExchange =
      normalizeExchange(
        exchange,
      );
    const prefix =
      `${normalizedExchange}:`;

    return Array.from(
      this.watchedRoutes,
    ).filter(
      (key) =>
        key.startsWith(
          prefix,
        ),
    ).map(
      (key) =>
        key.slice(
          prefix.length,
        ),
    ).sort();
  }

  record(
    input:
      CrossExchangeMarketMakingPublicTrade,
  ): boolean {
    const trade =
      normalizeTrade(
        input,
      );

    if (
      !trade
    ) {
      this.rejectedInvalidTrades +=
        1;

      return false;
    }

    const key =
      routeKey(
        trade.exchange,
        trade.market,
      );

    if (
      !this.watchedRoutes.has(
        key,
      )
    ) {
      this.ignoredUnwatchedTrades +=
        1;

      return false;
    }

    const ids =
      this.tradeIdsByRoute.get(
        key,
      ) ??
      new Set<string>();

    if (
      ids.has(
        trade.id,
      )
    ) {
      this.duplicateTradesIgnored +=
        1;

      return false;
    }

    const trades =
      this.tradesByRoute.get(
        key,
      ) ??
      [];

    trades.push(
      trade,
    );
    ids.add(
      trade.id,
    );

    while (
      trades.length >
      this.maximumTradesPerRoute
    ) {
      const removed =
        trades.shift();

      if (
        removed
      ) {
        ids.delete(
          removed.id,
        );
        this.evictedTrades +=
          1;
      }
    }

    this.tradesByRoute.set(
      key,
      trades,
    );
    this.tradeIdsByRoute.set(
      key,
      ids,
    );
    this.acceptedTrades +=
      1;

    return true;
  }

  getTrades(
    exchange:
      string,
    market:
      string,
    afterExclusive:
      number,
    throughInclusive:
      number,
  ): readonly CrossExchangeMarketMakingPublicTrade[] {
    if (
      !Number.isFinite(
        afterExclusive,
      ) ||
      !Number.isFinite(
        throughInclusive,
      ) ||
      throughInclusive <
        afterExclusive
    ) {
      return [];
    }

    const trades =
      this.tradesByRoute.get(
        routeKey(
          normalizeExchange(
            exchange,
          ),
          normalizeMarket(
            market,
          ),
        ),
      ) ??
      [];

    return immutableClone(
      trades.filter(
        (trade) =>
          trade.occurredAt >
            afterExclusive &&
          trade.occurredAt <=
            throughInclusive,
      ).sort(
        (first, second) =>
          first.occurredAt -
            second.occurredAt ||
          first.id.localeCompare(
            second.id,
          ),
      ),
    );
  }

  getDiagnostics():
    CrossExchangeMarketMakingPublicTradeTapeDiagnostics {
    return immutableClone({
      watchedRoutes:
        this.watchedRoutes.size,
      retainedTrades:
        Array.from(
          this.tradesByRoute.values(),
        ).reduce(
          (total, trades) =>
            total +
            trades.length,
          0,
        ),
      acceptedTrades:
        this.acceptedTrades,
      ignoredUnwatchedTrades:
        this.ignoredUnwatchedTrades,
      rejectedInvalidTrades:
        this.rejectedInvalidTrades,
      duplicateTradesIgnored:
        this.duplicateTradesIgnored,
      evictedTrades:
        this.evictedTrades,
      maximumTradesPerRoute:
        this.maximumTradesPerRoute,
      safety: {
        publicMarketDataOnly:
          true,
        exchangeFillClaimed:
          false,
        orderSubmissionAllowed:
          false,
      },
    });
  }
}

export const crossExchangeMarketMakingPublicTradeTapeService =
  new CrossExchangeMarketMakingPublicTradeTapeService();

function normalizeTrade(
  input:
    CrossExchangeMarketMakingPublicTrade,
): CrossExchangeMarketMakingPublicTrade | null {
  const id =
    typeof input?.id ===
      "string"
      ? input.id.trim()
      : "";
  const exchange =
    normalizeExchange(
      input?.exchange ??
        "",
    );
  const market =
    normalizeMarket(
      input?.market ??
        "",
    );

  if (
    !id ||
    !exchange ||
    !market ||
    !Number.isFinite(
      input.price,
    ) ||
    input.price <=
      0 ||
    !Number.isFinite(
      input.quantity,
    ) ||
    input.quantity <=
      0 ||
    !Number.isSafeInteger(
      input.occurredAt,
    ) ||
    input.occurredAt <=
      0 ||
    (
      input.aggressorSide !==
        "BUY" &&
      input.aggressorSide !==
        "SELL"
    ) ||
    (
      input.source !==
        "BINANCE_AGG_TRADE" &&
      input.source !==
        "BYBIT_PUBLIC_TRADE"
    )
  ) {
    return null;
  }

  return Object.freeze({
    id,
    exchange,
    market,
    price:
      input.price,
    quantity:
      input.quantity,
    occurredAt:
      input.occurredAt,
    aggressorSide:
      input.aggressorSide,
    source:
      input.source,
  });
}

function normalizeExchange(
  exchange:
    string,
): string {
  return exchange
    .trim()
    .toLowerCase();
}

function normalizeMarket(
  market:
    string,
): string {
  return market
    .trim()
    .toUpperCase()
    .replace(
      /[\s_\-/]+/g,
      "",
    );
}

function routeKey(
  exchange:
    string,
  market:
    string,
): string {
  return `${exchange}:${market}`;
}

function immutableClone<T>(
  value:
    T,
): T {
  return deepFreeze(
    structuredClone(
      value,
    ),
  );
}

function deepFreeze<T>(
  value:
    T,
): T {
  if (
    value ===
      null ||
    typeof value !==
      "object" ||
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
    deepFreeze(
      nested,
    );
  }

  return Object.freeze(
    value,
  );
}
