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

interface BinanceServerTimeResponse {
  serverTime?: unknown;
}

interface BinanceApiErrorResponse {
  code?: unknown;

  msg?: unknown;

  message?: unknown;
}

export class BinanceHttpClient {
  private readonly client:
    AxiosInstance;

  private serverTimeOffsetMs =
    0;

  constructor() {
    this.client =
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
  }

  async getPublic<T>(
    path: string,
    parameters:
      BinanceRequestParameters = {},
    config?:
      AxiosRequestConfig,
  ): Promise<T> {
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
    } catch (error: unknown) {
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
    const requestStartedAt =
      Date.now();

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
      serverTime <= 0
    ) {
      throw new Error(
        "Invalid Binance server-time response.",
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

    return this.serverTimeOffsetMs;
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

  private async requestSigned<T>(
    method: Method,
    path: string,
    parameters:
      BinanceRequestParameters,
    suppliedCredentials?:
      BinanceCredentials,
  ): Promise<T> {
    const credentials =
      suppliedCredentials ??
      binanceCredentialsProvider
        .getCredentials();

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
    } catch (error: unknown) {
      throw this.createRequestError(
        method,
        path,
        error,
      );
    }
  }

  private createRequestError(
    method: Method | string,
    path: string,
    error: unknown,
  ): Error {
    if (
      axios.isAxiosError<
        BinanceApiErrorResponse
      >(error)
    ) {
      const status =
        error.response?.status ??
        "unknown";

      const responseData =
        error.response?.data;

      const code =
        this.toOptionalString(
          responseData?.code,
        );

      const message =
        this.toOptionalString(
          responseData?.msg,
        ) ??
        this.toOptionalString(
          responseData?.message,
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
      ].join(", ");

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
    value: unknown,
  ): string | null {
    if (
      typeof value === "string"
    ) {
      const normalized =
        value.trim();

      return normalized
        ? normalized
        : null;
    }

    if (
      typeof value === "number" &&
      Number.isFinite(value)
    ) {
      return String(value);
    }

    return null;
  }
}

export const binanceHttpClient =
  new BinanceHttpClient();