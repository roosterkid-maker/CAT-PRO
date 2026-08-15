import {
  executionSimulator,
} from "../../execution/services/ExecutionSimulator";

import {
  PROFIT_TIER_POLICY,
} from "../../arbitrage/config/profitTiers";

import type {
  MonitoredOpportunityCandidate,
} from "../models/OpportunityMonitor";

import type {
  CandidateCapitalAwareLiquidityAssessment,
  CandidateLiquidityQualificationAssessment,
  CandidateQualificationCheck,
  CandidateQualificationConfig,
  CandidateQualificationDiagnostics,
  CandidateQualificationRecord,
} from "../models/CandidateQualification";

import {
  opportunityMonitorService,
} from "./OpportunityMonitorService";

const DEFAULT_CONFIG:
  CandidateQualificationConfig = {
  minimumConsecutiveObservations:
    3,

  minimumPersistenceMs:
    5_000,

  minimumNetProfitPercent:
    PROFIT_TIER_POLICY
      .qualificationMinimumNetProfitPercent,

  /*
   * IMPORTANT:
   *
   * Legacy score threshold remains unchanged.
   *
   * Build 12 does NOT weaken this value.
   */
  minimumLiquidityScore:
    70,

  minimumFreshnessScore:
    80,

  maximumProfitDrawdownPercent:
    35,

  /*
   * VERSION 17.4 BUILD 12
   *
   * Capital-aware liquidity validation.
   *
   * Initial validation capital intentionally
   * stays tiny.
   */
  capitalAwareLiquidityEnabled:
    true,

  capitalAwareLiquidityValidationCapital:
    100,

  capitalAwareLiquidityMinimumNetProfitPercent:
    PROFIT_TIER_POLICY
      .qualificationMinimumNetProfitPercent,

  capitalAwareLiquidityRequireExecuteRecommendation:
    true,
};

export class CandidateQualificationService {
  private readonly config:
    CandidateQualificationConfig;

  constructor(
    config:
      Partial<CandidateQualificationConfig> = {},
  ) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };

    this.validateConfig();
  }

  evaluate(
    candidate:
      MonitoredOpportunityCandidate,

    now =
      Date.now(),
  ): CandidateQualificationRecord {
    const activeCheck =
      this.createBooleanCheck(
        candidate.status ===
          "ACTIVE",

        true,

        candidate.status ===
          "ACTIVE"
          ? "Candidate is active in the latest authoritative snapshot."
          : "Candidate is no longer active in the latest authoritative snapshot.",
      );

    const consecutiveCheck =
      this.createNumberCheck(
        candidate
          .consecutiveObservations,

        this.config
          .minimumConsecutiveObservations,

        ">=",

        `Candidate requires at least ${this.config.minimumConsecutiveObservations} consecutive observations.`,
      );

    const persistenceMs =
      candidate.status ===
        "ACTIVE"
        ? Math.max(
            candidate.lifetimeMs,

            now -
              candidate.firstSeenAt,
          )
        : candidate.lifetimeMs;

    const persistenceCheck =
      this.createNumberCheck(
        persistenceMs,

        this.config
          .minimumPersistenceMs,

        ">=",

        `Candidate must persist for at least ${this.config.minimumPersistenceMs} ms.`,
      );

    const netProfitCheck =
      this.createNumberCheck(
        candidate
          .latest
          .netProfitPercent,

        this.config
          .minimumNetProfitPercent,

        ">=",

        `Latest net profit must be at least ${this.config.minimumNetProfitPercent}%.`,
      );

    /*
     * VERSION 17.4 BUILD 12
     *
     * Liquidity can now pass through either:
     *
     * 1. Existing legacy score >= 70
     *
     * OR
     *
     * 2. Exact tiny-capital full-depth execution
     *    simulation.
     *
     * The legacy threshold is NOT reduced.
     */
    const liquidityAssessment =
      this.assessLiquidity(
        candidate,
      );

    const liquidityCheck:
      CandidateQualificationCheck = {
      passed:
        liquidityAssessment.passed,

      /*
       * Preserve legacy score as currentValue
       * for backwards-compatible diagnostics.
       */
      currentValue:
        candidate
          .latest
          .liquidityScore,

      requiredValue:
        this.config
          .minimumLiquidityScore,

      reason:
        this.liquidityReason(
          liquidityAssessment,
        ),
    };

    const freshnessCheck =
      this.createNumberCheck(
        candidate
          .latest
          .freshnessScore,

        this.config
          .minimumFreshnessScore,

        ">=",

        `Freshness score must be at least ${this.config.minimumFreshnessScore}.`,
      );

    const profitDrawdownPercent =
      this.calculateProfitDrawdownPercent(
        candidate,
      );

    const profitStabilityCheck =
      this.createNumberCheck(
        profitDrawdownPercent,

        this.config
          .maximumProfitDrawdownPercent,

        "<=",

        `Profit drawdown from the candidate's best observation must remain at or below ${this.config.maximumProfitDrawdownPercent}%.`,
      );

    const checks = {
      active:
        activeCheck,

      consecutiveObservations:
        consecutiveCheck,

      persistence:
        persistenceCheck,

      netProfit:
        netProfitCheck,

      liquidity:
        liquidityCheck,

      freshness:
        freshnessCheck,

      profitStability:
        profitStabilityCheck,
    };

    const qualityChecksPass =
      netProfitCheck.passed &&
      liquidityCheck.passed &&
      freshnessCheck.passed &&
      profitStabilityCheck.passed;

    const persistenceChecksPass =
      consecutiveCheck.passed &&
      persistenceCheck.passed;

    let status:
      CandidateQualificationRecord[
        "status"
      ];

    if (
      candidate.status ===
      "DISAPPEARED"
    ) {
      status =
        "EXPIRED";
    } else if (
      !qualityChecksPass
    ) {
      status =
        "REJECTED";
    } else if (
      !persistenceChecksPass
    ) {
      status =
        "OBSERVING";
    } else {
      status =
        "QUALIFIED";
    }

    const score =
      this.calculateScore({
        active:
          activeCheck.passed,

        consecutive:
          consecutiveCheck.passed,

        persistence:
          persistenceCheck.passed,

        profit:
          netProfitCheck.passed,

        liquidity:
          liquidityCheck.passed,

        freshness:
          freshnessCheck.passed,

        stability:
          profitStabilityCheck.passed,
      });

    const reasons =
      this.createReasons(
        status,
        checks,
        liquidityAssessment,
      );

    return {
      key:
        candidate.key,

      market:
        candidate.market,

      buyExchange:
        candidate.buyExchange,

      sellExchange:
        candidate.sellExchange,

      status,

      qualified:
        status ===
        "QUALIFIED",

      score,

      evaluatedAt:
        now,

      profitDrawdownPercent,

      liquidityAssessment,

      checks,

      reasons,

      candidate:
        structuredClone(
          candidate,
        ),
    };
  }

  getQualification(
    key:
      string,
  ): CandidateQualificationRecord | null {
    const candidate =
      opportunityMonitorService
        .getCandidate(
          key,
        );

    return candidate
      ? this.evaluate(
          candidate,
        )
      : null;
  }

  getQualifiedCandidates():
    CandidateQualificationRecord[] {
    return this
      .getActiveQualifications()
      .filter(
        (
          qualification,
        ) =>
          qualification.qualified,
      )
      .sort(
        (
          first,
          second,
        ) => {
          if (
            first.score !==
            second.score
          ) {
            return (
              second.score -
              first.score
            );
          }

          return (
            second
              .candidate
              .latest
              .netProfitPercent -
            first
              .candidate
              .latest
              .netProfitPercent
          );
        },
      );
  }

  /**
   * Evaluate the current ACTIVE candidate set once for a single authoritative
   * snapshot. The automation hot path passes this immutable-by-contract batch
   * to the queue and diagnostic evidence collectors, avoiding repeated depth
   * simulation and candidate cloning in the same event-loop turn.
   */
  getActiveQualifications(
    now =
      Date.now(),
  ): CandidateQualificationRecord[] {
    return opportunityMonitorService
      .getActiveCandidates()
      .map(
        (
          candidate,
        ) =>
          this.evaluate(
            candidate,
            now,
          ),
      )
      .sort(
        (
          first,
          second,
        ) => {
          if (
            first.score !==
            second.score
          ) {
            return (
              second.score -
              first.score
            );
          }

          return (
            second
              .candidate
              .latest
              .netProfitPercent -
            first
              .candidate
              .latest
              .netProfitPercent
          );
        },
      );
  }

  getDiagnostics():
    CandidateQualificationDiagnostics {
    const monitor =
      opportunityMonitorService
        .getDiagnostics();

    const qualifications =
      monitor.candidates
        .map(
          (
            candidate,
          ) =>
            this.evaluate(
              candidate,
            ),
        )
        .sort(
          (
            first,
            second,
          ) => {
            const statusPriority:
              Record<
                CandidateQualificationRecord[
                  "status"
                ],
                number
              > = {
              QUALIFIED:
                0,

              OBSERVING:
                1,

              REJECTED:
                2,

              EXPIRED:
                3,
            };

            const firstPriority =
              statusPriority[
                first.status
              ];

            const secondPriority =
              statusPriority[
                second.status
              ];

            if (
              firstPriority !==
              secondPriority
            ) {
              return (
                firstPriority -
                secondPriority
              );
            }

            return (
              second.score -
              first.score
            );
          },
        );

    return {
      generatedAt:
        Date.now(),

      executionAllowed:
        false,

      config:
        structuredClone(
          this.config,
        ),

      totalCandidates:
        qualifications.length,

      observing:
        this.countStatus(
          qualifications,
          "OBSERVING",
        ),

      qualified:
        this.countStatus(
          qualifications,
          "QUALIFIED",
        ),

      rejected:
        this.countStatus(
          qualifications,
          "REJECTED",
        ),

      expired:
        this.countStatus(
          qualifications,
          "EXPIRED",
        ),

      legacyLiquidityPasses:
        qualifications.filter(
          (
            record,
          ) =>
            record
              .liquidityAssessment
              .legacyPassed,
        ).length,

      capitalAwareLiquidityPasses:
        qualifications.filter(
          (
            record,
          ) =>
            record
              .liquidityAssessment
              .capitalAware
              .passed,
        ).length,

      liquidityRejected:
        qualifications.filter(
          (
            record,
          ) =>
            !record
              .liquidityAssessment
              .passed,
        ).length,

      qualifications,
    };
  }

  private assessLiquidity(
    candidate:
      MonitoredOpportunityCandidate,
  ): CandidateLiquidityQualificationAssessment {
    const legacyPassed =
      candidate
        .latest
        .liquidityScore >=
      this.config
        .minimumLiquidityScore;

    const capitalAware =
      this.assessCapitalAwareLiquidity(
        candidate,
      );

    const passed =
      legacyPassed ||
      capitalAware.passed;

    return {
      legacyLiquidityScore:
        this.round(
          candidate
            .latest
            .liquidityScore,

          6,
        ),

      legacyMinimumLiquidityScore:
        this.config
          .minimumLiquidityScore,

      legacyPassed,

      capitalAware,

      passed,

      source:
        legacyPassed
          ? "LEGACY_SCORE"
          : capitalAware.passed
            ? "CAPITAL_AWARE_SIMULATION"
            : "NONE",
    };
  }

  private assessCapitalAwareLiquidity(
    candidate:
      MonitoredOpportunityCandidate,
  ): CandidateCapitalAwareLiquidityAssessment {
    const base:
      CandidateCapitalAwareLiquidityAssessment = {
      enabled:
        this.config
          .capitalAwareLiquidityEnabled,

      validationCapital:
        this.config
          .capitalAwareLiquidityValidationCapital,

      validationCapitalCurrency:
        "INR",

      quoteAsset:
        candidate.latest.quoteAsset ??
        null,

      simulationCapital:
        null,

      attempted:
        false,

      simulationSuccess:
        false,

      fullyExecutable:
        false,

      fillPercent:
        null,

      executableCapital:
        null,

      netProfit:
        null,

      netProfitPercent:
        null,

      totalSlippagePercent:
        null,

      confidenceScore:
        null,

      recommendation:
        null,

      minimumRequiredNetProfitPercent:
        this.config
          .capitalAwareLiquidityMinimumNetProfitPercent,

      requireExecuteRecommendation:
        this.config
          .capitalAwareLiquidityRequireExecuteRecommendation,

      passed:
        false,

      failureReason:
        null,
    };

    if (
      !this.config
        .capitalAwareLiquidityEnabled
    ) {
      return {
        ...base,

        failureReason:
          "Capital-aware liquidity qualification is disabled.",
      };
    }

    /*
     * Do not simulate disappeared historical
     * candidates against unrelated current books.
     */
    if (
      candidate.status !==
      "ACTIVE"
    ) {
      return {
        ...base,

        failureReason:
          "Capital-aware liquidity simulation is only attempted for ACTIVE candidates.",
      };
    }

    try {
      const referenceCapitalInr =
        candidate.latest
          .requestedCapitalInr;

      const referenceQuoteCapital =
        candidate.latest
          .requestedQuoteCapital;

      if (
        referenceCapitalInr ===
          undefined ||
        referenceQuoteCapital ===
          undefined ||
        !Number.isFinite(
          referenceCapitalInr,
        ) ||
        !Number.isFinite(
          referenceQuoteCapital,
        ) ||
        referenceCapitalInr <=
          0 ||
        referenceQuoteCapital <=
          0
      ) {
        return {
          ...base,

          attempted:
            true,

          failureReason:
            "Fresh INR-to-market-quote capital sizing evidence is unavailable.",
        };
      }

      const simulationCapital =
        this.config
          .capitalAwareLiquidityValidationCapital *
        (
          referenceQuoteCapital /
          referenceCapitalInr
        );

      const execution =
        executionSimulator
          .simulate({
            market:
              candidate.market,

            buyExchange:
              candidate.buyExchange,

            sellExchange:
              candidate.sellExchange,

            capital:
              simulationCapital,
          });

      if (
        !execution.success ||
        !execution.simulation
      ) {
        return {
          ...base,

          attempted:
            true,

          failureReason:
            execution.failureReason ??
            "Capital-aware execution simulation failed.",
        };
      }

      const simulation =
        execution.simulation;

      const netProfit =
        simulation
          .profit
          .breakdown
          .netProfit;

      const netProfitPercent =
        simulation
          .profit
          .profitPercent;

      const recommendation =
        simulation
          .decision
          .recommendation;

      const fullyExecutable =
        simulation
          .depth
          .fullyExecutable;

      const fillPercent =
        simulation
          .depth
          .fillPercent;

      const totalSlippagePercent =
        simulation
          .buySlippage
          .slippagePercent +
        simulation
          .sellSlippage
          .slippagePercent;

      /*
       * Capital-aware gate is intentionally
       * stricter than "book has some depth".
       *
       * It requires:
       *
       * - full execution
       * - 100% fill
       * - positive modeled net profit
       * - minimum modeled net profit %
       * - EXECUTE recommendation
       */
      const profitPass =
        Number.isFinite(
          netProfit,
        ) &&
        netProfit >
          0 &&
        Number.isFinite(
          netProfitPercent,
        ) &&
        netProfitPercent >=
          this.config
            .capitalAwareLiquidityMinimumNetProfitPercent;

      const recommendationPass =
        !this.config
          .capitalAwareLiquidityRequireExecuteRecommendation ||
        recommendation ===
          "EXECUTE";

      const passed =
        fullyExecutable &&
        fillPercent >=
          100 &&
        profitPass &&
        recommendationPass;

      const failureReasons:
        string[] = [];

      if (
        !fullyExecutable ||
        fillPercent <
          100
      ) {
        failureReasons.push(
          `₹${this.config.capitalAwareLiquidityValidationCapital} simulation is not fully executable (${this.round(
            fillPercent,
            4,
          )}% fill).`,
        );
      }

      if (
        !profitPass
      ) {
        failureReasons.push(
          `₹${this.config.capitalAwareLiquidityValidationCapital} simulated net profit ${this.round(
            netProfitPercent,
            6,
          )}% is below required ${this.config.capitalAwareLiquidityMinimumNetProfitPercent}% or is not positive.`,
        );
      }

      if (
        !recommendationPass
      ) {
        failureReasons.push(
          `ExecutionSimulator recommendation is ${recommendation}; EXECUTE is required for capital-aware liquidity qualification.`,
        );
      }

      return {
        ...base,

        simulationCapital:
          this.round(
            simulationCapital,
            12,
          ),

        attempted:
          true,

        simulationSuccess:
          true,

        fullyExecutable,

        fillPercent:
          this.round(
            fillPercent,
            6,
          ),

        executableCapital:
          this.round(
            simulation
              .depth
              .executableCapital,

            8,
          ),

        netProfit:
          this.round(
            netProfit,
            8,
          ),

        netProfitPercent:
          this.round(
            netProfitPercent,
            8,
          ),

        totalSlippagePercent:
          this.round(
            totalSlippagePercent,
            8,
          ),

        confidenceScore:
          this.round(
            simulation
              .confidence
              .score,

            4,
          ),

        recommendation,

        passed,

        failureReason:
          passed
            ? null
            : failureReasons.join(
                " ",
              ),
      };
    } catch (
      error:
        unknown
    ) {
      return {
        ...base,

        attempted:
          true,

        failureReason:
          error instanceof Error
            ? error.message
            : "Capital-aware liquidity simulation threw an unknown error.",
      };
    }
  }

  private liquidityReason(
    assessment:
      CandidateLiquidityQualificationAssessment,
  ): string {
    if (
      assessment.source ===
      "LEGACY_SCORE"
    ) {
      return `Liquidity passed legacy score requirement >= ${assessment.legacyMinimumLiquidityScore}.`;
    }

    if (
      assessment.source ===
      "CAPITAL_AWARE_SIMULATION"
    ) {
      return `Legacy liquidity score ${assessment.legacyLiquidityScore} is below ${assessment.legacyMinimumLiquidityScore}, but ₹${assessment.capitalAware.validationCapital} full-depth simulation is fully executable, profitable above ${assessment.capitalAware.minimumRequiredNetProfitPercent}%, and satisfies the execution recommendation gate.`;
    }

    const simulationReason =
      assessment
        .capitalAware
        .failureReason
        ? ` Capital-aware result: ${assessment.capitalAware.failureReason}`
        : "";

    return `Liquidity did not pass legacy score >= ${assessment.legacyMinimumLiquidityScore} and did not pass capital-aware execution validation.${simulationReason}`;
  }

  private calculateProfitDrawdownPercent(
    candidate:
      MonitoredOpportunityCandidate,
  ): number {
    const best =
      candidate
        .best
        .netProfitPercent;

    const latest =
      candidate
        .latest
        .netProfitPercent;

    if (
      !Number.isFinite(
        best,
      ) ||
      best <=
        0
    ) {
      return 100;
    }

    if (
      latest >=
      best
    ) {
      return 0;
    }

    return this.round(
      Math.max(
        0,

        (
          (
            best -
            latest
          ) /
          best
        ) *
          100,
      ),

      4,
    );
  }

  private createBooleanCheck(
    current:
      boolean,

    required:
      boolean,

    reason:
      string,
  ): CandidateQualificationCheck {
    return {
      passed:
        current ===
        required,

      currentValue:
        current,

      requiredValue:
        required,

      reason,
    };
  }

  private createNumberCheck(
    current:
      number,

    required:
      number,

    operator:
      ">=" |
      "<=",

    reason:
      string,
  ): CandidateQualificationCheck {
    const passed =
      operator ===
      ">="
        ? current >=
          required
        : current <=
          required;

    return {
      passed,

      currentValue:
        this.round(
          current,
          6,
        ),

      requiredValue:
        required,

      reason,
    };
  }

  private calculateScore(
    checks: {
      active:
        boolean;

      consecutive:
        boolean;

      persistence:
        boolean;

      profit:
        boolean;

      liquidity:
        boolean;

      freshness:
        boolean;

      stability:
        boolean;
    },
  ): number {
    let score =
      0;

    if (
      checks.active
    ) {
      score +=
        5;
    }

    if (
      checks.consecutive
    ) {
      score +=
        10;
    }

    if (
      checks.persistence
    ) {
      score +=
        10;
    }

    if (
      checks.profit
    ) {
      score +=
        25;
    }

    if (
      checks.liquidity
    ) {
      score +=
        20;
    }

    if (
      checks.freshness
    ) {
      score +=
        15;
    }

    if (
      checks.stability
    ) {
      score +=
        15;
    }

    return score;
  }

  private createReasons(
    status:
      CandidateQualificationRecord[
        "status"
      ],

    checks:
      CandidateQualificationRecord[
        "checks"
      ],

    liquidityAssessment:
      CandidateLiquidityQualificationAssessment,
  ): string[] {
    if (
      status ===
      "QUALIFIED"
    ) {
      return [
        "Candidate passed persistence, profit, liquidity, freshness, and stability qualification gates.",

        liquidityAssessment.source ===
          "CAPITAL_AWARE_SIMULATION"
          ? `Liquidity qualified using ₹${liquidityAssessment.capitalAware.validationCapital} capital-aware full-depth execution simulation; legacy liquidity score alone did not pass.`
          : "Liquidity qualified using the existing legacy liquidity score gate.",

        "Candidate is qualified for the next automation stage only.",

        "Qualification does not directly execute PAPER or LIVE trades.",
      ];
    }

    if (
      status ===
      "EXPIRED"
    ) {
      return [
        "Candidate disappeared from the latest authoritative opportunity snapshot.",
      ];
    }

    const failedReasons =
      Object.values(
        checks,
      )
        .filter(
          (
            check,
          ) =>
            !check.passed,
        )
        .map(
          (
            check,
          ) =>
            check.reason,
        );

    if (
      status ===
      "OBSERVING"
    ) {
      return [
        "Candidate quality gates currently pass, but persistence qualification is not complete.",
        ...failedReasons,
      ];
    }

    return [
      "Candidate failed one or more execution-quality qualification gates.",
      ...failedReasons,
    ];
  }

  private countStatus(
    records:
      CandidateQualificationRecord[],

    status:
      CandidateQualificationRecord[
        "status"
      ],
  ): number {
    return records.filter(
      (
        record,
      ) =>
        record.status ===
        status,
    ).length;
  }

  private validateConfig():
    void {
    if (
      !Number.isInteger(
        this.config
          .minimumConsecutiveObservations,
      ) ||
      this.config
        .minimumConsecutiveObservations <
        1
    ) {
      throw new Error(
        "minimumConsecutiveObservations must be a positive integer.",
      );
    }

    if (
      !Number.isFinite(
        this.config
          .minimumPersistenceMs,
      ) ||
      this.config
        .minimumPersistenceMs <
        0
    ) {
      throw new Error(
        "minimumPersistenceMs must be zero or greater.",
      );
    }

    if (
      !Number.isFinite(
        this.config
          .minimumNetProfitPercent,
      ) ||
      this.config
        .minimumNetProfitPercent <=
        0
    ) {
      throw new Error(
        "minimumNetProfitPercent must be positive.",
      );
    }

    if (
      !this.isPercentage(
        this.config
          .minimumLiquidityScore,
      )
    ) {
      throw new Error(
        "minimumLiquidityScore must be between 0 and 100.",
      );
    }

    if (
      !this.isPercentage(
        this.config
          .minimumFreshnessScore,
      )
    ) {
      throw new Error(
        "minimumFreshnessScore must be between 0 and 100.",
      );
    }

    if (
      !this.isPercentage(
        this.config
          .maximumProfitDrawdownPercent,
      )
    ) {
      throw new Error(
        "maximumProfitDrawdownPercent must be between 0 and 100.",
      );
    }

    if (
      !Number.isFinite(
        this.config
          .capitalAwareLiquidityValidationCapital,
      ) ||
      this.config
        .capitalAwareLiquidityValidationCapital <=
        0
    ) {
      throw new Error(
        "capitalAwareLiquidityValidationCapital must be positive.",
      );
    }

    if (
      !Number.isFinite(
        this.config
          .capitalAwareLiquidityMinimumNetProfitPercent,
      ) ||
      this.config
        .capitalAwareLiquidityMinimumNetProfitPercent <=
        0
    ) {
      throw new Error(
        "capitalAwareLiquidityMinimumNetProfitPercent must be positive.",
      );
    }
  }

  private isPercentage(
    value:
      number,
  ): boolean {
    return (
      Number.isFinite(
        value,
      ) &&
      value >=
        0 &&
      value <=
        100
    );
  }

  private round(
    value:
      number,

    digits:
      number,
  ): number {
    if (
      !Number.isFinite(
        value,
      )
    ) {
      return 0;
    }

    const multiplier =
      10 **
      digits;

    return (
      Math.round(
        (
          value +
          Number.EPSILON
        ) *
          multiplier,
      ) /
      multiplier
    );
  }
}

export const candidateQualificationService =
  new CandidateQualificationService();
