import {
  liveExecutionService,
} from "../../execution/live/LiveExecutionService";

import {
  liveExecutionCoordinator,
} from "../../execution/live/coordinator/LiveExecutionCoordinator";

import {
  tradingAccountService,
} from "../../trading/account/TradingAccountService";

import type {
  ControlledLiveGate,
  ControlledLiveTradingDiagnostics,
} from "../models/ControlledLiveTrading";

import {
  paperAutomationAccountingService,
} from "./PaperAutomationAccountingService";

import {
  productionSafetyControllerService,
} from "./ProductionSafetyControllerService";

import {
  shadowPerformanceAnalyticsService,
} from "./ShadowPerformanceAnalyticsService";

const MAXIMUM_INITIAL_VALIDATION_CAPITAL =
  100;

export class ControlledLiveTradingFrameworkService {
  getDiagnostics():
    ControlledLiveTradingDiagnostics {
    const now =
      Date.now();

    const account =
      tradingAccountService
        .getAccount();

    const shadow =
      shadowPerformanceAnalyticsService
        .getAnalytics();

    const accounting =
      paperAutomationAccountingService
        .getDiagnostics();

    const coordinator =
      liveExecutionCoordinator
        .getDiagnostics();

    const adapters =
      liveExecutionService
        .getExchangeStatuses();

    const productionSafety =
      productionSafetyControllerService
        .getDiagnostics();

    const accountingIntegrityPassed =
      this.isAccountingIntegrityPassed(
        accounting.integrity,
      );

    const gates:
      ControlledLiveGate[] = [
      this.gate(
        "ACCOUNT_ENABLED",

        account.enabled,

        "Trading account is enabled.",

        "Trading account is disabled.",
      ),

      this.gate(
        "LIVE_ACCOUNT_MODE",

        account.mode ===
          "LIVE",

        "Trading account is explicitly in LIVE mode.",

        `Trading account mode is ${account.mode}; LIVE mode is required.`,
      ),

      this.gate(
        "EMERGENCY_STOP_CLEAR",

        !account.emergencyStop,

        "Emergency stop is clear.",

        "Emergency stop is active.",
      ),

      this.gate(
        "GLOBAL_LIVE_CONFIRMATION",

        coordinator
          .liveExecutionConfirmed,

        "Existing live coordinator global confirmation is present.",

        "Existing live coordinator global confirmation is not present.",
      ),

      {
        key:
          "SESSION_LIVE_CONFIRMATION",

        state:
          "NOT_IMPLEMENTED",

        required:
          true,

        message:
          "Version 17.0 intentionally exposes no session-level LIVE arm endpoint yet.",
      },

      this.gate(
        "SHADOW_READINESS",

        shadow.readiness
          .readyForPaperAutomation,

        "Shadow readiness evidence has passed the existing readiness policy.",

        `Shadow readiness is ${shadow.readiness.level} with score ${shadow.readiness.score}.`,
      ),

      this.gate(
        "PAPER_HISTORY_PRESENT",

        accounting.totalEntries >
          0,

        "Automated paper execution history exists.",

        "No automated paper execution history exists yet.",
      ),

      {
        key:
          "PAPER_PERFORMANCE_POLICY",

        state:
          "NOT_IMPLEMENTED",

        required:
          true,

        message:
          "A dedicated LIVE promotion policy for paper performance is intentionally deferred; Version 17.0 will not infer one from insufficient history.",
      },

      this.gate(
        "ACCOUNTING_INTEGRITY",

        accountingIntegrityPassed,

        "Paper automation accounting integrity checks pass.",

        "Paper automation accounting integrity has one or more failures.",
      ),

      this.gate(
        "NO_ACTIVE_LIVE_SESSION",

        coordinator.activeSessions ===
          0,

        "No active controlled live execution session exists.",

        `${coordinator.activeSessions} active live execution session(s) exist.`,
      ),

      {
        key:
          "CANDIDATE_ROUTE_ELIGIBILITY",

        state:
          "PENDING_CANDIDATE",

        required:
          true,

        message:
          "Route history, route blocking, exact opportunity, freshness, synchronization, liquidity, simulation, risk, balances, order constraints and final last-look must be evaluated per candidate before any future live submission.",
      },

      {
        key:
          "LIVE_ORDER_SUBMISSION",

        state:
          "NOT_IMPLEMENTED",

        required:
          true,

        message:
          "Version 17.0 control framework does not expose an automated live order submission path.",
      },
    ];

    const blockers =
      gates
        .filter(
          (
            gate,
          ) =>
            gate.required &&
            gate.state !==
              "PASS",
        )
        .map(
          (
            gate,
          ) =>
            `${gate.key}: ${gate.message}`,
        );

    return {
      generatedAt:
        now,

      version:
        "17.0",

      mode:
        "CONTROLLED_LIVE",

      status:
        blockers.length ===
          0
          ? "FOUNDATION_READY"
          : "LOCKED",

      liveExecutionAllowed:
        false,

      liveOrderSubmissionAllowed:
        false,

      liveArmEndpointAvailable:
        false,

      safety: {
        defaultOff:
          true,

        readOnlyControlPlane:
          true,

        explicitGlobalConfirmationRequired:
          true,

        explicitSessionConfirmationRequired:
          true,

        automaticCapitalScalingAllowed:
          false,

        maximumInitialValidationCapital:
          MAXIMUM_INITIAL_VALIDATION_CAPITAL,
      },

      evidence: {
        shadowReadinessLevel:
          shadow.readiness.level,

        shadowReadinessScore:
          shadow.readiness.score,

        shadowCompletedOutcomes:
          shadow.summary.completed,

        shadowMinimumCompletedOutcomes:
          shadow.sampleRequirement
            .minimumCompletedOutcomes,

        paperTrades:
          accounting.totalEntries,

        paperNetProfit:
          accounting.totals.netProfit,

        paperWinRatePercent:
          accounting.portfolio
            .winRatePercent,

        accountingIntegrityPassed,
      },

      account: {
        mode:
          account.mode,

        enabled:
          account.enabled,

        emergencyStop:
          account.emergencyStop,

        availableCapital:
          account.availableCapital,

        todayLoss:
          account.todayLoss,

        tradesToday:
          account.tradesToday,
      },

      productionSafety,

      coordinator: {
        globalLiveConfirmationPresent:
          coordinator
            .liveExecutionConfirmed,

        activeSessions:
          coordinator.activeSessions,

        readySessions:
          coordinator.readySessions,

        runningSessions:
          coordinator.runningSessions,

        activeLocks:
          coordinator.activeLocks,
      },

      adapters,

      gates,

      blockers,
    };
  }

  private gate(
    key:
      string,

    passed:
      boolean,

    passMessage:
      string,

    blockedMessage:
      string,
  ): ControlledLiveGate {
    return {
      key,

      state:
        passed
          ? "PASS"
          : "BLOCKED",

      required:
        true,

      message:
        passed
          ? passMessage
          : blockedMessage,
    };
  }

  private isAccountingIntegrityPassed(
    integrity:
      ReturnType<
        typeof paperAutomationAccountingService.getDiagnostics
      >["integrity"],
  ): boolean {
    return (
      integrity
        .accountCapitalValid &&
      integrity
        .availableCapitalValid &&
      integrity
        .portfolioCapitalMatchesAccount &&
      integrity
        .automationLedgerMatchesPaperTrades &&
      integrity
        .exclusiveAutomationCoverage &&
      integrity
        .accountProfitMatchesAutomationLedger !==
        false
    );
  }
}

export const controlledLiveTradingFrameworkService =
  new ControlledLiveTradingFrameworkService();