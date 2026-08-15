import {
  productionAlertHistoryService,
} from "../alerts/ProductionAlertHistoryService";

import {
  liveExecutionService,
} from "../LiveExecutionService";

import {
  executionRestartRecoveryGateService,
} from "../recovery/ExecutionRestartRecoveryGateService";

import {
  credentialSafetyService,
} from "../security/CredentialSafetyService";

import {
  exchangeClockSafetyService,
} from "../time/ExchangeClockSafetyService";

import {
  tradingAccountService,
} from "../../../trading/account/TradingAccountService";

import type {
  TinyLivePreflightGate,
  TinyLivePreflightReport,
  TinyLivePreflightRequest,
} from "./TinyLivePreflight";

const MINIMUM_TINY_LIVE_CAPITAL =
  100;

const MAXIMUM_TINY_LIVE_CAPITAL =
  500;

/*
 * IMPORTANT:
 *
 * This token authorizes PRE-FLIGHT evaluation
 * only.
 *
 * It does NOT authorize an exchange order.
 */
const REQUIRED_PREFLIGHT_CONFIRMATION =
  "RUN_TINY_LIVE_PREFLIGHT_ONLY";

export class TinyLivePreflightService {
  evaluate(
    request:
      TinyLivePreflightRequest,
  ): TinyLivePreflightReport {
    const gates:
      TinyLivePreflightGate[] =
      [];

    const requestedCapital =
      Number(
        request.requestedCapital,
      );

    const market =
      request.market
        .trim()
        .toUpperCase();

    const buyExchange =
      request.buyExchange
        .trim()
        .toLowerCase();

    const sellExchange =
      request.sellExchange
        .trim()
        .toLowerCase();

    const account =
      tradingAccountService
        .getAccount();

    const recovery =
      executionRestartRecoveryGateService
        .getReport();

    const alertHistory =
      productionAlertHistoryService
        .getReport();

    const credentialSafety =
      credentialSafetyService
        .getReport();

    const clockSafety =
      exchangeClockSafetyService
        .getReport();

    /*
     * ------------------------------------------------
     * REQUEST VALIDITY
     * ------------------------------------------------
     */

    this.addGate(
      gates,

      "REQUEST_VALID",

      Number.isFinite(
        requestedCapital,
      ) &&
        requestedCapital >
          0 &&
        market.length >
          0 &&
        buyExchange.length >
          0 &&
        sellExchange.length >
          0 &&
        buyExchange !==
          sellExchange,

      "Tiny-LIVE preflight request is structurally valid.",

      [
        ...(
          !Number.isFinite(
            requestedCapital,
          ) ||
          requestedCapital <=
            0
            ? [
                "requestedCapital must be a positive finite number.",
              ]
            : []
        ),

        ...(
          !market
            ? [
                "market is required.",
              ]
            : []
        ),

        ...(
          !buyExchange
            ? [
                "buyExchange is required.",
              ]
            : []
        ),

        ...(
          !sellExchange
            ? [
                "sellExchange is required.",
              ]
            : []
        ),

        ...(
          buyExchange &&
          sellExchange &&
          buyExchange ===
            sellExchange
            ? [
                "Tiny-LIVE arbitrage requires different buy and sell exchanges.",
              ]
            : []
        ),
      ],
    );

    /*
     * ------------------------------------------------
     * HARD CAPITAL RANGE
     * ------------------------------------------------
     */

    this.addGate(
      gates,

      "TINY_LIVE_CAPITAL_RANGE",

      Number.isFinite(
        requestedCapital,
      ) &&
        requestedCapital >=
          MINIMUM_TINY_LIVE_CAPITAL &&
        requestedCapital <=
          MAXIMUM_TINY_LIVE_CAPITAL,

      `Requested capital must remain within ₹${MINIMUM_TINY_LIVE_CAPITAL}–₹${MAXIMUM_TINY_LIVE_CAPITAL}.`,

      Number.isFinite(
        requestedCapital,
      ) &&
      requestedCapital >=
        MINIMUM_TINY_LIVE_CAPITAL &&
      requestedCapital <=
        MAXIMUM_TINY_LIVE_CAPITAL
        ? []
        : [
            `Requested capital ₹${requestedCapital} violates the hard ₹${MINIMUM_TINY_LIVE_CAPITAL}–₹${MAXIMUM_TINY_LIVE_CAPITAL} tiny-LIVE range.`,
          ],
    );

    /*
     * ------------------------------------------------
     * EXPLICIT PREFLIGHT CONFIRMATION
     * ------------------------------------------------
     */

    this.addGate(
      gates,

      "PREFLIGHT_CONFIRMATION",

      request
        .confirmationToken
        .trim() ===
        REQUIRED_PREFLIGHT_CONFIRMATION,

      "Explicit tiny-LIVE preflight confirmation is present.",

      request
        .confirmationToken
        .trim() ===
        REQUIRED_PREFLIGHT_CONFIRMATION
        ? []
        : [
            `confirmationToken must equal ${REQUIRED_PREFLIGHT_CONFIRMATION}.`,
          ],
    );

    /*
     * ------------------------------------------------
     * ACCOUNT MODE
     * ------------------------------------------------
     */

    this.addGate(
      gates,

      "ACCOUNT_MODE_LIVE",

      account.mode ===
      "LIVE",

      "Trading account must explicitly be in LIVE mode.",

      account.mode ===
      "LIVE"
        ? []
        : [
            `Current trading account mode is ${account.mode}.`,
          ],
    );

    this.addGate(
      gates,

      "ACCOUNT_ENABLED",

      account.enabled,

      "Trading account is enabled.",

      account.enabled
        ? []
        : [
            "Trading account is disabled.",
          ],
    );

    this.addGate(
      gates,

      "EMERGENCY_STOP_CLEAR",

      !account.emergencyStop,

      "Emergency stop is clear.",

      account.emergencyStop
        ? [
            "Emergency stop is active.",
          ]
        : [],
    );

    /*
     * ------------------------------------------------
     * INTERNAL CAPITAL
     * ------------------------------------------------
     */

    const accountCapitalCheck =
      tradingAccountService
        .evaluateTrade(
          requestedCapital,
        );

    this.addGate(
      gates,

      "ACCOUNT_CAPITAL_AVAILABLE",

      accountCapitalCheck
        .approved,

      "Internal trading-account capital and limits permit this tiny-LIVE amount.",

      accountCapitalCheck
        .reasons,
    );

    /*
     * ------------------------------------------------
     * DAILY LOSS
     * ------------------------------------------------
     */

    this.addGate(
      gates,

      "DAILY_LOSS_LIMIT",

      account.todayLoss <
      account
        .limits
        .maximumDailyLoss,

      "Daily loss limit has not been reached.",

      account.todayLoss <
      account
        .limits
        .maximumDailyLoss
        ? []
        : [
            `Today loss ${account.todayLoss} reached maximum daily loss ${account.limits.maximumDailyLoss}.`,
          ],
    );

    /*
     * ------------------------------------------------
     * RESTART RECOVERY
     * ------------------------------------------------
     */

    this.addGate(
      gates,

      "RESTART_RECOVERY_CLEAN",

      recovery.classification ===
        "CLEAN" &&
        recovery
          .allowNewLivePreparation,

      "Restart-recovery state is CLEAN.",

      recovery.classification ===
        "CLEAN" &&
      recovery
        .allowNewLivePreparation
        ? []
        : [
            ...recovery.blockers,
          ],
    );

    /*
     * ------------------------------------------------
     * PERSISTENT CRITICAL ALERTS
     * ------------------------------------------------
     */

    this.addGate(
      gates,

      "NO_UNRESOLVED_CRITICAL_ALERT",

      !alertHistory
        .livePromotionBlocked &&
        alertHistory
          .summary
          .unresolvedCritical ===
          0,

      "No unresolved CRITICAL production alert blocks LIVE promotion.",

      !alertHistory
        .livePromotionBlocked &&
      alertHistory
        .summary
        .unresolvedCritical ===
        0
        ? []
        : [
            ...alertHistory.blockers,
          ],
    );

    /*
     * ------------------------------------------------
     * CREDENTIALS
     * ------------------------------------------------
     */

    const requiredCredentialStates =
      credentialSafety
        .exchanges
        .filter(
          (
            exchange,
          ) =>
            exchange.exchange ===
              buyExchange ||
            exchange.exchange ===
              sellExchange,
        );

    const credentialsHealthy =
      requiredCredentialStates
        .length ===
        2 &&
      requiredCredentialStates
        .every(
          (
            exchange,
          ) =>
            exchange.configured,
        ) &&
      credentialSafety
        .redaction
        .selfTestPassed;

    this.addGate(
      gates,

      "CREDENTIALS_CONFIGURED",

      credentialsHealthy,

      "Both execution exchanges have configured credentials and redaction safety is healthy.",

      credentialsHealthy
        ? []
        : [
            ...(
              requiredCredentialStates
                .length !==
              2
                ? [
                    "Credential diagnostics do not contain both requested exchanges.",
                  ]
                : []
            ),

            ...requiredCredentialStates
              .filter(
                (
                  exchange,
                ) =>
                  !exchange
                    .configured,
              )
              .map(
                (
                  exchange,
                ) =>
                  `${exchange.exchange} credentials are not configured.`,
              ),

            ...(
              credentialSafety
                .redaction
                .selfTestPassed
                ? []
                : [
                    "Sensitive-data redaction self-test failed.",
                  ]
            ),
          ],
    );

    /*
     * ------------------------------------------------
     * EXECUTION ADAPTERS
     * ------------------------------------------------
     */

    const adapterStates =
      liveExecutionService
        .getExchangeStatuses(
          [
            buyExchange,
            sellExchange,
          ],
        );

    const adaptersHealthy =
      adapterStates.length ===
        2 &&
      adapterStates.every(
        (
          adapter,
        ) =>
          adapter
            .adapterRegistered &&
          adapter
            .adapterConnected,
      );

    this.addGate(
      gates,

      "EXECUTION_ADAPTER_CONNECTIVITY",

      adaptersHealthy,

      "Both execution adapters have explicit LIVE execution availability.",

      adaptersHealthy
        ? []
        : adapterStates
            .filter(
              (
                adapter,
              ) =>
                !adapter
                  .adapterRegistered ||
                !adapter
                  .adapterConnected,
            )
            .map(
              (
                adapter,
              ) =>
                `${adapter.exchange}: registered=${adapter.adapterRegistered}, configured=${adapter.credentialsConfigured}, verification=${adapter.verificationState}, authenticated=${adapter.authenticationVerified}, apiReachable=${adapter.exchangeApiReachable}, liveEnabled=${adapter.liveExecutionEnabled}.`,
            ),
    );

    /*
     * ------------------------------------------------
     * CLOCK SAFETY
     * ------------------------------------------------
     */

    const clockStates =
      clockSafety
        .exchanges
        .filter(
          (
            exchange,
          ) =>
            exchange.exchange ===
              buyExchange ||
            exchange.exchange ===
              sellExchange,
        );

    const unsafeServerClocks =
      clockStates
        .filter(
          (
            exchange,
          ) =>
            exchange.mode ===
              "SERVER_SYNCHRONIZED" &&
            !exchange
              .signedRequestAllowed,
        );

    this.addGate(
      gates,

      "SIGNED_REQUEST_CLOCK_SAFETY",

      unsafeServerClocks.length ===
        0,

      "Authoritative server-synchronized exchange clocks are safe for signed requests.",

      unsafeServerClocks.map(
        (
          exchange,
        ) =>
          `${exchange.exchange}: ${exchange.reasons.join(" | ")}`,
      ),
    );

    /*
     * ------------------------------------------------
     * FRESH EXCHANGE BALANCES
     * ------------------------------------------------
     */

    const balanceRequirements =
      Array.isArray(
        request.balanceRequirements,
      )
        ? request
            .balanceRequirements
        : [];

    const balanceReasons:
      string[] = [];

    if (
      balanceRequirements.length <
      2
    ) {
      balanceReasons.push(
        "At least two explicit fresh exchange-balance requirements are required.",
      );
    }

    for (
      const requirement
      of balanceRequirements
    ) {
      const result =
        tradingAccountService
          .evaluateExchangeBalance({
            exchange:
              requirement.exchange,

            asset:
              requirement.asset,

            requiredAmount:
              requirement.requiredAmount,

            maximumAgeMs:
              requirement.maximumAgeMs,
          });

      if (
        !result.approved
      ) {
        balanceReasons.push(
          `${result.exchange}:${result.asset} - ${result.reasons.join(" | ")}`,
        );
      }
    }

    this.addGate(
      gates,

      "FRESH_EXCHANGE_BALANCES",

      balanceRequirements.length >=
        2 &&
        balanceReasons.length ===
          0,

      "Required buy/sell exchange balances are present, fresh and sufficient.",

      balanceReasons,
    );

    /*
     * ------------------------------------------------
     * FINAL RESULT
     * ------------------------------------------------
     */

    const blockers =
      gates
        .filter(
          (
            gate,
          ) =>
            gate.state ===
            "BLOCKED",
        )
        .flatMap(
          (
            gate,
          ) =>
            gate.reasons.length >
              0
              ? gate.reasons.map(
                  (
                    reason,
                  ) =>
                    `${gate.key}: ${reason}`,
                )
              : [
                  `${gate.key}: ${gate.message}`,
                ],
        );

    return {
      generatedAt:
        Date.now(),

      version:
        "18.0",

      build:
        "15",

      mode:
        "TINY_LIVE_PREFLIGHT",

      preflightOnly:
        true,

      liveOrderSubmissionPerformed:
        false,

      capitalReserved:
        false,

      liveSessionCreated:
        false,

      approved:
        blockers.length ===
        0,

      requestedCapital,

      hardCapitalRange: {
        minimum:
          100,

        maximum:
          500,

        currency:
          "INR",
      },

      market,

      buyExchange,

      sellExchange,

      gates,

      blockers,

      safety: {
        automaticOrderSubmissionAllowed:
          false,

        automaticCapitalReservationAllowed:
          false,

        automaticCancelAllowed:
          false,

        automaticHedgeAllowed:
          false,

        automaticUnwindAllowed:
          false,

        preflightConfirmationRequired:
          true,
      },

      notes: [
        "Version 18 Build 15 performs tiny-LIVE eligibility preflight only.",

        "Passing this report does not submit an exchange order.",

        "Passing this report does not reserve trading capital or create a LIVE execution session.",

        "₹500 is an absolute Build 15 tiny-LIVE ceiling.",

        "Fresh exchange balance requirements must be supplied explicitly and must pass TradingAccountService freshness checks.",

        "Persistent CRITICAL alerts and restart-recovery evidence remain fail-closed.",

        "Actual controlled tiny-LIVE order submission remains deferred.",
      ],
    };
  }

  private addGate(
    gates:
      TinyLivePreflightGate[],

    key:
      string,

    passed:
      boolean,

    message:
      string,

    reasons:
      string[],
  ): void {
    gates.push({
      key,

      state:
        passed
          ? "PASS"
          : "BLOCKED",

      required:
        true,

      message,

      reasons:
        passed
          ? []
          : reasons.length >
              0
            ? reasons
            : [
                message,
              ],
    });
  }
}

export const tinyLivePreflightService =
  new TinyLivePreflightService();
