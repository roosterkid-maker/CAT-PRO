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
  LIVE_ONLY_CLEAN_FAILURE_RELEASE_CONFIRMATION,
  StrategyOneLiveOnlyRunnerService,
  type StrategyOneLiveOnlyRunnerDependencies,
} from "../live-only/StrategyOneLiveOnlyRunnerService";
import type {
  OpportunityCapitalStudyDecision,
} from "../../../rebalancing/services/OpportunityCapitalStudyService";

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
    0.2,
  minimumPostStressNetProfitPercent:
    0.07,
  maximumStatutoryCashWithholdingPercentPerAttempt:
    2.1,
  maximumOpportunityAgeMs:
    600,
  routeCooldownMs:
    1_500,
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
    await testCurrentRouteDecisionDoesNotWaitForPersistence(
      directory,
    );
    await testRecoveryHaltReleaseRequiresCleanAuthoritativeEvidence(
      directory,
    );
    await testSafePreDispatchRejectionExcludesMarketWithoutHalting(
      directory,
    );
    await testUnrecognizedFailureStillHalts(
      directory,
    );
    await testCleanFailureHaltReleaseRequiresConfirmationAndCleanEvidence(
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

async function testRecoveryHaltReleaseRequiresCleanAuthoritativeEvidence(
  directory: string,
): Promise<void> {
  let recoveryClean = false;
  const filePath = join(directory, "recovery-halt.jsonl");
  const candidate = opportunity("recovery-required", NOW);
  const service = runner(
    filePath,
    {
      getRecoveryClearance: () => recoveryClean
        ? cleanRecoveryClearance()
        : possibleExposureRecoveryClearance(),
      execute: async () => recoveryRequiredResult(candidate, NOW + 100),
    },
  );

  service.start();
  await service.observeSnapshot({
    generatedAt: NOW,
    opportunities: [candidate],
  });

  assert.equal(service.getDiagnostics(NOW + 100).halted, true);
  assert.throws(
    () => service.releaseAuthoritativelyResolvedRecoveryHalt(
      "strategy-one:recovery-required",
      NOW + 101,
    ),
    /authoritative recovery is not completely clean/u,
  );
  assert.equal(service.getDiagnostics(NOW + 101).halted, true);

  recoveryClean = true;
  assert.equal(
    service.releaseAuthoritativelyResolvedRecoveryHalt(
      "strategy-one:recovery-required",
      NOW + 102,
    ),
    true,
  );
  assert.equal(service.getDiagnostics(NOW + 102).halted, false);
  service.stop();

  const restored = runner(filePath, {});
  assert.equal(
    restored.getDiagnostics(NOW + 103).halted,
    false,
    "the released recovery halt must remain cleared after restart",
  );
}

async function testSafePreDispatchRejectionExcludesMarketWithoutHalting(
  directory: string,
): Promise<void> {
  const filePath = join(directory, "safe-pre-dispatch-rejection.jsonl");
  const first = opportunity("axl-attempt-1", NOW);
  const second = opportunity("axl-attempt-2", NOW + 10_000);

  const service = runner(
    filePath,
    {
      execute: async (candidate) =>
        safePreDispatchRejectedResult(candidate, NOW + 100),
    },
  );

  service.start();
  await service.observeSnapshot({
    generatedAt: NOW,
    opportunities: [first],
  });

  const diagnostics = service.getDiagnostics(NOW + 100);
  assert.equal(
    diagnostics.halted,
    false,
    "a safe pre-dispatch rejection (no exposure, no dispatch) must not halt the runner",
  );
  assert.equal(diagnostics.attempts, 1);

  const excluded = diagnostics.excludedMarkets;
  assert.equal(excluded.length, 1);
  assert.equal(excluded[0]?.exchange, "binance");
  assert.equal(excluded[0]?.market, "BTCUSDT");

  /*
   * The rejection text named "Binance" specifically (not the buy-leg
   * exchange, coindcx) - attribution must exclude only the leg that was
   * actually named, not both legs.
   */
  assert.equal(
    excluded.some((item) => item.exchange === "coindcx"),
    false,
    "attribution must not exclude the unrelated coindcx buy leg",
  );

  await service.observeSnapshot({
    generatedAt: NOW + 10_000,
    opportunities: [second],
  });
  assert.equal(
    service.getDiagnostics(NOW + 10_100).attempts,
    1,
    "an excluded (exchange, market) must never be attempted again",
  );
  service.stop();

  const restored = runner(filePath, {});
  const restoredDiagnostics = restored.getDiagnostics(NOW + 20_000);
  assert.equal(
    restoredDiagnostics.halted,
    false,
  );
  assert.equal(
    restoredDiagnostics.excludedMarkets.length,
    1,
    "the learned exclusion must survive a restart",
  );
}

async function testUnrecognizedFailureStillHalts(
  directory: string,
): Promise<void> {
  const filePath = join(directory, "unrecognized-failure.jsonl");
  const candidate = opportunity("unrecognized-failure", NOW);
  const service = runner(
    filePath,
    {
      execute: async () =>
        unrecognizedFailedResult(candidate, NOW + 100),
    },
  );

  service.start();
  await service.observeSnapshot({
    generatedAt: NOW,
    opportunities: [candidate],
  });

  const diagnostics = service.getDiagnostics(NOW + 100);
  assert.equal(
    diagnostics.halted,
    true,
    "a FAILED result outside the recognized safe pattern must still halt for manual review",
  );
  assert.equal(diagnostics.excludedMarkets.length, 0);
  service.stop();
}

async function testCleanFailureHaltReleaseRequiresConfirmationAndCleanEvidence(
  directory: string,
): Promise<void> {
  const filePath = join(directory, "clean-failure-halt.jsonl");
  const candidate = opportunity("clean-failure", NOW);
  const service = runner(
    filePath,
    {
      execute: async () => unrecognizedFailedResult(candidate, NOW + 100),
    },
  );

  service.start();
  await service.observeSnapshot({
    generatedAt: NOW,
    opportunities: [candidate],
  });
  assert.equal(service.getDiagnostics(NOW + 100).halted, true);

  assert.throws(
    () => service.releaseCleanFailureHalt("not the phrase", NOW + 101),
    /Exact confirmation phrase/u,
    "the wrong phrase must never release a live halt",
  );
  assert.equal(service.getDiagnostics(NOW + 101).halted, true);
  assert.throws(
    () => service.releaseCleanFailureHalt(
      LIVE_ONLY_CLEAN_FAILURE_RELEASE_CONFIRMATION.toLowerCase(),
      NOW + 101,
    ),
    /Exact confirmation phrase/u,
    "the phrase check must be exact, not case-insensitive",
  );

  assert.equal(
    service.releaseCleanFailureHalt(
      LIVE_ONLY_CLEAN_FAILURE_RELEASE_CONFIRMATION,
      NOW + 102,
    ),
    true,
  );
  assert.equal(service.getDiagnostics(NOW + 102).halted, false);
  service.stop();

  const restored = runner(filePath, {});
  assert.equal(
    restored.getDiagnostics(NOW + 103).halted,
    false,
    "the released clean-failure halt must remain cleared after restart",
  );

  // A RECOVERY_REQUIRED halt must never be releasable through this path -
  // it always stays locked to releaseAuthoritativelyResolvedRecoveryHalt().
  const recoveryFilePath = join(directory, "clean-failure-vs-recovery.jsonl");
  const recoveryCandidate = opportunity("recovery-not-clean-failure", NOW);
  const recoveryService = runner(
    recoveryFilePath,
    {
      execute: async () => recoveryRequiredResult(recoveryCandidate, NOW + 100),
    },
  );
  recoveryService.start();
  await recoveryService.observeSnapshot({
    generatedAt: NOW,
    opportunities: [recoveryCandidate],
  });
  assert.equal(recoveryService.getDiagnostics(NOW + 100).halted, true);
  assert.throws(
    () => recoveryService.releaseCleanFailureHalt(
      LIVE_ONLY_CLEAN_FAILURE_RELEASE_CONFIRMATION,
      NOW + 101,
    ),
    /requires authoritative recovery resolution/u,
    "a RECOVERY_REQUIRED halt must never be releasable as a clean failure, even with the exact phrase",
  );
  assert.equal(recoveryService.getDiagnostics(NOW + 101).halted, true);
  recoveryService.stop();

  // A FAILED-but-possible-exposure halt (dispatch-touching, exposure
  // uncertain) must also stay locked - the release must re-check the
  // triggering attempt's OWN evidence, not just trust the halt text.
  const exposureFilePath = join(directory, "clean-failure-vs-exposure.jsonl");
  const exposureCandidate = opportunity("failed-possible-exposure", NOW);
  const exposureService = runner(
    exposureFilePath,
    {
      execute: async () => ({
        ...unrecognizedFailedResult(exposureCandidate, NOW + 100),
        possibleExposure: true,
        reasons: ["An exchange call may have partially succeeded; exposure cannot be ruled out."],
      }),
    },
  );
  exposureService.start();
  await exposureService.observeSnapshot({
    generatedAt: NOW,
    opportunities: [exposureCandidate],
  });
  assert.equal(exposureService.getDiagnostics(NOW + 100).halted, true);
  assert.throws(
    () => exposureService.releaseCleanFailureHalt(
      LIVE_ONLY_CLEAN_FAILURE_RELEASE_CONFIRMATION,
      NOW + 101,
    ),
    /triggering attempt's own recorded evidence does not show a clean/u,
    "a FAILED attempt whose own evidence shows possible exposure must never be releasable through the clean-failure path",
  );
  assert.equal(exposureService.getDiagnostics(NOW + 101).halted, true);
  exposureService.stop();
}

async function testCurrentRouteDecisionDoesNotWaitForPersistence(
  directory: string,
): Promise<void> {
  let executions = 0;
  const service = runner(
    join(directory, "study-gate.jsonl"),
    {
      getCapitalStudyDecision: (candidate) => ({
        opportunityId: candidate.id,
        executionQualified: true,
        effectiveMinimumCurrentNetProfitPercent: 0.3,
      } as OpportunityCapitalStudyDecision),
      execute: async (candidate) => {
        executions += 1;
        return completedResult(candidate, NOW + 100);
      },
    },
  );

  await service.observeSnapshot({
    generatedAt: NOW,
    opportunities: [opportunity("current-route", NOW)],
  });

  assert.equal(executions, 1);
  assert.equal(service.getDiagnostics(NOW + 100).attempts, 1);
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
                "BTCUSDT",
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
      getCapitalStudyDecision: (
        candidate,
      ) => ({
        opportunityId: candidate.id,
        executionQualified: true,
        effectiveMinimumCurrentNetProfitPercent: 0.3,
      } as OpportunityCapitalStudyDecision),
      getRecoveryClearance: () => cleanRecoveryClearance(),
      isBaseAssetPreFundable: () => true,
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

function possibleExposureRecoveryClearance() {
  return {
    classification: "POSSIBLE_EXPOSURE" as const,
    allowNewLivePreparation: false,
    summary: {
      unresolvedSessions: 1,
      possibleExposureSessions: 1,
      persistenceIntegrityProblems: 0,
    },
  };
}

function cleanRecoveryClearance() {
  return {
    classification: "CLEAN" as const,
    allowNewLivePreparation: true,
    summary: {
      unresolvedSessions: 0,
      possibleExposureSessions: 0,
      persistenceIntegrityProblems: 0,
    },
  };
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
        "BTCUSDT",
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

function recoveryRequiredResult(
  candidate: ArbitrageOpportunity,
  now: number,
): ArbitrageLiveExecutionResult {
  return {
    ...completedResult(candidate, now),
    success: false,
    status: "RECOVERY_REQUIRED",
    matchedFilledQuantity: 0,
    unmatchedBuyQuantity: 0,
    unmatchedSellQuantity: candidate.executableQty,
    recoveryRequired: true,
    possibleExposure: true,
    reasons: [
      "RECOVERY_REQUIRED: exact residual requires authoritative recovery.",
    ],
  };
}

function safePreDispatchRejectedResult(
  candidate: ArbitrageOpportunity,
  now: number,
): ArbitrageLiveExecutionResult {
  return {
    ...completedResult(candidate, now),
    success: false,
    status: "FAILED",
    matchedFilledQuantity: 0,
    unmatchedBuyQuantity: 0,
    unmatchedSellQuantity: 0,
    recoveryRequired: false,
    possibleExposure: false,
    reasons: [
      "Two-leg identity was durably prepared before either gateway call.",
      "Pair pre-dispatch validation blocked before either leg: Binance order rejected by exchange-rule validation: Time in force FOK is not supported for this market.",
      "Neither exchange leg crossed the dispatch boundary and no order submission was attempted.",
      "One or more execution legs did not return a result.",
    ],
  };
}

function unrecognizedFailedResult(
  candidate: ArbitrageOpportunity,
  now: number,
): ArbitrageLiveExecutionResult {
  return {
    ...completedResult(candidate, now),
    success: false,
    status: "FAILED",
    matchedFilledQuantity: 0,
    unmatchedBuyQuantity: 0,
    unmatchedSellQuantity: 0,
    recoveryRequired: false,
    possibleExposure: false,
    reasons: [
      "An unexpected internal failure occurred with no recognized safe pattern.",
    ],
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
        "BTCUSDT",
      buy: {
        exchange:
          "coindcx",
        market:
          "BTCUSDT",
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
          "BTCUSDT",
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
