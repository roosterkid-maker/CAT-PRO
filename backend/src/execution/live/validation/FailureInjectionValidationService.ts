import {
  mkdirSync,
  rmSync,
} from "node:fs";

import {
  resolve,
} from "node:path";

import {
  randomUUID,
} from "node:crypto";

import {
  defaultTradingAccount,
} from "../../../trading/account/TradingAccount";

import {
  TradingAccountLedgerService,
} from "../../../trading/account/TradingAccountLedgerService";

import {
  OrderLifecycleEvidenceService,
} from "../lifecycle/OrderLifecycleEvidenceService";

import type {
  OrderLifecycleRecord,
} from "../lifecycle/OrderLifecycleRecord";

import {
  ExecutionSettlementAccountingPersistenceService,
} from "../settlement/ExecutionSettlementAccountingPersistenceService";

import type {
  FailureInjectionDrillResult,
  FailureInjectionValidationReport,
} from "./FailureInjectionValidation";

export class FailureInjectionValidationService {
  run():
    FailureInjectionValidationReport {
    const validationRoot =
      resolve(
        process.cwd(),

        "logs",

        "validation",

        `v18-build14-${Date.now()}-${randomUUID()}`,
      );

    mkdirSync(
      validationRoot,

      {
        recursive:
          true,
      },
    );

    const drills:
      FailureInjectionDrillResult[] =
      [];

    try {
      drills.push(
        this.runDrill(
          "ORDER_DUPLICATE_RESTART_GUARD",

          "Persisted submitted order blocks duplicate after restart.",

          () =>
            this.testOrderDuplicateRestartGuard(
              validationRoot,
            ),
        ),
      );

      drills.push(
        this.runDrill(
          "SETTLEMENT_CRASH_WINDOW",

          "Persisted PENDING_SETTLEMENT becomes accounting-uncertain after restart.",

          () =>
            this.testSettlementCrashWindow(
              validationRoot,
            ),
        ),
      );

      drills.push(
        this.runDrill(
          "ACCOUNTING_IDEMPOTENCY_RESTART",

          "Previously committed settlement transaction cannot be applied twice after restart.",

          () =>
            this.testAccountingIdempotency(
              validationRoot,
            ),
        ),
      );

      drills.push(
        this.runDrill(
          "PRE_SUBMISSION_NOT_DUPLICATE",

          "PREPARED-only lifecycle must not be treated as an exchange-submitted duplicate.",

          () =>
            this.testPreparedOrderDoesNotBlock(
              validationRoot,
            ),
        ),
      );

      drills.push(
        this.runDrill(
          "DRY_RUN_NOT_REAL_DUPLICATE",

          "Dry-run submitted lifecycle must not block a future real-order duplicate lookup.",

          () =>
            this.testDryRunDoesNotBlock(
              validationRoot,
            ),
        ),
      );
    } finally {
      /*
       * Validation artifacts contain synthetic
       * data only, but remove them after each
       * run so production logs remain clean.
       */
      rmSync(
        validationRoot,

        {
          recursive:
            true,

          force:
            true,
        },
      );
    }

    const passed =
      drills.filter(
        (
          drill,
        ) =>
          drill.status ===
          "PASS",
      ).length;

    const failed =
      drills.length -
      passed;

    return {
      generatedAt:
        Date.now(),

      version:
        "18.0",

      build:
        "14",

      syntheticOnly:
        true,

      realExchangeCallsMade:
        false,

      realOrdersSubmitted:
        false,

      realOrdersCancelled:
        false,

      realMoneyUsed:
        false,

      liveTradingEnabled:
        false,

      liveSubmissionAllowed:
        false,

      summary: {
        total:
          drills.length,

        passed,

        failed,

        allPassed:
          failed ===
          0,
      },

      drills,

      notes: [
        "Version 18 Build 14 runs only synthetic persistence/restart validation drills.",

        "Temporary validation persistence files are isolated from production evidence and removed after each run.",

        "No execution adapter or exchange HTTP API is invoked.",

        "No order is submitted or cancelled.",

        "No trading-account singleton state is mutated.",

        "A failed drill indicates production hardening should stop until the related persistence or duplicate-protection behavior is corrected.",

        "LIVE trading and LIVE order submission remain disabled.",
      ],
    };
  }

  private testOrderDuplicateRestartGuard(
    root:
      string,
  ): string {
    const file =
      resolve(
        root,
        "duplicate-order.jsonl",
      );

    const sessionId =
      `synthetic-session-${randomUUID()}`;

    const clientOrderId =
      `synthetic-${randomUUID()}`;

    const first =
      new OrderLifecycleEvidenceService(
        file,
      );

    first.capture(
      this.createOrder({
        sessionId,

        status:
          "SUBMISSION_REQUESTED",

        clientOrderId,

        leg:
          "BUY",
      }),

      false,
    );

    /*
     * Simulated process restart:
     * new service instance reads same file.
     */
    const restarted =
      new OrderLifecycleEvidenceService(
        file,
      );

    const duplicate =
      restarted
        .findPotentialDuplicate(
          sessionId,
          "BUY",
          clientOrderId,
        );

    const diagnostics =
      restarted
        .getDiagnostics();

    if (
      !duplicate
    ) {
      throw new Error(
        "Persisted submitted lifecycle was not detected after restart.",
      );
    }

    if (
      !diagnostics
        .duplicateSubmissionRisk
    ) {
      throw new Error(
        "duplicateSubmissionRisk remained false after restoring submitted real order evidence.",
      );
    }

    return (
      `duplicate=${duplicate.orderId}, ` +
      `status=${duplicate.status}, ` +
      `risk=${diagnostics.duplicateSubmissionRisk}`
    );
  }

  private testSettlementCrashWindow(
    root:
      string,
  ): string {
    const file =
      resolve(
        root,
        "settlement-crash.jsonl",
      );

    const sessionId =
      `synthetic-settlement-${randomUUID()}`;

    const first =
      new ExecutionSettlementAccountingPersistenceService(
        file,
      );

    /*
     * Simulate process dying immediately after
     * durable pre-accounting marker.
     */
    first.begin(
      sessionId,
      false,
    );

    const restarted =
      new ExecutionSettlementAccountingPersistenceService(
        file,
      );

    const preflight =
      restarted
        .preflight(
          sessionId,
        );

    const diagnostics =
      restarted
        .getDiagnostics();

    if (
      preflight.allowed
    ) {
      throw new Error(
        "PENDING_SETTLEMENT was incorrectly allowed to replay after restart.",
      );
    }

    if (
      !preflight.uncertain
    ) {
      throw new Error(
        "PENDING_SETTLEMENT was not classified accounting-uncertain.",
      );
    }

    if (
      diagnostics
        .accountingUncertain !==
      1
    ) {
      throw new Error(
        `Expected accountingUncertain=1, observed ${diagnostics.accountingUncertain}.`,
      );
    }

    return (
      `allowed=${preflight.allowed}, ` +
      `uncertain=${preflight.uncertain}, ` +
      `accountingUncertain=${diagnostics.accountingUncertain}`
    );
  }

  private testAccountingIdempotency(
    root:
      string,
  ): string {
    const file =
      resolve(
        root,
        "account-ledger.jsonl",
      );

    const transactionId =
      `settlement:synthetic-${randomUUID()}`;

    const before =
      structuredClone(
        defaultTradingAccount,
      );

    const after =
      structuredClone(
        before,
      );

    after.todayProfit +=
      25;

    after.currentCapital +=
      25;

    after.availableCapital +=
      25;

    const first =
      new TradingAccountLedgerService(
        file,
      );

    first.recordMutation(
      "RECORD_PROFIT",

      before,

      after,

      {
        transactionId,

        amount:
          25,
      },
    );

    const restarted =
      new TradingAccountLedgerService(
        file,
      );

    if (
      !restarted
        .hasAppliedTransaction(
          transactionId,
        )
    ) {
      throw new Error(
        "Committed accounting transaction was not restored.",
      );
    }

    let duplicateBlocked =
      false;

    try {
      restarted
        .recordMutation(
          "RECORD_PROFIT",

          after,

          {
            ...after,

            todayProfit:
              after.todayProfit +
              25,

            currentCapital:
              after.currentCapital +
              25,

            availableCapital:
              after.availableCapital +
              25,
          },

          {
            transactionId,

            amount:
              25,
          },
        );
    } catch {
      duplicateBlocked =
        true;
    }

    if (
      !duplicateBlocked
    ) {
      throw new Error(
        "Duplicate accounting transaction was accepted after restart.",
      );
    }

    return (
      `transactionRestored=true, ` +
      `duplicateBlocked=${duplicateBlocked}`
    );
  }

  private testPreparedOrderDoesNotBlock(
    root:
      string,
  ): string {
    const file =
      resolve(
        root,
        "prepared-order.jsonl",
      );

    const sessionId =
      `synthetic-prepared-${randomUUID()}`;

    const clientOrderId =
      `synthetic-${randomUUID()}`;

    const first =
      new OrderLifecycleEvidenceService(
        file,
      );

    first.capture(
      this.createOrder({
        sessionId,

        status:
          "PREPARED",

        clientOrderId,

        leg:
          "SELL",
      }),

      false,
    );

    const restarted =
      new OrderLifecycleEvidenceService(
        file,
      );

    const duplicate =
      restarted
        .findPotentialDuplicate(
          sessionId,
          "SELL",
          clientOrderId,
        );

    if (
      duplicate !==
      null
    ) {
      throw new Error(
        "PREPARED-only order was incorrectly classified as exchange-submitted duplicate evidence.",
      );
    }

    return "duplicate=null";
  }

  private testDryRunDoesNotBlock(
    root:
      string,
  ): string {
    const file =
      resolve(
        root,
        "dry-run-order.jsonl",
      );

    const sessionId =
      `synthetic-dry-run-${randomUUID()}`;

    const clientOrderId =
      `synthetic-${randomUUID()}`;

    const first =
      new OrderLifecycleEvidenceService(
        file,
      );

    first.capture(
      this.createOrder({
        sessionId,

        status:
          "SUBMISSION_REQUESTED",

        clientOrderId,

        leg:
          "BUY",
      }),

      true,
    );

    const restarted =
      new OrderLifecycleEvidenceService(
        file,
      );

    const duplicate =
      restarted
        .findPotentialDuplicate(
          sessionId,
          "BUY",
          clientOrderId,
        );

    const diagnostics =
      restarted
        .getDiagnostics();

    if (
      duplicate !==
      null
    ) {
      throw new Error(
        "Dry-run evidence incorrectly blocked real-order duplicate lookup.",
      );
    }

    if (
      diagnostics
        .possibleSubmittedRealOrders !==
      0
    ) {
      throw new Error(
        "Dry-run lifecycle was counted as a potentially submitted real order.",
      );
    }

    return (
      `duplicate=null, ` +
      `possibleSubmittedRealOrders=${diagnostics.possibleSubmittedRealOrders}`
    );
  }

  private createOrder(
    input: {
      sessionId: string;

      status:
        OrderLifecycleRecord[
          "status"
        ];

      clientOrderId:
        string;

      leg:
        "BUY" |
        "SELL";
    },
  ):
    OrderLifecycleRecord {
    const now =
      Date.now();

    const side =
      input.leg ===
      "BUY"
        ? "buy"
        : "sell";

    return {
      id:
        randomUUID(),

      sessionId:
        input.sessionId,

      planId:
        `synthetic-plan-${randomUUID()}`,

      leg:
        input.leg,

      purpose:
        "PRIMARY",

      recoveryIncidentId:
        null,

      exchange:
        "synthetic-exchange",

      market:
        "TESTUSDT",

      side,

      status:
        input.status,

      request: {
        exchange:
          "synthetic-exchange",

        market:
          "TESTUSDT",

        side,

        orderType:
          "limit",

        quantity:
          1,

        price:
          100,

        clientOrderId:
          input.clientOrderId,

        timeoutMs:
          5_000,

        pollingIntervalMs:
          1_000,

        cancelOnTimeout:
          true,
      },

      exchangeOrderId:
        null,

      clientOrderId:
        input.clientOrderId,

      requestedQuantity:
        1,

      filledQuantity:
        0,

      remainingQuantity:
        1,

      requestedPrice:
        100,

      averageFillPrice:
        0,

      feeAmount:
        0,

      createdAt:
        now,

      updatedAt:
        now,

      submittedAt:
        input.status ===
        "PREPARED"
          ? null
          : now,

      completedAt:
        null,

      failureReason:
        null,

      latestResult:
        null,

      events: [],
    };
  }

  private runDrill(
    key:
      string,

    expected:
      string,

    operation:
      () => string,
  ):
    FailureInjectionDrillResult {
    const startedAt =
      Date.now();

    try {
      const observed =
        operation();

      return {
        key,

        title:
          expected,

        status:
          "PASS",

        expected,

        observed,

        durationMs:
          Date.now() -
          startedAt,

        error:
          null,
      };
    } catch (
      error:
        unknown
    ) {
      return {
        key,

        title:
          expected,

        status:
          "FAIL",

        expected,

        observed:
          "Validation drill failed.",

        durationMs:
          Date.now() -
          startedAt,

        error:
          error instanceof Error
            ? error.message
            : "Unknown validation error.",
      };
    }
  }
}

export const failureInjectionValidationService =
  new FailureInjectionValidationService();
