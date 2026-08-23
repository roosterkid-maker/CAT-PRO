import {
  ExchangeBalanceSynchronizationService,
  type ExchangeBalanceSynchronizationResult,
  type SupportedBalanceExchange,
} from "../ExchangeBalanceSynchronizationService";

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

function successfulResult(
  exchange:
    SupportedBalanceExchange,
): ExchangeBalanceSynchronizationResult {
  return {
    exchange,
    status:
      "SYNCHRONIZED",
    synchronizedAt:
      Date.now(),
    synchronizedBalances:
      1,
    reasons: [
      `${exchange} fixture synchronized.`,
    ],
  };
}

async function main():
  Promise<void> {
  let releaseUnoCoin:
    (
      result:
        ExchangeBalanceSynchronizationResult,
    ) => void =
    () => undefined;

  const unresolvedUnoCoin =
    new Promise<
      ExchangeBalanceSynchronizationResult
    >(
      (resolve) => {
        releaseUnoCoin =
          resolve;
      },
    );

  const calls =
    new Map<
      SupportedBalanceExchange,
      number
    >();

  const service =
    new ExchangeBalanceSynchronizationService({
      maximumExchangeDurationMs:
        20,
      synchronizer:
        async (exchange) => {
          const callCount =
            (
              calls.get(
                exchange,
              ) ??
              0
            ) +
            1;

          calls.set(
            exchange,
            callCount,
          );

          if (
            exchange ===
              "unocoin" &&
            callCount ===
              1
          ) {
            return unresolvedUnoCoin;
          }

          return successfulResult(
            exchange,
          );
        },
    });

  const firstReport =
    await service.synchronizeAll();

  const firstUnoCoin =
    firstReport.results.find(
      (result) =>
        result.exchange ===
        "unocoin",
    );

  assertCondition(
    firstReport.successfulExchanges ===
      5 &&
      firstReport.failedExchanges ===
        1 &&
      firstUnoCoin?.status ===
        "FAILED" &&
      firstUnoCoin.reasons.some(
        (reason) =>
          reason.includes(
            "exceeded 20 ms",
          ),
      ) &&
      service.getUnresolvedExchanges()
        .includes(
          "unocoin",
        ) &&
      !service.isSynchronizationInProgress(),
    "One unresolved venue must time out without holding the six-venue synchronization cycle open.",
  );

  const secondReport =
    await service.synchronizeAll();

  const secondUnoCoin =
    secondReport.results.find(
      (result) =>
        result.exchange ===
        "unocoin",
    );

  assertCondition(
    secondReport.successfulExchanges ===
      5 &&
      secondReport.failedExchanges ===
        1 &&
      calls.get(
        "unocoin",
      ) ===
        1 &&
      calls.get(
        "binance",
      ) ===
        2 &&
      secondUnoCoin?.reasons.some(
        (reason) =>
          reason.includes(
            "duplicate authenticated read was not started",
          ),
      ) ===
        true,
    "A hung venue must not be duplicated while healthy venues continue refreshing independently.",
  );

  releaseUnoCoin(
    successfulResult(
      "unocoin",
    ),
  );

  await Promise.resolve();
  await Promise.resolve();

  assertCondition(
    service.getUnresolvedExchanges()
      .length ===
      0,
    "A late settlement must release the per-exchange single-flight guard.",
  );

  const recoveredReport =
    await service.synchronizeAll();

  assertCondition(
    recoveredReport.successfulExchanges ===
      6 &&
      recoveredReport.failedExchanges ===
        0 &&
      calls.get(
        "unocoin",
      ) ===
        2,
    "The isolated venue must rejoin later cycles after its unresolved request settles.",
  );

  console.log(
    "EXCHANGE BALANCE SYNCHRONIZATION ISOLATION TEST PASSED.",
  );
}

void main().catch(
  (
    error: unknown,
  ) => {
    console.error(
      "[Exchange Balance Synchronization Isolation Test]",
      error instanceof Error
        ? error.message
        : error,
    );

    process.exitCode =
      1;
  },
);
