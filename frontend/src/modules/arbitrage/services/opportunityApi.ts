import axios from "axios";

import type {
  OpportunitiesResponse,
} from "../types/Opportunity";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ??
  "http://localhost:5000";

export async function fetchOpportunities(): Promise<OpportunitiesResponse> {
  const response = await axios.get<OpportunitiesResponse>(
    `${API_BASE_URL}/api/opportunities`,
    {
      timeout: 10_000,
    },
  );

  return response.data;
}