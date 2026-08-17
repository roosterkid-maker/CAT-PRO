import {
  api,
} from "@/api/client";

import type {
  FreshnessDiagnosticsResponse,
} from "../types/FreshnessDiagnostics";

export async function fetchFreshnessDiagnostics():
Promise<FreshnessDiagnosticsResponse> {
  const response =
    await api.get<FreshnessDiagnosticsResponse>(
      "/api/automation/bottleneck/freshness",
    );

  return response.data;
}