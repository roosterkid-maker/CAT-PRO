import axios from "axios";

import {
  API_BASE_URL,
} from "../config/runtimeUrls";

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10_000,
  headers: {
    Accept: "application/json",
  },
});

export { API_BASE_URL };
