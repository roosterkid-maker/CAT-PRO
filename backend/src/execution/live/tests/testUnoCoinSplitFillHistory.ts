import assert from "node:assert/strict";

import {UnoCoinOrderApi} from "../../../exchanges/unocoin/api/UnoCoinOrderApi";

/*
 * UnoCoin lists an order that filled in pieces as one history row per piece
 * under the same id (real DASH_INR response, 2026-09-25). Those rows merge
 * into one completed order; any other repeated-id shape stays ambiguous.
 */
const credentials = {apiKey: "key", apiSecret: "secret"} as never;

function api(rows: readonly Record<string, unknown>[]): UnoCoinOrderApi {
  return new UnoCoinOrderApi({
    client: {
      async getAuthenticated<T>(): Promise<T> {
        return {data: rows, current_page: 1, last_page: 1} as T;
      },
      async postAuthenticatedForm<T>(): Promise<T> {
        throw new Error("Unexpected write in history test.");
      },
    },
    maximumHistoryPages: 1,
  } as never);
}

const PIECES = [
  {id: 110170006, rate: "5990", volume: "0.10488982", charges: "0.00031466", amount: "628", total: "628", coin: "DASH", order_type: "BID", advance_order_type: "LIMIT", status: 1},
  {id: 110170006, rate: "5999", volume: "0.01215562", charges: "0.00003646", amount: "72", total: "72", coin: "DASH", order_type: "BID", advance_order_type: "LIMIT", status: 1},
  {id: 110170006, rate: "5999", volume: "0.13295456", charges: "0.00039886", amount: "797", total: "797", coin: "DASH", order_type: "BID", advance_order_type: "LIMIT", status: 1},
];

async function main(): Promise<void> {
  const order = await api(PIECES).getSpotOrder("110170006", "DASH_INR", credentials);
  assert.equal(order.status, 1);
  assert.ok(Math.abs(order.executedQuantity - 0.25) < 1e-9, String(order.executedQuantity));
  assert.equal(order.remainingQuantity, 0);
  assert.equal(order.side, "buy");
  const average = (5990 * 0.10488982 + 5999 * 0.01215562 + 5999 * 0.13295456) / 0.25;
  assert.ok(Math.abs(order.averagePrice - average) < 1e-6, String(order.averagePrice));

  // A piece still open (or a side/coin mismatch) is not merged: the outcome
  // remains unknown and the executor halts instead of guessing.
  for (const rows of [
    [PIECES[0]!, {...PIECES[1]!, status: 0}],
    [PIECES[0]!, {...PIECES[1]!, order_type: "ASK"}],
    [PIECES[0]!, {...PIECES[1]!, exchange_transactions: [{volume: "0.01", rate: "5999"}]}],
  ]) {
    await assert.rejects(api(rows).getSpotOrder("110170006", "DASH_INR", credentials), /duplicate matches/u);
  }

  console.log("UnoCoin split-fill history passed: completed pieces of one order merge into one filled order with a volume-weighted average; other repeated ids stay ambiguous.");
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
