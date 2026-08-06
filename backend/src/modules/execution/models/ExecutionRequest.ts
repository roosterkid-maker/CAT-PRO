export interface ExecutionRequest {
  tradeId: string;

  market: string;

  capital: number;

  buyExchange: string;

  sellExchange: string;
}