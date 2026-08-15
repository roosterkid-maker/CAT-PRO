import assert from "node:assert/strict";
import {join} from "node:path";
import type {CentralStrategyExecutionPlan} from "../models/CentralStrategyExecutionPlan";
import type {CentralPaperPlanAdmission} from "../services/CentralPaperPlanAdmissionService";
import {CentralPaperExecutionQueueService} from "../services/CentralPaperExecutionQueueService";

const now = 1_780_000_000_000;
const plan = {version: "35.0", id: "central-plan:queue", strategyId: "triangular-arbitrage", signalId: "signal:queue",
  signalKind: "TRIANGULAR_ARBITRAGE_SHADOW_PATH", routeFamily: "SPOT_TRIANGULAR", pattern: "SEQUENTIAL_THREE_LEG",
  settlementPolicy: {kind: "IMMEDIATE_CONVERSION_CYCLE", lifecycleOwner: "CENTRAL_SHARED_ORCHESTRATOR", startAsset: "USDT",
    initialQuantity: 100, modeledFinalQuantity: 101, flows: [{legId: "leg-1", fromAsset: "USDT", toAsset: "BTC"}]},
  executionOwner: "CENTRAL_SHARED_ORCHESTRATOR", compilationState: "COMPILED_SHADOW", promotionState: "BLOCKED",
  generatedAt: now, expiresAt: now + 20_000, legs: [{id: "leg-1", sequence: 1, exchange: "binance", product: "SPOT", market: "BTCUSDT",
    side: "BUY", orderType: "MARKET", quantity: 1, referencePrice: 100, reduceOnly: false, dependency: "PARALLEL", evidenceOnly: true}],
  modeledNetValue: 1, modeledNetValueUnit: "START_ASSET", executionReadinessBlockers: [], sourceExecutionAuthorized: false,
  capitalReservationAllowed: false, riskApprovalGranted: false, executionHandoffAllowed: false, automaticExecutionAllowed: false,
  paperExecutionAllowed: false, liveExecutionAllowed: false, orderSubmissionAllowed: false} as CentralStrategyExecutionPlan;
const admission = {version: "36.0", id: "admission-1", generatedAt: now, planId: plan.id, strategyId: plan.strategyId,
  state: "ELIGIBLE_FOR_CENTRAL_PAPER_QUEUE", blockers: [], intrinsicPlanBlockers: [], gates: {runtimeEnabled: true, strategyAllowed: true,
    planCurrent: true, evidenceCurrent: true, accountReady: true, capitalApproved: true, riskApproved: true, everyLegReady: true,
    controlsReady: true, researchPromotionReady: true}, capitalReservationMutationPerformed: false, executionHandoffAllowed: false,
  approvedCapitalInr: 100, paperExecutionPerformed: false, liveExecutionAllowed: false, orderSubmissionAllowed: false} as CentralPaperPlanAdmission;

async function main(): Promise<void> {
  const file = join(process.cwd(), "central-paper-queue.jsonl");
  const first = new CentralPaperExecutionQueueService(file, 10);
  const queued = first.enqueue(plan, admission, now);
  assert.equal(queued.queued, true);
  const duplicate = first.enqueue(plan, admission, now + 1);
  assert.equal(duplicate.duplicate, true);
  const lease = first.leaseNext("worker-1", now + 2, 1_000);
  assert.equal(lease?.state, "LEASED");
  assert.equal(lease?.executionAuthorized, false);

  const waitingPlan = {...plan, id: "central-plan:waiting", signalId: "signal:waiting"};
  first.enqueue(waitingPlan, {...admission, id: "admission-waiting", planId: waitingPlan.id}, now + 3);
  const waitingLease = first.leaseNext("worker-1", now + 4, 1_000)!;
  const deferred = first.deferForEvidence(waitingLease.id, waitingLease.leaseId!, "Public fill evidence pending.", now + 5, 500);
  assert.equal(deferred.state, "QUEUED");
  assert.equal(deferred.evidenceDeferrals, 1);
  assert.equal(first.leaseNext("worker-1", now + 504, 1_000), null);
  assert.equal(first.leaseNext("worker-1", now + 505, 1_000)?.attempts, 2);

  const restored = new CentralPaperExecutionQueueService(file, 10);
  assert.equal(restored.getDiagnostics(now + 506).states.leased, 2);
  assert.throws(() => restored.acknowledge(lease!.id, "wrong", "COMPLETED", "result-1", now + 4), /exact lease/);
  const completed = restored.acknowledge(lease!.id, lease!.leaseId!, "COMPLETED", "journal-1", now + 507);
  assert.equal(completed.state, "COMPLETED");
  assert.equal(completed.terminalEvidenceId, "journal-1");

  const finalRestore = new CentralPaperExecutionQueueService(file, 10);
  const diagnostics = finalRestore.getDiagnostics(now + 508);
  assert.equal(diagnostics.states.completed, 1);
  assert.equal(diagnostics.safety.restartSafe, true);
  assert.equal(diagnostics.safety.liveExecutionAllowed, false);
  assert.equal(diagnostics.safety.evidenceRetryBackoffRequired, true);
  assert.throws(() => first.enqueue(plan, {...admission, state: "BLOCKED"}, now + 509), /eligible/);

  console.log("CENTRAL PAPER EXECUTION QUEUE TEST PASSED.");
  console.log("Eligible exact-lineage plans were durably deduplicated, leased, acknowledged and restored; no execution authorization, LIVE action or order occurred.");
}

void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
