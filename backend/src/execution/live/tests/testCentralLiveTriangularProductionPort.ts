import assert from "node:assert/strict";
import type {CentralStrategyExecutionLeg} from "../../../strategies/models/CentralStrategyExecutionPlan";
import {createTriangularArbitrageConfiguration} from "../../../strategies/triangular-arbitrage/TriangularArbitrageConfiguration";
import {CentralLiveTriangularProductionPort} from "../central/CentralLiveTriangularProductionPort";
import type {CentralLiveTriangularSizingResult} from "../central/CentralLiveTriangularSizingService";

const now = 1_780_900_000_000;

function leg(id: string): CentralStrategyExecutionLeg {
  return {id, sequence: 1, exchange: "binance", product: "SPOT", market: "BTCUSDT", side: "SELL", orderType: "MARKET",
    quantity: 0.01, referencePrice: 50_000, reduceOnly: false, dependency: "PARALLEL", evidenceOnly: true};
}

function main(): void {
  const planId = `test-production-port-plan:${now}`;
  const configuration = createTriangularArbitrageConfiguration({enabled: true, allowedExchanges: ["binance"]});
  let computeCalls = 0;
  const sizing = {
    computeLegSizing(): CentralLiveTriangularSizingResult {
      computeCalls += 1;
      return {ok: true, requestedBaseQuantity: 0.009, maximumExpectedInputQuantity: 1, allowedInputDustQuantity: 0.0001,
        marketRulesVerified: true, quoteFresh: true, feeScheduleFresh: true, thirdAssetFeeBalanceVerified: false};
    },
  };
  const port = new CentralLiveTriangularProductionPort(() => configuration, sizing);

  const first = port.getSizingEvidence({planId, leg: leg("leg-a"), fromAsset: "USDT", toAsset: "BTC",
    availableInputQuantity: 1, now});
  assert.ok(first);
  assert.equal(first?.requestedBaseQuantity, 0.009);
  assert.equal(computeCalls, 1);

  const second = port.getSizingEvidence({planId, leg: leg("leg-a"), fromAsset: "USDT", toAsset: "BTC",
    availableInputQuantity: 1, now: now + 500});
  assert.deepEqual(second, first, "An identical (leg, assets, quantity) ask within the sealed evidence's TTL must return the exact same sealed payload, never recompute a fresh size.");
  assert.equal(computeCalls, 1, "A cached ask must not call the real sizing service again - this is what makes a mid-cycle retry resubmit the exact same order instead of silently resizing it.");

  const differentQuantity = port.getSizingEvidence({planId, leg: leg("leg-a"), fromAsset: "USDT", toAsset: "BTC",
    availableInputQuantity: 2, now: now + 500});
  assert.notEqual(differentQuantity?.evidenceId, first?.evidenceId, "A materially different available input quantity is a different sizing question and must be computed fresh, not served from the first quantity's cache.");
  assert.equal(computeCalls, 2);

  const expiredAsk = port.getSizingEvidence({planId, leg: leg("leg-a"), fromAsset: "USDT", toAsset: "BTC",
    availableInputQuantity: 1, now: now + 3_001});
  assert.notEqual(expiredAsk?.evidenceId, first?.evidenceId, "Once the 3s sizing evidence TTL has elapsed, a repeat ask must be recomputed fresh rather than serving stale sizing.");
  assert.equal(computeCalls, 3);

  const blockedSizing = {
    computeLegSizing(): CentralLiveTriangularSizingResult {
      return {ok: false, blockers: ["ORDER_BOOK_STALE"]};
    },
  };
  const blockedPort = new CentralLiveTriangularProductionPort(() => configuration, blockedSizing);
  const blockedResult = blockedPort.getSizingEvidence({planId: `${planId}:blocked`, leg: leg("leg-b"),
    fromAsset: "USDT", toAsset: "BTC", availableInputQuantity: 1, now});
  assert.equal(blockedResult, null, "A blocked real sizing computation must surface as null (never a fabricated size) so the handler fails the leg closed.");

  console.log("CENTRAL LIVE TRIANGULAR PRODUCTION PORT TEST PASSED.");
  console.log("Sizing evidence was computed once, cached idempotently for repeat asks within its TTL, recomputed fresh outside that window or for a different available quantity, and a blocked sizing computation surfaced as null rather than a fabricated size; no order or exchange action occurred.");
}

main();
