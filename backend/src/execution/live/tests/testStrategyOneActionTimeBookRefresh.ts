import assert from "node:assert/strict";

import type {
  ArbitrageOpportunity,
} from "../../../arbitrage/models/ArbitrageOpportunity";

import {
  BinanceAdapter,
  buildBinanceActionTimeOrderBookUrl,
} from "../../../exchanges/binance/BinanceAdapter";

import {
  BybitAdapter,
  buildBybitActionTimeOrderBookUrl,
} from "../../../exchanges/bybit/BybitAdapter";

import {
  StrategyOneActionTimeBookRefreshService,
} from "../tiny-live/StrategyOneActionTimeBookRefreshService";

const NOW =
  1_787_203_000_000;

async function main(): Promise<void> {
  testBinanceActionTimePublicEndpointIsolation();
  testBybitActionTimePublicEndpointIsolation();
  await testBinanceValidatedSnapshotPublication();
  await testBybitValidatedSnapshotPublication();
  await testParallelRefreshAndFreshOpportunityReevaluation();
  await testReviewAdvancesButSkipRemainsBlocked();
  await testBybitBasketRouteParallelRefresh();
  await testFailedLegBlocksWithoutReevaluation();
  await testHungLegFailsClosedAndReleasesInFlight();
  await testExactRejectionEvidenceIsPreserved();
  await testAuthorizedFinalRefreshIsParallelAndPublicOnly();
  await testAuthorizedFinalRefreshFailsClosed();

  console.log(
    "V190 action-time book refresh passed: policy-qualified dynamic-pool venues use parallel public reads only on stale fallback, refreshed EXECUTE/REVIEW candidates advance to explicit preflight, SKIP and refresh failures stay blocked, and no threshold/order/fund authority exists.",
  );
}

async function testReviewAdvancesButSkipRemainsBlocked(): Promise<void> {
  const buildService = (decision: "REVIEW" | "SKIP") => {
    const refreshedOpportunity = {
      ...opportunity(`fresh-${decision.toLowerCase()}`, NOW + 20),
      decision,
      score: decision === "REVIEW" ? 79 : 40,
    };

    return new StrategyOneActionTimeBookRefreshService({
      refreshCoinDCX: async (market) => ({
        exchange: "coindcx",
        market,
        accepted: true,
        requestedAt: NOW,
        receivedAt: NOW + 20,
        roundTripMs: 20,
        error: null,
      }),
      refreshBinance: async (market) => ({
        exchange: "binance",
        market,
        accepted: true,
        requestedAt: NOW,
        receivedAt: NOW + 20,
        roundTripMs: 20,
        error: null,
      }),
      evaluateExactRoute: () => ({
        evaluatedAt: NOW + 20,
        opportunity: refreshedOpportunity,
        rejection: null,
        evidence: {
          buyPrice: refreshedOpportunity.buyPrice,
          sellPrice: refreshedOpportunity.sellPrice,
          buyQuantity: refreshedOpportunity.buyAvailableQty,
          sellQuantity: refreshedOpportunity.sellAvailableQty,
          buyTimestamp: NOW + 20,
          sellTimestamp: NOW + 20,
          rawSpreadPercent: refreshedOpportunity.rawSpreadPercent,
        },
        reason: "Exact route passed the central explicit analyzers.",
      }),
      now: () => NOW + 20,
    });
  };

  const review = await buildService("REVIEW").refresh({
    market: "COTIUSDT",
    buyExchange: "coindcx",
    sellExchange: "binance",
  });
  assert.equal(review.state, "REFRESHED");
  assert.equal(review.opportunity?.decision, "REVIEW");
  assert.equal(review.safety.thresholdChanged, false);
  assert.equal(review.safety.orderSubmissionAllowed, false);

  const skip = await buildService("SKIP").refresh({
    market: "COTIUSDT",
    buyExchange: "coindcx",
    sellExchange: "binance",
  });
  assert.equal(skip.state, "BLOCKED");
  assert.equal(skip.opportunity, null);
  assert.match(skip.blocker ?? "", /decision SKIP/iu);
}

async function testAuthorizedFinalRefreshIsParallelAndPublicOnly(): Promise<void> {
  let coinDCXStarted = false;
  let bybitStarted = false;
  let evaluations = 0;
  let releaseReads: () => void = () => {
    throw new Error("Authorized final read gate was not initialized.");
  };
  const readGate = new Promise<void>((resolve) => {
    releaseReads = resolve;
  });
  const service = new StrategyOneActionTimeBookRefreshService({
    refreshCoinDCX: async (market, timeoutMs) => {
      coinDCXStarted = true;
      assert.equal(market, "SANDUSDT");
      assert.equal(timeoutMs, 190);
      await readGate;
      return {
        exchange: "coindcx",
        market,
        accepted: true,
        requestedAt: NOW,
        receivedAt: NOW + 18,
        roundTripMs: 18,
        error: null,
      };
    },
    refreshBybit: async (market, timeoutMs) => {
      bybitStarted = true;
      assert.equal(market, "SANDUSDT");
      assert.equal(timeoutMs, 190);
      await readGate;
      return {
        exchange: "bybit",
        market,
        accepted: true,
        requestedAt: NOW,
        receivedAt: NOW + 15,
        roundTripMs: 15,
        error: null,
      };
    },
    evaluateExactRoute: () => {
      evaluations += 1;
      throw new Error("The authorized final refresh must not mint an opportunity.");
    },
    now: () => NOW + 18,
  });

  const pending = service.refreshForAuthorizedAttempt({
    market: "SANDUSDT",
    buyExchange: "bybit",
    sellExchange: "coindcx",
  });

  await Promise.resolve();
  assert.equal(bybitStarted, true);
  assert.equal(coinDCXStarted, true);
  releaseReads();

  const result = await pending;
  assert.equal(result.state, "REFRESHED");
  assert.equal(result.schemaVersion, "188.2");
  assert.equal(result.legs.length, 2);
  assert.equal(evaluations, 0);
  assert.equal(result.safety.publicReadOnly, true);
  assert.equal(result.safety.authorizedAttemptOnly, true);
  assert.equal(result.safety.thresholdChanged, false);
  assert.equal(result.safety.orderSubmissionAllowed, false);

  const diagnostics = service.getDiagnostics();
  assert.equal(diagnostics.finalRefreshAttempts, 1);
  assert.equal(diagnostics.finalRefreshes, 1);
  assert.equal(diagnostics.finalRefreshBlocks, 0);
}

async function testAuthorizedFinalRefreshFailsClosed(): Promise<void> {
  let evaluations = 0;
  const service = new StrategyOneActionTimeBookRefreshService({
    refreshCoinDCX: async (market) => ({
      exchange: "coindcx",
      market,
      accepted: false,
      requestedAt: NOW,
      receivedAt: null,
      roundTripMs: 190,
      error: "bounded timeout",
    }),
    refreshBybit: async (market) => ({
      exchange: "bybit",
      market,
      accepted: true,
      requestedAt: NOW,
      receivedAt: NOW + 12,
      roundTripMs: 12,
      error: null,
    }),
    evaluateExactRoute: () => {
      evaluations += 1;
      throw new Error("A partial final refresh must never be evaluated.");
    },
    now: () => NOW + 190,
  });

  const result = await service.refreshForAuthorizedAttempt({
    market: "SANDUSDT",
    buyExchange: "bybit",
    sellExchange: "coindcx",
  });

  assert.equal(result.state, "BLOCKED");
  assert.match(result.blocker ?? "", /coindcx.*bounded timeout/iu);
  assert.equal(evaluations, 0);
  assert.equal(service.getDiagnostics().finalRefreshBlocks, 1);
}

async function testHungLegFailsClosedAndReleasesInFlight(): Promise<void> {
  let evaluations =
    0;

  const never =
    new Promise<never>(
      () => undefined,
    );

  const service =
    new StrategyOneActionTimeBookRefreshService({
      refreshCoinDCX: async () =>
        never,
      refreshBinance: async (
        market,
      ) => ({
        exchange:
          "binance",
        market,
        accepted:
          true,
        requestedAt:
          NOW,
        receivedAt:
          NOW + 10,
        roundTripMs:
          10,
        error:
          null,
      }),
      evaluateExactRoute: () => {
        evaluations +=
          1;

        throw new Error(
          "A timed-out refresh must never reach exact-route evaluation.",
        );
      },
      now:
        Date.now,
    });

  const result =
    await service
      .refresh({
        market:
          "COTIUSDT",
        buyExchange:
          "coindcx",
        sellExchange:
          "binance",
      });

  assert.equal(
    result.state,
    "BLOCKED",
  );

  assert.match(
    result.blocker ??
      "",
    /service-owned deadline/iu,
  );

  assert.equal(
    evaluations,
    0,
  );

  const diagnostics =
    service
      .getDiagnostics();

  assert.equal(
    diagnostics.inFlight,
    0,
    "A hung adapter must not keep the Tiny-LIVE route lock forever.",
  );

  assert.equal(
    diagnostics.blocked,
    1,
  );
}

function testBybitActionTimePublicEndpointIsolation(): void {
  const url = buildBybitActionTimeOrderBookUrl("GPSUSDT");

  assert.equal(url.pathname, "/v5/market/orderbook");
  assert.equal(url.searchParams.get("category"), "spot");
  assert.equal(url.searchParams.get("symbol"), "GPSUSDT");
  assert.equal(url.searchParams.get("limit"), "50");
}

async function testBybitValidatedSnapshotPublication(): Promise<void> {
  const adapter = new BybitAdapter({
    fetch: async () => ({
      retCode: 0,
      retMsg: "OK",
      result: {
        s: "GPSUSDT",
        b: [["0.01000", "700"]],
        a: [["0.01001", "800"]],
        u: 1,
        seq: 2,
      },
    }),
  });

  const accepted = await adapter.refreshOrderBookSnapshot("GPSUSDT", 190);
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.exchange, "bybit");

  const invalid = new BybitAdapter({
    fetch: async () => ({
      retCode: 0,
      retMsg: "OK",
      result: {s: "GPSUSDT", b: [], a: []},
    }),
  });

  assert.equal(
    (await invalid.refreshOrderBookSnapshot("GPSUSDT", 190)).accepted,
    false,
  );
}

async function testExactRejectionEvidenceIsPreserved(): Promise<void> {
  const service =
    new StrategyOneActionTimeBookRefreshService({
      refreshCoinDCX: async (
        market,
      ) => ({
        exchange:
          "coindcx",
        market,
        accepted:
          true,
        requestedAt:
          NOW,
        receivedAt:
          NOW + 12,
        roundTripMs:
          12,
        error:
          null,
      }),
      refreshBinance: async (
        market,
      ) => ({
        exchange:
          "binance",
        market,
        accepted:
          true,
        requestedAt:
          NOW,
        receivedAt:
          NOW + 18,
        roundTripMs:
          18,
        error:
          null,
      }),
      evaluateExactRoute: () => ({
        evaluatedAt:
          NOW + 18,
        opportunity:
          null,
        rejection:
          null,
        evidence: {
          buyPrice:
            0.0101,
          sellPrice:
            0.01,
          buyQuantity:
            900,
          sellQuantity:
            800,
          buyTimestamp:
            NOW + 12,
          sellTimestamp:
            NOW + 18,
          rawSpreadPercent:
            -0.990099,
        },
        reason:
          "The refreshed route has a non-positive raw spread (-0.990099%).",
      }),
      now: () =>
        NOW + 18,
    });

  const result =
    await service.refresh({
      market:
        "COTIUSDT",
      buyExchange:
        "coindcx",
      sellExchange:
        "binance",
    });

  assert.equal(
    result.state,
    "BLOCKED",
  );
  assert.equal(
    result.evaluation?.evidence.buyPrice,
    0.0101,
  );
  assert.match(
    result.blocker ??
      "",
    /non-positive raw spread.*BUY ask 0\.0101.*SELL bid 0\.01/iu,
  );
}

function testBinanceActionTimePublicEndpointIsolation(): void {
  const url =
    buildBinanceActionTimeOrderBookUrl(
      "COTIUSDT",
    );

  assert.equal(
    url.pathname,
    "/api/v3/depth",
  );
  assert.equal(
    url.searchParams.get(
      "symbol",
    ),
    "COTIUSDT",
  );
  assert.equal(
    url.searchParams.get(
      "limit",
    ),
    "20",
  );
  assert.notEqual(
    url.origin,
    "https://data-api.binance.vision",
    "The action-time path must stay isolated from the slower catalog host.",
  );
}

async function testBinanceValidatedSnapshotPublication(): Promise<void> {
  const adapter =
    new BinanceAdapter({
      fetch: async () => ({
        lastUpdateId:
          1,
        bids: [
          [
            "0.01000",
            "700",
          ],
        ],
        asks: [
          [
            "0.01001",
            "800",
          ],
        ],
      }),
    });

  const accepted =
    await adapter
      .refreshOrderBookSnapshot(
        "COTIUSDT",
        190,
      );

  assert.equal(
    accepted.accepted,
    true,
  );

  assert.equal(
    accepted.exchange,
    "binance",
  );

  const invalid =
    new BinanceAdapter({
      fetch: async () => ({
        bids:
          [],
        asks:
          [],
      }),
    });

  assert.equal(
    (
      await invalid
        .refreshOrderBookSnapshot(
          "COTIUSDT",
          190,
        )
    ).accepted,
    false,
  );
}

async function testParallelRefreshAndFreshOpportunityReevaluation(): Promise<void> {
  let clock =
    NOW;

  let releaseReads: () => void =
    () => {
      throw new Error(
        "Parallel read gate was not initialized.",
      );
    };

  const readGate =
    new Promise<void>(
      (
        resolve,
      ) => {
        releaseReads =
          resolve;
      },
    );

  let coinDCXStarted =
    false;

  let binanceStarted =
    false;

  let coinDCXCalls =
    0;

  let binanceCalls =
    0;

  let evaluations =
    0;

  const refreshedOpportunity =
    opportunity(
      "fresh-coti",
      NOW +
        20,
    );

  const service =
    new StrategyOneActionTimeBookRefreshService({
      refreshCoinDCX: async (
        market,
        timeoutMs,
      ) => {
        coinDCXStarted =
          true;
        coinDCXCalls +=
          1;

        assert.equal(
          market,
          "COTIUSDT",
        );
        assert.equal(
          timeoutMs,
          190,
        );

        await readGate;

        return {
          exchange:
            "coindcx",
          market,
          accepted:
            true,
          requestedAt:
            NOW,
          receivedAt:
            NOW +
            20,
          roundTripMs:
            20,
          error:
            null,
        };
      },
      refreshBinance: async (
        market,
        timeoutMs,
      ) => {
        binanceStarted =
          true;
        binanceCalls +=
          1;

        assert.equal(
          market,
          "COTIUSDT",
        );
        assert.equal(
          timeoutMs,
          190,
        );

        await readGate;

        return {
          exchange:
            "binance",
          market,
          accepted:
            true,
          requestedAt:
            NOW,
          receivedAt:
            NOW +
            20,
          roundTripMs:
            20,
          error:
            null,
        };
      },
      evaluateExactRoute: (
        input,
      ) => {
        evaluations +=
          1;

        assert.equal(
          input.minimumBuyTimestamp,
          NOW + 20,
        );
        assert.equal(
          input.minimumSellTimestamp,
          NOW + 20,
        );

        return {
          evaluatedAt:
            NOW + 20,
          opportunity:
            refreshedOpportunity,
          rejection:
            null,
          evidence: {
            buyPrice:
              refreshedOpportunity.buyPrice,
            sellPrice:
              refreshedOpportunity.sellPrice,
            buyQuantity:
              refreshedOpportunity.buyAvailableQty,
            sellQuantity:
              refreshedOpportunity.sellAvailableQty,
            buyTimestamp:
              NOW + 20,
            sellTimestamp:
              NOW + 20,
            rawSpreadPercent:
              refreshedOpportunity.rawSpreadPercent,
          },
          reason:
            "Exact route accepted.",
        };
      },
      now: () =>
        clock,
    });

  const route = {
    market:
      "COTIUSDT",
    buyExchange:
      "coindcx",
    sellExchange:
      "binance",
  };

  const first =
    service.refresh(
      route,
    );

  const second =
    service.refresh(
      route,
    );

  await Promise.resolve();

  assert.equal(
    coinDCXStarted,
    true,
    "CoinDCX read must start without waiting for Binance.",
  );

  assert.equal(
    binanceStarted,
    true,
    "Binance read must start without waiting for CoinDCX.",
  );

  clock =
    NOW +
    20;

  releaseReads();

  const [firstResult, secondResult] =
    await Promise.all([
      first,
      second,
    ]);

  assert.equal(
    firstResult.state,
    "REFRESHED",
  );

  assert.equal(
    firstResult.opportunity?.id,
    "fresh-coti",
  );

  assert.deepEqual(
    secondResult,
    firstResult,
    "Concurrent stale candidates must coalesce into one dual read.",
  );

  assert.equal(
    coinDCXCalls,
    1,
  );

  assert.equal(
    binanceCalls,
    1,
  );

  assert.equal(
    evaluations,
    1,
  );

  assert.equal(
    firstResult.safety.thresholdChanged,
    false,
  );

  assert.equal(
    firstResult.safety.orderSubmissionAllowed,
    false,
  );

  const diagnostics =
    service.getDiagnostics();

  assert.equal(
    diagnostics.attempts,
    1,
  );

  assert.equal(
    diagnostics.coalesced,
    1,
  );

  assert.equal(
    diagnostics.refreshed,
    1,
  );

  const cooldown =
    await service
      .refresh(
        route,
      );

  assert.equal(
    cooldown.state,
    "COOLDOWN",
  );

  await assert.rejects(
    () =>
      service.refresh({
        market:
          "ETHUSDT",
        buyExchange:
          "binance",
        sellExchange:
          "coinswitch",
      }),
    /restricted to policy-qualified dynamic-pool routes/iu,
  );
}

async function testFailedLegBlocksWithoutReevaluation(): Promise<void> {
  let evaluations =
    0;

  const service =
    new StrategyOneActionTimeBookRefreshService({
      refreshCoinDCX: async (
        market,
      ) => ({
        exchange:
          "coindcx",
        market,
        accepted:
          true,
        requestedAt:
          NOW,
        receivedAt:
          NOW +
          10,
        roundTripMs:
          10,
        error:
          null,
      }),
      refreshBinance: async (
        market,
      ) => ({
        exchange:
          "binance",
        market,
        accepted:
          false,
        requestedAt:
          NOW,
        receivedAt:
          null,
        roundTripMs:
          190,
        error:
          "bounded timeout",
      }),
      evaluateExactRoute: () => {
        evaluations +=
          1;

        throw new Error(
          "Exact evaluation must not run after a partial refresh.",
        );
      },
      now: () =>
        NOW +
        190,
    });

  const result =
    await service
      .refresh({
        market:
          "COTIUSDT",
        buyExchange:
          "coindcx",
        sellExchange:
          "binance",
      });

  assert.equal(
    result.state,
    "BLOCKED",
  );

  assert.match(
    result.blocker ??
      "",
    /binance.*bounded timeout/iu,
  );

  assert.equal(
    evaluations,
    0,
    "A partial dual refresh must never evaluate or reuse a one-sided snapshot.",
  );
}

async function testBybitBasketRouteParallelRefresh(): Promise<void> {
  let coinDCXCalls = 0;
  let bybitCalls = 0;
  let binanceCalls = 0;
  const refreshedOpportunity = opportunity("fresh-gps", NOW + 30, {
    market: "GPSUSDT",
    buyExchange: "coindcx",
    sellExchange: "bybit",
  });

  const service = new StrategyOneActionTimeBookRefreshService({
    refreshCoinDCX: async (market) => {
      coinDCXCalls += 1;
      return {
        exchange: "coindcx",
        market,
        accepted: true,
        requestedAt: NOW,
        receivedAt: NOW + 20,
        roundTripMs: 20,
        error: null,
      };
    },
    refreshBinance: async (market) => {
      binanceCalls += 1;
      return {
        exchange: "binance",
        market,
        accepted: true,
        requestedAt: NOW,
        receivedAt: NOW + 20,
        roundTripMs: 20,
        error: null,
      };
    },
    refreshBybit: async (market) => {
      bybitCalls += 1;
      return {
        exchange: "bybit",
        market,
        accepted: true,
        requestedAt: NOW,
        receivedAt: NOW + 30,
        roundTripMs: 30,
        error: null,
      };
    },
    evaluateExactRoute: (input) => {
      assert.equal(input.market, "GPSUSDT");
      assert.equal(input.buyExchange, "coindcx");
      assert.equal(input.sellExchange, "bybit");
      assert.equal(input.minimumBuyTimestamp, NOW + 20);
      assert.equal(input.minimumSellTimestamp, NOW + 30);
      return {
        evaluatedAt: NOW + 30,
        opportunity: refreshedOpportunity,
        rejection: null,
        evidence: {
          buyPrice: refreshedOpportunity.buyPrice,
          sellPrice: refreshedOpportunity.sellPrice,
          buyQuantity: refreshedOpportunity.buyAvailableQty,
          sellQuantity: refreshedOpportunity.sellAvailableQty,
          buyTimestamp: NOW + 20,
          sellTimestamp: NOW + 30,
          rawSpreadPercent: refreshedOpportunity.rawSpreadPercent,
        },
        reason: "Exact route accepted.",
      };
    },
    now: () => NOW + 30,
  });

  const result = await service.refresh({
    market: "GPSUSDT",
    buyExchange: "coindcx",
    sellExchange: "bybit",
  });

  assert.equal(result.state, "REFRESHED");
  assert.equal(result.opportunity?.id, "fresh-gps");
  assert.equal(coinDCXCalls, 1);
  assert.equal(bybitCalls, 1);
  assert.equal(binanceCalls, 0, "Unrelated Binance must not be refreshed.");
}

function opportunity(
  id:
    string,
  timestamp:
    number,
  route: {
    readonly market: string;
    readonly buyExchange: string;
    readonly sellExchange: string;
  } = {
    market: "COTIUSDT",
    buyExchange: "coindcx",
    sellExchange: "binance",
  },
): ArbitrageOpportunity {
  return {
    id,
    pair: {
      market:
        route.market,
      buy: {
        exchange:
          route.buyExchange,
        market:
          route.market,
        lastPrice:
          0.0099,
        bestBidPrice:
          0.00989,
        bestBidQty:
          1_000,
        bestAskPrice:
          0.0099,
        bestAskQty:
          1_000,
        spread:
          0.00001,
        timestamp,
        source:
          "orderBook",
        executable:
          true,
      },
      sell: {
        exchange:
          route.sellExchange,
        market:
          route.market,
        lastPrice:
          0.01,
        bestBidPrice:
          0.01,
        bestBidQty:
          1_000,
        bestAskPrice:
          0.01001,
        bestAskQty:
          1_000,
        spread:
          0.00001,
        timestamp,
        source:
          "orderBook",
        executable:
          true,
      },
    },
    requestedCapitalInr:
      500,
    quoteAsset:
      "USDT",
    requestedQuoteCapital:
      5,
    executableQuoteCapital:
      5,
    executableCapitalInr:
      500,
    buyPrice:
      0.0099,
    sellPrice:
      0.01,
    buyAvailableQty:
      1_000,
    sellAvailableQty:
      1_000,
    requiredQty:
      500,
    availableExecutableQty:
      1_000,
    executableQty:
      500,
    liquidityScore:
      100,
    enoughLiquidity:
      true,
    freshnessScore:
      100,
    feeScore:
      100,
    spreadScore:
      100,
    decision:
      "EXECUTE",
    analysisSummary:
      [],
    rawSpread:
      0.0001,
    rawSpreadPercent:
      1,
    estimatedFees:
      0.00003,
    netProfit:
      0.00007,
    netProfitPercent:
      0.7,
    usedLastPriceFallback:
      false,
    quotesAreFresh:
      true,
    score:
      100,
    timestamp,
  };
}

void main()
  .catch(
    (
      error:
        unknown,
    ) => {
      console.error(
        error,
      );
      process.exitCode =
        1;
    },
  );
