import assert from "node:assert/strict";

import {
  BinanceOrderApi,
  type BinanceSignedOrderClient,
} from "../../../exchanges/binance/api/BinanceOrderApi";

import type {
  BinanceRequestParameters,
} from "../../../exchanges/binance/api/BinanceSigner";

async function main(): Promise<void> {
  const postCalls: Array<{
    readonly path: string;
    readonly parameters: BinanceRequestParameters;
  }> = [];
  let synchronizations = 0;

  const client: BinanceSignedOrderClient = {
    async synchronizeServerTime() {
      synchronizations += 1;
      return 0;
    },
    async postSigned<T>(path: string, parameters: BinanceRequestParameters = {}) {
      postCalls.push({path, parameters});
      return createOrderFixture(parameters) as T;
    },
    async getSigned<T>(): Promise<T> {
      throw new Error("Unexpected signed GET in Binance post-only contract test.");
    },
    async deleteSigned<T>(): Promise<T> {
      throw new Error("Unexpected signed DELETE in Binance post-only contract test.");
    },
  };

  const api = new BinanceOrderApi(client);
  await api.createOrder({
    symbol: "btcusdt",
    side: "BUY",
    type: "LIMIT_MAKER",
    quantity: 0.001,
    price: 50_000,
    clientOrderId: "cat-maker-1",
  });

  assert.equal(postCalls[0]?.parameters.type, "LIMIT_MAKER");
  assert.equal(postCalls[0]?.parameters.price, 50_000);
  assert.equal(postCalls[0]?.parameters.timeInForce, undefined);

  await api.createOrder({
    symbol: "BTCUSDT",
    side: "SELL",
    type: "LIMIT",
    quantity: 0.001,
    price: 50_100,
  });

  assert.equal(postCalls[1]?.parameters.type, "LIMIT");
  assert.equal(postCalls[1]?.parameters.timeInForce, "GTC");

  await api.createOrder({
    symbol: "BTCUSDT",
    side: "SELL",
    type: "LIMIT",
    quantity: 0.001,
    price: 50_100,
    timeInForce: "FOK",
  });

  assert.equal(postCalls[2]?.parameters.type, "LIMIT");
  assert.equal(postCalls[2]?.parameters.timeInForce, "FOK");

  await assert.rejects(
    api.createOrder({
      symbol: "BTCUSDT",
      side: "BUY",
      type: "LIMIT_MAKER",
      quantity: 0.001,
      price: 50_000,
      timeInForce: "GTC",
    }),
    /LIMIT_MAKER is maker-only/u,
  );

  assert.equal(postCalls.length, 3);
  assert.equal(synchronizations, 3);
  console.log("BINANCE POST-ONLY ORDER CONTRACT TEST PASSED.");
  console.log("LIMIT_MAKER used maker-only semantics without timeInForce; invalid combinations failed before signed I/O and no external request occurred.");
}

function createOrderFixture(parameters: BinanceRequestParameters): Record<string, unknown> {
  return {
    symbol: parameters.symbol,
    orderId: 12345,
    clientOrderId: parameters.newClientOrderId ?? "",
    transactTime: 1_780_300_000_000,
    price: String(parameters.price ?? 0),
    origQty: String(parameters.quantity ?? 0),
    executedQty: "0",
    cummulativeQuoteQty: "0",
    status: "NEW",
    timeInForce: parameters.timeInForce ?? "",
    type: parameters.type,
    side: parameters.side,
    stopPrice: "0",
    isWorking: true,
  };
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
