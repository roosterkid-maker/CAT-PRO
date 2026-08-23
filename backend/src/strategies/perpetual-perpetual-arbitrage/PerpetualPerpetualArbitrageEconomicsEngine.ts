import type {DerivativeDepthEvidence} from "../../derivatives/models/DerivativeDepthEvidence";
import type {DerivativeFeeEvidence} from "../../derivatives/models/DerivativeFeeEvidence";
import type {
  DerivativeMarketDataSnapshot,
  DerivativeMarketEvidence,
} from "../../derivatives/models/DerivativeMarketEvidence";
import {derivativeDepthService} from "../../derivatives/services/DerivativeDepthService";
import {derivativeFeeEvidenceService} from "../../derivatives/services/DerivativeFeeEvidenceService";
import {vwapCalculator} from "../../orderbook/calculators/VWAPCalculator";
import type {PerpetualPerpetualArbitrageSignalEvidence} from "../models/StrategySignal";
import type {PerpetualPerpetualArbitrageConfiguration} from "./PerpetualPerpetualArbitrageConfiguration";

export type PerpetualPerpetualArbitrageBlocker =
  | "DERIVATIVE_DEPTH_MISSING"
  | "DERIVATIVE_FEE_EVIDENCE_MISSING"
  | "MARKET_IDENTITY_MISMATCH"
  | "EVIDENCE_STALE"
  | "EVIDENCE_SKEW_EXCEEDED"
  | "FUNDING_TIME_INVALID"
  | "MARKET_RULES_INCOMPLETE"
  | "GROSS_DISLOCATION_TOO_LOW"
  | "QUANTITY_INVALID"
  | "MAXIMUM_QUANTITY_EXCEEDED"
  | "DEPTH_INSUFFICIENT"
  | "MINIMUM_NOTIONAL_NOT_MET"
  | "EXPECTED_NET_THRESHOLD_NOT_MET";

export interface PerpetualPerpetualDislocationDiagnostics {
  readonly market: string;
  readonly longExchange: string;
  readonly shortExchange: string;
  readonly longBestAsk: number;
  readonly shortBestBid: number;
  readonly grossTopDislocationPercent: number;
  readonly minimumGrossDislocationPercent: number;
  readonly longFundingRate: number;
  readonly shortFundingRate: number;
  readonly nextFundingTimeLong: number;
  readonly nextFundingTimeShort: number;
}

export interface PerpetualPerpetualRouteEconomics {
  readonly quantity: number;
  readonly longEntryVwap: number;
  readonly shortEntryVwap: number;
  readonly longNotional: number;
  readonly shortNotional: number;
  readonly referenceNotional: number;
  readonly grossDislocationQuote: number;
  readonly grossDislocationPercent: number;
  readonly roundTripFeeQuote: number;
  readonly roundTripFeePercent: number;
  readonly adverseFundingReserveQuote: number;
  readonly adverseFundingReservePercent: number;
  readonly adverseFundingPeriodsReserved: number;
  readonly safetyBufferQuote: number;
  readonly safetyBufferPercent: number;
  readonly expectedNetQuote: number;
  readonly expectedNetPercent: number;
  readonly minimumExpectedNetPercent: number;
  readonly thresholdShortfallPercent: number;
}

export interface PerpetualPerpetualArbitrageAssessment {
  readonly id: string;
  readonly market: string;
  readonly firstExchange: string;
  readonly secondExchange: string;
  readonly status: "QUALIFIED" | "BLOCKED";
  readonly blockers: readonly PerpetualPerpetualArbitrageBlocker[];
  readonly dislocation: PerpetualPerpetualDislocationDiagnostics | null;
  readonly economics: PerpetualPerpetualRouteEconomics | null;
  readonly evidence: PerpetualPerpetualArbitrageSignalEvidence | null;
  readonly executionAuthorized: false;
  readonly automaticExecutionAllowed: false;
}

export interface PerpetualPerpetualArbitrageEconomicsSnapshot {
  readonly generatedAt: number;
  readonly sourceSnapshotGeneratedAt: number;
  readonly evaluatedRoutes: number;
  readonly qualifiedRoutes: number;
  readonly blockedRoutes: number;
  readonly assessments: readonly PerpetualPerpetualArbitrageAssessment[];
  readonly safety: {
    readonly convergenceNotGuaranteed: true;
    readonly roundTripFeesReserved: true;
    readonly adverseFundingReserved: true;
    readonly shadowOnly: true;
    readonly positionEvidenceRequiredBeforeExecution: true;
    readonly marginEvidenceRequiredBeforeExecution: true;
    readonly liquidationControlRequiredBeforeExecution: true;
    readonly paperExecutionAllowed: false;
    readonly liveExecutionAllowed: false;
    readonly orderSubmissionAllowed: false;
  };
}

export interface PerpetualPerpetualArbitrageDependencies {
  getDerivativeDepth(exchange: string, market: string, now: number): DerivativeDepthEvidence | null;
  getDerivativeFee(exchange: string): DerivativeFeeEvidence | null;
}

const DEFAULT_DEPENDENCIES: PerpetualPerpetualArbitrageDependencies = {
  getDerivativeDepth: (exchange, market, now) => derivativeDepthService.getBook(exchange, market, now),
  getDerivativeFee: (exchange) => derivativeFeeEvidenceService.get(exchange),
};

export class PerpetualPerpetualArbitrageEconomicsEngine {
  private readonly dependencies: PerpetualPerpetualArbitrageDependencies;
  constructor(dependencies: Partial<PerpetualPerpetualArbitrageDependencies> = {}) {
    this.dependencies = {...DEFAULT_DEPENDENCIES, ...dependencies};
  }

  evaluate(
    snapshot: DerivativeMarketDataSnapshot,
    configuration: PerpetualPerpetualArbitrageConfiguration,
    now = Date.now(),
  ): PerpetualPerpetualArbitrageEconomicsSnapshot {
    const candidates = configuration.enabled
      ? snapshot.markets.filter((market) =>
          configuration.exchanges.includes(market.exchange) &&
          configuration.markets.includes(market.market) &&
          market.product === "LINEAR_PERPETUAL" && market.tradingEnabled)
      : [];
    const grouped = new Map<string, DerivativeMarketEvidence[]>();
    for (const market of candidates) {
      const group = grouped.get(market.market) ?? [];
      group.push(market);
      grouped.set(market.market, group);
    }
    const assessments: PerpetualPerpetualArbitrageAssessment[] = [];
    for (const group of grouped.values()) {
      const sorted = [...group].sort((a, b) => a.exchange.localeCompare(b.exchange));
      for (let i = 0; i < sorted.length; i += 1) {
        for (let j = i + 1; j < sorted.length; j += 1) {
          if (sorted[i] && sorted[j]) {
            assessments.push(this.evaluatePair(sorted[i]!, sorted[j]!, snapshot.generatedAt, configuration, now));
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
        convergenceNotGuaranteed: true,
        roundTripFeesReserved: true,
        adverseFundingReserved: true,
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
    configuration: PerpetualPerpetualArbitrageConfiguration,
    now: number,
  ): PerpetualPerpetualArbitrageAssessment {
    const blockers = new Set<PerpetualPerpetualArbitrageBlocker>();
    const firstDepth = this.dependencies.getDerivativeDepth(first.exchange, first.market, now);
    const secondDepth = this.dependencies.getDerivativeDepth(second.exchange, second.market, now);
    const firstFee = this.dependencies.getDerivativeFee(first.exchange);
    const secondFee = this.dependencies.getDerivativeFee(second.exchange);
    if (!firstDepth || !secondDepth) blockers.add("DERIVATIVE_DEPTH_MISSING");
    if (!firstFee || !secondFee) blockers.add("DERIVATIVE_FEE_EVIDENCE_MISSING");
    if (!firstDepth || !secondDepth || !firstFee || !secondFee) return this.blocked(first, second, blockers);

    if (
      first.market !== second.market || first.baseAsset !== second.baseAsset ||
      first.quoteAsset !== second.quoteAsset || first.settleAsset !== second.settleAsset ||
      firstDepth.exchange !== first.exchange || secondDepth.exchange !== second.exchange ||
      firstDepth.market !== first.market || secondDepth.market !== second.market
    ) blockers.add("MARKET_IDENTITY_MISMATCH");

    /*
     * Local observations are the freshness clock. Raw venue timestamps remain
     * bounded against those observations so a small positive venue-clock skew
     * is accepted without admitting old, invalid, or wildly future evidence.
     */
    const timestamps = [
      first.observedAt,
      second.observedAt,
      firstDepth.observedAt,
      secondDepth.observedAt,
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
      [firstDepth.sourceTimestamp, firstDepth.observedAt],
      [secondDepth.sourceTimestamp, secondDepth.observedAt],
    ];
    if (sourceObservationPairs.some(([sourceTimestamp, observedAt]) =>
      !Number.isFinite(sourceTimestamp) || sourceTimestamp <= 0 ||
      Math.abs(sourceTimestamp - observedAt) > configuration.maximumEvidenceAgeMs,
    )) {
      blockers.add("EVIDENCE_STALE");
    }
    const maximumObservedEvidenceSkewMs = Math.max(...timestamps) - Math.min(...timestamps);
    if (maximumObservedEvidenceSkewMs > configuration.maximumEvidenceSkewMs) blockers.add("EVIDENCE_SKEW_EXCEEDED");
    if (first.nextFundingTime <= now || second.nextFundingTime <= now) blockers.add("FUNDING_TIME_INVALID");

    const firstToSecond = (secondDepth.bids[0]?.price ?? 0) - (firstDepth.asks[0]?.price ?? Number.POSITIVE_INFINITY);
    const secondToFirst = (firstDepth.bids[0]?.price ?? 0) - (secondDepth.asks[0]?.price ?? Number.POSITIVE_INFINITY);
    const long = firstToSecond >= secondToFirst ? first : second;
    const short = long === first ? second : first;
    const longDepth = long === first ? firstDepth : secondDepth;
    const shortDepth = short === first ? firstDepth : secondDepth;
    const longFee = long === first ? firstFee : secondFee;
    const shortFee = short === first ? firstFee : secondFee;
    const longBestAsk = longDepth.asks[0]?.price ?? 0;
    const shortBestBid = shortDepth.bids[0]?.price ?? 0;
    const grossTopPercent = validPositive(longBestAsk)
      ? (shortBestBid - longBestAsk) / longBestAsk * 100
      : Number.NEGATIVE_INFINITY;
    const dislocation: PerpetualPerpetualDislocationDiagnostics = {
      market: long.market,
      longExchange: long.exchange,
      shortExchange: short.exchange,
      longBestAsk,
      shortBestBid,
      grossTopDislocationPercent: grossTopPercent,
      minimumGrossDislocationPercent: configuration.minimumGrossDislocationPercent,
      longFundingRate: long.fundingRate,
      shortFundingRate: short.fundingRate,
      nextFundingTimeLong: long.nextFundingTime,
      nextFundingTimeShort: short.nextFundingTime,
    };
    if (!Number.isFinite(grossTopPercent) || grossTopPercent < configuration.minimumGrossDislocationPercent) {
      blockers.add("GROSS_DISLOCATION_TOO_LOW");
    }
    for (const market of [long, short]) {
      if (!validPositive(market.rules.quantityStep) || !validPositive(market.rules.minimumQuantity) ||
          !validPositive(market.rules.minimumNotional)) blockers.add("MARKET_RULES_INCOMPLETE");
    }
    if ([...blockers].some((blocker) => blocker !== "GROSS_DISLOCATION_TOO_LOW")) {
      return this.blocked(first, second, blockers, dislocation);
    }

    let quantity = configuration.targetQuoteNotional / Math.max(longBestAsk, shortBestBid);
    quantity = quantizeDown(quantity, long.rules.quantityStep);
    quantity = quantizeDown(quantity, short.rules.quantityStep);
    quantity = quantizeDown(quantity, long.rules.quantityStep);
    if (!validPositive(quantity) || !incrementMultiple(quantity, long.rules.quantityStep) ||
        !incrementMultiple(quantity, short.rules.quantityStep) || quantity < long.rules.minimumQuantity ||
        quantity < short.rules.minimumQuantity) blockers.add("QUANTITY_INVALID");
    if (quantity > long.rules.maximumMarketQuantity || quantity > short.rules.maximumMarketQuantity) {
      blockers.add("MAXIMUM_QUANTITY_EXCEEDED");
    }
    if ([...blockers].some((blocker) => blocker !== "GROSS_DISLOCATION_TOO_LOW")) {
      return this.blocked(first, second, blockers, dislocation);
    }

    const longFill = vwapCalculator.calculate(longDepth.asks, quantity);
    const shortFill = vwapCalculator.calculate(shortDepth.bids, quantity);
    if (longFill.partialFill || shortFill.partialFill || longFill.filledQuantity < quantity ||
        shortFill.filledQuantity < quantity || !validPositive(longFill.averagePrice) ||
        !validPositive(shortFill.averagePrice)) {
      blockers.add("DEPTH_INSUFFICIENT");
      return this.blocked(first, second, blockers, dislocation);
    }
    const longNotional = longFill.totalCost;
    const shortNotional = shortFill.totalCost;
    if (longNotional < long.rules.minimumNotional || shortNotional < short.rules.minimumNotional) {
      blockers.add("MINIMUM_NOTIONAL_NOT_MET");
      return this.blocked(first, second, blockers, dislocation);
    }

    const referenceNotional = Math.min(longNotional, shortNotional);
    const grossDislocationQuote = shortNotional - longNotional;
    const grossDislocationPercent = grossDislocationQuote / longNotional * 100;
    const roundTripFeeQuote = longNotional * longFee.takerPercent / 100 * 2 + shortNotional * shortFee.takerPercent / 100 * 2;
    const adverseFundingReserveQuote = referenceNotional *
      (Math.abs(long.fundingRate) + Math.abs(short.fundingRate)) *
      configuration.adverseFundingPeriodsReserved;
    const safetyBufferQuote = referenceNotional * configuration.safetyBufferPercent / 100;
    const expectedNetQuote = grossDislocationQuote - roundTripFeeQuote - adverseFundingReserveQuote - safetyBufferQuote;
    const expectedNetPercent = expectedNetQuote / referenceNotional * 100;
    const economics: PerpetualPerpetualRouteEconomics = {
      quantity,
      longEntryVwap: longFill.averagePrice,
      shortEntryVwap: shortFill.averagePrice,
      longNotional,
      shortNotional,
      referenceNotional,
      grossDislocationQuote,
      grossDislocationPercent,
      roundTripFeeQuote,
      roundTripFeePercent: roundTripFeeQuote / referenceNotional * 100,
      adverseFundingReserveQuote,
      adverseFundingReservePercent: adverseFundingReserveQuote / referenceNotional * 100,
      adverseFundingPeriodsReserved: configuration.adverseFundingPeriodsReserved,
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
    }
    if (blockers.size > 0) {
      return this.blocked(first, second, blockers, dislocation, economics);
    }

    const evidence: PerpetualPerpetualArbitrageSignalEvidence = {
      market: long.market,
      longExchange: long.exchange,
      shortExchange: short.exchange,
      quantity,
      longBestAsk,
      longEntryVwap: longFill.averagePrice,
      shortBestBid,
      shortEntryVwap: shortFill.averagePrice,
      grossDislocationQuote,
      grossDislocationPercent,
      nextFundingTimeLong: long.nextFundingTime,
      nextFundingTimeShort: short.nextFundingTime,
      convergenceGuaranteed: false,
      roundTripFeeQuote,
      adverseFundingReserveQuote,
      adverseFundingPeriodsReserved: configuration.adverseFundingPeriodsReserved,
      safetyBufferQuote,
      expectedNetQuote,
      expectedNetPercent,
      minimumExpectedNetPercent: configuration.minimumExpectedNetPercent,
      maximumObservedEvidenceSkewMs,
      fullDepthApplied: true,
      marketRulesApplied: true,
      explicitFeesApplied: true,
      roundTripFeesReserved: true,
      executionReadinessBlockers: [
        "POSITION_EVIDENCE_MISSING", "MARGIN_EVIDENCE_MISSING", "LIQUIDATION_CONTROL_MISSING",
        "REDUCE_ONLY_UNVERIFIED", "DERIVATIVE_ADAPTER_MISSING",
      ],
    };
    return immutableClone({
      id: `${long.market}:${long.exchange}:${short.exchange}:${sourceSnapshotGeneratedAt}`,
      market: long.market,
      firstExchange: first.exchange,
      secondExchange: second.exchange,
      status: "QUALIFIED",
      blockers: [],
      dislocation,
      economics,
      evidence,
      executionAuthorized: false,
      automaticExecutionAllowed: false,
    });
  }

  private blocked(
    first: DerivativeMarketEvidence,
    second: DerivativeMarketEvidence,
    blockers: ReadonlySet<PerpetualPerpetualArbitrageBlocker>,
    dislocation: PerpetualPerpetualDislocationDiagnostics | null = null,
    economics: PerpetualPerpetualRouteEconomics | null = null,
  ): PerpetualPerpetualArbitrageAssessment {
    return immutableClone({
      id: `${first.market}:${first.exchange}:${second.exchange}:${Math.min(first.sourceTimestamp, second.sourceTimestamp)}`,
      market: first.market,
      firstExchange: first.exchange,
      secondExchange: second.exchange,
      status: "BLOCKED",
      blockers: [...blockers],
      dislocation,
      economics,
      evidence: null,
      executionAuthorized: false,
      automaticExecutionAllowed: false,
    });
  }
}

function validPositive(value: number): boolean { return Number.isFinite(value) && value > 0; }
function quantizeDown(quantity: number, increment: number): number { return Math.floor((quantity + Number.EPSILON) / increment) * increment; }
function incrementMultiple(quantity: number, increment: number): boolean { const units = quantity / increment; return Math.abs(units - Math.round(units)) <= 1e-7; }
function immutableClone<T>(value: T): T { return deepFreeze(structuredClone(value)); }
function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}
