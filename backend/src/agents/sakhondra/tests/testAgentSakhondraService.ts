import assert from "node:assert/strict";

import type {
  StrategyOneExecutionTimingReport,
} from "../../../arbitrage/execution/StrategyOneExecutionTimingEvidenceService";
import type {
  StrategyOneTwoLegSessionRecord,
} from "../../../execution/live/arbitrage/StrategyOneTwoLegLiveExecutionService";
import type {
  ExecutionSettlementRecord,
} from "../../../execution/live/settlement/ExecutionSettlementRecord";
import type {
  StrategyOneTinyLiveOpportunityAuditReport,
} from "../../../execution/live/tiny-live/StrategyOneTinyLiveOpportunityAuditService";
import {
  AgentSakhondraService,
} from "../AgentSakhondraService";

const now = Date.UTC(2026, 7, 23, 6, 0, 0);

const audit = {
  schemaVersion: "126.1",
  generatedAt: now,
  mode: "READ_ONLY_BINANCE_BYBIT_TINY_LIVE_OPPORTUNITY_AUDIT",
  state: "READY_FOR_POLICY_REVIEW",
  thresholds: {
    discoveryNetProfitPercent: 0.05,
    qualificationNetProfitPercent: 0.3,
    activeTinyLiveNetProfitPercent: 0.3,
    liveNetProfitPercent: 0.3,
    dispatchReservedMaximumBookAgeMs: 227,
    minimumPolicyReviewSpanMs: 3_600_000,
  },
  observation: {
    firstObservedAt: now - 3_600_000,
    lastObservedAt: now,
    spanMs: 3_600_000,
    wallClockSpanMs: 3_600_000,
    eventSpanMs: 3_600_000,
    idleSinceLastObservationMs: 0,
    economicsGenerations: 200,
    profitBands: {discovered: 100, qualified: 50, liveEligible: 25},
    dispatchReservedLiveEligibleGenerations: 20,
  },
  blockerRanking: [
    {rank: 1, code: "DISPATCH_FRESHNESS_OR_SKEW", count: 30, detail: "Freshness failed."},
  ],
  routeRanking: [
    {
      rank: 1,
      routeKey: "COTIUSDT|COINDCX|BINANCE",
      market: "COTIUSDT",
      buyExchange: "coindcx",
      sellExchange: "binance",
      current: true,
      lastObservedAt: now,
      timingReady: true,
      economicsGenerations: 100,
      liveEligibleGenerations: 20,
      qualifiedGenerations: 30,
      discoveredGenerations: 50,
      dispatchReservedLiveEligibleGenerations: 15,
      latestNetProfitPercent: 0.42,
      bestNetProfitPercent: 0.8,
      p95NetProfitPercent: 0.55,
      p50EstimatedFeeImpactPercent: 0.2,
      dominantBlocker: "DISPATCH_FRESHNESS_OR_SKEW",
    },
  ],
  currentActionTime: {
    state: "BLOCKED",
    selectedRouteKey: null,
    fullyPreflightableMatches: 0,
    categories: [],
    blockers: ["No current executable route."],
  },
  safety: {},
} as unknown as StrategyOneTinyLiveOpportunityAuditReport;

const metric = (p99Ms: number | null) => ({
  sampleCount: p99Ms === null ? 0 : 100,
  retainedSamples: p99Ms === null ? 0 : 100,
  firstObservedAt: p99Ms === null ? null : now - 3_600_000,
  lastObservedAt: p99Ms === null ? null : now,
  p50Ms: p99Ms,
  p95Ms: p99Ms,
  p99Ms,
  maxMs: p99Ms,
});

const timing = {
  version: "106.0",
  generatedAt: now,
  running: true,
  routes: [
    {
      routeKey: "COTIUSDT|COINDCX|BINANCE",
      market: "COTIUSDT",
      buyExchange: "coindcx",
      sellExchange: "binance",
      firstObservedAt: now - 3_600_000,
      lastObservedAt: now,
      paperSnapshots: 100,
      liveLastLooks: 2,
      liveDispatches: 2,
      metrics: {
        buyQuoteAgeMs: metric(150),
        sellQuoteAgeMs: metric(160),
        venueQuoteAgeMs: metric(null),
        decisionToPipelineStartMs: metric(null),
        decisionToQueueMs: metric(null),
        decisionToExecutionStartMs: metric(40),
        decisionToPaperCompletionMs: metric(null),
        lastLookEvaluationMs: metric(null),
        lastLookToBuyDispatchMs: metric(null),
        lastLookToSellDispatchMs: metric(null),
        adapterResultMs: metric(null),
        privateOrderEventTransportMs: metric(null),
        privateFillEventTransportMs: metric(null),
      },
      calibration: {},
    },
  ],
} as unknown as StrategyOneExecutionTimingReport;

function session(id: string, state: StrategyOneTwoLegSessionRecord["state"]): StrategyOneTwoLegSessionRecord {
  return {
    schemaVersion: "108.0",
    sessionId: id,
    requestHash: id,
    opportunityId: id,
    lastLookDecisionId: id,
    buyIdempotencyKey: `${id}:buy`,
    sellIdempotencyKey: `${id}:sell`,
    buyRequest: {market: "COTIUSDT", exchange: "coindcx"},
    sellRequest: {market: "COTIUSDT", exchange: "binance"},
    state,
    preparedAt: now - 1_000,
    updatedAt: now,
    buyDispatchedAt: now - 900,
    sellDispatchedAt: now - 900,
    buyResponse: null,
    sellResponse: null,
    reasons: state === "FAILED" ? ["EXCHANGE_REJECTED"] : [],
    automaticRetryAllowed: false,
    automaticRecoveryOrderAllowed: false,
    newOrderSubmissionAllowed: false,
  } as unknown as StrategyOneTwoLegSessionRecord;
}

const liveSettlement: ExecutionSettlementRecord = {
  id: "settlement-live-1",
  sessionId: "live-1",
  planId: "plan-live-1",
  market: "COTIUSDT",
  buyExchange: "coindcx",
  sellExchange: "binance",
  status: "SETTLED",
  quantity: 10,
  buyAveragePrice: 10,
  sellAveragePrice: 10.1,
  buyNotional: 100,
  sellNotional: 101,
  grossProfit: 1,
  buyFees: 0.1,
  sellFees: 0.1,
  totalFees: 0.2,
  buySlippagePercent: 0,
  sellSlippagePercent: 0,
  totalAdverseSlippagePercent: 0,
  netProfit: 0.8,
  roiPercent: 0.8,
  executionDurationMs: 50,
  createdAt: now - 800,
  settledAt: now,
  reasons: [],
};

const report = new AgentSakhondraService({
  getOpportunityAudit: () => audit,
  getTimingReport: () => timing,
  listLiveSessions: () => [session("live-1", "COMPLETED"), session("live-2", "FAILED")],
  getSettlement: (sessionId) => sessionId === "live-1" ? liveSettlement : null,
}, 0).getReport(now);

assert.equal(report.evidenceBoundary.paperExecutionsIncluded, false);
assert.equal(report.conversion.liveAttempts, 2);
assert.equal(report.conversion.settledLiveTrades, 1);
assert.equal(report.conversion.unsuccessfulLiveAttempts, 1);
assert.equal(report.economics.realizedNetProfit, 0.8);
assert.equal(report.timing.operationalHeadroomMs, 27);
assert.equal(report.routes[0]?.settled, 1);
assert.match(report.codexPrompt, /PAPER and synthetic executions are excluded/);
assert.match(report.codexPrompt, /do not change trading mode/i);
assert.equal(report.safety.canSubmitOrders, false);
assert.equal(report.safety.canChangePolicy, false);

console.log("AGENT SAKHONDRA deterministic LIVE-only evidence tests passed.");
