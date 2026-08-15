import {
  defaultArbitragePolicy,
} from "../../arbitrage/config/policy";

import type {
  ArbitragePolicy,
} from "../../arbitrage/models/ArbitragePolicy";

import type {
  OpportunityCandidate,
} from "./OpportunityCandidateBoardService";

export type CandidateExecutionReadiness =
  | "READY"
  | "NEAR_READY"
  | "NOT_READY"
  | "UNKNOWN";

export interface CandidateDistanceMetric {
  name:
    | "SPREAD"
    | "NET_PROFIT"
    | "LIQUIDITY";

  currentValue:
    number | null;

  requiredValue:
    number;

  distance:
    number | null;

  passed:
    boolean | null;

  unit:
    "PERCENT";
}

export interface CandidateExecutionGate {
  name:
    | "FRESHNESS"
    | "FEES"
    | "QUOTE_INTEGRITY";

  passed:
    boolean | null;

  reason:
    string | null;
}

export interface OpportunityCandidateDistanceAnalysis {
  candidateId:
    string;

  market:
    string;

  status:
    OpportunityCandidate["status"];

  readiness:
    CandidateExecutionReadiness;

  readinessPercent:
    number | null;

  blockingStage:
    string | null;

  blockingReason:
    string | null;

  metrics:
    readonly CandidateDistanceMetric[];

  gates:
    readonly CandidateExecutionGate[];

  analyzedAt:
    number;
}

export class OpportunityCandidateDistanceAnalyzer {
  analyze(
    candidate:
      OpportunityCandidate,

    policy:
      ArbitragePolicy =
        defaultArbitragePolicy,
  ): OpportunityCandidateDistanceAnalysis {
    const spreadMetric =
      this.createMetric(
        "SPREAD",
        candidate.rawSpreadPercent,
        policy.minimumSpreadPercent,
      );

    const netProfitMetric =
      this.createMetric(
        "NET_PROFIT",
        candidate.netProfitPercent,
        policy.minimumNetProfitPercent,
      );

    const liquidityMetric =
      this.createMetric(
        "LIQUIDITY",
        candidate.liquidityPercent,
        policy.minimumLiquidityPercent,
      );

    const metrics = [
      spreadMetric,
      netProfitMetric,
      liquidityMetric,
    ];

    const freshnessGate =
      this.resolveGate(
        candidate,
        "FRESHNESS",
      );

    const feeGate =
      this.resolveGate(
        candidate,
        "FEES",
      );

    const quoteIntegrityGate =
      this.resolveGate(
        candidate,
        "QUOTE_INTEGRITY",
      );

    const gates = [
      freshnessGate,
      feeGate,
      quoteIntegrityGate,
    ];

    const readiness =
      this.resolveReadiness(
        candidate,
        metrics,
        gates,
      );

    const readinessPercent =
      this.calculateReadinessPercent(
        candidate,
        metrics,
        gates,
        readiness,
      );

    const blocking =
      this.resolveBlockingState(
        candidate,
        readiness,
      );

    return {
      candidateId:
        candidate.id,

      market:
        candidate.market,

      status:
        candidate.status,

      readiness,

      readinessPercent,

      blockingStage:
        blocking.stage,

      blockingReason:
        blocking.reason,

      metrics:
        structuredClone(
          metrics,
        ),

      gates:
        structuredClone(
          gates,
        ),

      analyzedAt:
        Date.now(),
    };
  }

  private createMetric(
    name:
      CandidateDistanceMetric["name"],

    currentValue:
      number | null,

    requiredValue:
      number,
  ): CandidateDistanceMetric {
    if (
      currentValue ===
        null ||
      !Number.isFinite(
        currentValue,
      )
    ) {
      return {
        name,

        currentValue:
          null,

        requiredValue,

        distance:
          null,

        passed:
          null,

        unit:
          "PERCENT",
      };
    }

    const distance =
      currentValue >=
        requiredValue
        ? 0
        : requiredValue -
          currentValue;

    return {
      name,

      currentValue,

      requiredValue,

      distance,

      passed:
        currentValue >=
        requiredValue,

      unit:
        "PERCENT",
    };
  }

  private resolveGate(
    candidate:
      OpportunityCandidate,

    gate:
      CandidateExecutionGate["name"],
  ): CandidateExecutionGate {
    /*
     * An ACCEPTED candidate has already passed
     * the OpportunityEngine execution-analysis
     * safety gates.
     *
     * This does NOT make it READY automatically.
     *
     * Readiness is resolved separately from:
     *
     * status
     * +
     * decision
     *
     * so ACCEPTED + SKIP can never become READY.
     */
    if (
      candidate.status ===
      "ACCEPTED"
    ) {
      return {
        name:
          gate,

        passed:
          true,

        reason:
          null,
      };
    }

    if (
      gate ===
      "FRESHNESS"
    ) {
      const failed =
        candidate.rejectionStage ===
          "FRESHNESS" ||
        candidate.rejectionCode ===
          "STALE_BUY_QUOTE" ||
        candidate.rejectionCode ===
          "STALE_SELL_QUOTE" ||
        candidate.rejectionCode ===
          "STALE_BOTH_QUOTES" ||
        candidate.rejectionCode ===
          "STALE_EXECUTION_QUOTES";

      if (
        failed
      ) {
        return {
          name:
            gate,

          passed:
            false,

          reason:
            candidate.reason,
        };
      }
    }

    if (
      gate ===
      "FEES"
    ) {
      const failed =
        candidate.rejectionStage ===
          "FEES" ||
        candidate.rejectionCode ===
          "BUY_FEE_MISSING" ||
        candidate.rejectionCode ===
          "SELL_FEE_MISSING" ||
        candidate.rejectionCode ===
          "UNACCEPTABLE_FEES";

      if (
        failed
      ) {
        return {
          name:
            gate,

          passed:
            false,

          reason:
            candidate.reason,
        };
      }
    }

    if (
      gate ===
      "QUOTE_INTEGRITY"
    ) {
      const failed =
        candidate.rejectionStage ===
          "QUOTE_INTEGRITY" ||
        candidate.rejectionCode ===
          "QUOTE_INTEGRITY_FAILED";

      if (
        failed
      ) {
        return {
          name:
            gate,

          passed:
            false,

          reason:
            candidate.reason,
        };
      }
    }

    /*
     * A rejection at another earlier stage does
     * not prove that this particular gate passed.
     *
     * Keep it UNKNOWN instead of manufacturing
     * a successful result.
     */
    return {
      name:
        gate,

      passed:
        null,

      reason:
        null,
    };
  }

  private resolveReadiness(
    candidate:
      OpportunityCandidate,

    metrics:
      readonly CandidateDistanceMetric[],

    gates:
      readonly CandidateExecutionGate[],
  ): CandidateExecutionReadiness {
    /*
     * -------------------------------------------------
     * ACCEPTED CANDIDATE STATE MACHINE
     * -------------------------------------------------
     *
     * ACCEPTED does not mean READY.
     *
     * EXECUTE
     *   -> READY
     *
     * REVIEW
     *   -> NEAR_READY
     *
     * SKIP
     *   -> NOT_READY
     *
     * This invariant prevents:
     *
     * ACCEPTED + SKIP + READY
     *
     * from ever being produced by the board.
     */
    if (
      candidate.status ===
      "ACCEPTED"
    ) {
      switch (
        candidate.decision
      ) {
        case "EXECUTE":
          return "READY";

        case "REVIEW":
          return "NEAR_READY";

        case "SKIP":
          return "NOT_READY";
      }
    }

    /*
     * -------------------------------------------------
     * REJECTED CANDIDATE ANALYSIS
     * -------------------------------------------------
     */

    const knownFailedGate =
      gates.some(
        (gate) =>
          gate.passed ===
          false,
      );

    if (
      knownFailedGate
    ) {
      return "NOT_READY";
    }

    const knownFailedMetrics =
      metrics.filter(
        (metric) =>
          metric.passed ===
          false,
      );

    if (
      knownFailedMetrics.length ===
      0
    ) {
      /*
       * Rejected candidate but no measurable
       * metric or safety gate explains readiness.
       *
       * Do not falsely classify it as READY.
       */
      return "UNKNOWN";
    }

    const closeEnough =
      knownFailedMetrics.every(
        (metric) =>
          this.isNearThreshold(
            metric,
          ),
      );

    return closeEnough
      ? "NEAR_READY"
      : "NOT_READY";
  }

  private calculateReadinessPercent(
    candidate:
      OpportunityCandidate,

    metrics:
      readonly CandidateDistanceMetric[],

    gates:
      readonly CandidateExecutionGate[],

    readiness:
      CandidateExecutionReadiness,
  ): number | null {
    /*
     * Accepted candidates use decision-aware
     * readiness percentages.
     *
     * READY means fully execution-authorized
     * by the opportunity analysis decision.
     */
    if (
      candidate.status ===
      "ACCEPTED"
    ) {
      switch (
        readiness
      ) {
        case "READY":
          return 100;

        case "NEAR_READY":
          return this.calculateAcceptedReviewScore(
            candidate,
            metrics,
            gates,
          );

        case "NOT_READY":
          return this.calculateAcceptedSkipScore(
            candidate,
            metrics,
            gates,
          );

        case "UNKNOWN":
          return null;
      }
    }

    const componentScores:
      number[] =
      [];

    for (
      const metric
      of metrics
    ) {
      const score =
        this.calculateMetricScore(
          metric,
        );

      if (
        score !==
        null
      ) {
        componentScores.push(
          score,
        );
      }
    }

    for (
      const gate
      of gates
    ) {
      if (
        gate.passed ===
        true
      ) {
        componentScores.push(
          100,
        );
      } else if (
        gate.passed ===
        false
      ) {
        componentScores.push(
          0,
        );
      }
    }

    if (
      componentScores.length ===
      0
    ) {
      return null;
    }

    return this.averageScores(
      componentScores,
    );
  }

  private calculateAcceptedReviewScore(
    candidate:
      OpportunityCandidate,

    metrics:
      readonly CandidateDistanceMetric[],

    gates:
      readonly CandidateExecutionGate[],
  ): number {
    const baseScore =
      this.calculateKnownComponentAverage(
        metrics,
        gates,
      );

    const overallScore =
      this.normalizeScore(
        candidate.overallScore,
      );

    const combined =
      this.averageDefinedScores(
        [
          baseScore,
          overallScore,
        ],
      );

    /*
     * REVIEW must never visually become 100%,
     * otherwise it becomes indistinguishable
     * from a genuine READY candidate.
     */
    if (
      combined ===
      null
    ) {
      return 75;
    }

    return Math.min(
      99,
      Math.max(
        65,
        combined,
      ),
    );
  }

  private calculateAcceptedSkipScore(
    candidate:
      OpportunityCandidate,

    metrics:
      readonly CandidateDistanceMetric[],

    gates:
      readonly CandidateExecutionGate[],
  ): number {
    const baseScore =
      this.calculateKnownComponentAverage(
        metrics,
        gates,
      );

    const overallScore =
      this.normalizeScore(
        candidate.overallScore,
      );

    const combined =
      this.averageDefinedScores(
        [
          baseScore,
          overallScore,
        ],
      );

    if (
      combined ===
      null
    ) {
      return 0;
    }

    /*
     * SKIP must remain below the review/ready
     * execution threshold even when individual
     * raw metrics look strong.
     */
    return Math.min(
      64.99,
      Math.max(
        0,
        combined,
      ),
    );
  }

  private calculateKnownComponentAverage(
    metrics:
      readonly CandidateDistanceMetric[],

    gates:
      readonly CandidateExecutionGate[],
  ): number | null {
    const scores:
      number[] =
      [];

    for (
      const metric
      of metrics
    ) {
      const score =
        this.calculateMetricScore(
          metric,
        );

      if (
        score !==
        null
      ) {
        scores.push(
          score,
        );
      }
    }

    for (
      const gate
      of gates
    ) {
      if (
        gate.passed ===
        true
      ) {
        scores.push(
          100,
        );
      } else if (
        gate.passed ===
        false
      ) {
        scores.push(
          0,
        );
      }
    }

    if (
      scores.length ===
      0
    ) {
      return null;
    }

    return this.averageScores(
      scores,
    );
  }

  private calculateMetricScore(
    metric:
      CandidateDistanceMetric,
  ): number | null {
    if (
      metric.currentValue ===
        null ||
      !Number.isFinite(
        metric.currentValue,
      ) ||
      !Number.isFinite(
        metric.requiredValue,
      ) ||
      metric.requiredValue <=
        0
    ) {
      return null;
    }

    const ratio =
      (
        metric.currentValue /
        metric.requiredValue
      ) *
      100;

    if (
      !Number.isFinite(
        ratio,
      )
    ) {
      return null;
    }

    return Math.max(
      0,
      Math.min(
        100,
        ratio,
      ),
    );
  }

  private resolveBlockingState(
    candidate:
      OpportunityCandidate,

    readiness:
      CandidateExecutionReadiness,
  ): {
    stage:
      string | null;

    reason:
      string | null;
  } {
    if (
      candidate.status ===
      "REJECTED"
    ) {
      return {
        stage:
          candidate.rejectionStage,

        reason:
          candidate.reason,
      };
    }

    if (
      readiness ===
      "READY"
    ) {
      return {
        stage:
          null,

        reason:
          null,
      };
    }

    if (
      candidate.decision ===
      "REVIEW"
    ) {
      return {
        stage:
          "DECISION",

        reason:
          candidate.reason
            .trim()
            .length >
          0
            ? candidate.reason
            : "Candidate requires review before execution.",
      };
    }

    if (
      candidate.decision ===
      "SKIP"
    ) {
      return {
        stage:
          "DECISION",

        reason:
          candidate.reason
            .trim()
            .length >
          0
            ? candidate.reason
            : "Candidate execution decision is SKIP.",
      };
    }

    return {
      stage:
        "READINESS",

      reason:
        "Candidate is not currently ready for execution.",
    };
  }

  private normalizeScore(
    score:
      number | null,
  ): number | null {
    if (
      score ===
        null ||
      !Number.isFinite(
        score,
      )
    ) {
      return null;
    }

    return Math.max(
      0,
      Math.min(
        100,
        score,
      ),
    );
  }

  private averageDefinedScores(
    scores:
      readonly (
        number |
        null
      )[],
  ): number | null {
    const defined =
      scores.filter(
        (
          value,
        ): value is number =>
          value !==
            null &&
          Number.isFinite(
            value,
          ),
      );

    if (
      defined.length ===
      0
    ) {
      return null;
    }

    return this.averageScores(
      defined,
    );
  }

  private averageScores(
    scores:
      readonly number[],
  ): number {
    if (
      scores.length ===
      0
    ) {
      return 0;
    }

    const total =
      scores.reduce(
        (
          sum,
          score,
        ) =>
          sum +
          score,
        0,
      );

    const average =
      total /
      scores.length;

    return (
      Math.round(
        average *
        100,
      ) /
      100
    );
  }

  private isNearThreshold(
    metric:
      CandidateDistanceMetric,
  ): boolean {
    if (
      metric.currentValue ===
        null ||
      metric.distance ===
        null ||
      metric.requiredValue <=
        0
    ) {
      return false;
    }

    /*
     * "Near ready" means the candidate is
     * within 10% of the configured threshold.
     *
     * Example:
     *
     * required spread = 0.05%
     * near-ready floor = 0.045%
     *
     * This does NOT modify trading policy.
     * It is only a diagnostic classification.
     */
    const tolerance =
      metric.requiredValue *
      0.1;

    return (
      metric.distance <=
      tolerance
    );
  }
}

export const opportunityCandidateDistanceAnalyzer =
  new OpportunityCandidateDistanceAnalyzer();