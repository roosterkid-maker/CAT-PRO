import {GIOTTUS} from "./constants";
import type {GiottusOrderBook, GiottusTicker} from "./types";

export type GiottusPublicFetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface GiottusPublicMarketApi {
  getSymbols(): Promise<string[]>;
  getTickers(): Promise<GiottusTicker[]>;
  getOrderBook(symbol: string, limit?: number): Promise<GiottusOrderBook>;
}

export class GiottusPublicRateLimitError extends Error {
  constructor(
    message: string,
    readonly retryAfterMs: number,
  ) {
    super(message);
    this.name = "GiottusPublicRateLimitError";
  }
}

export class GiottusPublicApi implements GiottusPublicMarketApi {
  constructor(
    private readonly request: GiottusPublicFetch = fetch,
    private readonly requestTimeoutMs: number = GIOTTUS.REQUEST_TIMEOUT_MS,
    private readonly baseUrl: string = GIOTTUS.REST.BASE_URL,
  ) {
    if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs <= 0) {
      throw new Error("Giottus public-read timeout must be a positive integer.");
    }
  }

  async getSymbols(): Promise<string[]> {
    const payload = await this.getJson(GIOTTUS.REST.SYMBOLS_PATH);
    if (!Array.isArray(payload) || !payload.every((value) => typeof value === "string")) {
      throw new Error("Invalid Giottus symbols response.");
    }
    return payload;
  }

  async getTickers(): Promise<GiottusTicker[]> {
    const payload = await this.getJson(GIOTTUS.REST.TICKER_PATH);
    if (!Array.isArray(payload)) {
      throw new Error("Invalid Giottus ticker response.");
    }
    return payload as GiottusTicker[];
  }

  async getOrderBook(
    symbol: string,
    limit: number = GIOTTUS.ORDER_BOOK_DEPTH,
  ): Promise<GiottusOrderBook> {
    const normalizedSymbol = normalizeApiSymbol(symbol);
    if (!normalizedSymbol || !Number.isSafeInteger(limit) || limit <= 0 || limit > 50) {
      throw new Error("Giottus order-book request is invalid.");
    }
    const query = new URLSearchParams({
      symbol: normalizedSymbol,
      limit: String(limit),
    });
    const payload = await this.getJson(`${GIOTTUS.REST.ORDER_BOOK_PATH}?${query.toString()}`);
    if (!isRecord(payload)) {
      throw new Error(`Invalid Giottus order-book response: ${normalizedSymbol}.`);
    }
    return payload as GiottusOrderBook;
  }

  private async getJson(pathAndQuery: string): Promise<unknown> {
    const url = new URL(pathAndQuery, this.baseUrl);
    let response: Response;
    try {
      response = await this.request(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": GIOTTUS.AUTHENTICATED_USER_AGENT,
        },
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      });
    } catch (error: unknown) {
      throw new Error(
        error instanceof Error
          ? `Giottus public GET ${url.pathname} failed: ${error.message}`
          : `Giottus public GET ${url.pathname} failed.`,
      );
    }

    if (response.status === 429) {
      const retryAfterMs = resolveRetryAfterMs(response.headers, Date.now());
      throw new GiottusPublicRateLimitError(
        `Giottus public GET ${url.pathname} failed: HTTP 429; retry after ${Math.ceil(retryAfterMs / 1_000)}s.`,
        retryAfterMs,
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error(`Giottus public GET ${url.pathname} returned non-JSON HTTP ${response.status}.`);
    }

    if (!response.ok) {
      const retryAfter = response.headers.get("Retry-After");
      throw new Error(
        `Giottus public GET ${url.pathname} failed: HTTP ${response.status}${retryAfter ? `; retry after ${retryAfter}s` : ""}.`,
      );
    }
    return payload;
  }
}

function resolveRetryAfterMs(headers: Headers, now: number): number {
  const retryAfter = headers.get("Retry-After")?.trim() ?? "";
  const retryAfterSeconds = Number(retryAfter);
  const retryAfterDate = Date.parse(retryAfter);
  const resetSeconds = Number(headers.get("X-RateLimit-Reset"));
  const candidates = [
    Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0
      ? retryAfterSeconds * 1_000
      : Number.NaN,
    Number.isFinite(retryAfterDate)
      ? retryAfterDate - now
      : Number.NaN,
    Number.isFinite(resetSeconds) && resetSeconds > 0
      ? resetSeconds * 1_000 - now
      : Number.NaN,
  ].filter((value) => Number.isFinite(value) && value > 0);
  return candidates.length > 0 ? Math.max(...candidates) : GIOTTUS.MINIMUM_RATE_LIMIT_COOLDOWN_MS;
}

function normalizeApiSymbol(symbol: string): string {
  const trimmed = symbol.trim().toUpperCase();
  const match = /^([A-Z0-9]+)[\/_-]([A-Z0-9]+)$/.exec(trimmed);
  if (match?.[1] && match[2]) return `${match[1]}/${match[2]}`;
  return "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export const giottusPublicApi = new GiottusPublicApi();
