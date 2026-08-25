import assert from "node:assert/strict";

import {
  appendFileSync,
  mkdtempSync,
  rmSync,
} from "node:fs";

import {
  tmpdir,
} from "node:os";

import {
  join,
} from "node:path";

import {
  JsonlSnapshotStore,
} from "../JsonlSnapshotStore";

interface FixtureSnapshot {
  readonly sequence: number;
  readonly complete: true;
  readonly payload: string;
}

function isFixtureSnapshot(
  value: unknown,
): value is FixtureSnapshot {
  return typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (value as Partial<FixtureSnapshot>).complete === true &&
    typeof (value as Partial<FixtureSnapshot>).sequence === "number" &&
    typeof (value as Partial<FixtureSnapshot>).payload === "string";
}

function main(): void {
  const directory = mkdtempSync(join(tmpdir(), "cat-pro-snapshot-tail-"));
  const filePath = join(directory, "snapshots.jsonl");

  try {
    const writer = new JsonlSnapshotStore<FixtureSnapshot>({
      filePath,
      isPayload: isFixtureSnapshot,
    });

    for (let sequence = 1; sequence <= 2_000; sequence += 1) {
      writer.append({
        sequence,
        complete: true,
        payload: "x".repeat(2_048),
      });
    }

    appendFileSync(filePath, "{\"partial\":", "utf8");

    const reader = new JsonlSnapshotStore<FixtureSnapshot>({
      filePath,
      isPayload: isFixtureSnapshot,
    });
    const latest = reader.readLatest();
    const diagnostics = reader.getDiagnostics();

    assert.equal(latest?.sequence, 2_000);
    assert.equal(diagnostics.validRecordsRead, 1);
    assert.equal(diagnostics.malformedRecordsIgnored, 1);
    assert.ok(
      diagnostics.linesRead < 10,
      "Latest-snapshot restore must inspect only the bounded file tail.",
    );

    const next = reader.append({
      sequence: 2_001,
      complete: true,
      payload: "continued",
    });

    assert.equal(
      next.sequence,
      2_001,
      "Tail restore must retain the durable envelope sequence before appending.",
    );

    console.log(
      "JSONL SNAPSHOT BOUNDED TAIL RESTORE TEST PASSED.",
    );
  } finally {
    rmSync(directory, {recursive: true, force: true});
  }
}

main();
