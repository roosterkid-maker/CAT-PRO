import assert from "node:assert/strict";
import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {
  CENTRAL_LIVE_ACTION_CONFIRMATION,
} from "../central/CentralLiveExecutionAdmissionService";
import {
  CentralLiveOperatorConfirmationService,
} from "../central/CentralLiveOperatorConfirmationService";

const now = 1_780_700_000_000;

function main(): void {
  const directory = mkdtempSync(join(tmpdir(), "cat-pro-central-live-arm-"));
  try {
    const filePath = join(directory, "arms.jsonl");

    assert.throws(
      () => new CentralLiveOperatorConfirmationService(30_001, filePath),
      /within the admission service's own maximumActionAgeMs bound/,
      "An arm window longer than the admission gate's own 30s freshness bound would silently never validate.",
    );

    const service = new CentralLiveOperatorConfirmationService(30_000, filePath);

    assert.equal(service.claimForPlan("triangular-arbitrage", "plan:no-arm-yet", now), null);

    assert.throws(
      () => service.arm("triangular-arbitrage", "not the phrase", now),
      /Exact confirmation phrase/,
    );
    assert.throws(
      () => service.arm("triangular-arbitrage", CENTRAL_LIVE_ACTION_CONFIRMATION.toLowerCase(), now),
      /Exact confirmation phrase/,
      "The phrase check must be exact, not case-insensitive.",
    );

    const arm = service.arm("triangular-arbitrage", CENTRAL_LIVE_ACTION_CONFIRMATION, now);
    assert.equal(arm.status, "ARMED");
    assert.equal(arm.armedAt, now);
    assert.equal(arm.expiresAt, now + 30_000);

    const otherStrategyClaim = service.claimForPlan("cross-exchange-market-making", "plan:other-strategy", now + 10);
    assert.equal(otherStrategyClaim, null, "An arm for one strategy must never authorize a different strategy's plan.");

    const authority = service.claimForPlan("triangular-arbitrage", "plan:qualified-1", now + 10);
    assert.ok(authority);
    assert.equal(authority.planId, "plan:qualified-1");
    assert.equal(authority.confirmation, CENTRAL_LIVE_ACTION_CONFIRMATION);
    assert.equal(authority.confirmedAt, now, "confirmedAt must be the real arm() timestamp, never regenerated at claim time.");
    assert.equal(authority.expiresAt, now + 30_000);

    const secondClaimAttempt = service.claimForPlan("triangular-arbitrage", "plan:qualified-2", now + 20);
    assert.equal(secondClaimAttempt, null, "An arm is single-use: once claimed by one plan it must never authorize a second plan.");

    const secondArm = service.arm("triangular-arbitrage", CENTRAL_LIVE_ACTION_CONFIRMATION, now + 100);
    const expiredClaimAttempt = service.claimForPlan("triangular-arbitrage", "plan:too-late", secondArm.expiresAt + 1);
    assert.equal(expiredClaimAttempt, null, "An expired arm must never be claimable.");
    // secondArm is now unclaimed and past its own expiry; every later query
    // time used below stays past secondArm.expiresAt too, so it can never
    // resurface as a false "still current" candidate for a later plan.

    const thirdArm = service.arm("triangular-arbitrage", CENTRAL_LIVE_ACTION_CONFIRMATION, secondArm.expiresAt + 100);
    const fourthArm = service.arm("triangular-arbitrage", CENTRAL_LIVE_ACTION_CONFIRMATION, secondArm.expiresAt + 101);
    const oldestFirstClaim = service.claimForPlan("triangular-arbitrage", "plan:oldest-first", secondArm.expiresAt + 102);
    assert.ok(oldestFirstClaim);
    assert.equal(oldestFirstClaim.operatorActionId, thirdArm.armId,
      "When multiple arms are outstanding, the oldest must be consumed first (FIFO), never the newest.");
    const remainingClaim = service.claimForPlan("triangular-arbitrage", "plan:remaining", secondArm.expiresAt + 103);
    assert.ok(remainingClaim);
    assert.equal(remainingClaim.operatorActionId, fourthArm.armId);

    const restored = new CentralLiveOperatorConfirmationService(30_000, filePath);
    const restoredStatus = restored.getStatus("triangular-arbitrage", secondArm.expiresAt + 150);
    assert.equal(restoredStatus.currentlyArmed, false, "Every arm created above was consumed or expired by this point.");
    assert.equal(restoredStatus.recent.length > 0, true, "Durable JsonlSnapshotStore-backed history must survive a fresh instance over the same file.");
    assert.ok(restoredStatus.recent.some((item) => item.status === "CLAIMED"));

    const freshArm = service.arm("triangular-arbitrage", CENTRAL_LIVE_ACTION_CONFIRMATION, secondArm.expiresAt + 200);
    const liveStatus = service.getStatus("triangular-arbitrage", secondArm.expiresAt + 200);
    assert.equal(liveStatus.currentlyArmed, true);
    assert.equal(liveStatus.armedUntil, freshArm.expiresAt);
    assert.equal(liveStatus.safety.exactConfirmationPhraseRequired, true);
    assert.equal(liveStatus.safety.singleUsePerArm, true);
    assert.equal(liveStatus.safety.maximumArmWindowMs, 30_000);
    assert.equal(liveStatus.safety.operatorConfirmedTimestampNeverRegenerated, true);

    console.log("CENTRAL LIVE OPERATOR CONFIRMATION SERVICE TEST PASSED.");
    console.log("Exact-phrase, single-use, FIFO-ordered, durable arm/claim semantics were verified end to end; no plan was ever authorized without a real prior confirmation, and no order or exchange action occurred.");
  } finally {
    rmSync(directory, {recursive: true, force: true});
  }
}

main();
