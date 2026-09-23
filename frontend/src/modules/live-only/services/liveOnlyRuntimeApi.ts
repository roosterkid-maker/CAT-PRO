import {
  api,
} from "@/api/client";

import type {
  LiveOnlyInventoryResponse,
  LiveOnlyRuntimeResponse,
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
