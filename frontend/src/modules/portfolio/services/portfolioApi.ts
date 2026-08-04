import axios from "axios";

import type {
  PortfolioSummaryResponse,
} from "../types/PortfolioSummary";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ??
  "http://localhost:5000";

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