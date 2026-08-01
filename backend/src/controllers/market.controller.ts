import type { Request, Response } from "express";
import {
  fetchCoinDCXMarkets,
  fetchMarketsByQuote,
} from "../services/market.service";

export async function getAllMarkets(
  _req: Request,
  res: Response
): Promise<void> {
  try {
    const markets = await fetchCoinDCXMarkets();

    res.status(200).json({
      success: true,
      count: markets.length,
      data: markets,
    });
  } catch (error) {
    console.error("Market API error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to fetch CoinDCX markets",
    });
  }
}

export async function getInrMarkets(
  _req: Request,
  res: Response
): Promise<void> {
  try {
    const markets = await fetchMarketsByQuote("INR");

    res.status(200).json({
      success: true,
      quoteCurrency: "INR",
      count: markets.length,
      data: markets,
    });
  } catch (error) {
    console.error("INR market API error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to fetch INR markets",
    });
  }
}

export async function getUsdtMarkets(
  _req: Request,
  res: Response
): Promise<void> {
  try {
    const markets = await fetchMarketsByQuote("USDT");

    res.status(200).json({
      success: true,
      quoteCurrency: "USDT",
      count: markets.length,
      data: markets,
    });
  } catch (error) {
    console.error("USDT market API error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to fetch USDT markets",
    });
  }
}