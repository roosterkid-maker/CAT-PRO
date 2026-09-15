import {
  exchangeCapabilityService,
} from "../../capabilities/services/ExchangeCapabilityService";

import type {
  TriangularDiscoveryLeg,
} from "../../../discovery/models/DynamicOpportunityDiscovery";

import type {
  TriangularArbitrageConfiguration,
} from "../../../strategies/triangular-arbitrage/TriangularArbitrageConfiguration";

import {
  TriangularArbitrageSimulationEngine,
  type TriangularArbitrageBlocker,
} from "../../../strategies/triangular-arbitrage/TriangularArbitrageSimulationEngine";

export type CentralLiveTriangularSizingResult =
  | {
    readonly ok: true;
    readonly requestedBaseQuantity: number;
    readonly maximumExpectedInputQuantity: number;
    readonly allowedInputDustQuantity: number;
    readonly marketRulesVerified: true;
    readonly quoteFresh: true;
    readonly feeScheduleFresh: true;
    readonly thirdAssetFeeBalanceVerified: false;
  }
  | {
    readonly ok: false;
    readonly blockers: readonly TriangularArbitrageBlocker[];
  };

/**
 * Computes real, dispatch-time-fresh sizing for exactly one leg of a
 * triangular cycle, at the exact instant the LIVE handler is about to
 * submit that leg's order - reusing
 * TriangularArbitrageSimulationEngine.evaluateLeg() (real multi-level
 * order-book VWAP, real exchange capability/quantity-increment rules, real
 * fee schedule) rather than re-deriving any of that pricing logic. This is
 * the LIVE-side half of the sizing evidence
 * SequentialThreeLegLiveLifecycleHandler requires before it will submit an
 * order; the SHADOW engine and this service can never silently drift apart
 * because they call the same method.
 *
 * thirdAssetFeeBalanceVerified is always false here: this service only
 * knows the PRE-fill picture. Whether the real fill's fee lands in a third
 * asset is only known from the actual exchange result afterward, and the
 * handler's own computeFill() already fails closed
 * ("Third-asset commission requires verified balance...") when that
 * happens without prior verification - conservative by design, not an
 * oversight.
 */
export class CentralLiveTriangularSizingService {
  constructor(
    private readonly engine: TriangularArbitrageSimulationEngine = new TriangularArbitrageSimulationEngine(),
    private readonly capabilities: Pick<typeof exchangeCapabilityService, "getCachedCapability"> = exchangeCapabilityService,
  ) {}

  computeLegSizing(input: {
    readonly exchange: string;
    readonly market: string;
    readonly fromAsset: string;
    readonly toAsset: string;
    readonly side: "BUY" | "SELL";
    readonly availableInputQuantity: number;
    readonly configuration: TriangularArbitrageConfiguration;
    readonly now: number;
  }): CentralLiveTriangularSizingResult {
    const leg: TriangularDiscoveryLeg = {
      market: input.market,
      fromAsset: input.fromAsset,
      toAsset: input.toAsset,
      action: input.side === "SELL" ? "SELL_BASE" : "BUY_BASE",
      // referenceRate/timestamp only gate the upstream discovery/fast-screen
      // step, which this direct per-leg call bypasses entirely - real
      // freshness for THIS call is enforced by evaluateLeg's own
      // book/capability staleness checks against `now` below.
      referenceRate: 1,
      maximumInputQuantity: input.availableInputQuantity,
      timestamp: input.now,
    };

    const {blockers, simulation} = this.engine.evaluateLeg(
      input.exchange,
      leg,
      input.availableInputQuantity,
      input.configuration,
      input.now,
    );

    if (blockers.length > 0 || !simulation) {
      return {ok: false, blockers};
    }

    const requestedBaseQuantity = input.side === "SELL"
      ? simulation.tradedInputQuantity
      : simulation.outputBeforeFee;

    if (!Number.isFinite(requestedBaseQuantity) || requestedBaseQuantity <= 0) {
      return {ok: false, blockers: ["NON_FINITE_SIMULATION"]};
    }

    const capability = this.capabilities.getCachedCapability(input.exchange, input.market, "spot");
    const increment = capability
      ? capability.quantity.quantityStep ??
        (capability.quantity.quantityPrecision !== null ? 10 ** -capability.quantity.quantityPrecision : null)
      : null;
    const allowedInputDustQuantity = increment !== null && Number.isFinite(increment) && increment > 0
      ? increment * 2
      : Math.max(1e-8, input.availableInputQuantity * 1e-6);

    return {
      ok: true,
      requestedBaseQuantity,
      maximumExpectedInputQuantity: input.availableInputQuantity,
      allowedInputDustQuantity,
      marketRulesVerified: true,
      quoteFresh: true,
      feeScheduleFresh: true,
      thirdAssetFeeBalanceVerified: false,
    };
  }
}

export const centralLiveTriangularSizingService =
  new CentralLiveTriangularSizingService();
