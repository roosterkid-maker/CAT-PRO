import type { OrderBookAdapter } from "./OrderBookAdapter";

export class OrderBookManager {
  private readonly adapters =
    new Map<
      string,
      OrderBookAdapter
    >();

  register(
    adapter: OrderBookAdapter,
  ): void {
    this.adapters.set(
      adapter.exchange,
      adapter,
    );
  }

  get(
    exchange: string,
  ): OrderBookAdapter | null {
    return (
      this.adapters.get(
        exchange,
      ) ?? null
    );
  }

  getAll(): OrderBookAdapter[] {
    return [
      ...this.adapters.values(),
    ];
  }

  async connectAll(): Promise<void> {
    for (const adapter of this.getAll()) {
      await adapter.connect();
    }
  }

  async disconnectAll(): Promise<void> {
    for (const adapter of this.getAll()) {
      await adapter.disconnect();
    }
  }
}

export const orderBookManager =
  new OrderBookManager();