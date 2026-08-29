import {
  createPrivateKey,
  createPublicKey,
  verify,
} from "node:crypto";

import {
  CoinSwitchCredentialsProvider,
  type CoinSwitchCredentials,
} from "../../../exchanges/coinswitch/api/CoinSwitchCredentialsProvider";

import {
  CoinSwitchOrderApi,
  type CoinSwitchCreateOrderRequest,
  type CoinSwitchSignedOrderClient,
  type CoinSwitchSpotOrder,
} from "../../../exchanges/coinswitch/api/CoinSwitchOrderApi";

import {
  CoinSwitchReadOnlyHttpClient,
  type CoinSwitchSignedBody,
} from "../../../exchanges/coinswitch/api/CoinSwitchReadOnlyHttpClient";

import {
  CoinSwitchSigner,
} from "../../../exchanges/coinswitch/api/CoinSwitchSigner";

import type {
  CoinSwitchMarketRuleEvidence,
} from "../../../exchanges/coinswitch/CoinSwitchMarketRuleEvidence";

import {
  CoinSwitchExecutionAdapter,
} from "../adapters/CoinSwitchExecutionAdapter";

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

const PRIVATE_SEED =
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";

const PRIVATE_KEY_DER_PREFIX =
  "302e020100300506032b657004220420";

const CLIENT_ORDER_ID =
  "11111111-1111-4111-8111-111111111111";

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

function fixtureCredentials():
  CoinSwitchCredentials {
  const privateKey =
    createPrivateKey({
      key:
        Buffer.concat([
          Buffer.from(
            PRIVATE_KEY_DER_PREFIX,
            "hex",
          ),
          Buffer.from(
            PRIVATE_SEED,
            "hex",
          ),
        ]),
      format:
        "der",
      type:
        "pkcs8",
    });
  const publicDer =
    createPublicKey(
      privateKey,
    ).export({
      format:
        "der",
      type:
        "spki",
    });

  return {
    apiKey:
      publicDer
        .subarray(
          publicDer.length -
            32,
        )
        .toString(
          "hex",
        ),
    apiSecret:
      PRIVATE_SEED,
  };
}

async function main():
  Promise<void> {
  const credentials =
    fixtureCredentials();

  testMethodSigning(
    credentials,
  );
  await testSignedWriteTransport(
    credentials,
  );
  await testOfficialOrderApi(
    credentials,
  );
  await testExecutionLifecycle(
    credentials,
  );

  console.log(
    "COINSWITCH V22.21 SPOT EXECUTION ADAPTER TEST PASSED.",
  );

  console.log(
    "Only isolated Ed25519 fixtures were used; no external request, balance mutation, capital reservation, LIVE enablement, or exchange order occurred.",
  );
}

function testMethodSigning(
  credentials:
    CoinSwitchCredentials,
): void {
  const epoch =
    1_720_000_000_123;
  const signer =
    new CoinSwitchSigner();
  const privateKey =
    createPrivateKey({
      key:
        Buffer.concat([
          Buffer.from(
            PRIVATE_KEY_DER_PREFIX,
            "hex",
          ),
          Buffer.from(
            PRIVATE_SEED,
            "hex",
          ),
        ]),
      format:
        "der",
      type:
        "pkcs8",
    });

  for (
    const method
    of [
      "POST",
      "DELETE",
    ] as const
  ) {
    const signed =
      signer.signRequest(
        method,
        "/trade/api/v2/order",
        {},
        epoch,
        credentials,
      );
    const valid =
      verify(
        null,
        Buffer.from(
          `${method}/trade/api/v2/order${epoch}`,
          "utf8",
        ),
        createPublicKey(
          privateKey,
        ),
        Buffer.from(
          signed.headers[
            "X-AUTH-SIGNATURE"
          ] ??
            "",
          "hex",
        ),
      );

    assertCondition(
      valid &&
        signed.method ===
          method &&
        signed.path ===
          "/trade/api/v2/order",
      `CoinSwitch ${method} signature must cover METHOD + decoded path + epoch and exclude the JSON body.`,
    );
  }
}

async function testSignedWriteTransport(
  credentials:
    CoinSwitchCredentials,
): Promise<void> {
  const epoch =
    1_720_000_000_123;
  const calls:
    Array<{
      method: string;
      body: string;
      headers:
        HeadersInit | undefined;
    }> = [];
  const client =
    new CoinSwitchReadOnlyHttpClient({
      credentialsProvider:
        new CoinSwitchCredentialsProvider(),
      now:
        () =>
          epoch,
      getServerTime:
        async () =>
          epoch,
      request:
        async (
          _input,
          init,
        ) => {
          calls.push({
            method:
              init?.method ??
              "",
            body:
              String(
                init?.body ??
                "",
              ),
            headers:
              init?.headers,
          });

          return new Response(
            JSON.stringify(
              orderEnvelope(
                init?.method ===
                  "DELETE"
                  ? "CANCELLATION_RAISED"
                  : "OPEN",
              ),
            ),
            {
              status: 200,
              headers: {
                "Content-Type":
                  "application/json",
              },
            },
          );
        },
    });
  const createBody:
    CoinSwitchSignedBody = {
    side:
      "buy",
    symbol:
      "BTC/INR",
    type:
      "limit",
    price:
      5_000_000,
    quantity:
      0.0001,
    exchange:
      "coinswitchx",
  };

  await client.postSigned(
    "/trade/api/v2/order",
    createBody,
    credentials,
  );
  await client.deleteSigned(
    "/trade/api/v2/order",
    {
      order_id:
        "order-1",
    },
    credentials,
  );

  assertCondition(
    calls.length ===
      2 &&
      calls[0]
        ?.method ===
        "POST" &&
      calls[0]
        ?.body ===
        JSON.stringify(
          createBody,
        ) &&
      calls[1]
        ?.method ===
        "DELETE" &&
      calls[1]
        ?.body ===
        JSON.stringify({
          order_id:
            "order-1",
        }),
    "CoinSwitch signed write transport must preserve the official HTTP method and exact JSON request body.",
  );
}

async function testOfficialOrderApi(
  credentials:
    CoinSwitchCredentials,
): Promise<void> {
  const calls:
    Array<{
      method: string;
      path: string;
      body?:
        CoinSwitchSignedBody;
      parameters?:
        Readonly<
          Record<
            string,
            string
          >
        >;
    }> = [];
  const client:
    CoinSwitchSignedOrderClient = {
    async getSigned<T>(
      path: string,
      parameters:
        Readonly<
          Record<
            string,
            string
          >
        > = {},
    ): Promise<T> {
      calls.push({
        method:
          "GET",
        path,
        parameters,
      });

      return orderEnvelope(
        "PARTIALLY_EXECUTED",
      ) as T;
    },
    async postSigned<T>(
      path: string,
      body:
        CoinSwitchSignedBody,
    ): Promise<T> {
      calls.push({
        method:
          "POST",
        path,
        body,
      });

      return orderEnvelope(
        "OPEN",
      ) as T;
    },
    async deleteSigned<T>(
      path: string,
      body:
        CoinSwitchSignedBody,
    ): Promise<T> {
      calls.push({
        method:
          "DELETE",
        path,
        body,
      });

      return orderEnvelope(
        "CANCELLATION_RAISED",
      ) as T;
    },
  };
  const api =
    new CoinSwitchOrderApi(
      client,
    );
  const created =
    await api.createSpotOrder(
      {
        venue:
          "coinswitchx",
        market:
          "btc_inr",
        side:
          "buy",
        price:
          5_000_000,
        quantity:
          0.0001,
        clientOrderId:
          CLIENT_ORDER_ID,
      },
      credentials,
    );
  const read =
    await api.getSpotOrder(
      "order-1",
      credentials,
    );
  const cancelled =
    await api.cancelSpotOrder(
      "order-1",
      credentials,
    );

  assertCondition(
    calls[0]
      ?.method ===
      "POST" &&
      calls[0]
        ?.path ===
        "/trade/api/v2/order" &&
      calls[0]
        ?.body
        ?.symbol ===
        "BTC/INR" &&
      calls[0]
        ?.body
        ?.type ===
        "limit" &&
      calls[0]
        ?.body
        ?.client_order_id ===
        CLIENT_ORDER_ID &&
      calls[1]
        ?.parameters
        ?.order_id ===
        "order-1" &&
      calls[2]
        ?.body
        ?.order_id ===
        "order-1" &&
      created.status ===
        "OPEN" &&
      read.executedQuantity ===
        0.00004 &&
      read.remainingQuantity ===
        0.00006 &&
      read.createdAt ===
        1_720_000_000_000 &&
      read.updatedAt ===
        1_720_000_001_000 &&
      cancelled.status ===
        "CANCELLATION_RAISED",
    "CoinSwitch order API must implement the official LIMIT create, single-order GET, DELETE cancel, and normalized lifecycle evidence.",
  );
}

async function testExecutionLifecycle(
  credentials:
    CoinSwitchCredentials,
): Promise<void> {
  let createCalls =
    0;
  let status =
    "EXECUTED";
  let cancellationReads =
    0;
  let metrics =
    0;
  const orderApi = {
    async createSpotOrder(
      request:
        CoinSwitchCreateOrderRequest,
    ): Promise<
      CoinSwitchSpotOrder
    > {
      createCalls +=
        1;

      assertCondition(
        request.venue ===
          "coinswitchx" &&
          request.market ===
            "BTC_INR" &&
          request.price ===
            5_000_000 &&
          request.quantity ===
            0.0001 &&
          request.clientOrderId ===
            CLIENT_ORDER_ID,
        "CoinSwitch adapter must use exact signed rule venue, market, price, quantity, and idempotency UUID.",
      );

      return normalizedOrder(
        "OPEN",
      );
    },
    async getSpotOrder():
      Promise<
        CoinSwitchSpotOrder
      > {
      if (
        status ===
        "CANCELLATION_RAISED"
      ) {
        cancellationReads +=
          1;

        if (
          cancellationReads >=
          2
        ) {
          status =
            "CANCELLED";
        }
      }

      return normalizedOrder(
        status,
      );
    },
    async cancelSpotOrder():
      Promise<
        CoinSwitchSpotOrder
      > {
      status =
        "CANCELLATION_RAISED";

      return normalizedOrder(
        status,
      );
    },
  };
  const rules:
    CoinSwitchMarketRuleEvidence = {
    exchange:
      "coinswitch",
    venue:
      "coinswitchx",
    market:
      "BTC_INR",
    priceStep: 0.01,
    pricePrecision: 2,
    quantityStep:
      0.000001,
    quantityPrecision: 6,
    minimumNotional: 100,
    maximumNotional:
      1_000_000,
    source:
      "ACCOUNT_API",
    synchronizedAt: 1,
    expiresAt:
      Number.MAX_SAFE_INTEGER,
  };
  const readiness:
    LiveExecutionAdapterReadiness = {
    credentialsConfigured: true,
    authenticationVerified: true,
    exchangeApiReachable: true,
    verificationState:
      "VERIFIED",
    readOnlyVerificationFresh: true,
    lastVerifiedAt: 1,
    lastVerificationAttemptAt: 1,
    verificationExpiresAt: 2,
    verificationMethod:
      "SIGNED_FEE_READ",
    lastVerificationError: null,
  };
  let now =
    1_000;
  const adapter =
    new CoinSwitchExecutionAdapter({
      orderApi,
      credentialsSource: {
        getCredentials:
          () =>
            credentials,
        isConfigured:
          () =>
            true,
      },
      getMarketRules:
        () =>
          rules,
      createClientOrderId:
        () =>
          CLIENT_ORDER_ID,
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
              "OPEN" &&
              initialResult.clientOrderId ===
                CLIENT_ORDER_ID,
            "CoinSwitch create response must preserve OPEN state and idempotency identity before polling.",
          );

          return liveAdapter
            .getOrderStatus(
              "order-1",
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
      "coinswitch",
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
    timeoutMs: 2_000,
    pollingIntervalMs: 100,
    cancelOnTimeout: true,
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
      metrics ===
        1 &&
      adapter.getReadiness() ===
        readiness,
    "CoinSwitch adapter must preserve confirmed execution and readiness evidence without estimating fees.",
  );

  const cancelled =
    await adapter.cancelOrder(
      "order-1",
    );

  assertCondition(
    cancelled.status ===
      "CANCELLED" &&
      cancelled.cancelled &&
      cancellationReads ===
        2,
    "CoinSwitch cancellation must poll through CANCELLATION_RAISED until exchange-confirmed CANCELLED evidence.",
  );

  const marketOrder =
    await adapter.execute({
      ...request,
      orderType:
        "market",
    });
  const unquantized =
    await adapter.execute({
      ...request,
      quantity:
        0.0001005,
    });

  assertCondition(
    !marketOrder.success &&
      marketOrder.status ===
        "FAILED" &&
      !unquantized.success &&
      unquantized.status ===
        "FAILED" &&
      createCalls ===
        1,
    "Unsupported market orders and unquantized quantities must fail before CoinSwitch order submission.",
  );
}

function orderEnvelope(
  status: string,
): Record<
  string,
  unknown
> {
  const partial =
    status ===
    "PARTIALLY_EXECUTED";

  return {
    data: {
      order_id:
        "order-1",
      client_order_id:
        CLIENT_ORDER_ID,
      symbol:
        "BTC/INR",
      price:
        5_000_000,
      average_price:
        status ===
          "OPEN" ||
        status ===
          "CANCELLATION_RAISED"
          ? 0
          : 5_000_000,
      orig_qty:
        0.0001,
      executed_qty:
        partial
          ? 0.00004
          : status ===
              "EXECUTED"
            ? 0.0001
            : 0,
      status,
      side:
        "BUY",
      exchange:
        "coinswitchx",
      order_source:
        "API_TRADING",
      created_time:
        1_720_000_000_000,
      updated_time:
        1_720_000_001_000,
    },
  };
}

function normalizedOrder(
  status: string,
): CoinSwitchSpotOrder {
  const executed =
    status ===
      "EXECUTED"
      ? 0.0001
      : 0;

  return {
    orderId:
      "order-1",
    clientOrderId:
      CLIENT_ORDER_ID,
    venue:
      "coinswitchx",
    market:
      "BTC_INR",
    side:
      "buy",
    price:
      5_000_000,
    averagePrice:
      executed >
        0
        ? 5_000_000
        : 0,
    originalQuantity:
      0.0001,
    executedQuantity:
      executed,
    remainingQuantity:
      0.0001 -
      executed,
    status,
    createdAt:
      1_720_000_000_000,
    updatedAt:
      1_720_000_001_000,
  };
}

void main().catch(
  (error: unknown) => {
    console.error(
      "[CoinSwitch V22.21 Spot Execution Adapter Test]",
      error instanceof Error
        ? error.message
        : error,
    );

    process.exitCode =
      1;
  },
);
