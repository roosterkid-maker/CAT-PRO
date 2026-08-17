import {
  api,
} from "@/api/client";

import type {
  ExchangeClockSafetyResponse,
  ExchangeClockSynchronizationResponse,
} from "../types/ExchangeClock";

import type {
  ExchangeFleetCapabilityResponse,
} from "../types/ExchangeFleet";

import type {
  PaperShadowReadinessResponse,
  ReadinessObservationResponse,
} from "../types/PaperShadowReadiness";

export async function fetchExchangeClockSafety(
  signal?: AbortSignal,
): Promise<ExchangeClockSafetyResponse> {
  const response =
    await api.get<ExchangeClockSafetyResponse>(
      "/api/execution/clock",
      {
        signal,
      },
    );

  return response.data;
}

export async function synchronizeExchangeClocks(
  signal?: AbortSignal,
): Promise<ExchangeClockSynchronizationResponse> {
  const response =
    await api.post<ExchangeClockSynchronizationResponse>(
      "/api/execution/clock/synchronize",
      undefined,
      {
        signal,
      },
    );

  return response.data;
}

export async function fetchExchangeFleetCapabilities(
  signal?: AbortSignal,
): Promise<ExchangeFleetCapabilityResponse> {
  const response =
    await api.get<ExchangeFleetCapabilityResponse>(
      "/api/exchanges/fleet",
      {
        signal,
      },
    );

  return response.data;
}

export async function fetchPaperShadowReadiness(
  signal?: AbortSignal,
): Promise<PaperShadowReadinessResponse> {
  const response =
    await api.get<PaperShadowReadinessResponse>(
      "/api/exchanges/paper-shadow-readiness",
      {
        signal,
      },
    );

  return response.data;
}

export async function fetchReadinessObservations(
  signal?: AbortSignal,
): Promise<ReadinessObservationResponse> {
  const response =
    await api.get<ReadinessObservationResponse>(
      "/api/exchanges/readiness-observations",
      {
        signal,
      },
    );

  return response.data;
}
