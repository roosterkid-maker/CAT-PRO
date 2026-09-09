import {
  createHmac,
} from "node:crypto";

import {
  GIOTTUS,
} from "../constants";

import type {
  GiottusCredentials,
} from "./GiottusCredentialsProvider";

export type GiottusQueryValue =
  | string
  | number
  | boolean;

export interface GiottusSignedGetRequest {
  url: URL;

  headers: Readonly<
    Record<string, string>
  >;
}

export class GiottusSigner {
  signGet(
    path: string,
    query:
      ReadonlyArray<
        readonly [
          string,
          GiottusQueryValue,
        ]
      >,
    credentials:
      GiottusCredentials,
    timestamp:
      number = Date.now(),
    baseUrl:
      string = GIOTTUS.REST.BASE_URL,
  ): GiottusSignedGetRequest {
    if (!path.startsWith("/")) {
      throw new Error(
        "Giottus signed GET path must be absolute.",
      );
    }

    if (
      !Number.isSafeInteger(
        timestamp,
      ) ||
      timestamp <= 0
    ) {
      throw new Error(
        "Giottus signed GET timestamp must be a positive safe integer.",
      );
    }

    const apiKey =
      credentials.apiKey
        .trim();

    const apiSecret =
      credentials.apiSecret
        .trim();

    if (!apiKey || !apiSecret) {
      throw new Error(
        "Giottus signed GET requires an API key and secret.",
      );
    }

    const entries = [
      ...query,
      [
        "recvWindow",
        GIOTTUS.RECEIVE_WINDOW_MS,
      ] as const,
      [
        "timestamp",
        timestamp,
      ] as const,
    ]
      .filter(
        ([key]) =>
          key.toLowerCase() !==
          "signature",
      )
      .sort(
        ([first], [second]) =>
          first.localeCompare(
            second,
          ),
      );

    const canonical =
      entries
        .map(
          ([key, value]) =>
            `${key}=${String(value)}`,
        )
        .join("&");

    const signature =
      createHmac(
        "sha256",
        apiSecret,
      )
        .update(
          canonical,
        )
        .digest("hex");

    const url =
      new URL(
        path,
        baseUrl,
      );

    for (const [key, value] of entries) {
      url.searchParams.append(
        key,
        String(value),
      );
    }

    url.searchParams.append(
      "signature",
      signature,
    );

    return {
      url,
      headers: {
        Accept:
          "application/json",
        "User-Agent":
          GIOTTUS
            .AUTHENTICATED_USER_AGENT,
        "X-GIOTTUS-APIKEY":
          apiKey,
      },
    };
  }
}

export const giottusSigner =
  new GiottusSigner();
