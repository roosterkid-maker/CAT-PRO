import axios from "axios";

import {
  API_BASE_URL,
} from "../../../config/runtimeUrls";

import type {
  PortfolioSummaryResponse,
} from "../types/PortfolioSummary";

import type {
  ExchangeBalanceResponse,
} from "../types/ExchangeBalances";

export async function fetchPortfolioSummary():
Promise<PortfolioSummaryResponse> {
  const response =
    await axios.get<PortfolioSummaryResponse>(
      `${API_BASE_URL}/api/portfolio/summary`,
      {
        timeout: 10_000,
      },
    );

  return response.data;
}

export async function fetchExchangeBalances():
Promise<ExchangeBalanceResponse> {
  const response =
    await axios.get<ExchangeBalanceResponse>(
      `${API_BASE_URL}/api/portfolio/exchange-balances`,
      {
        timeout:
          10_000,
      },
    );

  return response.data;
}

export async function refreshExchangeBalances():
Promise<ExchangeBalanceResponse> {
  const response =
    await axios.post<ExchangeBalanceResponse>(
      `${API_BASE_URL}/api/portfolio/exchange-balances/refresh`,
      undefined,
      {
        timeout:
          30_000,
      },
    );

  return response.data;
}
