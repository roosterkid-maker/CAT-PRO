import type {
  AutomationSchedulerDiagnostics,
} from "../models/AutomationScheduler";

import type {
  AutomatedPaperExecutionControllerDiagnostics,
} from "../models/AutomatedPaperExecutionController";

import type {
  PaperAutomationAccountingDiagnostics,
} from "../models/PaperAutomationAccounting";

import type {
  PaperTradingReadinessGate,
  PaperTradingReadinessReport,
} from "../models/PaperTradingReadiness";

import type {
  ShadowPerformanceAnalytics,
} from "../models/ShadowPerformanceAnalytics";

import type {
  ExchangeFleetCapabilityReport,
} from "../../exchanges/core/ExchangeFleetRegistry";

import {
  exchangeFleetRegistry,
} from "../../exchanges/core/ExchangeFleetRegistry";

import type {
  FiveExchangePaperShadowReadinessReport,
} from "../../exchanges/services/FiveExchangePaperShadowReadinessService";

import {
  fiveExchangePaperShadowReadinessService,
} from "../../exchanges/services/FiveExchangePaperShadowReadinessService";

import type {
  StrategyPerformanceAnalytics,
} from "../../strategies/models/StrategyPerformanceAnalytics";

import type {
  StrategyOnePaperRuntimeAcceptanceReport,
} from "../../workflows/cross-exchange-arbitrage/models/StrategyOnePaperRuntimeAcceptance";

import {
  automatedPaperExecutionControllerService,
} from "./AutomatedPaperExecutionControllerService";

import {
  automationSchedulerService,
} from "./AutomationSchedulerService";

import {
  paperAutomationAccountingService,
} from "./PaperAutomationAccountingService";

import {
  shadowPerformanceAnalyticsService,
} from "./ShadowPerformanceAnalyticsService";

import {
  strategyAttributionAnalyticsService,
} from "../../analytics/services/StrategyAttributionAnalyticsService";

import {
  strategyOnePaperRuntimeAcceptanceService,
} from "../../workflows/cross-exchange-arbitrage/services/StrategyOnePaperRuntimeAcceptanceService";

const PRIMARY_STRATEGY_ID =
  "cross-exchange-arbitrage";

export interface PaperTradingReadinessDependencies {
  scheduler():
    AutomationSchedulerDiagnostics;

  performance():
    ShadowPerformanceAnalytics;

  paperController():
    AutomatedPaperExecutionControllerDiagnostics;

  accounting():
    PaperAutomationAccountingDiagnostics;

  fleet():
    ExchangeFleetCapabilityReport;

  paperShadowReadiness():
    Promise<FiveExchangePaperShadowReadinessReport>;

  strategyPerformance():
    StrategyPerformanceAnalytics;

  runtimeAcceptance():
    StrategyOnePaperRuntimeAcceptanceReport;
}

export interface PaperTradingReadinessConfig {
  minimumAttributedClosedTrades:
    number;

  minimumCrossExchangeVenues:
    number;
}

const DEFAULT_CONFIG:
  PaperTradingReadinessConfig = {
  minimumAttributedClosedTrades:
    20,

  minimumCrossExchangeVenues:
    2,
};

export class PaperTradingReadinessService {
  private readonly dependencies:
    PaperTradingReadinessDependencies;

  private readonly config:
    PaperTradingReadinessConfig;

  constructor(
    dependencies:
      Partial<PaperTradingReadinessDependencies> = {},
    config:
      Partial<PaperTradingReadinessConfig> = {},
  ) {
    this.dependencies = {
      scheduler:
        dependencies.scheduler ??
        (() =>
          automationSchedulerService
            .getDiagnostics()),
      performance:
        dependencies.performance ??
        (() =>
          shadowPerformanceAnalyticsService
            .getAnalytics()),
      paperController:
        dependencies.paperController ??
        (() =>
          automatedPaperExecutionControllerService
            .getDiagnostics()),
      accounting:
        dependencies.accounting ??
        (() =>
          paperAutomationAccountingService
            .getDiagnostics()),
      fleet:
        dependencies.fleet ??
        (() =>
          exchangeFleetRegistry
            .getReport()),
      paperShadowReadiness:
        dependencies.paperShadowReadiness ??
        (() =>
          fiveExchangePaperShadowReadinessService
            .getReport()),
      strategyPerformance:
        dependencies.strategyPerformance ??
        (() =>
          strategyAttributionAnalyticsService
            .getPerformance(
              PRIMARY_STRATEGY_ID,
            )),
      runtimeAcceptance:
        dependencies.runtimeAcceptance ??
        (() =>
          strategyOnePaperRuntimeAcceptanceService
            .getReport()),
    };

    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };

    if (
      !Number.isSafeInteger(
        this.config
          .minimumAttributedClosedTrades,
      ) ||
      this.config
        .minimumAttributedClosedTrades <
        1
    ) {
      throw new Error(
        "minimumAttributedClosedTrades must be a positive safe integer.",
      );
    }

    if (
      !Number.isSafeInteger(
        this.config
          .minimumCrossExchangeVenues,
      ) ||
      this.config
        .minimumCrossExchangeVenues <
        2 ||
      this.config
        .minimumCrossExchangeVenues >
        5
    ) {
      throw new Error(
        "minimumCrossExchangeVenues must be a safe integer from 2 through 5.",
      );
    }
  }

  async getReport(
    now =
      Date.now(),
  ): Promise<PaperTradingReadinessReport> {
    const scheduler =
      this.dependencies
        .scheduler();
    const performance =
      this.dependencies
        .performance();
    const paperController =
      this.dependencies
        .paperController();
    const accounting =
      this.dependencies
        .accounting();
    const fleet =
      this.dependencies
        .fleet();
    const strategyPerformance =
      this.dependencies
        .strategyPerformance();
    const runtimeAcceptance =
      this.dependencies
        .runtimeAcceptance();
    const paperShadow =
      await this.dependencies
        .paperShadowReadiness();

    const accountingIntegrityPassed =
      accounting.integrity
        .accountCapitalValid &&
      accounting.integrity
        .availableCapitalValid &&
      accounting.integrity
        .portfolioCapitalMatchesAccount &&
      accounting.integrity
        .automationLedgerMatchesPaperTrades &&
      accounting.integrity
        .accountProfitMatchesAutomationLedger !==
        false;

    const liveDisabled =
      scheduler.liveExecutionAllowed ===
        false &&
      paperController.liveExecutionAllowed ===
        false &&
      paperShadow.liveTradingEnabled ===
        false &&
      paperShadow.liveSubmissionAllowed ===
        false &&
      fleet.liveTradingEnabled ===
        false &&
      fleet.liveSubmissionAllowed ===
        false;

    const baseGates = {
      schedulerRunning:
        scheduler.running,
      shadowMode:
        scheduler.mode ===
        "SHADOW",
      snapshotHandoff:
        scheduler.snapshotSubscriptionActive &&
        scheduler.droppedSnapshotEvents ===
          0,
      marketData:
        fleet.targetExchangeCount ===
          5 &&
        fleet.summary
          .marketDataConnected ===
          5,
      crossExchangeShadow:
        paperShadow.summary
          .shadowAvailableExchanges >=
        this.config
          .minimumCrossExchangeVenues,
      paperAccount:
        accounting.mode ===
        "PAPER",
      accountingIntegrity:
        accountingIntegrityPassed,
      liveDisabled,
    };

    const paperGates = {
      shadowSample:
        performance.sampleRequirement
          .requirementMet,
      shadowReady:
        performance.readiness
          .readyForPaperAutomation,
      crossExchangePaper:
        paperShadow.targetExchangeCount ===
          5 &&
        paperShadow.summary
          .paperAvailableExchanges >=
        this.config
          .minimumCrossExchangeVenues,
      paperArmed:
        paperController
          .paperExecutionArmed,
      controllerAllowed:
        paperController
          .paperExecutionAllowed,
    };

    const readyForShadowDeployment =
      Object.values(
        baseGates,
      ).every(
        Boolean,
      ) &&
      !paperGates.paperArmed &&
      !paperGates.controllerAllowed;

    const readyForPaperTrading =
      Object.values(
        baseGates,
      ).every(
        Boolean,
      ) &&
      Object.values(
        paperGates,
      ).every(
        Boolean,
      );

    const attributedPaper =
      strategyPerformance.paper;

    const attributedClosedTrades =
      attributedPaper.closedTrades;

    const soakEvidenceAvailable =
      attributedPaper.evidenceStatus ===
        "AVAILABLE" &&
      attributedClosedTrades !==
        null;

    const remainingAttributedClosedTrades =
      soakEvidenceAvailable
        ? Math.max(
            0,
            this.config
              .minimumAttributedClosedTrades -
              attributedClosedTrades,
          )
        : null;

    const readyForPaperSoakReview =
      readyForPaperTrading &&
      soakEvidenceAvailable &&
      attributedClosedTrades >=
        this.config
          .minimumAttributedClosedTrades &&
      runtimeAcceptance
        .readyForPaperSoakReview;

    const gates =
      this.buildGates({
        scheduler,
        performance,
        paperController,
        paperAccountMode:
          accounting.mode ===
          "PAPER",
        accountingIntegrityPassed,
        fleet,
        paperShadow,
        liveDisabled,
        soakEvidenceAvailable,
        attributedClosedTrades,
        runtimeAcceptance,
      });

    const requiredStage =
      readyForPaperTrading
        ? "PAPER_SOAK"
        : "PAPER_START";

    const blockers =
      gates
        .filter(
          (gate) =>
            gate.requiredFor
              .includes(
                requiredStage,
              ) &&
            !gate.passed,
        )
        .map(
          (gate) =>
            gate.evidence,
        );

    const stage =
      !paperController
        .paperExecutionArmed
        ? "SHADOW_SOAK"
        : !readyForPaperTrading
          ? "PAPER_BLOCKED"
          : readyForPaperSoakReview
            ? "PAPER_SOAK_COMPLETE"
            : soakEvidenceAvailable
              ? "PAPER_SOAK"
              : "PAPER_READY";

    return structuredClone({
      generatedAt:
        now,
      version:
        "20.9",
      mode:
        "READ_ONLY_PAPER_READINESS",
      evidenceStatus:
        "AVAILABLE",
      stage,
      readyForShadowDeployment,
      readyForPaperTrading,
      readyForPaperSoakReview,
      liveExecutionAllowed:
        false,
      orderSubmissionAllowed:
        false,
      summary: {
        schedulerRunning:
          scheduler.running,
        targetExchangeCount:
          5,
        marketDataConnected:
          fleet.summary
            .marketDataConnected,
        minimumCrossExchangeVenues:
          this.config
            .minimumCrossExchangeVenues,
        shadowAvailableExchanges:
          paperShadow.summary
            .shadowAvailableExchanges,
        paperAvailableExchanges:
          paperShadow.summary
            .paperAvailableExchanges,
        completedShadowOutcomes:
          performance.summary
            .completed,
        minimumShadowOutcomes:
          performance.sampleRequirement
            .minimumCompletedOutcomes,
        remainingShadowOutcomes:
          performance.sampleRequirement
            .remaining,
        shadowReadinessLevel:
          performance.readiness
            .level,
        paperExecutionArmed:
          paperController
            .paperExecutionArmed,
        controllerPaperExecutionAllowed:
          paperController
            .paperExecutionAllowed,
        paperAccountMode:
          accounting.mode ===
          "PAPER",
        accountingIntegrityPassed,
        runtimeAcceptanceEvidence:
          runtimeAcceptance
            .evidenceStatus ===
          "AVAILABLE",
        runtimeAcceptanceReady:
          runtimeAcceptance
            .readyForPaperSoakReview,
      },
      soak: {
        evidenceStatus:
          soakEvidenceAvailable
            ? "AVAILABLE"
            : "NO_DATA",
        minimumAttributedClosedTrades:
          this.config
            .minimumAttributedClosedTrades,
        attributedPaperTrades:
          attributedPaper.totalTrades,
        attributedClosedTrades,
        remainingAttributedClosedTrades,
        attributedNetProfit:
          attributedPaper.netProfit,
        minimumConsecutiveRuntimePasses:
          runtimeAcceptance
            .minimumConsecutivePasses,
        consecutiveRuntimePasses:
          runtimeAcceptance
            .consecutivePasses,
        remainingConsecutiveRuntimePasses:
          runtimeAcceptance
            .remainingConsecutivePasses,
        status:
          readyForPaperSoakReview
            ? "READY_FOR_DEPLOYMENT_REVIEW"
            : soakEvidenceAvailable
              ? "COLLECTING"
              : "NOT_STARTED",
      },
      gates,
      blockers,
      notes: [
        "PAPER readiness is evidence only and does not execute a trade.",
        "Synthetic demo results are excluded because they never enter PaperTradeStore.",
        "PAPER soak counts only finalized trades explicitly attributed to cross-exchange-arbitrage.",
        "PAPER soak review additionally requires consecutive unified runtime attempts reconciled through journal, inventory, PaperTrade, and account transaction evidence.",
        "A completed PAPER soak is not LIVE authorization.",
        "LIVE execution and order submission remain disabled.",
      ],
    } satisfies PaperTradingReadinessReport);
  }

  private buildGates(
    input: {
      scheduler:
        AutomationSchedulerDiagnostics;
      performance:
        ShadowPerformanceAnalytics;
      paperController:
        AutomatedPaperExecutionControllerDiagnostics;
      paperAccountMode:
        boolean;
      accountingIntegrityPassed:
        boolean;
      fleet:
        ExchangeFleetCapabilityReport;
      paperShadow:
        FiveExchangePaperShadowReadinessReport;
      liveDisabled:
        boolean;
      soakEvidenceAvailable:
        boolean;
      attributedClosedTrades:
        number | null;
      runtimeAcceptance:
        StrategyOnePaperRuntimeAcceptanceReport;
    },
  ): PaperTradingReadinessGate[] {
    const gates:
      PaperTradingReadinessGate[] =
      [];

    const add = (
      key: string,
      label: string,
      passed: boolean,
      evidence: string,
      requiredFor:
        PaperTradingReadinessGate["requiredFor"],
    ) => {
      gates.push({
        key,
        label,
        status:
          passed
            ? "PASS"
            : "BLOCKED",
        passed,
        evidence,
        requiredFor,
      });
    };

    const allStages:
      PaperTradingReadinessGate["requiredFor"] = [
      "SHADOW_DEPLOYMENT",
      "PAPER_START",
      "PAPER_SOAK",
    ];

    add(
      "SCHEDULER_RUNNING",
      "Automation scheduler running",
      input.scheduler.running,
      `Scheduler running=${String(
        input.scheduler.running,
      )}.`,
      allStages,
    );
    add(
      "SCHEDULER_SHADOW_MODE",
      "Scheduler remains in SHADOW mode",
      input.scheduler.mode ===
        "SHADOW",
      `Scheduler mode=${input.scheduler.mode}.`,
      allStages,
    );
    add(
      "SNAPSHOT_HANDOFF_LOSSLESS",
      "Lossless snapshot handoff",
      input.scheduler
        .snapshotSubscriptionActive &&
        input.scheduler
          .droppedSnapshotEvents ===
          0,
      `Snapshot subscription=${String(
        input.scheduler
          .snapshotSubscriptionActive,
      )}; dropped=${input.scheduler.droppedSnapshotEvents}.`,
      allStages,
    );
    add(
      "FIVE_EXCHANGE_MARKET_DATA",
      "Five-exchange market data",
      input.fleet.summary
        .marketDataConnected ===
        5,
      `Connected market data=${input.fleet.summary.marketDataConnected}/5.`,
      allStages,
    );
    add(
      "CROSS_EXCHANGE_SHADOW_AVAILABILITY",
      "Cross-exchange Shadow availability",
      input.paperShadow.summary
        .shadowAvailableExchanges >=
        this.config
          .minimumCrossExchangeVenues,
      `Shadow-available exchanges=${input.paperShadow.summary.shadowAvailableExchanges}/5; minimum=${this.config.minimumCrossExchangeVenues}.`,
      allStages,
    );
    add(
      "PAPER_ACCOUNT_MODE",
      "PAPER account mode",
      input.paperAccountMode,
      `PAPER account mode=${String(
        input.paperAccountMode,
      )}.`,
      allStages,
    );
    add(
      "ACCOUNTING_INTEGRITY",
      "Accounting integrity",
      input.accountingIntegrityPassed,
      `Accounting integrity=${String(
        input.accountingIntegrityPassed,
      )}.`,
      allStages,
    );
    add(
      "LIVE_FAIL_CLOSED",
      "LIVE remains fail-closed",
      input.liveDisabled,
      `All observed LIVE/order flags disabled=${String(
        input.liveDisabled,
      )}.`,
      allStages,
    );
    add(
      "SHADOW_SAMPLE_REQUIREMENT",
      "Shadow sample requirement",
      input.performance
        .sampleRequirement
        .requirementMet,
      `Completed Shadow outcomes=${input.performance.summary.completed}/${input.performance.sampleRequirement.minimumCompletedOutcomes}.`,
      [
        "PAPER_START",
        "PAPER_SOAK",
      ],
    );
    add(
      "SHADOW_READY_FOR_PAPER",
      "Shadow performance readiness",
      input.performance
        .readiness
        .readyForPaperAutomation,
      `Shadow readiness=${input.performance.readiness.level}.`,
      [
        "PAPER_START",
        "PAPER_SOAK",
      ],
    );
    add(
      "CROSS_EXCHANGE_PAPER_AVAILABILITY",
      "Cross-exchange PAPER availability",
      input.paperShadow.summary
        .paperAvailableExchanges >=
        this.config
          .minimumCrossExchangeVenues,
      `PAPER-available exchanges=${input.paperShadow.summary.paperAvailableExchanges}/5; minimum=${this.config.minimumCrossExchangeVenues}.`,
      [
        "PAPER_START",
        "PAPER_SOAK",
      ],
    );
    add(
      "PAPER_EXPLICITLY_ARMED",
      "PAPER explicitly armed",
      input.paperController
        .paperExecutionArmed,
      `PAPER armed=${String(
        input.paperController
          .paperExecutionArmed,
      )}.`,
      [
        "PAPER_START",
        "PAPER_SOAK",
      ],
    );
    add(
      "CONTROLLER_PAPER_ALLOWED",
      "Authoritative PAPER controller allowed",
      input.paperController
        .paperExecutionAllowed,
      `Controller PAPER allowed=${String(
        input.paperController
          .paperExecutionAllowed,
      )}.`,
      [
        "PAPER_START",
        "PAPER_SOAK",
      ],
    );
    add(
      "ATTRIBUTED_PAPER_SOAK",
      "Attributed finalized PAPER soak",
      input.soakEvidenceAvailable &&
        (
          input.attributedClosedTrades ??
          0
        ) >=
          this.config
            .minimumAttributedClosedTrades,
      input.soakEvidenceAvailable
        ? `Attributed finalized PAPER trades=${input.attributedClosedTrades}/${this.config.minimumAttributedClosedTrades}.`
        : "Attributed finalized PAPER trade evidence=NO_DATA.",
      [
        "PAPER_SOAK",
      ],
    );
    add(
      "STRATEGY_ONE_RUNTIME_ACCEPTANCE",
      "Strategy #1 unified PAPER runtime acceptance",
      input.runtimeAcceptance
        .readyForPaperSoakReview,
      `Consecutive reconciled runtime passes=${input.runtimeAcceptance.consecutivePasses}/${input.runtimeAcceptance.minimumConsecutivePasses}; incomplete=${input.runtimeAcceptance.evidenceIncomplete}.`,
      [
        "PAPER_SOAK",
      ],
    );

    return gates;
  }
}

export const paperTradingReadinessService =
  new PaperTradingReadinessService();
