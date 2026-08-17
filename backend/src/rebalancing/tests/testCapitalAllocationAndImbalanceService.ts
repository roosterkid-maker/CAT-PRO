import assert from "node:assert/strict";

import type {
  NormalizedExchangeInventorySnapshot,
  NormalizedInventorySnapshot,
} from "../models/NormalizedInventorySnapshot";

import {
  CapitalAllocationAndImbalanceService,
  DEFAULT_CAPITAL_ALLOCATION_POLICY,
} from "../services/CapitalAllocationAndImbalanceService";

const NOW = 1_750_000_000_000;

function exchange(
  id: string,
  capitalUsdt: number,
  availableUsdt = capitalUsdt,
  availableAfterReservationsUsdt = availableUsdt,
): NormalizedExchangeInventorySnapshot {
  return {
    exchange: id,
    displayName: id,
    balanceStatus: "SYNCHRONIZED",
    lastSynchronizedAt: NOW - 10,
    balanceAgeMs: 10,
    balanceUsableForDecision: true,
    assets: [],
    totals: {
      positiveAssets: 0,
      currentValuations: 0,
      staleValuations: 0,
      unavailableValuations: 0,
      knownAvailableValueUsdt: availableUsdt,
      knownAvailableAfterReservationsValueUsdt:
        availableAfterReservationsUsdt,
      knownLockedValueUsdt: capitalUsdt - availableUsdt,
      knownTotalValueUsdt: capitalUsdt,
      decisionUsableValueUsdt: capitalUsdt,
      authoritativeAvailableValueUsdt: availableUsdt,
      authoritativeAvailableAfterReservationsValueUsdt:
        availableAfterReservationsUsdt,
      authoritativeLockedValueUsdt: capitalUsdt - availableUsdt,
      authoritativeTotalValueUsdt: capitalUsdt,
      directUsdtAvailable: availableUsdt,
      directUsdtAvailableAfterReservations:
        availableAfterReservationsUsdt,
      directUsdtLocked: capitalUsdt - availableUsdt,
      directUsdtTotal: capitalUsdt,
    },
  };
}

function inventory(): NormalizedInventorySnapshot {
  const exchanges = [
    exchange("binance", 10, 10, 8),
    exchange("bybit", 20),
    exchange("coindcx", 20),
    exchange("coinswitch", 20),
    exchange("unocoin", 30),
  ];

  return {
    version: "121.0",
    generatedAt: NOW,
    state: "READY_FOR_REBALANCING_ANALYSIS",
    valuationAsset: "USDT",
    maximumBalanceAgeMs: 30_000,
    exchanges,
    totals: {
      exchanges: 5,
      synchronizedExchanges: 5,
      positiveAssets: 0,
      currentValuations: 0,
      staleValuations: 0,
      unavailableValuations: 0,
      knownAvailableValueUsdt: 100,
      knownAvailableAfterReservationsValueUsdt: 98,
      knownLockedValueUsdt: 0,
      knownTotalValueUsdt: 100,
      decisionUsableValueUsdt: 100,
      authoritativeAvailableCapitalUsdt: 98,
      authoritativeLockedCapitalUsdt: 0,
      authoritativeTotalCapitalUsdt: 100,
      directUsdtAvailable: 100,
      directUsdtAvailableAfterReservations: 98,
      directUsdtLocked: 0,
      directUsdtTotal: 100,
    },
    accountingCapital: {
      mode: "PAPER",
      unit: "ACCOUNTING_UNIT",
      initial: 100,
      current: 100,
      available: 100,
      reserved: 0,
      includedInWalletValuation: false,
    },
    reservations: {
      scope: "GLOBAL_AND_EXCHANGE_ASSET",
      accountingUnit: "ACCOUNTING_UNIT",
      activeReservations: 1,
      activeReservedCapital: 2,
      activeInventoryReservations: 1,
      unscopedActiveReservations: 0,
      activeInventoryHolds: [],
      perExchangeAssetReservationSupported: true,
      appliedToWalletInventory: true,
    },
    transfers: {
      state: "NO_TRANSFER_LEDGER",
      pendingTransferCapitalUsdt: null,
      inTransitCapitalUsdt: null,
      includedInAvailableCapital: false,
    },
    blockers: [],
    limitations: [],
    safety: {
      readOnly: true,
      balanceMutationAllowed: false,
      paperAccountingMutationAllowed: false,
      liveOrderSubmissionAllowed: false,
      internalTransferSubmissionAllowed: false,
      externalTransferSubmissionAllowed: false,
      withdrawalSubmissionAllowed: false,
      missingValuationsTreatedAsZero: false,
      nativeAssetUnitsSummedAcrossAssets: false,
      accountingCapitalMixedWithWalletValuation: false,
    },
  };
}

function main(): void {
  const service = new CapitalAllocationAndImbalanceService();
  const report = service.evaluate(inventory(), undefined, NOW + 1);

  assert.equal(report.state, "READY");
  assert.equal(report.exchanges.length, 5);
  assert.equal(report.capital.totalUsdt, 100);
  assert.equal(report.capital.availableAfterReservationsUsdt, 98);
  assert.equal(report.capital.reservedInventoryUsdt, 2);
  assert.equal(report.summary.criticalLow, 1);
  assert.equal(report.summary.criticalHigh, 1);

  const binance = report.exchanges.find(
    (item) => item.exchange === "binance",
  );
  const unocoin = report.exchanges.find(
    (item) => item.exchange === "unocoin",
  );
  assert.equal(binance?.state, "CRITICAL_LOW");
  assert.equal(binance?.activeReservedCapitalUsdt, 2);
  assert.equal(binance?.transferableSurplusUsdt, 0);
  assert.equal(unocoin?.state, "CRITICAL_HIGH");
  assert.equal(unocoin?.transferableSurplusUsdt, 10);
  assert.equal(report.safety.readOnly, true);
  assert.equal(report.safety.transferSubmitted, false);
  assert.equal(Object.isFrozen(report), true);

  const invalidPolicy = {
    ...DEFAULT_CAPITAL_ALLOCATION_POLICY,
    targets: DEFAULT_CAPITAL_ALLOCATION_POLICY.targets.map(
      (target, index) => ({
        ...target,
        targetPercent: index === 0 ? 19 : target.targetPercent,
      }),
    ),
  };
  const invalidPolicyReport = service.evaluate(
    inventory(),
    invalidPolicy,
    NOW + 1,
  );
  assert.equal(invalidPolicyReport.state, "BLOCKED_POLICY");
  assert.equal(invalidPolicyReport.exchanges.length, 0);

  const incomplete = inventory();
  const incompleteExchange = {
    ...incomplete.exchanges[0],
    totals: {
      ...incomplete.exchanges[0].totals,
      authoritativeTotalValueUsdt: null,
    },
  };
  const incompleteReport = service.evaluate({
    ...incomplete,
    exchanges: [incompleteExchange, ...incomplete.exchanges.slice(1)],
  }, undefined, NOW + 1);
  assert.equal(incompleteReport.state, "BLOCKED_EVIDENCE");
  assert.equal(incompleteReport.exchanges.length, 0);

  const staleReport = service.evaluate(
    inventory(),
    undefined,
    NOW + 30_001,
  );
  assert.equal(staleReport.state, "BLOCKED_EVIDENCE");
  assert.match(staleReport.blockers.join(" "), /old/i);

  console.log("Capital allocation and imbalance service tests passed.");
}

main();
