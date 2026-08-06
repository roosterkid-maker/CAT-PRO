import type { OpportunityDiagnostics } from "../arbitrage/engines/OpportunityEngine";

import type { TradingReadiness } from "./models/TradingReadiness";

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

    quotesByExchange:
      ExchangeQuoteCount[];
  };

  engine: {
    markets: number;

    sharedMarkets: number;

    generatedPairs: number;

    opportunities: number;

    diagnostics:
      OpportunityDiagnostics;
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