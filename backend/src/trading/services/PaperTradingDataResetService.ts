import {
  liveExecutionSessionEvidenceService,
} from "../../execution/live/coordinator/LiveExecutionSessionEvidenceService";

import {
  centralPaperCapitalAllocationService,
} from "../../strategies/services/CentralPaperCapitalAllocationService";

import {
  centralPaperExecutionQueueService,
} from "../../strategies/services/CentralPaperExecutionQueueService";

import {
  centralPaperPositionAccountingService,
} from "../../strategies/services/CentralPaperPositionAccountingService";

import {
  centralPaperPositionLedgerService,
} from "../../strategies/services/CentralPaperPositionLedgerService";

import {
  centralPaperSimulationJournalService,
} from "../../strategies/services/CentralPaperSimulationJournalService";

import {
  personalBotRuntimeControlService,
} from "../../strategies/services/PersonalBotRuntimeControlService";

import {
  strategyOnePaperRuntimeAcceptanceService,
} from "../../workflows/cross-exchange-arbitrage/services/StrategyOnePaperRuntimeAcceptanceService";

import {
  tradingAccountLedgerService,
} from "../account/TradingAccountLedgerService";

import {
  tradingAccountService,
} from "../account/TradingAccountService";

import {
  paperExecutionJournalService,
} from "./PaperExecutionJournalService";

import {
  paperTradeStore,
} from "./PaperTradeStore";

import {
  paperVenueInventoryLedgerService,
} from "./PaperVenueInventoryLedgerService";

export const PAPER_TRADING_DATA_RESET_CONFIRMATION =
  "RESET_ALL_PAPER_TRADING_DATA" as const;

export interface PaperTradingDataResetSummary {
  readonly resetAt: number;

  readonly confirmation:
    typeof PAPER_TRADING_DATA_RESET_CONFIRMATION;

  readonly botEnabled: false;

  readonly liveDataCleared: false;

  readonly credentialsCleared: false;

  readonly configurationCleared: false;

  readonly cleared: {
    readonly paperTrades: number;
    readonly executionJournalRecords: number;
    readonly inventoryCheckpoints: number;
    readonly strategyOneAcceptanceRecords: number;
    readonly paperSessionRecords: number;
    readonly accountLedgerEntries: number;
    readonly dailyReservationAttempts: number;
    readonly centralQueueRecords: number;
    readonly centralCapitalAllocations: number;
    readonly centralSimulationRecords: number;
    readonly centralPositionGroups: number;
    readonly centralAccountingRecords: number;
  };
}

/** Explicit, confirmation-gated reset of simulated PAPER trading evidence. */
export class PaperTradingDataResetService {
  reset(
    confirmation:
      unknown,

    now =
      Date.now(),
  ): PaperTradingDataResetSummary {
    if (
      confirmation !==
        PAPER_TRADING_DATA_RESET_CONFIRMATION
    ) {
      throw new Error(
        `PAPER data reset requires confirmation ${PAPER_TRADING_DATA_RESET_CONFIRMATION}.`,
      );
    }

    if (
      !Number.isSafeInteger(
        now,
      ) ||
      now <=
        0
    ) {
      throw new Error(
        "PAPER data reset timestamp must be positive.",
      );
    }

    const account =
      tradingAccountService
        .getAccount();

    if (
      account.mode !==
        "PAPER"
    ) {
      throw new Error(
        "PAPER data reset is unavailable unless the trading account is in PAPER mode.",
      );
    }

    const trades =
      paperTradeStore
        .getAll();

    const journalDiagnostics =
      paperExecutionJournalService
        .getDiagnostics();

    const inventoryDiagnostics =
      paperVenueInventoryLedgerService
        .getDiagnostics();

    const acceptance =
      strategyOnePaperRuntimeAcceptanceService
        .getReport();

    const ledgerDiagnostics =
      tradingAccountLedgerService
        .getDiagnostics();

    const dailyAttempts =
      tradingAccountLedgerService
        .getDailyCapitalReservationAttempts(
          now,
        );

    const centralQueue =
      centralPaperExecutionQueueService
        .getDiagnostics(
          now,
        );

    const centralCapital =
      centralPaperCapitalAllocationService
        .getDiagnostics(
          now,
        );

    const centralSimulation =
      centralPaperSimulationJournalService
        .getDiagnostics(
          now,
        );

    const centralPositions =
      centralPaperPositionLedgerService
        .getDiagnostics(
          now,
        );

    const centralAccounting =
      centralPaperPositionAccountingService
        .getDiagnostics(
          now,
        );

    const paperPlanIds =
      new Set<string>([
        ...trades.map(
          (
            trade,
          ) =>
            trade.id,
        ),

        ...paperExecutionJournalService
          .getPlanIds(),
      ]);

    personalBotRuntimeControlService
      .setEnabled(
        false,
        now,
      );

    const paperSessionRecords =
      liveExecutionSessionEvidenceService
        .clearPaperSessions(
          paperPlanIds,
        );

    strategyOnePaperRuntimeAcceptanceService
      .clear();

    paperExecutionJournalService
      .clear();

    paperVenueInventoryLedgerService
      .clear();

    paperTradeStore
      .clear();

    centralPaperExecutionQueueService
      .clear();

    centralPaperCapitalAllocationService
      .clear();

    centralPaperSimulationJournalService
      .clear();

    centralPaperPositionLedgerService
      .clear();

    centralPaperPositionAccountingService
      .clear();

    tradingAccountService
      .resetPaperTradingData(
        now,
      );

    return {
      resetAt:
        now,

      confirmation:
        PAPER_TRADING_DATA_RESET_CONFIRMATION,

      botEnabled:
        false,

      liveDataCleared:
        false,

      credentialsCleared:
        false,

      configurationCleared:
        false,

      cleared: {
        paperTrades:
          trades.length,

        executionJournalRecords:
          journalDiagnostics.executions,

        inventoryCheckpoints:
          inventoryDiagnostics.checkpoints,

        strategyOneAcceptanceRecords:
          acceptance.totalAttempts,

        paperSessionRecords,

        accountLedgerEntries:
          ledgerDiagnostics.entries,

        dailyReservationAttempts:
          dailyAttempts.length,

        centralQueueRecords:
          centralQueue.records,

        centralCapitalAllocations:
          centralCapital.records,

        centralSimulationRecords:
          centralSimulation.records,

        centralPositionGroups:
          centralPositions.groups,

        centralAccountingRecords:
          centralAccounting.records,
      },
    };
  }
}

export const paperTradingDataResetService =
  new PaperTradingDataResetService();
