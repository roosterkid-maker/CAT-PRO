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
  PaperTrade,
} from "../../models/PaperTrade";

import {
  PaperTradeStore,
} from "../PaperTradeStore";

const BASE_TIME =
  1_900_000_000_000;

function main(): void {
  const directory =
    mkdtempSync(
      join(
        tmpdir(),
        "cat-pro-paper-cursor-",
      ),
    );
  const filePath =
    join(
      directory,
      "paper-trades.jsonl",
    );

  try {
    const store =
      new PaperTradeStore(
        filePath,
      );

    for (
      const [
        id,
        openedAt,
      ] of [
        ["a", BASE_TIME - 4_000],
        ["b", BASE_TIME - 3_000],
        ["c", BASE_TIME - 2_000],
        ["d", BASE_TIME - 1_000],
        ["e", BASE_TIME - 1_000],
      ] as const
    ) {
      store.create(
        createTrade(
          id,
          openedAt,
        ),
      );
    }

    const first =
      store.getPage(
        2,
      );

    assert.deepEqual(
      first.trades.map(
        (trade) =>
          trade.id,
      ),
      [
        "e",
        "d",
      ],
      "Equal timestamps must have deterministic descending ID order.",
    );
    assert.equal(
      first.hasMore,
      true,
    );
    assert.deepEqual(
      first.nextCursor,
      {
        openedAt:
          BASE_TIME -
          1_000,
        id:
          "d",
      },
    );

    store.create(
      createTrade(
        "new-front",
        BASE_TIME +
          1_000,
      ),
    );

    const second =
      store.getPage(
        2,
        first.nextCursor,
      );

    assert.deepEqual(
      second.trades.map(
        (trade) =>
          trade.id,
      ),
      [
        "c",
        "b",
      ],
      "A new front insertion must not shift, duplicate or skip the next cursor page.",
    );

    const third =
      store.getPage(
        2,
        second.nextCursor,
      );

    assert.deepEqual(
      third.trades.map(
        (trade) =>
          trade.id,
      ),
      [
        "a",
      ],
    );
    assert.equal(
      third.hasMore,
      false,
    );
    assert.equal(
      third.nextCursor,
      null,
    );
    assert.equal(
      third.totalStoredRecords,
      6,
    );

    const restored =
      new PaperTradeStore(
        filePath,
      );
    const restoredPage =
      restored.getPage(
        10,
      );

    assert.deepEqual(
      restoredPage.trades.map(
        (trade) =>
          trade.id,
      ),
      [
        "new-front",
        "e",
        "d",
        "c",
        "b",
        "a",
      ],
      "Cursor ordering must survive durable restart restore.",
    );

    assert.throws(
      () =>
        restored.getPage(
          10,
          {
            openedAt:
              0,
            id:
              "bad",
          },
        ),
      /cursor/i,
    );

    console.log(
      "V144 PAPER trade cursor pagination test passed: bounded pages remain deterministic and insertion-stable without altering ledger evidence.",
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
}

function createTrade(
  id:
    string,

  openedAt:
    number,
): PaperTrade {
  return {
    strategyAttribution: {
      attributionStatus:
        "ATTRIBUTED",
      strategyId:
        "cross-exchange-arbitrage",
      signalId:
        `signal-${id}`,
      intentId:
        null,
    },
    id,
    market:
      "COTIUSDT",
    buyExchange:
      "coindcx",
    sellExchange:
      "binance",
    capital:
      500,
    quantity:
      500,
    buyPrice:
      0.01,
    sellPrice:
      0.0101,
    estimatedFees:
      0.01,
    expectedProfit:
      0.04,
    expectedProfitPercent:
      0.8,
    status:
      "closed",
    openedAt,
    closedAt:
      openedAt +
      1,
    currentPrice:
      0.0101,
    currentProfit:
      0.04,
    currentProfitPercent:
      0.8,
    highestProfit:
      0.04,
    lowestProfit:
      0,
    lastUpdatedAt:
      openedAt +
      1,
    actualSellPrice:
      0.0101,
    actualProfit:
      0.04,
    actualProfitPercent:
      0.8,
    failureReason:
      null,
  };
}

main();
