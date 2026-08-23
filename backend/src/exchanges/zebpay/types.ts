export interface ZebPayMarket {
  pair?: string;

  virtualCurrency?: string;

  currency?: string;

  market?: string | number;

  buy?: string | number | null;

  sell?: string | number | null;

  volumeEx?: string | number | null;

  volumeQt?: string | number | null;
}

export interface ZebPayTradePair {
  tradePairName?: string;

  tradeVolumeCurrency?: string;

  tradeDenominationCurrency?: string;

  makerFeesWithoutTax?: string | number | null;

  makerFeePercent?: string | number | null;

  takerFeesWithoutTax?: string | number | null;

  takerFeePercent?: string | number | null;

  tradeTickSize?: string | number | null;

  tradeMinimumAmount?: string | number | null;

  tradeMaximumAmount?: string | number | null;

  volumeCurrencyDecimalPlaces?: string | number | null;

  denominationCurrencyDecimalPlaces?: string | number | null;

  tradeCurrencyInputDecimalPlaces?: string | number | null;

  denominationCurrencyInputDecimalPlaces?: string | number | null;

  tickSize?: string | number | null;

  isEnable?: boolean | string | number | null;

  isMarketOrderEnabled?: boolean | string | number | null;

  sellMinQuantityPerTransaction?: string | number | null;
}

export interface ZebPayOrderBookLevel {
  price?: string | number | null;

  amount?: string | number | null;
}

export interface ZebPayOrderBook {
  pair?: string;

  asks?: ZebPayOrderBookLevel[];

  bids?: ZebPayOrderBookLevel[];
}

export interface ZebPayPublicEnvelope<T> {
  data: T;

  statusCode?: number;

  statusDescription?: string;
}
