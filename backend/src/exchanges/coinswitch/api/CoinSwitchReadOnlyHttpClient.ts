import {
  sensitiveDataRedactor,
} from "../../../core/security/SensitiveDataRedactor";

import {
  COINSWITCH,
} from "../constants";

import {
  coinSwitchPublicApi,
} from "../CoinSwitchPublicApi";

import {
  coinSwitchCredentialsProvider,
  type CoinSwitchCredentials,
  type CoinSwitchCredentialSource,
} from "./CoinSwitchCredentialsProvider";

import {
  coinSwitchSigner,
  type CoinSwitchSignedMethod,
  type CoinSwitchSignedReadRequest,
  type CoinSwitchSignedRequest,
} from "./CoinSwitchSigner";

const MAXIMUM_SIGNED_REQUEST_CLOCK_AGE_MS =
  60_000;

const MAXIMUM_SIGNED_REQUEST_CLOCK_OFFSET_MS =
  5_000;

const MAXIMUM_ERROR_BODY_LENGTH =
  1_000;

export interface CoinSwitchClockDiagnostics {
  synchronized: boolean;

  serverTimeOffsetMs: number;

  lastSynchronizedAt:
    number | null;

  lastSynchronizationRoundTripMs:
    number | null;

  lastSynchronizationError:
    string | null;
}

export interface CoinSwitchReadOnlyHttpClientOptions {
  request?: typeof fetch;

  credentialsProvider?:
    CoinSwitchCredentialSource;

  getServerTime?:
    () => Promise<number>;

  now?: () => number;

  baseUrl?: string;
}

export type CoinSwitchSignedBody =
  Readonly<
    Record<
      string,
      string | number | boolean
    >
  >;

export class CoinSwitchReadOnlyHttpClient {
  private readonly request:
    typeof fetch;

  private readonly credentialsProvider:
    CoinSwitchCredentialSource;

  private readonly getServerTime:
    () => Promise<number>;

  private readonly now:
    () => number;

  private readonly baseUrl:
    string;

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
    options:
      CoinSwitchReadOnlyHttpClientOptions = {},
  ) {
    this.request =
      options.request ??
      fetch;

    this.credentialsProvider =
      options.credentialsProvider ??
      coinSwitchCredentialsProvider;

    this.getServerTime =
      options.getServerTime ??
      (() =>
        coinSwitchPublicApi
          .getServerTime());

    this.now =
      options.now ??
      Date.now;

    this.baseUrl =
      options.baseUrl ??
      COINSWITCH
        .REST_BASE_URL;
  }

  async getSigned<T>(
    path: string,
    parameters:
      Readonly<
        Record<
          string,
          string
        >
      > = {},
    suppliedCredentials?:
      CoinSwitchCredentials,
  ): Promise<T> {
    const credentials =
      suppliedCredentials ??
      this.credentialsProvider
        .getCredentials();

    await this.ensureClockSafeForSignedRequest();

    const signedRequest =
      coinSwitchSigner
        .signGet(
          path,
          parameters,
          this.getSynchronizedTimestamp(),
          credentials,
        );

    return this.executeSignedGet<T>(
      signedRequest,
    );
  }

  async postSigned<T>(
    path: string,
    body:
      CoinSwitchSignedBody,
    suppliedCredentials?:
      CoinSwitchCredentials,
  ): Promise<T> {
    return this.writeSigned<T>(
      "POST",
      path,
      body,
      suppliedCredentials,
    );
  }

  async deleteSigned<T>(
    path: string,
    body:
      CoinSwitchSignedBody,
    suppliedCredentials?:
      CoinSwitchCredentials,
  ): Promise<T> {
    return this.writeSigned<T>(
      "DELETE",
      path,
      body,
      suppliedCredentials,
    );
  }

  async synchronizeServerTime():
    Promise<number> {
    const requestStartedAt =
      this.now();

    try {
      const serverTime =
        await this.getServerTime();

      const requestCompletedAt =
        this.now();

      if (
        !Number.isSafeInteger(
          serverTime,
        ) ||
        serverTime <= 0
      ) {
        throw new Error(
          "CoinSwitch server-time response is invalid.",
        );
      }

      const estimatedLocalTime =
        Math.floor(
          (
            requestStartedAt +
            requestCompletedAt
          ) / 2,
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
      error:
        unknown
    ) {
      const normalizedError =
        this.normalizeError(
          "CoinSwitch server-time synchronization failed",
          error,
        );

      this.lastSynchronizationError =
        normalizedError.message;

      throw normalizedError;
    }
  }

  getClockDiagnostics():
    CoinSwitchClockDiagnostics {
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
    return Math.floor(
      this.now() +
        this.serverTimeOffsetMs,
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
      this.now() -
      this.lastSynchronizedAt;

    return (
      ageMs >= 0 &&
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
        "CoinSwitch signed read blocked: server clock synchronization is missing, stale, failed, or outside the allowed skew.",
      );
    }
  }

  private async executeSignedGet<T>(
    signedRequest:
      CoinSwitchSignedReadRequest,
  ): Promise<T> {
    const url =
      new URL(
        signedRequest.path,
        this.baseUrl,
      );

    try {
      const response =
        await this.request(
          url,
          {
            method:
              "GET",

            headers:
              signedRequest.headers,

            signal:
              AbortSignal.timeout(
                COINSWITCH
                  .REQUEST_TIMEOUT_MS,
              ),
          },
        );

      if (!response.ok) {
        const body =
          sensitiveDataRedactor
            .redactString(
              (
                await response.text()
              ).slice(
                0,
                MAXIMUM_ERROR_BODY_LENGTH,
              ),
            );

        throw new Error(
          `CoinSwitch signed GET ${url.pathname} failed: status=${response.status}, response=${body || "empty"}.`,
        );
      }

      return await response
        .json() as T;
    } catch (
      error:
        unknown
    ) {
      throw this.normalizeError(
        `CoinSwitch signed GET ${url.pathname} failed`,
        error,
      );
    }
  }

  private async writeSigned<T>(
    method:
      Exclude<
        CoinSwitchSignedMethod,
        "GET"
      >,
    path: string,
    body:
      CoinSwitchSignedBody,
    suppliedCredentials?:
      CoinSwitchCredentials,
  ): Promise<T> {
    const credentials =
      suppliedCredentials ??
      this.credentialsProvider
        .getCredentials();

    await this.ensureClockSafeForSignedRequest();

    const signedRequest =
      coinSwitchSigner
        .signRequest(
          method,
          path,
          {},
          this.getSynchronizedTimestamp(),
          credentials,
        );

    return this.executeSignedWrite<T>(
      signedRequest,
      body,
    );
  }

  private async executeSignedWrite<T>(
    signedRequest:
      CoinSwitchSignedRequest,
    body:
      CoinSwitchSignedBody,
  ): Promise<T> {
    const url =
      new URL(
        signedRequest.path,
        this.baseUrl,
      );

    try {
      const response =
        await this.request(
          url,
          {
            method:
              signedRequest.method,
            headers:
              signedRequest.headers,
            body:
              JSON.stringify(
                body,
              ),
            signal:
              AbortSignal.timeout(
                COINSWITCH
                  .REQUEST_TIMEOUT_MS,
              ),
          },
        );

      if (!response.ok) {
        const responseBody =
          sensitiveDataRedactor
            .redactString(
              (
                await response.text()
              ).slice(
                0,
                MAXIMUM_ERROR_BODY_LENGTH,
              ),
            );

        throw new Error(
          `CoinSwitch signed ${signedRequest.method} ${url.pathname} failed: status=${response.status}, response=${responseBody || "empty"}.`,
        );
      }

      return await response
        .json() as T;
    } catch (
      error:
        unknown
    ) {
      throw this.normalizeError(
        `CoinSwitch signed ${signedRequest.method} ${url.pathname} failed`,
        error,
      );
    }
  }

  private normalizeError(
    prefix: string,
    error: unknown,
  ): Error {
    const message =
      error instanceof Error &&
      error.message.trim()
        ? error.message
        : "unknown error";

    const redacted =
      sensitiveDataRedactor
        .redactString(
          message,
        );

    return new Error(
      redacted.startsWith(
        prefix,
      )
        ? redacted
        : `${prefix}: ${redacted}.`,
    );
  }
}

export const coinSwitchReadOnlyHttpClient =
  new CoinSwitchReadOnlyHttpClient();
