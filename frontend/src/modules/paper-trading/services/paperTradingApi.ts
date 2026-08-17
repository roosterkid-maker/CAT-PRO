import axios from "axios";

import {
  API_BASE_URL,
} from "../../../config/runtimeUrls";

import type {
  ExecutionResult,
} from "../models/ExecutionResult";

import type {
  PaperTradesResponse,
} from "../types/PaperTrade";

import type {
  SuccessfulDemoSimulationResponse,
} from "../types/DemoSimulation";

import type {
  PaperTradingReadinessResponse,
} from "../types/PaperTradingReadiness";

export interface CreatePaperTradePayload {
  opportunityId: string;

  requestedCapital: number;
}

export interface AutomatedPaperTradeExecution {
  approved: boolean;

  result:
    | ExecutionResult
    | null;

  reasons: string[];
}

export interface PaperTradeExecutionResponse {
  success: boolean;

  data:
    AutomatedPaperTradeExecution;
}

interface ApiErrorResponse {
  success: false;

  message?: string;
}

export async function fetchPaperTrades():
Promise<PaperTradesResponse> {
  try {
    const response =
      await axios.get<PaperTradesResponse>(
        `${API_BASE_URL}/api/paper-trades`,
        {
          timeout:
            10_000,
        },
      );

    return response.data;
  } catch (
    error: unknown
  ) {
    if (
      axios.isAxiosError<
        ApiErrorResponse
      >(
        error,
      )
    ) {
      throw new Error(
        error.response?.data
          ?.message ??
          "Unable to fetch paper trades.",
        {
          cause:
            error,
        },
      );
    }

    throw error;
  }
}

export async function createPaperTrade(
  payload:
    CreatePaperTradePayload,
): Promise<PaperTradeExecutionResponse> {
  try {
    const response =
      await axios.post<PaperTradeExecutionResponse>(
        `${API_BASE_URL}/api/paper/execute`,
        {
          opportunityId:
            payload.opportunityId,

          requestedCapital:
            payload.requestedCapital,
        },
        {
          timeout:
            10_000,
        },
      );

    if (
      !response.data.success ||
      !response.data.data.approved
    ) {
      throw new Error(
        response.data.data
          .reasons[0] ??
          "Paper trade was not approved.",
      );
    }

    return response.data;
  } catch (
    error: unknown
  ) {
    if (
      axios.isAxiosError<
        ApiErrorResponse
      >(
        error,
      )
    ) {
      throw new Error(
        error.response?.data
          ?.message ??
          "Unable to create paper trade.",
        {
          cause:
            error,
        },
      );
    }

    throw error;
  }
}

export async function fetchPaperTradingReadiness():
Promise<PaperTradingReadinessResponse> {
  const response =
    await axios.get<PaperTradingReadinessResponse>(
      `${API_BASE_URL}/api/automation/paper-readiness`,
      {
        timeout:
          20_000,
      },
    );

  return response.data;
}

export async function runSuccessfulDemoSimulation():
Promise<SuccessfulDemoSimulationResponse> {
  try {
    const response =
      await axios.post<SuccessfulDemoSimulationResponse>(
        `${API_BASE_URL}/api/execution/dry-run`,
        {
          scenario:
            "BALANCED_SUCCESS",
        },
        {
          timeout:
            15_000,
        },
      );

    if (
      !response.data.success ||
      !response.data.data.passed ||
      !response.data.data.noExchangeOrderSubmitted ||
      !response.data.data.accountCapitalUnchanged
    ) {
      throw new Error(
        "The synthetic success scenario did not pass every isolation check.",
      );
    }

    return response.data;
  } catch (
    error: unknown
  ) {
    if (
      axios.isAxiosError<
        ApiErrorResponse
      >(
        error,
      )
    ) {
      throw new Error(
        error.response?.data
          ?.message ??
          "Unable to run the synthetic demo simulation.",
        {
          cause:
            error,
        },
      );
    }

    throw error;
  }
}
