import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import {
  tmpdir,
} from "node:os";
import {
  join,
} from "node:path";

import {
  StrategyOneLiveOnlyAuthorityService,
  type StrategyOneLiveOnlyAuthorityRecord,
} from "../live-only/StrategyOneLiveOnlyAuthorityService";

const NOW = 1_789_061_300_000;
const SESSION_ID = "strategy-one:resolved-live-only-test";

function main(): void {
  const directory = mkdtempSync(join(tmpdir(), "cat-pro-live-only-authority-"));

  try {
    const filePath = join(directory, "authority.jsonl");
    const record: StrategyOneLiveOnlyAuthorityRecord = {
      schemaVersion: "1.0",
      id: "live-only-authority-resolved-recovery-test",
      state: "FINALIZED",
      opportunityId: "resolved-recovery-opportunity",
      market: "WAVESUSDT",
      buyExchange: "coindcx",
      sellExchange: "bybit",
      capitalPerLegInr: 600,
      maximumCapitalPerLegInr: 1_000,
      maximumBuyQuoteSpend: 10,
      maximumOrderBookAgeMs: 500,
      exactQuantity: 19.02,
      preflightHash: "resolved-recovery-preflight",
      authorizedAt: NOW,
      authorityExpiresAt: NOW + 3_000,
      consumedAt: NOW + 10,
      pairBoundAt: NOW + 20,
      pairSessionId: SESSION_ID,
      finalizedAt: NOW + 30,
      finalOutcome: "RECOVERY_REQUIRED",
      requiresRecovery: true,
      liveOrderSubmissionAuthorized: false,
      automaticRetryAllowed: false,
    };
    const payload = {
      schemaVersion: "1.0" as const,
      savedAt: NOW + 30,
      records: [record],
    };

    writeFileSync(
      filePath,
      `${JSON.stringify({
        storeVersion: 1,
        sequence: 1,
        writtenAt: NOW + 30,
        payload,
      })}\n`,
      "utf8",
    );

    const unresolved = new StrategyOneLiveOnlyAuthorityService(
      filePath,
      () => false,
    );
    assert.equal(
      unresolved.getDiagnostics(NOW + 40).blockingAuthorityPresent,
      true,
      "a finalized recovery authority must remain blocking while its pair is unresolved",
    );

    const resolved = new StrategyOneLiveOnlyAuthorityService(
      filePath,
      (sessionId) => sessionId === SESSION_ID,
    );
    assert.equal(
      resolved.getDiagnostics(NOW + 40).blockingAuthorityPresent,
      false,
      "authoritative pair resolution must clear the redundant finalized-authority blocker",
    );

    const lookupFailure = new StrategyOneLiveOnlyAuthorityService(
      filePath,
      () => {
        throw new Error("resolution store unavailable");
      },
    );
    assert.equal(
      lookupFailure.getDiagnostics(NOW + 40).blockingAuthorityPresent,
      true,
      "resolution lookup failure must remain fail-closed",
    );
  } finally {
    rmSync(directory, {recursive: true, force: true});
  }

  console.log(
    "LIVE-only authority recovery release passed: resolved pair evidence clears only the redundant finalized blocker and lookup failures remain fail-closed.",
  );
}

main();
