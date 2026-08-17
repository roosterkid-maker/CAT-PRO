import {
  sensitiveDataRedactor,
} from "../../../core/security/SensitiveDataRedactor";

import type {
  LiveExecutionAdapterReadiness,
  LiveExecutionAdapterVerificationMethod,
} from "../contracts/LiveExecutionAdapter";

export interface ExecutionAdapterVerificationConfig {
  verificationTtlMs: number;
}

interface StoredVerificationEvidence {
  lastVerifiedAt:
    | number
    | null;

  lastVerificationAttemptAt:
    number;

  verificationExpiresAt:
    | number
    | null;

  verificationMethod:
    LiveExecutionAdapterVerificationMethod;

  lastVerificationError:
    | string
    | null;

  successful: boolean;
}

const DEFAULT_CONFIG:
  ExecutionAdapterVerificationConfig = {
  verificationTtlMs:
    30_000,
};

const MAXIMUM_ERROR_LENGTH =
  500;

export class ExecutionAdapterVerificationService {
  private readonly config:
    ExecutionAdapterVerificationConfig;

  private readonly now:
    () => number;

  private readonly evidence =
    new Map<
      string,
      StoredVerificationEvidence
    >();

  constructor(
    config:
      Partial<ExecutionAdapterVerificationConfig> = {},
    now:
      () => number =
      () => Date.now(),
  ) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };

    this.now =
      now;

    this.validateConfig(
      this.config,
    );
  }

  recordSuccess(
    exchange: string,
    method:
      LiveExecutionAdapterVerificationMethod,
    verifiedAt:
      number = this.now(),
  ): void {
    const normalizedExchange =
      this.requireExchange(
        exchange,
      );

    this.requireTimestamp(
      verifiedAt,
      "Verification timestamp",
    );

    this.evidence.set(
      normalizedExchange,
      {
        lastVerifiedAt:
          verifiedAt,

        lastVerificationAttemptAt:
          verifiedAt,

        verificationExpiresAt:
          verifiedAt +
          this.config
            .verificationTtlMs,

        verificationMethod:
          method,

        lastVerificationError:
          null,

        successful:
          true,
      },
    );
  }

  recordFailure(
    exchange: string,
    method:
      LiveExecutionAdapterVerificationMethod,
    error: unknown,
    attemptedAt:
      number = this.now(),
  ): void {
    const normalizedExchange =
      this.requireExchange(
        exchange,
      );

    this.requireTimestamp(
      attemptedAt,
      "Verification attempt timestamp",
    );

    const previous =
      this.evidence.get(
        normalizedExchange,
      );

    this.evidence.set(
      normalizedExchange,
      {
        lastVerifiedAt:
          previous
            ?.lastVerifiedAt ??
          null,

        lastVerificationAttemptAt:
          attemptedAt,

        verificationExpiresAt:
          null,

        verificationMethod:
          method,

        lastVerificationError:
          this.sanitizeError(
            error,
          ),

        successful:
          false,
      },
    );
  }

  recordNotConfigured(
    exchange: string,
  ): void {
    const normalizedExchange =
      this.requireExchange(
        exchange,
      );

    this.evidence.delete(
      normalizedExchange,
    );
  }

  getReadiness(
    exchange: string,
    credentialsConfigured:
      boolean,
  ): LiveExecutionAdapterReadiness {
    const normalizedExchange =
      this.requireExchange(
        exchange,
      );

    if (
      !credentialsConfigured
    ) {
      return this.createEmptyReadiness(
        false,
      );
    }

    const record =
      this.evidence.get(
        normalizedExchange,
      );

    if (!record) {
      return this.createEmptyReadiness(
        true,
      );
    }

    const verificationFresh =
      record.successful &&
      record.verificationExpiresAt !==
        null &&
      this.now() <=
        record.verificationExpiresAt;

    const verificationStale =
      record.successful &&
      !verificationFresh;

    return {
      credentialsConfigured:
        true,

      authenticationVerified:
        verificationFresh,

      exchangeApiReachable:
        verificationFresh,

      verificationState:
        verificationFresh
          ? "VERIFIED"
          : verificationStale
            ? "VERIFICATION_STALE"
            : "CONFIGURED_UNVERIFIED",

      readOnlyVerificationFresh:
        verificationFresh,

      lastVerifiedAt:
        record.lastVerifiedAt,

      lastVerificationAttemptAt:
        record
          .lastVerificationAttemptAt,

      verificationExpiresAt:
        record
          .verificationExpiresAt,

      verificationMethod:
        record
          .verificationMethod,

      lastVerificationError:
        record
          .lastVerificationError,
    };
  }

  reset(): void {
    this.evidence.clear();
  }

  getVerificationTtlMs():
    number {
    return this.config
      .verificationTtlMs;
  }

  private createEmptyReadiness(
    credentialsConfigured:
      boolean,
  ): LiveExecutionAdapterReadiness {
    return {
      credentialsConfigured,

      authenticationVerified:
        false,

      exchangeApiReachable:
        false,

      verificationState:
        credentialsConfigured
          ? "CONFIGURED_UNVERIFIED"
          : "NOT_CONFIGURED",

      readOnlyVerificationFresh:
        false,

      lastVerifiedAt:
        null,

      lastVerificationAttemptAt:
        null,

      verificationExpiresAt:
        null,

      verificationMethod:
        null,

      lastVerificationError:
        null,
    };
  }

  private sanitizeError(
    error: unknown,
  ): string {
    const message =
      error instanceof Error &&
      error.message.trim()
        ? error.message
        : "Authenticated read-only verification failed.";

    return sensitiveDataRedactor
      .redactString(
        message,
      )
      .slice(
        0,
        MAXIMUM_ERROR_LENGTH,
      );
  }

  private requireExchange(
    exchange: string,
  ): string {
    const normalized =
      exchange
        .trim()
        .toLowerCase();

    if (!normalized) {
      throw new Error(
        "Execution verification exchange is required.",
      );
    }

    return normalized;
  }

  private requireTimestamp(
    timestamp: number,
    label: string,
  ): void {
    if (
      !Number.isSafeInteger(
        timestamp,
      ) ||
      timestamp <=
        0
    ) {
      throw new Error(
        `${label} must be a positive safe integer.`,
      );
    }
  }

  private validateConfig(
    config:
      ExecutionAdapterVerificationConfig,
  ): void {
    if (
      !Number.isSafeInteger(
        config.verificationTtlMs,
      ) ||
      config.verificationTtlMs <
        1_000
    ) {
      throw new Error(
        "Execution verification TTL must be an integer of at least 1000 ms.",
      );
    }
  }
}

export const executionAdapterVerificationService =
  new ExecutionAdapterVerificationService();
