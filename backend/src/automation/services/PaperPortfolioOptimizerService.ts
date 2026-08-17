import type {
  PaperPortfolioOptimizerConfig,
  PaperPortfolioOptimizerDiagnostics,
  PaperPortfolioRoutePerformance,
  PaperPortfolioRouteStatus,
} from "../models/PaperPortfolioOptimizer";

import type {
  ShadowExchangePairPerformance,
} from "../models/ShadowPerformanceAnalytics";

import {
  paperAutomationAccountingService,
  type PaperAutomationRouteEntry,
} from "./PaperAutomationAccountingService";

import {
  shadowPerformanceAnalyticsService,
} from "./ShadowPerformanceAnalyticsService";

const DEFAULT_CONFIG:
  PaperPortfolioOptimizerConfig = {
  /*
   * Route-level PAPER capital should not react
   * aggressively to tiny datasets.
   */
  minimumShadowCompletedOutcomes:
    10,

  minimumPaperTrades:
    3,

  /*
   * Hard route multiplier range.
   *
   * Even excellent historical performance can
   * never exceed 1.25x the upstream adaptive
   * allocation.
   */
  minimumMultiplier:
    0.5,

  maximumMultiplier:
    1.25,

  blockScoreBelow:
    30,

  throttleScoreBelow:
    55,

  boostScoreAt:
    80,

  targetPaperWinRatePercent:
    70,

  targetPaperRoiPercent:
    1,

  maximumAcceptableLossPercent:
    1,
};

export class PaperPortfolioOptimizerService {
  private readonly config:
    PaperPortfolioOptimizerConfig;

  constructor(
    config:
      Partial<PaperPortfolioOptimizerConfig> = {},
  ) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };

    this.validateConfig();
  }

  evaluateRoute(
    buyExchange:
      string,

    sellExchange:
      string,
  ): PaperPortfolioRoutePerformance {
    const normalizedBuy =
      buyExchange
        .trim()
        .toLowerCase();

    const normalizedSell =
      sellExchange
        .trim()
        .toLowerCase();

    const key =
      this.createKey(
        normalizedBuy,
        normalizedSell,
      );

    const shadow =
      shadowPerformanceAnalyticsService
        .getAnalytics()
        .exchangePairs
        .find(
          (
            route,
          ) =>
            this.createKey(
              route.buyExchange,
              route.sellExchange,
            ) ===
            key,
        ) ??
      null;

    const paperEntries =
      paperAutomationAccountingService
        .getRouteEntries(
          normalizedBuy,
          normalizedSell,
        );

    return this.calculateRoute(
      normalizedBuy,
      normalizedSell,
      shadow,
      paperEntries,
    );
  }

  getDiagnostics():
    PaperPortfolioOptimizerDiagnostics {
    const shadow =
      shadowPerformanceAnalyticsService
        .getAnalytics();

    const accounting =
      paperAutomationAccountingService
        .getDiagnostics();

    const keys =
      new Map<
        string,
        {
          buyExchange: string;

          sellExchange: string;
        }
      >();

    for (
      const route
      of shadow.exchangePairs
    ) {
      const key =
        this.createKey(
          route.buyExchange,
          route.sellExchange,
        );

      keys.set(
        key,
        {
          buyExchange:
            route.buyExchange,

          sellExchange:
            route.sellExchange,
        },
      );
    }

    for (
      const entry
      of accounting.entries
    ) {
      const key =
        this.createKey(
          entry.buyExchange,
          entry.sellExchange,
        );

      keys.set(
        key,
        {
          buyExchange:
            entry.buyExchange,

          sellExchange:
            entry.sellExchange,
        },
      );
    }

    const routes =
      Array.from(
        keys.values(),
      )
        .map(
          (
            route,
          ) =>
            this.evaluateRoute(
              route.buyExchange,
              route.sellExchange,
            ),
        )
        .sort(
          (
            first,
            second,
          ) =>
            second.score -
            first.score,
        );

    return {
      generatedAt:
        Date.now(),

      mode:
        "PAPER",

      portfolioOptimizationEnabled:
        true,

      capitalMutationAllowed:
        false,

      liveExecutionAllowed:
        false,

      config:
        structuredClone(
          this.config,
        ),

      totalRoutes:
        routes.length,

      insufficientData:
        this.countStatus(
          routes,
          "INSUFFICIENT_DATA",
        ),

      blocked:
        this.countStatus(
          routes,
          "BLOCKED",
        ),

      throttled:
        this.countStatus(
          routes,
          "THROTTLED",
        ),

      neutral:
        this.countStatus(
          routes,
          "NEUTRAL",
        ),

      boosted:
        this.countStatus(
          routes,
          "BOOSTED",
        ),

      bestRoute:
        routes.length >
        0
          ? structuredClone(
              routes[0],
            )
          : null,

      worstRoute:
        routes.length >
        0
          ? structuredClone(
              routes[
                routes.length -
                1
              ],
            )
          : null,

      routes:
        routes.map(
          (
            route,
          ) =>
            structuredClone(
              route,
            ),
        ),
    };
  }

  private calculateRoute(
    buyExchange:
      string,

    sellExchange:
      string,

    shadow:
      ShadowExchangePairPerformance | null,

    paperEntries:
      PaperAutomationRouteEntry[],
  ): PaperPortfolioRoutePerformance {
    const paper =
      this.calculatePaperPerformance(
        paperEntries,
      );

    const shadowCompleted =
      shadow?.completed ??
      0;

    const enoughShadow =
      shadowCompleted >=
      this.config
        .minimumShadowCompletedOutcomes;

    const enoughPaper =
      paper.trades >=
      this.config
        .minimumPaperTrades;

    /*
     * Cold-start rule:
     *
     * Until either shadow or PAPER evidence is
     * meaningful, route multiplier is exactly
     * 1.00.
     *
     * We do not reward or punish statistically
     * insignificant history.
     */
    if (
      !enoughShadow &&
      !enoughPaper
    ) {
      return {
        key:
          this.createKey(
            buyExchange,
            sellExchange,
          ),

        buyExchange,

        sellExchange,

        status:
          "INSUFFICIENT_DATA",

        capitalMultiplier:
          1,

        score:
          50,

        shadow:
          this.createShadowSummary(
            shadow,
          ),

        paper,

        components: {
          shadowConfidence:
            this.shadowConfidence(
              shadowCompleted,
            ),

          shadowSuccess:
            shadow
              ?.successRatePercent ??
            0,

          executability:
            shadow
              ?.executableSampleRatePercent ??
            0,

          profitRetention:
            shadow
              ?.averageProfitRetentionPercent ??
            0,

          paperWinRate:
            paper.winRatePercent,

          paperRoi:
            this.targetScore(
              paper.roiPercent,
              this.config
                .targetPaperRoiPercent,
            ),

          drawdownSafety:
            this.calculateDrawdownSafety(
              paper,
            ),
        },

        reasons: [
          `Route has only ${shadowCompleted} completed shadow outcome(s) and ${paper.trades} automated PAPER trade(s).`,
          `Need at least ${this.config.minimumShadowCompletedOutcomes} shadow outcomes or ${this.config.minimumPaperTrades} PAPER trades before route-level capital adjustment.`,
          "Cold-start capital multiplier remains neutral at 1.00x.",
        ],
      };
    }

    const shadowConfidence =
      this.shadowConfidence(
        shadowCompleted,
      );

    const shadowSuccess =
      shadow
        ? this.clamp100(
            shadow
              .successRatePercent,
          )
        : 50;

    const executability =
      shadow
        ? this.clamp100(
            shadow
              .executableSampleRatePercent,
          )
        : 50;

    const profitRetention =
      shadow
        ? this.clamp100(
            shadow
              .averageProfitRetentionPercent,
          )
        : 50;

    const paperWinRate =
      enoughPaper
        ? this.targetScore(
            paper.winRatePercent,
            this.config
              .targetPaperWinRatePercent,
          )
        : 50;

    const paperRoi =
      enoughPaper
        ? this.targetScore(
            paper.roiPercent,
            this.config
              .targetPaperRoiPercent,
          )
        : 50;

    const drawdownSafety =
      enoughPaper
        ? this.calculateDrawdownSafety(
            paper,
          )
        : 50;

    /*
     * Route score:
     *
     * Shadow confidence     10%
     * Shadow success        20%
     * Executability         15%
     * Profit retention      15%
     * PAPER win rate        15%
     * PAPER ROI             15%
     * Loss / drawdown       10%
     */
    const score =
      this.round(
        shadowConfidence *
          0.10 +
        shadowSuccess *
          0.20 +
        executability *
          0.15 +
        profitRetention *
          0.15 +
        paperWinRate *
          0.15 +
        paperRoi *
          0.15 +
        drawdownSafety *
          0.10,

        2,
      );

    const status =
      this.resolveStatus(
        score,
        paper,
        enoughPaper,
      );

    const capitalMultiplier =
      this.resolveMultiplier(
        score,
        status,
      );

    const reasons =
      this.buildReasons(
        status,
        score,
        shadow,
        paper,
        enoughShadow,
        enoughPaper,
        capitalMultiplier,
      );

    return {
      key:
        this.createKey(
          buyExchange,
          sellExchange,
        ),

      buyExchange,

      sellExchange,

      status,

      capitalMultiplier,

      score,

      shadow:
        this.createShadowSummary(
          shadow,
        ),

      paper,

      components: {
        shadowConfidence:
          this.round(
            shadowConfidence,
            2,
          ),

        shadowSuccess:
          this.round(
            shadowSuccess,
            2,
          ),

        executability:
          this.round(
            executability,
            2,
          ),

        profitRetention:
          this.round(
            profitRetention,
            2,
          ),

        paperWinRate:
          this.round(
            paperWinRate,
            2,
          ),

        paperRoi:
          this.round(
            paperRoi,
            2,
          ),

        drawdownSafety:
          this.round(
            drawdownSafety,
            2,
          ),
      },

      reasons,
    };
  }

  private calculatePaperPerformance(
    entries:
      PaperAutomationRouteEntry[],
  ): PaperPortfolioRoutePerformance["paper"] {
    const completed =
      entries.filter(
        (
          entry,
        ) =>
          entry.status ===
            "MATCHED" &&
          entry.successful,
      );

    const winningTrades =
      completed.filter(
        (
          entry,
        ) =>
          entry.netProfit >
          0,
      ).length;

    const losingTrades =
      completed.filter(
        (
          entry,
        ) =>
          entry.netProfit <
          0,
      ).length;

    const capitalUsed =
      completed.reduce(
        (
          total,
          entry,
        ) =>
          total +
          entry.capitalUsed,
        0,
      );

    const netProfit =
      completed.reduce(
        (
          total,
          entry,
        ) =>
          total +
          entry.netProfit,
        0,
      );

    const profits =
      completed.map(
        (
          entry,
        ) =>
          entry.netProfit,
      );

    return {
      trades:
        completed.length,

      winningTrades,

      losingTrades,

      winRatePercent:
        this.percent(
          winningTrades,
          completed.length,
        ),

      capitalUsed:
        this.round(
          capitalUsed,
          12,
        ),

      netProfit:
        this.round(
          netProfit,
          12,
        ),

      roiPercent:
        capitalUsed >
        0
          ? this.round(
              (
                netProfit /
                capitalUsed
              ) *
                100,
              6,
            )
          : 0,

      averageProfitPerTrade:
        completed.length >
        0
          ? this.round(
              netProfit /
                completed.length,
              12,
            )
          : 0,

      largestWin:
        profits.length >
        0
          ? this.round(
              Math.max(
                0,
                ...profits,
              ),
              12,
            )
          : 0,

      largestLoss:
        profits.length >
        0
          ? this.round(
              Math.min(
                0,
                ...profits,
              ),
              12,
            )
          : 0,
    };
  }

  private createShadowSummary(
    shadow:
      ShadowExchangePairPerformance | null,
  ): PaperPortfolioRoutePerformance["shadow"] {
    return {
      total:
        shadow?.total ??
        0,

      completed:
        shadow?.completed ??
        0,

      success:
        shadow?.success ??
        0,

      failed:
        shadow?.failed ??
        0,

      dataUnavailable:
        shadow
          ?.dataUnavailable ??
        0,

      successRatePercent:
        shadow
          ?.successRatePercent ??
        0,

      executableSampleRatePercent:
        shadow
          ?.executableSampleRatePercent ??
        0,

      profitableSampleRatePercent:
        shadow
          ?.profitableSampleRatePercent ??
        0,

      averageProfitRetentionPercent:
        shadow
          ?.averageProfitRetentionPercent ??
        0,

      averageObservedNetProfit:
        shadow
          ?.averageObservedNetProfit ??
        0,
    };
  }

  private resolveStatus(
    score:
      number,

    paper:
      PaperPortfolioRoutePerformance["paper"],

    enoughPaper:
      boolean,
  ): PaperPortfolioRouteStatus {
    /*
     * Explicit negative-paper evidence can
     * block a route regardless of decent
     * historical shadow results.
     */
    if (
      enoughPaper &&
      paper.netProfit <
        0 &&
      paper.winRatePercent <
        35
    ) {
      return "BLOCKED";
    }

    if (
      score <
      this.config
        .blockScoreBelow
    ) {
      return "BLOCKED";
    }

    if (
      score <
      this.config
        .throttleScoreBelow
    ) {
      return "THROTTLED";
    }

    if (
      score >=
      this.config
        .boostScoreAt
    ) {
      return "BOOSTED";
    }

    return "NEUTRAL";
  }

  private resolveMultiplier(
    score:
      number,

    status:
      PaperPortfolioRouteStatus,
  ): number {
    if (
      status ===
      "BLOCKED"
    ) {
      return 0;
    }

    if (
      status ===
      "INSUFFICIENT_DATA" ||
      status ===
      "NEUTRAL"
    ) {
      return 1;
    }

    if (
      status ===
      "THROTTLED"
    ) {
      const range =
        this.config
          .throttleScoreBelow -
        this.config
          .blockScoreBelow;

      const progress =
        range >
        0
          ? this.clamp01(
              (
                score -
                this.config
                  .blockScoreBelow
              ) /
                range,
            )
          : 1;

      return this.round(
        this.config
          .minimumMultiplier +
          (
            1 -
            this.config
              .minimumMultiplier
          ) *
            progress,

        4,
      );
    }

    const boostRange =
      Math.max(
        1,

        100 -
          this.config
            .boostScoreAt,
      );

    const boostProgress =
      this.clamp01(
        (
          score -
          this.config
            .boostScoreAt
        ) /
          boostRange,
      );

    return this.round(
      Math.min(
        this.config
          .maximumMultiplier,

        1 +
          (
            this.config
              .maximumMultiplier -
            1
          ) *
            boostProgress,
      ),

      4,
    );
  }

  private calculateDrawdownSafety(
    paper:
      PaperPortfolioRoutePerformance["paper"],
  ): number {
    if (
      paper.largestLoss >=
      0 ||
      paper.capitalUsed <=
      0
    ) {
      return 100;
    }

    const averageCapital =
      paper.trades >
      0
        ? paper.capitalUsed /
          paper.trades
        : 0;

    if (
      averageCapital <=
      0
    ) {
      return 100;
    }

    const largestLossPercent =
      (
        Math.abs(
          paper.largestLoss,
        ) /
        averageCapital
      ) *
      100;

    if (
      largestLossPercent <=
      this.config
        .maximumAcceptableLossPercent
    ) {
      return 100;
    }

    return this.clamp100(
      100 -
        (
          largestLossPercent -
          this.config
            .maximumAcceptableLossPercent
        ) *
          25,
    );
  }

  private shadowConfidence(
    completed:
      number,
  ): number {
    return this.clamp100(
      (
        completed /
        this.config
          .minimumShadowCompletedOutcomes
      ) *
        100,
    );
  }

  private targetScore(
    actual:
      number,

    target:
      number,
  ): number {
    if (
      target <=
      0
    ) {
      return 100;
    }

    return this.clamp100(
      (
        actual /
        target
      ) *
        100,
    );
  }

  private buildReasons(
    status:
      PaperPortfolioRouteStatus,

    score:
      number,

    shadow:
      ShadowExchangePairPerformance | null,

    paper:
      PaperPortfolioRoutePerformance["paper"],

    enoughShadow:
      boolean,

    enoughPaper:
      boolean,

    multiplier:
      number,
  ): string[] {
    const reasons:
      string[] =
      [];

    reasons.push(
      `Route portfolio score is ${score}/100.`,
    );

    if (
      enoughShadow
    ) {
      reasons.push(
        `Shadow route success rate: ${this.round(shadow?.successRatePercent ?? 0, 2)}%.`,
      );

      reasons.push(
        `Shadow executable-sample rate: ${this.round(shadow?.executableSampleRatePercent ?? 0, 2)}%.`,
      );
    }

    if (
      enoughPaper
    ) {
      reasons.push(
        `Automated PAPER win rate: ${this.round(paper.winRatePercent, 2)}%.`,
      );

      reasons.push(
        `Automated PAPER ROI: ${this.round(paper.roiPercent, 4)}%.`,
      );
    }

    if (
      status ===
      "BLOCKED"
    ) {
      reasons.push(
        "Route is blocked from new automated PAPER capital because historical performance is below configured safety limits.",
      );
    } else if (
      status ===
      "THROTTLED"
    ) {
      reasons.push(
        `Route capital is throttled to ${multiplier}x of the upstream adaptive allocation.`,
      );
    } else if (
      status ===
      "BOOSTED"
    ) {
      reasons.push(
        `Strong route evidence permits a controlled ${multiplier}x capital multiplier.`,
      );
    } else {
      reasons.push(
        "Route remains at neutral 1.00x capital allocation.",
      );
    }

    reasons.push(
      "Portfolio optimization cannot override account, batch, exposure, risk, liquidity, freshness, or execution-simulation limits.",
    );

    return reasons;
  }

  private createKey(
    buyExchange:
      string,

    sellExchange:
      string,
  ): string {
    return [
      buyExchange
        .trim()
        .toLowerCase(),

      sellExchange
        .trim()
        .toLowerCase(),
    ].join(
      "|",
    );
  }

  private countStatus(
    routes:
      PaperPortfolioRoutePerformance[],

    status:
      PaperPortfolioRouteStatus,
  ): number {
    return routes.filter(
      (
        route,
      ) =>
        route.status ===
        status,
    ).length;
  }

  private percent(
    numerator:
      number,

    denominator:
      number,
  ): number {
    if (
      denominator <=
      0
    ) {
      return 0;
    }

    return this.round(
      (
        numerator /
        denominator
      ) *
        100,

      2,
    );
  }

  private clamp01(
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
        1,
        value,
      ),
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
      !Number.isInteger(
        this.config
          .minimumShadowCompletedOutcomes,
      ) ||
      this.config
        .minimumShadowCompletedOutcomes <
        1
    ) {
      throw new Error(
        "minimumShadowCompletedOutcomes must be a positive integer.",
      );
    }

    if (
      !Number.isInteger(
        this.config
          .minimumPaperTrades,
      ) ||
      this.config
        .minimumPaperTrades <
        1
    ) {
      throw new Error(
        "minimumPaperTrades must be a positive integer.",
      );
    }

    if (
      !Number.isFinite(
        this.config.minimumMultiplier,
      ) ||
      this.config.minimumMultiplier <=
        0 ||
      this.config.minimumMultiplier >
        1
    ) {
      throw new Error(
        "minimumMultiplier must be greater than 0 and no more than 1.",
      );
    }

    if (
      !Number.isFinite(
        this.config.maximumMultiplier,
      ) ||
      this.config.maximumMultiplier <
        1
    ) {
      throw new Error(
        "maximumMultiplier must be at least 1.",
      );
    }

    if (
      !Number.isFinite(
        this.config.blockScoreBelow,
      ) ||
      !Number.isFinite(
        this.config.throttleScoreBelow,
      ) ||
      !Number.isFinite(
        this.config.boostScoreAt,
      ) ||
      this.config.blockScoreBelow <
        0 ||
      this.config.boostScoreAt >
        100 ||
      this.config.blockScoreBelow >=
        this.config.throttleScoreBelow ||
      this.config.throttleScoreBelow >=
        this.config.boostScoreAt
    ) {
      throw new Error(
        "Portfolio optimizer score thresholds are invalid.",
      );
    }
  }
}

export const paperPortfolioOptimizerService =
  new PaperPortfolioOptimizerService();
