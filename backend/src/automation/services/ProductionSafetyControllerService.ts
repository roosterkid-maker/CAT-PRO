import {
  pairSynchronizationRootCauseAnalyzerService,
} from "./PairSynchronizationRootCauseAnalyzerService";

import type {
  LiveExecutionSession,
} from "../../execution/live/coordinator/LiveExecutionSession";

import {
  liveExecutionCoordinator,
} from "../../execution/live/coordinator/LiveExecutionCoordinator";

import {
  executionHealthService,
} from "../../execution/live/health/ExecutionHealthService";

import {
  executionReconciliationEngine,
} from "../../execution/live/reconciliation/ExecutionReconciliationEngine";

import {
  executionRecoveryEngine,
} from "../../execution/live/recovery/ExecutionRecoveryEngine";

import {
  exchangeFreshnessDiagnosticsService,
} from "../../freshness/services/ExchangeFreshnessDiagnosticsService";

import {
  exposureService,
} from "../../portfolio/services/ExposureService";

import {
  tradingAccountService,
} from "../../trading/account/TradingAccountService";

import type {
  ProductionSafetyDiagnostics,
  ProductionSafetyGate,
  ProductionSafetyGateState,
  ProductionSafetyState,
  ProductionSafetyStatus,
} from "../models/ProductionSafety";

const MAXIMUM_LIVE_ATTEMPTS_PER_HOUR =
  10;

const MAXIMUM_ACTIVE_LIVE_SESSIONS =
  1;

const ONE_HOUR_MS =
  60 * 60 * 1_000;

export class ProductionSafetyControllerService {
  getDiagnostics(): ProductionSafetyDiagnostics {
    const gates:
      ProductionSafetyGate[] = [];

    const state:
      ProductionSafetyState = {
      accountEnabled:
        false,

      accountMode:
        "UNKNOWN",

      emergencyStopActive:
        true,

      executionHealthStatus:
        "UNKNOWN",

      activeLiveSessions:
        null,

      activeLiveLocks:
        null,

      liveExecutionConfirmed:
        null,

      activeLiveSessionLimit:
        MAXIMUM_ACTIVE_LIVE_SESSIONS,

      duplicateActiveSessionLockKeys:
        [],

      liveAttemptsLastHour:
        null,

      liveAttemptsToday:
        null,

      accountTradesToday:
        null,

      effectiveDailyActivity:
        null,

      maximumLiveAttemptsPerHour:
        MAXIMUM_LIVE_ATTEMPTS_PER_HOUR,

      maximumDailyTrades:
        null,

      todayProfit:
        null,

      todayLoss:
        null,

      dailyNetPnl:
        null,

      dailyDrawdown:
        null,

      maximumDailyLoss:
        null,

      dailyLossRemaining:
        null,

      dailyLossUtilizationPercent:
        null,

      dailyDrawdownUtilizationPercent:
        null,

      marketDataExchanges:
        null,

      connectedMarketDataExchanges:
        null,

      disconnectedMarketDataExchanges:
        [],

      executionAdapters:
        null,

      connectedExecutionAdapters:
        null,

      disconnectedExecutionAdapters:
        [],

      executableQuotes:
        null,

      freshExecutableQuotes:
        null,

      staleExecutableQuotes:
        null,

      invalidTimestampExecutableQuotes:
        null,

      futureTimestampExecutableQuotes:
        null,

      freshnessCoveragePercent:
        null,

      staleEvictionRunning:
        null,

      staleEvictionLastRunAt:
        null,

      pairSynchronizationClassification:
        "UNKNOWN",

      currentFreshDirectionalPairs:
        null,

      synchronizedDirectionalPairs:
        null,

      unsynchronizedDirectionalPairs:
        null,

      synchronizationRatePercent:
        null,

      openPortfolioPositions:
        null,

      totalOpenCapital:
        null,

      totalOpenCapitalPercent:
        null,

      portfolioExposureBlockedCount:
        null,

      portfolioExposureWarningCount:
        null,

      canOpenNewPositions:
        null,

      reconciliationRunning:
        null,

      reconciliationLastScanAt:
        null,

      reconciliationRecords:
        null,

      reconciliationDrifted:
        null,

      reconciliationRemoteUnavailable:
        null,

      reconciliationErrors:
        null,

      reconciliationCriticalMismatches:
        null,

      reconciliationWarningMismatches:
        null,

      unresolvedReconciliationRecords:
        null,

      recoveryRunning:
        null,

      recoveryLastScanAt:
        null,

      openRecoveryIncidents:
        null,

      acknowledgedRecoveryIncidents:
        null,

      criticalRecoveryIncidents:
        null,

      unresolvedRecoveryIncidents:
        null,

      unresolvedExposureIncidents:
        null,

      unresolvedExposureQuantity:
        null,

      unresolvedExposureNotional:
        null,
    };

    this.captureAccountSafety(
      gates,
      state,
    );

    this.captureExecutionHealth(
      gates,
      state,
    );

    this.captureMarketDataHealth(
      gates,
      state,
    );

    this.capturePairSynchronizationHealth(
      gates,
      state,
    );

    this.capturePortfolioExposureSafety(
      gates,
      state,
    );

    this.captureCoordinatorSafety(
      gates,
      state,
    );

    /*
     * VERSION 17.5 BUILD 5
     *
     * Safety validation now includes:
     *
     * - portfolio exposure
     * - unresolved execution exposure
     * - recovery-in-progress blocking
     * - reconciliation mismatch protection
     * - maximum active LIVE session protection
     * - duplicate active session protection
     *
     * LIVE submission remains unavailable.
     */
    gates.push({
      key:
        "LIVE_SUBMISSION_DISABLED",

      state:
        "BLOCKED",

      required:
        true,

      message:
        "LIVE order submission remains disabled by Version 17.5 Build 5.",

      reasons: [
        "Production safety guards must not enable LIVE trading.",
      ],
    });

    const emergencyReasons =
      this.collectReasons(
        gates,
        "EMERGENCY_STOP",
      );

    const blockers =
      this.collectReasons(
        gates,
        "BLOCKED",
      );

    return {
      generatedAt:
        Date.now(),

      version:
        "17.5",

      status:
        this.resolveStatus(
          emergencyReasons,
          blockers,
        ),

      failClosed:
        true,

      liveSubmissionAllowed:
        false,

      state,

      gates,

      blockers,

      emergencyReasons,
    };
  }

  activateEmergencyStop():
    ProductionSafetyDiagnostics {
    tradingAccountService
      .enableEmergencyStop();

    return this.getDiagnostics();
  }

  private captureAccountSafety(
    gates:
      ProductionSafetyGate[],

    state:
      ProductionSafetyState,
  ): void {
    try {
      const account =
        tradingAccountService
          .getAccount();

      state.accountEnabled =
        account.enabled;

      state.accountMode =
        account.mode;

      state.emergencyStopActive =
        account.emergencyStop;

      state.accountTradesToday =
        account.tradesToday;

      state.maximumDailyTrades =
        account.limits
          .maximumDailyTrades;

      state.todayProfit =
        account.todayProfit;

      state.todayLoss =
        account.todayLoss;

      state.maximumDailyLoss =
        account.limits
          .maximumDailyLoss;

      gates.push({
        key:
          "TRADING_ACCOUNT_ENABLED",

        state:
          account.enabled
            ? "PASS"
            : "BLOCKED",

        required:
          true,

        message:
          account.enabled
            ? "Trading account is enabled."
            : "Trading account is disabled.",

        reasons:
          account.enabled
            ? []
            : [
                "Trading account is disabled.",
              ],
      });

      gates.push({
        key:
          "EMERGENCY_STOP_CLEAR",

        state:
          account.emergencyStop
            ? "EMERGENCY_STOP"
            : "PASS",

        required:
          true,

        message:
          account.emergencyStop
            ? "Emergency stop is active."
            : "Emergency stop is clear.",

        reasons:
          account.emergencyStop
            ? [
                "Existing trading-account emergency stop is active.",
              ]
            : [],
      });

      this.captureDailyLossSafety(
        gates,
        state,
      );
    } catch (
      error:
        unknown
    ) {
      state.accountEnabled =
        false;

      state.accountMode =
        "UNKNOWN";

      state.emergencyStopActive =
        true;

      state.accountTradesToday =
        null;

      state.maximumDailyTrades =
        null;

      state.todayProfit =
        null;

      state.todayLoss =
        null;

      state.dailyNetPnl =
        null;

      state.dailyDrawdown =
        null;

      state.maximumDailyLoss =
        null;

      state.dailyLossRemaining =
        null;

      state.dailyLossUtilizationPercent =
        null;

      state.dailyDrawdownUtilizationPercent =
        null;

      const message =
        this.errorMessage(
          error,

          "Trading account safety state could not be read.",
        );

      gates.push({
        key:
          "TRADING_ACCOUNT_ENABLED",

        state:
          "BLOCKED",

        required:
          true,

        message:
          "Trading account safety state is unavailable.",

        reasons: [
          message,
        ],
      });

      gates.push({
        key:
          "EMERGENCY_STOP_CLEAR",

        state:
          "EMERGENCY_STOP",

        required:
          true,

        message:
          "Emergency-stop state is unavailable; production safety failed closed.",

        reasons: [
          "Emergency-stop state could not be verified.",
        ],
      });

      gates.push({
        key:
          "DAILY_LOSS_LIMIT",

        state:
          "BLOCKED",

        required:
          true,

        message:
          "Daily loss state could not be verified.",

        reasons: [
          message,
        ],
      });

      gates.push({
        key:
          "DAILY_NET_DRAWDOWN_LIMIT",

        state:
          "BLOCKED",

        required:
          true,

        message:
          "Daily drawdown state could not be verified.",

        reasons: [
          message,
        ],
      });
    }
  }

  private captureDailyLossSafety(
    gates:
      ProductionSafetyGate[],

    state:
      ProductionSafetyState,
  ): void {
    const todayProfit =
      state.todayProfit;

    const todayLoss =
      state.todayLoss;

    const maximumDailyLoss =
      state.maximumDailyLoss;

    const valid =
      todayProfit !==
        null &&
      todayLoss !==
        null &&
      maximumDailyLoss !==
        null &&
      Number.isFinite(
        todayProfit,
      ) &&
      Number.isFinite(
        todayLoss,
      ) &&
      Number.isFinite(
        maximumDailyLoss,
      ) &&
      todayProfit >=
        0 &&
      todayLoss >=
        0 &&
      maximumDailyLoss >
        0;

    if (
      !valid
    ) {
      state.dailyNetPnl =
        null;

      state.dailyDrawdown =
        null;

      state.dailyLossRemaining =
        null;

      state.dailyLossUtilizationPercent =
        null;

      state.dailyDrawdownUtilizationPercent =
        null;

      gates.push({
        key:
          "DAILY_LOSS_LIMIT",

        state:
          "BLOCKED",

        required:
          true,

        message:
          "Daily loss accounting evidence is invalid or unavailable.",

        reasons: [
          "todayProfit, todayLoss and maximumDailyLoss must be valid non-negative account values.",
        ],
      });

      gates.push({
        key:
          "DAILY_NET_DRAWDOWN_LIMIT",

        state:
          "BLOCKED",

        required:
          true,

        message:
          "Daily drawdown accounting evidence is invalid or unavailable.",

        reasons: [
          "Daily drawdown cannot be verified from invalid account PnL evidence.",
        ],
      });

      return;
    }

    const dailyNetPnl =
      todayProfit -
      todayLoss;

    const dailyDrawdown =
      Math.max(
        0,
        todayLoss -
          todayProfit,
      );

    state.dailyNetPnl =
      dailyNetPnl;

    state.dailyDrawdown =
      dailyDrawdown;

    state.dailyLossRemaining =
      Math.max(
        0,
        maximumDailyLoss -
          todayLoss,
      );

    state.dailyLossUtilizationPercent =
      this.round(
        Math.min(
          100,

          (
            todayLoss /
            maximumDailyLoss
          ) *
            100,
        ),
      );

    state.dailyDrawdownUtilizationPercent =
      this.round(
        Math.min(
          100,

          (
            dailyDrawdown /
            maximumDailyLoss
          ) *
            100,
        ),
      );

    const grossLossLimitReached =
      todayLoss >=
      maximumDailyLoss;

    gates.push({
      key:
        "DAILY_LOSS_LIMIT",

      state:
        grossLossLimitReached
          ? "EMERGENCY_STOP"
          : "PASS",

      required:
        true,

      message:
        grossLossLimitReached
          ? `Daily loss limit reached (${this.formatMoney(
              todayLoss,
            )}/${this.formatMoney(
              maximumDailyLoss,
            )}).`
          : `Daily loss is within limit (${this.formatMoney(
              todayLoss,
            )}/${this.formatMoney(
              maximumDailyLoss,
            )}).`,

      reasons:
        grossLossLimitReached
          ? [
              `Existing trading-account maximum daily loss of ${this.formatMoney(
                maximumDailyLoss,
              )} has been reached.`,
            ]
          : [],
    });

    const drawdownLimitReached =
      dailyDrawdown >=
      maximumDailyLoss;

    gates.push({
      key:
        "DAILY_NET_DRAWDOWN_LIMIT",

      state:
        drawdownLimitReached
          ? "EMERGENCY_STOP"
          : "PASS",

      required:
        true,

      message:
        drawdownLimitReached
          ? `Daily net drawdown limit reached (${this.formatMoney(
              dailyDrawdown,
            )}/${this.formatMoney(
              maximumDailyLoss,
            )}).`
          : `Daily net drawdown is within limit (${this.formatMoney(
              dailyDrawdown,
            )}/${this.formatMoney(
              maximumDailyLoss,
            )}).`,

      reasons:
        drawdownLimitReached
          ? [
              `Net daily drawdown has reached the existing maximum daily loss budget of ${this.formatMoney(
                maximumDailyLoss,
              )}.`,
            ]
          : [],
    });
  }

  private captureExecutionHealth(
    gates:
      ProductionSafetyGate[],

    state:
      ProductionSafetyState,
  ): void {
    try {
      const health =
        executionHealthService
          .getReport();

      state.executionHealthStatus =
        health.status;

      state.executionAdapters =
        health.exchanges.length;

      state.connectedExecutionAdapters =
        health.exchanges.filter(
          (
            exchange,
          ) =>
            exchange.adapterRegistered &&
            exchange.adapterConnected,
        ).length;

      state.disconnectedExecutionAdapters =
        health.exchanges
          .filter(
            (
              exchange,
            ) =>
              !exchange.adapterRegistered ||
              !exchange.adapterConnected,
          )
          .map(
            (
              exchange,
            ) =>
              exchange.exchange,
          );

      const adaptersAvailable =
        health.exchanges.length >
        0;

      const allAdaptersConnected =
        adaptersAvailable &&
        state
          .disconnectedExecutionAdapters
          .length ===
          0;

      gates.push({
        key:
          "EXECUTION_ADAPTER_CONNECTIVITY",

        state:
          allAdaptersConnected
            ? "PASS"
            : "BLOCKED",

        required:
          true,

        message:
          allAdaptersConnected
            ? `All ${health.exchanges.length} execution adapter(s) have explicit LIVE execution availability.`
            : "One or more required execution adapters are missing, unverified, or LIVE-disabled.",

        reasons:
          allAdaptersConnected
            ? []
            : adaptersAvailable
              ? state
                  .disconnectedExecutionAdapters
                  .map(
                    (
                      exchange,
                    ) =>
                      `${exchange}: LIVE execution availability is blocked.`,
                  )
              : [
                  "No execution adapters are available for health verification.",
                ],
      });

      const executionApiHealthy =
        health.status ===
        "HEALTHY";

      gates.push({
        key:
          "EXECUTION_API_HEALTH",

        state:
          executionApiHealthy
            ? "PASS"
            : "BLOCKED",

        required:
          true,

        message:
          executionApiHealthy
            ? "Execution/API health is healthy."
            : `Execution/API health is ${health.status}.`,

        reasons:
          executionApiHealthy
            ? []
            : health.reasons.length >
                0
              ? [
                  ...health.reasons,
                ]
              : [
                  `Execution/API health is ${health.status}; HEALTHY evidence is required for future LIVE submission.`,
                ],
      });

      gates.push({
        key:
          "EXECUTION_HEALTH",

        state:
          executionApiHealthy
            ? "PASS"
            : "BLOCKED",

        required:
          true,

        message:
          executionApiHealthy
            ? "Execution health is healthy."
            : `Execution health is ${health.status}.`,

        reasons:
          executionApiHealthy
            ? []
            : health.reasons.length >
                0
              ? [
                  ...health.reasons,
                ]
              : [
                  `Execution health is ${health.status}; HEALTHY is required for future LIVE submission.`,
                ],
      });
    } catch (
      error:
        unknown
    ) {
      state.executionHealthStatus =
        "UNKNOWN";

      state.executionAdapters =
        null;

      state.connectedExecutionAdapters =
        null;

      state.disconnectedExecutionAdapters =
        [];

      const reason =
        this.errorMessage(
          error,

          "Unknown execution-health error.",
        );

      for (
        const key
        of [
          "EXECUTION_ADAPTER_CONNECTIVITY",
          "EXECUTION_API_HEALTH",
          "EXECUTION_HEALTH",
        ]
      ) {
        gates.push({
          key,

          state:
            "BLOCKED",

          required:
            true,

          message:
            `${key} could not be verified.`,

          reasons: [
            reason,
          ],
        });
      }
    }
  }

  private captureMarketDataHealth(
    gates:
      ProductionSafetyGate[],

    state:
      ProductionSafetyState,
  ): void {
    try {
      const report =
        exchangeFreshnessDiagnosticsService
          .getReport();

      state.marketDataExchanges =
        report.summary
          .exchanges;

      state.connectedMarketDataExchanges =
        report.summary
          .connectedExchanges;

      state.disconnectedMarketDataExchanges =
        report.exchanges
          .filter(
            (
              exchange,
            ) =>
              !exchange.connected,
          )
          .map(
            (
              exchange,
            ) =>
              exchange.exchange,
          );

      state.executableQuotes =
        report.summary
          .executableQuotes;

      state.freshExecutableQuotes =
        report.summary
          .freshExecutableQuotes;

      state.staleExecutableQuotes =
        report.summary
          .staleExecutableQuotes;

      state.invalidTimestampExecutableQuotes =
        report.exchanges.reduce(
          (
            sum,
            exchange,
          ) =>
            sum +
            exchange
              .invalidTimestampExecutableQuotes,

          0,
        );

      state.futureTimestampExecutableQuotes =
        report.exchanges.reduce(
          (
            sum,
            exchange,
          ) =>
            sum +
            exchange
              .futureTimestampExecutableQuotes,

          0,
        );

      state.freshnessCoveragePercent =
        report.summary
          .freshnessCoveragePercent;

      state.staleEvictionRunning =
        report.eviction.running;

      state.staleEvictionLastRunAt =
        report.eviction
          .lastRunAt;

      const exchangeConnectivityPassed =
        report.summary
          .exchanges >=
          2 &&
        report.summary
          .connectedExchanges ===
          report.summary
            .exchanges;

      gates.push({
        key:
          "MARKET_DATA_EXCHANGE_CONNECTIVITY",

        state:
          exchangeConnectivityPassed
            ? "PASS"
            : "BLOCKED",

        required:
          true,

        message:
          exchangeConnectivityPassed
            ? `All ${report.summary.exchanges} market-data exchange adapter(s) are connected.`
            : "Market-data exchange connectivity is incomplete.",

        reasons:
          exchangeConnectivityPassed
            ? []
            : report.summary
                  .exchanges <
                2
              ? [
                  "At least two connected market-data exchanges are required for cross-exchange arbitrage.",
                ]
              : state
                  .disconnectedMarketDataExchanges
                  .map(
                    (
                      exchange,
                    ) =>
                      `${exchange}: market-data adapter is disconnected.`,
                  ),
      });

      const evictionHealthy =
        report.eviction
          .running &&
        report.eviction
          .lastRunAt !==
          null;

      gates.push({
        key:
          "STALE_DATA_EVICTION_HEALTH",

        state:
          evictionHealthy
            ? "PASS"
            : "BLOCKED",

        required:
          true,

        message:
          evictionHealthy
            ? "Stale executable quote eviction is running and has completed at least one scan."
            : "Stale executable quote eviction is not fully operational.",

        reasons:
          evictionHealthy
            ? []
            : [
                report.eviction
                  .running
                  ? "Stale executable eviction is running but has not completed a scan yet."
                  : "Stale executable eviction is not running.",
              ],
      });

      const invalidExecutableQuotes =
        (
          state
            .invalidTimestampExecutableQuotes ??
          0
        ) +
        (
          state
            .futureTimestampExecutableQuotes ??
          0
        );

      const staleDataClear =
        report.summary
          .staleExecutableQuotes ===
          0 &&
        invalidExecutableQuotes ===
          0;

      gates.push({
        key:
          "STALE_EXECUTABLE_DATA_CLEAR",

        state:
          staleDataClear
            ? "PASS"
            : "BLOCKED",

        required:
          true,

        message:
          staleDataClear
            ? "No stale or invalid executable quotes are present."
            : "Stale or invalid executable quotes are present.",

        reasons:
          staleDataClear
            ? []
            : [
                `stale=${report.summary.staleExecutableQuotes}, invalidTimestamp=${state.invalidTimestampExecutableQuotes ?? 0}, futureTimestamp=${state.futureTimestampExecutableQuotes ?? 0}.`,
              ],
      });

      const exchangesWithFreshExecutableQuotes =
        report.exchanges.filter(
          (
            exchange,
          ) =>
            exchange
              .freshExecutableQuotes >
            0,
        ).length;

      const feedReady =
        report.summary
          .freshExecutableQuotes >
          0 &&
        exchangesWithFreshExecutableQuotes >=
          2 &&
        report.summary
          .freshnessCoveragePercent ===
          100;

      gates.push({
        key:
          "DATA_FEED_FRESHNESS",

        state:
          feedReady
            ? "PASS"
            : "BLOCKED",

        required:
          true,

        message:
          feedReady
            ? `Executable data feed is fresh across ${exchangesWithFreshExecutableQuotes} exchange(s) with ${report.summary.freshnessCoveragePercent}% freshness coverage.`
            : "Executable market-data freshness is insufficient for future LIVE trading.",

        reasons:
          feedReady
            ? []
            : [
                `freshExecutableQuotes=${report.summary.freshExecutableQuotes}, exchangesWithFreshExecutableQuotes=${exchangesWithFreshExecutableQuotes}, freshnessCoveragePercent=${report.summary.freshnessCoveragePercent}.`,
              ],
      });
    } catch (
      error:
        unknown
    ) {
      state.marketDataExchanges =
        null;

      state.connectedMarketDataExchanges =
        null;

      state.disconnectedMarketDataExchanges =
        [];

      state.executableQuotes =
        null;

      state.freshExecutableQuotes =
        null;

      state.staleExecutableQuotes =
        null;

      state.invalidTimestampExecutableQuotes =
        null;

      state.futureTimestampExecutableQuotes =
        null;

      state.freshnessCoveragePercent =
        null;

      state.staleEvictionRunning =
        null;

      state.staleEvictionLastRunAt =
        null;

      const reason =
        this.errorMessage(
          error,

          "Market-data health could not be verified.",
        );

      for (
        const key
        of [
          "MARKET_DATA_EXCHANGE_CONNECTIVITY",
          "STALE_DATA_EVICTION_HEALTH",
          "STALE_EXECUTABLE_DATA_CLEAR",
          "DATA_FEED_FRESHNESS",
        ]
      ) {
        gates.push({
          key,

          state:
            "BLOCKED",

          required:
            true,

          message:
            `${key} could not be verified.`,

          reasons: [
            reason,
          ],
        });
      }
    }
  }

  private capturePairSynchronizationHealth(
    gates:
      ProductionSafetyGate[],

    state:
      ProductionSafetyState,
  ): void {
    try {
      const report =
        pairSynchronizationRootCauseAnalyzerService
          .getReport();

      state.pairSynchronizationClassification =
        report.classification;

      state.currentFreshDirectionalPairs =
        report.summary
          .currentFreshDirectionalPairs;

      state.synchronizedDirectionalPairs =
        report.summary
          .synchronizedDirectionalPairs;

      state.unsynchronizedDirectionalPairs =
        report.summary
          .unsynchronizedDirectionalPairs;

      state.synchronizationRatePercent =
        this.round(
          report.summary
            .synchronizationRatePercent,
        );

      const synchronizationHealthy =
        report.classification ===
          "HEALTHY" &&
        report.summary
          .currentFreshDirectionalPairs >
          0 &&
        report.summary
          .synchronizedDirectionalPairs >
          0;

      gates.push({
        key:
          "PAIR_SYNCHRONIZATION_HEALTH",

        state:
          synchronizationHealthy
            ? "PASS"
            : "BLOCKED",

        required:
          true,

        message:
          synchronizationHealthy
            ? `Pair synchronization is healthy (${this.round(
                report.summary
                  .synchronizationRatePercent,
              )}%).`
            : `Pair synchronization is ${report.classification}.`,

        reasons:
          synchronizationHealthy
            ? []
            : [
                report.primaryFinding,

                `freshDirectionalPairs=${report.summary.currentFreshDirectionalPairs}, synchronized=${report.summary.synchronizedDirectionalPairs}, unsynchronized=${report.summary.unsynchronizedDirectionalPairs}, rate=${this.round(
                  report.summary
                    .synchronizationRatePercent,
                )}%.`,
              ],
      });
    } catch (
      error:
        unknown
    ) {
      state.pairSynchronizationClassification =
        "UNKNOWN";

      state.currentFreshDirectionalPairs =
        null;

      state.synchronizedDirectionalPairs =
        null;

      state.unsynchronizedDirectionalPairs =
        null;

      state.synchronizationRatePercent =
        null;

      gates.push({
        key:
          "PAIR_SYNCHRONIZATION_HEALTH",

        state:
          "BLOCKED",

        required:
          true,

        message:
          "Pair synchronization health could not be verified.",

        reasons: [
          this.errorMessage(
            error,

            "Unknown pair-synchronization health error.",
          ),
        ],
      });
    }
  }

  private capturePortfolioExposureSafety(
    gates:
      ProductionSafetyGate[],

    state:
      ProductionSafetyState,
  ): void {
    try {
      const exposure =
        exposureService
          .getSnapshot();

      state.openPortfolioPositions =
        exposure.summary
          .openPositions;

      state.totalOpenCapital =
        exposure.summary
          .totalOpenCapital;

      state.totalOpenCapitalPercent =
        exposure.summary
          .totalOpenCapitalPercent;

      state.portfolioExposureBlockedCount =
        exposure.summary
          .blockedCount;

      state.portfolioExposureWarningCount =
        exposure.summary
          .warningCount;

      state.canOpenNewPositions =
        exposure.summary
          .canOpenNewPositions;

      const exposureSafe =
        exposure.summary
          .canOpenNewPositions &&
        exposure.summary
          .blockedCount ===
          0;

      gates.push({
        key:
          "PORTFOLIO_EXPOSURE_CAPACITY",

        state:
          exposureSafe
            ? "PASS"
            : "BLOCKED",

        required:
          true,

        message:
          exposureSafe
            ? `Portfolio exposure is within limits (${exposure.summary.openPositions} open position(s), ${exposure.summary.totalOpenCapitalPercent}% open capital).`
            : "Portfolio exposure limits prevent opening additional positions.",

        reasons:
          exposureSafe
            ? []
            : exposure.blockingReasons.length >
                0
              ? [
                  ...exposure.blockingReasons,
                ]
              : [
                  "Existing portfolio exposure policy does not permit a new position.",
                ],
      });
    } catch (
      error:
        unknown
    ) {
      state.openPortfolioPositions =
        null;

      state.totalOpenCapital =
        null;

      state.totalOpenCapitalPercent =
        null;

      state.portfolioExposureBlockedCount =
        null;

      state.portfolioExposureWarningCount =
        null;

      state.canOpenNewPositions =
        null;

      gates.push({
        key:
          "PORTFOLIO_EXPOSURE_CAPACITY",

        state:
          "BLOCKED",

        required:
          true,

        message:
          "Portfolio exposure could not be verified.",

        reasons: [
          this.errorMessage(
            error,

            "Unknown portfolio-exposure error.",
          ),
        ],
      });
    }
  }

  private captureCoordinatorSafety(
    gates:
      ProductionSafetyGate[],

    state:
      ProductionSafetyState,
  ): void {
    try {
      const coordinator =
        liveExecutionCoordinator
          .getDiagnostics();

      state.activeLiveSessions =
        coordinator
          .activeSessions;

      state.activeLiveLocks =
        coordinator
          .activeLocks;

      state.liveExecutionConfirmed =
        coordinator
          .liveExecutionConfirmed;

      const lockIntegrityPassed =
        coordinator
          .activeLocks <=
        coordinator
          .activeSessions;

      gates.push({
        key:
          "LIVE_SESSION_LOCK_INTEGRITY",

        state:
          lockIntegrityPassed
            ? "PASS"
            : "BLOCKED",

        required:
          true,

        message:
          lockIntegrityPassed
            ? "Live session/lock integrity check passed."
            : "Live session/lock integrity check failed.",

        reasons:
          lockIntegrityPassed
            ? []
            : [
                `Active locks (${coordinator.activeLocks}) exceed active sessions (${coordinator.activeSessions}).`,
              ],
      });

      const activeSessionLimitPassed =
        coordinator.activeSessions <=
        MAXIMUM_ACTIVE_LIVE_SESSIONS;

      gates.push({
        key:
          "ACTIVE_LIVE_SESSION_LIMIT",

        state:
          activeSessionLimitPassed
            ? "PASS"
            : "BLOCKED",

        required:
          true,

        message:
          activeSessionLimitPassed
            ? `Active LIVE session count is within limit (${coordinator.activeSessions}/${MAXIMUM_ACTIVE_LIVE_SESSIONS}).`
            : `Active LIVE session limit exceeded (${coordinator.activeSessions}/${MAXIMUM_ACTIVE_LIVE_SESSIONS}).`,

        reasons:
          activeSessionLimitPassed
            ? []
            : [
                `Maximum simultaneous controlled LIVE sessions is ${MAXIMUM_ACTIVE_LIVE_SESSIONS}.`,
              ],
      });

      const activeSessions =
        coordinator.sessions.filter(
          (
            session,
          ) =>
            this.isActiveSession(
              session,
            ),
        );

      const lockCounts =
        new Map<
          string,
          number
        >();

      for (
        const session
        of activeSessions
      ) {
        lockCounts.set(
          session.lockKey,

          (
            lockCounts.get(
              session.lockKey,
            ) ??
            0
          ) +
            1,
        );
      }

      const duplicateLockKeys =
        Array.from(
          lockCounts.entries(),
        )
          .filter(
            (
              [
                _lockKey,
                count,
              ],
            ) =>
              count >
              1,
          )
          .map(
            (
              [
                lockKey,
              ],
            ) =>
              lockKey,
          );

      state.duplicateActiveSessionLockKeys =
        duplicateLockKeys;

      gates.push({
        key:
          "DUPLICATE_LIVE_SESSION_PROTECTION",

        state:
          duplicateLockKeys.length ===
            0
            ? "PASS"
            : "BLOCKED",

        required:
          true,

        message:
          duplicateLockKeys.length ===
            0
            ? "No duplicate active LIVE execution lock keys exist."
            : "Duplicate active LIVE execution sessions were detected.",

        reasons:
          duplicateLockKeys.length ===
            0
            ? []
            : duplicateLockKeys.map(
                (
                  lockKey,
                ) =>
                  `Multiple active sessions use lock key ${lockKey}.`,
              ),
      });

      this.captureTradeActivitySafety(
        gates,
        state,
        coordinator.sessions,
      );

      this.captureRecoveryAndReconciliationSafety(
        gates,
        state,
        coordinator.sessions,
      );
    } catch (
      error:
        unknown
    ) {
      state.activeLiveSessions =
        null;

      state.activeLiveLocks =
        null;

      state.liveExecutionConfirmed =
        null;

      state.duplicateActiveSessionLockKeys =
        [];

      state.liveAttemptsLastHour =
        null;

      state.liveAttemptsToday =
        null;

      state.effectiveDailyActivity =
        null;

      const reason =
        this.errorMessage(
          error,

          "Unknown live coordinator error.",
        );

      for (
        const key
        of [
          "LIVE_SESSION_LOCK_INTEGRITY",
          "ACTIVE_LIVE_SESSION_LIMIT",
          "DUPLICATE_LIVE_SESSION_PROTECTION",
          "LIVE_TRADE_FREQUENCY_HOURLY",
          "LIVE_DAILY_ACTIVITY",
        ]
      ) {
        gates.push({
          key,

          state:
            "BLOCKED",

          required:
            true,

          message:
            `${key} could not be verified.`,

          reasons: [
            reason,
          ],
        });
      }

      this.captureRecoveryAndReconciliationSafety(
        gates,
        state,
        [],
      );
    }
  }

  private captureRecoveryAndReconciliationSafety(
    gates:
      ProductionSafetyGate[],

    state:
      ProductionSafetyState,

    sessions:
      readonly LiveExecutionSession[],
  ): void {
    const dryRunSessionIds =
      new Set(
        sessions
          .filter(
            (
              session,
            ) =>
              this.isDryRunSession(
                session,
              ),
          )
          .map(
            (
              session,
            ) =>
              session.id,
          ),
      );

    this.captureReconciliationSafety(
      gates,
      state,
      dryRunSessionIds,
    );

    this.captureRecoverySafety(
      gates,
      state,
      dryRunSessionIds,
    );
  }

  private captureReconciliationSafety(
    gates:
      ProductionSafetyGate[],

    state:
      ProductionSafetyState,

    dryRunSessionIds:
      ReadonlySet<string>,
  ): void {
    try {
      const diagnostics =
        executionReconciliationEngine
          .getDiagnostics();

      const records =
        diagnostics.records.filter(
          (
            record,
          ) =>
            !dryRunSessionIds.has(
              record.sessionId,
            ),
        );

      const unresolvedRecords =
        records.filter(
          (
            record,
          ) =>
            record.status !==
              "MATCHED" &&
            record.status !==
              "NOT_SUBMITTED",
        );

      const criticalRecords =
        unresolvedRecords.filter(
          (
            record,
          ) =>
            record.severity ===
            "CRITICAL",
        );

      const warningRecords =
        unresolvedRecords.filter(
          (
            record,
          ) =>
            record.severity ===
            "WARNING",
        );

      state.reconciliationRunning =
        diagnostics.running;

      state.reconciliationLastScanAt =
        diagnostics.lastScanAt;

      state.reconciliationRecords =
        records.length;

      state.reconciliationDrifted =
        records.filter(
          (
            record,
          ) =>
            record.status ===
            "DRIFT",
        ).length;

      state.reconciliationRemoteUnavailable =
        records.filter(
          (
            record,
          ) =>
            record.status ===
            "REMOTE_UNAVAILABLE",
        ).length;

      state.reconciliationErrors =
        records.filter(
          (
            record,
          ) =>
            record.status ===
            "ERROR",
        ).length;

      state.reconciliationCriticalMismatches =
        criticalRecords.length;

      state.reconciliationWarningMismatches =
        warningRecords.length;

      state.unresolvedReconciliationRecords =
        unresolvedRecords.length;

      if (
        criticalRecords.length >
        0
      ) {
        gates.push({
          key:
            "RECONCILIATION_MISMATCH_CLEAR",

          state:
            "EMERGENCY_STOP",

          required:
            true,

          message:
            `${criticalRecords.length} critical unresolved reconciliation mismatch(es) exist.`,

          reasons:
            criticalRecords
              .slice(
                0,
                10,
              )
              .map(
                (
                  record,
                ) =>
                  `${record.exchange} ${record.market} ${record.side}: ${record.status} - ${record.reasons.join(
                    " | ",
                  )}`,
              ),
        });

        return;
      }

      if (
        unresolvedRecords.length >
        0
      ) {
        gates.push({
          key:
            "RECONCILIATION_MISMATCH_CLEAR",

          state:
            "BLOCKED",

          required:
            true,

          message:
            `${unresolvedRecords.length} unresolved reconciliation record(s) exist.`,

          reasons:
            unresolvedRecords
              .slice(
                0,
                10,
              )
              .map(
                (
                  record,
                ) =>
                  `${record.exchange} ${record.market} ${record.side}: ${record.status}.`,
              ),
        });

        return;
      }

      gates.push({
        key:
          "RECONCILIATION_MISMATCH_CLEAR",

        state:
          "PASS",

        required:
          true,

        message:
          "No unresolved non-synthetic reconciliation mismatches exist.",

        reasons:
          [],
      });
    } catch (
      error:
        unknown
    ) {
      state.reconciliationRunning =
        null;

      state.reconciliationLastScanAt =
        null;

      state.reconciliationRecords =
        null;

      state.reconciliationDrifted =
        null;

      state.reconciliationRemoteUnavailable =
        null;

      state.reconciliationErrors =
        null;

      state.reconciliationCriticalMismatches =
        null;

      state.reconciliationWarningMismatches =
        null;

      state.unresolvedReconciliationRecords =
        null;

      gates.push({
        key:
          "RECONCILIATION_MISMATCH_CLEAR",

        state:
          "BLOCKED",

        required:
          true,

        message:
          "Execution reconciliation state could not be verified.",

        reasons: [
          this.errorMessage(
            error,

            "Unknown reconciliation safety error.",
          ),
        ],
      });
    }
  }

  private captureRecoverySafety(
    gates:
      ProductionSafetyGate[],

    state:
      ProductionSafetyState,

    dryRunSessionIds:
      ReadonlySet<string>,
  ): void {
    try {
      const diagnostics =
        executionRecoveryEngine
          .getDiagnostics();

      const incidents =
        diagnostics.incidents.filter(
          (
            incident,
          ) =>
            !dryRunSessionIds.has(
              incident.sessionId,
            ),
        );

      const unresolved =
        incidents.filter(
          (
            incident,
          ) =>
            incident.status !==
            "RESOLVED",
        );

      const unresolvedExposure =
        unresolved.filter(
          (
            incident,
          ) =>
            incident.exposedQuantity >
              0 ||
            incident.exposureDirection !==
              "BALANCED",
        );

      const critical =
        unresolved.filter(
          (
            incident,
          ) =>
            incident.severity ===
            "CRITICAL",
        );

      const unresolvedExposureQuantity =
        unresolvedExposure.reduce(
          (
            total,
            incident,
          ) =>
            total +
            Math.abs(
              incident
                .exposedQuantity,
            ),

          0,
        );

      const unresolvedExposureNotional =
        unresolvedExposure.reduce(
          (
            total,
            incident,
          ) =>
            total +
            (
              incident
                .estimatedExposureNotional ??
              0
            ),

          0,
        );

      state.recoveryRunning =
        diagnostics.running;

      state.recoveryLastScanAt =
        diagnostics.lastScanAt;

      state.openRecoveryIncidents =
        incidents.filter(
          (
            incident,
          ) =>
            incident.status ===
            "OPEN",
        ).length;

      state.acknowledgedRecoveryIncidents =
        incidents.filter(
          (
            incident,
          ) =>
            incident.status ===
            "ACKNOWLEDGED",
        ).length;

      state.criticalRecoveryIncidents =
        critical.length;

      state.unresolvedRecoveryIncidents =
        unresolved.length;

      state.unresolvedExposureIncidents =
        unresolvedExposure.length;

      state.unresolvedExposureQuantity =
        this.round(
          unresolvedExposureQuantity,
        );

      state.unresolvedExposureNotional =
        this.round(
          unresolvedExposureNotional,
        );

      if (
        unresolvedExposure.length >
        0
      ) {
        gates.push({
          key:
            "UNRESOLVED_EXECUTION_EXPOSURE_CLEAR",

          state:
            "EMERGENCY_STOP",

          required:
            true,

          message:
            `${unresolvedExposure.length} unresolved execution exposure incident(s) exist.`,

          reasons:
            unresolvedExposure
              .slice(
                0,
                10,
              )
              .map(
                (
                  incident,
                ) =>
                  `${incident.market} ${incident.exposureDirection}: exposedQuantity=${incident.exposedQuantity}, strategy=${incident.strategy}, status=${incident.status}.`,
              ),
        });
      } else {
        gates.push({
          key:
            "UNRESOLVED_EXECUTION_EXPOSURE_CLEAR",

          state:
            "PASS",

          required:
            true,

          message:
            "No unresolved non-synthetic execution exposure exists.",

          reasons:
            [],
        });
      }

      gates.push({
        key:
          "RECOVERY_IN_PROGRESS_CLEAR",

        state:
          unresolved.length ===
            0
            ? "PASS"
            : "BLOCKED",

        required:
          true,

        message:
          unresolved.length ===
            0
            ? "No unresolved execution recovery incidents exist."
            : `${unresolved.length} execution recovery incident(s) remain unresolved.`,

        reasons:
          unresolved.length ===
            0
            ? []
            : unresolved
                .slice(
                  0,
                  10,
                )
                .map(
                  (
                    incident,
                  ) =>
                    `${incident.market}: ${incident.status} / ${incident.strategy} - ${incident.reason}`,
                ),
      });
    } catch (
      error:
        unknown
    ) {
      state.recoveryRunning =
        null;

      state.recoveryLastScanAt =
        null;

      state.openRecoveryIncidents =
        null;

      state.acknowledgedRecoveryIncidents =
        null;

      state.criticalRecoveryIncidents =
        null;

      state.unresolvedRecoveryIncidents =
        null;

      state.unresolvedExposureIncidents =
        null;

      state.unresolvedExposureQuantity =
        null;

      state.unresolvedExposureNotional =
        null;

      const reason =
        this.errorMessage(
          error,

          "Unknown recovery safety error.",
        );

      gates.push({
        key:
          "UNRESOLVED_EXECUTION_EXPOSURE_CLEAR",

        state:
          "BLOCKED",

        required:
          true,

        message:
          "Execution exposure state could not be verified.",

        reasons: [
          reason,
        ],
      });

      gates.push({
        key:
          "RECOVERY_IN_PROGRESS_CLEAR",

        state:
          "BLOCKED",

        required:
          true,

        message:
          "Execution recovery state could not be verified.",

        reasons: [
          reason,
        ],
      });
    }
  }

  private captureTradeActivitySafety(
    gates:
      ProductionSafetyGate[],

    state:
      ProductionSafetyState,

    sessions:
      readonly LiveExecutionSession[],
  ): void {
    const now =
      Date.now();

    const startOfToday =
      this.startOfLocalDay(
        now,
      );

    const liveAttempts =
      sessions.filter(
        (
          session,
        ) =>
          session.startedAt !==
            null &&
          !this.isDryRunSession(
            session,
          ),
      );

    const liveAttemptsLastHour =
      liveAttempts.filter(
        (
          session,
        ) =>
          session.startedAt !==
            null &&
          session.startedAt >=
            now -
              ONE_HOUR_MS,
      ).length;

    const liveAttemptsToday =
      liveAttempts.filter(
        (
          session,
        ) =>
          session.startedAt !==
            null &&
          session.startedAt >=
            startOfToday,
      ).length;

    state.liveAttemptsLastHour =
      liveAttemptsLastHour;

    state.liveAttemptsToday =
      liveAttemptsToday;

    const accountTradesToday =
      state.accountTradesToday;

    const effectiveDailyActivity =
      accountTradesToday ===
        null
        ? null
        : Math.max(
            accountTradesToday,
            liveAttemptsToday,
          );

    state.effectiveDailyActivity =
      effectiveDailyActivity;

    const hourlyAllowed =
      liveAttemptsLastHour <
      MAXIMUM_LIVE_ATTEMPTS_PER_HOUR;

    gates.push({
      key:
        "LIVE_TRADE_FREQUENCY_HOURLY",

      state:
        hourlyAllowed
          ? "PASS"
          : "BLOCKED",

      required:
        true,

      message:
        hourlyAllowed
          ? `Hourly LIVE activity is within limit (${liveAttemptsLastHour}/${MAXIMUM_LIVE_ATTEMPTS_PER_HOUR}).`
          : `Hourly LIVE activity limit reached (${liveAttemptsLastHour}/${MAXIMUM_LIVE_ATTEMPTS_PER_HOUR}).`,

      reasons:
        hourlyAllowed
          ? []
          : [
              `Maximum LIVE execution attempts per rolling hour is ${MAXIMUM_LIVE_ATTEMPTS_PER_HOUR}.`,
            ],
    });

    if (
      state.maximumDailyTrades ===
        null ||
      effectiveDailyActivity ===
        null ||
      !Number.isFinite(
        state.maximumDailyTrades,
      ) ||
      state.maximumDailyTrades <=
        0
    ) {
      gates.push({
        key:
          "LIVE_DAILY_ACTIVITY",

        state:
          "BLOCKED",

        required:
          true,

        message:
          "Daily LIVE activity limit could not be verified.",

        reasons: [
          "Trading-account maximumDailyTrades is unavailable or invalid.",
        ],
      });

      return;
    }

    const dailyAllowed =
      effectiveDailyActivity <
      state.maximumDailyTrades;

    gates.push({
      key:
        "LIVE_DAILY_ACTIVITY",

      state:
        dailyAllowed
          ? "PASS"
          : "BLOCKED",

      required:
        true,

      message:
        dailyAllowed
          ? `Daily LIVE activity is within account limit (${effectiveDailyActivity}/${state.maximumDailyTrades}).`
          : `Daily LIVE activity limit reached (${effectiveDailyActivity}/${state.maximumDailyTrades}).`,

      reasons:
        dailyAllowed
          ? []
          : [
              `Trading-account maximum daily trade limit of ${state.maximumDailyTrades} has been reached.`,
            ],
    });
  }

  private isActiveSession(
    session:
      LiveExecutionSession,
  ): boolean {
    return (
      session.status ===
        "VALIDATING" ||
      session.status ===
        "RESERVED" ||
      session.status ===
        "READY_FOR_SUBMISSION" ||
      session.status ===
        "RUNNING"
    );
  }

  private isDryRunSession(
    session:
      LiveExecutionSession,
  ): boolean {
    return session.events.some(
      (
        event,
      ) =>
        event.metadata
          .dryRun ===
        true,
    );
  }

  private startOfLocalDay(
    timestamp:
      number,
  ): number {
    const date =
      new Date(
        timestamp,
      );

    date.setHours(
      0,
      0,
      0,
      0,
    );

    return date.getTime();
  }

  private formatMoney(
    value:
      number,
  ): string {
    return `₹${value.toLocaleString(
      "en-IN",
      {
        maximumFractionDigits:
          2,
      },
    )}`;
  }

  private round(
    value:
      number,
  ): number {
    return Math.round(
      value *
        100,
    ) /
      100;
  }

  private collectReasons(
    gates:
      readonly ProductionSafetyGate[],

    state:
      ProductionSafetyGateState,
  ): string[] {
    return [
      ...new Set(
        gates
          .filter(
            (
              gate,
            ) =>
              gate.required &&
              gate.state ===
                state,
          )
          .flatMap(
            (
              gate,
            ) =>
              gate.reasons.length >
              0
                ? gate.reasons
                : [
                    gate.message,
                  ],
          ),
      ),
    ];
  }

  private resolveStatus(
    emergencyReasons:
      readonly string[],

    blockers:
      readonly string[],
  ): ProductionSafetyStatus {
    if (
      emergencyReasons.length >
      0
    ) {
      return "EMERGENCY_STOP";
    }

    if (
      blockers.length >
      0
    ) {
      return "BLOCKED";
    }

    return "SAFE";
  }

  private errorMessage(
    error:
      unknown,

    fallback:
      string,
  ): string {
    return error instanceof Error
      ? error.message
      : fallback;
  }
}

export const productionSafetyControllerService =
  new ProductionSafetyControllerService();
