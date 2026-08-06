import {
  createHmac,
} from "node:crypto";

export type BinanceRequestValue =
  | string
  | number
  | boolean;

export type BinanceRequestParameters =
  Record<
    string,
    BinanceRequestValue
  >;

export interface BinanceSignedRequest {
  parameters:
    BinanceRequestParameters;

  queryString: string;

  signature: string;

  signedQueryString: string;
}

export interface BinanceTimestampOptions {
  timestamp?: number;

  recvWindow?: number;
}

const DEFAULT_RECV_WINDOW =
  5_000;

export class BinanceSigner {
  createTimestampParameters(
    parameters:
      BinanceRequestParameters = {},
    options:
      BinanceTimestampOptions = {},
  ): BinanceRequestParameters {
    const timestamp =
      options.timestamp ??
      Date.now();

    const recvWindow =
      options.recvWindow ??
      DEFAULT_RECV_WINDOW;

    this.requirePositiveInteger(
      timestamp,
      "Binance timestamp",
    );

    this.requirePositiveInteger(
      recvWindow,
      "Binance recvWindow",
    );

    return {
      ...parameters,

      recvWindow,

      timestamp,
    };
  }

  sign(
    parameters:
      BinanceRequestParameters,
    apiSecret: string,
  ): BinanceSignedRequest {
    const normalizedSecret =
      apiSecret.trim();

    if (!normalizedSecret) {
      throw new Error(
        "Binance API secret is required for signing.",
      );
    }

    const queryString =
      this.createQueryString(
        parameters,
      );

    if (!queryString) {
      throw new Error(
        "Binance signed request parameters cannot be empty.",
      );
    }

    const signature =
      createHmac(
        "sha256",
        normalizedSecret,
      )
        .update(
          queryString,
          "utf8",
        )
        .digest(
          "hex",
        );

    return {
      parameters,

      queryString,

      signature,

      signedQueryString:
        `${queryString}&signature=${signature}`,
    };
  }

  createSignedTimestampRequest(
    parameters:
      BinanceRequestParameters,
    apiSecret: string,
    options:
      BinanceTimestampOptions = {},
  ): BinanceSignedRequest {
    const timestampParameters =
      this.createTimestampParameters(
        parameters,
        options,
      );

    return this.sign(
      timestampParameters,
      apiSecret,
    );
  }

  private createQueryString(
    parameters:
      BinanceRequestParameters,
  ): string {
    const searchParameters =
      new URLSearchParams();

    for (
      const [
        key,
        value,
      ] of Object.entries(
        parameters,
      )
    ) {
      const normalizedKey =
        key.trim();

      if (!normalizedKey) {
        throw new Error(
          "Binance request parameter name cannot be empty.",
        );
      }

      this.validateValue(
        value,
        normalizedKey,
      );

      searchParameters.append(
        normalizedKey,
        String(value),
      );
    }

    return searchParameters.toString();
  }

  private validateValue(
    value: BinanceRequestValue,
    name: string,
  ): void {
    if (
      typeof value === "number" &&
      !Number.isFinite(value)
    ) {
      throw new Error(
        `Binance parameter ${name} must be finite.`,
      );
    }

    if (
      typeof value === "string" &&
      value.length === 0
    ) {
      throw new Error(
        `Binance parameter ${name} cannot be empty.`,
      );
    }
  }

  private requirePositiveInteger(
    value: number,
    name: string,
  ): void {
    if (
      !Number.isSafeInteger(value) ||
      value <= 0
    ) {
      throw new Error(
        `${name} must be a positive safe integer.`,
      );
    }
  }
}

export const binanceSigner =
  new BinanceSigner();