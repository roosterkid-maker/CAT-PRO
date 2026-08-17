import type {
  CandidateVerificationResult,
} from "../../candidates/services/OpportunityCandidateVerificationService";

import type {
  ExecutionResult,
} from "../../execution/models/ExecutionResult";

export type LiveFinalLastLookStatus =
  | "BLOCKED"
  | "PASSED";

export interface LiveFinalLastLookRequest {
  candidateKey: string;

  capital: number;
}

export interface LiveFinalLastLookPriceDrift {
  baselineBuyPrice: number;

  finalBuyPrice: number;

  buyAdverseDriftPercent: number;

  baselineSellPrice: number;

  finalSellPrice: number;

  sellAdverseDriftPercent: number;

  maximumObservedAdverseDriftPercent: number;

  maximumAllowedAdverseDriftPercent: number;

  acceptable: boolean;
}

export interface LiveFinalLastLookProfitRetention {
  baselineNetProfit: number;

  finalNetProfit: number;

  baselineNetProfitPercent: number;

  finalNetProfitPercent: number;

  retentionPercent: number;

  profitable: boolean;
}

export interface LiveFinalLastLookResult {
  generatedAt: number;

  version: "17.0";

  mode: "CONTROLLED_LIVE";

  status: LiveFinalLastLookStatus;

  passed: boolean;

  liveExecutionAllowed: false;

  liveOrderSubmissionAllowed: false;

  candidateKey: string;

  candidateId: string | null;

  capital: number;

  market: string | null;

  buyExchange: string | null;

  sellExchange: string | null;

  qualificationPassed: boolean;

  routeIdentityPassed: boolean;

  baselineVerification:
    CandidateVerificationResult | null;

  baselineExecution:
    ExecutionResult | null;

  finalVerification:
    CandidateVerificationResult | null;

  priceDrift:
    LiveFinalLastLookPriceDrift | null;

  finalExecution:
    ExecutionResult | null;

  profitRetention:
    LiveFinalLastLookProfitRetention | null;

  reasons: string[];

  startedAt: number;

  completedAt: number;
}