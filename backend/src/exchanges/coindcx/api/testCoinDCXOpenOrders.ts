import "dotenv/config";

import {
  coinDCXOrderApi,
} from "./CoinDCXOrderApi";

import {
  coinDCXCredentialsProvider,
} from "./CoinDCXCredentialsProvider";

async function main(): Promise<void> {
  const credentials =
    coinDCXCredentialsProvider.getCredentials();

  const orders =
    await coinDCXOrderApi.getActiveOrders(
      "BTCUSDT",
      credentials,
    );

  console.log(
    "==============================",
  );
  console.log(
    "CoinDCX Active Orders",
  );
  console.log(
    "==============================",
  );

  console.table(
    orders.map((order) => ({
      Id: order.id,

      Market: order.market,

      Side: order.side,

      Status: order.status,

      Quantity:
        order.totalQuantity,

      Remaining:
        order.remainingQuantity,

      Price:
        order.pricePerUnit,
    })),
  );

  console.log(
    `Total Active Orders: ${orders.length}`,
  );
}

void main().catch(
  (error: unknown) => {
    console.error(
      "[CoinDCX Open Orders Test]",
      error instanceof Error
        ? error.message
        : error,
    );

    process.exitCode = 1;
  },
);