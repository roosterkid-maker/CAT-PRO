import assert from "node:assert/strict";

import type {
  CentralPaperPositionGroup,
} from "../services/CentralPaperPositionLedgerService";

import {
  CentralPaperOpenPositionLifecycleService,
  type CentralPaperPositionLifecyclePort,
} from "../services/CentralPaperOpenPositionLifecycleService";

const now = 1_780_800_000_000;

function group(id: string, state: "OPEN" | "CLOSED"): CentralPaperPositionGroup {
  return {
    version: "41.0", id, resultId: `result:${id}`, planId: `plan:${id}`, strategyId: "spot-perpetual-basis-arbitrage",
    pattern: "SIMULATED_ENTRY_COMPLETE", state, openedAt: now - 10_000, updatedAt: now - 1_000,
    closedAt: state === "CLOSED" ? now - 1_000 : null, closeEvidenceId: state === "CLOSED" ? `close:${id}` : null,
    positions: [{id: `position:${id}`, sourceLegId: "leg", exchange: "binance", product: "PERPETUAL", market: "BTCUSDT",
      settlementAsset: "INR", signedQuantity: 1, entryPrice: 100, entryFeeQuote: 0.1, status: state,
      closePrice: state === "CLOSED" ? 101 : null, closeFeeQuote: state === "CLOSED" ? 0.1 : null,
      fundingPaymentQuote: state === "CLOSED" ? 0 : null, realizedPnlQuote: state === "CLOSED" ? 0.8 : null}],
    entryFeeQuote: 0.1, realizedPnlEvidenceStatus: state === "CLOSED" ? "AVAILABLE" : "NO_DATA",
    realizedPnlAsset: "INR", realizedNetPnlQuote: state === "CLOSED" ? 0.8 : null,
    accountPnlMutationPerformed: false, liveExecutionAllowed: false, orderSubmissionAllowed: false,
  };
}

function main(): void {
  const durableClosed = group("durable-closed", "CLOSED");
  const open = group("open", "OPEN");
  const accounting = new Map<string, "ACCOUNT_POSTED">();
  const booked: string[] = [];
  const released: string[] = [];
  const port: CentralPaperPositionLifecyclePort = {
    getOpenGroups: () => [open],
    getClosedGroups: () => [durableClosed],
    getJournal: () => ({simulation: {settlementPolicy: {kind: "BASIS_CONVERGENCE"}}}) as never,
    evaluate: (candidate) => ({state: "READY_TO_CLOSE", policyKind: "BASIS_CONVERGENCE", metric: 0.1, threshold: 0.5, blockers: [],
      closeEvidence: {id: `close:${candidate.id}`, groupId: candidate.id, generatedAt: now, expiresAt: now + 1_000,
        positions: candidate.positions.map((position) => ({positionId: position.id, closePrice: 101, closeFeePercent: 0.1,
          feeEvidenceId: "fee", feeEvidenceSource: "STATIC_CONFIG", fundingPaymentQuote: 0,
          fundingPaymentEvidenceId: "funding-not-crossed", fullyFilled: true})), exchangeOrderEvidenceUsed: false}}),
    close: (_groupId, evidence) => ({...open, state: "CLOSED", closedAt: now, updatedAt: now, closeEvidenceId: evidence.id,
      positions: open.positions.map((position) => ({...position, status: "CLOSED", closePrice: 101, closeFeeQuote: 0.101,
        fundingPaymentQuote: 0, realizedPnlQuote: 0.799})), realizedPnlEvidenceStatus: "AVAILABLE", realizedNetPnlQuote: 0.799}),
    convert: (candidate) => ({id: `conversion:${candidate.id}`, sourceAsset: "INR", targetAsset: "INR",
      sourceQuantity: Math.abs(candidate.realizedNetPnlQuote ?? 0), targetQuantity: Math.abs(candidate.realizedNetPnlQuote ?? 0),
      path: [], generatedAt: now, expiresAt: now + 1_000, valuationOnly: true, orderSubmissionAllowed: false}),
    getAccounting: (groupId) => accounting.has(groupId) ? ({state: "ACCOUNT_POSTED"} as never) : null,
    book: (candidate, conversion) => {
      booked.push(candidate.id); accounting.set(candidate.id, "ACCOUNT_POSTED");
      return {state: "ACCOUNT_POSTED", conversionEvidenceId: conversion.id} as never;
    },
    releaseCapital: (planId) => { released.push(planId); },
  };

  const service = new CentralPaperOpenPositionLifecycleService({enabled: true, pollIntervalMs: 1_000}, port);
  const result = service.runOnce(now);
  assert.equal(result.state, "COMPLETED");
  assert.equal(result.closed, 1);
  assert.equal(result.accounted, 2);
  assert.equal(result.reconciled, 1);
  assert.deepEqual(booked, ["durable-closed", "open"]);
  assert.deepEqual(released, [durableClosed.planId, open.planId]);
  assert.equal(service.getDiagnostics(now).safety.closedUnaccountedReconciliation, true);
  assert.equal(service.getDiagnostics(now).safety.perGroupFaultIsolation, true);
  assert.equal(service.getDiagnostics(now).safety.liveExecutionAllowed, false);

  console.log("CENTRAL PAPER OPEN POSITION LIFECYCLE TEST PASSED.");
  console.log("Durable closed-unaccounted evidence reconciled before open-position exit accounting; every path remained PAPER-only and fault-isolated.");
}

main();
