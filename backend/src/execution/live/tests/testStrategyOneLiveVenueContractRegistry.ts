import assert from "node:assert/strict";

import {
  StrategyOneLiveVenueContractRegistry,
} from "../contracts/StrategyOneLiveVenueContractRegistry";

function main(): void {
  const readyRegistry =
    new StrategyOneLiveVenueContractRegistry({
      isPrivateFillSessionReady: () => true,
      getApprovedRouteTtl: () => 150,
    });
  const report =
    readyRegistry.getReport(1_786_812_800_000);

  assert.equal(report.schemaVersion, "107.0");
  assert.equal(report.venues.length, 5);
  assert.equal(report.summary.targetVenues, 5);
  assert.equal(report.summary.safePilotCandidates, 2);
  assert.equal(report.summary.excludedFromLive, 3);
  assert.equal(report.summary.runtimeContractReady, 0);
  assert.equal(report.safety.documentationDoesNotGrantAuthority, true);
  assert.equal(report.safety.unsupportedTimeInForceNeverFallsBackToGtc, true);
  assert.equal(report.safety.automaticTtlActivationAllowed, false);
  assert.equal(report.safety.liveOrderSubmissionAuthorized, false);

  const binance =
    requiredVenue(report, "binance");
  const bybit =
    requiredVenue(report, "bybit");

  for (const venue of [binance, bybit]) {
    assert.equal(venue.classification, "SAFE_PILOT_CANDIDATE");
    assert.equal(venue.documentedTimeInForce.includes("FOK"), true);
    assert.equal(venue.exactFokAdapterMapping, true);
    assert.equal(venue.deterministicClientOrderIdentity, "SUPPORTED_AND_MAPPED");
    assert.equal(venue.privateFillEvidence, "AUTHENTICATED_WS_IMPLEMENTED");
    assert.equal(venue.runtimePrivateFillSessionReady, true);
    assert.equal(venue.calibratedOrderSubmissionTtlMs, null);
    assert.deepEqual(venue.blockers, ["CALIBRATED_ORDER_SUBMISSION_TTL_MISSING"]);

    const contract =
      readyRegistry.getOrderTimeSafetyContract(venue.exchange);
    assert.ok(contract);
    assert.deepEqual(contract.supportedTimeInForce, ["IOC", "FOK"]);
    assert.equal(contract.authoritativeFillConfirmationReady, true);
    assert.equal(contract.maximumOrderBookAgeMs, null);
  }

  const coindcx =
    requiredVenue(report, "coindcx");
  assert.deepEqual(coindcx.documentedTimeInForce, ["GTC"]);
  assert.equal(coindcx.privateFillEvidence, "AUTHENTICATED_WS_IMPLEMENTED");
  assert.equal(
    coindcx.blockers.includes("AUDITED_SPOT_FOK_CONTRACT_UNAVAILABLE"),
    true,
  );
  assert.deepEqual(
    readyRegistry.getOrderTimeSafetyContract("COINDCX")?.supportedTimeInForce,
    [],
  );

  const cotiRoute = {
    market: "COTIUSDT",
    buyExchange: "coindcx",
    sellExchange: "binance",
  } as const;
  const cotiCoinDCX =
    readyRegistry.getVenue(
      "coindcx",
      cotiRoute,
      1_786_812_800_000,
    );
  assert.ok(cotiCoinDCX);
  assert.equal(cotiCoinDCX.classification, "SAFE_PILOT_CANDIDATE");
  assert.equal(cotiCoinDCX.requiredTimeInForce, "GTC");
  assert.deepEqual(cotiCoinDCX.blockers, []);
  const cotiContract =
    readyRegistry.getOrderTimeSafetyContract(
      "coindcx",
      cotiRoute,
      1_786_812_800_000,
    );
  assert.ok(cotiContract);
  assert.equal(cotiContract.requiredTimeInForce, "GTC");
  assert.deepEqual(cotiContract.supportedTimeInForce, ["GTC"]);
  assert.equal(cotiContract.maximumOrderBookAgeMs, 150);

  let historicalTimingLookups = 0;
  let privateFillReadinessChecks = 0;
  const authorizedLastLookRegistry =
    new StrategyOneLiveVenueContractRegistry({
      isPrivateFillSessionReady: () => {
        privateFillReadinessChecks += 1;
        return true;
      },
      getApprovedRouteTtl: () => {
        historicalTimingLookups += 1;
        return 150;
      },
    });
  const sandRoute = {
    market: "SANDUSDT",
    buyExchange: "bybit",
    sellExchange: "coindcx",
  } as const;
  const authorizedBybit =
    authorizedLastLookRegistry.getAuthorizedOrderTimeSafetyContract(
      "bybit",
      sandRoute,
      190,
      1_786_812_800_000,
    );
  const authorizedCoinDCX =
    authorizedLastLookRegistry.getAuthorizedOrderTimeSafetyContract(
      "coindcx",
      sandRoute,
      190,
      1_786_812_800_000,
    );

  assert.ok(authorizedBybit);
  assert.ok(authorizedCoinDCX);
  assert.equal(authorizedBybit.maximumOrderBookAgeMs, 190);
  assert.equal(authorizedBybit.requiredTimeInForce, "FOK");
  assert.equal(authorizedCoinDCX.maximumOrderBookAgeMs, 190);
  assert.equal(authorizedCoinDCX.requiredTimeInForce, "GTC");
  assert.equal(
    historicalTimingLookups,
    0,
    "A durably authorized exact-route TTL must not rebuild historical timing evidence inside final last-look.",
  );
  assert.equal(
    privateFillReadinessChecks,
    2,
    "Final last-look must still recheck each venue's current authenticated private-fill owner.",
  );
  assert.equal(
    authorizedLastLookRegistry.getAuthorizedOrderTimeSafetyContract(
      "bybit",
      sandRoute,
      301,
      1_786_812_800_000,
    ),
    null,
    "An authorized TTL above the operator-reviewed 300 ms ceiling must fail closed.",
  );
  assert.equal(historicalTimingLookups, 0);

  const bbReverseRoute = {
    market: "BBUSDT",
    buyExchange: "binance",
    sellExchange: "coindcx",
  } as const;
  const bbCoinDCX = readyRegistry.getVenue(
    "coindcx",
    bbReverseRoute,
    1_786_812_800_000,
  );
  assert.ok(bbCoinDCX);
  assert.equal(bbCoinDCX.classification, "SAFE_PILOT_CANDIDATE");
  assert.equal(bbCoinDCX.requiredTimeInForce, "GTC");
  assert.deepEqual(bbCoinDCX.blockers, []);

  const reverseCoinDCX =
    readyRegistry.getVenue(
      "coindcx",
      {
        ...cotiRoute,
        buyExchange: "binance",
        sellExchange: "coindcx",
      },
      1_786_812_800_000,
  );
  assert.ok(reverseCoinDCX);
  assert.equal(reverseCoinDCX.classification, "SAFE_PILOT_CANDIDATE");
  assert.equal(reverseCoinDCX.requiredTimeInForce, "GTC");
  assert.deepEqual(reverseCoinDCX.blockers, []);

  const coinswitch =
    requiredVenue(report, "coinswitch");
  assert.deepEqual(coinswitch.documentedTimeInForce, []);
  assert.equal(coinswitch.deterministicClientOrderIdentity, "NOT_DOCUMENTED");
  assert.equal(coinswitch.privateOrderEvidence, "DOCUMENTED_NOT_IMPLEMENTED");

  const unocoin =
    requiredVenue(report, "unocoin");
  assert.equal(unocoin.privateOrderEvidence, "NOT_DOCUMENTED");
  assert.equal(unocoin.privateFillEvidence, "NOT_DOCUMENTED");

  const notReadyRegistry =
    new StrategyOneLiveVenueContractRegistry({
      isPrivateFillSessionReady: () => false,
    });
  const notReadyBinance =
    notReadyRegistry.getVenue("binance");

  assert.ok(notReadyBinance);
  assert.equal(notReadyBinance.runtimePrivateFillSessionReady, false);
  assert.equal(
    notReadyBinance.blockers.includes(
      "AUTHENTICATED_PRIVATE_FILL_SESSION_NOT_READY",
    ),
    true,
  );
  assert.equal(
    notReadyRegistry
      .getOrderTimeSafetyContract("binance")
      ?.authoritativeFillConfirmationReady,
    false,
  );
  assert.equal(notReadyRegistry.getVenue("unknown"), null);
  assert.equal(notReadyRegistry.getOrderTimeSafetyContract("unknown"), null);

  assert.equal(Object.isFrozen(report), true);
  assert.equal(Object.isFrozen(report.venues), true);
  assert.equal(Object.isFrozen(binance.blockers), true);
  assert.equal(
    Object.getOwnPropertyNames(
      StrategyOneLiveVenueContractRegistry.prototype,
    ).some((name) => /execute|submit|cancel|transfer|withdraw/iu.test(name)),
    false,
  );

  console.log(
    "Strategy #1 five-venue SPOT contracts are fail closed: Binance/Bybit use FOK, evidence-qualified dynamic-pool routes use CoinDCX bounded GTC in either leg direction, and CoinSwitch/UnoCoin remain excluded; no order authority exists.",
  );
}

function requiredVenue(
  report: ReturnType<StrategyOneLiveVenueContractRegistry["getReport"]>,
  exchange: string,
) {
  const venue =
    report.venues.find(
      (candidate) => candidate.exchange === exchange,
    );

  assert.ok(venue);
  return venue;
}

try {
  main();
} catch (error: unknown) {
  console.error(error);
  process.exitCode = 1;
}
