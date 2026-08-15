import {
  mkdir,
  writeFile,
} from "node:fs/promises";

import {
  dirname,
  resolve,
} from "node:path";

const options =
  parseOptions(
    process.argv.slice(
      2,
    ),
  );

const startedAt =
  Date.now();

const endsAt =
  startedAt +
  options.durationSeconds *
    1_000;

const samples =
  [];

const observedOutcomes =
  new Map();

let baseline =
  null;

console.log(
  `[CAT PRO] Starting read-only SHADOW benchmark for ${options.durationSeconds}s at ${options.baseUrl}.`,
);

while (
  Date.now() <
    endsAt ||
  samples.length ===
    0
) {
  const sample =
    await collectSample(
      options.baseUrl,
    );

  assertReadOnlySafety(
    sample,
  );

  baseline ??=
    sample;

  samples.push(
    sample,
  );

  for (
    const outcome
    of sample.outcomes.records ??
      []
  ) {
    if (
      outcome &&
      typeof outcome.id ===
        "string"
    ) {
      observedOutcomes.set(
        outcome.id,
        outcome,
      );
    }
  }

  const remainingMs =
    endsAt -
    Date.now();

  if (remainingMs <=
    0) {
    break;
  }

  await delay(
    Math.min(
      remainingMs,
      options.intervalSeconds *
        1_000,
    ),
  );
}

const finishedAt =
  Date.now();

const finalSample =
  samples.at(
    -1,
  );

const completedWindowOutcomes =
  Array.from(
    observedOutcomes.values(),
  ).filter(
    (outcome) =>
      Number.isFinite(
        outcome.completedAt,
      ) &&
      outcome.completedAt >=
        startedAt &&
      outcome.completedAt <=
        finishedAt,
  );

const shadowExecution =
  summarizeShadowExecution(
    completedWindowOutcomes,
  );

const report = {
  version:
    "1.0",
  mode:
    "READ_ONLY_SHADOW_BENCHMARK",
  startedAt,
  finishedAt,
  requestedDurationSeconds:
    options.durationSeconds,
  actualDurationSeconds:
    Number(
      (
        (
          finishedAt -
          startedAt
        ) /
        1_000
      ).toFixed(
        3,
      ),
    ),
  sampleIntervalSeconds:
    options.intervalSeconds,
  sampleCount:
    samples.length,
  definitions: {
    fills:
      "Simulated buy/sell outcome legs whose final observed fill percent is greater than zero.",
    legs:
      "Two executable legs are counted only when the final shadow sample reports fullyExecutable=true.",
    cycles:
      "A completed outcome is one SHADOW round-trip observation; successful cycles use status=SUCCESS.",
    netAfterFees:
      "Sum of final sample netProfit values, which are already after recorded buy and sell fees. This is simulated evidence, not booked account P&L.",
  },
  safety: {
    readOnlyRequestsOnly:
      true,
    liveExecutionAllowed:
      false,
    orderSubmissionAllowed:
      false,
    paperAndLiveResultsSeparated:
      true,
  },
  marketCoverage: {
    executableQuotes: summarizeGauge(
      samples.map(
        (sample) =>
          numberAt(
            sample,
            "health.cache.executableQuotes",
          ),
      ),
    ),
    pairableMarkets: summarizeGauge(
      samples.map(
        (sample) =>
          numberAt(
            sample,
            "bottleneck.summary.pairableMarkets",
          ),
      ),
    ),
    evaluatedPairs: summarizeGauge(
      samples.map(
        (sample) =>
          numberAt(
            sample,
            "bottleneck.summary.evaluatedPairs",
          ),
      ),
    ),
    acceptedOpportunities: summarizeGauge(
      samples.map(
        (sample) =>
          numberAt(
            sample,
            "bottleneck.summary.acceptedOpportunities",
          ),
      ),
    ),
  },
  strategyDeltas:
    summarizeStrategies(
      baseline.strategies,
      finalSample.strategies,
    ),
  shadowExecution,
  centralPaperObservedSeparately: {
    plansCompiled:
      delta(
        numberAt(
          baseline,
          "lifecycle.pipeline.admission.plansCompiled",
        ),
        numberAt(
          finalSample,
          "lifecycle.pipeline.admission.plansCompiled",
        ),
      ),
    queued:
      delta(
        numberAt(
          baseline,
          "lifecycle.pipeline.queue.queued",
        ),
        numberAt(
          finalSample,
          "lifecycle.pipeline.queue.queued",
        ),
      ),
    workerCompleted:
      delta(
        numberAt(
          baseline,
          "lifecycle.pipeline.worker.completed",
        ),
        numberAt(
          finalSample,
          "lifecycle.pipeline.worker.completed",
        ),
      ),
    openPositionLegs:
      numberAt(
        finalSample,
        "lifecycle.pipeline.positions.openPositionLegs",
      ),
    closedCycles:
      delta(
        numberAt(
          baseline,
          "lifecycle.pipeline.positions.closedGroups",
        ),
        numberAt(
          finalSample,
          "lifecycle.pipeline.positions.closedGroups",
        ),
      ),
    bookedNetAfterFeesInr:
      delta(
        numberAt(
          baseline,
          "lifecycle.pipeline.accounting.totalPostedPnlInr",
        ),
        numberAt(
          finalSample,
          "lifecycle.pipeline.accounting.totalPostedPnlInr",
        ),
      ),
  },
  finalBlockers:
    finalSample.bottleneck
      .engine
      ?.rejectionCodes ??
    [],
};

const outputPath =
  resolve(
    options.output ??
      `reports/shadow-benchmark-${new Date(startedAt).toISOString().replace(/[:.]/g, "-")}.json`,
  );

await mkdir(
  dirname(
    outputPath,
  ),
  {
    recursive:
      true,
  },
);

await writeFile(
  outputPath,
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);

console.log(
  JSON.stringify(
    report,
    null,
    2,
  ),
);

console.log(
  `[CAT PRO] SHADOW benchmark report written to ${outputPath}`,
);

function parseOptions(
  args,
) {
  const values =
    new Map(
      args.map(
        (argument) => {
          const [
            key,
            ...rest
          ] =
            argument.split(
              "=",
            );

          return [
            key,
            rest.join(
              "=",
            ),
          ];
        },
      ),
    );

  const durationSeconds =
    boundedInteger(
      values.get(
        "--duration-seconds",
      ),
      3_600,
      1,
      86_400,
      "duration-seconds",
    );

  const intervalSeconds =
    boundedInteger(
      values.get(
        "--interval-seconds",
      ),
      5,
      1,
      300,
      "interval-seconds",
    );

  return {
    baseUrl:
      (
        values.get(
          "--base-url",
        ) ??
        "http://127.0.0.1:5000"
      ).replace(
        /\/$/,
        "",
      ),
    durationSeconds,
    intervalSeconds,
    output:
      values.get(
        "--output",
      ) ||
      null,
  };
}

function boundedInteger(
  raw,
  fallback,
  minimum,
  maximum,
  label,
) {
  if (
    raw ===
    undefined
  ) {
    return fallback;
  }

  const parsed =
    Number(
      raw,
    );

  if (
    !Number.isSafeInteger(
      parsed,
    ) ||
    parsed <
      minimum ||
    parsed >
      maximum
  ) {
    throw new Error(
      `--${label} must be an integer from ${minimum} to ${maximum}.`,
    );
  }

  return parsed;
}

async function collectSample(
  baseUrl,
) {
  const [
    health,
    bottleneck,
    strategies,
    lifecycle,
    outcomes,
    shadowPerformance,
  ] =
    await Promise.all([
      getJson(
        `${baseUrl}/api/system-health`,
      ),
      getJson(
        `${baseUrl}/api/automation/bottleneck`,
      ),
      getJson(
        `${baseUrl}/api/strategies`,
      ),
      getJson(
        `${baseUrl}/api/strategies/central-paper-lifecycle`,
      ),
      getJson(
        `${baseUrl}/api/automation/outcomes`,
      ),
      getJson(
        `${baseUrl}/api/automation/performance`,
      ),
    ]);

  return {
    observedAt:
      Date.now(),
    health,
    bottleneck,
    strategies,
    lifecycle,
    outcomes,
    shadowPerformance,
  };
}

async function getJson(
  url,
) {
  const response =
    await fetch(
      url,
      {
        method:
          "GET",
        headers: {
          accept:
            "application/json",
        },
        signal:
          AbortSignal.timeout(
            15_000,
          ),
      },
    );

  if (!response.ok) {
    throw new Error(
      `GET ${url} failed with HTTP ${response.status}.`,
    );
  }

  const envelope =
    await response.json();

  if (
    !envelope ||
    envelope.success !==
      true
  ) {
    throw new Error(
      `GET ${url} returned an invalid CAT PRO envelope.`,
    );
  }

  return envelope.data;
}

function assertReadOnlySafety(
  sample,
) {
  const unsafe = [
    sample.bottleneck
      ?.liveExecutionAllowed,
    sample.strategies
      ?.safety
      ?.liveExecutionAllowed,
    sample.strategies
      ?.safety
      ?.orderSubmissionAllowed,
    sample.lifecycle
      ?.safety
      ?.liveExecutionAllowed,
    sample.lifecycle
      ?.safety
      ?.orderSubmissionAllowed,
  ].some(
    (value) =>
      value !==
      false,
  );

  if (unsafe) {
    throw new Error(
      "SHADOW benchmark aborted: explicit LIVE/order-submission safety evidence is missing or enabled.",
    );
  }
}

function summarizeShadowExecution(
  outcomes,
) {
  let buyFills =
    0;
  let sellFills =
    0;
  let executableLegs =
    0;
  let successfulCycles =
    0;
  let failedCycles =
    0;
  let dataUnavailableCycles =
    0;
  let netAfterFees =
    0;
  let netEvidenceCycles =
    0;

  for (
    const outcome
    of outcomes
  ) {
    const finalSample =
      Array.isArray(
        outcome.samples,
      )
        ? outcome.samples.at(
            -1,
          )
        : null;

    if (
      Number(
        finalSample?.buyFillPercent,
      ) >
      0
    ) {
      buyFills +=
        1;
    }

    if (
      Number(
        finalSample?.sellFillPercent,
      ) >
      0
    ) {
      sellFills +=
        1;
    }

    if (
      finalSample?.fullyExecutable ===
      true
    ) {
      executableLegs +=
        2;
    }

    if (outcome.status ===
      "SUCCESS") {
      successfulCycles +=
        1;
    } else if (
      outcome.status ===
      "FAILED"
    ) {
      failedCycles +=
        1;
    } else if (
      outcome.status ===
      "DATA_UNAVAILABLE"
    ) {
      dataUnavailableCycles +=
        1;
    }

    if (
      Number.isFinite(
        finalSample?.netProfit,
      )
    ) {
      netAfterFees +=
        finalSample.netProfit;

      netEvidenceCycles +=
        1;
    }
  }

  return {
    fills: {
      buy:
        buyFills,
      sell:
        sellFills,
      total:
        buyFills +
        sellFills,
    },
    legs: {
      fullyExecutable:
        executableLegs,
    },
    cycles: {
      completed:
        outcomes.length,
      successful:
        successfulCycles,
      failed:
        failedCycles,
      dataUnavailable:
        dataUnavailableCycles,
    },
    netAfterFees: {
      value:
        Number(
          netAfterFees.toFixed(
            12,
          ),
        ),
      evidenceCycles:
        netEvidenceCycles,
      unit:
        "QUOTE_ASSET_MIXED",
      bookedAccountPnl:
        false,
    },
  };
}

function summarizeStrategies(
  first,
  last,
) {
  const firstById =
    new Map(
      (first.strategies ??
        []).map(
        (item) => [
          item.metadata.id,
          item,
        ],
      ),
    );

  return (last.strategies ??
    []).map(
    (item) => {
      const start =
        firstById.get(
          item.metadata.id,
        );

      return {
        strategyNumber:
          item.metadata
            .strategyNumber,
        strategyId:
          item.metadata.id,
        processedSnapshots:
          delta(
            start?.runtime
              ?.processedSnapshots ??
              0,
            item.runtime
              .processedSnapshots,
          ),
        signalsObserved:
          delta(
            start?.runtime
              ?.totalSignalsObserved ??
              0,
            item.runtime
              .totalSignalsObserved,
          ),
        currentSignals:
          item.runtime
            .currentSignalCount,
        lastError:
          item.runtime
            .lastError,
      };
    },
  );
}

function summarizeGauge(
  values,
) {
  const finite =
    values.filter(
      Number.isFinite,
    );

  if (finite.length ===
    0) {
    return {
      minimum:
        null,
      maximum:
        null,
      average:
        null,
      final:
        null,
    };
  }

  return {
    minimum:
      Math.min(
        ...finite,
      ),
    maximum:
      Math.max(
        ...finite,
      ),
    average:
      Number(
        (
          finite.reduce(
            (sum, value) =>
              sum +
              value,
            0,
          ) /
          finite.length
        ).toFixed(
          3,
        ),
      ),
    final:
      finite.at(
        -1,
      ),
  };
}

function numberAt(
  value,
  path,
) {
  const resolved =
    path.split(
      ".",
    ).reduce(
      (current, key) =>
        current?.[
          key
        ],
      value,
    );

  return Number.isFinite(
    resolved,
  )
    ? resolved
    : 0;
}

function delta(
  first,
  last,
) {
  return Math.max(
    0,
    last -
      first,
  );
}

function delay(
  milliseconds,
) {
  return new Promise(
    (resolveDelay) => {
      setTimeout(
        resolveDelay,
        milliseconds,
      );
    },
  );
}
