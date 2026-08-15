import type {
  CentralExecutionPattern,
  CentralStrategyExecutionLeg,
  CentralStrategyExecutionPlan,
} from "../../../strategies/models/CentralStrategyExecutionPlan";
import type {StrategyId} from "../../../strategies/models/StrategyMetadata";
import type {
  CentralLiveLifecycleHandler,
  CentralLiveLifecycleOutcome,
  CentralLiveLifecycleResumeInput,
} from "../central/CentralLiveLifecycleHandlerRegistry";
import type {LiveExecutionRequest} from "../models/LiveExecutionRequest";
import type {LiveExecutionResult} from "../models/LiveExecutionResult";

const EPSILON = 1e-12;
const DERIVATIVE_STRATEGIES = new Set<StrategyId>([
  "spot-perpetual-basis-arbitrage", "funding-rate-arbitrage", "perpetual-perpetual-arbitrage", "statistical-arbitrage",
]);

export interface DerivativeEntryLegAdmissionEvidence {
  readonly legId: string;
  readonly product: "SPOT" | "PERPETUAL";
  readonly positionMode: "ONE_WAY" | "HEDGE" | null;
  readonly positionSide: "LONG" | "SHORT" | null;
  readonly currentSignedPositionQuantity: number | null;
  readonly positionEvidenceId: string | null;
  readonly accountEvidenceId: string;
  readonly authenticatedReadFresh: boolean;
  readonly balanceOrMarginSufficient: boolean;
  readonly marketRulesFresh: boolean;
  readonly quoteAndDepthFresh: boolean;
  readonly feeScheduleFresh: boolean;
  readonly liquidationControlReady: boolean;
  readonly reduceOnlyExitVerified: boolean;
}

export interface DerivativeEntryAdmissionEvidence {
  readonly evidenceId: string;
  readonly planId: string;
  readonly generatedAt: number;
  readonly expiresAt: number;
  readonly legs: readonly DerivativeEntryLegAdmissionEvidence[];
}

export interface DerivativeLifecycleOrderEvidence {
  readonly evidenceId: string;
  readonly result: LiveExecutionResult;
  readonly feeAsset?: string;
  readonly feeAmount?: number;
  readonly fees?: readonly {readonly asset: string; readonly amount: number}[];
  readonly observedAt: number;
  readonly orderSubmissionPerformed: boolean;
}

export interface DerivativeExitLegEvidence {
  readonly entryLegId: string;
  readonly product: "SPOT" | "PERPETUAL";
  readonly exchange: string;
  readonly market: string;
  readonly side: "BUY" | "SELL";
  readonly quantity: number;
  readonly referencePrice: number;
  readonly positionMode: "ONE_WAY" | "HEDGE" | null;
  readonly positionSide: "LONG" | "SHORT" | null;
  readonly currentSignedPositionQuantity: number;
  readonly positionEvidenceId: string;
  readonly fullDepthVerified: boolean;
  readonly feeScheduleFresh: boolean;
  readonly fundingEvidenceIds: readonly string[];
  readonly reduceOnlyVerified: boolean;
}

export interface DerivativeExitEvaluationEvidence {
  readonly evidenceId: string;
  readonly planId: string;
  readonly positionGroupEvidenceId: string;
  readonly state: "HOLD" | "BLOCKED" | "READY_TO_CLOSE";
  readonly generatedAt: number;
  readonly expiresAt: number;
  readonly conditionMetric: number | null;
  readonly conditionThreshold: number | null;
  readonly blockers: readonly string[];
  readonly legs: readonly DerivativeExitLegEvidence[];
}

export interface DerivativeLiveRecoveryRequest {
  readonly planId: string;
  readonly strategyId: StrategyId;
  readonly dispatchId: string;
  readonly sourceEvidenceId: string;
  readonly entryLegId: string;
  readonly exchange: string;
  readonly product: "SPOT" | "PERPETUAL";
  readonly market: string;
  readonly side: "buy" | "sell";
  readonly quantity: number;
  readonly positionMode: "ONE_WAY" | "HEDGE" | null;
  readonly positionSide: "LONG" | "SHORT" | null;
  readonly reduceOnly: boolean;
  readonly referencePrice: number;
  readonly reason: "ENTRY_IMBALANCE" | "EXIT_RESIDUAL";
  readonly capturedAt: number;
}

export interface ParallelDerivativeLiveLifecyclePort {
  getEntryAdmissionEvidence(planId: string, now: number): DerivativeEntryAdmissionEvidence | null;
  executeOrReconcile(input: {
    readonly phase: "ENTRY" | "EXIT";
    readonly planId: string;
    readonly legId: string;
    readonly request: LiveExecutionRequest;
    readonly evidenceId: string;
    readonly idempotencyKey: string;
    readonly allowNewSubmission: boolean;
  }): Promise<DerivativeLifecycleOrderEvidence | null>;
  captureOpenPosition(input: {
    readonly planId: string;
    readonly dispatchId: string;
    readonly idempotencyKey: string;
    readonly admissionEvidenceId: string;
    readonly entryOrderEvidenceIds: readonly string[];
    readonly positions: readonly {
      readonly entryLegId: string; readonly exchange: string; readonly product: "SPOT" | "PERPETUAL";
      readonly market: string; readonly signedQuantity: number; readonly entryPrice: number;
      readonly positionMode: "ONE_WAY" | "HEDGE" | null; readonly positionSide: "LONG" | "SHORT" | null;
    }[];
    readonly capturedAt: number;
  }): Promise<string>;
  evaluateExit(input: {readonly planId: string; readonly positionGroupEvidenceId: string; readonly now: number}): DerivativeExitEvaluationEvidence;
  captureSettlement(input: {
    readonly planId: string;
    readonly dispatchId: string;
    readonly idempotencyKey: string;
    readonly positionGroupEvidenceId: string;
    readonly exitEvaluationEvidenceId: string;
    readonly entryOrderEvidenceIds: readonly string[];
    readonly exitOrderEvidenceIds: readonly string[];
    readonly completedAt: number;
  }): Promise<string>;
  stageRecovery(request: DerivativeLiveRecoveryRequest): Promise<string>;
  now(): number;
}

interface FilledPosition {
  readonly leg: CentralStrategyExecutionLeg;
  readonly admission: DerivativeEntryLegAdmissionEvidence;
  readonly order: DerivativeLifecycleOrderEvidence;
  readonly signedQuantity: number;
  readonly entryPrice: number;
}

/** Shared entry/monitor/reduce-only-exit owner for Strategies #4/#5/#6/#8. */
export class ParallelDerivativeLiveLifecycleHandler implements CentralLiveLifecycleHandler {
  readonly id: string;
  readonly pattern: CentralExecutionPattern;
  constructor(private readonly port: ParallelDerivativeLiveLifecyclePort,
    pattern: Extract<CentralExecutionPattern, "PARALLEL_TWO_LEG" | "PARALLEL_STATISTICAL_PAIR">) {
    this.pattern = pattern;
    this.id = pattern === "PARALLEL_TWO_LEG" ? "central-parallel-derivative-v74" : "central-statistical-derivative-v74";
  }

  async resume(input: CentralLiveLifecycleResumeInput) {
    const plan = input.queueRecord.plan;
    const legs = this.validatePlan(input);
    const dispatchStartedAt = input.queueRecord.dispatchStartedAt;
    if (dispatchStartedAt === null) throw new Error("Derivative lifecycle requires immutable dispatch-start evidence.");
    const admission = this.port.getEntryAdmissionEvidence(plan.id, dispatchStartedAt);
    this.validateAdmission(admission, plan.id, legs, dispatchStartedAt);
    const exactAdmission = admission as DerivativeEntryAdmissionEvidence;
    const positions: FilledPosition[] = [];
    let orderSubmissionPerformed = false;

    for (const leg of legs) {
      const legAdmission = exactAdmission.legs.find((item) => item.legId === leg.id) as DerivativeEntryLegAdmissionEvidence;
      const request = entryRequest(input.idempotencyKey, leg, legAdmission);
      const order = await this.port.executeOrReconcile({phase: "ENTRY", planId: plan.id, legId: leg.id, request,
        evidenceId: exactAdmission.evidenceId, idempotencyKey: `${input.idempotencyKey}:entry:${leg.id}`,
        allowNewSubmission: this.entrySubmissionAllowed(input, this.port.now())});
      if (!order) {
        if (positions.length === 0) return freeze({planId: plan.id, handlerId: this.id, state: "REJECTED" as const,
          terminalEvidenceIds: [], recoveryIntentIds: [], orderSubmissionPerformed, completedAt: this.port.now(),
          reasons: ["Derivative entry authority expired before any exchange order evidence existed."]});
        return this.entryRecovery(input, positions, orderSubmissionPerformed,
          "Derivative second entry leg had no reconcilable order after authority expiry.");
      }
      this.validateOrder(order, request, this.port.now());
      orderSubmissionPerformed ||= order.orderSubmissionPerformed;
      if (order.result.filledQuantity > EPSILON) positions.push({leg, admission: legAdmission, order,
        signedQuantity: normalize((leg.side === "BUY" ? 1 : -1) * order.result.filledQuantity),
        entryPrice: order.result.averageFillPrice});
      if (order.result.status !== "FILLED" || order.result.filledQuantity + EPSILON < request.quantity) {
        return positions.length > 0 ? this.entryRecovery(input, positions, orderSubmissionPerformed,
          `Derivative entry leg ${leg.id} was not fully filled.`)
          : freeze({planId: plan.id, handlerId: this.id, state: "REJECTED" as const,
            terminalEvidenceIds: [order.evidenceId], recoveryIntentIds: [], orderSubmissionPerformed,
            completedAt: this.port.now(), reasons: [`Derivative entry leg ${leg.id} produced no position.`]});
      }
    }

    const entryOrderEvidenceIds = positions.map((item) => item.order.evidenceId);
    const positionGroupEvidenceId = await this.port.captureOpenPosition({planId: plan.id, dispatchId: input.dispatchId,
      idempotencyKey: `${input.idempotencyKey}:open-position`, admissionEvidenceId: exactAdmission.evidenceId,
      entryOrderEvidenceIds, positions: positions.map((item) => ({entryLegId: item.leg.id, exchange: item.leg.exchange,
        product: item.leg.product, market: item.leg.market, signedQuantity: item.signedQuantity,
        entryPrice: item.entryPrice, positionMode: item.admission.positionMode, positionSide: item.admission.positionSide})),
      capturedAt: this.port.now()});
    if (!positionGroupEvidenceId.trim()) throw new Error("Durable derivative open-position evidence is required.");
    const exit = this.port.evaluateExit({planId: plan.id, positionGroupEvidenceId, now: this.port.now()});
    this.validateExit(exit, plan, positionGroupEvidenceId, positions, this.port.now());
    if (exit.state !== "READY_TO_CLOSE") {
      return freeze({planId: plan.id, handlerId: this.id, state: "MONITORING" as const,
        evidenceIds: [exactAdmission.evidenceId, ...entryOrderEvidenceIds, positionGroupEvidenceId, exit.evidenceId],
        orderSubmissionPerformed, observedAt: this.port.now(), reasons: exit.blockers.length > 0
          ? exit.blockers.map((item) => `Derivative position monitoring: ${item}`)
          : ["Derivative position is durably open and its settlement condition is not yet ready."]});
    }

    const exitOrderEvidenceIds: string[] = [];
    const closedLegIds = new Set<string>();
    for (const position of positions) {
      const close = exit.legs.find((item) => item.entryLegId === position.leg.id) as DerivativeExitLegEvidence;
      const request = exitRequest(input.idempotencyKey, position, close);
      const order = await this.port.executeOrReconcile({phase: "EXIT", planId: plan.id, legId: position.leg.id,
        request, evidenceId: exit.evidenceId, idempotencyKey: `${input.idempotencyKey}:exit:${position.leg.id}`,
        allowNewSubmission: true});
      if (!order) throw new Error("Risk-reducing derivative exit lacked reconcilable order evidence.");
      this.validateOrder(order, request, this.port.now());
      orderSubmissionPerformed ||= order.orderSubmissionPerformed;
      exitOrderEvidenceIds.push(order.evidenceId);
      const residual = Math.max(0, Math.abs(position.signedQuantity) - order.result.filledQuantity);
      if (order.result.status !== "FILLED" || residual > EPSILON) {
        const remaining = positions.map((item) => ({position: item,
          quantity: closedLegIds.has(item.leg.id) ? 0
            : item.leg.id === position.leg.id ? residual : Math.abs(item.signedQuantity)}))
          .filter((item) => item.quantity > EPSILON);
        const recoveryIntentIds = await this.stageRecovery(input, remaining, order.evidenceId, "EXIT_RESIDUAL");
        return freeze({planId: plan.id, handlerId: this.id, state: "RECOVERY_REQUIRED" as const,
          terminalEvidenceIds: [...entryOrderEvidenceIds, positionGroupEvidenceId, exit.evidenceId, ...exitOrderEvidenceIds],
          recoveryIntentIds, orderSubmissionPerformed, completedAt: this.port.now(),
          reasons: ["Derivative reduce-only exit was incomplete; every remaining material position entered shared recovery."]});
      }
      closedLegIds.add(position.leg.id);
    }
    const completedAt = this.port.now();
    const settlementEvidenceId = await this.port.captureSettlement({planId: plan.id, dispatchId: input.dispatchId,
      idempotencyKey: `${input.idempotencyKey}:settlement`, positionGroupEvidenceId,
      exitEvaluationEvidenceId: exit.evidenceId, entryOrderEvidenceIds, exitOrderEvidenceIds, completedAt});
    if (!settlementEvidenceId.trim()) throw new Error("Durable derivative settlement evidence is required.");
    return freeze({planId: plan.id, handlerId: this.id, state: "COMPLETED" as const,
      terminalEvidenceIds: [exactAdmission.evidenceId, ...entryOrderEvidenceIds, positionGroupEvidenceId,
        exit.evidenceId, ...exitOrderEvidenceIds, settlementEvidenceId], recoveryIntentIds: [],
      orderSubmissionPerformed, completedAt,
      reasons: ["Derivative pair entry, policy condition, settled funding evidence, and exact reduce-only exits reconciled."]});
  }

  private validatePlan(input: CentralLiveLifecycleResumeInput): CentralStrategyExecutionLeg[] {
    const {queueRecord} = input; const {plan} = queueRecord;
    if (queueRecord.state !== "DISPATCHING" || queueRecord.lifecycleHandlerId !== this.id || plan.pattern !== this.pattern ||
      !DERIVATIVE_STRATEGIES.has(plan.strategyId)) throw new Error("Derivative handler requires an exact dispatching Strategy #4/#5/#6/#8 plan.");
    if (this.pattern === "PARALLEL_STATISTICAL_PAIR" && plan.strategyId !== "statistical-arbitrage") {
      throw new Error("Statistical derivative handler accepts Strategy #8 only.");
    }
    if (this.pattern === "PARALLEL_TWO_LEG" && plan.strategyId === "statistical-arbitrage") {
      throw new Error("Parallel derivative handler does not accept the statistical pattern.");
    }
    if (queueRecord.dispatchStartedAt === null || queueRecord.dispatchStartedAt > queueRecord.actionAuthorityExpiresAt ||
      queueRecord.dispatchStartedAt > plan.expiresAt) {
      throw new Error("Derivative dispatch did not start under current plan and action authority.");
    }
    if (!["BASIS_CONVERGENCE", "FUNDING_CAPTURE_THEN_EXIT", "SPREAD_CONVERGENCE", "STATISTICAL_MEAN_REVERSION"]
      .includes(plan.settlementPolicy.kind)) throw new Error("Derivative settlement policy is not supported.");
    const legs = [...plan.legs].sort((a, b) => a.sequence - b.sequence);
    if (legs.length !== 2 || legs.some((leg, index) => leg.sequence !== index + 1 || leg.orderType !== "MARKET" ||
      leg.dependency !== "PARALLEL" || !positive(leg.quantity ?? 0)) || !legs.some((leg) => leg.product === "PERPETUAL")) {
      throw new Error("Derivative lifecycle requires two positive parallel MARKET legs and at least one perpetual leg.");
    }
    return legs;
  }

  private validateAdmission(value: DerivativeEntryAdmissionEvidence | null, planId: string,
    legs: readonly CentralStrategyExecutionLeg[], now: number): void {
    if (!value || !value.evidenceId.trim() || value.planId !== planId || value.generatedAt > now || value.expiresAt < now ||
      value.legs.length !== legs.length) throw new Error("Fresh exact derivative entry admission evidence is required.");
    for (const leg of legs) {
      const matches = value.legs.filter((item) => item.legId === leg.id);
      const item = matches[0];
      if (matches.length !== 1 || !item || item.product !== leg.product || !item.accountEvidenceId.trim() ||
        !item.authenticatedReadFresh || !item.balanceOrMarginSufficient || !item.marketRulesFresh ||
        !item.quoteAndDepthFresh || !item.feeScheduleFresh) throw new Error(`Derivative leg admission is incomplete: ${leg.id}`);
      if (leg.product === "PERPETUAL" && ((item.positionMode !== "ONE_WAY" && item.positionMode !== "HEDGE") ||
        item.positionSide !== (leg.side === "BUY" ? "LONG" : "SHORT") || item.currentSignedPositionQuantity !== 0 ||
        !item.positionEvidenceId?.trim() || !item.liquidationControlReady || !item.reduceOnlyExitVerified)) {
        throw new Error(`Derivative leg requires flat exact position, liquidation control, and reduce-only exit evidence: ${leg.id}`);
      }
      if (leg.product === "SPOT" && (item.positionMode !== null || item.positionSide !== null ||
        item.currentSignedPositionQuantity !== null || item.positionEvidenceId !== null)) {
        throw new Error(`SPOT leg cannot carry derivative position semantics: ${leg.id}`);
      }
    }
  }

  private validateOrder(value: DerivativeLifecycleOrderEvidence, request: LiveExecutionRequest, now: number): void {
    const result = value.result;
    const fees = derivativeFees(value);
    if (!value.evidenceId.trim() || value.observedAt > now || result.exchange.trim().toLowerCase() !== request.exchange.trim().toLowerCase() ||
      result.market.trim().toUpperCase() !== request.market.trim().toUpperCase() || result.side !== request.side ||
      !nonNegative(result.filledQuantity) || result.filledQuantity > request.quantity + EPSILON ||
      (result.filledQuantity > EPSILON && !positive(result.averageFillPrice)) ||
      fees.some((fee) => !nonNegative(fee.amount) || !asset(fee.asset))) {
      throw new Error("Derivative lifecycle order evidence is invalid or mismatched.");
    }
    if (request.product === "PERPETUAL" && (result.product !== "PERPETUAL" || result.reduceOnly !== request.reduceOnly ||
      result.positionMode !== request.positionMode || result.positionSide !== request.positionSide)) {
      throw new Error("Derivative order result lost product/reduce-only/position semantics.");
    }
  }

  private validateExit(value: DerivativeExitEvaluationEvidence, plan: CentralStrategyExecutionPlan, positionGroupId: string,
    positions: readonly FilledPosition[], now: number): void {
    if (!value.evidenceId.trim() || value.planId !== plan.id || value.positionGroupEvidenceId !== positionGroupId ||
      value.generatedAt > now || value.expiresAt < now || !["HOLD", "BLOCKED", "READY_TO_CLOSE"].includes(value.state)) {
      throw new Error("Fresh exact derivative exit evaluation evidence is required.");
    }
    if (value.state !== "READY_TO_CLOSE") return;
    if (value.blockers.length > 0 || value.legs.length !== positions.length) throw new Error("Ready derivative exit cannot retain blockers or missing legs.");
    for (const position of positions) {
      const matches = value.legs.filter((item) => item.entryLegId === position.leg.id);
      const close = matches[0];
      if (matches.length !== 1 || !close || close.product !== position.leg.product ||
        close.exchange.trim().toLowerCase() !== position.leg.exchange.trim().toLowerCase() ||
        close.market.trim().toUpperCase() !== position.leg.market.trim().toUpperCase() ||
        close.side !== (position.signedQuantity > 0 ? "SELL" : "BUY") ||
        Math.abs(close.quantity - Math.abs(position.signedQuantity)) > EPSILON || !positive(close.referencePrice) ||
        !close.positionEvidenceId.trim() || !close.fullDepthVerified || !close.feeScheduleFresh ||
        Math.abs(close.currentSignedPositionQuantity - position.signedQuantity) > EPSILON ||
        (close.product === "PERPETUAL" && (!close.reduceOnlyVerified || close.positionMode !== position.admission.positionMode ||
          close.positionSide !== position.admission.positionSide || close.fundingEvidenceIds.length === 0 ||
          close.fundingEvidenceIds.some((id) => !id.trim()) || new Set(close.fundingEvidenceIds).size !== close.fundingEvidenceIds.length))) {
        throw new Error(`Derivative exit leg evidence is invalid: ${position.leg.id}`);
      }
    }
    this.validateSettlementCondition(value, plan);
  }

  private validateSettlementCondition(value: DerivativeExitEvaluationEvidence, plan: CentralStrategyExecutionPlan): void {
    const policy = plan.settlementPolicy;
    if (policy.kind === "FUNDING_CAPTURE_THEN_EXIT") {
      if (value.generatedAt < policy.notBefore) throw new Error("Funding-capture exit cannot precede its policy timestamp.");
      return;
    }
    const metric = value.conditionMetric;
    const threshold = value.conditionThreshold;
    const expectedThreshold = policy.kind === "BASIS_CONVERGENCE" ? policy.closeAtOrBelowAbsoluteBasisPercent
      : policy.kind === "SPREAD_CONVERGENCE" ? policy.closeAtOrBelowAbsoluteDislocationPercent
        : policy.kind === "STATISTICAL_MEAN_REVERSION" ? policy.closeAtOrBelowAbsoluteZScore : null;
    if (expectedThreshold === null || !nonNegative(expectedThreshold) || metric === null || !Number.isFinite(metric) ||
      threshold === null || !nonNegative(threshold) || Math.abs(threshold - expectedThreshold) > EPSILON ||
      Math.abs(metric) > threshold + EPSILON) {
      throw new Error("Derivative exit READY evidence does not satisfy the exact settlement policy condition.");
    }
  }

  private async entryRecovery(input: CentralLiveLifecycleResumeInput, positions: readonly FilledPosition[],
    orderSubmissionPerformed: boolean, reason: string): Promise<CentralLiveLifecycleOutcome> {
    const source = positions.at(-1)?.order.evidenceId ?? "entry-evidence-unavailable";
    const recoveryIntentIds = await this.stageRecovery(input,
      positions.map((position) => ({position, quantity: Math.abs(position.signedQuantity)})), source, "ENTRY_IMBALANCE");
    return freeze({planId: input.queueRecord.plan.id, handlerId: this.id, state: "RECOVERY_REQUIRED" as const,
      terminalEvidenceIds: positions.map((item) => item.order.evidenceId), recoveryIntentIds,
      orderSubmissionPerformed, completedAt: this.port.now(), reasons: [reason, "Every material entry exposure entered shared recovery."]});
  }

  private async stageRecovery(input: CentralLiveLifecycleResumeInput,
    residuals: readonly {position: FilledPosition; quantity: number}[], sourceEvidenceId: string,
    reason: DerivativeLiveRecoveryRequest["reason"]): Promise<string[]> {
    const ids: string[] = [];
    for (const {position, quantity} of residuals) {
      if (quantity <= EPSILON) continue;
      ids.push(await this.port.stageRecovery({planId: input.queueRecord.plan.id, strategyId: input.queueRecord.plan.strategyId, dispatchId: input.dispatchId,
        sourceEvidenceId, entryLegId: position.leg.id, exchange: position.leg.exchange, product: position.leg.product,
        market: position.leg.market, side: position.signedQuantity > 0 ? "sell" : "buy", quantity,
        positionMode: position.admission.positionMode, positionSide: position.admission.positionSide,
        reduceOnly: position.leg.product === "PERPETUAL", referencePrice: position.entryPrice, reason,
        capturedAt: this.port.now()}));
    }
    if (ids.length === 0) throw new Error("Material derivative residual lacked shared recovery intent.");
    return ids;
  }

  private entrySubmissionAllowed(input: CentralLiveLifecycleResumeInput, now: number): boolean {
    return now <= input.queueRecord.plan.expiresAt && now <= input.queueRecord.actionAuthorityExpiresAt;
  }
}

function entryRequest(key: string, leg: CentralStrategyExecutionLeg,
  admission: DerivativeEntryLegAdmissionEvidence): LiveExecutionRequest {
  return {exchange: leg.exchange, product: leg.product, market: leg.market, side: leg.side === "BUY" ? "buy" : "sell",
    orderType: "market", quantity: leg.quantity as number, clientOrderId: clientOrderId(key, "entry", leg.id),
    cancelOnTimeout: false, ...(leg.product === "PERPETUAL" ? {reduceOnly: false,
      positionMode: admission.positionMode as "ONE_WAY" | "HEDGE", positionSide: admission.positionSide as "LONG" | "SHORT"} : {})};
}
function exitRequest(key: string, position: FilledPosition, close: DerivativeExitLegEvidence): LiveExecutionRequest {
  return {exchange: close.exchange, product: close.product, market: close.market, side: close.side === "BUY" ? "buy" : "sell",
    orderType: "market", quantity: close.quantity, clientOrderId: clientOrderId(key, "exit", position.leg.id),
    cancelOnTimeout: false, ...(close.product === "PERPETUAL" ? {reduceOnly: true,
      positionMode: close.positionMode as "ONE_WAY" | "HEDGE", positionSide: close.positionSide as "LONG" | "SHORT"} : {})};
}
function clientOrderId(key: string, phase: string, legId: string): string { return `${key.slice(0, 18)}-${phase}-${legId.replace(/[^A-Za-z0-9_-]/gu, "-").slice(-10)}`.slice(0, 36); }
function positive(value: number): boolean { return Number.isFinite(value) && value > 0; }
function nonNegative(value: number): boolean { return Number.isFinite(value) && value >= 0; }
function asset(value: string): string { const normalized = value.trim().toUpperCase(); if (!/^[A-Z0-9]{2,12}$/u.test(normalized)) throw new Error(`Invalid derivative fee asset: ${value}`); return normalized; }
function derivativeFees(value: DerivativeLifecycleOrderEvidence) {
  if (value.fees !== undefined) {
    const assets = value.fees.map((item) => asset(item.asset));
    if (new Set(assets).size !== assets.length) throw new Error("Derivative fee assets must be aggregated exactly once.");
    return value.fees;
  }
  if (value.feeAsset === undefined || value.feeAmount === undefined) throw new Error("Authoritative derivative fee evidence is required.");
  return [{asset: value.feeAsset, amount: value.feeAmount}] as const;
}
function normalize(value: number): number { return Math.abs(value) <= EPSILON ? 0 : Number(value.toFixed(12)); }
function freeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; for (const nested of Object.values(value)) freeze(nested); return Object.freeze(value); }
