import assert
  from "node:assert/strict";

import {
  UnoCoinPublicApi,
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
