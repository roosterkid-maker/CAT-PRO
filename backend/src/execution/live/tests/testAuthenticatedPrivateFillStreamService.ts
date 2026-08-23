import assert from "node:assert/strict";

import {
  createHash,
  createHmac,
} from "node:crypto";

import {
  resolve,
} from "node:path";

import type {
  OrderFillFeeSource,
  VenueOrderFill,
} from "../evidence/OrderFillFeeEvidenceService";

import {
  AuthenticatedPrivateFillEventOwner,
} from "../fills/AuthenticatedPrivateFillEventOwner";

import {
  AuthenticatedPrivateFillStreamService,
  type PrivateStreamSocket,
  type PrivateStreamSocketFactory,
} from "../fills/AuthenticatedPrivateFillStreamService";

const now =
  1_787_100_000_000;

const binanceCredentials = {
  apiKey:
    "fixture-binance-key",
  apiSecret:
    "fixture-binance-secret",
};

const bybitCredentials = {
  apiKey:
    "fixture-bybit-key",
  apiSecret:
    "fixture-bybit-secret",
};

async function main(): Promise<void> {
  const owner =
    new AuthenticatedPrivateFillEventOwner({
      filePath:
        resolve(
          process.cwd(),
          "v105-private-stream-owner.jsonl",
        ),
    });
  const binanceAccount =
    fingerprint(
      binanceCredentials.apiKey,
    );
  const bybitAccount =
    fingerprint(
      bybitCredentials.apiKey,
    );

  owner.registerOrder({
    lifecycleOrderId:
      "v105-binance-order",
    venue:
      "binance",
    accountFingerprint:
      binanceAccount,
    market:
      "BTCUSDT",
    side:
      "buy",
    requestedQuantity:
      1,
    clientOrderId:
      "cat-v105-binance",
    exchangeOrderId:
      null,
    registeredAt:
      now,
  });
  owner.attachExchangeOrderId(
    "v105-binance-order",
    "501",
    now +
      1,
  );
  owner.registerOrder({
    lifecycleOrderId:
      "v105-bybit-order",
    venue:
      "bybit",
    accountFingerprint:
      bybitAccount,
    market:
      "ETHUSDT",
    side:
      "sell",
    requestedQuantity:
      2,
    clientOrderId:
      "cat-v105-bybit",
    exchangeOrderId:
      "bybit-501",
    registeredAt:
      now,
  });

  const sockets =
    new FixtureSocketFactory();
  const service =
    new AuthenticatedPrivateFillStreamService(
      {
        enabled:
          true,
        binanceUrl:
          "wss://fixture.binance/ws-api/v3",
        bybitUrl:
          "wss://fixture.bybit/v5/private",
        reconnectBaseDelayMs:
          10_000,
        reconnectMaximumDelayMs:
          10_000,
      },
      sockets,
      owner,
      credentials(
        binanceCredentials,
      ),
      credentials(
        bybitCredentials,
      ),
      [
        backfillSource(
          "binance",
          [
            fill({
              exchange:
                "binance",
              market:
                "BTCUSDT",
              orderId:
                "501",
              executionId:
                "binance-backfill-1",
              quantity:
                0.4,
              price:
                100,
              executedAt:
                now,
            }),
          ],
        ),
        backfillSource(
          "bybit",
          [
            fill({
              exchange:
                "bybit",
              market:
                "ETHUSDT",
              orderId:
                "bybit-501",
              executionId:
                "bybit-backfill-1",
              quantity:
                1,
              price:
                200,
              executedAt:
                now,
            }),
          ],
        ),
      ],
      () =>
        now +
        100,
    );

  service.start();

  const binanceSocket =
    sockets.require(
      "binance",
    );
  const bybitSocket =
    sockets.require(
      "bybit",
    );

  binanceSocket.open();
  bybitSocket.open();

  const binanceAuth =
    binanceSocket.sent.at(
      -1,
    ) as Record<string, unknown>;
  assert.equal(
    binanceAuth.method,
    "userDataStream.subscribe.signature",
  );
  const binanceParameters =
    binanceAuth.params as Record<string, unknown>;
  const expectedBinanceSignature =
    createHmac(
      "sha256",
      binanceCredentials.apiSecret,
    )
      .update(
        `apiKey=${binanceCredentials.apiKey}&recvWindow=5000&timestamp=${now + 100}`,
      )
      .digest(
        "hex",
      );
  assert.equal(
    binanceParameters.signature,
    expectedBinanceSignature,
  );

  const bybitAuth =
    bybitSocket.sent.at(
      -1,
    ) as Record<string, unknown>;
  assert.equal(
    bybitAuth.op,
    "auth",
  );
  const bybitArguments =
    bybitAuth.args as readonly unknown[];
  assert.equal(
    bybitArguments[0],
    bybitCredentials.apiKey,
  );
  assert.equal(
    bybitArguments[2],
    createHmac(
      "sha256",
      bybitCredentials.apiSecret,
    )
      .update(
        `GET/realtime${Number(bybitArguments[1])}`,
      )
      .digest(
        "hex",
      ),
  );

  binanceSocket.message({
    id:
      binanceAuth.id,
    status:
      200,
    result: {
      subscriptionId:
        7,
    },
  });
  bybitSocket.message({
    req_id:
      bybitAuth.req_id,
    op:
      "auth",
    success:
      true,
    conn_id:
      "fixture-bybit-connection",
  });
  await settle();

  const bybitSubscribe =
    bybitSocket.sent.at(
      -1,
    ) as Record<string, unknown>;
  assert.equal(
    bybitSubscribe.op,
    "subscribe",
  );
  assert.deepEqual(
    bybitSubscribe.args,
    [
      "execution.spot",
      "order.spot",
    ],
  );
  bybitSocket.message({
    req_id:
      bybitSubscribe.req_id,
    op:
      "subscribe",
    success:
      true,
    conn_id:
      "fixture-bybit-connection",
  });
  await settle();

  assert.equal(
    owner.isVenueReady(
      "binance",
      now +
        101,
    ),
    true,
  );
  assert.equal(
    owner.isVenueReady(
      "bybit",
      now +
        101,
    ),
    true,
  );
  assert.equal(
    owner.getOrder(
      "v105-binance-order",
    )?.filledQuantity,
    0.4,
  );
  assert.equal(
    owner.getOrder(
      "v105-bybit-order",
    )?.filledQuantity,
    1,
  );

  binanceSocket.message({
    subscriptionId:
      7,
    event:
      binanceExecutionReport(),
  });
  bybitSocket.message(
    bybitExecutionMessage(),
  );
  bybitSocket.message(
    bybitOrderMessage(),
  );
  await settle();

  assert.equal(
    owner.getOrder(
      "v105-binance-order",
    )?.authoritativeFillComplete,
    true,
  );
  assert.equal(
    owner.getOrder(
      "v105-bybit-order",
    )?.authoritativeFillComplete,
    true,
  );

  const diagnostics =
    service.getDiagnostics(
      now +
        101,
    );
  assert.equal(
    diagnostics.venues.binance.ready,
    true,
  );
  assert.equal(
    diagnostics.venues.bybit.ready,
    true,
  );
  assert.equal(
    diagnostics.venues.binance.lastBackfillOrders,
    1,
  );
  assert.equal(
    diagnostics.safety.orderSubmissionAvailable,
    false,
  );
  assert.equal(
    JSON.stringify(
      diagnostics,
    ).includes(
      "fixture-binance-secret",
    ),
    false,
  );

  binanceSocket.closeFromServer();
  assert.equal(
    owner.isVenueReady(
      "binance",
      now +
        101,
    ),
    false,
  );
  assert.equal(
    service.getDiagnostics(
      now +
        101,
    ).venues.binance.phase,
    "BACKOFF",
  );

  service.stop();
  assert.equal(
    owner.isVenueReady(
      "bybit",
      now +
        101,
    ),
    false,
  );

  const restored =
    new AuthenticatedPrivateFillEventOwner({
      filePath:
        resolve(
          process.cwd(),
          "v105-private-stream-owner.jsonl",
        ),
    });
  assert.equal(
    restored.getOrder(
      "v105-binance-order",
    )?.exchangeOrderId,
    "501",
  );
  assert.equal(
    restored.getOrder(
      "v105-binance-order",
    )?.authoritativeFillComplete,
    true,
  );

  console.log(
    "AUTHENTICATED PRIVATE FILL STREAM SERVICE TEST PASSED.",
  );
  console.log(
    "Binance signature subscription, Bybit auth/topic ACK, bounded signed-REST backfill, durable exchange-order binding, live fill convergence and immediate disconnect revocation were proven without order submission.",
  );
}

class FixtureSocketFactory
  implements PrivateStreamSocketFactory
{
  private readonly sockets =
    new Map<
      "binance" | "bybit",
      FixtureSocket
    >();

  connect(
    url: string,
    handlers:
      Parameters<PrivateStreamSocketFactory["connect"]>[1],
  ): PrivateStreamSocket {
    const venue =
      url.includes(
        "binance",
      )
        ? "binance" as const
        : "bybit" as const;
    const socket =
      new FixtureSocket(
        handlers,
      );
    this.sockets.set(
      venue,
      socket,
    );
    return socket;
  }

  require(
    venue:
      "binance" | "bybit",
  ): FixtureSocket {
    const socket =
      this.sockets.get(
        venue,
      );
    assert.ok(
      socket,
    );
    return socket;
  }
}

class FixtureSocket
  implements PrivateStreamSocket
{
  readonly sent:
    unknown[] = [];

  constructor(
    private readonly handlers:
      Parameters<PrivateStreamSocketFactory["connect"]>[1],
  ) {}

  open(): void {
    this.handlers.onOpen();
  }

  message(
    value: unknown,
  ): void {
    this.handlers.onMessage(
      JSON.stringify(
        value,
      ),
    );
  }

  closeFromServer(): void {
    this.handlers.onClose(
      1006,
      "fixture disconnect",
    );
  }

  sendText(
    value: string,
  ): void {
    this.sent.push(
      JSON.parse(
        value,
      ),
    );
  }

  sendPong(
    _value: Buffer,
  ): void {}

  close(): void {}

  terminate(): void {}
}

function credentials<Credentials>(
  value: Credentials,
) {
  return {
    isConfigured:
      () =>
        true,
    getCredentials:
      () =>
        value,
  };
}

function backfillSource(
  exchange: "binance" | "bybit",
  fills:
    readonly VenueOrderFill[],
): OrderFillFeeSource {
  return {
    exchange,
    product:
      "SPOT",
    source:
      exchange ===
        "binance"
        ? "BINANCE_ACCOUNT_TRADES"
        : "BYBIT_EXECUTION_HISTORY",
    getFills:
      async (
        market,
        orderId,
      ) =>
        fills.filter(
          (fill) =>
            fill.market ===
              market &&
            fill.orderId ===
              orderId,
        ),
  };
}

function fill(
  input: {
    exchange: "binance" | "bybit";
    market: string;
    orderId: string;
    executionId: string;
    quantity: number;
    price: number;
    executedAt: number;
  },
): VenueOrderFill {
  return {
    ...input,
    product:
      "SPOT",
    quoteQuantity:
      input.quantity *
      input.price,
    feeAsset:
      "USDT",
    feeAmount:
      0.01,
    maker:
      false,
    additionalFeeMetadataPresent:
      false,
  };
}

function binanceExecutionReport() {
  return {
    e:
      "executionReport",
    E:
      now +
      100,
    s:
      "BTCUSDT",
    c:
      "cat-v105-binance",
    S:
      "BUY",
    q:
      "1",
    x:
      "TRADE",
    X:
      "FILLED",
    i:
      501,
    l:
      "0.6",
    z:
      "1",
    L:
      "101",
    Y:
      "60.6",
    Z:
      "100.6",
    n:
      "0.01",
    N:
      "USDT",
    T:
      now +
      100,
    t:
      9002,
    m:
      false,
  };
}

function bybitExecutionMessage() {
  return {
    topic:
      "execution.spot",
    creationTime:
      now +
      100,
    data: [
      {
        category:
          "spot",
        symbol:
          "ETHUSDT",
        orderId:
          "bybit-501",
        orderLinkId:
          "cat-v105-bybit",
        side:
          "Sell",
        leavesQty:
          "0",
        execFee:
          "0.01",
        feeCurrency:
          "USDT",
        execId:
          "bybit-live-2",
        execPrice:
          "201",
        execQty:
          "1",
        execValue:
          "201",
        execTime:
          String(
            now +
            100,
          ),
        execType:
          "Trade",
        isMaker:
          false,
        extraFees: [],
      },
    ],
  };
}

function bybitOrderMessage() {
  return {
    topic:
      "order.spot",
    creationTime:
      now +
      101,
    data: [
      {
        category:
          "spot",
        symbol:
          "ETHUSDT",
        orderId:
          "bybit-501",
        orderLinkId:
          "cat-v105-bybit",
        side:
          "Sell",
        orderStatus:
          "Filled",
        cumExecQty:
          "2",
        leavesQty:
          "0",
        avgPrice:
          "200.5",
        updatedTime:
          String(
            now +
            101,
          ),
        cancelType:
          "UNKNOWN",
        rejectReason:
          "EC_NoError",
      },
    ],
  };
}

function fingerprint(
  apiKey: string,
): string {
  return createHash(
    "sha256",
  )
    .update(
      apiKey,
    )
    .digest(
      "hex",
    );
}

async function settle(): Promise<void> {
  await new Promise<void>(
    (resolvePromise) =>
      setImmediate(
        resolvePromise,
      ),
  );
  await new Promise<void>(
    (resolvePromise) =>
      setImmediate(
        resolvePromise,
      ),
  );
}

void main().catch(
  (error: unknown) => {
    console.error(
      error,
    );
    process.exitCode =
      1;
  },
);
