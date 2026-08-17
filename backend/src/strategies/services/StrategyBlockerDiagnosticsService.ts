import type {
  StrategyEvidenceStatus,
} from "../models/StrategyEvidenceStatus";

import type {
  StrategyRuntimeSnapshot,
} from "../models/StrategyRuntimeSnapshot";

export interface StrategyBlockerDiagnostic {
  readonly code:
    string;

  readonly count:
    number;

  readonly sources:
    readonly string[];

  readonly detail:
    string | null;
}

export interface StrategyBlockerDiagnostics {
  readonly generatedAt:
    number;

  readonly evidenceStatus:
    StrategyEvidenceStatus;

  readonly evaluatedRecords:
    number;

  readonly blockedRecords:
    number;

  readonly qualifiedRecords:
    number;

  readonly blockers:
    readonly StrategyBlockerDiagnostic[];
}

interface MutableBlocker {
  count: number;
  sources: Set<string>;
  detail: string | null;
}

const QUALIFIED_STATES =
  new Set([
    "ACCEPTED",
    "AVAILABLE",
    "ELIGIBLE",
    "PASS",
    "QUALIFIED",
    "READY",
  ]);

const BLOCKED_STATES =
  new Set([
    "BLOCKED",
    "DISABLED",
    "FAILED",
    "INCOMPLETE",
    "NO_DATA",
    "REJECTED",
  ]);

export function buildStrategyBlockerDiagnostics(
  runtime:
    StrategyRuntimeSnapshot,
  evidence:
    unknown,
  now =
    Date.now(),
): StrategyBlockerDiagnostics {
  const blockerMap =
    new Map<
      string,
      MutableBlocker
    >();

  let evaluatedRecords =
    0;

  let blockedRecords =
    0;

  let qualifiedRecords =
    0;

  const addBlocker = (
    code:
      string,
    source:
      string,
    detail:
      string | null =
      null,
  ): void => {
    const normalized =
      code.trim();

    if (!normalized) {
      return;
    }

    const current =
      blockerMap.get(
        normalized,
      ) ?? {
        count:
          0,
        sources:
          new Set<string>(),
        detail:
          null,
      };

    current.count +=
      1;

    current.sources.add(
      source,
    );

    current.detail ??=
      detail;

    blockerMap.set(
      normalized,
      current,
    );
  };

  const visited =
    new Set<object>();

  const visit = (
    value:
      unknown,
    path:
      string,
  ): void => {
    if (
      value ===
        null ||
      typeof value !==
        "object" ||
      visited.has(
        value,
      )
    ) {
      return;
    }

    visited.add(
      value,
    );

    if (Array.isArray(value)) {
      value.forEach(
        (item, index) =>
          visit(
            item,
            `${path}[${index}]`,
          ),
      );

      return;
    }

    const record =
      value as Record<
        string,
        unknown
      >;

    const rawStatus =
      typeof record.status ===
        "string"
        ? record.status
            .trim()
            .toUpperCase()
        : typeof record.state ===
            "string"
          ? record.state
              .trim()
              .toUpperCase()
          : null;

    if (rawStatus) {
      evaluatedRecords +=
        1;

      if (
        QUALIFIED_STATES.has(
          rawStatus,
        )
      ) {
        qualifiedRecords +=
          1;
      } else if (
        BLOCKED_STATES.has(
          rawStatus,
        )
      ) {
        blockedRecords +=
          1;
      }
    }

    if (
      Array.isArray(
        record.blockers,
      )
    ) {
      for (
        const blocker
        of record.blockers
      ) {
        if (
          typeof blocker ===
          "string"
        ) {
          addBlocker(
            blocker,
            `${path}.blockers`,
          );
        }
      }
    }

    for (
      const [
        key,
        child,
      ]
      of Object.entries(
        record,
      )
    ) {
      if (key ===
        "blockers") {
        continue;
      }

      visit(
        child,
        `${path}.${key}`,
      );
    }
  };

  visit(
    evidence,
    "strategyEvidence",
  );

  if (!runtime.running) {
    addBlocker(
      "CONTROLLER_NOT_RUNNING",
      "runtime.running",
    );
  }

  if (
    runtime.processedSnapshots ===
      0
  ) {
    addBlocker(
      "NO_STRATEGY_SNAPSHOT_PROCESSED",
      "runtime.processedSnapshots",
    );
  }

  if (
    runtime.evidence.snapshot !==
      "AVAILABLE"
  ) {
    addBlocker(
      "SNAPSHOT_EVIDENCE_NO_DATA",
      "runtime.evidence.snapshot",
    );
  }

  if (
    runtime.currentSignalCount ===
      0
  ) {
    addBlocker(
      "NO_CURRENT_QUALIFIED_SIGNAL",
      "runtime.currentSignalCount",
    );
  }

  if (runtime.lastError) {
    addBlocker(
      "RUNTIME_LAST_ERROR",
      "runtime.lastError",
      runtime.lastError,
    );
  }

  const blockers =
    Array.from(
      blockerMap.entries(),
    )
      .map(
        ([
          code,
          value,
        ]) => ({
          code,
          count:
            value.count,
          sources:
            Array.from(
              value.sources,
            ).slice(
              0,
              5,
            ),
          detail:
            value.detail,
        }),
      )
      .sort(
        (first, second) =>
          second.count -
            first.count ||
          first.code.localeCompare(
            second.code,
          ),
      );

  return {
    generatedAt:
      now,
    evidenceStatus:
      evidence !==
        null &&
      evidence !==
        undefined
        ? "AVAILABLE"
        : "NO_DATA",
    evaluatedRecords,
    blockedRecords,
    qualifiedRecords,
    blockers,
  };
}
