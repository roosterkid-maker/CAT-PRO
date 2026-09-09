export interface GiottusTicker {
  symbol?: string;
  lastPrice?: string | number | null;
  high?: string | number | null;
  low?: string | number | null;
  volume?: string | number | null;
  change_24h?: string | number | null;
  time?: string | number | null;
}

export type GiottusOrderBookLevel = readonly [
  string | number,
  string | number,
];

export interface GiottusOrderBook {
  bids?: GiottusOrderBookLevel[];
  asks?: GiottusOrderBookLevel[];
}
