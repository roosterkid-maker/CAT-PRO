import {
  getExchangeFeeEvidence,
} from "../../arbitrage/config/fees";
import {derivativeVenueCapabilityRegistry} from "../../derivatives/services/DerivativeVenueCapabilityRegistry";

import type {
  ExchangeFeeEvidence,
} from "../../arbitrage/models/FeeModel";

import type {
  DerivativeDepthEvidence,
} from "../../derivatives/models/DerivativeDepthEvidence";

import type {
  DerivativeFeeEvidence,
} from "../../derivatives/models/DerivativeFeeEvidence";

import type {
  DerivativeMarketDataSnapshot,
  DerivativeMarketEvidence,
} from "../../derivatives/models/DerivativeMarketEvidence";

import {
  derivativeDepthService,
} from "../../derivatives/services/DerivativeDepthService";

import {
  derivativeFeeEvidenceService,
} from "../../derivatives/services/DerivativeFeeEvidenceService";

import type {
  ExchangeMarketCapability,
} from "../../execution/capabilities/models/ExchangeCapability";

import {
  exchangeCapabilityService,
} from "../../execution/capabilities/services/ExchangeCapabilityService";

import {
  vwapCalculator,
} from "../../orderbook/calculators/VWAPCalculator";

import type {
  OrderBook,
} from "../../orderbook/models/OrderBook";

import {
  orderBookService,
} from "../../orderbook/services/OrderBookService";

import type {
  SpotPerpetualBasisSignalEvidence,
} from "../models/StrategySignal";

import type {
  SpotPerpetualBasisConfiguration,
} from "./SpotPerpetualBasisConfiguration";

export type SpotPerpetualBasisBlocker =
  | "SPOT_BOOK_MISSING"
  | "DERIVATIVE_DEPTH_MISSING"
  | "SPOT_CAPABILITY_MISSING"
  | "SPOT_FEE_EVIDENCE_MISSING"
  | "DERIVATIVE_FEE_EVIDENCE_MISSING"
  | "EVIDENCE_STALE"
  | "TIMESTAMP_SKEW_EXCEEDED"
  | "MARKET_IDENTITY_MISMATCH"
  | "MARKET_RULES_INCOMPLETE"
  | "QUANTITY_INVALID"
  | "DEPTH_INSUFFICIENT"
  | "MINIMUM_NOTIONAL_NOT_MET"
  | "MAXIMUM_QUANTITY_EXCEEDED"
  | "FUNDING_TIME_INVALID"
  | "FUNDING_EVIDENCE_MISSING"
  | "EXPECTED_NET_THRESHOLD_NOT_MET";

export interface SpotPerpetualBasisRouteEconomics {
  readonly quantity: number;
  readonly spotBuyVwap: number;
  readonly perpetualSellVwap: number;
  readonly grossBasisPercent: number;
  readonly entryFeeQuote: number;
  readonly exitFeeReserveQuote: number;
  readonly totalFeeQuote: number;
  readonly totalFeePercent: number;
  readonly fundingRate: number;
  readonly expectedFundingQuote: number;
  readonly expectedFundingPercent: number;
  readonly fundingQualificationCreditQuote: number;
  readonly positiveFundingExcludedFromQualification: boolean;
  readonly slippageBufferQuote: number;
  readonly spotSlippageBufferPercent: number;
  readonly perpetualSlippageBufferPercent: number;
  readonly safetyBufferQuote: number;
  readonly safetyBufferPercent: number;
  readonly expectedNetQuote: number;
  readonly expectedNetPercent: number;
  readonly minimumExpectedNetPercent: number;
  readonly thresholdShortfallPercent: number;
}

export interface SpotPerpetualBasisAssessment {
  readonly id: string;
  readonly spotExchange: string;
  readonly perpetualExchange: string;
  readonly market: string;
  readonly status: "QUALIFIED" | "BLOCKED";
  readonly blockers: readonly SpotPerpetualBasisBlocker[];
  readonly economics: SpotPerpetualBasisRouteEconomics | null;
  readonly evidence: SpotPerpetualBasisSignalEvidence | null;
  readonly executionAuthorized: false;
  readonly automaticExecutionAllowed: false;
}

export interface SpotPerpetualBasisEconomicsSnapshot {
  readonly generatedAt: number;
  readonly sourceSnapshotGeneratedAt: number;
  readonly evaluatedRoutes: number;
  readonly qualifiedRoutes: number;
  readonly blockedRoutes: number;
  readonly assessments: readonly SpotPerpetualBasisAssessment[];
  readonly safety: {
    readonly expectedFundingNotGuaranteed: true;
    readonly shadowOnly: true;
    readonly positionEvidenceRequiredBeforeExecution: true;
    readonly marginEvidenceRequiredBeforeExecution: true;
    readonly liquidationControlRequiredBeforeExecution: true;
    readonly paperExecutionAllowed: false;
    readonly liveExecutionAllowed: false;
    readonly orderSubmissionAllowed: false;
  };
}

export interface SpotPerpetualBasisDependencies {
  getSpotBook(exchange: string, market: string): OrderBook | null;
  getDerivativeDepth(exchange: string, market: string, now: number): DerivativeDepthEvidence | null;
  getSpotCapability(exchange: string, market: string): ExchangeMarketCapability | null;
  getSpotFee(exchange: string, market: string): ExchangeFeeEvidence | null;
  getDerivativeFee(exchange: string, market: string): DerivativeFeeEvidence | null;
}

interface SpotPerpetualBasisEvaluationCache {
  readonly spotBooks: Map<string, OrderBook | null>;
  readonly derivativeDepth: Map<string, DerivativeDepthEvidence | null>;
  readonly spotCapabilities: Map<string, ExchangeMarketCapability | null>;
  readonly spotFees: Map<string, ExchangeFeeEvidence | null>;
  readonly derivativeFees: Map<string, DerivativeFeeEvidence | null>;
}

const DEFAULT_DEPENDENCIES: SpotPerpetualBasisDependencies = {
  getSpotBook: (exchange, market) => orderBookService.get(exchange, market),
  getDerivativeDepth: (exchange, market, now) => derivativeDepthService.getBook(exchange, market, now),
  getSpotCapability: (exchange, market) => exchangeCapabilityService.getCachedCapability(exchange, market, "spot"),
  getSpotFee: (exchange, market) => getExchangeFeeEvidence(exchange, market),
  getDerivativeFee: (exchange, market) => derivativeFeeEvidenceService.getForMarket(exchange, market),
};

export class SpotPerpetualBasisEconomicsEngine {
  private readonly dependencies: SpotPerpetualBasisDependencies;

  constructor(dependencies: Partial<SpotPerpetualBasisDependencies> = {}) {
    this.dependencies = {...DEFAULT_DEPENDENCIES, ...dependencies};
  }

  evaluate(
    snapshot: DerivativeMarketDataSnapshot,
    configuration: SpotPerpetualBasisConfiguration,
    now = Date.now(),
  ): SpotPerpetualBasisEconomicsSnapshot {
    const assessments: SpotPerpetualBasisAssessment[] = [];

    if (configuration.enabled) {
      const configuredPerpetualExchanges = new Set(configuration.perpetualExchanges);
      const configuredMarkets = new Set(configuration.markets);
      const cache: SpotPerpetualBasisEvaluationCache = {
        spotBooks: new Map(),
        derivativeDepth: new Map(),
        spotCapabilities: new Map(),
        spotFees: new Map(),
        derivativeFees: new Map(),
      };

      for (const market of snapshot.markets) {
        if (
          !configuredPerpetualExchanges.has(market.exchange) ||
          !configuredMarkets.has(market.market) ||
          market.product !== "LINEAR_PERPETUAL" ||
          !market.tradingEnabled
        ) {
          continue;
        }

        for (const spotExchange of configuration.spotExchanges) {
          if (!derivativeVenueCapabilityRegistry.supports(spotExchange, market.exchange)) {
            continue;
          }

          assessments.push(this.evaluateMarket(
            spotExchange,
            market,
            snapshot.generatedAt,
            configuration,
            now,
            cache,
          ));
        }
      }
    }

    return deepFreeze({
      generatedAt: now,
      sourceSnapshotGeneratedAt: snapshot.generatedAt,
      evaluatedRoutes: assessments.length,
      qualifiedRoutes: assessments.filter((item) => item.status === "QUALIFIED").length,
      blockedRoutes: assessments.filter((item) => item.status === "BLOCKED").length,
      assessments,
      safety: {
        expectedFundingNotGuaranteed: true,
        shadowOnly: true,
        positionEvidenceRequiredBeforeExecution: true,
        marginEvidenceRequiredBeforeExecution: true,
        liquidationControlRequiredBeforeExecution: true,
        paperExecutionAllowed: false,
        liveExecutionAllowed: false,
        orderSubmissionAllowed: false,
      },
    });
  }

  private evaluateMarket(
    spotExchange: string,
    derivative: DerivativeMarketEvidence,
    sourceSnapshotGeneratedAt: number,
    configuration: SpotPerpetualBasisConfiguration,
    now: number,
    cache: SpotPerpetualBasisEvaluationCache,
  ): SpotPerpetualBasisAssessment {
    const blockers = new Set<SpotPerpetualBasisBlocker>();
    const spotKey = `${spotExchange}:${derivative.market}`;
    const derivativeKey = `${derivative.exchange}:${derivative.market}`;
    const spotBook = this.getCached(cache.spotBooks, spotKey,
      () => this.dependencies.getSpotBook(spotExchange, derivative.market));
    const derivativeDepth = this.getCached(cache.derivativeDepth, derivativeKey,
      () => this.dependencies.getDerivativeDepth(derivative.exchange, derivative.market, now));
    const spotCapability = this.getCached(cache.spotCapabilities, spotKey,
      () => this.dependencies.getSpotCapability(spotExchange, derivative.market));
    const spotFee = this.getCached(cache.spotFees, spotKey,
      () => this.dependencies.getSpotFee(spotExchange, derivative.market));
    const derivativeFee = this.getCached(cache.derivativeFees, derivativeKey,
      () => this.dependencies.getDerivativeFee(derivative.exchange, derivative.market));

    if (!spotBook) blockers.add("SPOT_BOOK_MISSING");
    if (!derivativeDepth) blockers.add("DERIVATIVE_DEPTH_MISSING");
    if (!spotCapability) blockers.add("SPOT_CAPABILITY_MISSING");
    if (!spotFee) blockers.add("SPOT_FEE_EVIDENCE_MISSING");
    if (!derivativeFee) blockers.add("DERIVATIVE_FEE_EVIDENCE_MISSING");
    if (derivative.fundingEvidence === "UNAVAILABLE") blockers.add("FUNDING_EVIDENCE_MISSING");

    if (!spotBook || !derivativeDepth || !spotCapability || !spotFee || !derivativeFee) {
      return this.blocked(spotExchange, derivative, blockers);
    }

    if (
      spotBook.exchange.trim().toLowerCase() !== spotExchange ||
      spotBook.market.trim().toUpperCase() !== derivative.market ||
      spotCapability.exchange.trim().toLowerCase() !== spotExchange ||
      spotCapability.market.trim().toUpperCase() !== derivative.market ||
      spotFee.exchange.trim().toLowerCase() !== spotExchange ||
      (spotFee.market !== null && spotFee.market.trim().toUpperCase() !== derivative.market) ||
      derivativeDepth.exchange.trim().toLowerCase() !== derivative.exchange ||
      derivativeDepth.market.trim().toUpperCase() !== derivative.market ||
      derivativeFee.exchange.trim().toLowerCase() !== derivative.exchange ||
      spotCapability.baseAsset !== derivative.baseAsset ||
      spotCapability.quoteAsset !== derivative.quoteAsset ||
      derivative.quoteAsset !== derivative.settleAsset
    ) {
      blockers.add("MARKET_IDENTITY_MISMATCH");
    }

    /*
     * Exchange source clocks are not guaranteed
     * to match the local clock (Bybit can report a
     * source time slightly in the future). Freshness
     * and cross-source synchronization therefore use
     * local observation times for REST evidence.
     * Raw source timestamps remain in the published
     * economics evidence for auditability.
     */
    const timestamps = [
      spotBook.timestamp,
      derivativeDepth.observedAt,
      derivative.observedAt,
    ];

    if (timestamps.some((timestamp) =>
      !Number.isFinite(timestamp) || timestamp <= 0 || timestamp > now ||
      now - timestamp > configuration.maximumEvidenceAgeMs,
    )) {
      blockers.add("EVIDENCE_STALE");
    }

    const maximumObservedSkewMs = Math.max(...timestamps) - Math.min(...timestamps);

    if (maximumObservedSkewMs > configuration.maximumTimestampSkewMs) {
      blockers.add("TIMESTAMP_SKEW_EXCEEDED");
    }

    if (derivative.nextFundingTime <= now) {
      blockers.add("FUNDING_TIME_INVALID");
    }

    const spotStep = this.quantityStep(spotCapability);
    const derivativeStep = derivative.rules.quantityStep;

    if (
      spotStep === null ||
      !Number.isFinite(derivativeStep) || derivativeStep <= 0 ||
      spotCapability.notional.minimumNotional === null ||
      !Number.isFinite(derivative.rules.minimumNotional) || derivative.rules.minimumNotional <= 0
    ) {
      blockers.add("MARKET_RULES_INCOMPLETE");
    }

    if (blockers.size > 0 || spotStep === null) {
      return this.blocked(spotExchange, derivative, blockers);
    }

    const spotBestAsk = spotBook.asks[0]?.price ?? 0;
    const perpetualBestBid = derivativeDepth.bids[0]?.price ?? 0;

    if (spotBestAsk <= 0 || perpetualBestBid <= 0) {
      blockers.add("DEPTH_INSUFFICIENT");
      return this.blocked(spotExchange, derivative, blockers);
    }

    let quantity = configuration.targetQuoteCapital / spotBestAsk;
    quantity = quantizeDown(quantity, derivativeStep);
    quantity = quantizeDown(quantity, spotStep);
    quantity = quantizeDown(quantity, derivativeStep);

    if (
      !Number.isFinite(quantity) || quantity <= 0 ||
      !isIncrementMultiple(quantity, spotStep) ||
      !isIncrementMultiple(quantity, derivativeStep) ||
      (spotCapability.quantity.minimumQuantity !== null &&
        quantity < spotCapability.quantity.minimumQuantity) ||
      quantity < derivative.rules.minimumQuantity
    ) {
      blockers.add("QUANTITY_INVALID");
    }

    if (
      (spotCapability.quantity.maximumQuantity !== null &&
        quantity > spotCapability.quantity.maximumQuantity) ||
      quantity > derivative.rules.maximumMarketQuantity
    ) {
      blockers.add("MAXIMUM_QUANTITY_EXCEEDED");
    }

    if (blockers.size > 0) {
      return this.blocked(spotExchange, derivative, blockers);
    }

    const spotFill = vwapCalculator.calculate(spotBook.asks, quantity);
    const derivativeFill = vwapCalculator.calculate(derivativeDepth.bids, quantity);

    if (
      spotFill.partialFill || derivativeFill.partialFill ||
      spotFill.filledQuantity < quantity || derivativeFill.filledQuantity < quantity ||
      spotFill.averagePrice <= 0 || derivativeFill.averagePrice <= 0
    ) {
      blockers.add("DEPTH_INSUFFICIENT");
      return this.blocked(spotExchange, derivative, blockers);
    }

    const spotNotional = spotFill.totalCost;
    const perpetualNotional = derivativeFill.totalCost;

    if (
      spotNotional < (spotCapability.notional.minimumNotional ?? Number.POSITIVE_INFINITY) ||
      perpetualNotional < derivative.rules.minimumNotional
    ) {
      blockers.add("MINIMUM_NOTIONAL_NOT_MET");
      return this.blocked(spotExchange, derivative, blockers);
    }

    const entryFeeQuote =
      spotNotional * spotFee.takerPercent / 100 +
      perpetualNotional * derivativeFee.takerPercent / 100;
    /*
     * A basis trade realizes nothing until both positions are closed. Reserve
     * the same explicit taker rates for the exit instead of presenting entry
     * fees as the whole lifecycle cost.
     */
    const exitFeeReserveQuote =
      spotNotional * spotFee.takerPercent / 100 +
      perpetualNotional * derivativeFee.takerPercent / 100;
    const totalFeeQuote = entryFeeQuote + exitFeeReserveQuote;
    const grossBasisQuote = perpetualNotional - spotNotional;
    const expectedFundingQuote = perpetualNotional * derivative.fundingRate;
    /* Positive funding is forecast evidence, not a guaranteed receipt. */
    const fundingQualificationCreditQuote = Math.min(0, expectedFundingQuote);
    const slippageBufferQuote =
      spotNotional * configuration.spotSlippageBufferPercent / 100 +
      perpetualNotional * configuration.perpetualSlippageBufferPercent / 100;
    const safetyBufferQuote = spotNotional * configuration.safetyBufferPercent / 100;
    const expectedNetQuote =
      grossBasisQuote + fundingQualificationCreditQuote - totalFeeQuote -
      slippageBufferQuote - safetyBufferQuote;
    const expectedNetPercent = expectedNetQuote / spotNotional * 100;

    const economics: SpotPerpetualBasisRouteEconomics = {
      quantity,
      spotBuyVwap: spotFill.averagePrice,
      perpetualSellVwap: derivativeFill.averagePrice,
      grossBasisPercent: (derivativeFill.averagePrice - spotFill.averagePrice) /
        spotFill.averagePrice * 100,
      entryFeeQuote,
      exitFeeReserveQuote,
      totalFeeQuote,
      totalFeePercent: totalFeeQuote / spotNotional * 100,
      fundingRate: derivative.fundingRate,
      expectedFundingQuote,
      expectedFundingPercent: expectedFundingQuote / spotNotional * 100,
      fundingQualificationCreditQuote,
      positiveFundingExcludedFromQualification: expectedFundingQuote > 0,
      slippageBufferQuote,
      spotSlippageBufferPercent: configuration.spotSlippageBufferPercent,
      perpetualSlippageBufferPercent: configuration.perpetualSlippageBufferPercent,
      safetyBufferQuote,
      safetyBufferPercent: configuration.safetyBufferPercent,
      expectedNetQuote,
      expectedNetPercent,
      minimumExpectedNetPercent: configuration.minimumExpectedNetPercent,
      thresholdShortfallPercent: Math.max(
        0,
        configuration.minimumExpectedNetPercent - expectedNetPercent,
      ),
    };

    if (!Number.isFinite(expectedNetPercent) || expectedNetPercent < configuration.minimumExpectedNetPercent) {
      blockers.add("EXPECTED_NET_THRESHOLD_NOT_MET");
      return this.blocked(spotExchange, derivative, blockers, economics);
    }

    const executionReadinessBlockers: SpotPerpetualBasisSignalEvidence["executionReadinessBlockers"] = [
      "POSITION_EVIDENCE_MISSING",
      "MARGIN_EVIDENCE_MISSING",
      "LIQUIDATION_CONTROL_MISSING",
      "REDUCE_ONLY_UNVERIFIED",
      "DERIVATIVE_ADAPTER_MISSING",
    ];
    const evidence: SpotPerpetualBasisSignalEvidence = {
      spotExchange,
      perpetualExchange: derivative.exchange,
      market: derivative.market,
      direction: "LONG_SPOT_SHORT_PERPETUAL",
      quantity,
      spotBestAsk,
      spotBuyVwap: spotFill.averagePrice,
      perpetualBestBid,
      perpetualSellVwap: derivativeFill.averagePrice,
      grossBasisPercent: (derivativeFill.averagePrice - spotFill.averagePrice) /
        spotFill.averagePrice * 100,
      spotSlippagePercent: (spotFill.averagePrice - spotBestAsk) / spotBestAsk * 100,
      perpetualSlippagePercent: (perpetualBestBid - derivativeFill.averagePrice) /
        perpetualBestBid * 100,
      spotFeePercent: spotFee.takerPercent,
      derivativeFeePercent: derivativeFee.takerPercent,
      totalFeeQuote,
      fundingRate: derivative.fundingRate,
      nextFundingTime: derivative.nextFundingTime,
      expectedFundingQuote,
      expectedFundingIsGuaranteed: false,
      fundingQualificationCreditQuote,
      positiveFundingExcludedFromQualification: expectedFundingQuote > 0,
      entryFeeQuote,
      exitFeeReserveQuote,
      roundTripFeeQuote: totalFeeQuote,
      slippageBufferQuote,
      spotSlippageBufferPercent: configuration.spotSlippageBufferPercent,
      perpetualSlippageBufferPercent: configuration.perpetualSlippageBufferPercent,
      safetyBufferQuote,
      expectedNetQuote,
      expectedNetPercent,
      minimumExpectedNetPercent: configuration.minimumExpectedNetPercent,
      closeAtOrBelowAbsoluteBasisPercent: configuration.closeAtOrBelowAbsoluteBasisPercent,
      nextOpeningDelayMs: configuration.nextOpeningDelayMs,
      perpetualLeverage: configuration.perpetualLeverage,
      spotBookTimestamp: spotBook.timestamp,
      derivativeBookTimestamp: derivativeDepth.sourceTimestamp,
      derivativeTickerTimestamp: derivative.sourceTimestamp,
      maximumObservedSkewMs,
      fullDepthApplied: true,
      marketRulesApplied: true,
      feesApplied: true,
      executionReadinessBlockers,
    };

    return deepFreeze({
      id: `${spotExchange}:${derivative.exchange}:${derivative.market}:${sourceSnapshotGeneratedAt}`,
      spotExchange,
      perpetualExchange: derivative.exchange,
      market: derivative.market,
      status: "QUALIFIED",
      blockers: [],
      economics,
      evidence,
      executionAuthorized: false,
      automaticExecutionAllowed: false,
    });
  }

  private blocked(
    spotExchange: string,
    derivative: DerivativeMarketEvidence,
    blockers: ReadonlySet<SpotPerpetualBasisBlocker>,
    economics: SpotPerpetualBasisRouteEconomics | null = null,
  ): SpotPerpetualBasisAssessment {
    return deepFreeze({
      id: `${spotExchange}:${derivative.exchange}:${derivative.market}:${derivative.sourceTimestamp}`,
      spotExchange,
      perpetualExchange: derivative.exchange,
      market: derivative.market,
      status: "BLOCKED",
      blockers: [...blockers],
      economics,
      evidence: null,
      executionAuthorized: false,
      automaticExecutionAllowed: false,
    });
  }

  private quantityStep(capability: ExchangeMarketCapability): number | null {
    if (
      capability.quantity.quantityStep !== null &&
      Number.isFinite(capability.quantity.quantityStep) &&
      capability.quantity.quantityStep > 0
    ) {
      return capability.quantity.quantityStep;
    }

    const precision = capability.quantity.quantityPrecision;
    return precision !== null && Number.isSafeInteger(precision) && precision >= 0 && precision <= 18
      ? 10 ** -precision
      : null;
  }

  private getCached<T>(
    cache: Map<string, T>,
    key: string,
    load: () => T,
  ): T {
    if (cache.has(key)) {
      return cache.get(key) as T;
    }

    const value = load();
    cache.set(key, value);
    return value;
  }
}

function quantizeDown(quantity: number, increment: number): number {
  return Math.floor((quantity + Number.EPSILON) / increment) * increment;
}

function isIncrementMultiple(quantity: number, increment: number): boolean {
  const units = quantity / increment;
  return Math.abs(units - Math.round(units)) <= 1e-7;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const nested of Object.values(value)) {
    deepFreeze(nested);
  }
  return Object.freeze(value);
}
