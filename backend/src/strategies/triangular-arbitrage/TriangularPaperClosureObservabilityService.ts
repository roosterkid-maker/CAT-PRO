import type {
  TriangularArbitrageConfiguration,
} from "./TriangularArbitrageConfiguration";

import type {
  TriangularArbitragePathSimulation,
  TriangularArbitrageSimulationSnapshot,
} from "./TriangularArbitrageSimulationEngine";

interface TriangularRuntimeEvidence {
  readonly running: boolean;
  readonly totalSignalsObserved: number;
  readonly currentSignalCount: number;
  readonly lastSignalObservedAt: number | null;
}

interface TriangularAdmissionEvidence {
  readonly generatedAt: number;
  readonly strategyId: string;
  readonly decision: string;
  readonly plan: {readonly id: string} | null;
  readonly blockers: readonly string[];
}

interface TriangularIntakeEvidence {
  readonly generatedAt: number;
  readonly strategyId: string;
  readonly planId: string | null;
  readonly state: string;
  readonly blockers: readonly string[];
}

interface TriangularQueueEvidence {
  readonly updatedAt: number;
  readonly state: string;
  readonly plan: {readonly strategyId: string};
}

export interface TriangularPaperClosureObservabilityPort {
  getConfiguration(): TriangularArbitrageConfiguration;
  getRuntime(now: number): TriangularRuntimeEvidence;
  getSimulation(): TriangularArbitrageSimulationSnapshot | null;
  getLastEconomicallyEvaluableSimulation(): TriangularArbitrageSimulationSnapshot | null;
  getAdmissions(now: number): readonly TriangularAdmissionEvidence[];
  getIntake(now: number): readonly TriangularIntakeEvidence[];
  getQueue(now: number): readonly TriangularQueueEvidence[];
  getAclaCapital?(now: number): unknown;
  getAclaLifecycle?(now: number): unknown;
  getAclaPerformance?(): unknown;
}

export class TriangularPaperClosureObservabilityService {
  constructor(
    private readonly port: TriangularPaperClosureObservabilityPort,
    private readonly recentEvidenceWindowMs = 60_000,
  ) {
    if (!Number.isSafeInteger(recentEvidenceWindowMs) || recentEvidenceWindowMs <= 0) {
      throw new Error("Triangular PAPER closure recent evidence window must be a positive integer.");
    }
  }

  getReport(now = Date.now()) {
    if (!Number.isSafeInteger(now) || now <= 0) {
      throw new Error("Triangular PAPER closure timestamp must be positive.");
    }

    const configuration = this.port.getConfiguration();
    const runtime = this.port.getRuntime(now);
    const currentSimulation = this.port.getSimulation();
    const recentEconomicSimulation = this.port.getLastEconomicallyEvaluableSimulation();
    const recentEconomicCurrent = isCurrent(
      recentEconomicSimulation?.sourceSnapshotGeneratedAt,
      now,
      this.recentEvidenceWindowMs,
    );
    const currentEconomicallyEvaluablePaths = currentSimulation?.simulations.filter(
      (item) => item.netProfitPercent !== null && Number.isFinite(item.netProfitPercent),
    ).length ?? 0;
    const usingRecentEconomic =
      currentEconomicallyEvaluablePaths === 0 &&
      recentEconomicCurrent &&
      (recentEconomicSimulation?.simulations.some((item) =>
        item.netProfitPercent !== null && Number.isFinite(item.netProfitPercent),
      ) ?? false);
    const simulation = usingRecentEconomic
      ? recentEconomicSimulation
      : currentSimulation;
    const paths = simulation?.simulations ?? [];
    const admissions = this.port.getAdmissions(now)
      .filter((item) => item.strategyId === configuration.strategyId);
    const intake = this.port.getIntake(now)
      .filter((item) => item.strategyId === configuration.strategyId);
    const queue = this.port.getQueue(now)
      .filter((item) => item.plan.strategyId === configuration.strategyId);

    const planAdmissions = admissions.filter((item) => item.plan !== null);
    const planIntake = intake.filter((item) => item.planId !== null);
    const latestAdmission = newest(planAdmissions);
    const latestIntake = newest(planIntake);
    const latestAdmissionCurrent = isCurrent(latestAdmission?.generatedAt, now, this.recentEvidenceWindowMs);
    const latestIntakeCurrent = isCurrent(latestIntake?.generatedAt, now, this.recentEvidenceWindowMs);
    const activeQueue = queue.filter((item) => item.state === "QUEUED" || item.state === "LEASED").length;
    const completedQueue = queue.filter((item) => item.state === "COMPLETED").length;

    const bestGross = maximum(paths, (item) => (item.referenceGrossMultiplier - 1) * 100);
    const economicallyEvaluable = paths.filter((item): item is TriangularArbitragePathSimulation & {
      readonly netProfitPercent: number;
    } => item.netProfitPercent !== null && Number.isFinite(item.netProfitPercent));
    const bestNet = maximum(economicallyEvaluable, (item) => item.netProfitPercent);
    const nearestPaths = [...economicallyEvaluable]
      .sort((first, second) => second.netProfitPercent - first.netProfitPercent)
      .slice(0, 5)
      .map(pathSummary);
    const bestNetPercent = bestNet?.netProfitPercent ?? null;
    const thresholdShortfallPercent = bestNetPercent === null
      ? null
      : Math.max(0, configuration.minimumNetProfitPercent - bestNetPercent);
    const blockerCounts = countBlockers(paths);

    const state = !runtime.running || !simulation
      ? "NO_DATA" as const
      : runtime.currentSignalCount === 0
        ? "WAITING_FOR_QUALIFIED_EDGE" as const
        : latestIntakeCurrent && latestIntake?.state === "QUEUED"
          ? "PAPER_QUEUED" as const
          : latestIntakeCurrent && (latestIntake?.state === "BLOCKED" || latestIntake?.state === "FAILED")
            ? "PAPER_BLOCKED" as const
            : latestAdmissionCurrent && latestAdmission?.decision === "SHADOW_SIGNAL_ADMITTED"
              ? "SIGNAL_ADMITTED" as const
              : "SIGNAL_AVAILABLE" as const;

    return freeze({
      version: "87.0" as const,
      generatedAt: now,
      strategyId: configuration.strategyId,
      mode: "TRIANGULAR_PAPER_CLOSURE_OBSERVABILITY" as const,
      state,
      message: this.message(
        state,
        bestNetPercent,
        configuration.minimumNetProfitPercent,
        usingRecentEconomic,
      ),
      controller: {
        running: runtime.running,
        currentSignals: runtime.currentSignalCount,
        totalSignalsObserved: runtime.totalSignalsObserved,
        lastSignalObservedAt: runtime.lastSignalObservedAt,
      },
      economics: {
        evidenceState: usingRecentEconomic
          ? "RECENT_LAST_ECONOMIC" as const
          : simulation
            ? "CURRENT" as const
            : "NO_DATA" as const,
        evidenceAgeMs: simulation === null
          ? null
          : Math.max(0, now - simulation.sourceSnapshotGeneratedAt),
        currentEvaluatedPaths: currentSimulation?.evaluatedPaths ?? 0,
        sourceSnapshotGeneratedAt: simulation?.sourceSnapshotGeneratedAt ?? null,
        evaluatedPaths: simulation?.evaluatedPaths ?? 0,
        economicallyEvaluablePaths: economicallyEvaluable.length,
        grossPositivePaths: paths.filter((item) => item.referenceGrossMultiplier > 1).length,
        netPositivePaths: economicallyEvaluable.filter((item) => item.netProfitPercent > 0).length,
        qualifiedPaths: simulation?.qualifiedPaths ?? 0,
        minimumNetProfitPercent: configuration.minimumNetProfitPercent,
        bestGrossPath: bestGross ? pathSummary(bestGross) : null,
        bestNetPath: bestNet ? pathSummary(bestNet) : null,
        nearestPaths,
        exchanges: exchangeSummaries(paths),
        thresholdShortfallPercent,
        dominantBlockers: blockerCounts.slice(0, 8),
      },
      lineage: {
        admissionsObserved: admissions.length,
        plansAdmitted: planAdmissions.filter((item) => item.decision === "SHADOW_SIGNAL_ADMITTED").length,
        latestPlanAdmissionDecision: latestAdmission?.decision ?? null,
        intakeObserved: intake.length,
        latestPlanIntakeState: latestIntake?.state ?? null,
        latestPlanIntakeBlockers: [...(latestIntake?.blockers ?? [])],
        activeQueue,
        completedQueue,
      },
      fundingPolicy: {
        upfrontWalletBalanceLegs: [1] as const,
        previousLegProceedsFundedLegs: [2, 3] as const,
        startAsset: bestNet?.startAsset ?? bestGross?.startAsset ?? null,
        intermediateWalletBalanceRequired: false,
        previousLegFeeAdjustedProceedsRequired: true,
      },
      acla: {
        strategyName: configuration.strategyName,
        rolloutStage: "SHADOW" as const,
        configuration: {
          fastScreenMinimumGrossProfitPercent: configuration.fastScreenMinimumGrossProfitPercent,
          minimumNetProfitPercent: configuration.minimumNetProfitPercent,
          minimumAbsoluteNetProfitInr: configuration.minimumAbsoluteNetProfitInr,
          maximumOrderBookAgeMs: configuration.maximumOrderBookAgeMs,
          maximumOpportunityAgeMs: configuration.maximumOpportunityAgeMs,
          maximumBookTimestampSkewMs: configuration.maximumBookTimestampSkewMs,
          slippageReservePercent: configuration.slippageReservePercent,
          adverseMoveReservePercent: configuration.adverseMoveReservePercent,
          safetyBufferPercent: configuration.safetyBufferPercent,
          tdsCapitalLockPercent: configuration.tdsCapitalLockPercent,
          routeCooldownMs: configuration.routeCooldownMs,
          maximumCyclesPerHour: configuration.maximumCyclesPerHour,
          allowedExchanges: configuration.allowedExchanges,
          allowedStartingAssets: configuration.allowedStartingAssets,
        },
        capital: this.port.getAclaCapital?.(now) ?? null,
        lifecycle: this.port.getAclaLifecycle?.(now) ?? null,
        performance: this.port.getAclaPerformance?.() ?? null,
      },
      safety: {
        readOnlyAggregation: true,
        genuineMarketPathsOnly: true,
        feesAndRulesRemainRequired: true,
        profitabilityThresholdMutated: false,
        signalFabricationAllowed: false,
        paperExecutionTriggeredByRead: false,
        liveExecutionAllowed: false,
        orderSubmissionAllowed: false,
      },
    });
  }

  private message(
    state: "NO_DATA" | "WAITING_FOR_QUALIFIED_EDGE" | "SIGNAL_AVAILABLE" | "SIGNAL_ADMITTED" | "PAPER_BLOCKED" | "PAPER_QUEUED",
    bestNetPercent: number | null,
    threshold: number,
    usingRecentEconomic: boolean,
  ): string {
    if (state === "NO_DATA") return "Triangular controller or simulation evidence is unavailable; readiness is not inferred.";
    if (state === "WAITING_FOR_QUALIFIED_EDGE") {
      if (usingRecentEconomic) {
        return bestNetPercent === null
          ? "The current scan has no complete route economics; the latest bounded economic scan is also incomplete."
          : bestNetPercent >= threshold
            ? `The current scan has no complete route economics; a bounded historical scan reached ${formatPercent(bestNetPercent)}, but it is not a current signal.`
            : `The current scan has no complete route economics; the latest bounded economic scan's best net edge ${formatPercent(bestNetPercent)} remained below required ${formatPercent(threshold)}.`;
      }
      return bestNetPercent === null
        ? "Paths are being evaluated, but no path currently has complete fee/rule/depth economics."
        : bestNetPercent >= threshold
          ? `A qualifying edge reached ${formatPercent(bestNetPercent)} in the selected scan, but no current signal remains.`
          : `Paths are being evaluated; best net edge ${formatPercent(bestNetPercent)} is below required ${formatPercent(threshold)}.`;
    }
    if (state === "SIGNAL_AVAILABLE") return "A current fee/rule/depth-qualified triangular signal is available for central admission.";
    if (state === "SIGNAL_ADMITTED") return "A current triangular signal has plan-bearing central admission evidence.";
    if (state === "PAPER_BLOCKED") return "A triangular plan reached central PAPER intake and remains fail-closed on current runtime evidence.";
    return "A triangular plan is present in the durable central PAPER queue.";
  }
}

function pathSummary(path: TriangularArbitragePathSimulation) {
  return {
    pathId: path.pathId,
    exchange: path.exchange,
    assets: [...path.assets],
    grossProfitPercent: path.referenceGrossProfitPercent,
    referenceFeeAdjustedProfitPercent: path.referenceFeeAdjustedProfitPercent,
    feeDragPercent: path.feeDragPercent,
    quantizationDragPercent: path.quantizationDragPercent,
    netProfitPercent: path.netProfitPercent,
    expectedNetProfitQuantity: path.expectedNetProfitQuantity,
    expectedNetProfitPercent: path.expectedNetProfitPercent,
    stressNetProfitQuantity: path.stressNetProfitQuantity,
    stressNetProfitPercent: path.stressNetProfitPercent,
    absoluteNetProfitInr: path.absoluteNetProfitInr,
    startAssetInrValue: path.startAssetInrValue,
    tdsCapitalLockInr: path.tdsCapitalLockInr,
    reserveDragPercent: path.reserveDragPercent,
    maximumBookSkewMs: path.maximumBookSkewMs,
    initialSizingLimitQuantity: path.initialSizingLimitQuantity,
    initialInputQuantity: path.initialInputQuantity,
    retainedStartQuantity: path.retainedStartQuantity,
    capitalUtilizationPercent: path.capitalUtilizationPercent,
    finalOutputQuantity: path.finalOutputQuantity,
    status: path.status,
    blockers: [...path.blockers],
    legs: path.legs.map((leg) => ({
      market: leg.market,
      fromAsset: leg.fromAsset,
      toAsset: leg.toAsset,
      action: leg.action,
      inputQuantity: leg.inputQuantity,
      tradedInputQuantity: leg.tradedInputQuantity,
      feePercent: leg.feePercent,
      feeAmount: leg.feeAmount,
      feeAsset: leg.feeAsset,
      outputAfterFee: leg.outputAfterFee,
      averageFillPrice: leg.averageFillPrice,
      topOfBookPrice: leg.topOfBookPrice,
      depthSlippagePercent: leg.depthSlippagePercent,
      roundingDustInputQuantity: leg.roundingDustInputQuantity,
      consumedDepthLevels: leg.consumedDepthLevels,
      orderBookAgeMs: leg.orderBookAgeMs,
      executionPolicy: leg.executionPolicy,
    })),
  };
}

function exchangeSummaries(paths: readonly TriangularArbitragePathSimulation[]) {
  const exchanges = new Map<string, TriangularArbitragePathSimulation[]>();
  for (const path of paths) {
    const current = exchanges.get(path.exchange) ?? [];
    current.push(path);
    exchanges.set(path.exchange, current);
  }
  return [...exchanges.entries()]
    .map(([exchange, exchangePaths]) => {
      const evaluable = exchangePaths.filter((item): item is TriangularArbitragePathSimulation & {
        readonly netProfitPercent: number;
      } => item.netProfitPercent !== null && Number.isFinite(item.netProfitPercent));
      const best = maximum(evaluable, (item) => item.netProfitPercent);
      return {
        exchange,
        evaluatedPaths: exchangePaths.length,
        economicallyEvaluablePaths: evaluable.length,
        grossPositivePaths: exchangePaths.filter((item) => item.referenceGrossMultiplier > 1).length,
        netPositivePaths: evaluable.filter((item) => item.netProfitPercent > 0).length,
        qualifiedPaths: exchangePaths.filter((item) => item.status === "QUALIFIED").length,
        bestNetProfitPercent: best?.netProfitPercent ?? null,
      };
    })
    .sort((first, second) =>
      (second.bestNetProfitPercent ?? Number.NEGATIVE_INFINITY) -
        (first.bestNetProfitPercent ?? Number.NEGATIVE_INFINITY) ||
      first.exchange.localeCompare(second.exchange),
    );
}

function countBlockers(paths: readonly TriangularArbitragePathSimulation[]) {
  const counts = new Map<string, number>();
  for (const path of paths) {
    for (const blocker of path.blockers) counts.set(blocker, (counts.get(blocker) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([code, count]) => ({code, count}))
    .sort((first, second) => second.count - first.count || first.code.localeCompare(second.code));
}

function maximum<T>(values: readonly T[], score: (value: T) => number): T | null {
  let selected: T | null = null;
  let selectedScore = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    const current = score(value);
    if (Number.isFinite(current) && current > selectedScore) {
      selected = value;
      selectedScore = current;
    }
  }
  return selected;
}

function newest<T extends {readonly generatedAt: number}>(values: readonly T[]): T | null {
  return [...values].sort((first, second) => second.generatedAt - first.generatedAt)[0] ?? null;
}

function isCurrent(timestamp: number | undefined, now: number, maximumAgeMs: number): boolean {
  return timestamp !== undefined && timestamp <= now && now - timestamp <= maximumAgeMs;
}

function formatPercent(value: number): string {
  return `${value.toFixed(4)}%`;
}

function freeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freeze(nested);
  return Object.freeze(value);
}
