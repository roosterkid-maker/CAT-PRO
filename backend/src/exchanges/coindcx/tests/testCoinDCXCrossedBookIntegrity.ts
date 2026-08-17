import assert from "node:assert/strict";

import {
  orderBookService,
} from "../../../orderbook/services/OrderBookService";

import {
  marketCache,
} from "../../../services/cache.service";

import {
  CoinDCXOrderBookIntegrityService,
} from "../CoinDCXOrderBookIntegrityService";

import type {
  CoinDCXOrderBookPayload,
} from "../orderBook.types";

const MARKET =
  "BUILD4EUSDT";

const EXECUTION_CONFIRMATION_VARIABLES = [
  "ARBITRAGE_LIVE_EXECUTION_CONFIRMATION",
  "AUTOMATED_PAPER_TRADING_CONFIRMATION",
  "BINANCE_LIVE_ORDER_CONFIRM",
  "COINDCX_LIVE_ORDER_CONFIRM",
  "LIVE_EXECUTION_CONFIRMATION",
  "LIVE_TRADING_CONFIRMATION",
  "TINY_LIVE_CONFIRMATION",
] as const;

function createPayload(
  timestamp:
    number,

  bids:
    Record<string, string>,

  asks:
    Record<string, string>,

  version?:
    number,
): CoinDCXOrderBookPayload {
  return {
    ts:
      timestamp,

    vs:
      version,

    pr:
      "spot",

    s:
      MARKET,

    bids,
    asks,
  };
}

function getRecord(
  service:
    CoinDCXOrderBookIntegrityService,
) {
  const record =
    service
      .getReport()
      .records.find(
        (candidate) =>
          candidate.market ===
          MARKET,
      );

  assert.ok(
    record,
    "Expected CoinDCX integrity diagnostics for the test market.",
  );

  return record;
}

function assertNotExecutable(): void {
  assert.equal(
    orderBookService.has(
      "coindcx",
      MARKET,
    ),
    false,
    "Rejected or generation-reset state must not retain an order book.",
  );

  assert.notEqual(
    marketCache.get(
      "coindcx",
      MARKET,
    )?.executable,
    true,
    "Rejected or generation-reset state must not retain executable quote evidence.",
  );
}

function main(): void {
  const confirmationsBefore =
    new Map(
      EXECUTION_CONFIRMATION_VARIABLES.map(
        (variable) => [
          variable,
          process.env[variable],
        ],
      ),
    );

  orderBookService.remove(
    "coindcx",
    MARKET,
  );

  marketCache.remove(
    "coindcx",
    MARKET,
  );

  const service =
    new CoinDCXOrderBookIntegrityService();

  const firstGeneration =
    service.beginGeneration(
      MARKET,
      "INITIAL_JOIN",
      1_000,
    );

  assert.equal(
    firstGeneration.generation,
    1,
    "Initial join must create generation one.",
  );

  const updateBeforeSnapshot =
    service.processEvent(
      createPayload(
        1_010,
        {
          "100":
            "2",
        },
        {},
      ),
      "update",
      1_011,
    );

  assert.equal(
    updateBeforeSnapshot.reason,
    "UPDATE_BEFORE_SNAPSHOT",
  );

  assertNotExecutable();

  const restBootstrapSnapshot =
    service.seedTrackedSnapshot(
      createPayload(
        1_015,
        {
          "100":
            "2",
        },
        {
          "101":
            "4",
        },
      ),
      1_016,
    );

  assert.equal(
    restBootstrapSnapshot.accepted,
    true,
    "A genuine full public REST snapshot must safely bootstrap a tracked update-before-snapshot generation.",
  );

  const postBootstrapUpdate =
    service.processEvent(
      createPayload(
        1_017,
        {
          "100.5":
            "1",
        },
        {},
      ),
      "update",
      1_018,
    );

  assert.equal(
    postBootstrapUpdate.accepted,
    true,
    "Websocket deltas must merge after a genuine REST snapshot establishes the tracked generation.",
  );

  const snapshot =
    service.processEvent(
      createPayload(
        1_020,
        {
          "100":
            "2",
          "99":
            "3",
        },
        {
          "101":
            "4",
          "102":
            "5",
        },
        10,
      ),
      "snapshot",
      1_021,
    );

  assert.equal(
    snapshot.accepted,
    true,
    "A valid first snapshot must replace state and become executable.",
  );

  const validUpdate =
    service.processEvent(
      createPayload(
        1_030,
        {
          "100.5":
            "1.5",
        },
        {
          "101":
            "0.0",
          "101.5":
            "2.5",
        },
      ),
      "update",
      1_031,
    );

  assert.equal(
    validUpdate.accepted,
    true,
    "A valid delta after a snapshot must merge safely.",
  );

  const mergedBook =
    orderBookService.get(
      "coindcx",
      MARKET,
    );

  assert.ok(
    mergedBook,
  );

  assert.equal(
    mergedBook.timestamp,
    1_031,
    "CoinDCX executable freshness must use local receipt time while source time remains integrity evidence.",
  );

  assert.equal(
    mergedBook.asks.some(
      (level) =>
        level.price ===
        101,
    ),
    false,
    "CoinDCX quantity-zero deltas must delete prior price levels.",
  );

  assert.equal(
    mergedBook.asks[0]?.price,
    101.5,
  );

  assert.equal(
    marketCache.get(
      "coindcx",
      MARKET,
    )?.bestAskPrice,
    101.5,
    "Executable evidence must be derived from the accepted merged book.",
  );

  const secondGeneration =
    service.beginGeneration(
      MARKET,
      "STALE_RECOVERY",
      1_040,
    );

  assert.equal(
    secondGeneration.generation,
    2,
  );

  assertNotExecutable();

  const delayedPriorGenerationSnapshot =
    service.processEvent(
      createPayload(
        1_025,
        {
          "100":
            "2",
        },
        {
          "101":
            "2",
        },
        11,
      ),
      "snapshot",
      1_041,
    );

  assert.equal(
    delayedPriorGenerationSnapshot.reason,
    "STALE_EPOCH_EVENT",
    "A packet with source time predating the generation floor must not resurrect state.",
  );

  assertNotExecutable();

  const recoveredSnapshot =
    service.processEvent(
      createPayload(
        1_050,
        {
          "100":
            "3",
        },
        {
          "101":
            "3",
        },
        12,
      ),
      "snapshot",
      1_051,
    );

  assert.equal(
    recoveredSnapshot.accepted,
    true,
    "A newer clean snapshot must restore a valid book after rejoin.",
  );

  const crossedUpdate =
    service.processEvent(
      createPayload(
        1_060,
        {
          "102":
            "1",
        },
        {},
      ),
      "update",
      1_061,
    );

  assert.equal(
    crossedUpdate.reason,
    "CROSSED_BOOK",
    "A crossed merged book must remain strictly rejected.",
  );

  assert.equal(
    crossedUpdate.recoveryRecommended,
    true,
  );

  assertNotExecutable();

  const crossedRecoveryGeneration =
    service.beginGeneration(
      MARKET,
      "CROSSED_BOOK_RECOVERY",
      1_070,
    );

  assert.equal(
    crossedRecoveryGeneration.generation,
    3,
  );

  const cleanRecoverySnapshot =
    service.processEvent(
      createPayload(
        1_080,
        {
          "100":
            "4",
        },
        {
          "101":
            "4",
        },
        13,
      ),
      "snapshot",
      1_081,
    );

  assert.equal(
    cleanRecoverySnapshot.accepted,
    true,
    "A clean snapshot must recover from crossed-book invalidation.",
  );

  const outOfOrderUpdate =
    service.processEvent(
      createPayload(
        1_075,
        {
          "99":
            "1",
        },
        {},
      ),
      "update",
      1_082,
    );

  assert.equal(
    outOfOrderUpdate.reason,
    "OUT_OF_ORDER_EVENT",
  );

  assert.equal(
    orderBookService.has(
      "coindcx",
      MARKET,
    ),
    true,
    "An out-of-order delta must not corrupt the last accepted book.",
  );

  orderBookService.remove(
    "coindcx",
    MARKET,
  );

  const updateWithoutRetainedBook =
    service.processEvent(
      createPayload(
        1_085,
        {
          "100.25":
            "1",
        },
        {},
      ),
      "update",
      1_086,
    );

  assert.equal(
    updateWithoutRetainedBook.reason,
    "UPDATE_WITHOUT_BOOK",
    "A delta cannot recreate depth after the authoritative book was evicted.",
  );

  assertNotExecutable();

  service.beginGeneration(
    MARKET,
    "CROSSED_BOOK_RECOVERY",
    1_090,
  );

  assert.equal(
    service.canScheduleCrossedBookRecovery(
      MARKET,
    ),
    false,
    "Crossed-book forced rejoin recovery must be bounded per market session.",
  );

  const record =
    getRecord(
      service,
    );

  assert.equal(
    record.awaitingFreshSnapshot,
    true,
  );

  assert.equal(
    record.updateBeforeSnapshotRejected,
    1,
  );

  assert.equal(
    record.updateWithoutBookRejected,
    1,
  );

  assert.equal(
    record.staleEpochEventRejected,
    1,
  );

  assert.equal(
    record.outOfOrderEventRejected,
    1,
  );

  assert.equal(
    record.crossedBookRejectionCount,
    1,
  );

  assert.equal(
    record.forcedSnapshotRejoinCount,
    2,
  );

  assert.equal(
    record.successfulRecoveryCount,
    2,
  );

  const report =
    service.getReport(
      2_000,
    );

  assert.equal(
    report.liveExecutionAllowed,
    false,
  );

  assert.equal(
    report.mutationScope,
    "COINDCX_PUBLIC_MARKET_DATA",
  );

  for (
    const variable
    of EXECUTION_CONFIRMATION_VARIABLES
  ) {
    assert.equal(
      process.env[variable],
      confirmationsBefore.get(
        variable,
      ),
      `${variable} must not be enabled or changed by feed-integrity processing.`,
    );
  }

  service.clear();

  orderBookService.remove(
    "coindcx",
    MARKET,
  );

  marketCache.remove(
    "coindcx",
    MARKET,
  );

  console.log(
    "CoinDCX crossed-book sequencing and recovery deterministic test passed.",
  );
}

try {
  main();
} catch (
  error:
    unknown
) {
  orderBookService.remove(
    "coindcx",
    MARKET,
  );

  marketCache.remove(
    "coindcx",
    MARKET,
  );

  console.error(
    error instanceof Error
      ? error.message
      : error,
  );

  process.exitCode =
    1;
}
