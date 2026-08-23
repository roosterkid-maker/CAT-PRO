import {
  api,
} from "@/api/client";

import type {
  FreshnessDiagnosticsResponse,
} from "../types/FreshnessDiagnostics";

export async function fetchFreshnessDiagnostics(
  signal?: AbortSignal,
):
Promise<FreshnessDiagnosticsResponse> {
  const response =
    await api.get<FreshnessDiagnosticsResponse>(
      "/api/automation/bottleneck/freshness",
      {
        signal,
      },
    );

  return response.data;
}
