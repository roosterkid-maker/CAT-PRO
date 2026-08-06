import {
  coinDCXExecutionAdapter,
} from "./adapters/CoinDCXExecutionAdapter";

import type {
  LiveExecutionAdapter,
} from "./contracts/LiveExecutionAdapter";

export class LiveExecutionService {
  private readonly adapters =
    new Map<
      string,
      LiveExecutionAdapter
    >();

  register(
    adapter: LiveExecutionAdapter,
  ): void {
    this.adapters.set(
      adapter.exchange
        .trim()
        .toLowerCase(),
      adapter,
    );
  }
  constructor() {
  this.register(
    coinDCXExecutionAdapter,
  );
}

  getAdapter(
    exchange: string,
  ): LiveExecutionAdapter {
    const adapter =
      this.adapters.get(
        exchange
          .trim()
          .toLowerCase(),
      );

    if (!adapter) {
      throw new Error(
        `Live execution adapter not found for exchange: ${exchange}`,
      );
    }

    return adapter;
  }

  hasAdapter(
    exchange: string,
  ): boolean {
    return this.adapters.has(
      exchange
        .trim()
        .toLowerCase(),
    );
  }

  clear(): void {
    this.adapters.clear();
  }

  size(): number {
    return this.adapters.size;
  }
}

export const liveExecutionService =
  new LiveExecutionService();