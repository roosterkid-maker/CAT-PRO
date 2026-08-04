export interface ExchangeHealth {
  name: string;
  connected: boolean;
}

export interface ExchangeQuoteCount {
  exchange: string;
  totalQuotes: number;
  executableQuotes: number;
}

export interface SystemHealthReport {
  timestamp: number;

  exchanges: ExchangeHealth[];

  cache: {
    cachedQuotes: number;
    executableQuotes: number;
    quotesByExchange: ExchangeQuoteCount[];
  };

  engine: {
    markets: number;
    sharedMarkets: number;
    generatedPairs: number;
    opportunities: number;
    diagnostics: {
  evaluated: number;
  evaluatorRejected: number;
  invalidMarketData: number;
  spreadRejected: number;
  netProfitRejected: number;
  quantityRejected: number;
  liquidityRejected: number;
  freshnessRejected: number;
  feeRejected: number;
  spreadAnalysisRejected: number;
  accepted: number;
};
  };

  process: {
    uptimeSeconds: number;

    memory: {
      rss: number;
      heapUsed: number;
      heapTotal: number;
    };
  };
}