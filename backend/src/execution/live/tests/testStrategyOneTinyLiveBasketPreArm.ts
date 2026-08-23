import assert from "node:assert/strict";
import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";

import {
  STRATEGY_ONE_TINY_LIVE_BASKET_ID,
} from "../../../arbitrage/execution/StrategyOneTinyLiveBasketPolicy";

import {
  StrategyOneTinyLivePreArmService,
} from "../tiny-live/StrategyOneTinyLivePreArmService";

const NOW = 1_787_226_000_000;

function main(): void {
  const directory = mkdtempSync(join(tmpdir(), "cat-pro-v183-basket-arm-"));
  const filePath = join(directory, "basket.jsonl");

  try {
    const service = new StrategyOneTinyLivePreArmService({
      runtimeGateEnabled: () => true,
      getCapitalPerLegInr: () => 500,
      getActionDiagnostics: () => ({
        maximumDailyAttempts: 10,
        attemptsToday: 0,
        blockingAuthorityPresent: false,
      }),
      now: () => NOW,
    }, filePath);
    const phrase = StrategyOneTinyLivePreArmService.requiredBasketArmPhrase();

    assert.equal(
      phrase,
      "ARM PILOT-BASKET SEVEN-COIN INR500 ATTEMPTS10 MINUTES180",
    );
    assert.throws(() => service.arm({
      market: "PILOT_BASKET",
      buyExchange: "coindcx",
      sellExchange: "binance",
      confirmation: "wrong",
      durationMinutes: 180,
      maximumAttempts: 10,
      pilotBasketId: STRATEGY_ONE_TINY_LIVE_BASKET_ID,
      now: NOW,
    }), /Exact basket confirmation/iu);

    const arm = service.arm({
      market: "PILOT_BASKET",
      buyExchange: "coindcx",
      sellExchange: "binance",
      confirmation: phrase,
      durationMinutes: 180,
      maximumAttempts: 10,
      pilotBasketId: STRATEGY_ONE_TINY_LIVE_BASKET_ID,
      now: NOW,
    });

    assert.equal(arm.schemaVersion, "183.0");
    assert.equal(arm.routeScope, "PILOT_BASKET");
    assert.equal(arm.pilotBasketId, STRATEGY_ONE_TINY_LIVE_BASKET_ID);
    assert.equal(arm.capitalPerLegInr, 500);
    assert.equal(arm.maximumAttempts, 10);
    assert.equal(arm.expiresAt, NOW + 180 * 60_000);
    assert.equal(arm.attemptsUsed, 0);
    assert.equal(arm.automaticFundMovementAllowed, false);

    const restored = new StrategyOneTinyLivePreArmService({
      runtimeGateEnabled: () => true,
      getCapitalPerLegInr: () => 500,
      now: () => NOW,
    }, filePath);
    assert.equal(restored.getActiveArm(NOW)?.id, arm.id);
    assert.equal(restored.getDiagnostics(NOW).pilotBasket.routes.length, 11);
  } finally {
    rmSync(directory, {recursive: true, force: true});
  }

  console.log(
    "V183 basket pre-arm passed: exact 10-attempt/180-minute consent, ₹500/leg, durable restart recovery, no initial route calibration bypass, and no fund movement authority.",
  );
}

try {
  main();
} catch (error: unknown) {
  console.error(error);
  process.exitCode = 1;
}
