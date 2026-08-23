import {zebPayCredentialsProvider, type ZebPayCredentials} from "../../../exchanges/zebpay/api/ZebPayCredentialsProvider";
import {zebPayOrderApi, type ZebPayLimitOrderRequest, type ZebPaySpotOrder} from "../../../exchanges/zebpay/api/ZebPayOrderApi";
import type {LiveExecutionAdapter, LiveExecutionAdapterCapabilities, LiveExecutionAdapterReadiness} from "../contracts/LiveExecutionAdapter";
import type {LiveExecutionRequest} from "../models/LiveExecutionRequest";
import type {LiveExecutionResult} from "../models/LiveExecutionResult";
import {executionAdapterVerificationService} from "../verification/ExecutionAdapterVerificationService";
import {zebPayOrderSubmissionJournalService, type ZebPaySubmissionJournalRecord} from "./ZebPayOrderSubmissionJournalService";

interface OrderApi {
  createLimitOrder(request: ZebPayLimitOrderRequest, credentials: ZebPayCredentials): Promise<ZebPaySpotOrder>;
  getOrder(orderId: string, market: string, credentials: ZebPayCredentials): Promise<ZebPaySpotOrder>;
  cancelOrder(orderId: string, market: string, credentials: ZebPayCredentials): Promise<ZebPaySpotOrder>;
}

interface CredentialsSource {
  isConfigured(): boolean;
  getCredentials(): ZebPayCredentials;
}

interface Journal {
  get(clientOrderId: string): ZebPaySubmissionJournalRecord | null;
  record(record: ZebPaySubmissionJournalRecord): void;
}

export interface ZebPayExecutionAdapterOptions {
  orderApi?: OrderApi;
  credentials?: CredentialsSource;
  journal?: Journal;
  now?: () => number;
  submissionEnabled?: () => boolean;
}

/**
 * V164 fail-closed Spot lifecycle foundation. It never retries submission,
 * persists PREPARED before signed I/O, and permanently blocks ambiguous ids.
 */
export class ZebPayExecutionAdapter implements LiveExecutionAdapter {
  readonly exchange = "zebpay";
  private readonly orderApi: OrderApi;
  private readonly credentials: CredentialsSource;
  private readonly journal: Journal;
  private readonly now: () => number;
  private readonly submissionEnabled: () => boolean;

  constructor(options: ZebPayExecutionAdapterOptions = {}) {
    this.orderApi = options.orderApi ?? zebPayOrderApi;
    this.credentials = options.credentials ?? zebPayCredentialsProvider;
    this.journal = options.journal ?? zebPayOrderSubmissionJournalService;
    this.now = options.now ?? Date.now;
    this.submissionEnabled = options.submissionEnabled ?? (() =>
      process.env.TRADING_MODE?.trim().toLowerCase() === "live" &&
      process.env.LIVE_TRADING_ENABLED?.trim().toLowerCase() === "true" &&
      process.env.ARBITRAGE_LIVE_CONFIRMATION?.trim() === "ENABLE_CONFIRMED_ARBITRAGE_EXECUTION" &&
      process.env.STRATEGY_ONE_LIVE_RUNTIME_CONFIRMATION?.trim() === "ENABLE_STRATEGY_ONE_TINY_LIVE_RUNTIME" &&
      process.env.ZEBPAY_LIVE_ORDER_SUBMISSION_ENABLED?.trim().toLowerCase() === "true" &&
      process.env.ZEBPAY_LIVE_ORDER_SUBMISSION_CONFIRMATION?.trim() === "ENABLE_EXPLICIT_ZEBPAY_SPOT_ORDERS"
    );
  }

  getCapabilities(): LiveExecutionAdapterCapabilities {
    return {
      products: ["SPOT"],
      supportsMarketOrders: false,
      supportsLimitOrders: true,
      supportsPostOnly: false,
      supportsOrderStatus: true,
      supportsCancellation: true,
      supportsAmendKeepPriority: false,
      supportsReduceOnly: false,
    };
  }

  async execute(request: LiveExecutionRequest): Promise<LiveExecutionResult> {
    const startedAt = this.now();
    this.assertSubmissionAllowed(request);
    const clientOrderId = request.clientOrderId?.trim() ?? "";
    const existing = this.journal.get(clientOrderId);
    if (existing) {
      throw new Error(`ZebPay duplicate/ambiguous submission blocked for durable client identity ${clientOrderId}.`);
    }
    this.journal.record({clientOrderId, market: request.market, state: "PREPARED", orderId: null, recordedAt: startedAt});
    try {
      const order = await this.orderApi.createLimitOrder({
        market: request.market,
        side: request.side,
        quantity: request.quantity,
        price: request.price ?? 0,
      }, this.credentials.getCredentials());
      this.journal.record({clientOrderId, market: request.market, state: "SUBMITTED", orderId: order.id, recordedAt: this.now()});
      return mapOrder(order, clientOrderId, startedAt, this.now());
    } catch (error: unknown) {
      this.journal.record({clientOrderId, market: request.market, state: "AMBIGUOUS", orderId: null, recordedAt: this.now()});
      throw error;
    }
  }

  async getOrderStatus(orderId: string, market?: string, product?: "SPOT" | "PERPETUAL"): Promise<LiveExecutionResult> {
    this.assertSpotMarket(market, product);
    const startedAt = this.now();
    const order = await this.orderApi.getOrder(orderId, market ?? "", this.credentials.getCredentials());
    return mapOrder(order, null, startedAt, this.now());
  }

  async cancelOrder(orderId: string, market?: string, product?: "SPOT" | "PERPETUAL"): Promise<LiveExecutionResult> {
    this.assertSpotMarket(market, product);
    if (!this.submissionEnabled()) throw new Error("ZebPay cancellation is disabled by the explicit venue mutation gate.");
    const startedAt = this.now();
    const order = await this.orderApi.cancelOrder(orderId, market ?? "", this.credentials.getCredentials());
    return mapOrder(order, null, startedAt, this.now(), true);
  }

  getReadiness(): LiveExecutionAdapterReadiness {
    return executionAdapterVerificationService.getReadiness(this.exchange, this.credentials.isConfigured());
  }

  private assertSubmissionAllowed(request: LiveExecutionRequest): void {
    if (!this.submissionEnabled()) throw new Error("ZebPay LIVE order submission is disabled by its venue-specific gate.");
    if ((request.product ?? "SPOT") !== "SPOT" || request.orderType !== "limit" || request.timeInForce !== "GTC" || request.postOnly === true) {
      throw new Error("ZebPay V164 supports only explicitly-priced ordinary GTC Spot limit orders.");
    }
    if (!request.clientOrderId?.trim()) throw new Error("ZebPay requires CAT PRO durable client identity before submission.");
    if (!Number.isFinite(request.quantity) || request.quantity <= 0 || !Number.isFinite(request.price) || (request.price ?? 0) <= 0) {
      throw new Error("ZebPay order quantity and price must be positive finite values.");
    }
  }

  private assertSpotMarket(market: string | undefined, product: "SPOT" | "PERPETUAL" | undefined): void {
    if ((product ?? "SPOT") !== "SPOT" || !market?.trim()) throw new Error("ZebPay order read/cancel requires an explicit Spot market.");
  }
}

function mapOrder(order: ZebPaySpotOrder, clientOrderId: string | null, startedAt: number, completedAt: number, cancelled = false): LiveExecutionResult {
  const status = mapStatus(order.status);
  return {
    success: status === "FILLED",
    exchange: "zebpay",
    product: "SPOT",
    market: order.market,
    side: order.side,
    orderId: order.id,
    clientOrderId,
    status,
    requestedQuantity: order.quantity,
    filledQuantity: order.filledQuantity,
    remainingQuantity: order.remainingQuantity,
    requestedPrice: order.price,
    averageFillPrice: order.averagePrice,
    feeAmount: order.feeAmount,
    cancelled: cancelled || status === "CANCELLED",
    timedOut: false,
    startedAt,
    completedAt,
    executionTimeMs: Math.max(0, completedAt - startedAt),
    failureReason: null,
    reasons: [],
  };
}

function mapStatus(value: string): LiveExecutionResult["status"] {
  switch (value.trim().toLowerCase()) {
    case "complete": case "completed": case "filled": return "FILLED";
    case "partially_filled": case "partial": return "PARTIALLY_FILLED";
    case "cancelled": case "canceled": return "CANCELLED";
    case "rejected": return "REJECTED";
    case "pending": case "open": return "OPEN";
    default: return "PENDING";
  }
}

export const zebPayExecutionAdapter = new ZebPayExecutionAdapter();
