import "dotenv/config";

import {
  BINANCE,
} from "../constants";

import {
  binanceCredentialsProvider,
} from "./BinanceCredentialsProvider";

import {
  binanceHttpClient,
} from "./BinanceHttpClient";

interface BinanceApiRestrictionsResponse {
  ipRestrict?: unknown;
  createTime?: unknown;

  enableReading?: unknown;
  enableSpotAndMarginTrading?: unknown;
  enableWithdrawals?: unknown;
  enableInternalTransfer?: unknown;

  enableMargin?: unknown;
  enableFutures?: unknown;
  enableVanillaOptions?: unknown;

  permitsUniversalTransfer?: unknown;
}

async function main(): Promise<void> {
  const credentials =
    binanceCredentialsProvider.getCredentials();

  await binanceHttpClient.synchronizeServerTime();

  const permissions =
    await binanceHttpClient.getSigned<
      BinanceApiRestrictionsResponse
    >(
      BINANCE.REST.API_RESTRICTIONS,
      {},
      credentials,
    );

  console.log(
    "\n================================",
  );

  console.log(
    "BINANCE API KEY PERMISSIONS",
  );

  console.log(
    "================================",
  );

  console.table([
    {
      IpRestricted:
        permissions.ipRestrict,

      Reading:
        permissions.enableReading,

      SpotTrading:
        permissions
          .enableSpotAndMarginTrading,

      Withdrawals:
        permissions.enableWithdrawals,

      InternalTransfer:
        permissions
          .enableInternalTransfer,

      Margin:
        permissions.enableMargin,

      Futures:
        permissions.enableFutures,

      Options:
        permissions
          .enableVanillaOptions,

      UniversalTransfer:
        permissions
          .permitsUniversalTransfer,
    },
  ]);
}

void main().catch(
  (error: unknown) => {
    console.error(
      "\n[Binance API Permissions Test]",
      error instanceof Error
        ? error.message
        : error,
    );

    process.exitCode = 1;
  },
);