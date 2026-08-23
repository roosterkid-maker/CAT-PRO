import assert from "node:assert/strict";
import {existsSync, unlinkSync} from "node:fs";
import {join} from "node:path";
import type {CentralStrategyAdmissionListener, CentralStrategyAdmissionRecord} from "../services/CentralStrategyExecutionAdmissionService";
import type {CentralStrategyExecutionPlan} from "../models/CentralStrategyExecutionPlan";
import {AclaCapitalLoopManager} from "../triangular-arbitrage/AclaCapitalLoopManager";
import {AclaShadowLifecycleService} from "../triangular-arbitrage/AclaShadowLifecycleService";
import {createTriangularArbitrageConfiguration} from "../triangular-arbitrage/TriangularArbitrageConfiguration";
import type {TriangularArbitragePathSimulation} from "../triangular-arbitrage/TriangularArbitrageSimulationEngine";

class Admissions {
  private listener: CentralStrategyAdmissionListener | null = null;
  subscribeToAdmissions(listener: CentralStrategyAdmissionListener): () => void { this.listener = listener; return () => { this.listener = null; }; }
  emit(record: CentralStrategyAdmissionRecord): void { this.listener?.(record); }
}

function simulation(now: number): TriangularArbitragePathSimulation {
  const legs = ([1, 2, 3] as const).map((sequence) => ({market: `M${sequence}USDT`, fromAsset: sequence === 1 ? "USDT" : `A${sequence}`,
    toAsset: sequence === 3 ? "USDT" : `A${sequence + 1}`, action: sequence === 2 ? "BUY_BASE" as const : "SELL_BASE" as const,
    inputQuantity: 10, tradedInputQuantity: 10, outputBeforeFee: 10.03, feePercent: 0.1, feeAmount: 0.01003,
    feeAsset: sequence === 3 ? "USDT" : `A${sequence + 1}`, outputAfterFee: sequence === 3 ? 10.05 : 10.01997,
    averageFillPrice: 1, topOfBookPrice: 1, depthSlippagePercent: 0, roundingDustInputQuantity: 0,
    consumedDepthLevels: 1, orderBookTimestamp: now, orderBookAgeMs: 0, topOfBookMaximumInput: 1_000,
    capabilitySynchronizedAt: now, executionPolicy: "FOK_OR_IOC_LIMIT_FUTURE_ONLY" as const}));
  return {pathId: "path", exchange: "binance", startAsset: "USDT", assets: ["USDT", "A2", "A3", "USDT"],
    status: "QUALIFIED", blockers: [], initialSizingLimitQuantity: 10, initialInputQuantity: 10,
    retainedStartQuantity: 0, capitalUtilizationPercent: 100, finalOutputQuantity: 10.05,
    expectedNetProfitQuantity: 0.05, expectedNetProfitPercent: 0.5, netProfitQuantity: 0.03, netProfitPercent: 0.3,
    stressNetProfitQuantity: 0.03, stressNetProfitPercent: 0.3, absoluteNetProfitInr: 2.55,
    startAssetInrValue: 85, tdsCapitalLockInr: 8.5, referenceGrossMultiplier: 1.01,
    referenceGrossProfitPercent: 1, referenceFeeAdjustedProfitPercent: 0.7, feeDragPercent: 0.3,
    quantizationDragPercent: 0.2, reserveDragPercent: 0.2, computedNetMultiplier: 1.005,
    maximumBookSkewMs: 0, legs, executionAuthorized: false, automaticExecutionAllowed: false};
}

function plan(now: number): CentralStrategyExecutionPlan {
  return {version: "35.0", id: "plan", strategyId: "triangular-arbitrage", signalId: "signal",
    signalKind: "TRIANGULAR_ARBITRAGE_SHADOW_PATH", routeFamily: "SPOT_TRIANGULAR", pattern: "SEQUENTIAL_THREE_LEG",
    settlementPolicy: {kind: "IMMEDIATE_CONVERSION_CYCLE", lifecycleOwner: "CENTRAL_SHARED_ORCHESTRATOR", startAsset: "USDT",
    initialQuantity: 10, modeledFinalQuantity: 10.05, flows: [
        {legId: "plan:1", fromAsset: "USDT", toAsset: "A2"}, {legId: "plan:2", fromAsset: "A2", toAsset: "A3"},
        {legId: "plan:3", fromAsset: "A3", toAsset: "USDT"}]}, executionOwner: "CENTRAL_SHARED_ORCHESTRATOR",
    compilationState: "COMPILED_SHADOW", promotionState: "BLOCKED", generatedAt: now, expiresAt: now + 500,
    legs: ([1, 2, 3] as const).map((sequence) => ({id: `plan:${sequence}`, sequence, exchange: "binance", product: "SPOT" as const,
      market: `M${sequence}USDT`, side: sequence === 2 ? "BUY" as const : "SELL" as const, orderType: "MARKET" as const,
      quantity: 10, referencePrice: 1, reduceOnly: false, dependency: sequence === 1 ? "PARALLEL" as const : "AFTER_PREVIOUS" as const,
      evidenceOnly: true as const})), modeledNetValue: 0.03, modeledNetValueUnit: "START_ASSET",
    executionReadinessBlockers: ["SEQUENTIAL_LEG_FAILURE_RECOVERY_REQUIRED"], sourceExecutionAuthorized: false,
    capitalReservationAllowed: false, riskApprovalGranted: false, executionHandoffAllowed: false,
    automaticExecutionAllowed: false, paperExecutionAllowed: false, liveExecutionAllowed: false, orderSubmissionAllowed: false};
}

function main(): void {
  const file = join(process.cwd(), `acla-shadow-lifecycle-test-${process.pid}.jsonl`);
  for (const path of [file, `${file}.previous`]) if (existsSync(path)) unlinkSync(path);
  const config = createTriangularArbitrageConfiguration({enabled: true, maximumOrderBookAgeMs: 5_000,
    maximumOpportunityAgeMs: 5_000, routeCooldownMs: 1_000});
  const capital = new AclaCapitalLoopManager(config.capitalPool, file, 20);
  const admissions = new Admissions();
  const now = Date.now();
  const source = {getConfiguration: () => config, getQualifiedSimulationBySignalId: (id: string) => id === "signal" ? simulation(now) : null};
  const lifecycle = new AclaShadowLifecycleService(admissions, source, capital, 20);
  lifecycle.start();
  admissions.emit({id: "admission", generatedAt: now, strategyId: "triangular-arbitrage", signalId: "signal",
    signalKind: "TRIANGULAR_ARBITRAGE_SHADOW_PATH", routeFamily: "SPOT_TRIANGULAR", economicOwnershipKey: "SPOT_TRI:BINANCE:PATH",
    decision: "SHADOW_SIGNAL_ADMITTED", ownerStrategyId: "triangular-arbitrage", ownerSignalId: "signal",
    ownershipExpiresAt: now + 500, blockers: [], plan: plan(now), paperAdmission: null,
    signalExecutionAuthorized: false, executionHandoffAllowed: false, automaticExecutionAllowed: false,
    paperExecutionAllowed: false, liveExecutionAllowed: false, orderSubmissionAllowed: false});
  const report = lifecycle.getReport(Date.now());
  assert.equal(report.completed, 1);
  assert.equal(report.recentOutcomes[0]?.state, "COMPLETED");
  assert.equal(report.safety.centralAdmissionRequired, true);
  assert.equal(report.safety.accountMutationPerformed, false);
  assert.equal(capital.getCycle("acla-cycle:signal")?.state, "COMPLETED");
  assert.equal(capital.getReport().invariant.activeBalanced, true);
  lifecycle.stop();
  for (const path of [file, `${file}.previous`]) if (existsSync(path)) unlinkSync(path);
  console.log("ACLA SHADOW LIFECYCLE TEST PASSED.");
  console.log("A centrally admitted full-depth signal completed one restart-safe simulated closed loop with exact sequential lineage and zero PAPER/LIVE/order authority.");
}

main();
