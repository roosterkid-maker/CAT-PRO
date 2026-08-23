import {
  createHmac,
} from "node:crypto";

import {
  ZEBPAY,
} from "../constants";

import type {
  ZebPayCredentials,
} from "./ZebPayCredentialsProvider";

export type ZebPayQueryValue =
  | string
  | number
  | boolean;

export interface ZebPaySignedGetRequest {
  url: URL;

  queryString: string;

  headers: Readonly<
    Record<string, string>
  >;
}

export interface ZebPaySignedBodyRequest {
  url: URL;

  body: string;

  headers: Readonly<
    Record<string, string>
  >;
}

export class ZebPaySigner {
  signGet(
    path: string,
    query:
      ReadonlyArray<
        readonly [
          string,
          ZebPayQueryValue,
        ]
      >,
    credentials:
      ZebPayCredentials,
    timestamp:
      number = Date.now(),
    baseUrl:
      string = ZEBPAY.REST.BASE_URL,
  ): ZebPaySignedGetRequest {
    if (
      !path.startsWith(
        "/",
      )
    ) {
      throw new Error(
        "ZebPay signed GET path must be absolute.",
      );
    }

    if (
      !Number.isSafeInteger(
        timestamp,
      ) ||
      timestamp <=
        0
    ) {
      throw new Error(
        "ZebPay signed GET timestamp must be a positive safe integer.",
      );
    }

    const apiKey =
      credentials.apiKey
        .trim();

    const apiSecret =
      credentials.apiSecret
        .trim();

    if (
      !apiKey ||
      !apiSecret
    ) {
      throw new Error(
        "ZebPay signed GET requires an API key and secret.",
      );
    }

    const entries = [
      ...query,
      [
        "timestamp",
        timestamp,
      ] as const,
    ];

    const queryString =
      entries
        .map(
          ([key, value]) =>
            `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
        )
        .join(
          "&",
        );

    const signature =
      createHmac(
        "sha256",
        apiSecret,
      )
        .update(
          queryString,
        )
        .digest(
          "hex",
        );

    const url =
      new URL(
        path,
        baseUrl,
      );

    url.search =
      queryString;

    return {
      url,
      queryString,
      headers: {
        Accept:
          "application/json",
        "Content-Type":
          "application/json",
        "User-Agent":
          ZEBPAY
            .AUTHENTICATED_USER_AGENT,
        "X-AUTH-APIKEY":
          apiKey,
        "X-AUTH-SIGNATURE":
          signature,
      },
    };
  }

  signPost(
    path: string,
    body:
      Readonly<Record<
        string,
        string | number | boolean
      >>,
    credentials:
      ZebPayCredentials,
    timestamp:
      number =
      Date.now(),
    baseUrl:
      string = ZEBPAY.REST.BASE_URL,
  ): ZebPaySignedBodyRequest {
    this.assertPathAndCredentials(
      path,
      credentials,
      timestamp,
      "POST",
    );

    const serialized =
      JSON.stringify({
        ...body,
        timestamp,
      });

    return {
      url:
        new URL(
          path,
          baseUrl,
        ),
      body:
        serialized,
      headers:
        this.buildHeaders(
          credentials,
          serialized,
        ),
    };
  }

  signDelete(
    path: string,
    query:
      ReadonlyArray<
        readonly [
          string,
          ZebPayQueryValue,
        ]
      >,
    credentials:
      ZebPayCredentials,
    timestamp:
      number =
      Date.now(),
    baseUrl:
      string = ZEBPAY.REST.BASE_URL,
  ): ZebPaySignedGetRequest {
    return this.signGet(
      path,
      query,
      credentials,
      timestamp,
      baseUrl,
    );
  }

  private buildHeaders(
    credentials:
      ZebPayCredentials,
    signedPayload: string,
  ): Readonly<Record<string, string>> {
    return {
      Accept:
        "application/json",
      "Content-Type":
        "application/json",
      "User-Agent":
        ZEBPAY
          .AUTHENTICATED_USER_AGENT,
      "X-AUTH-APIKEY":
        credentials.apiKey
          .trim(),
      "X-AUTH-SIGNATURE":
        createHmac(
          "sha256",
          credentials.apiSecret
            .trim(),
        )
          .update(
            signedPayload,
          )
          .digest(
            "hex",
          ),
    };
  }

  private assertPathAndCredentials(
    path: string,
    credentials:
      ZebPayCredentials,
    timestamp: number,
    method: string,
  ): void {
    if (!path.startsWith("/")) {
      throw new Error(
        `ZebPay signed ${method} path must be absolute.`,
      );
    }

    if (
      !Number.isSafeInteger(
        timestamp,
      ) ||
      timestamp <= 0
    ) {
      throw new Error(
        `ZebPay signed ${method} timestamp must be a positive safe integer.`,
      );
    }

    if (
      !credentials.apiKey.trim() ||
      !credentials.apiSecret.trim()
    ) {
      throw new Error(
        `ZebPay signed ${method} requires an API key and secret.`,
      );
    }
  }
}

export const zebPaySigner =
  new ZebPaySigner();
