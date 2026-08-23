import type {
  DerivativeMarketEvidence,
} from "../models/DerivativeMarketEvidence";

export const DERIVATIVE_CANDIDATE_MARKETS = loadCandidateMarkets();

export function loadCandidateMarkets(environment: NodeJS.ProcessEnv = process.env): readonly string[] {
  const raw = environment.SPOT_PERPETUAL_MARKETS ?? "BTCUSDT,ETHUSDT,SOLUSDT,COTIUSDT";
  const markets = Array.from(new Set(raw.split(",").map(symbol).filter(Boolean))).sort();
  if (markets.length === 0 || markets.length > 20) {
    throw new Error("SPOT_PERPETUAL_MARKETS requires one to twenty bounded markets.");
  }
  return Object.freeze(markets);
}

export function symbol(value: unknown): string {
  return typeof value === "string"
    ? value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "")
    : "";
}

export function finite(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function positive(value: unknown): number | null {
  const parsed = finite(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

export function nonNegative(value: unknown): number | null {
  const parsed = finite(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
}

export function timestamp(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  const milliseconds = parsed < 10_000_000_000 ? parsed * 1_000 : parsed;
  return Number.isSafeInteger(Math.floor(milliseconds)) ? Math.floor(milliseconds) : null;
}

export function decimalStep(precision: unknown): number | null {
  const value = Number(precision);
  return Number.isSafeInteger(value) && value >= 0 && value <= 18 ? 10 ** -value : null;
}

export function objectLevels(
  value: unknown,
  descending: boolean,
): Array<{price: number; quantity: number}> {
  if (Array.isArray(value)) {
    return value.map((level) => {
      if (!Array.isArray(level) || level.length < 2) return null;
      const price = positive(level[0]);
      const quantity = positive(level[1]);
      return price !== null && quantity !== null ? {price, quantity} : null;
    }).filter((level): level is {price: number; quantity: number} => level !== null)
      .sort((first, second) => descending ? second.price - first.price : first.price - second.price);
  }
  if (!isRecord(value)) return [];
  return Object.entries(value).map(([rawPrice, rawQuantity]) => {
    const price = positive(rawPrice);
    const quantity = positive(rawQuantity);
    return price !== null && quantity !== null ? {price, quantity} : null;
  }).filter((level): level is {price: number; quantity: number} => level !== null)
    .sort((first, second) => descending ? second.price - first.price : first.price - second.price);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function publicDerivativeEvidence(input: {
  readonly exchange: string;
  readonly market: string;
  readonly baseAsset: string;
  readonly quoteAsset: string;
  readonly settleAsset: string;
  readonly bidPrice: number;
  readonly bidQuantity: number;
  readonly askPrice: number;
  readonly askQuantity: number;
  readonly markPrice: number;
  readonly indexPrice: number;
  readonly fundingRate: number;
  readonly nextFundingTime: number;
  readonly fundingIntervalMinutes: number;
  readonly fundingEvidence: "EXCHANGE_REPORTED" | "UNAVAILABLE";
  readonly openInterest: number | null;
  readonly priceStep: number;
  readonly quantityStep: number;
  readonly minimumQuantity: number;
  readonly maximumMarketQuantity: number;
  readonly minimumNotional: number;
  readonly maximumLeverage: number | null;
  readonly makerPercent?: number;
  readonly takerPercent?: number;
  readonly sourceTimestamp: number;
  readonly observedAt: number;
}): DerivativeMarketEvidence | null {
  if (
    !input.exchange || !input.market || !input.baseAsset || !input.quoteAsset || !input.settleAsset ||
    ![input.bidPrice, input.bidQuantity, input.askPrice, input.askQuantity, input.markPrice,
      input.indexPrice, input.nextFundingTime, input.fundingIntervalMinutes, input.priceStep,
      input.quantityStep, input.minimumQuantity, input.maximumMarketQuantity,
      input.minimumNotional].every((value) => Number.isFinite(value) && value > 0) ||
    !Number.isFinite(input.fundingRate) || input.bidPrice >= input.askPrice ||
    input.sourceTimestamp <= 0 || input.observedAt <= 0
  ) return null;

  const fees = input.makerPercent !== undefined && input.takerPercent !== undefined &&
    [input.makerPercent, input.takerPercent].every((value) => Number.isFinite(value) && value >= 0 && value <= 10)
    ? {makerPercent: input.makerPercent, takerPercent: input.takerPercent,
        source: "PUBLIC_INSTRUMENT_RULES" as const}
    : undefined;

  return Object.freeze({
    exchange: input.exchange,
    market: input.market,
    baseAsset: input.baseAsset,
    quoteAsset: input.quoteAsset,
    settleAsset: input.settleAsset,
    product: "LINEAR_PERPETUAL",
    tradingEnabled: true,
    bidPrice: input.bidPrice,
    bidQuantity: input.bidQuantity,
    askPrice: input.askPrice,
    askQuantity: input.askQuantity,
    markPrice: input.markPrice,
    indexPrice: input.indexPrice,
    fundingRate: input.fundingRate,
    nextFundingTime: input.nextFundingTime,
    fundingIntervalMinutes: input.fundingIntervalMinutes,
    fundingEvidence: input.fundingEvidence,
    openInterest: input.openInterest,
    ...(fees ? {fees} : {}),
    rules: {
      priceStep: input.priceStep,
      quantityStep: input.quantityStep,
      minimumQuantity: input.minimumQuantity,
      maximumMarketQuantity: input.maximumMarketQuantity,
      minimumNotional: input.minimumNotional,
      maximumLeverage: input.maximumLeverage,
    },
    sourceTimestamp: input.sourceTimestamp,
    observedAt: input.observedAt,
    sources: {instrument: "PUBLIC_REST" as const, ticker: "PUBLIC_REST" as const,
      position: "NO_DATA" as const, margin: "NO_DATA" as const, liquidation: "NO_DATA" as const},
    execution: {derivativeAdapterRegistered: false as const,
      authenticatedReadVerified: false as const, reduceOnlyVerified: false as const,
      orderSubmissionAllowed: false as const, liveExecutionAllowed: false as const},
  });
}

export function nextBoundary(now: number, intervalMinutes: number): number {
  const intervalMs = intervalMinutes * 60_000;
  return Math.floor(now / intervalMs + 1) * intervalMs;
}
