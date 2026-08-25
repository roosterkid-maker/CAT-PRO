import {createHash} from "node:crypto";
import {resolve} from "node:path";
import {JsonlSnapshotStore} from "../../../core/persistence/JsonlSnapshotStore";
import {binanceCredentialsProvider} from "../../../exchanges/binance/api/BinanceCredentialsProvider";
import {bybitCredentialsProvider} from "../../../exchanges/bybit/api/BybitCredentialsProvider";
import {liveExecutionService, type LiveExecutionExchangeStatus, type LiveExecutionService} from "../LiveExecutionService";
import type {LiveExecutionRequest} from "../models/LiveExecutionRequest";
import type {LiveExecutionResult} from "../models/LiveExecutionResult";
import {
  orderFillFeeEvidenceService,
  type OrderFillFeeEvidence,
  type OrderFillFeeEvidenceService,
} from "../evidence/OrderFillFeeEvidenceService";
import {authenticatedPrivateFillEventOwner} from "../fills/AuthenticatedPrivateFillEventOwner";

export type CentralLiveOrderGatewayState =
  | "PREPARED"
  | "ORDER_RECORDED"
  | "FEE_RECONCILED"
  | "EVIDENCE_INCOMPLETE"
  | "SUBMISSION_UNCERTAIN";

export interface CentralLiveOrderGatewayRecord {
  readonly version: "76.0";
  readonly id: string;
  readonly idempotencyKey: string;
  readonly requestHash: string;
  readonly request: LiveExecutionRequest;
  readonly state: CentralLiveOrderGatewayState;
  readonly preparedAt: number;
  readonly updatedAt: number;
  readonly result: LiveExecutionResult | null;
  readonly feeEvidence: OrderFillFeeEvidence | null;
  readonly cancelRequestedAt: number | null;
  readonly orderSubmissionPerformed: boolean;
  readonly lastError: string | null;
}

export interface CentralLiveOrderGatewayResponse {
  readonly state: "BLOCKED" | "UNCERTAIN_SUBMISSION" | "OPEN" | "EVIDENCE_INCOMPLETE" | "READY";
  readonly record: CentralLiveOrderGatewayRecord | null;
  readonly reasons: readonly string[];
}

export interface CentralLiveOrderGatewayConfiguration {readonly enabled?: boolean; readonly maximumRecords?: number;}
interface Snapshot {readonly version: "76.0"; readonly savedAt: number; readonly records: readonly CentralLiveOrderGatewayRecord[];}
interface RuntimePort {
  getAdapter(exchange: string): ReturnType<LiveExecutionService["getAdapter"]>;
  getExchangeStatus(exchange: string): LiveExecutionExchangeStatus;
}

export interface CentralPrivateFillOwnershipPort {
  registerBeforeIo(input: {readonly lifecycleOrderId: string; readonly request: LiveExecutionRequest;
    readonly registeredAt: number}): void;
  attachExchangeOrderId(input: {readonly lifecycleOrderId: string; readonly exchangeOrderId: string;
    readonly capturedAt: number}): void;
}

export interface CentralLiveOrderTimingPort {
  observeGatewayResult(input: {readonly venue: string; readonly market: string; readonly dispatchedAt: number;
    readonly resultAt: number}): void;
  recordObserverFailure(): void;
}

const DEFAULT_FILE = resolve(process.cwd(), "logs", "live", "central-order-gateway.jsonl");

/**
 * Journal-before-I/O owner for every central LIVE order. A crash after PREPARED
 * but before an exchange order ID is durable is never retried automatically.
 */
export class CentralLiveOrderExecutionGateway {
  private readonly enabled: boolean;
  private readonly maximumRecords: number;
  private readonly store: JsonlSnapshotStore<Snapshot>;
  private readonly records = new Map<string, CentralLiveOrderGatewayRecord>();
  private timingEvidence: CentralLiveOrderTimingPort | null;

  constructor(configuration: CentralLiveOrderGatewayConfiguration = {}, private readonly runtime: RuntimePort = liveExecutionService,
    private readonly fees: Pick<OrderFillFeeEvidenceService, "inspect"> = orderFillFeeEvidenceService,
    private readonly filePath = DEFAULT_FILE,
    private readonly privateFillOwnership: CentralPrivateFillOwnershipPort | null = null,
    timingEvidence: CentralLiveOrderTimingPort | null = null) {
    this.timingEvidence = timingEvidence;
    this.enabled = configuration.enabled ?? false; this.maximumRecords = configuration.maximumRecords ?? 2_000;
    if (!Number.isSafeInteger(this.maximumRecords) || this.maximumRecords <= 0) throw new Error("Central LIVE order gateway capacity must be positive.");
    this.store = new JsonlSnapshotStore({filePath, isPayload: isSnapshot});
    const latest = this.store.readAll().at(-1);
    if (latest) for (const record of latest.records) this.records.set(record.idempotencyKey, freeze(clone(record)));
  }

  setTimingEvidence(timingEvidence: CentralLiveOrderTimingPort | null): void {
    this.timingEvidence = timingEvidence;
  }

  async executeOrReconcile(input: {readonly request: LiveExecutionRequest; readonly idempotencyKey: string;
    readonly allowNewSubmission: boolean; readonly now?: number}): Promise<CentralLiveOrderGatewayResponse> {
    const now = input.now ?? Date.now(); validateTime(now); const key = requireKey(input.idempotencyKey);
    const request = this.withDurableClientOrderId(input.request, key); const hash = requestHash(request); const existing = this.records.get(key);
    if (existing) {
      if (existing.requestHash !== hash) throw new Error("Central LIVE order idempotency key request hash changed.");
      if (existing.state === "PREPARED" || existing.state === "SUBMISSION_UNCERTAIN") return this.response("UNCERTAIN_SUBMISSION", existing,
        ["Order intent was durable before I/O, but no exchange order ID is authoritative; automatic resubmission is forbidden."]);
      return this.reconcileKnown(existing, now);
    }
    if (!this.enabled) return this.response("BLOCKED", null, ["Central LIVE order gateway compile-time gate is disabled."]);
    if (!input.allowNewSubmission) return this.response("BLOCKED", null, ["Fresh action authority does not allow a new exchange submission."]);
    this.validateReadiness(request);
    if (this.records.size >= this.maximumRecords) throw new Error("Central LIVE order gateway capacity is exhausted.");
    const prepared = freeze({version: "76.0" as const, id: `central-live-order:${createHash("sha256").update(key).digest("hex")}`,
      idempotencyKey: key, requestHash: hash, request: clone(request), state: "PREPARED" as const,
      preparedAt: now, updatedAt: now, result: null, feeEvidence: null, cancelRequestedAt: null,
      orderSubmissionPerformed: false, lastError: null});
    this.privateFillOwnership?.registerBeforeIo({lifecycleOrderId: prepared.id, request, registeredAt: now});
    this.set(prepared); this.persist(now);
    try {
      const result = await this.runtime.getAdapter(request.exchange).execute(request);
      this.validateResult(result, request, null);
      if (this.timingEvidence) {
        try {
          this.timingEvidence.observeGatewayResult({venue: request.exchange, market: request.market,
            dispatchedAt: result.startedAt, resultAt: result.completedAt});
        } catch {
          try { this.timingEvidence.recordObserverFailure(); } catch { /* Evidence cannot change an exchange outcome. */ }
        }
      }
      const recorded = freeze({...clone(prepared), state: "ORDER_RECORDED" as const, updatedAt: Math.max(now, result.completedAt),
        result: clone(result), orderSubmissionPerformed: result.orderId !== null || result.status !== "FAILED"});
      this.set(recorded); this.persist(recorded.updatedAt);
      if (this.privateFillOwnership && result.orderId && isPrivateFillSpotRequest(request)) {
        try {
          this.privateFillOwnership.attachExchangeOrderId({lifecycleOrderId: prepared.id,
            exchangeOrderId: result.orderId, capturedAt: recorded.updatedAt});
        } catch (error: unknown) {
          const incomplete = freeze({...clone(recorded), state: "EVIDENCE_INCOMPLETE" as const,
            lastError: message(error), updatedAt: recorded.updatedAt});
          this.set(incomplete); this.persist(incomplete.updatedAt);
          return this.response("EVIDENCE_INCOMPLETE", incomplete,
            ["Exchange acknowledged the order, but durable private fill identity attachment failed.", incomplete.lastError as string]);
        }
      }
      return this.enrich(recorded, recorded.updatedAt);
    } catch (error: unknown) {
      const uncertain = freeze({...clone(prepared), state: "SUBMISSION_UNCERTAIN" as const, updatedAt: Date.now(),
        lastError: message(error)});
      this.set(uncertain); this.persist(uncertain.updatedAt);
      return this.response("UNCERTAIN_SUBMISSION", uncertain,
        ["Exchange call did not yield a durable order ID; automatic retry is forbidden.", uncertain.lastError as string]);
    }
  }

  async readOrReconcile(idempotencyKey: string, now = Date.now()): Promise<CentralLiveOrderGatewayResponse> {
    validateTime(now); const record = this.requireKnown(idempotencyKey); return this.reconcileKnown(record, now);
  }

  async readKnownOrder(exchange: string, orderId: string, now = Date.now()): Promise<CentralLiveOrderGatewayResponse> {
    validateTime(now); return this.reconcileKnown(this.findKnownOrder(exchange, orderId), now);
  }

  async cancelOrReconcile(idempotencyKey: string, now = Date.now()): Promise<CentralLiveOrderGatewayResponse> {
    validateTime(now); const record = this.requireKnown(idempotencyKey);
    if (!record.result?.orderId) return this.response("UNCERTAIN_SUBMISSION", record, ["Known exchange order ID is required for cancellation."]);
    if (terminal(record.result.status)) return this.enrich(record, now);
    const requested = freeze({...clone(record), cancelRequestedAt: record.cancelRequestedAt ?? now, updatedAt: now});
    this.set(requested); this.persist(now);
    try {
      const result = await this.runtime.getAdapter(record.request.exchange).cancelOrder(record.result.orderId,
        record.request.market, record.request.product ?? "SPOT");
      this.validateResult(result, record.request, record.result);
      const updated = freeze({...clone(requested), state: "ORDER_RECORDED" as const, updatedAt: Math.max(now, result.completedAt),
        result: clone(result), feeEvidence: null, lastError: null});
      this.set(updated); this.persist(updated.updatedAt); return this.enrich(updated, updated.updatedAt);
    } catch (error: unknown) {
      const uncertain = freeze({...clone(requested), updatedAt: Date.now(), lastError: message(error)});
      this.set(uncertain); this.persist(uncertain.updatedAt);
      return this.response("EVIDENCE_INCOMPLETE", uncertain,
        ["Cancellation result is uncertain; known order ID permits read reconciliation but not a replacement order.", uncertain.lastError as string]);
    }
  }

  async cancelKnownOrder(exchange: string, orderId: string, now = Date.now()): Promise<CentralLiveOrderGatewayResponse> {
    return this.cancelOrReconcile(this.findKnownOrder(exchange, orderId).idempotencyKey, now);
  }

  get(idempotencyKey: string): CentralLiveOrderGatewayRecord | null {
    const value = this.records.get(requireKey(idempotencyKey)); return value ? clone(value) : null;
  }

  getDiagnostics(now = Date.now()) {
    const values = [...this.records.values()];
    return freeze({version: "76.0" as const, generatedAt: now, enabled: this.enabled, filePath: this.filePath, records: values.length,
      states: Object.fromEntries(["PREPARED", "ORDER_RECORDED", "FEE_RECONCILED", "EVIDENCE_INCOMPLETE", "SUBMISSION_UNCERTAIN"]
        .map((state) => [state, values.filter((item) => item.state === state).length])), persistence: this.store.getDiagnostics(),
      safety: {journalBeforeIo: true, unknownSubmissionNeverRetried: true, knownOrderReadReconciliation: true,
        knownOrderCancellationIdempotent: true, authoritativeFillFeeEvidenceRequired: true, defaultEnabled: false}});
  }

  private async reconcileKnown(record: CentralLiveOrderGatewayRecord, now: number): Promise<CentralLiveOrderGatewayResponse> {
    if (!record.result?.orderId) return this.enrich(record, now);
    try {
      const result = await this.runtime.getAdapter(record.request.exchange).getOrderStatus(record.result.orderId,
        record.request.market, record.request.product ?? "SPOT");
      this.validateResult(result, record.request, record.result);
      const updated = freeze({...clone(record), state: "ORDER_RECORDED" as const, updatedAt: Math.max(now, result.completedAt),
        result: clone(result), feeEvidence: null, lastError: null});
      this.set(updated); this.persist(updated.updatedAt); return this.enrich(updated, updated.updatedAt);
    } catch (error: unknown) {
      const incomplete = freeze({...clone(record), state: "EVIDENCE_INCOMPLETE" as const, updatedAt: now, lastError: message(error)});
      this.set(incomplete); this.persist(now);
      return this.response("EVIDENCE_INCOMPLETE", incomplete, ["Known order status reconciliation failed.", incomplete.lastError as string]);
    }
  }

  private async enrich(record: CentralLiveOrderGatewayRecord, now: number): Promise<CentralLiveOrderGatewayResponse> {
    const result = record.result;
    if (!result) return this.response("EVIDENCE_INCOMPLETE", record, ["Order result evidence is missing."]);
    if (result.filledQuantity <= 0) {
      const complete = freeze({...clone(record), state: "FEE_RECONCILED" as const, updatedAt: now, feeEvidence: null});
      this.set(complete); this.persist(now);
      return this.response(terminal(result.status) ? "READY" : "OPEN", complete, ["Order has no filled quantity and therefore no fill commission."]);
    }
    if (!result.orderId) return this.response("EVIDENCE_INCOMPLETE", record, ["Filled order lacks an authoritative exchange order ID."]);
    try {
      const evidence = await this.fees.inspect({exchange: result.exchange, product: result.product ?? record.request.product ?? "SPOT",
        market: result.market, orderId: result.orderId, expectedFilledQuantity: result.filledQuantity}, now);
      const state = evidence.complete ? "FEE_RECONCILED" as const : "EVIDENCE_INCOMPLETE" as const;
      const reconciledResult = evidence.complete ? {...clone(result), authoritativeFeeQuoteAmount: evidence.totalFeeQuoteAmount,
        authoritativeWithholdingQuoteAmount: evidence.totalWithholdingQuoteAmount,
        authoritativeCashDeductionQuoteAmount: evidence.totalCashDeductionQuoteAmount,
        authoritativeWithholdingEvidenceComplete: evidence.withholdingEvidenceComplete,
        authoritativeFeeEvidenceId: evidence.id} : clone(result);
      const updated = freeze({...clone(record), state, updatedAt: now, result: reconciledResult, feeEvidence: clone(evidence),
        lastError: evidence.complete ? null : evidence.blockers.join(" | ")});
      this.set(updated); this.persist(now);
      return evidence.complete ? this.response(terminal(result.status) ? "READY" : "OPEN", updated, [])
        : this.response("EVIDENCE_INCOMPLETE", updated, evidence.blockers);
    } catch (error: unknown) {
      const incomplete = freeze({...clone(record), state: "EVIDENCE_INCOMPLETE" as const, updatedAt: now, lastError: message(error)});
      this.set(incomplete); this.persist(now);
      return this.response("EVIDENCE_INCOMPLETE", incomplete, ["Authoritative fill-fee reconciliation failed.", incomplete.lastError as string]);
    }
  }

  private validateReadiness(request: LiveExecutionRequest): void {
    const status = this.runtime.getExchangeStatus(request.exchange); const product = request.product ?? "SPOT";
    if (!status.adapterRegistered || !status.authenticationVerified || !status.exchangeApiReachable ||
      !status.readOnlyVerificationFresh || !status.capabilities?.products.includes(product)) {
      throw new Error("Central LIVE order requires a registered, fresh authenticated, reachable product adapter.");
    }
    if (request.orderType === "market" && !status.capabilities.supportsMarketOrders) throw new Error("Market-order capability is unavailable.");
    if (request.orderType === "limit" && (!status.capabilities.supportsLimitOrders || (request.postOnly && !status.capabilities.supportsPostOnly))) {
      throw new Error("Requested limit/post-only capability is unavailable.");
    }
    if (request.reduceOnly && !status.capabilities.supportsReduceOnly) throw new Error("Reduce-only capability is unavailable.");
  }

  private withDurableClientOrderId(request: LiveExecutionRequest, key: string): LiveExecutionRequest {
    if (!isPrivateFillSpotRequest(request) || request.clientOrderId?.trim()) return request;
    return freeze({...clone(request), clientOrderId: `cat-${createHash("sha256").update(key).digest("hex").slice(0, 28)}`});
  }

  private validateResult(result: LiveExecutionResult, request: LiveExecutionRequest, previous: LiveExecutionResult | null): void {
    if (normalize(result.exchange) !== normalize(request.exchange) || normalizeMarket(result.market) !== normalizeMarket(request.market) ||
      result.side !== request.side || !Number.isFinite(result.filledQuantity) || result.filledQuantity < 0 ||
      result.filledQuantity > request.quantity + 1e-10 || (previous && (result.orderId !== previous.orderId ||
        result.filledQuantity + 1e-10 < previous.filledQuantity))) throw new Error("Central LIVE order result is invalid, mismatched, or regressed.");
    if ((request.product ?? "SPOT") === "PERPETUAL" && (result.product !== "PERPETUAL" ||
      result.reduceOnly !== request.reduceOnly || result.positionMode !== request.positionMode || result.positionSide !== request.positionSide)) {
      throw new Error("Central LIVE derivative result lost exact product/position/reduce-only semantics.");
    }
  }

  private requireKnown(key: string): CentralLiveOrderGatewayRecord {
    const value = this.records.get(requireKey(key)); if (!value) throw new Error("Central LIVE order idempotency record is missing.");
    if (value.state === "PREPARED" || value.state === "SUBMISSION_UNCERTAIN") return value;
    return value;
  }
  private findKnownOrder(exchange: string, orderId: string): CentralLiveOrderGatewayRecord {
    const matches = [...this.records.values()].filter((item) => normalize(item.request.exchange) === normalize(exchange) &&
      item.result?.orderId === orderId.trim());
    if (matches.length !== 1) throw new Error("Central LIVE known order lookup requires one exact durable match.");
    return matches[0] as CentralLiveOrderGatewayRecord;
  }
  private set(record: CentralLiveOrderGatewayRecord): void { this.records.set(record.idempotencyKey, freeze(clone(record))); }
  private persist(now: number): void { this.store.append({version: "76.0", savedAt: now, records: [...this.records.values()].map(clone)}); }
  private response(state: CentralLiveOrderGatewayResponse["state"], record: CentralLiveOrderGatewayRecord | null,
    reasons: readonly string[]): CentralLiveOrderGatewayResponse { return freeze({state, record: record ? clone(record) : null, reasons: [...reasons]}); }
}

function isSnapshot(value: unknown): value is Snapshot { if (typeof value !== "object" || value === null) return false;
  const item = value as Partial<Snapshot>; return item.version === "76.0" && Number.isSafeInteger(item.savedAt) &&
    Array.isArray(item.records) && item.records.every((record) => typeof record === "object" && record !== null &&
      (record as Partial<CentralLiveOrderGatewayRecord>).version === "76.0" &&
      typeof (record as Partial<CentralLiveOrderGatewayRecord>).idempotencyKey === "string"); }
function requestHash(value: LiveExecutionRequest): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function requireKey(value: string): string { const key = value.trim(); if (!/^[A-Za-z0-9_.:/-]{8,200}$/u.test(key)) throw new Error("Central LIVE order idempotency key is invalid."); return key; }
function validateTime(value: number): void { if (!Number.isSafeInteger(value) || value <= 0) throw new Error("Central LIVE order timestamp must be positive."); }
function normalize(value: string): string { return value.trim().toLowerCase(); }
function normalizeMarket(value: string): string { return value.trim().toUpperCase().replace(/[^A-Z0-9]/gu, ""); }
function terminal(value: LiveExecutionResult["status"]): boolean { return value === "FILLED" || value === "CANCELLED" || value === "REJECTED" || value === "FAILED"; }
function isPrivateFillSpotRequest(request: LiveExecutionRequest): boolean { const exchange = normalize(request.exchange);
  return (request.product ?? "SPOT") === "SPOT" && (exchange === "binance" || exchange === "bybit"); }
function message(error: unknown): string { return error instanceof Error ? error.message : "Unknown central LIVE order gateway failure."; }
function clone<T>(value: T): T { return structuredClone(value); }
function freeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; for (const nested of Object.values(value)) freeze(nested); return Object.freeze(value); }

class DefaultCentralPrivateFillOwnership implements CentralPrivateFillOwnershipPort {
  registerBeforeIo(input: {readonly lifecycleOrderId: string; readonly request: LiveExecutionRequest;
    readonly registeredAt: number}): void {
    if (!isPrivateFillSpotRequest(input.request)) return;
    const exchange = normalize(input.request.exchange) as "binance" | "bybit";
    const apiKey = exchange === "binance" ? binanceCredentialsProvider.getCredentials().apiKey
      : bybitCredentialsProvider.getCredentials().apiKey;
    authenticatedPrivateFillEventOwner.registerOrder({lifecycleOrderId: input.lifecycleOrderId, venue: exchange,
      accountFingerprint: createHash("sha256").update(apiKey.trim()).digest("hex"), market: input.request.market,
      side: input.request.side, requestedQuantity: input.request.quantity,
      clientOrderId: input.request.clientOrderId as string, exchangeOrderId: null, registeredAt: input.registeredAt});
  }
  attachExchangeOrderId(input: {readonly lifecycleOrderId: string; readonly exchangeOrderId: string;
    readonly capturedAt: number}): void {
    authenticatedPrivateFillEventOwner.attachExchangeOrderId(input.lifecycleOrderId, input.exchangeOrderId, input.capturedAt);
  }
}

const STRATEGY_ONE_LIVE_GATEWAY_ENABLED =
  process.env.TRADING_MODE?.trim().toLowerCase() === "live" &&
  process.env.LIVE_TRADING_ENABLED?.trim().toLowerCase() === "true" &&
  process.env.ARBITRAGE_LIVE_CONFIRMATION?.trim() ===
    "ENABLE_CONFIRMED_ARBITRAGE_EXECUTION" &&
  process.env.STRATEGY_ONE_LIVE_RUNTIME_CONFIRMATION?.trim() ===
  "ENABLE_STRATEGY_ONE_TINY_LIVE_RUNTIME";

export const centralLiveOrderExecutionGateway = new CentralLiveOrderExecutionGateway({enabled: STRATEGY_ONE_LIVE_GATEWAY_ENABLED}, liveExecutionService,
  orderFillFeeEvidenceService, DEFAULT_FILE, new DefaultCentralPrivateFillOwnership());
