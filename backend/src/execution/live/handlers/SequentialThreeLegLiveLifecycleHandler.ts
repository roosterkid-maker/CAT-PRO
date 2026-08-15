import type {LiveExecutionRequest} from "../models/LiveExecutionRequest";
import type {LiveExecutionResult} from "../models/LiveExecutionResult";
import type {
  CentralLiveLifecycleHandler,
  CentralLiveLifecycleOutcome,
  CentralLiveLifecycleResumeInput,
} from "../central/CentralLiveLifecycleHandlerRegistry";
import type {CentralStrategyExecutionLeg} from "../../../strategies/models/CentralStrategyExecutionPlan";

const EPSILON = 1e-12;

export interface SequentialLegSizingEvidence {
  readonly evidenceId: string;
  readonly planId: string;
  readonly legId: string;
  readonly fromAsset: string;
  readonly toAsset: string;
  readonly generatedAt: number;
  readonly expiresAt: number;
  readonly availableInputQuantity: number;
  readonly requestedBaseQuantity: number;
  readonly maximumExpectedInputQuantity: number;
  readonly allowedInputDustQuantity: number;
  readonly marketRulesVerified: boolean;
  readonly quoteFresh: boolean;
  readonly feeScheduleFresh: boolean;
  readonly thirdAssetFeeBalanceVerified: boolean;
}

export interface SequentialLegExecutionEvidence {
  readonly terminalEvidenceId: string;
  readonly sizingEvidenceId: string;
  readonly result: LiveExecutionResult;
  readonly feeAsset?: string;
  readonly feeAmount?: number;
  readonly feeStartAssetValue?: number | null;
  readonly feeValuationEvidenceId?: string | null;
  readonly fees?: readonly {readonly asset: string; readonly amount: number;
    readonly startAssetValue: number | null; readonly valuationEvidenceId: string | null}[];
  readonly observedAt: number;
  readonly orderSubmissionPerformed: boolean;
}

export interface SequentialThreeLegRecoveryRequest {
  readonly planId: string;
  readonly strategyId: "triangular-arbitrage";
  readonly dispatchId: string;
  readonly sourceLegId: string;
  readonly sourceTerminalEvidenceId: string;
  readonly asset: string;
  readonly quantity: number;
  readonly targetAsset: string;
  readonly exchange: string;
  readonly product: "SPOT";
  readonly market: string;
  readonly referencePrice: number;
  readonly sourceLegSide: "BUY" | "SELL";
  readonly reason: "PARTIAL_FILL_RESIDUAL" | "FAILED_LEG_EXPOSURE" | "INTERMEDIATE_DUST_ABOVE_LIMIT";
  readonly capturedAt: number;
}

export interface SequentialThreeLegLiveLifecyclePort {
  getSizingEvidence(input: {
    readonly planId: string;
    readonly leg: CentralStrategyExecutionLeg;
    readonly fromAsset: string;
    readonly toAsset: string;
    readonly availableInputQuantity: number;
    readonly now: number;
  }): SequentialLegSizingEvidence | null;
  executeOrReconcile(input: {
    readonly request: LiveExecutionRequest;
    readonly planId: string;
    readonly legId: string;
    readonly sizingEvidenceId: string;
    readonly idempotencyKey: string;
    readonly allowNewSubmission: boolean;
  }): Promise<SequentialLegExecutionEvidence>;
  stageRecovery(request: SequentialThreeLegRecoveryRequest): Promise<string>;
  captureSettlement(input: {readonly planId: string; readonly dispatchId: string; readonly idempotencyKey: string;
    readonly terminalEvidenceIds: readonly string[]; readonly startAsset: string; readonly initialQuantity: number;
    readonly finalQuantity: number; readonly realizedDelta: number; readonly completedAt: number}): Promise<string>;
  now(): number;
}

export class SequentialThreeLegLiveLifecycleHandler implements CentralLiveLifecycleHandler {
  readonly id = "central-sequential-three-leg-v71";
  readonly pattern = "SEQUENTIAL_THREE_LEG" as const;

  constructor(private readonly port: SequentialThreeLegLiveLifecyclePort) {}

  async resume(input: CentralLiveLifecycleResumeInput): Promise<CentralLiveLifecycleOutcome> {
    const plan = input.queueRecord.plan;
    const now = this.port.now();
    const policy = plan.settlementPolicy;
    if (input.queueRecord.state !== "DISPATCHING" || input.queueRecord.lifecycleHandlerId !== this.id ||
      plan.strategyId !== "triangular-arbitrage" || plan.pattern !== this.pattern || policy.kind !== "IMMEDIATE_CONVERSION_CYCLE") {
      throw new Error("Sequential three-leg handler requires an exact dispatching Strategy #3 conversion plan.");
    }
    if (input.queueRecord.dispatchStartedAt === null || input.queueRecord.dispatchStartedAt > plan.expiresAt ||
      input.queueRecord.dispatchStartedAt > input.queueRecord.actionAuthorityExpiresAt) {
      throw new Error("Sequential three-leg dispatch did not start under current plan and action authority.");
    }
    if (plan.legs.length !== 3 || policy.flows.length !== 3) throw new Error("Sequential three-leg handler requires exactly three canonical legs and flows.");

    const legs = [...plan.legs].sort((a, b) => a.sequence - b.sequence);
    if (legs.some((leg, index) => leg.product !== "SPOT" || leg.orderType !== "MARKET" || leg.sequence !== index + 1 ||
      (index === 0 ? leg.dependency !== "PARALLEL" : leg.dependency !== "AFTER_PREVIOUS"))) {
      throw new Error("Sequential three-leg canonical leg structure is invalid.");
    }

    let currentAsset = normalizeAsset(policy.startAsset);
    let currentQuantity = requirePositive(policy.initialQuantity, "initial conversion quantity");
    let retainedStartQuantity = 0;
    let thirdAssetFeeStartValue = 0;
    let orderSubmissionPerformed = false;
    const terminalEvidenceIds: string[] = [];

    for (let index = 0; index < legs.length; index += 1) {
      const leg = legs[index] as CentralStrategyExecutionLeg;
      const flow = policy.flows[index];
      if (!flow || flow.legId !== leg.id || normalizeAsset(flow.fromAsset) !== currentAsset) {
        throw new Error("Sequential three-leg flow lineage is discontinuous.");
      }
      const toAsset = normalizeAsset(flow.toAsset);
      const sizing = this.port.getSizingEvidence({planId: plan.id, leg, fromAsset: currentAsset, toAsset,
        availableInputQuantity: currentQuantity, now});
      this.validateSizing(sizing, plan.id, leg.id, currentAsset, toAsset, currentQuantity, now);
      const exactSizing = sizing as SequentialLegSizingEvidence;
      const request: LiveExecutionRequest = {
        exchange: leg.exchange,
        market: leg.market,
        side: leg.side === "BUY" ? "buy" : "sell",
        orderType: "market",
        quantity: exactSizing.requestedBaseQuantity,
        clientOrderId: clientOrderId(input.idempotencyKey, leg.id),
        cancelOnTimeout: false,
      };
      const execution = await this.port.executeOrReconcile({request, planId: plan.id, legId: leg.id,
        sizingEvidenceId: exactSizing.evidenceId, idempotencyKey: `${input.idempotencyKey}:${leg.id}`,
        allowNewSubmission: this.port.now() <= plan.expiresAt && this.port.now() <= input.queueRecord.actionAuthorityExpiresAt});
      this.validateExecution(execution, request, exactSizing, now, policy.startAsset);
      terminalEvidenceIds.push(execution.terminalEvidenceId);
      orderSubmissionPerformed = orderSubmissionPerformed || execution.orderSubmissionPerformed;

      const fill = this.computeFill(execution, leg, currentAsset, toAsset, currentQuantity, exactSizing);
      if (fill.thirdAssetFeeStartValue !== null) thirdAssetFeeStartValue += fill.thirdAssetFeeStartValue;
      const incomplete = execution.result.status !== "FILLED" || fill.filledBaseQuantity + EPSILON < request.quantity;
      if (incomplete) {
        const recoveryIntentIds = await this.stageResiduals(input, leg, execution, policy.startAsset, [
          {asset: currentAsset, quantity: fill.inputRemaining},
          {asset: toAsset, quantity: fill.outputQuantity},
        ], exactSizing.allowedInputDustQuantity, "PARTIAL_FILL_RESIDUAL");
        const noExposureCreated = index === 0 && fill.outputQuantity <= EPSILON && currentAsset === normalizeAsset(policy.startAsset);
        return freeze({planId: plan.id, handlerId: this.id,
          state: noExposureCreated ? "REJECTED" as const : "RECOVERY_REQUIRED" as const,
          terminalEvidenceIds, recoveryIntentIds, orderSubmissionPerformed, completedAt: this.port.now(),
          reasons: noExposureCreated ? ["First conversion leg produced no fill; start asset remained unchanged."]
            : ["Sequential conversion stopped after incomplete fill; every material intermediate residual was staged in shared recovery."]});
      }

      if (fill.inputRemaining > exactSizing.allowedInputDustQuantity + EPSILON) {
        if (currentAsset === normalizeAsset(policy.startAsset)) retainedStartQuantity += fill.inputRemaining;
        else {
          const recoveryIntentIds = await this.stageResiduals(input, leg, execution, policy.startAsset, [
            {asset: currentAsset, quantity: fill.inputRemaining}, {asset: toAsset, quantity: fill.outputQuantity},
          ], exactSizing.allowedInputDustQuantity, "INTERMEDIATE_DUST_ABOVE_LIMIT");
          return freeze({planId: plan.id, handlerId: this.id, state: "RECOVERY_REQUIRED" as const,
            terminalEvidenceIds, recoveryIntentIds, orderSubmissionPerformed, completedAt: this.port.now(),
            reasons: ["Material intermediate input remained after a filled leg; further sequential execution stopped."]});
        }
      }

      currentAsset = toAsset;
      currentQuantity = fill.outputQuantity;
      if (currentQuantity <= EPSILON) throw new Error("Filled sequential leg produced no positive output quantity.");
    }

    if (currentAsset !== normalizeAsset(policy.startAsset)) throw new Error("Sequential three-leg cycle did not return to its start asset.");
    const finalQuantity = normalize(currentQuantity + retainedStartQuantity - thirdAssetFeeStartValue);
    if (!Number.isFinite(finalQuantity) || finalQuantity < 0) throw new Error("Sequential three-leg final start-asset settlement is invalid.");
    const settlementEvidence = await this.port.captureSettlement({planId: plan.id, dispatchId: input.dispatchId,
      idempotencyKey: `${input.idempotencyKey}:settlement`, terminalEvidenceIds: [...terminalEvidenceIds],
      startAsset: currentAsset, initialQuantity: policy.initialQuantity, finalQuantity,
      realizedDelta: normalize(finalQuantity - policy.initialQuantity), completedAt: this.port.now()});
    if (!settlementEvidence.trim()) throw new Error("Durable triangular LIVE settlement evidence is required.");
    terminalEvidenceIds.push(settlementEvidence);
    return freeze({
      planId: plan.id,
      handlerId: this.id,
      state: "COMPLETED" as const,
      terminalEvidenceIds,
      recoveryIntentIds: [],
      orderSubmissionPerformed,
      completedAt: this.port.now(),
      reasons: [`Three exact sequential fills returned ${finalQuantity} ${currentAsset}; realized delta ${normalize(finalQuantity - policy.initialQuantity)} ${currentAsset}.`],
    });
  }

  private validateSizing(value: SequentialLegSizingEvidence | null, planId: string, legId: string, fromAsset: string,
    toAsset: string, available: number, now: number): void {
    if (!value || value.planId !== planId || value.legId !== legId || normalizeAsset(value.fromAsset) !== fromAsset ||
      normalizeAsset(value.toAsset) !== toAsset || !value.evidenceId.trim() || value.generatedAt > now || value.expiresAt < now ||
      Math.abs(value.availableInputQuantity - available) > Math.max(EPSILON, available * 1e-10) ||
      !Number.isFinite(value.requestedBaseQuantity) || value.requestedBaseQuantity <= 0 ||
      !Number.isFinite(value.maximumExpectedInputQuantity) || value.maximumExpectedInputQuantity <= 0 || value.maximumExpectedInputQuantity > available + EPSILON ||
      !Number.isFinite(value.allowedInputDustQuantity) || value.allowedInputDustQuantity < 0 || !value.marketRulesVerified || !value.quoteFresh || !value.feeScheduleFresh) {
      throw new Error(`Fresh exact sequential sizing/rule/quote/fee evidence is required: ${legId}`);
    }
  }

  private validateExecution(value: SequentialLegExecutionEvidence, request: LiveExecutionRequest, sizing: SequentialLegSizingEvidence,
    now: number, startAsset: string): void {
    const result = value.result;
    const fees = sequentialFees(value);
    if (!value.terminalEvidenceId.trim() || value.sizingEvidenceId !== sizing.evidenceId || value.observedAt > now ||
      result.exchange.trim().toLowerCase() !== request.exchange.trim().toLowerCase() || result.market.trim().toUpperCase() !== request.market.trim().toUpperCase() ||
      result.side !== request.side || !Number.isFinite(result.filledQuantity) || result.filledQuantity < 0 || result.filledQuantity > request.quantity + EPSILON ||
      !Number.isFinite(result.averageFillPrice) || (result.filledQuantity > 0 && result.averageFillPrice <= 0) ||
      fees.some((fee) => !Number.isFinite(fee.amount) || fee.amount < 0 || !normalizeAsset(fee.asset))) {
      throw new Error("Sequential leg terminal execution evidence is invalid or mismatched.");
    }
    for (const fee of fees) {
      if (normalizeAsset(fee.asset) !== normalizeAsset(startAsset) && fee.startAssetValue !== null && fee.startAssetValue < 0) {
        throw new Error("Sequential third-asset fee start-asset valuation is invalid.");
      }
    }
  }

  private computeFill(execution: SequentialLegExecutionEvidence, leg: CentralStrategyExecutionLeg, fromAsset: string, toAsset: string,
    available: number, sizing: SequentialLegSizingEvidence) {
    const filledBaseQuantity = execution.result.filledQuantity;
    const grossOutput = leg.side === "BUY" ? filledBaseQuantity : filledBaseQuantity * execution.result.averageFillPrice;
    let inputDebit = leg.side === "BUY" ? filledBaseQuantity * execution.result.averageFillPrice : filledBaseQuantity;
    let outputQuantity = grossOutput;
    let thirdAssetFeeStartValue = 0;
    for (const fee of sequentialFees(execution)) {
      const feeAsset = normalizeAsset(fee.asset);
      if (feeAsset === toAsset) outputQuantity -= fee.amount;
      else if (feeAsset === fromAsset) inputDebit += fee.amount;
      else if (fee.amount > EPSILON) {
        if (!sizing.thirdAssetFeeBalanceVerified || fee.startAssetValue === null || !fee.valuationEvidenceId?.trim()) {
          throw new Error("Third-asset commission requires verified balance and explicit start-asset valuation evidence.");
        }
        thirdAssetFeeStartValue += fee.startAssetValue;
      }
    }
    if (inputDebit > available + EPSILON || outputQuantity < -EPSILON) throw new Error("Sequential fill/fee evidence exceeds available input or output.");
    return {filledBaseQuantity, inputRemaining: normalize(Math.max(0, available - inputDebit)),
      outputQuantity: normalize(Math.max(0, outputQuantity)), thirdAssetFeeStartValue: normalize(thirdAssetFeeStartValue)};
  }

  private async stageResiduals(input: CentralLiveLifecycleResumeInput, leg: CentralStrategyExecutionLeg,
    execution: SequentialLegExecutionEvidence, startAsset: string, residuals: readonly {asset: string; quantity: number}[],
    allowedDust: number, reason: SequentialThreeLegRecoveryRequest["reason"]): Promise<string[]> {
    const ids: string[] = [];
    for (const residual of residuals) {
      if (residual.quantity <= Math.max(EPSILON, allowedDust) || normalizeAsset(residual.asset) === normalizeAsset(startAsset)) continue;
      ids.push(await this.port.stageRecovery({planId: input.queueRecord.plan.id, strategyId: "triangular-arbitrage", dispatchId: input.dispatchId,
        sourceLegId: leg.id, sourceTerminalEvidenceId: execution.terminalEvidenceId, asset: normalizeAsset(residual.asset),
        quantity: residual.quantity, targetAsset: normalizeAsset(startAsset), exchange: leg.exchange, product: "SPOT",
        market: leg.market, referencePrice: leg.referencePrice, sourceLegSide: leg.side,
        reason, capturedAt: this.port.now()}));
    }
    if (ids.length === 0 && residuals.some((item) => normalizeAsset(item.asset) !== normalizeAsset(startAsset) && item.quantity > Math.max(EPSILON, allowedDust))) {
      throw new Error("Material sequential residual exposure was not staged in shared recovery.");
    }
    return ids;
  }
}

function clientOrderId(idempotencyKey: string, legId: string): string {
  return `${idempotencyKey.slice(0, 20)}-${legId.replace(/[^A-Za-z0-9_-]/gu, "-").slice(-15)}`.slice(0, 36);
}
function normalizeAsset(value: string): string { const asset = value.trim().toUpperCase(); if (!/^[A-Z0-9]{2,12}$/u.test(asset)) throw new Error(`Invalid sequential flow asset: ${value}`); return asset; }
function sequentialFees(value: SequentialLegExecutionEvidence) {
  if (value.fees !== undefined) {
    const assets = value.fees.map((item) => normalizeAsset(item.asset));
    if (new Set(assets).size !== assets.length) throw new Error("Sequential fee assets must be aggregated exactly once.");
    return value.fees;
  }
  if (value.feeAsset === undefined || value.feeAmount === undefined) throw new Error("Authoritative sequential fee evidence is required.");
  return [{asset: value.feeAsset, amount: value.feeAmount, startAssetValue: value.feeStartAssetValue ?? null,
    valuationEvidenceId: value.feeValuationEvidenceId ?? null}] as const;
}
function requirePositive(value: number, label: string): number { if (!Number.isFinite(value) || value <= 0) throw new Error(`Sequential ${label} must be positive.`); return value; }
function normalize(value: number): number { return Math.abs(value) <= EPSILON ? 0 : Number(value.toFixed(12)); }
function freeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; for (const nested of Object.values(value)) freeze(nested); return Object.freeze(value); }
