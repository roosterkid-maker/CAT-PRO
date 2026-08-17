import assert from "node:assert/strict";

import type {
  ExchangeBalanceDashboardReport,
} from "../../portfolio/services/ExchangeBalancePortfolioService";

import type {
  PortfolioSnapshot,
} from "../../portfolio/models/PortfolioSnapshot";

import type {
  CapitalReservationDiagnostics,
} from "../../trading/capital/CapitalReservation";

import {
  NormalizedInventorySnapshotService,
} from "../services/NormalizedInventorySnapshotService";

const NOW = 1_750_000_000_000;

function balanceReport(
  allSynchronized: boolean,
): ExchangeBalanceDashboardReport {
  const definitions = [
    ["binance", "Binance"],
    ["bybit", "Bybit"],
    ["coindcx", "CoinDCX"],
    ["coinswitch", "CoinSwitch"],
    ["unocoin", "UnoCoin"],
  ] as const;

  const exchanges = definitions.map(([exchange, displayName], index) => {
    const status = allSynchronized
      ? "SYNCHRONIZED" as const
      : index < 3
        ? "SYNCHRONIZED" as const
        : "NOT_CONFIGURED" as const;
    const assets = exchange === "binance"
      ? [{
          asset: "USDT",
          availableBalance: 8,
          lockedBalance: 2,
          totalBalance: 10,
        }]
      : exchange === "bybit"
        ? [{
            asset: "BTC",
            availableBalance: 0.009,
            lockedBalance: 0.001,
            totalBalance: 0.01,
          }]
        : exchange === "coindcx"
          ? [{
              asset: "DOGE",
              availableBalance: 10,
              lockedBalance: 0,
              totalBalance: 10,
            }]
          : [];

    return {
      exchange,
      displayName,
      status,
      lastAttemptedAt: NOW - 10,
      lastSynchronizedAt: status === "SYNCHRONIZED" ? NOW - 10 : null,
      balanceAgeMs: status === "SYNCHRONIZED" ? 10 : null,
      synchronizedAssetCount: assets.length,
      positiveAssetCount: assets.length,
      zeroAssetCount: 0,
      retainedAfterFailure: false,
      reasons: [],
      assets,
    };
  });

  return {
    generatedAt: NOW,
    synchronizationInProgress: false,
    maximumFreshAgeMs: 30_000,
    totals: {
      exchanges: exchanges.length,
      synchronized: exchanges.filter(
        (exchange) => exchange.status === "SYNCHRONIZED",
      ).length,
      stale: 0,
      failed: 0,
      notConfigured: exchanges.filter(
        (exchange) => exchange.status === "NOT_CONFIGURED",
      ).length,
      pending: 0,
      positiveAssets: 3,
    },
    exchanges,
  };
}

function portfolio(
  includeDogeValuation: boolean,
  btcValuationAgeMs = 100,
): PortfolioSnapshot {
  return {
    baseCurrency: "USDT",
    generatedAt: NOW,
    capital: {
      mode: "PAPER",
      accountInitialCapital: 100_000,
      accountCurrentCapital: 100_100,
      accountAvailableCapital: 99_900,
      accountReservedCapital: 200,
      synchronizedExchangeEquityUsdt: 510,
      synchronizedExchangeAvailableEquityUsdt: 458,
      synchronizedExchangeLockedEquityUsdt: 52,
      liquidUsdt: 8,
      tradableCapitalUsdt: 99_900,
    },
    exchanges: [
      {
        exchange: "binance",
        assets: [{
          exchange: "binance",
          asset: "USDT",
          availableBalance: 8,
          lockedBalance: 2,
          totalBalance: 10,
          priceUsdt: 1,
          availableValueUsdt: 8,
          lockedValueUsdt: 2,
          totalValueUsdt: 10,
          valuationMarket: null,
          valuationSource: "STABLE_ASSET",
          valuationTimestamp: NOW,
          valuationAgeMs: 0,
          synchronizedAt: NOW - 10,
          balanceAgeMs: 10,
        }],
        assetCount: 1,
        valuedAssetCount: 1,
        unvaluedAssetCount: 0,
        totalEquityUsdt: 10,
        availableEquityUsdt: 8,
        lockedEquityUsdt: 2,
        directUsdtAvailable: 8,
        directUsdtLocked: 2,
        directUsdtTotal: 10,
        oldestBalanceAgeMs: 10,
        newestBalanceAgeMs: 10,
        lastSynchronizedAt: NOW - 10,
      },
      {
        exchange: "bybit",
        assets: [{
          exchange: "bybit",
          asset: "BTC",
          availableBalance: 0.009,
          lockedBalance: 0.001,
          totalBalance: 0.01,
          priceUsdt: 50_000,
          availableValueUsdt: 450,
          lockedValueUsdt: 50,
          totalValueUsdt: 500,
          valuationMarket: "BTCUSDT",
          valuationSource: "BEST_BID",
          valuationTimestamp: NOW - btcValuationAgeMs,
          valuationAgeMs: btcValuationAgeMs,
          synchronizedAt: NOW - 10,
          balanceAgeMs: 10,
        }],
        assetCount: 1,
        valuedAssetCount: 1,
        unvaluedAssetCount: 0,
        totalEquityUsdt: 500,
        availableEquityUsdt: 450,
        lockedEquityUsdt: 50,
        directUsdtAvailable: 0,
        directUsdtLocked: 0,
        directUsdtTotal: 0,
        oldestBalanceAgeMs: 10,
        newestBalanceAgeMs: 10,
        lastSynchronizedAt: NOW - 10,
      },
      {
        exchange: "coindcx",
        assets: [{
          exchange: "coindcx",
          asset: "DOGE",
          availableBalance: 10,
          lockedBalance: 0,
          totalBalance: 10,
          priceUsdt: includeDogeValuation ? 0.1 : null,
          availableValueUsdt: includeDogeValuation ? 1 : null,
          lockedValueUsdt: includeDogeValuation ? 0 : null,
          totalValueUsdt: includeDogeValuation ? 1 : null,
          valuationMarket: includeDogeValuation ? "DOGEUSDT" : null,
          valuationSource: includeDogeValuation ? "BEST_BID" : "UNAVAILABLE",
          valuationTimestamp: includeDogeValuation ? NOW - 100 : null,
          valuationAgeMs: includeDogeValuation ? 100 : null,
          synchronizedAt: NOW - 10,
          balanceAgeMs: 10,
        }],
        assetCount: 1,
        valuedAssetCount: includeDogeValuation ? 1 : 0,
        unvaluedAssetCount: includeDogeValuation ? 0 : 1,
        totalEquityUsdt: includeDogeValuation ? 1 : 0,
        availableEquityUsdt: includeDogeValuation ? 1 : 0,
        lockedEquityUsdt: 0,
        directUsdtAvailable: 0,
        directUsdtLocked: 0,
        directUsdtTotal: 0,
        oldestBalanceAgeMs: 10,
        newestBalanceAgeMs: 10,
        lastSynchronizedAt: NOW - 10,
      },
    ],
    totals: {
      exchanges: 3,
      assets: 3,
      valuedAssets: includeDogeValuation ? 3 : 2,
      unvaluedAssets: includeDogeValuation ? 0 : 1,
      totalEquityUsdt: includeDogeValuation ? 511 : 510,
      availableEquityUsdt: includeDogeValuation ? 459 : 458,
      lockedEquityUsdt: 52,
      liquidUsdt: 8,
    },
  };
}

function reservations(): CapitalReservationDiagnostics {
  return {
    running: true,
    sweepIntervalMs: 1_000,
    activeReservations: 1,
    activeReservedCapital: 200,
    activeInventoryReservations: 0,
    unscopedActiveReservations: 1,
    activeInventoryHolds: [],
    totalCreated: 1,
    totalCommitted: 0,
    totalReleased: 0,
    totalExpired: 0,
    totalRejected: 0,
    lastSweepAt: NOW,
    lastCreatedAt: NOW - 100,
    lastFinalizedAt: null,
    active: [],
    recent: [],
  };
}

function noReservations(): CapitalReservationDiagnostics {
  return {
    ...reservations(),
    activeReservations: 0,
    activeReservedCapital: 0,
    unscopedActiveReservations: 0,
    active: [],
  };
}

function scopedReservations(): CapitalReservationDiagnostics {
  return {
    ...reservations(),
    activeInventoryReservations: 1,
    unscopedActiveReservations: 0,
    activeInventoryHolds: [{
      exchange: "binance",
      asset: "USDT",
      reservedAmount: 3,
      reservationCount: 1,
    }],
  };
}

function service(
  report: ExchangeBalanceDashboardReport,
  snapshot: PortfolioSnapshot,
  reservationEvidence: CapitalReservationDiagnostics = reservations(),
): NormalizedInventorySnapshotService {
  return new NormalizedInventorySnapshotService({
    getExchangeBalanceReport: () => report,
    getPortfolioSnapshot: () => snapshot,
    getTradingAccount: () => ({
      id: "paper",
      name: "CAT PRO",
      mode: "PAPER",
      enabled: true,
      emergencyStop: false,
      limits: {
        maximumCapitalPerTrade: 500,
        maximumDailyLoss: 10_000,
        maximumOpenTrades: 5,
        maximumDailyTrades: 5_000,
      },
      initialCapital: 100_000,
      currentCapital: 100_100,
      availableCapital: 99_900,
      todayProfit: 100,
      todayLoss: 0,
      openTrades: 1,
      tradesToday: 1,
    }),
    getReservationDiagnostics: () => reservationEvidence,
  });
}

function main(): void {
  const partial = service(
    balanceReport(false),
    portfolio(false),
  ).getSnapshot(NOW);

  assert.equal(partial.version, "121.0");
  assert.equal(partial.state, "PARTIAL_EVIDENCE");
  assert.equal(partial.totals.exchanges, 5);
  assert.equal(partial.totals.synchronizedExchanges, 3);
  assert.equal(partial.totals.knownTotalValueUsdt, 510);
  assert.equal(partial.totals.authoritativeTotalCapitalUsdt, null);
  assert.equal(partial.totals.unavailableValuations, 1);
  assert.equal(partial.totals.directUsdtAvailable, 8);
  assert.equal(partial.accountingCapital.current, 100_100);
  assert.equal(partial.accountingCapital.includedInWalletValuation, false);
  assert.equal(partial.reservations.activeReservedCapital, 200);
  assert.equal(partial.reservations.appliedToWalletInventory, true);
  assert.equal(partial.transfers.pendingTransferCapitalUsdt, null);
  assert.equal(partial.limitations.length, 1);
  assert.equal(partial.safety.liveOrderSubmissionAllowed, false);
  assert.equal(partial.safety.withdrawalSubmissionAllowed, false);
  assert.equal(partial.safety.missingValuationsTreatedAsZero, false);
  assert.equal(Object.isFrozen(partial), true);
  assert.equal(Object.isFrozen(partial.exchanges), true);

  const stale = service(
    balanceReport(true),
    portfolio(true, 30_001),
  ).getSnapshot(NOW);

  assert.equal(stale.state, "PARTIAL_EVIDENCE");
  assert.equal(stale.totals.knownTotalValueUsdt, 511);
  assert.equal(stale.totals.decisionUsableValueUsdt, 11);
  assert.equal(stale.totals.staleValuations, 1);
  assert.equal(stale.totals.authoritativeTotalCapitalUsdt, null);

  const reserved = service(
    balanceReport(true),
    portfolio(true),
  ).getSnapshot(NOW);

  assert.equal(reserved.state, "PARTIAL_EVIDENCE");
  assert.equal(reserved.totals.authoritativeTotalCapitalUsdt, 511);
  assert.equal(reserved.totals.authoritativeLockedCapitalUsdt, 52);
  assert.equal(reserved.totals.authoritativeAvailableCapitalUsdt, null);

  const scoped = service(
    balanceReport(true),
    portfolio(true),
    scopedReservations(),
  ).getSnapshot(NOW);

  assert.equal(scoped.state, "READY_FOR_REBALANCING_ANALYSIS");
  assert.equal(scoped.totals.knownAvailableValueUsdt, 459);
  assert.equal(scoped.totals.knownAvailableAfterReservationsValueUsdt, 456);
  assert.equal(scoped.totals.authoritativeAvailableCapitalUsdt, 456);
  assert.equal(scoped.totals.directUsdtAvailable, 8);
  assert.equal(scoped.totals.directUsdtAvailableAfterReservations, 5);
  assert.equal(scoped.exchanges[0]?.assets[0]?.reservedBalance, 3);
  assert.equal(scoped.exchanges[0]?.assets[0]?.availableAfterReservations, 5);

  const ready = service(
    balanceReport(true),
    portfolio(true),
    noReservations(),
  ).getSnapshot(NOW);

  assert.equal(ready.state, "READY_FOR_REBALANCING_ANALYSIS");
  assert.equal(ready.totals.knownAvailableValueUsdt, 459);
  assert.equal(ready.totals.knownLockedValueUsdt, 52);
  assert.equal(ready.totals.authoritativeTotalCapitalUsdt, 511);
  assert.equal(ready.totals.authoritativeAvailableCapitalUsdt, 459);
  assert.equal(ready.totals.authoritativeLockedCapitalUsdt, 52);
  assert.equal(
    ready.totals.authoritativeAvailableCapitalUsdt,
    ready.totals.knownAvailableValueUsdt,
  );
  assert.notEqual(
    ready.totals.authoritativeTotalCapitalUsdt,
    ready.accountingCapital.current,
    "Wallet USDT valuation must never be replaced by PAPER accounting capital.",
  );

  assert.throws(
    () => service(balanceReport(true), portfolio(true)).getSnapshot(0),
    /positive safe integer/i,
  );

  console.log(
    "NORMALIZED INVENTORY SNAPSHOT TEST PASSED: five-exchange native balances, USDT valuation, freshness, accounting isolation, reservations and transfer absence remained truthful and read-only.",
  );
}

main();
