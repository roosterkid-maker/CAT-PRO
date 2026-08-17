import type {StrategyId} from "../../../strategies/models/StrategyMetadata";
import {centralLiveSharedRecoveryBridgeService, type CentralLiveSharedRecoveryBridgeService} from "../../../recovery/adapters/CentralLiveSharedRecoveryBridgeService";
import {centralLiveLifecycleEvidenceStore, type CentralLiveLifecycleEvidenceRecord,
  type CentralLiveEvidenceKind, type CentralLiveLifecycleEvidenceStore} from "../central/CentralLiveLifecycleEvidenceStore";
import {centralLiveOrderExecutionGateway, type CentralLiveOrderExecutionGateway,
  type CentralLiveOrderGatewayResponse} from "../central/CentralLiveOrderExecutionGateway";
import {CentralLiveLifecycleHandlerRegistry} from "../central/CentralLiveLifecycleHandlerRegistry";
import {ParallelDerivativeLiveLifecycleHandler, type DerivativeEntryAdmissionEvidence,
  type DerivativeExitEvaluationEvidence, type DerivativeLifecycleOrderEvidence, type DerivativeLiveRecoveryRequest,
  type ParallelDerivativeLiveLifecyclePort} from "../handlers/ParallelDerivativeLiveLifecycleHandler";
import {PassiveMakerThenHedgeLiveLifecycleHandler, type PassiveMakerHedgeAdmissionEvidence,
  type PassiveMakerHedgeOrderEvidence, type PassiveMakerHedgeRecoveryRequest,
  type PassiveMakerThenHedgeLiveLifecyclePort} from "../handlers/PassiveMakerThenHedgeLiveLifecycleHandler";
import {SequentialThreeLegLiveLifecycleHandler, type SequentialLegExecutionEvidence, type SequentialLegSizingEvidence,
  type SequentialThreeLegLiveLifecyclePort, type SequentialThreeLegRecoveryRequest} from "../handlers/SequentialThreeLegLiveLifecycleHandler";
import {TwoSidedPassiveMakerLiveLifecycleHandler, type TwoSidedCycleSettlementInput,
  type TwoSidedInventoryRecoveryRequest, type TwoSidedOrderExecutionEvidence,
  type TwoSidedPassiveMakerLiveLifecyclePort, type TwoSidedQuoteCycleEvidence} from "../handlers/TwoSidedPassiveMakerLiveLifecycleHandler";

type Gateway = Pick<CentralLiveOrderExecutionGateway, "executeOrReconcile" | "readKnownOrder" | "cancelKnownOrder">;

abstract class ProductionPortBase {
  constructor(protected readonly evidence: CentralLiveLifecycleEvidenceStore = centralLiveLifecycleEvidenceStore,
    protected readonly orders: Gateway = centralLiveOrderExecutionGateway,
    protected readonly recovery: CentralLiveSharedRecoveryBridgeService = centralLiveSharedRecoveryBridgeService) {}
  now(): number { return Date.now(); }

  protected exactPayload<T>(kind: CentralLiveEvidenceKind,
    planId: string, predicate: (payload: T, record: CentralLiveLifecycleEvidenceRecord) => boolean, now: number): T | null {
    const matches = this.evidence.listPlan(planId).filter((item) => item.kind === kind && item.capturedAt <= now &&
      (item.expiresAt === null || item.expiresAt >= now) && predicate(item.payload as T, item));
    return matches.sort((a, b) => b.capturedAt - a.capturedAt || b.id.localeCompare(a.id))[0]?.payload as T | undefined ?? null;
  }
  protected seal(kind: CentralLiveEvidenceKind, planId: string,
    dispatchId: string, key: string, payload: unknown, capturedAt: number): string {
    const existing = this.evidence.get(kind, planId, dispatchId, key);
    if (existing) return existing.id;
    return this.evidence.seal({kind, planId, dispatchId, evidenceKey: key, payload, capturedAt}).id;
  }
  protected stage(input: {planId: string; dispatchId: string; strategyId: StrategyId; sourceEvidenceId: string;
    exchange: string; product: "SPOT" | "PERPETUAL"; market: string; asset: string; quoteAsset: string;
    residualDirection: "LONG" | "SHORT"; side: "BUY" | "SELL"; quantity: number; referencePrice: number;
    capturedAt: number; reason: string}): string {
    return this.recovery.stage({...input, expiresAt: Math.max(this.now() + 1, input.capturedAt + 300_000)}, this.now());
  }
}

export class SequentialThreeLegProductionPort extends ProductionPortBase implements SequentialThreeLegLiveLifecyclePort {
  getSizingEvidence(input: Parameters<SequentialThreeLegLiveLifecyclePort["getSizingEvidence"]>[0]): SequentialLegSizingEvidence | null {
    return this.evidence.getCurrent<SequentialLegSizingEvidence>("SEQUENTIAL_SIZING", input.planId, null,
      `sizing:${input.leg.id}:${input.fromAsset}:${input.toAsset}:${numberKey(input.availableInputQuantity)}`, input.now)?.payload ?? null;
  }
  async executeOrReconcile(input: Parameters<SequentialThreeLegLiveLifecyclePort["executeOrReconcile"]>[0]): Promise<SequentialLegExecutionEvidence> {
    return sequentialOrder(await this.orders.executeOrReconcile({request: input.request, idempotencyKey: input.idempotencyKey,
      allowNewSubmission: input.allowNewSubmission, now: this.now()}), input.sizingEvidenceId);
  }
  async stageRecovery(request: SequentialThreeLegRecoveryRequest): Promise<string> {
    const assets = parseMarket(request.market); const side = request.asset === assets.base ? "SELL" : "BUY";
    return this.stage({planId: request.planId, dispatchId: request.dispatchId, strategyId: request.strategyId,
      sourceEvidenceId: request.sourceTerminalEvidenceId, exchange: request.exchange, product: request.product,
      market: request.market, asset: request.asset, quoteAsset: assets.quote,
      residualDirection: side === "SELL" ? "LONG" : "SHORT", side, quantity: request.quantity,
      referencePrice: request.referencePrice, capturedAt: request.capturedAt, reason: request.reason});
  }
  async captureSettlement(input: Parameters<SequentialThreeLegLiveLifecyclePort["captureSettlement"]>[0]): Promise<string> {
    const {completedAt, ...payload} = input; return this.seal("SETTLEMENT", input.planId, input.dispatchId,
      input.idempotencyKey, payload, completedAt);
  }
}

export class TwoSidedMakerProductionPort extends ProductionPortBase implements TwoSidedPassiveMakerLiveLifecyclePort {
  getQuoteCycleEvidence(input: Parameters<TwoSidedPassiveMakerLiveLifecyclePort["getQuoteCycleEvidence"]>[0]): TwoSidedQuoteCycleEvidence | null {
    return this.evidence.getCurrent<TwoSidedQuoteCycleEvidence>("TWO_SIDED_QUOTE", input.planId, null,
      `quote:${input.cycle}:${numberKey(input.cumulativeBaseDelta)}:${numberKey(input.cumulativeQuoteDelta)}`, input.now)?.payload ?? null;
  }
  async submitOrReconcile(input: Parameters<TwoSidedPassiveMakerLiveLifecyclePort["submitOrReconcile"]>[0]): Promise<TwoSidedOrderExecutionEvidence | null> {
    const response = await this.orders.executeOrReconcile({request: input.request, idempotencyKey: input.idempotencyKey,
      allowNewSubmission: input.allowNewSubmission, now: this.now()});
    return response.state === "BLOCKED" ? null : twoSidedOrder(response, input.quoteEvidenceId);
  }
  async readOrReconcile(input: Parameters<TwoSidedPassiveMakerLiveLifecyclePort["readOrReconcile"]>[0]): Promise<TwoSidedOrderExecutionEvidence> {
    return twoSidedOrder(await this.orders.readKnownOrder(input.exchange, input.orderId, this.now()), input.quoteEvidenceId);
  }
  async cancelOrReconcile(input: Parameters<TwoSidedPassiveMakerLiveLifecyclePort["cancelOrReconcile"]>[0]): Promise<TwoSidedOrderExecutionEvidence> {
    return twoSidedOrder(await this.orders.cancelKnownOrder(input.exchange, input.orderId, this.now()), input.quoteEvidenceId);
  }
  async captureSettlement(input: TwoSidedCycleSettlementInput): Promise<string> {
    const {completedAt, ...payload} = input; return this.seal("SETTLEMENT", input.planId, input.dispatchId,
      input.idempotencyKey, payload, completedAt);
  }
  async stageRecovery(request: TwoSidedInventoryRecoveryRequest): Promise<string> {
    return this.stage({planId: request.planId, dispatchId: request.dispatchId, strategyId: request.strategyId,
      sourceEvidenceId: request.settlementEvidenceId, exchange: request.exchange, product: "SPOT", market: request.market,
      asset: request.baseAsset, quoteAsset: request.quoteAsset, residualDirection: request.side === "sell" ? "LONG" : "SHORT",
      side: request.side.toUpperCase() as "BUY" | "SELL", quantity: request.quantity,
      referencePrice: request.referencePrice, capturedAt: request.capturedAt, reason: request.reason});
  }
}

export class PassiveMakerHedgeProductionPort extends ProductionPortBase implements PassiveMakerThenHedgeLiveLifecyclePort {
  getAdmissionEvidence(planId: string, dispatchStartedAt: number): PassiveMakerHedgeAdmissionEvidence | null {
    return this.exactPayload("ENTRY_ADMISSION", planId, (payload: PassiveMakerHedgeAdmissionEvidence) =>
      payload.planId === planId && payload.generatedAt <= dispatchStartedAt && payload.expiresAt >= dispatchStartedAt,
    dispatchStartedAt);
  }
  async submitOrReconcile(input: Parameters<PassiveMakerThenHedgeLiveLifecyclePort["submitOrReconcile"]>[0]): Promise<PassiveMakerHedgeOrderEvidence | null> {
    const response = await this.orders.executeOrReconcile({request: input.request, idempotencyKey: input.idempotencyKey,
      allowNewSubmission: input.allowNewSubmission, now: this.now()});
    return response.state === "BLOCKED" ? null : passiveMakerOrder(response, input.admissionEvidenceId);
  }
  async readOrReconcile(input: Parameters<PassiveMakerThenHedgeLiveLifecyclePort["readOrReconcile"]>[0]): Promise<PassiveMakerHedgeOrderEvidence> {
    return passiveMakerOrder(await this.orders.readKnownOrder(input.exchange, input.orderId, this.now()), input.admissionEvidenceId);
  }
  async cancelOrReconcile(input: Parameters<PassiveMakerThenHedgeLiveLifecyclePort["cancelOrReconcile"]>[0]): Promise<PassiveMakerHedgeOrderEvidence> {
    return passiveMakerOrder(await this.orders.cancelKnownOrder(input.exchange, input.orderId, this.now()), input.admissionEvidenceId);
  }
  async captureSettlement(input: Parameters<PassiveMakerThenHedgeLiveLifecyclePort["captureSettlement"]>[0]): Promise<string> {
    const {completedAt, ...payload} = input; return this.seal("SETTLEMENT", input.planId, input.dispatchId,
      input.idempotencyKey, payload, completedAt);
  }
  async stageRecovery(request: PassiveMakerHedgeRecoveryRequest): Promise<string> {
    return this.stage({planId: request.planId, dispatchId: request.dispatchId, strategyId: request.strategyId,
      sourceEvidenceId: request.sourceEvidenceId, exchange: request.exchange, product: "SPOT", market: request.market,
      asset: request.baseAsset, quoteAsset: request.quoteAsset, residualDirection: request.side === "sell" ? "LONG" : "SHORT",
      side: request.side.toUpperCase() as "BUY" | "SELL", quantity: request.quantity,
      referencePrice: request.referencePrice, capturedAt: request.capturedAt, reason: request.reason});
  }
}

export class ParallelDerivativeProductionPort extends ProductionPortBase implements ParallelDerivativeLiveLifecyclePort {
  getEntryAdmissionEvidence(planId: string, dispatchStartedAt: number): DerivativeEntryAdmissionEvidence | null {
    return this.exactPayload("ENTRY_ADMISSION", planId, (payload: DerivativeEntryAdmissionEvidence) =>
      payload.generatedAt <= dispatchStartedAt && payload.expiresAt >= dispatchStartedAt, dispatchStartedAt);
  }
  async executeOrReconcile(input: Parameters<ParallelDerivativeLiveLifecyclePort["executeOrReconcile"]>[0]): Promise<DerivativeLifecycleOrderEvidence | null> {
    const response = await this.orders.executeOrReconcile({request: input.request, idempotencyKey: input.idempotencyKey,
      allowNewSubmission: input.allowNewSubmission, now: this.now()});
    return response.state === "BLOCKED" ? null : derivativeOrder(response);
  }
  async captureOpenPosition(input: Parameters<ParallelDerivativeLiveLifecyclePort["captureOpenPosition"]>[0]): Promise<string> {
    const {capturedAt, ...payload} = input; return this.seal("OPEN_POSITION", input.planId, input.dispatchId,
      input.idempotencyKey, payload, capturedAt);
  }
  evaluateExit(input: Parameters<ParallelDerivativeLiveLifecyclePort["evaluateExit"]>[0]): DerivativeExitEvaluationEvidence {
    const value = this.exactPayload("EXIT_EVALUATION", input.planId, (payload: DerivativeExitEvaluationEvidence) =>
      payload.positionGroupEvidenceId === input.positionGroupEvidenceId && payload.generatedAt <= input.now, input.now);
    if (!value) throw new Error("Current durable derivative exit-evaluation evidence is unavailable."); return value;
  }
  async captureSettlement(input: Parameters<ParallelDerivativeLiveLifecyclePort["captureSettlement"]>[0]): Promise<string> {
    const {completedAt, ...payload} = input; return this.seal("SETTLEMENT", input.planId, input.dispatchId,
      input.idempotencyKey, payload, completedAt);
  }
  async stageRecovery(request: DerivativeLiveRecoveryRequest): Promise<string> {
    const assets = parseMarket(request.market); return this.stage({planId: request.planId, dispatchId: request.dispatchId,
      strategyId: request.strategyId, sourceEvidenceId: request.sourceEvidenceId, exchange: request.exchange,
      product: request.product, market: request.market, asset: assets.base, quoteAsset: assets.quote,
      residualDirection: request.side === "sell" ? "LONG" : "SHORT", side: request.side.toUpperCase() as "BUY" | "SELL",
      quantity: request.quantity, referencePrice: request.referencePrice, capturedAt: request.capturedAt, reason: request.reason});
  }
}

export class CentralLiveProductionLifecycleComposition {
  readonly registry = new CentralLiveLifecycleHandlerRegistry();
  constructor(sequential: SequentialThreeLegLiveLifecyclePort = new SequentialThreeLegProductionPort(),
    twoSided: TwoSidedPassiveMakerLiveLifecyclePort = new TwoSidedMakerProductionPort(),
    derivative: ParallelDerivativeLiveLifecyclePort = new ParallelDerivativeProductionPort(),
    passiveMakerHedge: PassiveMakerThenHedgeLiveLifecyclePort = new PassiveMakerHedgeProductionPort()) {
    this.registry.register(new PassiveMakerThenHedgeLiveLifecycleHandler(passiveMakerHedge));
    this.registry.register(new SequentialThreeLegLiveLifecycleHandler(sequential));
    this.registry.register(new TwoSidedPassiveMakerLiveLifecycleHandler(twoSided));
    this.registry.register(new ParallelDerivativeLiveLifecycleHandler(derivative, "PARALLEL_TWO_LEG"));
    this.registry.register(new ParallelDerivativeLiveLifecycleHandler(derivative, "PARALLEL_STATISTICAL_PAIR"));
  }
  getDiagnostics() { const registry = this.registry.getDiagnostics(); return freeze({version: "80.0" as const,
    registeredCentralPatterns: registry.registeredHandlers, expectedCentralPatterns: 5,
    missingPatterns: [] as string[], fullyWired: registry.registeredHandlers === 5,
    safety: {productionOrderGatewayDefaultDisabled: true, evidenceRepositoryRequired: true,
      settlementEvidenceDurable: true, sharedRecoveryBridgeRequired: true}}); }
}

function sequentialOrder(response: CentralLiveOrderGatewayResponse, sizingEvidenceId: string): SequentialLegExecutionEvidence {
  const {record, fees} = exactGateway(response); return {terminalEvidenceId: `${record.id}:${record.feeEvidence?.id ?? "no-fill"}`,
    sizingEvidenceId, result: record.result!, fees: fees.map((item) => ({asset: item.asset, amount: item.amount,
      startAssetValue: null, valuationEvidenceId: null})), observedAt: record.updatedAt,
    orderSubmissionPerformed: record.orderSubmissionPerformed};
}
function twoSidedOrder(response: CentralLiveOrderGatewayResponse, quoteEvidenceId: string): TwoSidedOrderExecutionEvidence {
  const {record, fees} = exactGateway(response); return {evidenceId: `${record.id}:${record.feeEvidence?.id ?? "no-fill"}`,
    quoteEvidenceId, result: record.result!, fees: fees.map((item) => ({asset: item.asset, amount: item.amount,
      quoteValue: null, valuationEvidenceId: null})), observedAt: record.updatedAt,
    orderSubmissionPerformed: record.orderSubmissionPerformed};
}
function passiveMakerOrder(response: CentralLiveOrderGatewayResponse, admissionEvidenceId: string): PassiveMakerHedgeOrderEvidence {
  const {record, fees} = exactGateway(response); return {evidenceId: `${record.id}:${record.feeEvidence?.id ?? "no-fill"}`,
    admissionEvidenceId, result: record.result!, fees: fees.map((item) => ({asset: item.asset, amount: item.amount,
      quoteValue: null, valuationEvidenceId: null})), observedAt: record.updatedAt,
    orderSubmissionPerformed: record.orderSubmissionPerformed};
}
function derivativeOrder(response: CentralLiveOrderGatewayResponse): DerivativeLifecycleOrderEvidence {
  const {record, fees} = exactGateway(response); return {evidenceId: `${record.id}:${record.feeEvidence?.id ?? "no-fill"}`,
    result: record.result!, fees, observedAt: record.updatedAt, orderSubmissionPerformed: record.orderSubmissionPerformed};
}
function exactGateway(response: CentralLiveOrderGatewayResponse) {
  if (response.state === "BLOCKED" || response.state === "UNCERTAIN_SUBMISSION" || response.state === "EVIDENCE_INCOMPLETE" ||
    !response.record?.result) throw new Error(`Central LIVE order gateway did not produce exact usable evidence: ${response.reasons.join(" | ")}`);
  const fees = response.record.feeEvidence?.fees ?? [];
  if (response.record.result.filledQuantity > 0 && !response.record.feeEvidence?.complete) {
    throw new Error("Filled central LIVE order lacks complete authoritative fee evidence.");
  }
  return {record: response.record, fees};
}
function parseMarket(value: string): {base: string; quote: string} { const market = value.trim().toUpperCase().replace(/[^A-Z0-9]/gu, "");
  const quote = ["USDT", "USDC", "BUSD", "INR", "USD", "BTC", "ETH"].find((item) => market.endsWith(item) && market.length > item.length);
  if (!quote) throw new Error(`Central LIVE recovery market assets are unknown: ${value}`); return {base: market.slice(0, -quote.length), quote}; }
function numberKey(value: number): string { return Number(value.toFixed(12)).toString().replace("-", "m").replace(".", "p"); }
function freeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; for (const nested of Object.values(value)) freeze(nested); return Object.freeze(value); }

export const centralLiveProductionLifecycleComposition = new CentralLiveProductionLifecycleComposition();
