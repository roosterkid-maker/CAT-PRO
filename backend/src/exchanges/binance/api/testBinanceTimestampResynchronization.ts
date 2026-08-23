import assert
  from "node:assert/strict";

import type {
  AxiosInstance,
  AxiosRequestConfig,
} from "axios";

import {
  BinanceHttpClient,
} from "./BinanceHttpClient";

function timestampFailure(
  config:
    AxiosRequestConfig,
): unknown {
  return {
    isAxiosError:
      true,
    message:
      "Request failed with status code 400",
    config,
    response: {
      status:
        400,
      data: {
        code:
          -1021,
        msg:
          "Timestamp for this request was ahead of the server's time.",
      },
    },
  };
}

async function main():
  Promise<void> {
  let timeReads =
    0;
  let signedRequests =
    0;

  const fakeClient = {
    get:
      async () => {
        timeReads +=
          1;

        return {
          data: {
            serverTime:
              Date.now(),
          },
        };
      },
    request:
      async <T>(
        config:
          AxiosRequestConfig,
      ) => {
        signedRequests +=
          1;

        if (
          signedRequests ===
          1
        ) {
          throw timestampFailure(
            config,
          );
        }

        return {
          data: {
            recovered:
              true,
          } as T,
        };
      },
  } as unknown as
    AxiosInstance;

  const client =
    new BinanceHttpClient(
      fakeClient,
    );

  await client
    .synchronizeServerTime();

  const result =
    await client.getSigned<{
      recovered: boolean;
    }>(
      "/api/v3/account",
      {},
      {
        apiKey:
          "test-key",
        apiSecret:
          "test-secret",
      },
    );

  assert.equal(
    result.recovered,
    true,
  );
  assert.equal(
    timeReads,
    2,
    "A rejected -1021 request must perform exactly one fresh server-time read.",
  );
  assert.equal(
    signedRequests,
    2,
    "A rejected -1021 request must be re-signed and retried exactly once.",
  );

  console.log(
    "BINANCE TIMESTAMP RE-SYNCHRONIZATION TEST PASSED.",
  );
}

void main();
