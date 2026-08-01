import axios from "axios";

import type {
  PaperTrade,
  PaperTradesResponse,
} from "../types/PaperTrade";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ??
  "http://localhost:5000";

export interface CreatePaperTradePayload {
  market: string;
  buyExchange: string;
  sellExchange: string;
  capital: number;
}

interface PaperTradeResponse {
  success: boolean;
  data: PaperTrade;
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
): Promise<PaperTradeResponse> {
  try {
    const response = await axios.post<PaperTradeResponse>(
      `${API_BASE_URL}/api/paper-trades`,
      payload,
      {
        timeout: 10_000,
      },
    );

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