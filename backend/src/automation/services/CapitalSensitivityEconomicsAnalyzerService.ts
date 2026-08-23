import {
  opportunityRejectionStore,
} from "../../arbitrage/services/OpportunityRejectionStore";

import {
  opportunityService,
} from "../../arbitrage/services/OpportunityService";

import type {
  ExecutionResult,
} from "../../execution/models/ExecutionResult";

import type {
  OptimizationCandidate,
} from "../../optimizer/models/OptimizationCandidate";

import {
  capitalOptimizer,
} from "../../optimizer/services/CapitalOptimizer";

import {
  exchangeCapabilityService,
} from "../../execution/capabilities/services/ExchangeCapabilityService";

import {
  centralPaperCapitalValuationService,
} from "../../strategies/services/CentralPaperCapitalValuationService";

import type {
  CapitalSensitivityEconomicsReport,
  CapitalSensitivityPoint,
  CapitalSensitivityRouteReport,
  CapitalSensitivityRouteSource,
} from "../models/CapitalSensitivityEconomics";

const MINIMUM_CAPITAL =
  100;

const MAXIMUM_CAPITAL =
  5_000;

const CAPITAL_STEP =
  50;

const DISPLAYED_CAPITAL_POINTS = [
  100,
  250,
  500,
  1_000,
  2_500,
  5_000,
] as const;

const MAXIMUM_ROUTES_ANALYZED =
  6;

const REJECTION_LOOKBACK =
  500;

interface RouteSeed {
  market: string;

  buyExchange: string;

  sellExchange: string;

  source: CapitalSensitivityRouteSource;

  rawSpreadPercent: number | null;

  netProfitPercent: number | null;

  priority: number;
}

export class CapitalSensitivityEconomicsAnalyzerService {
  getReport(): CapitalSensitivityEconomicsReport {
    const generatedAt =
      Date.now();

    const seeds =
      this.selectRoutes();

    const routes =
      seeds.map(
        (
          seed,
        ) =>
          this.analyzeRoute(
            seed,
            generatedAt,
          ),
      );

    const currentAcceptedRoutesIncluded =
      routes.filter(
        (
          route,
        ) =>
          route.source ===
          "CURRENT_ACCEPTED",
      ).length;

    const recentPositiveSpreadRoutesIncluded =
      routes.length -
      currentAcceptedRoutesIncluded;

    const routesWithSuccessfulSimulation =
      routes.filter(
        (
          route,
        ) =>
          route.optimizer
            .successfulCandidates >
          0,
      ).length;

    const routesWithPositiveNetProfit =
      routes.filter(
        (
          route,
        ) =>
          route.maximumPositiveNetProfitCapital !==
          null,
      ).length;

    const routesWithExecuteRecommendation =
      routes.filter(
        (
          route,
        ) =>
          route.maximumExecuteRecommendedCapital !==
          null,
      ).length;

    const observations = [
      `CapitalOptimizer evaluates each selected route from ₹${MINIMUM_CAPITAL} to ₹${MAXIMUM_CAPITAL} in ₹${CAPITAL_STEP} INR increments, converting every candidate to the route quote asset before full-depth simulation.`,

      "Displayed sensitivity points are selected from the optimizer's existing candidate results; the analyzer does not run a second simulation path.",

      "VWAP, slippage, fill percentage, modeled fees, net profit and execution recommendation therefore come from the same execution pipeline already used by capital optimization.",

      "A route may have a positive raw spread and still have no profitable capital once fees, depth and slippage are applied.",

      "No capital allocation, trading threshold, paper setting, account balance, or LIVE setting is mutated by this endpoint.",
    ];

    return {
      generatedAt:
        generatedAt,

      version:
        "17.4",

      build:
        "3",

      mode:
        "DIAGNOSTIC_ONLY",

      tradingPolicyMutationAllowed:
        false,

      liveExecutionAllowed:
        false,

      configuration: {
        accountCapitalCurrency:
          "INR",

        minimumCapital:
          MINIMUM_CAPITAL,

        maximumCapital:
          MAXIMUM_CAPITAL,

        capitalStep:
          CAPITAL_STEP,

        displayedCapitalPoints:
          [
            ...DISPLAYED_CAPITAL_POINTS,
          ],

        maximumRoutesAnalyzed:
          MAXIMUM_ROUTES_ANALYZED,
      },

      summary: {
        selectedRoutes:
          routes.length,

        routesWithSuccessfulSimulation,

        routesWithPositiveNetProfit,

        routesWithExecuteRecommendation,

        currentAcceptedRoutesIncluded,

        recentPositiveSpreadRoutesIncluded,
      },

      routes,

      observations,
    };
  }

  private selectRoutes(): RouteSeed[] {
    const selected =
      new Map<
        string,
        RouteSeed
      >();

    /*
     * ---------------------------------------------
     * PRIORITY 1
     * CURRENT ACCEPTED OPPORTUNITIES
     * ---------------------------------------------
     *
     * These are the most valuable routes because
     * they represent the current engine snapshot.
     */
    const opportunitySnapshot =
      opportunityService
        .getLastOpportunitySnapshot();

    for (
      const opportunity
      of opportunitySnapshot
        ?.opportunities ??
        []
    ) {
      const seed:
        RouteSeed = {
        market:
          opportunity.pair.market
            .trim()
            .toUpperCase(),

        buyExchange:
          opportunity.pair.buy.exchange
            .trim()
            .toLowerCase(),

        sellExchange:
          opportunity.pair.sell.exchange
            .trim()
            .toLowerCase(),

        source:
          "CURRENT_ACCEPTED",

        rawSpreadPercent:
          opportunity.rawSpreadPercent,

        netProfitPercent:
          opportunity.netProfitPercent,

        priority:
          1_000_000 +
          opportunity.netProfitPercent,
      };

      selected.set(
        this.routeKey(
          seed,
        ),
        seed,
      );
    }

    /*
     * ---------------------------------------------
     * PRIORITY 2
     * RECENT POSITIVE-SPREAD REJECTIONS
     * ---------------------------------------------
     *
     * These routes are useful to determine whether
     * smaller capital can overcome depth/slippage
     * problems.
     *
     * Historical rejection economics are only used
     * for route selection.
     *
     * All actual sensitivity economics are recalculated
     * from CURRENT order books.
     */
    const rejections =
      opportunityRejectionStore
        .getRecent(
          REJECTION_LOOKBACK,
        )
        .filter(
          (
            rejection,
          ) =>
            rejection.rawSpreadPercent !==
              null &&
            rejection.rawSpreadPercent >
              0,
        )
        .sort(
          (
            first,
            second,
          ) =>
            (
              second.netProfitPercent ??
              second.rawSpreadPercent ??
              Number.NEGATIVE_INFINITY
            ) -
            (
              first.netProfitPercent ??
              first.rawSpreadPercent ??
              Number.NEGATIVE_INFINITY
            ),
        );

    for (
      const rejection
      of rejections
    ) {
      if (
        selected.size >=
        MAXIMUM_ROUTES_ANALYZED
      ) {
        break;
      }

      const seed:
        RouteSeed = {
        market:
          rejection.market
            .trim()
            .toUpperCase(),

        buyExchange:
          rejection.buyExchange
            .trim()
            .toLowerCase(),

        sellExchange:
          rejection.sellExchange
            .trim()
            .toLowerCase(),

        source:
          "RECENT_POSITIVE_SPREAD_REJECTION",

        rawSpreadPercent:
          rejection.rawSpreadPercent,

        netProfitPercent:
          rejection.netProfitPercent,

        priority:
          rejection.netProfitPercent ??
          rejection.rawSpreadPercent ??
          0,
      };

      const key =
        this.routeKey(
          seed,
        );

      if (
        !selected.has(
          key,
        )
      ) {
        selected.set(
          key,
          seed,
        );
      }
    }

    return Array.from(
      selected.values(),
    )
      .sort(
        (
          first,
          second,
        ) =>
          second.priority -
          first.priority,
      )
      .slice(
        0,
        MAXIMUM_ROUTES_ANALYZED,
      );
  }

  private analyzeRoute(
    seed:
      RouteSeed,

    now:
      number,
  ): CapitalSensitivityRouteReport {
    const observations:
      string[] =
      [];

    try {
      const quoteAsset =
        this.resolveQuoteAsset(
          seed,
        );

      if (!quoteAsset) {
        throw new Error(
          "A matching BUY/SELL quote asset is unavailable for INR capital conversion.",
        );
      }

      const conversion =
        centralPaperCapitalValuationService
          .convertInrToAsset(
            quoteAsset,
            500,
            `capital-sensitivity:${this.routeKey(seed)}:${now}`,
            now,
          );

      const quoteCapitalPerInr =
        conversion &&
        Number.isFinite(
          conversion.targetQuantity,
        ) &&
        conversion.targetQuantity >
          0
          ? conversion.targetQuantity /
            500
          : null;

      if (
        quoteCapitalPerInr ===
          null ||
        !Number.isFinite(
          quoteCapitalPerInr,
        ) ||
        quoteCapitalPerInr <=
          0
      ) {
        throw new Error(
          `Fresh INR/${quoteAsset} capital-conversion evidence is unavailable.`,
        );
      }

      /*
       * ---------------------------------------------
       * EXISTING CAPITAL OPTIMIZER
       * ---------------------------------------------
       *
       * ₹100 → ₹5,000
       * ₹50 step
       *
       * 99 full-depth simulations per route.
       *
       * We deliberately reuse the existing optimizer.
       */
      const optimization =
        capitalOptimizer
          .optimize({
            market:
              seed.market,

            buyExchange:
              seed.buyExchange,

            sellExchange:
              seed.sellExchange,

            minimumCapital:
              MINIMUM_CAPITAL,

            maximumCapital:
              MAXIMUM_CAPITAL,

            capitalStep:
              CAPITAL_STEP,

            executionCapitalMultiplier:
              quoteCapitalPerInr,

            executionCapitalCurrency:
              quoteAsset,
          });

      const positiveNetProfitCandidates =
        optimization.candidates
          .filter(
            (
              candidate,
            ) =>
              this.isPositiveProfit(
                candidate.execution,
              ),
          );

      const fullyExecutableProfitableCandidates =
        positiveNetProfitCandidates
          .filter(
            (
              candidate,
            ) =>
              candidate.execution
                .simulation
                ?.depth
                .fullyExecutable ===
              true,
          );

      const executeRecommendedCandidates =
        fullyExecutableProfitableCandidates
          .filter(
            (
              candidate,
            ) =>
              candidate.execution
                .simulation
                ?.decision
                .recommendation ===
              "EXECUTE",
          );

      const best =
        optimization.best;

      if (
        positiveNetProfitCandidates.length ===
        0
      ) {
        observations.push(
          "No tested capital from ₹100 to ₹5,000 currently produces positive modeled net profit on this route.",
        );
      }

      if (
        positiveNetProfitCandidates.length >
          0 &&
        fullyExecutableProfitableCandidates.length ===
          0
      ) {
        observations.push(
          "Positive modeled profit exists at one or more capital levels, but none is fully executable under current full-depth liquidity.",
        );
      }

      if (
        executeRecommendedCandidates.length >
        0
      ) {
        observations.push(
          `Execution pipeline currently recommends EXECUTE through at least ₹${this.maximumCapital(
            executeRecommendedCandidates,
          )}.`,
        );
      }

      if (
        best
      ) {
        observations.push(
          `CapitalOptimizer best candidate is ₹${best.capital} with score ${best.score}.`,
        );
      } else {
        observations.push(
          "CapitalOptimizer did not identify a positive-scoring best candidate.",
        );
      }

      return {
        market:
          seed.market,

        buyExchange:
          seed.buyExchange,

        sellExchange:
          seed.sellExchange,

        quoteAsset,

        quoteCapitalPerInr:
          this.round(
            quoteCapitalPerInr,
            12,
          ),

        source:
          seed.source,

        sourceRawSpreadPercent:
          seed.rawSpreadPercent,

        sourceNetProfitPercent:
          seed.netProfitPercent,

        optimizer:
          structuredClone(
            optimization.summary,
          ),

        bestCapital:
          best?.capital ??
          null,

        bestOptimizerScore:
          best?.score ??
          null,

        bestNetProfit:
          this.netProfit(
            best?.execution ??
            null,
          ),

        bestNetProfitPercent:
          this.netProfitPercent(
            best?.execution ??
            null,
          ),

        maximumPositiveNetProfitCapital:
          this.maximumCapitalOrNull(
            positiveNetProfitCandidates,
          ),

        maximumFullyExecutableProfitableCapital:
          this.maximumCapitalOrNull(
            fullyExecutableProfitableCandidates,
          ),

        maximumExecuteRecommendedCapital:
          this.maximumCapitalOrNull(
            executeRecommendedCandidates,
          ),

        sensitivity:
          this.buildSensitivity(
            optimization.candidates,
          ),

        observations,
      };
    } catch (
      error:
        unknown
    ) {
      return {
        market:
          seed.market,

        buyExchange:
          seed.buyExchange,

        sellExchange:
          seed.sellExchange,

        quoteAsset:
          this.resolveQuoteAsset(
            seed,
          ),

        quoteCapitalPerInr:
          null,

        source:
          seed.source,

        sourceRawSpreadPercent:
          seed.rawSpreadPercent,

        sourceNetProfitPercent:
          seed.netProfitPercent,

        optimizer: {
          evaluatedCandidates:
            0,

          successfulCandidates:
            0,

          failedCandidates:
            0,

          executionSuccessRate:
            0,

          optimizationTimeMs:
            0,
        },

        bestCapital:
          null,

        bestOptimizerScore:
          null,

        bestNetProfit:
          null,

        bestNetProfitPercent:
          null,

        maximumPositiveNetProfitCapital:
          null,

        maximumFullyExecutableProfitableCapital:
          null,

        maximumExecuteRecommendedCapital:
          null,

        sensitivity:
          [],

        observations: [
          error instanceof Error
            ? `Capital optimization failed: ${error.message}`
            : "Capital optimization failed for an unknown reason.",
        ],
      };
    }
  }

  private buildSensitivity(
    candidates:
      OptimizationCandidate[],
  ): CapitalSensitivityPoint[] {
    const byCapital =
      new Map<
        number,
        OptimizationCandidate
      >();

    for (
      const candidate
      of candidates
    ) {
      byCapital.set(
        candidate.capital,
        candidate,
      );
    }

    /*
     * CapitalOptimizer already evaluated all of these.
     *
     * No duplicate simulation call.
     */
    return DISPLAYED_CAPITAL_POINTS
      .map(
        (
          capital,
        ) =>
          byCapital.get(
            capital,
          ),
      )
      .filter(
        (
          candidate,
        ): candidate is OptimizationCandidate =>
          candidate !==
          undefined,
      )
      .map(
        (
          candidate,
        ) =>
          this.toSensitivityPoint(
            candidate,
          ),
      );
  }

  private toSensitivityPoint(
    candidate:
      OptimizationCandidate,
  ): CapitalSensitivityPoint {
    const execution =
      candidate.execution;

    const simulation =
      execution.simulation;

    if (
      !execution.success ||
      !simulation
    ) {
      return {
        capital:
          candidate.capital,

        executionCapital:
          candidate.executionCapital,

        executionCapitalCurrency:
          candidate.executionCapitalCurrency,

        simulationSuccess:
          false,

        fullyExecutable:
          false,

        fillPercent:
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

        slippageCost:
          null,

        grossSpreadProfit:
          null,

        totalFees:
          null,

        netProfit:
          null,

        netProfitPercent:
          null,

        confidenceScore:
          null,

        recommendation:
          null,

        optimizerScore:
          candidate.score,

        failureReason:
          execution.failureReason,
      };
    }

    const breakdown =
      simulation
        .profit
        .breakdown;

    return {
      capital:
        candidate.capital,

      executionCapital:
        candidate.executionCapital,

      executionCapitalCurrency:
        candidate.executionCapitalCurrency,

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

      slippageCost:
        breakdown.slippageCost,

      grossSpreadProfit:
        breakdown
          .grossSpreadProfit,

      /*
       * All modeled non-slippage costs.
       *
       * ProfitBreakdown separately exposes
       * slippageCost.
       */
      totalFees:
        breakdown.buyFees +
        breakdown.sellFees +
        breakdown.networkFees +
        breakdown.transferCost +
        breakdown.taxes,

      netProfit:
        breakdown.netProfit,

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

      optimizerScore:
        candidate.score,

      failureReason:
        null,
    };
  }

  private isPositiveProfit(
    execution:
      ExecutionResult,
  ): boolean {
    const netProfit =
      execution.simulation
        ?.profit
        .breakdown
        .netProfit;

    return (
      execution.success &&
      netProfit !==
        undefined &&
      Number.isFinite(
        netProfit,
      ) &&
      netProfit >
        0
    );
  }

  private netProfit(
    execution:
      ExecutionResult | null,
  ): number | null {
    return execution
      ?.simulation
      ?.profit
      .breakdown
      .netProfit ??
      null;
  }

  private netProfitPercent(
    execution:
      ExecutionResult | null,
  ): number | null {
    return execution
      ?.simulation
      ?.profit
      .profitPercent ??
      null;
  }

  private maximumCapital(
    candidates:
      OptimizationCandidate[],
  ): number {
    return Math.max(
      ...candidates.map(
        (
          candidate,
        ) =>
          candidate.capital,
      ),
    );
  }

  private maximumCapitalOrNull(
    candidates:
      OptimizationCandidate[],
  ): number | null {
    return candidates.length >
      0
      ? this.maximumCapital(
          candidates,
        )
      : null;
  }

  private routeKey(
    route: {
      market: string;

      buyExchange: string;

      sellExchange: string;
    },
  ): string {
    return (
      `${route.market}|` +
      `${route.buyExchange}|` +
      `${route.sellExchange}`
    );
  }

  private resolveQuoteAsset(
    seed:
      RouteSeed,
  ): string | null {
    const buy =
      exchangeCapabilityService
        .getCachedCapability(
          seed.buyExchange,
          seed.market,
          "spot",
        );

    const sell =
      exchangeCapabilityService
        .getCachedCapability(
          seed.sellExchange,
          seed.market,
          "spot",
        );

    const buyQuote =
      buy?.quoteAsset
        .trim()
        .toUpperCase() ??
      "";

    const sellQuote =
      sell?.quoteAsset
        .trim()
        .toUpperCase() ??
      "";

    if (
      buyQuote &&
      sellQuote &&
      buyQuote ===
        sellQuote
    ) {
      return buyQuote;
    }

    return null;
  }

  private round(
    value:
      number,

    digits:
      number,
  ): number {
    const factor =
      10 **
      digits;

    return Math.round(
      value *
      factor,
    ) /
    factor;
  }
}

export const capitalSensitivityEconomicsAnalyzerService =
  new CapitalSensitivityEconomicsAnalyzerService();
