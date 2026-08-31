import assert from "node:assert/strict";
import {rmSync} from "node:fs";
import {resolve} from "node:path";
import {tmpdir} from "node:os";

import type {
  CentralLiveOrderGatewayRecord,
  CentralLiveOrderGatewayResponse,
} from "../central/CentralLiveOrderExecutionGateway";
import type {LiveExecutionRequest} from "../models/LiveExecutionRequest";
import {
  StrategyOneResidualRecoveryExecutionService,
} from "../recovery/StrategyOneResidualRecoveryExecutionService";
import type {
  StrategyOneApprovedResidualExecutionBoundary,
  StrategyOneResidualRecoveryPreview,
} from "../recovery/StrategyOneResidualRecoveryAssistantService";
import type {
  StrategyOneCompensatingOrderEvidence,
  StrategyOneTwoLegRecoveryResolutionRecord,
} from "../recovery/StrategyOneTwoLegRecoveryResolutionService";

const NOW = 1_800_000_000_000;
const PREVIEW_ID = "recovery-preview-test-exact-once";

async function main(): Promise<void> {
  const assistant = new FakeAssistant(boundary());
  const gateway = new FakeGateway("FILLED");
  const resolutions = new FakeResolutions();
  const file = resolve(tmpdir(), "cat-pro-test-residual-recovery-execution.jsonl");
  rmSync(file, {force: true});
  const service = new StrategyOneResidualRecoveryExecutionService(
    assistant,
    gateway,
    resolutions,
    paperEmergencyAccount(),
    file,
  );

  assert.throws(
    () => service.execute(PREVIEW_ID, "EXECUTE RECOVERY", "test", NOW),
    /Exact one-time residual recovery phrase/u,
  );
  assert.equal(gateway.calls, 0);

  const completed = await service.execute(
    PREVIEW_ID,
    `EXECUTE ONE-TIME RECOVERY ${PREVIEW_ID}`,
    "Exact compensating fill verified by the central gateway.",
    NOW,
  );

  assert.equal(completed.state, "COMPLETED_RESOLVED");
  assert.equal(completed.request.exchange, "binance");
  assert.equal(completed.request.market, "TUTUSDT");
  assert.equal(completed.request.side, "sell");
  assert.equal(completed.request.orderType, "limit");
  assert.equal(completed.request.timeInForce, "FOK");
  assert.equal(completed.request.quantity, 138);
  assert.equal(
    completed.request.price,
    0.03701,
    "the journaled FOK request must use the revalidated action-time price",
  );
  assert.equal(completed.liveOrderSubmissionPerformed, true);
  assert.equal(completed.automaticRetryAllowed, false);
  assert.equal(completed.automaticCancelAllowed, false);
  assert.equal(completed.automaticTransferAllowed, false);
  assert.equal(gateway.calls, 1);
  assert.equal(resolutions.calls, 1);
  assert.equal(resolutions.evidence?.side, "sell");
  assert.equal(resolutions.evidence?.filledQuantity, 138);
  assert.equal(resolutions.evidence?.feeEvidenceId, "fee-evidence-recovery");

  const replay = await service.execute(
    PREVIEW_ID,
    `EXECUTE ONE-TIME RECOVERY ${PREVIEW_ID}`,
    "Repeated UI acknowledgement.",
    NOW + 1_000,
  );

  assert.equal(replay.state, "COMPLETED_RESOLVED");
  assert.equal(gateway.calls, 1);
  assert.equal(resolutions.calls, 1);

  const rejectedPreviewId = "recovery-preview-confirmed-reject-first";
  const secondPreviewId = "recovery-preview-confirmed-reject-second";
  const secondAttemptGateway = new ConfirmedRejectThenFillGateway();
  const secondAttemptResolutions = new FakeResolutions();
  const secondAttemptFile = resolve(
    tmpdir(),
    "cat-pro-test-residual-recovery-second-attempt.jsonl",
  );
  rmSync(secondAttemptFile, {force: true});
  const secondAttemptService = new StrategyOneResidualRecoveryExecutionService(
    new FakeAssistant(boundary(rejectedPreviewId)),
    secondAttemptGateway,
    secondAttemptResolutions,
    paperEmergencyAccount(),
    secondAttemptFile,
  );
  const confirmedReject = await secondAttemptService.execute(
    rejectedPreviewId,
    `EXECUTE ONE-TIME RECOVERY ${rejectedPreviewId}`,
    "Binance rejected the request before acceptance.",
    NOW,
  );
  assert.equal(confirmedReject.state, "FAILED_SAFE");
  assert.equal(confirmedReject.exchangeOrderId, null);
  assert.equal(confirmedReject.filledQuantity, 0);
  assert.equal(confirmedReject.liveOrderSubmissionPerformed, false);

  const eligibilityService =
    new StrategyOneResidualRecoveryExecutionService(
      new FakeAssistant(boundary(secondPreviewId)),
      secondAttemptGateway,
      secondAttemptResolutions,
      paperEmergencyAccount(),
      secondAttemptFile,
    );

  const eligibility = eligibilityService.getDiagnostics(NOW + 100)
    .confirmedRejectSecondAttempts
    .find((item) => item.priorExecutionId === confirmedReject.id);
  assert.equal(eligibility?.eligible, true);
  assert.equal(eligibility?.confirmedExchangeHttpStatus, 400);
  assert.equal(eligibility?.confirmedExchangeCode, "-1111");

  const expiredSecondPreviewId =
    "recovery-preview-confirmed-reject-expired-before-gateway";
  const expiredBoundary = boundary(expiredSecondPreviewId);
  const expiredSecondAttemptService =
    new StrategyOneResidualRecoveryExecutionService(
      new FakeAssistant({
        approvedPreview: expiredBoundary.approvedPreview,
        actionTimePreview: {
          ...expiredBoundary.actionTimePreview,
          createdAt: expiredBoundary.approvedPreview.expiresAt,
        },
      }),
      secondAttemptGateway,
      secondAttemptResolutions,
      paperEmergencyAccount(),
      secondAttemptFile,
    );
  await assert.rejects(
    expiredSecondAttemptService.executeConfirmedRejectSecondAttempt(
      confirmedReject.id,
      expiredSecondPreviewId,
      `EXECUTE CONFIRMED-REJECT SECOND ATTEMPT ${confirmedReject.id} ${expiredSecondPreviewId}`,
      "An expired boundary must not consume the only submission slot.",
      NOW + 200,
    ),
    /expired before gateway ownership/u,
  );
  assert.equal(secondAttemptGateway.calls, 1);
  const reusablePreparedChild = expiredSecondAttemptService
    .getDiagnostics(NOW + 300).records
    .find((record) => record.priorExecutionId === confirmedReject.id);
  assert.equal(reusablePreparedChild?.state, "PREPARED");
  assert.equal(
    expiredSecondAttemptService.getDiagnostics(NOW + 300)
      .confirmedRejectSecondAttempts
      .find((item) => item.priorExecutionId === confirmedReject.id)?.eligible,
    true,
    "a pre-gateway child journal must be reusable through one fresh preview",
  );

  const restartedSecondAttemptService =
    new StrategyOneResidualRecoveryExecutionService(
      new FakeAssistant(boundary(secondPreviewId)),
      secondAttemptGateway,
      secondAttemptResolutions,
      paperEmergencyAccount(),
      secondAttemptFile,
    );

  const changedLineagePreviewId = "recovery-preview-confirmed-reject-changed-lineage";
  const changedLineageService = new StrategyOneResidualRecoveryExecutionService(
    new FakeAssistant(boundary(
      changedLineagePreviewId,
      "changed-source-session-fingerprint",
    )),
    secondAttemptGateway,
    secondAttemptResolutions,
    paperEmergencyAccount(),
    secondAttemptFile,
  );
  await assert.rejects(
    changedLineageService.executeConfirmedRejectSecondAttempt(
      confirmedReject.id,
      changedLineagePreviewId,
      `EXECUTE CONFIRMED-REJECT SECOND ATTEMPT ${confirmedReject.id} ${changedLineagePreviewId}`,
      "Changed lineage must never acquire second-attempt ownership.",
      NOW + 500,
    ),
    /requires unchanged session lineage/u,
  );
  assert.equal(secondAttemptGateway.calls, 1);

  assert.throws(
    () => restartedSecondAttemptService.executeConfirmedRejectSecondAttempt(
      confirmedReject.id,
      secondPreviewId,
      "EXECUTE SECOND ATTEMPT",
      "Wrong phrase must fail before gateway I/O.",
      NOW + 1_000,
    ),
    /Exact confirmed-reject second-attempt phrase/u,
  );
  assert.equal(secondAttemptGateway.calls, 1);

  const requiredSecondAttemptPhrase =
    `EXECUTE CONFIRMED-REJECT SECOND ATTEMPT ${confirmedReject.id} ${secondPreviewId}`;
  const parallelSecondPreviewId =
    "recovery-preview-confirmed-reject-parallel";
  const [recovered, parallelReplay] = await Promise.all([
    restartedSecondAttemptService.executeConfirmedRejectSecondAttempt(
      confirmedReject.id,
      secondPreviewId,
      requiredSecondAttemptPhrase,
      "Fresh approval for one separately journaled confirmed-reject attempt.",
      NOW + 1_000,
    ),
    restartedSecondAttemptService.executeConfirmedRejectSecondAttempt(
      confirmedReject.id,
      parallelSecondPreviewId,
      `EXECUTE CONFIRMED-REJECT SECOND ATTEMPT ${confirmedReject.id} ${parallelSecondPreviewId}`,
      "A concurrent preview for the same predecessor must share one attempt.",
      NOW + 1_001,
    ),
  ]);
  assert.equal(recovered.state, "COMPLETED_RESOLVED");
  assert.equal(parallelReplay.id, recovered.id);
  assert.equal(recovered.id, reusablePreparedChild?.id);
  assert.equal(recovered.attemptNumber, 2);
  assert.equal(recovered.priorExecutionId, confirmedReject.id);
  assert.notEqual(recovered.idempotencyKey, confirmedReject.idempotencyKey);
  assert.equal(secondAttemptGateway.calls, 2);
  assert.deepEqual(secondAttemptGateway.submissionAuthorities, [true, true]);
  assert.notEqual(
    secondAttemptGateway.idempotencyKeys[0],
    secondAttemptGateway.idempotencyKeys[1],
  );
  assert.equal(secondAttemptResolutions.calls, 1);

  const secondReplay = await restartedSecondAttemptService
    .executeConfirmedRejectSecondAttempt(
      confirmedReject.id,
      secondPreviewId,
      requiredSecondAttemptPhrase,
      "UI replay must return the completed child record.",
      NOW + 2_000,
    );
  assert.equal(secondReplay.id, recovered.id);
  assert.equal(secondAttemptGateway.calls, 2);

  const cancelledGateway = new FakeGateway("CANCELLED");
  const cancelledResolution = new FakeResolutions();
  const cancelledFile = resolve(
    tmpdir(),
    "cat-pro-test-residual-recovery-cancelled.jsonl",
  );
  rmSync(cancelledFile, {force: true});
  const cancelledService = new StrategyOneResidualRecoveryExecutionService(
    new FakeAssistant(boundary("recovery-preview-cancelled")),
    cancelledGateway,
    cancelledResolution,
    paperEmergencyAccount(),
    cancelledFile,
  );
  const cancelled = await cancelledService.execute(
    "recovery-preview-cancelled",
    "EXECUTE ONE-TIME RECOVERY recovery-preview-cancelled",
    "Cancelled FOK remains unresolved.",
    NOW,
  );

  assert.equal(cancelled.state, "FAILED_SAFE");
  assert.equal(cancelled.filledQuantity, 0);
  assert.equal(cancelledResolution.calls, 0);
  assert.equal(cancelled.automaticRetryAllowed, false);
  assert.equal(
    cancelledService.getDiagnostics(NOW + 100)
      .confirmedRejectSecondAttempts[0]?.eligible,
    false,
    "an accepted/cancelled order must never qualify for a second attempt",
  );

  const uncertainPreviewId = "recovery-preview-uncertain";
  const uncertainAssistant = new FakeAssistant(boundary(uncertainPreviewId));
  const uncertainGateway = new FakeUncertainGateway();
  const uncertainFile = resolve(
    tmpdir(),
    "cat-pro-test-residual-recovery-uncertain.jsonl",
  );
  rmSync(uncertainFile, {force: true});
  const uncertainService = new StrategyOneResidualRecoveryExecutionService(
    uncertainAssistant,
    uncertainGateway,
    new FakeResolutions(),
    paperEmergencyAccount(),
    uncertainFile,
  );
  const uncertain = await uncertainService.execute(
    uncertainPreviewId,
    `EXECUTE ONE-TIME RECOVERY ${uncertainPreviewId}`,
    "Unknown gateway outcome must remain blocked.",
    NOW,
  );
  assert.equal(uncertain.state, "SUBMISSION_UNCERTAIN");
  const readReconciled = await uncertainService.execute(
    uncertainPreviewId,
    `EXECUTE ONE-TIME RECOVERY ${uncertainPreviewId}`,
    "Read reconciliation after preview expiry.",
    NOW + 60_000,
  );
  assert.equal(readReconciled.state, "SUBMISSION_UNCERTAIN");
  assert.deepEqual(uncertainGateway.submissionAuthorities, [true, false]);
  assert.equal(uncertainAssistant.calls, 1);
  assert.equal(
    uncertainService.getDiagnostics(NOW + 60_001)
      .confirmedRejectSecondAttempts[0]?.eligible,
    false,
    "uncertain submission evidence must never qualify for a second attempt",
  );

  const blockedGateway = new FakeGateway("FILLED");
  const blockedService = new StrategyOneResidualRecoveryExecutionService(
    new FakeAssistant(boundary("recovery-preview-account-blocked")),
    blockedGateway,
    new FakeResolutions(),
    {
      getAccount: () => ({mode: "PAPER", enabled: true, emergencyStop: false}),
    },
    resolve(tmpdir(), "cat-pro-test-residual-recovery-account-blocked.jsonl"),
  );

  await assert.rejects(
    blockedService.execute(
      "recovery-preview-account-blocked",
      "EXECUTE ONE-TIME RECOVERY recovery-preview-account-blocked",
      "Must remain blocked.",
      NOW,
    ),
    /emergency stop active/u,
  );
  assert.equal(blockedGateway.calls, 0);

  rmSync(file, {force: true});
  rmSync(cancelledFile, {force: true});
  rmSync(uncertainFile, {force: true});
  rmSync(secondAttemptFile, {force: true});
  console.log(
    "V202 recovery execution test passed: exact FOK execution remained idempotent, and only a deterministic zero-fill Binance HTTP rejection could receive one fresh separately authorized second attempt while cancelled/uncertain outcomes stayed blocked.",
  );
}

class FakeAssistant {
  calls = 0;

  constructor(
    private readonly value: StrategyOneApprovedResidualExecutionBoundary,
  ) {}

  async getApprovedExecutionBoundary():
    Promise<StrategyOneApprovedResidualExecutionBoundary> {
    this.calls += 1;
    return structuredClone(this.value);
  }
}

class FakeGateway {
  calls = 0;
  private owned: CentralLiveOrderGatewayRecord | null = null;

  constructor(
    private readonly status: "FILLED" | "CANCELLED",
  ) {}

  get(): CentralLiveOrderGatewayRecord | null {
    return this.owned ? structuredClone(this.owned) : null;
  }

  async executeOrReconcile(input: {
    readonly request: LiveExecutionRequest;
    readonly idempotencyKey: string;
    readonly allowNewSubmission: boolean;
    readonly now?: number;
  }): Promise<CentralLiveOrderGatewayResponse> {
    this.calls += 1;
    assert.equal(input.allowNewSubmission, true);
    this.owned = gatewayRecord(input.request, input.idempotencyKey, this.status);
    return {
      state: "READY",
      record: structuredClone(this.owned),
      reasons: this.status === "FILLED" ? [] : ["FOK ended without a fill."],
    };
  }
}

class FakeUncertainGateway {
  submissionAuthorities: boolean[] = [];
  private owned: CentralLiveOrderGatewayRecord | null = null;

  get(): CentralLiveOrderGatewayRecord | null {
    return this.owned ? structuredClone(this.owned) : null;
  }

  async executeOrReconcile(input: {
    readonly request: LiveExecutionRequest;
    readonly idempotencyKey: string;
    readonly allowNewSubmission: boolean;
    readonly now?: number;
  }): Promise<CentralLiveOrderGatewayResponse> {
    this.submissionAuthorities.push(input.allowNewSubmission);
    this.owned = this.owned ?? {
      version: "76.0",
      id: "central-recovery-uncertain",
      idempotencyKey: input.idempotencyKey,
      requestHash: "uncertain-request-hash",
      request: structuredClone(input.request),
      state: "PREPARED",
      preparedAt: NOW,
      updatedAt: NOW,
      result: null,
      feeEvidence: null,
      cancelRequestedAt: null,
      orderSubmissionPerformed: false,
      lastError: "Exchange outcome lacks an authoritative order ID.",
    };
    return {
      state: "UNCERTAIN_SUBMISSION",
      record: structuredClone(this.owned),
      reasons: [
        "Order intent is durable, but automatic resubmission is forbidden.",
      ],
    };
  }
}

class ConfirmedRejectThenFillGateway {
  calls = 0;
  submissionAuthorities: boolean[] = [];
  idempotencyKeys: string[] = [];
  private readonly owned = new Map<string, CentralLiveOrderGatewayRecord>();

  get(idempotencyKey: string): CentralLiveOrderGatewayRecord | null {
    const record = this.owned.get(idempotencyKey);
    return record ? structuredClone(record) : null;
  }

  async executeOrReconcile(input: {
    readonly request: LiveExecutionRequest;
    readonly idempotencyKey: string;
    readonly allowNewSubmission: boolean;
    readonly now?: number;
  }): Promise<CentralLiveOrderGatewayResponse> {
    this.calls += 1;
    this.submissionAuthorities.push(input.allowNewSubmission);
    this.idempotencyKeys.push(input.idempotencyKey);
    const existing = this.owned.get(input.idempotencyKey);
    if (existing) {
      return {
        state: "READY",
        record: structuredClone(existing),
        reasons: [],
      };
    }

    const record = this.owned.size === 0
      ? confirmedRejectGatewayRecord(input.request, input.idempotencyKey)
      : gatewayRecord(input.request, input.idempotencyKey, "FILLED");
    this.owned.set(input.idempotencyKey, record);
    return {
      state: "READY",
      record: structuredClone(record),
      reasons: record.result?.status === "FAILED"
        ? ["Order has no filled quantity and therefore no fill commission."]
        : [],
    };
  }
}

class FakeResolutions {
  calls = 0;
  evidence: StrategyOneCompensatingOrderEvidence | null = null;

  async resolveCompensatingOrder(
    sessionId: string,
    evidence: StrategyOneCompensatingOrderEvidence,
    resolutionNote: string,
    now = NOW,
  ): Promise<StrategyOneTwoLegRecoveryResolutionRecord> {
    this.calls += 1;
    this.evidence = structuredClone(evidence);
    return {
      schemaVersion: "109.0",
      sessionId,
      status: "RESOLVED",
      basis: "AUTHORITATIVE_COMPENSATING_ORDER_BALANCED",
      evidenceFingerprint: "compensated-fingerprint",
      resolutionNote,
      resolvedAt: now,
      buyFilledQuantity: 138,
      sellFilledQuantity: 138,
      terminalStatuses: ["FILLED", "FAILED", "FILLED"],
      compensatingOrder: structuredClone(evidence),
      automaticOrderActionPerformed: true,
    };
  }
}

function paperEmergencyAccount() {
  return {
    getAccount: () => ({mode: "PAPER", enabled: true, emergencyStop: true}),
  };
}

function boundary(
  previewId = PREVIEW_ID,
  sourceSessionFingerprint = "source-session-fingerprint",
): StrategyOneApprovedResidualExecutionBoundary {
  const approved = preview(
    previewId,
    "OPERATOR_APPROVED_EVIDENCE_ONLY",
    NOW,
    0.03698,
    sourceSessionFingerprint,
  );
  const actionTime = preview(
    `${previewId}-action-time-read-only`,
    "READY_FOR_OPERATOR_REVIEW",
    null,
    0.03701,
    sourceSessionFingerprint,
  );
  return {approvedPreview: approved, actionTimePreview: actionTime};
}

function preview(
  id: string,
  state: StrategyOneResidualRecoveryPreview["state"],
  approvedAt: number | null,
  actionTimePrice: number,
  sourceSessionFingerprint = "source-session-fingerprint",
): StrategyOneResidualRecoveryPreview {
  const estimatedFeeQuote = 138 * actionTimePrice * 0.001;
  const estimatedAdverseMoveLossQuote =
    Math.max(0, 138 * 0.036 - 138 * actionTimePrice);
  return {
    schemaVersion: "142.0",
    id,
    sessionId: "strategy-one:residual-test-session",
    sourceSessionFingerprint,
    state,
    createdAt: NOW,
    expiresAt: NOW + 30_000,
    approvedAt,
    opportunityId: "opportunity-residual-test",
    market: "TUTUSDT",
    buyExchange: "binance",
    sellExchange: "coindcx",
    authoritative: {
      reconciledBeforeAssessment: true,
      bothLegsTerminal: true,
      buyStatus: "FILLED",
      sellStatus: "FAILED",
      buyFilledQuantity: 138,
      sellFilledQuantity: 0,
      buyAverageFillPrice: 0.036,
      sellAverageFillPrice: null,
    },
    residual: {
      direction: "LONG",
      venue: "binance",
      side: "SELL",
      exactQuantity: 138,
      executableQuantity: 138,
      dustQuantity: 0,
      referenceEntryPrice: 0.036,
    },
    executionPreview: {
      selectedTimeInForce: "FOK",
      boundedCancelRequired: false,
      maximumBookAgeMs: 295,
      bookTimestamp: NOW - 10,
      bookAgeMs: 10,
      fillPercent: 100,
      vwapPrice: actionTimePrice,
      limitPrice: actionTimePrice,
      takerFeePercent: 0.1,
      estimatedFeeQuote,
      estimatedAdverseMoveLossQuote,
      estimatedTotalLossQuote:
        estimatedAdverseMoveLossQuote + estimatedFeeQuote,
      maximumAllowedLossQuote: 0.04968,
      balanceAsset: "TUT",
      requiredBalance: 138,
      availableBalance: 506.493,
      balanceAgeMs: 20,
    },
    oneTimeLossAuthorization: null,
    blockers: [],
    requiredApprovalPhrase: state === "READY_FOR_OPERATOR_REVIEW"
      ? `APPROVE RECOVERY PREVIEW ${id}`
      : null,
    safety: {
      authoritativeReadReconciliationOnly: true,
      exactResidualNeverIncreased: true,
      fullDepthRequired: true,
      currentRulesRequired: true,
      freshBalanceRequired: true,
      maximumLossCapRequired: true,
      approvalIsEvidenceOnly: true,
      automaticRetryAllowed: false,
      automaticRecoveryOrderAllowed: false,
      orderSubmissionAllowed: false,
      orderSubmissionPerformed: false,
      transferAllowed: false,
      withdrawalAllowed: false,
    },
  };
}

function gatewayRecord(
  request: LiveExecutionRequest,
  idempotencyKey: string,
  status: "FILLED" | "CANCELLED",
): CentralLiveOrderGatewayRecord {
  const filled = status === "FILLED" ? request.quantity : 0;
  const result = {
    success: status === "FILLED",
    exchange: request.exchange,
    product: "SPOT" as const,
    market: request.market,
    side: request.side,
    orderId: "recovery-order-123",
    clientOrderId: "cat-pro-recovery-client",
    status,
    requestedQuantity: request.quantity,
    filledQuantity: filled,
    remainingQuantity: request.quantity - filled,
    requestedPrice: request.price ?? null,
    averageFillPrice: status === "FILLED" ? 0.03698 : 0,
    feeAmount: status === "FILLED" ? 0.00510324 : 0,
    cancelled: status === "CANCELLED",
    timedOut: false,
    startedAt: NOW,
    completedAt: NOW + 25,
    executionTimeMs: 25,
    failureReason: null,
    reasons: [],
  };

  return {
    version: "76.0",
    id: "central-recovery-order",
    idempotencyKey,
    requestHash: "gateway-request-hash",
    request: structuredClone(request),
    state: "FEE_RECONCILED",
    preparedAt: NOW,
    updatedAt: NOW + 25,
    result,
    feeEvidence: status === "FILLED" ? {
      version: "75.1",
      id: "fee-evidence-recovery",
      exchange: request.exchange,
      product: "SPOT",
      market: request.market,
      orderId: "recovery-order-123",
      generatedAt: NOW + 25,
      expectedFilledQuantity: request.quantity,
      observedFilledQuantity: request.quantity,
      observedQuoteQuantity: request.quantity * 0.03698,
      averageFillPrice: 0.03698,
      fills: [],
      fees: [{asset: "USDT", amount: 0.00510324}],
      withholdings: [],
      quoteAsset: "USDT",
      totalFeeQuoteAmount: 0.00510324,
      totalWithholdingQuoteAmount: 0,
      totalCashDeductionQuoteAmount: 0.00510324,
      withholdingEvidenceComplete: true,
      complete: true,
      blockers: [],
      source: "BINANCE_ACCOUNT_TRADES",
    } : null,
    cancelRequestedAt: null,
    orderSubmissionPerformed: true,
    lastError: null,
  };
}

function confirmedRejectGatewayRecord(
  request: LiveExecutionRequest,
  idempotencyKey: string,
): CentralLiveOrderGatewayRecord {
  return {
    version: "76.0",
    id: "central-recovery-confirmed-reject",
    idempotencyKey,
    requestHash: "confirmed-reject-request-hash",
    request: structuredClone(request),
    state: "FEE_RECONCILED",
    preparedAt: NOW,
    updatedAt: NOW + 25,
    result: {
      success: false,
      exchange: "binance",
      product: "SPOT",
      market: request.market,
      side: request.side,
      orderId: null,
      clientOrderId: "cat-confirmed-reject",
      status: "FAILED",
      requestedQuantity: request.quantity,
      filledQuantity: 0,
      remainingQuantity: request.quantity,
      requestedPrice: request.price ?? null,
      averageFillPrice: 0,
      feeAmount: 0,
      cancelled: false,
      timedOut: false,
      startedAt: NOW,
      completedAt: NOW + 25,
      executionTimeMs: 25,
      failureReason:
        "Binance POST /api/v3/order failed: status=400, code=-1111, message=Parameter 'price' has too much precision.",
      reasons: ["Unable to create or monitor the Binance order."],
    },
    feeEvidence: null,
    cancelRequestedAt: null,
    orderSubmissionPerformed: false,
    lastError: null,
  };
}

void main();
