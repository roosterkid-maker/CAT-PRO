import type {
  ProductionSafetyDiagnostics,
} from "./ProductionSafety";

export type ControlledLiveFrameworkStatus =
  | "LOCKED"
  | "FOUNDATION_READY";

export type ControlledLiveGateState =
  | "PASS"
  | "BLOCKED"
  | "PENDING_CANDIDATE"
  | "NOT_IMPLEMENTED";

export interface ControlledLiveGate {
  key: string;

  state: ControlledLiveGateState;

  required: boolean;

  message: string;
}

export interface ControlledLiveAdapterStatus {
  exchange: string;

  adapterRegistered: boolean;

  adapterConnected: boolean;
}

export interface ControlledLiveTradingDiagnostics {
  generatedAt: number;

  version: "17.0";

  mode: "CONTROLLED_LIVE";

  status: ControlledLiveFrameworkStatus;

  liveExecutionAllowed: false;

  liveOrderSubmissionAllowed: false;

  liveArmEndpointAvailable: false;

  safety: {
    defaultOff: true;

    readOnlyControlPlane: true;

    explicitGlobalConfirmationRequired: true;

    explicitSessionConfirmationRequired: true;

    automaticCapitalScalingAllowed: false;

    maximumInitialValidationCapital: number;
  };

  evidence: {
    shadowReadinessLevel: string;

    shadowReadinessScore: number;

    shadowCompletedOutcomes: number;

    shadowMinimumCompletedOutcomes: number;

    paperTrades: number;

    paperNetProfit: number;

    paperWinRatePercent: number;

    accountingIntegrityPassed: boolean;
  };

  account: {
    mode: string;

    enabled: boolean;

    emergencyStop: boolean;

    availableCapital: number;

    todayLoss: number;

    tradesToday: number;
  };

  productionSafety:
    ProductionSafetyDiagnostics;

  coordinator: {
    globalLiveConfirmationPresent: boolean;

    activeSessions: number;

    readySessions: number;

    runningSessions: number;

    activeLocks: number;
  };

  adapters: ControlledLiveAdapterStatus[];

  gates: ControlledLiveGate[];

  blockers: string[];
}