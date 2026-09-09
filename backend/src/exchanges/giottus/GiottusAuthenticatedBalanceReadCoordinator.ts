import {
  giottusAccountApi,
  type GiottusBalance,
} from "./api/GiottusAccountApi";

import type {
  GiottusCredentials,
} from "./api/GiottusCredentialsProvider";

import {
  giottusPrivateRequestGovernor,
  type GiottusPrivateRequestGovernorDiagnostics,
} from "./api/GiottusPrivateRequestGovernor";

import {
  GIOTTUS,
} from "./constants";

import {
  sensitiveDataRedactor,
} from "../../core/security/SensitiveDataRedactor";

export type GiottusBalanceEvidenceSource =
  | "REMOTE"
  | "CACHE"
  | "COALESCED";

export interface GiottusAuthenticatedBalanceEvidence {
  balances:
    readonly GiottusBalance[];

  observedAt: number;

  source:
    GiottusBalanceEvidenceSource;
}

export interface GiottusAuthenticatedBalanceReader {
  readBalances(
    credentials:
      GiottusCredentials,
  ): Promise<GiottusAuthenticatedBalanceEvidence>;

  getDiagnostics?():
    GiottusAuthenticatedBalanceReadDiagnostics;
}

export interface GiottusAuthenticatedBalanceReadDiagnostics {
  networkReads: number;

  successfulNetworkReads: number;

  cacheHits: number;

  coalescedReads: number;

  readInProgress: boolean;

  cacheTtlMs: number;

  lastObservedAt:
    number | null;

  lastError:
    string | null;

  requestGovernor:
    GiottusPrivateRequestGovernorDiagnostics;
}

interface GiottusBalanceApi {
  getBalances(
    credentials:
      GiottusCredentials,
  ): Promise<GiottusBalance[]>;
}

export interface GiottusAuthenticatedBalanceReadCoordinatorOptions {
  api?:
    GiottusBalanceApi;

  now?:
    () => number;

  cacheTtlMs?:
    number;

  getRequestGovernorDiagnostics?:
    () => GiottusPrivateRequestGovernorDiagnostics;
}

export class GiottusAuthenticatedBalanceReadCoordinator
implements GiottusAuthenticatedBalanceReader {
  private readonly api:
    GiottusBalanceApi;

  private readonly now:
    () => number;

  private readonly cacheTtlMs:
    number;

  private readonly getRequestGovernorDiagnostics:
    () => GiottusPrivateRequestGovernorDiagnostics;

  private inFlight:
    Promise<GiottusAuthenticatedBalanceEvidence> | null =
    null;

  private lastEvidence:
    GiottusAuthenticatedBalanceEvidence | null =
    null;

  private networkReads =
    0;

  private successfulNetworkReads =
    0;

  private cacheHits =
    0;

  private coalescedReads =
    0;

  private lastError:
    string | null = null;

  constructor(
    options:
      GiottusAuthenticatedBalanceReadCoordinatorOptions = {},
  ) {
    this.api =
      options.api ??
      giottusAccountApi;

    this.now =
      options.now ??
      (() => Date.now());

    this.cacheTtlMs =
      options.cacheTtlMs ??
      GIOTTUS.AUTHENTICATED_BALANCE_CACHE_MS;

    this.getRequestGovernorDiagnostics =
      options.getRequestGovernorDiagnostics ??
      (() =>
        giottusPrivateRequestGovernor
          .getDiagnostics());

    if (
      !Number.isSafeInteger(
        this.cacheTtlMs,
      ) ||
      this.cacheTtlMs <
        0 ||
      this.cacheTtlMs >=
        15_000
    ) {
      throw new Error(
        "Giottus authenticated-balance cache TTL must be a non-negative integer below the 15000 ms funding freshness boundary.",
      );
    }
  }

  async readBalances(
    credentials:
      GiottusCredentials,
  ): Promise<GiottusAuthenticatedBalanceEvidence> {
    const cached =
      this.getFreshCache();

    if (cached) {
      this.cacheHits +=
        1;

      return this.cloneEvidence(
        cached,
        "CACHE",
      );
    }

    if (
      this.inFlight
    ) {
      this.coalescedReads +=
        1;

      const evidence =
        await this.inFlight;

      return this.cloneEvidence(
        evidence,
        "COALESCED",
      );
    }

    const request =
      this.fetchBalances(
        credentials,
      );

    this.inFlight =
      request;

    try {
      return await request;
    } finally {
      if (
        this.inFlight ===
        request
      ) {
        this.inFlight =
          null;
      }
    }
  }

  getDiagnostics():
    GiottusAuthenticatedBalanceReadDiagnostics {
    return {
      networkReads:
        this.networkReads,
      successfulNetworkReads:
        this.successfulNetworkReads,
      cacheHits:
        this.cacheHits,
      coalescedReads:
        this.coalescedReads,
      readInProgress:
        this.inFlight !==
        null,
      cacheTtlMs:
        this.cacheTtlMs,
      lastObservedAt:
        this.lastEvidence
          ?.observedAt ??
        null,
      lastError:
        this.lastError,
      requestGovernor:
        this.getRequestGovernorDiagnostics(),
    };
  }

  private getFreshCache():
    GiottusAuthenticatedBalanceEvidence | null {
    if (
      !this.lastEvidence
    ) {
      return null;
    }

    const ageMs =
      this.now() -
      this.lastEvidence
        .observedAt;

    return (
      ageMs >=
        0 &&
      ageMs <=
        this.cacheTtlMs
    )
      ? this.lastEvidence
      : null;
  }

  private async fetchBalances(
    credentials:
      GiottusCredentials,
  ): Promise<GiottusAuthenticatedBalanceEvidence> {
    this.networkReads +=
      1;

    try {
      const balances =
        await this.api
          .getBalances(
            credentials,
          );

      const evidence:
        GiottusAuthenticatedBalanceEvidence = {
        balances:
          balances.map(
            (balance) => ({
              ...balance,
            }),
          ),
        observedAt:
          this.now(),
        source:
          "REMOTE",
      };

      this.lastEvidence =
        evidence;

      this.successfulNetworkReads +=
        1;

      this.lastError =
        null;

      return this.cloneEvidence(
        evidence,
        "REMOTE",
      );
    } catch (error: unknown) {
      this.lastError =
        sensitiveDataRedactor
          .redactString(
            error instanceof Error &&
            error.message.trim()
              ? error.message
              : "Giottus authenticated balance read failed.",
          )
          .slice(
            0,
            500,
          );

      throw error;
    }
  }

  private cloneEvidence(
    evidence:
      GiottusAuthenticatedBalanceEvidence,
    source:
      GiottusBalanceEvidenceSource,
  ): GiottusAuthenticatedBalanceEvidence {
    return {
      balances:
        evidence.balances
          .map(
            (balance) => ({
              ...balance,
            }),
          ),
      observedAt:
        evidence.observedAt,
      source,
    };
  }
}

export const giottusAuthenticatedBalanceReadCoordinator =
  new GiottusAuthenticatedBalanceReadCoordinator();
