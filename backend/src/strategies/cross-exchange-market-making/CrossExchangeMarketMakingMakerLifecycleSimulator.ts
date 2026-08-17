import type {
  ExchangeMarketCapability,
} from "../../execution/capabilities/models/ExchangeCapability";

import type {
  CrossExchangeMarketMakingSide,
} from "../models/StrategySignal";

import type {
  CrossExchangeMarketMakingConfiguration,
  CrossExchangeMarketMakingLifecycleState,
} from "./CrossExchangeMarketMakingConfiguration";

import type {
  CrossExchangeMarketMakingPriceBlocker,
  CrossExchangeMarketMakingPriceResult,
  CrossExchangeMarketMakingPricingSnapshot,
} from "./CrossExchangeMarketMakingPriceEngine";

export type CrossExchangeMarketMakingLifecycleBlocker =
  | "CONTROLLER_NOT_RUNNING"
  | "LIFECYCLE_CONFIGURATION_NOT_READY"
  | "SAFE_PRICE_EVIDENCE_REJECTED"
  | "SAFE_PRICE_EVIDENCE_EXPIRED"
  | "MAKER_CAPABILITY_MISSING"
  | "MAKER_QUANTITY_RULES_INVALID"
  | "MAKER_NOTIONAL_RULES_INVALID"
  | "SHADOW_QUANTITY_OUTSIDE_RULES"
  | "SHADOW_QUANTITY_STEP_MISMATCH"
  | "SHADOW_NOTIONAL_OUTSIDE_RULES";

export type CrossExchangeMarketMakingLifecycleEventType =
  | "PLACED"
  | "MONITORED"
  | "CANCELLED"
  | "REPRICED";

export type CrossExchangeMarketMakingLifecycleReason =
  | "INITIAL_SAFE_PRICE"
  | "SAFE_PRICE_UNCHANGED"
  | "REPRICE_REQUIRED"
  | "SAFE_PRICE_MOVED_BY_CONFIGURED_TICKS"
  | "SAFE_PRICE_BECAME_UNSAFE"
  | "SAFE_PRICE_EVIDENCE_REJECTED"
  | "SAFE_PRICE_EVIDENCE_EXPIRED"
  | "MAXIMUM_ORDER_AGE_EXCEEDED"
  | "ORDER_RULES_REJECTED"
  | "CONTROLLER_STOPPED";

export interface CrossExchangeMarketMakingLifecycleEvent {
  readonly id:
    string;

  readonly orderId:
    string;

  readonly type:
    CrossExchangeMarketMakingLifecycleEventType;

  readonly reason:
    CrossExchangeMarketMakingLifecycleReason;

  readonly occurredAt:
    number;

  readonly previousOrderId:
    string | null;

  readonly fromPrice:
    number | null;

  readonly toPrice:
    number | null;

  readonly pricingBlockers:
    readonly CrossExchangeMarketMakingPriceBlocker[];

  readonly lifecycleBlockers:
    readonly CrossExchangeMarketMakingLifecycleBlocker[];

  readonly exchangeAcknowledgement:
    "NOT_APPLICABLE_SHADOW";
}

export interface CrossExchangeMarketMakingShadowMakerOrder {
  readonly id:
    string;

  readonly strategyId:
    "cross-exchange-market-making";

  readonly mode:
    "SHADOW";

  readonly market:
    string;

  readonly side:
    CrossExchangeMarketMakingSide;

  readonly makerExchange:
    string;

  readonly hedgeExchange:
    string;

  readonly status:
    | "ACTIVE"
    | "CANCELLED"
    | "SIMULATED_FILLED";

  readonly simulatedPrice:
    number;

  readonly simulatedQuantity:
    number;

  readonly simulatedNotional:
    number;

  readonly priceStep:
    number;

  readonly revision:
    number;

  readonly previousOrderId:
    string | null;

  readonly placedAt:
    number;

  readonly revisionStartedAt:
    number;

  readonly lastEvaluatedAt:
    number;

  readonly cancelledAt:
    number | null;

  readonly cancellationReason:
    CrossExchangeMarketMakingLifecycleReason | null;

  readonly sourcePriceGeneratedAt:
    number;

  readonly sourceSignalId:
    string;

  readonly sourcePriceExpiresAt:
    number;

  readonly monitorCount:
    number;

  readonly events:
    readonly CrossExchangeMarketMakingLifecycleEvent[];

  readonly safety: {
    readonly nonFillShadowLifecycle:
      true;

    readonly makerFillSimulated:
      false;

    readonly hedgeIntentGenerated:
      false;

    readonly hedgeCapacityEvaluated:
      false;

    readonly queuePositionEvaluated:
      false;

    readonly fillProbabilityEvaluated:
      false;

    readonly cancelReplaceLatencyEvaluated:
      false;

    readonly inventoryReserved:
      false;

    readonly capitalReserved:
      false;

    readonly exchangeOrderSubmitted:
      false;

    readonly executionAuthorized:
      false;
  };
}

export interface CrossExchangeMarketMakingLifecycleEvaluation {
  readonly market:
    string;

  readonly side:
    CrossExchangeMarketMakingSide;

  readonly evaluatedAt:
    number;

  readonly action:
    | "PLACED"
    | "MONITORED"
    | "CANCELLED"
    | "REPRICED"
    | "REJECTED";

  readonly orderId:
    string | null;

  readonly previousOrderId:
    string | null;

  readonly pricingBlockers:
    readonly CrossExchangeMarketMakingPriceBlocker[];

  readonly lifecycleBlockers:
    readonly CrossExchangeMarketMakingLifecycleBlocker[];
}

export interface CrossExchangeMarketMakingLifecycleSnapshot {
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
    CrossExchangeMarketMakingLifecycleState;

  readonly controllerRunning:
    boolean;

  readonly activeOrderCount:
    number;

  readonly cancelledOrderCount:
    number;

  readonly retainedOrderCount:
    number;

  readonly totalOrdersObserved:
    number;

  readonly totalEventsObserved:
    number;

  readonly evaluations:
    readonly CrossExchangeMarketMakingLifecycleEvaluation[];

  readonly orders:
    readonly CrossExchangeMarketMakingShadowMakerOrder[];

  readonly safety: {
    readonly shadowSimulationOnly:
      true;

    readonly userConfiguredQuantityRequired:
      true;

    readonly verifiedMarketRulesRequired:
      true;

    readonly cancelThenReplaceModel:
      true;

    readonly fillsEvaluated:
      false;

    readonly hedgeIntentsAllowed:
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

interface MutableShadowMakerOrder {
  id: string;
  strategyId: "cross-exchange-market-making";
  mode: "SHADOW";
  market: string;
  side: CrossExchangeMarketMakingSide;
  makerExchange: string;
  hedgeExchange: string;
  status: "ACTIVE" | "CANCELLED" | "SIMULATED_FILLED";
  simulatedPrice: number;
  simulatedQuantity: number;
  simulatedNotional: number;
  priceStep: number;
  revision: number;
  previousOrderId: string | null;
  placedAt: number;
  revisionStartedAt: number;
  lastEvaluatedAt: number;
  cancelledAt: number | null;
  cancellationReason: CrossExchangeMarketMakingLifecycleReason | null;
  sourcePriceGeneratedAt: number;
  sourceSignalId: string;
  sourcePriceExpiresAt: number;
  monitorCount: number;
  events: CrossExchangeMarketMakingLifecycleEvent[];
  safety: CrossExchangeMarketMakingShadowMakerOrder["safety"];
}

export interface CrossExchangeMarketMakingLifecycleSimulatorConfig {
  readonly maximumRetainedOrders:
    number;

  readonly maximumEventsPerOrder:
    number;
}

const DEFAULT_SIMULATOR_CONFIG:
  CrossExchangeMarketMakingLifecycleSimulatorConfig = {
  maximumRetainedOrders:
    1_000,

  maximumEventsPerOrder:
    100,
};

export class CrossExchangeMarketMakingMakerLifecycleSimulator {
  private readonly orders =
    new Map<
      string,
      MutableShadowMakerOrder
    >();

  private readonly activeOrderByRoute =
    new Map<
      string,
      string
    >();

  private readonly config:
    CrossExchangeMarketMakingLifecycleSimulatorConfig;

  private lastEvaluations:
    readonly CrossExchangeMarketMakingLifecycleEvaluation[] =
    [];

  private orderSequence =
    0;

  private eventSequence =
    0;

  private totalOrdersObserved =
    0;

  private totalEventsObserved =
    0;

  private lifecycleRevision =
    0;

  constructor(
    config:
      Partial<CrossExchangeMarketMakingLifecycleSimulatorConfig> = {},
  ) {
    this.config = {
      ...DEFAULT_SIMULATOR_CONFIG,
      ...config,
    };

    if (
      !Number.isSafeInteger(
        this.config.maximumRetainedOrders,
      ) ||
      this.config.maximumRetainedOrders <=
        0 ||
      !Number.isSafeInteger(
        this.config.maximumEventsPerOrder,
      ) ||
      this.config.maximumEventsPerOrder <
        2
    ) {
      throw new Error(
        "XEMM lifecycle retention limits are invalid.",
      );
    }
  }

  observe(
    pricingSnapshots:
      readonly CrossExchangeMarketMakingPricingSnapshot[],

    configuration:
      CrossExchangeMarketMakingConfiguration,

    controllerRunning:
      boolean,

    now =
      Date.now(),
  ): CrossExchangeMarketMakingLifecycleSnapshot {
    const evaluations:
      CrossExchangeMarketMakingLifecycleEvaluation[] =
      [];

    for (
      const pricingSnapshot
      of pricingSnapshots
    ) {
      for (
        const priceResult
        of pricingSnapshot.results
      ) {
        evaluations.push(
          this.observeRoute({
            pricingSnapshot,
            priceResult,
            configuration,
            controllerRunning,
            now,
          }),
        );
      }
    }

    this.lastEvaluations =
      immutableClone(
        evaluations,
      );

    this.pruneCancelledOrders();

    return this.getSnapshot(
      configuration,
      controllerRunning,
      now,
    );
  }

  cancelAll(
    reason:
      Extract<
        CrossExchangeMarketMakingLifecycleReason,
        "CONTROLLER_STOPPED"
      >,

    now:
      number,

    configuration:
      CrossExchangeMarketMakingConfiguration,
  ): CrossExchangeMarketMakingLifecycleSnapshot {
    const evaluations:
      CrossExchangeMarketMakingLifecycleEvaluation[] =
      [];

    for (
      const [
        routeKey,
        orderId,
      ]
      of this.activeOrderByRoute
    ) {
      const order =
        this.orders.get(
          orderId,
        );

      if (
        !order
      ) {
        this.activeOrderByRoute.delete(
          routeKey,
        );

        continue;
      }

      this.cancelOrder(
        order,
        reason,
        now,
        [],
        [],
      );

      evaluations.push({
        market:
          order.market,
        side:
          order.side,
        evaluatedAt:
          now,
        action:
          "CANCELLED",
        orderId:
          order.id,
        previousOrderId:
          order.previousOrderId,
        pricingBlockers:
          [],
        lifecycleBlockers:
          [],
      });
    }

    this.lastEvaluations =
      immutableClone(
        evaluations,
      );

    return this.getSnapshot(
      configuration,
      false,
      now,
    );
  }

  getSnapshot(
    configuration:
      CrossExchangeMarketMakingConfiguration,

    controllerRunning:
      boolean,

    now =
      Date.now(),
  ): CrossExchangeMarketMakingLifecycleSnapshot {
    const orders =
      Array.from(
        this.orders.values(),
      ).sort(
        (
          first,
          second,
        ) =>
          first.placedAt -
            second.placedAt ||
          first.id.localeCompare(
            second.id,
          ),
      );

    const activeOrderCount =
      orders.filter(
        (order) =>
          order.status ===
          "ACTIVE",
      ).length;

    return immutableClone({
      version:
        "21.5",
      strategyId:
        "cross-exchange-market-making",
      generatedAt:
        now,
      evidenceStatus:
        orders.length >
          0 ||
        this.lastEvaluations.length >
          0
          ? "AVAILABLE"
          : "NO_DATA",
      configurationState:
        configuration
          .makerLifecycle
          .state,
      controllerRunning,
      activeOrderCount,
      cancelledOrderCount:
        orders.filter(
          (order) =>
            order.status ===
            "CANCELLED",
        ).length,
      retainedOrderCount:
        orders.length,
      totalOrdersObserved:
        this.totalOrdersObserved,
      totalEventsObserved:
        this.totalEventsObserved,
      evaluations:
        this.lastEvaluations,
      orders,
      safety: {
        shadowSimulationOnly:
          true,
        userConfiguredQuantityRequired:
          true,
        verifiedMarketRulesRequired:
          true,
        cancelThenReplaceModel:
          true,
        fillsEvaluated:
          false,
        hedgeIntentsAllowed:
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

  markSimulatedFilled(
    orderId:
      string,

    now:
      number,
  ): boolean {
    const order =
      this.orders.get(
        orderId,
      );

    if (
      !order ||
      order.status !==
        "ACTIVE"
    ) {
      return false;
    }

    order.status =
      "SIMULATED_FILLED";
    order.lastEvaluatedAt =
      now;

    this.activeOrderByRoute.delete(
      this.createRouteKey(
        order.market,
        order.side,
        order.makerExchange,
        order.hedgeExchange,
      ),
    );

    this.lifecycleRevision +=
      1;

    return true;
  }

  getRevision():
    number {
    return this.lifecycleRevision;
  }

  private observeRoute(
    context: {
      pricingSnapshot:
        CrossExchangeMarketMakingPricingSnapshot;

      priceResult:
        CrossExchangeMarketMakingPriceResult;

      configuration:
        CrossExchangeMarketMakingConfiguration;

      controllerRunning:
        boolean;

      now:
        number;
    },
  ): CrossExchangeMarketMakingLifecycleEvaluation {
    const {
      pricingSnapshot,
      priceResult,
      configuration,
      controllerRunning,
      now,
    } = context;

    const routeKey =
      this.createRouteKey(
        pricingSnapshot.market,
        priceResult.side,
        pricingSnapshot.makerExchange,
        pricingSnapshot.hedgeExchange,
      );

    const activeOrder =
      this.getActiveOrder(
        routeKey,
      );

    if (
      !controllerRunning ||
      configuration
        .makerLifecycle
        .state !==
        "READY"
    ) {
      const lifecycleBlockers:
        CrossExchangeMarketMakingLifecycleBlocker[] =
        [];

      if (
        !controllerRunning
      ) {
        lifecycleBlockers.push(
          "CONTROLLER_NOT_RUNNING",
        );
      }

      if (
        configuration
          .makerLifecycle
          .state !==
          "READY"
      ) {
        lifecycleBlockers.push(
          "LIFECYCLE_CONFIGURATION_NOT_READY",
        );
      }

      return this.evaluation(
        pricingSnapshot.market,
        priceResult.side,
        now,
        "REJECTED",
        activeOrder?.id ??
          null,
        activeOrder
          ?.previousOrderId ??
          null,
        priceResult.blockers,
        lifecycleBlockers,
      );
    }

    if (
      priceResult.status !==
        "ACCEPTED" ||
      !priceResult.evidence ||
      priceResult.expiresAt ===
        null
    ) {
      const lifecycleBlockers:
        CrossExchangeMarketMakingLifecycleBlocker[] = [
        "SAFE_PRICE_EVIDENCE_REJECTED",
      ];

      if (
        activeOrder
      ) {
        this.cancelOrder(
          activeOrder,
          "SAFE_PRICE_EVIDENCE_REJECTED",
          now,
          priceResult.blockers,
          lifecycleBlockers,
        );
      }

      return this.evaluation(
        pricingSnapshot.market,
        priceResult.side,
        now,
        activeOrder
          ? "CANCELLED"
          : "REJECTED",
        activeOrder?.id ??
          null,
        activeOrder
          ?.previousOrderId ??
          null,
        priceResult.blockers,
        lifecycleBlockers,
      );
    }

    if (
      priceResult.expiresAt <
      now
    ) {
      const lifecycleBlockers:
        CrossExchangeMarketMakingLifecycleBlocker[] = [
        "SAFE_PRICE_EVIDENCE_EXPIRED",
      ];

      if (
        activeOrder
      ) {
        this.cancelOrder(
          activeOrder,
          "SAFE_PRICE_EVIDENCE_EXPIRED",
          now,
          [],
          lifecycleBlockers,
        );
      }

      return this.evaluation(
        pricingSnapshot.market,
        priceResult.side,
        now,
        activeOrder
          ? "CANCELLED"
          : "REJECTED",
        activeOrder?.id ??
          null,
        activeOrder
          ?.previousOrderId ??
          null,
        [],
        lifecycleBlockers,
      );
    }

    const maximumOrderAgeMs =
      configuration
        .makerLifecycle
        .maximumOrderAgeMs as number;

    if (
      activeOrder &&
      now -
        activeOrder.revisionStartedAt >=
        maximumOrderAgeMs
    ) {
      this.cancelOrder(
        activeOrder,
        "MAXIMUM_ORDER_AGE_EXCEEDED",
        now,
        [],
        [],
      );

      return this.evaluation(
        pricingSnapshot.market,
        priceResult.side,
        now,
        "CANCELLED",
        activeOrder.id,
        activeOrder.previousOrderId,
        [],
        [],
      );
    }

    const quantity =
      configuration
        .makerLifecycle
        .quantityByMarket[
          pricingSnapshot.market
        ] as number;

    const ruleBlockers =
      this.validateOrderRules(
        quantity,
        priceResult.evidence
          .safeMakerPrice,
        pricingSnapshot.inputs
          .makerCapability,
      );

    if (
      ruleBlockers.length >
      0
    ) {
      if (
        activeOrder
      ) {
        this.cancelOrder(
          activeOrder,
          "ORDER_RULES_REJECTED",
          now,
          [],
          ruleBlockers,
        );
      }

      return this.evaluation(
        pricingSnapshot.market,
        priceResult.side,
        now,
        activeOrder
          ? "CANCELLED"
          : "REJECTED",
        activeOrder?.id ??
          null,
        activeOrder
          ?.previousOrderId ??
          null,
        [],
        ruleBlockers,
      );
    }

    if (
      !activeOrder
    ) {
      const order =
        this.createOrder({
          pricingSnapshot,
          priceResult: {
            ...priceResult,
            evidence:
              priceResult.evidence,
            expiresAt:
              priceResult.expiresAt,
          },
          quantity,
          now,
          revision:
            0,
          previousOrder:
            null,
          eventType:
            "PLACED",
          eventReason:
            "INITIAL_SAFE_PRICE",
        });

      return this.evaluation(
        pricingSnapshot.market,
        priceResult.side,
        now,
        "PLACED",
        order.id,
        null,
        [],
        [],
      );
    }

    const tickDistance =
      Math.abs(
        priceResult.evidence
          .safeMakerPrice -
        activeOrder.simulatedPrice,
      ) /
      priceResult.evidence
        .priceStep;

    const minimumRepriceTicks =
      configuration
        .makerLifecycle
        .minimumRepriceTicks as number;

    const existingPriceBecameUnsafe =
      priceResult.side ===
        "BID"
        ? activeOrder.simulatedPrice >
          priceResult.evidence
            .safeMakerPrice
        : activeOrder.simulatedPrice <
          priceResult.evidence
            .safeMakerPrice;

    if (
      existingPriceBecameUnsafe ||
      tickDistance +
          1e-10 >=
        minimumRepriceTicks
    ) {
      const previousPrice =
        activeOrder.simulatedPrice;

      this.cancelOrder(
        activeOrder,
        "REPRICE_REQUIRED",
        now,
        [],
        [],
      );

      const replacement =
        this.createOrder({
          pricingSnapshot,
          priceResult: {
            ...priceResult,
            evidence:
              priceResult.evidence,
            expiresAt:
              priceResult.expiresAt,
          },
          quantity,
          now,
          revision:
            activeOrder.revision +
            1,
          previousOrder:
            activeOrder,
          eventType:
            "REPRICED",
          eventReason:
            existingPriceBecameUnsafe
              ? "SAFE_PRICE_BECAME_UNSAFE"
              : "SAFE_PRICE_MOVED_BY_CONFIGURED_TICKS",
          fromPrice:
            previousPrice,
        });

      return this.evaluation(
        pricingSnapshot.market,
        priceResult.side,
        now,
        "REPRICED",
        replacement.id,
        activeOrder.id,
        [],
        [],
      );
    }

    activeOrder.lastEvaluatedAt =
      now;
    activeOrder.sourcePriceGeneratedAt =
      pricingSnapshot.generatedAt;
    activeOrder.sourceSignalId = [
      "cross-exchange-market-making",
      pricingSnapshot.generatedAt,
      pricingSnapshot.market,
      activeOrder.makerExchange,
      activeOrder.hedgeExchange,
      priceResult.side,
    ].join(
      ":",
    );
    activeOrder.sourcePriceExpiresAt =
      priceResult.expiresAt;
    activeOrder.monitorCount +=
      1;

    this.addEvent(
      activeOrder,
      "MONITORED",
      "SAFE_PRICE_UNCHANGED",
      now,
      activeOrder.previousOrderId,
      activeOrder.simulatedPrice,
      priceResult.evidence
        .safeMakerPrice,
      [],
      [],
    );

    return this.evaluation(
      pricingSnapshot.market,
      priceResult.side,
      now,
      "MONITORED",
      activeOrder.id,
      activeOrder.previousOrderId,
      [],
      [],
    );
  }

  private createOrder(
    context: {
      pricingSnapshot:
        CrossExchangeMarketMakingPricingSnapshot;

      priceResult:
        CrossExchangeMarketMakingPriceResult & {
          evidence: NonNullable<CrossExchangeMarketMakingPriceResult["evidence"]>;
          expiresAt: number;
        };

      quantity:
        number;

      now:
        number;

      revision:
        number;

      previousOrder:
        MutableShadowMakerOrder | null;

      eventType:
        Extract<
          CrossExchangeMarketMakingLifecycleEventType,
          "PLACED" | "REPRICED"
        >;

      eventReason:
        Extract<
          CrossExchangeMarketMakingLifecycleReason,
          | "INITIAL_SAFE_PRICE"
          | "SAFE_PRICE_MOVED_BY_CONFIGURED_TICKS"
          | "SAFE_PRICE_BECAME_UNSAFE"
        >;

      fromPrice?:
        number;
    },
  ): MutableShadowMakerOrder {
    const {
      pricingSnapshot,
      priceResult,
      quantity,
      now,
      revision,
      previousOrder,
      eventType,
      eventReason,
      fromPrice =
        null,
    } = context;

    this.orderSequence +=
      1;

    const orderId = [
      "cross-exchange-market-making",
      "shadow-maker",
      pricingSnapshot.market,
      priceResult.evidence.makerExchange,
      priceResult.evidence.hedgeExchange,
      priceResult.side,
      now,
      this.orderSequence,
    ].join(
      ":",
    );

    const order:
      MutableShadowMakerOrder = {
      id:
        orderId,
      strategyId:
        "cross-exchange-market-making",
      mode:
        "SHADOW",
      market:
        pricingSnapshot.market,
      side:
        priceResult.side,
      makerExchange:
        priceResult.evidence
          .makerExchange,
      hedgeExchange:
        priceResult.evidence
          .hedgeExchange,
      status:
        "ACTIVE",
      simulatedPrice:
        priceResult.evidence
          .safeMakerPrice,
      simulatedQuantity:
        quantity,
      simulatedNotional:
        this.normalizeNumber(
          quantity *
          priceResult.evidence
            .safeMakerPrice,
        ),
      priceStep:
        priceResult.evidence
          .priceStep,
      revision,
      previousOrderId:
        previousOrder?.id ??
        null,
      placedAt:
        now,
      revisionStartedAt:
        now,
      lastEvaluatedAt:
        now,
      cancelledAt:
        null,
      cancellationReason:
        null,
      sourcePriceGeneratedAt:
        pricingSnapshot.generatedAt,
      sourceSignalId: [
        "cross-exchange-market-making",
        pricingSnapshot.generatedAt,
        pricingSnapshot.market,
        priceResult.evidence.makerExchange,
        priceResult.evidence.hedgeExchange,
        priceResult.side,
      ].join(
        ":",
      ),
      sourcePriceExpiresAt:
        priceResult.expiresAt,
      monitorCount:
        0,
      events:
        [],
      safety: {
        nonFillShadowLifecycle:
          true,
        makerFillSimulated:
          false,
        hedgeIntentGenerated:
          false,
        hedgeCapacityEvaluated:
          false,
        queuePositionEvaluated:
          false,
        fillProbabilityEvaluated:
          false,
        cancelReplaceLatencyEvaluated:
          false,
        inventoryReserved:
          false,
        capitalReserved:
          false,
        exchangeOrderSubmitted:
          false,
        executionAuthorized:
          false,
      },
    };

    this.addEvent(
      order,
      eventType,
      eventReason,
      now,
      previousOrder?.id ??
        null,
      fromPrice,
      order.simulatedPrice,
      [],
      [],
    );

    this.orders.set(
      order.id,
      order,
    );

    this.activeOrderByRoute.set(
      this.createRouteKey(
        order.market,
        order.side,
        order.makerExchange,
        order.hedgeExchange,
      ),
      order.id,
    );

    this.totalOrdersObserved +=
      1;

    this.lifecycleRevision +=
      1;

    return order;
  }

  private cancelOrder(
    order:
      MutableShadowMakerOrder,

    reason:
      Extract<
        CrossExchangeMarketMakingLifecycleReason,
        | "REPRICE_REQUIRED"
        | "SAFE_PRICE_EVIDENCE_REJECTED"
        | "SAFE_PRICE_EVIDENCE_EXPIRED"
        | "MAXIMUM_ORDER_AGE_EXCEEDED"
        | "ORDER_RULES_REJECTED"
        | "CONTROLLER_STOPPED"
      >,

    now:
      number,

    pricingBlockers:
      readonly CrossExchangeMarketMakingPriceBlocker[],

    lifecycleBlockers:
      readonly CrossExchangeMarketMakingLifecycleBlocker[],
  ): void {
    if (
      order.status ===
      "CANCELLED"
    ) {
      return;
    }

    order.status =
      "CANCELLED";
    order.cancelledAt =
      now;
    order.cancellationReason =
      reason;
    order.lastEvaluatedAt =
      now;

    this.activeOrderByRoute.delete(
      this.createRouteKey(
        order.market,
        order.side,
        order.makerExchange,
        order.hedgeExchange,
      ),
    );

    this.addEvent(
      order,
      "CANCELLED",
      reason,
      now,
      order.previousOrderId,
      order.simulatedPrice,
      null,
      pricingBlockers,
      lifecycleBlockers,
    );

    this.lifecycleRevision +=
      1;
  }

  private addEvent(
    order:
      MutableShadowMakerOrder,

    type:
      CrossExchangeMarketMakingLifecycleEventType,

    reason:
      CrossExchangeMarketMakingLifecycleReason,

    occurredAt:
      number,

    previousOrderId:
      string | null,

    fromPrice:
      number | null,

    toPrice:
      number | null,

    pricingBlockers:
      readonly CrossExchangeMarketMakingPriceBlocker[],

    lifecycleBlockers:
      readonly CrossExchangeMarketMakingLifecycleBlocker[],
  ): void {
    this.eventSequence +=
      1;

    order.events.push({
      id: [
        order.id,
        "event",
        this.eventSequence,
      ].join(
        ":",
      ),
      orderId:
        order.id,
      type,
      reason,
      occurredAt,
      previousOrderId,
      fromPrice,
      toPrice,
      pricingBlockers: [
        ...pricingBlockers,
      ],
      lifecycleBlockers: [
        ...lifecycleBlockers,
      ],
      exchangeAcknowledgement:
        "NOT_APPLICABLE_SHADOW",
    });

    if (
      order.events.length >
      this.config
        .maximumEventsPerOrder
    ) {
      order.events.splice(
        1,
        order.events.length -
          this.config
            .maximumEventsPerOrder,
      );
    }

    this.totalEventsObserved +=
      1;

    this.lifecycleRevision +=
      1;
  }

  private validateOrderRules(
    quantity:
      number,

    price:
      number,

    capability:
      ExchangeMarketCapability | null,
  ): CrossExchangeMarketMakingLifecycleBlocker[] {
    const blockers:
      CrossExchangeMarketMakingLifecycleBlocker[] =
      [];

    if (
      !capability
    ) {
      return [
        "MAKER_CAPABILITY_MISSING",
      ];
    }

    const {
      minimumQuantity,
      maximumQuantity,
      quantityStep,
      quantityPrecision,
    } = capability.quantity;

    if (
      (
        minimumQuantity !==
          null &&
        !this.isPositive(
          minimumQuantity,
        )
      ) ||
      !this.isPositive(
        quantityStep,
      ) ||
      (
        maximumQuantity !==
          null &&
        !this.isPositive(
          maximumQuantity,
        )
      ) ||
      (
        quantityPrecision !==
          null &&
        (
          !Number.isSafeInteger(
            quantityPrecision,
          ) ||
          quantityPrecision <
            0
        )
      )
    ) {
      blockers.push(
        "MAKER_QUANTITY_RULES_INVALID",
      );
    } else {
      if (
        (
          minimumQuantity !==
            null &&
          quantity <
            minimumQuantity
        ) ||
        (
          maximumQuantity !==
            null &&
          quantity >
            maximumQuantity
        )
      ) {
        blockers.push(
          "SHADOW_QUANTITY_OUTSIDE_RULES",
        );
      }

      const stepUnits =
        quantity /
        quantityStep;

      if (
        Math.abs(
          stepUnits -
          Math.round(
            stepUnits,
          ),
        ) >
        1e-8
      ) {
        blockers.push(
          "SHADOW_QUANTITY_STEP_MISMATCH",
        );
      }
    }

    const {
      minimumNotional,
      maximumNotional,
    } = capability.notional;

    if (
      !this.isPositive(
        minimumNotional,
      ) ||
      (
        maximumNotional !==
          null &&
        !this.isPositive(
          maximumNotional,
        )
      )
    ) {
      blockers.push(
        "MAKER_NOTIONAL_RULES_INVALID",
      );
    } else {
      const notional =
        quantity *
        price;

      if (
        !Number.isFinite(
          notional,
        ) ||
        notional <
          minimumNotional ||
        (
          maximumNotional !==
            null &&
          notional >
            maximumNotional
        )
      ) {
        blockers.push(
          "SHADOW_NOTIONAL_OUTSIDE_RULES",
        );
      }
    }

    return blockers;
  }

  private getActiveOrder(
    routeKey:
      string,
  ): MutableShadowMakerOrder | null {
    const orderId =
      this.activeOrderByRoute.get(
        routeKey,
      );

    if (
      !orderId
    ) {
      return null;
    }

    const order =
      this.orders.get(
        orderId,
      );

    if (
      !order ||
      order.status !==
        "ACTIVE"
    ) {
      this.activeOrderByRoute.delete(
        routeKey,
      );

      return null;
    }

    return order;
  }

  private evaluation(
    market:
      string,

    side:
      CrossExchangeMarketMakingSide,

    evaluatedAt:
      number,

    action:
      CrossExchangeMarketMakingLifecycleEvaluation["action"],

    orderId:
      string | null,

    previousOrderId:
      string | null,

    pricingBlockers:
      readonly CrossExchangeMarketMakingPriceBlocker[],

    lifecycleBlockers:
      readonly CrossExchangeMarketMakingLifecycleBlocker[],
  ): CrossExchangeMarketMakingLifecycleEvaluation {
    return {
      market,
      side,
      evaluatedAt,
      action,
      orderId,
      previousOrderId,
      pricingBlockers: [
        ...pricingBlockers,
      ],
      lifecycleBlockers: [
        ...lifecycleBlockers,
      ],
    };
  }

  private pruneCancelledOrders():
    void {
    if (
      this.orders.size <=
      this.config
        .maximumRetainedOrders
    ) {
      return;
    }

    const cancelled =
      Array.from(
        this.orders.values(),
      ).filter(
        (order) =>
          order.status ===
          "CANCELLED",
      ).sort(
        (
          first,
          second,
        ) =>
          (
            first.cancelledAt ??
            first.placedAt
          ) -
          (
            second.cancelledAt ??
            second.placedAt
          ),
      );

    for (
      const order
      of cancelled
    ) {
      if (
        this.orders.size <=
        this.config
          .maximumRetainedOrders
      ) {
        break;
      }

      this.orders.delete(
        order.id,
      );
    }
  }

  private createRouteKey(
    market:
      string,

    side:
      CrossExchangeMarketMakingSide,

    makerExchange:
      string | null,

    hedgeExchange:
      string | null,
  ): string {
    return [
      market,
      makerExchange?.trim().toLowerCase() ?? "unknown-maker",
      hedgeExchange?.trim().toLowerCase() ?? "unknown-hedge",
      side,
    ].join(":");
  }

  private isPositive(
    value:
      number | null,
  ): value is number {
    return value !==
      null &&
      Number.isFinite(
        value,
      ) &&
      value >
        0;
  }

  private normalizeNumber(
    value:
      number,
  ): number {
    return Number(
      value.toPrecision(
        15,
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
