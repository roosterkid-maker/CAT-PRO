import assert from "node:assert/strict";

import {
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";

import {
  tmpdir,
} from "node:os";

import {
  join,
} from "node:path";

import {
  ExecutionRecoveryEngine,
} from "../recovery/ExecutionRecoveryEngine";

// Regression: the 1s scan re-upserted every OPEN incident each tick and
// appended a snapshot differing only in updatedAt. Two long-lived OPEN
// incidents grew the journal to ~1.9M records / 1.9GB and replaying it at
// startup OOM crash-looped the backend. Unchanged re-evaluations must not
// append; real changes still must.

function leg(
  exchange: string,
  status: string,
  filledQuantity: number,
) {
  return {
    exchange,
    market:
      "WAVESUSDT",
    status,
    orderId:
      `${exchange}-order`,
    requestedQuantity:
      19.02,
    filledQuantity,
    averageFillPrice:
      filledQuantity > 0
        ? 1.25
        : null,
    requestedPrice:
      1.25,
    updatedAt:
      1_000,
  };
}

function input(
  now: number,
  severity: "WARNING" | "CRITICAL",
) {
  return {
    sessionId:
      "strategy-one:test-session",
    planId:
      "test-plan",
    buyLeg:
      leg("coindcx", "FAILED", 0),
    sellLeg:
      leg("bybit", "FILLED", 19.02),
    boughtQuantity:
      0,
    soldQuantity:
      19.02,
    exposedQuantity:
      19.02,
    exposureDirection:
      "SHORT" as const,
    strategy:
      "EMERGENCY_EXIT" as const,
    severity,
    reason:
      "SHORT exposure of 19.02 units remains.",
    now,
  };
}

function lineCount(
  filePath: string,
): number {
  return readFileSync(
    filePath,
    "utf8",
  )
    .split("\n")
    .filter(
      (line) =>
        line.trim().length > 0,
    ).length;
}

function main(): void {
  const directory =
    mkdtempSync(
      join(
        tmpdir(),
        "cat-pro-recovery-noop-",
      ),
    );
  const filePath =
    join(
      directory,
      "execution-recovery-incidents.jsonl",
    );

  try {
    const engine =
      new ExecutionRecoveryEngine(
        filePath,
      );
    const upsert =
      (
        engine as unknown as {
          upsertIncident(
            value: ReturnType<typeof input>,
          ): { id: string; updatedAt: number; severity: string };
        }
      ).upsertIncident.bind(
        engine,
      );

    const created =
      upsert(
        input(2_000, "WARNING"),
      );
    assert.equal(lineCount(filePath), 1);

    for (
      let tick = 1;
      tick <= 50;
      tick += 1
    ) {
      const same =
        upsert(
          input(2_000 + tick * 1_000, "WARNING"),
        );
      assert.equal(same.id, created.id);
      assert.equal(same.updatedAt, 2_000);
    }
    assert.equal(
      lineCount(filePath),
      1,
      "unchanged re-evaluations must not append journal records",
    );

    const escalated =
      upsert(
        input(60_000, "CRITICAL"),
      );
    assert.equal(escalated.id, created.id);
    assert.equal(escalated.severity, "CRITICAL");
    assert.equal(escalated.updatedAt, 60_000);
    assert.equal(
      lineCount(filePath),
      2,
      "a material change must still be persisted",
    );

    const restarted =
      new ExecutionRecoveryEngine(
        filePath,
      );
    const reloaded =
      restarted.getIncident(
        created.id,
      ) as { severity: string; updatedAt: number };
    assert.equal(reloaded.severity, "CRITICAL");
    assert.equal(reloaded.updatedAt, 60_000);

    console.log(
      "testExecutionRecoveryIncidentNoOpPersistence: PASS",
    );
  } finally {
    rmSync(
      directory,
      {
        recursive:
          true,
        force:
          true,
      },
    );
  }
}

main();
