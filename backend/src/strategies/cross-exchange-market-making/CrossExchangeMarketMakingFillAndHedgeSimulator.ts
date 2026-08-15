import type {
  ExchangeMarketCapability,
} from "../../execution/capabilities/models/ExchangeCapability";

import type {
  OrderBook,
} from "../../orderbook/models/OrderBook";

import {
  orderBookService,
} from "../../orderbook/services/OrderBookService";

import {
  exchangeCapabilityService,
} from "../../execution/capabilities/services/ExchangeCapabilityService";

import {
  immutableStrategyIntent,
} from "../models/StrategyIntent";

import type {
  CrossExchangeMarketMakingHedgeStrategyIntent,
} from "../models/StrategyIntent";

import type {
  CrossExchangeMarketMakingConfiguration,
  CrossExchangeMarketMakingFillState,
} from "./CrossExchangeMarketMakingConfiguration";

import type {
  CrossExchangeMarketMakingLifecycleSnapshot,
  CrossExchangeMarketMakingShadowMakerOrder,
} from "./CrossExchangeMarketMakingMakerLifecycleSimulator";

import type {
  CrossExchangeMarketMakingPricingSnapshot,
} from "./CrossExchangeMarketMakingPriceEngine";

import {
  crossExchangeMarketMakingPublicTradeTapeService,
} from "./CrossExchangeMarketMakingPublicTradeTapeService";

import type {
  CrossExchangeMarketMakingPublicTrade,
} from "./CrossExchangeMarketMakingPublicTradeTapeService";

export type CrossExchangeMarketMakingFillBlocker =
  | "FILL_CONFIGURATION_NOT_READY"
  | "CONTROLLER_NOT_RUNNING"
  | "SAFE_PRICE_EVIDENCE_UNAVAILABLE"
  | "MAKER_QUOTE_UNAVAILABLE"
  | "MINIMUM_RESTING_TIME_NOT_MET"
  | "POST_PLACEMENT_QUOTE_REQUIRED"
  | "TRADE_THROUGH_NOT_PROVEN"
  | "MAKER_ORDER_BOOK_UNAVAILABLE"
  | "MAKER_ORDER_BOOK_STALE"
  | "MAKER_PRICE_LEVEL_UNAVAILABLE"
  | "PUBLIC_TRADE_TAPE_UNAVAILABLE"
  | "QUEUE_AHEAD_NOT_CONSUMED";

export type CrossExchangeMarketMakingHedgeBlocker =
  | "HEDGE_QUOTE_UNAVAILABLE"
  | "HEDGE_TOP_OF_BOOK_QUANTITY_INSUFFICIENT"
  | "HEDGE_CAPABILITY_MISSING"
  | "HEDGE_CAPABILITY_MISMATCH"
  | "HEDGE_CAPABILITY_STALE"
  | "HEDGE_TRADING_DISABLED"
  | "HEDGE_MAINTENANCE_MODE"
  | "HEDGE_MARKET_ORDER_UNSUPPORTED"
  | "HEDGE_QUANTITY_RULES_INVALID"
  | "HEDGE_QUANTITY_OUTSIDE_RULES"
  | "HEDGE_QUANTITY_STEP_MISMATCH"
  | "HEDGE_NOTIONAL_RULES_INVALID"
  | "HEDGE_NOTIONAL_OUTSIDE_RULES";

export interface CrossExchangeMarketMakingFillAssessment {
  readonly orderId:
    string;

  readonly market:
    string;

  readonly side:
    "BID" | "ASK";

  readonly evaluatedAt:
    number;

  readonly status:
    | "NO_FILL"
    | "SIMULATED_PARTIAL_FILL"
    | "SIMULATED_FULL_FILL";

  readonly blockers:
    readonly CrossExchangeMarketMakingFillBlocker[];

  readonly makerQuoteTimestamp:
    number | null;

  readonly restingTimeMs:
    number;

  readonly requiredTradeThroughTicks:
    number | null;

  readonly observedTradeThroughTicks:
    number | null;

  readonly queueEvidence: {
    readonly model:
      "NOT_APPLICABLE"
      | "PUBLIC_TRADE_FIFO_V21_5";

    readonly initialQueueAheadQuantity:
      number | null;

    readonly remainingQueueAheadQuantity:
      number | null;

    readonly qualifyingPublicTradeQuantity:
      number | null;

    readonly simulatedFillQuantity:
      number | null;
  };
}

export interface CrossExchangeMarketMakingSimulatedFill {
  readonly id:
    string;

  readonly strategyId:
    "cross-exchange-market-making";

  readonly orderId:
    string;

  readonly sourceSignalId:
    string;

  readonly market:
    string;

  readonly makerExchange:
    string;

  readonly hedgeExchange:
    string;

  readonly makerSide:
    "BID" | "ASK";

  readonly simulatedFillPrice:
    number;

  readonly simulatedFillQuantity:
    number;

  readonly simulatedFillNotional:
    number;

  readonly simulatedAt:
    number;

  readonly proofQuoteTimestamp:
    number;

  readonly proofTopOfBookPrice:
    number;

  readonly requiredTradeThroughTicks:
    number;

  readonly observedTradeThroughTicks:
    number;

  readonly method:
    | "FRESH_POST_RESTING_TOP_OF_BOOK_MOVE_THROUGH_V21_3"
    | "PUBLIC_TRADE_FIFO_QUEUE_CONSUMPTION_V21_5";

  readonly quantityModel:
    | "FULL_CONFIGURED_QUANTITY_OR_NO_FILL"
    | "PARTIAL_REMAINING_QUANTITY_FROM_PUBLIC_TRADE_VOLUME";

  readonly partialFillModel:
    | "NOT_AVAILABLE_V21_3"
    | "PUBLIC_TRADE_FIFO_V21_5";

  readonly queuePosition:
    | "UNKNOWN_NOT_INFERRED"
    | "OBSERVED_LEVEL_QUANTITY_ASSUMED_AHEAD_CONSERVATIVELY";

  readonly fillProbability:
    | "NOT_MODELED"
    | "NOT_INFERRED_DIRECT_QUEUE_CONSUMPTION_ONLY";

  readonly finalFillForOrder:
    boolean;

  readonly queueEvidence: {
    readonly initializedAt:
      number;

    readonly bookTimestamp:
      number;

    readonly initialQueueAheadQuantity:
      number;

    readonly remainingQueueAheadQuantity:
      number;

    readonly qualifyingPublicTradeQuantity:
      number;

    readonly publicTradeIds:
      readonly string[];
  } | null;

  readonly exchangeFill:
    false;

  readonly executionAuthorized:
    false;
}

export interface CrossExchangeMarketMakingHedgeAssessment {
  readonly fillId:
    string;

  readonly evaluatedAt:
    number;

  readonly status:
    | "READY"
    | "BLOCKED";

  readonly hedgeExchange:
    string;

  readonly hedgeSide:
    | "BUY"
    | "SELL";

  readonly hedgeReferencePrice:
    number | null;

  readonly hedgeReferenceQuantity:
    number | null;

  readonly requiredQuantity:
    number;

  readonly blockers:
    readonly CrossExchangeMarketMakingHedgeBlocker[];

  readonly balanceEvidence:
    "NOT_EVALUATED_V21_3";

  readonly executionAuthorized:
    false;
}

export interface CrossExchangeMarketMakingFillAndHedgeSnapshot {
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
    CrossExchangeMarketMakingFillState;

  readonly controllerRunning:
    boolean;

  readonly assessments:
    readonly CrossExchangeMarketMakingFillAssessment[];

  readonly fills:
    readonly CrossExchangeMarketMakingSimulatedFill[];

  readonly hedgeAssessments:
    readonly CrossExchangeMarketMakingHedgeAssessment[];

  readonly hedgeIntents:
    readonly CrossExchangeMarketMakingHedgeStrategyIntent[];

  readonly newlyFilledOrderIds:
    readonly string[];

  readonly safety: {
    readonly shadowOnly:
      true;

    readonly touchIsFill:
      false;

    readonly postPlacementEvidenceRequired:
      true;

    readonly tradeThroughRequired:
      true;

    readonly partialFillsSimulated:
      boolean;

    readonly queuePositionInferred:
      false;

    readonly queuePositionModeledConservatively:
      boolean;

    readonly publicTradeEvidenceRequiredForQueueModel:
      true;

    readonly fillProbabilityModeled:
      false;

    readonly hedgeBalanceChecked:
      false;

    readonly hedgeExecutionAllowed:
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

export interface CrossExchangeMarketMakingHedgeEvidenceSource {
  getCachedHedgeCapability(
    exchange: string,
    market: string,
  ): ExchangeMarketCapability | null;

  getMakerOrderBook?(
    exchange: string,
    market: string,
  ): OrderBook | null;

  getPublicTrades?(
    exchange: string,
    market: string,
    afterExclusive: number,
    throughInclusive: number,
  ): readonly CrossExchangeMarketMakingPublicTrade[];
}

const DEFAULT_SOURCE:
  CrossExchangeMarketMakingHedgeEvidenceSource = {
  getCachedHedgeCapability: (
    exchange,
    market,
  ) =>
    exchangeCapabilityService
      .getCachedCapability(
        exchange,
        market,
        "spot",
      ),

  getMakerOrderBook: (
    exchange,
    market,
  ) =>
    orderBookService.get(
      exchange,
      market,
    ),

  getPublicTrades: (
    exchange,
    market,
    afterExclusive,
    throughInclusive,
  ) =>
    crossExchangeMarketMakingPublicTradeTapeService
      .getTrades(
        exchange,
        market,
        afterExclusive,
        throughInclusive,
      ),
};

interface MutableQueueState {
  initializedAt:
    number;

  bookTimestamp:
    number;

  initialQueueAheadQuantity:
    number;

  remainingQueueAheadQuantity:
    number;

  remainingOrderQuantity:
    number;

  processedTradeIds:
    Set<string>;
}

interface QueueAwareFillResult {
  readonly fill:
    CrossExchangeMarketMakingSimulatedFill | null;

  readonly blockers:
    readonly CrossExchangeMarketMakingFillBlocker[];

  readonly initialQueueAheadQuantity:
    number | null;

  readonly remainingQueueAheadQuantity:
    number | null;

  readonly qualifyingPublicTradeQuantity:
    number | null;

  readonly simulatedFillQuantity:
    number | null;
}

export class CrossExchangeMarketMakingFillAndHedgeSimulator {
  private readonly processedOrderIds =
    new Set<string>();

  private readonly queueStates =
    new Map<
      string,
      MutableQueueState
    >();

  private readonly fills =
    new Map<
      string,
      CrossExchangeMarketMakingSimulatedFill
    >();

  private readonly hedgeAssessments =
    new Map<
      string,
      CrossExchangeMarketMakingHedgeAssessment
    >();

  private readonly hedgeIntents =
    new Map<
      string,
      CrossExchangeMarketMakingHedgeStrategyIntent
    >();

  private lastAssessments:
    readonly CrossExchangeMarketMakingFillAssessment[] =
    [];

  private lastNewlyFilledOrderIds:
    readonly string[] =
    [];

  private fillSequence =
    0;

  constructor(
    private readonly source:
      CrossExchangeMarketMakingHedgeEvidenceSource =
        DEFAULT_SOURCE,
  ) {}

  observe(
    lifecycle:
      CrossExchangeMarketMakingLifecycleSnapshot,

    pricingSnapshots:
      readonly CrossExchangeMarketMakingPricingSnapshot[],

    configuration:
      CrossExchangeMarketMakingConfiguration,

    controllerRunning:
      boolean,

    now =
      Date.now(),
  ): CrossExchangeMarketMakingFillAndHedgeSnapshot {
    const assessments:
      CrossExchangeMarketMakingFillAssessment[] =
      [];

    const newlyFilledOrderIds:
      string[] =
      [];

    const activeOrderIds =
      new Set(
        lifecycle.orders
          .filter(
            (order) =>
              order.status ===
              "ACTIVE",
          )
          .map(
            (order) =>
              order.id,
          ),
      );

    for (
      const orderId
      of this.queueStates.keys()
    ) {
      if (
        !activeOrderIds.has(
          orderId,
        )
      ) {
        this.queueStates.delete(
          orderId,
        );
      }
    }

    for (
      const order
      of lifecycle.orders
    ) {
      if (
        order.status !==
          "ACTIVE" ||
        this.processedOrderIds.has(
          order.id,
        )
      ) {
        continue;
      }

      const pricing =
        pricingSnapshots.find(
          (snapshot) =>
            snapshot.market ===
            order.market,
        ) ??
        null;

      const priceResult =
        pricing?.results.find(
          (result) =>
            result.side ===
            order.side,
        ) ??
        null;

      const makerQuote =
        pricing?.inputs
          .makerQuote ??
        null;

      const blockers:
        CrossExchangeMarketMakingFillBlocker[] =
        [];

      if (
        configuration
          .makerFill
          .state !==
        "READY"
      ) {
        blockers.push(
          "FILL_CONFIGURATION_NOT_READY",
        );
      }

      if (
        !controllerRunning
      ) {
        blockers.push(
          "CONTROLLER_NOT_RUNNING",
        );
      }

      if (
        !pricing ||
        priceResult?.status !==
          "ACCEPTED"
      ) {
        blockers.push(
          "SAFE_PRICE_EVIDENCE_UNAVAILABLE",
        );
      }

      if (
        !makerQuote ||
        !makerQuote.executable ||
        makerQuote.exchange !==
          order.makerExchange ||
        makerQuote.market !==
          order.market
      ) {
        blockers.push(
          "MAKER_QUOTE_UNAVAILABLE",
        );
      }

      const restingTimeMs =
        makerQuote
          ? makerQuote.timestamp -
            order.revisionStartedAt
          : now -
            order.revisionStartedAt;

      const minimumRestingTimeMs =
        configuration
          .makerFill
          .minimumRestingTimeMs;

      if (
        minimumRestingTimeMs ===
          null ||
        restingTimeMs <
          minimumRestingTimeMs
      ) {
        blockers.push(
          "MINIMUM_RESTING_TIME_NOT_MET",
        );
      }

      if (
        !makerQuote ||
        makerQuote.timestamp <=
          order.revisionStartedAt ||
        makerQuote.timestamp >
          now
      ) {
        blockers.push(
          "POST_PLACEMENT_QUOTE_REQUIRED",
        );
      }

      if (
        configuration
          .makerFill
          .queueAwarePartialFillsEnabled
      ) {
        if (
          blockers.length >
          0
        ) {
          assessments.push(
            this.assessment(
              order,
              now,
              "NO_FILL",
              blockers,
              makerQuote?.timestamp ??
                null,
              restingTimeMs,
              null,
              null,
              "PUBLIC_TRADE_FIFO_V21_5",
            ),
          );

          continue;
        }

        const queueResult =
          this.observeQueueAwareFill(
            order,
            configuration,
            now,
          );

        assessments.push(
          this.assessment(
            order,
            now,
            queueResult.fill
              ? queueResult.fill
                  .finalFillForOrder
                ? "SIMULATED_FULL_FILL"
                : "SIMULATED_PARTIAL_FILL"
              : "NO_FILL",
            queueResult.blockers,
            makerQuote?.timestamp ??
              null,
            restingTimeMs,
            null,
            null,
            "PUBLIC_TRADE_FIFO_V21_5",
            queueResult,
          ),
        );

        if (
          !queueResult.fill
        ) {
          continue;
        }

        const fill =
          queueResult.fill;

        this.fills.set(
          fill.id,
          fill,
        );

        if (
          fill.finalFillForOrder
        ) {
          this.processedOrderIds.add(
            order.id,
          );
          newlyFilledOrderIds.push(
            order.id,
          );
        }

        const hedgeAssessment =
          this.assessHedge(
            fill,
            pricing as CrossExchangeMarketMakingPricingSnapshot,
            configuration,
            now,
          );

        this.hedgeAssessments.set(
          fill.id,
          hedgeAssessment,
        );

        if (
          hedgeAssessment.status ===
          "READY"
        ) {
          const intent =
            this.createHedgeIntent(
              fill,
              order,
              pricing as CrossExchangeMarketMakingPricingSnapshot,
              hedgeAssessment,
              configuration,
              now,
            );

          this.hedgeIntents.set(
            intent.id,
            intent,
          );
        }

        continue;
      }

      const proofPrice =
        makerQuote
          ? order.side ===
              "BID"
            ? makerQuote.bestAskPrice
            : makerQuote.bestBidPrice
          : null;

      const minimumTradeThroughTicks =
        configuration
          .makerFill
          .minimumTradeThroughTicks;

      const observedTradeThroughTicks =
        proofPrice !==
          null &&
        Number.isFinite(
          proofPrice,
        )
          ? order.side ===
              "BID"
            ? (
                order.simulatedPrice -
                proofPrice
              ) /
              order.priceStep
            : (
                proofPrice -
                order.simulatedPrice
              ) /
              order.priceStep
          : null;

      if (
        minimumTradeThroughTicks ===
          null ||
        observedTradeThroughTicks ===
          null ||
        observedTradeThroughTicks +
          1e-10 <
          minimumTradeThroughTicks
      ) {
        blockers.push(
          "TRADE_THROUGH_NOT_PROVEN",
        );
      }

      if (
        blockers.length >
        0
      ) {
        assessments.push(
          this.assessment(
            order,
            now,
            "NO_FILL",
            blockers,
            makerQuote?.timestamp ??
              null,
            restingTimeMs,
            minimumTradeThroughTicks,
            observedTradeThroughTicks,
          ),
        );

        continue;
      }

      const fill =
        this.createFill(
          order,
          now,
          makerQuote?.timestamp as number,
          proofPrice as number,
          minimumTradeThroughTicks as number,
          observedTradeThroughTicks as number,
        );

      this.processedOrderIds.add(
        order.id,
      );

      this.fills.set(
        fill.id,
        fill,
      );

      newlyFilledOrderIds.push(
        order.id,
      );

      assessments.push(
        this.assessment(
          order,
          now,
          "SIMULATED_FULL_FILL",
          [],
          fill.proofQuoteTimestamp,
          restingTimeMs,
          minimumTradeThroughTicks,
          observedTradeThroughTicks,
        ),
      );

      const hedgeAssessment =
        this.assessHedge(
          fill,
          pricing as CrossExchangeMarketMakingPricingSnapshot,
          configuration,
          now,
        );

      this.hedgeAssessments.set(
        fill.id,
        hedgeAssessment,
      );

      if (
        hedgeAssessment.status ===
        "READY"
      ) {
        const intent =
          this.createHedgeIntent(
            fill,
            order,
            pricing as CrossExchangeMarketMakingPricingSnapshot,
            hedgeAssessment,
            configuration,
            now,
          );

        this.hedgeIntents.set(
          intent.id,
          intent,
        );
      }
    }

    this.lastAssessments =
      immutableClone(
        assessments,
      );
    this.lastNewlyFilledOrderIds =
      immutableClone(
        newlyFilledOrderIds,
      );

    return this.getSnapshot(
      configuration,
      controllerRunning,
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
  ): CrossExchangeMarketMakingFillAndHedgeSnapshot {
    const fills =
      Array.from(
        this.fills.values(),
      ).sort(
        (first, second) =>
          first.simulatedAt -
            second.simulatedAt ||
          first.id.localeCompare(
            second.id,
          ),
      );

    const hedgeAssessments =
      fills
        .map(
          (fill) =>
            this.hedgeAssessments
              .get(
                fill.id,
              ),
        )
        .filter(
          (
            assessment,
          ): assessment is CrossExchangeMarketMakingHedgeAssessment =>
            assessment !==
            undefined,
        );

    const hedgeIntents =
      Array.from(
        this.hedgeIntents.values(),
      ).sort(
        (first, second) =>
          first.createdAt -
            second.createdAt ||
          first.id.localeCompare(
            second.id,
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
        this.lastAssessments.length >
          0 ||
        fills.length >
          0
          ? "AVAILABLE"
          : "NO_DATA",
      configurationState:
        configuration
          .makerFill
          .state,
      controllerRunning,
      assessments:
        this.lastAssessments,
      fills,
      hedgeAssessments,
      hedgeIntents,
      newlyFilledOrderIds:
        this.lastNewlyFilledOrderIds,
      safety: {
        shadowOnly:
          true,
        touchIsFill:
          false,
        postPlacementEvidenceRequired:
          true,
        tradeThroughRequired:
          true,
        partialFillsSimulated:
          configuration
            .makerFill
            .queueAwarePartialFillsEnabled,
        queuePositionInferred:
          false,
        queuePositionModeledConservatively:
          configuration
            .makerFill
            .queueAwarePartialFillsEnabled,
        publicTradeEvidenceRequiredForQueueModel:
          true,
        fillProbabilityModeled:
          false,
        hedgeBalanceChecked:
          false,
        hedgeExecutionAllowed:
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

  getIntents(
    now =
      Date.now(),
  ): readonly CrossExchangeMarketMakingHedgeStrategyIntent[] {
    return Array.from(
      this.hedgeIntents.values(),
    ).filter(
      (intent) =>
        intent.expiresAt >=
        now,
    ).sort(
      (first, second) =>
        second.createdAt -
          first.createdAt ||
        first.id.localeCompare(
          second.id,
        ),
    ).map(
      (intent) =>
        immutableStrategyIntent(
          intent,
        ) as CrossExchangeMarketMakingHedgeStrategyIntent,
    );
  }

  private observeQueueAwareFill(
    order:
      CrossExchangeMarketMakingShadowMakerOrder,
    configuration:
      CrossExchangeMarketMakingConfiguration,
    now:
      number,
  ): QueueAwareFillResult {
    const maximumAgeMs =
      configuration
        .makerFill
        .maximumPublicTradeAgeMs;

    let queueState =
      this.queueStates.get(
        order.id,
      ) ??
      null;

    if (
      !queueState
    ) {
      let book:
        OrderBook | null =
        null;

      try {
        book =
          this.source
            .getMakerOrderBook?.(
              order.makerExchange,
              order.market,
            ) ??
          null;
      } catch {
        book =
          null;
      }

      if (
        !book
      ) {
        return this.queueNoFill(
          "MAKER_ORDER_BOOK_UNAVAILABLE",
        );
      }

      if (
        maximumAgeMs ===
          null ||
        !Number.isSafeInteger(
          book.timestamp,
        ) ||
        book.timestamp <=
          order.revisionStartedAt ||
        book.timestamp >
          now ||
        now -
          book.timestamp >
          maximumAgeMs
      ) {
        return this.queueNoFill(
          "MAKER_ORDER_BOOK_STALE",
        );
      }

      const levels =
        order.side ===
          "BID"
          ? book.bids
          : book.asks;
      const priceLevel =
        levels.find(
          (level) =>
            Math.abs(
              level.price -
                order.simulatedPrice,
            ) <=
            Math.max(
              1e-12,
              order.priceStep *
                1e-8,
            ),
        ) ??
        null;

      if (
        !priceLevel ||
        !this.isPositive(
          priceLevel.quantity,
        )
      ) {
        return this.queueNoFill(
          "MAKER_PRICE_LEVEL_UNAVAILABLE",
        );
      }

      queueState = {
        initializedAt:
          now,
        bookTimestamp:
          book.timestamp,
        initialQueueAheadQuantity:
          priceLevel.quantity,
        remainingQueueAheadQuantity:
          priceLevel.quantity,
        remainingOrderQuantity:
          order.simulatedQuantity,
        processedTradeIds:
          new Set<string>(),
      };

      this.queueStates.set(
        order.id,
        queueState,
      );
    }

    let trades:
      readonly CrossExchangeMarketMakingPublicTrade[];

    try {
      if (
        !this.source
          .getPublicTrades
      ) {
        return this.queueNoFill(
          "PUBLIC_TRADE_TAPE_UNAVAILABLE",
          queueState,
        );
      }

      trades =
        this.source
          .getPublicTrades(
            order.makerExchange,
            order.market,
            queueState.bookTimestamp,
            now,
          );
    } catch {
      return this.queueNoFill(
        "PUBLIC_TRADE_TAPE_UNAVAILABLE",
        queueState,
      );
    }

    const qualifyingTrades:
      CrossExchangeMarketMakingPublicTrade[] =
      [];

    for (
      const trade
      of trades
    ) {
      if (
        queueState.processedTradeIds.has(
          trade.id,
        ) ||
        maximumAgeMs ===
          null ||
        now -
          trade.occurredAt >
          maximumAgeMs ||
        trade.occurredAt <=
          queueState.bookTimestamp ||
        trade.occurredAt >
          now
      ) {
        continue;
      }

      queueState.processedTradeIds.add(
        trade.id,
      );

      const qualifies =
        order.side ===
          "BID"
          ? trade.aggressorSide ===
              "SELL" &&
            trade.price <=
              order.simulatedPrice
          : trade.aggressorSide ===
              "BUY" &&
            trade.price >=
              order.simulatedPrice;

      if (
        qualifies
      ) {
        qualifyingTrades.push(
          trade,
        );
      }
    }

    const qualifyingQuantity =
      qualifyingTrades.reduce(
        (total, trade) =>
          total +
          trade.quantity,
        0,
      );

    const queueConsumption =
      Math.min(
        queueState
          .remainingQueueAheadQuantity,
        qualifyingQuantity,
      );

    queueState.remainingQueueAheadQuantity =
      this.normalizeNumber(
        Math.max(
          0,
          queueState
            .remainingQueueAheadQuantity -
            queueConsumption,
        ),
      );

    const availableForOrder =
      Math.max(
        0,
        qualifyingQuantity -
          queueConsumption,
      );
    const simulatedFillQuantity =
      this.normalizeNumber(
        Math.min(
          queueState
            .remainingOrderQuantity,
          availableForOrder,
        ),
      );

    if (
      simulatedFillQuantity <=
      1e-12
    ) {
      return this.queueNoFill(
        "QUEUE_AHEAD_NOT_CONSUMED",
        queueState,
        qualifyingQuantity,
      );
    }

    queueState.remainingOrderQuantity =
      this.normalizeNumber(
        Math.max(
          0,
          queueState
            .remainingOrderQuantity -
            simulatedFillQuantity,
        ),
      );

    const proofTrade =
      qualifyingTrades.at(
        -1,
      );

    if (
      !proofTrade
    ) {
      return this.queueNoFill(
        "PUBLIC_TRADE_TAPE_UNAVAILABLE",
        queueState,
        qualifyingQuantity,
      );
    }

    const finalFillForOrder =
      queueState.remainingOrderQuantity <=
      1e-12;
    const fill =
      this.createQueueAwareFill(
        order,
        queueState,
        qualifyingTrades,
        qualifyingQuantity,
        simulatedFillQuantity,
        finalFillForOrder,
        now,
        proofTrade,
      );

    return {
      fill,
      blockers:
        [],
      initialQueueAheadQuantity:
        queueState
          .initialQueueAheadQuantity,
      remainingQueueAheadQuantity:
        queueState
          .remainingQueueAheadQuantity,
      qualifyingPublicTradeQuantity:
        this.normalizeNumber(
          qualifyingQuantity,
        ),
      simulatedFillQuantity,
    };
  }

  private queueNoFill(
    blocker:
      CrossExchangeMarketMakingFillBlocker,
    queueState:
      MutableQueueState | null =
      null,
    qualifyingPublicTradeQuantity:
      number | null =
      null,
  ): QueueAwareFillResult {
    return {
      fill:
        null,
      blockers: [
        blocker,
      ],
      initialQueueAheadQuantity:
        queueState
          ?.initialQueueAheadQuantity ??
        null,
      remainingQueueAheadQuantity:
        queueState
          ?.remainingQueueAheadQuantity ??
        null,
      qualifyingPublicTradeQuantity:
        qualifyingPublicTradeQuantity ===
          null
          ? null
          : this.normalizeNumber(
              qualifyingPublicTradeQuantity,
            ),
      simulatedFillQuantity:
        null,
    };
  }

  private createQueueAwareFill(
    order:
      CrossExchangeMarketMakingShadowMakerOrder,
    queueState:
      MutableQueueState,
    qualifyingTrades:
      readonly CrossExchangeMarketMakingPublicTrade[],
    qualifyingQuantity:
      number,
    simulatedFillQuantity:
      number,
    finalFillForOrder:
      boolean,
    now:
      number,
    proofTrade:
      CrossExchangeMarketMakingPublicTrade,
  ): CrossExchangeMarketMakingSimulatedFill {
    this.fillSequence +=
      1;

    return immutableClone({
      id: [
        "cross-exchange-market-making",
        "queue-simulated-fill",
        order.id,
        now,
        this.fillSequence,
      ].join(
        ":",
      ),
      strategyId:
        "cross-exchange-market-making",
      orderId:
        order.id,
      sourceSignalId:
        order.sourceSignalId,
      market:
        order.market,
      makerExchange:
        order.makerExchange,
      hedgeExchange:
        order.hedgeExchange,
      makerSide:
        order.side,
      simulatedFillPrice:
        order.simulatedPrice,
      simulatedFillQuantity,
      simulatedFillNotional:
        this.normalizeNumber(
          order.simulatedPrice *
            simulatedFillQuantity,
        ),
      simulatedAt:
        now,
      proofQuoteTimestamp:
        proofTrade.occurredAt,
      proofTopOfBookPrice:
        proofTrade.price,
      requiredTradeThroughTicks:
        0,
      observedTradeThroughTicks:
        this.normalizeNumber(
          order.side ===
            "BID"
            ? (
                order.simulatedPrice -
                proofTrade.price
              ) /
              order.priceStep
            : (
                proofTrade.price -
                order.simulatedPrice
              ) /
              order.priceStep,
        ),
      method:
        "PUBLIC_TRADE_FIFO_QUEUE_CONSUMPTION_V21_5",
      quantityModel:
        "PARTIAL_REMAINING_QUANTITY_FROM_PUBLIC_TRADE_VOLUME",
      partialFillModel:
        "PUBLIC_TRADE_FIFO_V21_5",
      queuePosition:
        "OBSERVED_LEVEL_QUANTITY_ASSUMED_AHEAD_CONSERVATIVELY",
      fillProbability:
        "NOT_INFERRED_DIRECT_QUEUE_CONSUMPTION_ONLY",
      finalFillForOrder,
      queueEvidence: {
        initializedAt:
          queueState.initializedAt,
        bookTimestamp:
          queueState.bookTimestamp,
        initialQueueAheadQuantity:
          queueState.initialQueueAheadQuantity,
        remainingQueueAheadQuantity:
          queueState.remainingQueueAheadQuantity,
        qualifyingPublicTradeQuantity:
          this.normalizeNumber(
            qualifyingQuantity,
          ),
        publicTradeIds:
          qualifyingTrades.map(
            (trade) =>
              trade.id,
          ),
      },
      exchangeFill:
        false,
      executionAuthorized:
        false,
    });
  }

  private createFill(
    order:
      CrossExchangeMarketMakingShadowMakerOrder,

    now:
      number,

    proofQuoteTimestamp:
      number,

    proofTopOfBookPrice:
      number,

    requiredTradeThroughTicks:
      number,

    observedTradeThroughTicks:
      number,
  ): CrossExchangeMarketMakingSimulatedFill {
    this.fillSequence +=
      1;

    return immutableClone({
      id: [
        "cross-exchange-market-making",
        "simulated-fill",
        order.id,
        now,
        this.fillSequence,
      ].join(
        ":",
      ),
      strategyId:
        "cross-exchange-market-making",
      orderId:
        order.id,
      sourceSignalId:
        order.sourceSignalId,
      market:
        order.market,
      makerExchange:
        order.makerExchange,
      hedgeExchange:
        order.hedgeExchange,
      makerSide:
        order.side,
      simulatedFillPrice:
        order.simulatedPrice,
      simulatedFillQuantity:
        order.simulatedQuantity,
      simulatedFillNotional:
        order.simulatedNotional,
      simulatedAt:
        now,
      proofQuoteTimestamp,
      proofTopOfBookPrice,
      requiredTradeThroughTicks,
      observedTradeThroughTicks:
        this.normalizeNumber(
          observedTradeThroughTicks,
        ),
      method:
        "FRESH_POST_RESTING_TOP_OF_BOOK_MOVE_THROUGH_V21_3",
      quantityModel:
        "FULL_CONFIGURED_QUANTITY_OR_NO_FILL",
      partialFillModel:
        "NOT_AVAILABLE_V21_3",
      queuePosition:
        "UNKNOWN_NOT_INFERRED",
      fillProbability:
        "NOT_MODELED",
      finalFillForOrder:
        true,
      queueEvidence:
        null,
      exchangeFill:
        false,
      executionAuthorized:
        false,
    });
  }

  private assessHedge(
    fill:
      CrossExchangeMarketMakingSimulatedFill,

    pricing:
      CrossExchangeMarketMakingPricingSnapshot,

    configuration:
      CrossExchangeMarketMakingConfiguration,

    now:
      number,
  ): CrossExchangeMarketMakingHedgeAssessment {
    const blockers:
      CrossExchangeMarketMakingHedgeBlocker[] =
      [];

    const hedgeSide =
      fill.makerSide ===
        "BID"
        ? "SELL"
        : "BUY";

    const hedgeQuote =
      pricing.inputs
        .hedgeQuote;

    const hedgeReferencePrice =
      hedgeQuote
        ? hedgeSide ===
            "SELL"
          ? hedgeQuote.bestBidPrice
          : hedgeQuote.bestAskPrice
        : null;

    const hedgeReferenceQuantity =
      hedgeQuote
        ? hedgeSide ===
            "SELL"
          ? hedgeQuote.bestBidQty
          : hedgeQuote.bestAskQty
        : null;

    if (
      !hedgeQuote ||
      !hedgeQuote.executable ||
      hedgeQuote.exchange !==
        fill.hedgeExchange ||
      hedgeQuote.market !==
        fill.market ||
      !this.isPositive(
        hedgeReferencePrice,
      ) ||
      !this.isPositive(
        hedgeReferenceQuantity,
      )
    ) {
      blockers.push(
        "HEDGE_QUOTE_UNAVAILABLE",
      );
    } else if (
      hedgeReferenceQuantity <
      fill.simulatedFillQuantity
    ) {
      blockers.push(
        "HEDGE_TOP_OF_BOOK_QUANTITY_INSUFFICIENT",
      );
    }

    let capability:
      ExchangeMarketCapability | null =
      null;

    try {
      capability =
        this.source
          .getCachedHedgeCapability(
            fill.hedgeExchange,
            fill.market,
          );
    } catch {
      capability =
        null;
    }

    if (
      !capability
    ) {
      blockers.push(
        "HEDGE_CAPABILITY_MISSING",
      );
    } else {
      if (
        capability.exchange !==
          fill.hedgeExchange ||
        capability.market !==
          fill.market ||
        capability.product !==
          "spot"
      ) {
        blockers.push(
          "HEDGE_CAPABILITY_MISMATCH",
        );
      }

      const capabilityAgeMs =
        now -
        capability.synchronizedAt;

      if (
        !Number.isSafeInteger(
          capability.synchronizedAt,
        ) ||
        capability.synchronizedAt <=
          0 ||
        capabilityAgeMs <
          0 ||
        capabilityAgeMs >
          configuration.maximumCapabilityAgeMs
      ) {
        blockers.push(
          "HEDGE_CAPABILITY_STALE",
        );
      }

      if (
        !capability.tradingEnabled
      ) {
        blockers.push(
          "HEDGE_TRADING_DISABLED",
        );
      }

      if (
        capability.maintenanceMode
      ) {
        blockers.push(
          "HEDGE_MAINTENANCE_MODE",
        );
      }

      if (
        !capability.order
          .supportedOrderTypes
          .includes(
            "market",
          )
      ) {
        blockers.push(
          "HEDGE_MARKET_ORDER_UNSUPPORTED",
        );
      }

      blockers.push(
        ...this.validateHedgeRules(
          fill.simulatedFillQuantity,
          hedgeReferencePrice,
          capability,
        ),
      );
    }

    return immutableClone({
      fillId:
        fill.id,
      evaluatedAt:
        now,
      status:
        blockers.length ===
          0
          ? "READY"
          : "BLOCKED",
      hedgeExchange:
        fill.hedgeExchange,
      hedgeSide,
      hedgeReferencePrice:
        this.isPositive(
          hedgeReferencePrice,
        )
          ? hedgeReferencePrice
          : null,
      hedgeReferenceQuantity:
        this.isPositive(
          hedgeReferenceQuantity,
        )
          ? hedgeReferenceQuantity
          : null,
      requiredQuantity:
        fill.simulatedFillQuantity,
      blockers:
        Array.from(
          new Set(
            blockers,
          ),
        ),
      balanceEvidence:
        "NOT_EVALUATED_V21_3",
      executionAuthorized:
        false,
    });
  }

  private createHedgeIntent(
    fill:
      CrossExchangeMarketMakingSimulatedFill,

    order:
      CrossExchangeMarketMakingShadowMakerOrder,

    pricing:
      CrossExchangeMarketMakingPricingSnapshot,

    assessment:
      CrossExchangeMarketMakingHedgeAssessment,

    configuration:
      CrossExchangeMarketMakingConfiguration,

    now:
      number,
  ): CrossExchangeMarketMakingHedgeStrategyIntent {
    const priceResult =
      pricing.results.find(
        (result) =>
          result.side ===
          order.side,
      );

    if (
      !priceResult?.evidence ||
      assessment.hedgeReferencePrice ===
        null ||
      assessment.hedgeReferenceQuantity ===
        null ||
      configuration
        .makerFill
        .hedgeIntentTtlMs ===
        null
    ) {
      throw new Error(
        "XEMM hedge intent requires complete verified SHADOW evidence.",
      );
    }

    return immutableStrategyIntent({
      id: [
        "cross-exchange-market-making",
        "shadow-hedge-intent",
        fill.id,
      ].join(
        ":",
      ),
      strategyId:
        "cross-exchange-market-making",
      signalId:
        fill.sourceSignalId,
      kind:
        "PROPOSED_STRATEGY_ACTION",
      proposedMode:
        "SHADOW",
      proposalType:
        "XEMM_HEDGE_AFTER_SIMULATED_MAKER_FILL",
      proposedCapital:
        null,
      createdAt:
        now,
      expiresAt:
        Math.min(
          now +
            configuration
              .makerFill
              .hedgeIntentTtlMs,
          priceResult.expiresAt ??
            Number.MAX_SAFE_INTEGER,
        ),
      status:
        "PROPOSED",
      executionAuthorized:
        false,
      automaticExecutionAllowed:
        false,
      evidence: {
        type:
          "XEMM_HEDGE_AFTER_SIMULATED_MAKER_FILL",
        simulatedFillId:
          fill.id,
        makerOrderId:
          order.id,
        market:
          fill.market,
        makerExchange:
          fill.makerExchange,
        makerSide:
          fill.makerSide,
        simulatedMakerFillPrice:
          fill.simulatedFillPrice,
        simulatedQuantity:
          fill.simulatedFillQuantity,
        hedgeExchange:
          fill.hedgeExchange,
        hedgeSide:
          assessment.hedgeSide,
        hedgeReferencePrice:
          assessment.hedgeReferencePrice,
        hedgeReferenceQuantity:
          assessment.hedgeReferenceQuantity,
        hedgeTakerFeePercent:
          priceResult.evidence
            .hedgeTakerFee
            .percent,
        hedgeTakerFeeSource:
          priceResult.evidence
            .hedgeTakerFee
            .source,
        hedgeCapacityStatus:
          "FULL_TOP_OF_BOOK_CAPACITY_VERIFIED",
        balanceEvidence:
          "NOT_EVALUATED_V21_3",
        hedgeSlippageBeyondTop:
          "NOT_EVALUATED_V21_3",
        recoveryExecution:
          "NOT_AUTHORIZED_V21_3",
      },
    }) as CrossExchangeMarketMakingHedgeStrategyIntent;
  }

  private validateHedgeRules(
    quantity:
      number,

    price:
      number | null,

    capability:
      ExchangeMarketCapability,
  ): CrossExchangeMarketMakingHedgeBlocker[] {
    const blockers:
      CrossExchangeMarketMakingHedgeBlocker[] =
      [];

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
        "HEDGE_QUANTITY_RULES_INVALID",
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
          "HEDGE_QUANTITY_OUTSIDE_RULES",
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
          "HEDGE_QUANTITY_STEP_MISMATCH",
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
        "HEDGE_NOTIONAL_RULES_INVALID",
      );
    } else if (
      !this.isPositive(
        price,
      ) ||
      quantity *
        price <
        minimumNotional ||
      (
        maximumNotional !==
          null &&
        quantity *
          price >
          maximumNotional
      )
    ) {
      blockers.push(
        "HEDGE_NOTIONAL_OUTSIDE_RULES",
      );
    }

    return blockers;
  }

  private assessment(
    order:
      CrossExchangeMarketMakingShadowMakerOrder,

    evaluatedAt:
      number,

    status:
      CrossExchangeMarketMakingFillAssessment["status"],

    blockers:
      readonly CrossExchangeMarketMakingFillBlocker[],

    makerQuoteTimestamp:
      number | null,

    restingTimeMs:
      number,

    requiredTradeThroughTicks:
      number | null,

    observedTradeThroughTicks:
      number | null,

    queueModel:
      CrossExchangeMarketMakingFillAssessment["queueEvidence"]["model"] =
      "NOT_APPLICABLE",

    queueResult:
      QueueAwareFillResult | null =
      null,
  ): CrossExchangeMarketMakingFillAssessment {
    return {
      orderId:
        order.id,
      market:
        order.market,
      side:
        order.side,
      evaluatedAt,
      status,
      blockers: [
        ...blockers,
      ],
      makerQuoteTimestamp,
      restingTimeMs,
      requiredTradeThroughTicks,
      observedTradeThroughTicks:
        observedTradeThroughTicks ===
          null
          ? null
          : this.normalizeNumber(
              observedTradeThroughTicks,
            ),
      queueEvidence: {
        model:
          queueModel,
        initialQueueAheadQuantity:
          queueResult
            ?.initialQueueAheadQuantity ??
          null,
        remainingQueueAheadQuantity:
          queueResult
            ?.remainingQueueAheadQuantity ??
          null,
        qualifyingPublicTradeQuantity:
          queueResult
            ?.qualifyingPublicTradeQuantity ??
          null,
        simulatedFillQuantity:
          queueResult
            ?.simulatedFillQuantity ??
          null,
      },
    };
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
