import assert from "node:assert/strict";
import {createSpotPerpetualBasisConfiguration} from
  "../../strategies/spot-perpetual-basis-arbitrage/SpotPerpetualBasisConfiguration";
import {publicDerivativeEvidence} from "../providers/DerivativeProviderUtilities";
import {derivativeVenueCapabilityRegistry} from "../services/DerivativeVenueCapabilityRegistry";

const now = 1_800_000_000_000;
const topology = derivativeVenueCapabilityRegistry.getSnapshot(now);
assert.equal(topology.routes.length, 30);
assert.equal(topology.summary.intraExchangeCombinationsPerSharedMarket, 5);
assert.equal(topology.summary.crossExchangeCombinationsPerSharedMarket, 25);
assert.equal(new Set(topology.routes.map((route) => route.id)).size, 30);
assert.ok(topology.routes.every((route) => route.direction === "LONG_SPOT_SHORT_PERPETUAL"));
assert.equal(derivativeVenueCapabilityRegistry.supports("coindcx", "zebpay"), true);
assert.equal(derivativeVenueCapabilityRegistry.supports("unocoin", "unocoin"), false);
assert.equal(topology.safety.liveExecutionAllowed, false);

const configuration = createSpotPerpetualBasisConfiguration({enabled: true});
assert.equal(configuration.version, "176.0");
assert.deepEqual(configuration.spotExchanges, ["binance", "bybit", "coindcx", "coinswitch", "unocoin", "zebpay"]);
assert.deepEqual(configuration.perpetualExchanges, ["binance", "bybit", "coindcx", "coinswitch", "zebpay"]);
assert.deepEqual(configuration.markets, ["BTCUSDT", "COTIUSDT", "ETHUSDT", "SOLUSDT"]);
assert.equal(configuration.minimumExpectedNetPercent, 0.30);
assert.equal(configuration.perpetualLeverage, 1);
assert.equal(configuration.safety.positiveFundingCountsTowardQualification, false);

const unavailableFunding = publicDerivativeEvidence({
  exchange: "coindcx", market: "BTCUSDT", baseAsset: "BTC", quoteAsset: "USDT",
  settleAsset: "USDT", bidPrice: 100, bidQuantity: 2, askPrice: 100.1, askQuantity: 2,
  markPrice: 100.05, indexPrice: 100.04, fundingRate: 0, nextFundingTime: now + 1,
  fundingIntervalMinutes: 480, fundingEvidence: "UNAVAILABLE", openInterest: null,
  priceStep: 0.01, quantityStep: 0.001, minimumQuantity: 0.001,
  maximumMarketQuantity: 100, minimumNotional: 5, maximumLeverage: 20,
  makerPercent: 0.02, takerPercent: 0.05, sourceTimestamp: now, observedAt: now,
});
assert.equal(unavailableFunding?.fundingEvidence, "UNAVAILABLE");
assert.equal(unavailableFunding?.execution.orderSubmissionAllowed, false);

console.log("DERIVATIVE VENUE EXPANSION TEST PASSED.");
console.log("Six spot venues x five perpetual venues produced exactly 30 fail-closed cash-and-carry routes per shared market.");
