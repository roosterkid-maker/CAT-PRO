import {
  executionSimulator,
} from "../../execution/services/ExecutionSimulator";

import type {
  ExecutionRequest,
} from "../../execution/models/ExecutionRequest";

import type {
  ExecutionResult,
} from "../../execution/models/ExecutionResult";

import type {
  ArbitrageOpportunity,
} from "../../arbitrage/models/ArbitrageOpportunity";

import {
  opportunityService,
} from "../../arbitrage/services/OpportunityService";

import {
  strategyOneFundedRouteService,
} from "../../trading/execution/StrategyOneFundedRouteService";

import type {
  StrategyOneFundedRouteReport,
} from "../../trading/execution/StrategyOneFundedRouteService";

import {
  strategyOnePaperStressGate,
} from "../../trading/execution/AutomatedPaperTradingService";

import type {
  StrategyOnePaperStressGateReport,
} from "../../trading/execution/AutomatedPaperTradingService";

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

import {
  assessStrategyOnePilotDispatchReservedFreshness,
  isExactStrategyOnePilotRoute,
  STRATEGY_ONE_PILOT_DISPATCH_RESERVED_MAXIMUM_BOOK_AGE_MS,
  STRATEGY_ONE_PILOT_MAXIMUM_BOOK_AGE_MS,
  STRATEGY_ONE_PILOT_MAXIMUM_BOOK_SKEW_MS,
} from "../../arbitrage/execution/StrategyOnePilotEquivalentPaperEvidenceService";

const DEFAULT_CONFIG:
  CandidateQualificationConfig = {
  minimumConsecutiveObservations:
    3,

  minimumPersistenceMs:
    5_000,

  /*
   * HFT PAPER V2 fast lane. A route must still pass exact full-depth,
   * exchange-rule, fee, adverse-reserve and safety-buffer economics. Only the
   * dwell requirement is shortened for a stronger post-stress edge backed by
   * two genuinely different order-book generations.
   */
  fastLaneMinimumPostStressNetProfitPercent:
    PROFIT_TIER_POLICY
      .liveMinimumNetProfitPercent,

  fastLaneMinimumConsecutiveDistinctBookObservations:
    2,

  fastLaneMinimumPersistenceMs:
    0,

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
   * Qualification validates the central Strategy #1 reference size, not an
   * unlabelled market-quote amount. ₹500 also matches the exchange-executable
   * pilot ceiling; the INR amount is converted to the route quote asset before
   * any depth simulation.
   */
  capitalAwareLiquidityEnabled:
    true,

  capitalAwareLiquidityValidationCapital:
    500,

  capitalAwareLiquidityMinimumNetProfitPercent:
    PROFIT_TIER_POLICY
      .qualificationMinimumNetProfitPercent,

  capitalAwareLiquidityRequireExecuteRecommendation:
    true,
};

export interface CandidateQualificationDependencies {
  simulateExecution(
    request:
      ExecutionRequest,
  ): ExecutionResult;

  getOpportunityById(
    opportunityId:
      string,
  ): ArbitrageOpportunity | null;

  evaluateFundedRoute(input: {
    opportunity:
      ArbitrageOpportunity;
    requestedCapitalInr:
      number;
    requestedQuoteCapital:
      number;
    requestedQuantity:
      number;
    fundingBoundary:
      "ISOLATED_PAPER";
    now:
      number;
  }): StrategyOneFundedRouteReport;

  evaluateStress(input: {
    opportunity:
      ArbitrageOpportunity;
    quantity:
      number;
    now:
      number;
  }): StrategyOnePaperStressGateReport;
}

const DEFAULT_DEPENDENCIES:
  CandidateQualificationDependencies = {
  simulateExecution:
    (request) =>
      executionSimulator.simulate(
        request,
      ),
  getOpportunityById:
    (opportunityId) =>
      opportunityService.getOpportunityById(
        opportunityId,
      ),
  evaluateFundedRoute:
    (input) =>
      strategyOneFundedRouteService.evaluate(
        input,
      ),
  evaluateStress:
    (input) =>
      strategyOnePaperStressGate.evaluate(
        input,
      ),
};

export class CandidateQualificationService {
  private readonly config:
    CandidateQualificationConfig;

  private readonly dependencies:
    CandidateQualificationDependencies;

  constructor(
    config:
      Partial<CandidateQualificationConfig> = {},

    dependencies:
      Partial<CandidateQualificationDependencies> = {},
  ) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };

    this.dependencies = {
      ...DEFAULT_DEPENDENCIES,
      ...dependencies,
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

    const persistenceMs =
      candidate.status ===
        "ACTIVE"
        ? Math.max(
            candidate.lifetimeMs,

            now -
              candidate.firstSeenAt,
          )
        : candidate.lifetimeMs;

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
     * The legacy liquidity score remains useful evidence, but may not bypass
     * exact quote-capital depth, venue order rules and post-stress economics.
     */
    const liquidityAssessment =
      this.assessLiquidity(
        candidate,
        now,
      );

    const postStressNetProfitPercent =
      liquidityAssessment
        .capitalAware
        .postStressNetProfitPercent;

    const fastLane =
      liquidityAssessment
        .capitalAware
        .passed &&
      postStressNetProfitPercent !==
        null &&
      postStressNetProfitPercent !==
        undefined &&
      Number.isFinite(
        postStressNetProfitPercent,
      ) &&
      postStressNetProfitPercent +
        1e-12 >=
        this.config
          .fastLaneMinimumPostStressNetProfitPercent;

    const consecutiveEvidence =
      fastLane
        ? candidate
            .consecutiveDistinctBookObservations ??
          candidate
            .consecutiveObservations
        : candidate
            .consecutiveObservations;

    const requiredConsecutiveObservations =
      fastLane
        ? this.config
            .fastLaneMinimumConsecutiveDistinctBookObservations
        : this.config
            .minimumConsecutiveObservations;

    const requiredPersistenceMs =
      fastLane
        ? this.config
            .fastLaneMinimumPersistenceMs
        : this.config
            .minimumPersistenceMs;

    const laneLabel =
      fastLane
        ? "HFT PAPER fast lane"
        : "standard PAPER lane";

    const consecutiveCheck =
      this.createNumberCheck(
        consecutiveEvidence,

        requiredConsecutiveObservations,

        ">=",

        `${laneLabel} requires at least ${requiredConsecutiveObservations} ${fastLane ? "distinct fresh book generations" : "consecutive observations"}.`,
      );

    const persistenceCheck =
      this.createNumberCheck(
        persistenceMs,

        requiredPersistenceMs,

        ">=",

        `${laneLabel} requires at least ${requiredPersistenceMs} ms persistence.`,
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
      this.createFreshnessCheck(
        candidate,
        now,
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

        `Profit drawdown from the candidate's rolling synchronized reference must remain at or below ${this.config.maximumProfitDrawdownPercent}%.`,
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

  private createFreshnessCheck(
    candidate: MonitoredOpportunityCandidate,
    now: number,
  ): CandidateQualificationCheck {
    const scorePassed =
      candidate.latest.freshnessScore >=
      this.config.minimumFreshnessScore;

    if (!isExactStrategyOnePilotRoute(candidate)) {
      return this.createNumberCheck(
        candidate.latest.freshnessScore,
        this.config.minimumFreshnessScore,
        ">=",
        `Freshness score must be at least ${this.config.minimumFreshnessScore}.`,
      );
    }

    const pilot = assessStrategyOnePilotDispatchReservedFreshness({
      buyExchange: candidate.buyExchange,
      sellExchange: candidate.sellExchange,
      buyTimestamp: candidate.latest.buyQuoteTimestamp,
      sellTimestamp: candidate.latest.sellQuoteTimestamp,
      quotesAreFresh: candidate.latest.quotesAreFresh,
      usedLastPriceFallback: candidate.latest.usedLastPriceFallback,
      now,
    });

    return {
      passed: scorePassed && pilot.passed,
      currentValue:
        `score=${candidate.latest.freshnessScore}; buyAge=${pilot.buyAgeMs}ms; sellAge=${pilot.sellAgeMs}ms; skew=${pilot.skewMs}ms`,
      requiredValue:
        `score>=${this.config.minimumFreshnessScore}; ages<=${STRATEGY_ONE_PILOT_DISPATCH_RESERVED_MAXIMUM_BOOK_AGE_MS}ms; skew<=${STRATEGY_ONE_PILOT_MAXIMUM_BOOK_SKEW_MS}ms; no fallback`,
      reason: scorePassed && pilot.passed
        ? `Binance/Bybit pilot quote generation satisfies the dispatch-reserved age boundary inside the operator-reviewed ${STRATEGY_ONE_PILOT_MAXIMUM_BOOK_AGE_MS} ms ceiling.`
        : `Binance/Bybit pilot freshness failed: ${pilot.reasons.join(", ") || "FRESHNESS_SCORE"}.`,
    };
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
    const qualifications:
      CandidateQualificationRecord[] =
      [];

    opportunityMonitorService
      .forEachActiveCandidate(
        (
          candidate,
        ) => {
          qualifications.push(
            this.evaluate(
              candidate,
              now,
            ),
          );
        },
      );

    return qualifications.sort(
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

    now:
      number,
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
        now,
      );

    const passed =
      capitalAware.enabled
        ? capitalAware.passed
        : legacyPassed;

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
        capitalAware.enabled &&
        capitalAware.passed
          ? "CAPITAL_AWARE_SIMULATION"
          : !capitalAware.enabled &&
              legacyPassed
            ? "LEGACY_SCORE"
            : "NONE",
    };
  }

  private assessCapitalAwareLiquidity(
    candidate:
      MonitoredOpportunityCandidate,

    now:
      number,
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

      opportunityResolved:
        false,

      marketRulesChecked:
        false,

      liveOrderSafe:
        false,

      fundedRouteState:
        null,

      stressStatus:
        null,

      postStressNetProfit:
        null,

      postStressNetProfitPercent:
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
        this.dependencies
          .simulateExecution({
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

      const opportunity =
        this.dependencies
          .getOpportunityById(
            candidate
              .latestOpportunityId,
          );

      const opportunityMatchesCandidate =
        opportunity !==
          null &&
        opportunity.pair.market
          .trim()
          .toUpperCase() ===
          candidate.market
            .trim()
            .toUpperCase() &&
        opportunity.pair.buy.exchange
          .trim()
          .toLowerCase() ===
          candidate.buyExchange
            .trim()
            .toLowerCase() &&
        opportunity.pair.sell.exchange
          .trim()
          .toLowerCase() ===
          candidate.sellExchange
            .trim()
            .toLowerCase();

      const funded =
        opportunityMatchesCandidate &&
        opportunity
          ? this.dependencies
              .evaluateFundedRoute({
                opportunity,
                requestedCapitalInr:
                  this.config
                    .capitalAwareLiquidityValidationCapital,
                requestedQuoteCapital:
                  simulationCapital,
                requestedQuantity:
                  simulationCapital /
                  opportunity.buyPrice,
                fundingBoundary:
                  "ISOLATED_PAPER",
                now,
              })
          : null;

      const executableQuantity =
        funded
          ?.executableQuantity ??
        null;

      const marketRulesPass =
        funded !==
          null &&
        funded.state !==
          "BLOCKED" &&
        executableQuantity !==
          null &&
        Number.isFinite(
          executableQuantity,
        ) &&
        executableQuantity >
          0;

      const liveOrderSafe =
        marketRulesPass &&
        funded?.quantityNormalization
          ?.liveOrderSafe ===
          true;

      const stress =
        opportunity &&
        marketRulesPass &&
        executableQuantity !==
          null
          ? this.dependencies
              .evaluateStress({
                opportunity,
                quantity:
                  executableQuantity,
                now,
              })
          : null;

      const stressPass =
        stress?.status ===
          "PASSED" &&
        stress.postStressNetProfit !==
          null &&
        stress.postStressNetProfit >
          0 &&
        stress.postStressNetProfitPercent !==
          null &&
        stress.postStressNetProfitPercent +
          1e-12 >=
          this.config
            .capitalAwareLiquidityMinimumNetProfitPercent;

      const passed =
        fullyExecutable &&
        fillPercent >=
          100 &&
        profitPass &&
        recommendationPass &&
        opportunityMatchesCandidate &&
        marketRulesPass &&
        liveOrderSafe &&
        stressPass;

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

      if (
        !opportunityMatchesCandidate
      ) {
        failureReasons.push(
          "Exact latest opportunity snapshot is unavailable or no longer matches the monitored route.",
        );
      }

      if (
        opportunityMatchesCandidate &&
        !marketRulesPass
      ) {
        failureReasons.push(
          `Exchange quantity/min-notional validation blocked the route${funded?.blockers.length ? `: ${funded.blockers.join("; ")}` : "."}`,
        );
      }

      if (
        marketRulesPass &&
        !liveOrderSafe
      ) {
        failureReasons.push(
          "Both exchange quantity increments are not complete enough to certify a real order-safe common quantity.",
        );
      }

      if (
        marketRulesPass &&
        !stressPass
      ) {
        failureReasons.push(
          `Exact post-stress economics failed${stress?.reasons.length ? `: ${stress.reasons.join("; ")}` : "."}`,
        );
      }

      const conservativeNetProfit =
        stress?.postStressNetProfit ??
        netProfit;

      const conservativeNetProfitPercent =
        stress?.postStressNetProfitPercent ??
        netProfitPercent;

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
            conservativeNetProfit,
            8,
          ),

        netProfitPercent:
          this.round(
            conservativeNetProfitPercent,
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

        opportunityResolved:
          opportunityMatchesCandidate,

        marketRulesChecked:
          funded !==
          null,

        liveOrderSafe,

        fundedRouteState:
          funded?.state ??
          null,

        stressStatus:
          stress?.status ??
          null,

        postStressNetProfit:
          stress?.postStressNetProfit ===
            null ||
          stress?.postStressNetProfit ===
            undefined
            ? null
            : this.round(
                stress.postStressNetProfit,
                8,
              ),

        postStressNetProfitPercent:
          stress?.postStressNetProfitPercent ===
            null ||
          stress?.postStressNetProfitPercent ===
            undefined
            ? null
            : this.round(
                stress.postStressNetProfitPercent,
                8,
              ),

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
      return `₹${assessment.capitalAware.validationCapital} INR-sized validation passed full depth, both exchange order rules, real-order-safe quantity normalization and post-stress net >= ${assessment.capitalAware.minimumRequiredNetProfitPercent}%. Legacy liquidity score ${assessment.legacyLiquidityScore} remains diagnostic evidence.`;
    }

    const simulationReason =
      assessment
        .capitalAware
        .failureReason
        ? ` Capital-aware result: ${assessment.capitalAware.failureReason}`
        : "";

    return assessment.capitalAware.enabled
      ? `Candidate did not pass mandatory INR-sized executable-economics validation.${simulationReason}`
      : `Capital-aware validation is explicitly disabled and legacy liquidity score did not pass >= ${assessment.legacyMinimumLiquidityScore}.${simulationReason}`;
  }

  private calculateProfitDrawdownPercent(
    candidate:
      MonitoredOpportunityCandidate,
  ): number {
    const recent =
      (
        candidate
          .recentNetProfitObservations ??
        []
      )
        .map(
          (
            observation,
          ) =>
            observation.netProfitPercent,
        )
        .filter(
          (
            value,
          ) =>
            Number.isFinite(
              value,
            ) &&
            value >
              0,
        )
        .sort(
          (
            first,
            second,
          ) =>
            first -
            second,
        );

    /*
     * Three distinct synchronized generations are enough to stop a single
     * transient spread spike becoming a permanent session watermark. The
     * upper quartile remains conservative when the route is genuinely
     * deteriorating, while still allowing a stable lower plateau to be
     * evaluated on its own current economics.
     */
    const reference =
      recent.length >=
        3
        ? recent[
            Math.floor(
              (
                recent.length -
                1
              ) *
                0.75,
            )
          ]!
        : candidate
            .best
            .netProfitPercent;

    const latest =
      candidate
        .latest
        .netProfitPercent;

    if (
      !Number.isFinite(
        reference,
      ) ||
      reference <=
        0
    ) {
      return 100;
    }

    if (
      latest >=
        reference
    ) {
      return 0;
    }

    return this.round(
      Math.max(
        0,

        (
          (
            reference -
            latest
          ) /
          reference
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
          ? `Qualification used ₹${liquidityAssessment.capitalAware.validationCapital} INR-sized full-depth, exchange-rule and post-stress execution evidence; the legacy score cannot bypass it.`
          : "Capital-aware validation was explicitly disabled; qualification used the legacy liquidity score gate.",

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
          .fastLaneMinimumPostStressNetProfitPercent,
      ) ||
      this.config
        .fastLaneMinimumPostStressNetProfitPercent <
        this.config
          .capitalAwareLiquidityMinimumNetProfitPercent
    ) {
      throw new Error(
        "fastLaneMinimumPostStressNetProfitPercent must be finite and at least the capital-aware minimum.",
      );
    }

    if (
      !Number.isInteger(
        this.config
          .fastLaneMinimumConsecutiveDistinctBookObservations,
      ) ||
      this.config
        .fastLaneMinimumConsecutiveDistinctBookObservations <
        2
    ) {
      throw new Error(
        "fastLaneMinimumConsecutiveDistinctBookObservations must be an integer of at least two.",
      );
    }

    if (
      !Number.isFinite(
        this.config
          .fastLaneMinimumPersistenceMs,
      ) ||
      this.config
        .fastLaneMinimumPersistenceMs <
        0 ||
      this.config
        .fastLaneMinimumPersistenceMs >
        this.config
          .minimumPersistenceMs
    ) {
      throw new Error(
        "fastLaneMinimumPersistenceMs must be non-negative and no greater than the standard persistence requirement.",
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
