import {
  sensitiveDataRedactor,
} from "../../../core/security/SensitiveDataRedactor";

import {
  ZEBPAY,
} from "../constants";

import type {
  ZebPayCredentials,
} from "./ZebPayCredentialsProvider";

import {
  zebPaySigner,
  type ZebPayQueryValue,
  type ZebPaySigner,
} from "./ZebPaySigner";

export type ZebPayPrivateFetch = (
  input:
    string | URL,
  init?:
    RequestInit,
) => Promise<Response>;

export interface ZebPayPrivateEnvelope<T> {
  data: T;

  statusCode: number;

  statusDescription: string;
}

export class ZebPayPrivateHttpClient {
  constructor(
    private readonly request:
      ZebPayPrivateFetch = fetch,
    private readonly signer:
      ZebPaySigner = zebPaySigner,
    private readonly now:
      () => number =
      () => Date.now(),
    private readonly requestTimeoutMs:
      number =
      ZEBPAY
        .REQUEST_TIMEOUT_MS,
    private readonly baseUrl:
      string = ZEBPAY.REST.BASE_URL,
  ) {
    if (
      !Number.isSafeInteger(
        this.requestTimeoutMs,
      ) ||
      this.requestTimeoutMs <=
        0
    ) {
      throw new Error(
        "ZebPay private-read timeout must be a positive integer.",
      );
    }
  }

  async getSigned<T>(
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
  ): Promise<ZebPayPrivateEnvelope<T>> {
    const signed =
      this.signer
        .signGet(
          path,
          query,
          credentials,
          this.now(),
          this.baseUrl,
        );

    let response:
      Response;

    try {
      response =
        await this.request(
          signed.url,
          {
            method:
              "GET",
            headers:
              signed.headers,
            signal:
              AbortSignal.timeout(
                this.requestTimeoutMs,
              ),
          },
        );
    } catch (
      error:
        unknown
    ) {
      throw new Error(
        sensitiveDataRedactor
          .redactString(
            error instanceof Error
              ? `ZebPay authenticated GET ${path} failed: ${error.message}`
              : `ZebPay authenticated GET ${path} failed.`,
          ),
      );
    }

    let payload:
      unknown;

    try {
      payload =
        await response.json();
    } catch {
      throw new Error(
        `ZebPay authenticated GET ${path} returned non-JSON HTTP ${response.status}.`,
      );
    }

    if (
      !response.ok ||
      !this.isRecord(
        payload,
      ) ||
      payload.statusCode !==
        200 ||
      !("data" in payload)
    ) {
      const statusDescription =
        this.isRecord(
          payload,
        ) &&
        typeof payload.statusDescription ===
          "string"
          ? payload.statusDescription
              .slice(
                0,
                300,
              )
          : "invalid response envelope";

      throw new Error(
        sensitiveDataRedactor
          .redactString(
            `ZebPay authenticated GET ${path} failed: HTTP ${response.status}, ${statusDescription}.`,
          ),
      );
    }

    return {
      data:
        payload.data as T,
      statusCode:
        200,
      statusDescription:
        typeof payload.statusDescription ===
          "string"
          ? payload.statusDescription
          : "",
    };
  }

  async postSigned<T>(
    path: string,
    body:
      Readonly<Record<
        string,
        string | number | boolean
      >>,
    credentials:
      ZebPayCredentials,
  ): Promise<ZebPayPrivateEnvelope<T>> {
    const signed =
      this.signer.signPost(
        path,
        body,
        credentials,
        this.now(),
        this.baseUrl,
      );

    return this.sendSigned<T>(
      "POST",
      path,
      signed.url,
      signed.headers,
      signed.body,
    );
  }

  async deleteSigned<T>(
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
  ): Promise<ZebPayPrivateEnvelope<T>> {
    const signed =
      this.signer.signDelete(
        path,
        query,
        credentials,
        this.now(),
        this.baseUrl,
      );

    return this.sendSigned<T>(
      "DELETE",
      path,
      signed.url,
      signed.headers,
    );
  }

  private async sendSigned<T>(
    method:
      "POST" | "DELETE",
    path: string,
    url: URL,
    headers:
      Readonly<Record<string, string>>,
    body?: string,
  ): Promise<ZebPayPrivateEnvelope<T>> {
    let response:
      Response;

    try {
      response =
        await this.request(
          url,
          {
            method,
            headers,
            body,
            signal:
              AbortSignal.timeout(
                this.requestTimeoutMs,
              ),
          },
        );
    } catch (error: unknown) {
      throw new Error(
        sensitiveDataRedactor.redactString(
          error instanceof Error
            ? `ZebPay authenticated ${method} ${path} failed: ${error.message}`
            : `ZebPay authenticated ${method} ${path} failed.`,
        ),
      );
    }

    let payload:
      unknown;

    try {
      payload =
        await response.json();
    } catch {
      throw new Error(
        `ZebPay authenticated ${method} ${path} returned non-JSON HTTP ${response.status}.`,
      );
    }

    if (
      !response.ok ||
      !this.isRecord(payload) ||
      payload.statusCode !== 200 ||
      !("data" in payload)
    ) {
      const description =
        this.isRecord(payload) &&
        typeof payload.statusDescription ===
          "string"
          ? payload.statusDescription.slice(
              0,
              300,
            )
          : "invalid response envelope";

      throw new Error(
        sensitiveDataRedactor.redactString(
          `ZebPay authenticated ${method} ${path} failed: HTTP ${response.status}, ${description}.`,
        ),
      );
    }

    return {
      data:
        payload.data as T,
      statusCode:
        200,
      statusDescription:
        typeof payload.statusDescription ===
          "string"
          ? payload.statusDescription
          : "",
    };
  }

  private isRecord(
    value: unknown,
  ): value is Record<
    string,
    unknown
  > {
    return (
      typeof value ===
        "object" &&
      value !==
        null &&
      !Array.isArray(
        value,
      )
    );
  }
}

export const zebPayPrivateHttpClient =
  new ZebPayPrivateHttpClient();
