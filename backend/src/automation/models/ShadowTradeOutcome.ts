import type {
  StrategyAttribution,
} from "../../strategies/models/StrategyAttribution";

export type ShadowTradeOutcomeStatus =
  | "TRACKING"
  | "SUCCESS"
  | "FAILED"
  | "DATA_UNAVAILABLE";

export interface ShadowTradeOutcomeSample {
  sequence: number;

  observedAt: number;

  buyBookAgeMs: number | null;

  sellBookAgeMs: number | null;

  booksFresh: boolean;

  buyFillPercent: number;

  sellFillPercent: number;

  fullyExecutable: boolean;

  buyVWAP: number | null;

  sellVWAP: number | null;

  buyNotional: number | null;

  sellNotional: number | null;

  grossProfit: number | null;

  buyFee: number | null;

  sellFee: number | null;

  totalFees: number | null;

  netProfit: number | null;

  netProfitPercent: number | null;

  profitable: boolean;

  profitRetentionPercent: number | null;

  reason: string;
}

export interface ShadowTradeOutcomeRecord {
  strategyAttribution: StrategyAttribution;

  id: string;

  shadowDispatchId: string;

  candidateGeneration: string;

  candidateKey: string;

  market: string;

  buyExchange: string;

  sellExchange: string;

  status: ShadowTradeOutcomeStatus;

  dispatchedAt: number;

  trackingStartedAt: number;

  deadlineAt: number;

  completedAt: number | null;

  executableQuantity: number;

  predicted: {
    buyPrice: number;

    sellPrice: number;

    netProfitPerUnit: number;

    netProfitPercent: number;

    expectedTotalNetProfit: number;
  };

  samples: ShadowTradeOutcomeSample[];

  totalSamples: number;

  freshSamples: number;

  executableSamples: number;

  profitableSamples: number;

  bestObservedNetProfit: number | null;

  worstObservedNetProfit: number | null;

  averageObservedNetProfit: number | null;

  finalReason: string | null;
}

export interface ShadowTradeOutcomeConfig {
  trackingWindowMs: number;

  maximumBookAgeMs: number;

  minimumProfitableSamples: number;

  minimumProfitRetentionPercent: number;

  maximumHistory: number;
}

export interface ShadowTradeOutcomeDiagnostics {
  generatedAt: number;

  mode: "SHADOW";

  executionAllowed: false;

  config: ShadowTradeOutcomeConfig;

  trackedDispatches: number;

  tracking: number;

  success: number;

  failed: number;

  dataUnavailable: number;

  totalSamples: number;

  profitableSamples: number;

  executableSamples: number;

  averageSuccessNetProfit: number;

  records: ShadowTradeOutcomeRecord[];
}
