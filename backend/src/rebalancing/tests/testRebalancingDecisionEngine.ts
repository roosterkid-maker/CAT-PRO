import assert from "node:assert/strict";

import type {
  CapitalAllocationAndImbalanceReport,
  ExchangeImbalanceAssessment,
} from "../services/CapitalAllocationAndImbalanceService";

import {
  RebalancingDecisionEngine,
} from "../services/RebalancingDecisionEngine";

const NOW = 1_750_000_000_000;

function assessment(
  exchange: string,
  imbalanceUsdt: number,
  transferableSurplusUsdt: number,
): ExchangeImbalanceAssessment {
  const state = imbalanceUsdt <= -5
    ? "CRITICAL_LOW" as const
    : imbalanceUsdt < 0
      ? "UNDERFUNDED" as const
      : imbalanceUsdt >= 5
        ? "CRITICAL_HIGH" as const
        : imbalanceUsdt > 0
          ? "OVERFUNDED" as const
          : "BALANCED" as const;
  return {
    exchange,
    displayName: exchange,
    state,
    currentCapitalUsdt: 20 + imbalanceUsdt,
    availableCapitalUsdt: 20 + imbalanceUsdt,
    targetCapitalUsdt: 20,
    minimumCapitalUsdt: 10,
    maximumCapitalUsdt: 35,
    emergencyReserveUsdt: 0,
    imbalanceUsdt,
    imbalancePercentOfTarget: imbalanceUsdt / 20 * 100,
    deficitToTargetUsdt: Math.max(0, -imbalanceUsdt),
    surplusAboveTargetUsdt: Math.max(0, imbalanceUsdt),
    transferableSurplusUsdt,
    activeReservedCapitalUsdt: 0,
    suggestedAction: state === "BALANCED"
      ? "NO_ACTION"
      : "HARD_REBALANCE_ANALYSIS",
    reasons: [],
  };
}

function report(
  exchanges: readonly ExchangeImbalanceAssessment[],
): CapitalAllocationAndImbalanceReport {
  return {
    version: "122.0",
    generatedAt: NOW,
    state: "READY",
    policy: {
      policyId: "fixture",
      revision: 1,
      softImbalancePercent: 10,
      hardImbalancePercent: 20,
      criticalImbalancePercent: 35,
      targets: [],
    },
    capital: {
      totalUsdt: 100,
      availableAfterReservationsUsdt: 98,
      reservedInventoryUsdt: 2,
      inTransitUsdt: null,
    },
    exchanges,
    summary: {
      criticalLow: exchanges.filter((item) => item.state === "CRITICAL_LOW").length,
      underfunded: exchanges.filter((item) => item.state === "UNDERFUNDED").length,
      balanced: exchanges.filter((item) => item.state === "BALANCED").length,
      overfunded: exchanges.filter((item) => item.state === "OVERFUNDED").length,
      criticalHigh: exchanges.filter((item) => item.state === "CRITICAL_HIGH").length,
      totalDeficitToTargetUsdt: exchanges.reduce(
        (total, item) => total + item.deficitToTargetUsdt,
        0,
      ),
      totalSurplusAboveTargetUsdt: exchanges.reduce(
        (total, item) => total + item.surplusAboveTargetUsdt,
        0,
      ),
      totalTransferableSurplusUsdt: exchanges.reduce(
        (total, item) => total + item.transferableSurplusUsdt,
        0,
      ),
    },
    blockers: [],
    safety: {
      readOnly: true,
      paperAccountingMutated: false,
      balanceMutated: false,
      transferPlanned: false,
      transferSubmitted: false,
      withdrawalSubmitted: false,
      liveOrderSubmitted: false,
      reservedCapitalExcluded: true,
      neverDrainRuleApplied: true,
    },
  };
}

function main(): void {
  const engine = new RebalancingDecisionEngine();
  const balanced = report([
    assessment("binance", 0, 10),
    assessment("bybit", 0, 10),
  ]);
  const balancedPlan = engine.plan(balanced, {}, undefined, NOW + 1);
  assert.equal(balancedPlan.state, "NO_REBALANCE_REQUIRED");
  assert.equal(balancedPlan.desiredMoves.length, 0);

  const imbalanced = report([
    assessment("binance", -10, 0),
    assessment("bybit", -5, 0),
    assessment("unocoin", 15, 12),
    assessment("coindcx", 0, 0),
    assessment("coinswitch", 0, 0),
  ]);
  const hardPlan = engine.plan(imbalanced, {}, undefined, NOW + 1);
  assert.equal(hardPlan.state, "HARD_REBALANCE_ANALYSIS_REQUIRED");
  assert.equal(hardPlan.desiredMoves.length, 2);
  assert.equal(hardPlan.desiredMoves[0].amountUsdt, 10);
  assert.equal(hardPlan.desiredMoves[1].amountUsdt, 2);
  assert.equal(hardPlan.unresolvedDeficitUsdt, 3);
  assert.equal(hardPlan.unusedTransferableSurplusUsdt, 0);
  assert.equal(hardPlan.safety.transferSubmissionAllowed, false);
  assert.equal(hardPlan.safety.noTransferLoops, true);
  assert.equal(
    hardPlan.desiredMoves.some(
      (move) => move.sourceExchange === move.destinationExchange,
    ),
    false,
  );

  const naturalPlan = engine.plan(
    imbalanced,
    { naturalRebalanceCandidateKeys: ["BTCUSDT|bybit>binance"] },
    undefined,
    NOW + 1,
  );
  assert.equal(naturalPlan.state, "NATURAL_REBALANCE_AVAILABLE");
  assert.equal(naturalPlan.currentAction, "PRIORITIZE_NATURAL_REVERSE");

  const recoveryPlan = engine.plan(
    imbalanced,
    { executionRecoveryPending: true },
    undefined,
    NOW + 1,
  );
  assert.equal(recoveryPlan.state, "BLOCKED");
  assert.equal(recoveryPlan.desiredMoves.length, 0);
  assert.match(recoveryPlan.blockers.join(" "), /recovery/i);

  console.log("Read-only rebalancing decision engine tests passed.");
}

main();
