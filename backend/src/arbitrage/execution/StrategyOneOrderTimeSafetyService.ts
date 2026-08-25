import {
  getExchangeTakerFeePercent,
} from "../config/fees";

import {
  performance,
} from "node:perf_hooks";

import type {
  ArbitrageOpportunity,
} from "../models/ArbitrageOpportunity";

import type {
  OrderBook,
} from "../../orderbook/models/OrderBook";

import {
  vwapCalculator,
} from "../../orderbook/calculators/VWAPCalculator";

import {
  orderBookService,
} from "../../orderbook/services/OrderBookService";

import {
  strategyOneExecutionPolicyService,
} from "../../trading/policy/StrategyOneExecutionPolicyService";

import {
  strategyOneLiveVenueContractRegistry,
  type StrategyOneTimeInForce,
  type StrategyOneVenueOrderContract,
} from "../../execution/live/contracts/StrategyOneLiveVenueContractRegistry";
import {
  STRATEGY_ONE_PILOT_MAXIMUM_BOOK_AGE_MS,
} from "./StrategyOnePilotEquivalentPaperEvidenceService";

export type {
  StrategyOneTimeInForce,
  StrategyOneVenueOrderContract,
} from "../../execution/live/contracts/StrategyOneLiveVenueContractRegistry";

export interface StrategyOneOrderTimeSafetyDependencies {
  getOrderBook(
    exchange: string,
    market: string,
  ): OrderBook | null;

  getTakerFeePercent(
    exchange: string,
    market: string,
    now: number,
  ): number | null;

  getVenueContract(
    exchange: string,
    route: {
      readonly market: string;
      readonly buyExchange: string;
      readonly sellExchange: string;
    },
    now: number,
    authorizedMaximumBookAgeMs?: number,
  ): StrategyOneVenueOrderContract | null;

  getMonotonicTimeMs(): number;
}

export interface StrategyOneOrderTimeSafetyConfig {
  readonly maximumBookTimestampSkewMs: number;
  readonly maximumEvaluationDurationMs: number;
  readonly requiredTimeInForce: StrategyOneTimeInForce;
}

export interface StrategyOneOrderTimeSafetyReport {
  readonly schemaVersion: "103.0";
  readonly decision:
    | "APPROVED"
    | "BLOCKED";
  readonly decisionId: string;
  readonly evaluatedAt: number;
  readonly evaluationDurationMs: number;
  readonly opportunityId: string;
  readonly opportunityAgeMs:
    | number
    | null;
  readonly market: string;
  readonly buyExchange: string;
  readonly sellExchange: string;
  readonly quantity: number;
  readonly buyBookTimestamp:
    | number
    | null;
  readonly sellBookTimestamp:
    | number
    | null;
  readonly buyBookAgeMs:
    | number
    | null;
  readonly sellBookAgeMs:
    | number
    | null;
  readonly bookTimestampSkewMs:
    | number
    | null;
  readonly buyVwap:
    | number
    | null;
  readonly sellVwap:
    | number
    | null;
  readonly buyLimitPrice:
    | number
    | null;
  readonly sellLimitPrice:
    | number
    | null;
  readonly buyFillPercent:
    | number
    | null;
  readonly sellFillPercent:
    | number
    | null;
  readonly tradingFees:
    | number
    | null;
  readonly safetyBuffer:
    | number
    | null;
  readonly postStressNetProfit:
    | number
    | null;
  readonly postStressNetProfitPercent:
    | number
    | null;
  readonly minimumNetProfitPercent: number;
  readonly selectedTimeInForce:
    | StrategyOneTimeInForce
    | null;
  readonly selectedBuyTimeInForce:
    | StrategyOneTimeInForce
    | null;
  readonly selectedSellTimeInForce:
    | StrategyOneTimeInForce
    | null;
  readonly policyId: string;
  readonly policyRevision: number;
  readonly policyHash: string;
  readonly reasons: readonly string[];
  readonly liveOrderSubmissionAuthorized: false;
  readonly automaticRecoveryOrderAuthorized: false;
}

const DEFAULT_CONFIG:
  StrategyOneOrderTimeSafetyConfig = {
  maximumBookTimestampSkewMs:
    250,
  maximumEvaluationDurationMs:
    25,
  requiredTimeInForce:
    "FOK",
};

const DEFAULT_DEPENDENCIES:
  StrategyOneOrderTimeSafetyDependencies = {
  getOrderBook:
    (exchange, market) =>
      orderBookService.get(
        exchange,
        market,
      ),
  getTakerFeePercent:
    getExchangeTakerFeePercent,
  getVenueContract:
    (exchange, route, now, authorizedMaximumBookAgeMs) =>
      authorizedMaximumBookAgeMs === undefined
        ? strategyOneLiveVenueContractRegistry
            .getOrderTimeSafetyContract(
              exchange,
              route,
              now,
            )
        : strategyOneLiveVenueContractRegistry
            .getAuthorizedOrderTimeSafetyContract(
              exchange,
              route,
              authorizedMaximumBookAgeMs,
              now,
            ),
  getMonotonicTimeMs:
    () =>
      performance.now(),
};

/**
 * Final, synchronous Strategy #1 decision immediately before adapter access.
 * It re-reads both books, walks the requested quantity, recomputes net
 * economics and requires an explicit audited FOK contract on both venues.
 * Approval is evidence only; this service never submits or authorizes orders.
 */
export class StrategyOneOrderTimeSafetyService {
  private readonly dependencies:
    StrategyOneOrderTimeSafetyDependencies;

  private readonly config:
    StrategyOneOrderTimeSafetyConfig;

  constructor(
    dependencies:
      Partial<StrategyOneOrderTimeSafetyDependencies> = {},
    config:
      Partial<StrategyOneOrderTimeSafetyConfig> = {},
  ) {
    this.dependencies = {
      ...DEFAULT_DEPENDENCIES,
      ...dependencies,
    };
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };

    if (
      !Number.isSafeInteger(
        this.config.maximumBookTimestampSkewMs,
      ) ||
      this.config.maximumBookTimestampSkewMs <=
        0 ||
      !Number.isSafeInteger(
        this.config.maximumEvaluationDurationMs,
      ) ||
      this.config.maximumEvaluationDurationMs <=
        0 ||
      (
        this.config.requiredTimeInForce !==
          "GTC" &&
        this.config.requiredTimeInForce !==
          "IOC" &&
        this.config.requiredTimeInForce !==
          "FOK"
      )
    ) {
      throw new Error(
        "Strategy #1 order-time safety configuration is invalid.",
      );
    }
  }

  evaluate(input: {
    opportunity: ArbitrageOpportunity;
    quantity: number;
    now?: number;
    authorizedMaximumBookAgeMs?: number;
  }): StrategyOneOrderTimeSafetyReport {
    const monotonicStartedAt =
      this.dependencies
        .getMonotonicTimeMs();
    const startedAt =
      input.now ??
      Date.now();

    validateTimestamp(
      startedAt,
    );

    const policy =
      strategyOneExecutionPolicyService
        .getActivePolicy();
    const opportunity =
      input.opportunity;
    const market =
      opportunity.pair.market
        .trim()
        .toUpperCase();
    const buyExchange =
      normalizeExchange(
        opportunity.pair.buy.exchange,
      );
    const sellExchange =
      normalizeExchange(
        opportunity.pair.sell.exchange,
      );
    const reasons:
      string[] = [];

    if (
      !Number.isFinite(
        input.quantity,
      ) ||
      input.quantity <= 0
    ) {
      reasons.push(
        "Order-time quantity must be a positive finite number.",
      );
    }

    if (
      input.authorizedMaximumBookAgeMs !== undefined &&
      (
        !Number.isSafeInteger(input.authorizedMaximumBookAgeMs) ||
        input.authorizedMaximumBookAgeMs <= 0 ||
        input.authorizedMaximumBookAgeMs >
          STRATEGY_ONE_PILOT_MAXIMUM_BOOK_AGE_MS
      )
    ) {
      reasons.push(
        "Authorized order-book TTL is invalid or exceeds the immutable 250 ms ceiling.",
      );
    }

    const opportunityAgeMs =
      Number.isSafeInteger(
        opportunity.timestamp,
      )
        ? startedAt -
          opportunity.timestamp
        : null;

    if (
      opportunityAgeMs ===
        null ||
      opportunityAgeMs < 0 ||
      opportunityAgeMs >
        policy.values.tinyLive
          .maximumPreviewOpportunityAgeMs
    ) {
      reasons.push(
        "Source opportunity is stale, future-dated, or timestamp-invalid at order time.",
      );
    }

    const buyContract =
      this.dependencies
        .getVenueContract(
          buyExchange,
          {
            market,
            buyExchange,
            sellExchange,
          },
          startedAt,
          input.authorizedMaximumBookAgeMs,
        );
    const sellContract =
      this.dependencies
        .getVenueContract(
          sellExchange,
          {
            market,
            buyExchange,
            sellExchange,
          },
          startedAt,
          input.authorizedMaximumBookAgeMs,
        );

    this.validateVenueContract(
      "BUY",
      buyExchange,
      buyContract,
      reasons,
    );
    this.validateVenueContract(
      "SELL",
      sellExchange,
      sellContract,
      reasons,
    );

    const requiredBuyTimeInForce =
      buyContract
        ?.requiredTimeInForce ??
      this.config
        .requiredTimeInForce;
    const requiredSellTimeInForce =
      sellContract
        ?.requiredTimeInForce ??
      this.config
        .requiredTimeInForce;
    const selectedBuyTimeInForce =
      buyContract
        ?.supportedTimeInForce
        .includes(
          requiredBuyTimeInForce,
        ) &&
      requiredBuyTimeInForce
        ? requiredBuyTimeInForce
        : null;
    const selectedSellTimeInForce =
      sellContract
        ?.supportedTimeInForce
        .includes(
          requiredSellTimeInForce,
        )
        ? requiredSellTimeInForce
        : null;
    const selectedTimeInForce =
      selectedBuyTimeInForce !==
        null &&
      selectedBuyTimeInForce ===
        selectedSellTimeInForce
        ? selectedBuyTimeInForce
        : null;

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
        `Order-time BUY book is unavailable for ${buyExchange}:${market}.`,
      );
    }

    if (!sellBook) {
      reasons.push(
        `Order-time SELL book is unavailable for ${sellExchange}:${market}.`,
      );
    }

    const buyBookAgeMs =
      buyBook
        ? startedAt -
          buyBook.timestamp
        : null;
    const sellBookAgeMs =
      sellBook
        ? startedAt -
          sellBook.timestamp
        : null;
    const bookTimestampSkewMs =
      buyBook &&
      sellBook
        ? Math.abs(
            buyBook.timestamp -
              sellBook.timestamp,
          )
        : null;

    this.validateBookAge(
      "BUY",
      buyBookAgeMs,
      buyContract,
      reasons,
    );
    this.validateBookAge(
      "SELL",
      sellBookAgeMs,
      sellContract,
      reasons,
    );

    if (
      bookTimestampSkewMs !==
        null &&
      bookTimestampSkewMs >
        this.config
          .maximumBookTimestampSkewMs
    ) {
      reasons.push(
        `Order-time book skew ${bookTimestampSkewMs} ms exceeds ${this.config.maximumBookTimestampSkewMs} ms.`,
      );
    }

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
    let buyFillPercent:
      number | null =
      null;
    let sellFillPercent:
      number | null =
      null;
    let tradingFees:
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
        input.quantity,
      ) &&
      input.quantity > 0
    ) {
      try {
        const buyWalk =
          vwapCalculator.calculate(
            buyBook.asks,
            input.quantity,
          );
        const sellWalk =
          vwapCalculator.calculate(
            sellBook.bids,
            input.quantity,
          );

        buyVwap =
          buyWalk.averagePrice;
        sellVwap =
          sellWalk.averagePrice;
        buyFillPercent =
          buyWalk.fillPercent;
        sellFillPercent =
          sellWalk.fillPercent;
        buyLimitPrice =
          resolveWorstConsumedPrice(
            buyBook.asks,
            input.quantity,
          );
        sellLimitPrice =
          resolveWorstConsumedPrice(
            sellBook.bids,
            input.quantity,
          );

        const tolerance =
          Math.max(
            1e-12,
            input.quantity *
              1e-9,
          );

        if (
          buyWalk.filledQuantity <
          input.quantity -
            tolerance
        ) {
          reasons.push(
            `Order-time BUY depth is partial (${buyWalk.fillPercent.toFixed(2)}%).`,
          );
        }

        if (
          sellWalk.filledQuantity <
          input.quantity -
            tolerance
        ) {
          reasons.push(
            `Order-time SELL depth is partial (${sellWalk.fillPercent.toFixed(2)}%).`,
          );
        }

        const buyFeePercent =
          this.dependencies
            .getTakerFeePercent(
              buyExchange,
              market,
              startedAt,
            );
        const sellFeePercent =
          this.dependencies
            .getTakerFeePercent(
              sellExchange,
              market,
              startedAt,
            );

        if (
          !isNonNegativeFinite(
            buyFeePercent,
          ) ||
          !isNonNegativeFinite(
            sellFeePercent,
          )
        ) {
          reasons.push(
            "Fresh order-time taker-fee evidence is unavailable or invalid.",
          );
        } else {
          const stressedBuy =
            buyWalk.totalCost *
            (
              1 +
              policy.values.paper
                .buySlippagePercent /
                100
            );
          const stressedSell =
            sellWalk.totalCost *
            (
              1 -
              policy.values.paper
                .sellSlippagePercent /
                100
            );

          tradingFees =
            stressedBuy *
              (
                buyFeePercent /
                100
              ) +
            stressedSell *
              (
                sellFeePercent /
                100
              );
          safetyBuffer =
            stressedBuy *
            (
              policy.values.paper
                .safetyBufferPercent /
              100
            );
          postStressNetProfit =
            stressedSell -
            stressedBuy -
            tradingFees -
            safetyBuffer;
          postStressNetProfitPercent =
            stressedBuy > 0
              ? postStressNetProfit /
                stressedBuy *
                100
              : null;

          if (
            !isNonNegativeFinite(
              postStressNetProfitPercent,
            ) ||
            postStressNetProfitPercent <
              policy.values.tinyLive
                .minimumNetProfitPercent
          ) {
            reasons.push(
              `Order-time post-stress net ${formatPercent(postStressNetProfitPercent)} is below Tiny-LIVE minimum ${policy.values.tinyLive.minimumNetProfitPercent.toFixed(4)}%.`,
            );
          }
        }
      } catch (
        error: unknown
      ) {
        reasons.push(
          error instanceof Error
            ? `Order-time depth walk failed: ${error.message}`
            : "Order-time depth walk failed.",
        );
      }
    }

    const evaluatedAt =
      input.now ??
      Date.now();
    const evaluationDurationMs =
      Math.max(
        0,
        this.dependencies
          .getMonotonicTimeMs() -
          monotonicStartedAt,
      );

    if (
      evaluationDurationMs >
        this.config
          .maximumEvaluationDurationMs
    ) {
      reasons.push(
        `Order-time evaluation took ${evaluationDurationMs} ms; maximum is ${this.config.maximumEvaluationDurationMs} ms.`,
      );
    }

    const approved =
      reasons.length ===
        0 &&
      selectedBuyTimeInForce !==
        null &&
      selectedSellTimeInForce !==
        null &&
      buyLimitPrice !==
        null &&
      sellLimitPrice !==
        null &&
      postStressNetProfitPercent !==
        null;

    return {
      schemaVersion:
        "103.0",
      decision:
        approved
          ? "APPROVED"
          : "BLOCKED",
      decisionId:
        `s1-last-look:${opportunity.id}:${startedAt}`,
      evaluatedAt,
      evaluationDurationMs,
      opportunityId:
        opportunity.id,
      opportunityAgeMs,
      market,
      buyExchange,
      sellExchange,
      quantity:
        input.quantity,
      buyBookTimestamp:
        buyBook?.timestamp ??
        null,
      sellBookTimestamp:
        sellBook?.timestamp ??
        null,
      buyBookAgeMs,
      sellBookAgeMs,
      bookTimestampSkewMs,
      buyVwap,
      sellVwap,
      buyLimitPrice,
      sellLimitPrice,
      buyFillPercent,
      sellFillPercent,
      tradingFees,
      safetyBuffer,
      postStressNetProfit,
      postStressNetProfitPercent,
      minimumNetProfitPercent:
        policy.values.tinyLive
          .minimumNetProfitPercent,
      selectedTimeInForce,
      selectedBuyTimeInForce,
      selectedSellTimeInForce,
      policyId:
        policy.policyId,
      policyRevision:
        policy.revision,
      policyHash:
        policy.policyHash,
      reasons:
        approved
          ? [
              `Fresh two-book ${selectedBuyTimeInForce}/${selectedSellTimeInForce} last-look remains ${postStressNetProfitPercent?.toFixed(4)}% net after fees, adverse-move reserve and safety buffer.`,
            ]
          : [
              ...new Set(
                reasons,
              ),
            ],
      liveOrderSubmissionAuthorized:
        false,
      automaticRecoveryOrderAuthorized:
        false,
    };
  }

  private validateVenueContract(
    side:
      "BUY" |
      "SELL",
    exchange: string,
    contract:
      StrategyOneVenueOrderContract |
      null,
    reasons: string[],
  ): void {
    if (!contract) {
      reasons.push(
        `${side} venue ${exchange} has no audited Strategy #1 order-time contract.`,
      );

      return;
    }

    if (
      contract.exchange
        .trim()
        .toLowerCase() !==
      exchange
    ) {
      reasons.push(
        `${side} venue contract identity does not match ${exchange}.`,
      );
    }

    if (
      contract.maximumOrderBookAgeMs ===
        null
    ) {
      reasons.push(
        `${side} venue ${exchange} has no calibrated order-submission quote TTL.`,
      );
    } else if (
      !Number.isSafeInteger(
        contract.maximumOrderBookAgeMs,
      ) ||
      contract.maximumOrderBookAgeMs <=
        0
    ) {
      reasons.push(
        `${side} venue ${exchange} has an invalid order-submission quote TTL.`,
      );
    }

    if (
      !contract.supportedTimeInForce
        .includes(
          contract.requiredTimeInForce ??
            this.config
              .requiredTimeInForce,
        )
    ) {
      const requiredTimeInForce =
        contract.requiredTimeInForce ??
        this.config
          .requiredTimeInForce;
      reasons.push(
        `${side} venue ${exchange} has no audited ${requiredTimeInForce} mapping.`,
      );
    }

    if (
      !contract
        .authoritativeFillConfirmationReady
    ) {
      reasons.push(
        `${side} venue ${exchange} lacks authenticated fill-stream confirmation.`,
      );
    }
  }

  private validateBookAge(
    side:
      "BUY" |
      "SELL",
    ageMs:
      number |
      null,
    contract:
      StrategyOneVenueOrderContract |
      null,
    reasons: string[],
  ): void {
    const maximumAgeMs =
      contract
        ?.maximumOrderBookAgeMs ??
      null;

    if (
      maximumAgeMs ===
        null
    ) {
      return;
    }

    if (
      ageMs ===
        null ||
      !Number.isSafeInteger(
        ageMs,
      ) ||
      ageMs < 0 ||
      ageMs > maximumAgeMs
    ) {
      reasons.push(
        `Order-time ${side} book age ${ageMs ?? "missing"} ms exceeds calibrated maximum ${maximumAgeMs} ms.`,
      );
    }
  }
}

function resolveWorstConsumedPrice(
  levels:
    readonly {
      readonly price: number;
      readonly quantity: number;
    }[],
  requestedQuantity: number,
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
      level.price <= 0 ||
      !Number.isFinite(
        level.quantity,
      ) ||
      level.quantity <= 0
    ) {
      throw new Error(
        "Depth contains a non-positive or non-finite level.",
      );
    }

    const consumed =
      Math.min(
        remaining,
        level.quantity,
      );

    if (consumed > 0) {
      worstPrice =
        level.price;
      remaining -=
        consumed;
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

function isNonNegativeFinite(
  value:
    number |
    null,
): value is number {
  return typeof value ===
      "number" &&
    Number.isFinite(
      value,
    ) &&
    value >= 0;
}

function normalizeExchange(
  value: string,
): string {
  return value
    .trim()
    .toLowerCase();
}

function validateTimestamp(
  value: number,
): void {
  if (
    !Number.isSafeInteger(
      value,
    ) ||
    value <= 0
  ) {
    throw new Error(
      "Strategy #1 order-time timestamp must be a positive safe integer.",
    );
  }
}

function formatPercent(
  value:
    number |
    null,
): string {
  return typeof value ===
      "number" &&
    Number.isFinite(
      value,
    )
    ? `${value.toFixed(4)}%`
    : "invalid";
}

export const strategyOneOrderTimeSafetyService =
  new StrategyOneOrderTimeSafetyService();
