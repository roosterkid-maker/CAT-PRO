import assert from "node:assert/strict";
import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";

import {
  StatisticalPromotionLifecycleService,
  type StatisticalPromotionLifecycleInput,
  type StatisticalRawQualificationState,
} from "../statistical-arbitrage/StatisticalPromotionLifecycleService";

function input(qualificationState: StatisticalRawQualificationState): StatisticalPromotionLifecycleInput {
  return {pairId: "binance:AAAUSDT:BBBUSDT", exchange: "binance",
    leftMarket: "AAAUSDT", rightMarket: "BBBUSDT", qualificationState,
    blockers: qualificationState === "PROMOTED" ? [] : [`RAW_${qualificationState}`]};
}

function main(): void {
  const directory = mkdtempSync(join(tmpdir(), "cat-pro-statistical-promotion-"));
  const file = join(directory, "promotion-lifecycle.jsonl");
  const start = 1_800_000_000_000;
  try {
    const first = new StatisticalPromotionLifecycleService(file, {
      promotionConfirmationsRequired: 3, demotionConfirmationsRequired: 3,
      maximumTrackedPairs: 4, maximumTransitions: 8,
      rotationMaximumFileBytes: 1_000_000, rotationMaximumRecords: 100, maximumArchives: 2,
    });
    let evidence = first.reconcile([input("PROMOTED")], start).get(input("PROMOTED").pairId)!;
    assert.equal(evidence.state, "PROMOTION_PENDING");
    assert.equal(evidence.consecutivePromotionPasses, 1);
    assert.equal(evidence.signalEligible, false);
    assert.equal(evidence.publishedState, "COLLECTING_HISTORY");
    evidence = first.reconcile([input("PROMOTED")], start + 1_000).get(input("PROMOTED").pairId)!;
    assert.equal(evidence.consecutivePromotionPasses, 2);

    const restarted = new StatisticalPromotionLifecycleService(file, {
      promotionConfirmationsRequired: 3, demotionConfirmationsRequired: 3,
      maximumTrackedPairs: 4, maximumTransitions: 8,
      rotationMaximumFileBytes: 1_000_000, rotationMaximumRecords: 100, maximumArchives: 2,
    });
    assert.equal(restarted.getDiagnostics(start + 1_500).persistence.restoreStatus, "AVAILABLE");
    evidence = restarted.reconcile([input("PROMOTED")], start + 2_000).get(input("PROMOTED").pairId)!;
    assert.equal(evidence.state, "PROMOTED", "The persisted second pass must survive restart.");
    assert.equal(evidence.signalEligible, true);

    evidence = restarted.reconcile([input("REJECTED")], start + 3_000).get(input("REJECTED").pairId)!;
    assert.equal(evidence.state, "DEMOTION_PENDING");
    assert.equal(evidence.publishedState, "COLLECTING_HISTORY");
    assert.equal(evidence.signalEligible, false,
      "The first demotion observation must block signals even before final rejection is confirmed.");

    evidence = restarted.reconcile([input("PROMOTED")], start + 4_000).get(input("PROMOTED").pairId)!;
    assert.equal(evidence.state, "PROMOTED", "A transient failure must recover without permanent demotion.");
    assert.equal(evidence.signalEligible, true);

    for (let index = 0; index < 3; index += 1) {
      evidence = restarted.reconcile([input("REJECTED")], start + 5_000 + index * 1_000)
        .get(input("REJECTED").pairId)!;
    }
    assert.equal(evidence.state, "REJECTED");
    assert.equal(evidence.consecutiveDemotionFailures, 3);
    assert.equal(evidence.signalEligible, false);

    const diagnostics = restarted.getDiagnostics(start + 8_000);
    assert.equal(diagnostics.version, "35.0");
    assert.ok(diagnostics.summary.transitionsRetained >= 6);
    assert.ok(diagnostics.transitions.some((transition) => transition.reason === "PROMOTION_CONFIRMED"));
    assert.ok(diagnostics.transitions.some((transition) => transition.reason === "PROMOTED_EVIDENCE_RECOVERED"));
    assert.ok(diagnostics.transitions.some((transition) => transition.reason === "DEMOTION_CONFIRMED"));
    assert.equal(diagnostics.persistence.writeFailures, 0);
    assert.equal(diagnostics.safety.consecutivePromotionRequired, true);
    assert.equal(diagnostics.safety.demotionBlocksSignalsImmediately, true);
    assert.equal(diagnostics.safety.thresholdsRelaxed, false);
    assert.equal(diagnostics.safety.paperExecutionAllowed, false);
    assert.equal(diagnostics.safety.liveExecutionAllowed, false);
    assert.equal(diagnostics.safety.orderSubmissionAllowed, false);

    console.log("STATISTICAL PROMOTION LIFECYCLE TEST PASSED.");
    console.log("Consecutive promotion, immediate signal blocking, hysteretic demotion and restart-safe transition evidence remained fail-closed.");
  } finally {
    rmSync(directory, {recursive: true, force: true});
  }
}

main();
