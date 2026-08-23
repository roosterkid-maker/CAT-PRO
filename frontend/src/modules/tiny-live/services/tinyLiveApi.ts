import {
  api,
} from "@/api/client";

import type {
  TinyLiveCapabilityResponse,
  TinyLiveEvidenceArchiveResponse,
  TinyLiveEvidencePackageResponse,
  TinyLivePreflightRequest,
  TinyLivePreflightResponse,
  TinyLiveReadinessClosureResponse,
  StrategyOnePilotPreflightRunResponse,
  StrategyOnePilotPreviewResponse,
  StrategyOneTinyLivePreArmDiagnosticsResponse,
  StrategyOneTinyLivePreArmRecordResponse,
  StrategyOneTinyLiveAccountModeLeaseRecordResponse,
  StrategyOneTinyLiveOpportunityAuditResponse,
  StrategyOneTimingCalibrationDiagnosticsResponse,
  StrategyOneTimingCalibrationRecordResponse,
} from "../types/TinyLivePreflight";

export async function fetchTinyLiveCapability(): Promise<TinyLiveCapabilityResponse> {
  const response =
    await api.get<TinyLiveCapabilityResponse>(
      "/api/execution/tiny-live",
    );

  return response.data;
}

export async function runTinyLivePreflight(
  request:
    TinyLivePreflightRequest,
): Promise<TinyLivePreflightResponse> {
  const response =
    await api.post<TinyLivePreflightResponse>(
      "/api/execution/tiny-live/preflight",
      request,
      {
        validateStatus: (
          status,
        ) =>
          status === 200 ||
          status === 409,
      },
    );

  return response.data;
}

export async function fetchTinyLiveEvidencePackage(): Promise<TinyLiveEvidencePackageResponse> {
  const response =
    await api.get<TinyLiveEvidencePackageResponse>(
      "/api/execution/tiny-live/evidence-package",
    );

  return response.data;
}

export async function fetchTinyLiveEvidenceArchive(): Promise<TinyLiveEvidenceArchiveResponse> {
  const response =
    await api.get<TinyLiveEvidenceArchiveResponse>(
      "/api/execution/tiny-live/evidence-package/archive",
    );

  return response.data;
}

export async function fetchTinyLiveReadinessClosure(): Promise<TinyLiveReadinessClosureResponse> {
  const response =
    await api.get<TinyLiveReadinessClosureResponse>(
      "/api/execution/tiny-live/readiness-closure",
    );

  return response.data;
}

export async function sealTinyLiveEvidencePackage(): Promise<TinyLiveEvidencePackageResponse> {
  const response =
    await api.post<TinyLiveEvidencePackageResponse>(
      "/api/execution/tiny-live/evidence-package/seal",
      {
        confirmationToken:
          "SEAL_TINY_LIVE_EVIDENCE_ONLY",
      },
    );

  return response.data;
}

export async function fetchStrategyOnePilotPreview(): Promise<StrategyOnePilotPreviewResponse> {
  const response =
    await api.get<StrategyOnePilotPreviewResponse>(
      "/api/execution/tiny-live/strategy-one-pilot",
    );

  return response.data;
}

export async function runStrategyOnePilotPreflight(
  request: {
    confirmationToken: "RUN_STRATEGY_ONE_PILOT_PREFLIGHT_ONLY";
    expectedOpportunityId: string;
  },
): Promise<StrategyOnePilotPreflightRunResponse> {
  const response =
    await api.post<StrategyOnePilotPreflightRunResponse>(
      "/api/execution/tiny-live/strategy-one-pilot/preflight",
      request,
      {
        validateStatus:
          (status) =>
            status ===
              200 ||
            status ===
              409,
      },
    );

  return response.data;
}

export async function fetchStrategyOneTinyLivePreArm(): Promise<StrategyOneTinyLivePreArmDiagnosticsResponse> {
  const response = await api.get<StrategyOneTinyLivePreArmDiagnosticsResponse>(
    "/api/execution/tiny-live/strategy-one-pre-arm",
  );

  return response.data;
}

export async function fetchStrategyOneTinyLiveOpportunityAudit(): Promise<StrategyOneTinyLiveOpportunityAuditResponse> {
  const response = await api.get<StrategyOneTinyLiveOpportunityAuditResponse>(
    "/api/execution/tiny-live/strategy-one-opportunity-audit",
  );

  return response.data;
}

export async function fetchStrategyOneTimingCalibrations(): Promise<StrategyOneTimingCalibrationDiagnosticsResponse> {
  const response = await api.get<StrategyOneTimingCalibrationDiagnosticsResponse>(
    "/api/operator-settings/strategy-one-timing-calibration",
  );

  return response.data;
}

export async function proposeStrategyOneTimingCalibration(input: {
  routeKey: string;
  bootstrapAttempts: 2;
}): Promise<StrategyOneTimingCalibrationRecordResponse> {
  const response = await api.post<StrategyOneTimingCalibrationRecordResponse>(
    "/api/operator-settings/strategy-one-timing-calibration/propose",
    input,
  );

  return response.data;
}

export async function approveStrategyOneTimingCalibration(input: {
  id: string;
  confirmation: string;
}): Promise<StrategyOneTimingCalibrationRecordResponse> {
  const response = await api.put<StrategyOneTimingCalibrationRecordResponse>(
    `/api/operator-settings/strategy-one-timing-calibration/${encodeURIComponent(input.id)}/approve`,
    {confirmation: input.confirmation},
  );

  return response.data;
}

export async function armStrategyOneTinyLive(input: {
  market: string;
  buyExchange: string;
  sellExchange: string;
  confirmation: string;
  durationMinutes: number;
  maximumAttempts: 1 | 2 | 10;
  pilotBasketId?: "strategy-one-seven-coin-inventory-v1";
}): Promise<StrategyOneTinyLivePreArmRecordResponse> {
  const response = await api.post<StrategyOneTinyLivePreArmRecordResponse>(
    "/api/execution/tiny-live/strategy-one-pre-arm",
    input,
  );

  return response.data;
}

export async function disarmStrategyOneTinyLive(input: {
  preArmId: string;
  confirmation: string;
}): Promise<StrategyOneTinyLivePreArmRecordResponse> {
  const response = await api.post<StrategyOneTinyLivePreArmRecordResponse>(
    `/api/execution/tiny-live/strategy-one-pre-arm/${encodeURIComponent(input.preArmId)}/disarm`,
    {confirmation: input.confirmation},
  );

  return response.data;
}

export async function activateStrategyOneTinyLiveAccountLease(input: {
  preArmId: string;
  confirmation: string;
}): Promise<StrategyOneTinyLiveAccountModeLeaseRecordResponse> {
  const response = await api.post<StrategyOneTinyLiveAccountModeLeaseRecordResponse>(
    `/api/execution/tiny-live/strategy-one-account-mode-lease/${encodeURIComponent(input.preArmId)}/activate`,
    {confirmation: input.confirmation},
  );

  return response.data;
}

export async function restoreStrategyOnePaperAccountMode(input: {
  leaseId: string;
  confirmation: string;
}): Promise<StrategyOneTinyLiveAccountModeLeaseRecordResponse> {
  const response = await api.post<StrategyOneTinyLiveAccountModeLeaseRecordResponse>(
    `/api/execution/tiny-live/strategy-one-account-mode-lease/${encodeURIComponent(input.leaseId)}/restore`,
    {confirmation: input.confirmation},
  );

  return response.data;
}
