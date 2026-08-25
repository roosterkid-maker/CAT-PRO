import type {
  ArbitrageOpportunity,
} from "../../arbitrage/models/ArbitrageOpportunity";

import type {
  ExecutionResult,
} from "../models/ExecutionResult";

import {
  tradingOrchestrator,
} from "../orchestrator/TradingOrchestrator";

import {
  paperExecutionAccountingService,
} from "../services/PaperExecutionAccountingService";

import {
  executionPlanValidator,
} from "./ExecutionPlanValidator";

import {
  executionPlanner,
} from "./ExecutionPlanner";

import type {
  CrossExchangeQuantityNormalizationReport,
} from "./CrossExchangeExecutableQuantityNormalizer";

import {
  strategyOneFundedRouteService,
} from "./StrategyOneFundedRouteService";

import type {
  StrategyOneFundedRouteReport,
} from "./StrategyOneFundedRouteService";

import {
  paperTwoLegExecutionLifecycleService,
} from "./PaperTwoLegExecutionLifecycleService";

import type {
  PaperTwoLegExecutionLifecycleResult,
} from "../models/PaperTwoLegExecutionLifecycle";

import {
  normalizeStrategyAttribution,
} from "../../strategies/models/StrategyAttribution";

import type {
  StrategyAttribution,
} from "../../strategies/models/StrategyAttribution";

import {
  crossVenuePriceCredibilityService,
} from "../analysis/CrossVenuePriceCredibilityService";

import type {
  CrossVenuePriceCredibilityReport,
} from "../analysis/CrossVenuePriceCredibilityService";

import type {
  PaperExecutionStressEvidence,
  PaperPriceCredibilityEvidence,
} from "../models/PaperProfitEvidence";

import {
  postGuardProfitValidationLedgerService,
} from "../services/PostGuardProfitValidationLedgerService";

import {
  centralPaperCapitalValuationService,
  type CentralPaperAssetConversionEvidence,
} from "../../strategies/services/CentralPaperCapitalValuationService";

import {
  tradingAccountService,
} from "../account/TradingAccountService";

import type {
  PaperCapitalConversionEvidence,
} from "../models/PaperProfitEvidence";

import {
  PROFIT_TIER_POLICY,
} from "../../arbitrage/config/profitTiers";

import {
  getExchangeTakerFeePercent,
} from "../../arbitrage/config/fees";

import {
  defaultExecutableProfitConfig,
} from "../config/execution";

import {
  defaultPaperExecutionConfig,
} from "./PaperOrderExecutor";

import {
  freshnessIntegrityService,
} from "../../freshness/services/FreshnessIntegrityService";

import {
  isExactStrategyOnePilotRoute,
  STRATEGY_ONE_PILOT_DISPATCH_RESERVED_MAXIMUM_BOOK_AGE_MS,
  STRATEGY_ONE_PILOT_MAXIMUM_BOOK_SKEW_MS,
} from "../../arbitrage/execution/StrategyOnePilotEquivalentPaperEvidenceService";

import type {
  OrderBook,
} from "../../orderbook/models/OrderBook";

import {
  orderBookService,
} from "../../orderbook/services/OrderBookService";

import {
  vwapCalculator,
} from "../../orderbook/calculators/VWAPCalculator";

export interface AutomatedPaperTradeRequest {
  strategyAttribution?:
    StrategyAttribution;

  opportunity:
    ArbitrageOpportunity;

  requestedCapital:
    number;
}

export interface AutomatedPaperTradeResponse {
  approved:
    boolean;

  result:
    ExecutionResult | null;

  lifecycle:
    PaperTwoLegExecutionLifecycleResult | null;

  quantityNormalization:
    CrossExchangeQuantityNormalizationReport | null;

  funding?:
    StrategyOneFundedRouteReport;

  stressGate?:
    StrategyOnePaperStressGateReport;

  reasons:
    string[];
}

export interface StrategyOnePaperStressGateConfig {
  minimumNetProfitPercent: number;

  safetyBufferPercent: number;

  adverseMoveReservePercentPerLeg: number;
}

export interface StrategyOnePaperStressGateDependencies {
  getOrderBook(
    exchange: string,
    market: string,
  ): OrderBook | null;

  getTakerFeePercent(
    exchange: string,
    market: string,
    now: number,
  ): number | null;

  getMaximumQuoteAgeMs(
    exchange: string,
  ): number;

  getMaximumPairSkewMs(
    buyExchange: string,
    sellExchange: string,
  ): number;
}

export interface StrategyOnePaperStressGateReport {
  status:
    "PASSED" |
    "BLOCKED";

  evaluatedAt: number;

  sourceOpportunityAgeMs:
    number | null;

  buyBookTimestamp:
    number | null;

  sellBookTimestamp:
    number | null;

  timestampSkewMs:
    number | null;

  quantity: number;

  buyFillPercent:
    number | null;

  sellFillPercent:
    number | null;

  buyVwap:
    number | null;

  sellVwap:
    number | null;

  buyLimitPrice:
    number | null;

  sellLimitPrice:
    number | null;

  combinedDepthSlippagePercent:
    number | null;

  adverseMoveReservePercentPerLeg: number;

  tradingFees:
    number | null;

  /** Present when the Tiny-LIVE caller supplied account/jurisdiction cash-cost evidence. */
  statutoryCashWithholding?:
    number | null;

  statutoryCashCostEvidenceIds?:
    readonly string[];

  safetyBuffer:
    number | null;

  postStressNetProfit:
    number | null;

  postStressNetProfitPercent:
    number | null;

  minimumNetProfitPercent: number;

  reasons: readonly string[];

  paperOnly: true;

  liveExecutionAllowed: false;

  orderSubmissionAllowed: false;
}

const DEFAULT_STRESS_GATE_CONFIG:
  StrategyOnePaperStressGateConfig = {
  minimumNetProfitPercent:
    PROFIT_TIER_POLICY
      .qualificationMinimumNetProfitPercent,
  safetyBufferPercent:
    defaultExecutableProfitConfig
      .safetyBufferPercent,
  adverseMoveReservePercentPerLeg:
    defaultPaperExecutionConfig
      .simulatedSlippagePercent,
};

const DEFAULT_STRESS_GATE_DEPENDENCIES:
  StrategyOnePaperStressGateDependencies = {
  getOrderBook:
    (
      exchange,
      market,
    ) =>
      orderBookService.get(
        exchange,
        market,
      ),
  getTakerFeePercent:
    getExchangeTakerFeePercent,
  getMaximumQuoteAgeMs:
    (exchange) =>
      freshnessIntegrityService
        .getMaximumQuoteAgeMs(
          exchange,
        ),
  getMaximumPairSkewMs:
    (
      buyExchange,
      sellExchange,
    ) =>
      freshnessIntegrityService
        .getMaximumPairSkewMs(
          buyExchange,
          sellExchange,
        ),
};

/**
 * Final Strategy #1 PAPER economics boundary.  It walks both current books
 * for the funded quantity, reserves one more adverse move on each leg, then
 * requires the configured net edge after fees and the safety buffer.
 */
export class StrategyOnePaperStressGate {
  private readonly config:
    StrategyOnePaperStressGateConfig;

  private readonly dependencies:
    StrategyOnePaperStressGateDependencies;

  constructor(
    dependencies:
      Partial<StrategyOnePaperStressGateDependencies> = {},
    config:
      Partial<StrategyOnePaperStressGateConfig> = {},
  ) {
    this.dependencies = {
      ...DEFAULT_STRESS_GATE_DEPENDENCIES,
      ...dependencies,
    };

    this.config = {
      ...DEFAULT_STRESS_GATE_CONFIG,
      ...config,
    };

    for (
      const [
        name,
        value,
      ] of Object.entries(
        this.config,
      )
    ) {
      if (
        !Number.isFinite(
          value,
        ) ||
        value < 0
      ) {
        throw new Error(
          `Strategy #1 PAPER stress ${name} must be a non-negative finite number.`,
        );
      }
    }
  }

  evaluate(input: {
    opportunity:
      ArbitrageOpportunity;
    quantity: number;
    now?: number;
    liveCashCosts?: {
      readonly buyTradingFeeSurchargeMultiplier: number;
      readonly sellTradingFeeSurchargeMultiplier: number;
      readonly buyWithholdingPercent: number;
      readonly sellWithholdingPercent: number;
      readonly evidenceIds: readonly string[];
    };
  }): StrategyOnePaperStressGateReport {
    const now =
      input.now ??
      Date.now();

    const opportunity =
      input.opportunity;

    const quantity =
      input.quantity;

    const reasons:
      string[] = [];

    if (
      !Number.isSafeInteger(
        now,
      ) ||
      now <= 0
    ) {
      throw new Error(
        "Strategy #1 PAPER stress evaluation time must be a positive safe integer.",
      );
    }

    if (
      !Number.isFinite(
        quantity,
      ) ||
      quantity <= 0
    ) {
      reasons.push(
        "Final PAPER stress quantity must be positive.",
      );
    }

    const market =
      opportunity.pair.market
        .trim()
        .toUpperCase();

    const buyExchange =
      opportunity.pair.buy.exchange
        .trim()
        .toLowerCase();

    const sellExchange =
      opportunity.pair.sell.exchange
        .trim()
        .toLowerCase();

    const sourceOpportunityAgeMs =
      Number.isSafeInteger(
        opportunity.timestamp,
      )
        ? now -
          opportunity.timestamp
        : null;

    if (
      sourceOpportunityAgeMs ===
        null ||
      sourceOpportunityAgeMs < 0
    ) {
      reasons.push(
        "Source opportunity timestamp is unavailable or in the future.",
      );
    }

    const buyBook =
      this.dependencies
        .getOrderBook(
          buyExchange,
          market,
        );

    const sellBook =
      this.dependencies
        .getOrderBook(
          sellExchange,
          market,
        );

    if (!buyBook) {
      reasons.push(
        `Final PAPER BUY book is unavailable for ${buyExchange}:${market}.`,
      );
    }

    if (!sellBook) {
      reasons.push(
        `Final PAPER SELL book is unavailable for ${sellExchange}:${market}.`,
      );
    }

    const buyBookTimestamp =
      buyBook?.timestamp ??
      null;

    const sellBookTimestamp =
      sellBook?.timestamp ??
      null;

    const timestampSkewMs =
      buyBook &&
      sellBook
        ? Math.abs(
            buyBook.timestamp -
              sellBook.timestamp,
          )
        : null;

    const exactPilotRoute =
      isExactStrategyOnePilotRoute({
        buyExchange,
        sellExchange,
      });

    if (buyBook) {
      this.validateBookFreshness(
        "BUY",
        buyExchange,
        buyBook.timestamp,
        now,
        reasons,
        exactPilotRoute,
      );
    }

    if (sellBook) {
      this.validateBookFreshness(
        "SELL",
        sellExchange,
        sellBook.timestamp,
        now,
        reasons,
        exactPilotRoute,
      );
    }

    if (
      timestampSkewMs !==
        null &&
      timestampSkewMs >
        (
          exactPilotRoute
            ? Math.min(
                STRATEGY_ONE_PILOT_MAXIMUM_BOOK_SKEW_MS,
                this.dependencies.getMaximumPairSkewMs(buyExchange, sellExchange),
              )
            : this.dependencies.getMaximumPairSkewMs(buyExchange, sellExchange)
        )
    ) {
      reasons.push(
        `Final PAPER books are not synchronized; timestamp skew is ${timestampSkewMs} ms.`,
      );
    }

    let buyFillPercent:
      number | null =
      null;

    let sellFillPercent:
      number | null =
      null;

    let buyVwap:
      number | null =
      null;

    let sellVwap:
      number | null =
      null;

    let buyLimitPrice:
      number | null =
      null;

    let sellLimitPrice:
      number | null =
      null;

    let combinedDepthSlippagePercent:
      number | null =
      null;

    let tradingFees:
      number | null =
      null;

    let statutoryCashWithholding:
      number | null =
      null;

    let safetyBuffer:
      number | null =
      null;

    let postStressNetProfit:
      number | null =
      null;

    let postStressNetProfitPercent:
      number | null =
      null;

    if (
      buyBook &&
      sellBook &&
      Number.isFinite(
        quantity,
      ) &&
      quantity > 0
    ) {
      try {
        const buyWalk =
          vwapCalculator.calculate(
            buyBook.asks,
            quantity,
          );

        const sellWalk =
          vwapCalculator.calculate(
            sellBook.bids,
            quantity,
          );

        buyFillPercent =
          buyWalk.fillPercent;

        sellFillPercent =
          sellWalk.fillPercent;

        buyVwap =
          buyWalk.averagePrice;

        sellVwap =
          sellWalk.averagePrice;

        buyLimitPrice =
          this.resolveWorstConsumedPrice(
            buyBook.asks,
            quantity,
          );

        sellLimitPrice =
          this.resolveWorstConsumedPrice(
            sellBook.bids,
            quantity,
          );

        const quantityTolerance =
          Math.max(
            1e-12,
            quantity *
              1e-9,
          );

        if (
          buyWalk.filledQuantity <
            quantity -
              quantityTolerance
        ) {
          reasons.push(
            `Final PAPER BUY depth is partial (${buyWalk.fillPercent.toFixed(2)}%).`,
          );
        }

        if (
          sellWalk.filledQuantity <
            quantity -
              quantityTolerance
        ) {
          reasons.push(
            `Final PAPER SELL depth is partial (${sellWalk.fillPercent.toFixed(2)}%).`,
          );
        }

        const bestAsk =
          buyBook.asks[0]
            ?.price;

        const bestBid =
          sellBook.bids[0]
            ?.price;

        if (
          !Number.isFinite(
            bestAsk,
          ) ||
          !Number.isFinite(
            bestBid,
          ) ||
          !bestAsk ||
          !bestBid ||
          bestAsk <= 0 ||
          bestBid <= 0 ||
          buyVwap <= 0 ||
          sellVwap <= 0
        ) {
          reasons.push(
            "Final PAPER best-price or VWAP evidence is invalid.",
          );
        } else {
          const buyDepthSlippagePercent =
            Math.max(
              0,
              (
                (
                  buyVwap -
                  bestAsk
                ) /
                bestAsk
              ) *
                100,
            );

          const sellDepthSlippagePercent =
            Math.max(
              0,
              (
                (
                  bestBid -
                  sellVwap
                ) /
                bestBid
              ) *
                100,
            );

          combinedDepthSlippagePercent =
            buyDepthSlippagePercent +
            sellDepthSlippagePercent;

          const buyFeePercent =
            this.dependencies
              .getTakerFeePercent(
                buyExchange,
                market,
                now,
              );

          const sellFeePercent =
            this.dependencies
              .getTakerFeePercent(
                sellExchange,
                market,
                now,
              );

          if (
            buyFeePercent ===
              null ||
            sellFeePercent ===
              null ||
            !Number.isFinite(
              buyFeePercent,
            ) ||
            !Number.isFinite(
              sellFeePercent,
            ) ||
            buyFeePercent < 0 ||
            sellFeePercent < 0
          ) {
            reasons.push(
              "Final PAPER taker-fee evidence is unavailable or invalid.",
            );
          } else {
            const adverseRatio =
              this.config
                .adverseMoveReservePercentPerLeg /
              100;

            const stressedBuyNotional =
              buyWalk.totalCost *
              (
                1 +
                adverseRatio
              );

            const stressedSellNotional =
              sellWalk.totalCost *
              (
                1 -
                adverseRatio
              );

            const liveCashCosts =
              input.liveCashCosts;

            const buyFeeSurchargeMultiplier =
              liveCashCosts?.buyTradingFeeSurchargeMultiplier ?? 0;

            const sellFeeSurchargeMultiplier =
              liveCashCosts?.sellTradingFeeSurchargeMultiplier ?? 0;

            const buyWithholdingPercent =
              liveCashCosts?.buyWithholdingPercent ?? 0;

            const sellWithholdingPercent =
              liveCashCosts?.sellWithholdingPercent ?? 0;

            const cashCostValues = [
              buyFeeSurchargeMultiplier,
              sellFeeSurchargeMultiplier,
              buyWithholdingPercent,
              sellWithholdingPercent,
            ];

            if (cashCostValues.some((value) => !Number.isFinite(value) || value < 0)) {
              reasons.push(
                "Tiny-LIVE statutory cash-cost evidence is invalid.",
              );
            } else {
              tradingFees =
                stressedBuyNotional *
                  (
                    buyFeePercent /
                    100
                  ) *
                  (1 + buyFeeSurchargeMultiplier) +
                stressedSellNotional *
                  (
                    sellFeePercent /
                    100
                  ) *
                  (1 + sellFeeSurchargeMultiplier);

              statutoryCashWithholding =
                stressedBuyNotional *
                  (buyWithholdingPercent / 100) +
                stressedSellNotional *
                  (sellWithholdingPercent / 100);
            }

            safetyBuffer =
              stressedBuyNotional *
              (
                this.config
                  .safetyBufferPercent /
                100
              );

            if (tradingFees !== null && statutoryCashWithholding !== null) {
              postStressNetProfit =
                stressedSellNotional -
                stressedBuyNotional -
                tradingFees -
                statutoryCashWithholding -
                safetyBuffer;
            }

            postStressNetProfitPercent =
              stressedBuyNotional > 0 &&
              postStressNetProfit !== null
                ? (
                    postStressNetProfit /
                    stressedBuyNotional
                  ) *
                  100
                : null;

            if (
              postStressNetProfitPercent ===
                null ||
              !Number.isFinite(
                postStressNetProfitPercent,
              ) ||
              postStressNetProfitPercent +
                1e-12 <
                this.config
                  .minimumNetProfitPercent
            ) {
              reasons.push(
                `Post-stress ${input.liveCashCosts ? "Tiny-LIVE cash" : "PAPER"} net ${postStressNetProfitPercent === null || !Number.isFinite(postStressNetProfitPercent) ? "invalid" : `${postStressNetProfitPercent.toFixed(4)}%`} is below minimum ${this.config.minimumNetProfitPercent.toFixed(4)}%.`,
              );
            }
          }
        }
      } catch (
        error:
          unknown
      ) {
        reasons.push(
          error instanceof Error
            ? `Final PAPER depth walk failed: ${error.message}`
            : "Final PAPER depth walk failed.",
        );
      }
    }

    const passed =
      reasons.length ===
        0 &&
      buyVwap !==
        null &&
      sellVwap !==
        null &&
      buyLimitPrice !==
        null &&
      sellLimitPrice !==
        null &&
      tradingFees !==
        null &&
      safetyBuffer !==
        null &&
      postStressNetProfit !==
        null &&
      postStressNetProfitPercent !==
        null;

    return {
      status:
        passed
          ? "PASSED"
          : "BLOCKED",
      evaluatedAt:
        now,
      sourceOpportunityAgeMs,
      buyBookTimestamp,
      sellBookTimestamp,
      timestampSkewMs,
      quantity,
      buyFillPercent,
      sellFillPercent,
      buyVwap,
      sellVwap,
      buyLimitPrice,
      sellLimitPrice,
      combinedDepthSlippagePercent,
      adverseMoveReservePercentPerLeg:
        this.config
          .adverseMoveReservePercentPerLeg,
      tradingFees,
      statutoryCashWithholding,
      statutoryCashCostEvidenceIds:
        input.liveCashCosts?.evidenceIds,
      safetyBuffer,
      postStressNetProfit,
      postStressNetProfitPercent,
      minimumNetProfitPercent:
        this.config
          .minimumNetProfitPercent,
      reasons:
        passed
          ? [
              `Fresh two-book VWAP remains ${(postStressNetProfitPercent ?? 0).toFixed(4)}% net after ${input.liveCashCosts ? "fees, statutory cash withholding" : "fees"}, adverse-move reserve, and safety buffer.`,
            ]
          : [
              ...new Set(
                reasons,
              ),
            ],
      paperOnly:
        true,
      liveExecutionAllowed:
        false,
      orderSubmissionAllowed:
        false,
    };
  }

  private validateBookFreshness(
    side:
      "BUY" |
      "SELL",
    exchange:
      string,
    timestamp:
      number,
    now:
      number,
    reasons:
      string[],
    exactPilotRoute:
      boolean,
  ): void {
    const ageMs =
      now -
      timestamp;

    const configuredMaximumAgeMs =
      this.dependencies.getMaximumQuoteAgeMs(exchange);

    const maximumAgeMs = exactPilotRoute
      ? Math.min(
          STRATEGY_ONE_PILOT_DISPATCH_RESERVED_MAXIMUM_BOOK_AGE_MS,
          configuredMaximumAgeMs,
        )
      : configuredMaximumAgeMs;

    if (
      !Number.isFinite(
        timestamp,
      ) ||
      timestamp <= 0 ||
      ageMs < 0 ||
      ageMs >
        maximumAgeMs
    ) {
      reasons.push(
        `Final PAPER ${side} book is stale or timestamp-invalid (age ${ageMs} ms, maximum ${maximumAgeMs} ms).`,
      );
    }
  }

  private resolveWorstConsumedPrice(
    levels:
      readonly {
        price: number;
        quantity: number;
      }[],
    requestedQuantity:
      number,
  ): number | null {
    let remaining =
      requestedQuantity;

    let worstPrice:
      number | null =
      null;

    for (const level of levels) {
      if (remaining <= 0) {
        break;
      }

      if (
        !Number.isFinite(
          level.price,
        ) ||
        !Number.isFinite(
          level.quantity,
        ) ||
        level.price <= 0 ||
        level.quantity <= 0
      ) {
        throw new Error(
          "Depth contains a non-positive or non-finite level.",
        );
      }

      const filled =
        Math.min(
          remaining,
          level.quantity,
        );

      if (filled > 0) {
        worstPrice =
          level.price;

        remaining -=
          filled;
      }
    }

    return remaining <=
      Math.max(
        1e-12,
        requestedQuantity *
          1e-9,
      )
      ? worstPrice
      : null;
  }
}

export const strategyOnePaperStressGate =
  new StrategyOnePaperStressGate();

export class AutomatedPaperTradingService {
  async execute(
    request:
      AutomatedPaperTradeRequest,
  ): Promise<AutomatedPaperTradeResponse> {
    const {
      opportunity,
      requestedCapital,
    } = request;

    const strategyAttribution =
      normalizeStrategyAttribution(
        request.strategyAttribution,
      );

    const pendingReplay =
      paperExecutionAccountingService
        .replayPending();

    if (
      pendingReplay
        .remainingPending >
      0
    ) {
      return {
        approved:
          false,

        result:
          null,

        lifecycle:
          null,

        quantityNormalization:
          null,

        reasons: [
          "A previous settled PAPER execution is still pending durable accounting replay.",
          ...pendingReplay.errors,
          "New PAPER execution is blocked until pending journal evidence is reconciled.",
        ],
      };
    }

    /*
     * Profit-credibility boundary.
     *
     * A fresh, quantity-bearing book can still be economically invalid when
     * one venue publishes a mismatched or isolated market price. Re-bind the
     * candidate to current executable books and cross-venue consensus before
     * account evaluation, reservation, planning, or simulated fills.
     */
    const priceCredibility =
      crossVenuePriceCredibilityService
        .evaluate({
          market:
            opportunity.pair.market,

          buyExchange:
            opportunity.pair.buy.exchange,

          sellExchange:
            opportunity.pair.sell.exchange,

          buyPrice:
            opportunity.buyPrice,

          sellPrice:
            opportunity.sellPrice,
        });

    if (
      !priceCredibility
        .acceptable
    ) {
      return {
        approved:
          false,

        result:
          null,

        lifecycle:
          null,

        quantityNormalization:
          null,

        reasons: [
          "PAPER execution blocked by the cross-venue price-credibility guard.",
          ...priceCredibility
            .reasons,
        ],
      };
    }

    const profitAdmission =
      postGuardProfitValidationLedgerService
        .evaluateAdmission({
          market:
            opportunity.pair.market,
          buyExchange:
            opportunity.pair.buy.exchange,
          sellExchange:
            opportunity.pair.sell.exchange,
        });

    if (
      !profitAdmission.allowed
    ) {
      return {
        approved:
          false,
        result:
          null,
        lifecycle:
          null,
        quantityNormalization:
          null,
        reasons: [
          "PAPER execution blocked by the post-guard profitability ledger.",
          ...profitAdmission.reasons,
        ],
      };
    }

    const accountCheck =
      tradingAccountService
        .evaluateTrade(
          requestedCapital,
        );

    if (!accountCheck.approved) {
      return {
        approved:
          false,
        result:
          null,
        lifecycle:
          null,
        quantityNormalization:
          null,
        reasons:
          accountCheck.reasons,
      };
    }

    const capitalConversion =
      this.resolveCapitalConversion(
        opportunity,
        requestedCapital,
      );

    if (!capitalConversion) {
      return {
        approved:
          false,
        result:
          null,
        lifecycle:
          null,
        quantityNormalization:
          null,
        reasons: [
          "PAPER execution blocked because fresh executable INR/market-quote conversion evidence is unavailable.",
        ],
      };
    }

    /*
     * Account validation,
     * executable-profit validation,
     * simulation and risk assessment
     * remain owned by TradingOrchestrator.
     */
    const decision =
      tradingOrchestrator.evaluate(
        opportunity,
        capitalConversion
          .inrToQuote
          .targetQuantity,
        requestedCapital,
        {
          ...defaultExecutableProfitConfig,
          minimumProfitPercent:
            PROFIT_TIER_POLICY
              .qualificationMinimumNetProfitPercent,
        },
      );

    if (
      !decision.approved
    ) {
      return {
        approved:
          false,

        result:
          null,

        lifecycle:
          null,

        quantityNormalization:
          null,

        reasons:
          decision.reasons,
      };
    }

    const funding =
      strategyOneFundedRouteService
        .evaluate({
          opportunity,
          requestedCapitalInr:
            requestedCapital,
          requestedQuoteCapital:
            decision.allocatedCapital,
          requestedQuantity:
            decision.allocatedCapital /
            opportunity.buyPrice,

          fundingBoundary:
            "ISOLATED_PAPER",
        });

    const quantityNormalization =
      funding.quantityNormalization;

    if (
      funding.state ===
        "BLOCKED" ||
      funding.executableQuantity ===
        null ||
      quantityNormalization ===
        null
    ) {
      return {
        approved:
          false,

        result:
          null,

        lifecycle:
          null,

        quantityNormalization,

        funding,

        reasons: [
          "Strategy #1 PAPER execution failed the isolated PAPER capital/depth/rules boundary.",
          ...funding.blockers,
        ],
      };
    }

    const executableQuantity =
      funding.executableQuantity;

    const quantityEvidenceReason =
      quantityNormalization
        .paperOnlyFallbackUsed
        ? `PAPER-only funding ${funding.state.toLowerCase()}: capital quantity ${funding.capitalQuantity}, depth cap ${funding.depthQuantity}, funded executable ${executableQuantity}, conservative known-leg increment ${quantityNormalization.commonQuantityIncrement}. The unpublished venue increment remains blocked for LIVE orders.`
        : `PAPER funding ${funding.state.toLowerCase()}: capital quantity ${funding.capitalQuantity}, depth cap ${funding.depthQuantity}, funded executable ${executableQuantity}, shared increment ${quantityNormalization.commonQuantityIncrement}.`;

    const stressGate =
      strategyOnePaperStressGate
        .evaluate({
          opportunity,
          quantity:
            executableQuantity,
        });

    if (
      stressGate.status ===
        "BLOCKED" ||
      stressGate.buyVwap ===
        null ||
      stressGate.sellVwap ===
        null ||
      stressGate.buyLimitPrice ===
        null ||
      stressGate.sellLimitPrice ===
        null ||
      stressGate.combinedDepthSlippagePercent ===
        null ||
      stressGate.tradingFees ===
        null
    ) {
      return {
        approved:
          false,

        result:
          null,

        lifecycle:
          null,

        quantityNormalization,

        funding,

        stressGate,

        reasons: [
          quantityEvidenceReason,
          "Strategy #1 PAPER execution failed the final fresh-depth stress boundary.",
          ...stressGate.reasons,
        ],
      };
    }

    const plan =
      executionPlanner.createPlan({
        decision,

        market:
          opportunity.pair.market,

        buyExchange:
          opportunity.pair.buy.exchange,

        sellExchange:
          opportunity.pair.sell.exchange,

        buyPrice:
          stressGate
            .buyLimitPrice,

        sellPrice:
          stressGate
            .sellLimitPrice,

        quantity:
          executableQuantity,

        mode:
          "PAPER",

        strategy:
          "PARALLEL",

        expectedFees:
          stressGate
            .tradingFees,

        expectedSlippagePercent:
          stressGate
            .combinedDepthSlippagePercent +
          stressGate
            .adverseMoveReservePercentPerLeg *
            2,

        reservationCapital:
          requestedCapital,

        quoteToAccountConversionRate:
          capitalConversion
            .quoteToInrRate,

        quoteAsset:
          capitalConversion
            .quoteAsset,

        opportunityTimestamp:
          Math.min(
            stressGate
              .buyBookTimestamp ??
              opportunity.timestamp,
            stressGate
              .sellBookTimestamp ??
              opportunity.timestamp,
          ),
      });

    /*
     * Production safety gate.
     */
    const planValidation =
      await executionPlanValidator
        .validate(
          plan,
          {
            validationMode:
              "ISOLATED_PAPER_SIMULATION",
          },
        );

    if (
      !planValidation.valid
    ) {
      return {
        approved:
          false,

        result:
          null,

        lifecycle:
          null,

        quantityNormalization,

        funding,

        stressGate,

        reasons:
          planValidation.reasons.length >
          0
            ? [
                quantityEvidenceReason,
                ...planValidation.reasons,
              ]
            : [
                quantityEvidenceReason,
                "Execution plan validation failed.",
              ],
      };
    }

    try {
      const rawLifecycle =
        paperTwoLegExecutionLifecycleService
          .execute(
            plan,
            strategyAttribution,
            {
              simulatedSlippagePercent:
                0,
              buy: {
                averageFillPrice:
                  stressGate
                    .buyVwap,
              },
              sell: {
                averageFillPrice:
                  stressGate
                    .sellVwap,
              },
            },
          );

      const lifecycle:
        PaperTwoLegExecutionLifecycleResult = {
        ...rawLifecycle,
        result: {
          ...this.normalizeResultToInr(
            rawLifecycle.result,
            capitalConversion,
            requestedCapital,
          ),
          priceCredibility:
            this.toPersistentPriceCredibility(
              priceCredibility,
            ),
          paperExecutionStress:
            this.toPersistentStressEvidence(
              stressGate,
            ),
        },
      };

      const result =
        lifecycle.result;

      if (
        lifecycle.status !==
          "COMPLETED" ||
        !result.successful
      ) {
        try {
          paperExecutionAccountingService
            .recordFailedLifecycle(
              lifecycle,
            );
        } catch (
          journalError:
            unknown
        ) {
          return {
            approved:
              false,

            result,

            lifecycle,

            quantityNormalization,

            funding,

            stressGate,

            reasons: [
              ...decision.reasons,
              quantityEvidenceReason,
              ...lifecycle.reasons,
              journalError instanceof Error
                ? journalError.message
                : "Incomplete PAPER lifecycle journal persistence failed.",
              "No realized P&L was booked.",
            ],
          };
        }

        return {
          approved:
            false,

          result,

          lifecycle,

          quantityNormalization,

          funding,

          stressGate,

          reasons: [
            ...decision.reasons,
            quantityEvidenceReason,
            ...lifecycle.reasons,
            lifecycle.recovery
              .requiresRecovery
              ? "Residual PAPER exposure was handed to the shared ExecutionRecoveryEngine."
              : "PAPER execution remained incomplete and was not settled as a completed trade.",
            "No realized P&L was booked for the incomplete execution.",
          ],
        };
      }

      try {
        paperExecutionAccountingService
          .settleLifecycle(
            lifecycle,
          );
      } catch (
        accountingError:
          unknown
      ) {
        return {
          approved:
            false,

          result,

          lifecycle,

          quantityNormalization,

          funding,

          stressGate,

          reasons: [
            ...decision.reasons,
            quantityEvidenceReason,
            accountingError instanceof Error
              ? accountingError.message
              : "Settled PAPER accounting commit failed.",
            "The settled lifecycle remains in the durable PAPER journal for idempotent replay.",
            "No new PAPER execution will be admitted while replay remains pending.",
          ],
        };
      }

      return {
        approved:
          true,

        result,

        lifecycle,

        quantityNormalization,

        funding,

        stressGate,

        reasons: [
          ...decision.reasons,
          quantityEvidenceReason,
          "Execution plan passed isolated PAPER capability safety validation; no LIVE-order rule approval was inferred.",
          `Fresh exact-quantity depth passed the ${stressGate.minimumNetProfitPercent.toFixed(4)}% post-stress net boundary at ${stressGate.postStressNetProfitPercent?.toFixed(4)}%.`,
          "Both PAPER legs passed lifecycle, fill, recovery, reconciliation, and settlement checks.",
          "Coordinator-owned capital reservation committed successfully.",
          `PAPER accounting normalized ${capitalConversion.inrToQuote.targetQuantity.toFixed(8)} ${capitalConversion.quoteAsset} execution capital to the ₹${requestedCapital.toFixed(2)} account reservation.`,
          "PaperTrade, per-venue inventory, and account P&L committed through one restart-safe journal transaction.",
        ],
      };
    } catch (
      error: unknown
    ) {
      return {
        approved:
          false,

        result:
          null,

        lifecycle:
          null,

        quantityNormalization,

        funding,

        stressGate,

        reasons: [
          error instanceof Error
            ? error.message
            : "Unknown paper execution error.",
        ],
      };
    }
  }

  private resolveCapitalConversion(
    opportunity:
      ArbitrageOpportunity,

    requestedCapitalInr:
      number,
  ): {
    quoteAsset: string;
    quoteToInrRate: number;
    inrToQuote: CentralPaperAssetConversionEvidence;
    quoteToInr: CentralPaperAssetConversionEvidence;
  } | null {
    const quoteAsset =
      opportunity.quoteAsset
        ?.trim()
        .toUpperCase();

    if (!quoteAsset) {
      return null;
    }

    const now =
      Date.now();

    const context =
      `strategy-one-paper:${opportunity.id}:${now}`;

    const inrToQuote =
      centralPaperCapitalValuationService
        .convertInrToAsset(
          quoteAsset,
          requestedCapitalInr,
          `${context}:inr-to-quote`,
          now,
        );

    const quoteToInr =
      centralPaperCapitalValuationService
        .convertAssetToInr(
          quoteAsset,
          1,
          `${context}:quote-to-inr`,
          now,
        );

    if (
      !inrToQuote ||
      !quoteToInr ||
      !Number.isFinite(
        inrToQuote.targetQuantity,
      ) ||
      inrToQuote.targetQuantity <=
        0 ||
      !Number.isFinite(
        quoteToInr.targetQuantity,
      ) ||
      quoteToInr.targetQuantity <=
        0
    ) {
      return null;
    }

    return {
      quoteAsset,
      quoteToInrRate:
        quoteToInr.targetQuantity,
      inrToQuote,
      quoteToInr,
    };
  }

  private normalizeResultToInr(
    result:
      ExecutionResult,

    conversion: {
      quoteAsset: string;
      quoteToInrRate: number;
      inrToQuote: CentralPaperAssetConversionEvidence;
      quoteToInr: CentralPaperAssetConversionEvidence;
    },

    requestedCapitalInr:
      number,
  ): ExecutionResult {
    const rate =
      conversion.quoteToInrRate;

    const evidence:
      PaperCapitalConversionEvidence = {
      schemaVersion:
        1,
      accountCurrency:
        "INR",
      marketQuoteAsset:
        conversion.quoteAsset,
      requestedCapitalInr,
      allocatedQuoteCapital:
        conversion.inrToQuote.targetQuantity,
      quoteToInrRate:
        rate,
      inrToQuoteEvidenceId:
        conversion.inrToQuote.id,
      quoteToInrEvidenceId:
        conversion.quoteToInr.id,
      generatedAt:
        Math.max(
          conversion.inrToQuote.generatedAt,
          conversion.quoteToInr.generatedAt,
        ),
      expiresAt:
        Math.min(
          conversion.inrToQuote.expiresAt,
          conversion.quoteToInr.expiresAt,
        ),
    };

    return {
      ...result,
      capitalConversion:
        evidence,
      quoteCapitalUsed:
        result.capitalUsed,
      quoteGrossProfit:
        result.grossProfit,
      quoteTotalFees:
        result.totalFees,
      quoteNetProfit:
        result.netProfit,
      quoteTdsWithheld:
        result.tdsWithheld ??
        0,
      quoteDeployableCashProfit:
        result.deployableCashProfit ??
        result.netProfit,
      capitalUsed:
        result.capitalUsed *
        rate,
      grossProfit:
        result.grossProfit *
        rate,
      totalFees:
        result.totalFees *
        rate,
      netProfit:
        result.netProfit *
        rate,
      tdsWithheld:
        (
          result.tdsWithheld ??
          0
        ) *
        rate,
      deployableCashProfit:
        (
          result.deployableCashProfit ??
          result.netProfit
        ) *
        rate,
    };
  }

  private toPersistentStressEvidence(
    report:
      StrategyOnePaperStressGateReport,
  ): PaperExecutionStressEvidence {
    const {
      sourceOpportunityAgeMs,
      buyBookTimestamp,
      sellBookTimestamp,
      timestampSkewMs,
      buyFillPercent,
      sellFillPercent,
      buyVwap,
      sellVwap,
      buyLimitPrice,
      sellLimitPrice,
      combinedDepthSlippagePercent,
      tradingFees,
      safetyBuffer,
      postStressNetProfit,
      postStressNetProfitPercent,
    } = report;

    if (
      report.status !==
        "PASSED" ||
      sourceOpportunityAgeMs ===
        null ||
      sourceOpportunityAgeMs < 0 ||
      buyBookTimestamp ===
        null ||
      sellBookTimestamp ===
        null ||
      timestampSkewMs ===
        null ||
      buyFillPercent ===
        null ||
      sellFillPercent ===
        null ||
      buyVwap ===
        null ||
      sellVwap ===
        null ||
      buyLimitPrice ===
        null ||
      sellLimitPrice ===
        null ||
      combinedDepthSlippagePercent ===
        null ||
      tradingFees ===
        null ||
      safetyBuffer ===
        null ||
      postStressNetProfit ===
        null ||
      postStressNetProfitPercent ===
        null ||
      ![
        sourceOpportunityAgeMs,
        buyBookTimestamp,
        sellBookTimestamp,
        timestampSkewMs,
        report.quantity,
        buyFillPercent,
        sellFillPercent,
        buyVwap,
        sellVwap,
        buyLimitPrice,
        sellLimitPrice,
        combinedDepthSlippagePercent,
        report.adverseMoveReservePercentPerLeg,
        tradingFees,
        safetyBuffer,
        postStressNetProfit,
        postStressNetProfitPercent,
        report.minimumNetProfitPercent,
      ].every(
        Number.isFinite,
      )
    ) {
      throw new Error(
        "Only passed, complete Strategy #1 PAPER stress evidence can enter settlement.",
      );
    }

    return {
      schemaVersion:
        1,
      guard:
        "STRATEGY_ONE_PAPER_STRESS_V1",
      outcome:
        "PASSED",
      evaluatedAt:
        report.evaluatedAt,
      sourceOpportunityAgeMs,
      buyBookTimestamp,
      sellBookTimestamp,
      timestampSkewMs,
      quantity:
        report.quantity,
      buyFillPercent,
      sellFillPercent,
      buyVwap,
      sellVwap,
      buyLimitPrice,
      sellLimitPrice,
      combinedDepthSlippagePercent,
      adverseMoveReservePercentPerLeg:
        report.adverseMoveReservePercentPerLeg,
      tradingFees,
      safetyBuffer,
      postStressNetProfit,
      postStressNetProfitPercent,
      minimumNetProfitPercent:
        report.minimumNetProfitPercent,
      reasons: [
        ...report.reasons,
      ],
      paperOnly:
        true,
      liveExecutionAllowed:
        false,
      orderSubmissionAllowed:
        false,
    };
  }

  private toPersistentPriceCredibility(
    report:
      CrossVenuePriceCredibilityReport,
  ): PaperPriceCredibilityEvidence {
    if (
      !report.acceptable ||
      report.candidatePriceRatio ===
        null ||
      report.currentPriceRatio ===
        null
    ) {
      throw new Error(
        "Only passed, complete price-credibility evidence can enter PAPER settlement.",
      );
    }

    return {
      schemaVersion:
        1,
      guard:
        "CROSS_VENUE_PRICE_CREDIBILITY_V1",
      outcome:
        "PASSED",
      evaluatedAt:
        report.evaluatedAt,
      market:
        report.market,
      buyExchange:
        report.buyExchange,
      sellExchange:
        report.sellExchange,
      freshVenueCount:
        report.freshVenueCount,
      freshVenues: [
        ...report.freshVenues,
      ],
      candidatePriceRatio:
        report.candidatePriceRatio,
      currentPriceRatio:
        report.currentPriceRatio,
      medianMidPrice:
        report.medianMidPrice,
      buyDeviationFromMedianPercent:
        report.buyDeviationFromMedianPercent,
      sellDeviationFromMedianPercent:
        report.sellDeviationFromMedianPercent,
      maximumPriceRatio:
        report.maximumPriceRatio,
      maximumCandidatePriceDriftPercent:
        report.maximumCandidatePriceDriftPercent,
      maximumConsensusDeviationPercent:
        report.maximumConsensusDeviationPercent,
      reasons: [
        ...report.reasons,
      ],
    };
  }
}

export const automatedPaperTradingService =
  new AutomatedPaperTradingService();
