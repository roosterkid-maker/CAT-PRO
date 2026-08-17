import type { NormalizedTicker } from "../coindcx/types";

export interface ExchangeAdapter {
  readonly name: string;

  connect(): Promise<void>;

  disconnect(): Promise<void>;

  subscribe(markets: string[]): Promise<void>;

  unsubscribe(markets: string[]): Promise<void>;

  isConnected(): boolean;

  getMarketCount(): number;

  getLastUpdate(): number;

  onTicker(
    callback: (ticker: NormalizedTicker) => void,
  ): void;
}