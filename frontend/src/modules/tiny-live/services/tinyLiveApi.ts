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
