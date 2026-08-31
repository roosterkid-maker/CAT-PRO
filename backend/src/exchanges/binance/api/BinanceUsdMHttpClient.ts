import {
  sensitiveDataRedactor,
} from "../../../core/security/SensitiveDataRedactor";

import type {
  BinanceRequestParameters,
} from "./BinanceSigner";

import {
  binanceRequestWeightGovernorService,
  type BinanceRequestWeightGovernorService,
} from "./BinanceRequestWeightGovernorService";

export type BinanceUsdMMethod =
  | "GET"
  | "POST"
  | "DELETE";

export interface BinanceUsdMRequestOptions {
  readonly parameters?: BinanceRequestParameters;
  readonly queryString?: string;
  readonly body?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
}

export interface BinanceUsdMFetchPort {
  (
    input: string | URL,
    init?: RequestInit,
  ): Promise<Response>;
}

interface BinanceErrorPayload {
  readonly code?: unknown;
  readonly msg?: unknown;
  readonly message?: unknown;
}

/**
 * Single transport boundary for every Binance USD-M REST request.
 *
 * Binance rate limits are IP based. USD-M polling must therefore share the
 * same durable admission/cooldown boundary as Spot instead of hiding behind
 * feature-local timers. The client records Binance's authoritative weight
 * header and every 418/429 before returning control to the caller.
 */
export class BinanceUsdMHttpClient {
  private readonly baseUrl: string;

  constructor(
    private readonly fetcher: BinanceUsdMFetchPort = fetch,
    private readonly requestWeightGovernor:
      BinanceRequestWeightGovernorService =
      binanceRequestWeightGovernorService,
    baseUrl =
      process.env.BINANCE_USDM_REST_BASE_URL?.trim() ||
      "https://fapi.binance.com",
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/u, "");
  }

  getPublic<T>(
    path: string,
    parameters: BinanceRequestParameters = {},
    timeoutMs = 10_000,
  ): Promise<T> {
    return this.request<T>(
      "GET",
      path,
      {
        parameters,
        queryString: new URLSearchParams(
          Object.entries(parameters).map(([key, value]) => [key, String(value)]),
        ).toString(),
        timeoutMs,
      },
    );
  }

  async request<T>(
    methodValue: BinanceUsdMMethod,
    pathValue: string,
    options: BinanceUsdMRequestOptions = {},
  ): Promise<T> {
    const method = methodValue.trim().toUpperCase() as BinanceUsdMMethod;
    const path = normalizePath(pathValue);
    const admission = this.requestWeightGovernor.admitRequest({
      method,
      path,
      parameters: options.parameters ?? {},
    });
    const query = options.queryString?.trim().replace(/^\?/u, "") ?? "";
    const url = `${this.baseUrl}${path}${query ? `?${query}` : ""}`;
    let response: Response;

    try {
      response = await this.fetcher(url, {
        method,
        headers: {
          Accept: "application/json",
          ...options.headers,
        },
        ...(options.body !== undefined ? {body: options.body} : {}),
        signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
      });
    } catch (error: unknown) {
      const message = error instanceof Error
        ? error.message
        : "unknown request failure";
      throw new Error(
        sensitiveDataRedactor.redactString(
          `Binance USD-M ${method} ${path} failed: ${message}`,
        ),
      );
    }

    this.requestWeightGovernor.recordSuccessfulResponse({
      admission,
      usedWeightOneMinute: response.headers.get("x-mbx-used-weight-1m"),
    });

    const responseText = await response.text();

    if (!response.ok) {
      const payload = parseErrorPayload(responseText);
      const apiCode = optionalString(payload?.code);
      const message =
        optionalString(payload?.msg) ??
        optionalString(payload?.message) ??
        (responseText.trim() || `HTTP ${response.status}`);

      this.requestWeightGovernor.recordRateLimitObservation({
        statusCode: response.status,
        apiCode,
        message,
        retryAfter: response.headers.get("retry-after"),
        method,
        path,
      });

      throw new Error(
        sensitiveDataRedactor.redactString(
          `Binance USD-M ${method} ${path} failed: status=${response.status}${
            apiCode ? `, code=${apiCode}` : ""
          }, message=${message}`,
        ),
      );
    }

    try {
      return JSON.parse(responseText) as T;
    } catch {
      throw new Error(
        `Binance USD-M ${method} ${path} returned invalid JSON.`,
      );
    }
  }
}

function normalizePath(value: string): string {
  const normalized = value.trim();

  if (!normalized.startsWith("/fapi/")) {
    throw new Error("Binance USD-M REST path must start with /fapi/.");
  }

  return normalized.split("?", 1)[0]!;
}

function parseErrorPayload(value: string): BinanceErrorPayload | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed as BinanceErrorPayload
      : null;
  } catch {
    return null;
  }
}

function optionalString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

export const binanceUsdMHttpClient =
  new BinanceUsdMHttpClient();
