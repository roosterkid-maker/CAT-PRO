export type CoinDCXSubscriptionState =
  | "JOIN_SENT"
  | "ACTIVE"
  | "RETRYING"
  | "FAILED"
  | "STALE"
  | "PERSISTENTLY_SILENT";

export interface CoinDCXSubscriptionAuditRecord {
  market:
    string;

  channelName:
    string;

  state:
    CoinDCXSubscriptionState;

  joinSentAt:
    number;

  firstDataAt:
    number | null;

  lastDataAt:
    number | null;

  retryCount:
    number;

  lastRetryAt:
    number | null;

  staleRecoveryAttempts:
    number;

  totalStaleRecoveries:
    number;

  lastStaleRecoveryAt:
    number | null;

  snapshotCount:
    number;

  updateCount:
    number;

  ageSinceJoinMs:
    number;

  ageSinceLastDataMs:
    number | null;
}

interface MutableCoinDCXSubscriptionAuditRecord {
  market:
    string;

  channelName:
    string;

  state:
    CoinDCXSubscriptionState;

  joinSentAt:
    number;

  firstDataAt:
    number | null;

  lastDataAt:
    number | null;

  retryCount:
    number;

  lastRetryAt:
    number | null;

  staleRecoveryAttempts:
    number;

  totalStaleRecoveries:
    number;

  lastStaleRecoveryAt:
    number | null;

  snapshotCount:
    number;

  updateCount:
    number;
}

export interface CoinDCXSubscriptionAuditSummary {
  generatedAt:
    number;

  requested:
    number;

  active:
    number;

  retrying:
    number;

  failed:
    number;

  stale:
    number;

  persistentlySilent:
    number;

  neverReceivedData:
    number;

  receivedData:
    number;

  totalRetries:
    number;

  totalStaleRecoveries:
    number;
}

export interface CoinDCXSubscriptionAuditReport {
  summary:
    CoinDCXSubscriptionAuditSummary;

  records:
    CoinDCXSubscriptionAuditRecord[];
}

export class CoinDCXSubscriptionAuditService {
  private readonly records =
    new Map<
      string,
      MutableCoinDCXSubscriptionAuditRecord
    >();

  recordJoin(
    market:
      string,

    channelName:
      string,

    now =
      Date.now(),
  ): void {
    const normalizedMarket =
      this.normalizeMarket(
        market,
      );

    const existing =
      this.records.get(
        normalizedMarket,
      );

    this.records.set(
      normalizedMarket,
      {
        market:
          normalizedMarket,

        channelName,

        state:
          existing?.retryCount
            ? "RETRYING"
            : "JOIN_SENT",

        joinSentAt:
          now,

        firstDataAt:
          existing?.firstDataAt ??
          null,

        lastDataAt:
          existing?.lastDataAt ??
          null,

        retryCount:
          existing?.retryCount ??
          0,

        lastRetryAt:
          existing?.lastRetryAt ??
          null,

        staleRecoveryAttempts:
          existing?.staleRecoveryAttempts ??
          0,

        totalStaleRecoveries:
          existing?.totalStaleRecoveries ??
          0,

        lastStaleRecoveryAt:
          existing?.lastStaleRecoveryAt ??
          null,

        snapshotCount:
          existing?.snapshotCount ??
          0,

        updateCount:
          existing?.updateCount ??
          0,
      },
    );
  }

  recordData(
    market:
      string,

    eventType:
      "snapshot" |
      "update",

    now =
      Date.now(),
  ): void {
    const normalizedMarket =
      this.normalizeMarket(
        market,
      );

    const existing =
      this.records.get(
        normalizedMarket,
      );

    if (
      !existing ||
      existing.state ===
        "PERSISTENTLY_SILENT"
    ) {
      return;
    }

    existing.firstDataAt ??=
      now;

    existing.lastDataAt =
      now;

    existing.state =
      "ACTIVE";

    /*
     * A genuine exchange update proves that the stale
     * recovery streak succeeded. Reset only the streak;
     * keep totalStaleRecoveries as durable diagnostics.
     */
    existing.staleRecoveryAttempts =
      0;

    if (
      eventType ===
      "snapshot"
    ) {
      existing.snapshotCount +=
        1;
    } else {
      existing.updateCount +=
        1;
    }
  }

  recordRetry(
    market:
      string,

    now =
      Date.now(),
  ): void {
    const normalizedMarket =
      this.normalizeMarket(
        market,
      );

    const existing =
      this.records.get(
        normalizedMarket,
      );

    if (
      !existing
    ) {
      return;
    }

    existing.retryCount +=
      1;

    existing.lastRetryAt =
      now;

    existing.joinSentAt =
      now;

    existing.state =
      "RETRYING";
  }

  recordStaleRecovery(
    market:
      string,

    now =
      Date.now(),
  ): void {
    const normalizedMarket =
      this.normalizeMarket(
        market,
      );

    const existing =
      this.records.get(
        normalizedMarket,
      );

    if (
      !existing ||
      existing.firstDataAt ===
        null
    ) {
      return;
    }

    existing.staleRecoveryAttempts +=
      1;

    existing.totalStaleRecoveries +=
      1;

    existing.lastStaleRecoveryAt =
      now;

    existing.joinSentAt =
      now;

    existing.state =
      "RETRYING";
  }

  markFailed(
    market:
      string,
  ): void {
    const existing =
      this.records.get(
        this.normalizeMarket(
          market,
        ),
      );

    if (
      existing
    ) {
      existing.state =
        "FAILED";
    }
  }

  markStale(
    market:
      string,
  ): void {
    const existing =
      this.records.get(
        this.normalizeMarket(
          market,
        ),
      );

    if (
      existing &&
      existing.state !==
        "FAILED" &&
      existing.state !==
        "PERSISTENTLY_SILENT"
    ) {
      existing.state =
        "STALE";
    }
  }

  markPersistentlySilent(
    market:
      string,
  ): void {
    const existing =
      this.records.get(
        this.normalizeMarket(
          market,
        ),
      );

    if (
      !existing
    ) {
      return;
    }

    existing.state =
      "PERSISTENTLY_SILENT";
  }

  getPersistentSilentCandidates(
    maximumDataAgeMs:
      number,

    recoveryCooldownMs:
      number,

    maximumRecoveryAttempts:
      number,

    now =
      Date.now(),
  ): CoinDCXSubscriptionAuditRecord[] {
    return this.getRecords(
      now,
    ).filter(
      (
        record,
      ) =>
        record.firstDataAt !==
          null &&
        record.lastDataAt !==
          null &&
        record.state !==
          "FAILED" &&
        record.state !==
          "PERSISTENTLY_SILENT" &&
        record.ageSinceLastDataMs !==
          null &&
        record.ageSinceLastDataMs >
          maximumDataAgeMs &&
        record.staleRecoveryAttempts >=
          maximumRecoveryAttempts &&
        record.lastStaleRecoveryAt !==
          null &&
        now -
          record.lastStaleRecoveryAt >=
          recoveryCooldownMs,
    );
  }

  getRetryCandidates(
    firstDataTimeoutMs:
      number,

    maximumRetries:
      number,

    now =
      Date.now(),
  ): CoinDCXSubscriptionAuditRecord[] {
    return this.getRecords(
      now,
    ).filter(
      (
        record,
      ) =>
        record.firstDataAt ===
          null &&
        record.state !==
          "FAILED" &&
        record.retryCount <
          maximumRetries &&
        now -
          record.joinSentAt >=
          firstDataTimeoutMs,
    );
  }

  getExhaustedCandidates(
    firstDataTimeoutMs:
      number,

    maximumRetries:
      number,

    now =
      Date.now(),
  ): CoinDCXSubscriptionAuditRecord[] {
    return this.getRecords(
      now,
    ).filter(
      (
        record,
      ) =>
        record.firstDataAt ===
          null &&
        record.state !==
          "FAILED" &&
        record.retryCount >=
          maximumRetries &&
        now -
          record.joinSentAt >=
          firstDataTimeoutMs,
    );
  }

  getStaleRecoveryCandidates(
    maximumDataAgeMs:
      number,

    recoveryCooldownMs:
      number,

    maximumRecoveryAttempts:
      number,

    now =
      Date.now(),
  ): CoinDCXSubscriptionAuditRecord[] {
    return this.getRecords(
      now,
    ).filter(
      (
        record,
      ) => {
        if (
          record.firstDataAt ===
            null ||
          record.lastDataAt ===
            null ||
          record.state ===
            "FAILED" ||
          record.ageSinceLastDataMs ===
            null ||
          record.ageSinceLastDataMs <=
            maximumDataAgeMs ||
          record.staleRecoveryAttempts >=
            maximumRecoveryAttempts
        ) {
          return false;
        }

        if (
          record.lastStaleRecoveryAt ===
          null
        ) {
          return true;
        }

        return (
          now -
            record.lastStaleRecoveryAt >=
          recoveryCooldownMs
        );
      },
    );
  }

  markStaleByAge(
    maximumDataAgeMs:
      number,

    now =
      Date.now(),
  ): void {
    for (
      const record
      of this.records.values()
    ) {
      if (
        record.state ===
          "FAILED" ||
        record.state ===
          "PERSISTENTLY_SILENT" ||
        record.lastDataAt ===
          null
      ) {
        continue;
      }

      if (
        now -
          record.lastDataAt >
        maximumDataAgeMs
      ) {
        record.state =
          "STALE";
      }
    }
  }

  getReport(
    now =
      Date.now(),
  ): CoinDCXSubscriptionAuditReport {
    const records =
      this.getRecords(
        now,
      );

    const countState = (
      state:
        CoinDCXSubscriptionState,
    ): number =>
      records.filter(
        (
          record,
        ) =>
          record.state ===
          state,
      ).length;

    return {
      summary: {
        generatedAt:
          now,

        requested:
          records.filter(
            (
              record,
            ) =>
              record.state !==
                "PERSISTENTLY_SILENT" &&
              record.state !==
                "FAILED",
          ).length,

        active:
          countState(
            "ACTIVE",
          ),

        retrying:
          countState(
            "RETRYING",
          ),

        failed:
          countState(
            "FAILED",
          ),

        stale:
          countState(
            "STALE",
          ),

        persistentlySilent:
          countState(
            "PERSISTENTLY_SILENT",
          ),

        neverReceivedData:
          records.filter(
            (
              record,
            ) =>
              record.firstDataAt ===
              null,
          ).length,

        receivedData:
          records.filter(
            (
              record,
            ) =>
              record.firstDataAt !==
              null,
          ).length,

        totalRetries:
          records.reduce(
            (
              total,
              record,
            ) =>
              total +
              record.retryCount,
            0,
          ),

        totalStaleRecoveries:
          records.reduce(
            (
              total,
              record,
            ) =>
              total +
              record.totalStaleRecoveries,
            0,
          ),
      },

      records,
    };
  }

  remove(
    market:
      string,
  ): void {
    this.records.delete(
      this.normalizeMarket(
        market,
      ),
    );
  }

  clear(): void {
    this.records.clear();
  }

  private getRecords(
    now:
      number,
  ): CoinDCXSubscriptionAuditRecord[] {
    return Array.from(
      this.records.values(),
    )
      .map(
        (
          record,
        ) => ({
          ...record,

          ageSinceJoinMs:
            Math.max(
              0,
              now -
                record.joinSentAt,
            ),

          ageSinceLastDataMs:
            record.lastDataAt ===
              null
              ? null
              : Math.max(
                  0,
                  now -
                    record.lastDataAt,
                ),
        }),
      )
      .sort(
        (
          first,
          second,
        ) => {
          const stateOrder:
            Record<
              CoinDCXSubscriptionState,
              number
            > = {
            FAILED:
              0,

            RETRYING:
              1,

            PERSISTENTLY_SILENT:
              2,

            STALE:
              3,

            JOIN_SENT:
              4,

            ACTIVE:
              5,
          };

          const stateDifference =
            stateOrder[
              first.state
            ] -
            stateOrder[
              second.state
            ];

          if (
            stateDifference !==
            0
          ) {
            return stateDifference;
          }

          return first.market
            .localeCompare(
              second.market,
            );
        },
      );
  }

  private normalizeMarket(
    market:
      string,
  ): string {
    return market
      .trim()
      .toUpperCase()
      .replace(
        /[\s_\-/]+/g,
        "",
      );
  }
}

export const coinDCXSubscriptionAuditService =
  new CoinDCXSubscriptionAuditService();
