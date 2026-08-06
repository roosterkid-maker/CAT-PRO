import "dotenv/config";

import axios from "axios";

import { COINDCX } from "../constants";
import { loadMarkets } from "../marketLoader";
import {
  orderValidationEngine,
} from "../OrderValidationEngine";
import {
  marketRegistry,
} from "../registry";

import {
  coinDCXAccountApi,
} from "./CoinDCXAccountApi";
import {
  coinDCXCredentialsProvider,
} from "./CoinDCXCredentialsProvider";
import {
  coinDCXOrderApi,
  type CoinDCXOrder,
} from "./CoinDCXOrderApi";

interface CoinDCXTicker {
  market?: string;
  ask?: string | number;
  last_price?: string | number;
}

const TEST_MARKET = "DOGEINR";
const TEST_CAPITAL = 100;

/*
 * Market ask se approximately 10% neeche
 * controlled limit order.
 */
const LIMIT_PRICE_FACTOR = 0.9;

const LIVE_CONFIRMATION =
  "PLACE_AND_CANCEL_100_INR_TEST_ORDER";

async function main(): Promise<void> {
  const credentials =
    coinDCXCredentialsProvider.getCredentials();

  const markets =
    await loadMarkets();

  marketRegistry.clear();
  marketRegistry.registerMany(
    markets,
  );

  const market =
    marketRegistry.get(
      TEST_MARKET,
    );

  if (!market) {
    throw new Error(
      `Market metadata not found: ${TEST_MARKET}`,
    );
  }

  if (
    !market.orderTypes.includes(
      "limit_order",
    )
  ) {
    throw new Error(
      `${TEST_MARKET} does not support limit orders.`,
    );
  }

  const tickerResponse =
    await axios.get<
      CoinDCXTicker[]
    >(
      `${COINDCX.REST.BASE_URL}/exchange/ticker`,
      {
        timeout: 10_000,
      },
    );

  if (
    !Array.isArray(
      tickerResponse.data,
    )
  ) {
    throw new Error(
      "Invalid CoinDCX ticker response.",
    );
  }

  const ticker =
    tickerResponse.data.find(
      (item) =>
        item.market
          ?.trim()
          .toUpperCase() ===
        TEST_MARKET,
    );

  if (!ticker) {
    throw new Error(
      `Ticker not found: ${TEST_MARKET}`,
    );
  }

  const currentAsk =
    Number(
      ticker.ask ??
        ticker.last_price,
    );

  if (
    !Number.isFinite(currentAsk) ||
    currentAsk <= 0
  ) {
    throw new Error(
      "Current ask price is invalid.",
    );
  }

  const requestedPrice =
    currentAsk *
    LIMIT_PRICE_FACTOR;

  const requestedQuantity =
    TEST_CAPITAL /
    requestedPrice;

  const validation =
    orderValidationEngine.validate({
      market,
      price:
        requestedPrice,
      quantity:
        requestedQuantity,
    });

  console.log(
    "\n========================================",
  );
  console.log(
    "CoinDCX LIVE LIMIT ORDER SAFETY CHECK",
  );
  console.log(
    "========================================",
  );

  console.table([
    {
      Market:
        market.symbol,

      CurrentAsk:
        currentAsk,

      Capital:
        TEST_CAPITAL,

      LimitPrice:
        validation.normalizedPrice,

      Quantity:
        validation.normalizedQuantity,

      Notional:
        validation.notional,

      Valid:
        validation.valid,
    },
  ]);

  if (!validation.valid) {
    console.error(
      "\nORDER BLOCKED:",
    );

    for (
      const reason
      of validation.reasons
    ) {
      console.error(
        `- ${reason}`,
      );
    }

    process.exitCode = 1;
    return;
  }

  /*
   * DOGEINR buy order ke liye
   * spending wallet INR hai.
   */
  const quoteCurrency =
    market.symbol.endsWith("INR")
      ? "INR"
      : market.quote;

  const quoteBalance =
    await coinDCXAccountApi.getBalance(
      quoteCurrency,
      credentials,
    );

  if (!quoteBalance) {
    throw new Error(
      `${quoteCurrency} wallet was not found.`,
    );
  }

  console.table([
    {
      Currency:
        quoteBalance.currency,

      Available:
        quoteBalance.availableBalance,

      Required:
        validation.notional,
    },
  ]);

  if (
    quoteBalance.availableBalance <
    validation.notional
  ) {
    throw new Error(
      `Insufficient ${quoteCurrency} balance. Required ${validation.notional}, available ${quoteBalance.availableBalance}.`,
    );
  }

  if (
    process.env
      .COINDCX_LIVE_ORDER_CONFIRM !==
    LIVE_CONFIRMATION
  ) {
    console.log(
      "\nLIVE ORDER BLOCKED.",
    );

    console.log(
      "Validation and balance checks passed, but confirmation is missing.",
    );

    console.log(
      "\nTo intentionally run the real test, temporarily add this to backend/.env:",
    );

    console.log(
      `COINDCX_LIVE_ORDER_CONFIRM=${LIVE_CONFIRMATION}`,
    );

    console.log(
      "\nNo order was placed.",
    );

    return;
  }

  const clientOrderId =
    `arb-test-${Date.now()}`;

  console.log(
    "\nLIVE confirmation accepted.",
  );

  console.log(
    "Placing controlled limit order...",
  );

  let createdOrder:
    | CoinDCXOrder
    | null = null;

  let statusOrder:
    CoinDCXOrder;

  try {
    createdOrder =
      await coinDCXOrderApi.createOrder(
        {
          market:
            market.symbol,

          side:
            "buy",

          orderType:
            "limit_order",

          totalQuantity:
            validation.normalizedQuantity,

          pricePerUnit:
            validation.normalizedPrice,

          clientOrderId,
        },
        credentials,
      );

    printOrder(
      "ORDER CREATED",
      createdOrder,
    );
  } catch (error: unknown) {
    console.warn(
      "\nCreate-order response could not be parsed.",
    );

    console.warn(
      error instanceof Error
        ? error.message
        : error,
    );

    console.warn(
      "Recovering order using clientOrderId...",
    );
  }

  await sleep(
    2_000,
  );

  if (createdOrder) {
    statusOrder =
      await coinDCXOrderApi.getOrderStatus(
        createdOrder.id,
        credentials,
      );
  } else {
    statusOrder =
      await coinDCXOrderApi
        .getOrderStatusByClientOrderId(
          clientOrderId,
          credentials,
        );
  }

  printOrder(
    "ORDER STATUS",
    statusOrder,
  );

  if (
    thisOrderCanBeCancelled(
      statusOrder,
    )
  ) {
    console.log(
      "\nCancelling test order...",
    );

    const cancelledOrder =
      await coinDCXOrderApi.cancelOrder(
        statusOrder.id,
        credentials,
      );

    printOrder(
      "CANCEL RESPONSE",
      cancelledOrder,
    );

    await sleep(
      1_500,
    );

    const finalOrder =
      await coinDCXOrderApi.getOrderStatus(
        statusOrder.id,
        credentials,
      );

    printOrder(
      "FINAL STATUS",
      finalOrder,
    );
  } else {
    console.warn(
      `\nOrder status is ${statusOrder.status}; automatic cancellation was not attempted.`,
    );
  }

  console.log(
    "\nLifecycle test complete.",
  );
}

function thisOrderCanBeCancelled(
  order: CoinDCXOrder,
): boolean {
  const status =
    order.status
      .trim()
      .toLowerCase();

  return (
    status === "init" ||
    status === "open" ||
    status ===
      "partially_filled"
  );
}

function printOrder(
  title: string,
  order: CoinDCXOrder,
): void {
  console.log(
    `\n${title}`,
  );

  console.table([
    {
      Id:
        order.id,

      ClientOrderId:
        order.clientOrderId,

      Market:
        order.market,

      Side:
        order.side,

      Status:
        order.status,

      Quantity:
        order.totalQuantity,

      Remaining:
        order.remainingQuantity,

      LimitPrice:
        order.pricePerUnit,

      AveragePrice:
        order.averagePrice,

      Fee:
        order.feeAmount,
    },
  ]);
}

function sleep(
  milliseconds: number,
): Promise<void> {
  return new Promise(
    (resolve) => {
      setTimeout(
        resolve,
        milliseconds,
      );
    },
  );
}

void main().catch(
  (error: unknown) => {
    console.error(
      "\n[CoinDCX Live Order Lifecycle Test]",
      error instanceof Error
        ? error.message
        : error,
    );

    process.exitCode = 1;
  },
);