import {
  api,
} from "@/api/client";

import type {
  InrScannerResponse,
  LiveOnlyInventoryResponse,
  LiveOnlyRuntimeResponse,
  LiveTradesResponse,
} from "../types/LiveOnlyRuntime";

export async function fetchLiveOnlyRuntime(
  signal?: AbortSignal,
): Promise<LiveOnlyRuntimeResponse> {
  const response =
    await api.get<LiveOnlyRuntimeResponse>(
      "/api/live-only",
      {
        signal,
      },
    );

  return response.data;
}

export async function fetchLiveOnlyInventory(
  signal?: AbortSignal,
): Promise<LiveOnlyInventoryResponse> {
  const response =
    await api.get<LiveOnlyInventoryResponse>(
      "/api/live-only/inventory",
      {
        signal,
      },
    );

  return response.data;
}

export async function fetchInrScanner(
  signal?: AbortSignal,
): Promise<InrScannerResponse> {
  const response =
    await api.get<InrScannerResponse>(
      "/api/live-only/inr-scanner",
      {
        signal,
      },
    );

  return response.data;
}

export async function fetchLiveTrades(
  signal?: AbortSignal,
): Promise<LiveTradesResponse> {
  const response =
    await api.get<LiveTradesResponse>(
      "/api/live-only/live-trades",
      {
        signal,
      },
    );

  return response.data;
}
