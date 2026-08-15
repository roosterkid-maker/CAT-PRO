import type {
  LiveExecutionRequest,
} from "../models/LiveExecutionRequest";

import type {
  LiveExecutionResult,
} from "../models/LiveExecutionResult";

export type LiveExecutionAdapterVerificationState =
  | "NOT_CONFIGURED"
  | "CONFIGURED_UNVERIFIED"
  | "VERIFICATION_STALE"
  | "VERIFIED";

export type LiveExecutionAdapterVerificationMethod =
  | "SIGNED_BALANCE_READ"
  | "SIGNED_FEE_READ"
  | "TOKEN_BALANCE_READ"
  | "TOKEN_ACCOUNT_STATUS_READ";

export interface LiveExecutionAdapterReadiness {
  credentialsConfigured: boolean;

  authenticationVerified: boolean;

  exchangeApiReachable: boolean;

  verificationState:
    LiveExecutionAdapterVerificationState;

  readOnlyVerificationFresh:
    boolean;

  lastVerifiedAt:
    | number
    | null;

  lastVerificationAttemptAt:
    | number
    | null;

  verificationExpiresAt:
    | number
    | null;

  verificationMethod:
    | LiveExecutionAdapterVerificationMethod
    | null;

  lastVerificationError:
    | string
    | null;
}

export interface LiveExecutionAdapterCapabilities {
  readonly products: readonly ("SPOT" | "PERPETUAL")[];
  readonly supportsMarketOrders: boolean;
  readonly supportsLimitOrders: boolean;
  readonly supportsPostOnly: boolean;
  readonly supportsOrderStatus: boolean;
  readonly supportsCancellation: boolean;
  readonly supportsAmendKeepPriority: boolean;
  readonly supportsReduceOnly: boolean;
}

export interface LiveExecutionAdapter {
  readonly exchange: string;

  getCapabilities(): LiveExecutionAdapterCapabilities;

  execute(
    request: LiveExecutionRequest,
  ): Promise<LiveExecutionResult>;

  getOrderStatus(
    orderId: string,
    market?: string,
    product?: "SPOT" | "PERPETUAL",
  ): Promise<LiveExecutionResult>;

  cancelOrder(
    orderId: string,
    market?: string,
    product?: "SPOT" | "PERPETUAL",
  ): Promise<LiveExecutionResult>;

  getReadiness():
    LiveExecutionAdapterReadiness;
}
