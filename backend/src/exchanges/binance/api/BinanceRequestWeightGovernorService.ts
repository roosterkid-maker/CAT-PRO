import {
  resolve,
} from "node:path";

import {
  JsonlSnapshotStore,
} from "../../../core/persistence/JsonlSnapshotStore";

import type {
  BinanceRequestParameters,
} from "./BinanceSigner";

import {
  binanceRateLimitCooldownService,
  type BinanceRateLimitCooldownService,
  type BinanceRateLimitObservation,
} from "./BinanceRateLimitCooldownService";

const REQUEST_WEIGHT_WINDOW_MS =
  60_000;

const DEFAULT_LOCAL_BACKGROUND_WEIGHT_LIMIT =
  3_000;

const DEFAULT_LOCAL_CRITICAL_WEIGHT_LIMIT =
  4_200;

const DEFAULT_UPSTREAM_WEIGHT_LIMIT =
  4_500;

const DEFAULT_PROACTIVE_HOLD_MS =
  65_000;

const MAXIMUM_PATH_DIAGNOSTICS =
  20;

export interface BinanceRequestAdmission {
  readonly admittedAt: number;
  readonly method: string;
  readonly path: string;
  readonly canonicalPath: string;
  readonly estimatedWeight: number;
  readonly recoveryProbe: boolean;
}

export interface BinanceRequestWeightObservation {
  readonly admission: BinanceRequestAdmission;
  readonly usedWeightOneMinute: unknown;
}

export interface BinanceRequestWeightPathDiagnostics {
  readonly path: string;
  readonly requests: number;
  readonly estimatedWeight: number;
}

export interface BinanceRequestWeightGovernorDiagnostics {
  readonly active: boolean;
  readonly holdUntil: number | null;
  readonly remainingMs: number;
  readonly recoveryProbeRequired: boolean;
  readonly lastTriggeredAt: number | null;
  readonly lastTrigger: string | null;
  readonly localEstimatedWeightOneMinute: number;
  readonly upstreamUsedWeightOneMinute: number | null;
  readonly upstreamWeightObservedAt: number | null;
  readonly backgroundWeightLimit: number;
  readonly criticalWeightLimit: number;
  readonly upstreamWeightLimit: number;
  readonly admittedRequests: number;
  readonly suppressedRequests: number;
  readonly pathDiagnostics: readonly BinanceRequestWeightPathDiagnostics[];
  readonly persistenceError: string | null;
}

interface BinanceRequestWeightGovernorRecord {
  readonly version: "1.0";
  readonly triggeredAt: number;
  readonly holdUntil: number;
  readonly trigger: string;
  readonly localEstimatedWeightOneMinute: number;
  readonly upstreamUsedWeightOneMinute: number | null;
  readonly recoveredAt: number | null;
}

interface RequestWeightEvent {
  readonly observedAt: number;
  readonly path: string;
  readonly weight: number;
}

export interface BinanceRequestWeightGovernorOptions {
  readonly cooldownService?: BinanceRateLimitCooldownService;
  readonly filePath?: string | null;
  readonly backgroundWeightLimit?: number;
  readonly criticalWeightLimit?: number;
  readonly upstreamWeightLimit?: number;
  readonly proactiveHoldMs?: number;
  readonly now?: () => number;
}

export class BinanceRequestWeightGovernorError
  extends Error {
  readonly code =
    "BINANCE_REQUEST_WEIGHT_GOVERNOR";

  constructor(
    readonly holdUntil: number,
    readonly remainingMs: number,
    readonly path: string,
  ) {
    super(
      remainingMs > 0
        ? `Binance REST request blocked by proactive request-weight governor until ${holdUntil} (${remainingMs} ms remaining): ${path}.`
        : `Binance REST request blocked until the controlled post-governor server-time recovery probe succeeds: ${path}.`,
    );

    this.name =
      "BinanceRequestWeightGovernorError";
  }
}

/**
 * Shared fail-closed admission control for every Binance Spot REST caller.
 *
 * Binance's limit is IP-wide, so a per-feature timer cannot protect the
 * process. This governor combines conservative local accounting with the
 * authoritative X-MBX-USED-WEIGHT-1M value returned by Binance. Public
 * WebSocket market data is unaffected; only REST I/O is admitted here.
 */
export class BinanceRequestWeightGovernorService {
  private readonly cooldownService:
    BinanceRateLimitCooldownService;

  private readonly now:
    () => number;

  private readonly backgroundWeightLimit:
    number;

  private readonly criticalWeightLimit:
    number;

  private readonly upstreamWeightLimit:
    number;

  private readonly proactiveHoldMs:
    number;

  private readonly store:
    JsonlSnapshotStore<BinanceRequestWeightGovernorRecord> | null;

  private readonly events:
    RequestWeightEvent[] = [];

  private record:
    BinanceRequestWeightGovernorRecord | null = null;

  private upstreamUsedWeightOneMinute:
    number | null = null;

  private upstreamWeightObservedAt:
    number | null = null;

  private admittedRequests =
    0;

  private suppressedRequests =
    0;

  private persistenceError:
    string | null = null;

  constructor(
    options:
      BinanceRequestWeightGovernorOptions = {},
  ) {
    this.cooldownService =
      options.cooldownService ??
      binanceRateLimitCooldownService;

    this.now =
      options.now ??
      (() => Date.now());

    this.backgroundWeightLimit =
      options.backgroundWeightLimit ??
      DEFAULT_LOCAL_BACKGROUND_WEIGHT_LIMIT;

    this.criticalWeightLimit =
      options.criticalWeightLimit ??
      DEFAULT_LOCAL_CRITICAL_WEIGHT_LIMIT;

    this.upstreamWeightLimit =
      options.upstreamWeightLimit ??
      DEFAULT_UPSTREAM_WEIGHT_LIMIT;

    this.proactiveHoldMs =
      options.proactiveHoldMs ??
      DEFAULT_PROACTIVE_HOLD_MS;

    this.validateConfiguration();

    const configuredPath =
      options.filePath === undefined
        ? process.env
            .CAT_PRO_BINANCE_REQUEST_WEIGHT_GOVERNOR_FILE
            ?.trim() ||
          resolve(
            "logs",
            "binance-request-weight-governor.jsonl",
          )
        : options.filePath;

    this.store =
      configuredPath
        ? new JsonlSnapshotStore<BinanceRequestWeightGovernorRecord>({
            filePath:
              configuredPath,
            isPayload:
              isBinanceRequestWeightGovernorRecord,
          })
        : null;

    this.restore();
  }

  admitRequest(
    input: {
      readonly method: string;
      readonly path: string;
      readonly parameters?: BinanceRequestParameters;
      readonly recoveryProbe?: boolean;
    },
  ): BinanceRequestAdmission {
    const method =
      input.method
        .trim()
        .toUpperCase();

    const path =
      input.path
        .trim();

    const recoveryProbe =
      input.recoveryProbe === true;

    this.assertRequestAllowed(
      path,
      recoveryProbe,
    );

    const now =
      this.now();

    this.pruneEvents(
      now,
    );

    const canonicalPath =
      canonicalizeBinancePath(
        path,
      );

    const estimatedWeight =
      estimateBinanceSpotRequestWeight(
        method,
        canonicalPath,
        input.parameters ?? {},
      );

    const localWeight =
      this.localEstimatedWeight();

    const localLimit =
      isCriticalBinancePath(
        method,
        canonicalPath,
      )
        ? this.criticalWeightLimit
        : this.backgroundWeightLimit;

    if (
      localWeight +
        estimatedWeight >
      localLimit
    ) {
      this.activateHold(
        `Local rolling Binance request weight would reach ${localWeight + estimatedWeight}, above the ${localLimit} admission limit.`,
        now,
      );

      this.suppressedRequests +=
        1;

      throw new BinanceRequestWeightGovernorError(
        this.record
          ?.holdUntil ??
          now,
        this.proactiveHoldMs,
        path,
      );
    }

    return this.commitAdmission(
      method,
      path,
      input.parameters ?? {},
      recoveryProbe,
      now,
    );
  }

  assertRequestAllowed(
    pathValue: string,
    recoveryProbe =
      false,
  ): void {
    const path =
      pathValue.trim();

    this.cooldownService
      .assertRequestAllowed(
        path,
        recoveryProbe,
      );

    const diagnostics =
      this.getDiagnostics();

    if (
      !diagnostics.active &&
      !diagnostics.recoveryProbeRequired
    ) {
      return;
    }

    if (
      !diagnostics.active &&
      recoveryProbe
    ) {
      return;
    }

    this.suppressedRequests +=
      1;

    throw new BinanceRequestWeightGovernorError(
      diagnostics.holdUntil ??
        this.now(),
      diagnostics.remainingMs,
      path,
    );
  }

  recordSuccessfulResponse(
    observation:
      BinanceRequestWeightObservation,
  ): void {
    const usedWeight =
      this.toNonNegativeInteger(
        observation.usedWeightOneMinute,
      );

    if (usedWeight === null) {
      return;
    }

    const observedAt =
      this.now();

    this.upstreamUsedWeightOneMinute =
      usedWeight;

    this.upstreamWeightObservedAt =
      observedAt;

    if (
      usedWeight >=
      this.upstreamWeightLimit
    ) {
      this.activateHold(
        `Binance reported ${usedWeight} used request weight in one minute, reaching the proactive ${this.upstreamWeightLimit} limit after ${observation.admission.method} ${observation.admission.canonicalPath}.`,
        observedAt,
      );
    }
  }

  recordRateLimitObservation(
    observation:
      BinanceRateLimitObservation,
  ): void {
    this.cooldownService
      .recordObservation(
        observation,
      );
  }

  getRecoveryEpoch():
    number | null {
    const diagnostics =
      this.getDiagnostics();

    return !diagnostics.active &&
      diagnostics.recoveryProbeRequired
      ? diagnostics.lastTriggeredAt
      : null;
  }

  markRecoverySuccessful(
    recoveryEpoch:
      number | null,
  ): void {
    this.cooldownService
      .markRecoverySuccessful();

    if (
      recoveryEpoch === null ||
      this.record?.triggeredAt !==
        recoveryEpoch ||
      this.record.recoveredAt !==
        null
    ) {
      return;
    }

    const recoveredRecord:
      BinanceRequestWeightGovernorRecord = {
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

  getDiagnostics():
    BinanceRequestWeightGovernorDiagnostics {
    const now =
      this.now();

    this.pruneEvents(
      now,
    );

    const holdUntil =
      this.record
        ?.holdUntil ??
      null;

    const remainingMs =
      holdUntil === null ||
      this.record?.recoveredAt !==
        null
        ? 0
        : Math.max(
            0,
            holdUntil -
              now,
          );

    const byPath =
      new Map<
        string,
        {
          requests: number;
          estimatedWeight: number;
        }
      >();

    for (const event of this.events) {
      const current =
        byPath.get(
          event.path,
        ) ?? {
          requests:
            0,
          estimatedWeight:
            0,
        };

      current.requests +=
        1;
      current.estimatedWeight +=
        event.weight;

      byPath.set(
        event.path,
        current,
      );
    }

    const pathDiagnostics =
      [...byPath.entries()]
        .map(
          ([
            path,
            value,
          ]) => ({
            path,
            requests:
              value.requests,
            estimatedWeight:
              value.estimatedWeight,
          }),
        )
        .sort(
          (first, second) =>
            second.estimatedWeight -
              first.estimatedWeight ||
            first.path.localeCompare(
              second.path,
            ),
        )
        .slice(
          0,
          MAXIMUM_PATH_DIAGNOSTICS,
        );

    return {
      active:
        remainingMs >
          0 &&
        this.record?.recoveredAt ===
          null,
      holdUntil,
      remainingMs,
      recoveryProbeRequired:
        this.record !==
          null &&
        this.record.recoveredAt ===
          null,
      lastTriggeredAt:
        this.record
          ?.triggeredAt ??
        null,
      lastTrigger:
        this.record
          ?.trigger ??
        null,
      localEstimatedWeightOneMinute:
        this.localEstimatedWeight(),
      upstreamUsedWeightOneMinute:
        this.upstreamUsedWeightOneMinute,
      upstreamWeightObservedAt:
        this.upstreamWeightObservedAt,
      backgroundWeightLimit:
        this.backgroundWeightLimit,
      criticalWeightLimit:
        this.criticalWeightLimit,
      upstreamWeightLimit:
        this.upstreamWeightLimit,
      admittedRequests:
        this.admittedRequests,
      suppressedRequests:
        this.suppressedRequests,
      pathDiagnostics,
      persistenceError:
        this.persistenceError,
    };
  }

  private commitAdmission(
    method: string,
    path: string,
    parameters: BinanceRequestParameters,
    recoveryProbe: boolean,
    admittedAt: number,
  ): BinanceRequestAdmission {
    const canonicalPath =
      canonicalizeBinancePath(
        path,
      );

    const estimatedWeight =
      estimateBinanceSpotRequestWeight(
        method,
        canonicalPath,
        parameters,
      );

    this.events.push({
      observedAt:
        admittedAt,
      path:
        canonicalPath,
      weight:
        estimatedWeight,
    });

    this.admittedRequests +=
      1;

    return {
      admittedAt,
      method,
      path,
      canonicalPath,
      estimatedWeight,
      recoveryProbe,
    };
  }

  private activateHold(
    trigger: string,
    triggeredAt: number,
  ): void {
    const holdUntil =
      Math.max(
        triggeredAt +
          this.proactiveHoldMs,
        this.record?.recoveredAt ===
          null
          ? this.record.holdUntil
          : 0,
      );

    const record:
      BinanceRequestWeightGovernorRecord = {
      version:
        "1.0",
      triggeredAt,
      holdUntil,
      trigger:
        trigger.slice(
          0,
          500,
        ),
      localEstimatedWeightOneMinute:
        this.localEstimatedWeight(),
      upstreamUsedWeightOneMinute:
        this.upstreamUsedWeightOneMinute,
      recoveredAt:
        null,
    };

    this.record =
      record;

    this.persist(
      record,
    );
  }

  private localEstimatedWeight():
    number {
    return this.events.reduce(
      (total, event) =>
        total +
        event.weight,
      0,
    );
  }

  private pruneEvents(
    now: number,
  ): void {
    const oldestAllowed =
      now -
      REQUEST_WEIGHT_WINDOW_MS;

    while (
      this.events.length >
        0 &&
      this.events[0]!.observedAt <=
        oldestAllowed
    ) {
      this.events.shift();
    }

    if (
      this.upstreamWeightObservedAt !==
        null &&
      this.upstreamWeightObservedAt <=
        oldestAllowed
    ) {
      this.upstreamUsedWeightOneMinute =
        null;
      this.upstreamWeightObservedAt =
        null;
    }
  }

  private restore(): void {
    if (!this.store) {
      return;
    }

    this.record =
      this.store
        .readLatest();

    this.persistenceError =
      this.store
        .getDiagnostics()
        .lastError;
  }

  private persist(
    record:
      BinanceRequestWeightGovernorRecord,
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
          : "Unknown Binance request-weight governor persistence failure.";
    }
  }

  private toNonNegativeInteger(
    value: unknown,
  ): number | null {
    const normalized =
      typeof value ===
        "string"
        ? Number(
            value.trim(),
          )
        : Number(
            value,
          );

    return Number.isSafeInteger(
      normalized,
    ) &&
      normalized >=
        0
      ? normalized
      : null;
  }

  private validateConfiguration():
    void {
    for (
      const [
        label,
        value,
      ] of [
        [
          "Binance background request-weight limit",
          this.backgroundWeightLimit,
        ],
        [
          "Binance critical request-weight limit",
          this.criticalWeightLimit,
        ],
        [
          "Binance upstream request-weight limit",
          this.upstreamWeightLimit,
        ],
        [
          "Binance proactive hold",
          this.proactiveHoldMs,
        ],
      ] as const
    ) {
      if (
        !Number.isSafeInteger(
          value,
        ) ||
        value <
          1
      ) {
        throw new Error(
          `${label} must be a positive safe integer.`,
        );
      }
    }

    if (
      this.backgroundWeightLimit >=
        this.criticalWeightLimit ||
      this.criticalWeightLimit >=
        this.upstreamWeightLimit
    ) {
      throw new Error(
        "Binance request-weight limits must satisfy background < critical < upstream.",
      );
    }
  }
}

export function canonicalizeBinancePath(
  value: string,
): string {
  const normalized =
    value.trim();

  try {
    return new URL(
      normalized,
      "https://api.binance.com",
    ).pathname;
  } catch {
    return normalized.split(
      "?",
      1,
    )[0] ??
      normalized;
  }
}

export function estimateBinanceSpotRequestWeight(
  methodValue: string,
  pathValue: string,
  parameters:
    BinanceRequestParameters = {},
): number {
  const method =
    methodValue
      .trim()
      .toUpperCase();

  const path =
    canonicalizeBinancePath(
      pathValue,
    );

  switch (path) {
    case "/api/v3/time":
      return 1;

    case "/api/v3/exchangeInfo":
      return 20;

    case "/api/v3/ticker/24hr":
      if (parameters.symbol !== undefined) {
        return 2;
      }

      return 80;

    case "/api/v3/ticker/price":
      return parameters.symbol !== undefined
        ? 2
        : 4;

    case "/api/v3/depth": {
      const limit =
        Number(
          parameters.limit ??
            100,
        );

      if (limit <= 100) {
        return 2;
      }

      if (limit <= 500) {
        return 10;
      }

      if (limit <= 1_000) {
        return 20;
      }

      return 100;
    }

    case "/api/v3/account":
      return 20;

    case "/api/v3/account/commission":
      return 20;

    case "/api/v3/myTrades":
      return 20;

    case "/api/v3/openOrders":
      return parameters.symbol !== undefined
        ? 6
        : 80;

    case "/api/v3/order":
      return method ===
        "GET"
        ? 4
        : 1;

    case "/api/v3/order/test":
      return 1;

    case "/sapi/v1/account/apiRestrictions":
      return 20;

    default:
      return method ===
        "GET"
        ? 20
        : 5;
  }
}

function isCriticalBinancePath(
  method: string,
  path: string,
): boolean {
  return (
    path ===
      "/api/v3/time" ||
    (
      path ===
        "/api/v3/order" &&
      method !==
        "GET"
    )
  );
}

function isBinanceRequestWeightGovernorRecord(
  value: unknown,
): value is BinanceRequestWeightGovernorRecord {
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
      record.triggeredAt,
    ) &&
    Number.isSafeInteger(
      record.holdUntil,
    ) &&
    typeof record.trigger ===
      "string" &&
    Number.isSafeInteger(
      record.localEstimatedWeightOneMinute,
    ) &&
    (
      record.upstreamUsedWeightOneMinute ===
        null ||
      Number.isSafeInteger(
        record.upstreamUsedWeightOneMinute,
      )
    ) &&
    (
      record.recoveredAt ===
        null ||
      Number.isSafeInteger(
        record.recoveredAt,
      )
    )
  );
}

export const binanceRequestWeightGovernorService =
  new BinanceRequestWeightGovernorService();
