import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
} from "node:fs";
import {
  tmpdir,
} from "node:os";
import {
  join,
} from "node:path";

import type {
  ArbitrageOpportunity,
} from "../../../arbitrage/models/ArbitrageOpportunity";
import type {
  ArbitrageLiveExecutionResult,
} from "../../../arbitrage/execution/models/ArbitrageLiveExecutionResult";
import type {
  LiveOnlyRuntimePolicy,
} from "../../../config/LiveOnlyRuntimePolicy";
import type {
  StrategyOneActionTimeBookRefreshResult,
  StrategyOneAuthorizedFinalBookRefreshResult,
} from "../tiny-live/StrategyOneActionTimeBookRefreshService";
import {
  StrategyOneLiveOnlyRunnerService,
  type StrategyOneLiveOnlyRunnerDependencies,
} from "../live-only/StrategyOneLiveOnlyRunnerService";

const NOW =
  1_788_900_000_000;

const POLICY:
  LiveOnlyRuntimePolicy = {
  enabled:
    true,
  minimumCapitalPerLegInr:
    600,
  preferredCapitalPerLegInr:
    600,
  maximumCapitalPerLegInr:
    1_000,
  minimumCurrentNetProfitPercent:
    0.3,
  minimumPostStressNetProfitPercent:
    0.15,
  maximumOpportunityAgeMs:
    10_000,
  routeCooldownMs:
    5_000,
  maximumConcurrentTrades:
    1,
  automaticFundMovementEnabled:
    false,
};

async function main(): Promise<void> {
  const directory =
    mkdtempSync(
      join(
        tmpdir(),
        "cat-pro-live-only-runner-",
      ),
    );

  try {
    await testRefreshAuthorizeFinalRefreshExecute(
      directory,
    );
    await testInitialRefreshFailureNeverAuthorizes(
      directory,
    );
    await testFinalRefreshFailureNeverExecutes(
      directory,
    );
  } finally {
    rmSync(
      directory,
      {
        recursive:
          true,
        force:
          true,
      },
    );
  }

  console.log(
    "LIVE-only runner action-time refresh passed: exact public books are rebuilt before authority, refreshed again after authority, and every refresh failure remains order-I/O free.",
  );
}

async function testRefreshAuthorizeFinalRefreshExecute(
  directory:
    string,
): Promise<void> {
  let clock =
    NOW +
    100;
  const initial =
    opportunity(
      "initial",
      NOW,
    );
  const refreshed =
    opportunity(
      "refreshed",
      NOW +
        150,
    );
  const calls:
    string[] =
    [];
  const service =
    runner(
      join(
        directory,
        "happy.jsonl",
      ),
      {
        now: () =>
          clock,
        refreshActionCandidate: async (
          input,
        ) => {
          calls.push(
            "refresh",
          );
          assert.deepEqual(
            input.refreshExchanges,
            [
              "coindcx",
              "binance",
            ],
          );
          assert.equal(
            input.minimumBuyTimestamp,
            NOW,
          );
          assert.equal(
            input.minimumSellTimestamp,
            NOW,
          );
          assert.equal(
            input.purpose,
            "live",
          );
          clock =
            NOW +
            170;
          return refreshResult(
            refreshed,
            clock,
          );
        },
        authorize: (
          opportunityId,
          authorizedAt,
        ) => {
          calls.push(
            "authorize",
          );
          assert.equal(
            opportunityId,
            refreshed.id,
          );
          assert.equal(
            authorizedAt,
            clock,
          );
          return {
            id:
              "authority-1",
          };
        },
        refreshAuthorizedFinalBooks: async (
          route,
        ) => {
          calls.push(
            "final-refresh",
          );
          assert.deepEqual(
            route,
            {
              market:
                "COTIUSDT",
              buyExchange:
                "coindcx",
              sellExchange:
                "binance",
            },
          );
          clock +=
            20;
          return finalRefreshResult(
            "REFRESHED",
            clock,
          );
        },
        execute: async (
          candidate,
          authorityId,
        ) => {
          calls.push(
            "execute",
          );
          assert.equal(
            candidate.id,
            refreshed.id,
          );
          assert.equal(
            authorityId,
            "authority-1",
          );
          return completedResult(
            refreshed,
            clock,
          );
        },
      },
    );

  await service
    .observeSnapshot({
      generatedAt:
        NOW,
      opportunities: [
        initial,
      ],
    });

  assert.deepEqual(
    calls,
    [
      "refresh",
      "authorize",
      "final-refresh",
      "execute",
    ],
  );
  assert.equal(
    service
      .getDiagnostics(
        clock,
      )
      .recentAttempts[0]
      ?.status,
    "COMPLETED",
  );
}

async function testInitialRefreshFailureNeverAuthorizes(
  directory:
    string,
): Promise<void> {
  let authorized =
    false;
  let executed =
    false;
  const initial =
    opportunity(
      "refresh-blocked",
      NOW,
    );
  const service =
    runner(
      join(
        directory,
        "initial-block.jsonl",
      ),
      {
        refreshActionCandidate: async () =>
          blockedRefreshResult(
            NOW +
              110,
          ),
        authorize: () => {
          authorized =
            true;
          return {
            id:
              "unexpected-authority",
          };
        },
        execute: async () => {
          executed =
            true;
          throw new Error(
            "Execution must not start after a blocked initial refresh.",
          );
        },
      },
    );

  await service
    .observeSnapshot({
      generatedAt:
        NOW,
      opportunities: [
        initial,
      ],
    });

  assert.equal(
    authorized,
    false,
  );
  assert.equal(
    executed,
    false,
  );
  const attempt =
    service
      .getDiagnostics(
        NOW +
          120,
      )
      .recentAttempts[0];
  assert.equal(
    attempt?.status,
    "AUTHORIZATION_BLOCKED",
  );
  assert.equal(
    attempt?.orderSubmissionMayHaveOccurred,
    false,
  );
  assert.match(
    attempt?.reason ??
      "",
    /ACTION_TIME_BOOK_REFRESH/,
  );
}

async function testFinalRefreshFailureNeverExecutes(
  directory:
    string,
): Promise<void> {
  let executed =
    false;
  const initial =
    opportunity(
      "final-initial",
      NOW,
    );
  const refreshed =
    opportunity(
      "final-refreshed",
      NOW +
        100,
    );
  const service =
    runner(
      join(
        directory,
        "final-block.jsonl",
      ),
      {
        refreshActionCandidate: async () =>
          refreshResult(
            refreshed,
            NOW +
              100,
          ),
        authorize: () => ({
          id:
            "authority-final",
        }),
        refreshAuthorizedFinalBooks: async () =>
          finalRefreshResult(
            "BLOCKED",
            NOW +
              120,
          ),
        execute: async () => {
          executed =
            true;
          throw new Error(
            "Execution must not start after a blocked final refresh.",
          );
        },
      },
    );

  await service
    .observeSnapshot({
      generatedAt:
        NOW,
      opportunities: [
        initial,
      ],
    });

  assert.equal(
    executed,
    false,
  );
  const attempt =
    service
      .getDiagnostics(
        NOW +
          130,
      )
      .recentAttempts[0];
  assert.equal(
    attempt?.authorityId,
    "authority-final",
  );
  assert.equal(
    attempt?.orderSubmissionMayHaveOccurred,
    false,
  );
  assert.match(
    attempt?.reason ??
      "",
    /AUTHORIZED_FINAL_BOOK_REFRESH/,
  );
}

function runner(
  filePath:
    string,
  overrides:
    Partial<StrategyOneLiveOnlyRunnerDependencies>,
): StrategyOneLiveOnlyRunnerService {
  return new StrategyOneLiveOnlyRunnerService(
    filePath,
    {
      runtimeEnabled: () =>
        true,
      getPolicy: () =>
        POLICY,
      subscribe: () =>
        () => undefined,
      now: () =>
        NOW +
        100,
      refreshActionCandidate: async (
        input,
      ) =>
        refreshResult(
          opportunity(
            "default-refreshed",
            NOW +
              100,
          ),
          NOW +
            100,
          input.buyExchange,
          input.sellExchange,
        ),
      authorize: () => ({
        id:
          "default-authority",
      }),
      refreshAuthorizedFinalBooks: async () =>
        finalRefreshResult(
          "REFRESHED",
          NOW +
            100,
        ),
      execute: async (
        candidate,
      ) =>
        completedResult(
          candidate,
          NOW +
            100,
        ),
      ...overrides,
    },
  );
}

function refreshResult(
  refreshed:
    ArbitrageOpportunity,
  completedAt:
    number,
  buyExchange =
    "coindcx",
  sellExchange =
    "binance",
): StrategyOneActionTimeBookRefreshResult {
  return {
    schemaVersion:
      "149.0",
    state:
      "REFRESHED",
    route: {
      market:
        refreshed.pair.market,
      buyExchange:
        buyExchange as "coindcx",
      sellExchange:
        sellExchange as "binance",
    },
    startedAt:
      completedAt -
      20,
    completedAt,
    durationMs:
      20,
    legs:
      [],
    evaluation:
      null,
    opportunity:
      refreshed,
    blocker:
      null,
    safety:
      refreshSafety(),
  };
}

function blockedRefreshResult(
  completedAt:
    number,
): StrategyOneActionTimeBookRefreshResult {
  return {
    ...refreshResult(
      opportunity(
        "unused",
        completedAt,
      ),
      completedAt,
    ),
    state:
      "BLOCKED",
    opportunity:
      null,
    blocker:
      "Exact fresh route was not rebuilt.",
  };
}

function finalRefreshResult(
  state:
    StrategyOneAuthorizedFinalBookRefreshResult["state"],
  completedAt:
    number,
): StrategyOneAuthorizedFinalBookRefreshResult {
  return {
    schemaVersion:
      "188.2",
    state,
    route: {
      market:
        "COTIUSDT",
      buyExchange:
        "coindcx",
      sellExchange:
        "binance",
    },
    startedAt:
      completedAt -
      20,
    completedAt,
    durationMs:
      20,
    legs:
      [],
    blocker:
      state ===
        "BLOCKED"
        ? "Final exact books were unavailable."
        : null,
    safety: {
      publicReadOnly:
        true,
      authorizedAttemptOnly:
        true,
      parallelReads:
        true,
      thresholdChanged:
        false,
      timestampFabricationAllowed:
        false,
      orderSubmissionAllowed:
        false,
      automaticRetryAllowed:
        false,
      transferAllowed:
        false,
      withdrawalAllowed:
        false,
    },
  };
}

function refreshSafety() {
  return {
    publicReadOnly:
      true as const,
    parallelReads:
      true as const,
    thresholdChanged:
      false as const,
    timestampFabricationAllowed:
      false as const,
    orderSubmissionAllowed:
      false as const,
    automaticRetryAllowed:
      false as const,
    transferAllowed:
      false as const,
    withdrawalAllowed:
      false as const,
  };
}

function completedResult(
  candidate:
    ArbitrageOpportunity,
  now:
    number,
): ArbitrageLiveExecutionResult {
  return {
    success:
      true,
    status:
      "COMPLETED",
    opportunityId:
      candidate.id,
    market:
      candidate.pair.market,
    requestedQuantity:
      candidate.executableQty,
    buyExchange:
      candidate.pair.buy.exchange,
    sellExchange:
      candidate.pair.sell.exchange,
    buyResult:
      null,
    sellResult:
      null,
    matchedFilledQuantity:
      candidate.executableQty,
    unmatchedBuyQuantity:
      0,
    unmatchedSellQuantity:
      0,
    startedAt:
      now,
    completedAt:
      now,
    executionTimeMs:
      0,
    recoveryRequired:
      false,
    possibleExposure:
      false,
    reasons:
      [],
  };
}

function opportunity(
  id:
    string,
  timestamp:
    number,
): ArbitrageOpportunity {
  return {
    id,
    pair: {
      market:
        "COTIUSDT",
      buy: {
        exchange:
          "coindcx",
        market:
          "COTIUSDT",
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
          "binance",
        market:
          "COTIUSDT",
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
      600,
    quoteAsset:
      "USDT",
    requestedQuoteCapital:
      7,
    executableQuoteCapital:
      7,
    executableCapitalInr:
      600,
    buyPrice:
      0.0099,
    sellPrice:
      0.01,
    buyAvailableQty:
      1_000,
    sellAvailableQty:
      1_000,
    requiredQty:
      600,
    availableExecutableQty:
      1_000,
    executableQty:
      600,
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
