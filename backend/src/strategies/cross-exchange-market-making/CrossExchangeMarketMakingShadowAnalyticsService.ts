import type {
  CrossExchangeMarketMakingConfiguration,
} from "./CrossExchangeMarketMakingConfiguration";

import type {
  CrossExchangeMarketMakingFillAndHedgeSnapshot,
  CrossExchangeMarketMakingFillBlocker,
  CrossExchangeMarketMakingHedgeBlocker,
  CrossExchangeMarketMakingHedgeAssessment,
  CrossExchangeMarketMakingSimulatedFill,
} from "./CrossExchangeMarketMakingFillAndHedgeSimulator";

import type {
  CrossExchangeMarketMakingLifecycleEventType,
  CrossExchangeMarketMakingLifecycleSnapshot,
} from "./CrossExchangeMarketMakingMakerLifecycleSimulator";

import type {
  CrossExchangeMarketMakingPriceBlocker,
  CrossExchangeMarketMakingPricingSnapshot,
} from "./CrossExchangeMarketMakingPriceEngine";

export type CrossExchangeMarketMakingShadowReadinessState =
  | "NO_DATA"
  | "COLLECTING"
  | "SHADOW_EVIDENCE_SUFFICIENT";

export type CrossExchangeMarketMakingShadowReadinessGateKey =
  | "CONFIGURATION_READY"
  | "PRICING_SAMPLE_SUFFICIENT"
  | "BOTH_MAKER_SIDES_OBSERVED"
  | "SIMULATED_FILL_SAMPLE_SUFFICIENT"
  | "ALL_FILLS_HEDGE_ASSESSED"
  | "HEDGE_READY_RATE_SUFFICIENT"
  | "MODELED_RETAINED_EDGE_AVAILABLE"
  | "MODELED_RETAINED_EDGE_SUFFICIENT";

export type CrossExchangeMarketMakingPaperReadinessBlocker =
  | "REAL_MAKER_FILL_EVIDENCE_REQUIRED"
  | "QUEUE_AWARE_PARTIAL_FILL_EVIDENCE_REQUIRED"
  | "FILL_PROBABILITY_CALIBRATION_REQUIRED"
  | "HEDGE_BALANCE_EVIDENCE_REQUIRED"
  | "HEDGE_DEPTH_AND_SLIPPAGE_EVIDENCE_REQUIRED"
  | "HEDGE_FAILURE_RECOVERY_EVIDENCE_REQUIRED"
  | "PAPER_EXECUTION_NOT_AUTHORIZED_V21_5";

export interface CrossExchangeMarketMakingShadowAnalyticsConfig {
  readonly minimumPricingEvaluationsPerRoute:
    number;

  readonly minimumSimulatedFillsPerRoute:
    number;

  readonly minimumHedgeReadyRatePercent:
    number;
}

export interface CrossExchangeMarketMakingAnalyticsCount {
  readonly key:
    string;

  readonly count:
    number;
}

export interface CrossExchangeMarketMakingShadowReadinessGate {
  readonly key:
    CrossExchangeMarketMakingShadowReadinessGateKey;

  readonly status:
    | "PASS"
    | "BLOCKED";

  readonly passed:
    boolean;

  readonly evidence:
    string;
}

export interface CrossExchangeMarketMakingRouteAnalytics {
  readonly routeId:
    string;

  readonly market:
    string;

  readonly makerExchange:
    string;

  readonly hedgeExchange:
    string;

  readonly evidenceStatus:
    | "AVAILABLE"
    | "NO_DATA";

  readonly firstObservedAt:
    number | null;

  readonly lastObservedAt:
    number | null;

  readonly pricing: {
    readonly evaluations:
      number;

    readonly accepted:
      number;

    readonly rejected:
      number;

    readonly acceptedBid:
      number;

    readonly acceptedAsk:
      number;

    readonly acceptanceRatePercent:
      number | null;

    readonly averageModeledRetainedEdgePercent:
      number | null;

    readonly rejectionBlockers:
      readonly CrossExchangeMarketMakingAnalyticsCount[];
  };

  readonly lifecycle: {
    readonly placed:
      number;

    readonly monitored:
      number;

    readonly cancelled:
      number;

    readonly repriced:
      number;

    readonly activeOrders:
      number;

    readonly simulatedFilledOrders:
      number;
  };

  readonly fills: {
    readonly assessments:
      number;

    readonly noFillAssessments:
      number;

    readonly simulatedFullFills:
      number;

    readonly simulatedFillEvents:
      number;

    readonly simulatedPartialFills:
      number;

    readonly queueModeledFills:
      number;

    readonly simulatedFillNotional:
      number;

    readonly blockers:
      readonly CrossExchangeMarketMakingAnalyticsCount[];
  };

  readonly hedges: {
    readonly assessed:
      number;

    readonly ready:
      number;

    readonly blocked:
      number;

    readonly readyRatePercent:
      number | null;

    readonly intentsGenerated:
      number;

    readonly blockers:
      readonly CrossExchangeMarketMakingAnalyticsCount[];
  };

  readonly economics: {
    readonly modeledHedgedFills:
      number;

    readonly modeledRetainedQuoteValue:
      number | null;

    readonly modeledRetainedBasisQuoteValue:
      number | null;

    readonly modeledRetainedEdgePercent:
      number | null;

    readonly minimumObservedRetainedEdgePercent:
      number | null;

    readonly maximumObservedRetainedEdgePercent:
      number | null;

    readonly classification:
      "MODELED_SHADOW_ECONOMICS_NOT_REALIZED_PNL";
  };

  readonly readiness: {
    readonly state:
      CrossExchangeMarketMakingShadowReadinessState;

    readonly shadowEvidenceSufficient:
      boolean;

    readonly paperEligible:
      false;

    readonly liveEligible:
      false;

    readonly gates:
      readonly CrossExchangeMarketMakingShadowReadinessGate[];

    readonly paperBlockers:
      readonly CrossExchangeMarketMakingPaperReadinessBlocker[];
  };
}

export interface CrossExchangeMarketMakingShadowAnalyticsSnapshot {
  readonly version:
    "21.5";

  readonly strategyId:
    "cross-exchange-market-making";

  readonly generatedAt:
    number;

  readonly evidenceStatus:
    | "AVAILABLE"
    | "NO_DATA";

  readonly configurationState:
    CrossExchangeMarketMakingConfiguration["state"];

  readonly thresholds:
    CrossExchangeMarketMakingShadowAnalyticsConfig;

  readonly summary: {
    readonly configuredRoutes:
      number;

    readonly evidenceRoutes:
      number;

    readonly shadowReadyRoutes:
      number;

    readonly pricingEvaluations:
      number;

    readonly acceptedPrices:
      number;

    readonly rejectedPrices:
      number;

    readonly simulatedFills:
      number;

    readonly simulatedPartialFills:
      number;

    readonly queueModeledFills:
      number;

    readonly hedgeReady:
      number;

    readonly hedgeBlocked:
      number;

    readonly hedgeIntents:
      number;
  };

  readonly routes:
    readonly CrossExchangeMarketMakingRouteAnalytics[];

  readonly readiness: {
    readonly state:
      CrossExchangeMarketMakingShadowReadinessState;

    readonly shadowEvidenceSufficient:
      boolean;

    readonly paperEligible:
      false;

    readonly liveEligible:
      false;

    readonly blockers:
      readonly string[];

    readonly paperBlockers:
      readonly CrossExchangeMarketMakingPaperReadinessBlocker[];
  };

  readonly notes:
    readonly string[];

  readonly safety: {
    readonly readOnlyAnalytics:
      true;

    readonly simulatedEvidenceOnly:
      true;

    readonly modeledEconomicsAreRealizedPnl:
      false;

    readonly readinessGrantsPaperAuthority:
      false;

    readonly readinessGrantsLiveAuthority:
      false;

    readonly paperExecutionAllowed:
      false;

    readonly liveExecutionAllowed:
      false;

    readonly capitalReservationAllowed:
      false;

    readonly orderSubmissionAllowed:
      false;
  };
}

interface MutableRouteAnalytics {
  routeId: string;
  market: string;
  makerExchange: string;
  hedgeExchange: string;
  firstObservedAt: number | null;
  lastObservedAt: number | null;
  pricingEvaluations: number;
  acceptedPrices: number;
  rejectedPrices: number;
  acceptedBid: number;
  acceptedAsk: number;
  modeledPriceEdgeTotal: number;
  modeledPriceEdgeCount: number;
  pricingBlockers: Map<string, number>;
  lifecyclePlaced: number;
  lifecycleMonitored: number;
  lifecycleCancelled: number;
  lifecycleRepriced: number;
  activeOrders: number;
  fillAssessments: number;
  noFillAssessments: number;
  simulatedFills: number;
  simulatedFullFills: number;
  simulatedPartialFills: number;
  queueModeledFills: number;
  simulatedFillNotional: number;
  fillBlockers: Map<string, number>;
  hedgeAssessed: number;
  hedgeReady: number;
  hedgeBlocked: number;
  hedgeIntents: number;
  hedgeBlockers: Map<string, number>;
  modeledHedgedFills: number;
  retainedQuoteValue: number;
  retainedBasisQuoteValue: number;
  minimumRetainedEdgePercent: number | null;
  maximumRetainedEdgePercent: number | null;
  lastPricingGeneratedAt: number | null;
}

const DEFAULT_CONFIG:
  CrossExchangeMarketMakingShadowAnalyticsConfig = {
  minimumPricingEvaluationsPerRoute:
    100,
  minimumSimulatedFillsPerRoute:
    20,
  minimumHedgeReadyRatePercent:
    95,
};

const PAPER_BLOCKERS:
  readonly CrossExchangeMarketMakingPaperReadinessBlocker[] = [
  "REAL_MAKER_FILL_EVIDENCE_REQUIRED",
  "FILL_PROBABILITY_CALIBRATION_REQUIRED",
  "HEDGE_BALANCE_EVIDENCE_REQUIRED",
  "HEDGE_DEPTH_AND_SLIPPAGE_EVIDENCE_REQUIRED",
  "HEDGE_FAILURE_RECOVERY_EVIDENCE_REQUIRED",
  "PAPER_EXECUTION_NOT_AUTHORIZED_V21_5",
];

/**
 * Aggregates only XEMM-owned SHADOW evidence. It has no dependency on
 * strategy attribution, PAPER accounting, capital, order adapters or LIVE.
 */
export class CrossExchangeMarketMakingShadowAnalyticsService {
  private readonly config:
    CrossExchangeMarketMakingShadowAnalyticsConfig;

  private readonly routes =
    new Map<string, MutableRouteAnalytics>();

  private previousLifecycleEventIds =
    new Set<string>();

  private processedFillCount =
    0;

  constructor(
    config:
      Partial<CrossExchangeMarketMakingShadowAnalyticsConfig> = {},
  ) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };

    if (
      !Number.isSafeInteger(
        this.config
          .minimumPricingEvaluationsPerRoute,
      ) ||
      this.config
        .minimumPricingEvaluationsPerRoute <
        1
    ) {
      throw new Error(
        "minimumPricingEvaluationsPerRoute must be a positive safe integer.",
      );
    }

    if (
      !Number.isSafeInteger(
        this.config
          .minimumSimulatedFillsPerRoute,
      ) ||
      this.config
        .minimumSimulatedFillsPerRoute <
        1
    ) {
      throw new Error(
        "minimumSimulatedFillsPerRoute must be a positive safe integer.",
      );
    }

    if (
      !Number.isFinite(
        this.config
          .minimumHedgeReadyRatePercent,
      ) ||
      this.config
        .minimumHedgeReadyRatePercent <
        0 ||
      this.config
        .minimumHedgeReadyRatePercent >
        100
    ) {
      throw new Error(
        "minimumHedgeReadyRatePercent must be finite and between 0 and 100.",
      );
    }
  }

  observe(
    pricingSnapshots:
      readonly CrossExchangeMarketMakingPricingSnapshot[],
    lifecycle:
      CrossExchangeMarketMakingLifecycleSnapshot,
    fillAndHedge:
      CrossExchangeMarketMakingFillAndHedgeSnapshot,
    configuration:
      CrossExchangeMarketMakingConfiguration,
    now =
      Date.now(),
  ): CrossExchangeMarketMakingShadowAnalyticsSnapshot {
    this.ensureConfiguredRoutes(
      configuration,
    );

    this.observePricing(
      pricingSnapshots,
    );

    this.observeLifecycle(
      lifecycle,
      now,
    );

    this.observeFillAssessments(
      fillAndHedge,
    );

    this.observeNewFills(
      fillAndHedge,
      pricingSnapshots,
    );

    return this.getSnapshot(
      configuration,
      now,
    );
  }

  getSnapshot(
    configuration:
      CrossExchangeMarketMakingConfiguration,
    now =
      Date.now(),
  ): CrossExchangeMarketMakingShadowAnalyticsSnapshot {
    this.ensureConfiguredRoutes(
      configuration,
    );

    const routes =
      Array.from(
        this.routes.values(),
      ).map(
        (route) =>
          this.toRouteReadModel(
            route,
            configuration,
          ),
      ).sort(
        (first, second) =>
          first.routeId.localeCompare(
            second.routeId,
          ),
      );

    const evidenceRoutes =
      routes.filter(
        (route) =>
          route.evidenceStatus ===
          "AVAILABLE",
      ).length;

    const shadowReadyRoutes =
      routes.filter(
        (route) =>
          route.readiness
            .shadowEvidenceSufficient,
      ).length;

    const shadowEvidenceSufficient =
      routes.length >
        0 &&
      shadowReadyRoutes ===
        routes.length;

    const state:
      CrossExchangeMarketMakingShadowReadinessState =
      evidenceRoutes ===
        0
        ? "NO_DATA"
        : shadowEvidenceSufficient
          ? "SHADOW_EVIDENCE_SUFFICIENT"
          : "COLLECTING";

    const routeBlockers =
      routes.flatMap(
        (route) =>
          route.readiness.gates
            .filter(
              (gate) =>
                !gate.passed,
            )
            .map(
              (gate) =>
                `${route.routeId}:${gate.key}`,
            ),
      );

    return immutableClone({
      version:
        "21.5",
      strategyId:
        "cross-exchange-market-making",
      generatedAt:
        now,
      evidenceStatus:
        evidenceRoutes >
          0
          ? "AVAILABLE"
          : "NO_DATA",
      configurationState:
        configuration.state,
      thresholds:
        this.config,
      summary: {
        configuredRoutes:
          routes.length,
        evidenceRoutes,
        shadowReadyRoutes,
        pricingEvaluations:
          this.sum(
            routes,
            (route) =>
              route.pricing
                .evaluations,
          ),
        acceptedPrices:
          this.sum(
            routes,
            (route) =>
              route.pricing
                .accepted,
          ),
        rejectedPrices:
          this.sum(
            routes,
            (route) =>
              route.pricing
                .rejected,
          ),
        simulatedFills:
          this.sum(
            routes,
            (route) =>
              route.fills
                .simulatedFillEvents,
          ),
        simulatedPartialFills:
          this.sum(
            routes,
            (route) =>
              route.fills
                .simulatedPartialFills,
          ),
        queueModeledFills:
          this.sum(
            routes,
            (route) =>
              route.fills
                .queueModeledFills,
          ),
        hedgeReady:
          this.sum(
            routes,
            (route) =>
              route.hedges.ready,
          ),
        hedgeBlocked:
          this.sum(
            routes,
            (route) =>
              route.hedges.blocked,
          ),
        hedgeIntents:
          this.sum(
            routes,
            (route) =>
              route.hedges
                .intentsGenerated,
          ),
      },
      routes,
      readiness: {
        state,
        shadowEvidenceSufficient,
        paperEligible:
          false,
        liveEligible:
          false,
        blockers:
          routeBlockers,
        paperBlockers:
          Array.from(
            new Set(
              routes.flatMap(
                (route) =>
                  route.readiness
                    .paperBlockers,
              ),
            ),
          ),
      },
      notes: [
        "Route metrics contain only XEMM-owned SHADOW pricing, lifecycle, simulated-fill and hedge evidence.",
        "Modeled retained quote value is not realized P&L and is never added to PAPER or portfolio accounting.",
        "SHADOW_EVIDENCE_SUFFICIENT is an analytics milestone, not PAPER or LIVE authorization.",
        "Real fills, partial fills, queue position, balances, deeper hedge slippage and recovery remain unevaluated.",
        "V21.5 can model partial quantity only from bounded public trade prints after conservatively observed queue-ahead depth; it does not infer exchange fills or fill probability.",
      ],
      safety: {
        readOnlyAnalytics:
          true,
        simulatedEvidenceOnly:
          true,
        modeledEconomicsAreRealizedPnl:
          false,
        readinessGrantsPaperAuthority:
          false,
        readinessGrantsLiveAuthority:
          false,
        paperExecutionAllowed:
          false,
        liveExecutionAllowed:
          false,
        capitalReservationAllowed:
          false,
        orderSubmissionAllowed:
          false,
      },
    });
  }

  private observePricing(
    snapshots:
      readonly CrossExchangeMarketMakingPricingSnapshot[],
  ): void {
    for (
      const snapshot
      of snapshots
    ) {
      if (
        !snapshot.makerExchange ||
        !snapshot.hedgeExchange
      ) {
        continue;
      }

      const route =
        this.ensureRoute(
          snapshot.market,
          snapshot.makerExchange,
          snapshot.hedgeExchange,
        );

      if (
        route.lastPricingGeneratedAt !==
          null &&
        snapshot.generatedAt <=
          route.lastPricingGeneratedAt
      ) {
        continue;
      }

      this.observeTime(
        route,
        snapshot.generatedAt,
      );

      route.lastPricingGeneratedAt =
        snapshot.generatedAt;

      for (
        const result
        of snapshot.results
      ) {
        route.pricingEvaluations +=
          1;

        if (
          result.status ===
            "ACCEPTED" &&
          result.evidence
        ) {
          route.acceptedPrices +=
            1;

          if (
            result.side ===
            "BID"
          ) {
            route.acceptedBid +=
              1;
          } else {
            route.acceptedAsk +=
              1;
          }

          route.modeledPriceEdgeTotal +=
            result.evidence
              .modeledRetainedEdgePercent;
          route.modeledPriceEdgeCount +=
            1;
        } else {
          route.rejectedPrices +=
            1;

          this.incrementMany(
            route.pricingBlockers,
            result.blockers,
          );
        }
      }
    }
  }

  private observeLifecycle(
    lifecycle:
      CrossExchangeMarketMakingLifecycleSnapshot,
    now:
      number,
  ): void {
    const currentEventIds =
      new Set<string>();

    for (
      const route
      of this.routes.values()
    ) {
      route.activeOrders =
        0;
    }

    for (
      const order
      of lifecycle.orders
    ) {
      const route =
        this.ensureRoute(
          order.market,
          order.makerExchange,
          order.hedgeExchange,
        );

      if (
        order.status ===
        "ACTIVE"
      ) {
        route.activeOrders +=
          1;
      }

      for (
        const event
        of order.events
      ) {
        currentEventIds.add(
          event.id,
        );

        if (
          this.previousLifecycleEventIds.has(
            event.id,
          )
        ) {
          continue;
        }

        this.observeTime(
          route,
          event.occurredAt ||
            now,
        );

        this.incrementLifecycleEvent(
          route,
          event.type,
        );
      }
    }

    this.previousLifecycleEventIds =
      currentEventIds;
  }

  private observeFillAssessments(
    snapshot:
      CrossExchangeMarketMakingFillAndHedgeSnapshot,
  ): void {
    const fillByOrderId =
      new Map(
        snapshot.fills.map(
          (fill) => [
            fill.orderId,
            fill,
          ] as const,
        ),
      );

    for (
      const assessment
      of snapshot.assessments
    ) {
      const fill =
        fillByOrderId.get(
          assessment.orderId,
        );

      const route =
        fill
          ? this.ensureRoute(
              fill.market,
              fill.makerExchange,
              fill.hedgeExchange,
            )
          : this.findRouteByMarket(
              assessment.market,
            );

      if (
        !route
      ) {
        continue;
      }

      route.fillAssessments +=
        1;

      if (
        assessment.status ===
        "NO_FILL"
      ) {
        route.noFillAssessments +=
          1;
      }

      this.incrementMany(
        route.fillBlockers,
        assessment.blockers,
      );

      this.observeTime(
        route,
        assessment.evaluatedAt,
      );
    }
  }

  private observeNewFills(
    snapshot:
      CrossExchangeMarketMakingFillAndHedgeSnapshot,
    pricingSnapshots:
      readonly CrossExchangeMarketMakingPricingSnapshot[],
  ): void {
    if (
      snapshot.fills.length <
      this.processedFillCount
    ) {
      this.processedFillCount =
        snapshot.fills.length;

      return;
    }

    const newFills =
      snapshot.fills.slice(
        this.processedFillCount,
      );

    for (
      const fill
      of newFills
    ) {
      const route =
        this.ensureRoute(
          fill.market,
          fill.makerExchange,
          fill.hedgeExchange,
        );

      route.simulatedFills +=
        1;
      if (
        fill.partialFillModel ===
        "NOT_AVAILABLE_V21_3"
      ) {
        route.simulatedFullFills +=
          1;
      }
      if (
        !fill.finalFillForOrder
      ) {
        route.simulatedPartialFills +=
          1;
      }
      if (
        fill.partialFillModel ===
        "PUBLIC_TRADE_FIFO_V21_5"
      ) {
        route.queueModeledFills +=
          1;
      }
      route.simulatedFillNotional +=
        fill.simulatedFillNotional;

      this.observeTime(
        route,
        fill.simulatedAt,
      );

      const hedgeAssessment =
        snapshot.hedgeAssessments.find(
          (assessment) =>
            assessment.fillId ===
            fill.id,
        ) ??
        null;

      if (
        hedgeAssessment
      ) {
        route.hedgeAssessed +=
          1;

        if (
          hedgeAssessment.status ===
          "READY"
        ) {
          route.hedgeReady +=
            1;
        } else {
          route.hedgeBlocked +=
            1;
        }

        this.incrementMany(
          route.hedgeBlockers,
          hedgeAssessment.blockers,
        );
      }

      if (
        snapshot.hedgeIntents.some(
          (intent) =>
            intent.evidence
              .simulatedFillId ===
            fill.id,
        )
      ) {
        route.hedgeIntents +=
          1;
      }

      this.observeEconomics(
        route,
        fill,
        hedgeAssessment,
        pricingSnapshots,
      );
    }

    this.processedFillCount =
      snapshot.fills.length;
  }

  private observeEconomics(
    route:
      MutableRouteAnalytics,
    fill:
      CrossExchangeMarketMakingSimulatedFill,
    hedgeAssessment:
      CrossExchangeMarketMakingHedgeAssessment | null,
    pricingSnapshots:
      readonly CrossExchangeMarketMakingPricingSnapshot[],
  ): void {
    if (
      hedgeAssessment?.status !==
        "READY" ||
      hedgeAssessment.hedgeReferencePrice ===
        null
    ) {
      return;
    }

    const pricing =
      pricingSnapshots.find(
        (snapshot) =>
          snapshot.market ===
            fill.market &&
          snapshot.generatedAt ===
            fill.simulatedAt,
      );

    const evidence =
      pricing?.results.find(
        (result) =>
          result.side ===
            fill.makerSide &&
          result.status ===
            "ACCEPTED",
      )?.evidence;

    if (
      !evidence
    ) {
      return;
    }

    const makerFeeRate =
      evidence.makerFee.percent /
      100;
    const hedgeFeeRate =
      evidence.hedgeTakerFee.percent /
      100;
    const quantity =
      fill.simulatedFillQuantity;
    const makerPrice =
      fill.simulatedFillPrice;
    const hedgePrice =
      hedgeAssessment
        .hedgeReferencePrice;

    const basisQuoteValue =
      fill.makerSide ===
        "BID"
        ? makerPrice *
          quantity *
          (1 + makerFeeRate)
        : hedgePrice *
          quantity *
          (1 + hedgeFeeRate);

    const retainedQuoteValue =
      fill.makerSide ===
        "BID"
        ? hedgePrice *
            quantity *
            (1 - hedgeFeeRate) -
          basisQuoteValue
        : makerPrice *
            quantity *
            (1 - makerFeeRate) -
          basisQuoteValue;

    if (
      !Number.isFinite(
        basisQuoteValue,
      ) ||
      basisQuoteValue <=
        0 ||
      !Number.isFinite(
        retainedQuoteValue,
      )
    ) {
      return;
    }

    const retainedEdgePercent =
      retainedQuoteValue /
      basisQuoteValue *
      100;

    route.modeledHedgedFills +=
      1;
    route.retainedQuoteValue +=
      retainedQuoteValue;
    route.retainedBasisQuoteValue +=
      basisQuoteValue;
    route.minimumRetainedEdgePercent =
      route.minimumRetainedEdgePercent ===
        null
        ? retainedEdgePercent
        : Math.min(
            route.minimumRetainedEdgePercent,
            retainedEdgePercent,
          );
    route.maximumRetainedEdgePercent =
      route.maximumRetainedEdgePercent ===
        null
        ? retainedEdgePercent
        : Math.max(
            route.maximumRetainedEdgePercent,
            retainedEdgePercent,
          );
  }

  private toRouteReadModel(
    route:
      MutableRouteAnalytics,
    configuration:
      CrossExchangeMarketMakingConfiguration,
  ): CrossExchangeMarketMakingRouteAnalytics {
    const hasEvidence =
      route.pricingEvaluations >
        0 ||
      route.lifecyclePlaced >
        0 ||
      route.fillAssessments >
        0 ||
      route.simulatedFills >
        0;

    const hedgeReadyRatePercent =
      route.hedgeAssessed >
        0
        ? this.percent(
            route.hedgeReady,
            route.hedgeAssessed,
          )
        : null;

    const modeledRetainedEdgePercent =
      route.retainedBasisQuoteValue >
        0
        ? this.normalize(
            route.retainedQuoteValue /
              route.retainedBasisQuoteValue *
              100,
          )
        : null;

    const gates =
      this.buildReadinessGates(
        route,
        configuration,
        hedgeReadyRatePercent,
        modeledRetainedEdgePercent,
      );

    const shadowEvidenceSufficient =
      gates.every(
        (gate) =>
          gate.passed,
      );

    return {
      routeId:
        route.routeId,
      market:
        route.market,
      makerExchange:
        route.makerExchange,
      hedgeExchange:
        route.hedgeExchange,
      evidenceStatus:
        hasEvidence
          ? "AVAILABLE"
          : "NO_DATA",
      firstObservedAt:
        route.firstObservedAt,
      lastObservedAt:
        route.lastObservedAt,
      pricing: {
        evaluations:
          route.pricingEvaluations,
        accepted:
          route.acceptedPrices,
        rejected:
          route.rejectedPrices,
        acceptedBid:
          route.acceptedBid,
        acceptedAsk:
          route.acceptedAsk,
        acceptanceRatePercent:
          route.pricingEvaluations >
            0
            ? this.percent(
                route.acceptedPrices,
                route.pricingEvaluations,
              )
            : null,
        averageModeledRetainedEdgePercent:
          route.modeledPriceEdgeCount >
            0
            ? this.normalize(
                route.modeledPriceEdgeTotal /
                  route.modeledPriceEdgeCount,
              )
            : null,
        rejectionBlockers:
          this.toCounts(
            route.pricingBlockers,
          ),
      },
      lifecycle: {
        placed:
          route.lifecyclePlaced,
        monitored:
          route.lifecycleMonitored,
        cancelled:
          route.lifecycleCancelled,
        repriced:
          route.lifecycleRepriced,
        activeOrders:
          route.activeOrders,
        simulatedFilledOrders:
          route.simulatedFills,
      },
      fills: {
        assessments:
          route.fillAssessments,
        noFillAssessments:
          route.noFillAssessments,
        simulatedFullFills:
          route.simulatedFullFills,
        simulatedFillEvents:
          route.simulatedFills,
        simulatedPartialFills:
          route.simulatedPartialFills,
        queueModeledFills:
          route.queueModeledFills,
        simulatedFillNotional:
          this.normalize(
            route.simulatedFillNotional,
          ),
        blockers:
          this.toCounts(
            route.fillBlockers,
          ),
      },
      hedges: {
        assessed:
          route.hedgeAssessed,
        ready:
          route.hedgeReady,
        blocked:
          route.hedgeBlocked,
        readyRatePercent:
          hedgeReadyRatePercent,
        intentsGenerated:
          route.hedgeIntents,
        blockers:
          this.toCounts(
            route.hedgeBlockers,
          ),
      },
      economics: {
        modeledHedgedFills:
          route.modeledHedgedFills,
        modeledRetainedQuoteValue:
          route.modeledHedgedFills >
            0
            ? this.normalize(
                route.retainedQuoteValue,
              )
            : null,
        modeledRetainedBasisQuoteValue:
          route.modeledHedgedFills >
            0
            ? this.normalize(
                route.retainedBasisQuoteValue,
              )
            : null,
        modeledRetainedEdgePercent,
        minimumObservedRetainedEdgePercent:
          route.minimumRetainedEdgePercent ===
            null
            ? null
            : this.normalize(
                route.minimumRetainedEdgePercent,
              ),
        maximumObservedRetainedEdgePercent:
          route.maximumRetainedEdgePercent ===
            null
            ? null
            : this.normalize(
                route.maximumRetainedEdgePercent,
              ),
        classification:
          "MODELED_SHADOW_ECONOMICS_NOT_REALIZED_PNL",
      },
      readiness: {
        state:
          !hasEvidence
            ? "NO_DATA"
            : shadowEvidenceSufficient
              ? "SHADOW_EVIDENCE_SUFFICIENT"
              : "COLLECTING",
        shadowEvidenceSufficient,
        paperEligible:
          false,
        liveEligible:
          false,
        gates,
        paperBlockers:
          route.queueModeledFills >
            0
            ? PAPER_BLOCKERS
            : [
                "QUEUE_AWARE_PARTIAL_FILL_EVIDENCE_REQUIRED",
                ...PAPER_BLOCKERS,
              ],
      },
    };
  }

  private buildReadinessGates(
    route:
      MutableRouteAnalytics,
    configuration:
      CrossExchangeMarketMakingConfiguration,
    hedgeReadyRatePercent:
      number | null,
    modeledRetainedEdgePercent:
      number | null,
  ): CrossExchangeMarketMakingShadowReadinessGate[] {
    const gates:
      CrossExchangeMarketMakingShadowReadinessGate[] =
      [];

    const add = (
      key:
        CrossExchangeMarketMakingShadowReadinessGateKey,
      passed:
        boolean,
      evidence:
        string,
    ) => {
      gates.push({
        key,
        status:
          passed
            ? "PASS"
            : "BLOCKED",
        passed,
        evidence,
      });
    };

    add(
      "CONFIGURATION_READY",
      configuration.state ===
        "FOUNDATION_READY" &&
        configuration.makerLifecycle.state ===
          "READY" &&
        configuration.makerFill.state ===
          "READY",
      `strategy=${configuration.state}; lifecycle=${configuration.makerLifecycle.state}; fill=${configuration.makerFill.state}.`,
    );

    add(
      "PRICING_SAMPLE_SUFFICIENT",
      route.pricingEvaluations >=
        this.config
          .minimumPricingEvaluationsPerRoute,
      `pricing evaluations=${route.pricingEvaluations}/${this.config.minimumPricingEvaluationsPerRoute}.`,
    );

    add(
      "BOTH_MAKER_SIDES_OBSERVED",
      route.acceptedBid >
        0 &&
        route.acceptedAsk >
        0,
      `accepted BID=${route.acceptedBid}; accepted ASK=${route.acceptedAsk}.`,
    );

    add(
      "SIMULATED_FILL_SAMPLE_SUFFICIENT",
      route.simulatedFills >=
        this.config
          .minimumSimulatedFillsPerRoute,
      `simulated fills=${route.simulatedFills}/${this.config.minimumSimulatedFillsPerRoute}.`,
    );

    add(
      "ALL_FILLS_HEDGE_ASSESSED",
      route.simulatedFills >
        0 &&
        route.hedgeAssessed ===
          route.simulatedFills,
      `hedge assessed=${route.hedgeAssessed}/${route.simulatedFills} simulated fills.`,
    );

    add(
      "HEDGE_READY_RATE_SUFFICIENT",
      hedgeReadyRatePercent !==
        null &&
        hedgeReadyRatePercent +
          1e-10 >=
          this.config
            .minimumHedgeReadyRatePercent,
      `hedge ready rate=${hedgeReadyRatePercent ?? "NO_DATA"}%/${this.config.minimumHedgeReadyRatePercent}%.`,
    );

    add(
      "MODELED_RETAINED_EDGE_AVAILABLE",
      route.modeledHedgedFills >
        0 &&
        route.modeledHedgedFills ===
          route.hedgeReady,
      `modeled hedged fills=${route.modeledHedgedFills}/${route.hedgeReady} ready hedges.`,
    );

    add(
      "MODELED_RETAINED_EDGE_SUFFICIENT",
      modeledRetainedEdgePercent !==
        null &&
        configuration.minimumRetainedEdgePercent !==
          null &&
        modeledRetainedEdgePercent +
          1e-10 >=
          configuration.minimumRetainedEdgePercent,
      `modeled retained edge=${modeledRetainedEdgePercent ?? "NO_DATA"}%/${configuration.minimumRetainedEdgePercent ?? "NO_DATA"}% minimum.`,
    );

    return gates;
  }

  private ensureConfiguredRoutes(
    configuration:
      CrossExchangeMarketMakingConfiguration,
  ): void {
    if (
      !configuration.makerExchange ||
      !configuration.hedgeExchange
    ) {
      return;
    }

    for (
      const market
      of configuration.marketAllowlist
    ) {
      this.ensureRoute(
        market,
        configuration.makerExchange,
        configuration.hedgeExchange,
      );
    }
  }

  private ensureRoute(
    market:
      string,
    makerExchange:
      string,
    hedgeExchange:
      string,
  ): MutableRouteAnalytics {
    const routeId =
      [
        makerExchange,
        hedgeExchange,
        market,
      ].join(
        ":",
      );

    const current =
      this.routes.get(
        routeId,
      );

    if (
      current
    ) {
      return current;
    }

    const route:
      MutableRouteAnalytics = {
      routeId,
      market,
      makerExchange,
      hedgeExchange,
      firstObservedAt:
        null,
      lastObservedAt:
        null,
      pricingEvaluations:
        0,
      acceptedPrices:
        0,
      rejectedPrices:
        0,
      acceptedBid:
        0,
      acceptedAsk:
        0,
      modeledPriceEdgeTotal:
        0,
      modeledPriceEdgeCount:
        0,
      pricingBlockers:
        new Map(),
      lifecyclePlaced:
        0,
      lifecycleMonitored:
        0,
      lifecycleCancelled:
        0,
      lifecycleRepriced:
        0,
      activeOrders:
        0,
      fillAssessments:
        0,
      noFillAssessments:
        0,
      simulatedFills:
        0,
      simulatedFullFills:
        0,
      simulatedPartialFills:
        0,
      queueModeledFills:
        0,
      simulatedFillNotional:
        0,
      fillBlockers:
        new Map(),
      hedgeAssessed:
        0,
      hedgeReady:
        0,
      hedgeBlocked:
        0,
      hedgeIntents:
        0,
      hedgeBlockers:
        new Map(),
      modeledHedgedFills:
        0,
      retainedQuoteValue:
        0,
      retainedBasisQuoteValue:
        0,
      minimumRetainedEdgePercent:
        null,
      maximumRetainedEdgePercent:
        null,
      lastPricingGeneratedAt:
        null,
    };

    this.routes.set(
      routeId,
      route,
    );

    return route;
  }

  private findRouteByMarket(
    market:
      string,
  ): MutableRouteAnalytics | null {
    return Array.from(
      this.routes.values(),
    ).find(
      (route) =>
        route.market ===
        market,
    ) ??
    null;
  }

  private observeTime(
    route:
      MutableRouteAnalytics,
    timestamp:
      number,
  ): void {
    if (
      !Number.isFinite(
        timestamp,
      )
    ) {
      return;
    }

    route.firstObservedAt =
      route.firstObservedAt ===
        null
        ? timestamp
        : Math.min(
            route.firstObservedAt,
            timestamp,
          );
    route.lastObservedAt =
      route.lastObservedAt ===
        null
        ? timestamp
        : Math.max(
            route.lastObservedAt,
            timestamp,
          );
  }

  private incrementLifecycleEvent(
    route:
      MutableRouteAnalytics,
    type:
      CrossExchangeMarketMakingLifecycleEventType,
  ): void {
    switch (
      type
    ) {
      case "PLACED":
        route.lifecyclePlaced +=
          1;
        break;

      case "MONITORED":
        route.lifecycleMonitored +=
          1;
        break;

      case "CANCELLED":
        route.lifecycleCancelled +=
          1;
        break;

      case "REPRICED":
        route.lifecycleRepriced +=
          1;
        break;
    }
  }

  private incrementMany(
    counts:
      Map<string, number>,
    keys:
      readonly (
        | CrossExchangeMarketMakingPriceBlocker
        | CrossExchangeMarketMakingFillBlocker
        | CrossExchangeMarketMakingHedgeBlocker
      )[],
  ): void {
    for (
      const key
      of keys
    ) {
      counts.set(
        key,
        (
          counts.get(
            key,
          ) ??
          0
        ) +
          1,
      );
    }
  }

  private toCounts(
    counts:
      ReadonlyMap<string, number>,
  ): readonly CrossExchangeMarketMakingAnalyticsCount[] {
    return Array.from(
      counts.entries(),
    ).map(
      ([
        key,
        count,
      ]) => ({
        key,
        count,
      }),
    ).sort(
      (first, second) =>
        second.count -
          first.count ||
        first.key.localeCompare(
          second.key,
        ),
    );
  }

  private percent(
    numerator:
      number,
    denominator:
      number,
  ): number {
    return this.normalize(
      numerator /
        denominator *
        100,
    );
  }

  private sum<T>(
    values:
      readonly T[],
    selector:
      (
        value:
          T,
      ) => number,
  ): number {
    return values.reduce(
      (
        total,
        value,
      ) =>
        total +
        selector(
          value,
        ),
      0,
    );
  }

  private normalize(
    value:
      number,
  ): number {
    return Number(
      value.toFixed(
        12,
      ),
    );
  }
}

function immutableClone<T>(
  value:
    T,
): T {
  return deepFreeze(
    structuredClone(
      value,
    ),
  );
}

function deepFreeze<T>(
  value:
    T,
): T {
  if (
    value ===
      null ||
    typeof value !==
      "object" ||
    Object.isFrozen(
      value,
    )
  ) {
    return value;
  }

  for (
    const nested
    of Object.values(
      value,
    )
  ) {
    deepFreeze(
      nested,
    );
  }

  return Object.freeze(
    value,
  );
}
