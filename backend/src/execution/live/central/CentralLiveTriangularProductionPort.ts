import {
  SequentialThreeLegProductionPort,
} from "../production/CentralLiveProductionLifecyclePorts";

import type {
  SequentialLegSizingEvidence,
  SequentialThreeLegLiveLifecyclePort,
} from "../handlers/SequentialThreeLegLiveLifecycleHandler";

import type {
  TriangularArbitrageConfiguration,
} from "../../../strategies/triangular-arbitrage/TriangularArbitrageConfiguration";

import {
  centralLiveTriangularSizingService,
  type CentralLiveTriangularSizingService,
} from "./CentralLiveTriangularSizingService";

/** How long a freshly computed sizing evidence stays valid before a retry
 * must recompute it - short, matching the "dispatch-instant freshness"
 * philosophy the rest of this codebase's LIVE preflight uses. */
const SIZING_EVIDENCE_TTL_MS = 3_000;

/**
 * Extends the real production Sequential-Three-Leg port
 * (SequentialThreeLegProductionPort, already wired to the real order
 * gateway/evidence store/recovery bridge every other Central LIVE handler
 * uses) with an ACTIVE getSizingEvidence(): the base class only ever did a
 * passive read from CentralLiveLifecycleEvidenceStore, assuming something
 * upstream had already sealed sizing evidence for the exact
 * (leg, fromAsset, toAsset, availableInputQuantity) key - nothing did. This
 * subclass computes it for real (via CentralLiveTriangularSizingService,
 * itself backed by the same real order-book/capability/fee caches the
 * SHADOW simulation engine uses) on first ask, seals it for idempotent
 * crash/retry replay (inherited seal()/exactPayload() from
 * ProductionPortBase), and only ever returns a passive read on any
 * subsequent identical ask - so a mid-cycle retry resubmits the exact same
 * sized order instead of silently resizing it.
 */
export class CentralLiveTriangularProductionPort
  extends SequentialThreeLegProductionPort
  implements SequentialThreeLegLiveLifecyclePort {
  constructor(
    private readonly configurationProvider: () => TriangularArbitrageConfiguration,
    private readonly sizing: Pick<CentralLiveTriangularSizingService, "computeLegSizing"> = centralLiveTriangularSizingService,
  ) {
    super();
  }

  override getSizingEvidence(
    input: Parameters<SequentialThreeLegLiveLifecyclePort["getSizingEvidence"]>[0],
  ): SequentialLegSizingEvidence | null {
    // Sizing evidence is plan-scoped, not dispatch-scoped (the handler's
    // own call site never supplies a dispatchId) - so this reads/writes
    // CentralLiveLifecycleEvidenceStore directly with dispatchId=null,
    // matching the base class's original passive lookup, rather than the
    // protected seal()/exactPayload() convenience wrappers (which hardcode
    // a non-null dispatchId for the OTHER, dispatch-scoped evidence kinds).
    //
    // The evidence store's composite key is immutable once sealed (a second
    // seal() with a different payload/expiry at the same key throws). A key
    // bucketed only by (leg, assets, quantity) - with no time component -
    // would collide across TTL windows: a later, legitimate resize attempt
    // for the exact same (leg, assets, quantity) after the first sizing
    // evidence expired would throw instead of sealing fresh evidence,
    // because its recomputed expiresAt necessarily differs from the first.
    // Bucketing by TTL window keeps repeat asks INSIDE one window idempotent
    // (same key, same payload, same expiry - the intended crash/retry replay
    // behavior) while a genuinely new attempt after expiry gets a distinct
    // key and can seal fresh evidence without ever rebinding an existing one.
    const ttlBucket = Math.floor(input.now / SIZING_EVIDENCE_TTL_MS);
    const key = `sizing:${input.leg.id}:${input.fromAsset}:${input.toAsset}:${numberKey(input.availableInputQuantity)}:${ttlBucket}`;
    const existing = this.evidence.getCurrent<SequentialLegSizingEvidence>(
      "SEQUENTIAL_SIZING",
      input.planId,
      null,
      key,
      input.now,
    )?.payload ?? null;

    if (existing) {
      return existing;
    }

    const configuration = this.configurationProvider();
    const result = this.sizing.computeLegSizing({
      exchange: input.leg.exchange,
      market: input.leg.market,
      fromAsset: input.fromAsset,
      toAsset: input.toAsset,
      side: input.leg.side,
      availableInputQuantity: input.availableInputQuantity,
      configuration,
      now: input.now,
    });

    if (!result.ok) {
      return null;
    }

    const evidenceId = `sequential-sizing:${key}`;
    const payload: SequentialLegSizingEvidence = {
      evidenceId,
      planId: input.planId,
      legId: input.leg.id,
      fromAsset: input.fromAsset,
      toAsset: input.toAsset,
      generatedAt: input.now,
      expiresAt: input.now + SIZING_EVIDENCE_TTL_MS,
      availableInputQuantity: input.availableInputQuantity,
      requestedBaseQuantity: result.requestedBaseQuantity,
      maximumExpectedInputQuantity: result.maximumExpectedInputQuantity,
      allowedInputDustQuantity: result.allowedInputDustQuantity,
      marketRulesVerified: result.marketRulesVerified,
      quoteFresh: result.quoteFresh,
      feeScheduleFresh: result.feeScheduleFresh,
      thirdAssetFeeBalanceVerified: result.thirdAssetFeeBalanceVerified,
    };

    this.evidence.seal({
      kind: "SEQUENTIAL_SIZING",
      planId: input.planId,
      dispatchId: null,
      evidenceKey: key,
      payload,
      capturedAt: input.now,
      expiresAt: payload.expiresAt,
    });
    return payload;
  }
}

function numberKey(value: number): string {
  return Number(value.toFixed(12)).toString().replace("-", "m").replace(".", "p");
}
