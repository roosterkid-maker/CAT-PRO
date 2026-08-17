import type {
  ExchangeMarketCapability,
} from "../../capabilities/models/ExchangeCapability";

import {
  UnoCoinExecutionAdapter,
} from "../adapters/UnoCoinExecutionAdapter";

import type {
  LiveExecutionAdapter,
  LiveExecutionAdapterReadiness,
} from "../contracts/LiveExecutionAdapter";

import type {
  LiveExecutionRequest,
} from "../models/LiveExecutionRequest";

import type {
  LiveExecutionResult,
} from "../models/LiveExecutionResult";

import {
  UnoCoinOrderApi,
  UnoCoinOrderHttpClient,
  type UnoCoinAuthenticatedOrderClient,
  type UnoCoinCreateLimitOrderRequest,
  type UnoCoinCreatedOrder,
  type UnoCoinSpotOrder,
} from "../../../exchanges/unocoin/api/UnoCoinOrderApi";

import type {
  UnoCoinCredentials,
} from "../../../exchanges/unocoin/api/UnoCoinCredentialsProvider";

const FIXTURE_TOKEN =
  "fixture-unocoin-bearer-token";

const ORDER_ID =
  "29762";

function assertCondition(
  condition: boolean,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(
      message,
    );
  }
}

async function main():
  Promise<void> {
  await testOfficialHttpContract();
  await testBoundedHistoryAndFillEvidence();
  await testExecutionLifecycle();

  console.log(
    "UNOCOIN V95 SPOT EXECUTION ADAPTER TEST PASSED.",
  );
  console.log(
    "Only isolated bearer-token fixtures were used; no external request, balance mutation, capital reservation, LIVE enablement, or exchange order occurred.",
  );
}

async function testOfficialHttpContract():
  Promise<void> {
  const calls:
    Array<{
      method: string;
      path: string;
      query: string;
      authorization:
        string | null;
      body: string;
    }> = [];
  const client =
    new UnoCoinOrderHttpClient({
      baseUrl:
        "https://api.unocoin.test",
      requestTimeoutMs:
        1_000,
      fetchImplementation:
        async (
          input,
          init,
        ) => {
          const url =
            new URL(
              String(
                input,
              ),
            );
          const headers =
            new Headers(
              init?.headers,
            );

          calls.push({
            method:
              init?.method ??
              "",
            path:
              url.pathname,
            query:
              url.search,
            authorization:
              headers.get(
                "authorization",
              ),
            body:
              String(
                init?.body ??
                  "",
              ),
          });

          if (
            url.pathname ===
            "/api/exchange/placeorder"
          ) {
            return jsonResponse({
              message:
                "Your BUY LIMIT Order has been placed successfully.",
              order_details: {
                id:
                  Number(
                    ORDER_ID,
                  ),
              },
            });
          }

          if (
            url.pathname ===
            "/api/exchange/cancel"
          ) {
            return jsonResponse({
              status:
                "ok",
              message:
                "Your request to cancel order has been accepted.",
            });
          }

          return jsonResponse(
            historyEnvelope(
              [
                historyRow(
                  0,
                ),
              ],
              1,
              1,
            ),
          );
        },
    });
  const api =
    new UnoCoinOrderApi({
      client,
    });
  const credentials:
    UnoCoinCredentials = {
    apiToken:
      FIXTURE_TOKEN,
  };
  const created =
    await api.createLimitOrder(
      {
        market:
          "BTCINR",
        side:
          "buy",
        price:
          5_000_000,
        quantity:
          0.0001,
      },
      credentials,
    );
  const read =
    await api.getSpotOrder(
      ORDER_ID,
      "BTC_INR",
      credentials,
    );

  await api.requestCancel(
    ORDER_ID,
    credentials,
  );

  const createFields =
    new URLSearchParams(
      calls[0]
        ?.body ??
        "",
    );
  const cancelFields =
    new URLSearchParams(
      calls[2]
        ?.body ??
        "",
    );

  assertCondition(
    calls.length ===
      3 &&
      calls.every(
        (call) =>
          call.authorization ===
          `Bearer ${FIXTURE_TOKEN}`,
      ) &&
      calls[0]
        ?.method ===
        "POST" &&
      calls[0]
        ?.path ===
        "/api/exchange/placeorder" &&
      createFields.get(
        "coin",
      ) ===
        "BTC" &&
      createFields.get(
        "base_coin",
      ) ===
        "INR" &&
      createFields.get(
        "advance_order_type",
      ) ===
        "LIMIT" &&
      createFields.get(
        "order_type",
      ) ===
        "BID" &&
      createFields.get(
        "rate",
      ) ===
        "5000000" &&
      createFields.get(
        "volume",
      ) ===
        "0.0001" &&
      calls[1]
        ?.method ===
        "GET" &&
      calls[1]
        ?.path ===
        "/api/exchange/orders/all/INR/BTC" &&
      calls[1]
        ?.query ===
        "?page=1" &&
      calls[2]
        ?.path ===
        "/api/exchange/cancel" &&
      cancelFields.get(
        "orderid",
      ) ===
        ORDER_ID &&
      created.orderId ===
        ORDER_ID &&
      read.status ===
        0 &&
      read.executedQuantity ===
        0,
    "UnoCoin transport must use the official bearer-authenticated LIMIT create, pair-history GET, and cancel form contracts.",
  );
}

async function testBoundedHistoryAndFillEvidence():
  Promise<void> {
  const paths:
    string[] = [];
  const credentials:
    UnoCoinCredentials = {
    apiToken:
      FIXTURE_TOKEN,
  };
  const client:
    UnoCoinAuthenticatedOrderClient = {
    async getAuthenticated<T>(
      path: string,
    ): Promise<T> {
      paths.push(
        path,
      );

      return (
        path.endsWith(
          "?page=1",
        )
          ? historyEnvelope(
              [
                {
                  ...historyRow(
                    0,
                  ),
                  id:
                    100,
                },
              ],
              1,
              2,
            )
          : historyEnvelope(
              [
                historyRow(
                  1,
                  [
                    {
                      volume:
                        "0.00004000",
                      rate:
                        "4999000.00000000",
                    },
                    {
                      volume:
                        "0.00006000",
                      rate:
                        "5001000.00000000",
                    },
                  ],
                ),
              ],
              2,
              2,
            )
      ) as T;
    },
    async postAuthenticatedForm<T>():
      Promise<T> {
      throw new Error(
        "Unexpected write in history test.",
      );
    },
  };
  const api =
    new UnoCoinOrderApi({
      client,
      maximumHistoryPages:
        2,
    });
  const filled =
    await api.getSpotOrder(
      ORDER_ID,
      "BTC_INR",
      credentials,
    );

  assertCondition(
    paths.length ===
      2 &&
      filled.status ===
        1 &&
      filled.executedQuantity ===
        0.0001 &&
      filled.remainingQuantity ===
        0 &&
      filled.averagePrice ===
        5_000_200,
    "UnoCoin status must search bounded pages and derive filled quantity/average only from transaction-level evidence.",
  );

  const incompleteApi =
    new UnoCoinOrderApi({
      client: {
        async getAuthenticated<T>():
          Promise<T> {
          return historyEnvelope(
            [
              historyRow(
                1,
              ),
            ],
            1,
            1,
          ) as T;
        },
        async postAuthenticatedForm<T>():
          Promise<T> {
          throw new Error(
            "Unexpected write in incomplete-fill test.",
          );
        },
      },
    });
  let rejected =
    false;

  try {
    await incompleteApi
      .getSpotOrder(
        ORDER_ID,
        "BTC_INR",
        credentials,
      );
  } catch (
    error:
      unknown
  ) {
    rejected =
      error instanceof Error &&
      error.message.includes(
        "transaction-level fill evidence",
      );
  }

  assertCondition(
    rejected,
    "UnoCoin completed status without transaction-level fill evidence must fail closed.",
  );
}

async function testExecutionLifecycle():
  Promise<void> {
  const credentials:
    UnoCoinCredentials = {
    apiToken:
      FIXTURE_TOKEN,
  };
  const capability =
    unoCoinCapability();
  const readiness:
    LiveExecutionAdapterReadiness = {
    credentialsConfigured:
      true,
    authenticationVerified:
      true,
    exchangeApiReachable:
      true,
    verificationState:
      "VERIFIED",
    readOnlyVerificationFresh:
      true,
    lastVerifiedAt:
      1,
    lastVerificationAttemptAt:
      1,
    verificationExpiresAt:
      Number.MAX_SAFE_INTEGER,
    verificationMethod:
      "TOKEN_ACCOUNT_STATUS_READ",
    lastVerificationError:
      null,
  };
  let createCalls =
    0;
  let cancelCalls =
    0;
  let cancellationReads =
    0;
  let cancellationMode =
    false;
  let capabilityAvailable =
    true;
  let metrics =
    0;
  const orderApi = {
    async createLimitOrder(
      request:
        UnoCoinCreateLimitOrderRequest,
    ): Promise<
      UnoCoinCreatedOrder
    > {
      createCalls +=
        1;

      assertCondition(
        request.market ===
          "BTC_INR" &&
        request.side ===
          "buy" &&
        request.price ===
          5_000_000 &&
        request.quantity ===
          0.0001,
        "UnoCoin adapter must preserve validated market, side, price, and quantity.",
      );

      return {
        orderId:
          ORDER_ID,
        market:
          "BTC_INR",
        side:
          "buy",
        price:
          5_000_000,
        quantity:
          0.0001,
      };
    },
    async getSpotOrder():
      Promise<
        UnoCoinSpotOrder
      > {
      if (
        cancellationMode
      ) {
        cancellationReads +=
          1;

        return normalizedOrder(
          cancellationReads >=
            2
            ? 2
            : 4,
        );
      }

      return normalizedOrder(
        1,
      );
    },
    async requestCancel():
      Promise<void> {
      cancelCalls +=
        1;
      cancellationMode =
        true;
    },
  };
  let now =
    1_000;
  const adapter =
    new UnoCoinExecutionAdapter({
      orderApi,
      credentialsSource: {
        getCredentials:
          () =>
            credentials,
        isConfigured:
          () =>
            true,
      },
      poller: {
        async waitForFinalState(
          liveAdapter:
            LiveExecutionAdapter,
          initialResult:
            LiveExecutionResult,
        ):
          Promise<
            LiveExecutionResult
          > {
          assertCondition(
            initialResult.status ===
              "PENDING" &&
            initialResult.clientOrderId ===
              null,
            "UnoCoin create acknowledgement must remain PENDING without inventing a client order ID.",
          );

          return liveAdapter
            .getOrderStatus(
              ORDER_ID,
              "BTC_INR",
              "SPOT",
            );
        },
      },
      audit: {
        async executionStarted() {},
        async orderCreated() {},
        async executionFailed() {},
      },
      metrics: {
        record() {
          metrics +=
            1;
        },
      },
      verificationSource: {
        getReadiness:
          () =>
            readiness,
      },
      getMarketCapability:
        async () =>
          capabilityAvailable
            ? capability
            : null,
      sleep:
        async () => {},
      now:
        () => {
          now +=
            5;

          return now;
        },
    });
  const request:
    LiveExecutionRequest = {
    exchange:
      "unocoin",
    product:
      "SPOT",
    market:
      "BTC_INR",
    side:
      "buy",
    orderType:
      "limit",
    quantity:
      0.0001,
    price:
      5_000_000,
    timeoutMs:
      2_000,
    pollingIntervalMs:
      100,
    cancelOnTimeout:
      true,
  };
  const filled =
    await adapter.execute(
      request,
    );

  assertCondition(
    filled.success &&
      filled.status ===
        "FILLED" &&
      filled.averageFillPrice ===
        5_000_000 &&
      createCalls ===
        1 &&
      adapter.getReadiness() ===
        readiness &&
      adapter.getCapabilities()
        .supportsLimitOrders &&
      !adapter.getCapabilities()
        .supportsMarketOrders &&
      !adapter.getCapabilities()
        .supportsPostOnly,
    "UnoCoin adapter must expose truthful LIMIT-only capabilities and confirmed fill/readiness evidence.",
  );

  const cancelled =
    await adapter.cancelOrder(
      ORDER_ID,
      "BTC_INR",
      "SPOT",
    );

  assertCondition(
    cancelled.status ===
      "CANCELLED" &&
      cancelled.cancelled &&
      cancelCalls ===
        1 &&
      cancellationReads ===
        2,
    "UnoCoin cancel acceptance must be followed by bounded exchange-confirmed terminal polling.",
  );

  const marketOrder =
    await adapter.execute({
      ...request,
      orderType:
        "market",
    });
  const syntheticId =
    await adapter.execute({
      ...request,
      clientOrderId:
        "11111111-1111-4111-8111-111111111111",
    });
  const tooPrecise =
    await adapter.execute({
      ...request,
      quantity:
        0.000100001,
    });
  const tooSmall =
    await adapter.execute({
      ...request,
      quantity:
        0.00001,
    });
  capabilityAvailable =
    false;
  const noRules =
    await adapter.execute(
      request,
    );

  assertCondition(
    [
      marketOrder,
      syntheticId,
      tooPrecise,
      tooSmall,
      noRules,
    ].every(
      (result) =>
        !result.success &&
        result.status ===
          "FAILED" &&
        result.orderId ===
          null,
    ) &&
      createCalls ===
        1 &&
      metrics ===
        6,
    "Unsupported order types, synthetic IDs, excess precision, unsafe notional, and missing rules must fail before UnoCoin submission.",
  );
}

function unoCoinCapability():
  ExchangeMarketCapability {
  return {
    exchange:
      "unocoin",
    market:
      "BTC_INR",
    baseAsset:
      "BTC",
    quoteAsset:
      "INR",
    product:
      "spot",
    tradingEnabled:
      true,
    maintenanceMode:
      false,
    order: {
      supportedOrderTypes: [
        "market",
        "limit",
      ],
      supportedTimeInForce: [],
      supportsPostOnly:
        false,
      supportsClientOrderId:
        false,
      supportsOrderCancellation:
        true,
      supportsOrderStatusPolling:
        true,
    },
    price: {
      minimumPrice:
        null,
      maximumPrice:
        null,
      priceStep:
        null,
      pricePrecision:
        8,
    },
    quantity: {
      minimumQuantity:
        0.00001,
      maximumQuantity:
        null,
      quantityStep:
        null,
      quantityPrecision:
        8,
    },
    notional: {
      minimumNotional:
        100,
      maximumNotional:
        10_000_000,
    },
    fees: {
      makerFeeRate:
        0.00472,
      takerFeeRate:
        0.00708,
      feeAsset:
        "INR",
    },
    sourceUpdatedAt:
      null,
    synchronizedAt:
      1_720_000_000_000,
  };
}

function normalizedOrder(
  status: number,
): UnoCoinSpotOrder {
  const filled =
    status ===
    1;

  return {
    orderId:
      ORDER_ID,
    market:
      "BTC_INR",
    side:
      "buy",
    price:
      5_000_000,
    averagePrice:
      filled
        ? 5_000_000
        : 0,
    originalQuantity:
      0.0001,
    executedQuantity:
      filled
        ? 0.0001
        : 0,
    remainingQuantity:
      filled
        ? 0
        : 0.0001,
    status,
  };
}

function historyEnvelope(
  rows:
    readonly Record<string, unknown>[],
  currentPage: number,
  lastPage: number,
): Record<string, unknown> {
  return {
    current_page:
      currentPage,
    data:
      rows,
    last_page:
      lastPage,
    per_page:
      15,
  };
}

function historyRow(
  status: number,
  transactions:
    readonly Record<string, unknown>[] = [],
): Record<string, unknown> {
  return {
    id:
      Number(
        ORDER_ID,
      ),
    coin:
      "BTC",
    rate:
      "5000000.00000000",
    order_type:
      "BID",
    volume:
      "0.00010000",
    base_coin:
      "INR",
    advance_order_type:
      "LIMIT",
    status,
    exchange_transactions:
      transactions,
  };
}

function jsonResponse(
  body: unknown,
): Response {
  return new Response(
    JSON.stringify(
      body,
    ),
    {
      status:
        200,
      headers: {
        "Content-Type":
          "application/json",
      },
    },
  );
}

void main().catch(
  (
    error:
      unknown,
  ) => {
    console.error(
      "[UnoCoin V95 Spot Execution Adapter Test]",
      error instanceof Error
        ? error.message
        : error,
    );
    process.exitCode =
      1;
  },
);
