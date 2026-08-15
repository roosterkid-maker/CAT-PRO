import assert from "node:assert/strict";
import {CentralStrategyLiveReadinessService, type CentralStrategyLiveReadinessPort} from "../readiness/CentralStrategyLiveReadinessService";

const now = 1_780_300_000_000;

const port: CentralStrategyLiveReadinessPort = {
  getRegistered: () => [
    "cross-exchange-arbitrage", "cross-exchange-market-making", "triangular-arbitrage",
    "spot-perpetual-basis-arbitrage", "funding-rate-arbitrage", "perpetual-perpetual-arbitrage",
    "dynamic-market-making", "statistical-arbitrage",
  ].map((id, index) => ({metadata: {id, strategyNumber: index + 1, displayName: id}, runtime: {running: true}})),
  getCentralPaper: () => ({state: "OBSERVING", blockers: [], safety: {oneCentralAdmission: true,
    oneDurableQueue: true, executablePaperRecovery: true, liveExecutionAllowed: false, orderSubmissionAllowed: false}}),
  getCentralSoak: () => [
    "cross-exchange-market-making", "triangular-arbitrage", "spot-perpetual-basis-arbitrage",
    "funding-rate-arbitrage", "perpetual-perpetual-arbitrage", "dynamic-market-making", "statistical-arbitrage",
  ].map((strategyId) => ({strategyId, state: "SOAK_ACCEPTED" as const, closedCycles: 20, blockers: []})),
  getStrategyOnePaper: () => ({readyForPaperSoakReview: true, consecutivePasses: 20, blockers: []}),
  getLiveAdapters: () => ["coindcx", "binance", "bybit", "unocoin", "coinswitch"].map((exchange, index) => ({
    exchange, adapterRegistered: index !== 3, verificationState: index < 3 ? "VERIFIED" : "NOT_CONFIGURED",
    readOnlyVerificationFresh: index < 3, liveExecutionEnabled: false, adapterConnected: false,
    capabilities: index === 1 || index === 2 ? {supportsPostOnly: true, products: ["SPOT", "PERPETUAL"] as const,
      supportsReduceOnly: true}
      : index === 3 ? null : {supportsPostOnly: false, products: ["SPOT"] as const, supportsReduceOnly: false},
  })),
};

function main(): void {
  const report = new CentralStrategyLiveReadinessService(port).getReport(now);
  assert.equal(report.strategies.length, 8);
  assert.equal(report.registeredActualStrategies, 8);
  assert.equal(report.paperAcceptedStrategies, 8);
  assert.equal(report.decision, "NO_GO");
  assert.equal(report.strategies.find((item) => item.strategyId === "cross-exchange-arbitrage")?.state, "ACTIVATION_REVIEW_ONLY");
  assert.equal(report.architecture.POST_ONLY_ORDER_CONTRACT, true);
  assert.equal(report.strategies.find((item) => item.strategyId === "cross-exchange-market-making")?.blockers.includes("ARCHITECTURE:POST_ONLY_ORDER_CONTRACT"), false);
  assert.equal(report.architecture.MAKER_CANCEL_REPLACE_LIFECYCLE, true);
  assert.equal(report.architecture.FILL_DRIVEN_LIVE_HEDGE, true);
  assert.equal(report.architecture.CENTRAL_LIVE_ADMISSION_AND_DURABLE_QUEUE, true);
  assert.equal(report.architecture.CENTRAL_DISPATCH_AND_OUTCOME_JOURNAL, true);
  assert.equal(report.architecture.CENTRAL_MULTI_STRATEGY_LIVE_HANDOFF, true);
  assert.equal(report.architecture.SEQUENTIAL_THREE_LEG_LIVE_LIFECYCLE, true);
  assert.equal(report.architecture.TWO_SIDED_QUOTE_LIFECYCLE, true);
  assert.equal(report.architecture.DERIVATIVE_PRODUCT_ORDER_CONTRACT, true);
  assert.equal(report.architecture.REDUCE_ONLY_ORDER_CONTRACT, true);
  assert.equal(report.architecture.DERIVATIVE_LIVE_RECONCILIATION, true);
  assert.equal(report.architecture.AUTHORITATIVE_ORDER_FILL_FEE_EVIDENCE, true);
  assert.equal(report.architecture.JOURNAL_FIRST_CENTRAL_ORDER_GATEWAY, true);
  assert.equal(report.architecture.DURABLE_CENTRAL_LIFECYCLE_EVIDENCE, true);
  assert.equal(report.architecture.LIVE_RESIDUAL_SHARED_RECOVERY_STAGING, true);
  assert.equal(report.architecture.CENTRAL_PRODUCTION_LIFECYCLE_PORTS, true);
  assert.equal(report.architecture.PASSIVE_MAKER_HEDGE_LIVE_LIFECYCLE, true);
  assert.equal(report.architecture.EXACT_LIFECYCLE_RUNTIME_EVIDENCE_COLLECTOR, true);
  assert.equal(report.strategies.find((item) => item.strategyId === "cross-exchange-market-making")?.blockers.includes("ARCHITECTURE:MAKER_CANCEL_REPLACE_LIFECYCLE"), false);
  assert.equal(report.strategies.find((item) => item.strategyId === "cross-exchange-market-making")?.blockers.includes("ARCHITECTURE:CENTRAL_MULTI_STRATEGY_LIVE_HANDOFF"), false);
  assert.equal(report.strategies.find((item) => item.strategyId === "triangular-arbitrage")?.blockers.includes("ARCHITECTURE:SEQUENTIAL_THREE_LEG_LIVE_LIFECYCLE"), false);
  assert.equal(report.strategies.find((item) => item.strategyId === "triangular-arbitrage")?.blockers.includes("ARCHITECTURE:CENTRAL_MULTI_STRATEGY_LIVE_HANDOFF"), false);
  assert.equal(report.strategies.find((item) => item.strategyId === "dynamic-market-making")?.blockers.includes("ARCHITECTURE:TWO_SIDED_QUOTE_LIFECYCLE"), false);
  assert.equal(report.strategies.find((item) => item.strategyId === "dynamic-market-making")?.blockers.includes("ARCHITECTURE:CENTRAL_MULTI_STRATEGY_LIVE_HANDOFF"), false);
  assert.equal(report.architectureReadyStrategies, 8);
  assert.equal(report.strategies.find((item) => item.strategyId === "spot-perpetual-basis-arbitrage")?.blockers.includes("ARCHITECTURE:DERIVATIVE_PRODUCT_ORDER_CONTRACT"), false);
  assert.equal(report.strategies.find((item) => item.strategyId === "spot-perpetual-basis-arbitrage")?.blockers.includes("ARCHITECTURE:REDUCE_ONLY_ORDER_CONTRACT"), false);
  assert.equal(report.strategies.find((item) => item.strategyId === "spot-perpetual-basis-arbitrage")?.blockers.includes("ARCHITECTURE:DERIVATIVE_LIVE_RECONCILIATION"), false);
  assert.equal(report.adapters.registered, 4);
  assert.equal(report.safety.liveExecutionAllowed, false);
  assert.equal(report.safety.orderSubmissionPerformed, false);
  assert.ok(Object.isFrozen(report));
  console.log("CENTRAL STRATEGY LIVE READINESS TEST PASSED.");
  console.log("All eight strategies received evidence-backed architecture and PAPER-soak gates; central admission, journal, queue, exact lifecycle handoff and crash-safe dispatch were recognized while compile-time LIVE, dispatcher and order authority remained off.");
}

main();
