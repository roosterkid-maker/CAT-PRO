import assert from "node:assert/strict";

import type {
  ExchangeBalanceSnapshot,
  TradingAccountCheckResult,
} from "../../account/TradingAccountService";

import {
  CapitalReservationService,
  type CapitalReservationAccountPort,
} from "../CapitalReservationService";

class FixtureAccount implements CapitalReservationAccountPort {
  availableCapital = 1_000;
  reservedCapital = 0;
  private readonly balances =
    new Map<string, ExchangeBalanceSnapshot>();

  setBalance(snapshot: ExchangeBalanceSnapshot): void {
    this.balances.set(
      this.key(snapshot.exchange, snapshot.asset),
      structuredClone(snapshot),
    );
  }

  evaluateTrade(amount: number): TradingAccountCheckResult {
    const approved =
      Number.isFinite(amount) &&
      amount > 0 &&
      amount <= this.availableCapital;

    return {
      approved,
      reasons:
        approved
          ? []
          : ["Insufficient fixture accounting capital."],
    };
  }

  reserveCapital(amount: number): boolean {
    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      amount > this.availableCapital
    ) {
      return false;
    }

    this.availableCapital -= amount;
    this.reservedCapital += amount;
    return true;
  }

  releaseCapital(amount: number): void {
    this.availableCapital += amount;
    this.reservedCapital -= amount;
  }

  getExchangeBalance(
    exchange: string,
    asset: string,
  ): ExchangeBalanceSnapshot | null {
    const value =
      this.balances.get(
        this.key(exchange, asset),
      );

    return value
      ? structuredClone(value)
      : null;
  }

  private key(exchange: string, asset: string): string {
    return `${exchange.trim().toLowerCase()}|${asset.trim().toUpperCase()}`;
  }
}

function main(): void {
  let clock = 10_000;
  const account = new FixtureAccount();
  account.setBalance({
    exchange: "binance",
    asset: "USDT",
    availableBalance: 10,
    lockedBalance: 0,
    totalBalance: 10,
    synchronizedAt: 9_990,
  });
  account.setBalance({
    exchange: "bybit",
    asset: "BTC",
    availableBalance: 0.01,
    lockedBalance: 0,
    totalBalance: 0.01,
    synchronizedAt: 9_990,
  });
  account.setBalance({
    exchange: "binance",
    asset: "USDC",
    availableBalance: 5,
    lockedBalance: 0,
    totalBalance: 5,
    synchronizedAt: 9_990,
  });

  const service =
    new CapitalReservationService(
      account,
      () => clock,
    );

  const first = service.reserve({
    ownerType: "EXECUTION_PLAN",
    ownerId: "pair-1",
    amount: 100,
    ttlMs: 5_000,
    inventoryRequirements: [
      {exchange: "BINANCE", asset: "usdt", amount: 6},
      {exchange: "bybit", asset: "btc", amount: 0.004},
    ],
  });

  assert.equal(first.approved, true);
  assert.equal(first.reservation?.inventoryHolds.length, 2);
  assert.equal(account.reservedCapital, 100);
  assert.equal(
    service.getInventoryAvailability("binance", "USDT", 4).approved,
    true,
  );

  const conflicting = service.reserve({
    ownerType: "EXECUTION_PLAN",
    ownerId: "pair-2",
    amount: 100,
    ttlMs: 5_000,
    inventoryRequirements: [
      {exchange: "binance", asset: "USDT", amount: 5},
      {exchange: "bybit", asset: "BTC", amount: 0.001},
    ],
  });

  assert.equal(conflicting.approved, false);
  assert.match(conflicting.reasons.join(" | "), /after active reservations/i);
  assert.equal(account.reservedCapital, 100);
  assert.deepEqual(
    service.getDiagnostics().activeInventoryHolds,
    [
      {
        exchange: "binance",
        asset: "USDT",
        reservedAmount: 6,
        reservationCount: 1,
      },
      {
        exchange: "bybit",
        asset: "BTC",
        reservedAmount: 0.004,
        reservationCount: 1,
      },
    ],
    "A rejected two-leg reservation must not partially hold its sufficient leg.",
  );

  const independent = service.reserve({
    ownerType: "EXECUTION_PLAN",
    ownerId: "pair-3",
    amount: 100,
    ttlMs: 5_000,
    inventoryRequirements: [
      {exchange: "binance", asset: "USDC", amount: 2},
    ],
  });

  assert.equal(independent.approved, true);
  assert.equal(service.getDiagnostics().activeInventoryReservations, 2);
  assert.equal(service.getDiagnostics().unscopedActiveReservations, 0);

  assert.ok(first.reservation);
  service.release(first.reservation.id, "Fixture release.");
  assert.equal(
    service.getInventoryAvailability("binance", "USDT", 10).approved,
    true,
  );

  const aggregated = service.reserve({
    ownerType: "EXECUTION_PLAN",
    ownerId: "pair-4",
    amount: 100,
    ttlMs: 1_000,
    inventoryRequirements: [
      {exchange: "binance", asset: "USDT", amount: 3},
      {exchange: "BINANCE", asset: "usdt", amount: 4},
      {exchange: "bybit", asset: "BTC", amount: 0.002},
    ],
  });

  assert.equal(aggregated.approved, true);
  assert.equal(
    aggregated.reservation?.inventoryHolds.find(
      (hold) => hold.exchange === "binance" && hold.asset === "USDT",
    )?.amount,
    7,
  );

  clock += 1_001;
  assert.equal(service.sweepExpired(clock), 1);
  assert.equal(
    service.getInventoryAvailability("binance", "USDT", 10).approved,
    true,
    "Expiry must restore exchange-asset availability.",
  );

  const legacy = service.reserve({
    ownerType: "MANUAL",
    ownerId: "legacy-account-only",
    amount: 25,
    ttlMs: 5_000,
  });

  assert.equal(legacy.approved, true);
  assert.equal(legacy.reservation?.inventoryHolds.length, 0);
  assert.equal(service.getDiagnostics().unscopedActiveReservations, 1);

  const stale = service.reserve({
    ownerType: "EXECUTION_PLAN",
    ownerId: "stale-pair",
    amount: 25,
    ttlMs: 5_000,
    inventoryRequirements: [
      {
        exchange: "bybit",
        asset: "BTC",
        amount: 0.001,
        maximumAgeMs: 100,
      },
    ],
  });

  assert.equal(stale.approved, false);
  assert.match(stale.reasons.join(" | "), /stale/i);
  assert.equal(account.reservedCapital, 125);

  assert.ok(independent.reservation);
  assert.ok(legacy.reservation);
  service.commit(independent.reservation.id, "Fixture commit.");
  service.release(legacy.reservation.id, "Fixture legacy release.");
  assert.equal(account.reservedCapital, 0);
  assert.equal(service.getDiagnostics().activeInventoryHolds.length, 0);
  service.stop();

  console.log(
    "ATOMIC EXCHANGE-ASSET RESERVATION TEST PASSED: conflicts fail atomically, independent inventory proceeds, duplicate requirements aggregate, and release/commit/expiry restore availability.",
  );
}

main();
