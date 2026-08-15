import assert from "node:assert/strict";
import type {BinanceCredentials} from "../../../exchanges/binance/api/BinanceCredentialsProvider";
import type {BinanceRequestParameters} from "../../../exchanges/binance/api/BinanceSigner";
import type {BybitCredentials} from "../../../exchanges/bybit/api/BybitCredentialsProvider";
import type {BybitSignedPostBody} from "../../../exchanges/bybit/api/BybitPrivateHttpClient";
import {liveExecutionService} from "../LiveExecutionService";
import {BinanceUsdMOrderApi, type BinanceUsdMOrderPort} from "../derivatives/BinanceUsdMOrderApi";
import {BybitLinearOrderApi, type BybitLinearOrderPort} from "../derivatives/BybitLinearOrderApi";
import type {LiveExecutionRequest} from "../models/LiveExecutionRequest";

const credentials = {apiKey: "fixture-key", apiSecret: "fixture-secret"};

async function main(): Promise<void> {
  await testBinanceOneWayAndHedgeReduceOnlyMappings();
  await testBybitLinearPositionIndexAndReduceOnlyMapping();
  await testInvalidDerivativeSemanticsFailBeforeSignedIo();
  testRuntimeProductRoutingCapabilities();
  console.log("DERIVATIVE ORDER CONTRACT TEST PASSED.");
  console.log("Binance USD-M one-way/hedge close semantics, Bybit linear positionIdx/reduceOnly payloads, exact product routing, and fail-before-signed-I/O validation passed with fixtures; no external request or order occurred.");
}

async function testBinanceOneWayAndHedgeReduceOnlyMappings(): Promise<void> {
  const posts: BinanceRequestParameters[] = [];
  const port = binancePort(posts);
  const api = new BinanceUsdMOrderApi(port, {getCredentials: () => credentials});
  const oneWay = await api.create(request("binance", "sell", "ONE_WAY", "LONG", true));
  assert.equal(posts[0]?.positionSide, "BOTH");
  assert.equal(posts[0]?.reduceOnly, true);
  assert.equal(posts[0]?.newOrderRespType, "RESULT");
  assert.equal(oneWay.reduceOnly, true);
  assert.equal(oneWay.positionMode, "ONE_WAY");

  const hedge = await api.create(request("binance", "sell", "HEDGE", "LONG", true));
  assert.equal(posts[1]?.positionSide, "LONG");
  assert.equal("reduceOnly" in (posts[1] ?? {}), false);
  assert.equal(hedge.reduceOnly, true);
  assert.equal(hedge.positionMode, "HEDGE");
  assert.equal(hedge.positionSide, "LONG");
}

async function testBybitLinearPositionIndexAndReduceOnlyMapping(): Promise<void> {
  const bodies: BybitSignedPostBody[] = [];
  const port: BybitLinearOrderPort = {
    async getSigned<T>(): Promise<T> { throw new Error("Unexpected Bybit signed GET."); },
    async postSigned<T>(_path: string, body: BybitSignedPostBody, _credentials?: BybitCredentials): Promise<T> {
      bodies.push(body); return {orderId: "bybit-linear-1", orderLinkId: "fixture-client"} as T;
    },
  };
  const api = new BybitLinearOrderApi(port, {getCredentials: () => credentials});
  const result = await api.create(request("bybit", "buy", "HEDGE", "SHORT", true));
  assert.equal(bodies[0]?.category, "linear");
  assert.equal(bodies[0]?.positionIdx, 2);
  assert.equal(bodies[0]?.reduceOnly, true);
  assert.equal(bodies[0]?.side, "Buy");
  assert.equal(result.positionSide, "SHORT");
  assert.equal(result.reduceOnly, true);
}

async function testInvalidDerivativeSemanticsFailBeforeSignedIo(): Promise<void> {
  let calls = 0;
  const port: BinanceUsdMOrderPort = {
    async getPublic<T>(): Promise<T> { calls += 1; return {serverTime: 1_780_500_000_000} as T; },
    async postSigned<T>(): Promise<T> { calls += 1; throw new Error("Signed POST must not run."); },
    async getSigned<T>(): Promise<T> { calls += 1; throw new Error("Signed GET must not run."); },
    async deleteSigned<T>(): Promise<T> { calls += 1; throw new Error("Signed DELETE must not run."); },
  };
  const api = new BinanceUsdMOrderApi(port, {getCredentials: () => credentials});
  await assert.rejects(() => api.create(request("binance", "buy", "HEDGE", "LONG", true)),
    /reduce side conflicts with LONG/u);
  await assert.rejects(() => api.create({...request("binance", "sell", "HEDGE", "LONG", true), product: "SPOT"}),
    /product=PERPETUAL/u);
  assert.equal(calls, 0);
}

function testRuntimeProductRoutingCapabilities(): void {
  for (const exchange of ["binance", "bybit"]) {
    const capabilities = liveExecutionService.getAdapter(exchange).getCapabilities();
    assert.deepEqual(capabilities.products, ["SPOT", "PERPETUAL"]);
    assert.equal(capabilities.supportsReduceOnly, true);
    assert.equal(capabilities.supportsPostOnly, true);
  }
  assert.deepEqual(liveExecutionService.getAdapter("coindcx").getCapabilities().products, ["SPOT"]);
}

function binancePort(posts: BinanceRequestParameters[]): BinanceUsdMOrderPort {
  return {
    async getPublic<T>(): Promise<T> { return {serverTime: 1_780_500_000_000} as T; },
    async postSigned<T>(_path: string, parameters: BinanceRequestParameters, _credentials: BinanceCredentials,
      _timestamp: number): Promise<T> {
      posts.push(parameters);
      return {symbol: parameters.symbol, orderId: String(posts.length), clientOrderId: parameters.newClientOrderId ?? null,
        side: parameters.side, status: "FILLED", origQty: parameters.quantity, executedQty: parameters.quantity,
        price: "0", avgPrice: "50000", cumQuote: "500", reduceOnly: parameters.reduceOnly ?? false,
        positionSide: parameters.positionSide} as T;
    },
    async getSigned<T>(): Promise<T> { throw new Error("Unexpected Binance signed GET."); },
    async deleteSigned<T>(): Promise<T> { throw new Error("Unexpected Binance signed DELETE."); },
  };
}

function request(exchange: "binance" | "bybit", side: "buy" | "sell", positionMode: "ONE_WAY" | "HEDGE",
  positionSide: "LONG" | "SHORT", reduceOnly: boolean): LiveExecutionRequest {
  return {exchange, product: "PERPETUAL", market: "BTCUSDT", side, orderType: "market", quantity: 0.01,
    reduceOnly, positionMode, positionSide, clientOrderId: "fixture-client", cancelOnTimeout: false};
}

void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
