import {
  resolve,
} from "node:path";

import {
  JsonlSnapshotStore,
} from "../../../core/persistence/JsonlSnapshotStore";

const DEFAULT_RATE_LIMIT_COOLDOWN_MS =
  60_000;

const DEFAULT_IP_BAN_COOLDOWN_MS =
  5 *
  60_000;

const DEFAULT_RECOVERY_BUFFER_MS =
  5_000;

const MAXIMUM_REASON_LENGTH =
  500;

export interface BinanceRateLimitObservation {
  statusCode:
    number | null;

  apiCode:
    string | null;

  message:
    string;

  retryAfter:
    string | null;

  method:
    string;

  path:
    string;
}

export interface BinanceRateLimitCooldownRecord {
  version:
    "1.0";

  observedAt:
    number;

  cooldownUntil:
    number;

  statusCode:
    number | null;

  apiCode:
    string | null;

  method:
    string;

  path:
    string;

  reason:
    string;

  recoveredAt:
    number | null;
}

export interface BinanceRateLimitCooldownDiagnostics {
  active:
    boolean;

  cooldownUntil:
    number | null;

  remainingMs:
    number;

  recoveryProbeRequired:
    boolean;

  lastObservedAt:
    number | null;

  lastStatusCode:
    number | null;

  lastApiCode:
    string | null;

  lastReason:
    string | null;

  suppressedRequests:
    number;

  persistenceError:
    string | null;
}

export interface BinanceRateLimitCooldownOptions {
  filePath?:
    string | null;

  defaultRateLimitCooldownMs?:
    number;

  defaultIpBanCooldownMs?:
    number;

  recoveryBufferMs?:
    number;

  now?:
    () => number;
}

export class BinanceRateLimitCooldownError
  extends Error {
  readonly code =
    "BINANCE_RATE_LIMIT_COOLDOWN";

  constructor(
    readonly cooldownUntil:
      number,

    readonly remainingMs:
      number,

    readonly path:
      string,
  ) {
    super(
      remainingMs >
        0
        ? `Binance REST request blocked by local rate-limit cooldown until ${cooldownUntil} (${remainingMs} ms remaining): ${path}.`
        : `Binance REST request blocked until the controlled post-cooldown server-time recovery probe succeeds: ${path}.`,
    );

    this.name =
      "BinanceRateLimitCooldownError";
  }
}

export class BinanceRateLimitCooldownService {
  private readonly now:
    () => number;

  private readonly defaultRateLimitCooldownMs:
    number;

  private readonly defaultIpBanCooldownMs:
    number;

  private readonly recoveryBufferMs:
    number;

  private readonly store:
    JsonlSnapshotStore<BinanceRateLimitCooldownRecord> | null;

  private record:
    BinanceRateLimitCooldownRecord | null =
    null;

  private suppressedRequests =
    0;

  private persistenceError:
    string | null =
    null;

  constructor(
    options:
      BinanceRateLimitCooldownOptions = {},
  ) {
    this.now =
      options.now ??
      (() => Date.now());

    this.defaultRateLimitCooldownMs =
      options.defaultRateLimitCooldownMs ??
      DEFAULT_RATE_LIMIT_COOLDOWN_MS;

    this.defaultIpBanCooldownMs =
      options.defaultIpBanCooldownMs ??
      DEFAULT_IP_BAN_COOLDOWN_MS;

    this.recoveryBufferMs =
      options.recoveryBufferMs ??
      DEFAULT_RECOVERY_BUFFER_MS;

    this.validateDuration(
      this.defaultRateLimitCooldownMs,
      "Default Binance rate-limit cooldown",
    );

    this.validateDuration(
      this.defaultIpBanCooldownMs,
      "Default Binance IP-ban cooldown",
    );

    this.validateDuration(
      this.recoveryBufferMs,
      "Binance cooldown recovery buffer",
      true,
    );

    const configuredPath =
      options.filePath ===
        undefined
        ? process.env
            .CAT_PRO_BINANCE_RATE_LIMIT_COOLDOWN_FILE
            ?.trim() ||
          resolve(
            "logs",
            "binance-rate-limit-cooldown.jsonl",
          )
        : options.filePath;

    this.store =
      configuredPath
        ? new JsonlSnapshotStore<BinanceRateLimitCooldownRecord>({
            filePath:
              configuredPath,

            isPayload:
              isBinanceRateLimitCooldownRecord,
          })
        : null;

    this.restore();
  }

  assertRequestAllowed(
    path:
      string,

    recoveryProbe =
      false,
  ): void {
    const diagnostics =
      this.getDiagnostics();

    if (
      !diagnostics.active &&
      !diagnostics.recoveryProbeRequired
    ) {
      return;
    }

    if (
      diagnostics.cooldownUntil ===
        null
    ) {
      return;
    }

    if (
      !diagnostics.active &&
      diagnostics.recoveryProbeRequired &&
      recoveryProbe
    ) {
      return;
    }

    this.suppressedRequests +=
      1;

    throw new BinanceRateLimitCooldownError(
      diagnostics.cooldownUntil,
      diagnostics.remainingMs,
      path,
    );
  }

  markRecoverySuccessful(): void {
    if (
      !this.record ||
      this.record.recoveredAt !==
        null
    ) {
      return;
    }

    const recoveredRecord:
      BinanceRateLimitCooldownRecord = {
      ...this.record,

      recoveredAt:
        this.now(),
    };

    this.record =
      recoveredRecord;

    this.persist(
      recoveredRecord,
    );
  }

  recordObservation(
    observation:
      BinanceRateLimitObservation,
  ): BinanceRateLimitCooldownRecord | null {
    if (
      !this.isRateLimitObservation(
        observation,
      )
    ) {
      return null;
    }

    const observedAt =
      this.now();

    const messageCooldownUntil =
      this.parseBanUntil(
        observation.message,
      );

    const retryAfterUntil =
      this.parseRetryAfter(
        observation.retryAfter,
        observedAt,
      );

    const fallbackDuration =
      observation.statusCode ===
        418 ||
      /\bban(?:ned)?\b/i.test(
        observation.message,
      )
        ? this.defaultIpBanCooldownMs
        : this.defaultRateLimitCooldownMs;

    const advertisedUntil =
      Math.max(
        messageCooldownUntil ??
          0,
        retryAfterUntil ??
          0,
      );

    const calculatedUntil =
      advertisedUntil >
        observedAt
        ? advertisedUntil +
          this.recoveryBufferMs
        : observedAt +
          fallbackDuration;

    const cooldownUntil =
      Math.max(
        calculatedUntil,
        this.record
          ?.cooldownUntil ??
          0,
      );

    const record:
      BinanceRateLimitCooldownRecord = {
      version:
        "1.0",

      observedAt,

      cooldownUntil,

      statusCode:
        observation.statusCode,

      apiCode:
        observation.apiCode,

      method:
        observation.method
          .trim()
          .toUpperCase(),

      path:
        observation.path
          .trim(),

      reason:
        observation.message
          .trim()
          .slice(
            0,
            MAXIMUM_REASON_LENGTH,
          ),

      recoveredAt:
        null,
    };

    this.record =
      record;

    this.persist(
      record,
    );

    return {
      ...record,
    };
  }

  getDiagnostics():
    BinanceRateLimitCooldownDiagnostics {
    const now =
      this.now();

    const cooldownUntil =
      this.record
        ?.cooldownUntil ??
      null;

    const remainingMs =
      cooldownUntil ===
        null ||
      this.record
        ?.recoveredAt !==
        null
        ? 0
        : Math.max(
            0,
            cooldownUntil -
              now,
          );

    return {
      active:
        remainingMs >
          0 &&
        this.record
          ?.recoveredAt ===
          null,

      cooldownUntil,

      remainingMs,

      recoveryProbeRequired:
        this.record !==
          null &&
        this.record.recoveredAt ===
          null,

      lastObservedAt:
        this.record
          ?.observedAt ??
        null,

      lastStatusCode:
        this.record
          ?.statusCode ??
        null,

      lastApiCode:
        this.record
          ?.apiCode ??
        null,

      lastReason:
        this.record
          ?.reason ??
        null,

      suppressedRequests:
        this.suppressedRequests,

      persistenceError:
        this.persistenceError,
    };
  }

  private restore(): void {
    if (!this.store) {
      return;
    }

    const record =
      this.store
        .readLatest();

    this.record =
      record;

    this.persistenceError =
      this.store
        .getDiagnostics()
        .lastError;
  }

  private persist(
    record:
      BinanceRateLimitCooldownRecord,
  ): void {
    if (!this.store) {
      return;
    }

    try {
      this.store.append(
        record,
      );

      this.persistenceError =
        null;
    } catch (
      error:
        unknown
    ) {
      this.persistenceError =
        error instanceof Error
          ? error.message
          : "Unknown Binance cooldown persistence failure.";
    }
  }

  private isRateLimitObservation(
    observation:
      BinanceRateLimitObservation,
  ): boolean {
    return (
      observation.statusCode ===
        418 ||
      observation.statusCode ===
        429 ||
      observation.apiCode ===
        "-1003"
    );
  }

  private parseBanUntil(
    message:
      string,
  ): number | null {
    const match =
      /\b(?:IP\s+)?banned\s+until\s+(\d{10,})\b/i.exec(
        message,
      );

    if (!match) {
      return null;
    }

    const timestamp =
      Number(
        match[1],
      );

    return Number.isSafeInteger(
      timestamp,
    ) &&
      timestamp >
        0
      ? timestamp
      : null;
  }

  private parseRetryAfter(
    value:
      string | null,
    observedAt:
      number,
  ): number | null {
    if (!value) {
      return null;
    }

    const seconds =
      Number(
        value,
      );

    if (
      Number.isFinite(
        seconds,
      ) &&
      seconds >=
        0
    ) {
      return observedAt +
        Math.ceil(
          seconds *
          1_000,
        );
    }

    const timestamp =
      Date.parse(
        value,
      );

    return Number.isFinite(
      timestamp,
    )
      ? timestamp
      : null;
  }

  private validateDuration(
    value:
      number,
    label:
      string,
    allowZero =
      false,
  ): void {
    if (
      !Number.isSafeInteger(
        value,
      ) ||
      value <
        (allowZero
          ? 0
          : 1_000)
    ) {
      throw new Error(
        `${label} must be a safe integer${allowZero ? "" : " of at least 1000 ms"}.`,
      );
    }
  }
}

function isBinanceRateLimitCooldownRecord(
  value:
    unknown,
): value is BinanceRateLimitCooldownRecord {
  if (
    typeof value !==
      "object" ||
    value ===
      null ||
    Array.isArray(
      value,
    )
  ) {
    return false;
  }

  const record =
    value as Record<
      string,
      unknown
    >;

  return (
    record.version ===
      "1.0" &&
    Number.isSafeInteger(
      record.observedAt,
    ) &&
    Number.isSafeInteger(
      record.cooldownUntil,
    ) &&
    typeof record.method ===
      "string" &&
    typeof record.path ===
      "string" &&
    typeof record.reason ===
      "string" &&
    (
      record.recoveredAt ===
        null ||
      Number.isSafeInteger(
        record.recoveredAt,
      )
    ) &&
    (
      record.statusCode ===
        null ||
      Number.isSafeInteger(
        record.statusCode,
      )
    ) &&
    (
      record.apiCode ===
        null ||
      typeof record.apiCode ===
        "string"
    )
  );
}

export const binanceRateLimitCooldownService =
  new BinanceRateLimitCooldownService();
