import {
  resolve,
} from "node:path";

import {
  JsonlSnapshotStore,
} from "../../../core/persistence/JsonlSnapshotStore";

import type {
  ProductionAlert,
} from "./ProductionAlert";

import type {
  ProductionAlertHistoryRecord,
  ProductionAlertHistoryReport,
} from "./ProductionAlertHistory";

import {
  productionAlertService,
} from "./ProductionAlertService";

const DEFAULT_PERSISTENCE_FILE =
  resolve(
    process.cwd(),

    "logs",

    "execution",

    "production-alert-history.jsonl",
  );

const SCAN_INTERVAL_MS =
  5_000;

interface PersistedProductionAlertHistory {
  schemaVersion: 1;

  persistedAt: number;

  alert:
    ProductionAlertHistoryRecord;
}

export class ProductionAlertHistoryService {
  private readonly store:
    JsonlSnapshotStore<
      PersistedProductionAlertHistory
    >;

  private readonly latest =
    new Map<
      string,
      ProductionAlertHistoryRecord
    >();

  private timer:
    NodeJS.Timeout | null =
    null;

  private monitoringEnabled =
    false;

  private restored =
    false;

  private restoredAt:
    number | null =
    null;

  private lastPersistedAt:
    number | null =
    null;

  constructor(
    persistenceFilePath =
      DEFAULT_PERSISTENCE_FILE,
  ) {
    this.store =
      new JsonlSnapshotStore<
        PersistedProductionAlertHistory
      >({
        filePath:
          persistenceFilePath,

        isPayload:
          (
            value,
          ): value is
            PersistedProductionAlertHistory =>
            this.isValidPayload(
              value,
            ),
      });

    this.restore();
  }

  start():
    void {
    if (
      this.monitoringEnabled
    ) {
      return;
    }

    this.monitoringEnabled =
      true;

    this.captureSafely();

    this.timer =
      setInterval(
        () => {
          this.captureSafely();
        },

        SCAN_INTERVAL_MS,
      );

    this.timer.unref();
  }

  stop():
    void {
    this.monitoringEnabled =
      false;

    if (
      !this.timer
    ) {
      return;
    }

    clearInterval(
      this.timer,
    );

    this.timer =
      null;
  }

  capture():
    void {
    const currentReport =
      productionAlertService
        .getReport();

    const now =
      Date.now();

    const activeKeys =
      new Set(
        currentReport
          .alerts
          .map(
            (
              alert,
            ) =>
              alert.key,
          ),
      );

    /*
     * New / recurring active conditions.
     */
    for (
      const alert
      of currentReport.alerts
    ) {
      const existing =
        this.latest.get(
          alert.key,
        );

      if (
        !existing
      ) {
        this.persist(
          this.createNewRecord(
            alert,
            now,
          ),
        );

        continue;
      }

      /*
       * Same alert is still continuously active.
       *
       * Do not write another JSONL record every
       * five seconds.
       */
      if (
        existing
          .conditionActive
      ) {
        continue;
      }

      /*
       * Condition disappeared previously and
       * has now appeared again.
       *
       * This is a new occurrence.
       */
      const recurring:
        ProductionAlertHistoryRecord = {
        ...structuredClone(
          existing,
        ),

        severity:
          alert.severity,

        source:
          alert.source,

        title:
          alert.title,

        message:
          alert.message,

        status:
          "OPEN",

        conditionActive:
          true,

        blocksFutureLiveTrading:
          alert
            .blocksFutureLiveTrading,

        requiresManualReview:
          alert
            .requiresManualReview,

        lastDetectedAt:
          now,

        lastStateChangedAt:
          now,

        acknowledgedAt:
          null,

        resolvedAt:
          null,

        occurrenceCount:
          existing
            .occurrenceCount +
          1,

        acknowledgementNote:
          null,

        resolutionNote:
          null,

        metadata:
          structuredClone(
            alert.metadata,
          ),
      };

      this.persist(
        recurring,
      );
    }

    /*
     * Previously active alert is no longer
     * reported by Build 11.
     *
     * Mark condition inactive but DO NOT
     * automatically resolve it.
     */
    for (
      const record
      of this.latest.values()
    ) {
      if (
        !record.conditionActive ||
        activeKeys.has(
          record.key,
        )
      ) {
        continue;
      }

      const inactive:
        ProductionAlertHistoryRecord = {
        ...structuredClone(
          record,
        ),

        conditionActive:
          false,

        lastStateChangedAt:
          now,
      };

      this.persist(
        inactive,
      );
    }
  }

  acknowledge(
    key:
      string,

    note =
      "",
  ):
    ProductionAlertHistoryRecord {
    this.capture();

    const existing =
      this.requireAlert(
        key,
      );

    if (
      existing.status ===
      "RESOLVED"
    ) {
      throw new Error(
        "Resolved alert cannot be acknowledged.",
      );
    }

    if (
      existing.status ===
      "ACKNOWLEDGED"
    ) {
      return structuredClone(
        existing,
      );
    }

    const now =
      Date.now();

    const updated:
      ProductionAlertHistoryRecord = {
      ...structuredClone(
        existing,
      ),

      status:
        "ACKNOWLEDGED",

      acknowledgedAt:
        now,

      lastStateChangedAt:
        now,

      acknowledgementNote:
        note.trim() ||
        null,
    };

    this.persist(
      updated,
    );

    return structuredClone(
      updated,
    );
  }

  resolve(
    key:
      string,

    note:
      string,
  ):
    ProductionAlertHistoryRecord {
    this.capture();

    const existing =
      this.requireAlert(
        key,
      );

    if (
      existing.status ===
      "RESOLVED"
    ) {
      return structuredClone(
        existing,
      );
    }

    /*
     * FAIL CLOSED:
     *
     * A currently active production condition
     * cannot be manually hidden by resolving
     * its history row.
     */
    if (
      existing.conditionActive
    ) {
      throw new Error(
        "Alert condition is still active. Resolve the underlying condition before resolving this alert.",
      );
    }

    const normalizedNote =
      note.trim();

    if (
      !normalizedNote
    ) {
      throw new Error(
        "resolutionNote is required.",
      );
    }

    const now =
      Date.now();

    const updated:
      ProductionAlertHistoryRecord = {
      ...structuredClone(
        existing,
      ),

      status:
        "RESOLVED",

      resolvedAt:
        now,

      lastStateChangedAt:
        now,

      resolutionNote:
        normalizedNote,
    };

    this.persist(
      updated,
    );

    return structuredClone(
      updated,
    );
  }

  resolveInactive(
    resolutionNote:
      string,

    onlyCritical = false,
  ):
    ProductionAlertHistoryRecord[] {
    this.capture();

    const normalizedNote =
      resolutionNote
        .trim();

    if (
      !normalizedNote
    ) {
      throw new Error(
        "resolutionNote is required.",
      );
    }

    const now =
      Date.now();

    const resolved:
      ProductionAlertHistoryRecord[] = [];

    for (
      const record
      of this.latest.values()
    ) {
      if (
        record.status ===
        "RESOLVED"
      ) {
        continue;
      }

      if (
        record.conditionActive
      ) {
        continue;
      }

      if (
        onlyCritical &&
        record.severity !==
          "CRITICAL"
      ) {
        continue;
      }

      const updated:
        ProductionAlertHistoryRecord = {
        ...structuredClone(
          record,
        ),

        status:
          "RESOLVED",

        resolvedAt:
          now,

        lastStateChangedAt:
          now,

        resolutionNote:
          normalizedNote,
      };

      this.persist(
        updated,
      );

      resolved.push(
        updated,
      );
    }

    return resolved;
  }

  getAlert(
    key:
      string,
  ):
    ProductionAlertHistoryRecord |
    null {
    this.captureIfMonitoring();

    const record =
      this.latest.get(
        key,
      );

    return record
      ? structuredClone(
          record,
        )
      : null;
  }

  getReport():
    ProductionAlertHistoryReport {
    this.captureIfMonitoring();

    const foundation =
      this.store
        .getDiagnostics();

    const alerts =
      Array.from(
        this.latest.values(),
      )
        .map(
          (
            alert,
          ) =>
            structuredClone(
              alert,
            ),
        )
        .sort(
          (
            first,
            second,
          ) =>
            this.priority(
              second,
            ) -
              this.priority(
                first,
              ) ||
            second
              .lastStateChangedAt -
              first
                .lastStateChangedAt,
        );

    const open =
      alerts.filter(
        (
          alert,
        ) =>
          alert.status ===
          "OPEN",
      ).length;

    const acknowledged =
      alerts.filter(
        (
          alert,
        ) =>
          alert.status ===
          "ACKNOWLEDGED",
      ).length;

    const resolved =
      alerts.filter(
        (
          alert,
        ) =>
          alert.status ===
          "RESOLVED",
      ).length;

    const unresolved =
      alerts.filter(
        (
          alert,
        ) =>
          alert.status !==
          "RESOLVED",
      );

    const unresolvedCritical =
      unresolved.filter(
        (
          alert,
        ) =>
          alert.severity ===
          "CRITICAL",
      );

    const activeCritical =
      alerts.filter(
        (
          alert,
        ) =>
          alert
            .conditionActive &&
          alert.severity ===
            "CRITICAL",
      );

    const persistenceHealthy =
      foundation
        .writeFailures ===
        0 &&
      foundation
        .lastError ===
        null;

    const livePromotionBlocked =
      unresolvedCritical
        .some(
          (
            alert,
          ) =>
            alert
              .blocksFutureLiveTrading,
        ) ||
      !persistenceHealthy;

    const blockers:
      string[] = [];

    for (
      const alert
      of unresolvedCritical
    ) {
      if (
        alert
          .blocksFutureLiveTrading
      ) {
        blockers.push(
          `${alert.key}: ${alert.title}`,
        );
      }
    }

    if (
      !persistenceHealthy
    ) {
      blockers.push(
        foundation.lastError ??
        "Production alert-history persistence is unhealthy.",
      );
    }

    return {
      generatedAt:
        Date.now(),

      version:
        "18.0",

      build:
        "12",

      monitoringOnly:
        true,

      liveTradingEnabled:
        false,

      liveSubmissionAllowed:
        false,

      automaticTradingActionAllowed:
        false,

      automaticAlertResolutionAllowed:
        false,

      explicitResolutionRequired:
        true,

      summary: {
        totalAlerts:
          alerts.length,

        open,

        acknowledged,

        resolved,

        activeConditions:
          alerts.filter(
            (
              alert,
            ) =>
              alert.conditionActive,
          ).length,

        unresolved:
          unresolved.length,

        unresolvedCritical:
          unresolvedCritical.length,

        activeCritical:
          activeCritical.length,
      },

      livePromotionBlocked,

      persistenceHealthy,

      alerts,

      persistence: {
        persistenceFilePath:
          foundation.filePath,

        restored:
          this.restored,

        restoredAt:
          this.restoredAt,

        writes:
          foundation.writes,

        writeFailures:
          foundation.writeFailures,

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
      },

      blockers: [
        ...new Set(
          blockers,
        ),
      ],

      notes: [
        "Version 18 Build 12 persists production-alert lifecycle history.",

        "Repeated continuously-active alerts are deduplicated rather than persisted every scan.",

        "If a cleared condition appears again, its occurrence count increases and lifecycle returns to OPEN.",

        "An alert becoming inactive does not silently mark it RESOLVED.",

        "A currently active alert cannot be manually resolved.",

        "Unresolved CRITICAL live-blocking alerts keep future LIVE promotion fail-closed.",

        "Alert acknowledgement or resolution never submits, cancels, hedges or unwinds exchange orders.",

        "LIVE trading and LIVE order submission remain disabled.",
      ],
    };
  }

  private captureSafely():
    void {
    try {
      this.capture();
    } catch {
      /*
       * Alert-history monitoring must not crash
       * the backend.
       *
       * JsonlSnapshotStore retains persistence
       * diagnostics.
       */
    }
  }

  private createNewRecord(
    alert:
      ProductionAlert,

    now:
      number,
  ):
    ProductionAlertHistoryRecord {
    return {
      key:
        alert.key,

      severity:
        alert.severity,

      source:
        alert.source,

      title:
        alert.title,

      message:
        alert.message,

      status:
        "OPEN",

      conditionActive:
        true,

      blocksFutureLiveTrading:
        alert
          .blocksFutureLiveTrading,

      requiresManualReview:
        alert
          .requiresManualReview,

      firstDetectedAt:
        now,

      lastDetectedAt:
        now,

      lastStateChangedAt:
        now,

      acknowledgedAt:
        null,

      resolvedAt:
        null,

      occurrenceCount:
        1,

      acknowledgementNote:
        null,

      resolutionNote:
        null,

      metadata:
        structuredClone(
          alert.metadata,
        ),
    };
  }

  private requireAlert(
    key:
      string,
  ):
    ProductionAlertHistoryRecord {
    const normalized =
      key.trim();

    if (
      !normalized
    ) {
      throw new Error(
        "Alert key is required.",
      );
    }

    const record =
      this.latest.get(
        normalized,
      );

    if (
      !record
    ) {
      throw new Error(
        `Production alert not found: ${normalized}`,
      );
    }

    return record;
  }

  private persist(
    alert:
      ProductionAlertHistoryRecord,
  ): void {
    const persistedAt =
      Date.now();

    const payload:
      PersistedProductionAlertHistory = {
      schemaVersion:
        1,

      persistedAt,

      alert:
        structuredClone(
          alert,
        ),
    };

    /*
     * Persist first.
     *
     * Do not expose lifecycle mutation unless
     * durable append succeeds.
     */
    this.store.append(
      payload,
    );

    this.latest.set(
      alert.key,

      structuredClone(
        alert,
      ),
    );

    this.lastPersistedAt =
      persistedAt;
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
        this.latest.get(
          record.alert.key,
        );

      if (
        !existing ||
        record.persistedAt >=
          existing
            .lastStateChangedAt
      ) {
        this.latest.set(
          record.alert.key,

          structuredClone(
            record.alert,
          ),
        );
      }

      this.lastPersistedAt =
        Math.max(
          this.lastPersistedAt ??
            0,

          record.persistedAt,
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

  private priority(
    alert:
      ProductionAlertHistoryRecord,
  ): number {
    const lifecycle =
      alert.status ===
      "OPEN"
        ? 30
        : alert.status ===
            "ACKNOWLEDGED"
          ? 20
          : 0;

    const severity =
      alert.severity ===
      "CRITICAL"
        ? 3
        : alert.severity ===
            "WARNING"
          ? 2
          : 1;

    return (
      lifecycle +
      severity
    );
  }

  private captureIfMonitoring():
    void {
    if (
      !this.monitoringEnabled
    ) {
      return;
    }

    this.capture();
  }

  private isValidPayload(
    value:
      unknown,
  ): value is
    PersistedProductionAlertHistory {
    if (
      !this.isRecord(
        value,
      ) ||
      value.schemaVersion !==
        1 ||
      typeof value.persistedAt !==
        "number" ||
      !Number.isFinite(
        value.persistedAt,
      ) ||
      !this.isRecord(
        value.alert,
      )
    ) {
      return false;
    }

    const alert =
      value.alert;

    return (
      typeof alert.key ===
        "string" &&
      typeof alert.severity ===
        "string" &&
      typeof alert.source ===
        "string" &&
      typeof alert.title ===
        "string" &&
      typeof alert.message ===
        "string" &&
      typeof alert.status ===
        "string" &&
      typeof alert.conditionActive ===
        "boolean" &&
      typeof alert.firstDetectedAt ===
        "number" &&
      typeof alert.lastDetectedAt ===
        "number" &&
      typeof alert.lastStateChangedAt ===
        "number" &&
      typeof alert.occurrenceCount ===
        "number"
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

export const productionAlertHistoryService =
  new ProductionAlertHistoryService();
