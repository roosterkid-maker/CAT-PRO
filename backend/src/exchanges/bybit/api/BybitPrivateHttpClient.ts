import {
  createHmac,
} from "node:crypto";

import axios, {
  type AxiosInstance,
} from "axios";

import {
  sensitiveDataRedactor,
} from "../../../core/security/SensitiveDataRedactor";

import {
  bybitCredentialsProvider,
  type BybitCredentials,
} from "./BybitCredentialsProvider";

interface BybitEnvelope<T> {
  retCode?: unknown;

  retMsg?: unknown;

  result?: T;

  time?: unknown;
}

interface BybitServerTimeResult {
  timeSecond?: unknown;

  timeNano?: unknown;
}

const MAXIMUM_SIGNED_REQUEST_CLOCK_AGE_MS =
  60_000;

const MAXIMUM_SIGNED_REQUEST_CLOCK_OFFSET_MS =
  2_000;

export interface BybitClockDiagnostics {
  synchronized: boolean;

  serverTimeOffsetMs: number;

  lastSynchronizedAt:
    number | null;

  lastSynchronizationRoundTripMs:
    number | null;

  lastSynchronizationError:
    string | null;
}

export type BybitSignedPostBody =
  Record<
    string,
    string | number | boolean
  >;

export class BybitPrivateHttpClient {
  private static readonly RECEIVE_WINDOW_MS =
    5_000;

  private readonly client:
    AxiosInstance;

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

  constructor(
    client?:
      AxiosInstance,
  ) {
    this.client =
      client ??
      axios.create({
          baseURL:
            process.env
              .BYBIT_REST_BASE_URL
              ?.trim() ??
            "https://api.bybit.com",

          timeout:
            10_000,

          headers: {
            Accept:
              "application/json",
          },
        });
  }

  async getSigned<T>(
    path:
      string,

    parameters:
      Record<
        string,
        string
      > = {},

    suppliedCredentials?:
      BybitCredentials,
  ): Promise<T> {
    const credentials =
      suppliedCredentials ??
      bybitCredentialsProvider
        .getCredentials();

    await this.ensureClockSafeForSignedRequest();

    const timestamp =
      this.getSynchronizedTimestamp();

    const queryString =
      new URLSearchParams(
        Object.entries(
          parameters,
        )
          .sort(
            (
              first,
              second,
            ) =>
              first[0]
                .localeCompare(
                  second[0],
                ),
          ),
      )
        .toString();

    const receiveWindow =
      String(
        BybitPrivateHttpClient
          .RECEIVE_WINDOW_MS,
      );

    const signaturePayload =
      `${timestamp}${credentials.apiKey}${receiveWindow}${queryString}`;

    const signature =
      createHmac(
        "sha256",
        credentials.apiSecret,
      )
        .update(
          signaturePayload,
        )
        .digest(
          "hex",
        );

    try {
      const response =
        await this.client.get<
          BybitEnvelope<T>
        >(
          queryString
            ? `${path}?${queryString}`
            : path,

          {
            headers: {
              "X-BAPI-API-KEY":
                credentials.apiKey,

              "X-BAPI-TIMESTAMP":
                String(
                  timestamp,
                ),

              "X-BAPI-RECV-WINDOW":
                receiveWindow,

              "X-BAPI-SIGN":
                signature,
            },
          },
        );

      const retCode =
        Number(
          response
            .data
            .retCode,
        );

      if (
        !Number.isFinite(
          retCode,
        ) ||
        retCode !==
          0
      ) {
        const message =
          typeof response
            .data
            .retMsg ===
            "string"
            ? response
                .data
                .retMsg
            : "Unknown Bybit API error.";

        throw new Error(
          `Bybit API failed: retCode=${String(
            response
              .data
              .retCode,
          )}, retMsg=${message}`,
        );
      }

      if (
        response
          .data
          .result ===
        undefined
      ) {
        throw new Error(
          "Bybit API response result is missing.",
        );
      }

      return response
        .data
        .result;
    } catch (
      error:
        unknown
    ) {
      if (
        axios.isAxiosError(
          error,
        )
      ) {
        const status =
          error.response
            ?.status ??
          "unknown";

        const body =
          error.response
            ?.data ===
          undefined
            ? error.message
            : sensitiveDataRedactor
                .stringifyForLog(
                  error.response
                    .data,
                );

        throw new Error(
          sensitiveDataRedactor
            .redactString(
              `Bybit GET ${path} failed: status=${status}, response=${body}`,
            ),
        );
      }

      throw error instanceof Error
        ? new Error(
            sensitiveDataRedactor
              .redactString(
                error.message,
              ),
          )
        : new Error(
            `Bybit GET ${path} failed with an unknown error.`,
          );
    }
  }

  async postSigned<T>(
    path:
      string,

    body:
      BybitSignedPostBody,

    suppliedCredentials?:
      BybitCredentials,
  ): Promise<T> {
    const credentials =
      suppliedCredentials ??
      bybitCredentialsProvider
        .getCredentials();

    await this.ensureClockSafeForSignedRequest();

    const timestamp =
      this.getSynchronizedTimestamp();

    const receiveWindow =
      String(
        BybitPrivateHttpClient
          .RECEIVE_WINDOW_MS,
      );

    /*
     * Bybit V5 signs the exact JSON body string for
     * POST requests. Send the same immutable string
     * that was signed so transport serialization can
     * never change the authenticated payload.
     */
    const jsonBody =
      JSON.stringify(
        body,
      );

    const signaturePayload =
      `${timestamp}${credentials.apiKey}${receiveWindow}${jsonBody}`;

    const signature =
      createHmac(
        "sha256",
        credentials.apiSecret,
      )
        .update(
          signaturePayload,
        )
        .digest(
          "hex",
        );

    try {
      const response =
        await this.client.post<
          BybitEnvelope<T>
        >(
          path,
          jsonBody,
          {
            headers: {
              Accept:
                "application/json",

              "Content-Type":
                "application/json",

              "X-BAPI-API-KEY":
                credentials.apiKey,

              "X-BAPI-TIMESTAMP":
                String(
                  timestamp,
                ),

              "X-BAPI-RECV-WINDOW":
                receiveWindow,

              "X-BAPI-SIGN":
                signature,
            },
          },
        );

      const retCode =
        Number(
          response
            .data
            .retCode,
        );

      if (
        !Number.isFinite(
          retCode,
        ) ||
        retCode !==
          0
      ) {
        const message =
          typeof response
            .data
            .retMsg ===
            "string"
            ? response
                .data
                .retMsg
            : "Unknown Bybit API error.";

        throw new Error(
          `Bybit API failed: retCode=${String(
            response
              .data
              .retCode,
          )}, retMsg=${message}`,
        );
      }

      if (
        response
          .data
          .result ===
        undefined
      ) {
        throw new Error(
          "Bybit API response result is missing.",
        );
      }

      return response
        .data
        .result;
    } catch (
      error: unknown
    ) {
      throw this.createRequestError(
        "POST",
        path,
        error,
      );
    }
  }

  async synchronizeServerTime():
    Promise<number> {
    const requestStartedAt =
      Date.now();

    try {
      const response =
        await this.client.get<
          BybitEnvelope<
            BybitServerTimeResult
          >
        >(
          "/v5/market/time",
        );

      const requestCompletedAt =
        Date.now();

      const retCode =
        Number(
          response
            .data
            .retCode,
        );

      if (
        !Number.isFinite(
          retCode,
        ) ||
        retCode !==
          0
      ) {
        throw new Error(
          "Bybit server-time response was not successful.",
        );
      }

      const serverTime =
        this.resolveServerTimeMs(
          response.data,
        );

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

      return this.serverTimeOffsetMs;
    } catch (
      error: unknown
    ) {
      const normalizedError =
        this.createRequestError(
          "GET",
          "/v5/market/time",
          error,
        );

      this.lastSynchronizationError =
        normalizedError.message;

      throw normalizedError;
    }
  }

  getClockDiagnostics():
    BybitClockDiagnostics {
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
    };
  }

  getSynchronizedTimestamp():
    number {
    return (
      Date.now() +
      this.serverTimeOffsetMs
    );
  }

  isClockSafeForSignedRequest():
    boolean {
    if (
      this.lastSynchronizedAt ===
      null
    ) {
      return false;
    }

    const ageMs =
      Date.now() -
      this.lastSynchronizedAt;

    return (
      ageMs >=
        0 &&
      ageMs <=
        MAXIMUM_SIGNED_REQUEST_CLOCK_AGE_MS &&
      Math.abs(
        this.serverTimeOffsetMs,
      ) <=
        MAXIMUM_SIGNED_REQUEST_CLOCK_OFFSET_MS &&
      this.lastSynchronizationError ===
        null
    );
  }

  private async ensureClockSafeForSignedRequest():
    Promise<void> {
    if (
      !this.isClockSafeForSignedRequest()
    ) {
      await this.synchronizeServerTime();
    }

    if (
      !this.isClockSafeForSignedRequest()
    ) {
      throw new Error(
        "Bybit signed request blocked: server clock synchronization is missing, stale, failed, or outside the allowed skew.",
      );
    }
  }

  private resolveServerTimeMs(
    envelope:
      BybitEnvelope<
        BybitServerTimeResult
      >,
  ): number {
    const envelopeTime =
      Number(
        envelope.time,
      );

    if (
      Number.isSafeInteger(
        envelopeTime,
      ) &&
      envelopeTime >
        0
    ) {
      return envelopeTime;
    }

    const timeNano =
      Number(
        envelope.result
          ?.timeNano,
      );

    if (
      Number.isFinite(
        timeNano,
      ) &&
      timeNano >
        0
    ) {
      return Math.floor(
        timeNano /
          1_000_000,
      );
    }

    const timeSecond =
      Number(
        envelope.result
          ?.timeSecond,
      );

    if (
      Number.isFinite(
        timeSecond,
      ) &&
      timeSecond >
        0
    ) {
      return Math.floor(
        timeSecond *
          1_000,
      );
    }

    throw new Error(
      "Invalid Bybit server-time response.",
    );
  }

  private createRequestError(
    method: "GET" | "POST",
    path: string,
    error: unknown,
  ): Error {
    if (
      axios.isAxiosError(
        error,
      )
    ) {
      const status =
        error.response
          ?.status ??
        "unknown";

      const body =
        error.response
          ?.data ===
        undefined
          ? error.message
          : sensitiveDataRedactor
              .stringifyForLog(
                error.response
                  .data,
              );

      return new Error(
        sensitiveDataRedactor
          .redactString(
            `Bybit ${method} ${path} failed: status=${status}, response=${body}`,
          ),
      );
    }

    return error instanceof Error
      ? new Error(
          sensitiveDataRedactor
            .redactString(
              error.message,
            ),
        )
      : new Error(
          `Bybit ${method} ${path} failed with an unknown error.`,
        );
  }
}

export const bybitPrivateHttpClient =
  new BybitPrivateHttpClient();
