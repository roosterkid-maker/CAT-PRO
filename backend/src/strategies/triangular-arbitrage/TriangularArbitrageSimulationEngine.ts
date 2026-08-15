import {
  getExchangeFeeEvidence,
} from "../../arbitrage/config/fees";

import type {
  ExchangeFeeEvidence,
} from "../../arbitrage/models/FeeModel";

import type {
  DynamicOpportunityDiscoverySnapshot,
  TriangularDiscoveryLeg,
  TriangularDiscoveryPath,
} from "../../discovery/models/DynamicOpportunityDiscovery";

import type {
  ExchangeMarketCapability,
} from "../../execution/capabilities/models/ExchangeCapability";

import {
  exchangeCapabilityService,
} from "../../execution/capabilities/services/ExchangeCapabilityService";

import type {
  TriangularArbitrageConfiguration,
} from "./TriangularArbitrageConfiguration";

export type TriangularArbitrageBlocker =
  | "INVALID_PATH"
  | "STALE_LEG_EVIDENCE"
  | "FEE_EVIDENCE_MISSING"
  | "CAPABILITY_EVIDENCE_MISSING"
  | "CAPABILITY_EVIDENCE_STALE"
  | "MARKET_TRADING_DISABLED"
  | "MARKET_ORDER_UNSUPPORTED"
  | "QUANTITY_RULES_INCOMPLETE"
  | "MINIMUM_NOTIONAL_MISSING"
  | "TOP_OF_BOOK_DEPTH_EXCEEDED"
  | "QUANTITY_BELOW_MINIMUM"
  | "QUANTITY_ABOVE_MAXIMUM"
  | "NOTIONAL_BELOW_MINIMUM"
  | "NOTIONAL_ABOVE_MAXIMUM"
  | "NON_FINITE_SIMULATION"
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
  readonly outputAfterFee: number;
  readonly topOfBookMaximumInput: number;
  readonly capabilitySynchronizedAt: number;
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
  readonly netProfitQuantity: number | null;
  readonly netProfitPercent: number | null;
  readonly referenceGrossMultiplier: number;
  readonly referenceGrossProfitPercent: number;
  readonly referenceFeeAdjustedProfitPercent: number | null;
  readonly feeDragPercent: number | null;
  readonly quantizationDragPercent: number | null;
  readonly computedNetMultiplier: number | null;
  readonly legs: readonly TriangularArbitrageLegSimulation[];
  readonly executionAuthorized: false;
  readonly automaticExecutionAllowed: false;
}

export interface TriangularArbitrageSimulationSnapshot {
  readonly generatedAt: number;
  readonly sourceSnapshotGeneratedAt: number;
  readonly evaluatedPaths: number;
  readonly qualifiedPaths: number;
  readonly blockedPaths: number;
  readonly simulations: readonly TriangularArbitragePathSimulation[];
  readonly safety: {
    readonly shadowOnly: true;
    readonly paperExecutionAllowed: false;
    readonly liveExecutionAllowed: false;
    readonly orderSubmissionAllowed: false;
  };
}

export interface TriangularArbitrageSimulationDependencies {
  getFeeEvidence(exchange: string, market: string): ExchangeFeeEvidence | null;

  getCapability(exchange: string, market: string): ExchangeMarketCapability | null;
}

const DEFAULT_DEPENDENCIES: TriangularArbitrageSimulationDependencies = {
  getFeeEvidence: (exchange, market) =>
    getExchangeFeeEvidence(exchange, market),
  getCapability: (exchange, market) =>
    exchangeCapabilityService.getCachedCapability(exchange, market, "spot"),
};

export class TriangularArbitrageSimulationEngine {
  private readonly dependencies: TriangularArbitrageSimulationDependencies;

  constructor(
    dependencies: Partial<TriangularArbitrageSimulationDependencies> = {},
  ) {
    this.dependencies = {
      ...DEFAULT_DEPENDENCIES,
      ...dependencies,
    };
  }

  evaluate(
    snapshot: DynamicOpportunityDiscoverySnapshot,
    configuration: TriangularArbitrageConfiguration,
    now = Date.now(),
  ): TriangularArbitrageSimulationSnapshot {
    const simulations = configuration.enabled
      ? snapshot.triangularPaths
          .slice(0, configuration.maximumSignalsPerSnapshot * 10)
          .map((path) => this.evaluatePath(path, configuration, now))
      : [];

    return immutableClone({
      generatedAt: now,
      sourceSnapshotGeneratedAt: snapshot.generatedAt,
      evaluatedPaths: simulations.length,
      qualifiedPaths:
        simulations.filter((simulation) => simulation.status === "QUALIFIED").length,
      blockedPaths:
        simulations.filter((simulation) => simulation.status === "BLOCKED").length,
      simulations,
      safety: {
        shadowOnly: true,
        paperExecutionAllowed: false,
        liveExecutionAllowed: false,
        orderSubmissionAllowed: false,
      },
    });
  }

  private evaluatePath(
    path: TriangularDiscoveryPath,
    configuration: TriangularArbitrageConfiguration,
    now: number,
  ): TriangularArbitragePathSimulation {
    const blockers = new Set<TriangularArbitrageBlocker>();

    if (
      path.legs.length !== 3 ||
      path.assets.length !== 4 ||
      path.assets[0] !== path.assets[3] ||
      path.startAsset !== path.assets[0]
    ) {
      blockers.add("INVALID_PATH");
    }

    let currentInput = this.resolveDepthBoundedInitialInput(
      path,
      configuration.maximumInitialInputQuantity,
    );

    const initialSizingLimit = currentInput;
    const legSimulations: TriangularArbitrageLegSimulation[] = [];

    if (!Number.isFinite(initialSizingLimit) || initialSizingLimit <= 0) {
      blockers.add("INVALID_PATH");
    }

    for (const leg of path.legs) {
      const result = this.evaluateLeg(
        path.exchange,
        leg,
        currentInput,
        configuration,
        now,
      );

      for (const blocker of result.blockers) {
        blockers.add(blocker);
      }

      if (!result.simulation) {
        break;
      }

      legSimulations.push(result.simulation);
      currentInput = result.simulation.outputAfterFee;
    }

    const initialInput = legSimulations[0]?.tradedInputQuantity ?? initialSizingLimit;
    const retainedStart = Math.max(0, initialSizingLimit - initialInput);
    const capitalUtilizationPercent = initialSizingLimit > 0
      ? initialInput / initialSizingLimit * 100
      : 0;
    const referenceGrossProfitPercent = (path.referenceGrossMultiplier - 1) * 100;
    const cumulativeFeeMultiplier = legSimulations.length === 3
      ? legSimulations.reduce(
          (multiplier, leg) => multiplier * (1 - leg.feePercent / 100),
          1,
        )
      : null;
    const referenceFeeAdjustedProfitPercent = cumulativeFeeMultiplier === null
      ? null
      : (path.referenceGrossMultiplier * cumulativeFeeMultiplier - 1) * 100;
    const feeDragPercent = referenceFeeAdjustedProfitPercent === null
      ? null
      : referenceGrossProfitPercent - referenceFeeAdjustedProfitPercent;

    let finalOutput: number | null = null;
    let netProfit: number | null = null;
    let netProfitPercent: number | null = null;
    let computedNetMultiplier: number | null = null;

    if (blockers.size === 0 && legSimulations.length === 3) {
      finalOutput = currentInput;
      netProfit = finalOutput - initialInput;
      netProfitPercent = initialInput > 0
        ? netProfit / initialInput * 100
        : null;
      computedNetMultiplier = initialInput > 0
        ? finalOutput / initialInput
        : null;

      if (
        !Number.isFinite(finalOutput) ||
        !Number.isFinite(netProfit) ||
        !Number.isFinite(netProfitPercent) ||
        !Number.isFinite(computedNetMultiplier)
      ) {
        blockers.add("NON_FINITE_SIMULATION");
      } else if (
        netProfitPercent === null ||
        netProfitPercent < configuration.minimumNetProfitPercent
      ) {
        blockers.add("MINIMUM_NET_PROFIT_NOT_MET");
      }
    }

    const quantizationDragPercent =
      referenceFeeAdjustedProfitPercent === null || netProfitPercent === null
        ? null
        : Math.max(0, referenceFeeAdjustedProfitPercent - netProfitPercent);

    return immutableClone({
      pathId: path.id,
      exchange: path.exchange,
      startAsset: path.startAsset,
      assets: path.assets,
      status: blockers.size === 0 ? "QUALIFIED" : "BLOCKED",
      blockers: [...blockers],
      initialSizingLimitQuantity: initialSizingLimit,
      initialInputQuantity: initialInput,
      retainedStartQuantity: retainedStart,
      capitalUtilizationPercent,
      finalOutputQuantity: finalOutput,
      netProfitQuantity: netProfit,
      netProfitPercent,
      referenceGrossMultiplier: path.referenceGrossMultiplier,
      referenceGrossProfitPercent,
      referenceFeeAdjustedProfitPercent,
      feeDragPercent,
      quantizationDragPercent,
      computedNetMultiplier,
      legs: legSimulations,
      executionAuthorized: false,
      automaticExecutionAllowed: false,
    });
  }

  /**
   * Translate every downstream leg's input capacity back into the cycle's
   * start asset. This selects the largest genuinely top-of-book-executable
   * cycle instead of rejecting an otherwise executable smaller trade merely
   * because the configured upper bound exceeds a later leg's depth.
   *
   * Gross multipliers are deliberately used for the translation. Fees and
   * quantity quantization only reduce subsequent inputs, making the bound
   * conservative while the exact leg simulation remains authoritative.
   */
  private resolveDepthBoundedInitialInput(
    path: TriangularDiscoveryPath,
    configuredMaximum: number,
  ): number {
    let initialCapacity = configuredMaximum;
    let grossInputMultiplier = 1;

    for (const leg of path.legs) {
      if (
        !Number.isFinite(leg.maximumInputQuantity) ||
        leg.maximumInputQuantity <= 0 ||
        !Number.isFinite(leg.referenceRate) ||
        leg.referenceRate <= 0 ||
        !Number.isFinite(grossInputMultiplier) ||
        grossInputMultiplier <= 0
      ) {
        return 0;
      }

      initialCapacity = Math.min(
        initialCapacity,
        leg.maximumInputQuantity / grossInputMultiplier,
      );
      grossInputMultiplier *= leg.referenceRate;
    }

    return initialCapacity;
  }

  private evaluateLeg(
    exchange: string,
    leg: TriangularDiscoveryLeg,
    inputQuantity: number,
    configuration: TriangularArbitrageConfiguration,
    now: number,
  ): {
    blockers: TriangularArbitrageBlocker[];
    simulation: TriangularArbitrageLegSimulation | null;
  } {
    const blockers: TriangularArbitrageBlocker[] = [];

    if (
      !Number.isFinite(leg.timestamp) ||
      leg.timestamp <= 0 ||
      leg.timestamp > now ||
      now - leg.timestamp > configuration.signalTtlMs
    ) {
      blockers.push("STALE_LEG_EVIDENCE");
    }

    if (
      !Number.isFinite(inputQuantity) ||
      inputQuantity <= 0 ||
      !Number.isFinite(leg.referenceRate) ||
      leg.referenceRate <= 0
    ) {
      blockers.push("NON_FINITE_SIMULATION");
    }

    if (inputQuantity > leg.maximumInputQuantity + Number.EPSILON) {
      blockers.push("TOP_OF_BOOK_DEPTH_EXCEEDED");
    }

    const feeEvidence =
      this.dependencies.getFeeEvidence(exchange, leg.market);

    if (!feeEvidence) {
      blockers.push("FEE_EVIDENCE_MISSING");
    }

    const capability =
      this.dependencies.getCapability(exchange, leg.market);

    if (!capability) {
      blockers.push("CAPABILITY_EVIDENCE_MISSING");
    }

    if (blockers.length > 0 || !feeEvidence || !capability) {
      return {blockers, simulation: null};
    }

    if (
      capability.synchronizedAt > now ||
      now - capability.synchronizedAt > configuration.maximumCapabilityAgeMs
    ) {
      blockers.push("CAPABILITY_EVIDENCE_STALE");
    }

    if (!capability.tradingEnabled || capability.maintenanceMode) {
      blockers.push("MARKET_TRADING_DISABLED");
    }

    if (!capability.order.supportedOrderTypes.includes("market")) {
      blockers.push("MARKET_ORDER_UNSUPPORTED");
    }

    const quantityIncrement = this.quantityIncrement(capability);

    if (quantityIncrement === null) {
      blockers.push("QUANTITY_RULES_INCOMPLETE");
    }

    if (capability.notional.minimumNotional === null) {
      blockers.push("MINIMUM_NOTIONAL_MISSING");
    }

    if (blockers.length > 0 || quantityIncrement === null) {
      return {blockers, simulation: null};
    }

    const rawBaseQuantity = leg.action === "SELL_BASE"
      ? inputQuantity
      : inputQuantity * leg.referenceRate;

    const baseQuantity = this.quantizeDown(rawBaseQuantity, quantityIncrement);
    const tradedInput = leg.action === "SELL_BASE"
      ? baseQuantity
      : baseQuantity / leg.referenceRate;
    const outputBeforeFee = leg.action === "SELL_BASE"
      ? baseQuantity * leg.referenceRate
      : baseQuantity;
    const notional = leg.action === "SELL_BASE"
      ? outputBeforeFee
      : tradedInput;

    if (
      capability.quantity.minimumQuantity !== null &&
      baseQuantity < capability.quantity.minimumQuantity
    ) {
      blockers.push("QUANTITY_BELOW_MINIMUM");
    }

    if (
      capability.quantity.maximumQuantity !== null &&
      baseQuantity > capability.quantity.maximumQuantity
    ) {
      blockers.push("QUANTITY_ABOVE_MAXIMUM");
    }

    if (
      capability.notional.minimumNotional !== null &&
      notional < capability.notional.minimumNotional
    ) {
      blockers.push("NOTIONAL_BELOW_MINIMUM");
    }

    if (
      capability.notional.maximumNotional !== null &&
      notional > capability.notional.maximumNotional
    ) {
      blockers.push("NOTIONAL_ABOVE_MAXIMUM");
    }

    const feePercent = feeEvidence.takerPercent;
    const feeAmount = outputBeforeFee * feePercent / 100;
    const outputAfterFee = outputBeforeFee - feeAmount;

    if (
      !Number.isFinite(baseQuantity) ||
      baseQuantity <= 0 ||
      !Number.isFinite(outputAfterFee) ||
      outputAfterFee <= 0
    ) {
      blockers.push("NON_FINITE_SIMULATION");
    }

    if (blockers.length > 0) {
      return {blockers, simulation: null};
    }

    return {
      blockers,
      simulation: immutableClone({
        market: leg.market,
        fromAsset: leg.fromAsset,
        toAsset: leg.toAsset,
        action: leg.action,
        inputQuantity,
        tradedInputQuantity: tradedInput,
        outputBeforeFee,
        feePercent,
        feeAmount,
        outputAfterFee,
        topOfBookMaximumInput: leg.maximumInputQuantity,
        capabilitySynchronizedAt: capability.synchronizedAt,
      }),
    };
  }

  private quantityIncrement(capability: ExchangeMarketCapability): number | null {
    if (
      capability.quantity.quantityStep !== null &&
      Number.isFinite(capability.quantity.quantityStep) &&
      capability.quantity.quantityStep > 0
    ) {
      return capability.quantity.quantityStep;
    }

    if (
      capability.quantity.quantityPrecision !== null &&
      Number.isSafeInteger(capability.quantity.quantityPrecision) &&
      capability.quantity.quantityPrecision >= 0 &&
      capability.quantity.quantityPrecision <= 18
    ) {
      return 10 ** -capability.quantity.quantityPrecision;
    }

    return null;
  }

  private quantizeDown(value: number, increment: number): number {
    const units = Math.floor((value + Number.EPSILON) / increment);
    return units * increment;
  }
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
