import type {
  ArbitrageOpportunity,
} from "../../arbitrage/models/ArbitrageOpportunity";

import type {
  OpportunitySnapshot,
} from "../../arbitrage/services/OpportunityService";

import {
  assessStrategyOnePilotDispatchReservedFreshness,
} from "../../arbitrage/execution/StrategyOnePilotEquivalentPaperEvidenceService";

import {
  isStrategyOneTinyLiveBasketRoute,
  isStrategyOneTinyLivePreflightDecision,
  strategyOneTinyLiveBasketRouteKey,
} from "../../arbitrage/execution/StrategyOneTinyLiveBasketPolicy";

import {
  strategyOneActionTimeBookRefreshService,
  type StrategyOneActionTimeBookRefreshResult,
  type StrategyOneActionTimeBookRefreshRoute,
} from "../../execution/live/tiny-live/StrategyOneActionTimeBookRefreshService";

import {
  tradingAccountService,
} from "../../trading/account/TradingAccountService";

import {
  isPersonalBotPaperRuntimeArmed,
  personalBotRuntimeControlService,
} from "../../strategies/services/PersonalBotRuntimeControlService";

export interface PaperOpportunityBookRefreshCoordinatorConfig {
  /** Protects shared venue request-weight while cycling across every route. */
  minimumGlobalRefreshIntervalMs: number;

  /** Prevents one continuously visible route monopolising the rescue lane. */
  minimumRouteRefreshIntervalMs: number;
}

export interface PaperOpportunityBookRefreshCoordinatorDependencies {
  refresh(
    route: StrategyOneActionTimeBookRefreshRoute,
  ): Promise<StrategyOneActionTimeBookRefreshResult>;

  isPaperRuntimeArmed(): boolean;

  now(): number;
}

export interface PaperOpportunityBookRefreshCoordinatorDiagnostics {
  readonly schemaVersion: "191.0";
  readonly generatedAt: number;
  readonly snapshotsObserved: number;
  readonly eligibleRoutesObserved: number;
  readonly staleRoutesObserved: number;
  readonly refreshAttempts: number;
  readonly refreshed: number;
  readonly blocked: number;
  readonly cooldownSkips: number;
  readonly paperDisarmedSkips: number;
  readonly lastRouteKey: string | null;
  readonly lastResult: StrategyOneActionTimeBookRefreshResult | null;
  readonly safety: {
    readonly marketHardcodingAllowed: false;
    readonly publicReadOnly: true;
    readonly maximumConcurrentRefreshes: 1;
    readonly liveThresholdChanged: false;
    readonly orderSubmissionAllowed: false;
    readonly automaticRetryAllowed: false;
  };
}

const DEFAULT_CONFIG:
  PaperOpportunityBookRefreshCoordinatorConfig = {
  minimumGlobalRefreshIntervalMs:
    350,
  minimumRouteRefreshIntervalMs:
    700,
};

const DEFAULT_DEPENDENCIES:
  PaperOpportunityBookRefreshCoordinatorDependencies = {
  refresh:
    (route) =>
      strategyOneActionTimeBookRefreshService
        .refresh(
          route,
        ),
  isPaperRuntimeArmed:
    () =>
      isPersonalBotPaperRuntimeArmed({
        control:
          personalBotRuntimeControlService
            .getControl(),
        account:
          tradingAccountService
            .getAccount(),
      }),
  now:
    Date.now,
};

/**
 * Fair, rate-bounded stale-book rescue for automatic PAPER qualification.
 *
 * No market is pinned here. Every current accepted dynamic USDT route is
 * considered, the least-recently attempted stale route wins the one-slot
 * refresh lane, and its exact refreshed opportunity replaces only the same
 * route in the current scheduler snapshot. This grants no order authority and
 * never retries a failed read automatically.
 */
export class PaperOpportunityBookRefreshCoordinatorService {
  private readonly config:
    PaperOpportunityBookRefreshCoordinatorConfig;

  private readonly dependencies:
    PaperOpportunityBookRefreshCoordinatorDependencies;

  private readonly lastAttemptAtByRoute =
    new Map<string, number>();

  private lastGlobalAttemptAt:
    number | null =
    null;

  private snapshotsObserved =
    0;

  private eligibleRoutesObserved =
    0;

  private staleRoutesObserved =
    0;

  private refreshAttempts =
    0;

  private refreshed =
    0;

  private blocked =
    0;

  private cooldownSkips =
    0;

  private paperDisarmedSkips =
    0;

  private lastRouteKey:
    string | null =
    null;

  private lastResult:
    StrategyOneActionTimeBookRefreshResult | null =
    null;

  constructor(
    config:
      Partial<PaperOpportunityBookRefreshCoordinatorConfig> = {},
    dependencies:
      Partial<PaperOpportunityBookRefreshCoordinatorDependencies> = {},
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

  async refreshSnapshot(
    snapshot:
      OpportunitySnapshot,
  ): Promise<OpportunitySnapshot> {
    this.snapshotsObserved +=
      1;

    if (
      !this.dependencies
        .isPaperRuntimeArmed()
    ) {
      this.paperDisarmedSkips +=
        1;

      return snapshot;
    }

    const now =
      this.dependencies
        .now();
    const eligible =
      this.collectEligibleRoutes(
        snapshot.opportunities,
        now,
      );

    this.eligibleRoutesObserved +=
      eligible.total;
    this.staleRoutesObserved +=
      eligible.stale.length;

    if (
      eligible.stale.length ===
        0
    ) {
      return snapshot;
    }

    if (
      this.lastGlobalAttemptAt !==
        null &&
      now -
        this.lastGlobalAttemptAt <
        this.config
          .minimumGlobalRefreshIntervalMs
    ) {
      this.cooldownSkips +=
        1;

      return snapshot;
    }

    const ready =
      eligible.stale
        .filter(
          (
            opportunity,
          ) => {
            const key =
              routeKey(
                opportunity,
              );
            const last =
              this.lastAttemptAtByRoute
                .get(
                  key,
                );

            return last ===
              undefined ||
              now -
                last >=
                this.config
                  .minimumRouteRefreshIntervalMs;
          },
        )
        .sort(
          (
            first,
            second,
          ) => {
            const firstLast =
              this.lastAttemptAtByRoute
                .get(
                  routeKey(
                    first,
                  ),
                ) ??
              Number.NEGATIVE_INFINITY;
            const secondLast =
              this.lastAttemptAtByRoute
                .get(
                  routeKey(
                    second,
                  ),
                ) ??
              Number.NEGATIVE_INFINITY;

            if (
              firstLast !==
              secondLast
            ) {
              return firstLast -
                secondLast;
            }

            return second.netProfitPercent -
              first.netProfitPercent;
          },
        );

    const selected =
      ready[0];

    if (
      !selected
    ) {
      this.cooldownSkips +=
        1;

      return snapshot;
    }

    const selectedRouteKey =
      routeKey(
        selected,
      );

    this.lastGlobalAttemptAt =
      now;
    this.lastAttemptAtByRoute
      .set(
        selectedRouteKey,
        now,
      );
    this.lastRouteKey =
      selectedRouteKey;
    this.refreshAttempts +=
      1;

    const result =
      await this.dependencies
        .refresh({
          market:
            selected.pair.market,
          buyExchange:
            selected.pair.buy.exchange,
          sellExchange:
            selected.pair.sell.exchange,
        });

    this.lastResult =
      structuredClone(
        result,
      );

    if (
      result.state !==
        "REFRESHED" ||
      !result.opportunity
    ) {
      this.blocked +=
        1;

      return snapshot;
    }

    this.refreshed +=
      1;

    return replaceExactRoute(
      snapshot,
      selectedRouteKey,
      result.opportunity,
    );
  }

  getDiagnostics():
    PaperOpportunityBookRefreshCoordinatorDiagnostics {
    return Object.freeze({
      schemaVersion:
        "191.0" as const,
      generatedAt:
        this.dependencies
          .now(),
      snapshotsObserved:
        this.snapshotsObserved,
      eligibleRoutesObserved:
        this.eligibleRoutesObserved,
      staleRoutesObserved:
        this.staleRoutesObserved,
      refreshAttempts:
        this.refreshAttempts,
      refreshed:
        this.refreshed,
      blocked:
        this.blocked,
      cooldownSkips:
        this.cooldownSkips,
      paperDisarmedSkips:
        this.paperDisarmedSkips,
      lastRouteKey:
        this.lastRouteKey,
      lastResult:
        this.lastResult
          ? structuredClone(
              this.lastResult,
            )
          : null,
      safety: {
        marketHardcodingAllowed:
          false as const,
        publicReadOnly:
          true as const,
        maximumConcurrentRefreshes:
          1 as const,
        liveThresholdChanged:
          false as const,
        orderSubmissionAllowed:
          false as const,
        automaticRetryAllowed:
          false as const,
      },
    });
  }

  private collectEligibleRoutes(
    opportunities:
      readonly ArbitrageOpportunity[],
    now:
      number,
  ): {
    total: number;
    stale: ArbitrageOpportunity[];
  } {
    const deduplicated =
      new Map<string, ArbitrageOpportunity>();

    for (
      const opportunity
      of opportunities
    ) {
      if (
        !isStrategyOneTinyLivePreflightDecision(
          opportunity.decision,
        ) ||
        !isStrategyOneTinyLiveBasketRoute({
          market:
            opportunity.pair.market,
          buyExchange:
            opportunity.pair.buy.exchange,
          sellExchange:
            opportunity.pair.sell.exchange,
        })
      ) {
        continue;
      }

      const key =
        routeKey(
          opportunity,
        );
      const existing =
        deduplicated.get(
          key,
        );

      if (
        !existing ||
        opportunity.netProfitPercent >
          existing.netProfitPercent
      ) {
        deduplicated.set(
          key,
          opportunity,
        );
      }
    }

    const stale =
      Array.from(
        deduplicated.values(),
      )
        .filter(
          (
            opportunity,
          ) =>
            !assessStrategyOnePilotDispatchReservedFreshness({
              buyExchange:
                opportunity.pair.buy.exchange,
              sellExchange:
                opportunity.pair.sell.exchange,
              buyTimestamp:
                opportunity.pair.buy.timestamp,
              sellTimestamp:
                opportunity.pair.sell.timestamp,
              quotesAreFresh:
                opportunity.quotesAreFresh,
              usedLastPriceFallback:
                opportunity.usedLastPriceFallback,
              now,
            }).passed,
        );

    return {
      total:
        deduplicated.size,
      stale,
    };
  }

  private validateConfig():
    void {
    for (
      const value
      of [
        this.config
          .minimumGlobalRefreshIntervalMs,
        this.config
          .minimumRouteRefreshIntervalMs,
      ]
    ) {
      if (
        !Number.isSafeInteger(
          value,
        ) ||
        value <
          0
      ) {
        throw new Error(
          "PAPER opportunity book refresh cooldowns must be non-negative safe integers.",
        );
      }
    }
  }
}

function replaceExactRoute(
  snapshot:
    OpportunitySnapshot,
  selectedRouteKey:
    string,
  refreshed:
    ArbitrageOpportunity,
): OpportunitySnapshot {
  const opportunities =
    snapshot.opportunities
      .map(
        (
          opportunity,
        ) =>
          routeKey(
            opportunity,
          ) ===
            selectedRouteKey
            ? structuredClone(
                refreshed,
              )
            : opportunity,
      );

  const pilotRouteBooks =
    snapshot.pilotRouteBooks
      ?.map(
        (
          observation,
        ) =>
          strategyOneTinyLiveBasketRouteKey(
            observation,
          ) ===
            selectedRouteKey
            ? {
                market:
                  refreshed.pair.market,
                buyExchange:
                  refreshed.pair.buy.exchange as "binance" | "bybit" | "coindcx",
                sellExchange:
                  refreshed.pair.sell.exchange as "binance" | "bybit" | "coindcx",
                buyTimestamp:
                  refreshed.pair.buy.timestamp,
                sellTimestamp:
                  refreshed.pair.sell.timestamp,
              }
            : observation,
      );

  return {
    ...snapshot,
    opportunities,
    ...(
      pilotRouteBooks
        ? {
            pilotRouteBooks,
          }
        : {}
    ),
  };
}

function routeKey(
  opportunity:
    ArbitrageOpportunity,
): string {
  return strategyOneTinyLiveBasketRouteKey({
    market:
      opportunity.pair.market,
    buyExchange:
      opportunity.pair.buy.exchange,
    sellExchange:
      opportunity.pair.sell.exchange,
  });
}

export const paperOpportunityBookRefreshCoordinatorService =
  new PaperOpportunityBookRefreshCoordinatorService();
