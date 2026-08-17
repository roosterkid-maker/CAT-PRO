import {
  exchangeCapabilityService,
} from "../../execution/capabilities/services/ExchangeCapabilityService";

import {
  liveExecutionService,
} from "../../execution/live/LiveExecutionService";

import {
  exchangeClockSafetyService,
} from "../../execution/live/time/ExchangeClockSafetyService";

import {
  exchangeManager,
} from "./ExchangeManager";

export const CAT_PRO_TARGET_EXCHANGES = [
  "coindcx",
  "binance",
  "bybit",
  "unocoin",
  "coinswitch",
] as const;

export type CatProTargetExchange =
  typeof CAT_PRO_TARGET_EXCHANGES[number];

export type ExchangeCapabilityImplementationState =
  | "IMPLEMENTED"
  | "DOCUMENTED_NOT_IMPLEMENTED";

interface ExchangeFleetDefinition {
  exchange:
    CatProTargetExchange;

  displayName: string;

  officialDocumentationUrl: string;

  marketDataImplemented: boolean;
}

export interface ExchangeFleetCapability {
  exchange:
    CatProTargetExchange;

  displayName: string;

  officialDocumentationUrl: string;

  marketData: {
    implementationState:
      ExchangeCapabilityImplementationState;

    adapterRegistered: boolean;

    connected: boolean;
  };

  marketRules: {
    implementationState:
      ExchangeCapabilityImplementationState;

    providerRegistered: boolean;
  };

  authenticatedRead: {
    implementationState:
      ExchangeCapabilityImplementationState;

    monitored: boolean;

    credentialsConfigured: boolean;

    verificationState:
      | "NOT_CONFIGURED"
      | "CONFIGURED_UNVERIFIED"
      | "VERIFICATION_STALE"
      | "VERIFIED";

    fresh: boolean;
  };

  clockSafety: {
    implementationState:
      ExchangeCapabilityImplementationState;

    monitored: boolean;

    signedRequestAllowed:
      boolean | null;
  };

  liveOrderAdapter: {
    implementationState:
      ExchangeCapabilityImplementationState;

    adapterRegistered: boolean;

    liveExecutionEnabled: false;

    adapterConnected: false;
  };
}

export interface ExchangeFleetCapabilityReport {
  generatedAt: number;

  version: "19.27";

  targetExchangeCount: 5;

  liveTradingEnabled: false;

  liveSubmissionAllowed: false;

  summary: {
    marketDataImplemented: number;

    marketDataConnected: number;

    marketRuleProviders: number;

    authenticatedReadMonitored: number;

    verifiedReadAccess: number;

    liveOrderAdapters: number;
  };

  exchanges:
    ExchangeFleetCapability[];

  notes: string[];
}

export interface ExchangeFleetRegistryDependencies {
  getMarketDataAdapters():
    Array<{
      name: string;

      connected: boolean;
    }>;

  hasMarketRuleProvider(
    exchange: string,
  ): boolean;

  getMonitoredReadExchanges():
    string[];

  getReadStatus(
    exchange: string,
  ): {
    credentialsConfigured: boolean;

    verificationState:
      ExchangeFleetCapability[
        "authenticatedRead"
      ]["verificationState"];

    readOnlyVerificationFresh: boolean;
  };

  getClockStates():
    Array<{
      exchange: string;

      signedRequestAllowed: boolean;
    }>;

  hasLiveOrderAdapter(
    exchange: string,
  ): boolean;
}

const FLEET_DEFINITIONS:
  readonly ExchangeFleetDefinition[] = [
  {
    exchange:
      "coindcx",

    displayName:
      "CoinDCX",

    officialDocumentationUrl:
      "https://docs.coindcx.com/",

    marketDataImplemented:
      true,
  },

  {
    exchange:
      "binance",

    displayName:
      "Binance",

    officialDocumentationUrl:
      "https://developers.binance.com/docs/binance-spot-api-docs/rest-api",

    marketDataImplemented:
      true,
  },

  {
    exchange:
      "bybit",

    displayName:
      "Bybit",

    officialDocumentationUrl:
      "https://bybit-exchange.github.io/docs/v5/intro",

    marketDataImplemented:
      true,
  },

  {
    exchange:
      "unocoin",

    displayName:
      "UnoCoin",

    officialDocumentationUrl:
      "https://unocoin.com/in/support/api-documentation/",

    marketDataImplemented:
      true,
  },

  {
    exchange:
      "coinswitch",

    displayName:
      "CoinSwitch",

    officialDocumentationUrl:
      "https://api-trading.coinswitch.co/spot/reference/",

    marketDataImplemented:
      true,
  },
] as const;

export class ExchangeFleetRegistry {
  constructor(
    private readonly dependencies:
      ExchangeFleetRegistryDependencies,
  ) {}

  getReport():
    ExchangeFleetCapabilityReport {
    const marketDataAdapters =
      new Map(
        this.dependencies
          .getMarketDataAdapters()
          .map(
            (adapter) => [
              this.normalizeExchange(
                adapter.name,
              ),
              adapter.connected,
            ],
          ),
      );

    const monitoredReads =
      new Set(
        this.dependencies
          .getMonitoredReadExchanges()
          .map(
            (exchange) =>
              this.normalizeExchange(
                exchange,
              ),
          ),
      );

    const clockStates =
      new Map(
        this.dependencies
          .getClockStates()
          .map(
            (clock) => [
              this.normalizeExchange(
                clock.exchange,
              ),
              clock.signedRequestAllowed,
            ],
          ),
      );

    const exchanges =
      FLEET_DEFINITIONS.map(
        (definition) => {
          const exchange =
            definition.exchange;

          const readMonitored =
            monitoredReads.has(
              exchange,
            );

          const readStatus =
            this.dependencies
              .getReadStatus(
                exchange,
              );

          const marketRuleProvider =
            this.dependencies
              .hasMarketRuleProvider(
                exchange,
              );

          const liveOrderAdapter =
            this.dependencies
              .hasLiveOrderAdapter(
                exchange,
              );

          const clockMonitored =
            clockStates.has(
              exchange,
            );

          return {
            exchange,

            displayName:
              definition.displayName,

            officialDocumentationUrl:
              definition.officialDocumentationUrl,

            marketData: {
              implementationState:
                this.toImplementationState(
                  definition.marketDataImplemented,
                ),

              adapterRegistered:
                marketDataAdapters.has(
                  exchange,
                ),

              connected:
                marketDataAdapters.get(
                  exchange,
                ) ??
                false,
            },

            marketRules: {
              implementationState:
                this.toImplementationState(
                  marketRuleProvider,
                ),

              providerRegistered:
                marketRuleProvider,
            },

            authenticatedRead: {
              implementationState:
                this.toImplementationState(
                  readMonitored,
                ),

              monitored:
                readMonitored,

              credentialsConfigured:
                readMonitored &&
                readStatus.credentialsConfigured,

              verificationState:
                readMonitored
                  ? readStatus.verificationState
                  : "NOT_CONFIGURED",

              fresh:
                readMonitored &&
                readStatus.readOnlyVerificationFresh,
            },

            clockSafety: {
              implementationState:
                this.toImplementationState(
                  clockMonitored,
                ),

              monitored:
                clockMonitored,

              signedRequestAllowed:
                clockStates.get(
                  exchange,
                ) ??
                null,
            },

            liveOrderAdapter: {
              implementationState:
                this.toImplementationState(
                  liveOrderAdapter,
                ),

              adapterRegistered:
                liveOrderAdapter,

              liveExecutionEnabled:
                false as const,

              adapterConnected:
                false as const,
            },
          } satisfies ExchangeFleetCapability;
        },
      );

    return {
      generatedAt:
        Date.now(),

      version:
        "19.27",

      targetExchangeCount:
        5,

      liveTradingEnabled:
        false,

      liveSubmissionAllowed:
        false,

      summary: {
        marketDataImplemented:
          exchanges.filter(
            (exchange) =>
              exchange.marketData
                .implementationState ===
              "IMPLEMENTED",
          ).length,

        marketDataConnected:
          exchanges.filter(
            (exchange) =>
              exchange.marketData.connected,
          ).length,

        marketRuleProviders:
          exchanges.filter(
            (exchange) =>
              exchange.marketRules
                .providerRegistered,
          ).length,

        authenticatedReadMonitored:
          exchanges.filter(
            (exchange) =>
              exchange.authenticatedRead
                .monitored,
          ).length,

        verifiedReadAccess:
          exchanges.filter(
            (exchange) =>
              exchange.authenticatedRead
                .verificationState ===
                "VERIFIED" &&
              exchange.authenticatedRead
                .fresh,
          ).length,

        liveOrderAdapters:
          exchanges.filter(
            (exchange) =>
              exchange.liveOrderAdapter
                .adapterRegistered,
          ).length,
      },

      exchanges,

      notes: [
        "The five-exchange target fleet is explicit and authoritative.",

        "DOCUMENTED_NOT_IMPLEMENTED means an official API contract exists but CAT PRO has no corresponding implementation yet.",

        "UnoCoin market data uses validated public REST snapshots; ticker-only responses never become executable without quantity-bearing order-book evidence.",

        "CoinSwitch market data uses audited public Socket.IO full-depth snapshots; REST ticker-only responses never become executable without quantity-bearing order-book evidence.",

        "Runtime connectivity and verification fields are evidence-based and default fail-closed.",

        "LIVE execution and order submission remain disabled for every exchange.",
      ],
    };
  }

  private toImplementationState(
    implemented: boolean,
  ): ExchangeCapabilityImplementationState {
    return implemented
      ? "IMPLEMENTED"
      : "DOCUMENTED_NOT_IMPLEMENTED";
  }

  private normalizeExchange(
    exchange: string,
  ): string {
    return exchange
      .trim()
      .toLowerCase();
  }
}

export const exchangeFleetRegistry =
  new ExchangeFleetRegistry({
    getMarketDataAdapters:
      () =>
        exchangeManager
          .getAll()
          .map(
            (adapter) => ({
              name:
                adapter.name,

              connected:
                adapter.isConnected(),
            }),
          ),

    hasMarketRuleProvider:
      (exchange) =>
        exchangeCapabilityService
          .hasProvider(
            exchange,
          ),

    getMonitoredReadExchanges:
      () =>
        liveExecutionService
          .getMonitoredExchanges(),

    getReadStatus:
      (exchange) =>
        liveExecutionService
          .getMonitoredExchangeStatus(
            exchange,
          ),

    getClockStates:
      () =>
        exchangeClockSafetyService
          .getReport()
          .exchanges,

    hasLiveOrderAdapter:
      (exchange) =>
        liveExecutionService
          .hasAdapter(
            exchange,
          ),
  });
