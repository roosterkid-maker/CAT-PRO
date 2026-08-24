import type {
  DerivativeDepthEvidence,
} from "../../derivatives/models/DerivativeDepthEvidence";

import {
  getExchangeFeeEvidence,
} from "../../arbitrage/config/fees";

import type {
  ExchangeFeeEvidence,
} from "../../arbitrage/models/FeeModel";

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

import {
  vwapCalculator,
} from "../../orderbook/calculators/VWAPCalculator";

import type {
  ExchangeMarketCapability,
} from "../../execution/capabilities/models/ExchangeCapability";

import {
  exchangeCapabilityService,
} from "../../execution/capabilities/services/ExchangeCapabilityService";

import type {
  OrderBook,
} from "../../orderbook/models/OrderBook";

import {
  orderBookService,
} from "../../orderbook/services/OrderBookService";

import {
  commonExecutableQuantityIncrement,
  roundDownToExecutableIncrement,
} from "../../trading/execution/ExecutableQuantityIncrement";

import type {
  FundingRateArbitrageSignalEvidence,
} from "../models/StrategySignal";

import type {
  FundingRateArbitrageConfiguration,
} from "./FundingRateArbitrageConfiguration";

export type FundingRateArbitrageBlocker =
  | "SPOT_BOOK_MISSING"
  | "SPOT_CAPABILITY_MISSING"
  | "SPOT_FEE_EVIDENCE_MISSING"
  | "DERIVATIVE_DEPTH_MISSING"
  | "DERIVATIVE_FEE_EVIDENCE_MISSING"
  | "MARKET_IDENTITY_MISMATCH"
  | "EVIDENCE_STALE"
  | "EVIDENCE_SKEW_EXCEEDED"
  | "FUNDING_INTERVAL_INVALID"
  | "FUNDING_TIME_INVALID"
  | "FUNDING_TIME_SKEW_EXCEEDED"
  | "FUNDING_DIFFERENTIAL_TOO_LOW"
  | "FUNDING_CARRY_HORIZON_EXCEEDED"
  | "MARKET_RULES_INCOMPLETE"
  | "QUANTITY_INVALID"
  | "MAXIMUM_QUANTITY_EXCEEDED"
  | "DEPTH_INSUFFICIENT"
  | "MINIMUM_NOTIONAL_NOT_MET"
  | "EXPECTED_NET_THRESHOLD_NOT_MET";

export interface FundingRateArbitrageDifferentialDiagnostics {
  readonly routeKind: "CROSS_PERPETUAL" | "INTRA_SPOT_PERPETUAL";
  readonly market: string;
  readonly longExchange: string;
  readonly shortExchange: string;
  readonly longFundingRate: number;
  readonly shortFundingRate: number;
  readonly longNormalizedDailyFundingRate: number;
  readonly shortNormalizedDailyFundingRate: number;
  readonly fundingDifferentialPercent: number;
  readonly minimumFundingDifferentialPercent: number;
  readonly longFundingIntervalMinutes: number;
  readonly shortFundingIntervalMinutes: number;
  readonly nextFundingTimeLong: number;
  readonly nextFundingTimeShort: number;
  readonly fundingTimeSkewMs: number;
}

export interface FundingRateArbitrageRouteEconomics {
  readonly quantity: number;
  readonly longEntryVwap: number;
  readonly shortEntryVwap: number;
  readonly longNotional: number;
  readonly shortNotional: number;
  readonly referenceNotional: number;
  readonly singlePeriodExpectedFundingQuote: number;
  readonly singlePeriodExpectedFundingPercent: number;
  readonly modeledFundingPeriods: number;
  readonly modeledLongFundingPeriods: number;
  readonly modeledShortFundingPeriods: number;
  readonly minimumQualifyingFundingPeriods: number;
  readonly maximumFundingPeriodsToCapture: number;
  readonly projectedHoldingTimeMs: number;
  readonly expectedFundingQuote: number;
  readonly expectedFundingPercent: number;
  readonly entryBasisCostQuote: number;
  readonly entryBasisCostPercent: number;
  readonly roundTripFeeQuote: number;
  readonly roundTripFeePercent: number;
  readonly safetyBufferQuote: number;
  readonly safetyBufferPercent: number;
  readonly slippageReserveQuote: number;
  readonly slippageReservePercent: number;
  readonly expectedNetQuote: number;
  readonly expectedNetPercent: number;
  readonly minimumExpectedNetPercent: number;
  readonly thresholdShortfallPercent: number;
}

export interface FundingRateArbitrageAssessment {
  readonly id: string;
  readonly routeKind: "CROSS_PERPETUAL" | "INTRA_SPOT_PERPETUAL";
  readonly market: string;
  readonly firstExchange: string;
  readonly secondExchange: string;
  readonly status: "QUALIFIED" | "BLOCKED";
  readonly blockers: readonly FundingRateArbitrageBlocker[];
  readonly differential: FundingRateArbitrageDifferentialDiagnostics;
  readonly economics: FundingRateArbitrageRouteEconomics | null;
  readonly evidence: FundingRateArbitrageSignalEvidence | null;
  readonly executionAuthorized: false;
  readonly automaticExecutionAllowed: false;
}

export interface FundingRateArbitrageEconomicsSnapshot {
  readonly generatedAt: number;
  readonly sourceSnapshotGeneratedAt: number;
  readonly evaluatedRoutes: number;
  readonly qualifiedRoutes: number;
  readonly blockedRoutes: number;
  readonly assessments: readonly FundingRateArbitrageAssessment[];
  readonly safety: {
    readonly expectedFundingNotGuaranteed: true;
    readonly crossPerpetualAndIntraSpotPerpetualOnly: true;
    readonly favorableEntryBasisExcluded: true;
    readonly roundTripFeesReserved: true;
    readonly shadowOnly: true;
    readonly positionEvidenceRequiredBeforeExecution: true;
    readonly marginEvidenceRequiredBeforeExecution: true;
    readonly liquidationControlRequiredBeforeExecution: true;
    readonly paperExecutionAllowed: false;
    readonly liveExecutionAllowed: false;
    readonly orderSubmissionAllowed: false;
  };
}

export interface FundingRateArbitrageDependencies {
  getDerivativeDepth(exchange: string, market: string, now: number): DerivativeDepthEvidence | null;
  getDerivativeFee(exchange: string, market?: string): DerivativeFeeEvidence | null;
  getSpotBook(exchange: string, market: string): OrderBook | null;
  getSpotCapability(exchange: string, market: string): ExchangeMarketCapability | null;
  getSpotFee(exchange: string, market: string): ExchangeFeeEvidence | null;
}

const DEFAULT_DEPENDENCIES: FundingRateArbitrageDependencies = {
  getDerivativeDepth: (exchange, market, now) =>
    derivativeDepthService.getBook(exchange, market, now),
  getDerivativeFee: (exchange, market) => market
    ? derivativeFeeEvidenceService.getForMarket(exchange, market)
    : derivativeFeeEvidenceService.get(exchange),
  getSpotBook: (exchange, market) => orderBookService.get(exchange, market),
  getSpotCapability: (exchange, market) =>
    exchangeCapabilityService.getCachedCapability(exchange, market, "spot"),
  getSpotFee: (exchange, market) => getExchangeFeeEvidence(exchange, market),
};

export class FundingRateArbitrageEconomicsEngine {
  private readonly dependencies: FundingRateArbitrageDependencies;

  constructor(dependencies: Partial<FundingRateArbitrageDependencies> = {}) {
    this.dependencies = {...DEFAULT_DEPENDENCIES, ...dependencies};
  }

  evaluate(
    snapshot: DerivativeMarketDataSnapshot,
    configuration: FundingRateArbitrageConfiguration,
    now = Date.now(),
  ): FundingRateArbitrageEconomicsSnapshot {
    const candidates = configuration.enabled
      ? snapshot.markets.filter((market) =>
          configuration.exchanges.includes(market.exchange) &&
          configuration.markets.includes(market.market) &&
          market.product === "LINEAR_PERPETUAL" &&
          market.tradingEnabled,
        )
      : [];
    const grouped = new Map<string, DerivativeMarketEvidence[]>();
    for (const market of candidates) {
      const group = grouped.get(market.market) ?? [];
      group.push(market);
      grouped.set(market.market, group);
    }

    const assessments: FundingRateArbitrageAssessment[] = [];
    if (configuration.routeModes.includes("CROSS_PERPETUAL")) {
      for (const markets of grouped.values()) {
        const sorted = [...markets].sort((a, b) => a.exchange.localeCompare(b.exchange));
        for (let firstIndex = 0; firstIndex < sorted.length; firstIndex += 1) {
          for (let secondIndex = firstIndex + 1; secondIndex < sorted.length; secondIndex += 1) {
            const first = sorted[firstIndex];
            const second = sorted[secondIndex];
            if (first && second) {
              assessments.push(this.evaluatePair(
                first,
                second,
                snapshot.generatedAt,
                configuration,
                now,
              ));
            }
          }
        }
      }
    }
    if (configuration.routeModes.includes("INTRA_SPOT_PERPETUAL")) {
      for (const derivative of candidates) {
        if (!configuration.spotExchanges.includes(derivative.exchange)) continue;
        assessments.push(this.evaluateIntraSpotPerpetual(
          derivative,
          snapshot.generatedAt,
          configuration,
          now,
        ));
      }
    }

    assessments.sort(compareAssessmentsByExpectedNet);

    return immutableClone({
      generatedAt: now,
      sourceSnapshotGeneratedAt: snapshot.generatedAt,
      evaluatedRoutes: assessments.length,
      qualifiedRoutes: assessments.filter((item) => item.status === "QUALIFIED").length,
      blockedRoutes: assessments.filter((item) => item.status === "BLOCKED").length,
      assessments,
      safety: {
        expectedFundingNotGuaranteed: true,
        crossPerpetualAndIntraSpotPerpetualOnly: true,
        favorableEntryBasisExcluded: true,
        roundTripFeesReserved: true,
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

  private evaluatePair(
    first: DerivativeMarketEvidence,
    second: DerivativeMarketEvidence,
    sourceSnapshotGeneratedAt: number,
    configuration: FundingRateArbitrageConfiguration,
    now: number,
  ): FundingRateArbitrageAssessment {
    const blockers = new Set<FundingRateArbitrageBlocker>();
    const firstNormalizedDailyRate = normalizedDailyFundingRate(first);
    const secondNormalizedDailyRate = normalizedDailyFundingRate(second);
    const normalizedRatesValid = Number.isFinite(firstNormalizedDailyRate) &&
      Number.isFinite(secondNormalizedDailyRate);
    const long = normalizedRatesValid
      ? (firstNormalizedDailyRate <= secondNormalizedDailyRate ? first : second)
      : (first.fundingRate <= second.fundingRate ? first : second);
    const short = long === first ? second : first;
    const longNormalizedDailyRate = normalizedDailyFundingRate(long);
    const shortNormalizedDailyRate = normalizedDailyFundingRate(short);
    const fundingTimeSkewMs = Math.abs(first.nextFundingTime - second.nextFundingTime);
    const fundingDifferentialPercent =
      (shortNormalizedDailyRate - longNormalizedDailyRate) * 100;
    const differential: FundingRateArbitrageDifferentialDiagnostics = {
      routeKind: "CROSS_PERPETUAL",
      market: long.market,
      longExchange: long.exchange,
      shortExchange: short.exchange,
      longFundingRate: long.fundingRate,
      shortFundingRate: short.fundingRate,
      longNormalizedDailyFundingRate: longNormalizedDailyRate,
      shortNormalizedDailyFundingRate: shortNormalizedDailyRate,
      fundingDifferentialPercent,
      minimumFundingDifferentialPercent: configuration.minimumFundingDifferentialPercent,
      longFundingIntervalMinutes: long.fundingIntervalMinutes,
      shortFundingIntervalMinutes: short.fundingIntervalMinutes,
      nextFundingTimeLong: long.nextFundingTime,
      nextFundingTimeShort: short.nextFundingTime,
      fundingTimeSkewMs,
    };
    const longDepth = this.dependencies.getDerivativeDepth(long.exchange, long.market, now);
    const shortDepth = this.dependencies.getDerivativeDepth(short.exchange, short.market, now);
    const longFee = this.dependencies.getDerivativeFee(long.exchange, long.market);
    const shortFee = this.dependencies.getDerivativeFee(short.exchange, short.market);

    if (!longDepth || !shortDepth) blockers.add("DERIVATIVE_DEPTH_MISSING");
    if (!longFee || !shortFee) blockers.add("DERIVATIVE_FEE_EVIDENCE_MISSING");
    if (!longDepth || !shortDepth || !longFee || !shortFee) {
      return this.blocked(first, second, blockers, differential);
    }

    if (
      first.market !== second.market ||
      first.baseAsset !== second.baseAsset ||
      first.quoteAsset !== second.quoteAsset ||
      first.settleAsset !== second.settleAsset ||
      longDepth.market !== long.market ||
      shortDepth.market !== short.market ||
      longDepth.exchange !== long.exchange ||
      shortDepth.exchange !== short.exchange
    ) {
      blockers.add("MARKET_IDENTITY_MISMATCH");
    }

    /*
     * CAT PRO's local observations are the freshness clock. Raw venue clocks
     * remain independently bounded against their observations so a small
     * positive exchange-clock skew is accepted without allowing genuinely old
     * or wildly future source evidence into an assessment.
     */
    const timestamps = [
      first.observedAt,
      second.observedAt,
      longDepth.observedAt,
      shortDepth.observedAt,
      sourceSnapshotGeneratedAt,
    ];
    if (timestamps.some((timestamp) =>
      !Number.isFinite(timestamp) || timestamp <= 0 || timestamp > now ||
      now - timestamp > configuration.maximumEvidenceAgeMs,
    )) {
      blockers.add("EVIDENCE_STALE");
    }
    const sourceObservationPairs: ReadonlyArray<readonly [number, number]> = [
      [first.sourceTimestamp, first.observedAt],
      [second.sourceTimestamp, second.observedAt],
      [longDepth.sourceTimestamp, longDepth.observedAt],
      [shortDepth.sourceTimestamp, shortDepth.observedAt],
    ];
    if (sourceObservationPairs.some(([sourceTimestamp, observedAt]) =>
      !Number.isFinite(sourceTimestamp) || sourceTimestamp <= 0 ||
      Math.abs(sourceTimestamp - observedAt) > configuration.maximumEvidenceAgeMs,
    )) {
      blockers.add("EVIDENCE_STALE");
    }
    const maximumObservedEvidenceSkewMs = Math.max(...timestamps) - Math.min(...timestamps);
    if (maximumObservedEvidenceSkewMs > configuration.maximumEvidenceSkewMs) {
      blockers.add("EVIDENCE_SKEW_EXCEEDED");
    }

    if (!validPositive(first.fundingIntervalMinutes) ||
        !validPositive(second.fundingIntervalMinutes)) blockers.add("FUNDING_INTERVAL_INVALID");
    if (!Number.isSafeInteger(first.nextFundingTime) ||
        !Number.isSafeInteger(second.nextFundingTime) ||
        first.nextFundingTime <= now || second.nextFundingTime <= now) {
      blockers.add("FUNDING_TIME_INVALID");
    }
    /*
     * Do not require the two venues to settle at the same instant. Funding
     * venues commonly use different intervals and offset settlement clocks.
     * Admission is instead based on the exact, independently timestamped
     * payment sequence modeled below. `maximumFundingTimeSkewMs` remains in
     * the configuration and diagnostics for persisted-config compatibility;
     * it is not an execution gate once every crossed payment is accounted.
     */

    if (
      !Number.isFinite(fundingDifferentialPercent) ||
      fundingDifferentialPercent < configuration.minimumFundingDifferentialPercent
    ) {
      blockers.add("FUNDING_DIFFERENTIAL_TOO_LOW");
    }

    const longStep = long.rules.quantityStep;
    const shortStep = short.rules.quantityStep;
    const commonQuantityStep = commonExecutableQuantityIncrement([longStep, shortStep]);
    if (
      !validPositive(longStep) || !validPositive(shortStep) ||
      commonQuantityStep === null ||
      !validPositive(long.rules.minimumQuantity) ||
      !validPositive(short.rules.minimumQuantity) ||
      !validPositive(long.rules.minimumNotional) ||
      !validPositive(short.rules.minimumNotional)
    ) {
      blockers.add("MARKET_RULES_INCOMPLETE");
    }
    if ([...blockers].some((blocker) => blocker !== "FUNDING_DIFFERENTIAL_TOO_LOW")) {
      return this.blocked(first, second, blockers, differential);
    }

    const longBestAsk = longDepth.asks[0]?.price ?? 0;
    const shortBestBid = shortDepth.bids[0]?.price ?? 0;
    if (!validPositive(longBestAsk) || !validPositive(shortBestBid)) {
      blockers.add("DEPTH_INSUFFICIENT");
      return this.blocked(first, second, blockers, differential);
    }

    const quantity = roundDownToExecutableIncrement(
      configuration.targetQuoteNotional / Math.max(longBestAsk, shortBestBid),
      commonQuantityStep!,
    );

    if (
      !validPositive(quantity) ||
      !incrementMultiple(quantity, longStep) ||
      !incrementMultiple(quantity, shortStep) ||
      quantity < long.rules.minimumQuantity ||
      quantity < short.rules.minimumQuantity
    ) {
      blockers.add("QUANTITY_INVALID");
    }
    if (
      quantity > long.rules.maximumMarketQuantity ||
      quantity > short.rules.maximumMarketQuantity
    ) {
      blockers.add("MAXIMUM_QUANTITY_EXCEEDED");
    }
    if ([...blockers].some((blocker) => blocker !== "FUNDING_DIFFERENTIAL_TOO_LOW")) {
      return this.blocked(first, second, blockers, differential);
    }

    const longFill = vwapCalculator.calculate(longDepth.asks, quantity);
    const shortFill = vwapCalculator.calculate(shortDepth.bids, quantity);
    if (
      longFill.partialFill || shortFill.partialFill ||
      longFill.filledQuantity < quantity || shortFill.filledQuantity < quantity ||
      !validPositive(longFill.averagePrice) || !validPositive(shortFill.averagePrice)
    ) {
      blockers.add("DEPTH_INSUFFICIENT");
      return this.blocked(first, second, blockers, differential);
    }

    const longNotional = longFill.totalCost;
    const shortNotional = shortFill.totalCost;
    if (
      longNotional < long.rules.minimumNotional ||
      shortNotional < short.rules.minimumNotional
    ) {
      blockers.add("MINIMUM_NOTIONAL_NOT_MET");
      return this.blocked(first, second, blockers, differential);
    }

    const referenceNotional = Math.min(longNotional, shortNotional);
    // Hummingbot compares heterogeneous venues on a common time basis. Keep
    // that normalized daily diagnostic, while the admission economics below
    // use each venue's exact settlement clock and actual leg notional.
    const singlePeriodExpectedFundingQuote =
      referenceNotional * (shortNormalizedDailyRate - longNormalizedDailyRate);
    const entryBasisCostQuote = Math.max(0, longNotional - shortNotional);
    const roundTripFeeQuote =
      longNotional * longFee.takerPercent / 100 * 2 +
      shortNotional * shortFee.takerPercent / 100 * 2;
    const slippageReserveQuote =
      (longNotional + shortNotional) * configuration.perpetualSlippageBufferPercent / 100;
    const safetyBufferQuote = referenceNotional * configuration.safetyBufferPercent / 100;
    const minimumExpectedNetQuote =
      referenceNotional * configuration.minimumExpectedNetPercent / 100;
    const fixedCostQuote = entryBasisCostQuote + roundTripFeeQuote +
      slippageReserveQuote + safetyBufferQuote;
    const carry = modelExactFundingCarry({
      long,
      short,
      longNotional,
      shortNotional,
      maximumPeriodsPerLeg: configuration.maximumFundingPeriodsToCapture,
      requiredFundingQuote: fixedCostQuote + minimumExpectedNetQuote,
      now,
    });
    const modeledLongFundingPeriods = carry.longPeriods;
    const modeledShortFundingPeriods = carry.shortPeriods;
    const modeledFundingPeriods = Math.max(
      modeledLongFundingPeriods,
      modeledShortFundingPeriods,
    );
    const minimumQualifyingFundingPeriods = carry.qualified
      ? modeledFundingPeriods
      : configuration.maximumFundingPeriodsToCapture + 1;
    const expectedFundingQuote = carry.expectedFundingQuote;
    const projectedHoldingTimeMs = carry.projectedHoldingTimeMs;
    const expectedNetQuote =
      expectedFundingQuote - entryBasisCostQuote - roundTripFeeQuote -
      slippageReserveQuote - safetyBufferQuote;
    const expectedNetPercent = expectedNetQuote / referenceNotional * 100;

    const economics: FundingRateArbitrageRouteEconomics = {
      quantity,
      longEntryVwap: longFill.averagePrice,
      shortEntryVwap: shortFill.averagePrice,
      longNotional,
      shortNotional,
      referenceNotional,
      singlePeriodExpectedFundingQuote,
      singlePeriodExpectedFundingPercent:
        singlePeriodExpectedFundingQuote / referenceNotional * 100,
      modeledFundingPeriods,
      modeledLongFundingPeriods,
      modeledShortFundingPeriods,
      minimumQualifyingFundingPeriods,
      maximumFundingPeriodsToCapture: configuration.maximumFundingPeriodsToCapture,
      projectedHoldingTimeMs,
      expectedFundingQuote,
      expectedFundingPercent: expectedFundingQuote / referenceNotional * 100,
      entryBasisCostQuote,
      entryBasisCostPercent: entryBasisCostQuote / referenceNotional * 100,
      roundTripFeeQuote,
      roundTripFeePercent: roundTripFeeQuote / referenceNotional * 100,
      safetyBufferQuote,
      safetyBufferPercent: configuration.safetyBufferPercent,
      slippageReserveQuote,
      slippageReservePercent: slippageReserveQuote / referenceNotional * 100,
      expectedNetQuote,
      expectedNetPercent,
      minimumExpectedNetPercent: configuration.minimumExpectedNetPercent,
      thresholdShortfallPercent: Math.max(
        0,
        configuration.minimumExpectedNetPercent - expectedNetPercent,
      ),
    };

    if (minimumQualifyingFundingPeriods > configuration.maximumFundingPeriodsToCapture) {
      blockers.add("FUNDING_CARRY_HORIZON_EXCEEDED");
    }

    if (
      !Number.isFinite(expectedNetPercent) ||
      expectedNetPercent < configuration.minimumExpectedNetPercent
    ) {
      blockers.add("EXPECTED_NET_THRESHOLD_NOT_MET");
    }
    if (blockers.size > 0) {
      return this.blocked(first, second, blockers, differential, economics);
    }

    const executionReadinessBlockers: FundingRateArbitrageSignalEvidence["executionReadinessBlockers"] = [
      "POSITION_EVIDENCE_MISSING",
      "MARGIN_EVIDENCE_MISSING",
      "LIQUIDATION_CONTROL_MISSING",
      "REDUCE_ONLY_UNVERIFIED",
      "DERIVATIVE_ADAPTER_MISSING",
    ];
    const evidence: FundingRateArbitrageSignalEvidence = {
      routeKind: "CROSS_PERPETUAL",
      longProduct: "PERPETUAL",
      market: long.market,
      longExchange: long.exchange,
      shortExchange: short.exchange,
      quantity,
      longFundingRate: long.fundingRate,
      shortFundingRate: short.fundingRate,
      fundingDifferentialPercent,
      singlePeriodExpectedFundingQuote,
      singlePeriodExpectedFundingPercent:
        singlePeriodExpectedFundingQuote / referenceNotional * 100,
      expectedFundingQuote,
      expectedFundingGuaranteed: false,
      projectedFundingRatePersistenceRequired: true,
      modeledFundingPeriods,
      modeledLongFundingPeriods,
      modeledShortFundingPeriods,
      minimumQualifyingFundingPeriods,
      maximumFundingPeriodsToCapture: configuration.maximumFundingPeriodsToCapture,
      projectedHoldingTimeMs,
      longEntryBestAsk: longBestAsk,
      longEntryVwap: longFill.averagePrice,
      shortEntryBestBid: shortBestBid,
      shortEntryVwap: shortFill.averagePrice,
      entryBasisCostQuote,
      favorableEntryBasisExcluded: true,
      roundTripFeeQuote,
      safetyBufferQuote,
      slippageReserveQuote,
      expectedNetQuote,
      expectedNetPercent,
      minimumExpectedNetPercent: configuration.minimumExpectedNetPercent,
      fundingIntervalMinutes: long.fundingIntervalMinutes,
      longFundingIntervalMinutes: long.fundingIntervalMinutes,
      shortFundingIntervalMinutes: short.fundingIntervalMinutes,
      nextFundingTimeLong: long.nextFundingTime,
      nextFundingTimeShort: short.nextFundingTime,
      fundingTimeSkewMs,
      maximumObservedEvidenceSkewMs,
      fullDepthApplied: true,
      marketRulesApplied: true,
      explicitFeesApplied: true,
      roundTripFeesReserved: true,
      executionReadinessBlockers,
    };

    return immutableClone({
      id: `${long.market}:${long.exchange}:${short.exchange}:${sourceSnapshotGeneratedAt}`,
      routeKind: "CROSS_PERPETUAL",
      market: long.market,
      firstExchange: first.exchange,
      secondExchange: second.exchange,
      status: "QUALIFIED",
      blockers: [],
      differential,
      economics,
      evidence,
      executionAuthorized: false,
      automaticExecutionAllowed: false,
    });
  }

  /**
   * A same-venue perpetual long/short cancels its own funding and is not an
   * arbitrage. The only admitted intra-exchange funding route is therefore
   * cash-and-carry: long the spot asset and short the matching positive-funding
   * linear perpetual with exactly matched quantity.
   */
  private evaluateIntraSpotPerpetual(
    derivative: DerivativeMarketEvidence,
    sourceSnapshotGeneratedAt: number,
    configuration: FundingRateArbitrageConfiguration,
    now: number,
  ): FundingRateArbitrageAssessment {
    const blockers = new Set<FundingRateArbitrageBlocker>();
    const exchange = derivative.exchange;
    const shortNormalizedDailyFundingRate = normalizedDailyFundingRate(derivative);
    const fundingDifferentialPercent = shortNormalizedDailyFundingRate * 100;
    const differential: FundingRateArbitrageDifferentialDiagnostics = {
      routeKind: "INTRA_SPOT_PERPETUAL",
      market: derivative.market,
      longExchange: exchange,
      shortExchange: exchange,
      longFundingRate: 0,
      shortFundingRate: derivative.fundingRate,
      longNormalizedDailyFundingRate: 0,
      shortNormalizedDailyFundingRate,
      fundingDifferentialPercent,
      minimumFundingDifferentialPercent: configuration.minimumFundingDifferentialPercent,
      longFundingIntervalMinutes: derivative.fundingIntervalMinutes,
      shortFundingIntervalMinutes: derivative.fundingIntervalMinutes,
      nextFundingTimeLong: derivative.nextFundingTime,
      nextFundingTimeShort: derivative.nextFundingTime,
      fundingTimeSkewMs: 0,
    };
    const spotBook = this.dependencies.getSpotBook(exchange, derivative.market);
    const spotCapability = this.dependencies.getSpotCapability(exchange, derivative.market);
    const spotFee = this.dependencies.getSpotFee(exchange, derivative.market);
    const derivativeDepth = this.dependencies.getDerivativeDepth(exchange, derivative.market, now);
    const derivativeFee = this.dependencies.getDerivativeFee(exchange, derivative.market);

    if (!spotBook) blockers.add("SPOT_BOOK_MISSING");
    if (!spotCapability) blockers.add("SPOT_CAPABILITY_MISSING");
    if (!spotFee) blockers.add("SPOT_FEE_EVIDENCE_MISSING");
    if (!derivativeDepth) blockers.add("DERIVATIVE_DEPTH_MISSING");
    if (!derivativeFee) blockers.add("DERIVATIVE_FEE_EVIDENCE_MISSING");
    if (!spotBook || !spotCapability || !spotFee || !derivativeDepth || !derivativeFee) {
      return this.blockedIntra(derivative, blockers, differential);
    }

    if (
      spotBook.exchange.trim().toLowerCase() !== exchange ||
      spotBook.market.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") !== derivative.market ||
      spotCapability.exchange.trim().toLowerCase() !== exchange ||
      spotCapability.market.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") !== derivative.market ||
      spotCapability.product !== "spot" ||
      !spotCapability.tradingEnabled ||
      spotCapability.maintenanceMode ||
      spotCapability.baseAsset !== derivative.baseAsset ||
      spotCapability.quoteAsset !== derivative.quoteAsset ||
      derivative.quoteAsset !== derivative.settleAsset ||
      derivativeDepth.exchange !== exchange ||
      derivativeDepth.market !== derivative.market ||
      derivativeFee.exchange !== exchange ||
      spotFee.exchange !== exchange ||
      (spotFee.market !== null &&
        spotFee.market.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") !== derivative.market)
    ) {
      blockers.add("MARKET_IDENTITY_MISMATCH");
    }

    const timestamps = [
      spotBook.timestamp,
      derivativeDepth.observedAt,
      derivative.observedAt,
      sourceSnapshotGeneratedAt,
    ];
    if (timestamps.some((timestamp) =>
      !Number.isFinite(timestamp) || timestamp <= 0 || timestamp > now ||
      now - timestamp > configuration.maximumEvidenceAgeMs,
    )) {
      blockers.add("EVIDENCE_STALE");
    }
    const sourceObservationPairs: ReadonlyArray<readonly [number, number]> = [
      [derivative.sourceTimestamp, derivative.observedAt],
      [derivativeDepth.sourceTimestamp, derivativeDepth.observedAt],
    ];
    if (sourceObservationPairs.some(([sourceTimestamp, observedAt]) =>
      !Number.isFinite(sourceTimestamp) || sourceTimestamp <= 0 ||
      Math.abs(sourceTimestamp - observedAt) > configuration.maximumEvidenceAgeMs,
    )) {
      blockers.add("EVIDENCE_STALE");
    }
    const maximumObservedEvidenceSkewMs = Math.max(...timestamps) - Math.min(...timestamps);
    if (maximumObservedEvidenceSkewMs > configuration.maximumEvidenceSkewMs) {
      blockers.add("EVIDENCE_SKEW_EXCEEDED");
    }
    if (!validPositive(derivative.fundingIntervalMinutes)) blockers.add("FUNDING_INTERVAL_INVALID");
    if (!Number.isSafeInteger(derivative.nextFundingTime) ||
        derivative.nextFundingTime <= now) blockers.add("FUNDING_TIME_INVALID");
    if (!Number.isFinite(fundingDifferentialPercent) ||
        fundingDifferentialPercent < configuration.minimumFundingDifferentialPercent) {
      blockers.add("FUNDING_DIFFERENTIAL_TOO_LOW");
    }

    const spotStep = quantityStep(spotCapability);
    const derivativeStep = derivative.rules.quantityStep;
    const commonQuantityStep = spotStep === null
      ? null
      : commonExecutableQuantityIncrement([spotStep, derivativeStep]);
    if (
      spotStep === null || !validPositive(derivativeStep) ||
      commonQuantityStep === null ||
      spotCapability.notional.minimumNotional === null ||
      !validPositive(derivative.rules.minimumNotional) ||
      !validPositive(derivative.rules.minimumQuantity)
    ) {
      blockers.add("MARKET_RULES_INCOMPLETE");
    }
    if ([...blockers].some((blocker) => blocker !== "FUNDING_DIFFERENTIAL_TOO_LOW") || spotStep === null) {
      return this.blockedIntra(derivative, blockers, differential);
    }

    const spotBestAsk = spotBook.asks[0]?.price ?? 0;
    const perpetualBestBid = derivativeDepth.bids[0]?.price ?? 0;
    if (!validPositive(spotBestAsk) || !validPositive(perpetualBestBid)) {
      blockers.add("DEPTH_INSUFFICIENT");
      return this.blockedIntra(derivative, blockers, differential);
    }
    const quantity = roundDownToExecutableIncrement(
      configuration.targetQuoteNotional / Math.max(spotBestAsk, perpetualBestBid),
      commonQuantityStep!,
    );
    if (
      !validPositive(quantity) || !incrementMultiple(quantity, spotStep) ||
      !incrementMultiple(quantity, derivativeStep) ||
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
    if ([...blockers].some((blocker) => blocker !== "FUNDING_DIFFERENTIAL_TOO_LOW")) {
      return this.blockedIntra(derivative, blockers, differential);
    }

    const spotFill = vwapCalculator.calculate(spotBook.asks, quantity);
    const perpetualFill = vwapCalculator.calculate(derivativeDepth.bids, quantity);
    if (
      spotFill.partialFill || perpetualFill.partialFill ||
      spotFill.filledQuantity < quantity || perpetualFill.filledQuantity < quantity ||
      !validPositive(spotFill.averagePrice) || !validPositive(perpetualFill.averagePrice)
    ) {
      blockers.add("DEPTH_INSUFFICIENT");
      return this.blockedIntra(derivative, blockers, differential);
    }
    const spotNotional = spotFill.totalCost;
    const perpetualNotional = perpetualFill.totalCost;
    if (
      spotNotional < spotCapability.notional.minimumNotional! ||
      perpetualNotional < derivative.rules.minimumNotional
    ) {
      blockers.add("MINIMUM_NOTIONAL_NOT_MET");
      return this.blockedIntra(derivative, blockers, differential);
    }

    const referenceNotional = Math.min(spotNotional, perpetualNotional);
    // Funding is charged on the perpetual leg's actual executable notional,
    // not on the smaller reference notional used only for percentage ratios.
    const singlePeriodExpectedFundingQuote = perpetualNotional * derivative.fundingRate;
    const entryBasisCostQuote = Math.max(0, spotNotional - perpetualNotional);
    const roundTripFeeQuote =
      spotNotional * spotFee.takerPercent / 100 * 2 +
      perpetualNotional * derivativeFee.takerPercent / 100 * 2;
    const slippageReserveQuote =
      spotNotional * configuration.spotSlippageBufferPercent / 100 +
      perpetualNotional * configuration.perpetualSlippageBufferPercent / 100;
    const safetyBufferQuote = referenceNotional * configuration.safetyBufferPercent / 100;
    const minimumExpectedNetQuote = referenceNotional * configuration.minimumExpectedNetPercent / 100;
    const fixedCostQuote = entryBasisCostQuote + roundTripFeeQuote +
      slippageReserveQuote + safetyBufferQuote;
    const minimumQualifyingFundingPeriods = singlePeriodExpectedFundingQuote > 0
      ? Math.max(1, Math.ceil(
          (fixedCostQuote + minimumExpectedNetQuote) / singlePeriodExpectedFundingQuote - 1e-12,
        ))
      : configuration.maximumFundingPeriodsToCapture + 1;
    const modeledFundingPeriods = Math.min(
      minimumQualifyingFundingPeriods,
      configuration.maximumFundingPeriodsToCapture,
    );
    const expectedFundingQuote = singlePeriodExpectedFundingQuote * modeledFundingPeriods;
    const projectedHoldingTimeMs = Math.max(
      0,
      derivative.nextFundingTime +
        (modeledFundingPeriods - 1) * derivative.fundingIntervalMinutes * 60_000 - now,
    );
    const expectedNetQuote = expectedFundingQuote - entryBasisCostQuote -
      roundTripFeeQuote - slippageReserveQuote - safetyBufferQuote;
    const expectedNetPercent = expectedNetQuote / referenceNotional * 100;
    const economics: FundingRateArbitrageRouteEconomics = {
      quantity,
      longEntryVwap: spotFill.averagePrice,
      shortEntryVwap: perpetualFill.averagePrice,
      longNotional: spotNotional,
      shortNotional: perpetualNotional,
      referenceNotional,
      singlePeriodExpectedFundingQuote,
      singlePeriodExpectedFundingPercent: singlePeriodExpectedFundingQuote / referenceNotional * 100,
      modeledFundingPeriods,
      modeledLongFundingPeriods: 0,
      modeledShortFundingPeriods: modeledFundingPeriods,
      minimumQualifyingFundingPeriods,
      maximumFundingPeriodsToCapture: configuration.maximumFundingPeriodsToCapture,
      projectedHoldingTimeMs,
      expectedFundingQuote,
      expectedFundingPercent: expectedFundingQuote / referenceNotional * 100,
      entryBasisCostQuote,
      entryBasisCostPercent: entryBasisCostQuote / referenceNotional * 100,
      roundTripFeeQuote,
      roundTripFeePercent: roundTripFeeQuote / referenceNotional * 100,
      safetyBufferQuote,
      safetyBufferPercent: configuration.safetyBufferPercent,
      slippageReserveQuote,
      slippageReservePercent: slippageReserveQuote / referenceNotional * 100,
      expectedNetQuote,
      expectedNetPercent,
      minimumExpectedNetPercent: configuration.minimumExpectedNetPercent,
      thresholdShortfallPercent: Math.max(0, configuration.minimumExpectedNetPercent - expectedNetPercent),
    };
    if (minimumQualifyingFundingPeriods > configuration.maximumFundingPeriodsToCapture) {
      blockers.add("FUNDING_CARRY_HORIZON_EXCEEDED");
    }
    if (!Number.isFinite(expectedNetPercent) ||
        expectedNetPercent < configuration.minimumExpectedNetPercent) {
      blockers.add("EXPECTED_NET_THRESHOLD_NOT_MET");
    }
    if (blockers.size > 0) {
      return this.blockedIntra(derivative, blockers, differential, economics);
    }

    const executionReadinessBlockers: FundingRateArbitrageSignalEvidence["executionReadinessBlockers"] = [
      "POSITION_EVIDENCE_MISSING",
      "MARGIN_EVIDENCE_MISSING",
      "LIQUIDATION_CONTROL_MISSING",
      "REDUCE_ONLY_UNVERIFIED",
      "DERIVATIVE_ADAPTER_MISSING",
    ];
    const evidence: FundingRateArbitrageSignalEvidence = {
      routeKind: "INTRA_SPOT_PERPETUAL",
      longProduct: "SPOT",
      market: derivative.market,
      longExchange: exchange,
      shortExchange: exchange,
      quantity,
      longFundingRate: 0,
      shortFundingRate: derivative.fundingRate,
      fundingDifferentialPercent,
      singlePeriodExpectedFundingQuote,
      singlePeriodExpectedFundingPercent: singlePeriodExpectedFundingQuote / referenceNotional * 100,
      expectedFundingQuote,
      expectedFundingGuaranteed: false,
      projectedFundingRatePersistenceRequired: true,
      modeledFundingPeriods,
      modeledLongFundingPeriods: 0,
      modeledShortFundingPeriods: modeledFundingPeriods,
      minimumQualifyingFundingPeriods,
      maximumFundingPeriodsToCapture: configuration.maximumFundingPeriodsToCapture,
      projectedHoldingTimeMs,
      longEntryBestAsk: spotBestAsk,
      longEntryVwap: spotFill.averagePrice,
      shortEntryBestBid: perpetualBestBid,
      shortEntryVwap: perpetualFill.averagePrice,
      entryBasisCostQuote,
      favorableEntryBasisExcluded: true,
      roundTripFeeQuote,
      safetyBufferQuote,
      slippageReserveQuote,
      expectedNetQuote,
      expectedNetPercent,
      minimumExpectedNetPercent: configuration.minimumExpectedNetPercent,
      fundingIntervalMinutes: derivative.fundingIntervalMinutes,
      longFundingIntervalMinutes: derivative.fundingIntervalMinutes,
      shortFundingIntervalMinutes: derivative.fundingIntervalMinutes,
      nextFundingTimeLong: derivative.nextFundingTime,
      nextFundingTimeShort: derivative.nextFundingTime,
      fundingTimeSkewMs: 0,
      maximumObservedEvidenceSkewMs,
      fullDepthApplied: true,
      marketRulesApplied: true,
      explicitFeesApplied: true,
      roundTripFeesReserved: true,
      executionReadinessBlockers,
    };
    return immutableClone({
      id: `${derivative.market}:${exchange}:spot-perpetual:${sourceSnapshotGeneratedAt}`,
      routeKind: "INTRA_SPOT_PERPETUAL",
      market: derivative.market,
      firstExchange: exchange,
      secondExchange: exchange,
      status: "QUALIFIED",
      blockers: [],
      differential,
      economics,
      evidence,
      executionAuthorized: false,
      automaticExecutionAllowed: false,
    });
  }

  private blockedIntra(
    derivative: DerivativeMarketEvidence,
    blockers: ReadonlySet<FundingRateArbitrageBlocker>,
    differential: FundingRateArbitrageDifferentialDiagnostics,
    economics: FundingRateArbitrageRouteEconomics | null = null,
  ): FundingRateArbitrageAssessment {
    return immutableClone({
      id: `${derivative.market}:${derivative.exchange}:spot-perpetual:${derivative.sourceTimestamp}`,
      routeKind: "INTRA_SPOT_PERPETUAL",
      market: derivative.market,
      firstExchange: derivative.exchange,
      secondExchange: derivative.exchange,
      status: "BLOCKED",
      blockers: [...blockers],
      differential,
      economics,
      evidence: null,
      executionAuthorized: false,
      automaticExecutionAllowed: false,
    });
  }

  private blocked(
    first: DerivativeMarketEvidence,
    second: DerivativeMarketEvidence,
    blockers: ReadonlySet<FundingRateArbitrageBlocker>,
    differential: FundingRateArbitrageDifferentialDiagnostics,
    economics: FundingRateArbitrageRouteEconomics | null = null,
  ): FundingRateArbitrageAssessment {
    return immutableClone({
      id: `${first.market}:${first.exchange}:${second.exchange}:${Math.min(first.sourceTimestamp, second.sourceTimestamp)}`,
      routeKind: differential.routeKind,
      market: first.market,
      firstExchange: first.exchange,
      secondExchange: second.exchange,
      status: "BLOCKED",
      blockers: [...blockers],
      differential,
      economics,
      evidence: null,
      executionAuthorized: false,
      automaticExecutionAllowed: false,
    });
  }
}

function compareAssessmentsByExpectedNet(
  first: FundingRateArbitrageAssessment,
  second: FundingRateArbitrageAssessment,
): number {
  return (second.economics?.expectedNetPercent ?? Number.NEGATIVE_INFINITY) -
      (first.economics?.expectedNetPercent ?? Number.NEGATIVE_INFINITY) ||
    (second.economics?.expectedNetQuote ?? Number.NEGATIVE_INFINITY) -
      (first.economics?.expectedNetQuote ?? Number.NEGATIVE_INFINITY) ||
    first.id.localeCompare(second.id);
}

function validPositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function normalizedDailyFundingRate(market: DerivativeMarketEvidence): number {
  return validPositive(market.fundingIntervalMinutes)
    ? market.fundingRate / market.fundingIntervalMinutes * 1_440
    : Number.NaN;
}

interface FundingCarryEvent {
  readonly timestamp: number;
  readonly leg: "LONG" | "SHORT";
  readonly paymentQuote: number;
}

interface ExactFundingCarryModel {
  readonly qualified: boolean;
  readonly longPeriods: number;
  readonly shortPeriods: number;
  readonly expectedFundingQuote: number;
  readonly projectedHoldingTimeMs: number;
}

function modelExactFundingCarry(input: {
  readonly long: DerivativeMarketEvidence;
  readonly short: DerivativeMarketEvidence;
  readonly longNotional: number;
  readonly shortNotional: number;
  readonly maximumPeriodsPerLeg: number;
  readonly requiredFundingQuote: number;
  readonly now: number;
}): ExactFundingCarryModel {
  const events: FundingCarryEvent[] = [];
  for (let index = 0; index < input.maximumPeriodsPerLeg; index += 1) {
    events.push({
      timestamp: input.long.nextFundingTime +
        index * input.long.fundingIntervalMinutes * 60_000,
      leg: "LONG",
      paymentQuote: -input.longNotional * input.long.fundingRate,
    });
    events.push({
      timestamp: input.short.nextFundingTime +
        index * input.short.fundingIntervalMinutes * 60_000,
      leg: "SHORT",
      paymentQuote: input.shortNotional * input.short.fundingRate,
    });
  }
  events.sort((left, right) => left.timestamp - right.timestamp ||
    left.leg.localeCompare(right.leg));

  let candidateEnd = 0;
  while (candidateEnd < events.length) {
    // The central PAPER exit waits one minute after the last captured event.
    // Include any other settlement crossed during that evidence delay so a
    // faster venue can never create an unmodelled adverse funding payment.
    let closureEnd = candidateEnd;
    while (
      closureEnd + 1 < events.length &&
      events[closureEnd + 1]!.timestamp <= events[closureEnd]!.timestamp + 60_000
    ) closureEnd += 1;
    const modeled = summarizeFundingEvents(events.slice(0, closureEnd + 1), input.now);
    if (modeled.expectedFundingQuote + 1e-12 >= input.requiredFundingQuote) {
      return {...modeled, qualified: true};
    }
    candidateEnd = closureEnd + 1;
  }
  return {...summarizeFundingEvents(events, input.now), qualified: false};
}

function summarizeFundingEvents(
  events: readonly FundingCarryEvent[],
  now: number,
): Omit<ExactFundingCarryModel, "qualified"> {
  const finalTimestamp = events[events.length - 1]?.timestamp ?? now;
  return {
    longPeriods: events.filter((event) => event.leg === "LONG").length,
    shortPeriods: events.filter((event) => event.leg === "SHORT").length,
    expectedFundingQuote: events.reduce((sum, event) => sum + event.paymentQuote, 0),
    projectedHoldingTimeMs: Math.max(0, finalTimestamp - now),
  };
}

function incrementMultiple(quantity: number, increment: number): boolean {
  const units = quantity / increment;
  return Math.abs(units - Math.round(units)) <= 1e-7;
}

function quantityStep(capability: ExchangeMarketCapability): number | null {
  const step = capability.quantity.quantityStep;
  if (step !== null && validPositive(step)) return step;
  const precision = capability.quantity.quantityPrecision;
  return precision !== null && Number.isSafeInteger(precision) && precision >= 0 && precision <= 18
    ? 10 ** -precision
    : null;
}

function immutableClone<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}
