import assert from "node:assert/strict";

import {
  StrategyOneApiPermissionBoundaryService,
} from "../tiny-live/StrategyOneApiPermissionBoundaryService";

const NOW =
  1_900_000_000_000;

async function main(): Promise<void> {
  const service =
    new StrategyOneApiPermissionBoundaryService({
      readBinanceApiRestrictions:
        async () => ({
          ipRestricted:
            true,
          readingEnabled:
            true,
          spotAndMarginTradingEnabled:
            true,
          withdrawalsEnabled:
            false,
          internalTransferEnabled:
            false,
        }),
      readBybitApiKeyInformation:
        async () => ({
          readOnly:
            false,
          spotTradingEnabled:
            true,
          withdrawalsEnabled:
            false,
          internalTransferEnabled:
            false,
          ipRestricted:
            true,
          boundIpCount:
            1,
          unexpectedPermissions:
            [],
          systemManagedPermissions: [
            "Derivatives:DerivativesTrade",
          ],
        }),
      readCoinDCXApiKeyInformation:
        async () => ({
          readingEnabled:
            true,
          spotTradingEnabled:
            true,
          withdrawalsEnabled:
            false,
          internalTransferEnabled:
            false,
          ipRestricted:
            true,
        }),
    }, {
      refreshIntervalMs:
        1_000,
      maximumEvidenceAgeMs:
        3_000,
    });

  const initial =
    service.getReport(
      NOW,
    );

  assert.equal(
    initial.ready,
    false,
  );
  assert.equal(
    initial.venues.every(
      (venue) =>
        venue.state ===
        "NOT_CHECKED",
    ),
    true,
  );

  const ready =
    await service.refresh(
      NOW,
    );

  assert.equal(
    ready.ready,
    true,
  );
  assert.equal(
    ready.venues.every(
      (venue) =>
        venue.state ===
          "READY" &&
        venue.spotTradingEnabled ===
          true &&
        venue.withdrawalsEnabled ===
          false &&
        venue.ipRestricted ===
          true,
    ),
    true,
  );
  assert.equal(
    ready.safety.orderSubmissionPerformed,
    false,
  );
  const coinDCXRouteReady =
    service.getReportForVenues(
      [
        "coindcx",
        "binance",
      ],
      NOW,
    );
  assert.equal(
    coinDCXRouteReady.ready,
    true,
  );
  assert.deepEqual(
    coinDCXRouteReady.venues.map(
      (venue) =>
        venue.exchange,
    ),
    [
      "coindcx",
      "binance",
    ],
  );

  const stale =
    service.getReport(
      NOW +
        3_001,
    );

  assert.equal(
    stale.ready,
    false,
  );
  assert.equal(
    stale.venues.every(
      (venue) =>
        venue.state ===
        "STALE",
    ),
    true,
  );

  const unsafe =
    new StrategyOneApiPermissionBoundaryService({
      readBinanceApiRestrictions:
        async () => ({
          ipRestricted:
            true,
          readingEnabled:
            true,
          spotAndMarginTradingEnabled:
            true,
          withdrawalsEnabled:
            true,
          internalTransferEnabled:
            true,
        }),
      readBybitApiKeyInformation:
        async () => ({
          readOnly:
            false,
          spotTradingEnabled:
            true,
          withdrawalsEnabled:
            false,
          internalTransferEnabled:
            false,
          ipRestricted:
            false,
          boundIpCount:
            0,
          unexpectedPermissions: [
            "ContractTrade:Order",
          ],
          systemManagedPermissions: [
            "Derivatives:DerivativesTrade",
          ],
        }),
      readCoinDCXApiKeyInformation:
        async () => ({
          readingEnabled:
            true,
          spotTradingEnabled:
            true,
          withdrawalsEnabled:
            false,
          internalTransferEnabled:
            false,
          ipRestricted:
            true,
        }),
    }, {
      refreshIntervalMs:
        1_000,
      maximumEvidenceAgeMs:
        3_000,
    });

  const blocked =
    await unsafe.refresh(
      NOW,
    );

  assert.equal(
    blocked.ready,
    false,
  );
  assert.match(
    blocked.blockers.join(
      " | ",
    ),
    /withdrawal permission is enabled/i,
  );
  assert.match(
    blocked.blockers.join(
      " | ",
    ),
    /explicit IP allowlist/i,
  );
  assert.match(
    blocked.blockers.join(
      " | ",
    ),
    /internal-transfer permission is enabled/i,
  );
  assert.match(
    blocked.blockers.join(
      " | ",
    ),
    /ContractTrade:Order/,
  );

  const unavailable =
    new StrategyOneApiPermissionBoundaryService({
      readBinanceApiRestrictions:
        async () =>
          Promise.reject(
            new Error(
              "synthetic secret-bearing failure",
            ),
          ),
      readBybitApiKeyInformation:
        async () =>
          Promise.reject(
            new Error(
              "synthetic secret-bearing failure",
            ),
          ),
      readCoinDCXApiKeyInformation:
        async () =>
          Promise.reject(
            new Error(
              "synthetic secret-bearing failure",
            ),
          ),
    }, {
      refreshIntervalMs:
        1_000,
      maximumEvidenceAgeMs:
        3_000,
    });

  const failed =
    await unavailable.refresh(
      NOW,
    );

  assert.equal(
    failed.ready,
    false,
  );
  assert.doesNotMatch(
    JSON.stringify(
      failed,
    ),
    /secret-bearing/i,
  );

  console.log(
    "Strategy #1 API permission boundary service test passed.",
  );
  console.log(
    "Signed-read, spot-trade, withdrawal-denial, IP-binding and freshness evidence remained fail-closed without any order or fund movement.",
  );
}

void main().catch(
  (error: unknown) => {
    console.error(
      error instanceof Error
        ? error.message
        : error,
    );
    process.exitCode =
      1;
  },
);
