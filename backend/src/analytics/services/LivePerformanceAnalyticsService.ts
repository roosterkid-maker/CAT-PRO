import {
  arbitragePnLService,
} from "../../arbitrage/metrics/ArbitragePnLService";

import {
  liveExecutionCoordinator,
} from "../../execution/live/coordinator/LiveExecutionCoordinator";

import type {
  LiveExecutionSession,
} from "../../execution/live/coordinator/LiveExecutionSession";

import {
  executionHistoryService,
} from "../../execution/live/history/ExecutionHistoryService";

import type {
  ExecutionHistoryItem,
} from "../../execution/live/history/ExecutionHistoryService";

import type {
  ExchangeExecutionMetrics,
} from "../../execution/live/metrics/ExecutionMetrics";

import {
  executionMetricsService,
} from "../../execution/live/metrics/ExecutionMetricsService";

import type {
  ExecutionSettlementRecord,
} from "../../execution/live/settlement/ExecutionSettlementRecord";

import {
  executionSettlementService,
} from "../../execution/live/settlement/ExecutionSettlementService";

import type {
  ExchangePairPerformanceRecord,
  ExpectedVsRealizedCycle,
  ExpectedVsRealizedSummary,
  LivePerformanceAnalyticsReport,
  LivePerformanceEvidenceStatus,
  LivePerformanceSlippageSummary,
  PerformanceEvidenceLevel,
  RoutePerformanceRecord,
  RoutePerformanceSummary,
} from "../models/LivePerformanceAnalytics";

const EXECUTION_HISTORY_SAMPLE_LIMIT =
  100;

const EXPECTED_VS_REALIZED_RECENT_LIMIT =
  50;

const MINIMUM_DEVELOPING_SAMPLES =
  5;

const MINIMUM_ESTABLISHED_SAMPLES =
  20;

interface ExpectedVsRealizedBuildResult {
  summary: ExpectedVsRealizedSummary;

  cycles: ExpectedVsRealizedCycle[];
}

export class LivePerformanceAnalyticsService {
  async getReport():
  Promise<LivePerformanceAnalyticsReport> {
    const executionMetrics =
      executionMetricsService
        .getReport();

    const pnl =
      arbitragePnLService
        .getReport(
          EXECUTION_HISTORY_SAMPLE_LIMIT,
        );

    const history =
      await executionHistoryService
        .getRecent(
          EXECUTION_HISTORY_SAMPLE_LIMIT,
        );

    const coordinator =
      liveExecutionCoordinator
        .getDiagnostics();

    const settlements =
      executionSettlementService
        .getDiagnostics();

    const execution =
      this.buildExecutionSummary(
        executionMetrics.exchanges,
      );

    const slippage =
      this.buildSlippageSummary(
        history.executions,
      );

    const expectedVsRealizedBuild =
      this.buildExpectedVsRealized(
        coordinator.sessions,
        settlements.settlements,
      );

    const expectedVsRealized =
      expectedVsRealizedBuild.summary;

    const routePerformance =
      this.buildRoutePerformance(
        expectedVsRealizedBuild.cycles,
      );

    const executionMetricsAvailable =
      executionMetrics.totalExecutions >
      0;

    const pnlRecordsAvailable =
      pnl.totalCycles >
      0;

    const slippageSamplesAvailable =
      slippage.sampledExecutions >
      0;

    const expectedVsRealizedAvailable =
      expectedVsRealized.matchedCycles >
      0;

    const routePerformanceAvailable =
      routePerformance.routesObserved >
      0;

    const establishedRouteEvidenceAvailable =
      routePerformance.establishedRoutes >
        0 ||
      routePerformance
        .establishedExchangePairs >
        0;

    const evidenceStatus =
      this.resolveEvidenceStatus([
        executionMetricsAvailable,
        pnlRecordsAvailable,
        slippageSamplesAvailable,
        expectedVsRealizedAvailable,
        routePerformanceAvailable,
      ]);

    return {
      generatedAt:
        Date.now(),

      version:
        "17.6",

      evidenceStatus,

      liveTradingEnabled:
        false,

      analyticsOnly:
        true,

      execution,

      pnl: {
        totalCycles:
          pnl.totalCycles,

        completedCycles:
          pnl.completedCycles,

        profitableCycles:
          pnl.profitableCycles,

        lossCycles:
          pnl.lossCycles,

        recoveryRequiredCycles:
          pnl.recoveryRequiredCycles,

        grossProfit:
          pnl.grossProfit,

        totalFees:
          pnl.totalFees,

        netProfit:
          pnl.netProfit,

        averageNetProfit:
          pnl.averageNetProfit,

        winRatePercent:
          pnl.winRatePercent,
      },

      slippage,

      expectedVsRealized,

      routePerformance,

      exchanges:
        executionMetrics.exchanges.map(
          (
            exchange,
          ) => ({
            exchange:
              exchange.exchange,

            totalExecutions:
              exchange.totalExecutions,

            fillRatePercent:
              exchange.fillRatePercent,

            partialFillRatePercent:
              this.percent(
                exchange.partialFillExecutions,
                exchange.totalExecutions,
              ),

            failureRatePercent:
              exchange.failureRatePercent,

            timeoutRatePercent:
              exchange.timeoutRatePercent,

            averageExecutionTimeMs:
              this.round(
                exchange.averageExecutionTimeMs,
              ),

            lastExecutionAt:
              exchange.lastExecutionAt,
          }),
        ),

      evidence: {
        executionMetricsAvailable,

        pnlRecordsAvailable,

        slippageSamplesAvailable,

        expectedVsRealizedAvailable,

        routePerformanceAvailable,

        establishedRouteEvidenceAvailable,

        recentExecutionHistorySampleSize:
          history.total,
      },

      notes:
        this.buildNotes(
          executionMetricsAvailable,
          pnlRecordsAvailable,
          slippageSamplesAvailable,
          expectedVsRealizedAvailable,
          routePerformanceAvailable,
          establishedRouteEvidenceAvailable,
        ),
    };
  }

  private buildExpectedVsRealized(
    sessions:
      readonly LiveExecutionSession[],

    settlements:
      readonly ExecutionSettlementRecord[],
  ): ExpectedVsRealizedBuildResult {
    const nonDryRunSessions =
      sessions.filter(
        (
          session,
        ) =>
          !liveExecutionCoordinator
            .isDryRunSession(
              session.id,
            ),
      );

    const sessionsById =
      new Map(
        nonDryRunSessions.map(
          (
            session,
          ) => [
            session.id,
            session,
          ] as const,
        ),
      );

    const settledRealExecutions =
      settlements.filter(
        (
          settlement,
        ) =>
          settlement.status ===
            "SETTLED" &&
          !liveExecutionCoordinator
            .isDryRunSession(
              settlement.sessionId,
            ),
      );

    const cycles:
      ExpectedVsRealizedCycle[] = [];

    let unmatchedSettlements =
      0;

    const matchedSessionIds =
      new Set<string>();

    for (
      const settlement
      of settledRealExecutions
    ) {
      const session =
        sessionsById.get(
          settlement.sessionId,
        );

      if (
        !session
      ) {
        unmatchedSettlements +=
          1;

        continue;
      }

      const expectedNetProfit =
        this.resolveExpectedNetProfit(
          session,
        );

      if (
        expectedNetProfit ===
        null
      ) {
        unmatchedSettlements +=
          1;

        continue;
      }

      matchedSessionIds.add(
        session.id,
      );

      const expectedFees =
        this.optionalFiniteNumber(
          session.plan.expectedFees,
        );

      const profitVariance =
        settlement.netProfit -
        expectedNetProfit;

      const profitRetentionPercent =
        expectedNetProfit >
        0
          ? this.round(
              settlement.netProfit /
                expectedNetProfit *
                100,
            )
          : null;

      const feeVariance =
        expectedFees !==
        null
          ? settlement.totalFees -
            expectedFees
          : null;

      cycles.push({
        sessionId:
          session.id,

        planId:
          session.planId,

        market:
          session.market,

        buyExchange:
          session.buyExchange,

        sellExchange:
          session.sellExchange,

        capital:
          session.capital,

        expectedNetProfit:
          this.round(
            expectedNetProfit,
          ),

        realizedGrossProfit:
          this.round(
            settlement.grossProfit,
          ),

        realizedNetProfit:
          this.round(
            settlement.netProfit,
          ),

        profitVariance:
          this.round(
            profitVariance,
          ),

        profitRetentionPercent,

        expectedFees:
          expectedFees !==
          null
            ? this.round(
                expectedFees,
              )
            : null,

        realizedFees:
          this.round(
            settlement.totalFees,
          ),

        feeVariance:
          feeVariance !==
          null
            ? this.round(
                feeVariance,
              )
            : null,

        expectedProfitPercent:
          this.round(
            this.resolveExpectedProfitPercent(
              session,
            ),
          ),

        realizedRoiPercent:
          this.round(
            settlement.roiPercent,
          ),

        totalAdverseSlippagePercent:
          this.round(
            settlement
              .totalAdverseSlippagePercent,
          ),

        executionDurationMs:
          settlement
            .executionDurationMs,

        settledAt:
          settlement.settledAt ??
          settlement.createdAt,
      });
    }

    cycles.sort(
      (
        first,
        second,
      ) =>
        second.settledAt -
        first.settledAt,
    );

    const unmatchedSessions =
      nonDryRunSessions.filter(
        (
          session,
        ) =>
          session.status ===
            "COMPLETED" &&
          !matchedSessionIds.has(
            session.id,
          ),
      ).length;

    const totalExpectedNetProfit =
      cycles.reduce(
        (
          total,
          cycle,
        ) =>
          total +
          cycle.expectedNetProfit,
        0,
      );

    const totalRealizedNetProfit =
      cycles.reduce(
        (
          total,
          cycle,
        ) =>
          total +
          cycle.realizedNetProfit,
        0,
      );

    const retentionSamples =
      cycles
        .map(
          (
            cycle,
          ) =>
            cycle
              .profitRetentionPercent,
        )
        .filter(
          (
            value,
          ): value is number =>
            value !==
            null,
        );

    const feeComparableCycles =
      cycles.filter(
        (
          cycle,
        ) =>
          cycle.expectedFees !==
          null,
      );

    const expectedFees =
      feeComparableCycles.reduce(
        (
          total,
          cycle,
        ) =>
          total +
          (
            cycle.expectedFees ??
            0
          ),
        0,
      );

    const realizedFees =
      feeComparableCycles.reduce(
        (
          total,
          cycle,
        ) =>
          total +
          cycle.realizedFees,
        0,
      );

    return {
      cycles,

      summary: {
        matchedCycles:
          cycles.length,

        unmatchedSettlements,

        unmatchedSessions,

        totalExpectedNetProfit:
          this.round(
            totalExpectedNetProfit,
          ),

        totalRealizedNetProfit:
          this.round(
            totalRealizedNetProfit,
          ),

        totalProfitVariance:
          this.round(
            totalRealizedNetProfit -
              totalExpectedNetProfit,
          ),

        aggregateProfitRetentionPercent:
          totalExpectedNetProfit >
          0
            ? this.round(
                totalRealizedNetProfit /
                  totalExpectedNetProfit *
                  100,
              )
            : null,

        averageProfitRetentionPercent:
          retentionSamples.length >
          0
            ? this.round(
                retentionSamples.reduce(
                  (
                    total,
                    value,
                  ) =>
                    total +
                    value,
                  0,
                ) /
                  retentionSamples.length,
              )
            : null,

        cyclesMeetingOrBeatingExpectation:
          cycles.filter(
            (
              cycle,
            ) =>
              cycle.profitVariance >=
              0,
          ).length,

        cyclesBelowExpectation:
          cycles.filter(
            (
              cycle,
            ) =>
              cycle.profitVariance <
              0,
          ).length,

        expectedFees:
          this.round(
            expectedFees,
          ),

        realizedFees:
          this.round(
            realizedFees,
          ),

        feeVariance:
          this.round(
            realizedFees -
              expectedFees,
          ),

        latest:
          cycles.slice(
            0,
            EXPECTED_VS_REALIZED_RECENT_LIMIT,
          ),
      },
    };
  }

  private buildRoutePerformance(
    cycles:
      readonly ExpectedVsRealizedCycle[],
  ): RoutePerformanceSummary {
    const routes =
      new Map<
        string,
        ExpectedVsRealizedCycle[]
      >();

    const exchangePairs =
      new Map<
        string,
        ExpectedVsRealizedCycle[]
      >();

    for (
      const cycle
      of cycles
    ) {
      const routeKey =
        this.routeKey(
          cycle,
        );

      const routeCycles =
        routes.get(
          routeKey,
        ) ??
        [];

      routeCycles.push(
        cycle,
      );

      routes.set(
        routeKey,
        routeCycles,
      );

      const exchangePairKey =
        this.exchangePairKey(
          cycle,
        );

      const pairCycles =
        exchangePairs.get(
          exchangePairKey,
        ) ??
        [];

      pairCycles.push(
        cycle,
      );

      exchangePairs.set(
        exchangePairKey,
        pairCycles,
      );
    }

    const routeRecords =
      Array.from(
        routes.entries(),
      )
        .map(
          (
            [
              routeKey,
              routeCycles,
            ],
          ) =>
            this.buildRouteRecord(
              routeKey,
              routeCycles,
            ),
        )
        .sort(
          (
            first,
            second,
          ) =>
            second.matchedCycles -
              first.matchedCycles ||
            second.totalRealizedNetProfit -
              first.totalRealizedNetProfit,
        );

    const exchangePairRecords =
      Array.from(
        exchangePairs.entries(),
      )
        .map(
          (
            [
              exchangePairKey,
              pairCycles,
            ],
          ) =>
            this.buildExchangePairRecord(
              exchangePairKey,
              pairCycles,
            ),
        )
        .sort(
          (
            first,
            second,
          ) =>
            second.matchedCycles -
              first.matchedCycles ||
            second.totalRealizedNetProfit -
              first.totalRealizedNetProfit,
        );

    return {
      minimumEstablishedSamples:
        MINIMUM_ESTABLISHED_SAMPLES,

      routesObserved:
        routeRecords.length,

      establishedRoutes:
        routeRecords.filter(
          (
            route,
          ) =>
            route.evidenceLevel ===
            "ESTABLISHED",
        ).length,

      developingRoutes:
        routeRecords.filter(
          (
            route,
          ) =>
            route.evidenceLevel ===
            "DEVELOPING",
        ).length,

      insufficientRoutes:
        routeRecords.filter(
          (
            route,
          ) =>
            route.evidenceLevel ===
            "INSUFFICIENT",
        ).length,

      routes:
        routeRecords,

      exchangePairsObserved:
        exchangePairRecords.length,

      establishedExchangePairs:
        exchangePairRecords.filter(
          (
            pair,
          ) =>
            pair.evidenceLevel ===
            "ESTABLISHED",
        ).length,

      developingExchangePairs:
        exchangePairRecords.filter(
          (
            pair,
          ) =>
            pair.evidenceLevel ===
            "DEVELOPING",
        ).length,

      insufficientExchangePairs:
        exchangePairRecords.filter(
          (
            pair,
          ) =>
            pair.evidenceLevel ===
            "INSUFFICIENT",
        ).length,

      exchangePairs:
        exchangePairRecords,
    };
  }

  private buildRouteRecord(
    routeKey:
      string,

    cycles:
      readonly ExpectedVsRealizedCycle[],
  ): RoutePerformanceRecord {
    const first =
      cycles[0];

    const aggregates =
      this.aggregateCycles(
        cycles,
      );

    return {
      routeKey,

      market:
        first.market,

      buyExchange:
        first.buyExchange,

      sellExchange:
        first.sellExchange,

      evidenceLevel:
        this.resolvePerformanceEvidenceLevel(
          cycles.length,
        ),

      ...aggregates,
    };
  }

  private buildExchangePairRecord(
    exchangePairKey:
      string,

    cycles:
      readonly ExpectedVsRealizedCycle[],
  ): ExchangePairPerformanceRecord {
    const first =
      cycles[0];

    const marketsObserved =
      [
        ...new Set(
          cycles.map(
            (
              cycle,
            ) =>
              cycle.market,
          ),
        ),
      ].sort();

    const aggregates =
      this.aggregateCycles(
        cycles,
      );

    return {
      exchangePairKey,

      buyExchange:
        first.buyExchange,

      sellExchange:
        first.sellExchange,

      evidenceLevel:
        this.resolvePerformanceEvidenceLevel(
          cycles.length,
        ),

      marketsObserved,

      ...aggregates,
    };
  }

  private aggregateCycles(
    cycles:
      readonly ExpectedVsRealizedCycle[],
  ): Omit<
    RoutePerformanceRecord,
    | "routeKey"
    | "market"
    | "buyExchange"
    | "sellExchange"
    | "evidenceLevel"
  > {
    const matchedCycles =
      cycles.length;

    const profitableCycles =
      cycles.filter(
        (
          cycle,
        ) =>
          cycle.realizedNetProfit >
          0,
      ).length;

    const lossCycles =
      cycles.filter(
        (
          cycle,
        ) =>
          cycle.realizedNetProfit <
          0,
      ).length;

    const expectationMetCycles =
      cycles.filter(
        (
          cycle,
        ) =>
          cycle.profitVariance >=
          0,
      ).length;

    const expectationMissedCycles =
      cycles.filter(
        (
          cycle,
        ) =>
          cycle.profitVariance <
          0,
      ).length;

    const totalCapital =
      cycles.reduce(
        (
          total,
          cycle,
        ) =>
          total +
          cycle.capital,
        0,
      );

    const totalExpectedNetProfit =
      cycles.reduce(
        (
          total,
          cycle,
        ) =>
          total +
          cycle.expectedNetProfit,
        0,
      );

    const totalRealizedGrossProfit =
      cycles.reduce(
        (
          total,
          cycle,
        ) =>
          total +
          cycle.realizedGrossProfit,
        0,
      );

    const totalRealizedNetProfit =
      cycles.reduce(
        (
          total,
          cycle,
        ) =>
          total +
          cycle.realizedNetProfit,
        0,
      );

    const totalRealizedFees =
      cycles.reduce(
        (
          total,
          cycle,
        ) =>
          total +
          cycle.realizedFees,
        0,
      );

    const totalRoi =
      cycles.reduce(
        (
          total,
          cycle,
        ) =>
          total +
          cycle.realizedRoiPercent,
        0,
      );

    const totalAdverseSlippage =
      cycles.reduce(
        (
          total,
          cycle,
        ) =>
          total +
          cycle
            .totalAdverseSlippagePercent,
        0,
      );

    const totalExecutionDuration =
      cycles.reduce(
        (
          total,
          cycle,
        ) =>
          total +
          cycle.executionDurationMs,
        0,
      );

    return {
      matchedCycles,

      profitableCycles,

      lossCycles,

      expectationMetCycles,

      expectationMissedCycles,

      winRatePercent:
        this.percent(
          profitableCycles,
          matchedCycles,
        ),

      expectationHitRatePercent:
        this.percent(
          expectationMetCycles,
          matchedCycles,
        ),

      totalCapital:
        this.round(
          totalCapital,
        ),

      totalExpectedNetProfit:
        this.round(
          totalExpectedNetProfit,
        ),

      totalRealizedGrossProfit:
        this.round(
          totalRealizedGrossProfit,
        ),

      totalRealizedNetProfit:
        this.round(
          totalRealizedNetProfit,
        ),

      averageRealizedNetProfit:
        matchedCycles >
        0
          ? this.round(
              totalRealizedNetProfit /
                matchedCycles,
            )
          : 0,

      profitRetentionPercent:
        totalExpectedNetProfit >
        0
          ? this.round(
              totalRealizedNetProfit /
                totalExpectedNetProfit *
                100,
            )
          : null,

      totalRealizedFees:
        this.round(
          totalRealizedFees,
        ),

      averageRealizedFees:
        matchedCycles >
        0
          ? this.round(
              totalRealizedFees /
                matchedCycles,
            )
          : 0,

      averageRoiPercent:
        matchedCycles >
        0
          ? this.round(
              totalRoi /
                matchedCycles,
            )
          : 0,

      averageAdverseSlippagePercent:
        matchedCycles >
        0
          ? this.round(
              totalAdverseSlippage /
                matchedCycles,
            )
          : 0,

      averageExecutionDurationMs:
        matchedCycles >
        0
          ? this.round(
              totalExecutionDuration /
                matchedCycles,
            )
          : 0,

      latestSettlementAt:
        Math.max(
          ...cycles.map(
            (
              cycle,
            ) =>
              cycle.settledAt,
          ),
        ),
    };
  }

  private routeKey(
    cycle:
      ExpectedVsRealizedCycle,
  ): string {
    return [
      cycle.market
        .trim()
        .toUpperCase(),

      cycle.buyExchange
        .trim()
        .toLowerCase(),

      cycle.sellExchange
        .trim()
        .toLowerCase(),
    ].join(
      "::",
    );
  }

  private exchangePairKey(
    cycle:
      ExpectedVsRealizedCycle,
  ): string {
    return [
      cycle.buyExchange
        .trim()
        .toLowerCase(),

      cycle.sellExchange
        .trim()
        .toLowerCase(),
    ].join(
      "::",
    );
  }

  private resolvePerformanceEvidenceLevel(
    samples:
      number,
  ): PerformanceEvidenceLevel {
    if (
      samples <=
      0
    ) {
      return "NO_DATA";
    }

    if (
      samples <
      MINIMUM_DEVELOPING_SAMPLES
    ) {
      return "INSUFFICIENT";
    }

    if (
      samples <
      MINIMUM_ESTABLISHED_SAMPLES
    ) {
      return "DEVELOPING";
    }

    return "ESTABLISHED";
  }

  private resolveExpectedNetProfit(
    session:
      LiveExecutionSession,
  ): number | null {
    const explicitExpectedNetProfit =
      this.optionalFiniteNumber(
        session.plan.expectedNetProfit,
      );

    if (
      explicitExpectedNetProfit !==
      null
    ) {
      return explicitExpectedNetProfit;
    }

    return this.optionalFiniteNumber(
      session.plan.expectedProfit,
    );
  }

  private resolveExpectedProfitPercent(
    session:
      LiveExecutionSession,
  ): number {
    const explicitExpectedNetProfitPercent =
      this.optionalFiniteNumber(
        session.plan
          .expectedNetProfitPercent,
      );

    if (
      explicitExpectedNetProfitPercent !==
      null
    ) {
      return explicitExpectedNetProfitPercent;
    }

    return Number.isFinite(
      session.plan.expectedProfitPercent,
    )
      ? session.plan.expectedProfitPercent
      : 0;
  }

  private buildExecutionSummary(
    exchanges:
      readonly ExchangeExecutionMetrics[],
  ):
  LivePerformanceAnalyticsReport["execution"] {
    const totalExecutions =
      exchanges.reduce(
        (
          total,
          exchange,
        ) =>
          total +
          exchange.totalExecutions,
        0,
      );

    const filledExecutions =
      exchanges.reduce(
        (
          total,
          exchange,
        ) =>
          total +
          exchange.filledExecutions,
        0,
      );

    const partialFillExecutions =
      exchanges.reduce(
        (
          total,
          exchange,
        ) =>
          total +
          exchange.partialFillExecutions,
        0,
      );

    const failedExecutions =
      exchanges.reduce(
        (
          total,
          exchange,
        ) =>
          total +
          exchange.failedExecutions,
        0,
      );

    const rejectedExecutions =
      exchanges.reduce(
        (
          total,
          exchange,
        ) =>
          total +
          exchange.rejectedExecutions,
        0,
      );

    const timedOutExecutions =
      exchanges.reduce(
        (
          total,
          exchange,
        ) =>
          total +
          exchange.timedOutExecutions,
        0,
      );

    const cancelledExecutions =
      exchanges.reduce(
        (
          total,
          exchange,
        ) =>
          total +
          exchange.cancelledExecutions,
        0,
      );

    const totalExecutionTimeMs =
      exchanges.reduce(
        (
          total,
          exchange,
        ) =>
          total +
          exchange.totalExecutionTimeMs,
        0,
      );

    const fastestCandidates =
      exchanges
        .map(
          (
            exchange,
          ) =>
            exchange.fastestExecutionTimeMs,
        )
        .filter(
          (
            value,
          ): value is number =>
            value !==
            null,
        );

    const slowestCandidates =
      exchanges
        .map(
          (
            exchange,
          ) =>
            exchange.slowestExecutionTimeMs,
        )
        .filter(
          (
            value,
          ): value is number =>
            value !==
            null,
        );

    return {
      totalExecutions,

      filledExecutions,

      partialFillExecutions,

      failedExecutions,

      rejectedExecutions,

      timedOutExecutions,

      cancelledExecutions,

      fillRatePercent:
        this.percent(
          filledExecutions,
          totalExecutions,
        ),

      partialFillRatePercent:
        this.percent(
          partialFillExecutions,
          totalExecutions,
        ),

      failureRatePercent:
        this.percent(
          failedExecutions +
            rejectedExecutions,
          totalExecutions,
        ),

      timeoutRatePercent:
        this.percent(
          timedOutExecutions,
          totalExecutions,
        ),

      cancellationRatePercent:
        this.percent(
          cancelledExecutions,
          totalExecutions,
        ),

      averageExecutionTimeMs:
        totalExecutions >
        0
          ? this.round(
              totalExecutionTimeMs /
                totalExecutions,
            )
          : 0,

      fastestExecutionTimeMs:
        fastestCandidates.length >
        0
          ? Math.min(
              ...fastestCandidates,
            )
          : null,

      slowestExecutionTimeMs:
        slowestCandidates.length >
        0
          ? Math.max(
              ...slowestCandidates,
            )
          : null,
    };
  }

  private buildSlippageSummary(
    executions:
      readonly ExecutionHistoryItem[],
  ):
  LivePerformanceSlippageSummary {
    const samples =
      executions
        .map(
          (
            execution,
          ) =>
            this.toSlippageSample(
              execution,
            ),
        )
        .filter(
          (
            sample,
          ): sample is {
            side:
              | "buy"
              | "sell";

            signedPercent:
              number;

            absolutePercent:
              number;
          } =>
            sample !==
            null,
        );

    if (
      samples.length ===
      0
    ) {
      return {
        sampledExecutions:
          0,

        sampledBuyExecutions:
          0,

        sampledSellExecutions:
          0,

        averageAbsoluteSlippagePercent:
          0,

        averageSignedSlippagePercent:
          0,

        worstAdverseSlippagePercent:
          0,

        bestFavorableSlippagePercent:
          0,
      };
    }

    const signed =
      samples.map(
        (
          sample,
        ) =>
          sample.signedPercent,
      );

    const adverse =
      signed.filter(
        (
          value,
        ) =>
          value >
          0,
      );

    const favorable =
      signed.filter(
        (
          value,
        ) =>
          value <
          0,
      );

    return {
      sampledExecutions:
        samples.length,

      sampledBuyExecutions:
        samples.filter(
          (
            sample,
          ) =>
            sample.side ===
            "buy",
        ).length,

      sampledSellExecutions:
        samples.filter(
          (
            sample,
          ) =>
            sample.side ===
            "sell",
        ).length,

      averageAbsoluteSlippagePercent:
        this.round(
          samples.reduce(
            (
              total,
              sample,
            ) =>
              total +
              sample.absolutePercent,
            0,
          ) /
            samples.length,
        ),

      averageSignedSlippagePercent:
        this.round(
          signed.reduce(
            (
              total,
              value,
            ) =>
              total +
              value,
            0,
          ) /
            signed.length,
        ),

      worstAdverseSlippagePercent:
        adverse.length >
        0
          ? this.round(
              Math.max(
                ...adverse,
              ),
            )
          : 0,

      bestFavorableSlippagePercent:
        favorable.length >
        0
          ? this.round(
              Math.min(
                ...favorable,
              ),
            )
          : 0,
    };
  }

  private toSlippageSample(
    execution:
      ExecutionHistoryItem,
  ):
    | {
        side:
          | "buy"
          | "sell";

        signedPercent:
          number;

        absolutePercent:
          number;
      }
    | null {
    if (
      execution.side !==
        "buy" &&
      execution.side !==
        "sell"
    ) {
      return null;
    }

    const requestedPrice =
      execution.requestedPrice;

    const averageFillPrice =
      execution.averageFillPrice;

    if (
      requestedPrice ===
        null ||
      !Number.isFinite(
        requestedPrice,
      ) ||
      requestedPrice <=
        0 ||
      !Number.isFinite(
        averageFillPrice,
      ) ||
      averageFillPrice <=
        0 ||
      execution.filledQuantity <=
        0
    ) {
      return null;
    }

    const rawPercent =
      (
        averageFillPrice -
        requestedPrice
      ) /
      requestedPrice *
      100;

    const signedPercent =
      execution.side ===
      "buy"
        ? rawPercent
        : -rawPercent;

    return {
      side:
        execution.side,

      signedPercent:
        this.round(
          signedPercent,
        ),

      absolutePercent:
        this.round(
          Math.abs(
            rawPercent,
          ),
        ),
    };
  }

  private resolveEvidenceStatus(
    evidence:
      readonly boolean[],
  ):
  LivePerformanceEvidenceStatus {
    const availableCount =
      evidence.filter(
        Boolean,
      ).length;

    if (
      availableCount ===
      0
    ) {
      return "NO_DATA";
    }

    if (
      availableCount ===
      evidence.length
    ) {
      return "AVAILABLE";
    }

    return "PARTIAL";
  }

  private buildNotes(
    executionMetricsAvailable:
      boolean,

    pnlRecordsAvailable:
      boolean,

    slippageSamplesAvailable:
      boolean,

    expectedVsRealizedAvailable:
      boolean,

    routePerformanceAvailable:
      boolean,

    establishedRouteEvidenceAvailable:
      boolean,
  ): string[] {
    const notes:
      string[] = [
      "Version 17.6 Build 3 is analytics-only and does not enable LIVE trading.",

      "Expected-versus-realized and route performance use an exact LIVE sessionId to settlement.sessionId join.",

      "Synthetic/dry-run sessions are excluded from LIVE route-performance evidence.",

      "Directional exchange pairs are intentionally distinct; buy Binance / sell Bybit is not merged with buy Bybit / sell Binance.",

      `A route or exchange pair requires at least ${MINIMUM_ESTABLISHED_SAMPLES} matched settled LIVE cycles before its evidence level becomes ESTABLISHED.`,

      "INSUFFICIENT or DEVELOPING evidence must not be treated as proof that a route is profitable or safe.",
    ];

    if (
      !executionMetricsAvailable
    ) {
      notes.push(
        "No execution metrics are available yet.",
      );
    }

    if (
      !pnlRecordsAvailable
    ) {
      notes.push(
        "No persisted arbitrage P&L cycles are available yet.",
      );
    }

    if (
      !slippageSamplesAvailable
    ) {
      notes.push(
        "No valid realized slippage samples are available yet.",
      );
    }

    if (
      !expectedVsRealizedAvailable
    ) {
      notes.push(
        "No non-synthetic SETTLED LIVE cycle currently has both expectation and realized settlement evidence.",
      );
    }

    if (
      !routePerformanceAvailable
    ) {
      notes.push(
        "No LIVE route or directional exchange-pair performance sample exists yet.",
      );
    }

    if (
      routePerformanceAvailable &&
      !establishedRouteEvidenceAvailable
    ) {
      notes.push(
        "Route evidence exists, but no route or directional exchange pair has reached the established sample threshold yet.",
      );
    }

    return notes;
  }

  private optionalFiniteNumber(
    value:
      number | undefined,
  ): number | null {
    return typeof value ===
      "number" &&
      Number.isFinite(
        value,
      )
      ? value
      : null;
  }

  private percent(
    value:
      number,

    total:
      number,
  ): number {
    if (
      total <=
      0
    ) {
      return 0;
    }

    return this.round(
      value /
        total *
        100,
    );
  }

  private round(
    value:
      number,
  ): number {
    return Math.round(
      value *
        10_000,
    ) /
      10_000;
  }
}

export const livePerformanceAnalyticsService =
  new LivePerformanceAnalyticsService();