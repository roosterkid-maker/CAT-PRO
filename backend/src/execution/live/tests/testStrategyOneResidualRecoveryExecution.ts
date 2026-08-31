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

  const cancelledGateway = new FakeGateway("CANCELLED");
  const cancelledResolution = new FakeResolutions();
  const cancelledFile = resolve(
    tmpdir(),
    "cat-pro-test-residual-recovery-cancelled.jsonl",
  );
  rmSync(cancelledFile, {force: true});
  const cancelled = await new StrategyOneResidualRecoveryExecutionService(
    new FakeAssistant(boundary("recovery-preview-cancelled")),
    cancelledGateway,
    cancelledResolution,
    paperEmergencyAccount(),
    cancelledFile,
  ).execute(
    "recovery-preview-cancelled",
    "EXECUTE ONE-TIME RECOVERY recovery-preview-cancelled",
    "Cancelled FOK remains unresolved.",
    NOW,
  );

  assert.equal(cancelled.state, "FAILED_SAFE");
  assert.equal(cancelled.filledQuantity, 0);
  assert.equal(cancelledResolution.calls, 0);
  assert.equal(cancelled.automaticRetryAllowed, false);

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
  console.log(
    "V202 one-time residual recovery execution test passed: exact approved FOK request journaled once, authoritative fill-fee evidence resolved exposure, and cancelled/account-unsafe paths failed closed without retry.",
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
): StrategyOneApprovedResidualExecutionBoundary {
  const approved = preview(
    previewId,
    "OPERATOR_APPROVED_EVIDENCE_ONLY",
    NOW,
    0.03698,
  );
  const actionTime = preview(
    `${previewId}-action-time-read-only`,
    "READY_FOR_OPERATOR_REVIEW",
    null,
    0.03701,
  );
  return {approvedPreview: approved, actionTimePreview: actionTime};
}

function preview(
  id: string,
  state: StrategyOneResidualRecoveryPreview["state"],
  approvedAt: number | null,
  actionTimePrice: number,
): StrategyOneResidualRecoveryPreview {
  const estimatedFeeQuote = 138 * actionTimePrice * 0.001;
  const estimatedAdverseMoveLossQuote =
    Math.max(0, 138 * 0.036 - 138 * actionTimePrice);
  return {
    schemaVersion: "142.0",
    id,
    sessionId: "strategy-one:residual-test-session",
    sourceSessionFingerprint: "source-session-fingerprint",
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

void main();
