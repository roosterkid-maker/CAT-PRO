import {
  randomUUID,
} from "node:crypto";

import {
  portfolioService,
} from "../../portfolio/services/PortfolioService";

import {
  tradingAccountService,
} from "../../trading/account/TradingAccountService";

import {
  paperTradingService,
} from "../../trading/services/PaperTradingService";

import type {
  PaperTrade,
} from "../../trading/models/PaperTrade";

import type {
  AutomatedPaperControllerCycleResult,
} from "../models/AutomatedPaperExecutionController";

import type {
  PaperAutomationAccountingDiagnostics,
  PaperAutomationAccountingIntegrity,
  PaperAutomationLedgerEntry,
  PaperAutomationLedgerStatus,
} from "../models/PaperAutomationAccounting";

import {
  automatedPaperExecutionControllerService,
} from "./AutomatedPaperExecutionControllerService";

import {
  cloneStrategyAttribution,
} from "../../strategies/models/StrategyAttribution";

export type PaperAutomationRouteEntry =
  Pick<
    PaperAutomationLedgerEntry,
    | "capitalUsed"
    | "netProfit"
    | "status"
    | "successful"
  >;

export class PaperAutomationAccountingService {
  private readonly entries =
    new Map<
      string,
      PaperAutomationLedgerEntry
    >();

  private synchronizations =
    0;

  private lastSynchronizedAt:
    number | null =
    null;

  private lastControllerCycleId =
    0;

  private lastReconciledTradeRevision:
    number | null =
    null;

  synchronize(
    now =
      Date.now(),
  ): PaperAutomationAccountingDiagnostics {
    /*
     * IMPORTANT:
     *
     * This service NEVER:
     *
     * - reserves capital
     * - releases capital
     * - records account profit
     * - creates a paper order
     * - closes a paper trade
     *
     * Existing trading services remain the
     * only accounting mutation owners.
     *
     * Version 16.1 is reconciliation only.
     */
    this.synchronizeState(
      now,
    );

    return this.getDiagnostics(
      now,
    );
  }

  /**
   * Hot-path reconciliation variant. It captures only controller cycles that
   * have not been seen and deliberately avoids constructing the full
   * accounting/portfolio response when the caller discards that response.
   */
  synchronizeState(
    now =
      Date.now(),
  ): void {
    const cycles =
      automatedPaperExecutionControllerService
        .getRecentCyclesAfter(
          this.lastControllerCycleId,
        );

    for (
      const cycle
      of cycles
    ) {
      this.captureCycle(
        cycle,
        now,
      );

      this.lastControllerCycleId =
        Math.max(
          this.lastControllerCycleId,
          cycle.cycleId,
        );
    }

    this.reconcileEntries(
      now,
    );

    this.synchronizations +=
      1;

    this.lastSynchronizedAt =
      now;
  }

  getDiagnostics(
    now =
      Date.now(),
  ): PaperAutomationAccountingDiagnostics {
    /*
     * Reconcile on every diagnostics request.
     *
     * Still completely read-only.
     */
    this.reconcileEntries(
      now,
    );

    const entries =
      Array.from(
        this.entries.values(),
      )
        .sort(
          (
            first,
            second,
          ) =>
            second.executedAt -
            first.executedAt,
        )
        .map(
          (
            entry,
          ) =>
            structuredClone(
              entry,
            ),
        );

    const account =
      tradingAccountService
        .getAccount();

    const paperTrades =
      paperTradingService
        .getTrades();

    const portfolio =
      portfolioService
        .getSummary(
          paperTrades,
        );

    const capitalUsed =
      entries.reduce(
        (
          total,
          entry,
        ) =>
          total +
          entry.capitalUsed,
        0,
      );

    const grossProfit =
      entries.reduce(
        (
          total,
          entry,
        ) =>
          total +
          entry.grossProfit,
        0,
      );

    const totalFees =
      entries.reduce(
        (
          total,
          entry,
        ) =>
          total +
          entry.totalFees,
        0,
      );

    const netProfit =
      entries.reduce(
        (
          total,
          entry,
        ) =>
          total +
          entry.netProfit,
        0,
      );

    const netProfitPercentOnCapitalUsed =
      capitalUsed >
      0
        ? (
            netProfit /
            capitalUsed
          ) *
          100
        : 0;

    const allocatedCapital =
      Math.max(
        0,

        account.currentCapital -
          account.availableCapital,
      );

    const todayNetProfit =
      account.todayProfit -
      account.todayLoss;

    const integrity =
      this.buildIntegrity(
        entries,
        portfolio,
        paperTrades,
      );

    return {
      generatedAt:
        now,

      mode:
        "PAPER",

      accountingMutationAllowed:
        false,

      liveExecutionAllowed:
        false,

      synchronizations:
        this.synchronizations,

      lastSynchronizedAt:
        this.lastSynchronizedAt,

      totalEntries:
        entries.length,

      matched:
        this.countStatus(
          entries,
          "MATCHED",
        ),

      missingPaperTrades:
        this.countStatus(
          entries,
          "PAPER_TRADE_MISSING",
        ),

      incompletePaperTrades:
        this.countStatus(
          entries,
          "PAPER_TRADE_INCOMPLETE",
        ),

      profitMismatches:
        this.countStatus(
          entries,
          "PROFIT_MISMATCH",
        ),

      winningTrades:
        entries.filter(
          (
            entry,
          ) =>
            entry.netProfit >
            0,
        ).length,

      losingTrades:
        entries.filter(
          (
            entry,
          ) =>
            entry.netProfit <
            0,
        ).length,

      breakEvenTrades:
        entries.filter(
          (
            entry,
          ) =>
            this.closeEnough(
              entry.netProfit,
              0,
            ),
        ).length,

      totals: {
        capitalUsed:
          this.round(
            capitalUsed,
            12,
          ),

        grossProfit:
          this.round(
            grossProfit,
            12,
          ),

        totalFees:
          this.round(
            totalFees,
            12,
          ),

        netProfit:
          this.round(
            netProfit,
            12,
          ),

        netProfitPercentOnCapitalUsed:
          this.round(
            netProfitPercentOnCapitalUsed,
            6,
          ),
      },

      account: {
        initialCapital:
          this.round(
            account.initialCapital,
            12,
          ),

        currentCapital:
          this.round(
            account.currentCapital,
            12,
          ),

        availableCapital:
          this.round(
            account.availableCapital,
            12,
          ),

        allocatedCapital:
          this.round(
            allocatedCapital,
            12,
          ),

        todayProfit:
          this.round(
            account.todayProfit,
            12,
          ),

        todayLoss:
          this.round(
            account.todayLoss,
            12,
          ),

        todayNetProfit:
          this.round(
            todayNetProfit,
            12,
          ),

        openTrades:
          account.openTrades,

        tradesToday:
          account.tradesToday,

        totalCapitalChange:
          this.round(
            account.currentCapital -
              account.initialCapital,
            12,
          ),
      },

      portfolio: {
        totalTrades:
          portfolio.totalTrades,

        openTrades:
          portfolio.openTrades,

        closedTrades:
          portfolio.closedTrades,

        winningTrades:
          portfolio.winningTrades,

        losingTrades:
          portfolio.losingTrades,

        totalRealizedProfit:
          portfolio.totalRealizedProfit,

        winRatePercent:
          portfolio.winRatePercent,

        roiPercent:
          portfolio.roiPercent,

        profitFactor:
          portfolio.profitFactor,
      },

      integrity,

      entries,
    };
  }

  /**
   * Compact read model for the route optimizer. The hot path needs only four
   * scalar fields, so it must not clone the complete PAPER trade history or
   * construct the full accounting dashboard for every candidate route.
   */
  getRouteEntries(
    buyExchange:
      string,

    sellExchange:
      string,

    now =
      Date.now(),
  ): PaperAutomationRouteEntry[] {
    this.reconcileEntries(
      now,
    );

    const normalizedBuy =
      buyExchange
        .trim()
        .toLowerCase();

    const normalizedSell =
      sellExchange
        .trim()
        .toLowerCase();

    const routeEntries:
      PaperAutomationRouteEntry[] =
      [];

    for (
      const entry
      of this.entries.values()
    ) {
      if (
        entry.buyExchange !==
          normalizedBuy ||
        entry.sellExchange !==
          normalizedSell
      ) {
        continue;
      }

      routeEntries.push({
        capitalUsed:
          entry.capitalUsed,

        netProfit:
          entry.netProfit,

        status:
          entry.status,

        successful:
          entry.successful,
      });
    }

    return routeEntries;
  }

  getEntry(
    planId:
      string,
  ): PaperAutomationLedgerEntry | null {
    this.reconcileEntries();

    const entry =
      this.entries.get(
        planId,
      );

    return entry
      ? structuredClone(
          entry,
        )
      : null;
  }

  private captureCycle(
    cycle:
      AutomatedPaperControllerCycleResult,

    synchronizedAt:
      number,
  ): void {
    if (
      cycle.status !==
      "EXECUTED"
    ) {
      return;
    }

    if (
      !cycle.result ||
      !cycle.candidate
    ) {
      return;
    }

    const planId =
      cycle.result.planId;

    /*
     * Idempotency:
     *
     * one ExecutionResult / planId creates
     * exactly one automation accounting entry.
     */
    if (
      this.entries.has(
        planId,
      )
    ) {
      return;
    }

    const executedAt =
      cycle.result.completedAt ??
      cycle.completedAt;

    const entry:
      PaperAutomationLedgerEntry = {
      strategyAttribution:
        cloneStrategyAttribution(
          cycle
            .result
            .strategyAttribution,
        ),

      id:
        randomUUID(),

      cycleId:
        cycle.cycleId,

      planId,

      candidateKey:
        cycle
          .candidate
          .candidateKey,

      candidateGeneration:
        cycle
          .candidate
          .candidateGeneration,

      market:
        cycle.result.market,

      buyExchange:
        cycle
          .result
          .buy
          .exchange
          .trim()
          .toLowerCase(),

      sellExchange:
        cycle
          .result
          .sell
          .exchange
          .trim()
          .toLowerCase(),

      capitalUsed:
        cycle.result.capitalUsed,

      grossProfit:
        cycle.result.grossProfit,

      totalFees:
        cycle.result.totalFees,

      netProfit:
        cycle.result.netProfit,

      netProfitPercent:
        cycle.result.netProfitPercent,

      successful:
        cycle.result.successful,

      executedAt,

      synchronizedAt,

      paperTradeId:
        null,

      paperTradeStatus:
        null,

      paperTradeActualProfit:
        null,

      status:
        "PAPER_TRADE_MISSING",

      reasons: [
        "Automated PAPER execution captured in Version 16.1 accounting ledger.",
        "Awaiting reconciliation with PaperTradeStore.",
      ],
    };

    this.entries.set(
      planId,
      entry,
    );

    this.lastReconciledTradeRevision =
      null;
  }

  private reconcileEntries(
    now =
      Date.now(),
  ): void {
    const tradeRevision =
      paperTradingService
        .getTradeRevision();

    if (
      this.lastReconciledTradeRevision ===
      tradeRevision
    ) {
      return;
    }

    for (
      const entry
      of this.entries.values()
    ) {
      const paperTrade =
        paperTradingService
          .getTrade(
            entry.planId,
          );

      entry.synchronizedAt =
        now;

      if (
        !paperTrade
      ) {
        entry.paperTradeId =
          null;

        entry.paperTradeStatus =
          null;

        entry.paperTradeActualProfit =
          null;

        entry.status =
          "PAPER_TRADE_MISSING";

        entry.reasons = [
          "Execution exists in automation ledger but matching PaperTradeStore record is missing.",
        ];

        continue;
      }

      entry.paperTradeId =
        paperTrade.id;

      entry.paperTradeStatus =
        paperTrade.status;

      entry.paperTradeActualProfit =
        typeof paperTrade
          .actualProfit ===
        "number"
          ? paperTrade.actualProfit
          : null;

      if (
        paperTrade.status !==
        "closed" ||
        paperTrade.actualProfit ===
        null
      ) {
        entry.status =
          "PAPER_TRADE_INCOMPLETE";

        entry.reasons = [
          `Matching paper trade exists but is not finalized. Current status: ${paperTrade.status}.`,
        ];

        continue;
      }

      if (
        !this.closeEnough(
          paperTrade.actualProfit,
          entry.netProfit,
        )
      ) {
        entry.status =
          "PROFIT_MISMATCH";

        entry.reasons = [
          "Automated ExecutionResult net profit does not match PaperTradeStore actual profit.",
          `ExecutionResult net profit: ${entry.netProfit}.`,
          `Paper trade actual profit: ${paperTrade.actualProfit}.`,
        ];

        continue;
      }

      entry.status =
        "MATCHED";

      entry.reasons = [
        "Automated execution result matches the finalized paper trade.",
        "Net profit is consistent across automation ledger and PaperTradeStore.",
        "No additional PnL mutation was performed by Version 16.1.",
      ];
    }

    this.lastReconciledTradeRevision =
      tradeRevision;
  }

  private buildIntegrity(
    entries:
      PaperAutomationLedgerEntry[],

    portfolio:
      ReturnType<
        typeof portfolioService.getSummary
      >,

    allPaperTrades:
      readonly PaperTrade[],
  ): PaperAutomationAccountingIntegrity {
    const account =
      tradingAccountService
        .getAccount();

    const completedPaperTrades =
      allPaperTrades.filter(
        (
          trade,
        ) =>
          trade.status ===
            "closed" &&
          trade.actualProfit !==
            null,
      );

    const entryPlanIds =
      new Set(
        entries.map(
          (
            entry,
          ) =>
            entry.planId,
        ),
      );

    const accountCapitalValid =
      Number.isFinite(
        account.currentCapital,
      ) &&
      account.currentCapital >=
        0;

    const availableCapitalValid =
      Number.isFinite(
        account.availableCapital,
      ) &&
      account.availableCapital >=
        0 &&
      account.availableCapital <=
        account.currentCapital +
          1e-8;

    const portfolioCapitalMatchesAccount =
      this.closeEnough(
        portfolio.ledgerCurrentCapital,
        this.round(
          account.currentCapital,
          2,
        ),
      ) &&
      this.closeEnough(
        portfolio.ledgerAvailableCapital,
        this.round(
          account.availableCapital,
          2,
        ),
      );

    const automationLedgerMatchesPaperTrades =
      entries.every(
        (
          entry,
        ) =>
          entry.status ===
          "MATCHED",
      );

    /*
     * We can only assert that account PnL must
     * equal automation-ledger PnL when every
     * completed paper trade belongs to this
     * automation ledger.
     *
     * Manual/legacy paper trades otherwise make
     * such equality invalid.
     */
    const exclusiveAutomationCoverage =
      completedPaperTrades.length ===
        entries.length &&
      completedPaperTrades.every(
        (
          trade,
        ) =>
          entryPlanIds.has(
            trade.id,
          ),
      );

    const automatedNetProfit =
      entries.reduce(
        (
          total,
          entry,
        ) =>
          total +
          entry.netProfit,
        0,
      );

    const accountProfitMatchesAutomationLedger =
      exclusiveAutomationCoverage
        ? this.closeEnough(
            account.currentCapital -
              account.initialCapital,

            automatedNetProfit,
          )
        : null;

    const reasons:
      string[] =
      [];

    if (
      !accountCapitalValid
    ) {
      reasons.push(
        "Trading account current capital is invalid.",
      );
    }

    if (
      !availableCapitalValid
    ) {
      reasons.push(
        "Trading account available capital violates account invariants.",
      );
    }

    if (
      !portfolioCapitalMatchesAccount
    ) {
      reasons.push(
        "Portfolio capital snapshot does not match TradingAccountService.",
      );
    }

    if (
      !automationLedgerMatchesPaperTrades
    ) {
      reasons.push(
        "One or more automated PAPER executions do not reconcile with PaperTradeStore.",
      );
    }

    if (
      exclusiveAutomationCoverage &&
      accountProfitMatchesAutomationLedger ===
        false
    ) {
      reasons.push(
        "Trading account capital delta does not equal automated PAPER ledger net profit.",
      );
    }

    if (
      !exclusiveAutomationCoverage
    ) {
      reasons.push(
        "Account-vs-automation PnL equality was not asserted because manual or legacy paper trades may also exist.",
      );
    }

    if (
      reasons.length ===
      0
    ) {
      reasons.push(
        "Paper automation accounting reconciliation passed all applicable integrity checks.",
      );
    }

    return {
      accountCapitalValid,

      availableCapitalValid,

      portfolioCapitalMatchesAccount,

      automationLedgerMatchesPaperTrades,

      exclusiveAutomationCoverage,

      accountProfitMatchesAutomationLedger,

      reasons,
    };
  }

  private countStatus(
    entries:
      PaperAutomationLedgerEntry[],

    status:
      PaperAutomationLedgerStatus,
  ): number {
    return entries.filter(
      (
        entry,
      ) =>
        entry.status ===
        status,
    ).length;
  }

  private closeEnough(
    first:
      number,

    second:
      number,
  ): boolean {
    if (
      !Number.isFinite(
        first,
      ) ||
      !Number.isFinite(
        second,
      )
    ) {
      return false;
    }

    const tolerance =
      Math.max(
        1e-8,

        Math.max(
          Math.abs(
            first,
          ),

          Math.abs(
            second,
          ),
        ) *
          1e-8,
      );

    return (
      Math.abs(
        first -
        second,
      ) <=
      tolerance
    );
  }

  private round(
    value:
      number,

    digits:
      number,
  ): number {
    if (
      !Number.isFinite(
        value,
      )
    ) {
      return 0;
    }

    const multiplier =
      10 **
      digits;

    return (
      Math.round(
        (
          value +
          Number.EPSILON
        ) *
          multiplier,
      ) /
      multiplier
    );
  }
}

export const paperAutomationAccountingService =
  new PaperAutomationAccountingService();
