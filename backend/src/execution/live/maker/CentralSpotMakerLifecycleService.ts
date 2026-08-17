import type {LiveExecutionAdapterCapabilities} from "../contracts/LiveExecutionAdapter";
import type {LiveExecutionRequest} from "../models/LiveExecutionRequest";
import type {LiveExecutionResult} from "../models/LiveExecutionResult";
import type {
  CentralStrategyExecutionLeg,
  CentralStrategyExecutionPlan,
} from "../../../strategies/models/CentralStrategyExecutionPlan";

const REQUIRED_CONFIRMATION = "CONFIRM_CENTRAL_SPOT_MAKER_LIVE_ACTION";
const EPSILON = 1e-12;

export interface CentralSpotMakerActionAuthority {
  readonly compileTimeGateEnabled: boolean;
  readonly confirmation: string;
  readonly operatorActionId: string;
  readonly planId: string;
  readonly confirmedAt: number;
  readonly expiresAt: number;
}

export interface CentralSpotMakerLifecyclePolicy {
  readonly maximumReprices: number;
  readonly maximumStatusReadsPerOrder: number;
  readonly orderTimeoutMs: number;
  readonly pollingIntervalMs: number;
}

export interface CentralSpotMakerReplacementEvidence {
  readonly evidenceId: string;
  readonly price: number;
  readonly observedAt: number;
  readonly expiresAt: number;
}

export interface CentralSpotMakerRecoveryRequest {
  readonly planId: string;
  readonly strategyId: string;
  readonly sourceOrderId: string;
  readonly exchange: string;
  readonly market: string;
  readonly side: "buy" | "sell";
  readonly quantity: number;
  readonly referencePrice: number;
  readonly reason: "HEDGE_PARTIAL_FILL" | "HEDGE_SUBMISSION_FAILED";
  readonly capturedAt: number;
}

export interface CentralSpotMakerLifecyclePort {
  getCapabilities(exchange: string): LiveExecutionAdapterCapabilities | null;
  submit(request: LiveExecutionRequest): Promise<LiveExecutionResult>;
  read(exchange: string, orderId: string, market: string): Promise<LiveExecutionResult>;
  cancel(exchange: string, orderId: string, market: string): Promise<LiveExecutionResult>;
  getReplacementEvidence(input: {
    readonly planId: string;
    readonly makerLegId: string;
    readonly replacementNumber: number;
    readonly now: number;
  }): CentralSpotMakerReplacementEvidence | null;
  stageRecovery(request: CentralSpotMakerRecoveryRequest): Promise<string>;
  now(): number;
}

export type CentralSpotMakerLifecycleState =
  | "COMPLETED_HEDGED"
  | "PARTIAL_HEDGED"
  | "MAKER_UNFILLED"
  | "RECOVERY_REQUIRED";

export interface CentralSpotMakerLifecycleEvent {
  readonly sequence: number;
  readonly type:
    | "MAKER_SUBMITTED"
    | "MAKER_FILL_OBSERVED"
    | "HEDGE_SUBMITTED"
    | "MAKER_CANCELLED"
    | "MAKER_REPLACED"
    | "RECOVERY_STAGED"
    | "LIFECYCLE_COMPLETED";
  readonly capturedAt: number;
  readonly orderId: string | null;
  readonly quantity: number;
  readonly evidenceId: string | null;
}

export interface CentralSpotMakerLifecycleResult {
  readonly version: "68.0";
  readonly planId: string;
  readonly strategyId: string;
  readonly state: CentralSpotMakerLifecycleState;
  readonly makerRequestedQuantity: number;
  readonly makerFilledQuantity: number;
  readonly hedgeFilledQuantity: number;
  readonly replacements: number;
  readonly recoveryIntentIds: readonly string[];
  readonly events: readonly CentralSpotMakerLifecycleEvent[];
  readonly actionAuthorityValidated: true;
  readonly orderSubmissionPerformed: true;
}

/**
 * Bounded maker/cancel-replace/fill-driven-hedge lifecycle for the canonical
 * PASSIVE_MAKER_THEN_HEDGE plan. It has no production singleton or implicit
 * authority: callers must inject an execution port and fresh action authority.
 */
export class CentralSpotMakerLifecycleService {
  constructor(private readonly port: CentralSpotMakerLifecyclePort) {}

  async run(
    plan: CentralStrategyExecutionPlan,
    authority: CentralSpotMakerActionAuthority,
    policy: CentralSpotMakerLifecyclePolicy,
  ): Promise<CentralSpotMakerLifecycleResult> {
    const startedAt = this.port.now();
    const {maker, hedge} = this.validate(plan, authority, policy, startedAt);
    const events: CentralSpotMakerLifecycleEvent[] = [];
    const recoveryIntentIds: string[] = [];
    let totalMakerFilled = 0;
    let totalHedgeFilled = 0;
    let replacements = 0;
    let makerPrice = maker.referencePrice;

    while (totalMakerFilled < (maker.quantity as number) - EPSILON) {
      const remaining = (maker.quantity as number) - totalMakerFilled;
      const makerRequest = this.toMakerRequest(plan, maker, remaining, makerPrice, replacements);
      let current = await this.port.submit(makerRequest);
      this.requireIdentity(current, maker.exchange, maker.market);
      let observedOnOrder = 0;
      this.event(events, "MAKER_SUBMITTED", current.orderId, remaining, null);

      const initialHedge = await this.hedgeNewFill({
        plan, hedge, makerResult: current, alreadyObserved: observedOnOrder,
        totalMakerFilled, totalHedgeFilled, events, recoveryIntentIds,
      });
      observedOnOrder = initialHedge.observedOnOrder;
      totalMakerFilled = initialHedge.totalMakerFilled;
      totalHedgeFilled = initialHedge.totalHedgeFilled;
      if (initialHedge.recoveryRequired) {
        return this.result(plan, "RECOVERY_REQUIRED", totalMakerFilled, totalHedgeFilled, replacements, recoveryIntentIds, events);
      }

      if (current.status === "FILLED" && totalMakerFilled >= (maker.quantity as number) - EPSILON) {
        break;
      }
      if (current.status === "FAILED") {
        const state = totalMakerFilled > EPSILON ? "PARTIAL_HEDGED" : "MAKER_UNFILLED";
        this.event(events, "LIFECYCLE_COMPLETED", current.orderId, totalMakerFilled, null);
        return this.result(plan, state, totalMakerFilled, totalHedgeFilled, replacements, recoveryIntentIds, events);
      }

      if (!this.isTerminal(current.status)) {
        const orderId = this.requireOrderId(current);
        for (let read = 0; read < policy.maximumStatusReadsPerOrder && !this.isTerminal(current.status); read += 1) {
          current = await this.port.read(maker.exchange, orderId, maker.market);
          this.requireIdentity(current, maker.exchange, maker.market);
          const hedgeResult = await this.hedgeNewFill({
            plan, hedge, makerResult: current, alreadyObserved: observedOnOrder,
            totalMakerFilled, totalHedgeFilled, events, recoveryIntentIds,
          });
          observedOnOrder = hedgeResult.observedOnOrder;
          totalMakerFilled = hedgeResult.totalMakerFilled;
          totalHedgeFilled = hedgeResult.totalHedgeFilled;
          if (hedgeResult.recoveryRequired) {
            return this.result(plan, "RECOVERY_REQUIRED", totalMakerFilled, totalHedgeFilled, replacements, recoveryIntentIds, events);
          }
        }

        if (!this.isTerminal(current.status)) {
          current = await this.port.cancel(maker.exchange, orderId, maker.market);
          this.requireIdentity(current, maker.exchange, maker.market);
          this.event(events, "MAKER_CANCELLED", orderId, current.filledQuantity, null);
          const cancelHedge = await this.hedgeNewFill({
            plan, hedge, makerResult: current, alreadyObserved: observedOnOrder,
            totalMakerFilled, totalHedgeFilled, events, recoveryIntentIds,
          });
          observedOnOrder = cancelHedge.observedOnOrder;
          totalMakerFilled = cancelHedge.totalMakerFilled;
          totalHedgeFilled = cancelHedge.totalHedgeFilled;
          if (cancelHedge.recoveryRequired) {
            return this.result(plan, "RECOVERY_REQUIRED", totalMakerFilled, totalHedgeFilled, replacements, recoveryIntentIds, events);
          }
          if (!this.isTerminal(current.status)) {
            throw new Error("Maker cancellation was not confirmed by a terminal order state.");
          }
        }
      }

      if (totalMakerFilled >= (maker.quantity as number) - EPSILON) break;
      if (replacements >= policy.maximumReprices) {
        const state = totalMakerFilled > EPSILON ? "PARTIAL_HEDGED" : "MAKER_UNFILLED";
        this.event(events, "LIFECYCLE_COMPLETED", current.orderId, totalMakerFilled, null);
        return this.result(plan, state, totalMakerFilled, totalHedgeFilled, replacements, recoveryIntentIds, events);
      }

      const replacementNumber = replacements + 1;
      const evidence = this.port.getReplacementEvidence({
        planId: plan.id,
        makerLegId: maker.id,
        replacementNumber,
        now: this.port.now(),
      });
      this.requireReplacementEvidence(evidence, this.port.now());
      makerPrice = (evidence as CentralSpotMakerReplacementEvidence).price;
      replacements = replacementNumber;
      this.event(events, "MAKER_REPLACED", null, (maker.quantity as number) - totalMakerFilled, (evidence as CentralSpotMakerReplacementEvidence).evidenceId);
    }

    this.event(events, "LIFECYCLE_COMPLETED", null, totalMakerFilled, null);
    return this.result(plan, "COMPLETED_HEDGED", totalMakerFilled, totalHedgeFilled, replacements, recoveryIntentIds, events);
  }

  private async hedgeNewFill(input: {
    readonly plan: CentralStrategyExecutionPlan;
    readonly hedge: CentralStrategyExecutionLeg;
    readonly makerResult: LiveExecutionResult;
    readonly alreadyObserved: number;
    readonly totalMakerFilled: number;
    readonly totalHedgeFilled: number;
    readonly events: CentralSpotMakerLifecycleEvent[];
    readonly recoveryIntentIds: string[];
  }): Promise<{readonly observedOnOrder: number; readonly totalMakerFilled: number; readonly totalHedgeFilled: number; readonly recoveryRequired: boolean}> {
    if (input.makerResult.filledQuantity + EPSILON < input.alreadyObserved) {
      throw new Error("Maker cumulative fill regressed; lifecycle failed closed.");
    }
    const delta = Math.max(0, input.makerResult.filledQuantity - input.alreadyObserved);
    if (delta <= EPSILON) {
      return {observedOnOrder: input.alreadyObserved, totalMakerFilled: input.totalMakerFilled, totalHedgeFilled: input.totalHedgeFilled, recoveryRequired: false};
    }

    const nextMakerTotal = input.totalMakerFilled + delta;
    const requestedMaker = input.plan.legs.find((item) => item.orderType === "LIMIT_POST_ONLY")?.quantity ?? 0;
    if (nextMakerTotal > requestedMaker + EPSILON) throw new Error("Maker cumulative fill exceeded the canonical requested quantity.");
    this.event(input.events, "MAKER_FILL_OBSERVED", input.makerResult.orderId, delta, null);

    const hedgeRequest: LiveExecutionRequest = {
      exchange: input.hedge.exchange,
      market: input.hedge.market,
      side: input.hedge.side === "BUY" ? "buy" : "sell",
      orderType: "market",
      quantity: delta,
      clientOrderId: this.clientOrderId(input.plan.id, input.hedge.id, input.events.length + 1),
      cancelOnTimeout: false,
    };
    const hedgeResult = await this.port.submit(hedgeRequest);
    this.requireIdentity(hedgeResult, input.hedge.exchange, input.hedge.market);
    this.event(input.events, "HEDGE_SUBMITTED", hedgeResult.orderId, delta, null);
    const hedgeFilled = Math.min(delta, Math.max(0, hedgeResult.filledQuantity));
    const nextHedgeTotal = input.totalHedgeFilled + hedgeFilled;
    const residual = Math.max(0, delta - hedgeFilled);

    if (hedgeResult.status !== "FILLED" || residual > EPSILON) {
      const recoveryId = await this.port.stageRecovery({
        planId: input.plan.id,
        strategyId: input.plan.strategyId,
        sourceOrderId: input.makerResult.orderId ?? "MAKER_ORDER_ID_UNAVAILABLE",
        exchange: input.hedge.exchange,
        market: input.hedge.market,
        side: input.hedge.side === "BUY" ? "buy" : "sell",
        quantity: residual > EPSILON ? residual : delta,
        referencePrice: input.hedge.referencePrice,
        reason: hedgeFilled > EPSILON ? "HEDGE_PARTIAL_FILL" : "HEDGE_SUBMISSION_FAILED",
        capturedAt: this.port.now(),
      });
      input.recoveryIntentIds.push(recoveryId);
      this.event(input.events, "RECOVERY_STAGED", input.makerResult.orderId, residual > EPSILON ? residual : delta, recoveryId);
      return {observedOnOrder: input.makerResult.filledQuantity, totalMakerFilled: nextMakerTotal, totalHedgeFilled: nextHedgeTotal, recoveryRequired: true};
    }

    return {observedOnOrder: input.makerResult.filledQuantity, totalMakerFilled: nextMakerTotal, totalHedgeFilled: nextHedgeTotal, recoveryRequired: false};
  }

  private validate(plan: CentralStrategyExecutionPlan, authority: CentralSpotMakerActionAuthority, policy: CentralSpotMakerLifecyclePolicy, now: number) {
    if (plan.pattern !== "PASSIVE_MAKER_THEN_HEDGE" || plan.strategyId !== "cross-exchange-market-making") {
      throw new Error("Central spot maker lifecycle accepts Strategy #2 PASSIVE_MAKER_THEN_HEDGE plans only.");
    }
    if (!authority.compileTimeGateEnabled || authority.confirmation !== REQUIRED_CONFIRMATION) throw new Error("Central spot maker LIVE compile-time/action confirmation gate is disabled.");
    if (!authority.operatorActionId.trim() || authority.planId !== plan.id) throw new Error("Fresh operator action authority does not match the canonical plan.");
    if (!Number.isSafeInteger(now) || authority.confirmedAt > now || authority.expiresAt < now || now - authority.confirmedAt > 30_000) throw new Error("Central spot maker action authority is absent, stale, or expired.");
    if (plan.expiresAt < now) throw new Error("Canonical maker plan expired before lifecycle admission.");
    if (!Number.isSafeInteger(policy.maximumReprices) || policy.maximumReprices < 0 || policy.maximumReprices > 5) throw new Error("Maker replacement policy must allow 0-5 bounded reprices.");
    if (!Number.isSafeInteger(policy.maximumStatusReadsPerOrder) || policy.maximumStatusReadsPerOrder < 1 || policy.maximumStatusReadsPerOrder > 50) throw new Error("Maker status-read policy must be bounded to 1-50 reads.");
    if (!Number.isFinite(policy.orderTimeoutMs) || policy.orderTimeoutMs <= 0 || !Number.isFinite(policy.pollingIntervalMs) || policy.pollingIntervalMs <= 0 || policy.pollingIntervalMs > policy.orderTimeoutMs) throw new Error("Maker polling policy is invalid.");
    const makerLegs = plan.legs.filter((item) => item.orderType === "LIMIT_POST_ONLY" && item.dependency !== "PASSIVE_FILL_TRIGGER");
    const hedgeLegs = plan.legs.filter((item) => item.dependency === "PASSIVE_FILL_TRIGGER" && item.orderType === "MARKET");
    if (makerLegs.length !== 1 || hedgeLegs.length !== 1) throw new Error("Maker lifecycle requires exactly one post-only maker and one fill-triggered market hedge.");
    const maker = makerLegs[0] as CentralStrategyExecutionLeg;
    const hedge = hedgeLegs[0] as CentralStrategyExecutionLeg;
    if (maker.product !== "SPOT" || hedge.product !== "SPOT" || !Number.isFinite(maker.quantity) || (maker.quantity as number) <= 0 || !Number.isFinite(maker.referencePrice) || maker.referencePrice <= 0) throw new Error("Maker and hedge legs require positive SPOT quantity/price evidence.");
    const makerCapabilities = this.port.getCapabilities(maker.exchange);
    const hedgeCapabilities = this.port.getCapabilities(hedge.exchange);
    if (!makerCapabilities?.products.includes("SPOT") || !makerCapabilities.supportsLimitOrders || !makerCapabilities.supportsPostOnly || !makerCapabilities.supportsOrderStatus || !makerCapabilities.supportsCancellation) throw new Error("Maker exchange lacks the audited post-only/status/cancel capability contract.");
    if (!hedgeCapabilities?.products.includes("SPOT") || !hedgeCapabilities.supportsMarketOrders) throw new Error("Hedge exchange lacks the audited SPOT market-order capability contract.");
    return {maker, hedge};
  }

  private toMakerRequest(plan: CentralStrategyExecutionPlan, maker: CentralStrategyExecutionLeg, quantity: number, price: number, replacement: number): LiveExecutionRequest {
    return {
      exchange: maker.exchange,
      market: maker.market,
      side: maker.side === "BUY" ? "buy" : "sell",
      orderType: "limit",
      postOnly: true,
      quantity,
      price,
      clientOrderId: this.clientOrderId(plan.id, maker.id, replacement),
      cancelOnTimeout: false,
    };
  }

  private requireReplacementEvidence(evidence: CentralSpotMakerReplacementEvidence | null, now: number): void {
    if (!evidence || !evidence.evidenceId.trim() || !Number.isFinite(evidence.price) || evidence.price <= 0 || evidence.observedAt > now || evidence.expiresAt < now) throw new Error("Fresh positive maker replacement price evidence is required.");
  }

  private requireIdentity(result: LiveExecutionResult, exchange: string, market: string): void {
    if (result.exchange.trim().toLowerCase() !== exchange.trim().toLowerCase() || result.market.trim().toUpperCase() !== market.trim().toUpperCase()) throw new Error("Order evidence identity does not match the canonical lifecycle leg.");
    if (!Number.isFinite(result.filledQuantity) || result.filledQuantity < 0) throw new Error("Order fill evidence must be a non-negative finite quantity.");
  }

  private requireOrderId(result: LiveExecutionResult): string {
    if (!result.orderId?.trim()) throw new Error("Open maker order requires an exchange order ID.");
    return result.orderId;
  }

  private isTerminal(status: LiveExecutionResult["status"]): boolean {
    return status === "FILLED" || status === "CANCELLED" || status === "REJECTED" || status === "FAILED";
  }

  private clientOrderId(planId: string, legId: string, sequence: number): string {
    const value = `${planId}:${legId}:${sequence}`.replace(/[^A-Za-z0-9_-]/gu, "-");
    return value.slice(-36);
  }

  private event(events: CentralSpotMakerLifecycleEvent[], type: CentralSpotMakerLifecycleEvent["type"], orderId: string | null, quantity: number, evidenceId: string | null): void {
    events.push(Object.freeze({sequence: events.length + 1, type, capturedAt: this.port.now(), orderId, quantity, evidenceId}));
  }

  private result(plan: CentralStrategyExecutionPlan, state: CentralSpotMakerLifecycleState, makerFilled: number, hedgeFilled: number, replacements: number, recoveryIntentIds: readonly string[], events: readonly CentralSpotMakerLifecycleEvent[]): CentralSpotMakerLifecycleResult {
    return Object.freeze({
      version: "68.0" as const,
      planId: plan.id,
      strategyId: plan.strategyId,
      state,
      makerRequestedQuantity: plan.legs[0]?.quantity ?? 0,
      makerFilledQuantity: makerFilled,
      hedgeFilledQuantity: hedgeFilled,
      replacements,
      recoveryIntentIds: Object.freeze([...recoveryIntentIds]),
      events: Object.freeze([...events]),
      actionAuthorityValidated: true as const,
      orderSubmissionPerformed: true as const,
    });
  }
}

export const CENTRAL_SPOT_MAKER_REQUIRED_CONFIRMATION = REQUIRED_CONFIRMATION;
