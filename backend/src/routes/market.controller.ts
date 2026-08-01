import type { Request, Response } from "express";
import { fetchCoinDCXMarkets } from "../services/market.service";

export const getMarkets = async (
  _req: Request,
  res: Response
): Promise<void> => {
  try {
    const markets = await fetchCoinDCXMarkets();

    res.status(200).json({
      success: true,
      count: markets.length,
      data: markets,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Unable to fetch CoinDCX market data",
    });
  }
};