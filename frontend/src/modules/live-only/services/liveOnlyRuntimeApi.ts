import {
  api,
} from "@/api/client";

import type {
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
