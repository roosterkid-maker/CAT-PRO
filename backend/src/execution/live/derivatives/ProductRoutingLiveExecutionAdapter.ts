import type {LiveExecutionAdapter, LiveExecutionAdapterCapabilities, LiveExecutionAdapterReadiness} from "../contracts/LiveExecutionAdapter";
import type {LiveExecutionRequest} from "../models/LiveExecutionRequest";
import type {LiveExecutionResult} from "../models/LiveExecutionResult";

/** One exchange owner with explicit SPOT/PERPETUAL routing and no fallback. */
export class ProductRoutingLiveExecutionAdapter implements LiveExecutionAdapter {
  readonly exchange: string;
  constructor(private readonly spot: LiveExecutionAdapter, private readonly perpetual: LiveExecutionAdapter) {
    if (spot.exchange.trim().toLowerCase() !== perpetual.exchange.trim().toLowerCase()) {
      throw new Error("Product router delegates must own the same exchange.");
    }
    this.exchange = spot.exchange.trim().toLowerCase();
    if (!spot.getCapabilities().products.includes("SPOT") || !perpetual.getCapabilities().products.includes("PERPETUAL")) {
      throw new Error("Product router requires exact SPOT and PERPETUAL delegates.");
    }
  }
  execute(request: LiveExecutionRequest): Promise<LiveExecutionResult> {
    return this.delegate(request.product ?? "SPOT").execute(request);
  }
  getOrderStatus(orderId: string, market?: string, product: "SPOT" | "PERPETUAL" = "SPOT"): Promise<LiveExecutionResult> {
    return this.delegate(product).getOrderStatus(orderId, market, product);
  }
  cancelOrder(orderId: string, market?: string, product: "SPOT" | "PERPETUAL" = "SPOT"): Promise<LiveExecutionResult> {
    return this.delegate(product).cancelOrder(orderId, market, product);
  }
  getReadiness(): LiveExecutionAdapterReadiness { return this.spot.getReadiness(); }
  getCapabilities(): LiveExecutionAdapterCapabilities {
    const spot = this.spot.getCapabilities(); const perpetual = this.perpetual.getCapabilities();
    return {products: ["SPOT", "PERPETUAL"], supportsMarketOrders: spot.supportsMarketOrders && perpetual.supportsMarketOrders,
      supportsLimitOrders: spot.supportsLimitOrders && perpetual.supportsLimitOrders,
      supportsPostOnly: spot.supportsPostOnly, supportsOrderStatus: spot.supportsOrderStatus && perpetual.supportsOrderStatus,
      supportsCancellation: spot.supportsCancellation && perpetual.supportsCancellation,
      supportsAmendKeepPriority: spot.supportsAmendKeepPriority && perpetual.supportsAmendKeepPriority,
      supportsReduceOnly: perpetual.supportsReduceOnly};
  }
  private delegate(product: "SPOT" | "PERPETUAL"): LiveExecutionAdapter {
    if (product === "SPOT") return this.spot;
    if (product === "PERPETUAL") return this.perpetual;
    throw new Error(`Unsupported execution product: ${String(product)}`);
  }
}
