import {createHash} from "node:crypto";
import type {CentralStrategyExecutionLeg, CentralStrategyExecutionPlan} from "../../../strategies/models/CentralStrategyExecutionPlan";
import {centralLiveLifecycleEvidenceStore, type CentralLiveLifecycleEvidenceStore} from "../central/CentralLiveLifecycleEvidenceStore";
import type {DerivativeEntryAdmissionEvidence, DerivativeExitEvaluationEvidence} from "../handlers/ParallelDerivativeLiveLifecycleHandler";
import type {PassiveMakerHedgeAdmissionEvidence} from "../handlers/PassiveMakerThenHedgeLiveLifecycleHandler";
import type {SequentialLegSizingEvidence} from "../handlers/SequentialThreeLegLiveLifecycleHandler";
import type {TwoSidedQuoteCycleEvidence} from "../handlers/TwoSidedPassiveMakerLiveLifecycleHandler";

const EPSILON = 1e-12;
type PassiveSource = Omit<PassiveMakerHedgeAdmissionEvidence, "evidenceId" | "planId">;
type SequentialSource = Omit<SequentialLegSizingEvidence, "evidenceId" | "planId" | "legId">;
type TwoSidedSource = Omit<TwoSidedQuoteCycleEvidence, "evidenceId" | "planId">;
type DerivativeEntrySource = Omit<DerivativeEntryAdmissionEvidence, "evidenceId" | "planId">;
type DerivativeExitSource = Omit<DerivativeExitEvaluationEvidence, "evidenceId" | "planId" | "positionGroupEvidenceId">;

/**
 * Strict boundary between read-only runtime observations and central LIVE
 * lifecycle handlers. Source collectors must supply exact evidence; this class
 * validates it against the immutable plan and seals it without granting order,
 * capital, queue or action authority.
 */
export class CentralLiveRuntimeEvidenceCollector {
  constructor(private readonly evidence: CentralLiveLifecycleEvidenceStore = centralLiveLifecycleEvidenceStore,
    private readonly maximumEvidenceAgeMs = 10_000) {
    if (!Number.isSafeInteger(maximumEvidenceAgeMs) || maximumEvidenceAgeMs <= 0) {
      throw new Error("Central LIVE runtime evidence age must be positive.");
    }
  }

  sealPassiveMakerAdmission(plan: CentralStrategyExecutionPlan, source: PassiveSource,
    observedAt = Date.now()): PassiveMakerHedgeAdmissionEvidence {
    this.current(plan, source.generatedAt, source.expiresAt, observedAt);
    if (plan.strategyId !== "cross-exchange-market-making" || plan.pattern !== "PASSIVE_MAKER_THEN_HEDGE" ||
      plan.settlementPolicy.kind !== "PASSIVE_FILL_THEN_HEDGE_CYCLE") throw new Error("Passive maker evidence plan is mismatched.");
    const maker = only(plan.legs.filter((item) => item.orderType === "LIMIT_POST_ONLY" && item.dependency === "PARALLEL"), "maker leg");
    only(plan.legs.filter((item) => item.orderType === "MARKET" && item.dependency === "PASSIVE_FILL_TRIGGER"), "hedge leg");
    if (maker.quantity === null || !same(source.makerQuantity, maker.quantity) || !same(source.makerPrice, maker.referencePrice) ||
      !positive(source.bestBid) || !positive(source.bestAsk) || source.bestBid >= source.bestAsk ||
      !source.marketRulesFresh || !source.feeScheduleFresh || !source.authenticatedInventoryFresh ||
      !nonNegative(source.maximumBaseFeeQuantity) || !nonNegative(source.maximumQuoteFeeQuantity) ||
      !nonNegative(source.baseQuantityTolerance) || !nonNegative(source.maximumUnpairedBaseExposure) ||
      !asset(source.baseAsset) || !asset(source.quoteAsset) ||
      (maker.side === "BUY" ? source.makerPrice > source.bestBid + EPSILON : source.makerPrice < source.bestAsk - EPSILON)) {
      throw new Error("Passive maker source lacks exact non-marketable quote, rules, fees or authenticated inventory evidence.");
    }
    const payload = this.identify<PassiveMakerHedgeAdmissionEvidence>(plan.id, "PASSIVE_MAKER_ADMISSION", {...source, planId: plan.id});
    this.evidence.seal({kind: "ENTRY_ADMISSION", planId: plan.id, evidenceKey: `passive-maker:${payload.evidenceId}`,
      payload, capturedAt: observedAt, expiresAt: source.expiresAt});
    return freeze(structuredClone(payload));
  }

  sealSequentialSizing(plan: CentralStrategyExecutionPlan, legId: string, source: SequentialSource,
    observedAt = Date.now()): SequentialLegSizingEvidence {
    this.current(plan, source.generatedAt, source.expiresAt, observedAt);
    if (plan.strategyId !== "triangular-arbitrage" || plan.pattern !== "SEQUENTIAL_THREE_LEG" ||
      plan.settlementPolicy.kind !== "IMMEDIATE_CONVERSION_CYCLE") throw new Error("Sequential sizing plan is mismatched.");
    const leg = exactLeg(plan, legId); const flow = only(plan.settlementPolicy.flows.filter((item) => item.legId === leg.id), "sequential flow");
    if (leg.product !== "SPOT" || leg.orderType !== "MARKET" || normalize(source.fromAsset) !== normalize(flow.fromAsset) ||
      normalize(source.toAsset) !== normalize(flow.toAsset) || !positive(source.availableInputQuantity) ||
      !positive(source.requestedBaseQuantity) || !positive(source.maximumExpectedInputQuantity) ||
      source.availableInputQuantity > source.maximumExpectedInputQuantity + EPSILON || !nonNegative(source.allowedInputDustQuantity) ||
      !source.marketRulesVerified || !source.quoteFresh || !source.feeScheduleFresh) {
      throw new Error("Sequential sizing source lacks exact flow, depth, rules or fee evidence.");
    }
    const payload = this.identify<SequentialLegSizingEvidence>(plan.id, "SEQUENTIAL_SIZING", {...source, planId: plan.id, legId});
    this.evidence.seal({kind: "SEQUENTIAL_SIZING", planId: plan.id,
      evidenceKey: `sizing:${leg.id}:${normalize(source.fromAsset)}:${normalize(source.toAsset)}:${numberKey(source.availableInputQuantity)}`,
      payload, capturedAt: observedAt, expiresAt: source.expiresAt});
    return freeze(structuredClone(payload));
  }

  sealTwoSidedQuote(plan: CentralStrategyExecutionPlan, cumulativeBaseDelta: number, cumulativeQuoteDelta: number,
    source: TwoSidedSource, observedAt = Date.now()): TwoSidedQuoteCycleEvidence {
    this.current(plan, source.generatedAt, source.expiresAt, observedAt);
    if (plan.strategyId !== "dynamic-market-making" || plan.pattern !== "TWO_SIDED_PASSIVE_MAKER" ||
      plan.settlementPolicy.kind !== "TWO_SIDED_PASSIVE_FILL_CYCLE" || !Number.isSafeInteger(source.cycle) || source.cycle < 1 ||
      !Number.isFinite(cumulativeBaseDelta) || !Number.isFinite(cumulativeQuoteDelta)) throw new Error("Two-sided quote plan or cycle is invalid.");
    const bid = only(plan.legs.filter((item) => item.side === "BUY"), "bid leg");
    const ask = only(plan.legs.filter((item) => item.side === "SELL"), "ask leg");
    if (bid.exchange.toLowerCase() !== source.exchange.toLowerCase() || ask.exchange.toLowerCase() !== source.exchange.toLowerCase() ||
      bid.market.toUpperCase() !== source.market.toUpperCase() || ask.market.toUpperCase() !== source.market.toUpperCase() ||
      bid.quantity === null || ask.quantity === null || !same(source.bidPrice, bid.referencePrice) || !same(source.askPrice, ask.referencePrice) ||
      !same(source.bidQuantity, bid.quantity) || !same(source.askQuantity, ask.quantity) || !positive(source.bestBid) ||
      !positive(source.bestAsk) || source.bestBid >= source.bestAsk || source.bidPrice > source.bestBid + EPSILON ||
      source.askPrice < source.bestAsk - EPSILON || !source.inventoryEvidenceId.trim() || !nonNegative(source.inventoryBaseTotal) ||
      !nonNegative(source.inventoryBaseAvailable) || !nonNegative(source.inventoryQuoteAvailable) ||
      !nonNegative(source.minimumBaseInventory) || source.maximumBaseInventory < source.minimumBaseInventory ||
      !nonNegative(source.maximumUnpairedBaseExposure) || !nonNegative(source.maximumBaseFeeQuantity) ||
      !nonNegative(source.maximumQuoteFeeQuantity) || !nonNegative(source.baseQuantityTolerance) ||
      !source.marketRulesVerified || !source.authenticatedInventoryFresh || !source.quoteFresh || !source.feeScheduleFresh ||
      !source.empiricalFillEvidenceFresh || !asset(source.baseAsset) || !asset(source.quoteAsset)) {
      throw new Error("Two-sided source lacks exact passive quotes, authenticated inventory, rules, fees or empirical fill evidence.");
    }
    const payload = this.identify<TwoSidedQuoteCycleEvidence>(plan.id, "TWO_SIDED_QUOTE", {...source, planId: plan.id});
    this.evidence.seal({kind: "TWO_SIDED_QUOTE", planId: plan.id,
      evidenceKey: `quote:${source.cycle}:${numberKey(cumulativeBaseDelta)}:${numberKey(cumulativeQuoteDelta)}`,
      payload, capturedAt: observedAt, expiresAt: source.expiresAt});
    return freeze(structuredClone(payload));
  }

  sealDerivativeEntry(plan: CentralStrategyExecutionPlan, source: DerivativeEntrySource,
    observedAt = Date.now()): DerivativeEntryAdmissionEvidence {
    this.current(plan, source.generatedAt, source.expiresAt, observedAt);
    if (!(["spot-perpetual-basis-arbitrage", "funding-rate-arbitrage", "perpetual-perpetual-arbitrage", "statistical-arbitrage"] as const)
      .includes(plan.strategyId as never) || (plan.pattern !== "PARALLEL_TWO_LEG" && plan.pattern !== "PARALLEL_STATISTICAL_PAIR") ||
      source.legs.length !== plan.legs.length) throw new Error("Derivative entry plan is mismatched.");
    for (const leg of plan.legs) {
      const item = only(source.legs.filter((candidate) => candidate.legId === leg.id), `derivative admission ${leg.id}`);
      if (item.product !== leg.product || !item.accountEvidenceId.trim() || !item.authenticatedReadFresh ||
        !item.balanceOrMarginSufficient || !item.marketRulesFresh || !item.quoteAndDepthFresh || !item.feeScheduleFresh ||
        (leg.product === "PERPETUAL" && (!item.positionEvidenceId?.trim() || item.currentSignedPositionQuantity !== 0 ||
          !item.liquidationControlReady || !item.reduceOnlyExitVerified ||
          (item.positionMode !== "ONE_WAY" && item.positionMode !== "HEDGE") ||
          item.positionSide !== (leg.side === "BUY" ? "LONG" : "SHORT"))) ||
        (leg.product === "SPOT" && (item.positionMode !== null || item.positionSide !== null ||
          item.currentSignedPositionQuantity !== null || item.positionEvidenceId !== null))) {
        throw new Error(`Derivative entry source is incomplete for leg ${leg.id}.`);
      }
    }
    const payload = this.identify<DerivativeEntryAdmissionEvidence>(plan.id, "DERIVATIVE_ENTRY", {...source, planId: plan.id});
    this.evidence.seal({kind: "ENTRY_ADMISSION", planId: plan.id, evidenceKey: `derivative-entry:${payload.evidenceId}`,
      payload, capturedAt: observedAt, expiresAt: source.expiresAt});
    return freeze(structuredClone(payload));
  }

  sealDerivativeExit(plan: CentralStrategyExecutionPlan, dispatchId: string, positionGroupEvidenceId: string,
    source: DerivativeExitSource, observedAt = Date.now()): DerivativeExitEvaluationEvidence {
    this.current(plan, source.generatedAt, source.expiresAt, observedAt);
    if (!positionGroupEvidenceId.trim() || (source.state === "READY_TO_CLOSE" && source.blockers.length > 0) ||
      (source.state !== "READY_TO_CLOSE" && source.blockers.length === 0) || source.legs.length !== plan.legs.length) {
      throw new Error("Derivative exit state, blockers or position lineage is invalid.");
    }
    for (const leg of plan.legs) {
      const item = only(source.legs.filter((candidate) => candidate.entryLegId === leg.id), `derivative exit ${leg.id}`);
      if (item.product !== leg.product || item.exchange.toLowerCase() !== leg.exchange.toLowerCase() ||
        item.market.toUpperCase() !== leg.market.toUpperCase() || !positive(item.quantity) || !positive(item.referencePrice) ||
        !Number.isFinite(item.currentSignedPositionQuantity) || item.currentSignedPositionQuantity === 0 ||
        item.side !== (item.currentSignedPositionQuantity > 0 ? "SELL" : "BUY") || !item.positionEvidenceId.trim() ||
        (source.state === "READY_TO_CLOSE" && (!item.fullDepthVerified || !item.feeScheduleFresh ||
          (item.product === "PERPETUAL" && (!item.reduceOnlyVerified || item.fundingEvidenceIds.length === 0 ||
            item.fundingEvidenceIds.some((id) => !id.trim())))))) {
        throw new Error(`Derivative exit source is incomplete for leg ${leg.id}.`);
      }
    }
    if (source.state === "READY_TO_CLOSE") {
      const policy = plan.settlementPolicy;
      const expectedThreshold = policy.kind === "BASIS_CONVERGENCE" ? policy.closeAtOrBelowAbsoluteBasisPercent
        : policy.kind === "SPREAD_CONVERGENCE" ? policy.closeAtOrBelowAbsoluteDislocationPercent
          : policy.kind === "STATISTICAL_MEAN_REVERSION" ? policy.closeAtOrBelowAbsoluteZScore : null;
      if (policy.kind === "FUNDING_CAPTURE_THEN_EXIT") {
        if (source.generatedAt < policy.notBefore) throw new Error("Funding exit evidence precedes its admitted timestamp.");
      } else if (expectedThreshold === null || source.conditionMetric === null || source.conditionThreshold === null ||
        !same(source.conditionThreshold, expectedThreshold) || Math.abs(source.conditionMetric) > expectedThreshold + EPSILON) {
        throw new Error("Ready derivative exit does not meet its exact settlement condition.");
      }
    }
    const payload = this.identify<DerivativeExitEvaluationEvidence>(plan.id, "DERIVATIVE_EXIT",
      {...source, planId: plan.id, positionGroupEvidenceId});
    this.evidence.seal({kind: "EXIT_EVALUATION", planId: plan.id, dispatchId,
      evidenceKey: `exit:${positionGroupEvidenceId}:${source.generatedAt}`, payload, capturedAt: observedAt,
      expiresAt: source.expiresAt});
    return freeze(structuredClone(payload));
  }

  getDiagnostics(now = Date.now()) { validateTime(now); return freeze({version: "81.0" as const, generatedAt: now,
    safety: {readOnlySourceEvidenceOnly: true, exchangeRequestPerformed: false, capitalMutationPerformed: false,
      queueMutationPerformed: false, actionAuthorityGranted: false, liveExecutionAllowed: false, orderSubmissionAllowed: false,
      exactPlanBinding: true, durableEvidenceSealing: true}}); }

  private current(plan: CentralStrategyExecutionPlan, generatedAt: number, expiresAt: number, observedAt: number): void {
    validateTime(observedAt); validateTime(generatedAt); validateTime(expiresAt);
    if (plan.expiresAt < observedAt || generatedAt > observedAt || expiresAt < observedAt || expiresAt > plan.expiresAt ||
      observedAt - generatedAt > this.maximumEvidenceAgeMs) throw new Error("Central LIVE source evidence is stale, future, expired or exceeds plan lifetime.");
  }
  private identify<T extends {readonly evidenceId: string}>(planId: string, kind: string, value: Omit<T, "evidenceId">): T {
    const hash = createHash("sha256").update(JSON.stringify({planId, kind, value})).digest("hex");
    return freeze({...value, evidenceId: `central-live-runtime:${hash}`} as T);
  }
}

function exactLeg(plan: CentralStrategyExecutionPlan, legId: string): CentralStrategyExecutionLeg {
  return only(plan.legs.filter((item) => item.id === legId), `plan leg ${legId}`);
}
function only<T>(values: readonly T[], label: string): T { if (values.length !== 1) throw new Error(`Expected exactly one ${label}.`); return values[0] as T; }
function normalize(value: string): string { const result = value.trim().toUpperCase(); if (!asset(result)) throw new Error(`Invalid asset: ${value}`); return result; }
function asset(value: string): boolean { return /^[A-Z0-9]{2,12}$/u.test(value.trim().toUpperCase()); }
function positive(value: number): boolean { return Number.isFinite(value) && value > 0; }
function nonNegative(value: number): boolean { return Number.isFinite(value) && value >= 0; }
function same(left: number, right: number): boolean { return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= EPSILON; }
function numberKey(value: number): string { return Number(value.toFixed(12)).toString().replace("-", "m").replace(".", "p"); }
function validateTime(value: number): void { if (!Number.isSafeInteger(value) || value <= 0) throw new Error("Central LIVE evidence timestamp must be positive."); }
function freeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; for (const nested of Object.values(value)) freeze(nested); return Object.freeze(value); }

export const centralLiveRuntimeEvidenceCollector = new CentralLiveRuntimeEvidenceCollector();
