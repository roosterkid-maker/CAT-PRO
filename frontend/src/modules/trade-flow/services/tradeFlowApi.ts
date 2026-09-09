import { api } from "@/api/client";

import type { LiveOnlyIntelligenceResponse } from "../types/TradeFlow";

export async function fetchLiveOnlyIntelligence(
  signal?: AbortSignal,
): Promise<LiveOnlyIntelligenceResponse> {
  const response = await api.get<LiveOnlyIntelligenceResponse>(
    "/api/live-only/intelligence",
    { signal },
  );

  return response.data;
}
