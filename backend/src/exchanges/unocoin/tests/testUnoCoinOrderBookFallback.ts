import assert
  from "node:assert/strict";

import {
  UnoCoinPublicApi,
  UnoCoinPublicDataRejectedError,
  type UnoCoinFetch,
} from "../UnoCoinPublicApi";

async function main():
  Promise<void> {
  const requests:
    Array<{
      method: string;

      url: URL;
    }> = [];

  const fixtureFetch:
    UnoCoinFetch =
    async (
      input,
      init,
    ) => {
      const url =
        new URL(
          input,
        );

      requests.push({
        method:
          init?.method ??
          "GET",

        url,
      });

      if (
        url.pathname ===
        "/api/v1/asset/orderbook/BTC_USDT/50"
      ) {
        return new Response(
          JSON.stringify({
            bids: {
              data: [
                {
                  coin:
                    "BTC",
                  base_coin:
                    "USDT",
                  order_type:
                    "BID",
                  rate:
                    "100.00",
                  volume:
                    "2.50",
                },
                {
                  coin:
                    "ETH",
                  base_coin:
                    "USDT",
                  order_type:
                    "BID",
                  rate:
                    "999.00",
                  volume:
                    "999.00",
                },
              ],
            },
            asks: {
              data: [
                {
                  coin:
                    "BTC",
                  base_coin:
                    "USDT",
                  order_type:
                    "ASK",
                  rate:
                    "101.00",
                  volume:
                    "1.25",
                },
                {
                  coin:
                    "BTC",
                  base_coin:
                    "USDT",
                  order_type:
                    "BID",
                  rate:
                    "98.00",
                  volume:
                    "8.00",
                },
              ],
            },
          }),
          {
            status:
              200,

            headers: {
              "content-type":
                "application/json",
            },
          },
        );
      }

      if (
        url.pathname ===
        "/api/v1/exchange/orderbook"
      ) {
        return new Response(
          JSON.stringify({
            message:
              "temporary upstream failure",
          }),
          {
            status:
              500,

            headers: {
              "content-type":
                "application/json",
            },
          },
        );
      }

      return new Response(
        "not found",
        {
          status:
            404,
        },
      );
    };

  const api =
    new UnoCoinPublicApi(
      fixtureFetch,
    );

  const book =
    await api.getOrderBook(
      "btc_usdt",
      100,
    );

  assert.equal(
    book.ticker_id,
    "BTC_USDT",
  );

  assert.deepEqual(
    book.bids,
    [
      [
        "100.00",
        "2.50",
      ],
    ],
    "Fallback depth must retain only the requested market and BID side.",
  );

  assert.deepEqual(
    book.asks,
    [
      [
        "101.00",
        "1.25",
      ],
    ],
    "Fallback depth must retain only the requested market and ASK side.",
  );

  assert.deepEqual(
    requests.map(
      (request) => ({
        method:
          request.method,

        path:
          request.url.pathname,
      }),
    ),
    [
      {
        method:
          "GET",

        path:
          "/api/v1/asset/orderbook/BTC_USDT/50",
      },
    ],
    "A valid responsive asset book must complete without paying the legacy public exchange-book latency.",
  );

  const directArrayApi =
    new UnoCoinPublicApi(
      async () =>
        new Response(
          JSON.stringify({
            bids: [
              {
                coin:
                  "BTC",

                base_coin:
                  "USDT",

                order_type:
                  "BID",

                rate:
                  "100.25",

                volume:
                  "0.75",
              },
            ],

            asks: [
              {
                coin:
                  "BTC",

                base_coin:
                  "USDT",

                order_type:
                  "ASK",

                rate:
                  "100.75",

                volume:
                  "1.25",
              },
            ],
          }),
          {
            status:
              200,
          },
        ),
    );

  const directArrayBook =
    await directArrayApi
      .getOrderBook(
        "BTC_USDT",
        100,
      );

  assert.deepEqual(
    directArrayBook.bids,
    [
      [
        "100.25",
        "0.75",
      ],
    ],
    "UnoCoin's current direct-array asset-book schema must normalize as executable depth.",
  );

  assert.deepEqual(
    directArrayBook.asks,
    [
      [
        "100.75",
        "1.25",
      ],
    ],
    "Both current direct-array and legacy nested asset-book schemas must remain supported.",
  );

  const hangingApi =
    new UnoCoinPublicApi(
      () =>
        new Promise<Response>(
          () =>
            undefined,
        ),
      20,
    );

  const timeoutStartedAt =
    Date.now();

  await assert.rejects(
    hangingApi.getTickers(),
    /exceeded 20 ms/,
    "A public fetch that ignores AbortSignal must still settle at the hard deadline.",
  );

  assert.ok(
    Date.now() -
      timeoutStartedAt <
      500,
    "The UnoCoin public hard deadline must remain bounded.",
  );

  let hangingOrderBookRequests =
    0;

  const hangingOrderBookApi =
    new UnoCoinPublicApi(
      () => {
        hangingOrderBookRequests +=
          1;

        return new Promise<Response>(
          () =>
            undefined,
        );
      },
      40,
    );

  const orderBookTimeoutStartedAt =
    Date.now();

  await assert.rejects(
    hangingOrderBookApi.getOrderBook(
      "BTC_USDT",
      100,
    ),
    /order-book sources failed/,
    "UnoCoin order-book recovery must fail closed when both public sources ignore AbortSignal.",
  );

  assert.ok(
    hangingOrderBookRequests >=
      1 &&
      hangingOrderBookRequests <=
        2,
    "The primary and recovery order-book sources must each receive at most one bounded request.",
  );

  assert.ok(
    Date.now() -
      orderBookTimeoutStartedAt <
      250,
    "Primary and recovery order-book sources must share one total timeout instead of consuming two full deadlines.",
  );

  let dataRejectedRequests =
    0;

  const dataRejectedApi =
    new UnoCoinPublicApi(
      async (
        input,
      ) => {
        dataRejectedRequests +=
          1;

        const url =
          new URL(
            input,
          );

        if (
          url.pathname.startsWith(
            "/api/v1/asset/orderbook/",
          )
        ) {
          return new Response(
            JSON.stringify({
              bids: {
                data: [],
              },

              asks: {
                data: [],
              },
            }),
            {
              status:
                200,
            },
          );
        }

        return new Response(
          "not found",
          {
            status:
              404,
          },
        );
      },
      40,
    );

  await assert.rejects(
    dataRejectedApi.getOrderBook(
      "BTC_USDT",
      100,
    ),
    (error: unknown) =>
      error instanceof
        UnoCoinPublicDataRejectedError,
    "A responsive market with no matching two-sided depth must remain a per-market data rejection, not a transport outage.",
  );

  await assert.rejects(
    dataRejectedApi.getOrderBook(
      "ETH_USDT",
      100,
    ),
    (error: unknown) =>
      error instanceof
        UnoCoinPublicDataRejectedError,
    "A second invalid asset book must remain a market-level data rejection while the retired recovery endpoint circuit is open.",
  );

  assert.equal(
    dataRejectedRequests,
    3,
    "After one recovery 404, later invalid markets must skip the guaranteed-failing legacy endpoint during its bounded cooldown.",
  );

  console.log(
    "UNOCOIN ORDER-BOOK FALLBACK TEST PASSED.",
  );

  console.log(
    "Only fixture public GET requests were used; no credential, order, balance, or external request was used.",
  );
}

void main()
  .catch(
    (
      error:
        unknown,
    ) => {
      console.error(
        error instanceof Error
          ? error.message
          : error,
      );

      process.exitCode =
        1;
    },
  );
