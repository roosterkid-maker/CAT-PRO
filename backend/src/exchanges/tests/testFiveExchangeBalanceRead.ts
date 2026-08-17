import {
  CoinSwitchAccountApi,
} from "../coinswitch/api/CoinSwitchAccountApi";

import {
  UnoCoinAccountApi,
} from "../unocoin/api/UnoCoinAccountApi";

import {
  UnoCoinReadOnlyHttpClient,
} from "../unocoin/api/UnoCoinReadOnlyHttpClient";

function assertCondition(
  condition: boolean,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(
      message,
    );
  }
}

async function assertRejects(
  operation:
    () => Promise<unknown>,
  expectedMessage: string,
): Promise<void> {
  try {
    await operation();
  } catch (
    error: unknown
  ) {
    assertCondition(
      error instanceof Error &&
        error.message.includes(
          expectedMessage,
        ),
      `Expected rejection containing: ${expectedMessage}`,
    );

    return;
  }

  throw new Error(
    `Expected operation to reject: ${expectedMessage}`,
  );
}

async function main():
  Promise<void> {
  let coinSwitchPath =
    "";

  const coinSwitchApi =
    new CoinSwitchAccountApi({
      getSigned:
        async <T>(
          path: string,
        ) => {
          coinSwitchPath =
            path;

          return {
            data: [
              {
                currency:
                  "ETH",
                main_balance:
                  "0.25000000",
                blocked_balance_order:
                  "0.05000000",
              },
              {
                currency:
                  "INR",
                main_balance:
                  802.33,
                blocked_balance_order:
                  100,
              },
            ],
          } as T;
        },
    });

  const coinSwitchBalances =
    await coinSwitchApi
      .getBalances({
        apiKey:
          "fixture-public-key",
        apiSecret:
          "fixture-private-key",
      });

  assertCondition(
    coinSwitchPath ===
      "/trade/api/v2/user/portfolio" &&
      coinSwitchBalances.length ===
        2 &&
      coinSwitchBalances[0]
        ?.asset ===
        "ETH" &&
      coinSwitchBalances[0]
        ?.availableBalance ===
        0.25 &&
      coinSwitchBalances[0]
        ?.lockedBalance ===
        0.05 &&
      coinSwitchBalances[0]
        ?.totalBalance ===
        0.3,
    "CoinSwitch Spot portfolio must preserve available, blocked, and total native balances.",
  );

  await assertRejects(
    () =>
      new CoinSwitchAccountApi({
        getSigned:
          async <T>() => ({
            data: [
              {
                currency:
                  "BTC",
                main_balance:
                  "1",
                blocked_balance_order:
                  "-0.1",
              },
            ],
          }) as T,
      }).getBalances(),
    "Invalid CoinSwitch blocked_balance_order",
  );

  const unoCoinToken =
    "fixture-unocoin-token";

  let unoCoinRequestCount =
    0;

  let unoCoinWriteCount =
    0;

  const unoCoinClient =
    new UnoCoinReadOnlyHttpClient({
      fetchImplementation:
        async (
          input,
          init,
        ) => {
          unoCoinRequestCount +=
            1;

          const url =
            new URL(
              input instanceof Request
                ? input.url
                : input.toString(),
            );

          const method =
            init?.method ??
            "GET";

          if (
            method !==
              "GET"
          ) {
            unoCoinWriteCount +=
              1;
          }

          const headers =
            new Headers(
              init?.headers,
            );

          assertCondition(
            url.origin ===
              "https://api.unocoin.com" &&
              url.pathname ===
                "/api/wallet" &&
              method ===
                "GET" &&
              headers.get(
                "Authorization",
              ) ===
                `Bearer ${unoCoinToken}`,
            "UnoCoin balance reader must use only the documented bearer-authenticated wallet GET.",
          );

          return new Response(
            JSON.stringify({
              wallets: [
                {
                  coin:
                    "INR",
                  balance:
                    "99900.00",
                  locked_balance:
                    "100.00",
                  lending_balance:
                    "0",
                },
                {
                  coin:
                    "BTC",
                  balance:
                    "0.01000000",
                  locked_balance:
                    "0.00200000",
                  lending_balance:
                    "0.00100000",
                },
              ],
            }),
            {
              status:
                200,
              headers: {
                "Content-Type":
                  "application/json",
              },
            },
          );
        },
    });

  const unoCoinBalances =
    await new UnoCoinAccountApi(
      unoCoinClient,
    ).getBalances({
      apiToken:
        unoCoinToken,
    });

  assertCondition(
    unoCoinRequestCount ===
      1 &&
      unoCoinWriteCount ===
        0 &&
      unoCoinBalances.length ===
        2 &&
      unoCoinBalances[1]
        ?.asset ===
        "BTC" &&
      unoCoinBalances[1]
        ?.availableBalance ===
        0.01 &&
      Math.abs(
        (
          unoCoinBalances[1]
            ?.lockedBalance ??
          0
        ) -
          0.003,
      ) <
        1e-12 &&
      Math.abs(
        (
          unoCoinBalances[1]
            ?.totalBalance ??
          0
        ) -
          0.013,
      ) <
        1e-12 &&
      !JSON.stringify(
        unoCoinBalances,
      ).includes(
        unoCoinToken,
      ),
    "UnoCoin wallet normalization must retain available/order-locked/lending balances without exposing credentials or performing writes.",
  );

  console.log(
    "FIVE-EXCHANGE BALANCE READ TEST PASSED.",
  );

  console.log(
    "CoinSwitch and UnoCoin fixtures used authenticated GET contracts only; no order, transfer, withdrawal, or external request was invoked.",
  );
}

void main().catch(
  (
    error: unknown,
  ) => {
    console.error(
      "[Five-Exchange Balance Read Test]",
      error instanceof Error
        ? error.message
        : error,
    );

    process.exitCode =
      1;
  },
);
