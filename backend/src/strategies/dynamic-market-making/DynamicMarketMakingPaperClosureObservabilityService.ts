import type {
  ExchangeBalanceSnapshot,
} from "../../trading/account/TradingAccountService";

import type {
  DynamicMarketMakingConfiguration,
} from "./DynamicMarketMakingConfiguration";

import type {
  DynamicMarketMakingAssessment,
  DynamicMarketMakingSnapshot,
} from "./DynamicMarketMakingEngine";

interface DynamicRuntimeEvidence {
  readonly running: boolean;
  readonly totalSignalsObserved: number;
  readonly currentSignalCount: number;
  readonly lastSignalObservedAt: number | null;
}

interface DynamicAdmissionEvidence {
  readonly generatedAt: number;
  readonly strategyId: string;
  readonly decision: string;
  readonly plan: {readonly id: string} | null;
}

interface DynamicIntakeEvidence {
  readonly generatedAt: number;
  readonly strategyId: string;
  readonly planId: string | null;
  readonly state: string;
  readonly blockers: readonly string[];
}

interface DynamicQueueEvidence {
  readonly updatedAt: number;
  readonly state: string;
  readonly plan: {readonly strategyId: string};
}

export interface DynamicMarketMakingPaperClosurePort {
  getConfiguration(): DynamicMarketMakingConfiguration;
  getRuntime(now: number): DynamicRuntimeEvidence;
  getSnapshot(): DynamicMarketMakingSnapshot | null;
  getBalances(): readonly ExchangeBalanceSnapshot[];
  getAdmissions(now: number): readonly DynamicAdmissionEvidence[];
  getIntake(now: number): readonly DynamicIntakeEvidence[];
  getQueue(now: number): readonly DynamicQueueEvidence[];
}

export type DynamicMarketMakingPaperClosureState =
  | "NO_DATA"
  | "CAPABILITY_EVIDENCE_BLOCKED"
  | "INVENTORY_EVIDENCE_BLOCKED"
  | "WAITING_FOR_EMPIRICAL_FILL"
  | "WAITING_FOR_MODELED_EDGE"
  | "SIGNAL_AVAILABLE"
  | "SIGNAL_ADMITTED"
  | "PAPER_BLOCKED"
  | "PAPER_QUEUED";

const CAPABILITY_BLOCKERS = new Set([
  "CAPABILITY_MISSING",
  "CAPABILITY_STALE",
  "FEE_EVIDENCE_MISSING",
  "POST_ONLY_UNSUPPORTED",
  "MARKET_RULES_INCOMPLETE",
]);

const INVENTORY_BLOCKERS = new Set([
  "INVENTORY_EVIDENCE_MISSING",
  "INVENTORY_EVIDENCE_STALE",
  "INVENTORY_CAPACITY_INSUFFICIENT",
]);

export class DynamicMarketMakingPaperClosureObservabilityService {
  constructor(
    private readonly port: DynamicMarketMakingPaperClosurePort,
    private readonly recentEvidenceWindowMs = 60_000,
  ) {
    if (!Number.isSafeInteger(recentEvidenceWindowMs) || recentEvidenceWindowMs <= 0) {
      throw new Error("Dynamic market-making PAPER closure recent evidence window must be a positive integer.");
    }
  }

  getReport(now = Date.now()) {
    if (!Number.isSafeInteger(now) || now <= 0) {
      throw new Error("Dynamic market-making PAPER closure timestamp must be positive.");
    }

    const configuration = this.port.getConfiguration();
    const runtime = this.port.getRuntime(now);
    const snapshot = this.port.getSnapshot();
    const assessments = snapshot?.assessments ?? [];
    const bookReady = assessments.filter((item) => item.diagnostics.book !== null);
    const capabilityReady = bookReady.filter((item) =>
      item.diagnostics.capability !== null && !hasBlocker(item, CAPABILITY_BLOCKERS));
    const inventoryReady = capabilityReady.filter((item) =>
      item.diagnostics.inventory !== null && !hasBlocker(item, INVENTORY_BLOCKERS));
    const publicTradeReady = inventoryReady.filter((item) => {
      const fill = item.diagnostics.fillQuality;
      return fill !== null && fill.sampleCount >= fill.minimumSamples &&
        !item.blockers.includes("PUBLIC_TRADE_EVIDENCE_INSUFFICIENT");
    });
    const fillProbabilityReady = publicTradeReady.filter((item) => {
      const fill = item.diagnostics.fillQuality;
      return fill !== null && fill.bidFillProbabilityPercent !== null && fill.askFillProbabilityPercent !== null &&
        Math.min(fill.bidFillProbabilityPercent, fill.askFillProbabilityPercent) >= fill.minimumFillProbabilityPercent &&
        !item.blockers.includes("EMPIRICAL_FILL_PROBABILITY_THRESHOLD_NOT_MET");
    });
    const economicallyEvaluable = assessments.filter((item) => item.diagnostics.economics !== null);
    const bestFill = maximum(
      assessments.filter((item) => {
        const fill = item.diagnostics.fillQuality;
        return fill !== null && fill.bidFillProbabilityPercent !== null &&
          fill.askFillProbabilityPercent !== null;
      }),
      (item) => Math.min(
        item.diagnostics.fillQuality!.bidFillProbabilityPercent!,
        item.diagnostics.fillQuality!.askFillProbabilityPercent!,
      ),
    );
    const bestNet = maximum(economicallyEvaluable, (item) =>
      item.diagnostics.economics!.modeledNetCapturePercent);
    const mostAdvanced = maximum(assessments, stageScore);

    const balances = this.port.getBalances()
      .filter((item) => configuration.exchanges.includes(item.exchange))
      .map((item) => ({
        exchange: item.exchange,
        asset: item.asset,
        availableBalance: item.availableBalance,
        totalBalance: item.totalBalance,
        synchronizedAt: item.synchronizedAt,
        ageMs: Math.max(0, now - item.synchronizedAt),
        fresh: item.synchronizedAt <= now &&
          now - item.synchronizedAt <= configuration.maximumInventoryEvidenceAgeMs,
      }));

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

    const state: DynamicMarketMakingPaperClosureState = !runtime.running || !snapshot
      ? "NO_DATA"
      : activeQueue > 0 || (latestIntakeCurrent && latestIntake?.state === "QUEUED")
        ? "PAPER_QUEUED"
        : latestIntakeCurrent && (latestIntake?.state === "BLOCKED" || latestIntake?.state === "FAILED")
          ? "PAPER_BLOCKED"
          : bookReady.length > 0 && capabilityReady.length === 0
            ? "CAPABILITY_EVIDENCE_BLOCKED"
            : capabilityReady.length > 0 && inventoryReady.length === 0
              ? "INVENTORY_EVIDENCE_BLOCKED"
              : inventoryReady.length > 0 && publicTradeReady.length === 0
                ? "WAITING_FOR_EMPIRICAL_FILL"
                : runtime.currentSignalCount > 0 && latestAdmissionCurrent &&
                    latestAdmission?.decision === "SHADOW_SIGNAL_ADMITTED"
                  ? "SIGNAL_ADMITTED"
                  : runtime.currentSignalCount > 0
                    ? "SIGNAL_AVAILABLE"
                    : "WAITING_FOR_MODELED_EDGE";

    return freeze({
      version: "72.0" as const,
      generatedAt: now,
      strategyId: configuration.strategyId,
      mode: "DYNAMIC_MARKET_MAKING_PAPER_CLOSURE_OBSERVABILITY" as const,
      state,
      message: message(state, capabilityReady.length, inventoryReady.length, bestFill, bestNet),
      controller: {
        running: runtime.running,
        currentSignals: runtime.currentSignalCount,
        totalSignalsObserved: runtime.totalSignalsObserved,
        lastSignalObservedAt: runtime.lastSignalObservedAt,
      },
      funnel: {
        evaluatedMarkets: snapshot?.evaluatedMarkets ?? 0,
        bookReadyMarkets: bookReady.length,
        capabilityReadyMarkets: capabilityReady.length,
        inventoryReadyMarkets: inventoryReady.length,
        publicTradeReadyMarkets: publicTradeReady.length,
        fillProbabilityReadyMarkets: fillProbabilityReady.length,
        economicallyEvaluableMarkets: economicallyEvaluable.length,
        qualifiedMarkets: snapshot?.qualifiedMarkets ?? 0,
      },
      thresholds: {
        targetQuoteNotional: configuration.targetQuoteNotional,
        minimumVolatilitySamples: configuration.minimumSamples,
        minimumPublicTradeSamples: configuration.minimumPublicTradeSamples,
        minimumEmpiricalFillProbabilityPercent: configuration.minimumEmpiricalFillProbabilityPercent,
        minimumModeledNetCapturePercent: configuration.minimumModeledNetCapturePercent,
        minimumLiquidityCoverageMultiple: configuration.minimumLiquidityCoverageMultiple,
        inventoryTargetBasePercent: configuration.inventoryTargetBasePercent,
      },
      routes: {
        mostAdvancedRoute: mostAdvanced ? routeSummary(mostAdvanced) : null,
        bestFillRoute: bestFill ? routeSummary(bestFill) : null,
        bestNetRoute: bestNet ? routeSummary(bestNet) : null,
        marketReadiness: assessments.map(routeSummary),
        dominantBlockers: countBlockers(assessments).slice(0, 8),
      },
      inventoryEvidence: {
        synchronizedBalances: balances.length,
        freshBalances: balances.filter((item) => item.fresh).length,
        exchangesWithBalances: new Set(balances.map((item) => item.exchange)).size,
        balances,
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
      safety: {
        readOnlyAggregation: true,
        authenticatedInventoryOnly: true,
        inventoryNeutralEvidenceOnly: true,
        postOnlyRequired: true,
        queuePositionKnown: false,
        fillProbabilityInferred: false,
        modeledCaptureGuaranteed: false,
        balanceInferenceAllowed: false,
        profitabilityThresholdMutated: false,
        signalFabricationAllowed: false,
        paperExecutionTriggeredByRead: false,
        liveExecutionAllowed: false,
        orderSubmissionAllowed: false,
      },
    });
  }
}

function routeSummary(assessment: DynamicMarketMakingAssessment) {
  return {
    routeId: assessment.id,
    exchange: assessment.exchange,
    market: assessment.market,
    status: assessment.status,
    blockers: [...assessment.blockers],
    diagnostics: structuredClone(assessment.diagnostics),
  };
}

function hasBlocker(assessment: DynamicMarketMakingAssessment, blockers: ReadonlySet<string>): boolean {
  return assessment.blockers.some((blocker) => blockers.has(blocker));
}

function stageScore(assessment: DynamicMarketMakingAssessment): number {
  const diagnostics = assessment.diagnostics;
  return Number(diagnostics.book !== null) +
    Number(diagnostics.capability !== null && !hasBlocker(assessment, CAPABILITY_BLOCKERS)) * 2 +
    Number(diagnostics.inventory !== null && !hasBlocker(assessment, INVENTORY_BLOCKERS)) * 4 +
    Number(diagnostics.fillQuality !== null) * 8 +
    Number(diagnostics.economics !== null) * 16 +
    Number(assessment.status === "QUALIFIED") * 32;
}

function message(
  state: DynamicMarketMakingPaperClosureState,
  capabilityReady: number,
  inventoryReady: number,
  bestFill: DynamicMarketMakingAssessment | null,
  bestNet: DynamicMarketMakingAssessment | null,
): string {
  if (state === "NO_DATA") return "Strategy #7 controller or market-making evidence is unavailable; readiness is not inferred.";
  if (state === "CAPABILITY_EVIDENCE_BLOCKED") return "No current market has complete post-only capability, rules and explicit maker-fee evidence.";
  if (state === "INVENTORY_EVIDENCE_BLOCKED") return `${capabilityReady} market(s) passed capability gates, but ${inventoryReady} have fresh authenticated base-and-quote inventory evidence.`;
  if (state === "WAITING_FOR_EMPIRICAL_FILL") return "Inventory-ready markets are waiting for the minimum bounded public trade-tape sample count.";
  if (state === "WAITING_FOR_MODELED_EDGE") {
    const fill = bestFill?.diagnostics.fillQuality;
    const minimumFill = fill && fill.bidFillProbabilityPercent !== null && fill.askFillProbabilityPercent !== null
      ? Math.min(fill.bidFillProbabilityPercent, fill.askFillProbabilityPercent)
      : null;
    const net = bestNet?.diagnostics.economics?.modeledNetCapturePercent;
    return `Best empirical two-sided fill ${minimumFill === null ? "NO_DATA" : formatPercent(minimumFill)}; best modeled net ${net === undefined ? "NO_DATA" : formatPercent(net)} remains unqualified.`;
  }
  if (state === "SIGNAL_AVAILABLE") return "A current inventory-adjusted, empirically fill-qualified passive quote plan is available for central admission.";
  if (state === "SIGNAL_ADMITTED") return "A current Strategy #7 quote plan has plan-bearing central admission evidence.";
  if (state === "PAPER_BLOCKED") return "A Strategy #7 plan reached central PAPER intake and remains fail-closed on current runtime evidence.";
  return "A Strategy #7 plan is present in the durable central PAPER queue.";
}

function countBlockers(assessments: readonly DynamicMarketMakingAssessment[]) {
  const counts = new Map<string, number>();
  for (const assessment of assessments) {
    for (const blocker of assessment.blockers) counts.set(blocker, (counts.get(blocker) ?? 0) + 1);
  }
  return [...counts.entries()].map(([code, count]) => ({code, count}))
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
