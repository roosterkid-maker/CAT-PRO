export type CandidateLastLookStatus =
  | "CANDIDATE_NOT_FOUND"
  | "BASELINE_SIMULATION_FAILED"
  | "LAST_LOOK_VERIFICATION_FAILED"
  | "PRICE_DRIFT_EXCEEDED"
  | "INVALID_REPRICE_TARGET"
  | "FINAL_SIMULATION_FAILED"
  | "FINAL_SIMULATION_REJECTED"
  | "READY_FOR_PAPER_EXECUTION";

export interface CandidatePriceDrift {
  baselineBuyPrice: number;

  currentBuyPrice: number;

  buyAdverseDriftPercent: number;

  baselineSellPrice: number;

  currentSellPrice: number;

  sellAdverseDriftPercent: number;

  maximumObservedAdverseDriftPercent: number;

  maximumAllowedAdverseDriftPercent: number;

  acceptable: boolean;
}

export interface CandidateLastLookResult {
  status: CandidateLastLookStatus;

  candidateId: string;

  market: string | null;

  buyExchange: string | null;

  sellExchange: string | null;

  targetQuantity: number | null;

  priceDrift: CandidatePriceDrift | null;

  finalCapital: number | null;

  readyForPaperExecution: boolean;

  reasons: string[];

  startedAt: number;

  completedAt: number;
}

export interface CandidateLastLookResponse {
  success: boolean;

  data: CandidateLastLookResult;
}