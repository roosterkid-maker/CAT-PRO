import assert
  from "node:assert/strict";

import {
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

console.log(
  "LIVE-only runtime policy tests passed.",
);
