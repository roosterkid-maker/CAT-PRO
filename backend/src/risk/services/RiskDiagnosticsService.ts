import {
  exposureService,
} from "../../portfolio/services/ExposureService";

import {
  portfolioService,
} from "../../portfolio/services/PortfolioService";

import {
  tradingAccountService,
} from "../../trading/account/TradingAccountService";

import {
  capitalReservationService,
} from "../../trading/capital/CapitalReservationService";

import type {
  RiskAssessment,
} from "../models/RiskAssessment";

import type {
  RiskRequest,
} from "../models/RiskRequest";

import {
  riskEngine,
} from "./RiskEngine";

export type RiskTestScenario =
  | "HEALTHY"
  | "WARNING"
  | "HIGH"
  | "BLOCKED_FRESHNESS"
  | "BLOCKED_SYNCHRONIZATION"
  | "BLOCKED_CAPITAL"
  | "BLOCKED_EXPOSURE";

export type DiagnosticCheckStatus =
  | "PASS"
  | "FAIL"
  | "NOT_APPLICABLE";

export interface RiskScenarioTestRequest {
  scenario:
    RiskTestScenario;

  capital?:
    number;

  market?:
    string;

  buyExchange?:
    string;

  sellExchange?:
    string;
}

export interface RiskDecisionTrace {
  marketIntegrity:
    DiagnosticCheckStatus;

  freshness:
    DiagnosticCheckStatus;

  synchronization:
    DiagnosticCheckStatus;

  executionQuality:
    DiagnosticCheckStatus;

  capitalAvailable:
    DiagnosticCheckStatus;

  exposureAllowed:
    DiagnosticCheckStatus;

  dailyLimitsAllowed:
    DiagnosticCheckStatus;
}

export interface RiskScenarioTestResult {
  scenario:
    RiskTestScenario;

  generatedAt:
    number;

  request:
    RiskRequest;

  assessment:
    RiskAssessment;

  trace:
    RiskDecisionTrace;

  expectation: {
    expectedApproval:
      boolean;

    expectedRiskLevel:
      string;

    matched:
      boolean;
  };
}

export class RiskDiagnosticsService {
  getDiagnostics(
    now =
      Date.now(),
  ) {
    const account =
      tradingAccountService
        .getAccount();

    const portfolio =
      portfolioService
        .getSnapshot(
          now,
        );

    const exposure =
      exposureService
        .getSnapshot(
          now,
        );

    const reservations =
      capitalReservationService
        .getDiagnostics();

    const accountOperational =
      account.enabled &&
      !account.emergencyStop;

    const capitalHealthy =
      portfolio
        .capital
        .tradableCapitalUsdt >
      0;

    const exposureHealthy =
      exposure
        .summary
        .canOpenNewPositions;

    const overallOperational =
      accountOperational &&
      capitalHealthy &&
      exposureHealthy;

    /*
     * There is intentionally no fake
     * freshness/synchronization score here.
     *
     * Freshness is opportunity-specific.
     * Without an actual buy/sell pair these
     * checks are NOT_APPLICABLE.
     */
    return {
      generatedAt:
        now,

      overall: {
        operational:
          overallOperational,

        health:
          overallOperational
            ? exposure
                .summary
                .warningCount >
              0
              ? "WARNING"
              : "HEALTHY"
            : "BLOCKED",
      },

      account: {
        enabled:
          account.enabled,

        emergencyStop:
          account.emergencyStop,

        mode:
          account.mode,

        currentCapital:
          account.currentCapital,

        availableCapital:
          account.availableCapital,

        todayLoss:
          account.todayLoss,

        tradesToday:
          account.tradesToday,

        openTrades:
          account.openTrades,
      },

      portfolio: {
        tradableCapital:
          portfolio
            .capital
            .tradableCapitalUsdt,

        reservedCapital:
          portfolio
            .capital
            .accountReservedCapital,

        totalEquityUsdt:
          portfolio
            .totals
            .totalEquityUsdt,

        liquidUsdt:
          portfolio
            .totals
            .liquidUsdt,
      },

      reservations: {
        active:
          reservations
            .activeReservations,

        activeReservedCapital:
          reservations
            .activeReservedCapital,

        totalCreated:
          reservations
            .totalCreated,

        totalCommitted:
          reservations
            .totalCommitted,

        totalReleased:
          reservations
            .totalReleased,

        totalExpired:
          reservations
            .totalExpired,
      },

      exposure: {
        canOpenNewPositions:
          exposure
            .summary
            .canOpenNewPositions,

        totalOpenCapitalPercent:
          exposure
            .summary
            .totalOpenCapitalPercent,

        highestExchangeExposurePercent:
          exposure
            .summary
            .highestExchangeExposurePercent,

        highestMarketExposurePercent:
          exposure
            .summary
            .highestMarketExposurePercent,

        highestPositionExposurePercent:
          exposure
            .summary
            .highestPositionExposurePercent,

        warningCount:
          exposure
            .summary
            .warningCount,

        blockedCount:
          exposure
            .summary
            .blockedCount,

        warnings:
          exposure.warnings,

        blockingReasons:
          exposure
            .blockingReasons,
      },

      opportunitySpecificChecks: {
        freshness:
          "NOT_APPLICABLE" as const,

        synchronization:
          "NOT_APPLICABLE" as const,

        explanation:
          "Freshness and synchronization require a specific cross-exchange opportunity and are evaluated during trade assessment.",
      },

      availableScenarios: [
        "HEALTHY",
        "WARNING",
        "HIGH",
        "BLOCKED_FRESHNESS",
        "BLOCKED_SYNCHRONIZATION",
        "BLOCKED_CAPITAL",
        "BLOCKED_EXPOSURE",
      ] satisfies RiskTestScenario[],
    };
  }

  runScenario(
    input:
      RiskScenarioTestRequest,
  ): RiskScenarioTestResult {
    const now =
      Date.now();

    const account =
      tradingAccountService
        .getAccount();

    const portfolio =
      portfolioService
        .getSnapshot(
          now,
        );

    const scenario =
      input.scenario;

    const market =
      (
        input.market ??
        "BTCUSDT"
      )
        .trim()
        .toUpperCase();

    const buyExchange =
      (
        input.buyExchange ??
        "binance"
      )
        .trim()
        .toLowerCase();

    const sellExchange =
      (
        input.sellExchange ??
        "bybit"
      )
        .trim()
        .toLowerCase();

    const capitalBase =
      Math.max(
        1,

        portfolio
          .capital
          .accountCurrentCapital,
      );

    const healthyCapital =
      Math.max(
        1,

        Math.min(
          capitalBase *
            0.1,

          portfolio
            .capital
            .tradableCapitalUsdt >
          0
            ? portfolio
                .capital
                .tradableCapitalUsdt *
              0.1
            : capitalBase *
              0.1,
        ),
      );

    let request:
      RiskRequest = {
      capital:
        input.capital ??
        healthyCapital,

      confidence:
        95,

      fillPercent:
        99,

      netProfit:
        Math.max(
          1,

          healthyCapital *
            0.005,
        ),

      executionTimeMs:
        150,

      liquidityScore:
        95,

      quoteAgeMs:
        250,

      exchangeConnected:
        true,

      balanceAvailable:
        true,

      dailyLoss:
        Math.max(
          0,

          Math.min(
            account.todayLoss,
            100,
          ),
        ),

      dailyTradeCount:
        Math.max(
          0,

          Math.min(
            account.tradesToday,
            5,
          ),
        ),

      market,

      buyExchange,

      sellExchange,

      quotesFresh:
        true,

      pairSynchronized:
        true,

      timestampSkewMs:
        100,

      maximumPairSkewMs:
        2_000,
    };

    request =
      this.applyScenario(
        scenario,
        request,
        capitalBase,
        portfolio
          .capital
          .tradableCapitalUsdt,
        input.capital,
      );

    /*
     * Critical rule:
     *
     * Scenario testing calls the SAME
     * production RiskEngine.
     *
     * No parallel/mock risk-decision logic.
     */
    const assessment =
      riskEngine
        .assess(
          request,
        );

    const trace =
      this.createTrace(
        request,
        assessment,
      );

    const expectation =
      this.getExpectation(
        scenario,
        assessment,
      );

    return {
      scenario,

      generatedAt:
        now,

      request,

      assessment,

      trace,

      expectation,
    };
  }

  isScenario(
    value:
      unknown,
  ): value is RiskTestScenario {
    return (
      value ===
        "HEALTHY" ||
      value ===
        "WARNING" ||
      value ===
        "HIGH" ||
      value ===
        "BLOCKED_FRESHNESS" ||
      value ===
        "BLOCKED_SYNCHRONIZATION" ||
      value ===
        "BLOCKED_CAPITAL" ||
      value ===
        "BLOCKED_EXPOSURE"
    );
  }

  private applyScenario(
    scenario:
      RiskTestScenario,

    base:
      RiskRequest,

    capitalBase:
      number,

    tradableCapital:
      number,

    explicitCapital:
      number |
      undefined,
  ): RiskRequest {
    switch (
      scenario
    ) {
      case "HEALTHY":
        return {
          ...base,

          capital:
            explicitCapital ??
            Math.max(
              1,

              capitalBase *
                0.1,
            ),
        };

      /*
       * Approved but score drops into
       * MEDIUM risk.
       */
      case "WARNING":
        return {
          ...base,

          confidence:
            65,
        };

      /*
       * No hard blocker.
       *
       * Combined execution-quality penalties
       * intentionally drive score below 60.
       */
      case "HIGH":
        return {
          ...base,

          confidence:
            50,

          fillPercent:
            80,

          executionTimeMs:
            2_000,

          liquidityScore:
            60,
        };

      case "BLOCKED_FRESHNESS":
        return {
          ...base,

          quotesFresh:
            false,

          quoteAgeMs:
            30_000,
        };

      case "BLOCKED_SYNCHRONIZATION":
        return {
          ...base,

          pairSynchronized:
            false,

          timestampSkewMs:
            5_000,

          maximumPairSkewMs:
            2_000,
        };

      case "BLOCKED_CAPITAL":
        return {
          ...base,

          capital:
            explicitCapital ??
            Math.max(
              capitalBase *
                1.1,

              tradableCapital +
                1_000,
            ),

          balanceAvailable:
            false,
        };

      /*
       * Version 13.4 single-position
       * hard limit is 20%.
       *
       * 25% forces ExposureService to block
       * the proposed trade.
       */
      case "BLOCKED_EXPOSURE":
        return {
          ...base,

          capital:
            explicitCapital ??
            capitalBase *
              0.25,
        };
    }
  }

  private createTrace(
    request:
      RiskRequest,

    assessment:
      RiskAssessment,
  ): RiskDecisionTrace {
    return {
      marketIntegrity:
        assessment
          .checks
          .marketIntegrity
          ? "PASS"
          : "FAIL",

      freshness:
        request.quotesFresh ===
        false
          ? "FAIL"
          : "PASS",

      synchronization:
        request.pairSynchronized ===
        false
          ? "FAIL"
          : "PASS",

      executionQuality:
        assessment
          .checks
          .executionQuality
          ? "PASS"
          : "FAIL",

      capitalAvailable:
        assessment
          .checks
          .capitalAvailable
          ? "PASS"
          : "FAIL",

      exposureAllowed:
        assessment
          .checks
          .exposureAllowed
          ? "PASS"
          : "FAIL",

      dailyLimitsAllowed:
        assessment
          .checks
          .dailyLimitsAllowed
          ? "PASS"
          : "FAIL",
    };
  }

  private getExpectation(
    scenario:
      RiskTestScenario,

    assessment:
      RiskAssessment,
  ) {
    switch (
      scenario
    ) {
      case "HEALTHY": {
        const matched =
          assessment.approved &&
          assessment.level ===
            "LOW";

        return {
          expectedApproval:
            true,

          expectedRiskLevel:
            "LOW",

          matched,
        };
      }

      case "WARNING": {
        const matched =
          assessment.approved &&
          assessment.level ===
            "MEDIUM";

        return {
          expectedApproval:
            true,

          expectedRiskLevel:
            "MEDIUM",

          matched,
        };
      }

      case "HIGH": {
        const matched =
          !assessment.approved &&
          assessment.level ===
            "HIGH";

        return {
          expectedApproval:
            false,

          expectedRiskLevel:
            "HIGH",

          matched,
        };
      }

      default: {
        const matched =
          !assessment.approved &&
          assessment.level ===
            "BLOCKED";

        return {
          expectedApproval:
            false,

          expectedRiskLevel:
            "BLOCKED",

          matched,
        };
      }
    }
  }
}

export const riskDiagnosticsService =
  new RiskDiagnosticsService();