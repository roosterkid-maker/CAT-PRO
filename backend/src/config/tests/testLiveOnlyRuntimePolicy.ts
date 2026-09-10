import assert
  from "node:assert/strict";

import {
  evaluateLiveOnlySpreadIntegrity,
  getLiveOnlyRuntimePolicy,
  isLiveOnlyRuntimeEnabled,
  isLiveOnlyRuntimeProfile,
} from "../LiveOnlyRuntimePolicy";

const enabledEnvironment:
  NodeJS.ProcessEnv = {
  CAT_PRO_RUNTIME_PROFILE:
    "live-only",
  TRADING_MODE:
    "live",
  TRADING_EXECUTION_MODE:
    "live",
  LIVE_TRADING_ENABLED:
    "true",
  ARBITRAGE_LIVE_CONFIRMATION:
    "ENABLE_CONFIRMED_ARBITRAGE_EXECUTION",
  CAT_PRO_LIVE_ONLY_CONFIRMATION:
    "ENABLE_CAT_PRO_LIVE_ONLY_RUNTIME",
  CAT_PRO_LIVE_TRADE_CAPITAL_INR:
    "750",
  CAT_PRO_REBALANCER_ENABLED:
    "true",
};

assert.equal(
  isLiveOnlyRuntimeProfile(
    enabledEnvironment,
  ),
  true,
);
assert.equal(
  isLiveOnlyRuntimeEnabled(
    enabledEnvironment,
  ),
  true,
);

const policy =
  getLiveOnlyRuntimePolicy(
    enabledEnvironment,
  );
assert.equal(
  policy.minimumCapitalPerLegInr,
  600,
);
assert.equal(
  policy.preferredCapitalPerLegInr,
  750,
);
assert.equal(
  policy.maximumCapitalPerLegInr,
  1_000,
);
assert.equal(
  policy.maximumConcurrentTrades,
  1,
);
assert.equal(
  policy.minimumCurrentNetProfitPercent,
  1.5,
);
assert.equal(
  policy.minimumPostStressNetProfitPercent,
  1.3,
);
assert.equal(
  policy.maximumOpportunityAgeMs,
  2_000,
);
assert.equal(
  policy.automaticFundMovementEnabled,
  true,
);

assert.equal(
  isLiveOnlyRuntimeEnabled({
    ...enabledEnvironment,
    CAT_PRO_LIVE_ONLY_CONFIRMATION:
      "",
  }),
  false,
);

for (
  const invalidCapital
  of [
    "599",
    "1001",
    "600.5",
    "not-a-number",
  ]
) {
  assert.throws(
    () =>
      getLiveOnlyRuntimePolicy({
        ...enabledEnvironment,
        CAT_PRO_LIVE_TRADE_CAPITAL_INR:
          invalidCapital,
      }),
  );
}

const ordinarySpread =
  evaluateLiveOnlySpreadIntegrity(
    100,
    100.79,
  );
assert.equal(
  ordinarySpread.suspicious,
  false,
);
assert.equal(
  ordinarySpread.withinAbsoluteCeiling,
  true,
);

const corroborationRequired =
  evaluateLiveOnlySpreadIntegrity(
    100,
    103.8,
  );
assert.equal(
  corroborationRequired.suspicious,
  true,
);
assert.equal(
  corroborationRequired.withinAbsoluteCeiling,
  true,
);

const absoluteAnomaly =
  evaluateLiveOnlySpreadIntegrity(
    100,
    105.01,
  );
assert.equal(
  absoluteAnomaly.suspicious,
  true,
);
assert.equal(
  absoluteAnomaly.withinAbsoluteCeiling,
  false,
);

assert.equal(
  evaluateLiveOnlySpreadIntegrity(
    0,
    100,
  ).withinAbsoluteCeiling,
  false,
);

console.log(
  "LIVE-only runtime policy tests passed.",
);
