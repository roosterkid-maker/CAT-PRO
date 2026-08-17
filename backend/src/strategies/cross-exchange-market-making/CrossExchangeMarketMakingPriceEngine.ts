import {
  getExchangeFeeEvidence,
} from "../../arbitrage/config/fees";

import type {
  ExchangeFeeEvidence,
} from "../../arbitrage/models/FeeModel";

import type {
  ExecutableQuote,
} from "../../core/models/ExecutableQuote";

import type {
  ExchangeMarketCapability,
} from "../../execution/capabilities/models/ExchangeCapability";

import {
  exchangeCapabilityService,
} from "../../execution/capabilities/services/ExchangeCapabilityService";

import {
  freshnessIntegrityService,
} from "../../freshness/services/FreshnessIntegrityService";

import type {
  PairFreshnessResult,
} from "../../freshness/services/FreshnessIntegrityService";

import {
  marketCache,
} from "../../services/cache.service";

import type {
  CrossExchangeMarketMakingSafePriceEvidence,
  CrossExchangeMarketMakingSide,
} from "../models/StrategySignal";

import type {
  CrossExchangeMarketMakingConfiguration,
} from "./CrossExchangeMarketMakingConfiguration";

export type CrossExchangeMarketMakingPriceBlocker =
  | "CONTROLLER_NOT_RUNNING"
  | "CONFIGURATION_NOT_READY"
  | "EVIDENCE_SOURCE_ERROR"
  | "MAKER_QUOTE_MISSING"
  | "HEDGE_QUOTE_MISSING"
  | "MAKER_QUOTE_NOT_EXECUTABLE"
  | "HEDGE_QUOTE_NOT_EXECUTABLE"
  | "QUOTES_NOT_FRESH_OR_SYNCHRONIZED"
  | "MAKER_FEE_EVIDENCE_MISSING"
  | "HEDGE_FEE_EVIDENCE_MISSING"
  | "MAKER_FEE_EVIDENCE_INVALID"
  | "HEDGE_FEE_EVIDENCE_INVALID"
  | "MAKER_CAPABILITY_MISSING"
  | "MAKER_CAPABILITY_STALE"
  | "MAKER_CAPABILITY_MISMATCH"
  | "MAKER_TRADING_DISABLED"
  | "MAKER_MAINTENANCE_MODE"
  | "MAKER_LIMIT_ORDER_UNSUPPORTED"
  | "MAKER_POST_ONLY_UNSUPPORTED"
  | "MAKER_PRICE_RULES_INVALID"
  | "ECONOMIC_PRICE_UNAVAILABLE"
  | "PASSIVE_PRICE_UNAVAILABLE"
  | "SAFE_PRICE_OUTSIDE_RULES"
  | "RETAINED_EDGE_BELOW_MINIMUM";

export interface CrossExchangeMarketMakingPricingEvidenceSource {
  getQuote(
    exchange: string,
    market: string,
  ): ExecutableQuote | null | undefined;

  evaluatePairFreshness(
    makerQuote: ExecutableQuote,
    hedgeQuote: ExecutableQuote,
    now: number,
  ): PairFreshnessResult;

  getFeeEvidence(
    exchange: string,
    market: string,
  ): ExchangeFeeEvidence | null;

  getCachedMakerCapability(
    exchange: string,
    market: string,
  ): ExchangeMarketCapability | null;
}

export interface CrossExchangeMarketMakingPriceResult {
  readonly side:
    CrossExchangeMarketMakingSide;

  readonly status:
    | "ACCEPTED"
    | "REJECTED";

  readonly blockers:
    readonly CrossExchangeMarketMakingPriceBlocker[];

  readonly expiresAt:
    number | null;

  readonly evidence:
    CrossExchangeMarketMakingSafePriceEvidence | null;
}

export interface CrossExchangeMarketMakingPricingSnapshot {
  readonly version:
    "21.5";

  readonly strategyId:
    "cross-exchange-market-making";

  readonly generatedAt:
    number;

  readonly evidenceStatus:
    "AVAILABLE";

  readonly configurationState:
    CrossExchangeMarketMakingConfiguration["state"];

  readonly controllerRunning:
    boolean;

  readonly market:
    string;

  readonly makerExchange:
    string | null;

  readonly hedgeExchange:
    string | null;

  readonly inputs: {
    readonly makerQuote:
      ExecutableQuote | null;

    readonly hedgeQuote:
      ExecutableQuote | null;

    readonly freshness:
      PairFreshnessResult | null;

    readonly makerFee:
      ExchangeFeeEvidence | null;

    readonly hedgeFee:
      ExchangeFeeEvidence | null;

    readonly makerCapability:
      ExchangeMarketCapability | null;
  };

  readonly results:
    readonly CrossExchangeMarketMakingPriceResult[];

  readonly safety: {
    readonly shadowEvidenceOnly:
      true;

    readonly postOnlyRequired:
      true;

    readonly quantitySizingEvaluated:
      false;

    readonly placementSimulated:
      false;

    readonly fillSimulated:
      false;

    readonly hedgeIntentGenerated:
      false;

    readonly executionAuthorized:
      false;

    readonly orderSubmissionAllowed:
      false;
  };
}

const DEFAULT_EVIDENCE_SOURCE:
  CrossExchangeMarketMakingPricingEvidenceSource = {
  getQuote: (
    exchange,
    market,
  ) =>
    marketCache.get(
      exchange,
      market,
    ) ??
    null,

  evaluatePairFreshness: (
    makerQuote,
    hedgeQuote,
    now,
  ) =>
    freshnessIntegrityService
      .evaluatePair(
        makerQuote,
        hedgeQuote,
        now,
      ),

  getFeeEvidence: (
    exchange,
    market,
  ) =>
    getExchangeFeeEvidence(
      exchange,
      market,
    ),

  getCachedMakerCapability: (
    exchange,
    market,
  ) =>
    exchangeCapabilityService
      .getCachedCapability(
        exchange,
        market,
        "spot",
      ),
};

/**
 * V21.1 read-only economics engine.
 *
 * It computes a one-base-unit price boundary from genuine top-of-book,
 * freshness, fee and cached maker-rule evidence. It does not choose an
 * order quantity, simulate placement/fills, create a hedge intent, reserve
 * capital or submit an order.
 */
export class CrossExchangeMarketMakingPriceEngine {
  constructor(
    private readonly source:
      CrossExchangeMarketMakingPricingEvidenceSource =
        DEFAULT_EVIDENCE_SOURCE,
  ) {}

  evaluate(
    configuration:
      CrossExchangeMarketMakingConfiguration,

    market:
      string,

    controllerRunning:
      boolean,

    now =
      Date.now(),
  ): CrossExchangeMarketMakingPricingSnapshot {
    const normalizedMarket =
      market
        .trim()
        .toUpperCase();

    const sourceFailures:
      CrossExchangeMarketMakingPriceBlocker[] =
      [];

    const read =
      <T>(
        operation:
          () => T | null | undefined,
      ): T | null => {
        try {
          return operation() ??
            null;
        } catch {
          sourceFailures.push(
            "EVIDENCE_SOURCE_ERROR",
          );

          return null;
        }
      };

    const makerExchange =
      configuration
        .makerExchange;

    const hedgeExchange =
      configuration
        .hedgeExchange;

    const makerQuote =
      makerExchange
        ? read(
            () =>
              this.source
                .getQuote(
                  makerExchange,
                  normalizedMarket,
                ),
          )
        : null;

    const hedgeQuote =
      hedgeExchange
        ? read(
            () =>
              this.source
                .getQuote(
                  hedgeExchange,
                  normalizedMarket,
                ),
          )
        : null;

    const freshness =
      makerQuote &&
      hedgeQuote
        ? read(
            () =>
              this.source
                .evaluatePairFreshness(
                  makerQuote,
                  hedgeQuote,
                  now,
                ),
          )
        : null;

    const makerFee =
      makerExchange
        ? read(
            () =>
              this.source
                .getFeeEvidence(
                  makerExchange,
                  normalizedMarket,
                ),
          )
        : null;

    const hedgeFee =
      hedgeExchange
        ? read(
            () =>
              this.source
                .getFeeEvidence(
                  hedgeExchange,
                  normalizedMarket,
                ),
          )
        : null;

    const makerCapability =
      makerExchange
        ? read(
            () =>
              this.source
                .getCachedMakerCapability(
                  makerExchange,
                  normalizedMarket,
                ),
          )
        : null;

    const commonBlockers =
      this.evaluateCommonBlockers({
        configuration,
        market:
          normalizedMarket,
        controllerRunning,
        now,
        makerQuote,
        hedgeQuote,
        freshness,
        makerFee,
        hedgeFee,
        makerCapability,
        sourceFailures,
      });

    const results =
      ([
        "BID",
        "ASK",
      ] as const).map(
        (side) =>
          this.evaluateSide({
            side,
            configuration,
            market:
              normalizedMarket,
            makerQuote,
            hedgeQuote,
            freshness,
            makerFee,
            hedgeFee,
            makerCapability,
            commonBlockers,
          }),
      );

    return immutableClone({
      version:
        "21.5",

      strategyId:
        "cross-exchange-market-making",

      generatedAt:
        now,

      evidenceStatus:
        "AVAILABLE",

      configurationState:
        configuration.state,

      controllerRunning,

      market:
        normalizedMarket,

      makerExchange,

      hedgeExchange,

      inputs: {
        makerQuote,
        hedgeQuote,
        freshness,
        makerFee,
        hedgeFee,
        makerCapability,
      },

      results,

      safety: {
        shadowEvidenceOnly:
          true,

        postOnlyRequired:
          true,

        quantitySizingEvaluated:
          false,

        placementSimulated:
          false,

        fillSimulated:
          false,

        hedgeIntentGenerated:
          false,

        executionAuthorized:
          false,

        orderSubmissionAllowed:
          false,
      },
    });
  }

  private evaluateCommonBlockers(
    context: {
      configuration:
        CrossExchangeMarketMakingConfiguration;

      market:
        string;

      controllerRunning:
        boolean;

      now:
        number;

      makerQuote:
        ExecutableQuote | null;

      hedgeQuote:
        ExecutableQuote | null;

      freshness:
        PairFreshnessResult | null;

      makerFee:
        ExchangeFeeEvidence | null;

      hedgeFee:
        ExchangeFeeEvidence | null;

      makerCapability:
        ExchangeMarketCapability | null;

      sourceFailures:
        readonly CrossExchangeMarketMakingPriceBlocker[];
    },
  ): CrossExchangeMarketMakingPriceBlocker[] {
    const blockers:
      CrossExchangeMarketMakingPriceBlocker[] =
      [
        ...context.sourceFailures,
      ];

    const {
      configuration,
      market,
      controllerRunning,
      now,
      makerQuote,
      hedgeQuote,
      freshness,
      makerFee,
      hedgeFee,
      makerCapability,
    } = context;

    if (
      !controllerRunning
    ) {
      blockers.push(
        "CONTROLLER_NOT_RUNNING",
      );
    }

    if (
      configuration.state !==
        "FOUNDATION_READY" ||
      !configuration.marketAllowlist
        .includes(
          market,
        ) ||
      configuration.minimumRetainedEdgePercent ===
        null
    ) {
      blockers.push(
        "CONFIGURATION_NOT_READY",
      );
    }

    if (
      !makerQuote
    ) {
      blockers.push(
        "MAKER_QUOTE_MISSING",
      );
    } else if (
      !this.isExecutableQuote(
        makerQuote,
        configuration.makerExchange,
        market,
      )
    ) {
      blockers.push(
        "MAKER_QUOTE_NOT_EXECUTABLE",
      );
    }

    if (
      !hedgeQuote
    ) {
      blockers.push(
        "HEDGE_QUOTE_MISSING",
      );
    } else if (
      !this.isExecutableQuote(
        hedgeQuote,
        configuration.hedgeExchange,
        market,
      )
    ) {
      blockers.push(
        "HEDGE_QUOTE_NOT_EXECUTABLE",
      );
    }

    if (
      !freshness ||
      !freshness.freshAndSynchronized ||
      freshness.buy.ageMs ===
        null ||
      freshness.sell.ageMs ===
        null ||
      freshness.timestampSkewMs ===
        null
    ) {
      blockers.push(
        "QUOTES_NOT_FRESH_OR_SYNCHRONIZED",
      );
    }

    if (
      !makerFee
    ) {
      blockers.push(
        "MAKER_FEE_EVIDENCE_MISSING",
      );
    } else if (
      !this.isValidFeeEvidence(
        makerFee,
        configuration.makerExchange,
        market,
        now,
        "maker",
      )
    ) {
      blockers.push(
        "MAKER_FEE_EVIDENCE_INVALID",
      );
    }

    if (
      !hedgeFee
    ) {
      blockers.push(
        "HEDGE_FEE_EVIDENCE_MISSING",
      );
    } else if (
      !this.isValidFeeEvidence(
        hedgeFee,
        configuration.hedgeExchange,
        market,
        now,
        "taker",
      )
    ) {
      blockers.push(
        "HEDGE_FEE_EVIDENCE_INVALID",
      );
    }

    if (
      !makerCapability
    ) {
      blockers.push(
        "MAKER_CAPABILITY_MISSING",
      );
    } else {
      if (
        makerCapability.exchange !==
          configuration.makerExchange ||
        makerCapability.market !==
          market ||
        makerCapability.product !==
          "spot"
      ) {
        blockers.push(
          "MAKER_CAPABILITY_MISMATCH",
        );
      }

      const capabilityAgeMs =
        now -
        makerCapability.synchronizedAt;

      if (
        !Number.isSafeInteger(
          makerCapability.synchronizedAt,
        ) ||
        makerCapability.synchronizedAt <=
          0 ||
        capabilityAgeMs <
          0 ||
        capabilityAgeMs >
          configuration.maximumCapabilityAgeMs
      ) {
        blockers.push(
          "MAKER_CAPABILITY_STALE",
        );
      }

      if (
        !makerCapability.tradingEnabled
      ) {
        blockers.push(
          "MAKER_TRADING_DISABLED",
        );
      }

      if (
        makerCapability.maintenanceMode
      ) {
        blockers.push(
          "MAKER_MAINTENANCE_MODE",
        );
      }

      if (
        !makerCapability.order
          .supportedOrderTypes
          .includes(
            "limit",
          )
      ) {
        blockers.push(
          "MAKER_LIMIT_ORDER_UNSUPPORTED",
        );
      }

      if (
        !makerCapability.order
          .supportsPostOnly
      ) {
        blockers.push(
          "MAKER_POST_ONLY_UNSUPPORTED",
        );
      }

      if (
        !this.hasValidPriceRules(
          makerCapability,
        )
      ) {
        blockers.push(
          "MAKER_PRICE_RULES_INVALID",
        );
      }
    }

    return Array.from(
      new Set(
        blockers,
      ),
    );
  }

  private evaluateSide(
    context: {
      side:
        CrossExchangeMarketMakingSide;

      configuration:
        CrossExchangeMarketMakingConfiguration;

      market:
        string;

      makerQuote:
        ExecutableQuote | null;

      hedgeQuote:
        ExecutableQuote | null;

      freshness:
        PairFreshnessResult | null;

      makerFee:
        ExchangeFeeEvidence | null;

      hedgeFee:
        ExchangeFeeEvidence | null;

      makerCapability:
        ExchangeMarketCapability | null;

      commonBlockers:
        readonly CrossExchangeMarketMakingPriceBlocker[];
    },
  ): CrossExchangeMarketMakingPriceResult {
    const blockers =
      [
        ...context.commonBlockers,
      ];

    const {
      side,
      configuration,
      market,
      makerQuote,
      hedgeQuote,
      freshness,
      makerFee,
      hedgeFee,
      makerCapability,
    } = context;

    if (
      blockers.length >
        0 ||
      !makerQuote ||
      !hedgeQuote ||
      !freshness ||
      !makerFee ||
      !hedgeFee ||
      !makerCapability ||
      configuration.makerExchange ===
        null ||
      configuration.hedgeExchange ===
        null ||
      configuration.minimumRetainedEdgePercent ===
        null
    ) {
      return this.rejected(
        side,
        blockers,
      );
    }

    const makerBid =
      makerQuote.bestBidPrice as number;

    const makerAsk =
      makerQuote.bestAskPrice as number;

    const makerBidQuantity =
      makerQuote.bestBidQty as number;

    const makerAskQuantity =
      makerQuote.bestAskQty as number;

    const hedgeReferencePrice =
      (
        side ===
        "BID"
          ? hedgeQuote.bestBidPrice
          : hedgeQuote.bestAskPrice
      ) as number;

    const hedgeReferenceQuantity =
      (
        side ===
        "BID"
          ? hedgeQuote.bestBidQty
          : hedgeQuote.bestAskQty
      ) as number;

    const priceStep =
      makerCapability.price
        .priceStep as number;

    const makerFeeRate =
      makerFee.makerPercent /
      100;

    const hedgeTakerFeeRate =
      hedgeFee.takerPercent /
      100;

    const retainedEdgeRate =
      configuration.minimumRetainedEdgePercent /
      100;

    const economicBoundaryPrice =
      side ===
        "BID"
        ? hedgeReferencePrice *
          (1 - hedgeTakerFeeRate) /
          (
            (1 + makerFeeRate) *
            (1 + retainedEdgeRate)
          )
        : hedgeReferencePrice *
          (1 + hedgeTakerFeeRate) *
          (1 + retainedEdgeRate) /
          (1 - makerFeeRate);

    if (
      !Number.isFinite(
        economicBoundaryPrice,
      ) ||
      economicBoundaryPrice <=
        0
    ) {
      blockers.push(
        "ECONOMIC_PRICE_UNAVAILABLE",
      );

      return this.rejected(
        side,
        blockers,
      );
    }

    const passiveBoundaryPrice =
      side ===
        "BID"
        ? makerAsk -
          priceStep
        : makerBid +
          priceStep;

    if (
      !Number.isFinite(
        passiveBoundaryPrice,
      ) ||
      passiveBoundaryPrice <=
        0
    ) {
      blockers.push(
        "PASSIVE_PRICE_UNAVAILABLE",
      );

      return this.rejected(
        side,
        blockers,
      );
    }

    const minimumPrice =
      makerCapability.price
        .minimumPrice;

    const maximumPrice =
      makerCapability.price
        .maximumPrice;

    const unroundedSafePrice =
      side ===
        "BID"
        ? Math.min(
            economicBoundaryPrice,
            passiveBoundaryPrice,
            maximumPrice ??
              Number.POSITIVE_INFINITY,
          )
        : Math.max(
            economicBoundaryPrice,
            passiveBoundaryPrice,
            minimumPrice ??
              0,
          );

    const safeMakerPrice =
      side ===
        "BID"
        ? this.floorToStep(
            unroundedSafePrice,
            priceStep,
          )
        : this.ceilToStep(
            unroundedSafePrice,
            priceStep,
          );

    if (
      !Number.isFinite(
        safeMakerPrice,
      ) ||
      safeMakerPrice <=
        0 ||
      (
        minimumPrice !==
          null &&
        safeMakerPrice <
          minimumPrice
      ) ||
      (
        maximumPrice !==
          null &&
        safeMakerPrice >
          maximumPrice
      ) ||
      (
        side ===
          "BID" &&
        safeMakerPrice >=
          makerAsk
      ) ||
      (
        side ===
          "ASK" &&
        safeMakerPrice <=
          makerBid
      )
    ) {
      blockers.push(
        "SAFE_PRICE_OUTSIDE_RULES",
      );

      return this.rejected(
        side,
        blockers,
      );
    }

    const modeledRetainedEdgePercent =
      side ===
        "BID"
        ? (
            hedgeReferencePrice *
              (1 - hedgeTakerFeeRate) -
            safeMakerPrice *
              (1 + makerFeeRate)
          ) /
          (
            safeMakerPrice *
            (1 + makerFeeRate)
          ) *
          100
        : (
            safeMakerPrice *
              (1 - makerFeeRate) -
            hedgeReferencePrice *
              (1 + hedgeTakerFeeRate)
          ) /
          (
            hedgeReferencePrice *
            (1 + hedgeTakerFeeRate)
          ) *
          100;

    if (
      !Number.isFinite(
        modeledRetainedEdgePercent,
      ) ||
      modeledRetainedEdgePercent +
        1e-10 <
        configuration.minimumRetainedEdgePercent
    ) {
      blockers.push(
        "RETAINED_EDGE_BELOW_MINIMUM",
      );

      return this.rejected(
        side,
        blockers,
      );
    }

    const makerQuoteAgeMs =
      freshness.buy.ageMs as number;

    const hedgeQuoteAgeMs =
      freshness.sell.ageMs as number;

    const timestampSkewMs =
      freshness.timestampSkewMs as number;

    const expiresAt =
      Math.min(
        makerQuote.timestamp +
          freshness.buy
            .maximumQuoteAgeMs,
        hedgeQuote.timestamp +
          freshness.sell
            .maximumQuoteAgeMs,
        makerCapability.synchronizedAt +
          configuration.maximumCapabilityAgeMs,
        makerFee.expiresAt ??
          Number.MAX_SAFE_INTEGER,
        hedgeFee.expiresAt ??
          Number.MAX_SAFE_INTEGER,
      );

    const evidence:
      CrossExchangeMarketMakingSafePriceEvidence = {
      market,
      side,
      makerExchange:
        configuration.makerExchange,
      hedgeExchange:
        configuration.hedgeExchange,
      makerBestBidPrice:
        makerBid,
      makerBestBidQuantity:
        makerBidQuantity,
      makerBestAskPrice:
        makerAsk,
      makerBestAskQuantity:
        makerAskQuantity,
      hedgeReferenceSide:
        side ===
          "BID"
          ? "BID"
          : "ASK",
      hedgeReferencePrice,
      hedgeReferenceQuantity,
      economicBoundaryPrice:
        this.normalizeNumber(
          economicBoundaryPrice,
        ),
      passiveBoundaryPrice:
        this.normalizeNumber(
          passiveBoundaryPrice,
        ),
      safeMakerPrice,
      priceStep,
      minimumRetainedEdgePercent:
        configuration.minimumRetainedEdgePercent,
      modeledRetainedEdgePercent:
        this.normalizeNumber(
          modeledRetainedEdgePercent,
        ),
      makerFee: {
        percent:
          makerFee.makerPercent,
        source:
          makerFee.source,
        market:
          makerFee.market,
        synchronizedAt:
          makerFee.synchronizedAt,
        expiresAt:
          makerFee.expiresAt,
      },
      hedgeTakerFee: {
        percent:
          hedgeFee.takerPercent,
        source:
          hedgeFee.source,
        market:
          hedgeFee.market,
        synchronizedAt:
          hedgeFee.synchronizedAt,
        expiresAt:
          hedgeFee.expiresAt,
      },
      makerQuoteTimestamp:
        makerQuote.timestamp,
      hedgeQuoteTimestamp:
        hedgeQuote.timestamp,
      makerQuoteAgeMs,
      hedgeQuoteAgeMs,
      timestampSkewMs,
      maximumPairSkewMs:
        freshness.maximumPairSkewMs,
      makerCapabilitySynchronizedAt:
        makerCapability.synchronizedAt,
      maximumCapabilityAgeMs:
        configuration.maximumCapabilityAgeMs,
      postOnlyRequired:
        true,
      configuredMakerQuantity:
        configuration.makerLifecycle.quantityByMarket[market] ?? null,
      pricingModel:
        "ONE_BASE_UNIT_QUOTE_VALUE_PERCENT_V21_1",
      quantitySizing:
        configuration.makerLifecycle.quantityByMarket[market] !== undefined
          ? "CONFIGURED_MARKET_QUANTITY_V60"
          : "NOT_EVALUATED_V21_1",
      queuePosition:
        "NOT_EVALUATED_V21_1",
      fillProbability:
        "NOT_EVALUATED_V21_1",
      makerPlacement:
        "NOT_SIMULATED_V21_1",
      hedgeSlippage:
        "NOT_EVALUATED_V21_1",
    };

    return {
      side,
      status:
        "ACCEPTED",
      blockers:
        [],
      expiresAt,
      evidence,
    };
  }

  private rejected(
    side:
      CrossExchangeMarketMakingSide,

    blockers:
      readonly CrossExchangeMarketMakingPriceBlocker[],
  ): CrossExchangeMarketMakingPriceResult {
    return {
      side,
      status:
        "REJECTED",
      blockers:
        Array.from(
          new Set(
            blockers,
          ),
        ),
      expiresAt:
        null,
      evidence:
        null,
    };
  }

  private isExecutableQuote(
    quote:
      ExecutableQuote,

    expectedExchange:
      string | null,

    expectedMarket:
      string,
  ): boolean {
    return Boolean(
      expectedExchange &&
      quote.exchange ===
        expectedExchange &&
      quote.market ===
        expectedMarket &&
      quote.executable &&
      this.isPositive(
        quote.bestBidPrice,
      ) &&
      this.isPositive(
        quote.bestBidQty,
      ) &&
      this.isPositive(
        quote.bestAskPrice,
      ) &&
      this.isPositive(
        quote.bestAskQty,
      ) &&
      (
        quote.bestAskPrice as number
      ) >
        (
          quote.bestBidPrice as number
        ),
    );
  }

  private isValidFeeEvidence(
    evidence:
      ExchangeFeeEvidence,

    expectedExchange:
      string | null,

    expectedMarket:
      string,

    now:
      number,

    feeKind:
      | "maker"
      | "taker",
  ): boolean {
    const percent =
      feeKind ===
        "maker"
        ? evidence.makerPercent
        : evidence.takerPercent;

    return Boolean(
      expectedExchange &&
      evidence.exchange ===
        expectedExchange &&
      (
        evidence.market ===
          null ||
        evidence.market ===
          expectedMarket
      ) &&
      Number.isFinite(
        percent,
      ) &&
      percent >=
        0 &&
      percent <
        100 &&
      (
        evidence.expiresAt ===
          null ||
        (
          Number.isSafeInteger(
            evidence.expiresAt,
          ) &&
          evidence.expiresAt >=
            now
        )
      ) &&
      (
        evidence.source ===
          "STATIC_CONFIG" ||
        (
          Number.isSafeInteger(
            evidence.synchronizedAt,
          ) &&
          (
            evidence.synchronizedAt as number
          ) >
            0 &&
          (
            evidence.synchronizedAt as number
          ) <=
            now
        )
      ),
    );
  }

  private hasValidPriceRules(
    capability:
      ExchangeMarketCapability,
  ): boolean {
    const {
      minimumPrice,
      maximumPrice,
      priceStep,
      pricePrecision,
    } = capability.price;

    return Boolean(
      this.isPositive(
        priceStep,
      ) &&
      (
        minimumPrice ===
          null ||
        this.isPositive(
          minimumPrice,
        )
      ) &&
      (
        maximumPrice ===
          null ||
        this.isPositive(
          maximumPrice,
        )
      ) &&
      (
        minimumPrice ===
          null ||
        maximumPrice ===
          null ||
        maximumPrice >=
          minimumPrice
      ) &&
      (
        pricePrecision ===
          null ||
        (
          Number.isSafeInteger(
            pricePrecision,
          ) &&
          pricePrecision >=
            0
        )
      ),
    );
  }

  private isPositive(
    value:
      number | null,
  ): value is number {
    return value !==
      null &&
      Number.isFinite(
        value,
      ) &&
      value >
        0;
  }

  private floorToStep(
    value:
      number,

    step:
      number,
  ): number {
    return this.normalizeNumber(
      Math.floor(
        value /
          step +
        1e-12,
      ) *
      step,
    );
  }

  private ceilToStep(
    value:
      number,

    step:
      number,
  ): number {
    return this.normalizeNumber(
      Math.ceil(
        value /
          step -
        1e-12,
      ) *
      step,
    );
  }

  private normalizeNumber(
    value:
      number,
  ): number {
    return Number(
      value.toPrecision(
        15,
      ),
    );
  }
}

function immutableClone<T>(
  value:
    T,
): T {
  return deepFreeze(
    structuredClone(
      value,
    ),
  );
}

function deepFreeze<T>(
  value:
    T,
): T {
  if (
    value ===
      null ||
    typeof value !==
      "object" ||
    Object.isFrozen(
      value,
    )
  ) {
    return value;
  }

  for (
    const nested
    of Object.values(
      value,
    )
  ) {
    deepFreeze(
      nested,
    );
  }

  return Object.freeze(
    value,
  );
}
