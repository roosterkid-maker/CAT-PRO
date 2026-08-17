import {
  tradingAccountLedgerService,
} from "../../../trading/account/TradingAccountLedgerService";

import {
  tradingAccountService,
} from "../../../trading/account/TradingAccountService";

import {
  liveExecutionSessionEvidenceService,
} from "../coordinator/LiveExecutionSessionEvidenceService";

import {
  executionHealthService,
} from "../health/ExecutionHealthService";

import {
  orderLifecycleEvidenceService,
} from "../lifecycle/OrderLifecycleEvidenceService";

import {
  executionRestartRecoveryGateService,
} from "../recovery/ExecutionRestartRecoveryGateService";

import {
  credentialSafetyService,
} from "../security/CredentialSafetyService";

import {
  executionSettlementAccountingPersistenceService,
} from "../settlement/ExecutionSettlementAccountingPersistenceService";

import {
  exchangeClockSafetyService,
} from "../time/ExchangeClockSafetyService";

import type {
  ProductionAlert,
  ProductionAlertReport,
  ProductionAlertSeverity,
  ProductionAlertSystemState,
} from "./ProductionAlert";

export class ProductionAlertService {
  getReport():
    ProductionAlertReport {
    const now =
      Date.now();

    const alerts:
      ProductionAlert[] =
      [];

    const executionHealth =
      executionHealthService
        .getReport();

    const restartRecovery =
      executionRestartRecoveryGateService
        .getReport();

    const clockSafety =
      exchangeClockSafetyService
        .getReport();

    const sessionEvidence =
      liveExecutionSessionEvidenceService
        .getDiagnostics();

    const orderEvidence =
      orderLifecycleEvidenceService
        .getDiagnostics();

    const settlementAccounting =
      executionSettlementAccountingPersistenceService
        .getDiagnostics();

    const accountLedger =
      tradingAccountLedgerService
        .getDiagnostics();

    const account =
      tradingAccountService
        .getAccount();

    const credentialSafety =
      credentialSafetyService
        .getReport();

    /*
     * ------------------------------------------------
     * EXECUTION HEALTH
     * ------------------------------------------------
     */

    if (
      executionHealth.status ===
      "UNHEALTHY"
    ) {
      this.push(
        alerts,
        {
          key:
            "EXECUTION_HEALTH_UNHEALTHY",

          severity:
            "CRITICAL",

          source:
            "EXECUTION_HEALTH",

          title:
            "Execution health is unhealthy",

          message:
            executionHealth
              .reasons
              .length >
            0
              ? executionHealth
                  .reasons
                  .join(
                    " | ",
                  )
              : "Execution health service reports UNHEALTHY.",

          detectedAt:
            now,

          blocksFutureLiveTrading:
            true,

          requiresManualReview:
            true,

          metadata: {
            totalExecutions:
              executionHealth
                .totalExecutions,

            unhealthyExchanges:
              executionHealth
                .unhealthyExchanges,
          },
        },
      );
    } else if (
      executionHealth.status ===
      "DEGRADED"
    ) {
      this.push(
        alerts,
        {
          key:
            "EXECUTION_HEALTH_DEGRADED",

          severity:
            "WARNING",

          source:
            "EXECUTION_HEALTH",

          title:
            "Execution health is degraded",

          message:
            executionHealth
              .reasons
              .length >
            0
              ? executionHealth
                  .reasons
                  .join(
                    " | ",
                  )
              : "Execution health service reports DEGRADED.",

          detectedAt:
            now,

          blocksFutureLiveTrading:
            false,

          requiresManualReview:
            true,

          metadata: {
            degradedExchanges:
              executionHealth
                .degradedExchanges,
          },
        },
      );
    } else if (
      executionHealth.status ===
      "NO_DATA"
    ) {
      this.push(
        alerts,
        {
          key:
            "EXECUTION_HEALTH_NO_DATA",

          severity:
            "WARNING",

          source:
            "EXECUTION_HEALTH",

          title:
            "Execution health has no live evidence",

          message:
            "Execution adapters may be available, but sufficient execution metrics do not exist yet.",

          detectedAt:
            now,

          blocksFutureLiveTrading:
            false,

          requiresManualReview:
            false,

          metadata: {
            totalExecutions:
              executionHealth
                .totalExecutions,
          },
        },
      );
    }

    /*
     * ------------------------------------------------
     * RESTART RECOVERY
     * ------------------------------------------------
     */

    if (
      restartRecovery
        .classification !==
      "CLEAN"
    ) {
      this.push(
        alerts,
        {
          key:
            `RESTART_RECOVERY_${restartRecovery.classification}`,

          severity:
            "CRITICAL",

          source:
            "RESTART_RECOVERY",

          title:
            "Restart recovery requires attention",

          message:
            restartRecovery
              .blockers
              .length >
            0
              ? restartRecovery
                  .blockers
                  .join(
                    " | ",
                  )
              : `Restart recovery classification is ${restartRecovery.classification}.`,

          detectedAt:
            now,

          blocksFutureLiveTrading:
            true,

          requiresManualReview:
            true,

          metadata: {
            classification:
              restartRecovery
                .classification,

            findings:
              restartRecovery
                .summary
                .findings,

            possibleOpenOrders:
              restartRecovery
                .summary
                .possibleOpenOrders,

            possibleExposureSessions:
              restartRecovery
                .summary
                .possibleExposureSessions,
          },
        },
      );
    }

    /*
     * ------------------------------------------------
     * CLOCK SAFETY
     * ------------------------------------------------
     */

    for (
      const exchange
      of clockSafety.exchanges
    ) {
      if (
        exchange.mode ===
          "SERVER_SYNCHRONIZED" &&
        !exchange
          .signedRequestAllowed
      ) {
        this.push(
          alerts,
          {
            key:
              `CLOCK_UNSAFE_${exchange.exchange.toUpperCase()}`,

            severity:
              "CRITICAL",

            source:
              "CLOCK_SAFETY",

            title:
              `${exchange.exchange} signed-request clock is unsafe`,

            message:
              exchange
                .reasons
                .length >
              0
                ? exchange
                    .reasons
                    .join(
                      " | ",
                    )
                : `${exchange.exchange} clock is not safe for signed requests.`,

            detectedAt:
              now,

            blocksFutureLiveTrading:
              true,

            requiresManualReview:
              false,

            metadata: {
              health:
                exchange.health,

              offsetMs:
                exchange.offsetMs,

              ageMs:
                exchange.ageMs,

              maximumAllowedAgeMs:
                exchange
                  .maximumAllowedAgeMs,

              maximumAllowedOffsetMs:
                exchange
                  .maximumAllowedOffsetMs,
            },
          },
        );
      }

      if (
        exchange.mode ===
        "LOCAL_CLOCK_ONLY"
      ) {
        this.push(
          alerts,
          {
            key:
              `CLOCK_LOCAL_ONLY_${exchange.exchange.toUpperCase()}`,

            severity:
              "INFO",

            source:
              "CLOCK_SAFETY",

            title:
              `${exchange.exchange} uses local clock`,

            message:
              `${exchange.exchange} does not currently use an authoritative server-time synchronization source.`,

            detectedAt:
              now,

            blocksFutureLiveTrading:
              false,

            requiresManualReview:
              false,

            metadata: {
              health:
                exchange.health,

              mode:
                exchange.mode,
            },
          },
        );
      }
    }

    /*
     * ------------------------------------------------
     * LIVE SESSION EVIDENCE
     * ------------------------------------------------
     */

    if (
      sessionEvidence
        .recoveryRequired
    ) {
      this.push(
        alerts,
        {
          key:
            "INTERRUPTED_REAL_LIVE_SESSION",

          severity:
            "CRITICAL",

          source:
            "SESSION_PERSISTENCE",

          title:
            "Interrupted LIVE session evidence exists",

          message:
            `${sessionEvidence.interruptedRealSessions} interrupted real LIVE session(s) require reconciliation.`,

          detectedAt:
            now,

          blocksFutureLiveTrading:
            true,

          requiresManualReview:
            true,

          metadata: {
            interruptedRealSessions:
              sessionEvidence
                .interruptedRealSessions,
          },
        },
      );
    }

    if (
      sessionEvidence
        .writeFailures >
        0 ||
      sessionEvidence
        .lastError
    ) {
      this.pushPersistenceAlert(
        alerts,
        now,
        "SESSION_PERSISTENCE_FAILURE",
        "SESSION_PERSISTENCE",
        sessionEvidence
          .writeFailures,
        sessionEvidence
          .lastError,
      );
    }

    /*
     * ------------------------------------------------
     * ORDER EVIDENCE / DUPLICATE PROTECTION
     * ------------------------------------------------
     */

    if (
      orderEvidence
        .duplicateSubmissionRisk
    ) {
      this.push(
        alerts,
        {
          key:
            "DUPLICATE_ORDER_RISK",

          severity:
            "CRITICAL",

          source:
            "ORDER_PERSISTENCE",

          title:
            "Persisted duplicate-order risk detected",

          message:
            `${orderEvidence.possibleSubmittedRealOrders} persisted real order(s) may already have reached an exchange.`,

          detectedAt:
            now,

          blocksFutureLiveTrading:
            true,

          requiresManualReview:
            true,

          metadata: {
            duplicateGuardEntries:
              orderEvidence
                .duplicateGuardEntries,

            possibleSubmittedRealOrders:
              orderEvidence
                .possibleSubmittedRealOrders,
          },
        },
      );
    }

    if (
      orderEvidence
        .writeFailures >
        0 ||
      orderEvidence
        .lastError
    ) {
      this.pushPersistenceAlert(
        alerts,
        now,
        "ORDER_PERSISTENCE_FAILURE",
        "ORDER_PERSISTENCE",
        orderEvidence
          .writeFailures,
        orderEvidence
          .lastError,
      );
    }

    /*
     * ------------------------------------------------
     * SETTLEMENT / ACCOUNTING
     * ------------------------------------------------
     */

    if (
      settlementAccounting
        .accountingUncertain >
      0
    ) {
      this.push(
        alerts,
        {
          key:
            "ACCOUNTING_UNCERTAIN",

          severity:
            "CRITICAL",

          source:
            "SETTLEMENT_ACCOUNTING",

          title:
            "Settlement accounting is uncertain",

          message:
            `${settlementAccounting.accountingUncertain} settlement accounting transaction(s) are in an uncertain crash-window state.`,

          detectedAt:
            now,

          blocksFutureLiveTrading:
            true,

          requiresManualReview:
            true,

          metadata: {
            uncertainSessionIds:
              settlementAccounting
                .uncertainSessionIds,
          },
        },
      );
    }

    if (
      settlementAccounting
        .writeFailures >
        0 ||
      settlementAccounting
        .lastError
    ) {
      this.pushPersistenceAlert(
        alerts,
        now,
        "SETTLEMENT_PERSISTENCE_FAILURE",
        "SETTLEMENT_ACCOUNTING",
        settlementAccounting
          .writeFailures,
        settlementAccounting
          .lastError,
      );
    }

    /*
     * ------------------------------------------------
     * ACCOUNT LEDGER
     * ------------------------------------------------
     */

    if (
      accountLedger
        .writeFailures >
        0 ||
      accountLedger
        .lastError
    ) {
      this.pushPersistenceAlert(
        alerts,
        now,
        "ACCOUNT_LEDGER_FAILURE",
        "ACCOUNT_LEDGER",
        accountLedger
          .writeFailures,
        accountLedger
          .lastError,
      );
    }

    /*
     * ------------------------------------------------
     * TRADING ACCOUNT
     * ------------------------------------------------
     */

    if (
      account.emergencyStop
    ) {
      this.push(
        alerts,
        {
          key:
            "EMERGENCY_STOP_ACTIVE",

          severity:
            "CRITICAL",

          source:
            "TRADING_ACCOUNT",

          title:
            "Emergency stop is active",

          message:
            "Trading account emergency stop is currently active.",

          detectedAt:
            now,

          blocksFutureLiveTrading:
            true,

          requiresManualReview:
            true,

          metadata: {},
        },
      );
    }

    if (
      !account.enabled
    ) {
      this.push(
        alerts,
        {
          key:
            "TRADING_ACCOUNT_DISABLED",

          severity:
            "CRITICAL",

          source:
            "TRADING_ACCOUNT",

          title:
            "Trading account is disabled",

          message:
            "Trading account must be enabled before future controlled LIVE execution.",

          detectedAt:
            now,

          blocksFutureLiveTrading:
            true,

          requiresManualReview:
            true,

          metadata: {
            mode:
              account.mode,
          },
        },
      );
    }

    if (
      account.todayLoss >=
      account
        .limits
        .maximumDailyLoss
    ) {
      this.push(
        alerts,
        {
          key:
            "DAILY_LOSS_LIMIT_REACHED",

          severity:
            "CRITICAL",

          source:
            "TRADING_ACCOUNT",

          title:
            "Daily loss limit reached",

          message:
            `Today loss ${account.todayLoss} reached maximum daily loss ${account.limits.maximumDailyLoss}.`,

          detectedAt:
            now,

          blocksFutureLiveTrading:
            true,

          requiresManualReview:
            true,

          metadata: {
            todayLoss:
              account.todayLoss,

            maximumDailyLoss:
              account
                .limits
                .maximumDailyLoss,
          },
        },
      );
    }

    /*
     * ------------------------------------------------
     * CREDENTIAL SAFETY
     * ------------------------------------------------
     */

    if (
      credentialSafety
        .blockers
        .length >
      0
    ) {
      this.push(
        alerts,
        {
          key:
            "CREDENTIAL_SAFETY_BLOCKED",

          severity:
            "CRITICAL",

          source:
            "CREDENTIAL_SAFETY",

          title:
            "Credential safety check has blockers",

          message:
            credentialSafety
              .blockers
              .join(
                " | ",
              ),

          detectedAt:
            now,

          blocksFutureLiveTrading:
            true,

          requiresManualReview:
            true,

          metadata: {
            allConfigured:
              credentialSafety
                .allConfigured,

            redactionSelfTestPassed:
              credentialSafety
                .redaction
                .selfTestPassed,
          },
        },
      );
    }

    const sortedAlerts =
      this.sortAlerts(
        alerts,
      );

    const critical =
      this.countSeverity(
        sortedAlerts,
        "CRITICAL",
      );

    const warnings =
      this.countSeverity(
        sortedAlerts,
        "WARNING",
      );

    const info =
      this.countSeverity(
        sortedAlerts,
        "INFO",
      );

    const liveBlockingAlerts =
      sortedAlerts.filter(
        (
          alert,
        ) =>
          alert
            .blocksFutureLiveTrading,
      ).length;

    const manualReviewAlerts =
      sortedAlerts.filter(
        (
          alert,
        ) =>
          alert
            .requiresManualReview,
      ).length;

    return {
      generatedAt:
        now,

      version:
        "18.0",

      build:
        "11",

      monitoringOnly:
        true,

      liveTradingEnabled:
        false,

      liveSubmissionAllowed:
        false,

      automaticTradingActionAllowed:
        false,

      automaticCancelAllowed:
        false,

      automaticHedgeAllowed:
        false,

      automaticUnwindAllowed:
        false,

      automaticEmergencyStopMutationAllowed:
        false,

      systemState:
        this.resolveSystemState(
          critical,
          warnings,
        ),

      summary: {
        totalAlerts:
          sortedAlerts.length,

        info,

        warnings,

        critical,

        liveBlockingAlerts,

        manualReviewAlerts,
      },

      alerts:
        sortedAlerts,

      sourceStates: {
        executionHealth:
          executionHealth.status,

        restartRecovery:
          restartRecovery
            .classification,

        clockHealthy:
          clockSafety
            .allServerSynchronizedClocksHealthy,

        sessionRecoveryRequired:
          sessionEvidence
            .recoveryRequired,

        duplicateSubmissionRisk:
          orderEvidence
            .duplicateSubmissionRisk,

        accountingUncertain:
          settlementAccounting
            .accountingUncertain,

        emergencyStopActive:
          account.emergencyStop,

        credentialConfigurationHealthy:
          credentialSafety
            .allConfigured &&
          credentialSafety
            .redaction
            .selfTestPassed,
      },

      notes: [
        "Version 18 Build 11 centralizes production alerts from existing safety and persistence diagnostics.",

        "Alert generation is read-only and does not mutate trading state.",

        "CRITICAL means a condition should block future LIVE promotion or requires explicit resolution.",

        "WARNING means degraded or insufficient operational evidence requiring attention.",

        "INFO records non-blocking production limitations such as LOCAL_CLOCK_ONLY exchanges.",

        "No alert automatically submits, cancels, hedges or unwinds an exchange order.",

        "No alert automatically changes emergency-stop state.",

        "LIVE trading and LIVE order submission remain disabled.",
      ],
    };
  }

  private pushPersistenceAlert(
    alerts:
      ProductionAlert[],

    detectedAt:
      number,

    key:
      string,

    source:
      ProductionAlert["source"],

    writeFailures:
      number,

    lastError:
      string | null,
  ): void {
    this.push(
      alerts,
      {
        key,

        severity:
          "CRITICAL",

        source,

        title:
          "Persistence integrity problem detected",

        message:
          lastError ??
          `${writeFailures} persistence write failure(s) detected.`,

        detectedAt,

        blocksFutureLiveTrading:
          true,

        requiresManualReview:
          true,

        metadata: {
          writeFailures,

          lastError,
        },
      },
    );
  }

  private push(
    alerts:
      ProductionAlert[],

    alert:
      ProductionAlert,
  ): void {
    /*
     * Deduplicate by stable alert key.
     */
    if (
      alerts.some(
        (
          existing,
        ) =>
          existing.key ===
          alert.key,
      )
    ) {
      return;
    }

    alerts.push(
      alert,
    );
  }

  private countSeverity(
    alerts:
      readonly ProductionAlert[],

    severity:
      ProductionAlertSeverity,
  ): number {
    return alerts.filter(
      (
        alert,
      ) =>
        alert.severity ===
        severity,
    ).length;
  }

  private resolveSystemState(
    critical:
      number,

    warnings:
      number,
  ):
    ProductionAlertSystemState {
    if (
      critical >
      0
    ) {
      return "BLOCKED";
    }

    if (
      warnings >
      0
    ) {
      return "ATTENTION";
    }

    return "OK";
  }

  private sortAlerts(
    alerts:
      readonly ProductionAlert[],
  ):
    ProductionAlert[] {
    const priority:
      Record<
        ProductionAlertSeverity,
        number
      > = {
      CRITICAL:
        3,

      WARNING:
        2,

      INFO:
        1,
    };

    return [
      ...alerts,
    ].sort(
      (
        first,
        second,
      ) =>
        priority[
          second.severity
        ] -
          priority[
            first.severity
          ] ||
        first.key.localeCompare(
          second.key,
        ),
    );
  }
}

export const productionAlertService =
  new ProductionAlertService();