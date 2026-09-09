import {
  describe,
  expect,
  it,
} from "vitest";

import {
  resolveLiveCandidateStatus,
} from "./liveCandidateStatus";

describe(
  "resolveLiveCandidateStatus",
  () => {
    it(
      "advances an audited USDT venue route to independent LIVE preflight",
      () => {
        expect(
          resolveLiveCandidateStatus({
            market:
              "GLMRUSDT",
            buyExchange:
              "CoinDCX",
            sellExchange:
              "Bybit",
          }),
        ).toMatchObject({
          state:
            "CHECKING",
          label:
            "ENGINE PASS · LIVE PREFLIGHT",
        });
      },
    );

    it(
      "identifies an INR route on excluded venues as analytical only",
      () => {
        expect(
          resolveLiveCandidateStatus({
            market:
              "NEARINR",
            buyExchange:
              "ZebPay",
            sellExchange:
              "UnoCoin",
          }),
        ).toMatchObject({
          state:
            "WAITING",
          label:
            "ANALYTICAL ONLY · ROUTE EXCLUDED",
        });
      },
    );
  },
);
