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
        "Content-Type":
          "application/json",
      },
    });
  }

  async get<T>(
    path: string,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    const response =
      await this.client.get<T>(
        path,
        config,
      );

    return response.data;
  }

  async postPublic<T>(
    path: string,
    body: CoinDCXRequestBody = {},
  ): Promise<T> {
    const response =
      await this.client.post<T>(
        path,
        body,
      );

    return response.data;
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
  }
}

export const coinDCXHttpClient =
  new CoinDCXHttpClient();