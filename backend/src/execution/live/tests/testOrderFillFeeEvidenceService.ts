import assert from "node:assert/strict";
import type {BinanceCredentials} from "../../../exchanges/binance/api/BinanceCredentialsProvider";
import type {BybitCredentials} from "../../../exchanges/bybit/api/BybitCredentialsProvider";
import type {CoinDCXCredentials} from "../../../exchanges/coindcx/api/CoinDCXHttpClient";
import type {BinanceRequestParameters} from "../../../exchanges/binance/api/BinanceSigner";
import type {BinanceUsdMOrderPort} from "../derivatives/BinanceUsdMOrderApi";
import {
  BinanceSpotOrderFillFeeSource,
  BinanceUsdMOrderFillFeeSource,
  BybitOrderFillFeeSource,
  CoinDCXSpotOrderFillFeeSource,
  OrderFillFeeEvidenceService,
  type BinanceSignedReadPort,
  type BybitSignedReadPort,
  type OrderFillFeeSource,
  type VenueOrderFill,
} from "../evidence/OrderFillFeeEvidenceService";

const now = 1_780_600_000_000;
const binanceCredentials = {getCredentials: (): BinanceCredentials => ({apiKey: "fixture-key", apiSecret: "fixture-secret"})};
const bybitCredentials = {getCredentials: (): BybitCredentials => ({apiKey: "fixture-key", apiSecret: "fixture-secret"})};
const coinDCXCredentials = {getCredentials: (): CoinDCXCredentials => ({apiKey: "fixture-key", apiSecret: "fixture-secret"})};

async function main(): Promise<void> {
  await testExactAggregationAndFailClosedReconciliation();
  await testBinanceOfficialAccountTradeMappings();
  await testBybitOfficialExecutionHistoryMapping();
  await testCoinDCXOfficialOrderStatusMapping();
  console.log("ORDER FILL + FEE EVIDENCE TEST PASSED.");
  console.log("Binance spot/USD-M account trades, Bybit V5 execution history and CoinDCX signed order status preserved exact fills, fee/tax/withholding assets and quote values; unvalued or malformed metadata failed closed using fixtures only.");
}

async function testExactAggregationAndFailClosedReconciliation(): Promise<void> {
  const fills: VenueOrderFill[] = [
    fill("exec-1", 0.004, 200, "USDT", 0.08),
    fill("exec-2", 0.006, 301.2, "BTC", 0.0002),
  ];
  const source: OrderFillFeeSource = {exchange: "binance", product: "PERPETUAL", source: "BINANCE_USDM_ACCOUNT_TRADES",
    async getFills() { return fills; }};
  const service = new OrderFillFeeEvidenceService([source]);
  const exact = await service.inspect({exchange: "BINANCE", product: "PERPETUAL", market: "BTC-USDT",
    orderId: "12345", expectedFilledQuantity: 0.01}, now);
  assert.equal(exact.complete, true);
  assert.equal(exact.observedFilledQuantity, 0.01);
  assert.equal(exact.observedQuoteQuantity, 501.2);
  assert.deepEqual(exact.fees, [{asset: "BTC", amount: 0.0002}, {asset: "USDT", amount: 0.08}]);
  assert.deepEqual(exact.withholdings, []);
  assert.equal(exact.quoteAsset, "USDT");
  assert.equal(exact.totalFeeQuoteAmount, 10.12);
  assert.equal(exact.totalWithholdingQuoteAmount, 0);
  assert.equal(exact.withholdingEvidenceComplete, true);
  assert.equal(exact.averageFillPrice, 50_120);
  const mismatched = await service.inspect({exchange: "binance", product: "PERPETUAL", market: "BTCUSDT",
    orderId: "12345", expectedFilledQuantity: 0.02}, now);
  assert.equal(mismatched.complete, false);
  assert.ok(mismatched.blockers.includes("FILL_QUANTITY_DOES_NOT_RECONCILE_WITH_ORDER_STATUS"));
  const additionalSource: OrderFillFeeSource = {...source, async getFills() {
    return [{...fills[0]!, additionalFeeMetadataPresent: true}];
  }};
  const additional = await new OrderFillFeeEvidenceService([additionalSource]).inspect({exchange: "binance",
    product: "PERPETUAL", market: "BTCUSDT", orderId: "12345", expectedFilledQuantity: 0.004}, now);
  assert.equal(additional.complete, false);
  assert.ok(additional.blockers.includes("ADDITIONAL_FEE_RECONCILIATION_REQUIRED:exec-1"));
  const thirdAsset = await new OrderFillFeeEvidenceService([{...source, async getFills() {
    return [fill("exec-bnb", 0.004, 200, "BNB", 0.0002)];
  }}]).inspect({exchange: "binance", product: "PERPETUAL", market: "BTCUSDT", orderId: "12345",
    expectedFilledQuantity: 0.004}, now);
  assert.equal(thirdAsset.complete, false);
  assert.ok(thirdAsset.blockers.includes("FEE_QUOTE_VALUATION_REQUIRED:exec-bnb:BNB"));
}

async function testBinanceOfficialAccountTradeMappings(): Promise<void> {
  let spotPath = ""; let spotParameters: BinanceRequestParameters | undefined; let synchronized = 0;
  const spotPort: BinanceSignedReadPort = {
    async synchronizeServerTime() { synchronized += 1; return now; },
    async getSigned<T>(path: string, parameters?: BinanceRequestParameters) {
      spotPath = path; spotParameters = parameters;
      return [{id: 77, orderId: 12345, price: "50000", qty: "0.01", quoteQty: "500",
        commission: "0.00001", commissionAsset: "BTC", time: now - 10, isMaker: true}] as T;
    },
  };
  const spotSource = new BinanceSpotOrderFillFeeSource(spotPort, binanceCredentials);
  const spot = await spotSource.getFills("BTCUSDT", "12345");
  assert.equal(synchronized, 1); assert.equal(spotPath, "/api/v3/myTrades");
  assert.deepEqual(spotParameters, {symbol: "BTCUSDT", orderId: "12345"});
  assert.deepEqual(spot.map((item) => ({feeAsset: item.feeAsset, feeAmount: item.feeAmount, maker: item.maker})),
    [{feeAsset: "BTC", feeAmount: 0.00001, maker: true}]);

  let futuresPath = ""; let futuresParameters: BinanceRequestParameters = {};
  const futuresPort: BinanceUsdMOrderPort = {
    async getPublic<T>() { return {serverTime: now} as T; },
    async postSigned<T>(): Promise<T> { throw new Error("Unexpected fixture POST."); },
    async deleteSigned<T>(): Promise<T> { throw new Error("Unexpected fixture DELETE."); },
    async getSigned<T>(path: string, parameters: BinanceRequestParameters) {
      futuresPath = path; futuresParameters = parameters;
      return [{id: 88, orderId: 12345, price: "50100", qty: "0.01", quoteQty: "501",
        commission: "0.2004", commissionAsset: "USDT", time: now - 5, maker: false}] as T;
    },
  };
  const futures = await new BinanceUsdMOrderFillFeeSource(futuresPort, binanceCredentials).getFills("BTCUSDT", "12345");
  assert.equal(futuresPath, "/fapi/v1/userTrades");
  assert.deepEqual(futuresParameters, {symbol: "BTCUSDT", orderId: "12345"});
  assert.equal(futures[0]?.feeAsset, "USDT"); assert.equal(futures[0]?.feeAmount, 0.2004);
}

async function testBybitOfficialExecutionHistoryMapping(): Promise<void> {
  let parameters: Record<string, string> = {};
  const port: BybitSignedReadPort = {async getSigned<T>(path: string, input: Record<string, string>) {
    assert.equal(path, "/v5/execution/list"); parameters = input;
    return {list: [{execId: "bybit-exec-1", orderId: "order-1", symbol: "SANDUSDT", execPrice: "0.04066",
      execQty: "123", execValue: "5.00118", execFee: "0.123", execFeeV2: "0.123", feeCurrency: "SAND", isMaker: false,
      execTime: String(now - 1),
      extraFees: JSON.stringify({TDS: {extraFee: "1.23", feeCoin: "SAND", feeType: "TDS", subFeeType: "IND_TDS"},
        GST: {extraFee: "0.02214", feeCoin: "SAND", feeType: "GST", subFeeType: "IND_GST"}}), execType: "Trade"}]} as T;
  }};
  const source = new BybitOrderFillFeeSource("SPOT", port, bybitCredentials);
  const fills = await source.getFills("SANDUSDT", "order-1");
  assert.deepEqual(parameters, {category: "spot", symbol: "SANDUSDT", orderId: "order-1", limit: "100"});
  assert.deepEqual(fills.map((item) => ({product: item.product, feeAsset: item.feeAsset, feeAmount: item.feeAmount,
    additional: item.additionalFeeMetadataPresent})), [{product: "SPOT", feeAsset: "SAND", feeAmount: 0.123, additional: false}]);
  const evidence = await new OrderFillFeeEvidenceService([source]).inspect({exchange: "bybit", product: "SPOT",
    market: "SANDUSDT", orderId: "order-1", expectedFilledQuantity: 123}, now);
  assert.equal(evidence.complete, true);
  assert.deepEqual(evidence.fees, [{asset: "SAND", amount: 0.14514}]);
  assert.deepEqual(evidence.withholdings, [{asset: "SAND", amount: 1.23}]);
  assert.equal(evidence.totalFeeQuoteAmount, 0.0059013924);
  assert.equal(evidence.totalWithholdingQuoteAmount, 0.0500118);
  assert.equal(evidence.totalCashDeductionQuoteAmount, 0.0559131924);
  assert.equal(evidence.withholdingEvidenceComplete, true);
}

async function testCoinDCXOfficialOrderStatusMapping(): Promise<void> {
  let requestedOrderId = "";
  const source = new CoinDCXSpotOrderFillFeeSource({async getOrderStatus(orderId) {
    requestedOrderId = orderId;
    return {id: "1841821347", clientOrderId: "arb-sell", market: "SANDUSDT", orderType: "limit_order",
      side: "sell", status: "filled", totalQuantity: 123, remainingQuantity: 0, averagePrice: 0.04112,
      pricePerUnit: 0.04112, feePercent: 0.2, feeAmount: 0.01011552,
      createdAt: String(now - 500), updatedAt: String(now - 100)};
  }}, coinDCXCredentials);
  const evidence = await new OrderFillFeeEvidenceService([source]).inspect({exchange: "coindcx", product: "SPOT",
    market: "SANDUSDT", orderId: "1841821347", expectedFilledQuantity: 123}, now);
  assert.equal(requestedOrderId, "1841821347");
  assert.equal(evidence.complete, true);
  assert.equal(evidence.source, "COINDCX_ORDER_STATUS");
  assert.deepEqual(evidence.fees, [{asset: "USDT", amount: 0.01011552}]);
  assert.equal(evidence.totalFeeQuoteAmount, 0.01011552);
  assert.equal(evidence.totalWithholdingQuoteAmount, null);
  assert.equal(evidence.totalCashDeductionQuoteAmount, null);
  assert.equal(evidence.withholdingEvidenceComplete, false);
}

function fill(executionId: string, quantity: number, quoteQuantity: number, feeAsset: string,
  feeAmount: number): VenueOrderFill {
  return {executionId, orderId: "12345", exchange: "binance", product: "PERPETUAL", market: "BTCUSDT",
    price: quoteQuantity / quantity, quantity, quoteQuantity, feeAsset, feeAmount, maker: false,
    executedAt: now - 100, additionalFeeMetadataPresent: false};
}

void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
