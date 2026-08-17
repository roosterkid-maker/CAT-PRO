import assert from "node:assert/strict";
import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";

import {
  StrategyOneTwoLegLiveExecutionService,
} from "../arbitrage/StrategyOneTwoLegLiveExecutionService";
import type {
  CentralLiveOrderGatewayRecord,
  CentralLiveOrderGatewayResponse,
} from "../central/CentralLiveOrderExecutionGateway";
import type {LiveExecutionRequest} from "../models/LiveExecutionRequest";
import {
  StrategyOneTwoLegRecoveryResolutionService,
} from "../recovery/StrategyOneTwoLegRecoveryResolutionService";
import {
  StrategyOneTwoLegRestartRecoveryService,
} from "../recovery/StrategyOneTwoLegRestartRecoveryService";

const NOW = 1_786_812_800_000;

async function main(): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), "cat-pro-v109-"));

  try {
    const pairFile = join(directory, "pairs.jsonl");
    const resolutionFile = join(directory, "resolutions.jsonl");
    const initial = new StrategyOneTwoLegLiveExecutionService(
      {
        executeOrReconcile: async (input) => {
          if (input.request.side === "buy") {
            throw new Error("fixture connection closed after write");
          }

          return ready(input.request, input.idempotencyKey, 1);
        },
      },
      pairFile,
    );
    const input = pairInput();
    const exposed = await initial.executeOrReconcile(input);

    assert.equal(exposed.session.state, "POSSIBLE_EXPOSURE");

    const initialResolutions =
      new StrategyOneTwoLegRecoveryResolutionService(initial, resolutionFile);
    const blocked =
      new StrategyOneTwoLegRestartRecoveryService(initial, initialResolutions)
        .getReport(NOW + 2);

    assert.equal(blocked.classification, "POSSIBLE_EXPOSURE");
    assert.equal(blocked.allowNewLivePreparation, false);
    assert.equal(blocked.summary.possibleExposureSessions, 1);

    const reconciliationAuthorities: boolean[] = [];
    const restored = new StrategyOneTwoLegLiveExecutionService(
      {
        executeOrReconcile: async (gatewayInput) => {
          reconciliationAuthorities.push(gatewayInput.allowNewSubmission);
          return ready(
            gatewayInput.request,
            gatewayInput.idempotencyKey,
            1,
          );
        },
      },
      pairFile,
    );
    const resolutions =
      new StrategyOneTwoLegRecoveryResolutionService(restored, resolutionFile);
    const resolution = await resolutions.resolveSession(
      input.sessionId,
      "Fixture authoritative terminal balance verified.",
      NOW + 10,
    );

    assert.deepEqual(reconciliationAuthorities, [false, false]);
    assert.equal(resolution.basis, "AUTHORITATIVE_TERMINAL_BALANCED");
    assert.equal(resolution.automaticOrderActionPerformed, false);
    assert.equal(resolutions.isSessionResolved(input.sessionId), true);
    assert.equal(restored.getSession(input.sessionId)?.state, "COMPLETED");

    const cleared =
      new StrategyOneTwoLegRestartRecoveryService(restored, resolutions)
        .getReport(NOW + 11);

    assert.equal(cleared.classification, "CLEAN");
    assert.equal(cleared.allowNewLivePreparation, true);
    assert.equal(cleared.summary.unresolvedSessions, 0);
  } finally {
    rmSync(directory, {recursive: true, force: true});
  }

  console.log(
    "V109 Strategy #1 restart recovery blocks possible pair exposure, reconciles with allowNewSubmission=false, and clears only on durable terminal balanced evidence; no exchange order occurred.",
  );
}

function pairInput() {
  return {
    sessionId: "strategy-one:v109:session",
    opportunityId: "opportunity:v109",
    lastLookDecisionId: "last-look:v109",
    buyRequest: request("binance", "buy", "cat-v109-buy"),
    sellRequest: request("bybit", "sell", "cat-v109-sell"),
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
    status: "FILLED" as const,
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
