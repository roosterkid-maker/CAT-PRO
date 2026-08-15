import {
  defaultArbitragePolicy,
} from "../../arbitrage/config/policy";

import {
  executionSimulator,
} from "../../execution/services/ExecutionSimulator";

import type {
  ExecutionResult,
} from "../../execution/models/ExecutionResult";

import type {
  CandidateEvidenceRouteRecord,
} from "../models/CandidateEvidenceAccumulator";

import type {
  LiquidityCapitalAuditPoint,
  LiquidityQualificationAlignment,
  LiquidityQualificationAuditReport,
  LiquidityQualificationAuditRoute,
} from "../models/LiquidityQualificationAudit";

import {
  candidateEvidenceAccumulatorService,
} from "./CandidateEvidenceAccumulatorService";

import {
  candidateQualificationService,
} from "./CandidateQualificationService";

import {
  opportunityMonitorService,
} from "./OpportunityMonitorService";

const CAPITAL_POINTS = [
  100,
  250,
  500,
  1_000,
] as const;

const MAXIMUM_ROUTES_ANALYZED =
  10;

export class LiquidityQualificationAuditService {
  getReport():
    LiquidityQualificationAuditReport {
    const evidence =
      candidateEvidenceAccumulatorService
        .getDiagnostics();

    const qualificationDiagnostics =
      candidateQualificationService
        .getDiagnostics();

    const qualificationMinimumLiquidityScore =
      qualificationDiagnostics
        .config
        .minimumLiquidityScore;

    const evidenceRoutes =
      evidence.routes;

    const selected =
      [
        ...evidenceRoutes,
      ]
        .sort(
          (
            first,
            second,
          ) => {
            const firstFailures =
              first
                .checkFailureCounts
                .liquidity;

            const secondFailures =
              second
                .checkFailureCounts
                .liquidity;

            if (
              secondFailures !==
              firstFailures
            ) {
              return (
                secondFailures -
                firstFailures
              );
            }

            if (
              second
                .maximumLiquidityScore !==
              first
                .maximumLiquidityScore
            ) {
              return (
                second
                  .maximumLiquidityScore -
                first
                  .maximumLiquidityScore
              );
            }

            return (
              second
                .bestNetProfitPercent -
              first
                .bestNetProfitPercent
            );
          },
        )
        .slice(
          0,
          MAXIMUM_ROUTES_ANALYZED,
        );

    const routes =
      selected.map(
        (
          route,
        ) =>
          this.analyzeRoute(
            route,
            qualificationMinimumLiquidityScore,
          ),
      );

    const routesWithLiquidityFailureEvidence =
      evidenceRoutes.filter(
        (
          route,
        ) =>
          route
            .checkFailureCounts
            .liquidity >
          0,
      ).length;

    const routesWithSuccessfulSimulation =
      routes.filter(
        (
          route,
        ) =>
          route.capitalAudit.some(
            (
              point,
            ) =>
              point.simulationSuccess,
          ),
      ).length;

    return {
      generatedAt:
        Date.now(),

      version:
        "17.4",

      build:
        "11",

      mode:
        "DIAGNOSTIC_ONLY",

      tradingPolicyMutationAllowed:
        false,

      paperExecutionAllowed:
        false,

      liveExecutionAllowed:
        false,

      configuration: {
        policyReferenceCapital:
          defaultArbitragePolicy
            .referenceCapital,

        engineMinimumLiquidityPercent:
          defaultArbitragePolicy
            .minimumLiquidityPercent,

        qualificationMinimumLiquidityScore,

        testedCapitalPoints: [
          ...CAPITAL_POINTS,
        ],

        maximumRoutesAnalyzed:
          MAXIMUM_ROUTES_ANALYZED,
      },

      summary: {
        evidenceRoutes:
          evidenceRoutes.length,

        analyzedRoutes:
          routes.length,

        routesWithLiquidityFailureEvidence,

        routesWithSuccessfulSimulation,

        alignedInsufficientRoutes:
          this.countAlignment(
            routes,
            "ALIGNED_INSUFFICIENT",
          ),

        capitalAwareMismatchRoutes:
          this.countAlignment(
            routes,
            "CAPITAL_AWARE_MISMATCH",
          ),

        capitalDependentRoutes:
          this.countAlignment(
            routes,
            "CAPITAL_DEPENDENT",
          ),

        alignedHealthyRoutes:
          this.countAlignment(
            routes,
            "ALIGNED_HEALTHY",
          ),
      },

      routes,

      observations: [
        `Opportunity policy currently evaluates liquidity against ₹${defaultArbitragePolicy.referenceCapital} reference capital.`,

        `Opportunity engine minimum liquidity requirement is ${defaultArbitragePolicy.minimumLiquidityPercent}%, while automation qualification requires liquidity score >= ${qualificationMinimumLiquidityScore}.`,

        "Build 11 compares historical qualification liquidity against requested-capital full-depth execution at ₹100, ₹250, ₹500 and ₹1,000.",

        "A CAPITAL_AWARE_MISMATCH does not automatically justify lowering qualification thresholds.",

        "No opportunity, qualification, paper, or LIVE policy is modified.",
      ],
    };
  }

  private analyzeRoute(
    evidence:
      CandidateEvidenceRouteRecord,

    qualificationMinimumLiquidityScore:
      number,
  ): LiquidityQualificationAuditRoute {
    const monitorCandidate =
      opportunityMonitorService
        .getCandidate(
          evidence.key,
        );

    const qualification =
      candidateQualificationService
        .getQualification(
          evidence.key,
        );

    const capitalAudit =
      CAPITAL_POINTS.map(
        (
          capital,
        ) =>
          this.simulateCapital(
            evidence,
            capital,
          ),
      );

    const fullyExecutable =
      capitalAudit.filter(
        (
          point,
        ) =>
          point.simulationSuccess &&
          point.fullyExecutable,
      );

    const profitableFullyExecutable =
      fullyExecutable.filter(
        (
          point,
        ) =>
          point.netProfit !==
            null &&
          point.netProfit >
            0,
      );

    const alignment =
      this.resolveAlignment(
        evidence,
        qualificationMinimumLiquidityScore,
        capitalAudit,
      );

    const smallestProfitable =
      this.minimumCapital(
        profitableFullyExecutable,
      );

    const largestProfitable =
      this.maximumCapital(
        profitableFullyExecutable,
      );

    const observations:
      string[] = [];

    if (
      evidence.maximumLiquidityScore <
      qualificationMinimumLiquidityScore
    ) {
      observations.push(
        `Historical maximum qualification liquidity score is ${evidence.maximumLiquidityScore}, below required ${qualificationMinimumLiquidityScore}.`,
      );
    } else {
      observations.push(
        `Historical liquidity score has reached the current qualification requirement of ${qualificationMinimumLiquidityScore}.`,
      );
    }

    if (
      smallestProfitable !==
      null
    ) {
      observations.push(
        `At least one tested capital is currently fully executable and profitable. Tested profitable range: ₹${smallestProfitable} to ₹${largestProfitable ?? smallestProfitable}.`,
      );
    } else {
      observations.push(
        "No tested capital is currently both fully executable and profitable.",
      );
    }

    if (
      alignment ===
      "CAPITAL_AWARE_MISMATCH"
    ) {
      observations.push(
        "Historical qualification liquidity is below threshold, but requested-capital full-depth simulation currently finds a fully executable profitable trade.",
      );
    }

    if (
      alignment ===
      "CAPITAL_DEPENDENT"
    ) {
      observations.push(
        "Liquidity/economics depend materially on capital size: some tested capital levels pass while others do not.",
      );
    }

    return {
      candidateKey:
        evidence.key,

      market:
        evidence.market,

      buyExchange:
        evidence.buyExchange,

      sellExchange:
        evidence.sellExchange,

      currentCandidateActive:
        monitorCandidate
          ?.status ===
        "ACTIVE",

      evidence: {
        maximumLiquidityScore:
          evidence
            .maximumLiquidityScore,

        maximumFreshnessScore:
          evidence
            .maximumFreshnessScore,

        bestNetProfitPercent:
          evidence
            .bestNetProfitPercent,

        bestQualificationScore:
          evidence
            .bestQualificationScore,

        maximumConsecutiveObservations:
          evidence
            .maximumConsecutiveObservations,

        maximumLifetimeMs:
          evidence
            .maximumLifetimeMs,

        qualifiedEvaluations:
          evidence
            .qualifiedEvaluations,

        liquidityFailureObservations:
          evidence
            .checkFailureCounts
            .liquidity,
      },

      currentQualification: {
        found:
          qualification !==
          null,

        status:
          qualification
            ?.status ??
          null,

        liquidityScore:
          qualification
            ?.candidate
            .latest
            .liquidityScore ??
          null,

        liquidityPassed:
          qualification
            ?.checks
            .liquidity
            .passed ??
          null,
      },

      referenceLiquidity: {
        referenceCapital:
          defaultArbitragePolicy
            .referenceCapital,

        engineMinimumLiquidityPercent:
          defaultArbitragePolicy
            .minimumLiquidityPercent,

        qualificationMinimumLiquidityScore,

        approximateMaximumTopOfBookCapitalFromEvidence:
          evidence.maximumLiquidityScore <
          100
            ? (
                defaultArbitragePolicy
                  .referenceCapital *
                evidence
                  .maximumLiquidityScore
              ) /
              100
            : null,
      },

      alignment,

      smallestFullyExecutableCapital:
        this.minimumCapital(
          fullyExecutable,
        ),

      largestFullyExecutableCapital:
        this.maximumCapital(
          fullyExecutable,
        ),

      smallestProfitableFullyExecutableCapital:
        smallestProfitable,

      largestProfitableFullyExecutableCapital:
        largestProfitable,

      capitalAudit,

      observations,
    };
  }

  private simulateCapital(
    route:
      CandidateEvidenceRouteRecord,

    capital:
      number,
  ): LiquidityCapitalAuditPoint {
    let execution:
      ExecutionResult;

    try {
      execution =
        executionSimulator
          .simulate({
            market:
              route.market,

            buyExchange:
              route.buyExchange,

            sellExchange:
              route.sellExchange,

            capital,
          });
    } catch (
      error:
        unknown
    ) {
      return this.failedPoint(
        capital,

        error instanceof Error
          ? error.message
          : "Execution simulation threw an unknown error.",
      );
    }

    const simulation =
      execution.simulation;

    if (
      !execution.success ||
      simulation ===
        null
    ) {
      return this.failedPoint(
        capital,
        execution.failureReason,
      );
    }

    return {
      capital,

      simulationSuccess:
        true,

      fullyExecutable:
        simulation
          .depth
          .fullyExecutable,

      fillPercent:
        simulation
          .depth
          .fillPercent,

      requestedQuantity:
        simulation
          .depth
          .requestedQuantity,

      executableQuantity:
        simulation
          .depth
          .executableQuantity,

      executableCapital:
        simulation
          .depth
          .executableCapital,

      consumedLevels:
        simulation
          .depth
          .consumedLevels,

      buyVWAP:
        simulation
          .buyVWAP
          .averagePrice,

      sellVWAP:
        simulation
          .sellVWAP
          .averagePrice,

      buySlippagePercent:
        simulation
          .buySlippage
          .slippagePercent,

      sellSlippagePercent:
        simulation
          .sellSlippage
          .slippagePercent,

      totalSlippagePercent:
        simulation
          .buySlippage
          .slippagePercent +
        simulation
          .sellSlippage
          .slippagePercent,

      netProfit:
        simulation
          .profit
          .breakdown
          .netProfit,

      netProfitPercent:
        simulation
          .profit
          .profitPercent,

      confidenceScore:
        simulation
          .confidence
          .score,

      recommendation:
        simulation
          .decision
          .recommendation,

      failureReason:
        null,
    };
  }

  private failedPoint(
    capital:
      number,

    reason:
      string | null,
  ): LiquidityCapitalAuditPoint {
    return {
      capital,

      simulationSuccess:
        false,

      fullyExecutable:
        false,

      fillPercent:
        null,

      requestedQuantity:
        null,

      executableQuantity:
        null,

      executableCapital:
        null,

      consumedLevels:
        null,

      buyVWAP:
        null,

      sellVWAP:
        null,

      buySlippagePercent:
        null,

      sellSlippagePercent:
        null,

      totalSlippagePercent:
        null,

      netProfit:
        null,

      netProfitPercent:
        null,

      confidenceScore:
        null,

      recommendation:
        null,

      failureReason:
        reason ??
        "Execution simulation failed.",
    };
  }

  private resolveAlignment(
    evidence:
      CandidateEvidenceRouteRecord,

    qualificationMinimumLiquidityScore:
      number,

    points:
      LiquidityCapitalAuditPoint[],
  ): LiquidityQualificationAlignment {
    const successful =
      points.filter(
        (
          point,
        ) =>
          point.simulationSuccess,
      );

    if (
      successful.length ===
      0
    ) {
      return "SIMULATION_UNAVAILABLE";
    }

    const profitableFullyExecutable =
      successful.filter(
        (
          point,
        ) =>
          point.fullyExecutable &&
          point.netProfit !==
            null &&
          point.netProfit >
            0,
      );

    if (
      profitableFullyExecutable.length ===
      0
    ) {
      return "ALIGNED_INSUFFICIENT";
    }

    if (
      evidence.maximumLiquidityScore <
      qualificationMinimumLiquidityScore
    ) {
      return "CAPITAL_AWARE_MISMATCH";
    }

    if (
      profitableFullyExecutable.length <
      successful.length
    ) {
      return "CAPITAL_DEPENDENT";
    }

    return "ALIGNED_HEALTHY";
  }

  private minimumCapital(
    points:
      LiquidityCapitalAuditPoint[],
  ): number | null {
    if (
      points.length ===
      0
    ) {
      return null;
    }

    return Math.min(
      ...points.map(
        (
          point,
        ) =>
          point.capital,
      ),
    );
  }

  private maximumCapital(
    points:
      LiquidityCapitalAuditPoint[],
  ): number | null {
    if (
      points.length ===
      0
    ) {
      return null;
    }

    return Math.max(
      ...points.map(
        (
          point,
        ) =>
          point.capital,
      ),
    );
  }

  private countAlignment(
    routes:
      LiquidityQualificationAuditRoute[],

    alignment:
      LiquidityQualificationAlignment,
  ): number {
    return routes.filter(
      (
        route,
      ) =>
        route.alignment ===
        alignment,
    ).length;
  }
}

export const liquidityQualificationAuditService =
  new LiquidityQualificationAuditService();