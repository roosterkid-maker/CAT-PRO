import {
  exchangeCapabilityService,
} from "../../execution/capabilities/services/ExchangeCapabilityService";

import {
  getExchangeFeeEvidence,
} from "../../arbitrage/config/fees";

import {
  marketCache,
} from "../../services/cache.service";

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

export type CatProObservationExchange =
  "zebpay";

export const CAT_PRO_FOUNDATION_EXCHANGES = [
  "giottus",
  "mudrex",
  "bitbns",
] as const;

export type CatProFoundationExchange =
  typeof CAT_PRO_FOUNDATION_EXCHANGES[number];

export type CatProFleetExchange =
  | CatProTargetExchange
  | CatProObservationExchange;

export interface ExchangeFoundationCapability {
  readonly exchange:
    CatProFoundationExchange;

  readonly displayName: string;

  readonly officialDocumentationUrl: string;

  readonly documentedProduct:
    | "SPOT"
    | "FUTURES"
    | "LEGACY_SPOT_CLIENT";

  readonly requiredCredentialVariables:
    readonly string[];

  readonly credentialsConfigured: boolean;

  readonly marketDataAdapterImplemented: boolean;

  readonly authenticatedReadImplemented: boolean;

  readonly orderAdapterImplemented: false;

  readonly liveExecutionEnabled: false;

  readonly readinessState:
    | "CREDENTIALS_PENDING"
    | "AUTHENTICATED_READ_UNVERIFIED"
    | "AUTHENTICATED_READ_VERIFIED"
    | "SPOT_CONTRACT_REVIEW_REQUIRED";

  readonly blockers:
    readonly string[];
}

export type ExchangeCapabilityImplementationState =
  | "IMPLEMENTED"
  | "DOCUMENTED_NOT_IMPLEMENTED";

interface ExchangeFleetDefinition {
  exchange:
    CatProFleetExchange;

  displayName: string;

  officialDocumentationUrl: string;

  marketDataImplemented: boolean;
}

export interface ExchangeFleetCapability {
  exchange:
    CatProFleetExchange;

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

  version: "20.0";

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

  observationExchangeCount: 1;

  observationExchanges:
    ExchangeFleetCapability[];

  observationSummary: {
    marketDataConnected: number;

    executionEligible: number;

    paperEligibleMarkets: number;
  };

  foundationExchangeCount: 3;

  foundationExchanges:
    ExchangeFoundationCapability[];

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

  getPaperEligibleMarketCount?(
    exchange: string,
  ): number;
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

const OBSERVATION_DEFINITIONS:
  readonly ExchangeFleetDefinition[] = [
  {
    exchange:
      "zebpay",

    displayName:
      "ZebPay",

    officialDocumentationUrl:
      "https://docs.zebpay.com/",

    marketDataImplemented:
      true,
  },
] as const;

const FOUNDATION_DEFINITIONS:
  readonly Omit<
    ExchangeFoundationCapability,
    | "credentialsConfigured"
    | "marketDataAdapterImplemented"
    | "authenticatedReadImplemented"
    | "orderAdapterImplemented"
    | "liveExecutionEnabled"
    | "readinessState"
    | "blockers"
  >[] = [
  {
    exchange:
      "giottus",
    displayName:
      "Giottus",
    officialDocumentationUrl:
      "https://api.giottus.com/docs/",
    documentedProduct:
      "SPOT",
    requiredCredentialVariables: [
      "GIOTTUS_API_KEY",
      "GIOTTUS_API_SECRET",
    ],
  },
  {
    exchange:
      "mudrex",
    displayName:
      "Mudrex",
    officialDocumentationUrl:
      "https://docs.trade.mudrex.com/docs/overview",
    documentedProduct:
      "FUTURES",
    requiredCredentialVariables: [
      "MUDREX_API_KEY",
      "MUDREX_API_SECRET",
    ],
  },
  {
    exchange:
      "bitbns",
    displayName:
      "Bitbns",
    officialDocumentationUrl:
      "https://github.com/bitbns-official/node-bitbns-api",
    documentedProduct:
      "LEGACY_SPOT_CLIENT",
    requiredCredentialVariables: [
      "BITBNS_API_KEY",
      "BITBNS_API_SECRET",
    ],
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

    const capabilities =
      [
        ...FLEET_DEFINITIONS,
        ...OBSERVATION_DEFINITIONS,
      ].map(
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

    const targetExchanges =
      new Set<string>(
        CAT_PRO_TARGET_EXCHANGES,
      );

    const exchanges =
      capabilities.filter(
        (exchange) =>
          targetExchanges.has(
            exchange.exchange,
          ),
      );

    const observationExchanges =
      capabilities.filter(
        (exchange) =>
          exchange.exchange ===
          "zebpay",
      );

    const observationPaperEligibleMarkets =
      this.dependencies
        .getPaperEligibleMarketCount?.(
          "zebpay",
        ) ??
      0;

    const observationExecutionEligible =
      observationExchanges.filter(
        (exchange) =>
          exchange.marketData.connected &&
          exchange.marketRules.providerRegistered &&
          exchange.authenticatedRead.verificationState ===
            "VERIFIED" &&
          exchange.authenticatedRead.fresh &&
          observationPaperEligibleMarkets >
            0,
      ).length;

    const foundationExchanges =
      FOUNDATION_DEFINITIONS.map(
        (definition) => {
          const authenticatedReadImplemented =
            definition.exchange ===
              "giottus";

          const authenticatedReadStatus =
            authenticatedReadImplemented
              ? this.dependencies
                  .getReadStatus(
                    definition.exchange,
                  )
              : null;

          const credentialsConfigured =
            authenticatedReadStatus
              ?.credentialsConfigured ??
            definition.requiredCredentialVariables
              .every(
                (variable) =>
                  Boolean(
                    process.env[variable]
                      ?.trim(),
                  ),
              );
          const spotContractReviewRequired =
            definition.documentedProduct !==
              "SPOT";

          const authenticatedReadVerified =
            authenticatedReadStatus
              ?.verificationState ===
                "VERIFIED" &&
            authenticatedReadStatus
              .readOnlyVerificationFresh;

          return {
            ...definition,
            credentialsConfigured,
            marketDataAdapterImplemented:
              false as const,
            authenticatedReadImplemented:
              authenticatedReadImplemented,
            orderAdapterImplemented:
              false as const,
            liveExecutionEnabled:
              false as const,
            readinessState:
              spotContractReviewRequired
                ? "SPOT_CONTRACT_REVIEW_REQUIRED" as const
                : authenticatedReadVerified
                  ? "AUTHENTICATED_READ_VERIFIED" as const
                  : credentialsConfigured
                    ? "AUTHENTICATED_READ_UNVERIFIED" as const
                : "CREDENTIALS_PENDING" as const,
            blockers: [
              authenticatedReadImplemented
                ? "Signed wallet authentication is implemented; market-data, exact market-rule, fee, clock and order-lifecycle adapters remain unimplemented and execution-blocked."
                : "CAT PRO market-data, market-rule, authenticated-read and order adapters have not been implemented or proven yet.",
              ...(
                definition.exchange ===
                  "giottus"
                  ? [
                      "The current Spot create-order contract does not document FOK/IOC or a client-order identifier, and its asynchronous success response does not return an order ID. Deterministic submit reconciliation must be proven before CAT PRO can grant LIVE authority.",
                    ]
                  : []
              ),
              ...(
                credentialsConfigured
                  ? []
                  : [
                      `Credentials pending: ${definition.requiredCredentialVariables.join(
                        " + ",
                      )}.`,
                    ]
              ),
              ...(
                authenticatedReadImplemented &&
                credentialsConfigured &&
                !authenticatedReadVerified
                  ? [
                      "The latest signed Giottus wallet read is missing, failed or stale.",
                    ]
                  : []
              ),
              ...(
                spotContractReviewRequired
                  ? [
                      definition.documentedProduct ===
                        "FUTURES"
                        ? "The current official contract is a futures API, so it cannot be inserted into CAT PRO spot arbitrage without a separately verified spot contract."
                        : "The official Bitbns client is legacy evidence; the current production Spot API contract must be revalidated before implementation.",
                    ]
                  : []
              ),
              authenticatedReadImplemented
                ? "Authenticated balance reads are read-only; no market-data connection, fund movement or order authority is granted by this foundation record."
                : "No market-data connection, balance read, fund movement or order authority is granted by this foundation record.",
            ],
          } satisfies ExchangeFoundationCapability;
        },
      );

    return {
      generatedAt:
        Date.now(),

      version:
        "20.0",

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

      observationExchangeCount:
        1,

      observationExchanges,

      observationSummary: {
        marketDataConnected:
          observationExchanges.filter(
            (exchange) =>
              exchange.marketData
                .connected,
          ).length,

        executionEligible:
          observationExecutionEligible,

        paperEligibleMarkets:
          observationPaperEligibleMarkets,
      },

      foundationExchangeCount:
        3,

      foundationExchanges,

      notes: [
        "The five-exchange target fleet is explicit and authoritative.",

        "DOCUMENTED_NOT_IMPLEMENTED means an official API contract exists but CAT PRO has no corresponding implementation yet.",

        "UnoCoin market data uses validated public REST snapshots; ticker-only responses never become executable without quantity-bearing order-book evidence.",

        "CoinSwitch market data uses audited public Socket.IO full-depth snapshots; REST ticker-only responses never become executable without quantity-bearing order-book evidence.",

        "ZebPay is a staged PAPER-extension lane with genuine quantity-bearing depth, exact Spot order rules, authenticated side-aware fee evidence and native-unit balance synchronization. It may enter normal PAPER qualification only when all central economics, freshness, liquidity and capital gates pass.",

        "ZebPay remains excluded from LIVE readiness and dispatch: its execution adapter foundation is deliberately unregistered until authenticated private order/fill evidence and the central Strategy #1 venue contract are independently proven.",

        "Runtime connectivity and verification fields are evidence-based and default fail-closed.",

        "LIVE execution and order submission remain disabled for every exchange.",

        "Giottus, Mudrex and Bitbns are visible integration foundations only. They are excluded from opportunity generation and execution until their current product contract, credentials, rules, signed reads and full order lifecycle are independently implemented and verified.",
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

    getPaperEligibleMarketCount:
      (exchange) => {
        const executableMarkets =
          new Set(
            marketCache
              .getExecutableByExchange(
                exchange,
              )
              .map(
                (quote) =>
                  quote.market
                    .trim()
                    .toUpperCase()
                    .replace(
                      /[\s_,\-/]+/g,
                      "",
                    ),
              ),
          );

        return exchangeCapabilityService
          .getCachedCapabilities(
            exchange,
          )
          .filter(
            (capability) =>
              executableMarkets.has(
                capability.market
                  .trim()
                  .toUpperCase()
                  .replace(
                    /[\s_,\-/]+/g,
                    "",
                  ),
              ) &&
              capability.tradingEnabled &&
              !capability.maintenanceMode &&
              capability.order.supportedOrderTypes.includes(
                "limit",
              ) &&
              (
                capability.quantity.quantityStep !==
                  null ||
                capability.quantity.quantityPrecision !==
                  null
              ) &&
              (
                capability.price.priceStep !==
                  null ||
                capability.price.pricePrecision !==
                  null
              ) &&
              capability.notional.minimumNotional !==
                null &&
              getExchangeFeeEvidence(
                exchange,
                capability.market,
              ) !==
                null,
          ).length;
      },
  });
