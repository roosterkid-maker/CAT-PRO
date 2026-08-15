import {
  CoinDCXSubscriptionAuditService,
} from "../../../diagnostics/services/CoinDCXSubscriptionAuditService";

import {
  CoinDCXOrderBookAdapter,
} from "../CoinDCXOrderBookAdapter";

import {
  rankPriceAlignedSharedMarkets,
  selectRotatingDiscoveryWindow,
} from "../../core/PriceAlignedMarketRanking";

import type {
  ExecutableQuote,
} from "../../../core/models/ExecutableQuote";

import {
  normalizeCoinDCXPublicTicker,
} from "../CoinDCXPublicTickerApi";

import {
  normalizeCoinDCXCurrencyRoles,
  type LoadedCoinDCXMarket,
} from "../marketLoader";

/*
 * Regression fixture mirrors CoinDCX's live BTCUSDT metadata. Their
 * "base" field is USDT and their "target" field is BTC.
 */
const currencyRoles =
  normalizeCoinDCXCurrencyRoles({
    symbol: "BTCUSDT",
    pair: "B-BTC_USDT",
    base_currency_short_name:
      "USDT",
    target_currency_short_name:
      "BTC",
  });

assertCondition(
  currencyRoles.baseCurrency ===
    "BTC" &&
    currencyRoles.quoteCurrency ===
      "USDT",
  "CoinDCX currency roles must be converted to conventional base/quote semantics.",
);

function assertCondition(
  condition: boolean,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(
      message,
    );
  }
}

function market(
  symbol: string,
  quoteCurrency =
    "USDT",
): LoadedCoinDCXMarket {
  return {
    symbol,
    pair:
      `B-${symbol}`,
    baseCurrency:
      symbol.replace(
        quoteCurrency,
        "",
      ),
    quoteCurrency,
    minimumQuantity:
      0.001,
    maximumQuantity:
      null,
    minimumPrice:
      0.01,
    maximumPrice:
      null,
    minimumNotional:
      1,
    pricePrecision:
      2,
    quantityPrecision:
      3,
    quantityStep:
      0.001,
    orderTypes: [
      "limit_order",
    ],
  };
}

function ticker(
  exchange: string,
  marketName: string,
  lastPrice: number,
): ExecutableQuote {
  return {
    exchange,
    market:
      marketName,
    lastPrice,
    bestBidPrice:
      null,
    bestBidQty:
      null,
    bestAskPrice:
      null,
    bestAskQty:
      null,
    spread:
      null,
    timestamp:
      1_700_000_000_000,
    source:
      "ticker",
    executable:
      false,
  };
}

function main(): void {
  const restTicker =
    normalizeCoinDCXPublicTicker(
      {
        market:
          "JUP_INR",
        last_price:
          "17.042",
        timestamp:
          1_700_000_000,
      },
      1_700_000_001_000,
    );

  assertCondition(
    restTicker !==
      null &&
      restTicker.market ===
        "JUPINR" &&
      restTicker.lastPrice ===
        17.042 &&
      restTicker.bestBidQty ===
        null &&
      restTicker.bestAskQty ===
        null &&
      restTicker.timestamp ===
        1_700_000_000_000,
    "CoinDCX public ticker discovery must normalize INR markets without fabricating executable quantities.",
  );

  const adapter =
    new CoinDCXOrderBookAdapter();

  const selector =
    adapter as unknown as {
      selectMarkets: (
        markets:
          readonly LoadedCoinDCXMarket[],
        maximumMarkets:
          number,
        coverage: {
          binance: Set<string>;
          bybit: Set<string>;
          unocoin: Set<string>;
          unocoinPriority: readonly string[];
          union: Set<string>;
          intersection: Set<string>;
        },
      ) => LoadedCoinDCXMarket[];
    };

  const selected =
    selector.selectMarkets(
      [
        market(
          "BTCUSDT",
        ),
        market(
          "ETHUSDT",
        ),
        market(
          "SOLUSDT",
        ),
        market(
          "XRPUSDT",
        ),
        market(
          "BTCINR",
          "INR",
        ),
      ],
      10,
      {
        binance:
          new Set([
            "ETHUSDT",
            "SOLUSDT",
          ]),
        bybit:
          new Set([
            "ETHUSDT",
          ]),
        unocoin:
          new Set([
            "BTCINR",
            "XRPUSDT",
          ]),
        unocoinPriority: [
          "BTCINR",
          "XRPUSDT",
        ],
        union:
          new Set([
            "ETHUSDT",
            "SOLUSDT",
          ]),
        intersection:
          new Set([
            "ETHUSDT",
          ]),
      },
    );

  const symbols =
    selected.map(
      (entry) =>
        entry.symbol,
    );

  assertCondition(
    symbols.join(
      ",",
    ) ===
      "BTCUSDT,BTCINR,XRPUSDT,ETHUSDT,SOLUSDT",
    "CoinDCX base selection must prioritize price-aligned UnoCoin markets, including INR routes, before the wider executable USDT universe.",
  );

  const aligned =
    rankPriceAlignedSharedMarkets(
      [
        ticker(
          "coindcx",
          "JUPINR",
          17.04,
        ),
        ticker(
          "coindcx",
          "DOGEUSDT",
          0.07,
        ),
      ],
      [
        ticker(
          "unocoin",
          "JUP_INR",
          17,
        ),
        ticker(
          "unocoin",
          "DOGE_USDT",
          0.16,
        ),
      ],
    );

  assertCondition(
    aligned.length ===
      1 &&
      aligned[0]
        ?.canonicalMarket ===
        "JUPINR",
    "Ticker discovery must retain close CoinDCX-UnoCoin markets and reject distorted indicative prices before scarce depth slots are assigned.",
  );

  const opportunityRanked =
    rankPriceAlignedSharedMarkets(
      [
        ticker(
          "coindcx",
          "USDTINR",
          99.9,
        ),
        ticker(
          "coindcx",
          "BCHINR",
          20_000,
        ),
        ticker(
          "coindcx",
          "LTCUSDT",
          70,
        ),
      ],
      [
        ticker(
          "unocoin",
          "USDT_INR",
          100,
        ),
        ticker(
          "unocoin",
          "BCH_INR",
          20_600,
        ),
        ticker(
          "unocoin",
          "LTC_USDT",
          73,
        ),
      ],
    );

  assertCondition(
    opportunityRanked
      .map(
        (candidate) =>
          candidate.canonicalMarket,
      )
      .join(
        ",",
      ) ===
      "BCHINR,USDTINR,LTCUSDT",
    "Bounded Strategy #1 discovery must prioritize credible INR markets and the larger safe separation before flat or non-INR markets.",
  );

  const firstDiscoveryWindow =
    selectRotatingDiscoveryWindow(
      [
        "USDCINR",
        "BTCINR",
        "COMPINR",
        "COTIINR",
        "BCHINR",
        "JUPINR",
      ],
      4,
      0,
    );

  const secondDiscoveryWindow =
    selectRotatingDiscoveryWindow(
      [
        "USDCINR",
        "BTCINR",
        "COMPINR",
        "COTIINR",
        "BCHINR",
        "JUPINR",
      ],
      4,
      firstDiscoveryWindow
        .nextCursor,
    );

  assertCondition(
    firstDiscoveryWindow
      .stableMarkets
      .join(",") ===
        "USDCINR,BTCINR,COMPINR" &&
      firstDiscoveryWindow
        .explorationMarkets
        .join(",") ===
        "COTIINR" &&
      secondDiscoveryWindow
        .stableMarkets
        .join(",") ===
        "USDCINR,BTCINR,COMPINR" &&
      secondDiscoveryWindow
        .explorationMarkets
        .join(",") ===
        "BCHINR",
    "Strategy #1 must retain a stable fast lane while rotating one scarce public-book slot through the next strongest markets.",
  );

  const audit =
    new CoinDCXSubscriptionAuditService();

  audit.recordJoin(
    "BTCUSDT",
    "B-BTC_USDT@orderbook@20",
    1_000,
  );

  audit.markFailed(
    "BTCUSDT",
  );

  const report =
    audit.getReport(
      2_000,
    );

  assertCondition(
    report.summary.requested ===
      0 &&
      report.summary.failed ===
        1,
    "Retired CoinDCX audit records must remain historical evidence without inflating active requested subscriptions.",
  );

  console.log(
    "COINDCX SHARED MARKET SELECTION TEST PASSED.",
  );

  console.log(
    "No socket, authenticated request, or order was created.",
  );
}

main();
