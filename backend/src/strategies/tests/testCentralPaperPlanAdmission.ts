import assert from "node:assert/strict";
import type {CentralStrategyExecutionPlan} from "../models/CentralStrategyExecutionPlan";
import {CentralPaperPlanAdmissionService} from "../services/CentralPaperPlanAdmissionService";
import type {CentralPaperPlanEvidence} from "../services/CentralPaperPlanAdmissionService";

const now = 1_780_000_000_000;
const plan: CentralStrategyExecutionPlan = {
  version: "35.0", id: "central-plan:test", strategyId: "triangular-arbitrage", signalId: "signal:test",
  signalKind: "TRIANGULAR_ARBITRAGE_SHADOW_PATH", routeFamily: "SPOT_TRIANGULAR", pattern: "SEQUENTIAL_THREE_LEG",
  settlementPolicy: {kind: "IMMEDIATE_CONVERSION_CYCLE", lifecycleOwner: "CENTRAL_SHARED_ORCHESTRATOR", startAsset: "USDT",
    initialQuantity: 100, modeledFinalQuantity: 101, flows: [1, 2, 3].map((sequence) => ({legId: `central-plan-leg:${sequence}`, fromAsset: `A${sequence - 1}`, toAsset: `A${sequence}`}))},
  executionOwner: "CENTRAL_SHARED_ORCHESTRATOR", compilationState: "COMPILED_SHADOW", promotionState: "BLOCKED",
  generatedAt: now, expiresAt: now + 5_000, modeledNetValue: 1, modeledNetValueUnit: "START_ASSET",
  legs: [1, 2, 3].map((sequence) => ({id: `central-plan-leg:${sequence}`, sequence, exchange: "binance", product: "SPOT" as const,
    market: `M${sequence}USDT`, side: sequence === 2 ? "SELL" as const : "BUY" as const, orderType: "MARKET" as const,
    quantity: 1, referencePrice: 100 + sequence, reduceOnly: false as const,
    dependency: sequence === 1 ? "PARALLEL" as const : "AFTER_PREVIOUS" as const, evidenceOnly: true as const})),
  executionReadinessBlockers: ["ACCOUNT_BALANCE_EVIDENCE_REQUIRED", "CAPITAL_RESERVATION_REQUIRED", "RISK_APPROVAL_REQUIRED", "CENTRAL_PAPER_ADAPTER_NOT_ADMITTED"],
  sourceExecutionAuthorized: false, capitalReservationAllowed: false, riskApprovalGranted: false,
  executionHandoffAllowed: false, automaticExecutionAllowed: false, paperExecutionAllowed: false,
  liveExecutionAllowed: false, orderSubmissionAllowed: false,
};

function evidence(overrides: Partial<CentralPaperPlanEvidence> = {}): CentralPaperPlanEvidence {
  return {
    planId: plan.id, generatedAt: now, expiresAt: now + 2_000,
    account: {id: "paper", name: "CAT PRO", mode: "PAPER", enabled: true, emergencyStop: false,
      limits: {maximumCapitalPerTrade: 1_000, maximumDailyLoss: 100, maximumOpenTrades: 5, maximumDailyTrades: 50},
      initialCapital: 1_000, currentCapital: 1_000, availableCapital: 1_000, todayProfit: 0, todayLoss: 0, openTrades: 0, tradesToday: 0},
    capital: {assessmentId: "capital-1", planId: plan.id, requestedAmount: 100, currency: "INR",
      conversionEvidenceIds: ["conversion-1"], approved: true, reservationMutationPerformed: false},
    risk: {assessmentId: "risk-1", planId: plan.id, approved: true, level: "LOW", score: 90},
    legs: plan.legs.map((item) => ({legId: item.id, balanceVerified: true, paperAdapterSupported: true, marketRulesVerified: true, feeEvidenceFresh: true, quoteFresh: true})),
    controls: {planId: plan.id, paperSimulatorAvailable: true, failureRecoveryAvailable: true, accountingJournalAvailable: true, settlementAvailable: true, liveAdapterReachable: false},
    statisticalPromotion: null,
    ...overrides,
  };
}

async function main(): Promise<void> {
  const defaultClosed = new CentralPaperPlanAdmissionService().evaluate(plan, evidence(), now);
  assert.equal(defaultClosed.state, "BLOCKED");
  assert.ok(defaultClosed.blockers.includes("CENTRAL_PAPER_RUNTIME_DISABLED"));

  const service = new CentralPaperPlanAdmissionService({enabled: true, allowedStrategies: ["triangular-arbitrage"], maximumEvidenceAgeMs: 5_000, maximumCapitalPerPlan: 500});
  const eligible = service.evaluate(plan, evidence(), now);
  assert.equal(eligible.state, "ELIGIBLE_FOR_CENTRAL_PAPER_QUEUE");
  assert.deepEqual(eligible.blockers, []);
  assert.equal(eligible.approvedCapitalInr, 100);
  assert.equal(eligible.capitalReservationMutationPerformed, false);
  assert.equal(eligible.executionHandoffAllowed, false);
  assert.ok(Object.isFrozen(eligible));

  const sequentialFunding = evidence({legs: plan.legs.map((item, index) => ({
    legId: item.id,
    balanceVerified: index === 0,
    fundingVerified: true,
    fundingSource: index === 0 ? "AUTHENTICATED_ACCOUNT_BALANCE" : "PREVIOUS_LEG_MODELED_PROCEEDS",
    externalBalanceRequired: index === 0,
    paperAdapterSupported: true,
    marketRulesVerified: true,
    feeEvidenceFresh: true,
    quoteFresh: true,
  }))});
  const sequentiallyEligible = service.evaluate(plan, sequentialFunding, now);
  assert.equal(sequentiallyEligible.state, "ELIGIBLE_FOR_CENTRAL_PAPER_QUEUE",
    "Intermediate triangle legs must use prior-leg proceeds, not require duplicate wallet inventory.");
  const missingStartAsset = service.evaluate(plan, evidence({legs: sequentialFunding.legs.map((item, index) =>
    index === 0 ? {...item, balanceVerified: false, fundingVerified: false} : item)}), now);
  assert.equal(missingStartAsset.state, "BLOCKED");
  assert.ok(missingStartAsset.blockers.includes("ONE_OR_MORE_PAPER_LEGS_NOT_READY"));

  const makerLifecyclePlan = {
    ...plan,
    strategyId: "cross-exchange-market-making" as const,
    pattern: "PASSIVE_MAKER_THEN_HEDGE" as const,
    executionReadinessBlockers: [
      "MAKER_FILL_EVIDENCE_REQUIRED",
      "HEDGE_BALANCE_EVIDENCE_REQUIRED",
      "CAPITAL_RESERVATION_REQUIRED",
    ],
  };
  const makerLifecycleAdmission = new CentralPaperPlanAdmissionService({
    enabled: true,
    allowedStrategies: ["cross-exchange-market-making"],
    maximumEvidenceAgeMs: 5_000,
    maximumCapitalPerPlan: 500,
  }).evaluate(makerLifecyclePlan, evidence(), now);
  assert.equal(makerLifecycleAdmission.state, "ELIGIBLE_FOR_CENTRAL_PAPER_QUEUE");
  assert.deepEqual(makerLifecycleAdmission.intrinsicPlanBlockers, [],
    "Future maker-fill evidence must be owned by the simulation lifecycle, not treated as an intake prerequisite.");

  const stale = service.evaluate(plan, evidence({generatedAt: now - 6_000}), now);
  assert.equal(stale.state, "BLOCKED");
  assert.ok(stale.blockers.includes("CENTRAL_PAPER_ADMISSION_EVIDENCE_STALE_OR_MISMATCHED"));

  const futurePlan = {...plan, generatedAt: now + 1};
  const future = service.evaluate(futurePlan, evidence(), now);
  assert.equal(future.state, "BLOCKED");
  assert.ok(future.blockers.includes("PLAN_GENERATED_IN_FUTURE"));

  const missingLeg = service.evaluate(plan, evidence({legs: evidence().legs.slice(0, 2)}), now);
  assert.ok(missingLeg.blockers.includes("ONE_OR_MORE_PAPER_LEGS_NOT_READY"));

  const missingConversion = service.evaluate(plan, evidence({capital: {...evidence().capital, conversionEvidenceIds: []}}), now);
  assert.ok(missingConversion.blockers.includes("READ_ONLY_CAPITAL_ASSESSMENT_NOT_APPROVED"));

  const wrongMode = service.evaluate(plan, evidence({account: {...evidence().account, mode: "LIVE"}}), now);
  assert.ok(wrongMode.blockers.includes("PAPER_ACCOUNT_NOT_READY"));
  assert.equal(wrongMode.liveExecutionAllowed, false);

  const inventoryMissingPlan = {
    ...plan,
    strategyId: "dynamic-market-making" as const,
    executionReadinessBlockers: ["INVENTORY_EVIDENCE_MISSING"],
  };
  const inventoryFailClosed = new CentralPaperPlanAdmissionService({
    enabled: true,
    allowedStrategies: ["dynamic-market-making"],
  }).evaluate(inventoryMissingPlan, evidence(), now);
  assert.equal(inventoryFailClosed.state, "BLOCKED");
  assert.ok(inventoryFailClosed.intrinsicPlanBlockers.includes("INVENTORY_EVIDENCE_MISSING"));

  console.log("CENTRAL PAPER PLAN ADMISSION TEST PASSED.");
  console.log("Exact plan lineage, authenticated inventory, account, read-only capital/risk, every-leg and recovery/accounting controls gated one shared PAPER queue; no LIVE or order action occurred.");
}

void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
