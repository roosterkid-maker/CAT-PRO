import {
  randomUUID,
} from "node:crypto";

import {
  capitalOptimizer,
} from "../../optimizer/services/CapitalOptimizer";

import {
  tradingAccountService,
} from "../../trading/account/TradingAccountService";

import type {
  CandidateQualificationRecord,
} from "../models/CandidateQualification";

import type {
  AdaptivePaperCapitalAllocationConstraints,
  AdaptivePaperCapitalAllocationRecord,
  AdaptivePaperCapitalAllocatorConfig,
  AdaptivePaperCapitalAllocatorDiagnostics,
  AdaptivePaperCapitalQualityFactors,
} from "../models/AdaptivePaperCapitalAllocation";

import {
  paperPortfolioOptimizerService,
} from "./PaperPortfolioOptimizerService";

import {
  paperCapitalConfigurationService,
} from "../../trading/capital/PaperCapitalConfigurationService";

const DEFAULT_CONFIG:
  AdaptivePaperCapitalAllocatorConfig = {
  totalCapitalBudget:
    100_000,

  minimumCapital:
    100,

  maximumCapitalPerTrade:
    1_000,

  capitalStep:
    100,

  minimumQualificationScore:
    85,

  fullSizeProfitPercent:
    1.5,

  persistenceTargetMs:
    30_000,

  minimumBudgetFactor:
    0.25,

  maximumHistory:
    250,
};

export class AdaptivePaperCapitalAllocatorService {
  private readonly configOverrides:
    Partial<AdaptivePaperCapitalAllocatorConfig>;

  private readonly configProvider:
    (() => Partial<AdaptivePaperCapitalAllocatorConfig>) | null;

  private get config():
    AdaptivePaperCapitalAllocatorConfig {
    return {
      ...DEFAULT_CONFIG,
      ...(
        this.configProvider?.() ??
        {}
      ),
      ...this.configOverrides,
    };
  }

  private readonly recentAllocations:
    AdaptivePaperCapitalAllocationRecord[] =
    [];

  private totalRequests =
    0;

  private allocated =
    0;

  private rejectedLimits =
    0;

  private rejectedQuality =
    0;

  private rejectedPortfolio =
    0;

  private optimizerRejected =
    0;

  private totalAllocatedCapital =
    0;

  private lastAllocationAt:
    number | null =
    null;

  private lastAllocation:
    AdaptivePaperCapitalAllocationRecord | null =
    null;

  constructor(
    config:
      Partial<AdaptivePaperCapitalAllocatorConfig> = {},

    configProvider:
      (() => Partial<AdaptivePaperCapitalAllocatorConfig>) | null =
        null,
  ) {
    this.configOverrides = {
      ...config,
    };

    this.configProvider =
      configProvider;

    this.validateConfig();
  }

  allocate(
    qualification:
      CandidateQualificationRecord,

    constraints:
      AdaptivePaperCapitalAllocationConstraints,

    now =
      Date.now(),
  ): AdaptivePaperCapitalAllocationRecord {
    this.totalRequests +=
      1;

    const account =
      tradingAccountService
        .getAccount();

    const candidate =
      qualification.candidate;

    const qualityFactors =
      this.calculateQualityFactors(
        qualification,
        now,
      );

    const portfolioRoute =
      paperPortfolioOptimizerService
        .evaluateRoute(
          qualification.buyExchange,
          qualification.sellExchange,
        );

    const emptyPortfolioAdjustment = {
      routeStatus:
        portfolioRoute.status,

      routeScore:
        portfolioRoute.score,

      capitalMultiplier:
        portfolioRoute
          .capitalMultiplier,

      preAdjustmentBudget:
        0,

      adjustedBudget:
        0,

      reasons:
        structuredClone(
          portfolioRoute.reasons,
        ),
    };

    if (
      !qualification.qualified ||
      candidate.status !==
        "ACTIVE" ||
      qualification.score <
        this.config
          .minimumQualificationScore
    ) {
      this.rejectedQuality +=
        1;

      return this.store({
        id:
          randomUUID(),

        candidateKey:
          qualification.key,

        market:
          qualification.market,

        buyExchange:
          qualification.buyExchange,

        sellExchange:
          qualification.sellExchange,

        status:
          "REJECTED_QUALITY",

        evaluatedAt:
          now,

        qualityFactors,

        portfolioAdjustment:
          emptyPortfolioAdjustment,

        limits:
          this.createEmptyLimits(
            account.availableCapital,
            account
              .limits
              .maximumCapitalPerTrade,
            constraints,
          ),

        qualityBudget:
          0,

        optimization:
          this.emptyOptimization(
            0,
          ),

        allocatedCapital:
          0,

        reason:
          "Candidate does not satisfy Version 16.3 adaptive-capital quality gates.",
      });
    }

    /*
     * Version 16.5 hard historical block.
     */
    if (
      portfolioRoute.status ===
        "BLOCKED" ||
      portfolioRoute.capitalMultiplier <=
        0
    ) {
      this.rejectedPortfolio +=
        1;

      return this.store({
        id:
          randomUUID(),

        candidateKey:
          qualification.key,

        market:
          qualification.market,

        buyExchange:
          qualification.buyExchange,

        sellExchange:
          qualification.sellExchange,

        status:
          "REJECTED_PORTFOLIO",

        evaluatedAt:
          now,

        qualityFactors,

        portfolioAdjustment:
          emptyPortfolioAdjustment,

        limits:
          this.createEmptyLimits(
            account.availableCapital,
            account
              .limits
              .maximumCapitalPerTrade,
            constraints,
          ),

        qualityBudget:
          0,

        optimization:
          this.emptyOptimization(
            0,
          ),

        allocatedCapital:
          0,

        reason:
          "Version 16.5 Paper Portfolio Optimizer blocked this exchange route based on accumulated route performance.",
      });
    }

    const buyExchangeHeadroom =
      Math.max(
        0,

        constraints
          .exchangeExposureLimit -
          constraints
            .currentBuyExchangeExposure,
      );

    const sellExchangeHeadroom =
      Math.max(
        0,

        constraints
          .exchangeExposureLimit -
          constraints
              .currentSellExchangeExposure,
      );

    const configuredCapitalInUse =
      Math.max(
        0,
        account.currentCapital -
          account.availableCapital,
      );

    const configuredCapitalHeadroom =
      Math.max(
        0,
        this.config.totalCapitalBudget -
          configuredCapitalInUse,
      );

    const hardMaximumCapital =
      Math.max(
        0,

        Math.min(
          account.availableCapital,

          configuredCapitalHeadroom,

          account
            .limits
            .maximumCapitalPerTrade,

          this.config
            .maximumCapitalPerTrade,

          constraints
            .remainingBatchCapital,

          buyExchangeHeadroom,

          sellExchangeHeadroom,
        ),
      );

    const limits = {
      accountAvailableCapital:
        this.round(
          account.availableCapital,
          2,
        ),

      accountMaximumCapitalPerTrade:
        this.round(
          account
            .limits
            .maximumCapitalPerTrade,
          2,
        ),

      configuredCapitalBudget:
        this.config
          .totalCapitalBudget,

      configuredCapitalInUse:
        this.round(
          configuredCapitalInUse,
          2,
        ),

      configuredCapitalHeadroom:
        this.round(
          configuredCapitalHeadroom,
          2,
        ),

      automationMaximumCapitalPerTrade:
        this.config
          .maximumCapitalPerTrade,

      remainingBatchCapital:
        this.round(
          constraints
            .remainingBatchCapital,
          2,
        ),

      buyExchangeHeadroom:
        this.round(
          buyExchangeHeadroom,
          2,
        ),

      sellExchangeHeadroom:
        this.round(
          sellExchangeHeadroom,
          2,
        ),

      hardMaximumCapital:
        this.round(
          hardMaximumCapital,
          2,
        ),
    };

    if (
      hardMaximumCapital <
      this.config.minimumCapital
    ) {
      this.rejectedLimits +=
        1;

      return this.store({
        id:
          randomUUID(),

        candidateKey:
          qualification.key,

        market:
          qualification.market,

        buyExchange:
          qualification.buyExchange,

        sellExchange:
          qualification.sellExchange,

        status:
          "REJECTED_LIMITS",

        evaluatedAt:
          now,

        qualityFactors,

        portfolioAdjustment:
          emptyPortfolioAdjustment,

        limits,

        qualityBudget:
          0,

        optimization:
          this.emptyOptimization(
            0,
          ),

        allocatedCapital:
          0,

        reason:
          `Available capital headroom is below the minimum adaptive PAPER allocation of ${this.config.minimumCapital}.`,
      });
    }

    const budgetFactor =
      this.config
        .minimumBudgetFactor +
      (
        1 -
        this.config
          .minimumBudgetFactor
      ) *
        (
          qualityFactors.combined /
          100
        );

    /*
     * Version 16.3 budget.
     */
    const preAdjustmentBudget =
      this.normalizeMaximumCapital(
        hardMaximumCapital *
          budgetFactor,

        hardMaximumCapital,
      );

    /*
     * Version 16.5 route-history adjustment.
     *
     * The multiplier can never override the
     * upstream hard capital ceiling.
     */
    const portfolioAdjustedRaw =
      preAdjustmentBudget *
      portfolioRoute
        .capitalMultiplier;

    const adjustedBudget =
      this.normalizeMaximumCapital(
        Math.min(
          portfolioAdjustedRaw,
          hardMaximumCapital,
        ),

        hardMaximumCapital,
      );

    const portfolioAdjustment = {
      routeStatus:
        portfolioRoute.status,

      routeScore:
        portfolioRoute.score,

      capitalMultiplier:
        portfolioRoute
          .capitalMultiplier,

      preAdjustmentBudget:
        preAdjustmentBudget,

      adjustedBudget,

      reasons:
        structuredClone(
          portfolioRoute.reasons,
        ),
    };

    const qualityBudget =
      adjustedBudget;

    if (
      qualityBudget <
      this.config.minimumCapital
    ) {
      this.rejectedLimits +=
        1;

      return this.store({
        id:
          randomUUID(),

        candidateKey:
          qualification.key,

        market:
          qualification.market,

        buyExchange:
          qualification.buyExchange,

        sellExchange:
          qualification.sellExchange,

        status:
          "REJECTED_LIMITS",

        evaluatedAt:
          now,

        qualityFactors,

        portfolioAdjustment,

        limits,

        qualityBudget,

        optimization:
          this.emptyOptimization(
            qualityBudget,
          ),

        allocatedCapital:
          0,

        reason:
          "Portfolio-adjusted capital budget fell below the minimum PAPER allocation.",
      });
    }

    try {
      /*
       * CapitalOptimizer remains final sizing
       * authority after BOTH:
       *
       * Version 16.3 quality sizing
       * Version 16.5 portfolio adjustment
       *
       * It still checks actual execution
       * simulation at each capital candidate.
       */
      const optimization =
        capitalOptimizer
          .optimize({
            market:
              qualification.market,

            buyExchange:
              qualification.buyExchange,

            sellExchange:
              qualification.sellExchange,

            minimumCapital:
              this.config.minimumCapital,

            maximumCapital:
              qualityBudget,

            capitalStep:
              this.config.capitalStep,

            executionCapitalMultiplier:
              (
                qualification.candidate.latest.requestedQuoteCapital ??
                0
              ) /
              (
                qualification.candidate.latest.requestedCapitalInr ??
                1
              ),

            executionCapitalCurrency:
              qualification.candidate.latest.quoteAsset ??
              "MARKET_QUOTE",
          });

      const best =
        optimization.best;

      if (
        !best ||
        !best.execution.success ||
        best.score <=
          0
      ) {
        this.optimizerRejected +=
          1;

        return this.store({
          id:
            randomUUID(),

          candidateKey:
            qualification.key,

          market:
            qualification.market,

          buyExchange:
            qualification.buyExchange,

          sellExchange:
            qualification.sellExchange,

          status:
            "OPTIMIZER_REJECTED",

          evaluatedAt:
            now,

          qualityFactors,

          portfolioAdjustment,

          limits,

          qualityBudget,

          optimization: {
            minimumCapital:
              this.config.minimumCapital,

            maximumCapital:
              qualityBudget,

            capitalStep:
              this.config.capitalStep,

            evaluatedCandidates:
              optimization
                .summary
                .evaluatedCandidates,

            successfulCandidates:
              optimization
                .summary
                .successfulCandidates,

            bestScore:
              best
                ? best.score
                : null,
          },

          allocatedCapital:
            0,

          reason:
            "Existing CapitalOptimizer did not find a profitable executable capital size after portfolio adjustment.",
        });
      }

      const allocatedCapital =
        Math.min(
          best.capital,
          hardMaximumCapital,
          qualityBudget,
        );

      if (
        allocatedCapital <
        this.config.minimumCapital
      ) {
        this.optimizerRejected +=
          1;

        return this.store({
          id:
            randomUUID(),

          candidateKey:
            qualification.key,

          market:
            qualification.market,

          buyExchange:
            qualification.buyExchange,

          sellExchange:
            qualification.sellExchange,

          status:
            "OPTIMIZER_REJECTED",

          evaluatedAt:
            now,

          qualityFactors,

          portfolioAdjustment,

          limits,

          qualityBudget,

          optimization: {
            minimumCapital:
              this.config.minimumCapital,

            maximumCapital:
              qualityBudget,

            capitalStep:
              this.config.capitalStep,

            evaluatedCandidates:
              optimization
                .summary
                .evaluatedCandidates,

            successfulCandidates:
              optimization
                .summary
                .successfulCandidates,

            bestScore:
              best.score,
          },

          allocatedCapital:
            0,

          reason:
            "Optimized capital fell below the minimum PAPER allocation.",
        });
      }

      this.allocated +=
        1;

      this.totalAllocatedCapital +=
        allocatedCapital;

      return this.store({
        id:
          randomUUID(),

        candidateKey:
          qualification.key,

        market:
          qualification.market,

        buyExchange:
          qualification.buyExchange,

        sellExchange:
          qualification.sellExchange,

        status:
          "ALLOCATED",

        evaluatedAt:
          now,

        qualityFactors,

        portfolioAdjustment,

        limits,

        qualityBudget,

        optimization: {
          minimumCapital:
            this.config.minimumCapital,

          maximumCapital:
            qualityBudget,

          capitalStep:
            this.config.capitalStep,

          evaluatedCandidates:
            optimization
              .summary
              .evaluatedCandidates,

          successfulCandidates:
            optimization
              .summary
              .successfulCandidates,

          bestScore:
            best.score,
        },

        allocatedCapital:
          this.round(
            allocatedCapital,
            2,
          ),

        reason:
          "Adaptive PAPER capital allocated after candidate-quality sizing, route portfolio adjustment, hard exposure limits and execution simulation.",
      });
    } catch (
      error:
        unknown
    ) {
      this.optimizerRejected +=
        1;

      return this.store({
        id:
          randomUUID(),

        candidateKey:
          qualification.key,

        market:
          qualification.market,

        buyExchange:
          qualification.buyExchange,

        sellExchange:
          qualification.sellExchange,

        status:
          "OPTIMIZER_REJECTED",

        evaluatedAt:
          now,

        qualityFactors,

        portfolioAdjustment,

        limits,

        qualityBudget,

        optimization:
          this.emptyOptimization(
            qualityBudget,
          ),

        allocatedCapital:
          0,

        reason:
          error instanceof Error
            ? `Capital optimization failed: ${error.message}`
            : "Capital optimization failed for an unknown reason.",
      });
    }
  }

  getDiagnostics():
    AdaptivePaperCapitalAllocatorDiagnostics {
    return {
      generatedAt:
        Date.now(),

      mode:
        "PAPER",

      liveExecutionAllowed:
        false,

      adaptiveAllocationEnabled:
        true,

      portfolioOptimizationEnabled:
        true,

      config:
        structuredClone(
          this.config,
        ),

      totalRequests:
        this.totalRequests,

      allocated:
        this.allocated,

      rejectedLimits:
        this.rejectedLimits,

      rejectedQuality:
        this.rejectedQuality,

      rejectedPortfolio:
        this.rejectedPortfolio,

      optimizerRejected:
        this.optimizerRejected,

      totalAllocatedCapital:
        this.round(
          this.totalAllocatedCapital,
          2,
        ),

      averageAllocatedCapital:
        this.allocated >
        0
          ? this.round(
              this.totalAllocatedCapital /
                this.allocated,
              2,
            )
          : 0,

      lastAllocationAt:
        this.lastAllocationAt,

      lastAllocation:
        this.lastAllocation
          ? structuredClone(
              this.lastAllocation,
            )
          : null,

      recentAllocations:
        this.recentAllocations.map(
          (
            allocation,
          ) =>
            structuredClone(
              allocation,
            ),
        ),
    };
  }

  private calculateQualityFactors(
    qualification:
      CandidateQualificationRecord,

    now:
      number,
  ): AdaptivePaperCapitalQualityFactors {
    const candidate =
      qualification.candidate;

    const qualificationFactor =
      this.clamp100(
        qualification.score,
      );

    const profitFactor =
      this.clamp100(
        (
          candidate
            .latest
            .netProfitPercent /
          this.config
            .fullSizeProfitPercent
        ) *
          100,
      );

    const liquidityFactor =
      this.clamp100(
        candidate
          .latest
          .liquidityScore,
      );

    const freshnessFactor =
      this.clamp100(
        candidate
          .latest
          .freshnessScore,
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

    const persistenceFactor =
      this.clamp100(
        (
          persistenceMs /
          this.config
            .persistenceTargetMs
        ) *
          100,
      );

    const combined =
      qualificationFactor *
        0.30 +
      profitFactor *
        0.25 +
      liquidityFactor *
        0.20 +
      freshnessFactor *
        0.15 +
      persistenceFactor *
        0.10;

    return {
      qualification:
        this.round(
          qualificationFactor,
          2,
        ),

      profit:
        this.round(
          profitFactor,
          2,
        ),

      liquidity:
        this.round(
          liquidityFactor,
          2,
        ),

      freshness:
        this.round(
          freshnessFactor,
          2,
        ),

      persistence:
        this.round(
          persistenceFactor,
          2,
        ),

      combined:
        this.round(
          combined,
          2,
        ),
    };
  }

  private emptyOptimization(
    maximumCapital:
      number,
  ): AdaptivePaperCapitalAllocationRecord["optimization"] {
    return {
      minimumCapital:
        this.config.minimumCapital,

      maximumCapital,

      capitalStep:
        this.config.capitalStep,

      evaluatedCandidates:
        0,

      successfulCandidates:
        0,

      bestScore:
        null,
    };
  }

  private normalizeMaximumCapital(
    requested:
      number,

    hardMaximum:
      number,
  ): number {
    const bounded =
      Math.min(
        requested,
        hardMaximum,
      );

    if (
      bounded <
      this.config.minimumCapital
    ) {
      return 0;
    }

    const steps =
      Math.floor(
        (
          bounded -
          this.config.minimumCapital
        ) /
          this.config.capitalStep,
      );

    return this.round(
      Math.min(
        hardMaximum,

        this.config.minimumCapital +
          steps *
            this.config.capitalStep,
      ),

      2,
    );
  }

  private createEmptyLimits(
    accountAvailableCapital:
      number,

    accountMaximumCapitalPerTrade:
      number,

    constraints:
      AdaptivePaperCapitalAllocationConstraints,
  ): AdaptivePaperCapitalAllocationRecord["limits"] {
    return {
      accountAvailableCapital:
        this.round(
          accountAvailableCapital,
          2,
        ),

      accountMaximumCapitalPerTrade:
        this.round(
          accountMaximumCapitalPerTrade,
          2,
        ),

      configuredCapitalBudget:
        this.config
          .totalCapitalBudget,

      configuredCapitalInUse:
        0,

      configuredCapitalHeadroom:
        this.config
          .totalCapitalBudget,

      automationMaximumCapitalPerTrade:
        this.config
          .maximumCapitalPerTrade,

      remainingBatchCapital:
        this.round(
          constraints
            .remainingBatchCapital,
          2,
        ),

      buyExchangeHeadroom:
        0,

      sellExchangeHeadroom:
        0,

      hardMaximumCapital:
        0,
    };
  }

  private store(
    record:
      AdaptivePaperCapitalAllocationRecord,
  ): AdaptivePaperCapitalAllocationRecord {
    this.lastAllocationAt =
      record.evaluatedAt;

    this.lastAllocation =
      structuredClone(
        record,
      );

    this.recentAllocations.unshift(
      structuredClone(
        record,
      ),
    );

    if (
      this.recentAllocations.length >
      this.config.maximumHistory
    ) {
      this.recentAllocations.length =
        this.config.maximumHistory;
    }

    return structuredClone(
      record,
    );
  }

  private clamp100(
    value:
      number,
  ): number {
    if (
      !Number.isFinite(
        value,
      )
    ) {
      return 0;
    }

    return Math.max(
      0,

      Math.min(
        100,
        value,
      ),
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

  private validateConfig():
    void {
    if (
      !Number.isFinite(
        this.config.totalCapitalBudget,
      ) ||
      this.config.totalCapitalBudget <=
        0
    ) {
      throw new Error(
        "Adaptive allocator totalCapitalBudget must be positive.",
      );
    }

    if (
      !Number.isFinite(
        this.config.minimumCapital,
      ) ||
      this.config.minimumCapital <=
        0
    ) {
      throw new Error(
        "Adaptive allocator minimumCapital must be positive.",
      );
    }

    if (
      !Number.isFinite(
        this.config.maximumCapitalPerTrade,
      ) ||
      this.config.maximumCapitalPerTrade <
        this.config.minimumCapital
    ) {
      throw new Error(
        "Adaptive allocator maximumCapitalPerTrade must be at least minimumCapital.",
      );
    }

    if (
      this.config.maximumCapitalPerTrade >
        this.config.totalCapitalBudget
    ) {
      throw new Error(
        "Adaptive allocator maximumCapitalPerTrade cannot exceed totalCapitalBudget.",
      );
    }

    if (
      !Number.isFinite(
        this.config.capitalStep,
      ) ||
      this.config.capitalStep <=
        0
    ) {
      throw new Error(
        "Adaptive allocator capitalStep must be positive.",
      );
    }

    if (
      !Number.isFinite(
        this.config.minimumQualificationScore,
      ) ||
      this.config.minimumQualificationScore <
        0 ||
      this.config.minimumQualificationScore >
        100
    ) {
      throw new Error(
        "Adaptive allocator minimumQualificationScore must be between 0 and 100.",
      );
    }

    if (
      !Number.isFinite(
        this.config.fullSizeProfitPercent,
      ) ||
      this.config.fullSizeProfitPercent <=
        0
    ) {
      throw new Error(
        "Adaptive allocator fullSizeProfitPercent must be positive.",
      );
    }

    if (
      !Number.isFinite(
        this.config.persistenceTargetMs,
      ) ||
      this.config.persistenceTargetMs <=
        0
    ) {
      throw new Error(
        "Adaptive allocator persistenceTargetMs must be positive.",
      );
    }

    if (
      !Number.isFinite(
        this.config.minimumBudgetFactor,
      ) ||
      this.config.minimumBudgetFactor <
        0 ||
      this.config.minimumBudgetFactor >
        1
    ) {
      throw new Error(
        "Adaptive allocator minimumBudgetFactor must be between 0 and 1.",
      );
    }

    if (
      !Number.isInteger(
        this.config.maximumHistory,
      ) ||
      this.config.maximumHistory <
        1
    ) {
      throw new Error(
        "Adaptive allocator maximumHistory must be a positive integer.",
      );
    }
  }
}

export const adaptivePaperCapitalAllocatorService =
  new AdaptivePaperCapitalAllocatorService(
    {},
    () => {
      const configuration =
        paperCapitalConfigurationService
          .getConfiguration();

      return {
        totalCapitalBudget:
          configuration.capitalBudgetInr,

        minimumCapital:
          configuration.minimumCapitalPerTrade,

        maximumCapitalPerTrade:
          configuration.maximumCapitalPerTrade,

        capitalStep:
          configuration.capitalStep,
      };
    },
  );
