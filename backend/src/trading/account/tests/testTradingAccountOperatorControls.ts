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

import {
  defaultTradingAccount,
  toPaperAccountingDateKey,
} from "../TradingAccount";

import {
  TradingAccountLedgerService,
} from "../TradingAccountLedgerService";

function main(): void {
  assert.equal(
    toPaperAccountingDateKey(
      Date.UTC(
        2026,
        7,
        14,
        18,
        29,
        59,
      ),
    ),
    "2026-08-14",
    "The PAPER accounting day must remain on the old IST date immediately before midnight.",
  );

  assert.equal(
    toPaperAccountingDateKey(
      Date.UTC(
        2026,
        7,
        14,
        18,
        30,
        0,
      ),
    ),
    "2026-08-15",
    "The PAPER accounting day must roll over exactly at 00:00 IST even on a UTC VPS.",
  );

  const directory =
    mkdtempSync(
      join(
        tmpdir(),
        "cat-pro-account-controls-",
      ),
    );

  const ledgerPath =
    join(
      directory,
      "trading-account-ledger.jsonl",
    );

  try {
    const ledger =
      new TradingAccountLedgerService(
        ledgerPath,
      );

    const configured =
      structuredClone(
        defaultTradingAccount,
      );

    configured.limits.maximumDailyTrades =
      123;

    ledger.recordMutation(
      "UPDATE_ACCOUNT",
      defaultTradingAccount,
      configured,
    );

    const reserved =
      structuredClone(
        configured,
      );

    reserved.tradesToday =
      1;

    reserved.availableCapital -=
      1_000;

    ledger.recordMutation(
      "RESERVE_CAPITAL",
      configured,
      reserved,
      {
        amount:
          1_000,
      },
    );

    assert.equal(
      ledger
        .getDailyCapitalReservationAttempts()
        .length,
      1,
    );

    const cleanBaseline =
      structuredClone(
        configured,
      );

    cleanBaseline.tradesToday =
      0;

    cleanBaseline.todayProfit =
      0;

    cleanBaseline.todayLoss =
      0;

    cleanBaseline.openTrades =
      0;

    cleanBaseline.currentCapital =
      cleanBaseline.initialCapital;

    cleanBaseline.availableCapital =
      cleanBaseline.initialCapital;

    ledger.replaceHistoryWithAccount(
      cleanBaseline,
    );

    const restarted =
      new TradingAccountLedgerService(
        ledgerPath,
      );

    const restored =
      restarted
        .getRestoredAccount();

    assert.equal(
      restored?.limits
        .maximumDailyTrades,
      123,
      "PAPER data reset must preserve the operator's configured daily limit.",
    );

    assert.equal(
      restored?.tradesToday,
      0,
    );

    assert.equal(
      restarted
        .getDailyCapitalReservationAttempts()
        .length,
      0,
      "Cleared daily attempts must not return after restart.",
    );

    assert.equal(
      restarted
        .getDiagnostics()
        .entries,
      1,
      "A reset ledger must retain only one clean baseline record.",
    );

    const firstReservation =
      structuredClone(
        cleanBaseline,
      );

    firstReservation.tradesToday =
      1;

    restarted.recordMutation(
      "RESERVE_CAPITAL",
      cleanBaseline,
      firstReservation,
      {
        amount: 1_000,
      },
    );

    const secondReservation =
      structuredClone(
        firstReservation,
      );

    secondReservation.tradesToday =
      2;

    restarted.recordMutation(
      "RESERVE_CAPITAL",
      firstReservation,
      secondReservation,
      {
        amount: 1_000,
      },
    );

    restarted.recordMutation(
      "RELEASE_CAPITAL",
      secondReservation,
      secondReservation,
      {
        amount: 1_000,
      },
    );

    const fifoAttempts =
      restarted
        .getDailyCapitalReservationAttempts();

    assert.equal(
      fifoAttempts.length,
      2,
    );

    assert.equal(
      fifoAttempts[0]
        .capitalReleaseStatus,
      "RELEASE_CONFIRMED",
      "Same-amount releases must settle the oldest reservation first.",
    );

    assert.equal(
      fifoAttempts[1]
        .capitalReleaseStatus,
      "STILL_RESERVED",
      "A later same-amount reservation must remain open until its own release.",
    );

    console.log(
      "TRADING ACCOUNT OPERATOR CONTROLS TEST PASSED.",
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

main();
