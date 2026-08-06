import "dotenv/config";

import axios from "axios";

import { COINDCX } from "../../../exchanges/coindcx/constants";
import { loadMarkets } from "../../../exchanges/coindcx/marketLoader";
import {
  orderValidationEngine,
} from "../../../exchanges/coindcx/OrderValidationEngine";
import {
  marketRegistry,
} from "../../../exchanges/coindcx/registry";

import {
  coinDCXAccountApi,
} from "../../../exchanges/coindcx/api/CoinDCXAccountApi";
import {
  coinDCXCredentialsProvider,
} from "../../../exchanges/coindcx/api/CoinDCXCredentialsProvider";

import {
  liveExecutionService,
} from "../LiveExecutionService";

import type {
  LiveExecutionResult,
} from "../models/LiveExecutionResult";

interface CoinDCXTicker {
  market?: string;

  ask?: string | number;

  last_price?: string | number;
}

const TEST_MARKET =
  "DOGEINR";

const TEST_CAPITAL =
  100;

/*
 * Current ask se approximately 10% neeche.
 * CoinDCX price band ke andar rehne aur immediate
 * execution risk kam rakhne ke liye.
 */
const LIMIT_PRICE_FACTOR =
  0.9;

const TIMEOUT_MS =
  5_000;

const POLLING_INTERVAL_MS =
  1_000;

const LIVE_CONFIRMATION =
  "RUN_COINDCX_ADAPTER_TIMEOUT_TEST";

async function main(): Promise<void> {
  const credentials =
    coinDCXCredentialsProvider.getCredentials();

  /*
   * Safety check:
   * test se pehle koi INR amount locked nahi hona chahiye.
   */
  const initialBalance =
    await coinDCXAccountApi.getBalance(
      "INR",
      credentials,
    );

  if (!initialBalance) {
    throw new Error(
      "INR wallet was not found.",
    );
  }

  if (
    initialBalance.lockedBalance >
    0
  ) {
    throw new Error(
      `Test blocked because INR ${initialBalance.lockedBalance} is already locked in one or more orders.`,
    );
  }

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
    "\n==========================================",
  );

  console.log(
    "CoinDCX EXECUTION ADAPTER TIMEOUT TEST",
  );

  console.log(
    "==========================================",
  );

  console.table([
    {
      Market:
        market.symbol,

      CurrentAsk:
        currentAsk,

      RequestedCapital:
        TEST_CAPITAL,

      LimitPrice:
        validation.normalizedPrice,

      Quantity:
        validation.normalizedQuantity,

      Notional:
        validation.notional,

      TimeoutMs:
        TIMEOUT_MS,

      PollingIntervalMs:
        POLLING_INTERVAL_MS,

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

  if (
    initialBalance.availableBalance <
    validation.notional
  ) {
    throw new Error(
      `Insufficient INR balance. Required ${validation.notional}, available ${initialBalance.availableBalance}.`,
    );
  }

  console.table([
    {
      Currency:
        initialBalance.currency,

      Available:
        initialBalance.availableBalance,

      Locked:
        initialBalance.lockedBalance,

      Required:
        validation.notional,
    },
  ]);

  if (
    process.env
      .COINDCX_LIVE_ORDER_CONFIRM !==
    LIVE_CONFIRMATION
  ) {
    console.log(
      "\nLIVE ADAPTER TEST BLOCKED.",
    );

    console.log(
      "Validation passed, but explicit confirmation is missing.",
    );

    console.log(
      "\nRun intentionally in the current CMD session with:",
    );

    console.log(
      `set COINDCX_LIVE_ORDER_CONFIRM=${LIVE_CONFIRMATION}`,
    );

    console.log(
      "\nNo order was placed.",
    );

    return;
  }

  const adapter =
    liveExecutionService.getAdapter(
      "coindcx",
    );

  const clientOrderId =
    `adapter-timeout-${Date.now()}`;

  console.log(
    "\nConfirmation accepted.",
  );

  console.log(
    "Placing order through CoinDCXExecutionAdapter...",
  );

  const result =
    await adapter.execute({
      exchange:
        "coindcx",

      market:
        market.symbol,

      side:
        "buy",

      orderType:
        "limit",

      quantity:
        validation.normalizedQuantity,

      price:
        validation.normalizedPrice,

      clientOrderId,

      timeoutMs:
        TIMEOUT_MS,

      pollingIntervalMs:
        POLLING_INTERVAL_MS,

      cancelOnTimeout:
        true,
    });

  printResult(
    result,
  );

  /*
   * CoinDCX ko locked balance release karne ke liye
   * thoda propagation time diya gaya hai.
   */
  await sleep(
    2_000,
  );

  const finalBalance =
    await coinDCXAccountApi.getBalance(
      "INR",
      credentials,
    );

  if (!finalBalance) {
    throw new Error(
      "Unable to verify final INR balance.",
    );
  }

  console.log(
    "\nFINAL WALLET STATE",
  );

  console.table([
    {
      Currency:
        finalBalance.currency,

      Available:
        finalBalance.availableBalance,

      Locked:
        finalBalance.lockedBalance,

      Total:
        finalBalance.totalBalance,
    },
  ]);

  if (
    finalBalance.lockedBalance >
    0
  ) {
    console.error(
      "\nSAFETY WARNING:",
    );

    console.error(
      `${finalBalance.lockedBalance} INR remains locked. Check CoinDCX open orders immediately.`,
    );

    process.exitCode = 1;

    return;
  }

  if (
    result.status !==
      "CANCELLED" ||
    !result.timedOut ||
    !result.cancelled
  ) {
    console.warn(
      "\nAdapter returned an unexpected terminal result.",
    );

    console.warn(
      "Review the order result before running another live test.",
    );

    process.exitCode = 1;

    return;
  }

  console.log(
    "\nADAPTER TIMEOUT TEST PASSED.",
  );

  console.log(
    "Order timed out, was automatically cancelled, and no INR remains locked.",
  );
}

function printResult(
  result: LiveExecutionResult,
): void {
  console.log(
    "\nLIVE EXECUTION RESULT",
  );

  console.table([
    {
      Success:
        result.success,

      Exchange:
        result.exchange,

      Market:
        result.market,

      Side:
        result.side,

      OrderId:
        result.orderId,

      ClientOrderId:
        result.clientOrderId,

      Status:
        result.status,

      RequestedQuantity:
        result.requestedQuantity,

      FilledQuantity:
        result.filledQuantity,

      RemainingQuantity:
        result.remainingQuantity,

      RequestedPrice:
        result.requestedPrice,

      AverageFillPrice:
        result.averageFillPrice,

      FeeAmount:
        result.feeAmount,

      Cancelled:
        result.cancelled,

      TimedOut:
        result.timedOut,

      ExecutionTimeMs:
        result.executionTimeMs,

      FailureReason:
        result.failureReason,
    },
  ]);

  if (
    result.reasons.length >
    0
  ) {
    console.log(
      "\nReasons:",
    );

    for (
      const reason
      of result.reasons
    ) {
      console.log(
        `- ${reason}`,
      );
    }
  }
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
      "\n[CoinDCX Adapter Timeout Test]",
      error instanceof Error
        ? error.message
        : error,
    );

    process.exitCode = 1;
  },
);