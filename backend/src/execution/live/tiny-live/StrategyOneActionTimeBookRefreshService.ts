import type {
  ArbitrageOpportunity,
} from "../../../arbitrage/models/ArbitrageOpportunity";

import {
  opportunityService,
  type ExactRouteEvaluationResult,
} from "../../../arbitrage/services/OpportunityService";

import {
  BinanceAdapter,
  type BinanceActionTimeOrderBookRefreshReport,
} from "../../../exchanges/binance/BinanceAdapter";

import {
  BINANCE,
} from "../../../exchanges/binance/constants";

import {
  BybitAdapter,
  type BybitActionTimeOrderBookRefreshReport,
} from "../../../exchanges/bybit/BybitAdapter";

import {
  BYBIT,
} from "../../../exchanges/bybit/constants";

import {
  coinDCXProtectedRestOrderBookService,
  type CoinDCXActionTimeOrderBookRefreshReport,
} from "../../../exchanges/coindcx/CoinDCXProtectedRestOrderBookService";

import {
  exchangeManager,
} from "../../../exchanges/core/ExchangeManager";
import {
  isStrategyOneTinyLiveBasketRoute,
  type StrategyOneTinyLiveBasketExchange,
} from "../../../arbitrage/execution/StrategyOneTinyLiveBasketPolicy";

export interface StrategyOneActionTimeBookRefreshRoute {
  readonly market: string;
  readonly buyExchange: string;
  readonly sellExchange: string;
}

export type StrategyOneActionTimeBookRefreshLeg =
  | CoinDCXActionTimeOrderBookRefreshReport
  | BinanceActionTimeOrderBookRefreshReport
  | BybitActionTimeOrderBookRefreshReport;

export interface StrategyOneActionTimeBookRefreshResult {
  readonly schemaVersion: "149.0";
  readonly state:
    | "REFRESHED"
    | "BLOCKED"
    | "COOLDOWN";
  readonly route: {
    readonly market: string;
    readonly buyExchange: StrategyOneTinyLiveBasketExchange;
    readonly sellExchange: StrategyOneTinyLiveBasketExchange;
  };
  readonly startedAt: number;
  readonly completedAt: number;
  readonly durationMs: number;
  readonly legs: readonly StrategyOneActionTimeBookRefreshLeg[];
  readonly evaluation: ExactRouteEvaluationResult | null;
  readonly opportunity: ArbitrageOpportunity | null;
  readonly blocker: string | null;
  readonly safety: {
    readonly publicReadOnly: true;
    readonly parallelReads: true;
    readonly thresholdChanged: false;
    readonly timestampFabricationAllowed: false;
    readonly orderSubmissionAllowed: false;
    readonly automaticRetryAllowed: false;
    readonly transferAllowed: false;
    readonly withdrawalAllowed: false;
  };
}

export interface StrategyOneAuthorizedFinalBookRefreshResult {
  readonly schemaVersion: "188.2";
  readonly state:
    | "REFRESHED"
    | "BLOCKED";
  readonly route: {
    readonly market: string;
    readonly buyExchange: StrategyOneTinyLiveBasketExchange;
    readonly sellExchange: StrategyOneTinyLiveBasketExchange;
  };
  readonly startedAt: number;
  readonly completedAt: number;
  readonly durationMs: number;
  readonly legs: readonly StrategyOneActionTimeBookRefreshLeg[];
  readonly blocker: string | null;
  readonly safety: {
    readonly publicReadOnly: true;
    readonly authorizedAttemptOnly: true;
    readonly parallelReads: true;
    readonly thresholdChanged: false;
    readonly timestampFabricationAllowed: false;
    readonly orderSubmissionAllowed: false;
    readonly automaticRetryAllowed: false;
    readonly transferAllowed: false;
    readonly withdrawalAllowed: false;
  };
}

export interface StrategyOneActionTimeBookRefreshDependencies {
  refreshCoinDCX(
    market: string,
    timeoutMs: number,
  ): Promise<CoinDCXActionTimeOrderBookRefreshReport>;
  refreshBinance(
    market: string,
    timeoutMs: number,
  ): Promise<BinanceActionTimeOrderBookRefreshReport>;
  refreshBybit(
    market: string,
    timeoutMs: number,
  ): Promise<BybitActionTimeOrderBookRefreshReport>;
  evaluateExactRoute(input: {
    readonly market: string;
    readonly buyExchange: string;
    readonly sellExchange: string;
    readonly minimumBuyTimestamp: number;
    readonly minimumSellTimestamp: number;
  }): ExactRouteEvaluationResult;
  now(): number;
}

const ACTION_TIME_READ_TIMEOUT_MS =
  190;

/*
 * Adapter timeouts are the first line of defence, but the Tiny-LIVE trigger
 * must never remain locked if an adapter/fetch implementation violates that
 * contract.  Keep one service-owned wall-clock deadline around the complete
 * parallel read.  A timed-out read is ignored and the route stays blocked;
 * it can never produce an opportunity or order authority later.
 */
const ACTION_TIME_REFRESH_DEADLINE_MS =
  ACTION_TIME_READ_TIMEOUT_MS +
  25;

const MINIMUM_ROUTE_REFRESH_INTERVAL_MS =
  500;

const DEFAULT_DEPENDENCIES:
  StrategyOneActionTimeBookRefreshDependencies = {
  refreshCoinDCX: (
    market,
    timeoutMs,
  ) =>
    coinDCXProtectedRestOrderBookService
      .refreshExactMarket(
        market,
        timeoutMs,
      ),
  refreshBinance: async (
    market,
    timeoutMs,
  ) => {
    const adapter =
      exchangeManager
        .get(
          BINANCE.NAME,
        );

    if (
      !(adapter instanceof BinanceAdapter)
    ) {
      const requestedAt =
        Date.now();

      return {
        exchange:
          "binance",
        market,
        accepted:
          false,
        requestedAt,
        receivedAt:
          null,
        roundTripMs:
          0,
        error:
          "The running Binance market-data adapter is unavailable.",
      };
    }

    return adapter
      .refreshOrderBookSnapshot(
        market,
        timeoutMs,
      );
  },
  refreshBybit: async (
    market,
    timeoutMs,
  ) => {
    const adapter = exchangeManager.get(BYBIT.NAME);

    if (!(adapter instanceof BybitAdapter)) {
      const requestedAt = Date.now();
      return {
        exchange: "bybit",
        market,
        accepted: false,
        requestedAt,
        receivedAt: null,
        roundTripMs: 0,
        error: "The running Bybit market-data adapter is unavailable.",
      };
    }

    return adapter.refreshOrderBookSnapshot(market, timeoutMs);
  },
  evaluateExactRoute: (
    input,
  ) =>
    opportunityService
      .evaluateExactRoute(
        input,
      ),
  now:
    Date.now,
};

/**
 * Stale-case rescue for the exact first Tiny-LIVE lane.
 *
 * The normal path remains WebSocket-only. This service is reached only after
 * every non-freshness gate has passed and current dispatch freshness alone
 * blocked the action. Both public books are then refreshed concurrently,
 * published through their existing validated stores, and the normal
 * opportunity engine is rerun. No old opportunity or old price is reused.
 */
export class StrategyOneActionTimeBookRefreshService {
  private readonly dependencies:
    StrategyOneActionTimeBookRefreshDependencies;

  private readonly inFlight =
    new Map<
      string,
      Promise<StrategyOneActionTimeBookRefreshResult>
    >();

  private readonly lastStartedAtByRoute =
    new Map<string, number>();

  private attempts =
    0;

  private refreshed =
    0;

  private blocked =
    0;

  private cooldowns =
    0;

  private coalesced =
    0;

  private finalRefreshAttempts =
    0;

  private finalRefreshes =
    0;

  private finalRefreshBlocks =
    0;

  private lastResult:
    StrategyOneActionTimeBookRefreshResult | null =
    null;

  private lastFinalRefresh:
    StrategyOneAuthorizedFinalBookRefreshResult | null =
    null;

  constructor(
    dependencies:
      Partial<StrategyOneActionTimeBookRefreshDependencies> = {},
  ) {
    this.dependencies = {
      ...DEFAULT_DEPENDENCIES,
      ...dependencies,
    };
  }

  async refresh(
    input:
      StrategyOneActionTimeBookRefreshRoute,
  ): Promise<StrategyOneActionTimeBookRefreshResult> {
    const route =
      normalizeRoute(
        input,
      );

    const routeKey =
      key(
        route,
      );

    const existing =
      this.inFlight
        .get(
          routeKey,
        );

    if (
      existing
    ) {
      this.coalesced +=
        1;

      return existing;
    }

    const startedAt =
      this.dependencies
        .now();

    const previousStartedAt =
      this.lastStartedAtByRoute
        .get(
          routeKey,
        ) ??
      null;

    if (
      previousStartedAt !==
        null &&
      startedAt -
        previousStartedAt <
        MINIMUM_ROUTE_REFRESH_INTERVAL_MS
    ) {
      this.cooldowns +=
        1;

      const result =
        report({
          state:
            "COOLDOWN",
          route,
          startedAt,
          completedAt:
            startedAt,
          legs:
            [],
          opportunity:
            null,
          blocker:
            "Action-time public book refresh is inside its bounded route cooldown.",
        });

      this.lastResult =
        result;

      return result;
    }

    this.lastStartedAtByRoute
      .set(
        routeKey,
        startedAt,
      );

    this.attempts +=
      1;

    let operation:
      Promise<StrategyOneActionTimeBookRefreshResult>;

    operation =
      this.run(
        route,
        startedAt,
      )
        .then(
          (
            result,
          ) => {
            this.lastResult =
              result;

            if (
              result.state ===
              "REFRESHED"
            ) {
              this.refreshed +=
                1;
            } else {
              this.blocked +=
                1;
            }

            return result;
          },
        )
        .finally(
          () => {
            if (
              this.inFlight
                .get(
                  routeKey,
                ) ===
              operation
            ) {
              this.inFlight
                .delete(
                  routeKey,
                );
            }
          },
        );

    this.inFlight
      .set(
        routeKey,
        operation,
      );

    return operation;
  }

  /**
   * One additional bounded public refresh after the one-time authority has
   * been authorized and before the coordinator performs its synchronous final
   * last-look. Durable preview/authorization work can legitimately consume
   * most of a calibrated sub-250ms quote TTL. This refresh changes no
   * threshold, authority, quantity or route and performs no exchange order.
   */
  async refreshForAuthorizedAttempt(
    input:
      StrategyOneActionTimeBookRefreshRoute,
  ): Promise<StrategyOneAuthorizedFinalBookRefreshResult> {
    const route =
      normalizeRoute(
        input,
      );
    const startedAt =
      this.dependencies
        .now();

    this.finalRefreshAttempts +=
      1;

    let legs:
      readonly StrategyOneActionTimeBookRefreshLeg[];

    try {
      legs = await this.refreshRouteLegs(
        route,
      );
    } catch (
      error:
        unknown
    ) {
      const blocked =
        finalRefreshReport({
          state:
            "BLOCKED",
          route,
          startedAt,
          completedAt:
            this.dependencies
              .now(),
          legs:
            [],
          blocker:
            error instanceof Error
              ? `Authorized final public book refresh failed closed: ${error.message}`
              : "Authorized final public book refresh failed closed.",
        });

      this.finalRefreshBlocks +=
        1;
      this.lastFinalRefresh =
        blocked;

      return blocked;
    }

    const failedLegs =
      legs.filter(
        (
          leg,
        ) =>
          !leg.accepted ||
          leg.receivedAt ===
            null,
      );
    const completedAt =
      this.dependencies
        .now();
    const result =
      failedLegs.length ===
        0
        ? finalRefreshReport({
          state:
            "REFRESHED",
          route,
          startedAt,
          completedAt,
          legs,
          blocker:
            null,
        })
        : finalRefreshReport({
          state:
            "BLOCKED",
          route,
          startedAt,
          completedAt,
          legs,
          blocker:
            failedLegs
              .map(
                (
                  leg,
                ) =>
                  `${leg.exchange}: ${leg.error ?? "fresh public depth was unavailable"}`,
              )
              .join(
                " | ",
              ),
        });

    if (
      result.state ===
        "REFRESHED"
    ) {
      this.finalRefreshes +=
        1;
    } else {
      this.finalRefreshBlocks +=
        1;
    }

    this.lastFinalRefresh =
      result;

    return result;
  }

  getDiagnostics() {
    return freeze({
      schemaVersion:
        "149.0" as const,
      generatedAt:
        this.dependencies
          .now(),
      actionTimeReadTimeoutMs:
        ACTION_TIME_READ_TIMEOUT_MS,
      actionTimeRefreshDeadlineMs:
        ACTION_TIME_REFRESH_DEADLINE_MS,
      minimumRouteRefreshIntervalMs:
        MINIMUM_ROUTE_REFRESH_INTERVAL_MS,
      attempts:
        this.attempts,
      refreshed:
        this.refreshed,
      blocked:
        this.blocked,
      cooldowns:
        this.cooldowns,
      coalesced:
        this.coalesced,
      finalRefreshAttempts:
        this.finalRefreshAttempts,
      finalRefreshes:
        this.finalRefreshes,
      finalRefreshBlocks:
        this.finalRefreshBlocks,
      inFlight:
        this.inFlight.size,
      lastResult:
        this.lastResult
          ? clone(
              this.lastResult,
            )
          : null,
      lastFinalRefresh:
        this.lastFinalRefresh
          ? clone(
              this.lastFinalRefresh,
            )
          : null,
      safety:
        safety(),
    });
  }

  private async refreshRouteLegs(
    route: {
      readonly market: string;
      readonly buyExchange: StrategyOneTinyLiveBasketExchange;
      readonly sellExchange: StrategyOneTinyLiveBasketExchange;
    },
  ): Promise<readonly StrategyOneActionTimeBookRefreshLeg[]> {
    return withDeadline(
      Promise.all(
        [route.buyExchange, route.sellExchange].map((exchange) => {
          if (exchange === "coindcx") {
            return this.dependencies.refreshCoinDCX(
              route.market,
              ACTION_TIME_READ_TIMEOUT_MS,
            );
          }
          if (exchange === "binance") {
            return this.dependencies.refreshBinance(
              route.market,
              ACTION_TIME_READ_TIMEOUT_MS,
            );
          }
          return this.dependencies.refreshBybit(
            route.market,
            ACTION_TIME_READ_TIMEOUT_MS,
          );
        }),
      ),
      ACTION_TIME_REFRESH_DEADLINE_MS,
      "Parallel action-time book refresh exceeded its service-owned deadline.",
    );
  }

  private async run(
    route: {
      readonly market: string;
      readonly buyExchange: StrategyOneTinyLiveBasketExchange;
      readonly sellExchange: StrategyOneTinyLiveBasketExchange;
    },
    startedAt: number,
  ): Promise<StrategyOneActionTimeBookRefreshResult> {
    let legs:
      readonly StrategyOneActionTimeBookRefreshLeg[];

    try {
      legs = await this.refreshRouteLegs(
        route,
      );
    } catch (
      error:
        unknown
    ) {
      const completedAt =
        this.dependencies
          .now();

      return report({
        state:
          "BLOCKED",
        route,
        startedAt,
        completedAt,
        legs:
          [],
        opportunity:
          null,
        blocker:
          error instanceof Error
            ? `Parallel action-time book refresh failed closed: ${error.message}`
            : "Parallel action-time book refresh failed closed.",
      });
    }

    const failedLegs =
      legs.filter(
        (
          leg,
        ) =>
          !leg.accepted ||
          leg.receivedAt ===
            null,
      );

    if (
      failedLegs.length >
        0
    ) {
      const completedAt =
        this.dependencies
          .now();

      return report({
        state:
          "BLOCKED",
        route,
        startedAt,
        completedAt,
        legs,
        opportunity:
          null,
        blocker:
          failedLegs
            .map(
              (
                leg,
              ) =>
                `${leg.exchange}: ${leg.error ?? "fresh public depth was unavailable"}`,
            )
            .join(
              " | ",
            ),
      });
    }

    const receivedAtByExchange = new Map(
      legs.map((leg) => [leg.exchange.trim().toLowerCase(), leg.receivedAt] as const),
    );
    const evaluation =
      this.dependencies
        .evaluateExactRoute({
          market:
            route.market,
          buyExchange:
            route.buyExchange,
          sellExchange:
            route.sellExchange,
          minimumBuyTimestamp:
            receivedAtByExchange.get(
              route.buyExchange,
            ) ??
            Number.POSITIVE_INFINITY,
          minimumSellTimestamp:
            receivedAtByExchange.get(
              route.sellExchange,
            ) ??
            Number.POSITIVE_INFINITY,
        });
    const refreshedOpportunity =
      evaluation.opportunity?.decision ===
        "EXECUTE" &&
      routeMatches(
        route,
        evaluation.opportunity,
      )
        ? evaluation.opportunity
        : null;

    const completedAt =
      this.dependencies
        .now();

    if (
      !refreshedOpportunity
    ) {
      return report({
        state:
          "BLOCKED",
        route,
        startedAt,
        completedAt,
        legs,
        evaluation,
        opportunity:
          null,
        blocker:
          describeEvaluationBlocker(
            evaluation,
          ),
      });
    }

    return report({
      state:
        "REFRESHED",
      route,
      startedAt,
      completedAt,
      legs,
      evaluation,
      opportunity:
        refreshedOpportunity,
      blocker:
        null,
    });
  }
}

async function withDeadline<T>(
  operation:
    Promise<T>,
  timeoutMs:
    number,
  message:
    string,
): Promise<T> {
  let timer:
    NodeJS.Timeout | null =
    null;

  const deadline =
    new Promise<never>(
      (
        _resolve,
        reject,
      ) => {
        timer =
          setTimeout(
            () => {
              reject(
                new Error(
                  message,
                ),
              );
            },
            timeoutMs,
          );
      },
    );

  try {
    return await Promise.race([
      operation,
      deadline,
    ]);
  } finally {
    if (
      timer
    ) {
      clearTimeout(
        timer,
      );
    }
  }
}

function normalizeRoute(
  input:
    StrategyOneActionTimeBookRefreshRoute,
): {
  readonly market: string;
  readonly buyExchange: StrategyOneTinyLiveBasketExchange;
  readonly sellExchange: StrategyOneTinyLiveBasketExchange;
} {
  const market =
    input.market
      .trim()
      .toUpperCase();

  const buyExchange =
    input.buyExchange
      .trim()
      .toLowerCase();

  const sellExchange =
    input.sellExchange
      .trim()
      .toLowerCase();

  if (!isStrategyOneTinyLiveBasketRoute({market, buyExchange, sellExchange})) {
    throw new Error(
      "Action-time parallel public book refresh is restricted to approved dynamic-pool routes.",
    );
  }

  return {
    market,
    buyExchange: buyExchange as StrategyOneTinyLiveBasketExchange,
    sellExchange: sellExchange as StrategyOneTinyLiveBasketExchange,
  };
}

function routeMatches(
  route: {
    readonly market: string;
    readonly buyExchange: string;
    readonly sellExchange: string;
  },
  opportunity:
    ArbitrageOpportunity,
): boolean {
  return (
    opportunity.pair.market
      .trim()
      .toUpperCase() ===
      route.market &&
    opportunity.pair.buy.exchange
      .trim()
      .toLowerCase() ===
      route.buyExchange &&
    opportunity.pair.sell.exchange
      .trim()
      .toLowerCase() ===
      route.sellExchange
  );
}

function key(
  route: {
    readonly market: string;
    readonly buyExchange: string;
    readonly sellExchange: string;
  },
): string {
  return `${route.market}:${route.buyExchange}->${route.sellExchange}`;
}

function report(
  input: {
    readonly state:
      StrategyOneActionTimeBookRefreshResult["state"];
    readonly route:
      StrategyOneActionTimeBookRefreshResult["route"];
    readonly startedAt: number;
    readonly completedAt: number;
    readonly legs: readonly StrategyOneActionTimeBookRefreshLeg[];
    readonly evaluation?: ExactRouteEvaluationResult | null;
    readonly opportunity: ArbitrageOpportunity | null;
    readonly blocker: string | null;
  },
): StrategyOneActionTimeBookRefreshResult {
  return freeze({
    schemaVersion:
      "149.0" as const,
    ...input,
    durationMs:
      Math.max(
        0,
        input.completedAt -
          input.startedAt,
      ),
    legs:
      input.legs.map(
        clone,
      ),
    evaluation:
      input.evaluation
        ? clone(
            input.evaluation,
          )
        : null,
    opportunity:
      input.opportunity
        ? clone(
            input.opportunity,
          )
        : null,
    safety:
      safety(),
  });
}

function finalRefreshReport(
  input: {
    readonly state:
      StrategyOneAuthorizedFinalBookRefreshResult["state"];
    readonly route:
      StrategyOneAuthorizedFinalBookRefreshResult["route"];
    readonly startedAt: number;
    readonly completedAt: number;
    readonly legs: readonly StrategyOneActionTimeBookRefreshLeg[];
    readonly blocker: string | null;
  },
): StrategyOneAuthorizedFinalBookRefreshResult {
  return freeze({
    schemaVersion:
      "188.2" as const,
    ...input,
    durationMs:
      Math.max(
        0,
        input.completedAt -
          input.startedAt,
      ),
    legs:
      input.legs.map(
        clone,
      ),
    safety: {
      publicReadOnly:
        true as const,
      authorizedAttemptOnly:
        true as const,
      parallelReads:
        true as const,
      thresholdChanged:
        false as const,
      timestampFabricationAllowed:
        false as const,
      orderSubmissionAllowed:
        false as const,
      automaticRetryAllowed:
        false as const,
      transferAllowed:
        false as const,
      withdrawalAllowed:
        false as const,
    },
  });
}

function describeEvaluationBlocker(
  evaluation:
    ExactRouteEvaluationResult,
): string {
  const evidence =
    evaluation.evidence;
  const code =
    evaluation.rejection?.code ??
    "EXACT_ROUTE_REJECTED";
  const rawSpread =
    evidence.rawSpreadPercent ===
      null
      ? "n/a"
      : `${evidence.rawSpreadPercent.toFixed(6)}%`;
  const buyPrice =
    evidence.buyPrice ??
    "n/a";
  const sellPrice =
    evidence.sellPrice ??
    "n/a";

  return `${code}: ${evaluation.reason} Refreshed BUY ask ${buyPrice}, SELL bid ${sellPrice}, raw spread ${rawSpread}.`;
}

function safety() {
  return {
    publicReadOnly:
      true as const,
    parallelReads:
      true as const,
    thresholdChanged:
      false as const,
    timestampFabricationAllowed:
      false as const,
    orderSubmissionAllowed:
      false as const,
    automaticRetryAllowed:
      false as const,
    transferAllowed:
      false as const,
    withdrawalAllowed:
      false as const,
  };
}

function clone<T>(
  value:
    T,
): T {
  return structuredClone(
    value,
  );
}

function freeze<T>(
  value:
    T,
): T {
  if (
    typeof value !==
      "object" ||
    value ===
      null ||
    Object.isFrozen(
      value,
    )
  ) {
    return value;
  }

  for (
    const child
    of Object.values(
      value,
    )
  ) {
    freeze(
      child,
    );
  }

  return Object.freeze(
    value,
  );
}

export const strategyOneActionTimeBookRefreshService =
  new StrategyOneActionTimeBookRefreshService();
