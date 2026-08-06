export interface TradingReadiness {
  ready: boolean;

  score: number;

  exchangeScore: number;

  marketScore: number;

  opportunityScore: number;

  diagnosticsScore: number;

  reasons: string[];
}