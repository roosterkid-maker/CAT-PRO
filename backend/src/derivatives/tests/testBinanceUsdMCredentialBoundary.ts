import assert from "node:assert/strict";

import {
  BinanceUsdMCredentialsProvider,
} from "../providers/BinanceUsdMCredentialsProvider";

function main(): void {
  rejectsMissingDedicatedCredentialsEvenWhenSpotExists();
  rejectsPartialDedicatedCredentials();
  returnsOnlyDedicatedCredentials();
  console.log("BINANCE USD-M CREDENTIAL BOUNDARY TEST PASSED.");
  console.log("USD-M signed paths require a complete dedicated key pair and never inherit Binance Spot credentials.");
}

function rejectsMissingDedicatedCredentialsEvenWhenSpotExists(): void {
  const provider = new BinanceUsdMCredentialsProvider({
    BINANCE_API_KEY: "spot-key",
    BINANCE_API_SECRET: "spot-secret",
  });
  assert.equal(provider.isConfigured(), false);
  assert.throws(
    () => provider.getCredentials(),
    /BINANCE_USDM_API_KEY environment variable is missing/u,
  );
}

function rejectsPartialDedicatedCredentials(): void {
  const keyOnly = new BinanceUsdMCredentialsProvider({
    BINANCE_USDM_API_KEY: "futures-key",
  });
  assert.equal(keyOnly.isConfigured(), false);
  assert.throws(
    () => keyOnly.getCredentials(),
    /BINANCE_USDM_API_SECRET environment variable is missing/u,
  );

  const secretOnly = new BinanceUsdMCredentialsProvider({
    BINANCE_USDM_API_SECRET: "futures-secret",
  });
  assert.equal(secretOnly.isConfigured(), false);
  assert.throws(
    () => secretOnly.getCredentials(),
    /BINANCE_USDM_API_KEY environment variable is missing/u,
  );
}

function returnsOnlyDedicatedCredentials(): void {
  const provider = new BinanceUsdMCredentialsProvider({
    BINANCE_API_KEY: "spot-key",
    BINANCE_API_SECRET: "spot-secret",
    BINANCE_USDM_API_KEY: " futures-key ",
    BINANCE_USDM_API_SECRET: " futures-secret ",
  });
  assert.equal(provider.isConfigured(), true);
  assert.deepEqual(provider.getCredentials(), {
    apiKey: "futures-key",
    apiSecret: "futures-secret",
  });
}

main();
