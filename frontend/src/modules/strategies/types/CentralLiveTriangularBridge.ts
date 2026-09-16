export interface CentralLiveTriangularCandidate {
  plan: {
    id: string;
    strategyId: string;
    signalId: string;
    expiresAt: number;
    legs: Array<{
      id: string;
      exchange: string;
      market: string;
      side: "BUY" | "SELL";
      sequence: number;
    }>;
  };
  observedAt: number;
  ready: boolean;
  reasons: string[];
}

export interface CentralLiveTriangularOutcome {
  planId: string;
  observedAt: number;
  intakeState: "QUEUED" | "DUPLICATE" | "BLOCKED";
  reasons: string[];
}

interface JournalDiagnostics {
  records: number;
  persistence: {
    exists: boolean;
    writes: number;
    writeFailures: number;
    lastWriteAt: number | null;
    lastError: string | null;
  };
}

export interface CentralLiveTriangularDispatcher {
  compileTimeGateEnabled: boolean;
  dispatcherEnabled: boolean;
  production: {
    registeredCentralPatterns: number;
    expectedCentralPatterns: number;
    fullyWired: boolean;
  };
  admissionJournal: JournalDiagnostics & {eligible: number; blocked: number};
  queue: JournalDiagnostics & {
    states: {
      queued: number;
      leased: number;
      dispatching: number;
      completed: number;
      rejected: number;
      expired: number;
    };
  };
  outcomeJournal: JournalDiagnostics & {started: number; terminal: number; monitoring: number};
  dispatcher: {
    enabled: boolean;
    running: boolean;
    sharedRecoveryHalt: {haltedStrategyIds: string[]};
  };
  safety: {
    liveExecutionAllowed: boolean;
    orderSubmissionAllowed: boolean;
    productionOrderGatewayDefaultDisabled: boolean;
    defaultCompileTimeGateEnabled: boolean;
    defaultDispatcherEnabled: boolean;
    newLeasesBlockedForUnresolvedSharedRecovery: boolean;
  };
}

export interface CentralLiveTriangularBridgeState {
  generatedAt: number;
  running: boolean;
  latestCandidate: CentralLiveTriangularCandidate | null;
  recentOutcomes: CentralLiveTriangularOutcome[];
  dispatcher: CentralLiveTriangularDispatcher;
}

export interface CentralLiveOperatorArmRecord {
  armId: string;
  strategyId: string;
  armedAt: number;
  expiresAt: number;
  status: "ARMED" | "CLAIMED" | "EXPIRED";
  claimedByPlanId: string | null;
  claimedAt: number | null;
}

export interface CentralLiveTriangularArmStatus {
  generatedAt: number;
  strategyId: string;
  currentlyArmed: boolean;
  armedUntil: number | null;
  recent: CentralLiveOperatorArmRecord[];
  safety: {
    exactConfirmationPhraseRequired: boolean;
    singleUsePerArm: boolean;
    maximumArmWindowMs: number;
    operatorConfirmedTimestampNeverRegenerated: boolean;
  };
}

export interface CentralLiveTriangularBridgeReport {
  bridge: CentralLiveTriangularBridgeState;
  arm: CentralLiveTriangularArmStatus;
}

export interface CentralLiveTriangularBridgeResponse {
  success: true;
  data: CentralLiveTriangularBridgeReport;
}
