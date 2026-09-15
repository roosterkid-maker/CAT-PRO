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
        validateNewSubmission() {},
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
        validateNewSubmission() {},
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

    const residualPairFile = join(directory, "residual-pairs.jsonl");
    const residualResolutionFile = join(directory, "residual-resolutions.jsonl");
    const residualPairs = new StrategyOneTwoLegLiveExecutionService(
      {
        validateNewSubmission() {},
        executeOrReconcile: async (gatewayInput) =>
          gatewayInput.request.side === "buy"
            ? ready(gatewayInput.request, gatewayInput.idempotencyKey, 1)
            : failed(gatewayInput.request, gatewayInput.idempotencyKey),
      },
      residualPairFile,
    );
    const residualInput = {
      ...pairInput(),
      sessionId: "strategy-one:v202:residual-session",
      opportunityId: "opportunity:v202:residual",
    };
    const residual = await residualPairs.executeOrReconcile(residualInput);

    assert.equal(residual.session.state, "RECOVERY_REQUIRED");
    const residualResolutions = new StrategyOneTwoLegRecoveryResolutionService(
      residualPairs,
      residualResolutionFile,
    );

    await assert.rejects(
      residualResolutions.resolveCompensatingOrder(
        residualInput.sessionId,
        compensatingEvidence("bybit"),
        "Wrong venue must fail closed.",
        NOW + 20,
      ),
      /compensating recovery remains unresolved/u,
    );

    const compensated = await residualResolutions.resolveCompensatingOrder(
      residualInput.sessionId,
      compensatingEvidence("binance"),
      "Exact Binance SELL fill flattened the authoritative long residual.",
      NOW + 21,
    );

    assert.equal(
      compensated.basis,
      "AUTHORITATIVE_COMPENSATING_ORDER_BALANCED",
    );
    assert.equal(compensated.buyFilledQuantity, 1);
    assert.equal(compensated.sellFilledQuantity, 1);
    assert.equal(compensated.automaticOrderActionPerformed, true);
    assert.equal(compensated.compensatingOrder?.side, "sell");
    assert.equal(
      residualResolutions.isSessionResolved(residualInput.sessionId),
      true,
    );
    const compensatedGate = new StrategyOneTwoLegRestartRecoveryService(
      residualPairs,
      residualResolutions,
    ).getReport(NOW + 22);
    assert.equal(compensatedGate.classification, "CLEAN");
    assert.equal(compensatedGate.allowNewLivePreparation, true);

    // Real-incident shape (WAVESUSDT, PYBOBOUSDT): BUY leg terminates with
    // zero fill, SELL leg genuinely FILLS from pre-existing inventory.
    const shortPairFile = join(directory, "short-pairs.jsonl");
    const shortResolutionFile = join(directory, "short-resolutions.jsonl");
    const shortPairs = new StrategyOneTwoLegLiveExecutionService(
      {
        validateNewSubmission() {},
        executeOrReconcile: async (gatewayInput) =>
          gatewayInput.request.side === "sell"
            ? ready(gatewayInput.request, gatewayInput.idempotencyKey, 1)
            : failed(gatewayInput.request, gatewayInput.idempotencyKey),
      },
      shortPairFile,
    );
    const shortInput = {
      ...pairInput(),
      sessionId: "strategy-one:v202:short-session",
      opportunityId: "opportunity:v202:short",
    };
    const short = await shortPairs.executeOrReconcile(shortInput);

    assert.equal(short.session.state, "RECOVERY_REQUIRED");
    const shortResolutions = new StrategyOneTwoLegRecoveryResolutionService(
      shortPairs,
      shortResolutionFile,
    );

    await assert.rejects(
      shortResolutions.resolveByPreExistingInventoryCoverage(
        shortInput.sessionId,
        balanceEvidence({exchange: "binance"}),
        "Wrong venue must fail closed.",
        NOW + 30,
      ),
      /recovery remains unresolved/u,
    );

    await assert.rejects(
      shortResolutions.resolveByPreExistingInventoryCoverage(
        shortInput.sessionId,
        balanceEvidence({borrowedAmount: 5}),
        "Non-zero borrow must fail closed.",
        NOW + 30,
      ),
      /recovery remains unresolved/u,
    );

    // validateBalanceEvidence() rejects malformed/stale evidence
    // synchronously (fail-fast on garbage input), the same convention
    // resolveCompensatingOrder() uses for validateCompensatingEvidence() -
    // it never returns a promise to reject in this case.
    assert.throws(
      () =>
        shortResolutions.resolveByPreExistingInventoryCoverage(
          shortInput.sessionId,
          balanceEvidence({queriedAt: NOW - 6 * 60 * 1000}),
          "Stale evidence must fail closed.",
          NOW + 30,
        ),
      /stale/u,
    );

    const covered = await shortResolutions.resolveByPreExistingInventoryCoverage(
      shortInput.sessionId,
      balanceEvidence({}),
      "Live authoritative Bybit balance confirms zero borrow and positive remaining BTC.",
      NOW + 30,
    );

    assert.equal(
      covered.basis,
      "AUTHORITATIVE_PRE_EXISTING_INVENTORY_COVERED",
    );
    assert.equal(covered.buyFilledQuantity, 0);
    assert.equal(covered.sellFilledQuantity, 1);
    assert.equal(covered.automaticOrderActionPerformed, false);
    assert.equal(covered.balanceEvidence?.exchange, "bybit");
    assert.equal(
      shortResolutions.isSessionResolved(shortInput.sessionId),
      true,
    );
    const coveredGate = new StrategyOneTwoLegRestartRecoveryService(
      shortPairs,
      shortResolutions,
    ).getReport(NOW + 31);
    assert.equal(coveredGate.classification, "CLEAN");
    assert.equal(coveredGate.allowNewLivePreparation, true);

    // Mirrored real-incident shape (TUTUSDT): BUY leg genuinely FILLS,
    // paired SELL leg terminates with zero fill, leaving surplus spot
    // inventory that was paid for - never a liability, since nothing was
    // borrowed against it.
    const surplusPairFile = join(directory, "surplus-pairs.jsonl");
    const surplusResolutionFile = join(directory, "surplus-resolutions.jsonl");
    const surplusPairs = new StrategyOneTwoLegLiveExecutionService(
      {
        validateNewSubmission() {},
        executeOrReconcile: async (gatewayInput) =>
          gatewayInput.request.side === "buy"
            ? ready(gatewayInput.request, gatewayInput.idempotencyKey, 1)
            : failed(gatewayInput.request, gatewayInput.idempotencyKey),
      },
      surplusPairFile,
    );
    const surplusInput = {
      ...pairInput(),
      sessionId: "strategy-one:v202:surplus-session",
      opportunityId: "opportunity:v202:surplus",
    };
    const surplus = await surplusPairs.executeOrReconcile(surplusInput);

    assert.equal(surplus.session.state, "RECOVERY_REQUIRED");
    const surplusResolutions = new StrategyOneTwoLegRecoveryResolutionService(
      surplusPairs,
      surplusResolutionFile,
    );

    // The bought leg's exchange is "binance" here (pairInput()'s buyRequest),
    // so evidence for the balance still held on the *sell* exchange must
    // fail closed - the surplus lives on the buy exchange, not the sell one.
    await assert.rejects(
      surplusResolutions.resolveByPreExistingInventoryCoverage(
        surplusInput.sessionId,
        balanceEvidence({exchange: "bybit"}),
        "Wrong venue must fail closed.",
        NOW + 40,
      ),
      /recovery remains unresolved/u,
    );

    // A remaining balance below the bought quantity must fail closed - the
    // surplus itself must still be accounted for, not merely "some balance".
    await assert.rejects(
      surplusResolutions.resolveByPreExistingInventoryCoverage(
        surplusInput.sessionId,
        {...balanceEvidence({exchange: "binance"}), availableBalance: 0.5},
        "Insufficient remaining surplus must fail closed.",
        NOW + 40,
      ),
      /recovery remains unresolved/u,
    );

    const surplusCovered = await surplusResolutions
      .resolveByPreExistingInventoryCoverage(
        surplusInput.sessionId,
        balanceEvidence({exchange: "binance"}),
        "Live authoritative Binance balance confirms zero borrow and the bought BTC still held.",
        NOW + 40,
      );

    assert.equal(
      surplusCovered.basis,
      "AUTHORITATIVE_PRE_EXISTING_INVENTORY_COVERED",
    );
    assert.equal(surplusCovered.buyFilledQuantity, 1);
    assert.equal(surplusCovered.sellFilledQuantity, 0);
    assert.equal(surplusCovered.balanceEvidence?.exchange, "binance");
    assert.equal(
      surplusResolutions.isSessionResolved(surplusInput.sessionId),
      true,
    );
    const surplusGate = new StrategyOneTwoLegRestartRecoveryService(
      surplusPairs,
      surplusResolutions,
    ).getReport(NOW + 41);
    assert.equal(surplusGate.classification, "CLEAN");
    assert.equal(surplusGate.allowNewLivePreparation, true);
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

function failed(
  requestValue: LiveExecutionRequest,
  idempotencyKey: string,
): CentralLiveOrderGatewayResponse {
  const response = ready(requestValue, idempotencyKey, 0);
  const record = response.record as CentralLiveOrderGatewayRecord;
  return {
    state: "READY",
    reasons: ["Injected terminal zero-fill failure."],
    record: {
      ...record,
      result: record.result ? {
        ...record.result,
        success: false,
        status: "FAILED",
        averageFillPrice: 0,
        failureReason: "Injected terminal zero-fill failure.",
      } : null,
    },
  };
}

function compensatingEvidence(exchange: string) {
  return {
    exchange,
    market: "BTCUSDT",
    side: "sell" as const,
    orderId: "binance-recovery-order",
    clientOrderId: "cat-pro-recovery-order",
    status: "FILLED" as const,
    requestedQuantity: 1,
    filledQuantity: 1,
    remainingQuantity: 0 as const,
    averageFillPrice: 101,
    feeEvidenceId: "fee-evidence-binance-recovery",
    completedAt: NOW + 19,
  };
}

function balanceEvidence(overrides: {
  readonly exchange?: string;
  readonly borrowedAmount?: number;
  readonly queriedAt?: number;
}) {
  return {
    exchange: overrides.exchange ?? "bybit",
    asset: "BTC",
    availableBalance: 4.5,
    borrowedAmount: overrides.borrowedAmount ?? 0,
    queriedAt: overrides.queriedAt ?? NOW + 29,
    evidenceSource: "BYBIT_WALLET_BALANCE_LIVE_QUERY",
  };
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
