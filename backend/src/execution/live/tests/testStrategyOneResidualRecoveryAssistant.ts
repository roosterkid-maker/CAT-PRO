import assert from "node:assert/strict";

import {
  resolve,
} from "node:path";

import type {
  ExchangeMarketCapability,
} from "../../capabilities/models/ExchangeCapability";

import type {
  CentralLiveOrderGatewayResponse,
} from "../central/CentralLiveOrderExecutionGateway";

import type {
  LiveExecutionRequest,
} from "../models/LiveExecutionRequest";

import type {
  LiveExecutionResult,
  LiveExecutionStatus,
} from "../models/LiveExecutionResult";

import {
  StrategyOneResidualRecoveryAssistantService,
} from "../recovery/StrategyOneResidualRecoveryAssistantService";

import type {
  StrategyOneTwoLegExecutionResult,
  StrategyOneTwoLegSessionRecord,
} from "../arbitrage/StrategyOneTwoLegLiveExecutionService";

const NOW =
  1_800_000_000_000;

async function main(): Promise<void> {
  const longResidualSession =
    session({
      buyFilled: 10,
      sellFilled: 8,
      buyStatus: "FILLED",
      sellStatus: "CANCELLED",
      buyAveragePrice: 1,
      sellAveragePrice: 1.02,
      state: "RECOVERY_REQUIRED",
    });
  const pair =
    new FakePairPort(longResidualSession);
  const service =
    assistant(
      pair,
      {
        timestamp: NOW - 25,
        bids: [
          {price: 1.05, quantity: 3},
        ],
        asks: [
          {price: 1.06, quantity: 3},
        ],
      },
      capability(1),
      5,
      "ready.jsonl",
    );
  const preview =
    await service.inspectSession(
      longResidualSession.sessionId,
      NOW,
    );

  assert.equal(pair.reconciliations, 1);
  assert.equal(preview.state, "READY_FOR_OPERATOR_REVIEW");
  assert.equal(preview.authoritative.reconciledBeforeAssessment, true);
  assert.equal(preview.authoritative.bothLegsTerminal, true);
  assert.equal(preview.residual.direction, "LONG");
  assert.equal(preview.residual.venue, "coindcx");
  assert.equal(preview.residual.side, "SELL");
  assert.equal(preview.residual.exactQuantity, 2);
  assert.equal(preview.residual.executableQuantity, 2);
  assert.equal(preview.residual.dustQuantity, 0);
  assert.equal(preview.executionPreview.fillPercent, 100);
  assert.equal(preview.executionPreview.vwapPrice, 1.05);
  assert.equal(preview.executionPreview.selectedTimeInForce, "GTC");
  assert.equal(preview.executionPreview.boundedCancelRequired, true);
  assert.equal(preview.executionPreview.balanceAsset, "COTI");
  assert.equal(preview.executionPreview.requiredBalance, 2);
  assert.equal(preview.blockers.length, 0);
  assert.ok(preview.requiredApprovalPhrase);
  assert.equal(preview.safety.orderSubmissionAllowed, false);
  assert.equal(preview.safety.orderSubmissionPerformed, false);
  assert.equal(preview.safety.automaticRetryAllowed, false);

  assert.throws(
    () => service.approvePreview(preview.id, "APPROVE", NOW + 1),
    /Exact Strategy #1 recovery approval phrase/u,
  );

  const approved =
    service.approvePreview(
      preview.id,
      preview.requiredApprovalPhrase ?? "",
      NOW + 1,
    );

  assert.equal(approved.state, "OPERATOR_APPROVED_EVIDENCE_ONLY");
  assert.equal(approved.approvedAt, NOW + 1);
  assert.equal(approved.safety.approvalIsEvidenceOnly, true);
  assert.equal(approved.safety.automaticRecoveryOrderAllowed, false);

  const executionBoundary =
    await service.getApprovedExecutionBoundary(preview.id, NOW + 2);
  assert.equal(
    executionBoundary.approvedPreview.state,
    "OPERATOR_APPROVED_EVIDENCE_ONLY",
  );
  assert.equal(
    executionBoundary.actionTimePreview.state,
    "READY_FOR_OPERATOR_REVIEW",
  );
  assert.equal(executionBoundary.actionTimePreview.residual.side, "SELL");
  assert.equal(executionBoundary.actionTimePreview.residual.exactQuantity, 2);

  await assert.rejects(
    service.getApprovedExecutionBoundary(preview.id, NOW + 30_001),
    /expired/u,
  );

  const stale =
    await assistant(
      new FakePairPort(longResidualSession),
      {
        timestamp: NOW - 500,
        bids: [{price: 1.05, quantity: 3}],
        asks: [{price: 1.06, quantity: 3}],
      },
      capability(1),
      5,
      "stale.jsonl",
    ).inspectSession(longResidualSession.sessionId, NOW);

  assert.equal(stale.state, "BLOCKED");
  assert.ok(
    stale.blockers.some((blocker) =>
      blocker.includes("freshness boundary")),
  );

  const refreshedDuringInspection =
    await assistant(
      new FakePairPort(longResidualSession),
      {
        timestamp: NOW + 500,
        bids: [{price: 1.05, quantity: 3}],
        asks: [{price: 1.06, quantity: 3}],
      },
      capability(1),
      5,
      "refreshed-during-inspection.jsonl",
      NOW + 550,
    ).inspectSession(longResidualSession.sessionId, NOW);

  assert.equal(refreshedDuringInspection.state, "READY_FOR_OPERATOR_REVIEW");
  assert.equal(refreshedDuringInspection.createdAt, NOW + 550);
  assert.equal(refreshedDuringInspection.executionPreview.bookAgeMs, 50);
  assert.equal(refreshedDuringInspection.blockers.length, 0);

  const futureDatedBeyondCompletion =
    await assistant(
      new FakePairPort(longResidualSession),
      {
        timestamp: NOW + 551,
        bids: [{price: 1.05, quantity: 3}],
        asks: [{price: 1.06, quantity: 3}],
      },
      capability(1),
      5,
      "future-dated-beyond-completion.jsonl",
      NOW + 550,
    ).inspectSession(longResidualSession.sessionId, NOW);

  assert.equal(futureDatedBeyondCompletion.state, "BLOCKED");
  assert.equal(futureDatedBeyondCompletion.executionPreview.bookAgeMs, -1);
  assert.ok(
    futureDatedBeyondCompletion.blockers.some((blocker) =>
      blocker.includes("freshness boundary")),
  );

  const dustSession =
    session({
      buyFilled: 10.5,
      sellFilled: 8,
      buyStatus: "FILLED",
      sellStatus: "CANCELLED",
      buyAveragePrice: 1,
      sellAveragePrice: 1.02,
      state: "RECOVERY_REQUIRED",
      sessionId: "strategy-one-session-dust",
    });
  const dust =
    await assistant(
      new FakePairPort(dustSession),
      {
        timestamp: NOW - 10,
        bids: [{price: 1.05, quantity: 5}],
        asks: [{price: 1.06, quantity: 5}],
      },
      capability(1),
      5,
      "dust.jsonl",
    ).inspectSession(dustSession.sessionId, NOW);

  assert.equal(dust.state, "BLOCKED");
  assert.equal(dust.residual.exactQuantity, 2.5);
  assert.equal(dust.residual.executableQuantity, 2);
  assert.equal(dust.residual.dustQuantity, 0.5);
  assert.ok(
    dust.blockers.some((blocker) =>
      blocker.includes("cannot be flattened")),
  );

  const uncertainSession =
    session({
      buyFilled: 2,
      sellFilled: 0,
      buyStatus: "OPEN",
      sellStatus: "FAILED",
      buyAveragePrice: 1,
      sellAveragePrice: 0,
      state: "POSSIBLE_EXPOSURE",
      sessionId: "strategy-one-session-uncertain",
    });
  const uncertain =
    await assistant(
      new FakePairPort(uncertainSession),
      {
        timestamp: NOW - 10,
        bids: [{price: 1.05, quantity: 5}],
        asks: [{price: 1.06, quantity: 5}],
      },
      capability(1),
      5,
      "uncertain.jsonl",
    ).inspectSession(uncertainSession.sessionId, NOW);

  assert.equal(uncertain.state, "BLOCKED");
  assert.equal(uncertain.authoritative.bothLegsTerminal, false);
  assert.ok(
    uncertain.blockers.some((blocker) =>
      blocker.includes("authoritative terminal evidence")),
  );
  assert.equal(uncertain.requiredApprovalPhrase, null);

  const balancedSession =
    session({
      buyFilled: 10,
      sellFilled: 10,
      buyStatus: "FILLED",
      sellStatus: "FILLED",
      buyAveragePrice: 1,
      sellAveragePrice: 1.02,
      state: "COMPLETED",
      sessionId: "strategy-one-session-balanced",
    });
  const balanced =
    await assistant(
      new FakePairPort(balancedSession),
      {
        timestamp: NOW - 10,
        bids: [{price: 1.05, quantity: 5}],
        asks: [{price: 1.06, quantity: 5}],
      },
      capability(1),
      5,
      "balanced.jsonl",
    ).inspectSession(balancedSession.sessionId, NOW);

  assert.equal(balanced.state, "BALANCED_NO_ACTION");
  assert.equal(balanced.residual.exactQuantity, 0);
  assert.equal(balanced.requiredApprovalPhrase, null);

  console.log(
    "V142 Strategy #1 residual recovery assistant test passed: authoritative read reconciliation, exact residual sizing, fresh depth/rules/fees/balance, loss caps and evidence-only approval stayed fail-closed without an order path.",
  );
}

class FakePairPort {
  reconciliations = 0;

  constructor(
    private current: StrategyOneTwoLegSessionRecord,
  ) {}

  getSession(
    sessionId: string,
  ): StrategyOneTwoLegSessionRecord | null {
    return sessionId === this.current.sessionId
      ? structuredClone(this.current)
      : null;
  }

  async reconcileSession(
    sessionId: string,
  ): Promise<StrategyOneTwoLegExecutionResult> {
    const current = this.getSession(sessionId);

    if (!current) {
      throw new Error("Unknown test session.");
    }

    this.reconciliations += 1;
    return {
      session: current,
      possibleExposure: current.state === "POSSIBLE_EXPOSURE",
      recoveryRequired:
        current.state === "POSSIBLE_EXPOSURE" ||
        current.state === "RECOVERY_REQUIRED",
      buyDispatchedAt: current.buyDispatchedAt,
      sellDispatchedAt: current.sellDispatchedAt,
      buyResponse: current.buyResponse,
      sellResponse: current.sellResponse,
    };
  }
}

function assistant(
  pairs: FakePairPort,
  book: {
    readonly timestamp: number;
    readonly bids: readonly {readonly price: number; readonly quantity: number}[];
    readonly asks: readonly {readonly price: number; readonly quantity: number}[];
  },
  marketCapability: ExchangeMarketCapability,
  availableBalance: number,
  file: string,
  currentTime = NOW,
): StrategyOneResidualRecoveryAssistantService {
  return new StrategyOneResidualRecoveryAssistantService(
    pairs,
    {
      currentTime: () => currentTime,
      getOrderBook: () => ({
        exchange: "coindcx",
        market: "COTIUSDT",
        timestamp: book.timestamp,
        bids: book.bids.map((level) => ({...level})),
        asks: book.asks.map((level) => ({...level})),
      }),
      getCapability: () => structuredClone(marketCapability),
      getBalance: (exchange, asset) => ({
        exchange,
        asset,
        availableBalance,
        lockedBalance: 0,
        totalBalance: availableBalance,
        synchronizedAt: NOW - 20,
      }),
      getTakerFeePercent: () => 0.2,
      getVenueContract: () => ({
        exchange: "coindcx",
        maximumOrderBookAgeMs: 190,
        supportedTimeInForce: ["GTC"],
        requiredTimeInForce: "GTC",
        authoritativeFillConfirmationReady: true,
        authoritativeFeeReconciliationReady: true,
      }),
    },
    {
      maximumLossPercentOfResidual: 1,
    },
    resolve(process.cwd(), file),
  );
}

function capability(
  quantityStep: number,
): ExchangeMarketCapability {
  return {
    exchange: "coindcx",
    market: "COTIUSDT",
    baseAsset: "COTI",
    quoteAsset: "USDT",
    product: "spot",
    tradingEnabled: true,
    maintenanceMode: false,
    order: {
      supportedOrderTypes: ["limit"],
      supportedTimeInForce: ["GTC"],
      supportsPostOnly: false,
      supportsClientOrderId: true,
      supportsOrderCancellation: true,
      supportsOrderStatusPolling: true,
    },
    price: {
      minimumPrice: 0.0001,
      maximumPrice: 10,
      priceStep: 0.0001,
      pricePrecision: 4,
    },
    quantity: {
      minimumQuantity: 1,
      maximumQuantity: 100_000,
      quantityStep,
      quantityPrecision: 0,
    },
    notional: {
      minimumNotional: 1,
      maximumNotional: 10_000,
    },
    fees: {
      makerFeeRate: 0.2,
      takerFeeRate: 0.2,
      feeAsset: "USDT",
    },
    sourceUpdatedAt: NOW - 100,
    synchronizedAt: NOW - 100,
  };
}

function session(input: {
  readonly buyFilled: number;
  readonly sellFilled: number;
  readonly buyStatus: LiveExecutionStatus;
  readonly sellStatus: LiveExecutionStatus;
  readonly buyAveragePrice: number;
  readonly sellAveragePrice: number;
  readonly state: StrategyOneTwoLegSessionRecord["state"];
  readonly sessionId?: string;
}): StrategyOneTwoLegSessionRecord {
  const sessionId =
    input.sessionId ?? "strategy-one-session-ready";
  const buyRequest =
    request("coindcx", "buy", "GTC", 10.5);
  const sellRequest =
    request("binance", "sell", "FOK", 10.5);

  return {
    schemaVersion: "108.0",
    sessionId,
    requestHash: `hash-${sessionId}`,
    opportunityId: `opportunity-${sessionId}`,
    lastLookDecisionId: `last-look-${sessionId}`,
    buyIdempotencyKey: `${sessionId}:buy`,
    sellIdempotencyKey: `${sessionId}:sell`,
    buyRequest,
    sellRequest,
    state: input.state,
    preparedAt: NOW - 1_000,
    updatedAt: NOW - 100,
    buyDispatchedAt: NOW - 900,
    sellDispatchedAt: NOW - 900,
    buyResponse: gatewayResponse(
      buyRequest,
      input.buyStatus,
      input.buyFilled,
      input.buyAveragePrice,
      `${sessionId}-buy`,
    ),
    sellResponse: gatewayResponse(
      sellRequest,
      input.sellStatus,
      input.sellFilled,
      input.sellAveragePrice,
      `${sessionId}-sell`,
    ),
    reasons: [],
    automaticRetryAllowed: false,
    automaticRecoveryOrderAllowed: false,
    newOrderSubmissionAllowed: false,
  };
}

function request(
  exchange: string,
  side: "buy" | "sell",
  timeInForce: "GTC" | "FOK",
  quantity: number,
): LiveExecutionRequest {
  return {
    exchange,
    product: "SPOT",
    market: "COTIUSDT",
    side,
    orderType: "limit",
    timeInForce,
    quantity,
    price: side === "buy" ? 1 : 1.02,
    clientOrderId: `client-${exchange}-${side}`,
    timeoutMs: 1_000,
    cancelOnTimeout: exchange === "coindcx",
  };
}

function gatewayResponse(
  requestValue: LiveExecutionRequest,
  status: LiveExecutionStatus,
  filledQuantity: number,
  averageFillPrice: number,
  id: string,
): CentralLiveOrderGatewayResponse {
  const result:
    LiveExecutionResult = {
    success: status === "FILLED",
    exchange: requestValue.exchange,
    product: "SPOT",
    market: requestValue.market,
    side: requestValue.side,
    orderId: `order-${id}`,
    clientOrderId: requestValue.clientOrderId ?? null,
    status,
    requestedQuantity: requestValue.quantity,
    filledQuantity,
    remainingQuantity: Math.max(0, requestValue.quantity - filledQuantity),
    requestedPrice: requestValue.price ?? null,
    averageFillPrice,
    feeAmount: filledQuantity * averageFillPrice * 0.002,
    cancelled: status === "CANCELLED",
    timedOut: false,
    startedAt: NOW - 900,
    completedAt: NOW - 500,
    executionTimeMs: 400,
    failureReason: status === "FAILED" ? "Injected terminal failure." : null,
    reasons: [],
  };

  return {
    state: terminal(status) ? "READY" : "OPEN",
    record: {
      version: "76.0",
      id: `gateway-${id}`,
      idempotencyKey: id,
      requestHash: `request-${id}`,
      request: requestValue,
      state: "FEE_RECONCILED",
      preparedAt: NOW - 1_000,
      updatedAt: NOW - 100,
      result,
      feeEvidence: null,
      cancelRequestedAt: null,
      orderSubmissionPerformed: true,
      lastError: null,
    },
    reasons: [],
  };
}

function terminal(status: LiveExecutionStatus): boolean {
  return status === "FILLED" ||
    status === "CANCELLED" ||
    status === "REJECTED" ||
    status === "FAILED";
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
