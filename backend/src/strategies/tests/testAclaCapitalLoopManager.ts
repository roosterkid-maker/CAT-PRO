import assert from "node:assert/strict";
import {existsSync, unlinkSync} from "node:fs";
import {join} from "node:path";
import {AclaCapitalLoopManager, type AclaCycleLegRecord} from "../triangular-arbitrage/AclaCapitalLoopManager";
import {createTriangularArbitrageConfiguration} from "../triangular-arbitrage/TriangularArbitrageConfiguration";

function leg(sequence: 1 | 2 | 3): AclaCycleLegRecord {
  return {sequence, market: `ASSET${sequence}USDT`, fromAsset: sequence === 1 ? "USDT" : `A${sequence}`,
    toAsset: sequence === 3 ? "USDT" : `A${sequence + 1}`, inputQuantity: 100,
    outputAfterFee: 100.25, feeAmount: 0.1, averageFillPrice: 1,
    simulated: true, exchangeOrderId: null};
}

function main(): void {
  const file = join(process.cwd(), `acla-capital-loop-test-${process.pid}.jsonl`);
  const previous = `${file}.previous`;
  for (const path of [file, previous]) if (existsSync(path)) unlinkSync(path);
  const configuration = createTriangularArbitrageConfiguration({enabled: true,
    capitalPool: {profitSweepThresholdInr: 1, maximumCycleLossInr: 30,
      dailyLossLimitInr: 150, maximumRecoveryLossInr: 30}}).capitalPool;
  assert.equal(configuration.totalAllocationInr, 1_000);
  assert.equal(configuration.activeCycleCapitalInr, 850);
  assert.equal(configuration.recoveryReserveInr, 100);
  assert.equal(configuration.feeTdsDustReserveInr, 50);
  assert.equal(configuration.minimumCapitalProtectionInr, 750);
  const manager = new AclaCapitalLoopManager(configuration, file, 20);
  const now = 1_800_100_000_000;
  const reservation = {cycleId: "cycle-profit", signalId: "signal-profit", planId: "plan-profit", pathId: "path-profit",
    exchange: "binance", startAsset: "USDT", initialQuantity: 100, reservedCapitalInr: 800, tdsCapitalLockInr: 8};
  assert.equal(manager.reserveCycle(reservation, now).state, "PRE_FLIGHT");
  assert.equal(manager.reserveCycle(reservation, now + 1).id, "cycle-profit");
  for (const sequence of [1, 2, 3] as const) {
    manager.beginLeg("cycle-profit", sequence, now + sequence * 10);
    manager.recordFilledLeg("cycle-profit", leg(sequence), now + sequence * 10 + 1);
  }
  const complete = manager.settleCycle("cycle-profit", 101, 8, 0.25, now + 100, {USDT: 0.25});
  assert.equal(complete.state, "COMPLETED");
  assert.equal(complete.realizedPnlInr, 7.75);
  const afterProfit = manager.getReport(now + 101);
  assert.equal(afterProfit.pool.openCycleId, null);
  assert.equal(afterProfit.pool.completedCycles, 1);
  assert.equal(afterProfit.pool.reinvestedProfitInr, 3.875);
  assert.equal(afterProfit.pool.sweepableProfitInr, 3.875);
  assert.equal(afterProfit.pool.tdsLockedInr, 8);
  assert.equal(afterProfit.pool.dustByAsset.USDT, 0.25);
  assert.equal(afterProfit.invariant.activeBalanced, true);
  assert.equal(manager.sweepProfit(3.875, "operator-test-sweep", now + 102).sweptProfitInr, 3.875);

  const restored = new AclaCapitalLoopManager(configuration, file, 20);
  assert.equal(restored.getCycle("cycle-profit")?.state, "COMPLETED");
  restored.reserveCycle({cycleId: "cycle-recovery", signalId: "signal-recovery", planId: "plan-recovery", pathId: "path-recovery",
    exchange: "binance", startAsset: "USDT", initialQuantity: 100, reservedCapitalInr: 800, tdsCapitalLockInr: 8}, now + 200);
  restored.beginLeg("cycle-recovery", 1, now + 201);
  restored.recordFilledLeg("cycle-recovery", leg(1), now + 202);
  restored.beginLeg("cycle-recovery", 2, now + 203);
  assert.equal(restored.markExposed("cycle-recovery", 2, "LEG_2_TIMEOUT", now + 204).state, "EXPOSED");
  restored.planRecovery("cycle-recovery", "DIRECT_RETURN_TO_START", now + 205);
  restored.beginRecovery("cycle-recovery", now + 206);
  assert.equal(restored.completeRecovery("cycle-recovery", 790, "RECOVERED_TO_START_ASSET", now + 207).state, "RECOVERED");
  const final = restored.getReport(now + 208);
  assert.equal(final.pool.openCycleId, null);
  assert.equal(final.pool.failedCycles, 1);
  assert.equal(final.pool.recoveredCycles, 1);
  assert.equal(final.pool.tdsLockedInr, 16);
  assert.equal(final.pool.recoveryReserveInUseInr, 0);
  assert.equal(final.invariant.activeBalanced, true);
  assert.equal(final.safety.globalCapitalMutationPerformed, false);
  assert.equal(final.safety.liveExecutionAllowed, false);
  assert.equal(final.safety.orderSubmissionAllowed, false);
  for (const suffix of [2, 3] as const) {
    const cycleId = `cycle-recovery-${suffix}`;
    restored.reserveCycle({cycleId, signalId: `signal-recovery-${suffix}`, planId: `plan-recovery-${suffix}`,
      pathId: `path-recovery-${suffix}`, exchange: "binance", startAsset: "USDT", initialQuantity: 100,
      reservedCapitalInr: 800, tdsCapitalLockInr: 8}, now + 300 + suffix * 10);
    restored.beginLeg(cycleId, 1, now + 301 + suffix * 10);
    restored.recordFilledLeg(cycleId, leg(1), now + 302 + suffix * 10);
    restored.beginLeg(cycleId, 2, now + 303 + suffix * 10);
    restored.markExposed(cycleId, 2, "LEG_2_TIMEOUT", now + 304 + suffix * 10);
    restored.planRecovery(cycleId, "DIRECT_RETURN_TO_START", now + 305 + suffix * 10);
    restored.beginRecovery(cycleId, now + 306 + suffix * 10);
    restored.completeRecovery(cycleId, 790, "RECOVERED_TO_START_ASSET", now + 307 + suffix * 10);
  }
  const tripped = restored.getReport(now + 400);
  assert.equal(tripped.pool.consecutiveFailedCycles, 3);
  assert.equal(tripped.pool.circuitBreakerState, "TRIPPED");
  assert.equal(tripped.pool.circuitBreakerReason, "CONSECUTIVE_FAILURE_LIMIT_REACHED");
  assert.throws(() => restored.reserveCycle({cycleId: "blocked-cycle", signalId: "blocked-signal",
    planId: "blocked-plan", pathId: "blocked-path", exchange: "binance", startAsset: "USDT",
    initialQuantity: 100, reservedCapitalInr: 800, tdsCapitalLockInr: 8}, now + 401),
  /ACLA_CIRCUIT_BREAKER_TRIPPED/);
  assert.equal(restored.releaseTdsCredit(32, "verified-tax-credit-test", now + 402).tdsLockedInr, 0);
  for (const path of [file, previous]) if (existsSync(path)) unlinkSync(path);

  const restartFile = join(process.cwd(), `acla-capital-loop-restart-test-${process.pid}.jsonl`);
  for (const path of [restartFile, `${restartFile}.previous`]) if (existsSync(path)) unlinkSync(path);
  const beforeRestart = new AclaCapitalLoopManager(configuration, restartFile, 20);
  beforeRestart.reserveCycle({...reservation, cycleId: "cycle-restart", signalId: "signal-restart",
    planId: "plan-restart", pathId: "path-restart"}, now + 500);
  for (const sequence of [1, 2, 3] as const) {
    beforeRestart.beginLeg("cycle-restart", sequence, now + 500 + sequence * 10);
    beforeRestart.recordFilledLeg("cycle-restart", leg(sequence), now + 501 + sequence * 10);
  }
  assert.equal(beforeRestart.getCycle("cycle-restart")?.state, "LEG_3_FILLED");
  const afterRestart = new AclaCapitalLoopManager(configuration, restartFile, 20);
  const restartClosed = afterRestart.reconcileRestoredThreeLegShadowCycle(now + 600);
  assert.equal(restartClosed?.state, "COMPLETED");
  assert.equal(restartClosed?.realizedPnlInr, 0);
  assert.equal(restartClosed?.dustInr, 2);
  assert.equal(afterRestart.reconcileRestoredThreeLegShadowCycle(now + 601), null);
  assert.equal(afterRestart.getReport(now + 602).pool.openCycleId, null);
  assert.equal(afterRestart.getReport(now + 602).invariant.activeBalanced, true);
  for (const path of [restartFile, `${restartFile}.previous`]) if (existsSync(path)) unlinkSync(path);
  console.log("ACLA CAPITAL LOOP MANAGER TEST PASSED.");
  console.log("Atomic reservation, closed-loop compounding, restart restore and bounded exposure recovery preserved the strategy-scoped capital invariant without account or order mutation.");
}

main();
