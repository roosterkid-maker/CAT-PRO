import assert from "node:assert/strict";

import type {
  StrategyRuntimeSnapshot,
} from "../models/StrategyRuntimeSnapshot";

import {
  buildStrategyBlockerDiagnostics,
} from "../services/StrategyBlockerDiagnosticsService";

const runtime:
  StrategyRuntimeSnapshot = {
  strategyId:
    "fixture",
  generatedAt:
    10_000,
  running:
    true,
  startCount:
    1,
  stopCount:
    0,
  lastStartedAt:
    9_000,
  lastStoppedAt:
    null,
  processedSnapshots:
    1,
  duplicateSnapshotsIgnored:
    0,
  totalSignalsObserved:
    0,
  currentSignalCount:
    0,
  lastSnapshotGeneratedAt:
    10_000,
  lastSnapshotReceivedAt:
    10_000,
  lastSnapshotOpportunityCount:
    0,
  lastSignalObservedAt:
    null,
  lastError:
    null,
  evidence: {
    snapshot:
      "AVAILABLE",
    signals:
      "NO_DATA",
    performance:
      "NOT_REPORTED",
  },
  legacyHistoryAttribution:
    "UNATTRIBUTED_LEGACY",
  safety: {
    readOnly:
      true,
    signalExecutionAllowed:
      false,
    intentExecutionAllowed:
      false,
    automaticExecutionAllowed:
      false,
  },
};

const diagnostics =
  buildStrategyBlockerDiagnostics(
    runtime,
    {
      assessments: [
        {
          status:
            "BLOCKED",
          blockers: [
            "BOOK_STALE",
            "FEE_EVIDENCE_MISSING",
          ],
        },
        {
          status:
            "BLOCKED",
          blockers: [
            "BOOK_STALE",
          ],
        },
        {
          status:
            "QUALIFIED",
          blockers:
            [],
        },
      ],
    },
    10_000,
  );

assert.equal(
  diagnostics.evaluatedRecords,
  3,
);

assert.equal(
  diagnostics.blockedRecords,
  2,
);

assert.equal(
  diagnostics.qualifiedRecords,
  1,
);

assert.deepEqual(
  diagnostics.blockers.map(
    (blocker) => [
      blocker.code,
      blocker.count,
    ],
  ),
  [
    [
      "BOOK_STALE",
      2,
    ],
    [
      "FEE_EVIDENCE_MISSING",
      1,
    ],
    [
      "NO_CURRENT_QUALIFIED_SIGNAL",
      1,
    ],
  ],
);

console.log(
  "STRATEGY BLOCKER DIAGNOSTICS TEST PASSED.",
);
