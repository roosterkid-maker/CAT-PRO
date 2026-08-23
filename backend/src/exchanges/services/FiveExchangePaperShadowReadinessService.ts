import {
  getExchangeFeeEvidence,
} from "../../arbitrage/config/fees";

import type {
  ExchangeFeeEvidenceSource,
} from "../../arbitrage/models/FeeModel";

import {
  exchangeCapabilityService,
} from "../../execution/capabilities/services/ExchangeCapabilityService";

import type {
  ExchangeMarketCapability,
} from "../../execution/capabilities/models/ExchangeCapability";

import {
  marketCache,
} from "../../services/cache.service";

import {
  CAT_PRO_TARGET_EXCHANGES,
  exchangeFleetRegistry,
  type CatProFleetExchange,
  type CatProTargetExchange,
} from "../core/ExchangeFleetRegistry";

export type PaperShadowAvailability =
  | "AVAILABLE"
  | "BLOCKED";

export interface PaperShadowExchangeReadiness<
  TExchange extends CatProFleetExchange = CatProTargetExchange,
> {
  exchange:
    TExchange;

  displayName: string;

  marketDataConnected:
    boolean;

  capabilitySynchronization:
    "SYNCHRONIZED" |
    "FAILED";

  capabilitySynchronizationError:
    string | null;

  capabilityMarkets: number;

  executableMarkets: number;

  feeEvidenceMarkets: number;

  completeOrderRuleMarkets: number;

  shadowEligibleMarkets: number;

  paperEligibleMarkets: number;

  feeEvidenceSources:
    Record<
      ExchangeFeeEvidenceSource,
      number
    >;

  shadowAvailability:
    PaperShadowAvailability;

  paperAvailability:
    PaperShadowAvailability;

  shadowEligibleMarketSample:
    string[];

  paperEligibleMarketSample:
    string[];

  blockers:
    string[];
}

export interface FiveExchangePaperShadowReadinessReport {
  generatedAt: number;

  version: "19.33";

  mode:
    "READ_ONLY_PAPER_SHADOW_READINESS";

  targetExchangeCount: 5;

  liveTradingEnabled: false;

  liveSubmissionAllowed: false;

  allFiveShadowAvailable:
    boolean;

  allFivePaperAvailable:
    boolean;

  summary: {
    shadowAvailableExchanges:
      number;

    paperAvailableExchanges:
      number;

    totalShadowEligibleMarkets:
      number;

    totalPaperEligibleMarkets:
      number;
  };

  exchanges:
    PaperShadowExchangeReadiness[];

  paperExtensionExchangeCount?: 1;

  paperExtensionExchanges?:
    PaperShadowExchangeReadiness<"zebpay">[];

  paperExtensionSummary?: {
    shadowAvailableExchanges: number;

    paperAvailableExchanges: number;

    totalShadowEligibleMarkets: number;

    totalPaperEligibleMarkets: number;
  };

  blockers:
    string[];

  notes:
    string[];
}

export class FiveExchangePaperShadowReadinessService {
  async getReport():
    Promise<FiveExchangePaperShadowReadinessReport> {
    const fleet =
      exchangeFleetRegistry
        .getReport();

    const capabilities =
      await Promise.all(
        CAT_PRO_TARGET_EXCHANGES
          .map(
            async (
              exchange,
            ) => {
              try {
                return {
                  exchange,
                  capabilities:
                    await exchangeCapabilityService
                      .synchronizeExchange(
                        exchange,
                        {
                          product:
                            "spot",
                          forceRefresh:
                            false,
                        },
                      ),
                  error:
                    null,
                } as const;
              } catch (
                error:
                  unknown
              ) {
                return {
                  exchange,
                  capabilities:
                    [] as readonly ExchangeMarketCapability[],
                  error:
                    error instanceof Error
                      ? error.message
                      : "Capability synchronization failed.",
                } as const;
              }
            },
          ),
      );

    const exchanges =
      capabilities.map(
        (
          synchronization,
        ) => {
          const fleetExchange =
            fleet.exchanges.find(
              (exchange) =>
                exchange.exchange ===
                synchronization.exchange,
            );

          if (!fleetExchange) {
            throw new Error(
              `Fleet definition is missing target exchange ${synchronization.exchange}.`,
            );
          }

          return this.analyzeExchange(
            synchronization.exchange,
            fleetExchange.displayName,
            fleetExchange.marketData
              .connected,
            synchronization.capabilities,
            synchronization.error,
          );
        },
      );

    const paperExtensionCapabilities =
      await Promise.all(
        ["zebpay" as const]
          .map(
            async (
              exchange,
            ) => {
              try {
                return {
                  exchange,
                  capabilities:
                    await exchangeCapabilityService
                      .synchronizeExchange(
                        exchange,
                        {
                          product:
                            "spot",
                          forceRefresh:
                            false,
                        },
                      ),
                  error:
                    null,
                } as const;
              } catch (
                error:
                  unknown
              ) {
                return {
                  exchange,
                  capabilities:
                    [] as readonly ExchangeMarketCapability[],
                  error:
                    error instanceof Error
                      ? error.message
                      : "Capability synchronization failed.",
                } as const;
              }
            },
          ),
      );

    const paperExtensionExchanges =
      paperExtensionCapabilities.map(
        (
          synchronization,
        ) => {
          const fleetExchange =
            fleet.observationExchanges.find(
              (exchange) =>
                exchange.exchange ===
                synchronization.exchange,
            );

          if (!fleetExchange) {
            throw new Error(
              `Fleet definition is missing PAPER extension exchange ${synchronization.exchange}.`,
            );
          }

          return this.analyzeExchange(
            synchronization.exchange,
            fleetExchange.displayName,
            fleetExchange.marketData.connected,
            synchronization.capabilities,
            synchronization.error,
          );
        },
      );

    const blockers =
      exchanges.flatMap(
        (exchange) =>
          exchange.blockers.map(
            (blocker) =>
              `${exchange.exchange}: ${blocker}`,
          ),
      );

    return {
      generatedAt:
        Date.now(),

      version:
        "19.33",

      mode:
        "READ_ONLY_PAPER_SHADOW_READINESS",

      targetExchangeCount:
        5,

      liveTradingEnabled:
        false,

      liveSubmissionAllowed:
        false,

      allFiveShadowAvailable:
        exchanges.every(
          (exchange) =>
            exchange.shadowAvailability ===
            "AVAILABLE",
        ),

      allFivePaperAvailable:
        exchanges.every(
          (exchange) =>
            exchange.paperAvailability ===
            "AVAILABLE",
        ),

      summary: {
        shadowAvailableExchanges:
          exchanges.filter(
            (exchange) =>
              exchange.shadowAvailability ===
              "AVAILABLE",
          ).length,

        paperAvailableExchanges:
          exchanges.filter(
            (exchange) =>
              exchange.paperAvailability ===
              "AVAILABLE",
          ).length,

        totalShadowEligibleMarkets:
          exchanges.reduce(
            (
              total,
              exchange,
            ) =>
              total +
              exchange.shadowEligibleMarkets,
            0,
          ),

        totalPaperEligibleMarkets:
          exchanges.reduce(
            (
              total,
              exchange,
            ) =>
              total +
              exchange.paperEligibleMarkets,
            0,
          ),
      },

      exchanges,

      paperExtensionExchangeCount:
        1,

      paperExtensionExchanges,

      paperExtensionSummary: {
        shadowAvailableExchanges:
          paperExtensionExchanges.filter(
            (exchange) =>
              exchange.shadowAvailability ===
              "AVAILABLE",
          ).length,

        paperAvailableExchanges:
          paperExtensionExchanges.filter(
            (exchange) =>
              exchange.paperAvailability ===
              "AVAILABLE",
          ).length,

        totalShadowEligibleMarkets:
          paperExtensionExchanges.reduce(
            (
              total,
              exchange,
            ) =>
              total +
              exchange.shadowEligibleMarkets,
            0,
          ),

        totalPaperEligibleMarkets:
          paperExtensionExchanges.reduce(
            (
              total,
              exchange,
            ) =>
              total +
              exchange.paperEligibleMarkets,
            0,
          ),
      },

      blockers,

      notes: [
        "Availability means at least one current spot market has the required evidence; it is not a claim of profit, fill, balance, or exchange-wide readiness.",

        "Shadow eligibility requires connected executable depth, enabled market capability, and current fee evidence.",

        "Paper eligibility additionally requires limit-order support plus known quantity increment/precision, price increment/precision, and minimum notional.",

        "Static fee configuration is identified separately from public and authenticated account evidence.",

        "Paper/shadow diagnostics do not require or infer real balances and never submit an order.",

        "ZebPay is reported as a separate PAPER extension and does not change the authoritative five-exchange LIVE readiness denominator.",

        "LIVE trading and LIVE order submission remain disabled.",
      ],
    };
  }

  private analyzeExchange<
    TExchange extends CatProFleetExchange,
  >(
    exchange:
      TExchange,
    displayName: string,
    marketDataConnected:
      boolean,
    capabilities:
      readonly ExchangeMarketCapability[],
    synchronizationError:
      string | null,
  ): PaperShadowExchangeReadiness<TExchange> {
    const executableMarkets =
      new Set(
        marketCache
          .getExecutableByExchange(
            exchange,
          )
          .map(
            (quote) =>
              this.canonicalMarket(
                quote.market,
              ),
          ),
      );

    const feeEvidenceSources:
      Record<
        ExchangeFeeEvidenceSource,
        number
      > = {
      STATIC_CONFIG:
        0,
      PUBLIC_API:
        0,
      ACCOUNT_API:
        0,
    };

    let feeEvidenceMarkets =
      0;

    let completeOrderRuleMarkets =
      0;

    const shadowEligible:
      string[] = [];

    const paperEligible:
      string[] = [];

    for (const capability of capabilities) {
      const feeEvidence =
        getExchangeFeeEvidence(
          exchange,
          capability.market,
        );

      const hasFeeEvidence =
        feeEvidence !==
        null;

      if (feeEvidence) {
        feeEvidenceMarkets +=
          1;

        feeEvidenceSources[
          feeEvidence.source
        ] +=
          1;
      }

      const hasCompleteRules =
        capability.order
          .supportedOrderTypes
          .includes(
            "limit",
          ) &&
        (
          capability.quantity
            .quantityStep !==
            null ||
          capability.quantity
            .quantityPrecision !==
            null
        ) &&
        (
          capability.price
            .priceStep !==
            null ||
          capability.price
            .pricePrecision !==
            null
        ) &&
        capability.notional
          .minimumNotional !==
          null;

      if (hasCompleteRules) {
        completeOrderRuleMarkets +=
          1;
      }

      const shadowReady =
        marketDataConnected &&
        executableMarkets.has(
          this.canonicalMarket(
            capability.market,
          ),
        ) &&
        capability.tradingEnabled &&
        !capability.maintenanceMode &&
        hasFeeEvidence;

      if (shadowReady) {
        shadowEligible.push(
          capability.market,
        );
      }

      if (
        shadowReady &&
        hasCompleteRules
      ) {
        paperEligible.push(
          capability.market,
        );
      }
    }

    const blockers:
      string[] = [];

    if (synchronizationError) {
      blockers.push(
        `Capability synchronization failed: ${synchronizationError}`,
      );
    }

    if (!marketDataConnected) {
      blockers.push(
        "Market-data adapter is not connected.",
      );
    }

    if (
      executableMarkets.size ===
        0
    ) {
      blockers.push(
        "No current quantity-bearing executable market evidence is available.",
      );
    }

    if (
      feeEvidenceMarkets ===
        0
    ) {
      blockers.push(
        "No current market-specific fee evidence is available.",
      );
    }

    if (
      completeOrderRuleMarkets ===
        0
    ) {
      blockers.push(
        "No market has complete limit-order precision/increment and minimum-notional evidence.",
      );
    }

    if (
      shadowEligible.length ===
        0
    ) {
      blockers.push(
        "No market currently qualifies for shadow evidence collection.",
      );
    }

    if (
      paperEligible.length ===
        0
    ) {
      blockers.push(
        "No market currently qualifies for validated paper execution.",
      );
    }

    return {
      exchange,

      displayName,

      marketDataConnected,

      capabilitySynchronization:
        synchronizationError ===
          null
          ? "SYNCHRONIZED"
          : "FAILED",

      capabilitySynchronizationError:
        synchronizationError,

      capabilityMarkets:
        capabilities.length,

      executableMarkets:
        executableMarkets.size,

      feeEvidenceMarkets,

      completeOrderRuleMarkets,

      shadowEligibleMarkets:
        shadowEligible.length,

      paperEligibleMarkets:
        paperEligible.length,

      feeEvidenceSources,

      shadowAvailability:
        shadowEligible.length > 0
          ? "AVAILABLE"
          : "BLOCKED",

      paperAvailability:
        paperEligible.length > 0
          ? "AVAILABLE"
          : "BLOCKED",

      shadowEligibleMarketSample:
        shadowEligible
          .sort()
          .slice(
            0,
            10,
          ),

      paperEligibleMarketSample:
        paperEligible
          .sort()
          .slice(
            0,
            10,
          ),

      blockers,
    };
  }

  private canonicalMarket(
    market: string,
  ): string {
    return market
      .trim()
      .toUpperCase()
      .replace(
        /[\s_,\-/]+/g,
        "",
      );
  }
}

export const fiveExchangePaperShadowReadinessService =
  new FiveExchangePaperShadowReadinessService();
