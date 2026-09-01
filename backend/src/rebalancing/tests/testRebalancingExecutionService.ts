import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  RebalancingExecutionCapTracker,
} from "../execution/RebalancingExecutionCapTracker";

import {
  findWhitelistedAddress,
  loadRebalancingExecutionConfig,
  type RebalancingExecutionConfig,
} from "../execution/RebalancingExecutionConfig";

import {
  RebalancingExecutionService,
  type RebalancingExchangeClient,
} from "../execution/RebalancingExecutionService";

import type {
  RebalancingDecisionPlan,
  RebalancingRouteProposal,
} from "../services/RebalancingDecisionEngine";

const NOW = 1_750_000_000_000;

function tempJsonlPath(name: string): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cat-pro-rebalancer-test-")), name);
}

function proposal(overrides: Partial<RebalancingRouteProposal> = {}): RebalancingRouteProposal {
  return {
    sequence: 1,
    sourceExchange: "binance",
    destinationExchange: "bybit",
    amountUsdt: 8,
    sourceTransferableBeforeUsdt: 100,
    sourceTransferableAfterUsdt: 92,
    destinationDeficitBeforeUsdt: 20,
    destinationDeficitAfterUsdt: 12,
    routeLevel: 5,
    kind: "CROSS_EXCHANGE_CAPITAL_MOVE_ANALYSIS",
    submissionState: "ANALYSIS_ONLY",
    transferAsset: null,
    transferNetwork: null,
    estimatedCostUsdt: null,
    reason: "test fixture",
    ...overrides,
  };
}

// The execution service only ever reads plan.desiredMoves - the plan's other
// ~15 fields are RebalancingDecisionEngine's own analysis output and are
// exercised by testRebalancingDecisionEngine.ts already. Casting keeps this
// file focused on execution behavior instead of maintaining an unrelated
// fixture in two places.
function planWithMoves(desiredMoves: readonly RebalancingRouteProposal[]): RebalancingDecisionPlan {
  return {desiredMoves} as unknown as RebalancingDecisionPlan;
}

function baseConfig(overrides: Partial<RebalancingExecutionConfig> = {}): RebalancingExecutionConfig {
  return {
    enabled: true,
    sameExchangeEnabled: true,
    crossExchangeEnabled: true,
    maximumPerTransferUsdt: 10,
    maximumPerDaySameExchangeUsdt: 60,
    maximumPerDayCrossExchangeUsdt: 60,
    withdrawalWhitelist: [
      {exchange: "bybit", asset: "USDT", network: "BEP20", address: "0xBYBIT", addressTag: null},
    ],
    ...overrides,
  };
}

class FakeExchangeClient implements RebalancingExchangeClient {
  withdrawCalls: {asset: string; amount: number; address: string; network: string; addressTag: string | null}[] = [];
  transferCalls: {asset: string; amount: number}[] = [];
  spotBalance = 100;
  futuresMargin = 20;
  failNextWithdraw = false;

  async withdraw(
    asset: string,
    amount: number,
    address: string,
    network: string,
    addressTag: string | null,
  ): Promise<{referenceId: string}> {
    if (this.failNextWithdraw) throw new Error("simulated withdrawal failure");
    this.withdrawCalls.push({asset, amount, address, network, addressTag});
    return {referenceId: `withdraw-${this.withdrawCalls.length}`};
  }

  async universalTransferSpotToFutures(asset: string, amount: number): Promise<{referenceId: string}> {
    this.transferCalls.push({asset, amount});
    return {referenceId: `transfer-${this.transferCalls.length}`};
  }

  async getSpotAvailableBalance(): Promise<number> {
    return this.spotBalance;
  }

  async getFuturesAvailableMargin(): Promise<number> {
    return this.futuresMargin;
  }
}

function buildService(
  config: RebalancingExecutionConfig,
  client: RebalancingExchangeClient,
): RebalancingExecutionService {
  return new RebalancingExecutionService(
    config,
    {
      sameExchange: new RebalancingExecutionCapTracker(
        {maximumPerTransferUsdt: config.maximumPerTransferUsdt, maximumPerDayUsdt: config.maximumPerDaySameExchangeUsdt},
        tempJsonlPath("same.jsonl"),
      ),
      crossExchange: new RebalancingExecutionCapTracker(
        {maximumPerTransferUsdt: config.maximumPerTransferUsdt, maximumPerDayUsdt: config.maximumPerDayCrossExchangeUsdt},
        tempJsonlPath("cross.jsonl"),
      ),
    },
    {futuresMarginFloorUsdt: 20, spotReserveFloorUsdt: 20},
    client,
  );
}

async function main() {
  // --- RebalancingExecutionCapTracker ---
  {
    const tracker = new RebalancingExecutionCapTracker(
      {maximumPerTransferUsdt: 10, maximumPerDayUsdt: 15},
      tempJsonlPath("cap.jsonl"),
      NOW,
    );

    assert.equal(tracker.check(5, NOW).allowed, true);
    assert.equal(tracker.check(11, NOW).allowed, false);
    assert.equal(tracker.check(11, NOW).reason, "AMOUNT_EXCEEDS_PER_TRANSFER_CAP");
    assert.equal(tracker.check(0, NOW).allowed, false);
    assert.equal(tracker.check(-1, NOW).allowed, false);

    tracker.reserve(9, NOW);
    assert.equal(tracker.remainingDailyBudgetUsdt(), 6);

    const secondCheck = tracker.check(7, NOW);
    assert.equal(secondCheck.allowed, false);
    assert.equal(secondCheck.reason, "AMOUNT_EXCEEDS_REMAINING_DAILY_BUDGET");

    assert.equal(tracker.check(6, NOW).allowed, true);
    tracker.reserve(6, NOW);
    assert.equal(tracker.remainingDailyBudgetUsdt(), 0);

    // Restart-safe: a fresh tracker pointed at the same file restores state.
    const persistencePath = tempJsonlPath("cap-restart.jsonl");
    const first = new RebalancingExecutionCapTracker({maximumPerTransferUsdt: 10, maximumPerDayUsdt: 15}, persistencePath, NOW);
    first.reserve(4, NOW);
    const restarted = new RebalancingExecutionCapTracker({maximumPerTransferUsdt: 10, maximumPerDayUsdt: 15}, persistencePath, NOW);
    assert.equal(restarted.remainingDailyBudgetUsdt(), 11);

    // Daily rollover: a new IST dateKey resets spend back to 0 for that day.
    const nextDay = NOW + 25 * 60 * 60 * 1000;
    restarted.reserve(10, nextDay); // fits fresh 15 USDT budget after rollover
    assert.equal(restarted.remainingDailyBudgetUsdt(), 5);
    // A second 10 USDT move the same day fits the per-transfer cap but not
    // the 5 USDT left in the daily budget.
    assert.equal(restarted.check(10, nextDay).allowed, false);
    assert.equal(restarted.check(10, nextDay).reason, "AMOUNT_EXCEEDS_REMAINING_DAILY_BUDGET");
  }

  // --- RebalancingExecutionConfig ---
  {
    const disabledByDefault = loadRebalancingExecutionConfig({});
    assert.equal(disabledByDefault.enabled, false);
    assert.equal(disabledByDefault.sameExchangeEnabled, false);
    assert.equal(disabledByDefault.crossExchangeEnabled, false);
    assert.equal(disabledByDefault.maximumPerTransferUsdt, 10);
    assert.deepEqual(disabledByDefault.withdrawalWhitelist, []);

    const withWhitelist = loadRebalancingExecutionConfig({
      CAT_PRO_REBALANCER_ENABLED: "true",
      CAT_PRO_REBALANCER_WITHDRAWAL_WHITELIST_JSON: JSON.stringify([
        {exchange: "bybit", asset: "usdt", network: "bep20", address: "0xABC", addressTag: null},
      ]),
    });
    assert.equal(withWhitelist.enabled, true);
    assert.equal(withWhitelist.withdrawalWhitelist.length, 1);
    assert.equal(withWhitelist.withdrawalWhitelist[0]!.asset, "USDT");
    assert.equal(withWhitelist.withdrawalWhitelist[0]!.network, "BEP20");

    const found = findWhitelistedAddress(withWhitelist, "bybit", "USDT", "BEP20");
    assert.equal(found?.address, "0xABC");
    assert.equal(findWhitelistedAddress(withWhitelist, "bybit", "USDT", "TRC20"), null);
    assert.equal(findWhitelistedAddress(withWhitelist, "coindcx", "USDT", "BEP20"), null);

    assert.throws(() =>
      loadRebalancingExecutionConfig({CAT_PRO_REBALANCER_WITHDRAWAL_WHITELIST_JSON: "not json"}));
    assert.throws(() =>
      loadRebalancingExecutionConfig({CAT_PRO_REBALANCER_WITHDRAWAL_WHITELIST_JSON: "{}"}));
  }

  // --- RebalancingExecutionService: cross-exchange ---
  {
    const client = new FakeExchangeClient();
    const service = buildService(baseConfig(), client);

    const disabledOutcomes = await buildService(baseConfig({crossExchangeEnabled: false}), client)
      .executeCrossExchangeMoves(planWithMoves([proposal()]));
    assert.equal(disabledOutcomes[0]!.status, "SKIPPED_DISABLED");
    assert.equal(client.withdrawCalls.length, 0);

    const unsupportedOutcomes = await service.executeCrossExchangeMoves(
      planWithMoves([proposal({sourceExchange: "bybit", destinationExchange: "binance"})]),
    );
    assert.equal(unsupportedOutcomes[0]!.status, "SKIPPED_UNSUPPORTED_EXCHANGE");

    const notWhitelistedOutcomes = await service.executeCrossExchangeMoves(
      planWithMoves([proposal({destinationExchange: "coindcx"})]),
    );
    assert.equal(notWhitelistedOutcomes[0]!.status, "SKIPPED_NOT_WHITELISTED");

    const overCapOutcomes = await service.executeCrossExchangeMoves(
      planWithMoves([proposal({amountUsdt: 999})]),
    );
    assert.equal(overCapOutcomes[0]!.status, "SKIPPED_CAP_REJECTED");
    assert.equal(client.withdrawCalls.length, 0);

    const executedOutcomes = await service.executeCrossExchangeMoves(
      planWithMoves([proposal({amountUsdt: 8})]),
    );
    assert.equal(executedOutcomes[0]!.status, "EXECUTED");
    assert.equal(client.withdrawCalls.length, 1);
    assert.equal(client.withdrawCalls[0]!.amount, 8);
    assert.equal(client.withdrawCalls[0]!.address, "0xBYBIT");
    assert.equal(client.withdrawCalls[0]!.network, "BEP20");

    // Daily cross-exchange cap now has 52 USDT left (60 - 8); a second 8 USDT
    // move should still fit, proving reserve() actually persisted.
    const secondOutcomes = await service.executeCrossExchangeMoves(planWithMoves([proposal({amountUsdt: 8})]));
    assert.equal(secondOutcomes[0]!.status, "EXECUTED");
    assert.equal(client.withdrawCalls.length, 2);

    client.failNextWithdraw = true;
    const failedOutcomes = await service.executeCrossExchangeMoves(planWithMoves([proposal({amountUsdt: 8})]));
    assert.equal(failedOutcomes[0]!.status, "FAILED");
    assert.match(failedOutcomes[0]!.detail, /simulated withdrawal failure/);
  }

  // --- RebalancingExecutionService: same-exchange margin top-up ---
  {
    const client = new FakeExchangeClient();
    client.spotBalance = 100;
    client.futuresMargin = 5; // below the 20 USDT floor -> 15 USDT shortfall
    const service = buildService(baseConfig(), client);

    const outcome = await service.executeSameExchangeTopUp();
    assert.equal(outcome.status, "EXECUTED");
    // min(shortfall=15, spare=100-20=80, perTransferCap=10) = 10
    assert.equal(outcome.amountUsdt, 10);
    assert.equal(client.transferCalls.length, 1);
    assert.equal(client.transferCalls[0]!.amount, 10);

    const marginHealthyClient = new FakeExchangeClient();
    marginHealthyClient.futuresMargin = 25; // above floor
    const healthyOutcome = await buildService(baseConfig(), marginHealthyClient).executeSameExchangeTopUp();
    assert.equal(healthyOutcome.status, "SKIPPED_DISABLED");
    assert.equal(marginHealthyClient.transferCalls.length, 0);

    const spotDrainedClient = new FakeExchangeClient();
    spotDrainedClient.spotBalance = 20; // exactly at reserve floor, no spare
    spotDrainedClient.futuresMargin = 5;
    const drainedOutcome = await buildService(baseConfig(), spotDrainedClient).executeSameExchangeTopUp();
    assert.equal(drainedOutcome.status, "SKIPPED_CAP_REJECTED");
    assert.equal(spotDrainedClient.transferCalls.length, 0);

    const disabledClient = new FakeExchangeClient();
    const disabledOutcome = await buildService(baseConfig({sameExchangeEnabled: false}), disabledClient)
      .executeSameExchangeTopUp();
    assert.equal(disabledOutcome.status, "SKIPPED_DISABLED");
    assert.equal(disabledClient.transferCalls.length, 0);
  }

  console.log("Automated Capital Rebalancer execution-layer tests passed.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
