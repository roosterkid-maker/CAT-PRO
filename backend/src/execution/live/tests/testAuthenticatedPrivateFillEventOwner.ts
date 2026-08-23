import assert from "node:assert/strict";

import {
  readFileSync,
} from "node:fs";

import {
  resolve,
} from "node:path";

import {
  AuthenticatedPrivateFillEventOwner,
  type AuthenticatedPrivateStreamSession,
} from "../fills/AuthenticatedPrivateFillEventOwner";

const now =
  1_787_000_000_000;

const account =
  "0123456789abcdef0123456789abcdef";

async function main(): Promise<void> {
  testBinanceUnknownAckOutOfOrderAndReconnect();
  testBybitExecutionOwnershipAndCancelRace();
  testCoinDCXBindingOwnedTradeWithoutPayloadSide();
  testJournalBeforeMutationAndRestartReplay();

  console.log(
    "AUTHENTICATED PRIVATE FILL EVENT OWNER TEST PASSED.",
  );
  console.log(
    "Binance/Bybit/CoinDCX SPOT fixtures proved acknowledgement-is-not-fill, exact execution-ID dedupe, CoinDCX binding-owned side resolution, delayed-fill convergence, reconnect isolation, additional-fee preservation, cancel-race monotonicity and durable replay without any order submission.",
  );
}

function testCoinDCXBindingOwnedTradeWithoutPayloadSide(): void {
  const filePath =
    resolve(
      process.cwd(),
      "coindcx-private-fills.jsonl",
    );
  const owner =
    new AuthenticatedPrivateFillEventOwner({
      filePath,
    });
  const session:
    AuthenticatedPrivateStreamSession = {
      venue:
        "coindcx",
      accountFingerprint:
        account,
      connectionId:
        "coindcx-connection-1",
      generation:
        1,
      authenticatedAt:
        now,
      expiresAt:
        now +
        60_000,
      topics: [
        "order-update",
        "trade-update",
      ],
    };

  owner.openAuthenticatedSession(
    session,
    now,
  );
  owner.registerOrder({
    lifecycleOrderId:
      "lifecycle-coindcx-buy",
    venue:
      "coindcx",
    accountFingerprint:
      account,
    market:
      "COTIUSDT",
    side:
      "buy",
    requestedQuantity:
      10,
    clientOrderId:
      "cat-coindcx-buy",
    exchangeOrderId:
      null,
    registeredAt:
      now,
  });

  const status =
    owner.ingestCoinDCXOrderMessage(
      session,
      {
        id:
          "coindcx-order-1",
        client_order_id:
          "cat-coindcx-buy",
        market:
          "COTIUSDT",
        side:
          "buy",
        total_quantity:
          "10",
        remaining_quantity:
          "10",
        avg_price:
          "0",
        status:
          "open",
        updated_at:
          now +
          10,
      },
      now +
      11,
    )[0];

  assert.equal(
    status?.outcome,
    "APPLIED",
  );
  assert.equal(
    status?.state?.filledQuantity,
    0,
  );

  const fill =
    owner.ingestCoinDCXTradeMessage(
      session,
      {
        s:
          "COTIUSDT",
        o:
          "coindcx-order-1",
        c:
          "cat-coindcx-buy",
        t:
          "coindcx-trade-1",
        p:
          "0.10",
        q:
          "10",
        f:
          "0.001",
        T:
          now +
          20,
      },
      now +
      21,
    )[0];

  assert.equal(
    fill?.outcome,
    "APPLIED",
  );
  assert.equal(
    fill?.state?.side,
    "buy",
  );
  assert.equal(
    fill?.state?.filledQuantity,
    10,
  );
  assert.equal(
    fill?.state?.fills[0]?.executionId,
    "coindcx-trade-1",
  );

  assert.throws(
    () =>
      owner.ingestCoinDCXTradeMessage(
        session,
        {
          s:
            "COTIUSDT",
          o:
            "unknown-order",
          t:
            "unknown-trade",
          p:
            "0.10",
          q:
            "1",
          f:
            "0",
          T:
            now +
            30,
        },
        now +
        31,
      ),
    /no durable CAT PRO order binding/i,
  );
}

function testBinanceUnknownAckOutOfOrderAndReconnect(): void {
  const filePath =
    resolve(
      process.cwd(),
      "binance-private-fills.jsonl",
    );
  const owner =
    new AuthenticatedPrivateFillEventOwner({
      filePath,
    });
  const firstSession =
    binanceSession(
      1,
      "binance-connection-1",
    );

  owner.openAuthenticatedSession(
    firstSession,
    now,
  );
  owner.registerOrder({
    lifecycleOrderId:
      "lifecycle-binance-buy",
    venue:
      "binance",
    accountFingerprint:
      account,
    market:
      "BTC-USDT",
    side:
      "buy",
    requestedQuantity:
      1,
    clientOrderId:
      "cat-binance-buy",
    exchangeOrderId:
      null,
    registeredAt:
      now,
  });

  const acknowledgement =
    binanceReport({
      executionType:
        "NEW",
      status:
        "NEW",
      eventAt:
        now +
        10,
      transactionAt:
        now +
        10,
      tradeId:
        -1,
      lastQuantity:
        "0",
      lastPrice:
        "0",
      lastQuote:
        "0",
      cumulativeQuantity:
        "0",
      cumulativeQuote:
        "0",
    });
  const acknowledged =
    owner.ingestBinanceExecutionReport(
      firstSession,
      acknowledgement,
      now +
        11,
    );

  assert.equal(
    acknowledged.outcome,
    "APPLIED",
  );
  assert.equal(
    acknowledged.state?.filledQuantity,
    0,
  );
  assert.equal(
    acknowledged.state?.authoritativeFillComplete,
    false,
  );
  assert.equal(
    acknowledged.state?.exchangeOrderId,
    "88001",
  );
  assert.equal(
    owner.ingestBinanceExecutionReport(
      firstSession,
      acknowledgement,
      now +
        12,
    ).outcome,
    "DUPLICATE",
  );

  const finalFillFirst =
    binanceReport({
      executionType:
        "TRADE",
      status:
        "FILLED",
      eventAt:
        now +
        40,
      transactionAt:
        now +
        39,
      tradeId:
        502,
      lastQuantity:
        "0.6",
      lastPrice:
        "101",
      lastQuote:
        "60.6",
      cumulativeQuantity:
        "1",
      cumulativeQuote:
        "100.6",
    });
  const missingEarlierFill =
    owner.ingestBinanceExecutionReport(
      firstSession,
      finalFillFirst,
      now +
        41,
    );

  assert.equal(
    missingEarlierFill.state?.status,
    "FILLED",
  );
  assert.equal(
    missingEarlierFill.state?.filledQuantity,
    0.6,
  );
  assert.equal(
    missingEarlierFill.state?.quantityReconciled,
    false,
  );
  assert.equal(
    missingEarlierFill.state?.authoritativeFillComplete,
    false,
  );

  const delayedEarlierFill =
    binanceReport({
      executionType:
        "TRADE",
      status:
        "PARTIALLY_FILLED",
      eventAt:
        now +
        20,
      transactionAt:
        now +
        19,
      tradeId:
        501,
      lastQuantity:
        "0.4",
      lastPrice:
        "100",
      lastQuote:
        "40",
      cumulativeQuantity:
        "0.4",
      cumulativeQuote:
        "40",
    });
  const converged =
    owner.ingestBinanceExecutionReport(
      firstSession,
      delayedEarlierFill,
      now +
        42,
    );

  assert.equal(
    converged.outcome,
    "APPLIED",
  );
  assert.equal(
    converged.state?.status,
    "FILLED",
  );
  assert.equal(
    converged.state?.filledQuantity,
    1,
  );
  assert.equal(
    converged.state?.averageFillPrice,
    100.6,
  );
  assert.equal(
    converged.state?.authoritativeFillComplete,
    true,
  );

  const secondSession =
    binanceSession(
      2,
      "binance-connection-2",
    );
  owner.openAuthenticatedSession(
    secondSession,
    now +
      50,
  );

  assert.equal(
    owner.ingestBinanceExecutionReport(
      firstSession,
      finalFillFirst,
      now +
        51,
    ).outcome,
    "STALE_SESSION",
  );
  assert.equal(
    owner.ingestBinanceExecutionReport(
      secondSession,
      finalFillFirst,
      now +
        52,
    ).outcome,
    "DUPLICATE",
  );

  const unknown =
    binanceReport({
      clientOrderId:
        "not-a-cat-order",
      orderId:
        99999,
      executionType:
        "NEW",
      status:
        "NEW",
      eventAt:
        now +
        60,
      transactionAt:
        now +
        60,
      tradeId:
        -1,
      lastQuantity:
        "0",
      lastPrice:
        "0",
      lastQuote:
        "0",
      cumulativeQuantity:
        "0",
      cumulativeQuote:
        "0",
    });

  assert.equal(
    owner.ingestBinanceExecutionReport(
      secondSession,
      unknown,
      now +
        61,
    ).outcome,
    "UNKNOWN_ORDER",
  );
  assert.equal(
    owner.getDiagnostics(
      now +
        61,
    ).safety.orderSubmissionAvailable,
    false,
  );
}

function testBybitExecutionOwnershipAndCancelRace(): void {
  const filePath =
    resolve(
      process.cwd(),
      "bybit-private-fills.jsonl",
    );
  const owner =
    new AuthenticatedPrivateFillEventOwner({
      filePath,
    });
  const session =
    bybitSession(
      1,
      "bybit-connection-1",
    );

  owner.openAuthenticatedSession(
    session,
    now,
  );
  owner.registerOrder({
    lifecycleOrderId:
      "lifecycle-bybit-sell",
    venue:
      "bybit",
    accountFingerprint:
      account,
    market:
      "ETHUSDT",
    side:
      "sell",
    requestedQuantity:
      1,
    clientOrderId:
      "cat-bybit-sell",
    exchangeOrderId:
      null,
    registeredAt:
      now,
  });

  const filledOrder =
    bybitOrderMessage({
      status:
        "Filled",
      updatedAt:
        now +
        40,
      cumulativeQuantity:
        "1",
      remainingQuantity:
        "0",
    });
  const statusFirst =
    owner.ingestBybitOrderMessage(
      session,
      filledOrder,
      now +
        41,
    )[0];

  assert.equal(
    statusFirst?.state?.status,
    "FILLED",
  );
  assert.equal(
    statusFirst?.state?.filledQuantity,
    0,
  );
  assert.equal(
    statusFirst?.state?.authoritativeFillComplete,
    false,
  );

  const finalExecution =
    bybitExecutionMessage({
      creationTime:
        now +
        39,
      executionId:
        "bybit-exec-2",
      executionTime:
        now +
        38,
      quantity:
        "0.6",
      price:
        "101",
      value:
        "60.6",
      remainingQuantity:
        "0",
      extraFees: [
        {
          feeCoin:
            "USDT",
          feeType:
            "GST",
          subFeeType:
            "IND_GST",
          fee:
            "0.006",
        },
      ],
    });
  const partial =
    owner.ingestBybitExecutionMessage(
      session,
      finalExecution,
      now +
        42,
    )[0];

  assert.equal(
    partial?.state?.filledQuantity,
    0.6,
  );
  assert.equal(
    partial?.state?.quantityReconciled,
    false,
  );

  const earlierExecution =
    bybitExecutionMessage({
      creationTime:
        now +
        20,
      executionId:
        "bybit-exec-1",
      executionTime:
        now +
        19,
      quantity:
        "0.4",
      price:
        "100",
      value:
        "40",
      remainingQuantity:
        "0.6",
      extraFees:
        "",
    });
  const complete =
    owner.ingestBybitExecutionMessage(
      session,
      earlierExecution,
      now +
        43,
    )[0];

  assert.equal(
    complete?.state?.filledQuantity,
    1,
  );
  assert.equal(
    complete?.state?.averageFillPrice,
    100.6,
  );
  assert.equal(
    complete?.state?.authoritativeFillComplete,
    true,
  );
  assert.deepEqual(
    complete?.state?.fees,
    [
      {
        asset:
          "USDT",
        amount:
          0.006,
        kind:
          "ADDITIONAL",
      },
      {
        asset:
          "USDT",
        amount:
          0.1,
        kind:
          "TRADING",
      },
    ],
  );

  const cancelRace =
    bybitOrderMessage({
      status:
        "Filled",
      updatedAt:
        now +
        41,
      cumulativeQuantity:
        "1",
      remainingQuantity:
        "0",
      cancelType:
        "CancelByUser",
      rejectReason:
        "EC_OrigClOrdIDDoesNotExist",
    });

  assert.equal(
    owner.ingestBybitOrderMessage(
      session,
      cancelRace,
      now +
        44,
    )[0]?.state?.status,
    "FILLED",
  );

  const oldOpen =
    bybitOrderMessage({
      status:
        "New",
      updatedAt:
        now +
        5,
      cumulativeQuantity:
        "0",
      remainingQuantity:
        "1",
    });

  assert.equal(
    owner.ingestBybitOrderMessage(
      session,
      oldOpen,
      now +
        45,
    )[0]?.outcome,
    "OUT_OF_ORDER_IGNORED",
  );
  assert.equal(
    owner.getOrder(
      "lifecycle-bybit-sell",
    )?.status,
    "FILLED",
  );
}

function testJournalBeforeMutationAndRestartReplay(): void {
  const filePath =
    resolve(
      process.cwd(),
      "restart-private-fills.jsonl",
    );
  const owner =
    new AuthenticatedPrivateFillEventOwner({
      filePath,
      maximumJournalRecords:
        2,
    });
  const session =
    binanceSession(
      1,
      "restart-connection-1",
    );

  owner.openAuthenticatedSession(
    session,
    now,
  );
  owner.registerOrder({
    lifecycleOrderId:
      "restart-order",
    venue:
      "binance",
    accountFingerprint:
      account,
    market:
      "BTCUSDT",
    side:
      "buy",
    requestedQuantity:
      1,
    clientOrderId:
      "restart-client-order",
    exchangeOrderId:
      "88001",
    registeredAt:
      now,
  });

  owner.ingestBinanceExecutionReport(
    session,
    binanceReport({
      clientOrderId:
        "restart-client-order",
      executionType:
        "TRADE",
      status:
        "PARTIALLY_FILLED",
      eventAt:
        now +
        10,
      transactionAt:
        now +
        10,
      tradeId:
        700,
      lastQuantity:
        "0.4",
      lastPrice:
        "100",
      lastQuote:
        "40",
      cumulativeQuantity:
        "0.4",
      cumulativeQuote:
        "40",
    }),
    now +
      11,
  );

  assert.throws(
    () =>
      owner.ingestBinanceExecutionReport(
        session,
        binanceReport({
          clientOrderId:
            "restart-client-order",
          executionType:
            "TRADE",
          status:
            "FILLED",
          eventAt:
            now +
            20,
          transactionAt:
            now +
            20,
          tradeId:
            701,
          lastQuantity:
            "0.6",
          lastPrice:
            "101",
          lastQuote:
            "60.6",
          cumulativeQuantity:
            "1",
          cumulativeQuote:
            "100.6",
        }),
        now +
          21,
      ),
    /capacity is exhausted/u,
  );
  assert.equal(
    owner.getOrder(
      "restart-order",
    )?.filledQuantity,
    0.4,
  );
  assert.equal(
    readFileSync(
      filePath,
      "utf8",
    )
      .trim()
      .split(
        /\r?\n/u,
      ).length,
    2,
  );

  const replayed =
    new AuthenticatedPrivateFillEventOwner({
      filePath,
    });

  assert.equal(
    replayed.getOrder(
      "restart-order",
    )?.filledQuantity,
    0.4,
  );
  assert.equal(
    replayed.getDiagnostics(
      now +
        30,
    ).activeSessions,
    0,
  );
  assert.equal(
    replayed.isVenueReady(
      "binance",
      now +
        30,
    ),
    false,
  );
}

function binanceSession(
  generation: number,
  connectionId: string,
): AuthenticatedPrivateStreamSession {
  return {
    venue:
      "binance",
    accountFingerprint:
      account,
    connectionId,
    generation,
    authenticatedAt:
      now +
      (
        generation -
        1
      ) *
        50,
    expiresAt:
      now +
      60_000,
    topics: [
      "executionReport",
    ],
  };
}

function bybitSession(
  generation: number,
  connectionId: string,
): AuthenticatedPrivateStreamSession {
  return {
    venue:
      "bybit",
    accountFingerprint:
      account,
    connectionId,
    generation,
    authenticatedAt:
      now,
    expiresAt:
      now +
      60_000,
    topics: [
      "execution.spot",
      "order.spot",
    ],
  };
}

interface BinanceReportOverrides {
  readonly clientOrderId?: string;
  readonly orderId?: number;
  readonly executionType: string;
  readonly status: string;
  readonly eventAt: number;
  readonly transactionAt: number;
  readonly tradeId: number;
  readonly lastQuantity: string;
  readonly lastPrice: string;
  readonly lastQuote: string;
  readonly cumulativeQuantity: string;
  readonly cumulativeQuote: string;
}

function binanceReport(
  input:
    BinanceReportOverrides,
) {
  return {
    e:
      "executionReport",
    E:
      input.eventAt,
    s:
      "BTCUSDT",
    c:
      input.clientOrderId ??
      "cat-binance-buy",
    S:
      "BUY",
    q:
      "1",
    x:
      input.executionType,
    X:
      input.status,
    i:
      input.orderId ??
      88001,
    l:
      input.lastQuantity,
    z:
      input.cumulativeQuantity,
    L:
      input.lastPrice,
    Y:
      input.lastQuote,
    Z:
      input.cumulativeQuote,
    n:
      input.executionType ===
        "TRADE"
        ? "0.05"
        : "0",
    N:
      input.executionType ===
        "TRADE"
        ? "USDT"
        : null,
    T:
      input.transactionAt,
    t:
      input.tradeId,
    m:
      false,
  };
}

interface BybitExecutionOverrides {
  readonly creationTime: number;
  readonly executionId: string;
  readonly executionTime: number;
  readonly quantity: string;
  readonly price: string;
  readonly value: string;
  readonly remainingQuantity: string;
  readonly extraFees: unknown;
}

function bybitExecutionMessage(
  input:
    BybitExecutionOverrides,
) {
  return {
    topic:
      "execution.spot",
    creationTime:
      input.creationTime,
    data: [
      {
        category:
          "spot",
        symbol:
          "ETHUSDT",
        orderId:
          "bybit-order-1",
        orderLinkId:
          "cat-bybit-sell",
        side:
          "Sell",
        leavesQty:
          input.remainingQuantity,
        execFee:
          "0.05",
        feeCurrency:
          "USDT",
        execId:
          input.executionId,
        execPrice:
          input.price,
        execQty:
          input.quantity,
        execValue:
          input.value,
        execTime:
          String(
            input.executionTime,
          ),
        execType:
          "Trade",
        isMaker:
          false,
        extraFees:
          input.extraFees,
      },
    ],
  };
}

interface BybitOrderOverrides {
  readonly status: string;
  readonly updatedAt: number;
  readonly cumulativeQuantity: string;
  readonly remainingQuantity: string;
  readonly cancelType?: string;
  readonly rejectReason?: string;
}

function bybitOrderMessage(
  input:
    BybitOrderOverrides,
) {
  return {
    topic:
      "order.spot",
    creationTime:
      input.updatedAt +
      1,
    data: [
      {
        category:
          "spot",
        symbol:
          "ETHUSDT",
        orderId:
          "bybit-order-1",
        orderLinkId:
          "cat-bybit-sell",
        side:
          "Sell",
        orderStatus:
          input.status,
        cumExecQty:
          input.cumulativeQuantity,
        leavesQty:
          input.remainingQuantity,
        avgPrice:
          input.cumulativeQuantity ===
            "0"
            ? ""
            : "100.6",
        updatedTime:
          String(
            input.updatedAt,
          ),
        cancelType:
          input.cancelType ??
          "UNKNOWN",
        rejectReason:
          input.rejectReason ??
          "EC_NoError",
      },
    ],
  };
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
