import type {CentralStrategyExecutionLeg} from "../../../strategies/models/CentralStrategyExecutionPlan";
import type {CentralLiveLifecycleHandler, CentralLiveLifecycleResumeInput} from "../central/CentralLiveLifecycleHandlerRegistry";
import type {LiveExecutionRequest} from "../models/LiveExecutionRequest";
import type {LiveExecutionResult} from "../models/LiveExecutionResult";

const EPSILON = 1e-12;

export interface PassiveMakerHedgeAdmissionEvidence {
  readonly evidenceId: string; readonly planId: string; readonly generatedAt: number; readonly expiresAt: number;
  readonly baseAsset: string; readonly quoteAsset: string; readonly makerPrice: number; readonly makerQuantity: number;
  readonly bestBid: number; readonly bestAsk: number; readonly marketRulesFresh: boolean; readonly feeScheduleFresh: boolean;
  readonly authenticatedInventoryFresh: boolean; readonly maximumBaseFeeQuantity: number;
  readonly maximumQuoteFeeQuantity: number; readonly thirdAssetFeeBalanceVerified: boolean;
  readonly baseQuantityTolerance: number; readonly maximumUnpairedBaseExposure: number;
}
export interface PassiveMakerHedgeOrderEvidence {
  readonly evidenceId: string; readonly admissionEvidenceId: string; readonly result: LiveExecutionResult;
  readonly fees: readonly {readonly asset: string; readonly amount: number; readonly quoteValue: number | null;
    readonly valuationEvidenceId: string | null}[]; readonly observedAt: number; readonly orderSubmissionPerformed: boolean;
}
export interface PassiveMakerHedgeRecoveryRequest {
  readonly planId: string; readonly dispatchId: string; readonly strategyId: "cross-exchange-market-making";
  readonly sourceEvidenceId: string; readonly exchange: string; readonly market: string;
  readonly baseAsset: string; readonly quoteAsset: string; readonly side: "buy" | "sell"; readonly quantity: number;
  readonly referencePrice: number; readonly capturedAt: number; readonly reason: "HEDGE_RESIDUAL" | "CANCEL_RACE_EXCESS";
}
export interface PassiveMakerHedgeSettlementInput {
  readonly planId: string; readonly dispatchId: string; readonly idempotencyKey: string;
  readonly admissionEvidenceId: string; readonly makerOrderEvidenceId: string; readonly hedgeOrderEvidenceId: string | null;
  readonly makerBaseDelta: number; readonly hedgeBaseDelta: number; readonly netBaseDelta: number;
  readonly netQuoteDelta: number; readonly completedAt: number;
}
export interface PassiveMakerThenHedgeLiveLifecyclePort {
  getAdmissionEvidence(planId: string, dispatchStartedAt: number): PassiveMakerHedgeAdmissionEvidence | null;
  submitOrReconcile(input: {readonly request: LiveExecutionRequest; readonly idempotencyKey: string;
    readonly admissionEvidenceId: string; readonly allowNewSubmission: boolean}): Promise<PassiveMakerHedgeOrderEvidence | null>;
  readOrReconcile(input: {readonly exchange: string; readonly market: string; readonly orderId: string;
    readonly idempotencyKey: string; readonly admissionEvidenceId: string}): Promise<PassiveMakerHedgeOrderEvidence>;
  cancelOrReconcile(input: {readonly exchange: string; readonly market: string; readonly orderId: string;
    readonly idempotencyKey: string; readonly admissionEvidenceId: string}): Promise<PassiveMakerHedgeOrderEvidence>;
  captureSettlement(input: PassiveMakerHedgeSettlementInput): Promise<string>;
  stageRecovery(input: PassiveMakerHedgeRecoveryRequest): Promise<string>;
  now(): number;
}

export class PassiveMakerThenHedgeLiveLifecycleHandler implements CentralLiveLifecycleHandler {
  readonly id = "central-passive-maker-hedge-v80"; readonly pattern = "PASSIVE_MAKER_THEN_HEDGE" as const;
  constructor(private readonly port: PassiveMakerThenHedgeLiveLifecyclePort, private readonly maximumStatusReads = 3) {
    if (!Number.isSafeInteger(maximumStatusReads) || maximumStatusReads < 1 || maximumStatusReads > 20) {
      throw new Error("Passive maker status-read bound must be 1-20.");
    }
  }
  async resume(input: CentralLiveLifecycleResumeInput) {
    const {plan} = input.queueRecord; const {maker, hedge} = this.validatePlan(input);
    const dispatchStartedAt = input.queueRecord.dispatchStartedAt as number;
    const admission = this.port.getAdmissionEvidence(plan.id, dispatchStartedAt);
    this.validateAdmission(admission, plan.id, maker, dispatchStartedAt);
    const exact = admission as PassiveMakerHedgeAdmissionEvidence;
    const makerRequest = request(maker, exact.makerQuantity, exact.makerPrice,
      clientOrderId(input.idempotencyKey, "maker"));
    let makerEvidence = await this.port.submitOrReconcile({request: makerRequest,
      idempotencyKey: `${input.idempotencyKey}:maker:submit`, admissionEvidenceId: exact.evidenceId,
      allowNewSubmission: this.newSubmissionAllowed(input)});
    if (!makerEvidence) return outcome(plan.id, this.id, "REJECTED", [], [], false, this.port.now(),
      ["Maker order had no existing evidence and new submission authority was unavailable."]);
    this.validateOrder(makerEvidence, makerRequest, exact, null);
    let orderSubmissionPerformed = makerEvidence.orderSubmissionPerformed;
    let makerCancelRaceExcess = false;
    for (let read = 1; read <= this.maximumStatusReads && !terminal(makerEvidence.result.status) &&
      makerEvidence.result.filledQuantity <= EPSILON; read += 1) {
      const previous = makerEvidence;
      makerEvidence = await this.port.readOrReconcile({exchange: maker.exchange, market: maker.market,
        orderId: orderId(makerEvidence.result), idempotencyKey: `${input.idempotencyKey}:maker:read:${read}`,
        admissionEvidenceId: exact.evidenceId});
      this.validateOrder(makerEvidence, makerRequest, exact, previous);
      orderSubmissionPerformed ||= makerEvidence.orderSubmissionPerformed;
    }
    if (!terminal(makerEvidence.result.status)) {
      const previous = makerEvidence;
      makerEvidence = await this.port.cancelOrReconcile({exchange: maker.exchange, market: maker.market,
        orderId: orderId(previous.result), idempotencyKey: `${input.idempotencyKey}:maker:cancel`,
        admissionEvidenceId: exact.evidenceId});
      this.validateOrder(makerEvidence, makerRequest, exact, previous);
      makerCancelRaceExcess = makerEvidence.result.filledQuantity > previous.result.filledQuantity + exact.baseQuantityTolerance;
      if (!terminal(makerEvidence.result.status)) throw new Error("Passive maker cancellation lacks terminal order evidence.");
    }
    orderSubmissionPerformed ||= makerEvidence.orderSubmissionPerformed;
    const makerEffect = effect(makerEvidence, exact);
    if (Math.abs(makerEffect.baseDelta) <= exact.baseQuantityTolerance + EPSILON) {
      const completedAt = this.port.now();
      const settlement = await this.port.captureSettlement({planId: plan.id, dispatchId: input.dispatchId,
        idempotencyKey: `${input.idempotencyKey}:settlement`, admissionEvidenceId: exact.evidenceId,
        makerOrderEvidenceId: makerEvidence.evidenceId, hedgeOrderEvidenceId: null, makerBaseDelta: makerEffect.baseDelta,
        hedgeBaseDelta: 0, netBaseDelta: makerEffect.baseDelta, netQuoteDelta: makerEffect.quoteDelta, completedAt});
      if (!settlement.trim()) throw new Error("Durable no-fill maker settlement evidence is required.");
      return outcome(plan.id, this.id, "REJECTED", [makerEvidence.evidenceId, settlement], [], orderSubmissionPerformed,
        completedAt, ["Maker cycle ended without material fill; no hedge order was submitted."]);
    }
    const hedgeQuantity = Math.abs(makerEffect.baseDelta);
    if (hedge.side === maker.side || hedgeQuantity > (hedge.quantity as number) + exact.maximumBaseFeeQuantity + EPSILON) {
      throw new Error("Fill-driven hedge direction or fee-adjusted quantity exceeds the canonical risk bound.");
    }
    const hedgeRequest = request(hedge, hedgeQuantity, null, clientOrderId(input.idempotencyKey, "hedge"));
    let hedgeEvidence = await this.port.submitOrReconcile({request: hedgeRequest,
      idempotencyKey: `${input.idempotencyKey}:hedge:submit`, admissionEvidenceId: exact.evidenceId,
      allowNewSubmission: true});
    if (!hedgeEvidence) throw new Error("Risk-reducing hedge did not yield reconcilable order evidence.");
    this.validateOrder(hedgeEvidence, hedgeRequest, exact, null); orderSubmissionPerformed ||= hedgeEvidence.orderSubmissionPerformed;
    for (let read = 1; read <= this.maximumStatusReads && !terminal(hedgeEvidence.result.status); read += 1) {
      const previous = hedgeEvidence;
      hedgeEvidence = await this.port.readOrReconcile({exchange: hedge.exchange, market: hedge.market,
        orderId: orderId(previous.result), idempotencyKey: `${input.idempotencyKey}:hedge:read:${read}`,
        admissionEvidenceId: exact.evidenceId});
      this.validateOrder(hedgeEvidence, hedgeRequest, exact, previous);
      orderSubmissionPerformed ||= hedgeEvidence.orderSubmissionPerformed;
    }
    if (!terminal(hedgeEvidence.result.status)) {
      const previous = hedgeEvidence;
      hedgeEvidence = await this.port.cancelOrReconcile({exchange: hedge.exchange, market: hedge.market,
        orderId: orderId(previous.result), idempotencyKey: `${input.idempotencyKey}:hedge:cancel`,
        admissionEvidenceId: exact.evidenceId});
      this.validateOrder(hedgeEvidence, hedgeRequest, exact, previous);
      orderSubmissionPerformed ||= hedgeEvidence.orderSubmissionPerformed;
      if (!terminal(hedgeEvidence.result.status)) throw new Error("Risk-reducing hedge cancellation lacks terminal evidence.");
    }
    const hedgeEffect = effect(hedgeEvidence, exact); const netBaseDelta = normalize(makerEffect.baseDelta + hedgeEffect.baseDelta);
    const netQuoteDelta = normalize(makerEffect.quoteDelta + hedgeEffect.quoteDelta); const completedAt = this.port.now();
    const settlement = await this.port.captureSettlement({planId: plan.id, dispatchId: input.dispatchId,
      idempotencyKey: `${input.idempotencyKey}:settlement`, admissionEvidenceId: exact.evidenceId,
      makerOrderEvidenceId: makerEvidence.evidenceId, hedgeOrderEvidenceId: hedgeEvidence.evidenceId,
      makerBaseDelta: makerEffect.baseDelta, hedgeBaseDelta: hedgeEffect.baseDelta, netBaseDelta, netQuoteDelta, completedAt});
    if (!settlement.trim()) throw new Error("Durable maker-hedge settlement evidence is required.");
    if (Math.abs(netBaseDelta) > exact.maximumUnpairedBaseExposure + exact.baseQuantityTolerance + EPSILON) {
      const recoveryId = await this.port.stageRecovery({planId: plan.id, dispatchId: input.dispatchId,
        strategyId: "cross-exchange-market-making", sourceEvidenceId: settlement, exchange: hedge.exchange,
        market: hedge.market, baseAsset: exact.baseAsset, quoteAsset: exact.quoteAsset,
        side: netBaseDelta > 0 ? "sell" : "buy", quantity: Math.abs(netBaseDelta), referencePrice: hedge.referencePrice,
        capturedAt: completedAt, reason: makerCancelRaceExcess ? "CANCEL_RACE_EXCESS" : "HEDGE_RESIDUAL"});
      return outcome(plan.id, this.id, "RECOVERY_REQUIRED", [makerEvidence.evidenceId, hedgeEvidence.evidenceId, settlement],
        [recoveryId], orderSubmissionPerformed, completedAt,
        ["Maker and hedge actual fills settled, but material net base inventory entered shared recovery."]);
    }
    return outcome(plan.id, this.id, "COMPLETED", [makerEvidence.evidenceId, hedgeEvidence.evidenceId, settlement], [],
      orderSubmissionPerformed, completedAt,
      [`Passive maker fill and fee-adjusted hedge settled with net base delta ${netBaseDelta} and quote delta ${netQuoteDelta}.`]);
  }

  private validatePlan(input: CentralLiveLifecycleResumeInput) {
    const {queueRecord} = input; const {plan} = queueRecord;
    if (queueRecord.state !== "DISPATCHING" || queueRecord.lifecycleHandlerId !== this.id ||
      plan.strategyId !== "cross-exchange-market-making" || plan.pattern !== this.pattern ||
      plan.settlementPolicy.kind !== "PASSIVE_FILL_THEN_HEDGE_CYCLE" || queueRecord.dispatchStartedAt === null ||
      queueRecord.dispatchStartedAt > plan.expiresAt || queueRecord.dispatchStartedAt > queueRecord.actionAuthorityExpiresAt) {
      throw new Error("Passive maker-hedge handler requires an exact authorized dispatching Strategy #2 plan.");
    }
    const maker = plan.legs.filter((item) => item.orderType === "LIMIT_POST_ONLY" && item.dependency === "PARALLEL")[0];
    const hedge = plan.legs.filter((item) => item.orderType === "MARKET" && item.dependency === "PASSIVE_FILL_TRIGGER")[0];
    if (plan.legs.length !== 2 || !maker || !hedge || maker.product !== "SPOT" || hedge.product !== "SPOT" ||
      !positive(maker.quantity ?? 0) || !positive(hedge.quantity ?? 0) ||
      maker.market.trim().toUpperCase() !== hedge.market.trim().toUpperCase()) {
      throw new Error("Passive maker-hedge plan requires exact positive SPOT maker and fill-triggered hedge legs.");
    }
    return {maker, hedge};
  }
  private validateAdmission(value: PassiveMakerHedgeAdmissionEvidence | null, planId: string,
    maker: CentralStrategyExecutionLeg, dispatchStartedAt: number): void {
    if (!value || value.planId !== planId || !value.evidenceId.trim() || value.generatedAt > dispatchStartedAt ||
      value.expiresAt < dispatchStartedAt || !asset(value.baseAsset) || !asset(value.quoteAsset) ||
      Math.abs(value.makerPrice - maker.referencePrice) > EPSILON || value.makerQuantity !== maker.quantity ||
      !positive(value.bestBid) || !positive(value.bestAsk) || value.bestBid >= value.bestAsk ||
      !value.marketRulesFresh || !value.feeScheduleFresh || !value.authenticatedInventoryFresh ||
      !nonNegative(value.maximumBaseFeeQuantity) || !nonNegative(value.maximumQuoteFeeQuantity) ||
      !nonNegative(value.baseQuantityTolerance) || !nonNegative(value.maximumUnpairedBaseExposure)) {
      throw new Error("Exact historical maker quote/rule/fee/inventory admission evidence is required.");
    }
    if ((maker.side === "BUY" && value.makerPrice > value.bestBid + EPSILON) ||
      (maker.side === "SELL" && value.makerPrice < value.bestAsk - EPSILON)) throw new Error("Authorized maker price is marketable.");
  }
  private validateOrder(value: PassiveMakerHedgeOrderEvidence, requestValue: LiveExecutionRequest,
    admission: PassiveMakerHedgeAdmissionEvidence, previous: PassiveMakerHedgeOrderEvidence | null): void {
    const result = value.result; const feeAssets = value.fees.map((fee) => asset(fee.asset));
    if (!value.evidenceId.trim() || value.admissionEvidenceId !== admission.evidenceId || value.observedAt > this.port.now() ||
      result.exchange.toLowerCase() !== requestValue.exchange.toLowerCase() || result.market !== requestValue.market ||
      result.side !== requestValue.side || !nonNegative(result.filledQuantity) || result.filledQuantity > requestValue.quantity + EPSILON ||
      (result.filledQuantity > EPSILON && !positive(result.averageFillPrice)) || new Set(feeAssets).size !== feeAssets.length ||
      value.fees.some((fee) => !nonNegative(fee.amount)) ||
      (previous && (previous.result.orderId !== result.orderId || result.filledQuantity + EPSILON < previous.result.filledQuantity))) {
      throw new Error("Maker-hedge order evidence is invalid, mismatched, or regressed.");
    }
    const baseFees = value.fees.filter((fee) => asset(fee.asset) === asset(admission.baseAsset)).reduce((sum, fee) => sum + fee.amount, 0);
    const quoteFees = value.fees.filter((fee) => asset(fee.asset) === asset(admission.quoteAsset)).reduce((sum, fee) => sum + fee.amount, 0);
    if (baseFees > admission.maximumBaseFeeQuantity + EPSILON) throw new Error("Aggregate base fee exceeded admission.");
    if (quoteFees > admission.maximumQuoteFeeQuantity + EPSILON) throw new Error("Aggregate quote fee exceeded admission.");
    for (const fee of value.fees) {
      if (asset(fee.asset) !== asset(admission.baseAsset) && asset(fee.asset) !== asset(admission.quoteAsset) && fee.amount > EPSILON &&
        (!admission.thirdAssetFeeBalanceVerified || !nonNegative(fee.quoteValue ?? -1) || !fee.valuationEvidenceId?.trim())) {
        throw new Error("Third-asset fee lacks admitted balance and quote valuation evidence.");
      }
    }
  }
  private newSubmissionAllowed(input: CentralLiveLifecycleResumeInput): boolean { const now = this.port.now();
    return now <= input.queueRecord.plan.expiresAt && now <= input.queueRecord.actionAuthorityExpiresAt; }
}

function effect(value: PassiveMakerHedgeOrderEvidence, admission: PassiveMakerHedgeAdmissionEvidence) {
  const result = value.result; let baseDelta = result.side === "buy" ? result.filledQuantity : -result.filledQuantity;
  let quoteDelta = result.side === "buy" ? -result.filledQuantity * result.averageFillPrice : result.filledQuantity * result.averageFillPrice;
  for (const fee of value.fees) { const feeAsset = asset(fee.asset);
    if (feeAsset === asset(admission.baseAsset)) baseDelta -= fee.amount;
    else if (feeAsset === asset(admission.quoteAsset)) quoteDelta -= fee.amount;
    else if (fee.amount > EPSILON) quoteDelta -= fee.quoteValue as number; }
  return {baseDelta: normalize(baseDelta), quoteDelta: normalize(quoteDelta)};
}
function request(leg: CentralStrategyExecutionLeg, quantity: number, price: number | null, clientOrderIdValue: string): LiveExecutionRequest {
  return {exchange: leg.exchange, product: "SPOT", market: leg.market, side: leg.side === "BUY" ? "buy" : "sell",
    orderType: price === null ? "market" : "limit", ...(price === null ? {} : {price, postOnly: true}), quantity,
    clientOrderId: clientOrderIdValue, cancelOnTimeout: false}; }
function clientOrderId(key: string, phase: string): string { return `${key.slice(0, 28)}-${phase}`.slice(0, 36); }
function orderId(result: LiveExecutionResult): string { if (!result.orderId?.trim()) throw new Error("Open maker order ID is required."); return result.orderId; }
function terminal(status: LiveExecutionResult["status"]): boolean { return ["FILLED", "CANCELLED", "REJECTED", "FAILED"].includes(status); }
function outcome(planId: string, handlerId: string, state: "COMPLETED" | "RECOVERY_REQUIRED" | "REJECTED",
  terminalEvidenceIds: readonly string[], recoveryIntentIds: readonly string[], orderSubmissionPerformed: boolean,
  completedAt: number, reasons: readonly string[]) { return freeze({planId, handlerId, state, terminalEvidenceIds: [...terminalEvidenceIds],
    recoveryIntentIds: [...recoveryIntentIds], orderSubmissionPerformed, completedAt, reasons: [...reasons]}); }
function asset(value: string): string { const result = value.trim().toUpperCase(); if (!/^[A-Z0-9]{2,12}$/u.test(result)) throw new Error(`Invalid maker asset: ${value}`); return result; }
function positive(value: number): boolean { return Number.isFinite(value) && value > 0; }
function nonNegative(value: number): boolean { return Number.isFinite(value) && value >= 0; }
function normalize(value: number): number { return Math.abs(value) <= EPSILON ? 0 : Number(value.toFixed(12)); }
function freeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; for (const nested of Object.values(value)) freeze(nested); return Object.freeze(value); }
