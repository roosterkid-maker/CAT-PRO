import {
  api,
} from "@/api/client";

import type {
  LivePerformanceResponse,
  PaperAnalyticsResponse,
  ShadowPerformanceResponse,
} from "../types/PerformanceAnalytics";

export async function fetchPaperAnalytics(): Promise<PaperAnalyticsResponse> {
  const response =
    await api.get<PaperAnalyticsResponse>(
      "/api/analytics",
    );

  return response.data;
}

export async function fetchShadowPerformance(): Promise<ShadowPerformanceResponse> {
  const response =
    await api.get<ShadowPerformanceResponse>(
      "/api/automation/performance",
    );

  return response.data;
}

export async function fetchLivePerformance(): Promise<LivePerformanceResponse> {
  const response =
    await api.get<LivePerformanceResponse>(
      "/api/analytics/live-performance",
    );

  return response.data;
}