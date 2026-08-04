export interface OptimizationRequest {
  market: string;

  buyExchange: string;
  sellExchange: string;

  minimumCapital: number;

  maximumCapital: number;

  capitalStep: number;
}