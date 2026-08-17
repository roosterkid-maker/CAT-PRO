import {
  createPrivateKey,
  sign,
} from "node:crypto";

import type {
  CoinSwitchCredentials,
} from "./CoinSwitchCredentialsProvider";

export type CoinSwitchSignedMethod =
  | "GET"
  | "POST"
  | "DELETE";

export interface CoinSwitchSignedRequest {
  method:
    CoinSwitchSignedMethod;

  path: string;

  epoch: number;

  headers:
    Readonly<
      Record<
        string,
        string
      >
    >;
}

export type CoinSwitchSignedReadRequest =
  CoinSwitchSignedRequest & {
    method: "GET";
  };

const HEX_32_BYTES =
  /^[a-f0-9]{64}$/i;

const ED25519_PKCS8_PREFIX =
  "302e020100300506032b657004220420";

export class CoinSwitchSigner {
  signRequest(
    method:
      CoinSwitchSignedMethod,
    path: string,
    parameters:
      Readonly<
        Record<
          string,
          string
        >
      >,
    epoch: number,
    credentials:
      CoinSwitchCredentials,
  ): CoinSwitchSignedRequest {
    const decodedPath =
      this.buildDecodedPath(
        path,
        parameters,
      );

    this.validateEpoch(
      epoch,
    );

    this.validateCredentials(
      credentials,
    );

    const privateKeyDer =
      Buffer.concat([
        Buffer.from(
          ED25519_PKCS8_PREFIX,
          "hex",
        ),

        Buffer.from(
          credentials.apiSecret,
          "hex",
        ),
      ]);

    const privateKey =
      createPrivateKey({
        key:
          privateKeyDer,

        format:
          "der",

        type:
          "pkcs8",
      });

    const message =
      `${method}${decodedPath}${epoch}`;

    const signature =
      sign(
        null,
        Buffer.from(
          message,
          "utf8",
        ),
        privateKey,
      ).toString(
        "hex",
      );

    return {
      method,
      path:
        decodedPath,
      epoch,
      headers: {
        Accept:
          "application/json",
        "Content-Type":
          "application/json",
        "X-AUTH-APIKEY":
          credentials.apiKey,
        "X-AUTH-SIGNATURE":
          signature,
        "X-AUTH-EPOCH":
          String(
            epoch,
          ),
      },
    };
  }

  signGet(
    path: string,
    parameters:
      Readonly<
        Record<
          string,
          string
        >
      >,
    epoch: number,
    credentials:
      CoinSwitchCredentials,
  ): CoinSwitchSignedReadRequest {
    return this.signRequest(
      "GET",
      path,
      parameters,
      epoch,
      credentials,
    ) as CoinSwitchSignedReadRequest;
  }

  private buildDecodedPath(
    path: string,
    parameters:
      Readonly<
        Record<
          string,
          string
        >
      >,
  ): string {
    const normalizedPath =
      path.trim();

    if (
      !normalizedPath.startsWith(
        "/",
      ) ||
      normalizedPath.includes(
        "://",
      )
    ) {
      throw new Error(
        "CoinSwitch signed path must be an absolute API path.",
      );
    }

    const query =
      new URLSearchParams();

    for (
      const [
        key,
        value,
      ]
      of Object.entries(
        parameters,
      ).sort(
        (
          first,
          second,
        ) =>
          first[0]
            .localeCompare(
              second[0],
            ),
      )
    ) {
      if (!key.trim()) {
        throw new Error(
          "CoinSwitch signed query parameter name is required.",
        );
      }

      query.set(
        key,
        value,
      );
    }

    const encodedPath =
      query.size > 0
        ? `${normalizedPath}${normalizedPath.includes("?") ? "&" : "?"}${query.toString()}`
        : normalizedPath;

    try {
      return decodeURIComponent(
        encodedPath.replace(
          /\+/g,
          " ",
        ),
      );
    } catch {
      throw new Error(
        "CoinSwitch signed path contains invalid URL encoding.",
      );
    }
  }

  private validateEpoch(
    epoch: number,
  ): void {
    if (
      !Number.isSafeInteger(
        epoch,
      ) ||
      epoch <= 0
    ) {
      throw new Error(
        "CoinSwitch signature epoch must be a positive safe integer.",
      );
    }
  }

  private validateCredentials(
    credentials:
      CoinSwitchCredentials,
  ): void {
    if (
      !HEX_32_BYTES.test(
        credentials.apiKey,
      )
    ) {
      throw new Error(
        "CoinSwitch API key must be a 32-byte hexadecimal Ed25519 public key.",
      );
    }

    if (
      !HEX_32_BYTES.test(
        credentials.apiSecret,
      )
    ) {
      throw new Error(
        "CoinSwitch API secret must be a 32-byte hexadecimal Ed25519 private seed.",
      );
    }
  }
}

export const coinSwitchSigner =
  new CoinSwitchSigner();
