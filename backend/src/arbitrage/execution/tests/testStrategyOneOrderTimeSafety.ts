import assert from "node:assert/strict";

import {
  ArbitrageExecutionCoordinator,
} from "../ArbitrageExecutionCoordinator";

import type {
  CapitalReservation,
  CreateCapitalReservationRequest,
} from "../../../trading/capital/CapitalReservation";

import {
  StrategyOneOrderTimeSafetyService,
  type StrategyOneOrderTimeSafetyReport,
} from "../StrategyOneOrderTimeSafetyService";

import type {
  ArbitrageOpportunity,
} from "../../models/ArbitrageOpportunity";

import type {
  LiveExecutionAdapter,
  LiveExecutionAdapterCapabilities,
  LiveExecutionAdapterReadiness,
} from "../../../execution/live/contracts/LiveExecutionAdapter";

import type {
  LiveExecutionRequest,
} from "../../../execution/live/models/LiveExecutionRequest";

import type {
  LiveExecutionResult,
} from "../../../execution/live/models/LiveExecutionResult";

import type {
  LiveExecutionExchangeStatus,
} from "../../../execution/live/LiveExecutionService";

import {
  SharedRecoveryIntentService,
} from "../../../recovery/services/SharedRecoveryIntentService";

import type {
  StrategyOneTwoLegExecutionResult,
} from "../../../execution/live/arbitrage/StrategyOneTwoLegLiveExecutionService";

import type {
  StrategyOneTinyLiveAuthorityRecord,
} from "../../../execution/live/tiny-live/StrategyOneTinyLiveActionAuthorityService";

import {
  TINY_LIVE_030_STRATEGY_ONE_EXECUTION_POLICY,
  TINY_LIVE_POST_STRESS_015_STRATEGY_ONE_EXECUTION_POLICY,
  type StrategyOneExecutionPolicyDefinition,
} from "../../../trading/policy/StrategyOneExecutionPolicyService";

function assertCondition(
  condition: boolean,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(
      message,
    );
  }
}

const NOW =
  1_800_000_000_000;

function opportunity(): ArbitrageOpportunity {
  return {
    id:
      "v103-order-time-fixture",
    pair: {
      market:
        "BTCUSDT",
      buy: {
        exchange:
          "binance",
        market:
          "BTCUSDT",
        bestBidPrice:
          99.9,
        bestBidQty:
          2,
        bestAskPrice:
          100,
        bestAskQty:
          2,
        lastPrice:
          100,
        spread:
          0.1,
        source:
          "orderBook",
        executable:
          true,
        timestamp:
          NOW -
          5,
      },
      sell: {
        exchange:
          "bybit",
        market:
          "BTCUSDT",
        bestBidPrice:
          102,
        bestBidQty:
          2,
        bestAskPrice:
          102.1,
        bestAskQty:
          2,
        lastPrice:
          102,
        spread:
          0.1,
        source:
          "orderBook",
        executable:
          true,
        timestamp:
          NOW -
          4,
      },
    },
    buyPrice:
      100,
    sellPrice:
      102,
    buyAvailableQty:
      2,
    sellAvailableQty:
      2,
    quoteAsset:
      "USDT",
    requiredQty:
      1,
    availableExecutableQty:
      1,
    executableQty:
      1,
    liquidityScore:
      100,
    enoughLiquidity:
      true,
    freshnessScore:
      100,
    feeScore:
      100,
    spreadScore:
      100,
    decision:
      "EXECUTE",
    analysisSummary: [
      "V103 deterministic fixture.",
    ],
    rawSpread:
      2,
    rawSpreadPercent:
      2,
    estimatedFees:
      0.202,
    netProfit:
      1.798,
    netProfitPercent:
      1.798,
    usedLastPriceFallback:
      false,
    quotesAreFresh:
      true,
    score:
      100,
    timestamp:
      NOW -
      5,
  };
}

function orderTimeService(
  options: {
    staleBuy?: boolean;
    bybitSupportsFok?: boolean;
    sellBidPrice?: number;
    executionPolicy?: StrategyOneExecutionPolicyDefinition;
    onVenueContract?: (
      exchange: string,
      authorizedMaximumBookAgeMs: number | undefined,
    ) => void;
  } = {},
): StrategyOneOrderTimeSafetyService {
  let monotonicTime =
    0;

  return new StrategyOneOrderTimeSafetyService(
    {
      getExecutionPolicy:
        () =>
          options.executionPolicy ??
          TINY_LIVE_030_STRATEGY_ONE_EXECUTION_POLICY,
      getOrderBook:
        (exchange) => ({
          exchange,
          market:
            "BTCUSDT",
          bids:
            exchange ===
              "bybit"
              ? [
                  {
                    price:
                      options.sellBidPrice ??
                      102,
                    quantity:
                      2,
                  },
                ]
              : [
                  {
                    price:
                      99.9,
                    quantity:
                      2,
                  },
                ],
          asks:
            exchange ===
              "binance"
              ? [
                  {
                    price:
                      100,
                    quantity:
                      2,
                  },
                ]
              : [
                  {
                    price:
                      102.1,
                    quantity:
                      2,
                  },
                ],
          timestamp:
            exchange ===
              "binance" &&
            options.staleBuy
              ? NOW -
                2_000
              : NOW -
                5,
        }),
      getTakerFeePercent:
        () =>
          0.1,
      getVenueContract:
        (exchange, _route, _now, authorizedMaximumBookAgeMs) => {
          options.onVenueContract?.(
            exchange,
            authorizedMaximumBookAgeMs,
          );

          return ({
          exchange,
          maximumOrderBookAgeMs:
            100,
          requiredTimeInForce:
            "FOK",
          supportedTimeInForce:
            exchange ===
              "bybit" &&
            options.bybitSupportsFok ===
              false
              ? [
                  "IOC",
                ]
              : [
                  "IOC",
                  "FOK",
                ],
          authoritativeFillConfirmationReady:
            true,
          authoritativeFeeReconciliationReady:
            true,
          });
        },
      getMonotonicTimeMs:
        () =>
          monotonicTime++,
    },
    {
      maximumBookTimestampSkewMs:
        50,
      maximumEvaluationDurationMs:
        5,
      requiredTimeInForce:
        "FOK",
    },
  );
}

function coinDCXBinanceOrderTimeService():
  StrategyOneOrderTimeSafetyService {
  let monotonicTime =
    0;

  return new StrategyOneOrderTimeSafetyService({
    getOrderBook:
      (exchange) => ({
        exchange,
        market:
          "COTIUSDT",
        bids:
          exchange ===
            "binance"
            ? [
                {
                  price:
                    0.102,
                  quantity:
                    2_000,
                },
              ]
            : [
                {
                  price:
                    0.0999,
                  quantity:
                    2_000,
                },
              ],
        asks:
          exchange ===
            "coindcx"
            ? [
                {
                  price:
                    0.1,
                  quantity:
                    2_000,
                },
              ]
            : [
                {
                  price:
                    0.1021,
                  quantity:
                    2_000,
                },
              ],
        timestamp:
          NOW -
          5,
      }),
    getTakerFeePercent:
      () =>
        0.1,
    getVenueContract:
      (exchange) => ({
        exchange,
        maximumOrderBookAgeMs:
          100,
        requiredTimeInForce:
          exchange ===
            "coindcx"
            ? "GTC"
            : "FOK",
        supportedTimeInForce:
          exchange ===
            "coindcx"
            ? [
                "GTC",
              ]
            : [
                "IOC",
                "FOK",
              ],
        authoritativeFillConfirmationReady:
          true,
        authoritativeFeeReconciliationReady:
          true,
      }),
    getMonotonicTimeMs:
      () =>
        monotonicTime++,
  });
}

function cotiOpportunity(): ArbitrageOpportunity {
  const base =
    opportunity();

  return {
    ...base,
    id:
      "v139-coindcx-binance-coti",
    pair: {
      market:
        "COTIUSDT",
      buy: {
        ...base.pair.buy,
        exchange:
          "coindcx",
        market:
          "COTIUSDT",
        bestAskPrice:
          0.1,
        bestAskQty:
          2_000,
      },
      sell: {
        ...base.pair.sell,
        exchange:
          "binance",
        market:
          "COTIUSDT",
        bestBidPrice:
          0.102,
        bestBidQty:
          2_000,
      },
    },
    buyPrice:
      0.1,
    sellPrice:
      0.102,
    buyAvailableQty:
      2_000,
    sellAvailableQty:
      2_000,
    requiredQty:
      1_000,
    availableExecutableQty:
      1_000,
    executableQty:
      1_000,
  };
}

class FixtureAdapter
implements LiveExecutionAdapter {
  readonly exchange:
    string;

  readonly requests:
    LiveExecutionRequest[] = [];

  constructor(
    exchange: string,
    private readonly filledQuantity:
      number,
    private readonly onActive:
      (delta: number) => void,
  ) {
    this.exchange =
      exchange;
  }

  getCapabilities(): LiveExecutionAdapterCapabilities {
    return {
      products: [
        "SPOT",
      ],
      supportsMarketOrders:
        true,
      supportsLimitOrders:
        true,
      supportsPostOnly:
        false,
      supportsOrderStatus:
        true,
      supportsCancellation:
        true,
      supportsAmendKeepPriority:
        false,
      supportsReduceOnly:
        false,
    };
  }

  async execute(
    request:
      LiveExecutionRequest,
  ): Promise<LiveExecutionResult> {
    this.requests.push(
      structuredClone(
        request,
      ),
    );
    this.onActive(
      1,
    );

    await Promise.resolve();

    this.onActive(
      -1,
    );

    return result(
      request,
      this.filledQuantity,
    );
  }

  async getOrderStatus(): Promise<LiveExecutionResult> {
    throw new Error(
      "Fixture status I/O is not expected.",
    );
  }

  async cancelOrder(): Promise<LiveExecutionResult> {
    throw new Error(
      "Fixture cancel I/O is not expected.",
    );
  }

  getReadiness(): LiveExecutionAdapterReadiness {
    return {
      credentialsConfigured:
        true,
      authenticationVerified:
        true,
      exchangeApiReachable:
        true,
      verificationState:
        "VERIFIED",
      readOnlyVerificationFresh:
        true,
      lastVerifiedAt:
        NOW,
      lastVerificationAttemptAt:
        NOW,
      verificationExpiresAt:
        NOW +
        60_000,
      verificationMethod:
        "SIGNED_BALANCE_READ",
      lastVerificationError:
        null,
    };
  }
}

function result(
  request:
    LiveExecutionRequest,
  filledQuantity: number,
): LiveExecutionResult {
  return {
    success:
      filledQuantity ===
      request.quantity,
    exchange:
      request.exchange,
    market:
      request.market,
    side:
      request.side,
    orderId:
      `${request.exchange}-order`,
    clientOrderId:
      request.clientOrderId ??
      null,
    status:
      filledQuantity ===
        request.quantity
        ? "FILLED"
        : filledQuantity >
            0
          ? "PARTIALLY_FILLED"
          : "CANCELLED",
    requestedQuantity:
      request.quantity,
    filledQuantity,
    remainingQuantity:
      request.quantity -
      filledQuantity,
    requestedPrice:
      request.price ??
      null,
    averageFillPrice:
      request.price ??
      0,
    feeAmount:
      0,
    cancelled:
      filledQuantity ===
      0,
    timedOut:
      false,
    startedAt:
      NOW,
    completedAt:
      NOW +
      1,
    executionTimeMs:
      1,
    failureReason:
      null,
    reasons:
      [],
  };
}

function connectedStatus(
  adapter:
    LiveExecutionAdapter,
): LiveExecutionExchangeStatus {
  return {
    exchange:
      adapter.exchange,
    adapterRegistered:
      true,
    capabilities:
      adapter.getCapabilities(),
    credentialsConfigured:
      true,
    authenticationVerified:
      true,
    exchangeApiReachable:
      true,
    verificationState:
      "VERIFIED",
    readOnlyVerificationFresh:
      true,
    lastVerifiedAt:
      NOW,
    lastVerificationAttemptAt:
      NOW,
    verificationExpiresAt:
      NOW +
      60_000,
    verificationMethod:
      "SIGNED_BALANCE_READ",
    lastVerificationError:
      null,
    liveExecutionEnabled:
      false,
    adapterConnected:
      true,
  };
}

function twoLegFixture(
  adapters: Map<string, LiveExecutionAdapter>,
) {
  return {
    executeOrReconcile: async (input: {
      readonly sessionId: string;
      readonly opportunityId: string;
      readonly lastLookDecisionId: string;
      readonly buyRequest: LiveExecutionRequest;
      readonly sellRequest: LiveExecutionRequest;
      readonly allowNewSubmission: boolean;
      readonly now?: number;
    }): Promise<StrategyOneTwoLegExecutionResult> => {
      assert.equal(input.allowNewSubmission, true);
      const buyAdapter = adapters.get(input.buyRequest.exchange);
      const sellAdapter = adapters.get(input.sellRequest.exchange);
      assert.ok(buyAdapter);
      assert.ok(sellAdapter);
      const buyDispatchedAt = NOW;
      const buyPromise = buyAdapter.execute(input.buyRequest);
      const sellDispatchedAt = NOW;
      const sellPromise = sellAdapter.execute(input.sellRequest);
      const [buyResult, sellResult] = await Promise.all([
        buyPromise,
        sellPromise,
      ]);
      const response = (
        resultValue: LiveExecutionResult,
        idempotencyKey: string,
      ) => ({
        state: "READY" as const,
        record: {
          version: "76.0" as const,
          id: `central:${idempotencyKey}`,
          idempotencyKey,
          requestHash: "fixture",
          request: resultValue.side === "buy"
            ? input.buyRequest
            : input.sellRequest,
          state: "FEE_RECONCILED" as const,
          preparedAt: NOW,
          updatedAt: NOW + 1,
          result: resultValue,
          feeEvidence: null,
          cancelRequestedAt: null,
          orderSubmissionPerformed: true,
          lastError: null,
        },
        reasons: [],
      });
      const buyResponse = response(buyResult, `${input.sessionId}:buy`);
      const sellResponse = response(sellResult, `${input.sessionId}:sell`);
      const recoveryRequired =
        buyResult.filledQuantity !== sellResult.filledQuantity;

      return {
        session: {
          schemaVersion: "108.0",
          sessionId: input.sessionId,
          requestHash: "fixture",
          opportunityId: input.opportunityId,
          lastLookDecisionId: input.lastLookDecisionId,
          buyIdempotencyKey: `${input.sessionId}:buy`,
          sellIdempotencyKey: `${input.sessionId}:sell`,
          buyRequest: input.buyRequest,
          sellRequest: input.sellRequest,
          state: recoveryRequired ? "RECOVERY_REQUIRED" : "COMPLETED",
          preparedAt: NOW,
          updatedAt: NOW + 1,
          buyDispatchedAt,
          sellDispatchedAt,
          buyResponse,
          sellResponse,
          reasons: recoveryRequired
            ? ["Fixture quantities do not match."]
            : [],
          automaticRetryAllowed: false,
          automaticRecoveryOrderAllowed: false,
          newOrderSubmissionAllowed: false,
        },
        possibleExposure: false,
        recoveryRequired,
        buyDispatchedAt,
        sellDispatchedAt,
        buyResponse,
        sellResponse,
      };
    },
  };
}

function actionAuthorityFixture(
  state: StrategyOneTinyLiveAuthorityRecord["state"] = "CONSUMED",
): StrategyOneTinyLiveAuthorityRecord {
  return {
    schemaVersion: "111.0",
    id: "tiny-live-fixture",
    state,
    opportunityId: opportunity().id,
    market: "BTCUSDT",
    buyExchange: "binance",
    sellExchange: "bybit",
    capitalPerLegInr: 100,
    exactQuantity: 1,
    preflightHash: "fixture-preflight",
    calibrationId: "fixture-calibration",
    calibrationScope: "CONTINUOUS_TINY_LIVE",
    requiredAuthorizationPhrase: "AUTHORIZE tiny-live-fixture",
    previewedAt: NOW,
    authorizedAt: NOW,
    authorityExpiresAt: NOW + 1_000,
    consumedAt: NOW,
    pairBoundAt: state === "PAIR_BOUND" ? NOW : null,
    pairSessionId: state === "PAIR_BOUND" ? "strategy-one:fixture" : null,
    finalizedAt: state === "FINALIZED" ? NOW : null,
    finalOutcome: state === "FINALIZED" ? "COMPLETED" : null,
    requiresRecovery: false,
    resolvedAt: null,
    liveOrderSubmissionAuthorized: state === "AUTHORIZED",
    automaticRetryAllowed: false,
    automaticFundMovementAllowed: false,
  };
}

function capitalReservationFixture(
  requests: CreateCapitalReservationRequest[],
  finalized: string[],
) {
  const active =
    new Map<string, CapitalReservation>();

  return {
    reserve: (request: CreateCapitalReservationRequest) => {
      requests.push(structuredClone(request));
      const reservation: CapitalReservation = {
        id: `reservation-${requests.length}`,
        ownerType: request.ownerType,
        ownerId: request.ownerId,
        amount: request.amount,
        status: "ACTIVE",
        createdAt: NOW,
        expiresAt: NOW + (request.ttlMs ?? 15_000),
        finalizedAt: null,
        reason: null,
        inventoryHolds: [],
      };
      active.set(reservation.id, reservation);
      return {approved: true, reservation, reasons: []};
    },
    commit: (reservationId: string, reason = "Committed.") => {
      finalized.push(`COMMITTED:${reservationId}`);
      const current = active.get(reservationId);
      return current
        ? {...current, status: "COMMITTED" as const, finalizedAt: NOW, reason}
        : null;
    },
    release: (reservationId: string, reason = "Released.") => {
      finalized.push(`RELEASED:${reservationId}`);
      const current = active.get(reservationId);
      return current
        ? {...current, status: "RELEASED" as const, finalizedAt: NOW, reason}
        : null;
    },
  };
}

async function main(): Promise<void> {
  const approved =
    orderTimeService()
      .evaluate({
        opportunity:
          opportunity(),
        quantity:
          1,
        now:
          NOW,
      });

  assertCondition(
    approved.decision ===
      "APPROVED" &&
    approved.selectedTimeInForce ===
      "FOK" &&
    approved.buyLimitPrice ===
      100 &&
    approved.sellLimitPrice ===
      102 &&
    approved.buyFillPercent ===
      100 &&
    approved.sellFillPercent ===
      100 &&
    approved.postStressNetProfitPercent !==
      null &&
    approved.postStressNetProfitPercent >
      approved.minimumNetProfitPercent &&
    approved.statutoryCashWithholding !==
      null &&
    approved.statutoryCashWithholding >
      0 &&
    approved.tradingFees !==
      null &&
    approved.tradingFees >
      0.21 &&
    approved.statutoryCashCostEvidenceIds.includes(
      "BYBIT_SIGNED_EXECUTION_IND_GST_IND_TDS_V1",
    ) &&
    approved.deployableCashPostStressNetProfitPercent !==
      null &&
    approved.deployableCashPostStressNetProfitPercent <
      approved.postStressNetProfitPercent &&
    !approved.liveOrderSubmissionAuthorized,
    "Fresh full-depth evidence with audited FOK and fill channels should pass as non-authorizing evidence.",
  );

  const v5RelaxedPostStress =
    orderTimeService({
      sellBidPrice:
        100.51,
      executionPolicy:
        TINY_LIVE_POST_STRESS_015_STRATEGY_ONE_EXECUTION_POLICY,
    }).evaluate({
      opportunity:
        opportunity(),
      quantity:
        1,
      now:
        NOW,
    });

  assertCondition(
    v5RelaxedPostStress.decision ===
      "APPROVED" &&
    v5RelaxedPostStress.minimumNetProfitPercent ===
      0.15 &&
    v5RelaxedPostStress.postStressNetProfitPercent !==
      null &&
    v5RelaxedPostStress.postStressNetProfitPercent >=
      0.15 &&
    v5RelaxedPostStress.postStressNetProfitPercent <
      0.3,
    `V5 must approve order-time stressed economics between 0.15% and 0.30%: ${JSON.stringify(v5RelaxedPostStress)}`,
  );

  const v4SameEconomics =
    orderTimeService({
      sellBidPrice:
        100.51,
      executionPolicy:
        TINY_LIVE_030_STRATEGY_ONE_EXECUTION_POLICY,
    }).evaluate({
      opportunity:
        opportunity(),
      quantity:
        1,
      now:
        NOW,
    });

  assert.equal(
    v4SameEconomics.decision,
    "BLOCKED",
    "Immutable V4 must keep rejecting the same sub-0.30% post-stress result.",
  );

  const v5BelowFloor =
    orderTimeService({
      sellBidPrice:
        100.44,
      executionPolicy:
        TINY_LIVE_POST_STRESS_015_STRATEGY_ONE_EXECUTION_POLICY,
    }).evaluate({
      opportunity:
        opportunity(),
      quantity:
        1,
      now:
        NOW,
    });

  assertCondition(
    v5BelowFloor.decision ===
      "BLOCKED" &&
    v5BelowFloor.postStressNetProfitPercent !==
      null &&
    v5BelowFloor.postStressNetProfitPercent <
      0.15 &&
    v5BelowFloor.reasons.some(
      (reason) =>
        reason.includes(
          "minimum 0.1500%",
        ),
    ),
    `V5 must still block order-time stressed economics below 0.15%: ${JSON.stringify(v5BelowFloor)}`,
  );

  const authorizedTtlCalls: Array<{
    exchange: string;
    maximumBookAgeMs: number | undefined;
  }> = [];
  const authorizedTtlLastLook =
    orderTimeService({
      onVenueContract: (exchange, maximumBookAgeMs) => {
        authorizedTtlCalls.push({exchange, maximumBookAgeMs});
      },
    }).evaluate({
      opportunity: opportunity(),
      quantity: 1,
      now: NOW,
      authorizedMaximumBookAgeMs: 100,
    });

  assert.equal(authorizedTtlLastLook.decision, "APPROVED");
  assert.deepEqual(authorizedTtlCalls, [
    {exchange: "binance", maximumBookAgeMs: 100},
    {exchange: "bybit", maximumBookAgeMs: 100},
  ]);

  const invalidAuthorizedTtl = orderTimeService().evaluate({
    opportunity: opportunity(),
    quantity: 1,
    now: NOW,
    authorizedMaximumBookAgeMs: 301,
  });
  assert.equal(invalidAuthorizedTtl.decision, "BLOCKED");
  assert.match(
    invalidAuthorizedTtl.reasons.join(" "),
    /operator-reviewed 300 ms ceiling/iu,
  );

  const mixedTimeInForce =
    coinDCXBinanceOrderTimeService()
      .evaluate({
        opportunity:
          cotiOpportunity(),
        quantity:
          1_000,
        now:
          NOW,
      });

  assertCondition(
    mixedTimeInForce.decision ===
      "APPROVED" &&
    mixedTimeInForce.selectedTimeInForce ===
      null &&
    mixedTimeInForce.selectedBuyTimeInForce ===
      "GTC" &&
    mixedTimeInForce.selectedSellTimeInForce ===
      "FOK",
    "Exact CoinDCX BUY to Binance SELL must preserve audited per-leg GTC/FOK semantics without pretending both venues share one TIF.",
  );

  const stale =
    orderTimeService({
      staleBuy:
        true,
    }).evaluate({
      opportunity:
        opportunity(),
      quantity:
        1,
      now:
        NOW,
    });

  assertCondition(
    stale.decision ===
      "BLOCKED" &&
    stale.reasons.some(
      (reason) =>
        reason.includes(
          "BUY book age",
        ),
    ),
    "A stale order-time BUY book must fail closed.",
  );

  const unsupportedFok =
    orderTimeService({
      bybitSupportsFok:
        false,
    }).evaluate({
      opportunity:
        opportunity(),
      quantity:
        1,
      now:
        NOW,
    });

  assertCondition(
    unsupportedFok.decision ===
      "BLOCKED" &&
    unsupportedFok.selectedTimeInForce ===
      null &&
    unsupportedFok.reasons.some(
      (reason) =>
        reason.includes(
          "audited FOK",
        ),
    ),
    "A route without FOK on both venues must fail closed.",
  );

  let activeCalls =
    0;
  let maximumActiveCalls =
    0;
  const onActive =
    (delta: number) => {
      activeCalls +=
        delta;
      maximumActiveCalls =
        Math.max(
          maximumActiveCalls,
          activeCalls,
        );
    };
  const buyAdapter =
    new FixtureAdapter(
      "binance",
      1,
      onActive,
    );
  const sellAdapter =
    new FixtureAdapter(
      "bybit",
      0.4,
      onActive,
    );
  const adapters =
    new Map([
      [
        buyAdapter.exchange,
        buyAdapter,
      ],
      [
        sellAdapter.exchange,
        sellAdapter,
      ],
    ]);
  const recovery =
    new SharedRecoveryIntentService({
      maximumIntentTtlMs:
        60_000,
      maximumQuoteValue:
        1_000,
      maximumIntents:
        10,
    });
  const capitalReservationRequests:
    CreateCapitalReservationRequest[] =
    [];
  const finalizedReservations:
    string[] =
    [];
  let clock =
    NOW;
  let coordinatorAuthorizedMaximumBookAgeMs:
    number |
    undefined;
  const coordinatorOrderTimeSafety =
    orderTimeService();
  const coordinator =
    new ArbitrageExecutionCoordinator({
      liveExecution: {
        hasAdapter:
          (exchange) =>
            adapters.has(
              exchange,
            ),
        getAdapter:
          (exchange) => {
            const adapter =
              adapters.get(
                exchange,
              );

            if (!adapter) {
              throw new Error(
                "Fixture adapter is missing.",
              );
            }

            return adapter;
          },
        getExchangeStatus:
          (exchange) => {
            const adapter =
              adapters.get(
                exchange,
              );

            if (!adapter) {
              throw new Error(
                "Fixture status adapter is missing.",
              );
            }

            return connectedStatus(
              adapter,
            );
          },
      },
      orderTimeSafety:
        {
          evaluate: (input) => {
            coordinatorAuthorizedMaximumBookAgeMs =
              input.authorizedMaximumBookAgeMs;
            return coordinatorOrderTimeSafety.evaluate(input);
          },
        },
      twoLegExecution:
        twoLegFixture(
          adapters,
        ),
      recoveryIntent:
        recovery,
      capitalReservations:
        capitalReservationFixture(
          capitalReservationRequests,
          finalizedReservations,
        ),
      getTakerFeePercent:
        () => 0.1,
      recordPnL:
        () =>
          undefined,
      liveConfirmationPresent:
        () =>
          true,
      consumeActionAuthority:
        () => ({
          ...actionAuthorityFixture("CONSUMED"),
          schemaVersion: "191.0",
          maximumCapitalPerLegInr: 505,
          maximumBuyQuoteSpend: 101,
          maximumOrderBookAgeMs: 100,
          calibrationScope: "DYNAMIC_POOL",
        }),
      bindActionAuthorityPair:
        () => actionAuthorityFixture("PAIR_BOUND"),
      finalizeActionAuthority:
        () => actionAuthorityFixture("FINALIZED"),
      now:
        () =>
          clock++,
    });

  const execution =
    await coordinator.execute(
      opportunity(),
      {actionAuthorityId: "tiny-live-fixture"},
    );

  assertCondition(
    coordinatorAuthorizedMaximumBookAgeMs === 100,
    "The coordinator must carry the durably authorized exact-route TTL into final last-look.",
  );

  assertCondition(
    buyAdapter.requests.length ===
      1 &&
    sellAdapter.requests.length ===
      1 &&
    buyAdapter.requests[0]
      ?.timeInForce ===
      "FOK" &&
    sellAdapter.requests[0]
      ?.timeInForce ===
      "FOK" &&
    buyAdapter.requests[0]
      ?.price ===
      100 &&
    sellAdapter.requests[0]
      ?.price ===
      102 &&
    maximumActiveCalls ===
      2,
    "Approved last-look must dispatch both explicit-FOK legs concurrently with refreshed depth prices.",
  );

  assertCondition(
    execution.status ===
      "RECOVERY_REQUIRED" &&
    execution.unmatchedBuyQuantity ===
      0.6 &&
    execution.recoveryIntent
      ?.status ===
      "STAGED" &&
    execution.recoveryIntent
      .leg.side ===
      "SELL" &&
    !execution.recoveryIntent
      .automaticExecutionAllowed &&
    !execution.recoveryIntent
      .orderSubmissionAllowed &&
    execution.lastLook
      ?.decision ===
      "APPROVED",
    "Unequal fills must stage immutable, non-executable residual recovery evidence.",
  );

  assert.equal(capitalReservationRequests.length, 1);
  assert.deepEqual(
    capitalReservationRequests[0]?.inventoryRequirements,
    [
      {exchange: "binance", asset: "USDT", amount: 100.1},
      {exchange: "bybit", asset: "BTC", amount: 1},
    ],
  );
  assert.equal(
    finalizedReservations.length,
    0,
    "Residual exposure must keep both inventory holds active for reconciliation.",
  );

  let blockedExecuteCalls =
    0;
  const blockedCoordinator =
    new ArbitrageExecutionCoordinator({
      liveExecution: {
        hasAdapter:
          () =>
            true,
        getAdapter:
          () => {
            blockedExecuteCalls +=
              1;

            return buyAdapter;
          },
        getExchangeStatus:
          (exchange) =>
            connectedStatus(
              exchange ===
                "binance"
                ? buyAdapter
                : sellAdapter,
            ),
      },
      orderTimeSafety: {
        evaluate:
          () =>
            unsupportedFok as StrategyOneOrderTimeSafetyReport,
      },
      recoveryIntent:
        recovery,
      recordPnL:
        () =>
          undefined,
      liveConfirmationPresent:
        () =>
          true,
      consumeActionAuthority:
        () => actionAuthorityFixture("CONSUMED"),
      bindActionAuthorityPair:
        () => actionAuthorityFixture("PAIR_BOUND"),
      finalizeActionAuthority:
        () => actionAuthorityFixture("FINALIZED"),
      now:
        () =>
          NOW,
    });

  const blocked =
    await blockedCoordinator.execute(
      opportunity(),
      {actionAuthorityId: "tiny-live-fixture"},
    );

  assertCondition(
    blocked.status ===
      "BLOCKED" &&
    blockedExecuteCalls ===
      0 &&
    blocked.buyResult ===
      null &&
    blocked.sellResult ===
      null,
    "A blocked last-look must perform zero adapter access and zero exchange execution calls.",
  );

  const hardCapCoordinator = new ArbitrageExecutionCoordinator({
    liveExecution: {
      hasAdapter: () => true,
      getAdapter: (exchange) => {
        const adapter = adapters.get(exchange);
        if (!adapter) throw new Error("Fixture adapter is missing.");
        return adapter;
      },
      getExchangeStatus: (exchange) => {
        const adapter = adapters.get(exchange);
        if (!adapter) throw new Error("Fixture status adapter is missing.");
        return connectedStatus(adapter);
      },
    },
    orderTimeSafety: orderTimeService(),
    recoveryIntent: recovery,
    capitalReservations: capitalReservationFixture(
      capitalReservationRequests,
      finalizedReservations,
    ),
    getTakerFeePercent: () => 0.1,
    recordPnL: () => undefined,
    liveConfirmationPresent: () => true,
    consumeActionAuthority: () => ({
      ...actionAuthorityFixture("CONSUMED"),
      schemaVersion: "190.0",
      capitalPerLegInr: 500,
      maximumCapitalPerLegInr: 505,
      maximumBuyQuoteSpend: 100.05,
      calibrationScope: "DYNAMIC_POOL",
    }),
    bindActionAuthorityPair: () => actionAuthorityFixture("PAIR_BOUND"),
    finalizeActionAuthority: () => actionAuthorityFixture("FINALIZED"),
    now: () => NOW,
  });
  const buyRequestsBeforeHardCap = buyAdapter.requests.length;
  const sellRequestsBeforeHardCap = sellAdapter.requests.length;
  const reservationsBeforeHardCap = capitalReservationRequests.length;
  const hardCapBlocked = await hardCapCoordinator.execute(
    opportunity(),
    {actionAuthorityId: "tiny-live-fixture"},
  );

  assert.equal(hardCapBlocked.status, "BLOCKED");
  assert.match(hardCapBlocked.reasons.join(" "), /₹505 hard-cap quote spend/iu);
  assert.equal(buyAdapter.requests.length, buyRequestsBeforeHardCap);
  assert.equal(sellAdapter.requests.length, sellRequestsBeforeHardCap);
  assert.equal(capitalReservationRequests.length, reservationsBeforeHardCap);

  console.log(
    "V103 Strategy #1 order-time safety passed: millisecond freshness, full depth, explicit FOK, concurrent dispatch and fail-closed residual recovery are deterministic.",
  );
}

void main().catch(
  (
    error: unknown,
  ) => {
    console.error(
      error instanceof Error
        ? error.message
        : error,
    );
    process.exitCode =
      1;
  },
);
