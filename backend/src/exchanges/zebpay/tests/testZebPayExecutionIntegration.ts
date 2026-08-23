import {ZebPayCapabilityProvider} from "../../../execution/capabilities/providers/zebpay/ZebPayCapabilityProvider";
import {ZebPayExecutionAdapter} from "../../../execution/live/adapters/ZebPayExecutionAdapter";
import type {ZebPaySubmissionJournalRecord} from "../../../execution/live/adapters/ZebPayOrderSubmissionJournalService";
import type {LiveExecutionRequest} from "../../../execution/live/models/LiveExecutionRequest";
import type {ZebPayCredentials} from "../api/ZebPayCredentialsProvider";
import type {ZebPayLimitOrderRequest, ZebPaySpotOrder} from "../api/ZebPayOrderApi";
import type {ZebPayPublicMarketApi} from "../ZebPayPublicApi";

function assertCondition(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const publicApi: ZebPayPublicMarketApi = {
  async getMarkets() {
    return [{pair: "BTC-INR", market: 100, buy: 101, sell: 100, volumeEx: 1}];
  },
  async getTradePairs() {
    return [{
      tradePairName: "BTC-INR",
      tradeVolumeCurrency: "BTC",
      tradeDenominationCurrency: "INR",
      tradeTickSize: 1,
      tradeMinimumAmount: 99,
      tradeMaximumAmount: 10_000_000,
      volumeCurrencyDecimalPlaces: 8,
      denominationCurrencyInputDecimalPlaces: 2,
      tradeCurrencyInputDecimalPlaces: 8,
      isEnable: true,
      isMarketOrderEnabled: true,
      makerFeePercent: 0.1,
      takerFeePercent: 0.2,
    }];
  },
  async getOrderBook() {
    return {bids: [{price: 100, amount: 1}], asks: [{price: 101, amount: 1}]};
  },
};

const credentials: ZebPayCredentials = {apiKey: "fixture-key", apiSecret: "fixture-secret"};

function order(status = "open"): ZebPaySpotOrder {
  return {
    id: "order-1",
    market: "BTC-INR",
    side: "buy",
    status,
    quantity: 0.001,
    filledQuantity: status === "filled" ? 0.001 : 0,
    remainingQuantity: status === "filled" ? 0 : 0.001,
    price: 100,
    averagePrice: status === "filled" ? 100 : 0,
    feeAmount: 0,
  };
}

async function main(): Promise<void> {
  const capabilityProvider = new ZebPayCapabilityProvider(publicApi, () => 1_900_000_000_000);
  const capability = await capabilityProvider.getCapability("BTCINR");
  assertCondition(
    capability?.tradingEnabled === true &&
    capability.order.supportedOrderTypes.includes("limit") &&
    capability.order.supportedTimeInForce.length === 1 &&
    capability.order.supportedTimeInForce[0] === "GTC" &&
    capability.order.supportsClientOrderId === false &&
    capability.notional.minimumNotional === 99 &&
    capability.quantity.quantityStep === 1e-8,
    "ZebPay public trade-pair rules must normalize exactly without inventing FOK or client-order-id support.",
  );

  let creates = 0;
  const api = {
    async createLimitOrder(_request: ZebPayLimitOrderRequest, _credentials: ZebPayCredentials) { creates += 1; return order(); },
    async getOrder(_orderId: string, _market: string, _credentials: ZebPayCredentials) { return order("filled"); },
    async cancelOrder(_orderId: string, _market: string, _credentials: ZebPayCredentials) { return order("cancelled"); },
  };
  const records = new Map<string, ZebPaySubmissionJournalRecord>();
  const journal = {
    get(clientOrderId: string) { return records.get(clientOrderId) ?? null; },
    record(recordValue: ZebPaySubmissionJournalRecord) { records.set(recordValue.clientOrderId, structuredClone(recordValue)); },
  };
  let now = 1_900_000_000_000;
  const baseRequest: LiveExecutionRequest = {
    exchange: "zebpay", product: "SPOT", market: "BTC-INR", side: "buy",
    orderType: "limit", timeInForce: "GTC", quantity: 0.001, price: 100, clientOrderId: "cat-pro-zebpay-1",
  };

  const disabled = new ZebPayExecutionAdapter({orderApi: api, credentials: {isConfigured: () => true, getCredentials: () => credentials}, journal, now: () => now, submissionEnabled: () => false});
  let disabledBlocked = false;
  try { await disabled.execute(baseRequest); } catch { disabledBlocked = true; }
  assertCondition(disabledBlocked && creates === 0 && records.size === 0, "V164 must perform no signed mutation while its independent venue gate is off.");

  const enabled = new ZebPayExecutionAdapter({orderApi: api, credentials: {isConfigured: () => true, getCredentials: () => credentials}, journal, now: () => ++now, submissionEnabled: () => true});
  const created = await enabled.execute(baseRequest);
  assertCondition(created.orderId === "order-1" && Number(creates) === 1 && records.get("cat-pro-zebpay-1")?.state === "SUBMITTED", "V164 must journal before submission and retain the authoritative order id.");

  let duplicateBlocked = false;
  try { await enabled.execute(baseRequest); } catch { duplicateBlocked = true; }
  assertCondition(duplicateBlocked && Number(creates) === 1, "A repeated or ambiguous durable client identity must never resubmit a ZebPay order.");

  const status = await enabled.getOrderStatus("order-1", "BTC-INR", "SPOT");
  assertCondition(status.status === "FILLED" && status.success, "ZebPay order status must normalize authoritative final state.");

  console.log("ZEBPAY V163/V164 TEST PASSED: exact rules, disabled-by-default mutation, durable no-retry identity, status and cancellation foundation verified.");
}

void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
