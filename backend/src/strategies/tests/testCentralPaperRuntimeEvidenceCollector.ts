import assert from "node:assert/strict";
import type {CentralStrategyExecutionPlan} from "../models/CentralStrategyExecutionPlan";
import {CentralPaperRuntimeEvidenceCollector} from "../services/CentralPaperRuntimeEvidenceCollector";
import type {CentralPaperRuntimeEvidencePort} from "../services/CentralPaperRuntimeEvidenceCollector";

const now = 1_780_000_000_000;
const plan = {id: "plan-evidence", strategyId: "funding-rate-arbitrage", expiresAt: now + 5_000, modeledNetValue: 2,
  legs: [{id: "leg-1", exchange: "binance", product: "PERPETUAL", market: "BTCUSDT", side: "BUY", orderType: "MARKET", quantity: 1, referencePrice: 100},
    {id: "leg-2", exchange: "bybit", product: "PERPETUAL", market: "BTCUSDT", side: "SELL", orderType: "MARKET", quantity: 1, referencePrice: 101}]} as unknown as CentralStrategyExecutionPlan;
function account() { return {id: "paper", name: "CAT", mode: "PAPER" as const, enabled: true, emergencyStop: false,
  limits: {maximumCapitalPerTrade: 1_000, maximumDailyLoss: 100, maximumOpenTrades: 5, maximumDailyTrades: 50},
  initialCapital: 1_000, currentCapital: 1_000, availableCapital: 1_000, todayProfit: 0, todayLoss: 0, openTrades: 0, tradesToday: 0}; }
function port(ready: boolean): CentralPaperRuntimeEvidencePort { return {getAccount: account, evaluateAccountCapital: () => ({approved: ready, reasons: ready ? [] : ["capital no data"]}),
  valueCapital: (value) => ({planId: value.id, generatedAt: now, currency: "INR", amount: value.legs.some((item) => item.quantity === null) ? null : 101,
    sourceRequirements: [{asset: "USDT", amount: 101}], conversions: value.legs.some((item) => item.quantity === null) ? [] : [{id: "conversion-1"} as never],
    blockers: value.legs.some((item) => item.quantity === null) ? ["CAPITAL_QUANTITY_UNAVAILABLE"] : [], balanceMutationPerformed: false,
    liveExecutionAllowed: false, orderSubmissionAllowed: false}),
  inspectLeg: (leg, _observedAt, funding) => ({legId: leg.id, balanceVerified: funding.externalBalanceRequired && ready,
    fundingVerified: ready, fundingSource: funding.source, externalBalanceRequired: funding.externalBalanceRequired,
    paperAdapterSupported: true, marketRulesVerified: true,
    feeEvidenceFresh: ready, quoteFresh: true, fullQuantityAvailable: true, quoteTimestamp: now, blockers: ready ? [] : ["MARGIN_NO_DATA"]}),
  assessRisk: () => ({approved: ready, level: ready ? "LOW" : "BLOCKED", score: ready ? 90 : 0, reasons: ready ? [] : ["risk no data"]}),
  getStatisticalPromotion: () => null}; }

async function main(): Promise<void> {
  const ready = new CentralPaperRuntimeEvidenceCollector(port(true), 2_000).collect(plan, now);
  assert.equal(ready.requestedCapital, 101);
  assert.equal(ready.evidence.capital.approved, true);
  assert.equal(ready.evidence.legs.every((item) => item.balanceVerified && item.feeEvidenceFresh), true);
  assert.equal(ready.evidence.controls.liveAdapterReachable, false);
  assert.equal(ready.safety.capitalReservationMutationPerformed, false);

  const blocked = new CentralPaperRuntimeEvidenceCollector(port(false), 2_000).collect(plan, now);
  assert.equal(blocked.evidence.risk.approved, false);
  assert.equal(blocked.evidence.legs.every((item) => !item.balanceVerified), true);
  assert.ok(blocked.blockers.some((item) => item.includes("MARGIN_NO_DATA")));
  assert.equal(blocked.safety.inferredMarginAllowed, false);
  const incomplete = new CentralPaperRuntimeEvidenceCollector(port(true)).collect({...plan, legs: [{...plan.legs[0]!, quantity: null}]} as CentralStrategyExecutionPlan, now);
  assert.equal(incomplete.requestedCapital, null);
  assert.equal(incomplete.evidence.capital.approved, false);

  const triangle = {
    ...plan,
    id: "plan-triangle-funding",
    strategyId: "triangular-arbitrage",
    pattern: "SEQUENTIAL_THREE_LEG",
    settlementPolicy: {kind: "IMMEDIATE_CONVERSION_CYCLE", lifecycleOwner: "CENTRAL_SHARED_ORCHESTRATOR",
      startAsset: "USDT", initialQuantity: 100, modeledFinalQuantity: 100.2,
      flows: [{legId: "triangle-leg-1", fromAsset: "USDT", toAsset: "BTC"},
        {legId: "triangle-leg-2", fromAsset: "BTC", toAsset: "ETH"},
        {legId: "triangle-leg-3", fromAsset: "ETH", toAsset: "USDT"}]},
    legs: [
      {id: "triangle-leg-1", sequence: 1, dependency: "PARALLEL", quantity: 1},
      {id: "triangle-leg-2", sequence: 2, dependency: "AFTER_PREVIOUS", quantity: 2},
      {id: "triangle-leg-3", sequence: 3, dependency: "AFTER_PREVIOUS", quantity: 3},
    ].map((item) => ({...plan.legs[0]!, ...item, product: "SPOT"})),
  } as CentralStrategyExecutionPlan;
  const triangleReady = new CentralPaperRuntimeEvidenceCollector(port(true), 2_000).collect(triangle, now);
  assert.deepEqual(triangleReady.evidence.legs.map((item) => ({source: item.fundingSource,
    external: item.externalBalanceRequired, balance: item.balanceVerified, funded: item.fundingVerified})), [
    {source: "AUTHENTICATED_ACCOUNT_BALANCE", external: true, balance: true, funded: true},
    {source: "PREVIOUS_LEG_MODELED_PROCEEDS", external: false, balance: false, funded: true},
    {source: "PREVIOUS_LEG_MODELED_PROCEEDS", external: false, balance: false, funded: true},
  ]);

  console.log("CENTRAL PAPER RUNTIME EVIDENCE COLLECTOR TEST PASSED.");
  console.log("Exact account, per-leg balance/rules/fee/quote/depth, risk and research gates were collected read-only; missing margin remained NO_DATA and no reservation, LIVE or order action occurred.");
}

void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
