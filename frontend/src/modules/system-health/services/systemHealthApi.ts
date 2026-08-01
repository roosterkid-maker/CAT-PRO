import axios from "axios";

import type {
  SystemHealthResponse,
} from "../types/SystemHealth";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ??
  "http://localhost:5000";

export async function fetchSystemHealth(): Promise<SystemHealthResponse> {
  const response = await axios.get<SystemHealthResponse>(
    `${API_BASE_URL}/api/system-health`,
    {
      timeout: 10_000,
    },
  );

  return response.data;
}