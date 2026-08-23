import assert from "node:assert/strict";
import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {
  isPersonalBotPaperRuntimeArmed,
  PersonalBotRuntimeControlService,
} from "../services/PersonalBotRuntimeControlService";

function main(): void {
  const directory = mkdtempSync(join(tmpdir(), "cat-pro-personal-bot-control-"));
  const filePath = join(directory, "control.jsonl");

  try {
    const service = new PersonalBotRuntimeControlService(filePath, 1_900_000_000_000);
    assert.equal(service.getControl().enabled, false, "A new personal PAPER bot must start fail-closed.");
    assert.equal(service.getControl().source, "DEFAULT");
    assert.equal(service.getControl().mode, "PAPER_ONLY");

    assert.equal(
      isPersonalBotPaperRuntimeArmed({
        control: service.getControl(),
        account: {enabled: true, mode: "PAPER", emergencyStop: false},
      }),
      false,
      "A default control record must never arm PAPER execution.",
    );

    const activated = service.setEnabled(true, 1_900_000_000_001);
    assert.equal(activated.enabled, true);
    assert.equal(activated.source, "DASHBOARD");

    const paused = service.setEnabled(false, 1_900_000_000_002);
    assert.equal(paused.enabled, false);
    assert.equal(paused.source, "DASHBOARD");
    assert.equal(paused.liveExecutionAllowed, false);
    assert.equal(paused.orderSubmissionAllowed, false);

    const restored = new PersonalBotRuntimeControlService(filePath, 1_900_000_000_003);
    assert.equal(restored.getControl().enabled, false, "Paused state must survive restart.");

    const resumed = restored.setEnabled(true, 1_900_000_000_004);
    assert.equal(resumed.enabled, true);
    assert.equal(resumed.source, "DASHBOARD");
    assert.equal(
      isPersonalBotPaperRuntimeArmed({
        control: resumed,
        account: {enabled: true, mode: "PAPER", emergencyStop: false},
      }),
      true,
      "An explicit persisted dashboard control must arm PAPER in a safe PAPER account.",
    );
    assert.equal(
      isPersonalBotPaperRuntimeArmed({
        control: resumed,
        account: {enabled: true, mode: "LIVE", emergencyStop: false},
      }),
      false,
      "PAPER must fail closed when the durable account leaves PAPER mode.",
    );
    assert.equal(
      isPersonalBotPaperRuntimeArmed({
        control: resumed,
        account: {enabled: true, mode: "PAPER", emergencyStop: true},
      }),
      false,
      "The emergency stop must revoke effective PAPER arming.",
    );

    const restoredAgain = new PersonalBotRuntimeControlService(filePath, 1_900_000_000_005);
    assert.equal(restoredAgain.getControl().enabled, true, "Resumed state must survive restart.");

    console.log("PERSONAL BOT RUNTIME CONTROL TEST PASSED.");
    console.log("Restart-safe PAPER ON/OFF remained isolated from LIVE execution and order submission.");
  } finally {
    rmSync(directory, {recursive: true, force: true});
  }
}

try {
  main();
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
