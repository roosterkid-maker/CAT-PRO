import assert from "node:assert/strict";
import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";

import {exitCostPercent, RouteExitCostService, parseClosedList, type ExitCostSources} from "../inr-routes/RouteExitCostService";
import {unoCoinNetworkOf} from "../../../exchanges/unocoin/api/UnoCoinAccountApi";

function sources(overrides: Partial<ExitCostSources> = {}): ExitCostSources {
  return {
    unocoin: async () => new Map([
      ["LINK", {feeUnits: 1.22609, network: "ETH"}],
      ["NEAR", {feeUnits: 0.1, network: "BSC"}],
      ["DASH", {feeUnits: 0.01, network: "DASH"}],
      ["SKY", {feeUnits: 24.009, network: "ETH"}],
    ]),
    binance: async () => new Map([
      ["LINK", [
        {network: "ETH", withdrawEnabled: true, depositEnabled: null, withdrawFee: 0.3},
        {network: "BSC", withdrawEnabled: true, depositEnabled: null, withdrawFee: 0.02},
      ]],
      ["NEAR", [{network: "BSC", withdrawEnabled: true, depositEnabled: null, withdrawFee: 0.01}]],
      ["DASH", [{network: "DASH", withdrawEnabled: false, depositEnabled: null, withdrawFee: 0.002}]],
      ["SKY", [{network: "BSC", withdrawEnabled: true, depositEnabled: null, withdrawFee: 1}]],
    ]),
    bybit: async () => new Map([
      ["FLR", [{network: "FLR", withdrawEnabled: true, depositEnabled: true, withdrawFee: 0.5}]],
    ]),
    ...overrides,
  };
}

async function main(): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), "cat-pro-exit-"));
  try {
    const service = new RouteExitCostService(sources(), join(directory, "closed.jsonl"), () => 1_000_000, ["unocoin:DASH"]);
    await service.ensureFresh();

    // LINK leaves UnoCoin only on ERC-20 at 1.226 LINK: allowed, but over a
    // 5-trade batch of ₹1,480 at ₹1,275/LINK that is ~21% per trade.
    const link = service.exit("LINK", "unocoin", "binance");
    assert.equal(link.status, "OK");
    assert.equal(link.network, "ETH");
    assert.equal(link.feeUnits, 1.22609);
    assert.ok(exitCostPercent(1.22609, 1_275, 1_480) > 20);

    // Operator-marked closed (UnoCoin publishes no withdraw switch).
    assert.equal(service.exit("DASH", "unocoin", "binance").status, "CLOSED");
    // NEAR on BSC for 0.1 NEAR, and Binance accepts NEAR on BSC.
    assert.deepEqual([service.exit("NEAR", "unocoin", "binance").status, service.exit("NEAR", "unocoin", "binance").network], ["OK", "BSC"]);
    // SKY leaves UnoCoin on ERC-20 only; Binance takes SKY on BSC only.
    assert.equal(service.exit("SKY", "unocoin", "binance").status, "CLOSED");

    // Binance -> UnoCoin must use UnoCoin's network (ERC-20), not the cheaper BSC.
    const back = service.exit("LINK", "binance", "unocoin");
    assert.deepEqual([back.status, back.network, back.feeUnits], ["OK", "ETH", 0.3]);
    // Binance's own switch: DASH withdrawals off.
    assert.equal(service.exit("DASH", "binance", "unocoin").status, "CLOSED");
    // No data source for CoinDCX / CoinSwitch: unknown, not blocked.
    assert.equal(service.exit("FLR", "coinswitch", "bybit").status, "UNKNOWN");
    assert.equal(service.exit("FLR", "bybit", "coinswitch").status, "OK");
    // A coin UnoCoin does not list cannot be verified.
    assert.equal(service.exit("XYZ", "unocoin", "binance").status, "UNVERIFIED");

    // A failed source is UNVERIFIED (blocked), never silently allowed.
    const failing = new RouteExitCostService(sources({unocoin: async () => {
      throw new Error("down");
    }}), join(directory, "failing.jsonl"), () => 1_000_000, []);
    await failing.ensureFresh();
    assert.equal(failing.exit("LINK", "unocoin", "binance").status, "UNVERIFIED");

    // Operator marks persist and can be lifted.
    service.setClosed("unocoin", "near", true);
    const reloaded = new RouteExitCostService(sources(), join(directory, "closed.jsonl"), () => 1_000_000, []);
    await reloaded.ensureFresh();
    assert.equal(reloaded.exit("NEAR", "unocoin", "binance").status, "CLOSED");
    reloaded.setClosed("unocoin", "NEAR", false);
    assert.equal(reloaded.exit("NEAR", "unocoin", "binance").status, "OK");

    assert.deepEqual(parseClosedList("unocoin:dash, bad, coinswitch:gram:deposit"), ["unocoin:DASH", "coinswitch:GRAM:deposit"]);

    // A destination that does not list the coin for deposit (CoinSwitch GRAM).
    reloaded.setClosed("coinswitch", "gram", true, "deposit");
    const gram = reloaded.exit("GRAM", "binance", "coinswitch");
    assert.equal(gram.status, "CLOSED");
    assert.match(gram.detail, /coinswitch does not accept GRAM deposits/u);
    assert.equal(reloaded.exit("GRAM", "coinswitch", "binance").status, "UNKNOWN", "only deposits into CoinSwitch are marked");
    // UnoCoin names the network only in its notes.
    assert.equal(unoCoinNetworkOf("LINK", ["Only ERC-20 (Ethereum Chain) is supported."]), "ETH");
    assert.equal(unoCoinNetworkOf("NEAR", ["Only BSC (Binance Chain) is supported."]), "BSC");
    assert.equal(unoCoinNetworkOf("DASH", ["Sending any other currency to this DASH address may result in the loss."]), "DASH");
    assert.equal(unoCoinNetworkOf("X", ["Processed automatically."]), "X", "AUTOMATIC is not MATIC");
  } finally {
    rmSync(directory, {recursive: true, force: true});
  }
  console.log("Route exit cost passed: UnoCoin fee/network from its wallet, Binance/Bybit per-network switches and fees, destination network matching, operator closed marks that persist, failed sources blocked, venues without data unknown.");
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
