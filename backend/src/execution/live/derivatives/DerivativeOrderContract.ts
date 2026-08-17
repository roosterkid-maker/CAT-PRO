import {executionAuditLogger} from "../audit/ExecutionAuditLogger";
import type {
  LiveExecutionAdapter,
  LiveExecutionAdapterCapabilities,
  LiveExecutionAdapterReadiness,
} from "../contracts/LiveExecutionAdapter";
import {executionMetricsService} from "../metrics/ExecutionMetricsService";
import type {LiveExecutionRequest} from "../models/LiveExecutionRequest";
import type {LiveExecutionResult, LiveExecutionStatus} from "../models/LiveExecutionResult";
import {orderPoller} from "../polling/OrderPoller";
import {executionAdapterVerificationService} from "../verification/ExecutionAdapterVerificationService";

export interface DerivativeVenueOrder {
  readonly exchange: string;
  readonly market: string;
  readonly side: "buy" | "sell";
  readonly orderId: string;
  readonly clientOrderId: string | null;
  readonly status: LiveExecutionStatus;
  readonly requestedQuantity: number;
  readonly filledQuantity: number;
  readonly remainingQuantity: number;
  readonly requestedPrice: number | null;
  readonly averageFillPrice: number;
  readonly feeAmount: number;
  readonly reduceOnly: boolean;
  readonly positionMode: "ONE_WAY" | "HEDGE";
  readonly positionSide: "LONG" | "SHORT";
  readonly rejectReason: string | null;
}

export interface DerivativeOrderApi {
  readonly exchange: string;
  create(request: LiveExecutionRequest): Promise<DerivativeVenueOrder>;
  get(orderId: string, market: string): Promise<DerivativeVenueOrder>;
  cancel(orderId: string, market: string): Promise<DerivativeVenueOrder>;
}

export interface DerivativeCredentialsReadinessSource {
  isConfigured(): boolean;
}

export function validateDerivativeRequest(request: LiveExecutionRequest, exchange: string): void {
  if (request.exchange.trim().toLowerCase() !== exchange.trim().toLowerCase()) {
    throw new Error(`Invalid exchange for ${exchange} perpetual adapter: ${request.exchange}`);
  }
  if (request.product !== "PERPETUAL") throw new Error("Derivative execution requires explicit product=PERPETUAL.");
  if (request.side !== "buy" && request.side !== "sell") throw new Error("Derivative side must be buy or sell.");
  if (request.orderType !== "market" && request.orderType !== "limit") throw new Error("Derivative order type must be market or limit.");
  if (request.postOnly === true) throw new Error("Derivative post-only is not admitted by the V73 contract.");
  if (typeof request.reduceOnly !== "boolean") throw new Error("Derivative reduceOnly intent must be explicit.");
  if (request.positionMode !== "ONE_WAY" && request.positionMode !== "HEDGE") {
    throw new Error("Derivative position mode must be explicitly ONE_WAY or HEDGE.");
  }
  if (request.positionSide !== "LONG" && request.positionSide !== "SHORT") {
    throw new Error("Derivative economic position side must be explicitly LONG or SHORT.");
  }
  const expectedSide = request.reduceOnly
    ? request.positionSide === "LONG" ? "sell" : "buy"
    : request.positionSide === "LONG" ? "buy" : "sell";
  if (request.side !== expectedSide) {
    throw new Error(`Derivative ${request.reduceOnly ? "reduce" : "entry"} side conflicts with ${request.positionSide} exposure semantics.`);
  }
  if (!Number.isFinite(request.quantity) || request.quantity <= 0) throw new Error("Derivative quantity must be positive.");
  if (!/^[A-Z0-9]{2,30}$/u.test(normalizeMarket(request.market))) throw new Error("Derivative market symbol is invalid.");
  if (request.orderType === "limit" && (!Number.isFinite(request.price) || (request.price as number) <= 0)) {
    throw new Error("Derivative limit order requires a positive price.");
  }
  if (request.orderType === "market" && request.price !== undefined) throw new Error("Derivative market order cannot carry a limit price.");
  if (request.clientOrderId !== undefined && !/^[.A-Za-z0-9_:/-]{1,36}$/u.test(request.clientOrderId)) {
    throw new Error("Derivative client order ID must use the audited 1-36 character subset.");
  }
  if (request.timeoutMs !== undefined && (!Number.isFinite(request.timeoutMs) || request.timeoutMs <= 0)) {
    throw new Error("Derivative execution timeout must be positive.");
  }
  if (request.pollingIntervalMs !== undefined && (!Number.isFinite(request.pollingIntervalMs) || request.pollingIntervalMs <= 0)) {
    throw new Error("Derivative polling interval must be positive.");
  }
  if (request.timeoutMs !== undefined && request.pollingIntervalMs !== undefined && request.pollingIntervalMs > request.timeoutMs) {
    throw new Error("Derivative polling interval cannot exceed timeout.");
  }
}

export class DerivativeLiveExecutionAdapter implements LiveExecutionAdapter {
  readonly exchange: string;
  constructor(private readonly api: DerivativeOrderApi,
    private readonly credentials: DerivativeCredentialsReadinessSource) {
    this.exchange = api.exchange.trim().toLowerCase();
    if (!this.exchange) throw new Error("Derivative adapter exchange is required.");
  }

  getCapabilities(): LiveExecutionAdapterCapabilities {
    return {products: ["PERPETUAL"], supportsMarketOrders: true, supportsLimitOrders: true, supportsPostOnly: false,
      supportsOrderStatus: true, supportsCancellation: true, supportsAmendKeepPriority: false, supportsReduceOnly: true};
  }

  async execute(request: LiveExecutionRequest): Promise<LiveExecutionResult> {
    const startedAt = Date.now();
    await safeAudit(() => executionAuditLogger.executionStarted(request));
    try {
      validateDerivativeRequest(request, this.exchange);
      const created = await this.api.create(request);
      const initial = mapResult(created, startedAt);
      await safeAudit(() => executionAuditLogger.orderCreated(request, initial));
      const finalResult = await orderPoller.waitForFinalState(this, initial, {timeoutMs: request.timeoutMs ?? 15_000,
        pollingIntervalMs: request.pollingIntervalMs ?? 1_000, cancelOnTimeout: request.cancelOnTimeout ?? true});
      executionMetricsService.record(finalResult);
      return finalResult;
    } catch (error: unknown) {
      const completedAt = Date.now();
      const failureReason = error instanceof Error ? error.message : `${this.exchange} perpetual execution failed.`;
      const failed: LiveExecutionResult = {success: false, exchange: this.exchange, product: "PERPETUAL",
        reduceOnly: request.reduceOnly, positionMode: request.positionMode, positionSide: request.positionSide,
        market: normalizeMarket(request.market), side: request.side, orderId: null, clientOrderId: request.clientOrderId ?? null,
        status: "FAILED", requestedQuantity: request.quantity, filledQuantity: 0, remainingQuantity: request.quantity,
        requestedPrice: request.price ?? null, averageFillPrice: 0, feeAmount: 0, cancelled: false, timedOut: false,
        startedAt, completedAt, executionTimeMs: completedAt - startedAt, failureReason,
        reasons: [`Unable to create or monitor the ${this.exchange} perpetual order.`]};
      await safeAudit(() => executionAuditLogger.executionFailed(request, failureReason, failed));
      executionMetricsService.record(failed);
      return failed;
    }
  }

  async getOrderStatus(orderId: string, market?: string, product?: "SPOT" | "PERPETUAL"): Promise<LiveExecutionResult> {
    this.requireProduct(product);
    return mapResult(await this.api.get(requireOrderId(orderId), requireMarket(market)), Date.now());
  }

  async cancelOrder(orderId: string, market?: string, product?: "SPOT" | "PERPETUAL"): Promise<LiveExecutionResult> {
    this.requireProduct(product);
    const order = await this.api.cancel(requireOrderId(orderId), requireMarket(market));
    if (order.status !== "CANCELLED" && order.status !== "FILLED" && order.status !== "REJECTED") {
      throw new Error("Derivative cancellation acknowledgement lacks terminal order-state evidence.");
    }
    return mapResult(order, Date.now());
  }

  getReadiness(): LiveExecutionAdapterReadiness {
    return executionAdapterVerificationService.getReadiness(this.exchange, this.credentials.isConfigured());
  }

  private requireProduct(product: "SPOT" | "PERPETUAL" | undefined): void {
    if (product !== undefined && product !== "PERPETUAL") throw new Error("Perpetual adapter cannot read or cancel a SPOT order.");
  }
}

function mapResult(order: DerivativeVenueOrder, startedAt: number): LiveExecutionResult {
  const completedAt = Date.now();
  return {success: order.status === "FILLED", exchange: order.exchange, product: "PERPETUAL", reduceOnly: order.reduceOnly,
    positionMode: order.positionMode, positionSide: order.positionSide, market: order.market, side: order.side,
    orderId: order.orderId, clientOrderId: order.clientOrderId, status: order.status,
    requestedQuantity: order.requestedQuantity, filledQuantity: order.filledQuantity, remainingQuantity: order.remainingQuantity,
    requestedPrice: order.requestedPrice, averageFillPrice: order.averageFillPrice, feeAmount: order.feeAmount,
    cancelled: order.status === "CANCELLED", timedOut: false, startedAt, completedAt,
    executionTimeMs: Math.max(0, completedAt - startedAt), failureReason: order.rejectReason,
    reasons: order.rejectReason ? [order.rejectReason] : []};
}

function normalizeMarket(value: string): string { return value.trim().toUpperCase().replace(/[^A-Z0-9]/gu, ""); }
function requireMarket(value?: string): string { const market = normalizeMarket(value ?? ""); if (!market) throw new Error("Derivative order market is required."); return market; }
function requireOrderId(value: string): string { const id = value.trim(); if (!/^[A-Za-z0-9_-]{1,80}$/u.test(id)) throw new Error("Derivative order ID is invalid."); return id; }
async function safeAudit(action: () => Promise<void>): Promise<void> { try { await action(); } catch (error: unknown) { console.error("[ExecutionAuditLogger]", error instanceof Error ? error.message : error); } }
