export interface ExchangeHealth {
  name: string;
  connected: boolean;
}

export interface ExchangeQuoteCount {
  exchange: string;
  totalQuotes: number;
  quoteBookTargets: number;
  executableQuotes: number;
}

export interface TradingReadiness {
  ready: boolean;

  score: number;

  exchangeScore: number;

  marketScore: number;

  opportunityScore: number;

  diagnosticsScore: number;

  reasons: string[];
}

export interface SystemHealth {
  timestamp: number;

  exchanges: ExchangeHealth[];

  cache: {
    cachedQuotes: number;

    executableQuotes: number;

    quotesByExchange:
      ExchangeQuoteCount[];
  };

  engine: {
    markets: number;

    sharedMarkets: number;

    generatedPairs: number;

    opportunities: number;

    diagnostics: unknown;
  };

  process: {
    uptimeSeconds: number;

    memory: {
      rss: number;

      heapUsed: number;

      heapTotal: number;
    };
  };

  trading: TradingReadiness;
}

export interface SystemHealthResponse {
  success: boolean;

  data: SystemHealth;
}
