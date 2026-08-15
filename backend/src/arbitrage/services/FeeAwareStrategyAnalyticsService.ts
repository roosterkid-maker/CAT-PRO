import {
  getExchangeFees,
} from "../config/fees";

import {
  PROFIT_TIER_POLICY,
} from "../config/profitTiers";

import {
  opportunityNearMissAnalyticsService,
} from "./OpportunityNearMissAnalyticsService";

export type FeeExecutionStyle =
  | "TAKER_TAKER"
  | "MAKER_TAKER"
  | "TAKER_MAKER"
  | "MAKER_MAKER";

export interface FeeAwareScenario {
  style: FeeExecutionStyle;

  buyFeePercent: number;

  sellFeePercent: number;

  exactFeeBurdenPercent: number;

  netAfterTradingFeesPercent: number;

  breakEvenRawSpreadPercent: number;

  rawSpreadRequiredForDiscoveryPercent: number;

  rawSpreadRequiredForQualificationPercent: number;

  rawSpreadRequiredForLivePercent: number;

  currentSpreadMeetsBreakEven: boolean;

  currentSpreadMeetsDiscovery: boolean;

  currentSpreadMeetsQualification: boolean;

  currentSpreadMeetsLive: boolean;

  capitalOutcomes: Array<{
    capital: number;

    grossSpreadProfit: number;

    tradingFeeCost: number;

    netAfterTradingFees: number;

    /*
     * This is intentionally fee-only.
     *
     * Full executable economics still requires
     * measured order-book slippage and safety buffer.
     */
    slippageIncluded: false;

    safetyBufferIncluded: false;
  }>;
}

export interface FeeAwareRouteAnalysis {
  market: string;

  buyExchange: string;

  sellExchange: string;

  buyPrice: number;

  sellPrice: number;

  rawSpreadPercent: number;

  currentTakerTakerNetProfitPercent: number | null;

  scenarios: FeeAwareScenario[];

  bestFeeOnlyScenario: FeeExecutionStyle;

  bestFeeOnlyNetPercent: number;

  makerExecutionWarning: string;
}

export interface FeeAwareStrategyAnalyticsReport {
  generatedAt: number;

  mode:
    "READ_ONLY_FEE_STRATEGY_ANALYSIS";

  executionAllowed:
    false;

  feeRegistrySource:
    "MARKET_AWARE_EVIDENCE";

  feeRegistryWarning:
    string;

  profitPolicy: {
    discoveryMinimumNetProfitPercent: number;

    qualificationMinimumNetProfitPercent: number;

    liveMinimumNetProfitPercent: number;
  };

  capitalScenarios:
    number[];

  analyzedRoutes:
    number;

  routes:
    FeeAwareRouteAnalysis[];

  observations:
    string[];
}

export class FeeAwareStrategyAnalyticsService {
  private static readonly DEFAULT_CAPITALS =
    [
      100,
      500,
      1_000,
      10_000,
    ] as const;

  getReport(
    limit =
      10,
  ): FeeAwareStrategyAnalyticsReport {
    const nearMiss =
      opportunityNearMissAnalyticsService
        .getReport(
          Math.max(
            20,
            limit,
          ),
        );

    const routes =
      nearMiss
        .topNearMisses
        .filter(
          (
            route,
          ) =>
            route.buyPrice !==
              null &&
            route.sellPrice !==
              null &&
            route.buyPrice >
              0 &&
            route.sellPrice >
              0 &&
            route.rawSpreadPercent !==
              null,
        )
        .slice(
          0,
          this.normalizeLimit(
            limit,
          ),
        )
        .map(
          (
            route,
          ) =>
            this.analyzeRoute(
              {
                market:
                  route.market,

                buyExchange:
                  route.buyExchange,

                sellExchange:
                  route.sellExchange,

                buyPrice:
                  route.buyPrice as number,

                sellPrice:
                  route.sellPrice as number,

                rawSpreadPercent:
                  route.rawSpreadPercent as number,

                currentTakerTakerNetProfitPercent:
                  route.netProfitPercent,
              },
            ),
        );

    return {
      generatedAt:
        Date.now(),

      mode:
        "READ_ONLY_FEE_STRATEGY_ANALYSIS",

      executionAllowed:
        false,

      feeRegistrySource:
        "MARKET_AWARE_EVIDENCE",

      feeRegistryWarning:
        "Scenario fees use the freshest market-aware evidence available. Static exchange defaults are not authenticated account-specific VIP/volume tiers; missing required evidence remains blocked.",

      profitPolicy: {
        discoveryMinimumNetProfitPercent:
          PROFIT_TIER_POLICY
            .discoveryMinimumNetProfitPercent,

        qualificationMinimumNetProfitPercent:
          PROFIT_TIER_POLICY
            .qualificationMinimumNetProfitPercent,

        liveMinimumNetProfitPercent:
          PROFIT_TIER_POLICY
            .liveMinimumNetProfitPercent,
      },

      capitalScenarios: [
        ...FeeAwareStrategyAnalyticsService
          .DEFAULT_CAPITALS,
      ],

      analyzedRoutes:
        routes.length,

      routes,

      observations: [
        "TAKER_TAKER matches the conservative fee style currently used by OpportunityEvaluator.",

        "Maker scenarios are hypothetical economics only. A maker order is not guaranteed to fill, may lose the arbitrage window, and introduces leg/execution risk.",

        "Break-even calculations use exact configured buy/sell fee amounts relative to buy notional rather than blindly adding percentages.",

        "Capital outcomes shown here include trading fees only. They deliberately do not invent slippage or safety-buffer costs.",

        "Full executable profitability must still pass order-book depth simulation, measured slippage, safety buffer, freshness, synchronization, risk, and last-look.",

        "This endpoint never submits orders and never changes fee, profit, freshness, or execution policy.",
      ],
    };
  }

  private analyzeRoute(
    input: {
      market: string;

      buyExchange: string;

      sellExchange: string;

      buyPrice: number;

      sellPrice: number;

      rawSpreadPercent: number;

      currentTakerTakerNetProfitPercent:
        number | null;
    },
  ): FeeAwareRouteAnalysis {
    const buyFees =
      getExchangeFees(
        input.buyExchange,
        input.market,
      );

    const sellFees =
      getExchangeFees(
        input.sellExchange,
        input.market,
      );

    const scenarios:
      FeeAwareScenario[] = [
      this.scenario(
        "TAKER_TAKER",
        input,
        buyFees.takerPercent,
        sellFees.takerPercent,
      ),

      this.scenario(
        "MAKER_TAKER",
        input,
        buyFees.makerPercent,
        sellFees.takerPercent,
      ),

      this.scenario(
        "TAKER_MAKER",
        input,
        buyFees.takerPercent,
        sellFees.makerPercent,
      ),

      this.scenario(
        "MAKER_MAKER",
        input,
        buyFees.makerPercent,
        sellFees.makerPercent,
      ),
    ];

    const best =
      [
        ...scenarios,
      ].sort(
        (
          first,
          second,
        ) =>
          second
            .netAfterTradingFeesPercent -
          first
            .netAfterTradingFeesPercent,
      )[
        0
      ];

    return {
      ...input,

      scenarios,

      bestFeeOnlyScenario:
        best
          ?.style ??
        "TAKER_TAKER",

      bestFeeOnlyNetPercent:
        best
          ?.netAfterTradingFeesPercent ??
        input
          .currentTakerTakerNetProfitPercent ??
        Number.NEGATIVE_INFINITY,

      makerExecutionWarning:
        "Maker economics are informational only; passive fill probability and adverse selection are not modeled here.",
    };
  }

  private scenario(
    style:
      FeeExecutionStyle,

    route: {
      buyPrice: number;

      sellPrice: number;

      rawSpreadPercent: number;
    },

    buyFeePercent:
      number,

    sellFeePercent:
      number,
  ): FeeAwareScenario {
    /*
     * Use quantity = 1 for exact percentage economics.
     */
    const buyNotional =
      route.buyPrice;

    const sellNotional =
      route.sellPrice;

    const buyFeeAmount =
      buyNotional *
      (
        buyFeePercent /
        100
      );

    const sellFeeAmount =
      sellNotional *
      (
        sellFeePercent /
        100
      );

    const feeAmount =
      buyFeeAmount +
      sellFeeAmount;

    const exactFeeBurdenPercent =
      (
        feeAmount /
        buyNotional
      ) *
      100;

    const netAfterTradingFeesPercent =
      route.rawSpreadPercent -
      exactFeeBurdenPercent;

    const breakEvenRawSpreadPercent =
      exactFeeBurdenPercent;

    const rawSpreadRequiredForDiscoveryPercent =
      exactFeeBurdenPercent +
      PROFIT_TIER_POLICY
        .discoveryMinimumNetProfitPercent;

    const rawSpreadRequiredForQualificationPercent =
      exactFeeBurdenPercent +
      PROFIT_TIER_POLICY
        .qualificationMinimumNetProfitPercent;

    const rawSpreadRequiredForLivePercent =
      exactFeeBurdenPercent +
      PROFIT_TIER_POLICY
        .liveMinimumNetProfitPercent;

    const capitalOutcomes =
      FeeAwareStrategyAnalyticsService
        .DEFAULT_CAPITALS
        .map(
          (
            capital,
          ) => {
            const quantity =
              capital /
              route.buyPrice;

            const grossSpreadProfit =
              (
                route.sellPrice -
                route.buyPrice
              ) *
              quantity;

            const tradingFeeCost =
              (
                route.buyPrice *
                quantity *
                (
                  buyFeePercent /
                  100
                )
              ) +
              (
                route.sellPrice *
                quantity *
                (
                  sellFeePercent /
                  100
                )
              );

            return {
              capital,

              grossSpreadProfit:
                this.round(
                  grossSpreadProfit,
                ),

              tradingFeeCost:
                this.round(
                  tradingFeeCost,
                ),

              netAfterTradingFees:
                this.round(
                  grossSpreadProfit -
                  tradingFeeCost,
                ),

              slippageIncluded:
                false as const,

              safetyBufferIncluded:
                false as const,
            };
          },
        );

    return {
      style,

      buyFeePercent,

      sellFeePercent,

      exactFeeBurdenPercent:
        this.round(
          exactFeeBurdenPercent,
        ),

      netAfterTradingFeesPercent:
        this.round(
          netAfterTradingFeesPercent,
        ),

      breakEvenRawSpreadPercent:
        this.round(
          breakEvenRawSpreadPercent,
        ),

      rawSpreadRequiredForDiscoveryPercent:
        this.round(
          rawSpreadRequiredForDiscoveryPercent,
        ),

      rawSpreadRequiredForQualificationPercent:
        this.round(
          rawSpreadRequiredForQualificationPercent,
        ),

      rawSpreadRequiredForLivePercent:
        this.round(
          rawSpreadRequiredForLivePercent,
        ),

      currentSpreadMeetsBreakEven:
        route.rawSpreadPercent >=
        breakEvenRawSpreadPercent,

      currentSpreadMeetsDiscovery:
        route.rawSpreadPercent >=
        rawSpreadRequiredForDiscoveryPercent,

      currentSpreadMeetsQualification:
        route.rawSpreadPercent >=
        rawSpreadRequiredForQualificationPercent,

      currentSpreadMeetsLive:
        route.rawSpreadPercent >=
        rawSpreadRequiredForLivePercent,

      capitalOutcomes,
    };
  }

  private normalizeLimit(
    limit:
      number,
  ): number {
    if (
      !Number.isSafeInteger(
        limit,
      ) ||
      limit <=
        0
    ) {
      return 10;
    }

    return Math.min(
      limit,
      50,
    );
  }

  private round(
    value:
      number,
  ): number {
    return Number(
      value.toFixed(
        8,
      ),
    );
  }
}

export const feeAwareStrategyAnalyticsService =
  new FeeAwareStrategyAnalyticsService();
