export type StatisticalResearchState =
  | "PROMOTED"
  | "COLLECTING_HISTORY"
  | "REJECTED";

export type StatisticalPromotionLifecycleState =
  | "COLLECTING_HISTORY"
  | "PROMOTION_PENDING"
  | "PROMOTED"
  | "DEMOTION_PENDING"
  | "REJECTED";

export type StatisticalRegime =
  | "STABLE_CORRELATED"
  | "HIGH_VOLATILITY"
  | "CORRELATION_BREAKDOWN"
  | "INSUFFICIENT_DATA";

export interface StatisticalResearchCandidate {
  pairId: string;
  exchange: string;
  leftMarket: string;
  rightMarket: string;
  state: StatisticalResearchState;
  qualificationState: StatisticalResearchState;
  lifecycle: {
    state: StatisticalPromotionLifecycleState;
    qualificationState: StatisticalResearchState;
    publishedState: StatisticalResearchState;
    consecutivePromotionPasses: number;
    consecutiveDemotionFailures: number;
    promotionConfirmationsRequired: number;
    demotionConfirmationsRequired: number;
    firstObservedAt: number;
    stateChangedAt: number;
    lastEvaluatedAt: number;
    lastTransitionReason: string;
    signalEligible: boolean;
    blockers: string[];
  };
  seeded: boolean;
  liquidityFloorQuote: number;
  sampleCount: number;
  returnCorrelation: number | null;
  walkForwardPassed: boolean;
  regimeAdmitted: boolean;
  outOfSampleTrades: number;
  outOfSampleNetPercent: number | null;
  maximumDrawdownPercent: number | null;
  rankScore: number | null;
  blockers: string[];
  walkForward: {
    evidenceStatus: "AVAILABLE" | "INSUFFICIENT_DATA" | "NO_DATA";
    validationPassed: boolean;
    sampleCount: number;
    folds: Array<{
      fold: number;
      trainingSamples: number;
      testSamples: number;
      trades: number;
      wins: number;
      netReturnPercent: number;
      maximumDrawdownPercent: number;
      noLookaheadLeakage: true;
    }>;
    summary: {
      completedFolds: number;
      totalTrades: number;
      wins: number;
      winRatePercent: number | null;
      grossReturnPercent: number | null;
      netReturnPercent: number | null;
      maximumDrawdownPercent: number | null;
    };
    blockers: string[];
    safety: {
      expandingWindow: true;
      outOfSampleOnly: true;
      costsApplied: true;
      safetyBufferApplied: true;
      liveExecutionAllowed: false;
      orderSubmissionAllowed: false;
    };
  };
  regime: {
    regime: StatisticalRegime;
    sampleCount: number;
    returnCorrelation: number | null;
    averageLegVolatilityPercent: number | null;
    livePromotionAuthorized: false;
  };
}

export interface StatisticalResearchRequirements {
  maximumMarketsPerExchange: number;
  maximumCandidatePairs: number;
  maximumSelectedPairs: number;
  minimumRegimeSamples: number;
  minimumAbsoluteRegimeCorrelation: number;
  highVolatilityPercent: number;
  minimumTrainingSamples: number;
  testSamplesPerFold: number;
  minimumFolds: number;
  minimumSamplesForFirstFold: number;
  minimumSamplesForRequiredFolds: number;
  minimumOutOfSampleTrades: number;
  minimumNetPercent: number;
  maximumDrawdownPercent: number;
}

export interface StatisticalResearchEvidenceResponse {
  success: boolean;
  data: {
    generatedAt: number;
    version: "35.0";
    discovery: {
      generatedAt: number;
      sourceSnapshotGeneratedAt: number;
      version: "35.0";
      eligibleMarkets: number;
      candidatePairs: number;
      promotedPairs: number;
      collectingPairs: number;
      rejectedPairs: number;
      requirements: StatisticalResearchRequirements;
      selectedPairs: Array<{
        pairId: string;
        exchange: string;
        leftMarket: string;
        rightMarket: string;
      }>;
      signalEligiblePairs: Array<{
        pairId: string;
        exchange: string;
        leftMarket: string;
        rightMarket: string;
      }>;
      rankings: StatisticalResearchCandidate[];
      safety: {
        boundedUniverse: true;
        sameExchangeOnly: true;
        sameSettlementAssetOnly: true;
        stickyCandidateUniverse: true;
        futureEvidenceRejected: true;
        explicitCostsRequired: true;
        promotionHysteresisRequired: true;
        demotionBlocksSignalsImmediately: true;
        lifecyclePersistent: true;
        signalsRequireConfirmedPromotion: true;
        thresholdsRelaxed: false;
        paperExecutionAllowed: false;
        liveExecutionAllowed: false;
        orderSubmissionAllowed: false;
      };
    } | null;
    promotionLifecycle: {
      generatedAt: number;
      version: "35.0";
      configuration: {
        promotionConfirmationsRequired: number;
        demotionConfirmationsRequired: number;
        maximumTrackedPairs: number;
        maximumTransitions: number;
      };
      summary: {
        trackedPairs: number;
        promotionPending: number;
        promoted: number;
        demotionPending: number;
        rejected: number;
        signalEligible: number;
        transitionsRetained: number;
      };
      records: Array<{
        pairId: string;
        exchange: string;
        leftMarket: string;
        rightMarket: string;
        state: StatisticalPromotionLifecycleState;
        qualificationState: StatisticalResearchState;
        consecutivePromotionPasses: number;
        consecutiveDemotionFailures: number;
        firstObservedAt: number;
        stateChangedAt: number;
        lastEvaluatedAt: number;
        lastTransitionReason: string;
        publishedState: StatisticalResearchState;
        signalEligible: boolean;
      }>;
      transitions: Array<{
        id: string;
        pairId: string;
        exchange: string;
        previousState: StatisticalPromotionLifecycleState | null;
        nextState: StatisticalPromotionLifecycleState;
        qualificationState: StatisticalResearchState;
        occurredAt: number;
        reason: string;
      }>;
      persistence: {
        restoreStatus: "AVAILABLE" | "NO_DATA" | "FAILED";
        restoredAt: number | null;
        writes: number;
        writeFailures: number;
        lastPersistedAt: number | null;
        lastError: string | null;
        activeFile: string;
        rotations: number;
        archivesPruned: number;
      };
      safety: {
        consecutivePromotionRequired: true;
        demotionBlocksSignalsImmediately: true;
        transitionsPersistent: true;
        thresholdsRelaxed: false;
        paperExecutionAllowed: false;
        liveExecutionAllowed: false;
        orderSubmissionAllowed: false;
      };
    };
    history: {
      running: boolean;
      restoreStatus: "AVAILABLE" | "NO_DATA" | "FAILED";
      pairCount: number;
      totalSamples: number;
      maximumSamplesPerPair: number;
      maximumTrackedPairs: number;
      pairEvictions: number;
      writes: number;
      writeFailures: number;
    };
    safety: {
      researchReadOnly: true;
      costsRequired: true;
      livePromotionAuthorized: false;
      paperExecutionAllowed: false;
      liveExecutionAllowed: false;
      orderSubmissionAllowed: false;
    };
  };
}
