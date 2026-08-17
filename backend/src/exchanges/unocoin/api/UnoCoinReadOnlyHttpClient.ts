import {
  UNOCOIN,
} from "../constants";

import type {
  UnoCoinCredentials,
} from "./UnoCoinCredentialsProvider";

export type UnoCoinReadOnlyFetch = (
  input:
    string | URL | Request,
  init?:
    RequestInit,
) => Promise<Response>;

export interface UnoCoinReadOnlyHttpClientOptions {
  fetchImplementation?:
    UnoCoinReadOnlyFetch;

  baseUrl?: string;

  requestTimeoutMs?: number;
}

const ACCOUNT_STATUS_PATH =
  "/api/user/status";

export class UnoCoinReadOnlyHttpClient {
  private readonly fetchImplementation:
    UnoCoinReadOnlyFetch;

  private readonly baseUrl:
    string;

  private readonly requestTimeoutMs:
    number;

  constructor(
    options:
      UnoCoinReadOnlyHttpClientOptions = {},
  ) {
    this.fetchImplementation =
      options.fetchImplementation ??
      fetch;

    this.baseUrl =
      options.baseUrl ??
      UNOCOIN.REST.BASE_URL;

    this.requestTimeoutMs =
      options.requestTimeoutMs ??
      UNOCOIN.REQUEST_TIMEOUT_MS;

    if (
      !Number.isSafeInteger(
        this.requestTimeoutMs,
      ) ||
      this.requestTimeoutMs <= 0
    ) {
      throw new Error(
        "UnoCoin authenticated-read timeout must be a positive integer.",
      );
    }
  }

  async verifyAccountStatus(
    credentials:
      UnoCoinCredentials,
  ): Promise<void> {
    await this.getAuthenticated<
      Record<
        string,
        unknown
      >
    >(
      ACCOUNT_STATUS_PATH,
      credentials,
    );
  }

  async getAuthenticated<T>(
    path: string,
    credentials:
      UnoCoinCredentials,
  ): Promise<T> {
    const apiToken =
      credentials.apiToken
        .trim();

    if (!apiToken) {
      throw new Error(
        "UnoCoin API token is required for authenticated read verification.",
      );
    }

    const url =
      new URL(
        path,
        this.baseUrl,
      );

    const controller =
      new AbortController();

    const timeout =
      setTimeout(
        () =>
          controller.abort(),
        this.requestTimeoutMs,
      );

    try {
      const response =
        await this.fetchImplementation(
          url,
          {
            method:
              "GET",

            headers: {
              Accept:
                "application/json",

              Authorization:
                `Bearer ${apiToken}`,
            },

            signal:
              controller.signal,
          },
        );

      if (!response.ok) {
        throw new Error(
          `UnoCoin authenticated GET ${url.pathname} failed with HTTP ${response.status}.`,
        );
      }

      const payload:
        unknown =
        await response.json();

      if (
        payload ===
          null ||
        typeof payload !==
          "object" ||
        Array.isArray(
          payload,
        )
      ) {
        throw new Error(
          `UnoCoin authenticated GET ${url.pathname} returned an invalid response.`,
        );
      }

      /*
       * Callers receive the parsed response only in
       * backend memory. Tokens are never returned or
       * logged by this client.
       */
      return payload as T;
    } finally {
      clearTimeout(
        timeout,
      );
    }
  }
}

export const unoCoinReadOnlyHttpClient =
  new UnoCoinReadOnlyHttpClient();
