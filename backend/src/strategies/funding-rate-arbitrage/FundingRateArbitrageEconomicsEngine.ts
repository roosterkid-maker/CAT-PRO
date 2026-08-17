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

import {
  vwapCalculator,
} from "../../orderbook/calculators/VWAPCalculator";

import type {
  FundingRateArbitrageSignalEvidence,
} from "../models/StrategySignal";

import type {
  FundingRateArbitrageConfiguration,
} from "./FundingRateArbitrageConfiguration";

export type FundingRateArbitrageBlocker =
  | "DERIVATIVE_DEPTH_MISSING"
  | "DERIVATIVE_FEE_EVIDENCE_MISSING"
  | "MARKET_IDENTITY_MISMATCH"
  | "EVIDENCE_STALE"
  | "EVIDENCE_SKEW_EXCEEDED"
  | "FUNDING_INTERVAL_MISMATCH"
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
  readonly market: string;
  readonly longExchange: string;
  readonly shortExchange: string;
  readonly longFundingRate: number;
  readonly shortFundingRate: number;
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
  readonly expectedNetQuote: number;
  readonly expectedNetPercent: number;
  readonly minimumExpectedNetPercent: number;
  readonly thresholdShortfallPercent: number;
}

export interface FundingRateArbitrageAssessment {
  readonly id: string;
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
  getDerivativeFee(exchange: string): DerivativeFeeEvidence | null;
}

const DEFAULT_DEPENDENCIES: FundingRateArbitrageDependencies = {
  getDerivativeDepth: (exchange, market, now) =>
    derivativeDepthService.getBook(exchange, market, now),
  getDerivativeFee: (exchange) => derivativeFeeEvidenceService.get(exchange),
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

    return immutableClone({
      generatedAt: now,
      sourceSnapshotGeneratedAt: snapshot.generatedAt,
      evaluatedRoutes: assessments.length,
      qualifiedRoutes: assessments.filter((item) => item.status === "QUALIFIED").length,
      blockedRoutes: assessments.filter((item) => item.status === "BLOCKED").length,
      assessments,
      safety: {
        expectedFundingNotGuaranteed: true,
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
    const long = first.fundingRate <= second.fundingRate ? first : second;
    const short = long === first ? second : first;
    const fundingTimeSkewMs = Math.abs(first.nextFundingTime - second.nextFundingTime);
    const fundingDifferentialPercent = (short.fundingRate - long.fundingRate) * 100;
    const differential: FundingRateArbitrageDifferentialDiagnostics = {
      market: long.market,
      longExchange: long.exchange,
      shortExchange: short.exchange,
      longFundingRate: long.fundingRate,
      shortFundingRate: short.fundingRate,
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
    const longFee = this.dependencies.getDerivativeFee(long.exchange);
    const shortFee = this.dependencies.getDerivativeFee(short.exchange);

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

    if (first.fundingIntervalMinutes !== second.fundingIntervalMinutes) {
      blockers.add("FUNDING_INTERVAL_MISMATCH");
    }
    if (first.nextFundingTime <= now || second.nextFundingTime <= now) {
      blockers.add("FUNDING_TIME_INVALID");
    }
    if (fundingTimeSkewMs > configuration.maximumFundingTimeSkewMs) {
      blockers.add("FUNDING_TIME_SKEW_EXCEEDED");
    }

    if (
      !Number.isFinite(fundingDifferentialPercent) ||
      fundingDifferentialPercent < configuration.minimumFundingDifferentialPercent
    ) {
      blockers.add("FUNDING_DIFFERENTIAL_TOO_LOW");
    }

    const longStep = long.rules.quantityStep;
    const shortStep = short.rules.quantityStep;
    if (
      !validPositive(longStep) || !validPositive(shortStep) ||
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

    let quantity = configuration.targetQuoteNotional / Math.max(longBestAsk, shortBestBid);
    quantity = quantizeDown(quantity, longStep);
    quantity = quantizeDown(quantity, shortStep);
    quantity = quantizeDown(quantity, longStep);

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

    const longFill = vwapCalculator.calculate([...longDepth.asks], quantity);
    const shortFill = vwapCalculator.calculate([...shortDepth.bids], quantity);
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
    const singlePeriodExpectedFundingQuote =
      referenceNotional * (short.fundingRate - long.fundingRate);
    const entryBasisCostQuote = Math.max(0, longNotional - shortNotional);
    const roundTripFeeQuote =
      longNotional * longFee.takerPercent / 100 * 2 +
      shortNotional * shortFee.takerPercent / 100 * 2;
    const safetyBufferQuote = referenceNotional * configuration.safetyBufferPercent / 100;
    const minimumExpectedNetQuote =
      referenceNotional * configuration.minimumExpectedNetPercent / 100;
    const fixedCostQuote = entryBasisCostQuote + roundTripFeeQuote + safetyBufferQuote;
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
      Math.max(long.nextFundingTime, short.nextFundingTime) +
        (modeledFundingPeriods - 1) * long.fundingIntervalMinutes * 60_000 - now,
    );
    const expectedNetQuote =
      expectedFundingQuote - entryBasisCostQuote - roundTripFeeQuote - safetyBufferQuote;
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
      expectedNetQuote,
      expectedNetPercent,
      minimumExpectedNetPercent: configuration.minimumExpectedNetPercent,
      fundingIntervalMinutes: long.fundingIntervalMinutes,
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

  private blocked(
    first: DerivativeMarketEvidence,
    second: DerivativeMarketEvidence,
    blockers: ReadonlySet<FundingRateArbitrageBlocker>,
    differential: FundingRateArbitrageDifferentialDiagnostics,
    economics: FundingRateArbitrageRouteEconomics | null = null,
  ): FundingRateArbitrageAssessment {
    return immutableClone({
      id: `${first.market}:${first.exchange}:${second.exchange}:${Math.min(first.sourceTimestamp, second.sourceTimestamp)}`,
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

function validPositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function quantizeDown(quantity: number, increment: number): number {
  return Math.floor((quantity + Number.EPSILON) / increment) * increment;
}

function incrementMultiple(quantity: number, increment: number): boolean {
  const units = quantity / increment;
  return Math.abs(units - Math.round(units)) <= 1e-7;
}

function immutableClone<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}
