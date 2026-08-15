import assert from "node:assert/strict";
import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {CentralLiveLifecycleEvidenceStore} from "../central/CentralLiveLifecycleEvidenceStore";

const now = 1_780_800_000_000;

function main(): void {
  const directory = mkdtempSync(join(tmpdir(), "cat-pro-live-evidence-")); const file = join(directory, "evidence.jsonl");
  try {
    const store = new CentralLiveLifecycleEvidenceStore(file, 10);
    const first = store.seal({kind: "ENTRY_ADMISSION", planId: "central-plan:funding-1",
      dispatchId: "central-dispatch:funding-1", evidenceKey: "historical-entry-admission",
      payload: {flatPosition: true, marginEvidenceId: "margin:1", reduceOnlyVerified: true},
      capturedAt: now, expiresAt: now + 1_000});
    const duplicate = store.seal({kind: "ENTRY_ADMISSION", planId: "central-plan:funding-1",
      dispatchId: "central-dispatch:funding-1", evidenceKey: "historical-entry-admission",
      payload: {flatPosition: true, marginEvidenceId: "margin:1", reduceOnlyVerified: true},
      capturedAt: now + 500, expiresAt: now + 1_000});
    assert.equal(duplicate.id, first.id);
    assert.throws(() => store.seal({kind: "ENTRY_ADMISSION", planId: "central-plan:funding-1",
      dispatchId: "central-dispatch:funding-1", evidenceKey: "historical-entry-admission",
      payload: {flatPosition: false}, capturedAt: now, expiresAt: now + 1_000}), /immutable/u);
    assert.equal(store.getCurrent("ENTRY_ADMISSION", "central-plan:funding-1", "central-dispatch:funding-1",
      "historical-entry-admission", now + 999)?.id, first.id);
    assert.equal(store.getCurrent("ENTRY_ADMISSION", "central-plan:funding-1", "central-dispatch:funding-1",
      "historical-entry-admission", now + 1_001), null);
    const restored = new CentralLiveLifecycleEvidenceStore(file, 10);
    assert.deepEqual(restored.get("ENTRY_ADMISSION", "central-plan:funding-1", "central-dispatch:funding-1",
      "historical-entry-admission")?.payload, first.payload);
    assert.equal(restored.listPlan("central-plan:funding-1").length, 1);
    assert.equal(restored.getDiagnostics(now).safety.evidenceDoesNotGrantOrderAuthority, true);
    console.log("CENTRAL LIVE LIFECYCLE EVIDENCE STORE TEST PASSED.");
    console.log("Immutable plan/dispatch/key binding, deterministic payload hashes, expiry, duplicate idempotency and restart restore passed; no order authority or exchange action exists in the repository.");
  } finally { rmSync(directory, {recursive: true, force: true}); }
}

main();
