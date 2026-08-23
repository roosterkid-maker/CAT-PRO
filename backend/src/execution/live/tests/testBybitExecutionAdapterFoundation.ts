import {
  createHmac,
} from "node:crypto";

import type {
  AxiosInstance,
} from "axios";

import {
  BybitOrderApi,
  type BybitCreateSpotOrderRequest,
  type BybitOrderAcknowledgement,
  type BybitSignedOrderClient,
  type BybitSpotOrder,
} from "../../../exchanges/bybit/api/BybitOrderApi";

import {
  BybitPrivateHttpClient,
  type BybitSignedPostBody,
} from "../../../exchanges/bybit/api/BybitPrivateHttpClient";

import type {
  BybitCredentials,
} from "../../../exchanges/bybit/api/BybitCredentialsProvider";

import {
  BybitExecutionAdapter,
} from "../adapters/BybitExecutionAdapter";

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
  await testExactSignedPostBody();
  await testOfficialSpotOrderContract();
  await testExecutionAdapterLifecycle();

  console.log(
    "BYBIT V5 LIVE ADAPTER FOUNDATION TEST PASSED.",
  );

  console.log(
    "Only isolated signed fixtures were used; no external request, account mutation, capital reservation, LIVE enablement, or exchange order occurred.",
  );
}

async function testExactSignedPostBody():
  Promise<void> {
  const credentials:
    BybitCredentials = {
    apiKey:
      "synthetic-bybit-key",
    apiSecret:
      "synthetic-bybit-secret",
  };
  let postedPath =
    "";
  let postedBody =
    "";
  let postedHeaders:
    Record<
      string,
      string
    > = {};
  const transport = {
    async get(
      path: string,
    ) {
      assertCondition(
        path ===
          "/v5/market/time",
        "Signed POST must synchronize against Bybit server time first.",
      );

      return {
        data: {
          retCode: 0,
          retMsg:
            "OK",
          time:
            Date.now(),
          result: {},
        },
      };
    },
    async post(
      path: string,
      body: string,
      config: {
        headers:
          Record<
            string,
            string
          >;
      },
    ) {
      postedPath =
        path;
      postedBody =
        body;
      postedHeaders =
        config.headers;

      return {
        data: {
          retCode: 0,
          retMsg:
            "OK",
          result: {
            orderId:
              "signed-order-1",
          },
        },
      };
    },
  } as unknown as
    AxiosInstance;
  const client =
    new BybitPrivateHttpClient(
      transport,
    );
  const body:
    BybitSignedPostBody = {
    category:
      "spot",
    symbol:
      "BTCUSDT",
    side:
      "Buy",
    orderType:
      "Limit",
    qty:
      "0.001",
    price:
      "50000",
  };

  await client.postSigned(
    "/v5/order/create",
    body,
    credentials,
  );

  const timestamp =
    postedHeaders[
      "X-BAPI-TIMESTAMP"
    ];
  const receiveWindow =
    postedHeaders[
      "X-BAPI-RECV-WINDOW"
    ];
  const expectedSignature =
    createHmac(
      "sha256",
      credentials.apiSecret,
    )
      .update(
        `${timestamp}${credentials.apiKey}${receiveWindow}${postedBody}`,
      )
      .digest(
        "hex",
      );

  assertCondition(
    postedPath ===
      "/v5/order/create" &&
      postedBody ===
        JSON.stringify(
          body,
        ) &&
      postedHeaders[
        "X-BAPI-API-KEY"
      ] ===
        credentials.apiKey &&
      postedHeaders[
        "Content-Type"
      ] ===
        "application/json" &&
      postedHeaders[
        "X-BAPI-SIGN"
      ] ===
        expectedSignature,
    "Bybit signed POST must transmit the exact JSON bytes used by the HMAC payload.",
  );
}

async function testOfficialSpotOrderContract():
  Promise<void> {
  const postCalls:
    Array<{
      path: string;
      body:
        BybitSignedPostBody;
    }> = [];
  const getCalls:
    Array<{
      path: string;
      parameters:
        Record<
          string,
          string
        >;
    }> = [];
  const client:
    BybitSignedOrderClient = {
    async postSigned<T>(
      path: string,
      body:
        BybitSignedPostBody,
    ): Promise<T> {
      postCalls.push({
        path,
        body,
      });

      return {
        orderId:
          "order-123",
        orderLinkId:
          "cat-pro-123",
      } as T;
    },
    async getSigned<T>(
      path: string,
      parameters:
        Record<
          string,
          string
        > = {},
    ): Promise<T> {
      getCalls.push({
        path,
        parameters,
      });

      if (
        path ===
        "/v5/order/realtime"
      ) {
        return {
          list: [],
        } as T;
      }

      return {
        list: [
          createOrderFixture(
            "Filled",
          ),
        ],
      } as T;
    },
  };
  const api =
    new BybitOrderApi(
      client,
    );

  await api.createSpotOrder({
    symbol:
      "btcusdt",
    side:
      "Buy",
    orderType:
      "Market",
    quantity:
      0.001,
    clientOrderId:
      "cat-pro-123",
  });

  const marketBody =
    postCalls[0]
      ?.body;

  assertCondition(
    postCalls[0]
      ?.path ===
      "/v5/order/create" &&
      marketBody
        ?.category ===
        "spot" &&
      marketBody
        ?.symbol ===
        "BTCUSDT" &&
      marketBody
        ?.marketUnit ===
        "baseCoin" &&
      marketBody
        ?.timeInForce ===
        "IOC" &&
      marketBody
        ?.isLeverage ===
        0,
    "Bybit spot market BUY must explicitly use baseCoin quantity, IOC, and no leverage.",
  );

  await api.createSpotOrder({
    symbol:
      "BTCUSDT",
    side:
      "Sell",
    orderType:
      "Limit",
    quantity:
      0.002,
    price:
      50_000,
  });

  const limitBody =
    postCalls[1]
      ?.body;

  assertCondition(
    limitBody
      ?.price ===
        "50000" &&
      limitBody
        ?.timeInForce ===
        "GTC" &&
      limitBody
        ?.marketUnit ===
        undefined,
    "Bybit limit order must include positive decimal price and GTC without market-unit ambiguity.",
  );

  await api.createSpotOrder({
    symbol:
      "BTCUSDT",
    side:
      "Sell",
    orderType:
      "Limit",
    quantity:
      0.002,
    price:
      50_000,
    timeInForce:
      "FOK",
  });

  assertCondition(
    postCalls[2]
      ?.body
      .timeInForce ===
      "FOK",
    "Bybit explicit FOK must survive the audited order API mapping without a GTC fallback.",
  );

  await api.createSpotOrder({
    symbol:
      "BTCUSDT",
    side:
      "Buy",
    orderType:
      "Limit",
    quantity:
      0.001,
    price:
      49_999,
    postOnly:
      true,
  });

  assertCondition(
    postCalls[3]
      ?.body
      .timeInForce ===
      "PostOnly",
    "Bybit post-only limit orders must use the official PostOnly time-in-force contract.",
  );

  const order =
    await api.getSpotOrder(
      "BTCUSDT",
      "order-123",
    );

  assertCondition(
    getCalls.length ===
      2 &&
      getCalls[0]
        ?.path ===
        "/v5/order/realtime" &&
      getCalls[1]
        ?.path ===
        "/v5/order/history" &&
      order.status ===
        "Filled" &&
      order.filledQuantity ===
        0.001 &&
      order.averageFillPrice ===
        50_000 &&
      order.feeAmount ===
        0.01,
    "Bybit order read must fall back from realtime to history and normalize exact fill evidence.",
  );

  await api.cancelSpotOrder(
    "BTCUSDT",
    "order-123",
  );

  assertCondition(
    postCalls[4]
      ?.path ===
      "/v5/order/cancel" &&
      postCalls[4]
        ?.body
        .orderId ===
        "order-123" &&
      postCalls[4]
        ?.body
        .orderFilter ===
        "Order",
    "Bybit cancellation must use the official V5 spot endpoint and exact order identity.",
  );

  let invalidLimitBlocked =
    false;

  try {
    await api.createSpotOrder({
      symbol:
        "BTCUSDT",
      side:
        "Buy",
      orderType:
        "Limit",
      quantity:
        0.001,
    });
  } catch {
    invalidLimitBlocked =
      true;
  }

  assertCondition(
    invalidLimitBlocked &&
      postCalls.length ===
        5,
    "Invalid Bybit limit orders must fail before any signed request is attempted.",
  );
}

async function testExecutionAdapterLifecycle():
  Promise<void> {
  const credentials:
    BybitCredentials = {
    apiKey:
      "fixture-key",
    apiSecret:
      "fixture-secret",
  };
  let createCalls =
    0;
  let cancellationRequested =
    false;
  let recordedMetrics =
    0;
  let auditEvents =
    0;
  let clock =
    1_000;
  const orderApi = {
    async createSpotOrder(
      request:
        BybitCreateSpotOrderRequest,
    ): Promise<
      BybitOrderAcknowledgement
    > {
      createCalls +=
        1;

      assertCondition(
        request.symbol ===
          "BTCUSDT" &&
          request.side ===
            "Buy" &&
          request.orderType ===
            "Limit" &&
          request.quantity ===
            0.001 &&
          request.price ===
            50_000 &&
          request.postOnly ===
            true,
        "Bybit adapter must map the canonical post-only execution request without changing quantity or price.",
      );

      return {
        orderId:
          "adapter-order-1",
        clientOrderId:
          request.clientOrderId ??
          null,
      };
    },
    async getSpotOrder():
      Promise<BybitSpotOrder> {
      return cancellationRequested
        ? createNormalizedOrder(
            "PartiallyFilledCanceled",
          )
        : createNormalizedOrder(
            "Filled",
          );
    },
    async cancelSpotOrder():
      Promise<
        BybitOrderAcknowledgement
      > {
      cancellationRequested =
        true;

      return {
        orderId:
          "adapter-order-1",
        clientOrderId:
          "cat-adapter-1",
      };
    },
  };
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
      2,
    verificationMethod:
      "SIGNED_BALANCE_READ",
    lastVerificationError:
      null,
  };
  const adapter =
    new BybitExecutionAdapter({
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
              initialResult.orderId ===
                "adapter-order-1" &&
              !initialResult.success,
            "Bybit create acknowledgement must remain PENDING until a signed order read confirms final state.",
          );

          return liveAdapter
            .getOrderStatus(
              "adapter-order-1",
              "BTCUSDT",
            );
        },
      },
      audit: {
        async executionStarted() {
          auditEvents +=
            1;
        },
        async orderCreated() {
          auditEvents +=
            1;
        },
        async executionFailed() {
          auditEvents +=
            1;
        },
      },
      metrics: {
        record() {
          recordedMetrics +=
            1;
        },
      },
      verificationSource: {
        getReadiness:
          () =>
            readiness,
      },
      now:
        () => {
          clock +=
            5;

          return clock;
        },
    });
  const request:
    LiveExecutionRequest = {
    exchange:
      "bybit",
    market:
      "btcusdt",
    side:
      "buy",
    orderType:
      "limit",
    quantity:
      0.001,
    price:
      50_000,
    postOnly:
      true,
    clientOrderId:
      "cat-adapter-1",
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
        50_000 &&
      filled.feeAmount ===
        0.01 &&
      createCalls ===
        1 &&
      recordedMetrics ===
        1 &&
      auditEvents ===
        2 &&
      adapter.getReadiness() ===
        readiness &&
      adapter.getCapabilities()
        .supportsPostOnly,
    "Bybit adapter must preserve signed fill evidence, metrics, audit, and readiness state.",
  );

  const cancelled =
    await adapter.cancelOrder(
      "adapter-order-1",
      "BTCUSDT",
    );

  assertCondition(
    cancelled.status ===
      "CANCELLED" &&
      cancelled.cancelled &&
      cancelled.filledQuantity ===
        0.0004 &&
      cancelled.remainingQuantity ===
        0.0006,
    "Bybit cancellation must retain partial-fill evidence and require confirmed final cancellation state.",
  );

  const invalid =
    await adapter.execute({
      ...request,
      quantity: 0,
    });

  assertCondition(
    !invalid.success &&
      invalid.status ===
        "FAILED" &&
      createCalls ===
        1,
    "Invalid Bybit execution requests must fail before the order API is called.",
  );
}

function createOrderFixture(
  status: string,
): Record<
  string,
  unknown
> {
  return {
    orderId:
      "order-123",
    orderLinkId:
      "cat-pro-123",
    symbol:
      "BTCUSDT",
    side:
      "Buy",
    orderType:
      "Limit",
    orderStatus:
      status,
    qty:
      "0.001",
    price:
      "50000",
    cumExecQty:
      "0.001",
    leavesQty:
      "0",
    cumExecValue:
      "50",
    avgPrice:
      "50000",
    cumExecFee:
      "0.01",
    rejectReason:
      "EC_NoError",
  };
}

function createNormalizedOrder(
  status: string,
): BybitSpotOrder {
  const cancelled =
    status ===
    "PartiallyFilledCanceled";

  return {
    orderId:
      "adapter-order-1",
    clientOrderId:
      "cat-adapter-1",
    symbol:
      "BTCUSDT",
    side:
      "Buy",
    orderType:
      "Limit",
    status,
    quantity:
      0.001,
    price:
      50_000,
    filledQuantity:
      cancelled
        ? 0.0004
        : 0.001,
    remainingQuantity:
      cancelled
        ? 0.0006
        : 0,
    cumulativeQuoteQuantity:
      cancelled
        ? 20
        : 50,
    averageFillPrice:
      50_000,
    feeAmount:
      cancelled
        ? 0.004
        : 0.01,
    rejectReason: null,
  };
}

void main().catch(
  (error: unknown) => {
    console.error(
      "[Bybit V5 LIVE Adapter Foundation Test]",
      error instanceof Error
        ? error.message
        : error,
    );

    process.exitCode =
      1;
  },
);
