import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
} from "axios";

import { COINDCX } from "../constants";

import {
  coinDCXSigner,
  type CoinDCXRequestBody,
} from "./CoinDCXSigner";

export interface CoinDCXCredentials {
  apiKey: string;
  apiSecret: string;
}

export class CoinDCXHttpClient {
  private readonly client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: COINDCX.REST.BASE_URL,

      timeout: 10_000,

      headers: {
        "Content-Type": "application/json",
      },

      validateStatus: (status) =>
        status >= 200 &&
        status < 300,
    });
  }

  async get<T>(
    path: string,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    try {
      const response =
        await this.client.get<T>(
          path,
          config,
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

  async postPublic<T>(
    path: string,
    body: CoinDCXRequestBody = {},
  ): Promise<T> {
    try {
      const response =
        await this.client.post<T>(
          path,
          body,
        );

      return response.data;
    } catch (error: unknown) {
      throw this.createRequestError(
        "POST",
        path,
        error,
      );
    }
  }

  async postPrivate<T>(
    path: string,
    body: CoinDCXRequestBody,
    credentials: CoinDCXCredentials,
  ): Promise<T> {
    const signedRequest =
      coinDCXSigner.sign(
        body,
        credentials.apiKey,
        credentials.apiSecret,
      );

    try {
      const response =
        await this.client.post<T>(
          path,
          signedRequest.payload,
          {
            headers:
              signedRequest.headers,
          },
        );

      return response.data;
    } catch (error: unknown) {
      throw this.createRequestError(
        "POST",
        path,
        error,
      );
    }
  }

  private createRequestError(
    method: string,
    path: string,
    error: unknown,
  ): Error {
    if (axios.isAxiosError(error)) {
      const status =
        error.response?.status ??
        "unknown";

      const responseData =
        error.response?.data;

      const responseText =
        responseData === undefined
          ? error.message
          : this.safeStringify(
              responseData,
            );

      return new Error(
        `CoinDCX ${method} ${path} failed: status=${status}, response=${responseText}`,
      );
    }

    return error instanceof Error
      ? error
      : new Error(
          `CoinDCX ${method} ${path} failed with an unknown error.`,
        );
  }

  private safeStringify(
    value: unknown,
  ): string {
    try {
      return JSON.stringify(
        value,
      );
    } catch {
      return String(value);
    }
  }
}

export const coinDCXHttpClient =
  new CoinDCXHttpClient();