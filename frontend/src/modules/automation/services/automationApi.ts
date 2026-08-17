import {
  api,
} from "@/api/client";

import type {
  AutomationDashboardResponse,
} from "../types/AutomationDashboard";

import type {
  PaperPortfolioOptimizerResponse,
} from "../types/PaperPortfolioOptimizer";

export async function fetchAutomationDashboard(): Promise<AutomationDashboardResponse> {
  const response =
    await api.get<AutomationDashboardResponse>(
      "/api/automation/dashboard",
    );

  return response.data;
}

export async function fetchPaperPortfolioOptimizer(): Promise<PaperPortfolioOptimizerResponse> {
  const response =
    await api.get<PaperPortfolioOptimizerResponse>(
      "/api/automation/paper-portfolio",
    );

  return response.data;
}