import {
  resolve,
} from "node:path";

import {
  JsonlSnapshotStore,
} from "../../../core/persistence/JsonlSnapshotStore";

import {
  liveExecutionCoordinator,
} from "./LiveExecutionCoordinator";

import type {
  LiveExecutionSession,
} from "./LiveExecutionSession";

const DEFAULT_PERSISTENCE_FILE =
  resolve(
    process.cwd(),

    "logs",

    "execution",

    "live-session-evidence.jsonl",
  );

interface PersistedLiveExecutionSessionEvidence {
  schemaVersion: 1;

  capturedAt: number;

  dryRun: boolean;

  session: LiveExecutionSession;
}

export interface InterruptedLiveExecutionSessionEvidence {
  sessionId: string;

  planId: string;

  market: string;

  buyExchange: string;

  sellExchange: string;

  status:
    LiveExecutionSession["status"];

  dryRun: boolean;

  paper: boolean;

  updatedAt: number;
}

export interface LiveExecutionSessionEvidenceDiagnostics {
  persistenceFilePath: string;

  restored: boolean;

  restoredAt: number | null;

  restoredSessions: number;

  restoredTerminalSessions: number;

  interruptedSessions: number;

  interruptedRealSessions: number;

  interruptedDryRunSessions: number;

  interruptedPaperSessions: number;

  recoveryRequired: boolean;

  writes: number;

  writeFailures: number;

  skippedUnchanged: number;

  lastPersistedAt: number | null;

  lastError: string | null;

  foundation: {
    linesRead: number;

    validRecordsRead: number;

    legacyRecordsRead: number;

    malformedRecordsIgnored: number;

    lastSequence: number;
  };

  interrupted:
    InterruptedLiveExecutionSessionEvidence[];
}

export interface DailyExecutionReservationEvidence {
  readonly generatedAt: number;
  readonly dryRunReservations: number;
  readonly paperReservations: number;
  readonly failedDryRunReservations: number;
  readonly failedPaperReservations: number;
}

export interface DailyExecutionReservationSessionEvidence {
  readonly sessionId: string;
  readonly planId: string;
  readonly market: string;
  readonly buyExchange: string;
  readonly sellExchange: string;
  readonly capital: number;
  readonly status: LiveExecutionSession["status"];
  readonly dryRun: boolean;
  readonly createdAt: number;
  readonly completedAt: number | null;
  readonly failureReason: string | null;
}

export class LiveExecutionSessionEvidenceService {
  private readonly store:
    JsonlSnapshotStore<
      PersistedLiveExecutionSessionEvidence
    >;

  /*
   * Historical snapshots only.
   *
   * These are NOT inserted into
   * LiveExecutionCoordinator after restart.
   */
  private readonly latest =
    new Map<
      string,
      PersistedLiveExecutionSessionEvidence
    >();

  private readonly fingerprints =
    new Map<
      string,
      string
    >();

  private restored =
    false;

  private restoredAt:
    number | null =
    null;

  private skippedUnchanged =
    0;

  private lastPersistedAt:
    number | null =
    null;

  private dailyReservationSessionsCache: {
    now: number;
    sessions: readonly DailyExecutionReservationSessionEvidence[];
  } | null = null;

  constructor(
    persistenceFilePath =
      DEFAULT_PERSISTENCE_FILE,
  ) {
    this.store =
      new JsonlSnapshotStore<
        PersistedLiveExecutionSessionEvidence
      >({
        filePath:
          persistenceFilePath,

        isPayload:
          (
            value,
          ): value is
            PersistedLiveExecutionSessionEvidence =>
            this.isValidPayload(
              value,
            ),
      });

    this.restore();
  }

  capture():
    void {
    const diagnostics =
      liveExecutionCoordinator
        .getDiagnostics();

    for (
      const session
      of diagnostics.sessions
    ) {
      this.persistSession(
        session,
      );
    }
  }

  /**
   * Persist one known lifecycle session immediately.
   *
   * A fast PAPER session can start and finish between the regular five-second
   * snapshots. Terminal lifecycle owners call this so a clean stop cannot
   * leave a released reservation without its durable session link.
   */
  captureSession(
    sessionId:
      string,
  ): void {
    const session =
      liveExecutionCoordinator
        .getSession(
          sessionId,
        );

    if (
      !session
    ) {
      return;
    }

    this.persistSession(
      session,
    );
  }

  getDiagnostics():
    LiveExecutionSessionEvidenceDiagnostics {
    const foundation =
      this.store
        .getDiagnostics();

    const records =
      Array.from(
        this.latest.values(),
      );

    const interrupted =
      records
        .filter(
          (
            record,
          ) =>
            this.isActiveStatus(
              record
                .session
                .status,
            ),
        )
        .map(
          (
            record,
          ): InterruptedLiveExecutionSessionEvidence => ({
            sessionId:
              record.session.id,

            planId:
              record.session.planId,

            market:
              record.session.market,

            buyExchange:
              record.session.buyExchange,

            sellExchange:
              record.session.sellExchange,

            status:
              record.session.status,

            dryRun:
              record.dryRun,

            paper:
              this.isPersistedPaperEvidence(
                record,
              ),

            updatedAt:
              record.session.updatedAt,
          }),
        )
        .sort(
          (
            first,
            second,
          ) =>
            second.updatedAt -
            first.updatedAt,
        );

    const interruptedRealSessions =
      interrupted.filter(
        (
          session,
        ) =>
          !session.dryRun &&
          !session.paper,
      );

    const interruptedDryRunSessions =
      interrupted.filter(
        (
          session,
        ) =>
          session.dryRun,
      );

    const interruptedPaperSessions =
      interrupted.filter(
        (
          session,
        ) =>
          session.paper,
      );

    return {
      persistenceFilePath:
        foundation.filePath,

      restored:
        this.restored,

      restoredAt:
        this.restoredAt,

      restoredSessions:
        records.length,

      restoredTerminalSessions:
        records.filter(
          (
            record,
          ) =>
            !this.isActiveStatus(
              record
                .session
                .status,
            ),
        ).length,

      interruptedSessions:
        interrupted.length,

      interruptedRealSessions:
        interruptedRealSessions.length,

      interruptedDryRunSessions:
        interruptedDryRunSessions.length,

      interruptedPaperSessions:
        interruptedPaperSessions.length,

      /*
       * Only an interrupted REAL session
       * requires future production recovery.
       *
       * Historical dry-runs must never cause
       * automatic exchange recovery.
       */
      recoveryRequired:
        interruptedRealSessions.length >
        0,

      writes:
        foundation.writes,

      writeFailures:
        foundation.writeFailures,

      skippedUnchanged:
        this.skippedUnchanged,

      lastPersistedAt:
        this.lastPersistedAt,

      lastError:
        foundation.lastError,

      foundation: {
        linesRead:
          foundation.linesRead,

        validRecordsRead:
          foundation.validRecordsRead,

        legacyRecordsRead:
          foundation.legacyRecordsRead,

        malformedRecordsIgnored:
          foundation
            .malformedRecordsIgnored,

        lastSequence:
          foundation.lastSequence,
      },

      interrupted,
    };
  }

  /**
   * Return exact persisted session IDs whose own durable evidence proves that
   * they were non-LIVE. This intentionally ignores plan/market naming
   * conventions so a genuine LIVE session can never be reclassified by a
   * heuristic string match.
   */
  getVerifiedNonLiveSessionIds():
    ReadonlySet<string> {
    return new Set(
      Array.from(
        this.latest.values(),
      )
        .filter(
          (
            record,
          ) =>
            record.dryRun ||
            this.isPersistedPaperEvidence(
              record,
            ),
        )
        .map(
          (
            record,
          ) =>
            record.session.id,
        ),
    );
  }

  /** Read-only current-local-day reservation ownership from durable sessions. */
  getDailyReservationEvidence(
    now = Date.now(),
  ): DailyExecutionReservationEvidence {
    if (!Number.isSafeInteger(now) || now <= 0) {
      throw new Error("Daily execution reservation evidence requires a positive safe timestamp.");
    }

    const reserved = this.getDailyReservationSessions(now);

    return {
      generatedAt: now,
      dryRunReservations: reserved.filter((record) => record.dryRun).length,
      paperReservations: reserved.filter((record) => !record.dryRun).length,
      failedDryRunReservations: reserved.filter((record) =>
        record.dryRun && record.status !== "COMPLETED").length,
      failedPaperReservations: reserved.filter((record) =>
        !record.dryRun && record.status !== "COMPLETED").length,
    };
  }

  /** Read-only current-local-day reservation details from durable sessions. */
  getDailyReservationSessions(
    now = Date.now(),
  ): readonly DailyExecutionReservationSessionEvidence[] {
    if (!Number.isSafeInteger(now) || now <= 0) {
      throw new Error("Daily execution reservation sessions require a positive safe timestamp.");
    }

    if (
      this.dailyReservationSessionsCache?.now ===
      now
    ) {
      return this.dailyReservationSessionsCache.sessions;
    }

    const dateKey = this.toLocalDateKey(now);

    const sessions = Array.from(this.latest.values())
      .filter((record) =>
        this.toLocalDateKey(record.session.createdAt) === dateKey &&
        record.session.events.some((event) => event.type === "CAPITAL_RESERVED"))
      .map((record) => ({
        sessionId: record.session.id,
        planId: record.session.planId,
        market: record.session.market,
        buyExchange: record.session.buyExchange,
        sellExchange: record.session.sellExchange,
        capital: record.session.capital,
        status: record.session.status,
        dryRun: record.dryRun,
        createdAt: record.session.createdAt,
        completedAt: record.session.completedAt,
        failureReason: record.session.failureReason,
      }))
      .sort((first, second) => first.createdAt - second.createdAt);

    this.dailyReservationSessionsCache = {
      now,
      sessions,
    };

    return sessions;
  }

  /**
   * Remove PAPER/dry-run session evidence while preserving every LIVE record.
   * Plan IDs cover restored PAPER sessions created before mode was persisted;
   * event metadata and coordinator ownership cover current runtime sessions.
   */
  clearPaperSessions(
    paperPlanIds:
      ReadonlySet<string>,
  ): number {
    const retained =
      Array.from(
        this.latest.values(),
      )
        .filter(
          (
            record,
          ) =>
            !this.isPaperEvidence(
              record,
              paperPlanIds,
            ),
        )
        .map(
          (
            record,
          ) =>
            structuredClone(
              record,
            ),
        );

    const removed =
      this.latest.size -
      retained.length;

    this.store.replaceAll(
      retained,
    );

    this.latest.clear();

    this.fingerprints.clear();

    for (
      const record
      of retained
    ) {
      this.latest.set(
        record.session.id,
        record,
      );

      this.fingerprints.set(
        record.session.id,
        this.createFingerprint(
          record.session,
          record.dryRun,
        ),
      );
    }

    this.dailyReservationSessionsCache =
      null;

    return removed;
  }

  private isPaperEvidence(
    record:
      PersistedLiveExecutionSessionEvidence,

    paperPlanIds:
      ReadonlySet<string>,
  ): boolean {
    return (
      record.dryRun ||
      paperPlanIds.has(
        record.session.planId,
      ) ||
      liveExecutionCoordinator
        .isPaperSession(
          record.session.id,
        ) ||
      this.isPersistedPaperEvidence(
        record,
      )
    );
  }

  private isPersistedPaperEvidence(
    record:
      PersistedLiveExecutionSessionEvidence,
  ): boolean {
    return record.session.events.some(
      (
        event,
      ) =>
        event.metadata.paper ===
        true,
    );
  }

  private persistSession(
    session:
      LiveExecutionSession,
  ): void {
    const dryRun =
      liveExecutionCoordinator
        .isDryRunSession(
          session.id,
        );

    const fingerprint =
      this.createFingerprint(
        session,
        dryRun,
      );

    const previous =
      this.fingerprints
        .get(
          session.id,
        );

    if (
      previous ===
      fingerprint
    ) {
      this.skippedUnchanged +=
        1;

      return;
    }

    const record:
      PersistedLiveExecutionSessionEvidence = {
      schemaVersion:
        1,

      capturedAt:
        Date.now(),

      dryRun,

      session:
        structuredClone(
          session,
        ),
    };

    try {
      this.store.append(
        record,
      );

      this.latest.set(
        session.id,

        structuredClone(
          record,
        ),
      );

      this.dailyReservationSessionsCache =
        null;

      this.fingerprints.set(
        session.id,
        fingerprint,
      );

      this.lastPersistedAt =
        record.capturedAt;
    } catch {
      /*
       * Evidence persistence must never break execution. JsonlSnapshotStore
       * keeps the authoritative write-failure diagnostics.
       */
    }
  }

  private restore():
    void {
    const records =
      this.store
        .readAll();

    for (
      const record
      of records
    ) {
      const existing =
        this.latest
          .get(
            record
              .session
              .id,
          );

      const shouldReplace =
        !existing ||
        record.session.updatedAt >
          existing.session.updatedAt ||
        (
          record.session.updatedAt ===
            existing.session.updatedAt &&
          record.capturedAt >=
            existing.capturedAt
        );

      if (
        !shouldReplace
      ) {
        continue;
      }

      this.latest.set(
        record.session.id,

        structuredClone(
          record,
        ),
      );

      this.fingerprints.set(
        record.session.id,

        this.createFingerprint(
          record.session,
          record.dryRun,
        ),
      );

      this.lastPersistedAt =
        Math.max(
          this.lastPersistedAt ??
            0,

          record.capturedAt,
        );
    }

    if (
      records.length >
      0
    ) {
      this.restored =
        true;

      this.restoredAt =
        Date.now();
    }
  }

  private createFingerprint(
    session:
      LiveExecutionSession,

    dryRun:
      boolean,
  ): string {
    return JSON.stringify([
      session.id,

      session.status,

      session.updatedAt,

      session.completedAt,

      session.failureReason,

      session.reservationId,

      session.events.length,

      dryRun,
    ]);
  }

  private toLocalDateKey(timestamp: number): string {
    const value = new Date(timestamp);
    return [
      value.getFullYear(),
      String(value.getMonth() + 1).padStart(2, "0"),
      String(value.getDate()).padStart(2, "0"),
    ].join("-");
  }

  private isActiveStatus(
    status:
      LiveExecutionSession["status"],
  ): boolean {
    return (
      status ===
        "VALIDATING" ||
      status ===
        "RESERVED" ||
      status ===
        "READY_FOR_SUBMISSION" ||
      status ===
        "RUNNING"
    );
  }

  private isValidPayload(
    value:
      unknown,
  ): value is
    PersistedLiveExecutionSessionEvidence {
    if (
      !this.isRecord(
        value,
      ) ||
      value.schemaVersion !==
        1 ||
      typeof value.capturedAt !==
        "number" ||
      !Number.isFinite(
        value.capturedAt,
      ) ||
      typeof value.dryRun !==
        "boolean" ||
      !this.isRecord(
        value.session,
      )
    ) {
      return false;
    }

    const session =
      value.session;

    return (
      typeof session.id ===
        "string" &&
      typeof session.planId ===
        "string" &&
      typeof session.status ===
        "string" &&
      typeof session.updatedAt ===
        "number" &&
      Array.isArray(
        session.events,
      )
    );
  }

  private isRecord(
    value:
      unknown,
  ): value is
    Record<
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

export const liveExecutionSessionEvidenceService =
  new LiveExecutionSessionEvidenceService();
