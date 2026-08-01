export interface ExchangeFee {
  exchange: string;

  makerPercent: number;
  takerPercent: number;

  withdrawalFee?: number;
}

export type FeeRegistry = Record<string, ExchangeFee>;