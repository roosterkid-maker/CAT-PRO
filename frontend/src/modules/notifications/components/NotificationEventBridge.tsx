import {
  useEffect,
  useRef,
} from "react";

import {
  useOpportunities,
} from "@/modules/arbitrage/hooks/useOpportunities";

import {
  useExecutionHealth,
  useRecentExecutions,
} from "@/modules/execution-monitoring/hooks/useExecutionMonitoring";

import {
  useNotificationPreferences,
} from "../store/useNotificationPreferences";

import {
  useNotificationStore,
} from "../store/useNotificationStore";

const INITIAL_LOAD_DELAY_MS =
  3_000;

const OPPORTUNITY_ROUTE_ALERT_COOLDOWN_MS =
  30_000;

const OPPORTUNITY_ROUTE_ALERT_RETENTION_MS =
  10 * 60_000;

export function NotificationEventBridge() {
  const pushNotification =
    useNotificationStore(
      (state) =>
        state.pushNotification,
    );

  const dismissNotification =
    useNotificationStore(
      (state) =>
        state.dismissNotification,
    );

  const opportunityAlerts =
    useNotificationPreferences(
      (state) =>
        state.opportunityAlerts,
    );

  const executionSuccessAlerts =
    useNotificationPreferences(
      (state) =>
        state.executionSuccessAlerts,
    );

  const executionFailureAlerts =
    useNotificationPreferences(
      (state) =>
        state.executionFailureAlerts,
    );

  const exchangeConnectionAlerts =
    useNotificationPreferences(
      (state) =>
        state.exchangeConnectionAlerts,
    );

  const opportunityQuery =
    useOpportunities(
      opportunityAlerts,
    );

  const healthQuery =
    useExecutionHealth(
      exchangeConnectionAlerts,
    );

  const historyQuery =
    useRecentExecutions(
      20,
      executionSuccessAlerts ||
        executionFailureAlerts,
    );

  const initializedRef =
    useRef(false);

  const initializationTimerRef =
    useRef<number | null>(
      null,
    );

  const activeOpportunityRouteKeysRef =
    useRef(
      new Set<string>(),
    );

  const opportunityToastIdsRef =
    useRef(
      new Map<string, string>(),
    );

  const lastOpportunityAlertAtRef =
    useRef(
      new Map<string, number>(),
    );

  const knownExecutionIdsRef =
    useRef(
      new Set<string>(),
    );

  const previousExchangeVerificationRef =
    useRef(
      new Map<string, boolean>(),
    );

  useEffect(() => {
    initializationTimerRef.current =
      window.setTimeout(
        () => {
          initializedRef.current =
            true;
        },
        INITIAL_LOAD_DELAY_MS,
      );

    return () => {
      if (
        initializationTimerRef.current !==
        null
      ) {
        window.clearTimeout(
          initializationTimerRef.current,
        );
      }
    };
  }, []);

  useEffect(() => {
    const opportunities =
      opportunityQuery.data?.data ??
      [];

    const now =
      Date.now();

    const currentExecuteRouteKeys =
      new Set<string>();

    for (
      const opportunity
      of opportunities
    ) {
      if (
        opportunity.decision ===
        "EXECUTE"
      ) {
        currentExecuteRouteKeys.add(
          buildOpportunityRouteKey(
            opportunity.market,
            opportunity.buyExchange,
            opportunity.sellExchange,
          ),
        );
      }
    }

    for (
      const previousRouteKey
      of activeOpportunityRouteKeysRef.current
    ) {
      if (
        currentExecuteRouteKeys.has(
          previousRouteKey,
        )
      ) {
        continue;
      }

      const toastId =
        opportunityToastIdsRef.current.get(
          previousRouteKey,
        );

      if (toastId) {
        dismissNotification(
          toastId,
        );

        opportunityToastIdsRef.current.delete(
          previousRouteKey,
        );
      }
    }

    const notifiedThisCycle =
      new Set<string>();

    for (
      const opportunity
      of opportunities
    ) {
      const routeKey =
        buildOpportunityRouteKey(
          opportunity.market,
          opportunity.buyExchange,
          opportunity.sellExchange,
        );

      const alreadyActive =
        activeOpportunityRouteKeysRef.current.has(
          routeKey,
        );

      const lastAlertAt =
        lastOpportunityAlertAtRef.current.get(
          routeKey,
        ) ?? 0;

      if (
        !initializedRef.current ||
        opportunity.decision !==
          "EXECUTE" ||
        !opportunityAlerts ||
        alreadyActive ||
        notifiedThisCycle.has(
          routeKey,
        ) ||
        now - lastAlertAt <
          OPPORTUNITY_ROUTE_ALERT_COOLDOWN_MS
      ) {
        continue;
      }

      const toastId =
        pushNotification({
        title:
          `${opportunity.market} PAPER opportunity`,

        message:
          `Observed ${formatSignalTime(
            opportunity.timestamp,
          )} IST. Buy on ${formatExchange(
            opportunity.buyExchange,
          )}, sell on ${formatExchange(
            opportunity.sellExchange,
          )}. Estimated net return ${opportunity.netProfitPercent.toFixed(
            3,
          )}%.`,

        severity:
          "success",

        durationMs:
          8_000,
      });

      notifiedThisCycle.add(
        routeKey,
      );

      lastOpportunityAlertAtRef.current.set(
        routeKey,
        now,
      );

      opportunityToastIdsRef.current.set(
        routeKey,
        toastId,
      );
    }

    activeOpportunityRouteKeysRef.current =
      currentExecuteRouteKeys;

    for (
      const [
        routeKey,
        lastAlertAt,
      ]
      of lastOpportunityAlertAtRef.current
    ) {
      if (
        !currentExecuteRouteKeys.has(
          routeKey,
        ) &&
        now - lastAlertAt >
          OPPORTUNITY_ROUTE_ALERT_RETENTION_MS
      ) {
        lastOpportunityAlertAtRef.current.delete(
          routeKey,
        );

        opportunityToastIdsRef.current.delete(
          routeKey,
        );
      }
    }
  }, [
    dismissNotification,
    opportunityAlerts,
    opportunityQuery.data,
    pushNotification,
  ]);

  useEffect(() => {
    const executions =
      historyQuery.data
        ?.executions ??
      [];

    for (
      const execution
      of executions
    ) {
      const alreadyKnown =
        knownExecutionIdsRef.current.has(
          execution.id,
        );

      knownExecutionIdsRef.current.add(
        execution.id,
      );

      if (
        !initializedRef.current ||
        alreadyKnown
      ) {
        continue;
      }

      switch (
        execution.status
      ) {
        case "FILLED":
          if (
            !executionSuccessAlerts
          ) {
            break;
          }

          pushNotification({
            title:
              `${execution.market} order filled`,

            message:
              `${formatExchange(
                execution.exchange,
              )} ${execution.side.toUpperCase()} order filled: ${formatNumber(
                execution.filledQuantity,
              )} units.`,

            severity:
              "success",

            durationMs:
              6_000,
          });

          break;

        case "TIMED_OUT":
          if (
            !executionFailureAlerts
          ) {
            break;
          }

          pushNotification({
            title:
              `${execution.market} execution timeout`,

            message:
              execution.failureReason ??
              execution.message ??
              `${formatExchange(
                execution.exchange,
              )} order timed out.`,

            severity:
              "warning",

            durationMs:
              8_000,
          });

          break;

        case "FAILED":
        case "REJECTED":
          if (
            !executionFailureAlerts
          ) {
            break;
          }

          pushNotification({
            title:
              `${execution.market} execution failed`,

            message:
              execution.failureReason ??
              execution.message ??
              `${formatExchange(
                execution.exchange,
              )} execution was not completed.`,

            severity:
              "error",

            durationMs:
              10_000,
          });

          break;

        case "CANCELLED":
          if (
            !executionFailureAlerts
          ) {
            break;
          }

          pushNotification({
            title:
              `${execution.market} order cancelled`,

            message:
              execution.message ??
              `${formatExchange(
                execution.exchange,
              )} order was cancelled.`,

            severity:
              "warning",

            durationMs:
              7_000,
          });

          break;

        default:
          break;
      }
    }
  }, [
    executionFailureAlerts,
    executionSuccessAlerts,
    historyQuery.data,
    pushNotification,
  ]);

  useEffect(() => {
    const exchanges =
      healthQuery.data
        ?.exchanges ??
      [];

    for (
      const exchange
      of exchanges
    ) {
      const exchangeKey =
        exchange.exchange
          .trim()
          .toLowerCase();

      const readVerificationFresh =
        exchange.authenticationVerified &&
        exchange.exchangeApiReachable &&
        exchange.readOnlyVerificationFresh;

      const previousVerification =
        previousExchangeVerificationRef
          .current
          .get(
            exchangeKey,
          );

      previousExchangeVerificationRef
        .current
        .set(
          exchangeKey,
          readVerificationFresh,
        );

      if (
        !initializedRef.current ||
        previousVerification ===
          undefined ||
        previousVerification ===
          readVerificationFresh
      ) {
        continue;
      }

      if (
        !exchangeConnectionAlerts
      ) {
        continue;
      }

      if (
        readVerificationFresh
      ) {
        pushNotification({
          title:
            `${formatExchange(
              exchange.exchange,
            )} read verification restored`,

          message:
            "Authenticated read-only API access is fresh. LIVE execution remains disabled.",

          severity:
            "success",

          durationMs:
            6_000,
        });
      } else {
        pushNotification({
          title:
            `${formatExchange(
              exchange.exchange,
            )} read verification lost`,

          message:
            "Fresh authenticated read-only API evidence is unavailable. LIVE execution remains disabled.",

          severity:
            "error",

          durationMs:
            10_000,
        });
      }
    }
  }, [
    exchangeConnectionAlerts,
    healthQuery.data,
    pushNotification,
  ]);

  return null;
}

function formatExchange(
  exchange: string,
): string {
  const normalized =
    exchange
      .trim()
      .toLowerCase();

  if (
    normalized ===
    "coindcx"
  ) {
    return "CoinDCX";
  }

  if (
    normalized ===
    "binance"
  ) {
    return "Binance";
  }

  if (
    normalized ===
    "bybit"
  ) {
    return "Bybit";
  }

  if (
    normalized ===
    "unocoin"
  ) {
    return "UnoCoin";
  }

  if (
    normalized ===
    "coinswitch"
  ) {
    return "CoinSwitch";
  }

  return exchange;
}

function buildOpportunityRouteKey(
  market: string,
  buyExchange: string,
  sellExchange: string,
): string {
  return [
    market,
    buyExchange,
    sellExchange,
  ]
    .map(
      (value) =>
        value
          .trim()
          .toLowerCase(),
    )
    .join("|");
}

function formatSignalTime(
  timestamp: number,
): string {
  return new Date(
    timestamp,
  ).toLocaleTimeString(
    "en-IN",
    {
      timeZone:
        "Asia/Kolkata",
      hour:
        "2-digit",
      minute:
        "2-digit",
      second:
        "2-digit",
      hour12:
        false,
    },
  );
}

function formatNumber(
  value: number,
): string {
  if (
    !Number.isFinite(
      value,
    )
  ) {
    return "0";
  }

  return new Intl.NumberFormat(
    "en-IN",
    {
      maximumFractionDigits:
        8,
    },
  ).format(
    value,
  );
}
