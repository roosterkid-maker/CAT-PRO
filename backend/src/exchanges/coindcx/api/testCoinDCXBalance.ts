import "dotenv/config";

import {
  coinDCXAccountApi,
} from "./CoinDCXAccountApi";

import {
  coinDCXCredentialsProvider,
} from "./CoinDCXCredentialsProvider";

async function main(): Promise<void> {
  const credentials =
    coinDCXCredentialsProvider.getCredentials();

  const balance =
    await coinDCXAccountApi.getBalance(
      "INR",
      credentials,
    );

  console.log(
    "==============================",
  );
  console.log(
    "CoinDCX INR Balance",
  );
  console.log(
    "==============================",
  );

  if (!balance) {
    console.log(
      "INR wallet not found.",
    );
    return;
  }

  console.table([
    {
      Currency:
        balance.currency,

      Balance:
        balance.balance,

      Locked:
        balance.lockedBalance,

      Available:
        balance.availableBalance,
    },
  ]);
}

void main().catch(
  (error: unknown) => {
    console.error(
      "[CoinDCX Balance Test]",
      error instanceof Error
        ? error.message
        : error,
    );

    process.exitCode = 1;
  },
);