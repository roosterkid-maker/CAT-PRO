import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
} from "node:fs";
import {
  tmpdir,
} from "node:os";
import {
  join,
} from "node:path";

import {
  StrategyOneTwoLegLiveExecutionService,
  type StrategyOneTwoLegGatewayPort,
} from "../arbitrage/StrategyOneTwoLegLiveExecutionService";

import type {
  CentralLiveOrderGatewayResponse,
  CentralLiveOrderGatewayRecord,
} from "../central/CentralLiveOrderExecutionGateway";

import type {
  LiveExecutionRequest,
} from "../models/LiveExecutionRequest";

const NOW =
  1_786_812_800_000;

async function main(): Promise<void> {
  const directory =
    mkdtempSync(
      join(tmpdir(), "cat-pro-v108-"),
    );

  try {
    await testSuccessfulConcurrentPair(directory);
    await testMismatchedPair(directory);
    await testUnknownOutcomeAndRestart(directory);
    await testInvalidVenueRejectedBeforeGateway(directory);
    await testExactCoinDCXBinanceCOTILane(directory);
    await testApprovedReverseBBCoinDCXLane(directory);
  } finally {
    rmSync(directory, {recursive: true, force: true});
  }

  console.log(
    "V108 Strategy #1 two-leg journal-before-I/O, concurrent dispatch, duplicate suppression, mismatch recovery classification, unknown-outcome no-retry, and restart reconciliation passed with isolated gateways; no exchange order occurred.",
  );
}

async function testSuccessfulConcurrentPair(
  directory: string,
): Promise<void> {
  let active = 0;
  let maximumActive = 0;
  let calls = 0;
  const gateway: StrategyOneTwoLegGatewayPort = {
    executeOrReconcile: async (input) => {
      calls += 1;
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await Promise.resolve();
      active -= 1;
      return ready(input.request, input.idempotencyKey, 1);
    },
  };
  const service =
    new StrategyOneTwoLegLiveExecutionService(
      gateway,
      join(directory, "success.jsonl"),
    );
  const input =
    pairInput("success");
  const [first, duplicate] =
    await Promise.all([
      service.executeOrReconcile(input),
      service.executeOrReconcile(input),
    ]);

  assert.equal(calls, 2);
  assert.equal(maximumActive, 2);
  assert.equal(first.session.state, "COMPLETED");
  assert.equal(duplicate.session.sessionId, first.session.sessionId);
  assert.equal(first.possibleExposure, false);
  assert.equal(first.recoveryRequired, false);
  assert.equal(first.session.automaticRetryAllowed, false);
  assert.equal(service.getDiagnostics(NOW + 1).persistence.writes, 3);
  assert.equal(service.listSessions().length, 1);
}

async function testMismatchedPair(
  directory: string,
): Promise<void> {
  const gateway: StrategyOneTwoLegGatewayPort = {
    executeOrReconcile: async (input) =>
      ready(
        input.request,
        input.idempotencyKey,
        input.request.side === "buy" ? 1 : 0.4,
      ),
  };
  const service =
    new StrategyOneTwoLegLiveExecutionService(
      gateway,
      join(directory, "mismatch.jsonl"),
    );
  const result =
    await service.executeOrReconcile(pairInput("mismatch"));

  assert.equal(result.session.state, "RECOVERY_REQUIRED");
  assert.equal(result.possibleExposure, false);
  assert.equal(result.recoveryRequired, true);
  assert.equal(
    result.session.reasons.some((reason) => reason.includes("do not match")),
    true,
  );
}

async function testUnknownOutcomeAndRestart(
  directory: string,
): Promise<void> {
  const filePath =
    join(directory, "unknown.jsonl");
  const firstGateway: StrategyOneTwoLegGatewayPort = {
    executeOrReconcile: async (input) => {
      if (input.request.side === "buy") {
        throw new Error("fixture transport closed after write");
      }

      return ready(input.request, input.idempotencyKey, 1);
    },
  };
  const input =
    pairInput("unknown");
  const firstService =
    new StrategyOneTwoLegLiveExecutionService(firstGateway, filePath);
  const first =
    await firstService.executeOrReconcile(input);

  assert.equal(first.session.state, "POSSIBLE_EXPOSURE");
  assert.equal(first.possibleExposure, true);
  assert.equal(first.recoveryRequired, true);

  const replayAuthorities: boolean[] = [];
  const replayGateway: StrategyOneTwoLegGatewayPort = {
    executeOrReconcile: async (gatewayInput) => {
      replayAuthorities.push(gatewayInput.allowNewSubmission);
      return {
        state: "UNCERTAIN_SUBMISSION",
        record: null,
        reasons: ["Fixture retains unknown outcome."],
      };
    },
  };
  const restored =
    new StrategyOneTwoLegLiveExecutionService(replayGateway, filePath);
  const replay =
    await restored.executeOrReconcile({
      ...input,
      allowNewSubmission: true,
      now: NOW + 10,
    });

  assert.deepEqual(replayAuthorities, [false, false]);
  assert.equal(replay.session.state, "POSSIBLE_EXPOSURE");
  assert.equal(replay.session.automaticRetryAllowed, false);
  assert.equal(restored.getSession(input.sessionId)?.state, "POSSIBLE_EXPOSURE");
}

async function testInvalidVenueRejectedBeforeGateway(
  directory: string,
): Promise<void> {
  let calls = 0;
  const service =
    new StrategyOneTwoLegLiveExecutionService(
      {
        executeOrReconcile: async () => {
          calls += 1;
          throw new Error("Gateway must not be reached.");
        },
      },
      join(directory, "invalid.jsonl"),
    );
  const input =
    pairInput("invalid");

  await assert.rejects(
    service.executeOrReconcile({
      ...input,
      buyRequest: {
        ...input.buyRequest,
        exchange: "coindcx",
      },
    }),
    /Binance\/Bybit SPOT limit-FOK lane or an immutable pilot-basket route/u,
  );
  assert.equal(calls, 0);
}

async function testExactCoinDCXBinanceCOTILane(
  directory: string,
): Promise<void> {
  let calls =
    0;
  const service =
    new StrategyOneTwoLegLiveExecutionService(
      {
        executeOrReconcile: async (input) => {
          calls +=
            1;
          return ready(
            input.request,
            input.idempotencyKey,
            input.request.quantity,
          );
        },
      },
      join(
        directory,
        "coindcx-binance-coti.jsonl",
      ),
    );
  const buyRequest:
    LiveExecutionRequest = {
    ...request(
      "coindcx",
      "buy",
      "cat-coti-buy",
    ),
    market:
      "COTIUSDT",
    timeInForce:
      "GTC",
    timeoutMs:
      10_000,
    pollingIntervalMs:
      1_000,
    cancelOnTimeout:
      true,
  };
  const sellRequest:
    LiveExecutionRequest = {
    ...request(
      "binance",
      "sell",
      "cat-coti-sell",
    ),
    market:
      "COTIUSDT",
    timeInForce:
      "FOK",
  };
  const input = {
    sessionId:
      "strategy-one:coti:session",
    opportunityId:
      "opportunity:coti",
    lastLookDecisionId:
      "last-look:coti",
    buyRequest,
    sellRequest,
    allowNewSubmission:
      true,
    now:
      NOW,
  } as const;
  const result =
    await service.executeOrReconcile(
      input,
    );

  assert.equal(
    result.session.state,
    "COMPLETED",
  );
  assert.equal(
    calls,
    2,
  );

  const reverse =
    new StrategyOneTwoLegLiveExecutionService(
      {
        executeOrReconcile: async () => {
          throw new Error(
            "Reverse route must never reach gateway.",
          );
        },
      },
      join(
        directory,
        "coindcx-binance-reverse.jsonl",
      ),
    );

  await assert.rejects(
    reverse.executeOrReconcile({
      ...input,
      sessionId:
        "strategy-one:coti:reverse",
      buyRequest: {
        ...sellRequest,
        side:
          "buy",
      },
      sellRequest: {
        ...buyRequest,
        side:
          "sell",
      },
    }),
    /immutable pilot-basket route/u,
  );
}

async function testApprovedReverseBBCoinDCXLane(
  directory: string,
): Promise<void> {
  let calls = 0;
  const service = new StrategyOneTwoLegLiveExecutionService(
    {
      executeOrReconcile: async (input) => {
        calls += 1;
        return ready(input.request, input.idempotencyKey, input.request.quantity);
      },
    },
    join(directory, "binance-coindcx-bb.jsonl"),
  );
  const buyRequest: LiveExecutionRequest = {
    ...request("binance", "buy", "cat-bb-buy"),
    market: "BBUSDT",
    timeInForce: "FOK",
  };
  const sellRequest: LiveExecutionRequest = {
    ...request("coindcx", "sell", "cat-bb-sell"),
    market: "BBUSDT",
    timeInForce: "GTC",
    timeoutMs: 10_000,
    pollingIntervalMs: 1_000,
    cancelOnTimeout: true,
  };
  const result = await service.executeOrReconcile({
    sessionId: "strategy-one:bb:reverse",
    opportunityId: "opportunity:bb:reverse",
    lastLookDecisionId: "last-look:bb:reverse",
    buyRequest,
    sellRequest,
    allowNewSubmission: true,
    now: NOW,
  });

  assert.equal(result.session.state, "COMPLETED");
  assert.equal(calls, 2);
}

function pairInput(
  suffix: string,
) {
  return {
    sessionId: `strategy-one:${suffix}:session`,
    opportunityId: `opportunity:${suffix}`,
    lastLookDecisionId: `last-look:${suffix}`,
    buyRequest: request("binance", "buy", `cat-${suffix}-buy`),
    sellRequest: request("bybit", "sell", `cat-${suffix}-sell`),
    allowNewSubmission: true,
    now: NOW,
  } as const;
}

function request(
  exchange: string,
  side: "buy" | "sell",
  clientOrderId: string,
): LiveExecutionRequest {
  return {
    exchange,
    product: "SPOT",
    market: "BTCUSDT",
    side,
    orderType: "limit",
    timeInForce: "FOK",
    quantity: 1,
    price: side === "buy" ? 100 : 102,
    clientOrderId,
    timeoutMs: 1_000,
    pollingIntervalMs: 10,
    cancelOnTimeout: true,
  };
}

function ready(
  requestValue: LiveExecutionRequest,
  idempotencyKey: string,
  filledQuantity: number,
): CentralLiveOrderGatewayResponse {
  const result = {
    success: filledQuantity === requestValue.quantity,
    exchange: requestValue.exchange,
    market: requestValue.market,
    side: requestValue.side,
    orderId: `${requestValue.exchange}-${requestValue.side}-order`,
    clientOrderId: requestValue.clientOrderId ?? null,
    status: filledQuantity === requestValue.quantity
      ? "FILLED" as const
      : "PARTIALLY_FILLED" as const,
    requestedQuantity: requestValue.quantity,
    filledQuantity,
    remainingQuantity: requestValue.quantity - filledQuantity,
    requestedPrice: requestValue.price ?? null,
    averageFillPrice: requestValue.price ?? 0,
    feeAmount: 0,
    cancelled: false,
    timedOut: false,
    startedAt: NOW,
    completedAt: NOW + 1,
    executionTimeMs: 1,
    failureReason: null,
    reasons: [],
  };
  const record: CentralLiveOrderGatewayRecord = {
    version: "76.0",
    id: `central:${idempotencyKey}`,
    idempotencyKey,
    requestHash: "fixture-hash",
    request: requestValue,
    state: "FEE_RECONCILED",
    preparedAt: NOW,
    updatedAt: NOW + 1,
    result,
    feeEvidence: null,
    cancelRequestedAt: null,
    orderSubmissionPerformed: true,
    lastError: null,
  };

  return {
    state: "READY",
    record,
    reasons: [],
  };
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
