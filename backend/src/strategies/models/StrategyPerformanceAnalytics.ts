import type {
  StrategyEvidenceStatus,
} from "./StrategyEvidenceStatus";

import type {
  StrategyId,
} from "./StrategyMetadata";

export interface StrategyShadowPerformanceAnalytics {
  readonly evidenceStatus:
    StrategyEvidenceStatus;

  readonly totalRecords:
    number | null;

  readonly tracking:
    number | null;

  readonly completedOutcomes:
    number | null;

  readonly successfulOutcomes:
    number | null;

  readonly failedOutcomes:
    number | null;

  readonly dataUnavailableOutcomes:
    number | null;

  readonly successRatePercent:
    number | null;

  readonly averageProfitRetentionPercent:
    number | null;
}

export interface StrategyPaperPerformanceAnalytics {
  readonly evidenceStatus:
    StrategyEvidenceStatus;

  readonly totalTrades:
    number | null;

  readonly openTrades:
    number | null;

  readonly closedTrades:
    number | null;

  readonly winningTrades:
    number | null;

  readonly losingTrades:
    number | null;

  readonly winRatePercent:
    number | null;

  readonly netProfit:
    number | null;
}

export interface StrategyPerformanceAnalytics {
  readonly generatedAt:
    number;

  readonly strategyId:
    StrategyId;

  readonly evidenceStatus:
    StrategyEvidenceStatus;

  readonly shadow:
    StrategyShadowPerformanceAnalytics;

  readonly paper:
    StrategyPaperPerformanceAnalytics;

  readonly notes:
    readonly string[];
}
