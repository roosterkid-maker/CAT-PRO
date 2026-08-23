import assert from "node:assert/strict";

import type {CentralStrategySettlementPolicy} from "../models/CentralStrategyExecutionPlan";
import type {CentralPaperPositionGroup, CentralPaperPositionLeg} from "../services/CentralPaperPositionLedgerService";
import {CentralPaperExitEvidenceProvider, type CentralPaperExitMarketSource} from "../services/CentralPaperExitEvidenceProvider";

const now = 1_780_600_000_000;
const positions: CentralPaperPositionLeg[] = [
  {id: "spot", sourceLegId: "spot", exchange: "binance", product: "SPOT", market: "BTCUSDT", signedQuantity: 1,
    settlementAsset: "USDT",
    entryPrice: 100, entryFeeQuote: 0.1, status: "OPEN", closePrice: null, closeFeeQuote: null, fundingPaymentQuote: null, realizedPnlQuote: null},
  {id: "perp", sourceLegId: "perp", exchange: "binance", product: "PERPETUAL", market: "BTCUSDT", signedQuantity: -1,
    settlementAsset: "USDT",
    entryPrice: 102, entryFeeQuote: 0.102, status: "OPEN", closePrice: null, closeFeeQuote: null, fundingPaymentQuote: null, realizedPnlQuote: null},
];
const group = {id: "basis-group", state: "OPEN", positions, openedAt: now - 1_000} as unknown as CentralPaperPositionGroup;
const source: CentralPaperExitMarketSource = {inspect: (position) => ({levels: [{price: position.product === "SPOT" ? 100 : 100.04, quantity: 2}],
  observedAt: now - 100, sourceTimestamp: now + 100, feePercent: 0.1, feeEvidenceId: `fee:${position.id}`, feeEvidenceSource: "STATIC_CONFIG"})};
const policy: Extract<CentralStrategySettlementPolicy, {kind: "BASIS_CONVERGENCE"}> = {kind: "BASIS_CONVERGENCE", lifecycleOwner: "CENTRAL_SHARED_ORCHESTRATOR",
  entryBasisPercent: 2, closeAtOrBelowAbsoluteBasisPercent: 0.5, nextOpeningDelayMs: 120_000, perpetualLeverage: 1,
  fundingTimestamps: [now + 10_000], requiresFundingEvidence: true,
  forcedTimeExitAllowed: false};

function main(): void {
  const provider = new CentralPaperExitEvidenceProvider(source, 1_000);
  const ready = provider.evaluate(group, policy, now);
  assert.equal(ready.state, "READY_TO_CLOSE");
  assert.ok((ready.metric ?? 99) < 0.5);
  assert.equal(ready.closeEvidence?.positions.length, 2);
  assert.equal(ready.closeEvidence?.positions.every((item) => item.fundingPaymentQuote === 0), true);
  assert.ok(ready.closeEvidence?.positions.find((item) => item.positionId === "spot")?.fundingPaymentEvidenceId.includes("not-applicable"));
  assert.ok(ready.closeEvidence?.positions.find((item) => item.positionId === "perp")?.fundingPaymentEvidenceId.includes("not-crossed"));
  assert.equal(ready.closeEvidence?.exchangeOrderEvidenceUsed, false);

  const hold = new CentralPaperExitEvidenceProvider({inspect: (position) => ({levels: [{price: position.product === "SPOT" ? 100 : 101, quantity: 2}],
    observedAt: now, sourceTimestamp: now + 100, feePercent: 0.1, feeEvidenceId: "fee", feeEvidenceSource: "STATIC_CONFIG"})}).evaluate(group, policy, now);
  assert.equal(hold.state, "HOLD");
  assert.equal(hold.closeEvidence, null);

  const crossed = provider.evaluate(group, {...policy, fundingTimestamps: [now - 1]}, now);
  assert.equal(crossed.state, "BLOCKED");
  assert.ok(crossed.blockers.some((item) => item.startsWith("PUBLIC_SETTLED_FUNDING_EVIDENCE_UNAVAILABLE")));

  const funded = new CentralPaperExitEvidenceProvider(source, 1_000, {get: (exchange, market, fundingTime) => ({
    version: "56.0", id: `funding-settlement:${exchange}:${market}:${fundingTime}`, exchange, market, settlementAsset: "USDT",
    fundingTime, fundingRate: 0.001, markPrice: 100, rateSource: "PUBLIC_SETTLED_FUNDING_RATE_HISTORY",
    priceSource: "FUNDING_HISTORY_ASSOCIATED_MARK_PRICE", priceQuality: "EXACT_EXCHANGE_ASSOCIATED_MARK_PRICE", observedAt: now,
    paymentFormula: "NEGATIVE_SIGNED_QUANTITY_X_MARK_PRICE_X_FUNDING_RATE", accountTransactionEvidenceUsed: false,
    liveExecutionAllowed: false, orderSubmissionAllowed: false,
  })}).evaluate(group, {...policy, fundingTimestamps: [now - 1]}, now);
  assert.equal(funded.state, "READY_TO_CLOSE");
  assert.equal(funded.closeEvidence?.positions.find((item) => item.positionId === "perp")?.fundingPaymentQuote, 0.1);

  const mismatchedFunding = new CentralPaperExitEvidenceProvider(source, 1_000, {get: (exchange, market, fundingTime) => ({
    version: "56.0", id: `funding-settlement:${exchange}:${market}:${fundingTime + 2_000}`, exchange, market,
    settlementAsset: "USDT", fundingTime: fundingTime + 2_000, fundingRate: 0.001, markPrice: 100,
    rateSource: "PUBLIC_SETTLED_FUNDING_RATE_HISTORY", priceSource: "FUNDING_HISTORY_ASSOCIATED_MARK_PRICE",
    priceQuality: "EXACT_EXCHANGE_ASSOCIATED_MARK_PRICE", observedAt: now,
    paymentFormula: "NEGATIVE_SIGNED_QUANTITY_X_MARK_PRICE_X_FUNDING_RATE", accountTransactionEvidenceUsed: false,
    liveExecutionAllowed: false, orderSubmissionAllowed: false,
  })}).evaluate(group, {...policy, fundingTimestamps: [now - 1]}, now);
  assert.equal(mismatchedFunding.state, "BLOCKED");
  assert.ok(mismatchedFunding.blockers.some((item) => item.startsWith("FUNDING_EVIDENCE_LINEAGE_MISMATCH")));

  const funding = provider.evaluate(group, {kind: "FUNDING_CAPTURE_THEN_EXIT", lifecycleOwner: "CENTRAL_SHARED_ORCHESTRATOR",
    notBefore: now - 1, fundingTimestamps: [now - 100, now - 50], requiresFundingEvidence: true, forcedTimeExitAllowed: false}, now);
  assert.equal(funding.state, "BLOCKED");
  assert.ok(funding.blockers.some((item) => item.startsWith("PUBLIC_SETTLED_FUNDING_EVIDENCE_UNAVAILABLE")));

  console.log("CENTRAL PAPER EXIT EVIDENCE PROVIDER TEST PASSED.");
  console.log("Convergence required full-depth opposite-side close prices, explicit fees and settled public funding lineage; no LIVE/order path was used.");
}

main();
