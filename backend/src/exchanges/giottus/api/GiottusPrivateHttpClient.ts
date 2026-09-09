import {
  sensitiveDataRedactor,
} from "../../../core/security/SensitiveDataRedactor";

import {
  GIOTTUS,
} from "../constants";

import type {
  GiottusCredentials,
} from "./GiottusCredentialsProvider";

import {
  giottusSigner,
  type GiottusQueryValue,
  type GiottusSigner,
} from "./GiottusSigner";

import {
  GiottusPrivateRateLimitError,
  giottusPrivateRequestGovernor,
  type GiottusPrivateRequestGovernor,
} from "./GiottusPrivateRequestGovernor";

export type GiottusPrivateFetch = (
  input:
    string | URL,
  init?:
    RequestInit,
) => Promise<Response>;

export class GiottusPrivateHttpClient {
  constructor(
    private readonly request:
      GiottusPrivateFetch = fetch,
    private readonly signer:
      GiottusSigner = giottusSigner,
    private readonly now:
      () => number =
      () => Date.now(),
    private readonly requestTimeoutMs:
      number = GIOTTUS.REQUEST_TIMEOUT_MS,
    private readonly baseUrl:
      string = GIOTTUS.REST.BASE_URL,
    private readonly requestGovernor:
      GiottusPrivateRequestGovernor =
      giottusPrivateRequestGovernor,
  ) {
    if (
      !Number.isSafeInteger(
        this.requestTimeoutMs,
      ) ||
      this.requestTimeoutMs <= 0
    ) {
      throw new Error(
        "Giottus private-read timeout must be a positive integer.",
      );
    }
  }

  async getSigned<T>(
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
  ): Promise<T> {
    return this.requestGovernor
      .execute(
        () =>
          this.executeSignedGet<T>(
            path,
            query,
            credentials,
          ),
      );
  }

  private async executeSignedGet<T>(
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
  ): Promise<T> {
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
    } catch (error: unknown) {
      throw new Error(
        sensitiveDataRedactor
          .redactString(
            error instanceof Error
              ? `Giottus authenticated GET ${path} failed: ${error.message}`
              : `Giottus authenticated GET ${path} failed.`,
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
        `Giottus authenticated GET ${path} returned non-JSON HTTP ${response.status}.`,
      );
    }

    if (!response.ok) {
      const code =
        this.isRecord(payload) &&
        (typeof payload.code === "number" ||
          typeof payload.code === "string")
          ? String(payload.code)
              .slice(0, 40)
          : "UNKNOWN";

      const message =
        this.isRecord(payload) &&
        typeof payload.msg === "string"
          ? payload.msg
              .slice(0, 300)
          : "invalid response payload";

      const sanitized =
        sensitiveDataRedactor
          .redactString(
            `Giottus authenticated GET ${path} failed: HTTP ${response.status}, code ${code}, ${message}.`,
          );

      if (
        response.status ===
          429 ||
        code ===
          "-1003"
      ) {
        throw new GiottusPrivateRateLimitError(
          sanitized,
          this.resolveRetryAfterMs(
            response.headers,
          ),
        );
      }

      throw new Error(
        sanitized,
      );
    }

    return payload as T;
  }

  private resolveRetryAfterMs(
    headers: Headers,
  ): number {
    const retryAfter =
      headers.get(
        "Retry-After",
      )?.trim() ??
      "";

    const retryAfterSeconds =
      Number(
        retryAfter,
      );

    const retryAfterDate =
      Date.parse(
        retryAfter,
      );

    const resetSeconds =
      Number(
        headers.get(
          "X-RateLimit-Reset",
        ),
      );

    const now =
      this.now();

    const candidates = [
      Number.isFinite(
        retryAfterSeconds,
      ) &&
      retryAfterSeconds >=
        0
        ? retryAfterSeconds *
          1_000
        : Number.NaN,
      Number.isFinite(
        retryAfterDate,
      )
        ? retryAfterDate -
          now
        : Number.NaN,
      Number.isFinite(
        resetSeconds,
      ) &&
      resetSeconds >
        0
        ? resetSeconds *
            1_000 -
          now
        : Number.NaN,
    ].filter(
      (value) =>
        Number.isFinite(
          value,
        ) &&
        value >
          0,
    );

    return candidates.length >
      0
      ? Math.max(
          ...candidates,
        )
      : GIOTTUS.PRIVATE_RATE_LIMIT_COOLDOWN_MS;
  }

  private isRecord(
    value: unknown,
  ): value is Record<
    string,
    unknown
  > {
    return (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value)
    );
  }
}

export const giottusPrivateHttpClient =
  new GiottusPrivateHttpClient();
