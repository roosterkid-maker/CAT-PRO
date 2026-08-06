import "dotenv/config";

import {
  binanceCredentialsProvider,
} from "./BinanceCredentialsProvider";

import {
  binanceOrderApi,
} from "./BinanceOrderApi";

const TEST_SYMBOL =
  "XRPUSDT";

const TEST_QUANTITY =
  1;

const TEST_PRICE =
  0.1;

async function main(): Promise<void> {
  const credentials =
    binanceCredentialsProvider
      .getCredentials();

  console.log(
    "\n==================================",
  );

  console.log(
    "BINANCE TEST ORDER VALIDATION",
  );

  console.log(
    "==================================",
  );

  console.table([
    {
      Symbol:
        TEST_SYMBOL,

      Side:
        "BUY",

      Type:
        "LIMIT",

      Quantity:
        TEST_QUANTITY,

      Price:
        TEST_PRICE,

      Notional:
        TEST_QUANTITY *
        TEST_PRICE,
    },
  ]);

  await binanceOrderApi.testOrder(
    {
      symbol:
        TEST_SYMBOL,

      side:
        "BUY",

      type:
        "LIMIT",

      quantity:
        TEST_QUANTITY,

      price:
        TEST_PRICE,

      timeInForce:
        "GTC",

      clientOrderId:
        `validation-${Date.now()}`,
    },
    credentials,
  );

  console.log(
    "\nBinance test-order endpoint accepted the request.",
  );

  console.log(
    "No real order was placed.",
  );
}

void main().catch(
  (error: unknown) => {
    console.error(
      "\n[Binance Test Order Validation]",
      error instanceof Error
        ? error.message
        : error,
    );

    process.exitCode = 1;
  },
);