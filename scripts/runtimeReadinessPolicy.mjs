const VALID_STAGES =
  new Set([
    "shadow",
    "paper",
    "paper-soak",
  ]);

export function evaluateRuntimeReadiness(
  input,
) {
  const stage =
    String(
      input?.stage ??
        "",
    )
      .trim()
      .toLowerCase();

  if (!VALID_STAGES.has(stage)) {
    throw new Error(
      "Runtime readiness stage must be shadow, paper, or paper-soak.",
    );
  }

  const scheduler =
    input?.scheduler ??
    {};
  const dashboard =
    input?.dashboard ??
    {};
  const performance =
    input?.performance ??
    {};
  const fleet =
    input?.fleet ??
    {};
  const paperShadowReadiness =
    input?.paperShadowReadiness ??
    {};
  const productionSafety =
    input?.productionSafety ??
    {};
  const goNoGo =
    input?.goNoGo ??
    {};
  const paperReadiness =
    input?.paperReadiness ??
    {};

  const checks = [];

  function addCheck(
    key,
    passed,
    detail,
    required = true,
  ) {
    checks.push({
      key,
      passed:
        passed === true,
      required,
      detail,
    });
  }

  addCheck(
    "SCHEDULER_RUNNING",
    scheduler.running ===
      true,
    `running=${String(
      scheduler.running,
    )}`,
  );

  addCheck(
    "SCHEDULER_SHADOW_MODE",
    scheduler.mode ===
      "SHADOW",
    `mode=${String(
      scheduler.mode ??
        "missing",
    )}`,
  );

  addCheck(
    "SNAPSHOT_HANDOFF_ACTIVE",
    scheduler
      .snapshotSubscriptionActive ===
      true,
    `subscription=${String(
      scheduler
        .snapshotSubscriptionActive,
    )}`,
  );

  addCheck(
    "SNAPSHOT_HANDOFF_NO_DROPS",
    Number(
      scheduler
        .droppedSnapshotEvents,
    ) ===
      0,
    `dropped=${String(
      scheduler
        .droppedSnapshotEvents ??
        "missing",
    )}`,
  );

  addCheck(
    "SCHEDULER_LIVE_DISABLED",
    scheduler
      .liveExecutionAllowed ===
      false,
    `liveExecutionAllowed=${String(
      scheduler
        .liveExecutionAllowed,
    )}`,
  );

  addCheck(
    "DASHBOARD_LIVE_DISABLED",
    dashboard
      .liveExecutionAllowed ===
      false &&
      dashboard
        .safety
        ?.liveExecutionDisabled ===
        true,
    `dashboardLive=${String(
      dashboard
        .liveExecutionAllowed,
    )}`,
  );

  addCheck(
    "PRODUCTION_SAFETY_FAIL_CLOSED",
    productionSafety
      .failClosed ===
      true &&
      productionSafety
        .liveSubmissionAllowed ===
        false,
    `status=${String(
      productionSafety
        .status ??
        "missing",
    )}, liveSubmissionAllowed=${String(
      productionSafety
        .liveSubmissionAllowed,
    )}`,
  );

  addCheck(
    "GO_NO_GO_CANNOT_SUBMIT",
    goNoGo
      .liveTradingEnabled ===
      false &&
      goNoGo
        .liveSubmissionAllowed ===
        false &&
      goNoGo
        .automaticPromotionAllowed ===
        false &&
      goNoGo
        .orderSubmissionPerformed ===
        false &&
      goNoGo
        .capitalReserved ===
        false,
    `decision=${String(
      goNoGo.decision ??
        "missing",
    )}`,
  );

  const targetExchangeCount =
    Number(
      fleet
        .targetExchangeCount,
    );

  const connectedExchangeCount =
    Number(
      fleet
        .summary
        ?.marketDataConnected,
    );

  addCheck(
    "FIVE_EXCHANGE_MARKET_DATA",
    targetExchangeCount ===
      5 &&
      connectedExchangeCount ===
        targetExchangeCount,
    `connected=${String(
      connectedExchangeCount,
    )}/${String(
      targetExchangeCount,
    )}`,
  );

  addCheck(
    "PAPER_ACCOUNT_MODE",
    dashboard
      .safety
      ?.paperAccountMode ===
      true,
    `paperAccountMode=${String(
      dashboard
        .safety
        ?.paperAccountMode,
    )}`,
  );

  addCheck(
    "ACCOUNTING_INTEGRITY",
    dashboard
      .safety
      ?.accountingIntegrityPassed ===
      true,
    `accountingIntegrity=${String(
      dashboard
        .safety
        ?.accountingIntegrityPassed,
    )}`,
  );

  const completedOutcomes =
    Number(
      performance
        .summary
        ?.completed,
    );

  const dashboardOutcomes =
    Number(
      dashboard
        .summary
        ?.completedShadowOutcomes,
    );

  const minimumOutcomes =
    Number(
      performance
        .sampleRequirement
        ?.minimumCompletedOutcomes,
    );

  const paperRequired =
    stage ===
      "paper" ||
    stage ===
      "paper-soak";

  const paperSoakRequired =
    stage ===
    "paper-soak";

  const minimumCrossExchangeVenues =
    2;

  addCheck(
    "SHADOW_EVIDENCE_CONSISTENT",
    Number.isFinite(
      completedOutcomes,
    ) &&
      completedOutcomes >=
        0 &&
      completedOutcomes ===
        dashboardOutcomes,
    `completed=${String(
      completedOutcomes,
    )}, dashboard=${String(
      dashboardOutcomes,
    )}`,
  );

  addCheck(
    "SHADOW_SAMPLE_REQUIREMENT",
    performance
      .sampleRequirement
      ?.requirementMet ===
      true &&
      Number.isFinite(
        minimumOutcomes,
      ) &&
      completedOutcomes >=
        minimumOutcomes,
    `completed=${String(
      completedOutcomes,
    )}, required=${String(
      minimumOutcomes,
    )}`,
    paperRequired,
  );

  addCheck(
    "SHADOW_READY_FOR_PAPER",
    performance
      .readiness
      ?.readyForPaperAutomation ===
      true &&
      dashboard
        .safety
        ?.shadowReadinessPassed ===
        true,
    `level=${String(
      performance
        .readiness
        ?.level ??
        "missing",
    )}`,
    paperRequired,
  );

  addCheck(
    "CROSS_EXCHANGE_PAPER_AVAILABILITY",
    paperShadowReadiness
      .targetExchangeCount ===
      5 &&
      Number(
        paperShadowReadiness
          .summary
          ?.paperAvailableExchanges,
      ) >=
        minimumCrossExchangeVenues,
    `available=${String(
      paperShadowReadiness
        .summary
        ?.paperAvailableExchanges ??
        "missing",
    )}/5; minimum=${minimumCrossExchangeVenues}`,
    paperRequired,
  );

  if (
    stage ===
    "shadow"
  ) {
    addCheck(
      "PAPER_UNARMED_FOR_SHADOW",
      dashboard
        .summary
        ?.paperExecutionArmed ===
        false &&
      dashboard
        .summary
        ?.paperExecutionAllowed ===
        false &&
      paperReadiness
        .summary
        ?.paperExecutionArmed ===
        false,
      `armed=${String(
        dashboard
          .summary
          ?.paperExecutionArmed,
      )}, allowed=${String(
        dashboard
          .summary
          ?.paperExecutionAllowed,
      )}`,
    );

    addCheck(
      "UNIFIED_SHADOW_READINESS",
      paperReadiness
        .readyForShadowDeployment ===
        true,
      `stage=${String(
        paperReadiness.stage ??
          "missing",
      )}`,
    );
  } else {
    addCheck(
      "PAPER_AUTOMATION_ARMED",
      dashboard
        .summary
        ?.paperExecutionArmed ===
        true &&
      paperReadiness
        .summary
        ?.paperExecutionArmed ===
        true,
      `armed=${String(
        dashboard
          .summary
          ?.paperExecutionArmed,
      )}`,
    );

    addCheck(
      "PAPER_EXECUTION_ALLOWED",
      dashboard
        .summary
        ?.paperExecutionAllowed ===
        true &&
      paperReadiness
        .readyForPaperTrading ===
        true,
      `allowed=${String(
        dashboard
          .summary
          ?.paperExecutionAllowed,
      )}, unified=${String(
        paperReadiness
          .readyForPaperTrading,
      )}`,
    );
  }

  addCheck(
    "ATTRIBUTED_PAPER_SOAK",
    paperReadiness
      .readyForPaperSoakReview ===
      true,
    `closed=${String(
      paperReadiness
        .soak
        ?.attributedClosedTrades ??
        "NO_DATA",
    )}/${String(
      paperReadiness
        .soak
        ?.minimumAttributedClosedTrades ??
        "missing",
    )}`,
    paperSoakRequired,
  );

  const failedRequiredChecks =
    checks.filter(
      (check) =>
        check.required &&
        !check.passed,
    );

  return {
    stage,
    passed:
      failedRequiredChecks.length ===
      0,
    checks,
    failedRequiredChecks,
    summary: {
      completedOutcomes:
        Number.isFinite(
          completedOutcomes,
        )
          ? completedOutcomes
          : null,
      minimumOutcomes:
        Number.isFinite(
          minimumOutcomes,
        )
          ? minimumOutcomes
          : null,
      paperAvailableExchanges:
        Number.isFinite(
          Number(
            paperShadowReadiness
              .summary
              ?.paperAvailableExchanges,
          ),
        )
          ? Number(
              paperShadowReadiness
                .summary
                ?.paperAvailableExchanges,
            )
          : null,
      paperExecutionAllowed:
        paperReadiness
          .readyForPaperTrading ===
        true,
      attributedClosedPaperTrades:
        Number.isFinite(
          Number(
            paperReadiness
              .soak
              ?.attributedClosedTrades,
          ),
        ) &&
        paperReadiness
          .soak
          ?.attributedClosedTrades !==
          null
          ? Number(
              paperReadiness
                .soak
                ?.attributedClosedTrades,
            )
          : null,
      liveExecutionAllowed:
        scheduler
          .liveExecutionAllowed !==
        false,
    },
  };
}
