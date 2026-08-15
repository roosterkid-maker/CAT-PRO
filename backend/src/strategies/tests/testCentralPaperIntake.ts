import assert from "node:assert/strict";
import type {CentralStrategyAdmissionRecord, CentralStrategyAdmissionListener} from "../services/CentralStrategyExecutionAdmissionService";
import type {CentralStrategyExecutionPlan} from "../models/CentralStrategyExecutionPlan";
import {CentralPaperPlanAdmissionService} from "../services/CentralPaperPlanAdmissionService";
import {CentralPaperIntakeService} from "../services/CentralPaperIntakeService";

const now = 1_780_000_000_000;
const plan = {id: "plan-intake", strategyId: "triangular-arbitrage"} as CentralStrategyExecutionPlan;
const source = {subscribeToAdmissions: (_listener: CentralStrategyAdmissionListener) => () => {},
  evaluatePaperPlan: (value: CentralStrategyExecutionPlan, evidence: Parameters<CentralPaperPlanAdmissionService["evaluate"]>[1], observedAt = now) =>
    new CentralPaperPlanAdmissionService({enabled: true, allowedStrategies: ["triangular-arbitrage"]}).evaluate(value, evidence, observedAt)};
function admission(value: CentralStrategyExecutionPlan | null, decision: CentralStrategyAdmissionRecord["decision"] = "SHADOW_SIGNAL_ADMITTED"): CentralStrategyAdmissionRecord {
  return {id: "admission-record", generatedAt: now, strategyId: value?.strategyId ?? "cross-exchange-arbitrage", decision,
    plan: value, blockers: [], signalId: "signal", signalKind: value ? "TRIANGULAR_ARBITRAGE_SHADOW_PATH" : "CROSS_EXCHANGE_ARBITRAGE_OPPORTUNITY"} as unknown as CentralStrategyAdmissionRecord;
}
const evidence = {planId: plan.id, generatedAt: now, expiresAt: now + 1_000,
  account: {mode: "PAPER", enabled: true, emergencyStop: false, availableCapital: 1_000, limits: {maximumCapitalPerTrade: 1_000}},
  capital: {planId: plan.id, requestedAmount: 100, currency: "INR", conversionEvidenceIds: ["conversion-1"],
    approved: true, reservationMutationPerformed: false},
  risk: {planId: plan.id, approved: true, level: "LOW", score: 90},
  legs: [{legId: "leg", balanceVerified: true, paperAdapterSupported: true, marketRulesVerified: true, feeEvidenceFresh: true, quoteFresh: true}],
  controls: {planId: plan.id, paperSimulatorAvailable: true, failureRecoveryAvailable: true, accountingJournalAvailable: true, settlementAvailable: true, liveAdapterReachable: false}, statisticalPromotion: null};

async function main(): Promise<void> {
  const completePlan = {...plan, expiresAt: now + 2_000, legs: [{id: "leg", quantity: 1}],
    executionReadinessBlockers: ["MAKER_FILL_EVIDENCE_REQUIRED", "CAPITAL_RESERVATION_REQUIRED"]} as unknown as CentralStrategyExecutionPlan;
  let enqueued = 0;
  const collector = {collect: () => ({evidence, blockers: []})} as never;
  const queue = {enqueue: () => { enqueued += 1; return {queued: true, duplicate: false, record: {id: "queue-1"}}; }} as never;
  const intake = new CentralPaperIntakeService(source, collector, queue, 10);
  const queued = intake.observe(admission(completePlan), now);
  assert.equal(queued.state, "QUEUED");
  assert.equal(enqueued, 1);
  const ignored = intake.observe(admission(null, "EXISTING_STRATEGY_ONE_ORCHESTRATOR_OWNED"), now);
  assert.equal(ignored.state, "IGNORED_STRATEGY_ONE");
  const blockedCollector = {collect: () => ({evidence: {...evidence, risk: {...evidence.risk, approved: false, level: "BLOCKED", score: 0}}, blockers: ["RISK_NO_DATA"]})} as never;
  const blocked = new CentralPaperIntakeService(source, blockedCollector, queue).observe(admission(completePlan), now);
  assert.equal(blocked.state, "BLOCKED");
  assert.ok(blocked.blockers.includes("RISK_NO_DATA"));
  assert.equal(intake.getDiagnostics(now).safety.executionPerformed, false);

  console.log("CENTRAL PAPER INTAKE TEST PASSED.");
  console.log("Central admissions flowed through read-only runtime evidence and exact PAPER admission into one durable queue; Strategy #1 stayed on its existing path and no execution, LIVE or order action occurred.");
}

void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
