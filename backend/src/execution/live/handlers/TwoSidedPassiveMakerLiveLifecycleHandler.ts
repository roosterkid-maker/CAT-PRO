import type {CentralStrategyExecutionLeg} from "../../../strategies/models/CentralStrategyExecutionPlan";
import type {
  CentralLiveLifecycleHandler,
  CentralLiveLifecycleOutcome,
  CentralLiveLifecycleResumeInput,
} from "../central/CentralLiveLifecycleHandlerRegistry";
import type {LiveExecutionRequest} from "../models/LiveExecutionRequest";
import type {LiveExecutionResult} from "../models/LiveExecutionResult";

const EPSILON = 1e-12;

export interface TwoSidedQuoteCycleEvidence {
  readonly evidenceId: string;
  readonly planId: string;
  readonly cycle: number;
  readonly exchange: string;
  readonly market: string;
  readonly baseAsset: string;
  readonly quoteAsset: string;
  readonly generatedAt: number;
  readonly expiresAt: number;
  readonly bidPrice: number;
  readonly askPrice: number;
  readonly bidQuantity: number;
  readonly askQuantity: number;
  readonly bestBid: number;
  readonly bestAsk: number;
  readonly inventoryEvidenceId: string;
  readonly inventoryBaseTotal: number;
  readonly inventoryBaseAvailable: number;
  readonly inventoryQuoteAvailable: number;
  readonly minimumBaseInventory: number;
  readonly maximumBaseInventory: number;
  readonly maximumUnpairedBaseExposure: number;
  readonly maximumBaseFeeQuantity: number;
  readonly maximumQuoteFeeQuantity: number;
  readonly baseQuantityTolerance: number;
  readonly marketRulesVerified: boolean;
  readonly authenticatedInventoryFresh: boolean;
  readonly quoteFresh: boolean;
  readonly feeScheduleFresh: boolean;
  readonly empiricalFillEvidenceFresh: boolean;
  readonly thirdAssetFeeBalanceVerified: boolean;
}

export interface TwoSidedOrderExecutionEvidence {
  readonly evidenceId: string;
  readonly quoteEvidenceId: string;
  readonly result: LiveExecutionResult;
  readonly feeAsset?: string;
  readonly feeAmount?: number;
  readonly feeQuoteValue?: number | null;
  readonly feeValuationEvidenceId?: string | null;
  readonly fees?: readonly {readonly asset: string; readonly amount: number;
    readonly quoteValue: number | null; readonly valuationEvidenceId: string | null}[];
  readonly observedAt: number;
  readonly orderSubmissionPerformed: boolean;
}

export interface TwoSidedInventoryRecoveryRequest {
  readonly planId: string;
  readonly strategyId: "dynamic-market-making";
  readonly dispatchId: string;
  readonly settlementEvidenceId: string;
  readonly exchange: string;
  readonly market: string;
  readonly baseAsset: string;
  readonly quoteAsset: string;
  readonly side: "buy" | "sell";
  readonly quantity: number;
  readonly referencePrice: number;
  readonly reason: "HARD_INVENTORY_LIMIT_BREACH" | "UNPAIRED_FILL_LIMIT_BREACH";
  readonly capturedAt: number;
}

export interface TwoSidedCycleSettlementInput {
  readonly planId: string;
  readonly dispatchId: string;
  readonly idempotencyKey: string;
  readonly quoteEvidenceIds: readonly string[];
  readonly terminalOrderEvidenceIds: readonly string[];
  readonly initialBaseInventory: number;
  readonly finalBaseInventory: number;
  readonly baseDelta: number;
  readonly quoteDelta: number;
  readonly buyFilledQuantity: number;
  readonly sellFilledQuantity: number;
  readonly completedAt: number;
}

export interface TwoSidedPassiveMakerLiveLifecyclePort {
  getQuoteCycleEvidence(input: {
    readonly planId: string;
    readonly cycle: number;
    readonly cumulativeBaseDelta: number;
    readonly cumulativeQuoteDelta: number;
    readonly now: number;
  }): TwoSidedQuoteCycleEvidence | null;
  submitOrReconcile(input: {
    readonly request: LiveExecutionRequest;
    readonly planId: string;
    readonly legId: string;
    readonly quoteEvidenceId: string;
    readonly idempotencyKey: string;
    readonly allowNewSubmission: boolean;
  }): Promise<TwoSidedOrderExecutionEvidence | null>;
  readOrReconcile(input: {
    readonly exchange: string;
    readonly market: string;
    readonly orderId: string;
    readonly quoteEvidenceId: string;
    readonly idempotencyKey: string;
  }): Promise<TwoSidedOrderExecutionEvidence>;
  cancelOrReconcile(input: {
    readonly exchange: string;
    readonly market: string;
    readonly orderId: string;
    readonly quoteEvidenceId: string;
    readonly idempotencyKey: string;
  }): Promise<TwoSidedOrderExecutionEvidence>;
  captureSettlement(input: TwoSidedCycleSettlementInput): Promise<string>;
  stageRecovery(request: TwoSidedInventoryRecoveryRequest): Promise<string>;
  now(): number;
}

export interface TwoSidedPassiveMakerLifecycleConfiguration {
  readonly maximumQuoteCycles?: number;
  readonly maximumStatusReadsPerCycle?: number;
  readonly maximumRequoteDeviationPercent?: number;
}

interface OrderState {
  readonly leg: CentralStrategyExecutionLeg;
  readonly request: LiveExecutionRequest;
  readonly idempotencyKey: string;
  evidence: TwoSidedOrderExecutionEvidence;
}

/**
 * Bounded, crash-resumable Strategy #7 quote-cycle owner. Every exchange
 * action is addressed by a stable dispatch-derived idempotency key. An open
 * sibling is cancelled after either side fills, cancel-race fills are included
 * in settlement, and inventory outside the admitted band enters shared
 * recovery. The class has no production singleton or implicit LIVE authority.
 */
export class TwoSidedPassiveMakerLiveLifecycleHandler implements CentralLiveLifecycleHandler {
  readonly id = "central-two-sided-passive-maker-v72";
  readonly pattern = "TWO_SIDED_PASSIVE_MAKER" as const;
  private readonly maximumQuoteCycles: number;
  private readonly maximumStatusReadsPerCycle: number;
  private readonly maximumRequoteDeviationPercent: number;

  constructor(private readonly port: TwoSidedPassiveMakerLiveLifecyclePort,
    configuration: TwoSidedPassiveMakerLifecycleConfiguration = {}) {
    this.maximumQuoteCycles = configuration.maximumQuoteCycles ?? 3;
    this.maximumStatusReadsPerCycle = configuration.maximumStatusReadsPerCycle ?? 3;
    this.maximumRequoteDeviationPercent = configuration.maximumRequoteDeviationPercent ?? 0.25;
    if (!Number.isSafeInteger(this.maximumQuoteCycles) || this.maximumQuoteCycles < 1 || this.maximumQuoteCycles > 10) {
      throw new Error("Two-sided maker quote cycles must be bounded to 1-10.");
    }
    if (!Number.isSafeInteger(this.maximumStatusReadsPerCycle) || this.maximumStatusReadsPerCycle < 1 ||
      this.maximumStatusReadsPerCycle > 50) throw new Error("Two-sided maker status reads must be bounded to 1-50.");
    if (!positive(this.maximumRequoteDeviationPercent) || this.maximumRequoteDeviationPercent > 5) {
      throw new Error("Two-sided maker requote deviation must be positive and at most 5 percent.");
    }
  }

  async resume(input: CentralLiveLifecycleResumeInput): Promise<CentralLiveLifecycleOutcome> {
    const {plan} = input.queueRecord;
    const {bidLeg, askLeg} = this.validatePlan(input);
    let initialBaseInventory: number | null = null;
    let cumulativeBaseDelta = 0;
    let cumulativeQuoteDelta = 0;
    let buyFilledQuantity = 0;
    let sellFilledQuantity = 0;
    let orderSubmissionPerformed = false;
    let rejectedPair = false;
    let latestEvidence: TwoSidedQuoteCycleEvidence | null = null;
    const quoteEvidenceIds: string[] = [];
    const terminalOrderEvidenceIds: string[] = [];

    for (let cycle = 1; cycle <= this.maximumQuoteCycles; cycle += 1) {
      const now = this.port.now();
      const evidence = this.port.getQuoteCycleEvidence({planId: plan.id, cycle, cumulativeBaseDelta,
        cumulativeQuoteDelta, now});
      this.validateQuoteEvidence(evidence, plan.id, cycle, bidLeg, askLeg, now, initialBaseInventory,
        cumulativeBaseDelta, latestEvidence);
      const exact = evidence as TwoSidedQuoteCycleEvidence;
      latestEvidence = exact;
      initialBaseInventory ??= exact.inventoryBaseTotal;
      quoteEvidenceIds.push(exact.evidenceId);

      const bid = this.request(bidLeg, exact.bidQuantity, exact.bidPrice,
        clientOrderId(input.idempotencyKey, cycle, "bid"));
      const ask = this.request(askLeg, exact.askQuantity, exact.askPrice,
        clientOrderId(input.idempotencyKey, cycle, "ask"));
      const allowNewBid = this.newSubmissionAllowed(input, this.port.now());
      const bidEvidence = await this.port.submitOrReconcile({request: bid, planId: plan.id, legId: bidLeg.id,
        quoteEvidenceId: exact.evidenceId, idempotencyKey: `${input.idempotencyKey}:cycle:${cycle}:bid:submit`,
        allowNewSubmission: allowNewBid});
      if (!bidEvidence) {
        rejectedPair = true;
        break;
      }
      this.validateOrderEvidence(bidEvidence, bid, exact, null, this.port.now());
      orderSubmissionPerformed ||= bidEvidence.orderSubmissionPerformed;
      const bidState: OrderState = {leg: bidLeg, request: bid,
        idempotencyKey: `${input.idempotencyKey}:cycle:${cycle}:bid`, evidence: bidEvidence};

      const allowNewAsk = this.newSubmissionAllowed(input, this.port.now());
      const askEvidence = await this.port.submitOrReconcile({request: ask, planId: plan.id, legId: askLeg.id,
        quoteEvidenceId: exact.evidenceId, idempotencyKey: `${input.idempotencyKey}:cycle:${cycle}:ask:submit`,
        allowNewSubmission: allowNewAsk});
      if (!askEvidence) {
        rejectedPair = true;
        await this.cancelOpen(bidState, exact, this.port.now());
        const effect = this.fillEffect(bidState.evidence, exact);
        cumulativeBaseDelta += effect.baseDelta;
        cumulativeQuoteDelta += effect.quoteDelta;
        buyFilledQuantity += bidState.evidence.result.filledQuantity;
        terminalOrderEvidenceIds.push(bidState.evidence.evidenceId);
        break;
      }
      this.validateOrderEvidence(askEvidence, ask, exact, null, this.port.now());
      orderSubmissionPerformed ||= askEvidence.orderSubmissionPerformed;
      const askState: OrderState = {leg: askLeg, request: ask,
        idempotencyKey: `${input.idempotencyKey}:cycle:${cycle}:ask`, evidence: askEvidence};

      for (let read = 1; read <= this.maximumStatusReadsPerCycle &&
        !this.isTerminal(bidState.evidence.result.status) && !this.isTerminal(askState.evidence.result.status); read += 1) {
        bidState.evidence = await this.read(bidState, exact, read);
        askState.evidence = await this.read(askState, exact, read);
        if (bidState.evidence.result.filledQuantity > EPSILON || askState.evidence.result.filledQuantity > EPSILON) break;
      }

      await this.cancelOpen(bidState, exact, this.port.now());
      await this.cancelOpen(askState, exact, this.port.now());
      const bidEffect = this.fillEffect(bidState.evidence, exact);
      const askEffect = this.fillEffect(askState.evidence, exact);
      cumulativeBaseDelta = normalize(cumulativeBaseDelta + bidEffect.baseDelta + askEffect.baseDelta);
      cumulativeQuoteDelta = normalize(cumulativeQuoteDelta + bidEffect.quoteDelta + askEffect.quoteDelta);
      buyFilledQuantity = normalize(buyFilledQuantity + bidState.evidence.result.filledQuantity);
      sellFilledQuantity = normalize(sellFilledQuantity + askState.evidence.result.filledQuantity);
      terminalOrderEvidenceIds.push(bidState.evidence.evidenceId, askState.evidence.evidenceId);
      rejectedPair ||= this.failed(bidState.evidence.result.status) || this.failed(askState.evidence.result.status);

      if (bidState.evidence.result.filledQuantity > EPSILON || askState.evidence.result.filledQuantity > EPSILON || rejectedPair) break;
    }

    if (initialBaseInventory === null || latestEvidence === null) {
      return freeze({planId: plan.id, handlerId: this.id, state: "REJECTED" as const, terminalEvidenceIds: [],
        recoveryIntentIds: [], orderSubmissionPerformed, completedAt: this.port.now(),
        reasons: ["No current two-sided quote cycle evidence was admitted before submission."]});
    }

    const finalBaseInventory = normalize(initialBaseInventory + cumulativeBaseDelta);
    const completedAt = this.port.now();
    const settlementEvidenceId = await this.port.captureSettlement({planId: plan.id, dispatchId: input.dispatchId,
      idempotencyKey: `${input.idempotencyKey}:settlement`, quoteEvidenceIds, terminalOrderEvidenceIds,
      initialBaseInventory, finalBaseInventory, baseDelta: cumulativeBaseDelta, quoteDelta: cumulativeQuoteDelta,
      buyFilledQuantity, sellFilledQuantity, completedAt});
    if (!settlementEvidenceId.trim()) throw new Error("Two-sided maker durable settlement evidence is required.");
    const terminalEvidenceIds = [...terminalOrderEvidenceIds, settlementEvidenceId];
    const recovery = this.recoveryRequirement(latestEvidence, finalBaseInventory,
      cumulativeBaseDelta, settlementEvidenceId, input);
    if (recovery) {
      const recoveryIntentId = await this.port.stageRecovery(recovery);
      if (!recoveryIntentId.trim()) throw new Error("Two-sided maker inventory recovery intent ID is required.");
      return freeze({planId: plan.id, handlerId: this.id, state: "RECOVERY_REQUIRED" as const,
        terminalEvidenceIds, recoveryIntentIds: [recoveryIntentId], orderSubmissionPerformed, completedAt,
        reasons: [`Actual two-sided fills produced ${cumulativeBaseDelta} ${latestEvidence.baseAsset} net inventory; excess was staged in shared recovery.`]});
    }
    return freeze({planId: plan.id, handlerId: this.id, state: rejectedPair ? "REJECTED" as const : "COMPLETED" as const,
      terminalEvidenceIds, recoveryIntentIds: [], orderSubmissionPerformed, completedAt,
      reasons: [rejectedPair
        ? "A paired quote submission or terminal order failed; its sibling was cancelled and all actual fills were settled."
        : `Bounded two-sided quote cycle settled ${buyFilledQuantity} buy and ${sellFilledQuantity} sell base fills; net base delta ${cumulativeBaseDelta}.`]});
  }

  private validatePlan(input: CentralLiveLifecycleResumeInput) {
    const {queueRecord} = input;
    const {plan} = queueRecord;
    if (queueRecord.state !== "DISPATCHING" || queueRecord.lifecycleHandlerId !== this.id ||
      plan.strategyId !== "dynamic-market-making" || plan.pattern !== this.pattern ||
      plan.settlementPolicy.kind !== "TWO_SIDED_PASSIVE_FILL_CYCLE") {
      throw new Error("Two-sided maker handler requires an exact dispatching Strategy #7 plan.");
    }
    if (queueRecord.dispatchStartedAt === null || queueRecord.dispatchStartedAt > queueRecord.actionAuthorityExpiresAt ||
      queueRecord.dispatchStartedAt > plan.expiresAt) {
      throw new Error("Two-sided maker dispatch did not start under current plan and action authority.");
    }
    const bidLegs = plan.legs.filter((item) => item.side === "BUY");
    const askLegs = plan.legs.filter((item) => item.side === "SELL");
    if (plan.legs.length !== 2 || bidLegs.length !== 1 || askLegs.length !== 1) {
      throw new Error("Two-sided maker plan requires exactly one bid and one ask leg.");
    }
    const bidLeg = bidLegs[0] as CentralStrategyExecutionLeg;
    const askLeg = askLegs[0] as CentralStrategyExecutionLeg;
    if ([bidLeg, askLeg].some((leg) => leg.product !== "SPOT" || leg.orderType !== "LIMIT_POST_ONLY" ||
      leg.dependency !== "PARALLEL" || !positive(leg.quantity ?? 0) || !positive(leg.referencePrice)) ||
      bidLeg.exchange.trim().toLowerCase() !== askLeg.exchange.trim().toLowerCase() ||
      bidLeg.market.trim().toUpperCase() !== askLeg.market.trim().toUpperCase() || bidLeg.referencePrice >= askLeg.referencePrice) {
      throw new Error("Two-sided maker canonical bid/ask structure is invalid.");
    }
    return {bidLeg, askLeg};
  }

  private validateQuoteEvidence(value: TwoSidedQuoteCycleEvidence | null, planId: string, cycle: number,
    bidLeg: CentralStrategyExecutionLeg, askLeg: CentralStrategyExecutionLeg, now: number, initialBase: number | null,
    cumulativeBaseDelta: number, previous: TwoSidedQuoteCycleEvidence | null): void {
    if (!value || !value.evidenceId.trim() || value.planId !== planId || value.cycle !== cycle ||
      value.exchange.trim().toLowerCase() !== bidLeg.exchange.trim().toLowerCase() ||
      value.market.trim().toUpperCase() !== bidLeg.market.trim().toUpperCase() || value.generatedAt > now ||
      value.expiresAt < now || !asset(value.baseAsset) || !asset(value.quoteAsset) ||
      !positive(value.bidPrice) || !positive(value.askPrice) || value.bidPrice >= value.askPrice ||
      !positive(value.bestBid) || !positive(value.bestAsk) || value.bestBid >= value.bestAsk ||
      value.bidPrice > value.bestBid + EPSILON || value.askPrice < value.bestAsk - EPSILON ||
      !positive(value.bidQuantity) || !positive(value.askQuantity) ||
      value.bidQuantity > (bidLeg.quantity as number) + EPSILON || value.askQuantity > (askLeg.quantity as number) + EPSILON ||
      !value.inventoryEvidenceId.trim() || !nonNegative(value.inventoryBaseTotal) || !nonNegative(value.inventoryBaseAvailable) ||
      !nonNegative(value.inventoryQuoteAvailable) || !nonNegative(value.minimumBaseInventory) ||
      !positive(value.maximumBaseInventory) || value.minimumBaseInventory >= value.maximumBaseInventory ||
      !nonNegative(value.maximumUnpairedBaseExposure) || !nonNegative(value.maximumBaseFeeQuantity) ||
      !nonNegative(value.maximumQuoteFeeQuantity) || !nonNegative(value.baseQuantityTolerance) ||
      !value.marketRulesVerified || !value.authenticatedInventoryFresh || !value.quoteFresh ||
      !value.feeScheduleFresh || !value.empiricalFillEvidenceFresh) {
      throw new Error("Fresh exact two-sided quote/rule/fee/inventory evidence is required.");
    }
    if (cycle === 1 && (relativeDeviation(value.bidPrice, bidLeg.referencePrice) > 1e-10 ||
      relativeDeviation(value.askPrice, askLeg.referencePrice) > 1e-10)) {
      throw new Error("First two-sided quote cycle must match the action-authorized canonical prices.");
    }
    if (previous && (percentDeviation(value.bidPrice, previous.bidPrice) > this.maximumRequoteDeviationPercent + EPSILON ||
      percentDeviation(value.askPrice, previous.askPrice) > this.maximumRequoteDeviationPercent + EPSILON)) {
      throw new Error("Two-sided replacement quotes exceeded the bounded requote deviation.");
    }
    if (initialBase !== null) {
      const expected = initialBase + cumulativeBaseDelta;
      if (Math.abs(value.inventoryBaseTotal - expected) > Math.max(EPSILON, value.baseQuantityTolerance)) {
        throw new Error("Fresh authenticated inventory does not reconcile with prior two-sided fills.");
      }
    }
    if (value.inventoryBaseAvailable + EPSILON < value.askQuantity + value.maximumBaseFeeQuantity ||
      value.inventoryQuoteAvailable + EPSILON < value.bidQuantity * value.bidPrice + value.maximumQuoteFeeQuantity ||
      value.inventoryBaseTotal + value.bidQuantity > value.maximumBaseInventory + EPSILON ||
      value.inventoryBaseTotal - value.askQuantity - value.maximumBaseFeeQuantity < value.minimumBaseInventory - EPSILON) {
      throw new Error("Two-sided quote quantities exceed authenticated inventory or the hard inventory band.");
    }
  }

  private async read(state: OrderState, quote: TwoSidedQuoteCycleEvidence, read: number) {
    const orderId = requireOrderId(state.evidence.result);
    const evidence = await this.port.readOrReconcile({exchange: state.leg.exchange, market: state.leg.market,
      orderId, quoteEvidenceId: quote.evidenceId, idempotencyKey: `${state.idempotencyKey}:read:${read}`});
    this.validateOrderEvidence(evidence, state.request, quote, state.evidence, this.port.now());
    return evidence;
  }

  private async cancelOpen(state: OrderState, quote: TwoSidedQuoteCycleEvidence, now: number): Promise<void> {
    if (this.isTerminal(state.evidence.result.status)) return;
    const orderId = requireOrderId(state.evidence.result);
    const evidence = await this.port.cancelOrReconcile({exchange: state.leg.exchange, market: state.leg.market,
      orderId, quoteEvidenceId: quote.evidenceId, idempotencyKey: `${state.idempotencyKey}:cancel`});
    this.validateOrderEvidence(evidence, state.request, quote, state.evidence, now);
    if (!this.isTerminal(evidence.result.status)) throw new Error("Two-sided maker cancellation did not produce terminal evidence.");
    state.evidence = evidence;
  }

  private validateOrderEvidence(value: TwoSidedOrderExecutionEvidence, request: LiveExecutionRequest,
    quote: TwoSidedQuoteCycleEvidence, previous: TwoSidedOrderExecutionEvidence | null, now: number): void {
    const result = value.result;
    const fees = twoSidedFees(value);
    if (!value.evidenceId.trim() || value.quoteEvidenceId !== quote.evidenceId || value.observedAt > now ||
      result.exchange.trim().toLowerCase() !== request.exchange.trim().toLowerCase() ||
      result.market.trim().toUpperCase() !== request.market.trim().toUpperCase() || result.side !== request.side ||
      !nonNegative(result.filledQuantity) || result.filledQuantity > request.quantity + EPSILON ||
      (result.filledQuantity > EPSILON && !positive(result.averageFillPrice)) ||
      fees.some((fee) => !nonNegative(fee.amount) || !asset(fee.asset)) ||
      (previous && (previous.result.orderId !== result.orderId || result.filledQuantity + EPSILON < previous.result.filledQuantity))) {
      throw new Error("Two-sided maker order evidence is invalid, mismatched, or regressed.");
    }
    for (const fee of fees) {
      const feeAsset = asset(fee.asset);
      if (feeAsset === asset(quote.baseAsset) && fee.amount > quote.maximumBaseFeeQuantity + EPSILON) {
        throw new Error("Two-sided maker base-asset fee exceeded admitted evidence.");
      }
      if (feeAsset === asset(quote.quoteAsset) && fee.amount > quote.maximumQuoteFeeQuantity + EPSILON) {
        throw new Error("Two-sided maker quote-asset fee exceeded admitted evidence.");
      }
      if (feeAsset !== asset(quote.baseAsset) && feeAsset !== asset(quote.quoteAsset) && fee.amount > EPSILON &&
        (!quote.thirdAssetFeeBalanceVerified || !nonNegative(fee.quoteValue ?? -1) || !fee.valuationEvidenceId?.trim())) {
        throw new Error("Third-asset maker fee requires verified balance and quote valuation evidence.");
      }
    }
  }

  private fillEffect(value: TwoSidedOrderExecutionEvidence, quote: TwoSidedQuoteCycleEvidence) {
    const {result} = value;
    const filled = result.filledQuantity;
    const price = filled > EPSILON ? result.averageFillPrice : 0;
    let baseDelta = result.side === "buy" ? filled : -filled;
    let quoteDelta = result.side === "buy" ? -(filled * price) : filled * price;
    for (const fee of twoSidedFees(value)) {
      const feeAsset = asset(fee.asset);
      if (feeAsset === asset(quote.baseAsset)) baseDelta -= fee.amount;
      else if (feeAsset === asset(quote.quoteAsset)) quoteDelta -= fee.amount;
      else if (fee.amount > EPSILON) quoteDelta -= fee.quoteValue as number;
    }
    return {baseDelta: normalize(baseDelta), quoteDelta: normalize(quoteDelta)};
  }

  private recoveryRequirement(evidence: TwoSidedQuoteCycleEvidence, finalBase: number,
    baseDelta: number, settlementEvidenceId: string, input: CentralLiveLifecycleResumeInput): TwoSidedInventoryRecoveryRequest | null {
    let side: "buy" | "sell" | null = null;
    let quantity = 0;
    let reason: TwoSidedInventoryRecoveryRequest["reason"] = "HARD_INVENTORY_LIMIT_BREACH";
    if (finalBase < evidence.minimumBaseInventory - EPSILON) {
      side = "buy"; quantity = evidence.minimumBaseInventory - finalBase;
    } else if (finalBase > evidence.maximumBaseInventory + EPSILON) {
      side = "sell"; quantity = finalBase - evidence.maximumBaseInventory;
    } else if (Math.abs(baseDelta) > evidence.maximumUnpairedBaseExposure + EPSILON) {
      reason = "UNPAIRED_FILL_LIMIT_BREACH";
      side = baseDelta > 0 ? "sell" : "buy";
      quantity = Math.abs(baseDelta) - evidence.maximumUnpairedBaseExposure;
    }
    if (!side || quantity <= EPSILON) return null;
    return {planId: input.queueRecord.plan.id, strategyId: "dynamic-market-making", dispatchId: input.dispatchId, settlementEvidenceId,
      exchange: evidence.exchange, market: evidence.market, baseAsset: asset(evidence.baseAsset),
      quoteAsset: asset(evidence.quoteAsset), side, quantity: normalize(quantity),
      referencePrice: (evidence.bidPrice + evidence.askPrice) / 2, reason, capturedAt: this.port.now()};
  }

  private request(leg: CentralStrategyExecutionLeg, quantity: number, price: number,
    clientOrderIdValue: string): LiveExecutionRequest {
    return {exchange: leg.exchange, market: leg.market, side: leg.side === "BUY" ? "buy" : "sell",
      orderType: "limit", postOnly: true, quantity, price, clientOrderId: clientOrderIdValue, cancelOnTimeout: false};
  }

  private newSubmissionAllowed(input: CentralLiveLifecycleResumeInput, now: number): boolean {
    return now <= input.queueRecord.plan.expiresAt && now <= input.queueRecord.actionAuthorityExpiresAt;
  }
  private isTerminal(status: LiveExecutionResult["status"]): boolean {
    return status === "FILLED" || status === "CANCELLED" || status === "REJECTED" || status === "FAILED";
  }
  private failed(status: LiveExecutionResult["status"]): boolean { return status === "REJECTED" || status === "FAILED"; }
}

function clientOrderId(key: string, cycle: number, side: "bid" | "ask"): string {
  return `${key.slice(0, 24)}-${cycle}-${side}`.replace(/[^A-Za-z0-9_-]/gu, "-").slice(0, 36);
}
function requireOrderId(result: LiveExecutionResult): string {
  if (!result.orderId?.trim()) throw new Error("Open two-sided maker order requires an exchange order ID.");
  return result.orderId;
}
function asset(value: string): string { const normalized = value.trim().toUpperCase(); if (!/^[A-Z0-9]{2,12}$/u.test(normalized)) throw new Error(`Invalid two-sided maker asset: ${value}`); return normalized; }
function twoSidedFees(value: TwoSidedOrderExecutionEvidence) {
  if (value.fees !== undefined) {
    const assets = value.fees.map((item) => asset(item.asset));
    if (new Set(assets).size !== assets.length) throw new Error("Two-sided fee assets must be aggregated exactly once.");
    return value.fees;
  }
  if (value.feeAsset === undefined || value.feeAmount === undefined) throw new Error("Authoritative two-sided fee evidence is required.");
  return [{asset: value.feeAsset, amount: value.feeAmount, quoteValue: value.feeQuoteValue ?? null,
    valuationEvidenceId: value.feeValuationEvidenceId ?? null}] as const;
}
function positive(value: number): boolean { return Number.isFinite(value) && value > 0; }
function nonNegative(value: number): boolean { return Number.isFinite(value) && value >= 0; }
function normalize(value: number): number { return Math.abs(value) <= EPSILON ? 0 : Number(value.toFixed(12)); }
function relativeDeviation(value: number, reference: number): number { return Math.abs(value - reference) / reference; }
function percentDeviation(value: number, reference: number): number { return relativeDeviation(value, reference) * 100; }
function freeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; for (const nested of Object.values(value)) freeze(nested); return Object.freeze(value); }
