export interface ExchangeHealth {
  name: string;
  connected: boolean;
}

export interface SystemHealthReport {
  timestamp: number;

  exchanges: ExchangeHealth[];

  cache: {
    cachedQuotes: number;
  };

  engine: {
    opportunities: number;
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