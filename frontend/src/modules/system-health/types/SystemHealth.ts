export interface ExchangeHealth {
  name: string;
  connected: boolean;
}

export interface SystemHealth {
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

export interface SystemHealthResponse {
  success: boolean;
  data: SystemHealth;
}