import assert from "node:assert/strict";
import type {StrategySignalListener} from "../contracts/StrategyController";
import type {StrategySignal} from "../models/StrategySignal";
import {CentralStrategyExecutionAdmissionService} from "../services/CentralStrategyExecutionAdmissionService";

class SignalSource {
  private listener: StrategySignalListener | null = null;
  subscribeToSignals(listener: StrategySignalListener): () => void { this.listener = listener; return () => { if (this.listener === listener) this.listener = null; }; }
  emit(signal: StrategySignal): void { this.listener?.(signal); }
}

function signal(kind: StrategySignal["kind"], id: string, now: number, expiresAt: number): StrategySignal {
  if (kind === "FUNDING_RATE_ARBITRAGE_SHADOW_OPPORTUNITY") {
    return {id, strategyId: "funding-rate-arbitrage", kind, evidenceStatus: "AVAILABLE", source: "DerivativeMarketData",
      sourceSnapshotGeneratedAt: now, generatedAt: now, observedAt: now, expiresAt,
      executionAuthorized: false, automaticExecutionAllowed: false,
      evidence: {market: "BTCUSDT", longExchange: "binance", shortExchange: "bybit",
        quantity: 1, longEntryVwap: 100, shortEntryVwap: 101, expectedNetQuote: 0.5,
        grossDislocationPercent: 1,
        nextFundingTimeLong: now + 500, nextFundingTimeShort: now + 500,
        executionReadinessBlockers: ["MARGIN_EVIDENCE_MISSING"]}} as unknown as StrategySignal;
  }
  if (kind === "PERPETUAL_PERPETUAL_ARBITRAGE_SHADOW_OPPORTUNITY") {
    return {id, strategyId: "perpetual-perpetual-arbitrage", kind, evidenceStatus: "AVAILABLE", source: "DerivativeMarketData",
      sourceSnapshotGeneratedAt: now, generatedAt: now, observedAt: now, expiresAt,
      executionAuthorized: false, automaticExecutionAllowed: false,
      evidence: {market: "BTCUSDT", longExchange: "bybit", shortExchange: "binance",
        quantity: 1, longEntryVwap: 100, shortEntryVwap: 101, expectedNetQuote: 0.5,
        grossDislocationPercent: 1,
        nextFundingTimeLong: now + 500, nextFundingTimeShort: now + 500,
        executionReadinessBlockers: ["DERIVATIVE_ADAPTER_MISSING"]}} as unknown as StrategySignal;
  }
  return {id, strategyId: "cross-exchange-arbitrage", kind: "CROSS_EXCHANGE_ARBITRAGE_OPPORTUNITY",
    evidenceStatus: "AVAILABLE", source: "OpportunityService", sourceOpportunityId: id,
    sourceSnapshotGeneratedAt: now, generatedAt: now, observedAt: now, expiresAt,
    executionAuthorized: false, automaticExecutionAllowed: false,
    evidence: {market: "ETHUSDT", buyExchange: "binance", sellExchange: "bybit",
      executableQuantity: 1, buyPrice: 100, sellPrice: 101, netProfit: 0.5}} as unknown as StrategySignal;
}

async function main(): Promise<void> {
  const now = Date.now(); const source = new SignalSource();
  const service = new CentralStrategyExecutionAdmissionService(source, 20);
  service.start(); assert.equal(service.isRunning(), true);
  const funding = signal("FUNDING_RATE_ARBITRAGE_SHADOW_OPPORTUNITY", "funding-1", now, now + 1_000);
  const admitted = service.admit(funding, now);
  assert.equal(admitted.decision, "SHADOW_SIGNAL_ADMITTED");
  assert.equal(admitted.executionHandoffAllowed, false);
  assert.equal(admitted.plan?.version, "35.0");
  assert.equal(admitted.plan?.legs.length, 2);
  assert.equal(admitted.paperAdmission?.state, "BLOCKED");
  assert.ok(admitted.paperAdmission?.blockers.includes("CENTRAL_PAPER_RUNTIME_DISABLED"));
  assert.ok(admitted.blockers.includes("CENTRAL_PAPER_ADAPTER_NOT_ADMITTED"));

  const duplicate = service.admit(funding, now + 1);
  assert.equal(duplicate.decision, "DUPLICATE_SIGNAL_REJECTED");

  const perp = signal("PERPETUAL_PERPETUAL_ARBITRAGE_SHADOW_OPPORTUNITY", "perp-1", now, now + 2_000);
  const conflict = service.admit(perp, now + 2);
  assert.equal(conflict.decision, "ECONOMIC_OWNERSHIP_CONFLICT_REJECTED");
  assert.equal(conflict.ownerStrategyId, "funding-rate-arbitrage");

  const admittedAfterExpiry = service.admit(perp, now + 1_001);
  assert.equal(admittedAfterExpiry.decision, "SHADOW_SIGNAL_ADMITTED");

  const strategyOne = service.admit(signal("CROSS_EXCHANGE_ARBITRAGE_OPPORTUNITY", "strategy-1", now, now + 2_000), now + 10);
  assert.equal(strategyOne.decision, "EXISTING_STRATEGY_ONE_ORCHESTRATOR_OWNED");
  assert.equal(strategyOne.executionHandoffAllowed, false);
  assert.ok(strategyOne.blockers.includes("EXECUTION_REMAINS_OWNED_BY_EXISTING_STRATEGY_ONE_ORCHESTRATOR"));

  const invalid = {...funding, id: "invalid", executionAuthorized: true} as unknown as StrategySignal;
  assert.throws(() => service.admit(invalid, now + 3), /non-executable/);
  const diagnostics = service.getDiagnostics(now + 10);
  assert.equal(diagnostics.safety.parallelExecutionEngineCreated, false);
  assert.equal(diagnostics.safety.economicOwnershipDeduplication, true);
  assert.equal(diagnostics.safety.canonicalPlanCompilerSharedByAllStrategies, true);
  assert.equal(diagnostics.safety.centralPaperAdmissionFailClosed, true);
  assert.equal(diagnostics.safety.liveExecutionAllowed, false);
  service.stop(); assert.equal(service.isRunning(), false);
  console.log("CENTRAL STRATEGY EXECUTION ADMISSION TEST PASSED.");
  console.log("Signal-ID and economic-route ownership were deduplicated across strategy types while Strategy #1 retained its existing orchestrator; no execution handoff, PAPER, LIVE or order action occurred.");
}

void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
