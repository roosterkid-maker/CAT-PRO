import assert from "node:assert/strict";
import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import type {DerivativeMarketDataSnapshotListener} from "../../derivatives/services/DerivativeMarketDataService";
import {StatisticalHistoricalDataService} from "../statistical-arbitrage/StatisticalHistoricalDataService";

class SilentSource {
  subscribe(_listener: DerivativeMarketDataSnapshotListener): () => void { return () => undefined; }
}

async function main(): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), "cat-pro-stat-history-"));
  try {
    const file = join(directory, "history.jsonl");
    const pair = {pairId: "binance:BTCUSDT:ETHUSDT", exchange: "binance", leftMarket: "BTCUSDT", rightMarket: "ETHUSDT"};
    const configuration = {pairs: [pair], maximumSamplesPerPair: 3, maximumEvidenceAgeMs: 5_000,
      maximumEvidenceSkewMs: 1_000, minimumPersistenceIntervalMs: 0,
      rotationMaximumFileBytes: 1_000_000, rotationMaximumRecords: 100, maximumArchives: 2};
    const first = new StatisticalHistoricalDataService(file, configuration, new SilentSource());
    /*
     * Keep fixture samples safely in the past. A fast CI runner can construct
     * and restore the service within the same millisecond; using Date.now()+N
     * made valid fixture samples look future-dated during the truthful restore
     * guard.
     */
    const now = Date.now() - 1_000;
    for (let index = 0; index < 4; index += 1) {
      first.record(pair, {timestamp: now + index, leftMid: 100 + index, rightMid: 50 + index}, now + index);
    }
    first.record(pair, {timestamp: now + 100, leftMid: 999, rightMid: 999}, now + 4);
    assert.equal(first.getHistory(pair.pairId, 10).length, 3);
    assert.equal(first.getHistory(pair.pairId, 10)[0]?.leftMid, 101);
    assert.equal(first.getDiagnostics().safety.samplesBounded, true);
    assert.equal(first.getDiagnostics().safety.featureVersionPinned, true);
    assert.equal(first.getDiagnostics().safety.backtestResultAvailable, false);

    const restored = new StatisticalHistoricalDataService(file, configuration, new SilentSource());
    const restoredHistory = restored.getHistory(pair.pairId, 10);
    assert.equal(restoredHistory.length, 3);
    assert.equal(restoredHistory[2]?.leftMid, 103);
    assert.equal(restored.getDiagnostics().restoreStatus, "AVAILABLE");
    assert.equal(restored.getDiagnostics().featureVersion, "STAT_PAIR_LOG_PRICE_V1");
    assert.equal(restored.getDiagnostics().safety.liveExecutionAllowed, false);
    console.log("STATISTICAL HISTORICAL DATA SERVICE TEST PASSED.");
    console.log("Bounded versioned pair samples survived restart through rotating JSONL evidence; no backtest, PAPER, LIVE or order claim was manufactured.");
  } finally {
    rmSync(directory, {recursive: true, force: true});
  }
}

void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
