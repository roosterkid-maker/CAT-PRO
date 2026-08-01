import { api } from "./client";
import type { MarketTicker } from "../types/market";

export interface LiveMarketResponse {
    success: boolean;
    count: number;
    data: MarketTicker[];
}

export async function getMarkets() {
    const response = await api.get<LiveMarketResponse>("/api/live");
    return response.data;
}