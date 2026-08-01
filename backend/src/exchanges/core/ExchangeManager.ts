import type { ExchangeAdapter } from "./ExchangeAdapter";

export class ExchangeManager {
  private readonly adapters = new Map<string, ExchangeAdapter>();

  register(adapter: ExchangeAdapter): void {
    if (this.adapters.has(adapter.name)) {
      throw new Error(`Exchange already registered: ${adapter.name}`);
    }

    this.adapters.set(adapter.name, adapter);
  }

  get(name: string): ExchangeAdapter | undefined {
    return this.adapters.get(name);
  }

  getAll(): ExchangeAdapter[] {
    return Array.from(this.adapters.values());
  }

  async connectAll(): Promise<void> {
    const adapters = this.getAll();

    await Promise.all(
      adapters.map(async (adapter) => {
        try {
          await adapter.connect();
          console.log(`[ExchangeManager] Connected: ${adapter.name}`);
        } catch (error) {
          console.error(
            `[ExchangeManager] Failed to connect: ${adapter.name}`,
            error,
          );
        }
      }),
    );
  }

  async disconnectAll(): Promise<void> {
    const adapters = this.getAll();

    await Promise.all(
      adapters.map(async (adapter) => {
        try {
          await adapter.disconnect();
          console.log(`[ExchangeManager] Disconnected: ${adapter.name}`);
        } catch (error) {
          console.error(
            `[ExchangeManager] Failed to disconnect: ${adapter.name}`,
            error,
          );
        }
      }),
    );
  }
}

export const exchangeManager = new ExchangeManager();