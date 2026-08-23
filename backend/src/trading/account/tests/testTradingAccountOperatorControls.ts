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

import {
  TradingAccountService,
} from "../TradingAccountService";

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

    const cachedFirstAttempts =
      restarted
        .getDailyCapitalReservationAttempts();

    assert.equal(
      cachedFirstAttempts.length,
      1,
      "Daily reservation index must expose the first appended attempt.",
    );

    assert.equal(
      Object.isFrozen(
        cachedFirstAttempts,
      ),
      true,
      "Cached daily reservation evidence must remain immutable.",
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

    const tdsLedgerPath =
      join(
        directory,
        "tds-account-ledger.jsonl",
      );

    const tdsLedger =
      new TradingAccountLedgerService(
        tdsLedgerPath,
      );

    const tdsAccount =
      new TradingAccountService(
        tdsLedger,
      );

    tdsAccount
      .runWithAccountingTransaction(
        "paper-settlement-tds-1",
        () =>
          tdsAccount
            .recordPaperSettlementEconomics(
              100,
              10,
            ),
      );

    const afterSettlement =
      tdsAccount.getAccount();

    assert.equal(
      afterSettlement.currentCapital,
      100_100,
      "Recoverable TDS must not reduce economic PAPER equity.",
    );

    assert.equal(
      afterSettlement.availableCapital,
      100_090,
      "Withheld TDS must remain unavailable for another PAPER trade.",
    );

    assert.equal(
      afterSettlement.paperTdsReceivable,
      10,
      "Withheld TDS must be carried as a separate receivable.",
    );

    tdsAccount
      .runWithAccountingTransaction(
        "paper-settlement-tds-1",
        () =>
          tdsAccount
            .recordPaperSettlementEconomics(
              100,
              10,
            ),
      );

    assert.deepEqual(
      tdsAccount.getAccount(),
      afterSettlement,
      "A replayed settlement must not duplicate P&L or TDS.",
    );

    const reconciled =
      tdsAccount
        .reconcilePaperTdsReceivable(
          25,
        );

    assert.equal(
      reconciled.currentCapital,
      100_100,
    );

    assert.equal(
      reconciled.availableCapital,
      100_075,
    );

    assert.equal(
      reconciled.paperTdsReceivable,
      25,
    );

    const noAutomaticRefund =
      tdsAccount
        .reconcilePaperTdsReceivable(
          5,
        );

    assert.equal(
      noAutomaticRefund.paperTdsReceivable,
      25,
      "A lower history total must never auto-credit or fabricate a TDS refund.",
    );

    assert.equal(
      noAutomaticRefund.availableCapital,
      100_075,
    );

    const restartedTdsAccount =
      new TradingAccountService(
        new TradingAccountLedgerService(
          tdsLedgerPath,
        ),
      );

    assert.equal(
      restartedTdsAccount
        .getAccount()
        .paperTdsReceivable,
      25,
      "TDS cash locks must survive a process restart.",
    );

    const resetTdsAccount =
      restartedTdsAccount
        .resetPaperTradingData();

    assert.equal(
      resetTdsAccount.paperTdsReceivable,
      0,
      "An explicit PAPER data reset must clear the PAPER-only receivable.",
    );

    const leaseLedgerPath =
      join(
        directory,
        "tiny-live-lease-account-ledger.jsonl",
      );
    const leaseAccount =
      new TradingAccountService(
        new TradingAccountLedgerService(
          leaseLedgerPath,
        ),
      );
    const leaseId =
      "tiny-live-account-lease-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

    assert.throws(
      () =>
        leaseAccount
          .transitionModeForTinyLiveLease(
            "LIVE",
            "invalid-lease",
          ),
      /valid bounded Tiny-LIVE account lease ID/iu,
    );

    assert.equal(
      leaseAccount
        .transitionModeForTinyLiveLease(
          "LIVE",
          leaseId,
        )
        .mode,
      "LIVE",
      "Only the precise lease-owned transition may move PAPER to LIVE.",
    );

    const restartedLeaseAccount =
      new TradingAccountService(
        new TradingAccountLedgerService(
          leaseLedgerPath,
        ),
      );

    assert.equal(
      restartedLeaseAccount
        .getAccount()
        .mode,
      "LIVE",
      "The journal-first bounded mode transition must survive restart.",
    );
    assert.equal(
      restartedLeaseAccount
        .transitionModeForTinyLiveLease(
          "PAPER",
          leaseId,
        )
        .mode,
      "PAPER",
      "The same bounded lease must be able to restore PAPER durably.",
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
