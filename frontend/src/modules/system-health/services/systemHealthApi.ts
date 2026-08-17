import {
  api,
} from "@/api/client";

import type {
  SystemHealthResponse,
} from "../types/SystemHealth";

export async function fetchSystemHealth(
  signal?: AbortSignal,
): Promise<SystemHealthResponse> {
  const response =
    await api.get<SystemHealthResponse>(
      "/api/system-health",
      {
        signal,
      },
    );

  return response.data;
}
