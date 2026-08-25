import {
  executableProfitCalculator,
  type ExecutableProfitResult,
} from "../../../trading/profit/ExecutableProfitCalculator";

import {
  getCoinDcxTdsWithholdingPercent,
  getTinyLiveMinimumNetProfitPercent,
  STRATEGY_ONE_TINY_LIVE_MAXIMUM_CAPITAL_PER_LEG_INR,
} from "../tiny-live/StrategyOneControlledLiveConfiguration";

import {
  isStrategyOneDirectionalRoute,
  normalizeStrategyOneExchange,
} from "../scope/StrategyOneExchangeScope";

export type StrategyOneDynamicDecision =
  | "EXECUTE_NOW"
  | "WAIT"
  | "SKIP"
  | "REDUCE_QUANTITY"
  | "REBALANCE_REQUIRED"
  | "ROUTE_UNAVAILABLE"
  | "EMERGENCY_STOP";

export interface StrategyOneDynamicCandidate {
  readonly opportunityId: string;
  readonly market: string;
  readonly buyExchange: string;
  readonly sellExchange: string;
  readonly requestedCapitalInr: number;
  readonly requestedQuoteCapital: number;
  readonly requestedQuantity: number;
  readonly buyBestBid: number;
  readonly buyBestAsk: number;
  readonly sellBestBid: number;
  readonly sellBestAsk: number;
  readonly buyVwap: number;
  readonly sellVwap: number;
  readonly buyOrderLimitPrice?: number;
  readonly sellOrderLimitPrice?: number;
  readonly buyDepthQuantity: number;
  readonly sellDepthQuantity: number;
  readonly buyBookTimestamp: number;
  readonly sellBookTimestamp: number;
  readonly now: number;
  readonly maximumBookAgeMs: number;
  readonly maximumTimestampSkewMs: number;
  readonly buyAvailableQuoteBalance: number;
  readonly sellAvailableBaseInventory: number;
  readonly buyMinimumNotional: number;
  readonly sellMinimumNotional: number;
  readonly buyPriceTickSize: number;
  readonly sellPriceTickSize: number;
  readonly quantityStepSize: number;
  readonly buyFeePercent: number;
  readonly sellFeePercent: number;
  readonly buySlippagePercent: number;
  readonly sellSlippagePercent: number;
  readonly safetyBufferPercent: number;
  readonly minimumNetProfitPercent?: number;
  readonly tdsWithholdingPercent?: number;
  readonly buyVenueReady: boolean;
  readonly sellVenueReady: boolean;
  readonly routeReady: boolean;
  readonly exchangeRulesFresh: boolean;
  readonly spotPermissionsVerified: boolean;
  readonly orderContractsReady: boolean;
  readonly recoveryHealthy: boolean;
  readonly emergencyStop: boolean;
  readonly activeAttempts: number;
  readonly attemptsToday: number;
  readonly dailyAttemptCap: number;
  readonly todayLossInr: number;
  readonly dailyLossLimitInr: number;
  readonly recentRouteFailure: boolean;
}

export interface StrategyOneDynamicDecisionReport {
  readonly schemaVersion: "1.0";
  readonly generatedAt: number;
  readonly opportunityId: string;
  readonly market: string;
  readonly routeKey: string;
  readonly decision: StrategyOneDynamicDecision;
  readonly requestedQuantity: number;
  readonly recommendedQuantity: number | null;
  readonly requestedCapitalInr: number;
  readonly maximumCapitalPerLegInr: 500;
  readonly economics: ExecutableProfitResult | null;
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
  readonly liveOrderAuthorityGranted: false;
}

export class StrategyOneDynamicExecutionDecisionManager {
  evaluate(
    candidate: StrategyOneDynamicCandidate,
  ): StrategyOneDynamicDecisionReport {
    const buyExchange =
      normalizeStrategyOneExchange(
        candidate.buyExchange,
      );

    const sellExchange =
      normalizeStrategyOneExchange(
        candidate.sellExchange,
      );

    const routeKey =
      `${candidate.market.trim().toUpperCase()}|${buyExchange}>${sellExchange}`;

    const blockers:
      string[] = [];

    const warnings:
      string[] = [];

    if (candidate.emergencyStop) {
      return this.report(
        candidate,
        routeKey,
        "EMERGENCY_STOP",
        null,
        null,
        [
          "EMERGENCY_STOP_ACTIVE",
        ],
        warnings,
      );
    }

    if (
      !isStrategyOneDirectionalRoute(
        buyExchange,
        sellExchange,
      )
    ) {
      blockers.push(
        "ROUTE_OUTSIDE_CORE_EXCHANGE_UNIVERSE",
      );
    }

    if (!candidate.buyVenueReady) {
      blockers.push(
        "BUY_VENUE_NOT_ORDER_READY",
      );
    }

    if (!candidate.sellVenueReady) {
      blockers.push(
        "SELL_VENUE_NOT_ORDER_READY",
      );
    }

    if (!candidate.routeReady) {
      blockers.push(
        "DIRECTIONAL_ROUTE_NOT_READY",
      );
    }

    if (!candidate.exchangeRulesFresh) {
      blockers.push(
        "EXCHANGE_RULES_STALE_OR_MISSING",
      );
    }

    if (!candidate.spotPermissionsVerified) {
      blockers.push(
        "SPOT_ORDER_PERMISSION_NOT_VERIFIED",
      );
    }

    if (!candidate.orderContractsReady) {
      blockers.push(
        "BOUNDED_PARALLEL_ORDER_CONTRACT_UNAVAILABLE",
      );
    }

    if (!candidate.recoveryHealthy) {
      blockers.push(
        "RECOVERY_ENGINE_NOT_READY",
      );
    }

    if (blockers.length > 0) {
      return this.report(
        candidate,
        routeKey,
        "ROUTE_UNAVAILABLE",
        null,
        null,
        blockers,
        warnings,
      );
    }

    if (
      candidate.activeAttempts >=
        1 ||
      candidate.attemptsToday >=
        candidate.dailyAttemptCap ||
      candidate.todayLossInr >=
        candidate.dailyLossLimitInr ||
      candidate.recentRouteFailure
    ) {
      if (candidate.activeAttempts >= 1) {
        blockers.push(
          "MAXIMUM_CONCURRENT_ATTEMPTS_REACHED",
        );
      }

      if (
        candidate.attemptsToday >=
        candidate.dailyAttemptCap
      ) {
        blockers.push(
          "DAILY_ATTEMPT_CAP_REACHED",
        );
      }

      if (
        candidate.todayLossInr >=
        candidate.dailyLossLimitInr
      ) {
        blockers.push(
          "DAILY_LOSS_LIMIT_REACHED",
        );
      }

      if (candidate.recentRouteFailure) {
        blockers.push(
          "ROUTE_FAILURE_COOLDOWN_ACTIVE",
        );
      }

      return this.report(
        candidate,
        routeKey,
        "WAIT",
        null,
        null,
        blockers,
        warnings,
      );
    }

    const buyAgeMs =
      candidate.now -
      candidate.buyBookTimestamp;

    const sellAgeMs =
      candidate.now -
      candidate.sellBookTimestamp;

    const timestampSkewMs =
      Math.abs(
        candidate.buyBookTimestamp -
        candidate.sellBookTimestamp,
      );

    if (
      !isPositiveIntegerTime(
        candidate.now,
      ) ||
      buyAgeMs < 0 ||
      sellAgeMs < 0 ||
      buyAgeMs >
        candidate.maximumBookAgeMs ||
      sellAgeMs >
        candidate.maximumBookAgeMs ||
      timestampSkewMs >
        candidate.maximumTimestampSkewMs
    ) {
      if (
        buyAgeMs < 0 ||
        buyAgeMs >
          candidate.maximumBookAgeMs
      ) {
        blockers.push(
          "BUY_BOOK_STALE",
        );
      }

      if (
        sellAgeMs < 0 ||
        sellAgeMs >
          candidate.maximumBookAgeMs
      ) {
        blockers.push(
          "SELL_BOOK_STALE",
        );
      }

      if (
        timestampSkewMs >
        candidate.maximumTimestampSkewMs
      ) {
        blockers.push(
          "CROSS_EXCHANGE_TIMESTAMP_SKEW_EXCEEDED",
        );
      }

      return this.report(
        candidate,
        routeKey,
        "WAIT",
        null,
        null,
        blockers,
        warnings,
      );
    }

    if (
      !validLocalBook(
        candidate.buyBestBid,
        candidate.buyBestAsk,
      ) ||
      !validLocalBook(
        candidate.sellBestBid,
        candidate.sellBestAsk,
      ) ||
      !positiveFinite(
        candidate.buyVwap,
      ) ||
      !positiveFinite(
        candidate.sellVwap,
      )
    ) {
      return this.report(
        candidate,
        routeKey,
        "WAIT",
        null,
        null,
        [
          "INVALID_OR_CROSSED_ORDER_BOOK",
        ],
        warnings,
      );
    }

    if (
      candidate.requestedCapitalInr >
        STRATEGY_ONE_TINY_LIVE_MAXIMUM_CAPITAL_PER_LEG_INR ||
      !positiveFinite(
        candidate.requestedCapitalInr,
      ) ||
      !positiveFinite(
        candidate.requestedQuoteCapital,
      ) ||
      !positiveFinite(
        candidate.requestedQuantity,
      ) ||
      !positiveFinite(
        candidate.quantityStepSize,
      )
    ) {
      return this.report(
        candidate,
        routeKey,
        "SKIP",
        null,
        null,
        [
          "INVALID_OR_ABOVE_CAPITAL_LIMIT",
        ],
        warnings,
      );
    }

    const buyUnitReserve =
      candidate.buyVwap *
      (
        1 +
        (
          candidate.buyFeePercent +
          candidate.buySlippagePercent +
          candidate.safetyBufferPercent
        ) /
          100
      );

    const balanceQuantity =
      buyUnitReserve > 0
        ? candidate.buyAvailableQuoteBalance /
          buyUnitReserve
        : 0;

    const rawSafeQuantity =
      Math.min(
        candidate.requestedQuantity,
        candidate.buyDepthQuantity,
        candidate.sellDepthQuantity,
        balanceQuantity,
        candidate.sellAvailableBaseInventory,
        candidate.requestedQuoteCapital /
          candidate.buyVwap,
      );

    const recommendedQuantity =
      floorToIncrement(
        rawSafeQuantity,
        candidate.quantityStepSize,
      );

    if (
      !positiveFinite(
        recommendedQuantity,
      )
    ) {
      return this.report(
        candidate,
        routeKey,
        "REBALANCE_REQUIRED",
        null,
        null,
        [
          "PREFUNDED_BALANCES_OR_DEPTH_LEAVE_NO_EXECUTABLE_QUANTITY",
        ],
        warnings,
      );
    }

    const buyNotional =
      candidate.buyVwap *
      recommendedQuantity;

    const sellNotional =
      candidate.sellVwap *
      recommendedQuantity;

    if (
      buyNotional <
        candidate.buyMinimumNotional ||
      sellNotional <
        candidate.sellMinimumNotional
    ) {
      return this.report(
        candidate,
        routeKey,
        "SKIP",
        recommendedQuantity,
        null,
        [
          "EXCHANGE_MINIMUM_NOTIONAL_NOT_MET",
        ],
        warnings,
      );
    }

    if (
      !isIncrementAligned(
        candidate.buyOrderLimitPrice ??
          candidate.buyVwap,
        candidate.buyPriceTickSize,
      ) ||
      !isIncrementAligned(
        candidate.sellOrderLimitPrice ??
          candidate.sellVwap,
        candidate.sellPriceTickSize,
      ) ||
      !isIncrementAligned(
        recommendedQuantity,
        candidate.quantityStepSize,
      )
    ) {
      return this.report(
        candidate,
        routeKey,
        "SKIP",
        recommendedQuantity,
        null,
        [
          "PRICE_OR_QUANTITY_INCREMENT_NOT_MET",
        ],
        warnings,
      );
    }

    const economics =
      executableProfitCalculator
        .calculate({
          market:
            candidate.market,
          capital:
            candidate.requestedQuoteCapital,
          quantity:
            recommendedQuantity,
          buyExchange,
          sellExchange,
          buyPrice:
            candidate.buyVwap,
          sellPrice:
            candidate.sellVwap,
          buyFeePercent:
            candidate.buyFeePercent,
          sellFeePercent:
            candidate.sellFeePercent,
          buySlippagePercent:
            candidate.buySlippagePercent,
          sellSlippagePercent:
            candidate.sellSlippagePercent,
          safetyBufferPercent:
            candidate.safetyBufferPercent,
          minimumProfitPercent:
            candidate.minimumNetProfitPercent ??
            getTinyLiveMinimumNetProfitPercent(),
          tdsWithholdingPercent:
            sellExchange === "coindcx"
              ? candidate.tdsWithholdingPercent ??
                getCoinDcxTdsWithholdingPercent()
              : 0,
        });

    if (!economics.executable) {
      return this.report(
        candidate,
        routeKey,
        "SKIP",
        recommendedQuantity,
        economics,
        [
          "NO_EXECUTABLE_OPPORTUNITY",
          ...economics.reasons,
        ],
        warnings,
      );
    }

    const reduced =
      recommendedQuantity <
      candidate.requestedQuantity -
        Math.max(
          1e-12,
          candidate.requestedQuantity *
            1e-12,
        );

    if (reduced) {
      warnings.push(
        "Quantity was reduced to the largest safe prefunded, depth-complete and increment-aligned amount.",
      );
    }

    return this.report(
      candidate,
      routeKey,
      reduced
        ? "REDUCE_QUANTITY"
        : "EXECUTE_NOW",
      recommendedQuantity,
      economics,
      [],
      warnings,
    );
  }

  private report(
    candidate: StrategyOneDynamicCandidate,
    routeKey: string,
    decision: StrategyOneDynamicDecision,
    recommendedQuantity: number | null,
    economics: ExecutableProfitResult | null,
    blockers: readonly string[],
    warnings: readonly string[],
  ): StrategyOneDynamicDecisionReport {
    return Object.freeze({
      schemaVersion:
        "1.0" as const,
      generatedAt:
        candidate.now,
      opportunityId:
        candidate.opportunityId,
      market:
        candidate.market
          .trim()
          .toUpperCase(),
      routeKey,
      decision,
      requestedQuantity:
        candidate.requestedQuantity,
      recommendedQuantity,
      requestedCapitalInr:
        candidate.requestedCapitalInr,
      maximumCapitalPerLegInr:
        STRATEGY_ONE_TINY_LIVE_MAXIMUM_CAPITAL_PER_LEG_INR,
      economics,
      blockers: [
        ...new Set(
          blockers,
        ),
      ],
      warnings: [
        ...warnings,
      ],
      liveOrderAuthorityGranted:
        false as const,
    });
  }
}

function validLocalBook(
  bestBid: number,
  bestAsk: number,
): boolean {
  return (
    positiveFinite(
      bestBid,
    ) &&
    positiveFinite(
      bestAsk,
    ) &&
    bestBid < bestAsk
  );
}

function floorToIncrement(
  value: number,
  increment: number,
): number {
  if (
    !positiveFinite(value) ||
    !positiveFinite(increment)
  ) {
    return 0;
  }

  const units =
    Math.floor(
      value /
        increment +
        1e-12,
    );

  return Number(
    (
      units *
      increment
    ).toPrecision(15),
  );
}

function isIncrementAligned(
  value: number,
  increment: number,
): boolean {
  if (
    !positiveFinite(value) ||
    !positiveFinite(increment)
  ) {
    return false;
  }

  const units =
    value /
    increment;

  return Math.abs(
    units -
    Math.round(units),
  ) <= 1e-8;
}

function positiveFinite(
  value: number,
): boolean {
  return (
    Number.isFinite(value) &&
    value > 0
  );
}

function isPositiveIntegerTime(
  value: number,
): boolean {
  return (
    Number.isSafeInteger(value) &&
    value > 0
  );
}

export const strategyOneDynamicExecutionDecisionManager =
  new StrategyOneDynamicExecutionDecisionManager();
