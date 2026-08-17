import "dotenv/config";

import {
  binanceAccountApi,
} from "./BinanceAccountApi";

import {
  binanceCredentialsProvider,
} from "./BinanceCredentialsProvider";

async function main(): Promise<void> {
  const credentials =
    binanceCredentialsProvider
      .getCredentials();

  const account =
    await binanceAccountApi.getAccount(
      credentials,
    );

  console.log(
    "\n==============================",
  );

  console.log(
    "BINANCE ACCOUNT TEST",
  );

  console.log(
    "==============================",
  );

  console.table([
    {
      AccountType:
        account.accountType,

      CanTrade:
        account.canTrade,

      CanDeposit:
        account.canDeposit,

      CanWithdraw:
        account.canWithdraw,

      MakerCommission:
        account.makerCommission,

      TakerCommission:
        account.takerCommission,

      NonZeroBalances:
        account.balances.length,
    },
  ]);

  console.log(
    "\nNON-ZERO BALANCES",
  );

  if (
    account.balances.length ===
    0
  ) {
    console.log(
      "No non-zero Spot balances found.",
    );
  } else {
    console.table(
      account.balances.map(
        (balance) => ({
          Asset:
            balance.asset,

          Available:
            balance
              .availableBalance,

          Locked:
            balance
              .lockedBalance,

          Total:
            balance
              .totalBalance,
        }),
      ),
    );
  }

  console.log(
    "\nBinance signed account authentication passed.",
  );
}

void main().catch(
  (error: unknown) => {
    console.error(
      "\n[Binance Account Test]",
      error instanceof Error
        ? error.message
        : error,
    );

    process.exitCode = 1;
  },
);