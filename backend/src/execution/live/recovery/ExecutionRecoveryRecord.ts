export type ExecutionRecoverySeverity =
  | "INFO"
  | "WARNING"
  | "CRITICAL";

export type ExecutionExposureDirection =
  | "BALANCED"
  | "LONG"
  | "SHORT";

export type ExecutionRecoveryStrategy =
  | "NONE"
  | "WAIT_FOR_COUNTER_LEG"
  | "RETRY_COUNTER_LEG"
  | "EMERGENCY_EXIT"
  | "MANUAL_INTERVENTION";

export type ExecutionRecoveryIncidentStatus =
  | "OPEN"
  | "ACKNOWLEDGED"
  | "RESOLVED";

export interface ExecutionRecoveryIncident {
  id: string;

  sessionId: string;

  planId: string;

  market: string;

  buyExchange: string;

  sellExchange: string;

  status: ExecutionRecoveryIncidentStatus;

  severity: ExecutionRecoverySeverity;

  strategy: ExecutionRecoveryStrategy;

  exposureDirection: ExecutionExposureDirection;

  boughtQuantity: number;

  soldQuantity: number;

  exposedQuantity: number;

  estimatedExposureNotional: number | null;

  buyLifecycleStatus: string | null;

  sellLifecycleStatus: string | null;

  buyOrderLifecycleId: string | null;

  sellOrderLifecycleId: string | null;

  reason: string;

  createdAt: number;

  updatedAt: number;

  acknowledgedAt: number | null;

  resolvedAt: number | null;

  resolutionNote: string | null;
}

export interface ExecutionRecoveryEvaluation {
  sessionId: string;

  requiresRecovery: boolean;

  exposureDirection: ExecutionExposureDirection;

  boughtQuantity: number;

  soldQuantity: number;

  exposedQuantity: number;

  strategy: ExecutionRecoveryStrategy;

  severity: ExecutionRecoverySeverity;

  reason: string;

  incident: ExecutionRecoveryIncident | null;
}

export interface ExecutionRecoveryDiagnostics {
  generatedAt: number;

  running: boolean;

  scanIntervalMs: number;

  lastScanAt: number | null;

  scans: number;

  sessionsEvaluated: number;

  balancedSessions: number;

  recoveryDetections: number;

  openIncidents: number;

  acknowledgedIncidents: number;

  resolvedIncidents: number;

  criticalIncidents: number;

  warningIncidents: number;

  emergencyExitRecommendations: number;

  retryRecommendations: number;

  waitRecommendations: number;

  manualInterventionRecommendations: number;

  automaticEmergencySubmissionEnabled: false;

  incidents: ExecutionRecoveryIncident[];
}