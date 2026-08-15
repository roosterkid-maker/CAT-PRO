import type {
  StrategyAttribution,
} from "../../strategies/models/StrategyAttribution";

export type MonitoredCandidateStatus =
  | "ACTIVE"
  | "DISAPPEARED";

export interface MonitoredOpportunityCandidate {
  strategyAttribution: StrategyAttribution;

  key: string;

  market: string;

  buyExchange: string;

  sellExchange: string;

  status: MonitoredCandidateStatus;

  latestOpportunityId: string;

  firstSeenAt: number;

  lastSeenAt: number;

  disappearedAt: number | null;

  lifetimeMs: number;

  totalObservations: number;

  consecutiveObservations: number;

  missedSnapshots: number;

  reappearances: number;

  latest: {
    buyPrice: number;

    sellPrice: number;

    executableQuantity: number;

    netProfit: number;

    netProfitPercent: number;

    estimatedFees: number;

    rawSpread: number;

    rawSpreadPercent: number;

    liquidityScore: number;

    freshnessScore: number;

    requestedCapitalInr?: number;

    quoteAsset?: string;

    requestedQuoteCapital?: number;

    opportunityTimestamp: number;
  };

  best: {
    netProfit: number;

    netProfitPercent: number;

    observedAt: number;

    opportunityId: string;
  };
}

export interface OpportunityMonitorDiagnostics {
  generatedAt: number;

  processedSnapshots: number;

  lastProcessedSnapshotAt: number | null;

  totalCandidatesCreated: number;

  activeCandidates: number;

  disappearedCandidates: number;

  totalReappearances: number;

  duplicateObservationsCollapsed: number;

  candidates: MonitoredOpportunityCandidate[];
}
