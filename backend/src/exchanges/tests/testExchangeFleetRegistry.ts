import {
  CAT_PRO_TARGET_EXCHANGES,
  ExchangeFleetRegistry,
} from "../core/ExchangeFleetRegistry";

function assertCondition(
  condition: boolean,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(
      message,
    );
  }
}

async function main():
  Promise<void> {
  const registry =
    new ExchangeFleetRegistry({
      getMarketDataAdapters:
        () => [
          {
            name:
              "CoinDCX",

            connected:
              true,
          },

          {
            name:
              "Binance",

            connected:
              true,
          },

          {
            name:
              "Bybit",

            connected:
              true,
          },

          {
            name:
              "UnoCoin",

            connected:
              true,
          },

          {
            name:
              "CoinSwitch",

            connected:
              true,
          },

          {
            name:
              "ZebPay",

            connected:
              true,
          },
        ],

      hasMarketRuleProvider:
        (exchange) =>
          [
            "coindcx",
            "binance",
            "bybit",
            "coinswitch",
            "unocoin",
            "zebpay",
          ].includes(
            exchange,
          ),

      getMonitoredReadExchanges:
        () => [
          "coindcx",
          "binance",
          "bybit",
          "unocoin",
          "coinswitch",
          "zebpay",
        ],

      getReadStatus:
        (exchange) => ({
          credentialsConfigured:
            exchange !==
            "bybit",

          verificationState:
            exchange ===
              "coindcx"
              ? "VERIFIED"
              : exchange ===
                  "zebpay"
                ? "VERIFIED"
              : exchange ===
                  "binance"
                ? "CONFIGURED_UNVERIFIED"
                : "NOT_CONFIGURED",

          readOnlyVerificationFresh:
            exchange ===
              "coindcx" ||
            exchange ===
              "zebpay",
        }),

      getClockStates:
        () => [
          {
            exchange:
              "coindcx",

            signedRequestAllowed:
              true,
          },

          {
            exchange:
              "binance",

            signedRequestAllowed:
              false,
          },

          {
            exchange:
              "bybit",

            signedRequestAllowed:
              false,
          },

          {
            exchange:
              "coinswitch",

            signedRequestAllowed:
              false,
          },

          {
            exchange:
              "unocoin",

            signedRequestAllowed:
              true,
          },
        ],

      hasLiveOrderAdapter:
        (exchange) =>
          [
            "coindcx",
            "binance",
          ].includes(
            exchange,
          ),

      getPaperEligibleMarketCount:
        (exchange) =>
          exchange ===
            "zebpay"
            ? 3
            : 0,
    });

  const report =
    registry.getReport();

  assertCondition(
    report.version ===
      "19.28" &&
      report.targetExchangeCount ===
        5 &&
      report.exchanges.length ===
        5 &&
      report.exchanges
        .map(
          (exchange) =>
            exchange.exchange,
        )
        .every(
          (
            exchange,
            index,
          ) =>
            exchange ===
            CAT_PRO_TARGET_EXCHANGES[
              index
            ],
        ),
    "Fleet registry must expose the exact authoritative five-exchange target.",
  );

  assertCondition(
    report.summary
      .marketDataImplemented ===
      5 &&
      report.summary
        .marketDataConnected ===
        5 &&
      report.summary
        .marketRuleProviders ===
        5 &&
      report.summary
        .authenticatedReadMonitored ===
        5 &&
      report.summary
        .verifiedReadAccess ===
        1 &&
      report.summary
        .liveOrderAdapters ===
        2,
    "Fleet summary must be derived from implementation and runtime evidence.",
  );

  assertCondition(
    report.observationExchangeCount ===
      1 &&
      report.observationExchanges.length ===
        1 &&
      report.observationExchanges[0]
        ?.exchange ===
        "zebpay" &&
      report.observationExchanges[0]
        ?.marketData.connected &&
      report.observationExchanges[0]
        ?.marketRules.providerRegistered &&
      report.observationExchanges[0]
        ?.authenticatedRead.monitored &&
      report.observationExchanges[0]
        ?.authenticatedRead.verificationState ===
        "VERIFIED" &&
      report.observationExchanges[0]
        ?.authenticatedRead.fresh &&
      !report.observationExchanges[0]
        ?.liveOrderAdapter.adapterRegistered &&
      report.observationSummary
        .marketDataConnected ===
        1 &&
      report.observationSummary
        .executionEligible ===
        1 &&
      report.observationSummary
        .paperEligibleMarkets ===
        3,
    "ZebPay PAPER eligibility must be evidence-derived without changing five-exchange LIVE readiness or exposing private execution capability.",
  );

  const bybit =
    report.exchanges.find(
      (exchange) =>
        exchange.exchange ===
        "bybit",
    );

  assertCondition(
    bybit !==
      undefined &&
      bybit.marketData
        .implementationState ===
        "IMPLEMENTED" &&
      bybit.authenticatedRead
        .monitored &&
      bybit.marketRules
        .providerRegistered &&
      !bybit.liveOrderAdapter
        .adapterRegistered,
    "Bybit must report public market-rule and authenticated-read implementation without invented LIVE order capability.",
  );

  const unocoin =
    report.exchanges.find(
      (exchange) =>
        exchange.exchange ===
        "unocoin",
    );

  assertCondition(
    unocoin !==
      undefined &&
      unocoin.marketData
        .implementationState ===
        "IMPLEMENTED" &&
      unocoin.marketData
        .adapterRegistered &&
      unocoin.marketData
        .connected &&
      unocoin.marketRules
        .providerRegistered &&
      unocoin.authenticatedRead
        .monitored &&
      unocoin.authenticatedRead
        .implementationState ===
        "IMPLEMENTED" &&
      unocoin.authenticatedRead
        .verificationState ===
        "NOT_CONFIGURED" &&
      unocoin.clockSafety
        .monitored &&
      unocoin.clockSafety
        .signedRequestAllowed ===
        true &&
      !unocoin.liveOrderAdapter
        .adapterRegistered,
    "UnoCoin must report public market/provider and bearer-token read monitoring without invented LIVE capability.",
  );

  const coinswitch =
    report.exchanges.find(
      (exchange) =>
        exchange.exchange ===
        "coinswitch",
    );

  assertCondition(
    coinswitch !==
      undefined &&
      coinswitch.marketData
        .implementationState ===
        "IMPLEMENTED" &&
      coinswitch.marketData
        .adapterRegistered &&
      coinswitch.marketData
        .connected &&
      coinswitch.marketRules
        .providerRegistered &&
      coinswitch.authenticatedRead
        .monitored &&
      !coinswitch.liveOrderAdapter
        .adapterRegistered,
    "CoinSwitch must report public market/provider implementation without invented authenticated or LIVE capability.",
  );

  assertCondition(
    !report.liveTradingEnabled &&
      !report.liveSubmissionAllowed &&
      report.exchanges.every(
        (exchange) =>
          !exchange.liveOrderAdapter
            .liveExecutionEnabled &&
          !exchange.liveOrderAdapter
            .adapterConnected,
      ),
    "Fleet capability reporting must never enable LIVE execution.",
  );

  console.log(
    "EXCHANGE FLEET REGISTRY TEST PASSED.",
  );

  console.log(
    "No external request or order was submitted.",
  );
}

void main().catch(
  (error: unknown) => {
    console.error(
      "[Exchange Fleet Registry Test]",
      error instanceof Error
        ? error.message
        : error,
    );

    process.exitCode =
      1;
  },
);
