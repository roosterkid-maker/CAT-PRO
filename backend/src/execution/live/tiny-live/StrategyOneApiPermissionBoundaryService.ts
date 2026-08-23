import {
  binanceAccountApi,
  type BinanceApiRestrictions,
} from "../../../exchanges/binance/api/BinanceAccountApi";

import {
  bybitAccountApi,
  type BybitApiKeyInformation,
} from "../../../exchanges/bybit/api/BybitAccountApi";

import {
  coinDCXAccountApi,
} from "../../../exchanges/coindcx/api/CoinDCXAccountApi";

import {
  coinDCXCredentialsProvider,
} from "../../../exchanges/coindcx/api/CoinDCXCredentialsProvider";

const DEFAULT_REFRESH_INTERVAL_MS =
  60_000;

const DEFAULT_MAXIMUM_EVIDENCE_AGE_MS =
  180_000;

export type StrategyOneApiPermissionVenueState =
  | "NOT_CHECKED"
  | "STALE"
  | "BLOCKED"
  | "READY";

export type StrategyOneApiPermissionExchange =
  | "binance"
  | "bybit"
  | "coindcx";

export interface StrategyOneApiPermissionVenueEvidence {
  readonly exchange: StrategyOneApiPermissionExchange;
  readonly state: StrategyOneApiPermissionVenueState;
  readonly checkedAt: number | null;
  readonly ageMs: number | null;
  readonly maximumAgeMs: number;
  readonly readingEnabled: boolean | null;
  readonly spotTradingEnabled: boolean | null;
  readonly withdrawalsEnabled: boolean | null;
  readonly internalTransferEnabled: boolean | null;
  readonly ipRestricted: boolean | null;
  readonly boundIpCount: number | null;
  readonly unexpectedPermissions: readonly string[];
  readonly systemManagedPermissions: readonly string[];
  readonly blockers: readonly string[];
}

export interface StrategyOneApiPermissionBoundaryReport {
  readonly version: "118.2";
  readonly generatedAt: number;
  readonly mode: "READ_ONLY_SIGNED_API_PERMISSION_EVIDENCE";
  readonly state: "BLOCKED" | "READY";
  readonly ready: boolean;
  readonly venues: readonly StrategyOneApiPermissionVenueEvidence[];
  readonly blockers: readonly string[];
  readonly safety: {
    readonly signedGetOnly: true;
    readonly apiKeysExposed: false;
    readonly exactBoundIpsExposed: false;
    readonly permissionMutationAllowed: false;
    readonly transferAllowed: false;
    readonly withdrawalAllowed: false;
    readonly orderSubmissionAllowed: false;
    readonly orderSubmissionPerformed: false;
  };
}

interface NormalizedPermissionObservation {
  readonly checkedAt: number;
  readonly readingEnabled: boolean | null;
  readonly spotTradingEnabled: boolean | null;
  readonly withdrawalsEnabled: boolean | null;
  readonly internalTransferEnabled: boolean | null;
  readonly ipRestricted: boolean | null;
  readonly boundIpCount: number | null;
  readonly unexpectedPermissions: readonly string[];
  readonly systemManagedPermissions: readonly string[];
  readonly error: string | null;
}

export interface StrategyOneApiPermissionBoundaryDependencies {
  readBinanceApiRestrictions(): Promise<BinanceApiRestrictions>;
  readBybitApiKeyInformation(): Promise<BybitApiKeyInformation>;
  readCoinDCXApiKeyInformation(): Promise<{
    readonly readingEnabled: boolean;
    readonly spotTradingEnabled: boolean | null;
    readonly withdrawalsEnabled: boolean | null;
    readonly internalTransferEnabled: boolean | null;
    readonly ipRestricted: boolean | null;
  }>;
}

export interface StrategyOneApiPermissionBoundaryConfig {
  readonly refreshIntervalMs: number;
  readonly maximumEvidenceAgeMs: number;
}

const DEFAULT_DEPENDENCIES:
  StrategyOneApiPermissionBoundaryDependencies = {
  readBinanceApiRestrictions:
    () =>
      binanceAccountApi
        .getApiRestrictions(),
  readBybitApiKeyInformation:
    () =>
      bybitAccountApi
        .getApiKeyInformation(),
  readCoinDCXApiKeyInformation:
    async () => {
      await coinDCXAccountApi.getBalances(
        coinDCXCredentialsProvider
          .getCredentials(),
      );

      return {
        readingEnabled:
          true,
        spotTradingEnabled:
          confirmedEnvironmentFlag(
            "COINDCX_SPOT_TRADE_PERMISSION_CONFIRMED",
          ),
        withdrawalsEnabled:
          confirmedEnvironmentFlag(
            "COINDCX_WITHDRAWAL_PERMISSION_DISABLED_CONFIRMED",
          )
            ? false
            : null,
        internalTransferEnabled:
          confirmedEnvironmentFlag(
            "COINDCX_INTERNAL_TRANSFER_PERMISSION_DISABLED_CONFIRMED",
          )
            ? false
            : null,
        ipRestricted:
          confirmedEnvironmentFlag(
            "COINDCX_IP_ALLOWLIST_CONFIRMED",
          ),
      };
    },
};

/**
 * Maintains fail-closed, read-only evidence that the two initial Tiny-LIVE
 * API keys can trade spot, cannot withdraw and are bound to explicit IPs.
 * It never changes an exchange permission, moves funds or submits an order.
 */
export class StrategyOneApiPermissionBoundaryService {
  private readonly dependencies:
    StrategyOneApiPermissionBoundaryDependencies;

  private readonly config:
    StrategyOneApiPermissionBoundaryConfig;

  private observations =
    new Map<
      StrategyOneApiPermissionExchange,
      NormalizedPermissionObservation
    >();

  private refreshPromise:
    Promise<StrategyOneApiPermissionBoundaryReport> | null =
    null;

  private timer:
    NodeJS.Timeout | null =
    null;

  constructor(
    dependencies:
      Partial<StrategyOneApiPermissionBoundaryDependencies> = {},
    config:
      Partial<StrategyOneApiPermissionBoundaryConfig> = {},
  ) {
    this.dependencies = {
      ...DEFAULT_DEPENDENCIES,
      ...dependencies,
    };

    this.config = {
      refreshIntervalMs:
        config.refreshIntervalMs ??
        DEFAULT_REFRESH_INTERVAL_MS,
      maximumEvidenceAgeMs:
        config.maximumEvidenceAgeMs ??
        DEFAULT_MAXIMUM_EVIDENCE_AGE_MS,
    };

    if (
      !Number.isSafeInteger(
        this.config.refreshIntervalMs,
      ) ||
      this.config.refreshIntervalMs <
        1_000 ||
      !Number.isSafeInteger(
        this.config.maximumEvidenceAgeMs,
      ) ||
      this.config.maximumEvidenceAgeMs <
        this.config.refreshIntervalMs
    ) {
      throw new Error(
        "Strategy #1 API permission evidence timing configuration is invalid.",
      );
    }
  }

  start(): void {
    if (this.timer) {
      return;
    }

    void this.refresh();

    this.timer =
      setInterval(
        () => {
          void this.refresh();
        },
        this.config.refreshIntervalMs,
      );

    this.timer.unref();
  }

  stop(): void {
    if (!this.timer) {
      return;
    }

    clearInterval(
      this.timer,
    );

    this.timer =
      null;
  }

  async refresh(
    now =
      Date.now(),
  ): Promise<StrategyOneApiPermissionBoundaryReport> {
    assertTimestamp(
      now,
    );

    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise =
      this.performRefresh(
        now,
      );

    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise =
        null;
    }
  }

  getReport(
    now =
      Date.now(),
  ): StrategyOneApiPermissionBoundaryReport {
    return this.getReportForVenues(
      [
        "binance",
        "bybit",
      ],
      now,
    );
  }

  getReportForVenues(
    requiredVenues:
      readonly StrategyOneApiPermissionExchange[],
    now =
      Date.now(),
  ): StrategyOneApiPermissionBoundaryReport {
    assertTimestamp(
      now,
    );

    const normalizedVenues =
      [
        ...new Set(
          requiredVenues,
        ),
      ];

    if (
      normalizedVenues.length <
        1
    ) {
      throw new Error(
        "At least one Strategy #1 API permission venue is required.",
      );
    }

    const venues =
      normalizedVenues.map(
        (exchange) =>
          this.buildVenueEvidence(
            exchange,
            now,
          ),
      );

    const ready =
      venues.every(
        (venue) =>
          venue.state ===
          "READY",
      );

    const blockers =
      venues.flatMap(
        (venue) =>
          venue.blockers.map(
            (blocker) =>
              `${venue.exchange}: ${blocker}`,
          ),
      );

    return freeze({
      version:
        "118.2" as const,
      generatedAt:
        now,
      mode:
        "READ_ONLY_SIGNED_API_PERMISSION_EVIDENCE" as const,
      state:
        ready
          ? "READY" as const
          : "BLOCKED" as const,
      ready,
      venues,
      blockers,
      safety: {
        signedGetOnly:
          true as const,
        apiKeysExposed:
          false as const,
        exactBoundIpsExposed:
          false as const,
        permissionMutationAllowed:
          false as const,
        transferAllowed:
          false as const,
        withdrawalAllowed:
          false as const,
        orderSubmissionAllowed:
          false as const,
        orderSubmissionPerformed:
          false as const,
      },
    });
  }

  private async performRefresh(
    checkedAt: number,
  ): Promise<StrategyOneApiPermissionBoundaryReport> {
    const [binance, bybit, coindcx] =
      await Promise.allSettled([
        this.dependencies
          .readBinanceApiRestrictions(),
        this.dependencies
          .readBybitApiKeyInformation(),
        this.dependencies
          .readCoinDCXApiKeyInformation(),
      ]);

    this.observations.set(
      "binance",
      binance.status ===
        "fulfilled"
        ? {
            checkedAt,
            readingEnabled:
              binance.value.readingEnabled,
            spotTradingEnabled:
              binance.value.spotAndMarginTradingEnabled,
            withdrawalsEnabled:
              binance.value.withdrawalsEnabled,
            internalTransferEnabled:
              binance.value.internalTransferEnabled,
            ipRestricted:
              binance.value.ipRestricted,
            boundIpCount:
              null,
            unexpectedPermissions:
              [],
            systemManagedPermissions:
              [],
            error:
              null,
          }
        : failedObservation(
            checkedAt,
          ),
    );

    this.observations.set(
      "bybit",
      bybit.status ===
        "fulfilled"
        ? {
            checkedAt,
            readingEnabled:
              true,
            spotTradingEnabled:
              !bybit.value.readOnly &&
              bybit.value.spotTradingEnabled,
            withdrawalsEnabled:
              bybit.value.withdrawalsEnabled,
            internalTransferEnabled:
              bybit.value.internalTransferEnabled,
            ipRestricted:
              bybit.value.ipRestricted,
            boundIpCount:
              bybit.value.boundIpCount,
            unexpectedPermissions:
              bybit.value.unexpectedPermissions,
            systemManagedPermissions:
              bybit.value.systemManagedPermissions,
            error:
              null,
          }
        : failedObservation(
            checkedAt,
          ),
    );

    this.observations.set(
      "coindcx",
      coindcx.status ===
        "fulfilled"
        ? {
            checkedAt,
            readingEnabled:
              coindcx.value.readingEnabled,
            spotTradingEnabled:
              coindcx.value.spotTradingEnabled,
            withdrawalsEnabled:
              coindcx.value.withdrawalsEnabled,
            internalTransferEnabled:
              coindcx.value.internalTransferEnabled,
            ipRestricted:
              coindcx.value.ipRestricted,
            boundIpCount:
              null,
            unexpectedPermissions:
              [],
            systemManagedPermissions:
              [],
            error:
              null,
          }
        : failedObservation(
            checkedAt,
          ),
    );

    return this.getReport(
      checkedAt,
    );
  }

  private buildVenueEvidence(
    exchange: StrategyOneApiPermissionExchange,
    now: number,
  ): StrategyOneApiPermissionVenueEvidence {
    const observation =
      this.observations.get(
        exchange,
      );

    if (!observation) {
      return venueEvidence(
        exchange,
        "NOT_CHECKED",
        null,
        null,
        this.config.maximumEvidenceAgeMs,
        null,
        null,
        null,
        null,
        null,
        null,
        [],
        [],
        [
          "Signed API permission evidence has not been refreshed.",
        ],
      );
    }

    const ageMs =
      Math.max(
        0,
        now -
          observation.checkedAt,
      );

    if (
      ageMs >
      this.config.maximumEvidenceAgeMs
    ) {
      return venueEvidence(
        exchange,
        "STALE",
        observation.checkedAt,
        ageMs,
        this.config.maximumEvidenceAgeMs,
        observation.readingEnabled,
        observation.spotTradingEnabled,
        observation.withdrawalsEnabled,
        observation.internalTransferEnabled,
        observation.ipRestricted,
        observation.boundIpCount,
        observation.unexpectedPermissions,
        observation.systemManagedPermissions,
        [
          `Signed API permission evidence is ${ageMs} ms old; maximum is ${this.config.maximumEvidenceAgeMs} ms.`,
        ],
      );
    }

    const blockers:
      string[] = [];

    if (observation.error) {
      blockers.push(
        observation.error,
      );
    }

    if (
      observation.readingEnabled !==
      true
    ) {
      blockers.push(
        "API reading permission is not verified as enabled.",
      );
    }

    if (
      observation.spotTradingEnabled !==
      true
    ) {
      blockers.push(
        "Spot trading permission is not verified as enabled.",
      );
    }

    if (
      observation.withdrawalsEnabled !==
      false
    ) {
      blockers.push(
        observation.withdrawalsEnabled
          ? "API withdrawal permission is enabled and must be disabled."
          : "API withdrawal permission is not authoritatively verified as disabled.",
      );
    }

    if (
      observation.internalTransferEnabled !==
      false
    ) {
      blockers.push(
        observation.internalTransferEnabled
          ? "API internal-transfer permission is enabled and must be disabled."
          : "API internal-transfer permission is not authoritatively verified as disabled.",
      );
    }

    if (
      observation.ipRestricted !==
      true
    ) {
      blockers.push(
        "API key is not verified as bound to an explicit IP allowlist.",
      );
    }

    if (
      observation.unexpectedPermissions.length >
      0
    ) {
      blockers.push(
        `Unexpected API permissions must be removed: ${observation.unexpectedPermissions.join(
          ", ",
        )}.`,
      );
    }

    return venueEvidence(
      exchange,
      blockers.length ===
        0
        ? "READY"
        : "BLOCKED",
      observation.checkedAt,
      ageMs,
      this.config.maximumEvidenceAgeMs,
      observation.readingEnabled,
      observation.spotTradingEnabled,
      observation.withdrawalsEnabled,
      observation.internalTransferEnabled,
      observation.ipRestricted,
      observation.boundIpCount,
      observation.unexpectedPermissions,
      observation.systemManagedPermissions,
      blockers,
    );
  }
}

function failedObservation(
  checkedAt: number,
): NormalizedPermissionObservation {
  return {
    checkedAt,
    readingEnabled:
      null,
    spotTradingEnabled:
      null,
    withdrawalsEnabled:
      null,
    internalTransferEnabled:
      null,
    ipRestricted:
      null,
    boundIpCount:
      null,
    unexpectedPermissions:
      [],
    systemManagedPermissions:
      [],
    error:
      "Signed API permission verification failed.",
  };
}

function venueEvidence(
  exchange: StrategyOneApiPermissionExchange,
  state: StrategyOneApiPermissionVenueState,
  checkedAt: number | null,
  ageMs: number | null,
  maximumAgeMs: number,
  readingEnabled: boolean | null,
  spotTradingEnabled: boolean | null,
  withdrawalsEnabled: boolean | null,
  internalTransferEnabled: boolean | null,
  ipRestricted: boolean | null,
  boundIpCount: number | null,
  unexpectedPermissions: readonly string[],
  systemManagedPermissions: readonly string[],
  blockers: readonly string[],
): StrategyOneApiPermissionVenueEvidence {
  return {
    exchange,
    state,
    checkedAt,
    ageMs,
    maximumAgeMs,
    readingEnabled,
    spotTradingEnabled,
    withdrawalsEnabled,
    internalTransferEnabled,
    ipRestricted,
    boundIpCount,
    unexpectedPermissions: [
      ...unexpectedPermissions,
    ],
    systemManagedPermissions: [
      ...systemManagedPermissions,
    ],
    blockers: [
      ...blockers,
    ],
  };
}

function confirmedEnvironmentFlag(
  name: string,
): boolean | null {
  const value =
    process.env[name]
      ?.trim()
      .toLowerCase();

  if (!value) {
    return null;
  }

  if (
    value ===
      "true" ||
    value ===
      "1"
  ) {
    return true;
  }

  if (
    value ===
      "false" ||
    value ===
      "0"
  ) {
    return false;
  }

  return null;
}

function assertTimestamp(
  now: number,
): void {
  if (
    !Number.isSafeInteger(
      now,
    ) ||
    now <=
      0
  ) {
    throw new Error(
      "Strategy #1 API permission evidence timestamp must be a positive safe integer.",
    );
  }
}

function freeze<T>(
  value: T,
): T {
  if (
    typeof value !==
      "object" ||
    value ===
      null ||
    Object.isFrozen(
      value,
    )
  ) {
    return value;
  }

  for (
    const nested
    of Object.values(
      value,
    )
  ) {
    freeze(
      nested,
    );
  }

  return Object.freeze(
    value,
  );
}

export const strategyOneApiPermissionBoundaryService =
  new StrategyOneApiPermissionBoundaryService();
