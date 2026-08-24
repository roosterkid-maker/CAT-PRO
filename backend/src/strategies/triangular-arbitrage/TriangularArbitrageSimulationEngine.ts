import {getExchangeFeeEvidence} from "../../arbitrage/config/fees";
import type {ExchangeFeeEvidence} from "../../arbitrage/models/FeeModel";
import type {DynamicOpportunityDiscoverySnapshot, TriangularDiscoveryLeg, TriangularDiscoveryPath} from "../../discovery/models/DynamicOpportunityDiscovery";
import type {ExchangeMarketCapability} from "../../execution/capabilities/models/ExchangeCapability";
import {exchangeCapabilityService} from "../../execution/capabilities/services/ExchangeCapabilityService";
import {vwapCalculator} from "../../orderbook/calculators/VWAPCalculator";
import {orderBookCache} from "../../orderbook/cache/OrderBookCache";
import type {OrderBook} from "../../orderbook/models/OrderBook";
import type {TriangularArbitrageConfiguration} from "./TriangularArbitrageConfiguration";

export type TriangularArbitrageBlocker =
  | "INVALID_PATH"
  | "EXCHANGE_NOT_ALLOWED"
  | "START_ASSET_NOT_ALLOWED"
  | "ASSET_BLOCKED"
  | "FAST_SCREEN_GROSS_EDGE_NOT_MET"
  | "STALE_LEG_EVIDENCE"
  | "OPPORTUNITY_STALE"
  | "ORDER_BOOK_MISSING"
  | "ORDER_BOOK_STALE"
  | "BOOK_TIMESTAMP_SKEW_EXCEEDED"
  | "FEE_EVIDENCE_MISSING"
  | "CAPABILITY_EVIDENCE_MISSING"
  | "CAPABILITY_EVIDENCE_STALE"
  | "MARKET_TRADING_DISABLED"
  | "EXECUTABLE_ORDER_UNSUPPORTED"
  | "QUANTITY_RULES_INCOMPLETE"
  | "MINIMUM_NOTIONAL_MISSING"
  | "FULL_DEPTH_INSUFFICIENT"
  | "QUANTITY_BELOW_MINIMUM"
  | "QUANTITY_ABOVE_MAXIMUM"
  | "NOTIONAL_BELOW_MINIMUM"
  | "NOTIONAL_ABOVE_MAXIMUM"
  | "NON_FINITE_SIMULATION"
  | "TDS_CAPITAL_RESERVE_INSUFFICIENT"
  | "MINIMUM_ABSOLUTE_PROFIT_NOT_MET"
  | "STRESS_NET_NOT_POSITIVE"
  | "MINIMUM_NET_PROFIT_NOT_MET";

export interface TriangularArbitrageLegSimulation {
  readonly market: string;
  readonly fromAsset: string;
  readonly toAsset: string;
  readonly action: "SELL_BASE" | "BUY_BASE";
  readonly inputQuantity: number;
  readonly tradedInputQuantity: number;
  readonly outputBeforeFee: number;
  readonly feePercent: number;
  readonly feeAmount: number;
  readonly feeAsset: string;
  readonly outputAfterFee: number;
  readonly averageFillPrice: number;
  readonly topOfBookPrice: number;
  readonly depthSlippagePercent: number;
  readonly roundingDustInputQuantity: number;
  readonly consumedDepthLevels: number;
  readonly orderBookTimestamp: number;
  readonly orderBookAgeMs: number;
  readonly topOfBookMaximumInput: number;
  readonly capabilitySynchronizedAt: number;
  readonly executionPolicy: "FOK_OR_IOC_LIMIT_FUTURE_ONLY";
}

export interface TriangularArbitragePathSimulation {
  readonly pathId: string;
  readonly exchange: string;
  readonly startAsset: string;
  readonly assets: readonly [string, string, string, string];
  readonly status: "QUALIFIED" | "BLOCKED";
  readonly blockers: readonly TriangularArbitrageBlocker[];
  readonly initialSizingLimitQuantity: number;
  readonly initialInputQuantity: number;
  readonly retainedStartQuantity: number;
  readonly capitalUtilizationPercent: number;
  readonly finalOutputQuantity: number | null;
  readonly expectedNetProfitQuantity: number | null;
  readonly expectedNetProfitPercent: number | null;
  readonly netProfitQuantity: number | null;
  readonly netProfitPercent: number | null;
  readonly stressNetProfitQuantity: number | null;
  readonly stressNetProfitPercent: number | null;
  readonly absoluteNetProfitInr: number | null;
  readonly startAssetInrValue: number | null;
  readonly tdsCapitalLockInr: number | null;
  readonly referenceGrossMultiplier: number;
  readonly referenceGrossProfitPercent: number;
  readonly referenceFeeAdjustedProfitPercent: number | null;
  readonly feeDragPercent: number | null;
  readonly quantizationDragPercent: number | null;
  readonly reserveDragPercent: number;
  readonly computedNetMultiplier: number | null;
  readonly maximumBookSkewMs: number | null;
  readonly legs: readonly TriangularArbitrageLegSimulation[];
  readonly executionAuthorized: false;
  readonly automaticExecutionAllowed: false;
}

export interface TriangularArbitrageSimulationSnapshot {
  readonly generatedAt: number;
  readonly sourceSnapshotGeneratedAt: number;
  readonly evaluationDurationMs: number;
  readonly evaluatedPaths: number;
  readonly fastScreenPassedPaths: number;
  readonly fullDepthEvaluatedPaths: number;
  readonly qualifiedPaths: number;
  readonly blockedPaths: number;
  readonly simulations: readonly TriangularArbitragePathSimulation[];
  readonly safety: {readonly shadowOnly: true; readonly paperExecutionImplemented: true; readonly paperExecutionAllowed: false;
    readonly liveExecutionAllowed: false; readonly orderSubmissionAllowed: false};
}

export interface TriangularArbitrageSimulationDependencies {
  getFeeEvidence(exchange: string, market: string): ExchangeFeeEvidence | null;
  getCapability(exchange: string, market: string): ExchangeMarketCapability | null;
  getOrderBook(exchange: string, market: string): OrderBook | null;
}

const DEFAULT_DEPENDENCIES: TriangularArbitrageSimulationDependencies = {
  getFeeEvidence: (exchange, market) => getExchangeFeeEvidence(exchange, market),
  getCapability: (exchange, market) => exchangeCapabilityService.getCachedCapability(exchange, market, "spot"),
  getOrderBook: (exchange, market) => orderBookCache.get(exchange, market),
};

export class TriangularArbitrageSimulationEngine {
  private readonly dependencies: TriangularArbitrageSimulationDependencies;
  constructor(dependencies: Partial<TriangularArbitrageSimulationDependencies> = {}) {
    this.dependencies = {...DEFAULT_DEPENDENCIES, ...dependencies};
  }

  evaluate(snapshot: DynamicOpportunityDiscoverySnapshot, configuration: TriangularArbitrageConfiguration, now = Date.now()): TriangularArbitrageSimulationSnapshot {
    const startedAt = performance.now();
    const simulations = configuration.enabled
      ? [...snapshot.triangularPaths]
          .sort((first, second) =>
            second.referenceGrossMultiplier - first.referenceGrossMultiplier ||
            first.id.localeCompare(second.id),
          )
          .slice(0, configuration.maximumSignalsPerSnapshot * 10)
          .map((path) => this.evaluatePath(path, configuration, now, snapshot.generatedAt))
      : [];
    simulations.sort(compareSimulationsByExpectedNet);
    return immutableClone({
      generatedAt: now,
      sourceSnapshotGeneratedAt: snapshot.generatedAt,
      evaluationDurationMs: normalize(performance.now() - startedAt),
      evaluatedPaths: simulations.length,
      fastScreenPassedPaths: simulations.filter((item) => !item.blockers.includes("FAST_SCREEN_GROSS_EDGE_NOT_MET")).length,
      fullDepthEvaluatedPaths: simulations.filter((item) => item.legs.length > 0).length,
      qualifiedPaths: simulations.filter((item) => item.status === "QUALIFIED").length,
      blockedPaths: simulations.filter((item) => item.status === "BLOCKED").length,
      simulations,
      safety: {shadowOnly: true, paperExecutionImplemented: true, paperExecutionAllowed: false,
        liveExecutionAllowed: false, orderSubmissionAllowed: false},
    });
  }

  evaluatePath(path: TriangularDiscoveryPath, configuration: TriangularArbitrageConfiguration, now: number,
    sourceSnapshotGeneratedAt = now): TriangularArbitragePathSimulation {
    const blockers = new Set<TriangularArbitrageBlocker>();
    const referenceGrossProfitPercent = (path.referenceGrossMultiplier - 1) * 100;
    const normalizedExchange = path.exchange.trim().toLowerCase();
    if (path.legs.length !== 3 || path.assets.length !== 4 || path.assets[0] !== path.assets[3] || path.startAsset !== path.assets[0]) blockers.add("INVALID_PATH");
    if (configuration.allowedExchanges.length > 0 && !configuration.allowedExchanges.includes(normalizedExchange.toUpperCase())) blockers.add("EXCHANGE_NOT_ALLOWED");
    if (!configuration.allowedStartingAssets.includes(path.startAsset)) blockers.add("START_ASSET_NOT_ALLOWED");
    if (path.assets.some((asset) => configuration.blockedAssets.includes(asset))) blockers.add("ASSET_BLOCKED");
    if (sourceSnapshotGeneratedAt > now || now - sourceSnapshotGeneratedAt > configuration.maximumOpportunityAgeMs) blockers.add("OPPORTUNITY_STALE");
    if (referenceGrossProfitPercent < configuration.fastScreenMinimumGrossProfitPercent) blockers.add("FAST_SCREEN_GROSS_EDGE_NOT_MET");

    const valuation = configuration.startAssetInrValues[path.startAsset] ?? null;
    const poolBound = valuation ? configuration.capitalPool.activeCycleCapitalInr / valuation : 0;
    let currentInput = this.resolveDepthBoundedInitialInput(path, Math.min(configuration.maximumInitialInputQuantity, poolBound || 0));
    const initialSizingLimit = currentInput;
    const legSimulations: TriangularArbitrageLegSimulation[] = [];
    if (!Number.isFinite(initialSizingLimit) || initialSizingLimit <= 0) blockers.add("INVALID_PATH");

    if (!blockers.has("FAST_SCREEN_GROSS_EDGE_NOT_MET")) {
      for (const leg of path.legs) {
        const result = this.evaluateLeg(path.exchange, leg, currentInput, configuration, now);
        for (const blocker of result.blockers) blockers.add(blocker);
        if (!result.simulation) break;
        legSimulations.push(result.simulation);
        currentInput = result.simulation.outputAfterFee;
      }
    }

    const bookTimestamps = legSimulations.map((leg) => leg.orderBookTimestamp);
    const maximumBookSkewMs = bookTimestamps.length === 3 ? Math.max(...bookTimestamps) - Math.min(...bookTimestamps) : null;
    if (maximumBookSkewMs !== null && maximumBookSkewMs > configuration.maximumBookTimestampSkewMs) blockers.add("BOOK_TIMESTAMP_SKEW_EXCEEDED");

    const initialInput = legSimulations[0]?.tradedInputQuantity ?? initialSizingLimit;
    const retainedStart = Math.max(0, initialSizingLimit - initialInput);
    const capitalUtilizationPercent = initialSizingLimit > 0 ? initialInput / initialSizingLimit * 100 : 0;
    const cumulativeFeeMultiplier = legSimulations.length === 3
      ? legSimulations.reduce((multiplier, leg) => multiplier * (1 - leg.feePercent / 100), 1) : null;
    const referenceFeeAdjustedProfitPercent = cumulativeFeeMultiplier === null ? null
      : (path.referenceGrossMultiplier * cumulativeFeeMultiplier - 1) * 100;
    const feeDragPercent = referenceFeeAdjustedProfitPercent === null ? null : referenceGrossProfitPercent - referenceFeeAdjustedProfitPercent;
    const reserveDragPercent = configuration.slippageReservePercent + configuration.adverseMoveReservePercent + configuration.safetyBufferPercent;

    let finalOutput: number | null = null;
    let expectedNet: number | null = null;
    let expectedNetPercent: number | null = null;
    let stressNet: number | null = null;
    let stressNetPercent: number | null = null;
    let absoluteNetProfitInr: number | null = null;
    let tdsCapitalLockInr: number | null = null;
    let computedNetMultiplier: number | null = null;

    if (legSimulations.length === 3) {
      finalOutput = currentInput;
      expectedNet = finalOutput - initialInput;
      expectedNetPercent = initialInput > 0 ? expectedNet / initialInput * 100 : null;
      const reserveQuantity = initialInput * reserveDragPercent / 100;
      stressNet = expectedNet - reserveQuantity;
      stressNetPercent = initialInput > 0 ? stressNet / initialInput * 100 : null;
      computedNetMultiplier = initialInput > 0 ? finalOutput / initialInput : null;
      absoluteNetProfitInr = valuation === null ? null : stressNet * valuation;
      tdsCapitalLockInr = valuation === null ? null : initialInput * valuation * configuration.tdsCapitalLockPercent / 100;
      if ([finalOutput, expectedNet, expectedNetPercent, stressNet, stressNetPercent, computedNetMultiplier]
        .some((value) => value === null || !Number.isFinite(value))) blockers.add("NON_FINITE_SIMULATION");
      if (tdsCapitalLockInr !== null && tdsCapitalLockInr > configuration.capitalPool.feeTdsDustReserveInr) blockers.add("TDS_CAPITAL_RESERVE_INSUFFICIENT");
      if (absoluteNetProfitInr === null || absoluteNetProfitInr < configuration.minimumAbsoluteNetProfitInr) blockers.add("MINIMUM_ABSOLUTE_PROFIT_NOT_MET");
      if (stressNetPercent === null || stressNetPercent <= 0) blockers.add("STRESS_NET_NOT_POSITIVE");
      if (stressNetPercent === null || stressNetPercent < configuration.minimumNetProfitPercent) blockers.add("MINIMUM_NET_PROFIT_NOT_MET");
    }

    const quantizationDragPercent = referenceFeeAdjustedProfitPercent === null || expectedNetPercent === null
      ? null : Math.max(0, referenceFeeAdjustedProfitPercent - expectedNetPercent);
    return immutableClone({
      pathId: path.id, exchange: path.exchange, startAsset: path.startAsset, assets: path.assets,
      status: blockers.size === 0 ? "QUALIFIED" : "BLOCKED", blockers: [...blockers],
      initialSizingLimitQuantity: initialSizingLimit, initialInputQuantity: initialInput,
      retainedStartQuantity: retainedStart, capitalUtilizationPercent, finalOutputQuantity: finalOutput,
      expectedNetProfitQuantity: expectedNet, expectedNetProfitPercent: expectedNetPercent,
      netProfitQuantity: stressNet, netProfitPercent: stressNetPercent,
      stressNetProfitQuantity: stressNet, stressNetProfitPercent: stressNetPercent,
      absoluteNetProfitInr, startAssetInrValue: valuation, tdsCapitalLockInr,
      referenceGrossMultiplier: path.referenceGrossMultiplier, referenceGrossProfitPercent,
      referenceFeeAdjustedProfitPercent, feeDragPercent, quantizationDragPercent, reserveDragPercent,
      computedNetMultiplier, maximumBookSkewMs, legs: legSimulations,
      executionAuthorized: false, automaticExecutionAllowed: false,
    });
  }

  private resolveDepthBoundedInitialInput(path: TriangularDiscoveryPath, configuredMaximum: number): number {
    let initialCapacity = configuredMaximum;
    let grossInputMultiplier = 1;
    for (const leg of path.legs) {
      if (!Number.isFinite(leg.maximumInputQuantity) || leg.maximumInputQuantity <= 0 ||
          !Number.isFinite(leg.referenceRate) || leg.referenceRate <= 0 || grossInputMultiplier <= 0) return 0;
      initialCapacity = Math.min(initialCapacity, leg.maximumInputQuantity / grossInputMultiplier);
      grossInputMultiplier *= leg.referenceRate;
    }
    return initialCapacity;
  }

  private evaluateLeg(exchange: string, leg: TriangularDiscoveryLeg, inputQuantity: number,
    configuration: TriangularArbitrageConfiguration, now: number): {blockers: TriangularArbitrageBlocker[]; simulation: TriangularArbitrageLegSimulation | null} {
    const blockers: TriangularArbitrageBlocker[] = [];
    if (!Number.isFinite(leg.timestamp) || leg.timestamp <= 0 || leg.timestamp > now || now - leg.timestamp > configuration.maximumOpportunityAgeMs) blockers.push("STALE_LEG_EVIDENCE");
    if (!Number.isFinite(inputQuantity) || inputQuantity <= 0 || !Number.isFinite(leg.referenceRate) || leg.referenceRate <= 0) blockers.push("NON_FINITE_SIMULATION");
    const feeEvidence = this.dependencies.getFeeEvidence(exchange, leg.market);
    if (!feeEvidence) blockers.push("FEE_EVIDENCE_MISSING");
    const capability = this.dependencies.getCapability(exchange, leg.market);
    if (!capability) blockers.push("CAPABILITY_EVIDENCE_MISSING");
    const book = this.dependencies.getOrderBook(exchange, leg.market);
    if (!book) blockers.push("ORDER_BOOK_MISSING");
    if (blockers.length > 0 || !feeEvidence || !capability || !book) return {blockers, simulation: null};
    if (capability.synchronizedAt > now || now - capability.synchronizedAt > configuration.maximumCapabilityAgeMs) blockers.push("CAPABILITY_EVIDENCE_STALE");
    if (!capability.tradingEnabled || capability.maintenanceMode) blockers.push("MARKET_TRADING_DISABLED");
    const supportsImmediate = capability.order.supportedOrderTypes.includes("market") ||
      (capability.order.supportedOrderTypes.includes("limit") && capability.order.supportedTimeInForce.some((item) => item === "IOC" || item === "FOK"));
    if (!supportsImmediate) blockers.push("EXECUTABLE_ORDER_UNSUPPORTED");
    if (book.timestamp > now || now - book.timestamp > configuration.maximumOrderBookAgeMs) blockers.push("ORDER_BOOK_STALE");
    const increment = this.quantityIncrement(capability);
    if (increment === null) blockers.push("QUANTITY_RULES_INCOMPLETE");
    if (capability.notional.minimumNotional === null) blockers.push("MINIMUM_NOTIONAL_MISSING");
    if (blockers.length > 0 || increment === null) return {blockers, simulation: null};

    const topPrice = leg.action === "SELL_BASE" ? book.bids[0]?.price : book.asks[0]?.price;
    if (!topPrice || !Number.isFinite(topPrice) || topPrice <= 0) return {blockers: ["ORDER_BOOK_MISSING"], simulation: null};
    let baseQuantity: number;
    if (leg.action === "SELL_BASE") baseQuantity = this.quantizeDown(inputQuantity, increment);
    else baseQuantity = this.quantizeDown(this.baseQuantityForQuoteBudget(book.asks, inputQuantity), increment);
    if (!Number.isFinite(baseQuantity) || baseQuantity <= 0) return {blockers: ["FULL_DEPTH_INSUFFICIENT"], simulation: null};
    const levels = leg.action === "SELL_BASE" ? book.bids : book.asks;
    const fill = vwapCalculator.calculate(levels, baseQuantity);
    if (fill.partialFill || fill.filledQuantity + 1e-12 < baseQuantity) blockers.push("FULL_DEPTH_INSUFFICIENT");
    const tradedInput = leg.action === "SELL_BASE" ? fill.filledQuantity : fill.totalCost;
    const outputBeforeFee = leg.action === "SELL_BASE" ? fill.totalCost : fill.filledQuantity;
    const notional = fill.totalCost;
    if (capability.quantity.minimumQuantity !== null && baseQuantity < capability.quantity.minimumQuantity) blockers.push("QUANTITY_BELOW_MINIMUM");
    if (capability.quantity.maximumQuantity !== null && baseQuantity > capability.quantity.maximumQuantity) blockers.push("QUANTITY_ABOVE_MAXIMUM");
    if (capability.notional.minimumNotional !== null && notional < capability.notional.minimumNotional) blockers.push("NOTIONAL_BELOW_MINIMUM");
    if (capability.notional.maximumNotional !== null && notional > capability.notional.maximumNotional) blockers.push("NOTIONAL_ABOVE_MAXIMUM");
    const feePercent = feeEvidence.takerPercent;
    const feeAmount = outputBeforeFee * feePercent / 100;
    const outputAfterFee = outputBeforeFee - feeAmount;
    const slippage = leg.action === "SELL_BASE" ? Math.max(0, (topPrice - fill.averagePrice) / topPrice * 100)
      : Math.max(0, (fill.averagePrice - topPrice) / topPrice * 100);
    if (!Number.isFinite(outputAfterFee) || outputAfterFee <= 0 || !Number.isFinite(slippage)) blockers.push("NON_FINITE_SIMULATION");
    if (blockers.length > 0) return {blockers, simulation: null};
    return {blockers, simulation: immutableClone({
      market: leg.market, fromAsset: leg.fromAsset, toAsset: leg.toAsset, action: leg.action,
      inputQuantity, tradedInputQuantity: tradedInput, outputBeforeFee, feePercent, feeAmount,
      feeAsset: leg.toAsset, outputAfterFee, averageFillPrice: fill.averagePrice, topOfBookPrice: topPrice,
      depthSlippagePercent: slippage, roundingDustInputQuantity: Math.max(0, inputQuantity - tradedInput),
      consumedDepthLevels: this.consumedLevels(levels, fill.filledQuantity), orderBookTimestamp: book.timestamp,
      orderBookAgeMs: now - book.timestamp, topOfBookMaximumInput: leg.maximumInputQuantity,
      capabilitySynchronizedAt: capability.synchronizedAt, executionPolicy: "FOK_OR_IOC_LIMIT_FUTURE_ONLY",
    })};
  }

  private baseQuantityForQuoteBudget(levels: OrderBook["asks"], quoteBudget: number): number {
    let remaining = quoteBudget;
    let base = 0;
    for (const level of levels) {
      if (remaining <= 0) break;
      if (!Number.isFinite(level.price) || !Number.isFinite(level.quantity) || level.price <= 0 || level.quantity <= 0) return 0;
      const quantity = Math.min(level.quantity, remaining / level.price);
      base += quantity;
      remaining -= quantity * level.price;
    }
    return base;
  }
  private consumedLevels(levels: OrderBook["bids"], quantity: number): number {
    let remaining = quantity;
    let count = 0;
    for (const level of levels) { if (remaining <= 1e-12) break; remaining -= Math.min(remaining, level.quantity); count += 1; }
    return count;
  }
  private quantityIncrement(capability: ExchangeMarketCapability): number | null {
    if (capability.quantity.quantityStep !== null && Number.isFinite(capability.quantity.quantityStep) && capability.quantity.quantityStep > 0) return capability.quantity.quantityStep;
    if (capability.quantity.quantityPrecision !== null && Number.isSafeInteger(capability.quantity.quantityPrecision) &&
        capability.quantity.quantityPrecision >= 0 && capability.quantity.quantityPrecision <= 18) return 10 ** -capability.quantity.quantityPrecision;
    return null;
  }
  private quantizeDown(value: number, increment: number): number { return Math.floor((value + Number.EPSILON) / increment) * increment; }
}

function compareSimulationsByExpectedNet(
  first: TriangularArbitragePathSimulation,
  second: TriangularArbitragePathSimulation,
): number {
  return Number(second.status === "QUALIFIED") - Number(first.status === "QUALIFIED") ||
    (second.stressNetProfitPercent ?? Number.NEGATIVE_INFINITY) -
      (first.stressNetProfitPercent ?? Number.NEGATIVE_INFINITY) ||
    (second.expectedNetProfitPercent ?? Number.NEGATIVE_INFINITY) -
      (first.expectedNetProfitPercent ?? Number.NEGATIVE_INFINITY) ||
    second.referenceGrossMultiplier - first.referenceGrossMultiplier ||
    first.pathId.localeCompare(second.pathId);
}

function normalize(value: number): number { return Number(value.toFixed(8)); }
function immutableClone<T>(value: T): T { return deepFreeze(structuredClone(value)); }
function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}
