import type {LiveExecutionAdapter, LiveExecutionAdapterCapabilities, LiveExecutionAdapterReadiness, LiveExecutionAdapterVerificationState} from "../contracts/LiveExecutionAdapter";
import type {LiveExecutionRequest} from "../models/LiveExecutionRequest";
import type {LiveExecutionResult} from "../models/LiveExecutionResult";

/* Least-ready first: the router must report the weaker of its two delegates. */
const VERIFICATION_STATE_RANK: Record<LiveExecutionAdapterVerificationState, number> = {
  NOT_CONFIGURED: 0,
  CONFIGURED_UNVERIFIED: 1,
  VERIFICATION_STALE: 2,
  VERIFIED: 3,
};

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
  validateNewSubmission(request: LiveExecutionRequest): void {
    const delegate = this.delegate(request.product ?? "SPOT");
    if (!delegate.validateNewSubmission) {
      throw new Error(`Pre-dispatch validation is unavailable for ${this.exchange} ${request.product ?? "SPOT"}.`);
    }
    delegate.validateNewSubmission(request);
  }
  getOrderStatus(orderId: string, market?: string, product: "SPOT" | "PERPETUAL" = "SPOT"): Promise<LiveExecutionResult> {
    return this.delegate(product).getOrderStatus(orderId, market, product);
  }
  cancelOrder(orderId: string, market?: string, product: "SPOT" | "PERPETUAL" = "SPOT"): Promise<LiveExecutionResult> {
    return this.delegate(product).cancelOrder(orderId, market, product);
  }
  /*
   * Must reflect BOTH delegates, not just SPOT - a caller routing a
   * PERPETUAL order relies on this to catch missing/unverified derivatives
   * credentials before dispatch, the same way getCapabilities() below
   * already combines both delegates rather than reporting just one.
   */
  getReadiness(): LiveExecutionAdapterReadiness {
    const spot = this.spot.getReadiness();
    const perpetual = this.perpetual.getReadiness();
    const weaker = VERIFICATION_STATE_RANK[spot.verificationState] <= VERIFICATION_STATE_RANK[perpetual.verificationState] ? spot : perpetual;
    return {
      credentialsConfigured: spot.credentialsConfigured && perpetual.credentialsConfigured,
      authenticationVerified: spot.authenticationVerified && perpetual.authenticationVerified,
      exchangeApiReachable: spot.exchangeApiReachable && perpetual.exchangeApiReachable,
      verificationState: weaker.verificationState,
      readOnlyVerificationFresh: spot.readOnlyVerificationFresh && perpetual.readOnlyVerificationFresh,
      lastVerifiedAt: spot.lastVerifiedAt === null || perpetual.lastVerifiedAt === null ? null : Math.min(spot.lastVerifiedAt, perpetual.lastVerifiedAt),
      lastVerificationAttemptAt: spot.lastVerificationAttemptAt === null ? perpetual.lastVerificationAttemptAt : perpetual.lastVerificationAttemptAt === null ? spot.lastVerificationAttemptAt : Math.max(spot.lastVerificationAttemptAt, perpetual.lastVerificationAttemptAt),
      verificationExpiresAt: spot.verificationExpiresAt === null || perpetual.verificationExpiresAt === null ? null : Math.min(spot.verificationExpiresAt, perpetual.verificationExpiresAt),
      verificationMethod: spot.verificationMethod === perpetual.verificationMethod ? spot.verificationMethod : null,
      lastVerificationError: weaker.lastVerificationError ?? (weaker === spot ? perpetual.lastVerificationError : spot.lastVerificationError),
    };
  }
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
