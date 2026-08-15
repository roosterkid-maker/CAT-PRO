import {
  tradingAccountLedgerService,
} from "../../../trading/account/TradingAccountLedgerService";

import {
  tradingAccountService,
} from "../../../trading/account/TradingAccountService";

import {
  productionAlertHistoryService,
} from "../alerts/ProductionAlertHistoryService";

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
  executionRecoveryResolutionService,
} from "../recovery/ExecutionRecoveryResolutionService";

import {
  credentialSafetyService,
} from "../security/CredentialSafetyService";

import {
  executionSettlementAccountingPersistenceService,
} from "../settlement/ExecutionSettlementAccountingPersistenceService";

import {
  exchangeClockSafetyService,
} from "../time/ExchangeClockSafetyService";

import {
  failureInjectionValidationService,
} from "../validation/FailureInjectionValidationService";

import type {
  V18AcceptanceGate,
  V18ProductionReadinessReport,
} from "./V18ProductionReadiness";

export class V18ProductionReadinessService {
  getReport():
    V18ProductionReadinessReport {
    const gates:
      V18AcceptanceGate[] =
      [];

    const account =
      tradingAccountService
        .getAccount();

    const accountLedger =
      tradingAccountLedgerService
        .getDiagnostics();

    const sessionEvidence =
      liveExecutionSessionEvidenceService
        .getDiagnostics();

    const orderEvidence =
      orderLifecycleEvidenceService
        .getDiagnostics();

    const settlement =
      executionSettlementAccountingPersistenceService
        .getDiagnostics();

    const recovery =
      executionRestartRecoveryGateService
        .getReport();

    const recoveryResolutions =
      executionRecoveryResolutionService
        .getDiagnostics();

    const alertHistory =
      productionAlertHistoryService
        .getReport();

    const credentials =
      credentialSafetyService
        .getReport();

    const clocks =
      exchangeClockSafetyService
        .getReport();

    const executionHealth =
      executionHealthService
        .getReport();

    /*
     * VERSION 18 BUILD 14
     *
     * These drills use isolated temporary
     * synthetic files only.
     *
     * They make no exchange calls and use no
     * real money.
     */
    const validation =
      failureInjectionValidationService
        .run();

    /*
     * ------------------------------------------------
     * PERSISTENCE
     * ------------------------------------------------
     */

    this.addGate(
      gates,

      {
        key:
          "SESSION_EVIDENCE_PERSISTENCE",

        category:
          "PERSISTENCE",

        requiredForV18Acceptance:
          true,

        requiredForTinyLive:
          true,

        passed:
          sessionEvidence
            .writeFailures ===
            0 &&
          sessionEvidence
            .lastError ===
            null,

        message:
          "LIVE session evidence persistence is healthy.",

        reasons: [
          ...(
            sessionEvidence
              .writeFailures >
            0
              ? [
                  `${sessionEvidence.writeFailures} LIVE session persistence write failure(s).`,
                ]
              : []
          ),

          ...(
            sessionEvidence
              .lastError
              ? [
                  sessionEvidence
                    .lastError,
                ]
              : []
          ),
        ],
      },
    );

    this.addGate(
      gates,

      {
        key:
          "ORDER_LIFECYCLE_PERSISTENCE",

        category:
          "PERSISTENCE",

        requiredForV18Acceptance:
          true,

        requiredForTinyLive:
          true,

        passed:
          orderEvidence
            .writeFailures ===
            0 &&
          orderEvidence
            .lastError ===
            null,

        message:
          "Order lifecycle persistence is healthy.",

        reasons: [
          ...(
            orderEvidence
              .writeFailures >
            0
              ? [
                  `${orderEvidence.writeFailures} order-evidence write failure(s).`,
                ]
              : []
          ),

          ...(
            orderEvidence
              .lastError
              ? [
                  orderEvidence
                    .lastError,
                ]
              : []
          ),
        ],
      },
    );

    this.addGate(
      gates,

      {
        key:
          "ACCOUNT_LEDGER_PERSISTENCE",

        category:
          "PERSISTENCE",

        requiredForV18Acceptance:
          true,

        requiredForTinyLive:
          true,

        passed:
          accountLedger
            .writeFailures ===
            0 &&
          accountLedger
            .lastError ===
            null,

        message:
          "Trading-account ledger persistence is healthy.",

        reasons: [
          ...(
            accountLedger
              .writeFailures >
            0
              ? [
                  `${accountLedger.writeFailures} account-ledger write failure(s).`,
                ]
              : []
          ),

          ...(
            accountLedger
              .lastError
              ? [
                  accountLedger
                    .lastError,
                ]
              : []
          ),
        ],
      },
    );

    /*
     * ------------------------------------------------
     * RECOVERY / DUPLICATE PROTECTION
     * ------------------------------------------------
     */

    this.addGate(
      gates,

      {
        key:
          "RESTART_RECOVERY_CLEAN",

        category:
          "RECOVERY",

        requiredForV18Acceptance:
          true,

        requiredForTinyLive:
          true,

        passed:
          recovery
            .classification ===
            "CLEAN" &&
          recovery
            .allowNewLivePreparation,

        message:
          "Restart-recovery gate is CLEAN.",

        reasons:
          recovery
            .classification ===
              "CLEAN" &&
          recovery
            .allowNewLivePreparation
            ? []
            : [
                ...recovery.blockers,
              ],
      },
    );

    this.addGate(
      gates,

      {
        key:
          "NO_DUPLICATE_SUBMISSION_RISK",

        category:
          "RECOVERY",

        requiredForV18Acceptance:
          true,

        requiredForTinyLive:
          true,

        passed:
          !orderEvidence
            .duplicateSubmissionRisk,

        message:
          "No persisted duplicate-order submission risk exists.",

        reasons:
          orderEvidence
            .duplicateSubmissionRisk
            ? [
                `${orderEvidence.possibleSubmittedRealOrders} potentially submitted real order(s) require resolution.`,
              ]
            : [],
      },
    );

    this.addGate(
      gates,

      {
        key:
          "RECOVERY_RESOLUTION_PERSISTENCE",

        category:
          "RECOVERY",

        requiredForV18Acceptance:
          true,

        requiredForTinyLive:
          true,

        passed:
          recoveryResolutions
            .writeFailures ===
            0 &&
          recoveryResolutions
            .lastError ===
            null,

        message:
          "Explicit recovery-resolution persistence is healthy.",

        reasons: [
          ...(
            recoveryResolutions
              .writeFailures >
            0
              ? [
                  `${recoveryResolutions.writeFailures} recovery-resolution persistence failure(s).`,
                ]
              : []
          ),

          ...(
            recoveryResolutions
              .lastError
              ? [
                  recoveryResolutions
                    .lastError,
                ]
              : []
          ),
        ],
      },
    );

    /*
     * ------------------------------------------------
     * ACCOUNTING
     * ------------------------------------------------
     */

    this.addGate(
      gates,

      {
        key:
          "ACCOUNTING_CERTAIN",

        category:
          "ACCOUNTING",

        requiredForV18Acceptance:
          true,

        requiredForTinyLive:
          true,

        passed:
          settlement
            .accountingUncertain ===
            0 &&
          settlement
            .writeFailures ===
            0 &&
          settlement
            .lastError ===
            null,

        message:
          "Settlement/accounting persistence contains no uncertainty.",

        reasons: [
          ...(
            settlement
              .accountingUncertain >
            0
              ? [
                  `${settlement.accountingUncertain} settlement accounting transaction(s) are uncertain.`,
                ]
              : []
          ),

          ...(
            settlement
              .writeFailures >
            0
              ? [
                  `${settlement.writeFailures} settlement persistence write failure(s).`,
                ]
              : []
          ),

          ...(
            settlement
              .lastError
              ? [
                  settlement
                    .lastError,
                ]
              : []
          ),
        ],
      },
    );

    /*
     * ------------------------------------------------
     * SECURITY
     * ------------------------------------------------
     */

    this.addGate(
      gates,

      {
        key:
          "CREDENTIAL_SAFETY",

        category:
          "SECURITY",

        requiredForV18Acceptance:
          true,

        requiredForTinyLive:
          true,

        passed:
          credentials
            .allConfigured &&
          credentials
            .redaction
            .selfTestPassed,

        message:
          "API credentials are configured and secret redaction is healthy.",

        reasons:
          credentials
            .allConfigured &&
          credentials
            .redaction
            .selfTestPassed
            ? []
            : [
                ...credentials.blockers,
              ],
      },
    );

    /*
     * ------------------------------------------------
     * CLOCK
     * ------------------------------------------------
     */

    this.addGate(
      gates,

      {
        key:
          "SIGNED_REQUEST_CLOCK_SAFETY",

        category:
          "CLOCK",

        requiredForV18Acceptance:
          true,

        requiredForTinyLive:
          true,

        passed:
          clocks
            .allServerSynchronizedClocksHealthy,

        message:
          "Authoritative server-synchronized clocks are healthy.",

        reasons:
          clocks
            .allServerSynchronizedClocksHealthy
            ? []
            : [
                ...clocks.blockers,
              ],
      },
    );

    const localOnlyClocks =
      clocks
        .exchanges
        .filter(
          (
            exchange,
          ) =>
            exchange.mode ===
            "LOCAL_CLOCK_ONLY",
        );

    this.addWarningGate(
      gates,

      {
        key:
          "LOCAL_CLOCK_ONLY_EXCHANGES",

        category:
          "CLOCK",

        requiredForV18Acceptance:
          false,

        requiredForTinyLive:
          false,

        warning:
          localOnlyClocks.length >
          0,

        message:
          "Some exchanges currently rely on local system time.",

        reasons:
          localOnlyClocks.map(
            (
              exchange,
            ) =>
              `${exchange.exchange} is LOCAL_CLOCK_ONLY.`,
          ),
      },
    );

    /*
     * ------------------------------------------------
     * ALERTING
     * ------------------------------------------------
     */

    this.addGate(
      gates,

      {
        key:
          "ALERT_HISTORY_PERSISTENCE",

        category:
          "ALERTING",

        requiredForV18Acceptance:
          true,

        requiredForTinyLive:
          true,

        passed:
          alertHistory
            .persistenceHealthy,

        message:
          "Production alert lifecycle persistence is healthy.",

        reasons:
          alertHistory
            .persistenceHealthy
            ? []
            : [
                alertHistory
                  .persistence
                  .lastError ??
                "Production alert-history persistence is unhealthy.",
              ],
      },
    );

    this.addGate(
      gates,

      {
        key:
          "NO_UNRESOLVED_CRITICAL_ALERTS",

        category:
          "ALERTING",

        requiredForV18Acceptance:
          true,

        requiredForTinyLive:
          true,

        passed:
          alertHistory
            .summary
            .unresolvedCritical ===
            0 &&
          !alertHistory
            .livePromotionBlocked,

        message:
          "No unresolved CRITICAL production alerts remain.",

        reasons:
          alertHistory
            .summary
            .unresolvedCritical ===
            0 &&
          !alertHistory
            .livePromotionBlocked
            ? []
            : [
                ...alertHistory.blockers,
              ],
      },
    );

    /*
     * ------------------------------------------------
     * FAILURE-INJECTION VALIDATION
     * ------------------------------------------------
     */

    this.addGate(
      gates,

      {
        key:
          "SYNTHETIC_FAILURE_DRILLS",

        category:
          "VALIDATION",

        requiredForV18Acceptance:
          true,

        requiredForTinyLive:
          true,

        passed:
          validation
            .summary
            .allPassed &&
          validation
            .realExchangeCallsMade ===
            false &&
          validation
            .realOrdersSubmitted ===
            false &&
          validation
            .realMoneyUsed ===
            false,

        message:
          "Synthetic restart/failure-injection drills pass.",

        reasons:
          validation
            .summary
            .allPassed
            ? []
            : validation
                .drills
                .filter(
                  (
                    drill,
                  ) =>
                    drill.status ===
                    "FAIL",
                )
                .map(
                  (
                    drill,
                  ) =>
                    `${drill.key}: ${drill.error ?? "FAILED"}`,
                ),
      },
    );

    /*
     * ------------------------------------------------
     * EXECUTION EVIDENCE
     *
     * NO_DATA is not a V18 architecture failure,
     * but real tiny-LIVE readiness remains
     * blocked until sufficient operational
     * evidence exists.
     * ------------------------------------------------
     */

    const executionHealthHealthy =
      executionHealth.status ===
      "HEALTHY";

    this.addGate(
      gates,

      {
        key:
          "EXECUTION_HEALTH",

        category:
          "EXECUTION",

        requiredForV18Acceptance:
          false,

        requiredForTinyLive:
          true,

        passed:
          executionHealthHealthy,

        message:
          "Execution health has sufficient healthy operational evidence.",

        reasons:
          executionHealthHealthy
            ? []
            : [
                `Execution health status is ${executionHealth.status}.`,

                ...executionHealth
                  .reasons,
              ],
      },
    );

    /*
     * ------------------------------------------------
     * TINY-LIVE OPERATIONAL STATE
     * ------------------------------------------------
     */

    this.addGate(
      gates,

      {
        key:
          "ACCOUNT_MODE_LIVE",

        category:
          "TINY_LIVE",

        requiredForV18Acceptance:
          false,

        requiredForTinyLive:
          true,

        passed:
          account.mode ===
          "LIVE",

        message:
          "Trading account is explicitly in LIVE mode.",

        reasons:
          account.mode ===
          "LIVE"
            ? []
            : [
                `Trading account mode is currently ${account.mode}.`,
              ],
      },
    );

    this.addGate(
      gates,

      {
        key:
          "ACCOUNT_ENABLED_EMERGENCY_CLEAR",

        category:
          "TINY_LIVE",

        requiredForV18Acceptance:
          true,

        requiredForTinyLive:
          true,

        passed:
          account.enabled &&
          !account
            .emergencyStop,

        message:
          "Trading account is enabled and emergency stop is clear.",

        reasons: [
          ...(
            account.enabled
              ? []
              : [
                  "Trading account is disabled.",
                ]
          ),

          ...(
            account
              .emergencyStop
              ? [
                  "Emergency stop is active.",
                ]
              : []
          ),
        ],
      },
    );

    /*
     * Build 15 does not persist temporary fresh
     * exchange balance snapshots across restart.
     *
     * Therefore final acceptance cannot claim
     * operational tiny-LIVE readiness merely
     * because V18 architecture is complete.
     */
    const synchronizedBalances =
      tradingAccountService
        .getExchangeBalances();

    this.addGate(
      gates,

      {
        key:
          "FRESH_EXCHANGE_BALANCES_PRESENT",

        category:
          "TINY_LIVE",

        requiredForV18Acceptance:
          false,

        requiredForTinyLive:
          true,

        passed:
          synchronizedBalances.length >=
          2,

        message:
          "Fresh exchange balance snapshots are available.",

        reasons:
          synchronizedBalances.length >=
          2
            ? []
            : [
                "At least two fresh exchange balance snapshots are required immediately before tiny-LIVE execution.",
              ],
      },
    );

    /*
     * ------------------------------------------------
     * FINAL DECISION
     * ------------------------------------------------
     */

    const v18BlockingGates =
      gates.filter(
        (
          gate,
        ) =>
          gate
            .requiredForV18Acceptance &&
          gate.state ===
            "BLOCKED",
      );

    const tinyLiveBlockingGates =
      gates.filter(
        (
          gate,
        ) =>
          gate
            .requiredForTinyLive &&
          gate.state !==
            "PASS",
      );

    const v18HardeningAccepted =
      v18BlockingGates
        .length ===
      0;

    const tinyLiveOperationalReady =
      v18HardeningAccepted &&
      tinyLiveBlockingGates
        .length ===
        0;

    const passed =
      gates.filter(
        (
          gate,
        ) =>
          gate.state ===
          "PASS",
      ).length;

    const warnings =
      gates.filter(
        (
          gate,
        ) =>
          gate.state ===
          "WARNING",
      ).length;

    const blocked =
      gates.filter(
        (
          gate,
        ) =>
          gate.state ===
          "BLOCKED",
      ).length;

    return {
      generatedAt:
        Date.now(),

      version:
        "18.0",

      build:
        "16",

      finalAcceptanceGate:
        true,

      /*
       * Build 16 never turns LIVE on.
       */
      liveTradingEnabled:
        false,

      liveSubmissionAllowed:
        false,

      automaticLivePromotionAllowed:
        false,

      automaticOrderSubmissionAllowed:
        false,

      v18HardeningAccepted,

      tinyLiveOperationalReady,

      status:
        !v18HardeningAccepted
          ? "V18_NOT_ACCEPTED"
          : tinyLiveOperationalReady
            ? "V18_ACCEPTED_TINY_LIVE_READY"
            : "V18_ACCEPTED_TINY_LIVE_NOT_READY",

      summary: {
        totalGates:
          gates.length,

        passed,

        warnings,

        blocked,

        v18AcceptanceBlockers:
          v18BlockingGates.length,

        tinyLiveBlockers:
          tinyLiveBlockingGates.length,
      },

      gates,

      blockers: {
        v18Acceptance:
          v18BlockingGates
            .map(
              (
                gate,
              ) =>
                `${gate.key}: ${gate.reasons.join(" | ") || gate.message}`,
            ),

        tinyLive:
          tinyLiveBlockingGates
            .map(
              (
                gate,
              ) =>
                `${gate.key}: ${gate.reasons.join(" | ") || gate.message}`,
            ),
      },

      safety: {
        maximumTinyLiveCapital:
          500,

        minimumTinyLiveCapital:
          100,

        realOrderSubmissionImplementedByBuild16:
          false,

        realMoneyUsedByAcceptanceCheck:
          false,

        recoveryMustBeClean:
          true,

        unresolvedCriticalAlertsAllowed:
          false,

        accountingUncertaintyAllowed:
          false,

        duplicateSubmissionRiskAllowed:
          false,
      },

      notes: [
        "Version 18 Build 16 is the final V18 production-hardening acceptance aggregator.",

        "V18 hardening acceptance and immediate tiny-LIVE operational readiness are intentionally separate decisions.",

        "PAPER account mode, missing fresh balances or insufficient execution history may block tiny-LIVE readiness without invalidating completed V18 architecture.",

        "Synthetic Build 14 validation drills are rerun in isolated temporary files as part of final acceptance.",

        "No exchange order is submitted by this readiness check.",

        "No trading capital is reserved by this readiness check.",

        "No account mode is changed automatically.",

        "No LIVE promotion occurs automatically.",

        "LIVE trading and LIVE order submission remain disabled.",
      ],
    };
  }

  private addGate(
    gates:
      V18AcceptanceGate[],

    input: {
      key: string;

      category:
        V18AcceptanceGate[
          "category"
        ];

      requiredForV18Acceptance:
        boolean;

      requiredForTinyLive:
        boolean;

      passed: boolean;

      message: string;

      reasons: string[];
    },
  ): void {
    gates.push({
      key:
        input.key,

      state:
        input.passed
          ? "PASS"
          : "BLOCKED",

      category:
        input.category,

      requiredForV18Acceptance:
        input
          .requiredForV18Acceptance,

      requiredForTinyLive:
        input
          .requiredForTinyLive,

      message:
        input.message,

      reasons:
        input.passed
          ? []
          : input.reasons.length >
              0
            ? input.reasons
            : [
                input.message,
              ],
    });
  }

  private addWarningGate(
    gates:
      V18AcceptanceGate[],

    input: {
      key: string;

      category:
        V18AcceptanceGate[
          "category"
        ];

      requiredForV18Acceptance:
        boolean;

      requiredForTinyLive:
        boolean;

      warning: boolean;

      message: string;

      reasons: string[];
    },
  ): void {
    gates.push({
      key:
        input.key,

      state:
        input.warning
          ? "WARNING"
          : "PASS",

      category:
        input.category,

      requiredForV18Acceptance:
        input
          .requiredForV18Acceptance,

      requiredForTinyLive:
        input
          .requiredForTinyLive,

      message:
        input.message,

      reasons:
        input.warning
          ? input.reasons
          : [],
    });
  }
}

export const v18ProductionReadinessService =
  new V18ProductionReadinessService();