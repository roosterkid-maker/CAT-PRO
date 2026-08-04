import axios from "axios";

import type {
  PaperTradesResponse,
} from "../types/PaperTrade";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ??
  "http://localhost:5000";

export interface CreatePaperTradePayload {
  opportunityId: string;
  requestedCapital: number;
}

interface ExecutionResult {
  tradeId: string;
  market: string;
  capital: number;
  quantity: number;
  buyPrice: number;
  sellPrice: number;
  grossProfit: number;
  fees: number;
  netProfit: number;
  executedAt: number;
}

interface AutomatedPaperTradeExecution {
  approved: boolean;
  result: ExecutionResult | null;
  reasons: string[];
}

interface PaperTradeExecutionResponse {
  success: boolean;
  data: AutomatedPaperTradeExecution;
}

interface ApiErrorResponse {
  success: false;
  message?: string;
}

export async function fetchPaperTrades(): Promise<PaperTradesResponse> {
  const response = await axios.get<PaperTradesResponse>(
    `${API_BASE_URL}/api/paper-trades`,
    {
      timeout: 10_000,
    },
  );

  return response.data;
}

export async function createPaperTrade(
  payload: CreatePaperTradePayload,
): Promise<PaperTradeExecutionResponse> {
  try {
    const response =
      await axios.post<PaperTradeExecutionResponse>(
        `${API_BASE_URL}/api/paper/execute`,
        {
          opportunityId: payload.opportunityId,
          requestedCapital:
            payload.requestedCapital,
        },
        {
          timeout: 10_000,
        },
      );

    if (
      !response.data.success ||
      !response.data.data.approved
    ) {
      throw new Error(
        response.data.data.reasons[0] ??
          "Paper trade was not approved.",
      );
    }

    return response.data;
  } catch (error) {
    if (axios.isAxiosError<ApiErrorResponse>(error)) {
      throw new Error(
        error.response?.data?.message ??
          "Unable to create paper trade.",
      );
    }

    throw error;
  }
}