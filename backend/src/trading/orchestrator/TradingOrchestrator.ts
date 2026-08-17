import {
  executionHealthService,
} from "../../execution/live/health/ExecutionHealthService";

import {
  liveExecutionService,
} from "../../execution/live/LiveExecutionService";

import {
  executionSimulator,
} from "../../execution/services/ExecutionSimulator";

import {
  capitalOptimizer,
} from "../../optimizer/services/CapitalOptimizer";

import {
  opportunityRankingService,
} from "../../ranking/services/OpportunityRankingService";

import {
  riskEngine,
} from "../../risk/services/RiskEngine";

import {
  freshnessIntegrityService,
} from "../../freshness/services/FreshnessIntegrityService";

import type {
  ArbitrageOpportunity,
} from "../../arbitrage/models/ArbitrageOpportunity";

import {
  opportunityService,
} from "../../arbitrage/services/OpportunityService";

import {
  tradingAccountService,
} from "../account/TradingAccountService";

import {
  defaultExecutableProfitConfig,
} from "../config/execution";

import type {
  ExecutableProfitConfig,
} from "../config/execution";

import {
  executableProfitCalculator,
} from "../profit/ExecutableProfitCalculator";

export type TradingRecommendation =
  | "EXECUTE"
  | "REVIEW"
  | "SKIP";

export interface TradingDecision {
  approved: boolean;

  decision:
    TradingRecommendation;

  /** Executable capital denominated in the opportunity market's quote asset. */
  allocatedCapital: number;

  executionScore: number;

  riskScore: number;

  reasons: string[];
}

export type TradeCycleStatus =
  | "NO_OPPORTUNITY"
  | "OPTIMIZATION_FAILED"
  | "SIMULATION_MISSING"
  | "RISK_BLOCKED"
  | "READY";

export interface TradeCycleResult {
  status:
    TradeCycleStatus;

  market:
    | string
    | null;

  buyExchange:
    | string
    | null;

  sellExchange:
    | string
    | null;

  capital:
    | number
    | null;

  rankingScore:
    | number
    | null;

  riskLevel:
    | "LOW"
    | "MEDIUM"
    | "HIGH"
    | "BLOCKED"
    | null;

  reasons: string[];
}

export class TradeOrchestrator {
  evaluate(
    opportunity:
      ArbitrageOpportunity,

    executionCapital:
      number,

    accountCapital =
      executionCapital,

    executableProfitConfig:
      ExecutableProfitConfig =
      defaultExecutableProfitConfig,
  ): TradingDecision {
    console.log(
      "[TradingOrchestrator] Evaluating opportunity:",
      {
        market:
          opportunity.pair.market,

        executionCapital,

        accountCapital,
      },
    );

    if (
      !Number.isFinite(
        executionCapital,
      ) ||
      executionCapital <=
        0
    ) {
      return this.createRejectedDecision(
        [
          "Requested capital must be a positive number.",
        ],
      );
    }

    const accountCheck =
      tradingAccountService
        .evaluateTrade(
          accountCapital,
        );

    if (
      !accountCheck.approved
    ) {
      return this.createRejectedDecision(
        accountCheck.reasons,
      );
    }

    let executableProfit;

    try {
      executableProfit =
        executableProfitCalculator
          .calculate({
            market:
              opportunity.pair.market,

            capital:
              executionCapital,

            buyExchange:
              opportunity.pair.buy.exchange,

            sellExchange:
              opportunity.pair.sell.exchange,

            buyPrice:
              opportunity.buyPrice,

            sellPrice:
              opportunity.sellPrice,

            ...executableProfitConfig,
          });
    } catch (
      error:
        unknown
    ) {
      return this.createRejectedDecision(
        [
          error instanceof Error
            ? error.message
            : "Executable-profit calculation failed.",
        ],
      );
    }

    if (
      !executableProfit.executable
    ) {
      return this.createRejectedDecision(
        executableProfit.reasons,
      );
    }

    const execution =
      executionSimulator
        .simulate({
          market:
            opportunity.pair.market,

          buyExchange:
            opportunity.pair.buy.exchange,

          sellExchange:
            opportunity.pair.sell.exchange,

            capital:
              executionCapital,
        });

    if (
      !execution.success ||
      !execution.simulation
    ) {
      return this.createRejectedDecision(
        [
          execution.failureReason ??
            "Execution simulation failed.",
        ],
      );
    }

    const simulation =
      execution.simulation;

    const executionScore =
      this.clampScore(
        simulation
          .confidence
          .score,
      );

    /*
     * Version 13.5
     *
     * Re-check the actual exchange books
     * immediately before unified risk.
     */
    const pairIntegrity =
      freshnessIntegrityService
        .evaluatePair(
          opportunity.pair.buy,
          opportunity.pair.sell,
        );

    const risk =
      riskEngine
        .assess({
          capital:
            accountCapital,

          market:
            opportunity.pair.market,

          buyExchange:
            opportunity.pair.buy.exchange,

          sellExchange:
            opportunity.pair.sell.exchange,

          quotesFresh:
            pairIntegrity
              .buy
              .fresh &&
            pairIntegrity
              .sell
              .fresh,

          pairSynchronized:
            pairIntegrity
              .synchronized,

          timestampSkewMs:
            pairIntegrity
              .timestampSkewMs,

          maximumPairSkewMs:
            pairIntegrity
              .maximumPairSkewMs,

          confidence:
            simulation
              .confidence
              .score,

          fillPercent:
            simulation
              .depth
              .fillPercent,

          netProfit:
            executableProfit
              .executableProfit,

          executionTimeMs:
            execution
              .executionTimeMs,

          liquidityScore:
            opportunity
              .liquidityScore,

          quoteAgeMs:
            this.calculateQuoteAgeMs(
              opportunity.timestamp,
            ),

          exchangeConnected:
            this.areExecutionExchangesReady(
              opportunity.pair.buy.exchange,
              opportunity.pair.sell.exchange,
            ),

          balanceAvailable:
            this.isBalanceAvailable(
              accountCapital,
            ),

          dailyLoss:
            this.getAccountDailyLoss(),

          dailyTradeCount:
            this.getAccountDailyTradeCount(),
        });

    const riskScore =
      this.clampScore(
        risk.score,
      );

    const simulationDecision =
      simulation
        .decision
        .recommendation;

    const approved =
      risk.approved &&
      simulationDecision ===
        "EXECUTE";

    const decision:
      TradingRecommendation =
      !risk.approved
        ? "SKIP"
        : simulationDecision;

    const reasons =
      this.collectReasons(
        simulation
          .confidence
          .reasons,

        risk.reasons,

        approved,
      );

    if (
      approved
    ) {
      reasons.push(
        `Executable profit after fees, slippage, and safety buffer is ${executableProfit.executableProfitPercent.toFixed(
          4,
        )}%.`,
      );
    }

    return {
      approved,

      decision,

      allocatedCapital:
        approved
          ? executionCapital
          : 0,

      executionScore,

      riskScore,

      reasons: [
        ...new Set(
          reasons,
        ),
      ],
    };
  }

  executeCycle():
    TradeCycleResult {
    const ranking =
      opportunityRankingService
        .rank();

    const topOpportunity =
      ranking
        .opportunities[
          0
        ];

    if (
      !topOpportunity
    ) {
      return {
        status:
          "NO_OPPORTUNITY",

        market:
          null,

        buyExchange:
          null,

        sellExchange:
          null,

        capital:
          null,

        rankingScore:
          null,

        riskLevel:
          null,

        reasons: [
          "No ranked opportunity is currently available.",
        ],
      };
    }

    const optimization =
      capitalOptimizer
        .optimize({
          market:
            topOpportunity.market,

          buyExchange:
            topOpportunity.buyExchange,

          sellExchange:
            topOpportunity.sellExchange,

          minimumCapital:
            500,

          maximumCapital:
            50_000,

          capitalStep:
            500,
        });

    const bestCandidate =
      optimization.best;

    if (
      !bestCandidate ||
      bestCandidate.score <=
        0
    ) {
      return {
        status:
          "OPTIMIZATION_FAILED",

        market:
          topOpportunity.market,

        buyExchange:
          topOpportunity.buyExchange,

        sellExchange:
          topOpportunity.sellExchange,

        capital:
          null,

        rankingScore:
          topOpportunity.score,

        riskLevel:
          null,

        reasons: [
          "Capital optimizer did not produce a profitable executable candidate.",
        ],
      };
    }

    const accountCheck =
      tradingAccountService
        .evaluateTrade(
          bestCandidate.capital,
        );

    if (
      !accountCheck.approved
    ) {
      return {
        status:
          "RISK_BLOCKED",

        market:
          topOpportunity.market,

        buyExchange:
          topOpportunity.buyExchange,

        sellExchange:
          topOpportunity.sellExchange,

        capital:
          bestCandidate.capital,

        rankingScore:
          topOpportunity.score,

        riskLevel:
          null,

        reasons:
          accountCheck.reasons,
      };
    }

    const simulation =
      bestCandidate
        .execution
        .simulation;

    if (
      !simulation
    ) {
      return {
        status:
          "SIMULATION_MISSING",

        market:
          topOpportunity.market,

        buyExchange:
          topOpportunity.buyExchange,

        sellExchange:
          topOpportunity.sellExchange,

        capital:
          bestCandidate.capital,

        rankingScore:
          topOpportunity.score,

        riskLevel:
          null,

        reasons: [
          "Best optimization candidate does not contain a simulation result.",
        ],
      };
    }

    /*
     * Resolve the newest underlying
     * opportunity snapshot.
     */
    const currentOpportunity =
      this.findOpportunity(
        topOpportunity.market,
        topOpportunity.buyExchange,
        topOpportunity.sellExchange,
      );

    const pairIntegrity =
      currentOpportunity
        ? freshnessIntegrityService
            .evaluatePair(
              currentOpportunity.pair.buy,
              currentOpportunity.pair.sell,
            )
        : null;

    const risk =
      riskEngine
        .assess({
          capital:
            bestCandidate.capital,

          market:
            topOpportunity.market,

          buyExchange:
            topOpportunity.buyExchange,

          sellExchange:
            topOpportunity.sellExchange,

          quotesFresh:
            pairIntegrity
              ? pairIntegrity
                  .buy
                  .fresh &&
                pairIntegrity
                  .sell
                  .fresh
              : false,

          pairSynchronized:
            pairIntegrity
              ?.synchronized ??
            false,

          timestampSkewMs:
            pairIntegrity
              ?.timestampSkewMs ??
            null,

          maximumPairSkewMs:
            pairIntegrity
              ?.maximumPairSkewMs ??
            null,

          confidence:
            simulation
              .confidence
              .score,

          fillPercent:
            simulation
              .depth
              .fillPercent,

          netProfit:
            simulation
              .profit
              .breakdown
              .netProfit,

          executionTimeMs:
            bestCandidate
              .execution
              .executionTimeMs,

          liquidityScore:
            topOpportunity
              .liquidityScore,

          quoteAgeMs:
            this.calculateQuoteAgeMs(
              this.findOpportunityTimestamp(
                topOpportunity.market,
                topOpportunity.buyExchange,
                topOpportunity.sellExchange,
              ),
            ),

          exchangeConnected:
            this.areExecutionExchangesReady(
              topOpportunity.buyExchange,
              topOpportunity.sellExchange,
            ),

          balanceAvailable:
            this.isBalanceAvailable(
              bestCandidate.capital,
            ),

          dailyLoss:
            this.getAccountDailyLoss(),

          dailyTradeCount:
            this.getAccountDailyTradeCount(),
        });

    if (
      !risk.approved ||
      simulation
        .decision
        .recommendation !==
        "EXECUTE"
    ) {
      return {
        status:
          "RISK_BLOCKED",

        market:
          topOpportunity.market,

        buyExchange:
          topOpportunity.buyExchange,

        sellExchange:
          topOpportunity.sellExchange,

        capital:
          bestCandidate.capital,

        rankingScore:
          topOpportunity.score,

        riskLevel:
          risk.level,

        reasons:
          risk.reasons.length >
          0
            ? risk.reasons
            : [
                `Execution decision is ${simulation.decision.recommendation}.`,
              ],
      };
    }

    return {
      status:
        "READY",

      market:
        topOpportunity.market,

      buyExchange:
        topOpportunity.buyExchange,

      sellExchange:
        topOpportunity.sellExchange,

      capital:
        bestCandidate.capital,

      rankingScore:
        topOpportunity.score,

      riskLevel:
        risk.level,

      reasons:
        risk.reasons.length >
        0
          ? risk.reasons
          : [
              "Opportunity passed account, ranking, optimization, simulation, and unified risk evaluation.",
            ],
    };
  }

  private findOpportunity(
    market:
      string,

    buyExchange:
      string,

    sellExchange:
      string,
  ): ArbitrageOpportunity | null {
    const normalizedMarket =
      market
        .trim()
        .toUpperCase();

    const normalizedBuyExchange =
      buyExchange
        .trim()
        .toLowerCase();

    const normalizedSellExchange =
      sellExchange
        .trim()
        .toLowerCase();

    return (
      opportunityService
        .getOpportunities()
        .find(
          (
            item,
          ) =>
            item.pair.market
              .trim()
              .toUpperCase() ===
              normalizedMarket &&
            item.pair.buy.exchange
              .trim()
              .toLowerCase() ===
              normalizedBuyExchange &&
            item.pair.sell.exchange
              .trim()
              .toLowerCase() ===
              normalizedSellExchange,
        ) ??
      null
    );
  }

  private findOpportunityTimestamp(
    market:
      string,

    buyExchange:
      string,

    sellExchange:
      string,
  ): number {
    return (
      this.findOpportunity(
        market,
        buyExchange,
        sellExchange,
      )?.timestamp ??
      Number.NaN
    );
  }

  private calculateQuoteAgeMs(
    opportunityTimestamp:
      number,
  ): number {
    if (
      !Number.isFinite(
        opportunityTimestamp,
      ) ||
      opportunityTimestamp <=
        0
    ) {
      return Number.MAX_SAFE_INTEGER;
    }

    return Math.max(
      0,

      Date.now() -
        opportunityTimestamp,
    );
  }

  private areExecutionExchangesReady(
    buyExchange:
      string,

    sellExchange:
      string,
  ): boolean {
    const account =
      tradingAccountService
        .getAccount();

    if (
      account.mode !==
      "LIVE"
    ) {
      return true;
    }

    const exchanges = [
      buyExchange,
      sellExchange,
    ].map(
      (
        exchange,
      ) =>
        exchange
          .trim()
          .toLowerCase(),
    );

    if (
      exchanges.some(
        (
          exchange,
        ) =>
          !exchange,
      )
    ) {
      return false;
    }

    if (
      !liveExecutionService
        .areExchangesConnected(
          ...exchanges,
        )
    ) {
      return false;
    }

    const healthReport =
      executionHealthService
        .getReport();

    return exchanges.every(
      (
        exchange,
      ) => {
        const exchangeHealth =
          healthReport
            .exchanges
            .find(
              (
                item,
              ) =>
                item.exchange ===
                exchange,
            );

        return (
          exchangeHealth !==
            undefined &&
          exchangeHealth
            .adapterRegistered &&
          exchangeHealth
            .adapterConnected &&
          exchangeHealth
            .status !==
            "UNHEALTHY"
        );
      },
    );
  }

  private isBalanceAvailable(
    requestedCapital:
      number,
  ): boolean {
    const account =
      tradingAccountService
        .getAccount();

    return (
      Number.isFinite(
        requestedCapital,
      ) &&
      requestedCapital >
        0 &&
      requestedCapital <=
        account.availableCapital
    );
  }

  private getAccountDailyLoss():
    number {
    return tradingAccountService
      .getAccount()
      .todayLoss;
  }

  private getAccountDailyTradeCount():
    number {
    return tradingAccountService
      .getAccount()
      .tradesToday;
  }

  private createRejectedDecision(
    reasons:
      string[],
  ): TradingDecision {
    return {
      approved:
        false,

      decision:
        "SKIP",

      allocatedCapital:
        0,

      executionScore:
        0,

      riskScore:
        0,

      reasons,
    };
  }

  private collectReasons(
    executionReasons:
      string[],

    riskReasons:
      string[],

    approved:
      boolean,
  ): string[] {
    const reasons = [
      ...executionReasons,
      ...riskReasons,
    ];

    if (
      approved &&
      reasons.length ===
        0
    ) {
      reasons.push(
        "Trade passed execution and risk evaluation.",
      );
    }

    if (
      !approved &&
      reasons.length ===
        0
    ) {
      reasons.push(
        "Trade did not satisfy the execution requirements.",
      );
    }

    return [
      ...new Set(
        reasons,
      ),
    ];
  }

  private clampScore(
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

        Math.round(
          value,
        ),
      ),
    );
  }
}

export const tradingOrchestrator =
  new TradeOrchestrator();

export const tradeOrchestrator =
  tradingOrchestrator;
