import {
  createHash,
} from "node:crypto";

import {
  resolve,
} from "node:path";

import type {
  ArbitrageOpportunity,
} from "../../../arbitrage/models/ArbitrageOpportunity";

import {
  opportunityService,
} from "../../../arbitrage/services/OpportunityService";

import type {
  ArbitrageLiveExecutionResult,
} from "../../../arbitrage/execution/models/ArbitrageLiveExecutionResult";

import {
  JsonlSnapshotStore,
} from "../../../core/persistence/JsonlSnapshotStore";

import {
  strategyOneTwoLegRecoveryResolutionService,
} from "../recovery/StrategyOneTwoLegRecoveryResolutionService";

import {
  getLiveOnlyRuntimePolicy,
  isLiveOnlyRuntimeEnabled,
} from "../../../config/LiveOnlyRuntimePolicy";

import {
  strategyOneLiveOnlyPreflightService,
} from "./StrategyOneLiveOnlyPreflightService";

import {
  STRATEGY_ONE_LIVE_DISPATCH_RESERVED_MAXIMUM_BOOK_AGE_MS,
} from "../../../arbitrage/execution/StrategyOneLiveTimingPolicy";

export type StrategyOneLiveOnlyAuthorityState =
  | "AUTHORIZED"
  | "CONSUMED"
  | "PAIR_BOUND"
  | "FINALIZED";

export interface StrategyOneLiveOnlyAuthorityRecord {
  readonly schemaVersion: "1.0";
  readonly id: string;
  readonly state: StrategyOneLiveOnlyAuthorityState;
  readonly opportunityId: string;
  readonly market: string;
  readonly buyExchange: string;
  readonly sellExchange: string;
  readonly capitalPerLegInr: number;
  readonly maximumCapitalPerLegInr: number;
  readonly maximumBuyQuoteSpend: number;
  readonly maximumOrderBookAgeMs: number;
  readonly exactQuantity: number;
  readonly preflightHash: string;
  readonly authorizedAt: number;
  readonly authorityExpiresAt: number;
  readonly consumedAt: number | null;
  readonly pairBoundAt: number | null;
  readonly pairSessionId: string | null;
  readonly finalizedAt: number | null;
  readonly finalOutcome: ArbitrageLiveExecutionResult["status"] | null;
  readonly requiresRecovery: boolean;
  readonly liveOrderSubmissionAuthorized: boolean;
  readonly automaticRetryAllowed: false;
}

interface PersistedSnapshot {
  readonly schemaVersion: "1.0";
  readonly savedAt: number;
  readonly records: readonly StrategyOneLiveOnlyAuthorityRecord[];
}

const DEFAULT_FILE =
  resolve(
    process.cwd(),
    "logs",
    "live",
    "strategy-one-live-only-authorities.jsonl",
  );

const AUTHORITY_TTL_MS =
  3_000;

/**
 * Durable per-opportunity authority for the explicitly confirmed LIVE-only
 * runtime. It replaces the former operator arm/lease ceremony but preserves
 * exact preflight binding, one concurrent authority, journal-before-I/O,
 * stable pair binding and fail-closed recovery semantics.
 */
export class StrategyOneLiveOnlyAuthorityService {
  private readonly store:
    JsonlSnapshotStore<PersistedSnapshot>;

  private readonly latest =
    new Map<string, StrategyOneLiveOnlyAuthorityRecord>();

  constructor(
    filePath =
      DEFAULT_FILE,
    private readonly isPairResolved: (
      sessionId: string,
    ) => boolean = (
      sessionId,
    ) =>
      strategyOneTwoLegRecoveryResolutionService
        .isSessionResolved(
          sessionId,
        ),
  ) {
    this.store =
      new JsonlSnapshotStore({
        filePath,
        isPayload:
          isSnapshot,
      });

    const restored =
      this.store
        .readLatest();

    for (
      const record
      of restored?.records ?? []
    ) {
      this.latest.set(
        record.id,
        freeze(
          clone(
            record,
          ),
        ),
      );
    }
  }

  authorize(
    opportunityIdValue:
      string,
    now =
      Date.now(),
  ): StrategyOneLiveOnlyAuthorityRecord {
    validateTime(
      now,
    );

    if (
      !isLiveOnlyRuntimeEnabled()
    ) {
      throw new Error(
        "The explicitly confirmed LIVE-only runtime is not enabled.",
      );
    }

    if (
      this.hasBlockingAuthority(
        now,
      )
    ) {
      throw new Error(
        "Another LIVE-only authority or unresolved execution is active.",
      );
    }

    const opportunityId =
      opportunityIdValue
        .trim();

    const opportunity =
      opportunityService
        .getOpportunityById(
          opportunityId,
        );

    if (!opportunity) {
      throw new Error(
        "The exact current opportunity is unavailable or stale.",
      );
    }

    const report =
      strategyOneLiveOnlyPreflightService
        .evaluate(
          opportunity,
          now,
        );

    if (
      !report.approved
    ) {
      throw new Error(
        `LIVE-only action-time preflight blocked: ${report.blockers.join(" | ")}`,
      );
    }

    const policy =
      getLiveOnlyRuntimePolicy();
    const exactQuantity =
      report.funding
        .executableQuantity;
    const maximumBuyQuoteSpend =
      report.funding
        .maximumConvertedQuoteCapital;
    const maximumOrderBookAgeMs =
      STRATEGY_ONE_LIVE_DISPATCH_RESERVED_MAXIMUM_BOOK_AGE_MS;

    if (
      report.opportunityId !==
        opportunity.id ||
      report.requestedCapitalPerLegInr <
        policy.minimumCapitalPerLegInr ||
      report.requestedCapitalPerLegInr >
        policy.maximumCapitalPerLegInr ||
      report.funding.maximumCapitalPerLegInr !==
        policy.maximumCapitalPerLegInr ||
      exactQuantity === null ||
      !Number.isFinite(
        exactQuantity,
      ) ||
      exactQuantity <=
        0 ||
      maximumBuyQuoteSpend === undefined ||
      maximumBuyQuoteSpend === null ||
      !Number.isFinite(
        maximumBuyQuoteSpend,
      ) ||
      maximumBuyQuoteSpend <=
        0 ||
      maximumOrderBookAgeMs === null ||
      !Number.isSafeInteger(
        maximumOrderBookAgeMs,
      ) ||
      maximumOrderBookAgeMs <=
        0
    ) {
      throw new Error(
        "LIVE-only preflight did not retain exact ₹600–₹1,000 capital, quantity and timing evidence.",
      );
    }

    const route = {
      opportunityId:
        opportunity.id,
      market:
        normalizeMarket(
          opportunity.pair.market,
        ),
      buyExchange:
        normalizeExchange(
          opportunity.pair.buy.exchange,
        ),
      sellExchange:
        normalizeExchange(
          opportunity.pair.sell.exchange,
        ),
    };
    const preflightHash =
      hash({
        report,
        route,
        exactQuantity,
        maximumBuyQuoteSpend,
        maximumOrderBookAgeMs,
      });
    const id =
      `live-only-authority-${hash({
        route,
        preflightHash,
        authorizedAt:
          now,
      }).slice(0, 32)}`;
    const record =
      freeze({
        schemaVersion:
          "1.0" as const,
        id,
        state:
          "AUTHORIZED" as const,
        ...route,
        capitalPerLegInr:
          report
            .requestedCapitalPerLegInr,
        maximumCapitalPerLegInr:
          policy.maximumCapitalPerLegInr,
        maximumBuyQuoteSpend,
        maximumOrderBookAgeMs,
        exactQuantity,
        preflightHash,
        authorizedAt:
          now,
        authorityExpiresAt:
          now +
          AUTHORITY_TTL_MS,
        consumedAt:
          null,
        pairBoundAt:
          null,
        pairSessionId:
          null,
        finalizedAt:
          null,
        finalOutcome:
          null,
        requiresRecovery:
          false,
        liveOrderSubmissionAuthorized:
          true,
        automaticRetryAllowed:
          false as const,
      });

    this.persist(
      record,
      now,
    );

    return clone(
      record,
    );
  }

  consume(input: {
    readonly authorityId: string;
    readonly opportunity: ArbitrageOpportunity;
    readonly now: number;
  }): StrategyOneLiveOnlyAuthorityRecord {
    validateTime(
      input.now,
    );

    const current =
      this.require(
        input.authorityId,
        "AUTHORIZED",
      );

    if (
      current.authorityExpiresAt <=
        input.now ||
      current.opportunityId !==
        input.opportunity.id ||
      current.market !==
        normalizeMarket(
          input.opportunity.pair.market,
        ) ||
      current.buyExchange !==
        normalizeExchange(
          input.opportunity.pair.buy.exchange,
        ) ||
      current.sellExchange !==
        normalizeExchange(
          input.opportunity.pair.sell.exchange,
        )
    ) {
      throw new Error(
        "LIVE-only authority expired or no longer matches the exact opportunity.",
      );
    }

    const consumed =
      freeze({
        ...clone(
          current,
        ),
        state:
          "CONSUMED" as const,
        consumedAt:
          input.now,
        liveOrderSubmissionAuthorized:
          false,
      });

    this.persist(
      consumed,
      input.now,
    );

    return clone(
      consumed,
    );
  }

  bindPair(
    authorityId:
      string,
    pairSessionIdValue:
      string,
    now =
      Date.now(),
  ): StrategyOneLiveOnlyAuthorityRecord {
    validateTime(
      now,
    );

    const current =
      this.require(
        authorityId,
        "CONSUMED",
      );
    const pairSessionId =
      pairSessionIdValue
        .trim();

    if (!pairSessionId) {
      throw new Error(
        "A durable LIVE-only pair-session ID is required.",
      );
    }

    const bound =
      freeze({
        ...clone(
          current,
        ),
        state:
          "PAIR_BOUND" as const,
        pairBoundAt:
          now,
        pairSessionId,
      });

    this.persist(
      bound,
      now,
    );

    return clone(
      bound,
    );
  }

  finalize(
    authorityId:
      string,
    result:
      ArbitrageLiveExecutionResult,
    now =
      Date.now(),
  ): StrategyOneLiveOnlyAuthorityRecord {
    validateTime(
      now,
    );

    const current =
      this.latest
        .get(
          authorityId
            .trim(),
        );

    if (
      !current ||
      (
        current.state !==
          "CONSUMED" &&
        current.state !==
          "PAIR_BOUND"
      )
    ) {
      throw new Error(
        "A consumed LIVE-only authority is required for finalization.",
      );
    }

    const requiresRecovery =
      result.recoveryRequired ||
      result.possibleExposure ===
        true;
    const finalized =
      freeze({
        ...clone(
          current,
        ),
        state:
          "FINALIZED" as const,
        finalizedAt:
          now,
        finalOutcome:
          result.status,
        requiresRecovery,
        liveOrderSubmissionAuthorized:
          false,
      });

    this.persist(
      finalized,
      now,
    );

    return clone(
      finalized,
    );
  }

  hasBlockingAuthority(
    now =
      Date.now(),
  ): boolean {
    validateTime(
      now,
    );

    return [
      ...this.latest
        .values(),
    ].some(
      (
        record,
      ) => {
        if (
          record.state ===
            "FINALIZED"
        ) {
          if (
            !record.requiresRecovery
          ) {
            return false;
          }

          if (
            record.pairSessionId ===
              null
          ) {
            return true;
          }

          try {
            return !this
              .isPairResolved(
                record.pairSessionId,
              );
          } catch {
            return true;
          }
        }

        if (
          record.state ===
            "AUTHORIZED"
        ) {
          return record.authorityExpiresAt >=
            now;
        }

        return true;
      },
    );
  }

  getDiagnostics(
    now =
      Date.now(),
  ) {
    validateTime(
      now,
    );

    const records =
      [
        ...this.latest
          .values(),
      ];

    return freeze({
      schemaVersion:
        "1.0" as const,
      generatedAt:
        now,
      runtimeEnabled:
        isLiveOnlyRuntimeEnabled(),
      blockingAuthorityPresent:
        this.hasBlockingAuthority(
          now,
        ),
      records:
        records.length,
      states:
        Object.fromEntries(
          [
            "AUTHORIZED",
            "CONSUMED",
            "PAIR_BOUND",
            "FINALIZED",
          ].map(
            (
              state,
            ) => [
              state,
              records.filter(
                (
                  record,
                ) =>
                  record.state ===
                    state,
              ).length,
            ],
          ),
        ),
      recent:
        records
          .sort(
            (
              first,
              second,
            ) =>
              second.authorizedAt -
              first.authorizedAt,
          )
          .slice(
            0,
            20,
          )
          .map(
            clone,
          ),
      persistence:
        this.store
          .getDiagnostics(),
      safety: {
        exactOpportunityBound:
          true,
        oneConcurrentAuthority:
          true,
        journalBeforeCoordinator:
          true,
        authorityTtlMs:
          AUTHORITY_TTL_MS,
        automaticRetryAllowed:
          false,
      },
    });
  }

  private require(
    idValue:
      string,
    state:
      StrategyOneLiveOnlyAuthorityState,
  ): StrategyOneLiveOnlyAuthorityRecord {
    const record =
      this.latest
        .get(
          idValue
            .trim(),
        );

    if (
      !record ||
      record.state !==
        state
    ) {
      throw new Error(
        `LIVE-only authority must be in ${state} state.`,
      );
    }

    return record;
  }

  private persist(
    record:
      StrategyOneLiveOnlyAuthorityRecord,
    now:
      number,
  ): void {
    this.latest.set(
      record.id,
      freeze(
        clone(
          record,
        ),
      ),
    );

    this.store.append({
      schemaVersion:
        "1.0",
      savedAt:
        now,
      records:
        [
          ...this.latest
            .values(),
        ].map(
          clone,
        ),
    });
  }
}

function isSnapshot(
  value:
    unknown,
): value is PersistedSnapshot {
  if (
    typeof value !==
      "object" ||
    value ===
      null
  ) {
    return false;
  }

  const snapshot =
    value as Partial<PersistedSnapshot>;

  return snapshot.schemaVersion ===
      "1.0" &&
    Number.isSafeInteger(
      snapshot.savedAt,
    ) &&
    Array.isArray(
      snapshot.records,
    ) &&
    snapshot.records.every(
      isAuthority,
    );
}

function isAuthority(
  value:
    unknown,
): value is StrategyOneLiveOnlyAuthorityRecord {
  if (
    typeof value !==
      "object" ||
    value ===
      null
  ) {
    return false;
  }

  const record =
    value as Partial<StrategyOneLiveOnlyAuthorityRecord>;

  return record.schemaVersion ===
      "1.0" &&
    typeof record.id ===
      "string" &&
    record.id.startsWith(
      "live-only-authority-",
    ) &&
    [
      "AUTHORIZED",
      "CONSUMED",
      "PAIR_BOUND",
      "FINALIZED",
    ].includes(
      record.state ??
        "",
    ) &&
    typeof record.opportunityId ===
      "string" &&
    Number.isFinite(
      record.exactQuantity,
    ) &&
    Number.isSafeInteger(
      record.authorizedAt,
    );
}

function normalizeMarket(
  value:
    string,
): string {
  return value
    .trim()
    .toUpperCase()
    .replace(
      /[^A-Z0-9]/gu,
      "",
    );
}

function normalizeExchange(
  value:
    string,
): string {
  return value
    .trim()
    .toLowerCase();
}

function validateTime(
  value:
    number,
): void {
  if (
    !Number.isSafeInteger(
      value,
    ) ||
    value <=
      0
  ) {
    throw new Error(
      "LIVE-only authority timestamp must be positive.",
    );
  }
}

function hash(
  value:
    unknown,
): string {
  return createHash(
    "sha256",
  )
    .update(
      JSON.stringify(
        value,
      ),
    )
    .digest(
      "hex",
    );
}

function clone<T>(
  value:
    T,
): T {
  return structuredClone(
    value,
  );
}

function freeze<T>(
  value:
    T,
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
    const child
    of Object.values(
      value,
    )
  ) {
    freeze(
      child,
    );
  }

  return Object.freeze(
    value,
  );
}

export const strategyOneLiveOnlyAuthorityService =
  new StrategyOneLiveOnlyAuthorityService();
