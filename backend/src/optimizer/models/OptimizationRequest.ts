export interface OptimizationRequest {
  market: string;

  buyExchange: string;
  sellExchange: string;

  minimumCapital: number;

  maximumCapital: number;

  capitalStep: number;

  /** Converts account-side capital candidates into market-quote capital. */
  executionCapitalMultiplier?: number;

  executionCapitalCurrency?: string;
}
