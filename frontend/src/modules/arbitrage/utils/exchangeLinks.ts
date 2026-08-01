const EXCHANGE_URLS: Record<string, string> = {
  coindcx: "https://coindcx.com/trade",
  binance: "https://www.binance.com/en/trade",
};

export function getExchangeUrl(
  exchange: string,
  market: string,
): string | null {
  const normalizedExchange = exchange.toLowerCase();
  const baseUrl = EXCHANGE_URLS[normalizedExchange];

  if (!baseUrl) {
    return null;
  }

  if (normalizedExchange === "binance") {
    return `${baseUrl}/${market}`;
  }

  return baseUrl;
}