import {
  getExchangeFeeEvidence,
} from "../../arbitrage/config/fees";

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
  | "EXPECTED_NET_THRESHOLD_NOT_MET";

export interface SpotPerpetualBasisRouteEconomics {
  readonly quantity: number;
  readonly spotBuyVwap: number;
  readonly perpetualSellVwap: number;
  readonly grossBasisPercent: number;
  readonly totalFeeQuote: number;
  readonly totalFeePercent: number;
  readonly fundingRate: number;
  readonly expectedFundingQuote: number;
  readonly expectedFundingPercent: number;
  readonly safetyBufferQuote: number;
  readonly safetyBufferPercent: number;
  readonly expectedNetQuote: number;
  readonly expectedNetPercent: number;
  readonly minimumExpectedNetPercent: number;
  readonly thresholdShortfallPercent: number;
}

export interface SpotPerpetualBasisAssessment {
  readonly id: string;
  readonly exchange: string;
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
  getDerivativeFee(exchange: string): DerivativeFeeEvidence | null;
}

const DEFAULT_DEPENDENCIES: SpotPerpetualBasisDependencies = {
  getSpotBook: (exchange, market) => orderBookService.get(exchange, market),
  getDerivativeDepth: (exchange, market, now) => derivativeDepthService.getBook(exchange, market, now),
  getSpotCapability: (exchange, market) => exchangeCapabilityService.getCachedCapability(exchange, market, "spot"),
  getSpotFee: (exchange, market) => getExchangeFeeEvidence(exchange, market),
  getDerivativeFee: (exchange) => derivativeFeeEvidenceService.get(exchange),
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
    const candidates = configuration.enabled
      ? snapshot.markets.filter((market) =>
          configuration.exchanges.includes(market.exchange) &&
          configuration.markets.includes(market.market) &&
          market.product === "LINEAR_PERPETUAL" &&
          market.tradingEnabled,
        )
      : [];
    const assessments = candidates.map((market) =>
      this.evaluateMarket(market, snapshot.generatedAt, configuration, now),
    );

    return immutableClone({
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
    derivative: DerivativeMarketEvidence,
    sourceSnapshotGeneratedAt: number,
    configuration: SpotPerpetualBasisConfiguration,
    now: number,
  ): SpotPerpetualBasisAssessment {
    const blockers = new Set<SpotPerpetualBasisBlocker>();
    const spotBook = this.dependencies.getSpotBook(derivative.exchange, derivative.market);
    const derivativeDepth = this.dependencies.getDerivativeDepth(
      derivative.exchange,
      derivative.market,
      now,
    );
    const spotCapability = this.dependencies.getSpotCapability(
      derivative.exchange,
      derivative.market,
    );
    const spotFee = this.dependencies.getSpotFee(derivative.exchange, derivative.market);
    const derivativeFee = this.dependencies.getDerivativeFee(derivative.exchange);

    if (!spotBook) blockers.add("SPOT_BOOK_MISSING");
    if (!derivativeDepth) blockers.add("DERIVATIVE_DEPTH_MISSING");
    if (!spotCapability) blockers.add("SPOT_CAPABILITY_MISSING");
    if (!spotFee) blockers.add("SPOT_FEE_EVIDENCE_MISSING");
    if (!derivativeFee) blockers.add("DERIVATIVE_FEE_EVIDENCE_MISSING");

    if (!spotBook || !derivativeDepth || !spotCapability || !spotFee || !derivativeFee) {
      return this.blocked(derivative, blockers);
    }

    if (
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
      return this.blocked(derivative, blockers);
    }

    const spotBestAsk = spotBook.asks[0]?.price ?? 0;
    const perpetualBestBid = derivativeDepth.bids[0]?.price ?? 0;

    if (spotBestAsk <= 0 || perpetualBestBid <= 0) {
      blockers.add("DEPTH_INSUFFICIENT");
      return this.blocked(derivative, blockers);
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
      return this.blocked(derivative, blockers);
    }

    const spotFill = vwapCalculator.calculate([...spotBook.asks], quantity);
    const derivativeFill = vwapCalculator.calculate([...derivativeDepth.bids], quantity);

    if (
      spotFill.partialFill || derivativeFill.partialFill ||
      spotFill.filledQuantity < quantity || derivativeFill.filledQuantity < quantity ||
      spotFill.averagePrice <= 0 || derivativeFill.averagePrice <= 0
    ) {
      blockers.add("DEPTH_INSUFFICIENT");
      return this.blocked(derivative, blockers);
    }

    const spotNotional = spotFill.totalCost;
    const perpetualNotional = derivativeFill.totalCost;

    if (
      spotNotional < (spotCapability.notional.minimumNotional ?? Number.POSITIVE_INFINITY) ||
      perpetualNotional < derivative.rules.minimumNotional
    ) {
      blockers.add("MINIMUM_NOTIONAL_NOT_MET");
      return this.blocked(derivative, blockers);
    }

    const totalFeeQuote =
      spotNotional * spotFee.takerPercent / 100 +
      perpetualNotional * derivativeFee.takerPercent / 100;
    const grossBasisQuote = perpetualNotional - spotNotional;
    const expectedFundingQuote = perpetualNotional * derivative.fundingRate;
    const safetyBufferQuote = spotNotional * configuration.safetyBufferPercent / 100;
    const expectedNetQuote =
      grossBasisQuote + expectedFundingQuote - totalFeeQuote - safetyBufferQuote;
    const expectedNetPercent = expectedNetQuote / spotNotional * 100;

    const economics: SpotPerpetualBasisRouteEconomics = {
      quantity,
      spotBuyVwap: spotFill.averagePrice,
      perpetualSellVwap: derivativeFill.averagePrice,
      grossBasisPercent: (derivativeFill.averagePrice - spotFill.averagePrice) /
        spotFill.averagePrice * 100,
      totalFeeQuote,
      totalFeePercent: totalFeeQuote / spotNotional * 100,
      fundingRate: derivative.fundingRate,
      expectedFundingQuote,
      expectedFundingPercent: expectedFundingQuote / spotNotional * 100,
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
      return this.blocked(derivative, blockers, economics);
    }

    const executionReadinessBlockers: SpotPerpetualBasisSignalEvidence["executionReadinessBlockers"] = [
      "POSITION_EVIDENCE_MISSING",
      "MARGIN_EVIDENCE_MISSING",
      "LIQUIDATION_CONTROL_MISSING",
      "REDUCE_ONLY_UNVERIFIED",
      "DERIVATIVE_ADAPTER_MISSING",
    ];
    const evidence: SpotPerpetualBasisSignalEvidence = {
      exchange: derivative.exchange,
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
      safetyBufferQuote,
      expectedNetQuote,
      expectedNetPercent,
      minimumExpectedNetPercent: configuration.minimumExpectedNetPercent,
      spotBookTimestamp: spotBook.timestamp,
      derivativeBookTimestamp: derivativeDepth.sourceTimestamp,
      derivativeTickerTimestamp: derivative.sourceTimestamp,
      maximumObservedSkewMs,
      fullDepthApplied: true,
      marketRulesApplied: true,
      feesApplied: true,
      executionReadinessBlockers,
    };

    return immutableClone({
      id: `${derivative.exchange}:${derivative.market}:${sourceSnapshotGeneratedAt}`,
      exchange: derivative.exchange,
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
    derivative: DerivativeMarketEvidence,
    blockers: ReadonlySet<SpotPerpetualBasisBlocker>,
    economics: SpotPerpetualBasisRouteEconomics | null = null,
  ): SpotPerpetualBasisAssessment {
    return immutableClone({
      id: `${derivative.exchange}:${derivative.market}:${derivative.sourceTimestamp}`,
      exchange: derivative.exchange,
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
}

function quantizeDown(quantity: number, increment: number): number {
  return Math.floor((quantity + Number.EPSILON) / increment) * increment;
}

function isIncrementMultiple(quantity: number, increment: number): boolean {
  const units = quantity / increment;
  return Math.abs(units - Math.round(units)) <= 1e-7;
}

function immutableClone<T>(value: T): T {
  return deepFreeze(structuredClone(value));
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
