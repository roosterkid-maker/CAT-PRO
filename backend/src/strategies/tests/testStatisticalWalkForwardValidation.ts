import assert from "node:assert/strict";
import type {StatisticalPairSample} from "../statistical-arbitrage/StatisticalHistoricalDataService";
import {StatisticalWalkForwardValidationService} from "../statistical-arbitrage/StatisticalWalkForwardValidationService";

function samples(now: number, count: number): StatisticalPairSample[] {
  const result: StatisticalPairSample[] = [];
  for (let index = 0; index < count; index += 1) {
    const rightMid = 100 * Math.exp(index * 0.001);
    const position = index % 10;
    const residual = position === 0 ? 0.03 : position === 5 ? -0.03 : (position === 1 || position === 6) ? 0 : Math.sin(index) * 0.002;
    const leftMid = Math.exp(Math.log(2) + 1.1 * Math.log(rightMid) + residual);
    result.push({timestamp: now + index * 1_000, leftMid, rightMid});
  }
  return result;
}

async function main(): Promise<void> {
  const service = new StatisticalWalkForwardValidationService();
  const now = Date.now();
  const history = samples(now, 80);
  const report = service.validate("fixture-pair", history, {
    minimumTrainingSamples: 30, testSamplesPerFold: 10, minimumFolds: 3, maximumFolds: 4,
    entryZScoreThreshold: 1.5, roundTripCostPercent: 0.04, safetyBufferPercent: 0.01,
    minimumTrades: 5, minimumNetPercent: 0, maximumDrawdownPercent: 50,
  }, now + 80_000);
  assert.equal(report.evidenceStatus, "AVAILABLE");
  const futureSafeReport = service.validate("fixture-pair", [...history, {
    timestamp: now + 1_000_000, leftMid: 1, rightMid: 1,
  }], {
    minimumTrainingSamples: 30, testSamplesPerFold: 10, minimumFolds: 3, maximumFolds: 4,
    entryZScoreThreshold: 1.5, roundTripCostPercent: 0.04, safetyBufferPercent: 0.01,
    minimumTrades: 5, minimumNetPercent: 0, maximumDrawdownPercent: 50,
  }, now + 80_000);
  assert.equal(futureSafeReport.sampleCount, history.length);
  assert.equal(futureSafeReport.validationPassed, true);
  assert.equal(report.validationPassed, true, JSON.stringify(report.blockers));
  assert.equal(report.folds.length, 4);
  assert.ok(report.summary.totalTrades >= 5);
  assert.ok((report.summary.netReturnPercent ?? 0) > 0);
  assert.ok(report.folds.every((fold) => fold.trainingEndTimestamp < fold.testStartTimestamp));
  assert.ok(report.folds.every((fold) => fold.noLookaheadLeakage));
  assert.equal(report.featureVersion, "STAT_PAIR_LOG_PRICE_V1");
  assert.equal(report.safety.costsApplied, true);
  assert.equal(report.safety.cointegrationVerified, false);
  assert.equal(report.safety.livePromotionAuthorized, false);

  const regime = service.monitorRegime("fixture-pair", history, {
    minimumSamples: 20, minimumAbsoluteCorrelation: 0.1, highVolatilityPercent: 10,
  }, now + 80_000);
  assert.notEqual(regime.regime, "INSUFFICIENT_DATA");
  assert.equal(regime.livePromotionAuthorized, false);

  const insufficient = service.validate("empty", [], {}, now);
  assert.equal(insufficient.evidenceStatus, "NO_DATA");
  assert.equal(insufficient.validationPassed, false);
  console.log("STATISTICAL WALK-FORWARD VALIDATION TEST PASSED.");
  console.log("Expanding-window out-of-sample folds applied explicit round-trip costs and safety buffers with regime evidence; no PAPER, LIVE promotion or order action occurred.");
}

void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
