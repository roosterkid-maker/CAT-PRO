import {
  api,
} from "@/api/client";

import type {
  OperatorSettingsResponse,
  PaperCapitalConfigurationInput,
  PaperDailyAttemptLimitInput,
  PaperTradingDataResetInput,
  PaperTradingDataResetResponse,
} from "../types/OperatorSettings";

export async function fetchOperatorSettings():
Promise<OperatorSettingsResponse> {
  const response =
    await api.get<OperatorSettingsResponse>(
      "/api/operator-settings",
    );

  return response.data;
}

export async function updatePaperCapitalConfiguration(
  input:
    PaperCapitalConfigurationInput,
): Promise<OperatorSettingsResponse> {
  const response =
    await api.put<OperatorSettingsResponse>(
      "/api/operator-settings/paper-capital",
      input,
    );

  return response.data;
}

export async function updatePaperDailyAttemptLimit(
  input:
    PaperDailyAttemptLimitInput,
): Promise<OperatorSettingsResponse> {
  const response =
    await api.put<OperatorSettingsResponse>(
      "/api/operator-settings/paper-daily-attempt-limit",
      input,
    );

  return response.data;
}

export async function resetPaperTradingData(
  input:
    PaperTradingDataResetInput,
): Promise<PaperTradingDataResetResponse> {
  const response =
    await api.post<PaperTradingDataResetResponse>(
      "/api/operator-settings/paper-data/reset",
      input,
    );

  return response.data;
}
