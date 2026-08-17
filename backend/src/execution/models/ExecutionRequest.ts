export interface ExecutionRequest {
  market: string;

  buyExchange: string;
  sellExchange: string;

  capital: number;

  buyOrderBookLevels?: number;

  sellOrderBookLevels?: number;
}