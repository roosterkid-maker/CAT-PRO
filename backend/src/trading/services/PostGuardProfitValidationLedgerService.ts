import type {
  PaperTrade,
} from "../models/PaperTrade";

import {
  paperTradeStore,
} from "./PaperTradeStore";

const STRATEGY_ID =
  "cross-exchange-arbitrage";

const MINIMUM_VALIDATION_TRADES =
  50;

const TARGET_VALIDATION_TRADES =
  100;

const MINIMUM_ROUTE_SAMPLE =
  10;

const ROUTE_QUARANTINE_MS =
  30 *
  60 *
  1_000;

export type PostGuardValidationStatus =
  | "NO_DATA"
  | "COLLECTING"
  | "VALIDATING"
  | "SAMPLE_COMPLETE";

export type PostGuardExpectancyDecision =
  | "NO_DATA"
  | "INSUFFICIENT_SAMPLE"
  | "POSITIVE_EXPECTANCY_OBSERVED"
  | "NON_POSITIVE_EXPECTANCY";

export type PostGuardRouteState =
  | "COLLECTING"
  | "ELIGIBLE"
  | "QUARANTINED"
  | "PROBE_ELIGIBLE";

export interface PostGuardProfitMetrics {
  trades: number;

  wins: number;

  losses: number;

  breakEven: number;

  winRatePercent: number | null;

  netPnl: number;

  expectancyPerTrade: number | null;

  profitFactor: number | null;

  profitFactorState:
    | "AVAILABLE"
    | "NO_LOSSES"
    | "NO_DATA";

  maximumDrawdown: number;

  totalCapital: number;

  totalFees: number;

  feeDragPercent: number | null;

  averageNetReturnPercent: number | null;

  averageAdverseSlippagePercent: number | null;
}

export interface PostGuardRouteProfitability {
  routeKey: string;

  market: string;

  buyExchange: string;

  sellExchange: string;

  state:
    PostGuardRouteState;

  paperAdmissionAllowed: boolean;

  quarantineUntil: number | null;

  latestClosedAt: number | null;

  metrics:
    PostGuardProfitMetrics;
}

export interface PostGuardMarketProfitability {
  market: string;

  metrics:
    PostGuardProfitMetrics;
}

export interface PostGuardProfitValidationReport {
  version: "83.0";

  generatedAt: number;

  strategyId:
    "cross-exchange-arbitrage";

  cohort:
    "CROSS_VENUE_PRICE_CREDIBILITY_V1+STRATEGY_ONE_PAPER_STRESS_V1";

  cohortStartedAt: number | null;

  latestTradeAt: number | null;

  validationStatus:
    PostGuardValidationStatus;

  expectancyDecision:
    PostGuardExpectancyDecision;

  minimumValidationTrades: number;

  targetValidationTrades: number;

  remainingMinimumTrades: number;

  remainingTargetTrades: number;

  readyForVpsPaperReview: boolean;

  overall:
    PostGuardProfitMetrics;

  routes:
    readonly PostGuardRouteProfitability[];

  markets:
    readonly PostGuardMarketProfitability[];

  quarantinedRoutes: number;

  safety: {
    taggedSettlementsOnly: true;

    historicalTradesExcluded: true;

    minimumRouteSample: number;

    routeQuarantineMs: number;

    paperAdmissionMayBeBlocked: true;

    liveExecutionAllowed: false;

    orderSubmissionAllowed: false;
  };
}

export interface PostGuardPaperAdmissionDecision {
  allowed: boolean;

  routeKey: string;

  state:
    PostGuardRouteState;

  sampleSize: number;

  quarantineUntil: number | null;

  reasons: readonly string[];

  liveExecutionAllowed: false;

  orderSubmissionAllowed: false;
}

export interface PostGuardProfitValidationDependencies {
  getTrades(): readonly PaperTrade[];

  getRevision?(): number;
}

const DEFAULT_DEPENDENCIES:
  PostGuardProfitValidationDependencies = {
  getTrades:
    () =>
      paperTradeStore
        .getAllForReadOnlyAggregation(),

  getRevision:
    () =>
      paperTradeStore
        .getSettledRevision(),
};

interface RouteIdentity {
  market: string;

  buyExchange: string;

  sellExchange: string;
}

/**
 * Read-only profitability truth for automatic PAPER trades that carry both
 * durable V1 price-credibility and final depth/fee stress evidence. It never
 * backfills partial historical evidence and only quarantines an exact PAPER
 * route after a meaningful losing sample.
 */
export class PostGuardProfitValidationLedgerService {
  private readonly dependencies:
    PostGuardProfitValidationDependencies;

  private cachedReport:
    PostGuardProfitValidationReport | null =
    null;

  private cachedRevision:
    number | null =
    null;

  private cachedAt:
    number | null =
    null;

  private cachedValidUntil =
    Number.NEGATIVE_INFINITY;

  constructor(
    dependencies:
      Partial<PostGuardProfitValidationDependencies> = {},
  ) {
    const usesDefaultTradeStore =
      dependencies.getTrades ===
      undefined;

    this.dependencies = {
      getTrades:
        dependencies.getTrades ??
        DEFAULT_DEPENDENCIES.getTrades,
      getRevision:
        dependencies.getRevision ??
        (
          usesDefaultTradeStore
            ? DEFAULT_DEPENDENCIES.getRevision
            : undefined
        ),
    };
  }

  getReport(
    now =
      Date.now(),
  ): PostGuardProfitValidationReport {
    this.assertTimestamp(
      now,
    );

    const revision =
      this.dependencies
        .getRevision?.();

    const revisionCanBeCached =
      typeof revision ===
        "number" &&
      Number.isSafeInteger(
        revision,
      ) &&
      revision >=
        0;

    if (
      revisionCanBeCached &&
      this.cachedReport !==
        null &&
      this.cachedRevision ===
        revision &&
      this.cachedAt !==
        null &&
      now >=
        this.cachedAt &&
      now <
        this.cachedValidUntil
    ) {
      return structuredClone({
        ...this.cachedReport,
        generatedAt:
          now,
      });
    }

    const report =
      this.analyze(
      this.dependencies
        .getTrades(),
      now,
    );

    if (
      revisionCanBeCached
    ) {
      this.cachedReport =
        structuredClone(
          report,
        );
      this.cachedRevision =
        revision;
      this.cachedAt =
        now;
      this.cachedValidUntil =
        report.routes.reduce(
          (
            earliest,
            route,
          ) =>
            route.state ===
                "QUARANTINED" &&
              route.quarantineUntil !==
                null &&
              route.quarantineUntil >
                now
              ? Math.min(
                  earliest,
                  route.quarantineUntil,
                )
              : earliest,
          Number.POSITIVE_INFINITY,
        );
    }

    return report;
  }

  analyze(
    trades:
      readonly PaperTrade[],

    now =
      Date.now(),
  ): PostGuardProfitValidationReport {
    this.assertTimestamp(
      now,
    );

    const cohortTrades =
      trades
        .filter(
          isPostGuardSettledTrade,
        )
        .sort(
          (
            first,
            second,
          ) =>
            getClosedAt(
              first,
            ) -
            getClosedAt(
              second,
            ),
        );

    const overall =
      calculateMetrics(
        cohortTrades,
      );

    const routeGroups =
      groupBy(
        cohortTrades,
        (trade) =>
          createRouteKey({
            market:
              trade.market,
            buyExchange:
              trade.buyExchange,
            sellExchange:
              trade.sellExchange,
          }),
      );

    const routes =
      Array.from(
        routeGroups.entries(),
      )
        .map(
          (
            [
              routeKey,
              routeTrades,
            ],
          ) =>
            this.toRoute(
              routeKey,
              routeTrades,
              now,
            ),
        )
        .sort(
          (
            first,
            second,
          ) =>
            second.metrics.trades -
              first.metrics.trades ||
            second.metrics.netPnl -
              first.metrics.netPnl ||
            first.routeKey.localeCompare(
              second.routeKey,
            ),
        );

    const marketGroups =
      groupBy(
        cohortTrades,
        (trade) =>
          normalizeMarket(
            trade.market,
          ),
      );

    const markets =
      Array.from(
        marketGroups.entries(),
      )
        .map(
          (
            [
              market,
              marketTrades,
            ],
          ) => ({
            market,
            metrics:
              calculateMetrics(
                marketTrades,
              ),
          }),
        )
        .sort(
          (
            first,
            second,
          ) =>
            second.metrics.netPnl -
              first.metrics.netPnl ||
            first.market.localeCompare(
              second.market,
            ),
        );

    const validationStatus:
      PostGuardValidationStatus =
      overall.trades ===
        0
        ? "NO_DATA"
        : overall.trades <
            MINIMUM_VALIDATION_TRADES
          ? "COLLECTING"
          : overall.trades <
              TARGET_VALIDATION_TRADES
            ? "VALIDATING"
            : "SAMPLE_COMPLETE";

    const expectancyDecision:
      PostGuardExpectancyDecision =
      overall.trades ===
        0
        ? "NO_DATA"
        : overall.trades <
            TARGET_VALIDATION_TRADES
          ? "INSUFFICIENT_SAMPLE"
          : (
              overall
                .expectancyPerTrade ??
              0
            ) >
              0 &&
            (
              overall
                .profitFactor ===
                null ||
              overall
                .profitFactor >
                1
            )
            ? "POSITIVE_EXPECTANCY_OBSERVED"
            : "NON_POSITIVE_EXPECTANCY";

    const quarantinedRoutes =
      routes.filter(
        (route) =>
          route.state ===
          "QUARANTINED",
      ).length;

    return {
      version:
        "83.0",
      generatedAt:
        now,
      strategyId:
        "cross-exchange-arbitrage",
      cohort:
        "CROSS_VENUE_PRICE_CREDIBILITY_V1+STRATEGY_ONE_PAPER_STRESS_V1",
      cohortStartedAt:
        cohortTrades[0]
          ? getClosedAt(
              cohortTrades[0],
            )
          : null,
      latestTradeAt:
        cohortTrades[
          cohortTrades.length -
            1
        ]
          ? getClosedAt(
              cohortTrades[
                cohortTrades.length -
                  1
              ]!,
            )
          : null,
      validationStatus,
      expectancyDecision,
      minimumValidationTrades:
        MINIMUM_VALIDATION_TRADES,
      targetValidationTrades:
        TARGET_VALIDATION_TRADES,
      remainingMinimumTrades:
        Math.max(
          0,
          MINIMUM_VALIDATION_TRADES -
            overall.trades,
        ),
      remainingTargetTrades:
        Math.max(
          0,
          TARGET_VALIDATION_TRADES -
            overall.trades,
        ),
      readyForVpsPaperReview:
        expectancyDecision ===
          "POSITIVE_EXPECTANCY_OBSERVED" &&
        quarantinedRoutes ===
          0,
      overall,
      routes,
      markets,
      quarantinedRoutes,
      safety: {
        taggedSettlementsOnly:
          true,
        historicalTradesExcluded:
          true,
        minimumRouteSample:
          MINIMUM_ROUTE_SAMPLE,
        routeQuarantineMs:
          ROUTE_QUARANTINE_MS,
        paperAdmissionMayBeBlocked:
          true,
        liveExecutionAllowed:
          false,
        orderSubmissionAllowed:
          false,
      },
    };
  }

  evaluateAdmission(
    route:
      RouteIdentity,

    now =
      Date.now(),
  ): PostGuardPaperAdmissionDecision {
    const routeKey =
      createRouteKey(
        route,
      );

    const existing =
      this.getReport(
        now,
      )
        .routes
        .find(
          (candidate) =>
            candidate.routeKey ===
            routeKey,
        );

    if (
      !existing
    ) {
      return {
        allowed:
          true,
        routeKey,
        state:
          "COLLECTING",
        sampleSize:
          0,
        quarantineUntil:
          null,
        reasons: [
          "No post-guard settled sample exists for this exact PAPER route; evidence collection is allowed.",
        ],
        liveExecutionAllowed:
          false,
        orderSubmissionAllowed:
          false,
      };
    }

    return {
      allowed:
        existing
          .paperAdmissionAllowed,
      routeKey,
      state:
        existing.state,
      sampleSize:
        existing.metrics.trades,
      quarantineUntil:
        existing.quarantineUntil,
      reasons:
        existing
          .paperAdmissionAllowed
          ? [
              existing.state ===
                "PROBE_ELIGIBLE"
                ? "The losing route quarantine expired; one new PAPER probe may refresh evidence."
                : `Post-guard route state ${existing.state} permits PAPER evidence collection.`,
            ]
          : [
              `Exact PAPER route ${routeKey} is quarantined after ${existing.metrics.trades} post-guard trades with expectancy ${formatMetric(
                existing.metrics
                  .expectancyPerTrade,
              )}.`,
              `Quarantine expires at ${existing.quarantineUntil ?? "NO_DATA"}; no account, LIVE, or order authority is changed.`,
            ],
      liveExecutionAllowed:
        false,
      orderSubmissionAllowed:
        false,
    };
  }

  private toRoute(
    routeKey:
      string,

    trades:
      readonly PaperTrade[],

    now:
      number,
  ): PostGuardRouteProfitability {
    const latest =
      trades[
        trades.length -
          1
      ]!;

    const metrics =
      calculateMetrics(
        trades,
      );

    const latestClosedAt =
      getClosedAt(
        latest,
      );

    const losingSample =
      metrics.trades >=
        MINIMUM_ROUTE_SAMPLE &&
      (
        metrics
          .expectancyPerTrade ??
        0
      ) <=
        0;

    const quarantineUntil =
      losingSample
        ? latestClosedAt +
          ROUTE_QUARANTINE_MS
        : null;

    const state:
      PostGuardRouteState =
      metrics.trades <
        MINIMUM_ROUTE_SAMPLE
        ? "COLLECTING"
        : !losingSample
          ? "ELIGIBLE"
          : now <
              quarantineUntil!
            ? "QUARANTINED"
            : "PROBE_ELIGIBLE";

    return {
      routeKey,
      market:
        normalizeMarket(
          latest.market,
        ),
      buyExchange:
        normalizeExchange(
          latest.buyExchange,
        ),
      sellExchange:
        normalizeExchange(
          latest.sellExchange,
        ),
      state,
      paperAdmissionAllowed:
        state !==
        "QUARANTINED",
      quarantineUntil,
      latestClosedAt,
      metrics,
    };
  }

  private assertTimestamp(
    now:
      number,
  ): void {
    if (
      !Number.isSafeInteger(
        now,
      ) ||
      now <=
        0
    ) {
      throw new Error(
        "Post-guard profit validation timestamp must be a positive safe integer.",
      );
    }
  }
}

function calculateMetrics(
  trades:
    readonly PaperTrade[],
): PostGuardProfitMetrics {
  const pnl =
    trades.map(
      (trade) =>
        trade.actualProfit ??
        0,
    );

  const wins =
    pnl.filter(
      (value) =>
        value >
        0,
    );

  const losses =
    pnl.filter(
      (value) =>
        value <
        0,
    );

  const netPnl =
    sum(
      pnl,
    );

  const winningPnl =
    sum(
      wins,
    );

  const losingPnl =
    Math.abs(
      sum(
        losses,
      ),
    );

  const totalCapital =
    sum(
      trades.map(
        (trade) =>
          trade.capital,
      ),
    );

  const totalFees =
    sum(
      trades.map(
        (trade) =>
          trade.estimatedFees,
      ),
    );

  const returns =
    trades
      .map(
        (trade) =>
          trade.actualProfitPercent,
      )
      .filter(
        (
          value,
        ): value is number =>
          typeof value ===
            "number" &&
          Number.isFinite(
            value,
          ),
      );

  const slippage =
    trades
      .map(
        (trade) =>
          trade.executionQuality
            ?.combinedAdverseSlippagePercent,
      )
      .filter(
        (
          value,
        ): value is number =>
          typeof value ===
            "number" &&
          Number.isFinite(
            value,
          ),
      );

  return {
    trades:
      trades.length,
    wins:
      wins.length,
    losses:
      losses.length,
    breakEven:
      trades.length -
        wins.length -
        losses.length,
    winRatePercent:
      trades.length >
        0
        ? wins.length /
          trades.length *
          100
        : null,
    netPnl,
    expectancyPerTrade:
      trades.length >
        0
        ? netPnl /
          trades.length
        : null,
    profitFactor:
      losingPnl >
        0
        ? winningPnl /
          losingPnl
        : null,
    profitFactorState:
      trades.length ===
        0
        ? "NO_DATA"
        : losingPnl ===
            0
          ? "NO_LOSSES"
          : "AVAILABLE",
    maximumDrawdown:
      calculateMaximumDrawdown(
        pnl,
      ),
    totalCapital,
    totalFees,
    feeDragPercent:
      totalCapital >
        0
        ? totalFees /
          totalCapital *
          100
        : null,
    averageNetReturnPercent:
      returns.length >
        0
        ? sum(
            returns,
          ) /
          returns.length
        : null,
    averageAdverseSlippagePercent:
      slippage.length >
        0
        ? sum(
            slippage,
          ) /
          slippage.length
        : null,
  };
}

function calculateMaximumDrawdown(
  pnl:
    readonly number[],
): number {
  let cumulative =
    0;

  let peak =
    0;

  let maximumDrawdown =
    0;

  for (
    const value
    of pnl
  ) {
    cumulative +=
      value;

    peak =
      Math.max(
        peak,
        cumulative,
      );

    maximumDrawdown =
      Math.max(
        maximumDrawdown,
        peak -
          cumulative,
      );
  }

  return maximumDrawdown;
}

function isPostGuardSettledTrade(
  trade:
    PaperTrade,
): boolean {
  const credibility =
    trade.priceCredibility;

  const stress =
    trade.paperExecutionStress;

  const quality =
    trade.executionQuality;

  return (
    trade
      .strategyAttribution
      .strategyId ===
      STRATEGY_ID &&
    trade.status ===
      "closed" &&
    trade.closedAt !==
      null &&
    typeof trade.actualProfit ===
      "number" &&
    Number.isFinite(
      trade.actualProfit,
    ) &&
    typeof trade.actualProfitPercent ===
      "number" &&
    Number.isFinite(
      trade.actualProfitPercent,
    ) &&
    Number.isFinite(
      trade.capital,
    ) &&
    trade.capital >
      0 &&
    Number.isFinite(
      trade.estimatedFees,
    ) &&
    trade.estimatedFees >=
      0 &&
    credibility?.guard ===
      "CROSS_VENUE_PRICE_CREDIBILITY_V1" &&
    credibility.outcome ===
      "PASSED" &&
    normalizeMarket(
      credibility.market,
    ) ===
      normalizeMarket(
        trade.market,
      ) &&
    normalizeExchange(
      credibility.buyExchange,
    ) ===
      normalizeExchange(
        trade.buyExchange,
      ) &&
    normalizeExchange(
      credibility.sellExchange,
    ) ===
      normalizeExchange(
        trade.sellExchange,
      ) &&
    stress?.guard ===
      "STRATEGY_ONE_PAPER_STRESS_V1" &&
    stress.outcome ===
      "PASSED" &&
    stress.paperOnly ===
      true &&
    stress.liveExecutionAllowed ===
      false &&
    stress.orderSubmissionAllowed ===
      false &&
    quality?.schemaVersion ===
      1 &&
    Number.isFinite(
      quality.combinedAdverseSlippagePercent,
    ) &&
    quality.combinedAdverseSlippagePercent >=
      0
  );
}

function createRouteKey(
  route:
    RouteIdentity,
): string {
  return `${normalizeMarket(
    route.market,
  )}|${normalizeExchange(
    route.buyExchange,
  )}>${normalizeExchange(
    route.sellExchange,
  )}`;
}

function normalizeMarket(
  value:
    string,
): string {
  return value
    .trim()
    .toUpperCase();
}

function normalizeExchange(
  value:
    string,
): string {
  return value
    .trim()
    .toLowerCase();
}

function getClosedAt(
  trade:
    PaperTrade,
): number {
  return trade.closedAt ??
    trade.openedAt;
}

function groupBy(
  trades:
    readonly PaperTrade[],

  key:
    (
      trade:
        PaperTrade,
    ) => string,
): Map<string, PaperTrade[]> {
  const groups =
    new Map<
      string,
      PaperTrade[]
    >();

  for (
    const trade
    of trades
  ) {
    const groupKey =
      key(
        trade,
      );

    const group =
      groups.get(
        groupKey,
      ) ??
      [];

    group.push(
      trade,
    );

    groups.set(
      groupKey,
      group,
    );
  }

  return groups;
}

function sum(
  values:
    readonly number[],
): number {
  return values.reduce(
    (
      total,
      value,
    ) =>
      total +
      value,
    0,
  );
}

function formatMetric(
  value:
    number | null,
): string {
  return value ===
    null
    ? "NO_DATA"
    : value.toFixed(
        8,
      );
}

export const postGuardProfitValidationLedgerService =
  new PostGuardProfitValidationLedgerService();
