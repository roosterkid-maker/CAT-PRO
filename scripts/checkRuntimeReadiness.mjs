import {
  evaluateRuntimeReadiness,
} from "./runtimeReadinessPolicy.mjs";

function readStage() {
  const inline =
    process.argv.find(
      (argument) =>
        argument.startsWith(
          "--stage=",
        ),
    );

  if (inline) {
    return inline
      .slice(
        "--stage=".length,
      );
  }

  const stageIndex =
    process.argv.indexOf(
      "--stage",
    );

  if (
    stageIndex >=
      0 &&
    process.argv[
      stageIndex +
        1
    ]
  ) {
    return process.argv[
      stageIndex +
        1
    ];
  }

  return "shadow";
}

function readBaseUrl() {
  const value =
    process.env
      .CAT_PRO_RUNTIME_URL
      ?.trim() ||
    "http://127.0.0.1:8080";

  const parsed =
    new URL(value);

  if (
    parsed.username ||
    parsed.password
  ) {
    throw new Error(
      "CAT_PRO_RUNTIME_URL must not contain credentials.",
    );
  }

  return parsed;
}

async function readData(
  baseUrl,
  path,
  acceptedStatuses =
    [200],
) {
  const url =
    new URL(
      path,
      baseUrl,
    );

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

  if (
    !acceptedStatuses.includes(
      response.status,
    )
  ) {
    throw new Error(
      `${path} returned HTTP ${response.status}.`,
    );
  }

  const payload =
    await response.json();

  if (
    !payload ||
    typeof payload !==
      "object" ||
    !("data" in payload)
  ) {
    throw new Error(
      `${path} returned an invalid response envelope.`,
    );
  }

  return payload.data;
}

async function main() {
  const stage =
    readStage();
  const baseUrl =
    readBaseUrl();

  const [
    scheduler,
    dashboard,
    performance,
    fleet,
    paperShadowReadiness,
    productionSafety,
    goNoGo,
    paperReadiness,
  ] =
    await Promise.all([
      readData(
        baseUrl,
        "/api/automation/",
      ),
      readData(
        baseUrl,
        "/api/automation/dashboard",
      ),
      readData(
        baseUrl,
        "/api/automation/performance",
      ),
      readData(
        baseUrl,
        "/api/exchanges/fleet/",
      ),
      readData(
        baseUrl,
        "/api/exchanges/paper-shadow-readiness/",
      ),
      readData(
        baseUrl,
        "/api/production-safety/",
      ),
      readData(
        baseUrl,
        "/api/execution/five-exchange-go-no-go/",
        [
          200,
          409,
        ],
      ),
      readData(
        baseUrl,
        "/api/automation/paper-readiness",
      ),
    ]);

  const report =
    evaluateRuntimeReadiness({
      stage,
      scheduler,
      dashboard,
      performance,
      fleet,
      paperShadowReadiness,
      productionSafety,
      goNoGo,
      paperReadiness,
    });

  for (const check of report.checks) {
    const level =
      check.required
        ? check.passed
          ? "PASS"
          : "FAIL"
        : check.passed
          ? "PASS"
          : "INFO";

    console.log(
      `[${level}] ${check.key}: ${check.detail}`,
    );
  }

  console.log(
    `Runtime readiness result: ${
      report.passed
        ? "PASS"
        : "BLOCKED"
    }; stage=${report.stage}; shadowOutcomes=${String(
      report.summary
        .completedOutcomes,
    )}/${String(
      report.summary
        .minimumOutcomes,
    )}; paperExchanges=${String(
      report.summary
        .paperAvailableExchanges,
    )}/5; paperAllowed=${String(
      report.summary
        .paperExecutionAllowed,
    )}; liveAllowed=${String(
      report.summary
        .liveExecutionAllowed,
    )}; attributedClosedPaper=${String(
      report.summary
        .attributedClosedPaperTrades,
    )}.`,
  );

  console.log(
    "This verifier performs read-only GET requests and never arms PAPER, enables LIVE, submits an order, reserves capital, or prints credential values.",
  );

  process.exitCode =
    report.passed
      ? 0
      : 1;
}

void main()
  .catch(
    (error) => {
      console.error(
        error instanceof Error
          ? error.message
          : error,
      );

      console.error(
        "Runtime readiness result: BLOCKED; missing or invalid evidence fails closed.",
      );

      process.exitCode =
        1;
    },
  );
