export interface CentralStrategyLiveReadinessResponse {
  success: true;
  data: {
    version: "82.0";
    generatedAt: number;
    mode: "EIGHT_STRATEGY_CONTROLLED_LIVE_PREPARATION_AUDIT";
    decision: "NO_GO";
    actualStrategyTarget: 8;
    registeredActualStrategies: number;
    paperAcceptedStrategies: number;
    architectureReadyStrategies: number;
    activationReviewOnlyStrategies: number;
    strategies: Array<{
      strategyId: string;
      strategyNumber: number;
      displayName: string;
      controllerRegistered: boolean;
      controllerRunning: boolean;
      paperEvidence: {accepted: boolean; closedCycles: number; state: "SOAK_ACCEPTED" | "SOAK_IN_PROGRESS" | "NO_DATA"};
      architectureReady: boolean;
      requirements: Array<{capability: string; available: boolean}>;
      state: "PAPER_PROOF_REQUIRED" | "ARCHITECTURE_BLOCKED" | "ACTIVATION_REVIEW_ONLY";
      blockers: string[];
      liveExecutionAllowed: false;
      orderSubmissionAllowed: false;
    }>;
    centralPaper: {state: string; blockers: string[]; lifecycleImplemented: boolean};
    adapters: {target: number; registered: number; readVerified: number; exchanges: Array<{
      exchange: string; adapterRegistered: boolean; verificationState: string; readOnlyVerificationFresh: boolean;
      liveExecutionEnabled: false; adapterConnected: boolean;
      capabilities: null | {products: Array<"SPOT" | "PERPETUAL">; supportsMarketOrders: boolean;
        supportsLimitOrders: boolean; supportsPostOnly: boolean; supportsOrderStatus: boolean;
        supportsCancellation: boolean; supportsAmendKeepPriority: boolean; supportsReduceOnly: boolean};
    }>};
    architecture: Record<string, boolean>;
    blockers: string[];
    safety: {readOnlyAudit: true; paperEvidenceDoesNotGrantLiveAuthority: true;
      authenticatedReadDoesNotGrantOrderAuthority: true; noAutomaticPromotion: true;
      liveExecutionAllowed: false; orderSubmissionAllowed: false; orderSubmissionPerformed: false};
  };
}
