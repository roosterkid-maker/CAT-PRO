import type {
  ExecutionHealthReport,
} from "@/modules/execution-monitoring/services/executionMonitoringApi";

import type {
  SystemHealthResponse,
} from "@/modules/system-health/types/SystemHealth";

import type {
  ExchangeClockSafetyResponse,
} from "./ExchangeClock";

import type {
  ExchangeFleetCapabilityResponse,
} from "./ExchangeFleet";

import type {
  PaperShadowReadinessResponse,
  ReadinessObservationResponse,
} from "./PaperShadowReadiness";

export interface ExchangeHealthEvidenceSource<T> {
  data: T | null;

  error: string | null;

  generatedAt: number | null;
}

export interface ExchangeHealthEvidenceSnapshot {
  version: "19.35";

  requestedAt: number;

  completedAt: number;

  requestDurationMs: number;

  sourceCount: 6;

  successfulSourceCount: number;

  sourceSkewMs: number | null;

  sources: {
    systemHealth:
      ExchangeHealthEvidenceSource<SystemHealthResponse>;

    executionHealth:
      ExchangeHealthEvidenceSource<ExecutionHealthReport>;

    clockSafety:
      ExchangeHealthEvidenceSource<ExchangeClockSafetyResponse>;

    fleetCapabilities:
      ExchangeHealthEvidenceSource<ExchangeFleetCapabilityResponse>;

    paperShadowReadiness:
      ExchangeHealthEvidenceSource<PaperShadowReadinessResponse>;

    readinessObservations:
      ExchangeHealthEvidenceSource<ReadinessObservationResponse>;
  };
}
