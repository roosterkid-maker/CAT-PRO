import {
  BybitMarketUniverseSelector,
} from "../bybit/BybitMarketUniverseSelector";

function assertCondition(
  condition: boolean,
  message: string,
): asserts condition {
  if (
    !condition
  ) {
    throw new Error(
      message,
    );
  }
}

function assertMarkets(
  actual: readonly string[],
  expected: readonly string[],
  message: string,
): void {
  assertCondition(
    JSON.stringify(
      actual,
    ) ===
      JSON.stringify(
        expected,
      ),
    `${message} Expected ${expected.join(", ")}; received ${actual.join(", ")}.`,
  );
}

function main(): void {
  const selector =
    new BybitMarketUniverseSelector();

  const overlapSelection =
    selector.select(
      [
        "AAAUSDT",
        "BBBUSDT",
        "CCCUSDT",
        "DDDUSDT",
      ],
      [
        {
          symbol:
            "AAAUSDT",
          turnover24h:
            100,
          volume24h:
            10,
        },
        {
          symbol:
            "BBBUSDT",
          turnover24h:
            1_000,
          volume24h:
            100,
        },
        {
          symbol:
            "CCCUSDT",
          turnover24h:
            500,
          volume24h:
            50,
        },
      ],
      new Set([
        "aaa_usdt",
        "CCC-USDT",
      ]),
      3,
      1_000,
    );

  assertMarkets(
    overlapSelection.selected,
    [
      "CCCUSDT",
      "AAAUSDT",
      "BBBUSDT",
    ],
    "Shared markets must be selected first and ranked by genuine activity within the overlap bucket.",
  );

  assertCondition(
    overlapSelection.mode ===
      "OVERLAP_AND_ACTIVITY" &&
    overlapSelection.selectedExternalOverlapMarkets ===
      2 &&
    overlapSelection.selectedWithActivityEvidence ===
      3 &&
    !overlapSelection.freshnessThresholdMutationAllowed &&
    !overlapSelection.tradingPolicyMutationAllowed &&
    !overlapSelection.liveExecutionAllowed,
    "Selection diagnostics must report evidence coverage and preserve fail-closed execution policy.",
  );

  const activityOnlySelection =
    selector.select(
      [
        "AAAUSDT",
        "BBBUSDT",
        "CCCUSDT",
      ],
      [
        {
          symbol:
            "AAAUSDT",
          turnover24h:
            10,
          volume24h:
            100,
        },
        {
          symbol:
            "BBBUSDT",
          turnover24h:
            20,
          volume24h:
            1,
        },
      ],
      new Set(),
      2,
      2_000,
    );

  assertMarkets(
    activityOnlySelection.selected,
    [
      "BBBUSDT",
      "AAAUSDT",
    ],
    "Without observed overlap, 24-hour turnover must rank the bounded subscription universe.",
  );

  assertCondition(
    activityOnlySelection.mode ===
      "ACTIVITY_ONLY",
    "Activity evidence without overlap must be identified explicitly.",
  );

  const fallbackSelection =
    selector.select(
      [
        "CCCUSDT",
        "aaa_usdt",
        "BBBUSDT",
        "AAAUSDT",
      ],
      [],
      new Set(),
      10,
      3_000,
    );

  assertMarkets(
    fallbackSelection.selected,
    [
      "AAAUSDT",
      "BBBUSDT",
      "CCCUSDT",
    ],
    "Missing advisory activity evidence must retain a deduplicated deterministic fallback.",
  );

  assertCondition(
    fallbackSelection.mode ===
      "CATALOG_FALLBACK" &&
    fallbackSelection.catalogMarkets ===
      3,
    "Fallback selection must not claim activity evidence.",
  );

  let invalidLimitRejected =
    false;

  try {
    selector.select(
      [
        "BTCUSDT",
      ],
      [],
      new Set(),
      0,
    );
  } catch {
    invalidLimitRejected =
      true;
  }

  assertCondition(
    invalidLimitRejected,
    "An invalid subscription limit must fail closed.",
  );

  console.log(
    "BYBIT MARKET UNIVERSE SELECTION TEST PASSED.",
  );

  console.log(
    "No websocket subscription, authenticated request, or order was submitted.",
  );
}

main();
