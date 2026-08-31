import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type Method,
} from "axios";

import {
  BINANCE,
} from "../constants";

import {
  binanceCredentialsProvider,
  type BinanceCredentials,
} from "./BinanceCredentialsProvider";

import {
  binanceSigner,
  type BinanceRequestParameters,
} from "./BinanceSigner";

import {
  binanceRateLimitCooldownService,
  type BinanceRateLimitCooldownDiagnostics,
  type BinanceRateLimitCooldownService,
} from "./BinanceRateLimitCooldownService";

interface BinanceServerTimeResponse {
  serverTime?: unknown;
}

interface BinanceApiErrorResponse {
  code?: unknown;

  msg?: unknown;

  message?: unknown;
}

const MAXIMUM_SIGNED_REQUEST_CLOCK_AGE_MS =
  60_000;

const MAXIMUM_SIGNED_REQUEST_CLOCK_OFFSET_MS =
  2_000;

export interface BinanceClockDiagnostics {
  synchronized: boolean;

  serverTimeOffsetMs: number;

  lastSynchronizedAt:
    number | null;

  lastSynchronizationRoundTripMs:
    number | null;

  lastSynchronizationError:
    string | null;

  rateLimitCooldown:
    BinanceRateLimitCooldownDiagnostics;
}

/*
 * Compatibility diagnostics contract.
 *
 * Existing ExchangeClockSynchronizationService
 * already expects some older property names.
 *
 * Version 18 Build 9 keeps both old + new names
 * so we do not break existing resilience code.
 */
export interface BinanceTimeSynchronizationDiagnostics {
  synchronized: boolean;

  /*
   * New canonical names.
   */
  serverTimeOffsetMs: number;

  absoluteOffsetMs: number;

  ageMs:
    number | null;

  roundTripMs:
    number | null;

  /*
   * Existing/legacy names required by
   * ExchangeClockSynchronizationService.
   */
  absoluteServerTimeOffsetMs: number;

  synchronizationAgeMs:
    number | null;

  lastRoundTripMs:
    number | null;

  /*
   * Additional compatibility aliases.
   */
  offsetMs: number;

  lastSynchronizedAt:
    number | null;

  lastSynchronizationAt:
    number | null;

  lastSyncAt:
    number | null;

  lastSynchronizationRoundTripMs:
    number | null;

  lastSynchronizationError:
    string | null;

  lastError:
    string | null;

  rateLimitCooldown:
    BinanceRateLimitCooldownDiagnostics;

  maximumAllowedAgeMs: number;

  maximumAllowedOffsetMs: number;

  safeForSignedRequests: boolean;

  healthy: boolean;
}

export class BinanceHttpClient {
  private readonly client:
    AxiosInstance;

  private readonly rateLimitCooldownService:
    BinanceRateLimitCooldownService;

  private serverTimeOffsetMs =
    0;

  private lastSynchronizedAt:
    number | null =
    null;

  private lastSynchronizationRoundTripMs:
    number | null =
    null;

  private lastSynchronizationError:
    string | null =
    null;

  private synchronizationInFlight:
    Promise<number> | null =
    null;

  constructor(
    client?:
      AxiosInstance,

    rateLimitCooldownService:
      BinanceRateLimitCooldownService =
      binanceRateLimitCooldownService,
  ) {
    this.client =
      client ??
      axios.create({
          baseURL:
            BINANCE.REST.BASE_URL,

          timeout:
            10_000,

          headers: {
            Accept:
              "application/json",
          },
        });

    this.rateLimitCooldownService =
      rateLimitCooldownService;
  }

  async getPublic<T>(
    path: string,

    parameters:
      BinanceRequestParameters = {},

    config?:
      AxiosRequestConfig,
  ): Promise<T> {
    this.rateLimitCooldownService
      .assertRequestAllowed(
        path,

        path ===
          BINANCE.REST.TIME,
      );

    try {
      const response =
        await this.client.get<T>(
          path,
          {
            ...config,

            params:
              parameters,
          },
        );

      return response.data;
    } catch (
      error:
        unknown
    ) {
      throw this.createRequestError(
        "GET",
        path,
        error,
      );
    }
  }

  async getSigned<T>(
    path: string,

    parameters:
      BinanceRequestParameters = {},

    credentials?:
      BinanceCredentials,
  ): Promise<T> {
    return this.requestSigned<T>(
      "GET",
      path,
      parameters,
      credentials,
    );
  }

  async postSigned<T>(
    path: string,

    parameters:
      BinanceRequestParameters = {},

    credentials?:
      BinanceCredentials,
  ): Promise<T> {
    return this.requestSigned<T>(
      "POST",
      path,
      parameters,
      credentials,
    );
  }

  async deleteSigned<T>(
    path: string,

    parameters:
      BinanceRequestParameters = {},

    credentials?:
      BinanceCredentials,
  ): Promise<T> {
    return this.requestSigned<T>(
      "DELETE",
      path,
      parameters,
      credentials,
    );
  }

  async synchronizeServerTime():
    Promise<number> {
    if (
      this.synchronizationInFlight
    ) {
      return this.synchronizationInFlight;
    }

    const synchronization =
      this.performServerTimeSynchronization();

    this.synchronizationInFlight =
      synchronization;

    try {
      return await synchronization;
    } finally {
      if (
        this.synchronizationInFlight ===
        synchronization
      ) {
        this.synchronizationInFlight =
          null;
      }
    }
  }

  private async performServerTimeSynchronization():
    Promise<number> {
    const requestStartedAt =
      Date.now();

    try {
      const response =
        await this.getPublic<
          BinanceServerTimeResponse
        >(
          BINANCE.REST.TIME,
        );

      const requestCompletedAt =
        Date.now();

      const serverTime =
        Number(
          response.serverTime,
        );

      if (
        !Number.isSafeInteger(
          serverTime,
        ) ||
        serverTime <=
          0
      ) {
        throw new Error(
          "Invalid Binance server-time response.",
        );
      }

      /*
       * Midpoint estimation reduces the effect
       * of network round-trip latency on offset.
       */
      const estimatedLocalTime =
        Math.floor(
          (
            requestStartedAt +
            requestCompletedAt
          ) /
            2,
        );

      this.serverTimeOffsetMs =
        serverTime -
        estimatedLocalTime;

      this.lastSynchronizedAt =
        requestCompletedAt;

      this.lastSynchronizationRoundTripMs =
        Math.max(
          0,

          requestCompletedAt -
            requestStartedAt,
        );

      this.lastSynchronizationError =
        null;

      this.rateLimitCooldownService
        .markRecoverySuccessful();

      return this.serverTimeOffsetMs;
    } catch (
      error:
        unknown
    ) {
      this.lastSynchronizationError =
        error instanceof Error
          ? error.message
          : "Unknown Binance server-time synchronization failure.";

      throw error;
    }
  }

  getServerTimeOffsetMs():
    number {
    return this.serverTimeOffsetMs;
  }

  getSynchronizedTimestamp():
    number {
    return (
      Date.now() +
      this.serverTimeOffsetMs
    );
  }

  /*
   * VERSION 18 BUILD 9
   *
   * New canonical diagnostics.
   */
  getClockDiagnostics():
    BinanceClockDiagnostics {
    return {
      synchronized:
        this.lastSynchronizedAt !==
        null,

      serverTimeOffsetMs:
        this.serverTimeOffsetMs,

      lastSynchronizedAt:
        this.lastSynchronizedAt,

      lastSynchronizationRoundTripMs:
        this.lastSynchronizationRoundTripMs,

      lastSynchronizationError:
        this.lastSynchronizationError,

      rateLimitCooldown:
        this.rateLimitCooldownService
          .getDiagnostics(),
    };
  }

  /*
   * BACKWARD-COMPATIBILITY CONTRACT
   *
   * Existing ExchangeClockSynchronizationService
   * consumes this method.
   *
   * Keep all aliases until old resilience code
   * is intentionally migrated later.
   */
  getTimeSynchronizationDiagnostics():
    BinanceTimeSynchronizationDiagnostics {
    const synchronizationAgeMs =
      this.lastSynchronizedAt ===
        null
        ? null
        : Math.max(
            0,

            Date.now() -
              this.lastSynchronizedAt,
          );

    const absoluteServerTimeOffsetMs =
      Math.abs(
        this.serverTimeOffsetMs,
      );

    const safeForSignedRequests =
      this.isClockSafeForSignedRequest();

    return {
      synchronized:
        this.lastSynchronizedAt !==
        null,

      /*
       * Canonical values.
       */
      serverTimeOffsetMs:
        this.serverTimeOffsetMs,

      absoluteOffsetMs:
        absoluteServerTimeOffsetMs,

      ageMs:
        synchronizationAgeMs,

      roundTripMs:
        this.lastSynchronizationRoundTripMs,

      /*
       * Exact fields expected by existing
       * ExchangeClockSynchronizationService.
       */
      absoluteServerTimeOffsetMs,

      synchronizationAgeMs,

      lastRoundTripMs:
        this.lastSynchronizationRoundTripMs,

      /*
       * Compatibility aliases.
       */
      offsetMs:
        this.serverTimeOffsetMs,

      lastSynchronizedAt:
        this.lastSynchronizedAt,

      lastSynchronizationAt:
        this.lastSynchronizedAt,

      lastSyncAt:
        this.lastSynchronizedAt,

      lastSynchronizationRoundTripMs:
        this.lastSynchronizationRoundTripMs,

      lastSynchronizationError:
        this.lastSynchronizationError,

      lastError:
        this.lastSynchronizationError,

      rateLimitCooldown:
        this.rateLimitCooldownService
          .getDiagnostics(),

      maximumAllowedAgeMs:
        MAXIMUM_SIGNED_REQUEST_CLOCK_AGE_MS,

      maximumAllowedOffsetMs:
        MAXIMUM_SIGNED_REQUEST_CLOCK_OFFSET_MS,

      safeForSignedRequests,

      healthy:
        safeForSignedRequests,
    };
  }

  isClockSafeForSignedRequest():
    boolean {
    if (
      this.rateLimitCooldownService
        .getDiagnostics()
        .recoveryProbeRequired
    ) {
      return false;
    }

    if (
      this.lastSynchronizedAt ===
      null
    ) {
      return false;
    }

    const ageMs =
      Date.now() -
      this.lastSynchronizedAt;

    if (
      ageMs >
      MAXIMUM_SIGNED_REQUEST_CLOCK_AGE_MS
    ) {
      return false;
    }

    if (
      Math.abs(
        this.serverTimeOffsetMs,
      ) >
      MAXIMUM_SIGNED_REQUEST_CLOCK_OFFSET_MS
    ) {
      return false;
    }

    return (
      this.lastSynchronizationError ===
      null
    );
  }

  private async requestSigned<T>(
    method:
      Method,

    path:
      string,

    parameters:
      BinanceRequestParameters,

    suppliedCredentials?:
      BinanceCredentials,
  ): Promise<T> {
    this.rateLimitCooldownService
      .assertRequestAllowed(
        path,
      );

    /*
     * VERSION 18 BUILD 9
     *
     * Signed Binance requests fail closed when:
     *
     * - never synchronized
     * - synchronization stale
     * - synchronization failed
     * - clock skew exceeds allowed limit
     */
    if (
      !this.isClockSafeForSignedRequest()
    ) {
      throw new Error(
        "Binance signed request blocked: server clock synchronization is missing, stale, failed, or outside the allowed skew.",
      );
    }

    const credentials =
      suppliedCredentials ??
      binanceCredentialsProvider
        .getCredentials();

    for (
      let attempt = 0;
      attempt < 2;
      attempt += 1
    ) {
      const signedRequest =
        binanceSigner
          .createSignedTimestampRequest(
            parameters,

            credentials.apiSecret,

            {
              timestamp:
                this.getSynchronizedTimestamp(),

              recvWindow:
                5_000,
            },
          );

      try {
        const response =
          await this.client.request<T>({
            method,

            url:
              `${path}?${signedRequest.signedQueryString}`,

            headers: {
              "X-MBX-APIKEY":
                credentials.apiKey,

              Accept:
                "application/json",
            },
          });

        return response.data;
      } catch (
        error:
          unknown
      ) {
        /*
         * Binance rejects -1021 before accepting an order. One immediate
         * authoritative re-sync and re-sign is therefore safe for GET and
         * order requests, while every ambiguous/network failure remains
         * non-retried to prevent duplicate submissions.
         */
        if (
          attempt === 0 &&
          this.isTimestampSynchronizationError(
            error,
          )
        ) {
          await this.synchronizeServerTime();
          continue;
        }

        throw this.createRequestError(
          method,
          path,
          error,
        );
      }
    }

    throw new Error(
      `Binance ${method.toUpperCase()} ${path} failed after timestamp re-synchronization.`,
    );
  }

  private isTimestampSynchronizationError(
    error:
      unknown,
  ): boolean {
    if (
      !axios.isAxiosError<
        BinanceApiErrorResponse
      >(
        error,
      )
    ) {
      return false;
    }

    const code =
      this.toOptionalString(
        error.response
          ?.data
          ?.code,
      );

    return code ===
      "-1021";
  }

  private createRequestError(
    method:
      Method |
      string,

    path:
      string,

    error:
      unknown,
  ): Error {
    if (
      axios.isAxiosError<
        BinanceApiErrorResponse
      >(
        error,
      )
    ) {
      const status =
        error.response
          ?.status ??
        "unknown";

      const responseData =
        error.response
          ?.data;

      const code =
        this.toOptionalString(
          responseData
            ?.code,
        );

      const message =
        this.toOptionalString(
          responseData
            ?.msg,
        ) ??
        this.toOptionalString(
          responseData
            ?.message,
        ) ??
        error.message;

      const details = [
        `status=${status}`,

        ...(code
          ? [
              `code=${code}`,
            ]
          : []),

        `message=${message}`,
      ].join(
        ", ",
      );

      this.rateLimitCooldownService
        .recordObservation({
          statusCode:
            typeof status ===
              "number"
              ? status
              : null,

          apiCode:
            code,

          message,

          retryAfter:
            this.toOptionalString(
              error.response
                ?.headers
                ?.["retry-after"],
            ),

          method:
            method.toUpperCase(),

          path,
        });

      return new Error(
        `Binance ${method.toUpperCase()} ${path} failed: ${details}`,
      );
    }

    return error instanceof Error
      ? error
      : new Error(
          `Binance ${method.toUpperCase()} ${path} failed with an unknown error.`,
        );
  }

  private toOptionalString(
    value:
      unknown,
  ): string | null {
    if (
      typeof value ===
      "string"
    ) {
      const normalized =
        value.trim();

      return normalized
        ? normalized
        : null;
    }

    if (
      typeof value ===
        "number" &&
      Number.isFinite(
        value,
      )
    ) {
      return String(
        value,
      );
    }

    return null;
  }
}

export const binanceHttpClient =
  new BinanceHttpClient();
