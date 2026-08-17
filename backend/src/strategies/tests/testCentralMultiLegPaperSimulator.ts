import assert from "node:assert/strict";
import type {CentralStrategyExecutionPlan} from "../models/CentralStrategyExecutionPlan";
import type {CentralPaperQueueRecord} from "../services/CentralPaperExecutionQueueService";
import {CentralMultiLegPaperSimulator} from "../services/CentralMultiLegPaperSimulator";
import type {CentralPaperSimulationEvidence} from "../services/CentralMultiLegPaperSimulator";

const now = 1_780_000_000_000;
function record(dependencies: readonly ("PARALLEL" | "AFTER_PREVIOUS" | "PASSIVE_FILL_TRIGGER")[] = ["PARALLEL", "AFTER_PREVIOUS", "AFTER_PREVIOUS"]): CentralPaperQueueRecord {
  const plan = {version: "35.0", id: "plan:multi", strategyId: "triangular-arbitrage", signalId: "signal:multi",
    signalKind: "TRIANGULAR_ARBITRAGE_SHADOW_PATH", routeFamily: "SPOT_TRIANGULAR", pattern: "SEQUENTIAL_THREE_LEG",
    settlementPolicy: {kind: "IMMEDIATE_CONVERSION_CYCLE", lifecycleOwner: "CENTRAL_SHARED_ORCHESTRATOR", startAsset: "USDT",
      initialQuantity: 100, modeledFinalQuantity: 1, flows: dependencies.map((_item, index) => ({legId: `leg-${index + 1}`,
        fromAsset: ["USDT", "A1", "A2"][index]!, toAsset: ["A1", "A2", "USDT"][index]!}))},
    executionOwner: "CENTRAL_SHARED_ORCHESTRATOR", compilationState: "COMPILED_SHADOW", promotionState: "BLOCKED", generatedAt: now,
    expiresAt: now + 10_000, legs: dependencies.map((dependency, index) => ({id: `leg-${index + 1}`, sequence: index + 1,
      exchange: "binance", product: "SPOT", market: `M${index + 1}USDT`, side: index === 2 ? "SELL" : "BUY", orderType: "MARKET",
      quantity: [0.999, 0.009, 0.008][index]!, referencePrice: 100 + index, reduceOnly: false, dependency, evidenceOnly: true})), modeledNetValue: 1,
    modeledNetValueUnit: "START_ASSET", executionReadinessBlockers: [], sourceExecutionAuthorized: false, capitalReservationAllowed: false,
    riskApprovalGranted: false, executionHandoffAllowed: false, automaticExecutionAllowed: false, paperExecutionAllowed: false,
    liveExecutionAllowed: false, orderSubmissionAllowed: false} as CentralStrategyExecutionPlan;
  return {version: "37.0", id: "queue:multi", plan, admissionId: "admission:multi", state: "LEASED", queuedAt: now,
    approvedCapitalInr: 100, updatedAt: now, attempts: 1, evidenceDeferrals: 0, nextLeaseEligibleAt: now, lastEvidenceWaitReason: null,
    leaseId: "lease-1", leasedBy: "worker", leaseExpiresAt: now + 5_000, terminalEvidenceId: null,
    executionAuthorized: false, liveExecutionAllowed: false, orderSubmissionAllowed: false};
}

function evidence(source = record(), overrides: Partial<CentralPaperSimulationEvidence> = {}): CentralPaperSimulationEvidence {
  return {planId: source.plan.id, queueRecordId: source.id, leaseId: source.leaseId!, generatedAt: now, expiresAt: now + 4_000,
    legs: source.plan.legs.map((item) => ({legId: item.id, settlementAsset: "USDT", feePercent: 0.1, feeEvidenceId: `fee:${item.id}`, feeEvidenceSource: "ACCOUNT_API",
      simulatedSlippagePercent: 0.02, fillRatio: 1, terminalStatus: "FILLED", passiveFillEvidenceId: null})),
    exchangeOrderEvidenceUsed: false, ...overrides};
}

async function main(): Promise<void> {
  const simulator = new CentralMultiLegPaperSimulator();
  const source = record();
  const complete = simulator.simulate(source, evidence(source), now + 1);
  assert.equal(complete.status, "SIMULATED_CYCLE_COMPLETE");
  assert.equal(complete.legs.length, 3);
  assert.ok(complete.totalFeeQuote > 0);
  assert.equal(complete.pnlEvidenceStatus, "AVAILABLE");
  assert.equal(complete.realizedPnlAsset, "USDT");
  assert.ok(complete.realizedNetProfit !== null);
  assert.equal(complete.exchangeOrderSubmitted, false);

  const partialEvidence = evidence(source);
  const partial = simulator.simulate(source, {...partialEvidence, legs: partialEvidence.legs.map((item, index) => index === 0
    ? {...item, fillRatio: 0.5, terminalStatus: "PARTIALLY_FILLED" as const} : item)}, now + 2);
  assert.equal(partial.status, "RECOVERY_REQUIRED");
  assert.equal(partial.legs[1]?.status, "SKIPPED_DEPENDENCY");
  assert.equal(partial.recoveryRequired, true);

  const passiveRecord = record(["PARALLEL", "PASSIVE_FILL_TRIGGER"]);
  const passivePlan = {...passiveRecord.plan, pattern: "PASSIVE_MAKER_THEN_HEDGE" as const,
    legs: passiveRecord.plan.legs.map((item, index) => ({...item, orderType: index === 0 ? "LIMIT_POST_ONLY" as const : "MARKET" as const}))};
  const passiveSource = {...passiveRecord, plan: passivePlan};
  assert.throws(() => simulator.simulate(passiveSource, evidence(passiveSource), now + 3), /explicit fill evidence/);

  const basisSource = record(["PARALLEL", "PARALLEL"]);
  const basisPlan = {...basisSource.plan, pattern: "PARALLEL_TWO_LEG" as const,
    routeFamily: "SPOT_PERPETUAL" as const,
    settlementPolicy: {kind: "BASIS_CONVERGENCE" as const, lifecycleOwner: "CENTRAL_SHARED_ORCHESTRATOR" as const,
      entryBasisPercent: 1, closeAtOrBelowAbsoluteBasisPercent: 0.25, fundingTimestamps: [now + 60_000] as const,
      requiresFundingEvidence: true as const, forcedTimeExitAllowed: false as const},
    legs: basisSource.plan.legs.map((item, index) => ({...item, product: index === 0 ? "SPOT" as const : "PERPETUAL" as const,
      market: "BTCUSDT", side: index === 0 ? "BUY" as const : "SELL" as const, quantity: 1})),
  };
  const basisRecord = {...basisSource, plan: basisPlan};
  const basis = simulator.simulate(basisRecord, evidence(basisRecord), now + 4);
  assert.equal(basis.status, "SIMULATED_ENTRY_COMPLETE");
  assert.equal(basis.recoveryRequired, false);
  assert.equal(basis.pnlEvidenceStatus, "NO_DATA");

  const statisticalPlan = {...basisPlan, pattern: "PARALLEL_STATISTICAL_PAIR" as const,
    routeFamily: "PERPETUAL_STATISTICAL_PAIR" as const,
    settlementPolicy: {kind: "STATISTICAL_MEAN_REVERSION" as const, lifecycleOwner: "CENTRAL_SHARED_ORCHESTRATOR" as const,
      entryZScore: 2.5, closeAtOrBelowAbsoluteZScore: 0.5, baselineSpreadMean: 0, baselineSpreadStandardDeviation: 1,
      hedgeBeta: 1.2, leftMarket: "ETHUSDT", rightMarket: "BTCUSDT", fundingTimestamps: [now + 60_000, now + 60_000] as const,
      requiresFundingEvidence: true as const, forcedTimeExitAllowed: false as const},
    legs: basisPlan.legs.map((item, index) => ({...item, product: "PERPETUAL" as const,
      market: index === 0 ? "ETHUSDT" : "BTCUSDT", quantity: index === 0 ? 2 : 0.1})),
  };
  const statisticalRecord = {...basisRecord, plan: statisticalPlan};
  const statistical = simulator.simulate(statisticalRecord, evidence(statisticalRecord), now + 5);
  assert.equal(statistical.status, "SIMULATED_ENTRY_COMPLETE");
  assert.equal(statistical.recoveryRequired, false);

  const statisticalPartialEvidence = evidence(statisticalRecord);
  const statisticalPartial = simulator.simulate(statisticalRecord, {...statisticalPartialEvidence,
    legs: statisticalPartialEvidence.legs.map((item, index) => index === 1
      ? {...item, fillRatio: 0.5, terminalStatus: "PARTIALLY_FILLED" as const}
      : item)}, now + 6);
  assert.equal(statisticalPartial.status, "RECOVERY_REQUIRED");

  assert.throws(() => simulator.simulate({...source, state: "QUEUED"}, evidence(source), now + 1), /active queue lease/);
  console.log("CENTRAL MULTI-LEG PAPER SIMULATOR TEST PASSED.");
  console.log("Sequential, passive, basis and statistical entry paths used settlement-policy-aware hedge checks; partial mismatches required recovery without inventing P&L or reaching LIVE adapters.");
}

void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
