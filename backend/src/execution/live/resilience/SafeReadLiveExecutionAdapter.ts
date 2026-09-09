import type {
  LiveExecutionAdapter,
  LiveExecutionAdapterCapabilities,
  LiveExecutionAdapterReadiness,
} from "../contracts/LiveExecutionAdapter";

import type {
  LiveExecutionRequest,
} from "../models/LiveExecutionRequest";

import type {
  LiveExecutionResult,
} from "../models/LiveExecutionResult";

import {
  safeExchangeReadExecutor,
} from "./SafeExchangeReadExecutor";

export class SafeReadLiveExecutionAdapter
  implements LiveExecutionAdapter
{
  readonly exchange:
    string;

  constructor(
    private readonly delegate:
      LiveExecutionAdapter,
  ) {
    this.exchange =
      delegate.exchange;
  }

  execute(
    request:
      LiveExecutionRequest,
  ): Promise<LiveExecutionResult> {
    /*
     * MUTATING OPERATION.
     *
     * NEVER blindly retry an order submission.
     *
     * A network timeout does not prove that the
     * exchange failed to create the order.
     */
    return this.delegate
      .execute(
        request,
      );
  }

  validateNewSubmission(
    request: LiveExecutionRequest,
  ): void {
    if (!this.delegate.validateNewSubmission) {
      throw new Error(
        `Pre-dispatch validation is unavailable for ${this.exchange}.`,
      );
    }

    this.delegate.validateNewSubmission(request);
  }

  getOrderStatus(
    orderId:
      string,

    market?:
      string,

    product?:
      "SPOT" | "PERPETUAL",
  ): Promise<LiveExecutionResult> {
    /*
     * SAFE / IDEMPOTENT READ.
     *
     * Controlled retry is allowed.
     */
    return safeExchangeReadExecutor
      .execute({
        exchange:
          this.exchange,

        operation:
          "GET_ORDER_STATUS",

        run:
          () =>
            this.delegate
              .getOrderStatus(
                orderId,
                market,
                product,
              ),
      });
  }

  cancelOrder(
    orderId:
      string,

    market?:
      string,

    product?:
      "SPOT" | "PERPETUAL",
  ): Promise<LiveExecutionResult> {
    /*
     * MUTATING OPERATION.
     *
     * No automatic retry wrapper.
     */
    return this.delegate
      .cancelOrder(
        orderId,
        market,
        product,
      );
  }

  getReadiness():
    LiveExecutionAdapterReadiness {
    return this.delegate
      .getReadiness();
  }

  getCapabilities():
    LiveExecutionAdapterCapabilities {
    return this.delegate
      .getCapabilities();
  }
}
