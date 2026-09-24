import assert from "node:assert/strict";

import {
  BinanceCapitalTransferApi,
  type BinanceSignedCapitalClient,
} from "../api/BinanceCapitalTransferApi";

/*
 * Binance India (local entity) accounts must withdraw through the Travel Rule
 * endpoint with a questionnaire; the plain endpoint answers -4104.
 */
class FakeClient implements BinanceSignedCapitalClient {
  readonly posts: Array<{path: string; parameters: Record<string, unknown>}> = [];
  constructor(private readonly responses: Record<string, unknown>) {}
  async synchronizeServerTime(): Promise<number> { return 0; }
  async getSigned<T>(path: string): Promise<T> { return this.responses[path] as T; }
  async postSigned<T>(path: string, parameters?: Record<string, unknown>): Promise<T> {
    this.posts.push({path, parameters: parameters ?? {}});
    return this.responses[path] as T;
  }
}

async function main(): Promise<void> {
  const india = new BinanceCapitalTransferApi(new FakeClient({
    "/sapi/v1/localentity/questionnaire-requirements": {questionnaireCountryCode: "IN"},
  }) as never);
  assert.equal(await india.getTravelRuleCountry(), "IN");
  for (const response of [{questionnaireCountryCode: "NIL"}, {questionnaireCountryCode: null}, {}]) {
    const none = new BinanceCapitalTransferApi(new FakeClient({"/sapi/v1/localentity/questionnaire-requirements": response}) as never);
    assert.equal(await none.getTravelRuleCountry(), null, JSON.stringify(response));
  }

  const vasps = new BinanceCapitalTransferApi(new FakeClient({
    "/sapi/v1/localentity/vasp": [{vaspName: "Bybit", vaspCode: "BYBIT", identifier: "bybit-id"}, {bad: true}],
  }) as never);
  assert.deepEqual(await vasps.getTravelRuleVasps(), [{vaspName: "Bybit", vaspCode: "BYBIT", identifier: "bybit-id"}]);

  const client = new FakeClient({"/sapi/v1/localentity/withdraw/apply": {trId: 123, accepted: true, info: "Withdraw request accepted"}});
  const api = new BinanceCapitalTransferApi(client as never);
  const result = await api.withdrawLocalEntity({
    coin: "usdt",
    address: "0xabc0000000000000000000000000000000000001",
    amount: 23.19,
    network: "bsc",
    questionnaire: {isAddressOwner: 1, sendTo: 2, vasp: "bybit-id"},
  });
  assert.equal(result.travelRuleId, "123");
  assert.equal(client.posts[0].path, "/sapi/v1/localentity/withdraw/apply");
  assert.equal(client.posts[0].parameters.coin, "USDT");
  assert.equal(client.posts[0].parameters.network, "BSC");
  assert.equal(client.posts[0].parameters.questionnaire, '{"isAddressOwner":1,"sendTo":2,"vasp":"bybit-id"}',
    "questionnaire is sent as JSON (URLSearchParams encodes it)");

  const refused = new BinanceCapitalTransferApi(new FakeClient({
    "/sapi/v1/localentity/withdraw/apply": {trId: 124, accepted: false, info: "Questionnaire format not valid"},
  }) as never);
  await assert.rejects(
    refused.withdrawLocalEntity({coin: "USDT", address: "0xabc0000000000000000000000000000000000001", amount: 10, network: "BSC", questionnaire: {isAddressOwner: 1, sendTo: 2}}),
    /not accepted: Questionnaire format not valid/u,
  );

  console.log("Binance Travel Rule withdraw passed: local-entity detection, VASP list parsing, questionnaire JSON on /sapi/v1/localentity/withdraw/apply, refusals surface as errors.");
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
