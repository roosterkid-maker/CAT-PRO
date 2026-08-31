import {createHash} from "node:crypto";
import {resolve} from "node:path";

import {JsonlSnapshotStore} from "../../../core/persistence/JsonlSnapshotStore";
import {tradingAccountService} from "../../../trading/account/TradingAccountService";
import {
  centralLiveOrderExecutionGateway,
  type CentralLiveOrderGatewayRecord,
  type CentralLiveOrderGatewayResponse,
} from "../central/CentralLiveOrderExecutionGateway";
import {parseBinancePreAcceptRejection} from "../central/BinancePreAcceptRejectionEvidence";
import type {LiveExecutionRequest} from "../models/LiveExecutionRequest";
import {
  strategyOneResidualRecoveryAssistantService,
  type StrategyOneApprovedResidualExecutionBoundary,
} from "./StrategyOneResidualRecoveryAssistantService";
import {
  strategyOneTwoLegRecoveryResolutionService,
  type StrategyOneCompensatingOrderEvidence,
  type StrategyOneTwoLegRecoveryResolutionRecord,
} from "./StrategyOneTwoLegRecoveryResolutionService";

export type StrategyOneResidualRecoveryExecutionState =
  | "PREPARED"
  | "SUBMISSION_UNCERTAIN"
  | "FAILED_SAFE"
  | "COMPLETED_RESOLVED";

export interface StrategyOneResidualRecoveryExecutionRecord {
  readonly schemaVersion: "202.0";
  readonly id: string;
  readonly idempotencyKey: string;
  readonly previewId: string;
  readonly sessionId: string;
  readonly sourceSessionFingerprint: string;
  readonly state: StrategyOneResidualRecoveryExecutionState;
  readonly preparedAt: number;
  readonly updatedAt: number;
  readonly previewExpiresAt: number;
  readonly request: LiveExecutionRequest;
  readonly gatewayState: CentralLiveOrderGatewayResponse["state"] | null;
  readonly exchangeOrderId: string | null;
  readonly filledQuantity: number;
  readonly resolution: StrategyOneTwoLegRecoveryResolutionRecord | null;
  readonly reasons: readonly string[];
  readonly automaticRetryAllowed: false;
  readonly automaticCancelAllowed: false;
  readonly automaticTransferAllowed: false;
  readonly liveOrderSubmissionPerformed: boolean;
  /** Present on newly journaled records; legacy records without it are attempt one. */
  readonly attemptNumber?: 1 | 2;
  /** Exact immutable predecessor for the separately authorized second attempt. */
  readonly priorExecutionId?: string | null;
}

export interface StrategyOneConfirmedRejectSecondAttemptEligibility {
  readonly priorExecutionId: string;
  readonly sessionId: string;
  readonly eligible: boolean;
  readonly confirmedExchangeHttpStatus: number | null;
  readonly confirmedExchangeCode: string | null;
  readonly secondAttemptExecutionId: string | null;
  readonly reasons: readonly string[];
}

interface ConfirmedRejectSecondAttemptContext {
  readonly priorExecutionId: string;
}

interface AssistantPort {
  getApprovedExecutionBoundary(
    previewId: string,
    now?: number,
  ): Promise<StrategyOneApprovedResidualExecutionBoundary>;
}

interface GatewayPort {
  get(idempotencyKey: string): CentralLiveOrderGatewayRecord | null;
  executeOrReconcile(input: {
    readonly request: LiveExecutionRequest;
    readonly idempotencyKey: string;
    readonly allowNewSubmission: boolean;
    readonly now?: number;
  }): Promise<CentralLiveOrderGatewayResponse>;
}

interface ResolutionPort {
  resolveCompensatingOrder(
    sessionId: string,
    evidence: StrategyOneCompensatingOrderEvidence,
    resolutionNote: string,
    now?: number,
  ): Promise<StrategyOneTwoLegRecoveryResolutionRecord>;
}

interface AccountPort {
  getAccount(): {
    readonly mode: string;
    readonly enabled: boolean;
    readonly emergencyStop: boolean;
  };
}

interface PersistedSnapshot {
  readonly schemaVersion: "202.0";
  readonly savedAt: number;
  readonly records: readonly StrategyOneResidualRecoveryExecutionRecord[];
}

const DEFAULT_FILE = resolve(
  process.cwd(),
  "logs",
  "live",
  "strategy-one-residual-recovery-execution.jsonl",
);

/**
 * One-time, explicit residual-recovery execution owner.
 *
 * A preview must already be evidence-only approved. Action-time evidence is
 * revalidated before this service journals an exact FOK limit request. The
 * central gateway remains the only exchange submission owner and supplies a
 * stable idempotency key, so an uncertain outcome can only be read-reconciled;
 * it is never retried, replaced, cancelled, transferred or unwound here.
 */
export class StrategyOneResidualRecoveryExecutionService {
  private readonly store: JsonlSnapshotStore<PersistedSnapshot>;
  private readonly records =
    new Map<string, StrategyOneResidualRecoveryExecutionRecord>();
  private readonly inFlight =
    new Map<string, Promise<StrategyOneResidualRecoveryExecutionRecord>>();

  constructor(
    private readonly assistant: AssistantPort =
      strategyOneResidualRecoveryAssistantService,
    private readonly gateway: GatewayPort = centralLiveOrderExecutionGateway,
    private readonly resolutions: ResolutionPort =
      strategyOneTwoLegRecoveryResolutionService,
    private readonly account: AccountPort = tradingAccountService,
    filePath = DEFAULT_FILE,
  ) {
    this.store = new JsonlSnapshotStore({
      filePath,
      isPayload: isSnapshot,
    });

    const latest = this.store.readAll().at(-1);

    for (const record of latest?.records ?? []) {
      this.records.set(record.idempotencyKey, freeze(clone(record)));
    }
  }

  execute(
    previewIdValue: string,
    confirmationValue: string,
    resolutionNoteValue: string,
    now = Date.now(),
  ): Promise<StrategyOneResidualRecoveryExecutionRecord> {
    validateTime(now);
    const previewId = requireIdentifier(previewIdValue, "preview");
    const confirmation = confirmationValue.trim();
    const resolutionNote = requireText(resolutionNoteValue, "resolutionNote");

    if (confirmation !== requiredExecutionPhrase(previewId)) {
      throw new Error(
        `Exact one-time residual recovery phrase is required: ${requiredExecutionPhrase(previewId)}`,
      );
    }

    const active = this.inFlight.get(previewId);

    if (active) {
      return active;
    }

    const work = this.executeInternal(
      previewId,
      resolutionNote,
      now,
    ).finally(() => {
      this.inFlight.delete(previewId);
    });

    this.inFlight.set(previewId, work);
    return work;
  }

  executeConfirmedRejectSecondAttempt(
    priorExecutionIdValue: string,
    previewIdValue: string,
    confirmationValue: string,
    resolutionNoteValue: string,
    now = Date.now(),
  ): Promise<StrategyOneResidualRecoveryExecutionRecord> {
    validateTime(now);
    const priorExecutionId = requireIdentifier(
      priorExecutionIdValue,
      "prior execution",
    );
    const previewId = requireIdentifier(previewIdValue, "preview");
    const resolutionNote = requireText(resolutionNoteValue, "resolutionNote");
    const required = requiredSecondAttemptPhrase(priorExecutionId, previewId);

    if (confirmationValue.trim() !== required) {
      throw new Error(
        `Exact confirmed-reject second-attempt phrase is required: ${required}`,
      );
    }

    const priorLockKey = confirmedRejectSecondAttemptLockKey(priorExecutionId);
    const active = this.inFlight.get(previewId) ??
      this.inFlight.get(priorLockKey);

    if (active) {
      return active;
    }

    const work = this.executeInternal(
      previewId,
      resolutionNote,
      now,
      {priorExecutionId},
    ).finally(() => {
      this.inFlight.delete(previewId);
      this.inFlight.delete(priorLockKey);
    });

    this.inFlight.set(previewId, work);
    this.inFlight.set(priorLockKey, work);
    return work;
  }

  getDiagnostics(now = Date.now()) {
    validateTime(now);
    const records = [...this.records.values()]
      .sort((first, second) => second.updatedAt - first.updatedAt)
      .map(clone);

    return freeze({
      schemaVersion: "202.0" as const,
      generatedAt: now,
      records,
      confirmedRejectSecondAttempts: records.map((record) =>
        this.getSecondAttemptEligibilityFor(record)),
      summary: {
        total: records.length,
        prepared: records.filter((record) => record.state === "PREPARED").length,
        uncertain: records.filter((record) =>
          record.state === "SUBMISSION_UNCERTAIN").length,
        failedSafe: records.filter((record) =>
          record.state === "FAILED_SAFE").length,
        completedResolved: records.filter((record) =>
          record.state === "COMPLETED_RESOLVED").length,
        inFlight: new Set(this.inFlight.values()).size,
      },
      persistence: this.store.getDiagnostics(),
      safety: safety(),
    });
  }

  private getSecondAttemptEligibilityFor(
    prior: StrategyOneResidualRecoveryExecutionRecord,
  ): StrategyOneConfirmedRejectSecondAttemptEligibility {
    const reasons: string[] = [];
    const attemptNumber = prior.attemptNumber ?? 1;
    const secondAttempt = [...this.records.values()].find(
      (record) => record.priorExecutionId === prior.id,
    ) ?? null;
    const secondAttemptGatewayRecord = secondAttempt
      ? this.gateway.get(secondAttempt.idempotencyKey)
      : null;
    const reusablePreparedSecondAttempt = Boolean(
      secondAttempt &&
      secondAttempt.state === "PREPARED" &&
      !secondAttempt.liveOrderSubmissionPerformed &&
      secondAttemptGatewayRecord === null,
    );
    const gatewayRecord = this.gateway.get(prior.idempotencyKey);
    const rejection = confirmedPreAcceptBinanceRejection(
      prior,
      gatewayRecord,
    );

    if (attemptNumber !== 1) {
      reasons.push("Only the original recovery execution can authorize one second attempt.");
    }
    if (secondAttempt && !reusablePreparedSecondAttempt) {
      reasons.push("A confirmed-reject second attempt is already durably journaled.");
    }
    reasons.push(...rejection.reasons);

    return freeze({
      priorExecutionId: prior.id,
      sessionId: prior.sessionId,
      eligible: reasons.length === 0,
      confirmedExchangeHttpStatus: rejection.httpStatus,
      confirmedExchangeCode: rejection.exchangeCode,
      secondAttemptExecutionId: secondAttempt?.id ?? null,
      reasons: unique(reasons),
    });
  }

  private async executeInternal(
    previewId: string,
    resolutionNote: string,
    now: number,
    secondAttempt: ConfirmedRejectSecondAttemptContext | null = null,
  ): Promise<StrategyOneResidualRecoveryExecutionRecord> {
    const previewRecord = [...this.records.values()].find(
      (record) => record.previewId === previewId,
    );

    const prior = secondAttempt
      ? [...this.records.values()].find(
        (record) => record.id === secondAttempt.priorExecutionId,
      ) ?? null
      : null;

    if (secondAttempt && !prior) {
      throw new Error("Confirmed-reject prior recovery execution is unavailable.");
    }

    if (
      secondAttempt &&
      previewRecord &&
      (
        previewRecord.priorExecutionId !== secondAttempt.priorExecutionId ||
        (previewRecord.attemptNumber ?? 1) !== 2
      )
    ) {
      throw new Error(
        "The approved preview is already owned by a different recovery execution.",
      );
    }

    if (previewRecord?.state === "COMPLETED_RESOLVED") {
      return clone(previewRecord);
    }

    if (secondAttempt && !previewRecord) {
      const eligibility = this.getSecondAttemptEligibilityFor(
        prior as StrategyOneResidualRecoveryExecutionRecord,
      );
      if (!eligibility.eligible) {
        throw new Error(
          `Confirmed-reject second attempt is blocked: ${eligibility.reasons.join(" | ")}`,
        );
      }
    }

    const account = this.account.getAccount();

    if (!account.enabled || account.mode !== "PAPER" || !account.emergencyStop) {
      throw new Error(
        "One-time residual recovery requires an enabled PAPER account with the emergency stop active.",
      );
    }

    const ownedGatewayRecord = previewRecord
      ? this.gateway.get(previewRecord.idempotencyKey)
      : null;
    const boundary = ownedGatewayRecord
      ? null
      : await this.assistant.getApprovedExecutionBoundary(previewId, now);
    const approved = boundary?.approvedPreview ?? null;

    if (!previewRecord && !boundary) {
      throw new Error("Recovery execution ownership is internally inconsistent.");
    }

    const request = previewRecord?.request ?? requestFrom(
      boundary as StrategyOneApprovedResidualExecutionBoundary,
    );
    const idempotencyKey = previewRecord?.idempotencyKey ?? (
      secondAttempt
        ? secondAttemptIdempotencyKey(
          (prior as StrategyOneResidualRecoveryExecutionRecord).idempotencyKey,
        )
        : recoveryIdempotencyKey(
          approved?.sessionId ?? "",
          approved?.sourceSessionFingerprint ?? "",
        )
    );

    if (secondAttempt && !previewRecord) {
      assertSecondAttemptIntent(
        prior as StrategyOneResidualRecoveryExecutionRecord,
        boundary as StrategyOneApprovedResidualExecutionBoundary,
        request,
      );
    }
    let existing = this.records.get(idempotencyKey);

    if (existing?.state === "COMPLETED_RESOLVED") {
      return clone(existing);
    }

    const existingGatewayRecord = this.gateway.get(idempotencyKey);

    if (
      existing &&
      !existingGatewayRecord &&
      !existing.liveOrderSubmissionPerformed &&
      boundary
    ) {
      existing = this.persist({
        ...existing,
        previewId,
        sourceSessionFingerprint:
          boundary.approvedPreview.sourceSessionFingerprint,
        state: "PREPARED",
        updatedAt: boundary.actionTimePreview.createdAt,
        previewExpiresAt: boundary.approvedPreview.expiresAt,
        request: clone(request),
        reasons: unique([
          ...existing.reasons,
          "A fresh explicit preview replaced a pre-gateway journal; no central order ownership or exchange I/O existed.",
        ]),
      });
    }

    if (
      existing &&
      (existingGatewayRecord || existing.liveOrderSubmissionPerformed) &&
      requestHash(existing.request) !== requestHash(request)
    ) {
      throw new Error(
        "One-time residual recovery terms changed after journaling; automatic replacement is forbidden.",
      );
    }

    let record = existing ?? this.prepare({
      previewId,
      sessionId: approved?.sessionId ?? "",
      sourceSessionFingerprint: approved?.sourceSessionFingerprint ?? "",
      previewExpiresAt: approved?.expiresAt ?? 0,
      request,
      idempotencyKey,
      now,
      attemptNumber: secondAttempt ? 2 : 1,
      priorExecutionId: secondAttempt?.priorExecutionId ?? null,
    });
    const gatewayRecord = ownedGatewayRecord ?? this.gateway.get(idempotencyKey);

    const executionBoundaryAt = boundary?.actionTimePreview.createdAt ??
      Math.max(now, Date.now());

    if (!gatewayRecord && record.previewExpiresAt <= executionBoundaryAt) {
      throw new Error(
        "The journaled recovery preview expired before gateway ownership; no order was submitted.",
      );
    }

    let response: CentralLiveOrderGatewayResponse;

    try {
      response = await this.gateway.executeOrReconcile({
        request: record.request,
        idempotencyKey,
        allowNewSubmission: gatewayRecord === null,
        now,
      });
    } catch (error: unknown) {
      record = this.persist({
        ...record,
        state: "SUBMISSION_UNCERTAIN",
        updatedAt: Math.max(now, Date.now()),
        reasons: unique([
          ...record.reasons,
          `Central recovery gateway failure: ${message(error)}`,
        ]),
        liveOrderSubmissionPerformed:
          record.liveOrderSubmissionPerformed || this.gateway.get(idempotencyKey) !== null,
      });
      return clone(record);
    }

    const completedAt = Math.max(now, Date.now());
    const result = response.record?.result ?? null;
    const feeEvidence = response.record?.feeEvidence ?? null;
    const base = {
      ...record,
      updatedAt: completedAt,
      gatewayState: response.state,
      exchangeOrderId: result?.orderId ?? record.exchangeOrderId,
      filledQuantity: result?.filledQuantity ?? record.filledQuantity,
      reasons: unique([...record.reasons, ...response.reasons]),
      liveOrderSubmissionPerformed:
        record.liveOrderSubmissionPerformed ||
        Boolean(response.record?.orderSubmissionPerformed),
    };

    if (!exactFilledResult(response, record.request) || !feeEvidence?.complete) {
      const uncertain =
        response.state === "UNCERTAIN_SUBMISSION" ||
        response.state === "OPEN" ||
        response.state === "EVIDENCE_INCOMPLETE";

      record = this.persist({
        ...base,
        state: uncertain ? "SUBMISSION_UNCERTAIN" : "FAILED_SAFE",
        resolution: null,
        reasons: unique([
          ...base.reasons,
          feeEvidence && !feeEvidence.complete
            ? `Recovery fee evidence incomplete: ${feeEvidence.blockers.join(" | ")}`
            : "Recovery order lacks exact terminal FILLED quantity evidence.",
        ]),
      });
      return clone(record);
    }

    const authoritativeResult = response.record?.result;

    if (!authoritativeResult?.orderId) {
      throw new Error("Filled recovery order lacks an authoritative exchange order ID.");
    }

    const resolution = await this.resolutions.resolveCompensatingOrder(
      record.sessionId,
      {
        exchange: authoritativeResult.exchange,
        market: authoritativeResult.market,
        side: authoritativeResult.side,
        orderId: authoritativeResult.orderId,
        clientOrderId: authoritativeResult.clientOrderId,
        status: "FILLED",
        requestedQuantity: authoritativeResult.requestedQuantity,
        filledQuantity: authoritativeResult.filledQuantity,
        remainingQuantity: 0,
        averageFillPrice: authoritativeResult.averageFillPrice,
        feeEvidenceId: feeEvidence.id,
        completedAt: authoritativeResult.completedAt,
      },
      resolutionNote,
      completedAt,
    );

    record = this.persist({
      ...base,
      state: "COMPLETED_RESOLVED",
      resolution,
      reasons: unique([
        ...base.reasons,
        "Exact compensating fill and fee evidence durably resolved the original residual.",
      ]),
    });
    return clone(record);
  }

  private prepare(input: {
    readonly previewId: string;
    readonly sessionId: string;
    readonly sourceSessionFingerprint: string;
    readonly previewExpiresAt: number;
    readonly request: LiveExecutionRequest;
    readonly idempotencyKey: string;
    readonly now: number;
    readonly attemptNumber: 1 | 2;
    readonly priorExecutionId: string | null;
  }): StrategyOneResidualRecoveryExecutionRecord {
    const record = freeze({
      schemaVersion: "202.0" as const,
      id: `strategy-one-residual-execution:${createHash("sha256")
        .update(input.idempotencyKey)
        .digest("hex")}`,
      idempotencyKey: input.idempotencyKey,
      previewId: input.previewId,
      sessionId: input.sessionId,
      sourceSessionFingerprint: input.sourceSessionFingerprint,
      state: "PREPARED" as const,
      preparedAt: input.now,
      updatedAt: input.now,
      previewExpiresAt: input.previewExpiresAt,
      request: clone(input.request),
      gatewayState: null,
      exchangeOrderId: null,
      filledQuantity: 0,
      resolution: null,
      reasons: [
        "Exact recovery request was durably journaled before central gateway I/O.",
      ],
      automaticRetryAllowed: false as const,
      automaticCancelAllowed: false as const,
      automaticTransferAllowed: false as const,
      liveOrderSubmissionPerformed: false,
      attemptNumber: input.attemptNumber,
      priorExecutionId: input.priorExecutionId,
    });

    return this.persist(record);
  }

  private persist(
    record: StrategyOneResidualRecoveryExecutionRecord,
  ): StrategyOneResidualRecoveryExecutionRecord {
    const frozen = freeze(clone(record));
    this.records.set(frozen.idempotencyKey, frozen);
    this.store.append({
      schemaVersion: "202.0",
      savedAt: frozen.updatedAt,
      records: [...this.records.values()].map(clone),
    });
    return clone(frozen);
  }
}

function requestFrom(
  boundary: StrategyOneApprovedResidualExecutionBoundary,
): LiveExecutionRequest {
  const preview = boundary.actionTimePreview;
  const venue = preview.residual.venue;
  const side = preview.residual.side;
  const quantity = preview.residual.executableQuantity;
  const price = preview.executionPreview.limitPrice;
  const timeInForce = preview.executionPreview.selectedTimeInForce;

  if (
    !venue ||
    (side !== "BUY" && side !== "SELL") ||
    quantity === null ||
    quantity <= 0 ||
    price === null ||
    price <= 0 ||
    timeInForce !== "FOK"
  ) {
    throw new Error(
      "One-time recovery requires an exact positive FOK limit execution preview.",
    );
  }

  return freeze({
    exchange: venue,
    product: "SPOT" as const,
    market: preview.market,
    side: side.toLowerCase() as "buy" | "sell",
    orderType: "limit" as const,
    timeInForce,
    quantity,
    price,
    timeoutMs: 1_000,
    pollingIntervalMs: 100,
    cancelOnTimeout: false,
  });
}

function exactFilledResult(
  response: CentralLiveOrderGatewayResponse,
  request: LiveExecutionRequest,
): boolean {
  const result = response.record?.result;
  const tolerance = Math.max(1e-12, request.quantity * 1e-9);

  return response.state === "READY" &&
    response.record?.state === "FEE_RECONCILED" &&
    Boolean(result) &&
    result?.status === "FILLED" &&
    result.orderId !== null &&
    normalizeExchange(result.exchange) === normalizeExchange(request.exchange) &&
    normalizeMarket(result.market) === normalizeMarket(request.market) &&
    result.side === request.side &&
    Math.abs(result.requestedQuantity - request.quantity) <= tolerance &&
    Math.abs(result.filledQuantity - request.quantity) <= tolerance &&
    result.remainingQuantity === 0 &&
    result.averageFillPrice > 0;
}

function recoveryIdempotencyKey(
  sessionId: string,
  sourceSessionFingerprint: string,
): string {
  return `strategy-one:residual-recovery:${createHash("sha256")
    .update(`${sessionId}:${sourceSessionFingerprint}`)
    .digest("hex")}`;
}

function secondAttemptIdempotencyKey(
  priorIdempotencyKey: string,
): string {
  return `strategy-one:residual-recovery-second-attempt:${createHash("sha256")
    .update(`${priorIdempotencyKey}:attempt:2`)
    .digest("hex")}`;
}

function confirmedRejectSecondAttemptLockKey(
  priorExecutionId: string,
): string {
  return `confirmed-reject-second-attempt:${priorExecutionId}`;
}

function requiredExecutionPhrase(previewId: string): string {
  return `EXECUTE ONE-TIME RECOVERY ${previewId}`;
}

function requiredSecondAttemptPhrase(
  priorExecutionId: string,
  previewId: string,
): string {
  return `EXECUTE CONFIRMED-REJECT SECOND ATTEMPT ${priorExecutionId} ${previewId}`;
}

function assertSecondAttemptIntent(
  prior: StrategyOneResidualRecoveryExecutionRecord,
  boundary: StrategyOneApprovedResidualExecutionBoundary,
  current: LiveExecutionRequest,
): void {
  const approved = boundary.approvedPreview;
  const tolerance = Math.max(1e-12, prior.request.quantity * 1e-9);
  const sameLineage =
    prior.sessionId === approved.sessionId &&
    prior.sourceSessionFingerprint === approved.sourceSessionFingerprint;
  const sameIntent =
    normalizeExchange(prior.request.exchange) === normalizeExchange(current.exchange) &&
    normalizeMarket(prior.request.market) === normalizeMarket(current.market) &&
    prior.request.side === current.side &&
    prior.request.orderType === "limit" &&
    current.orderType === "limit" &&
    prior.request.timeInForce === "FOK" &&
    current.timeInForce === "FOK" &&
    Math.abs(prior.request.quantity - current.quantity) <= tolerance &&
    (prior.request.product ?? "SPOT") === "SPOT" &&
    (current.product ?? "SPOT") === "SPOT";

  if (!sameLineage || !sameIntent) {
    throw new Error(
      "Confirmed-reject second attempt requires unchanged session lineage, venue, market, side, exact quantity and FOK semantics.",
    );
  }
}

function confirmedPreAcceptBinanceRejection(
  execution: StrategyOneResidualRecoveryExecutionRecord,
  gateway: CentralLiveOrderGatewayRecord | null,
): {
  readonly httpStatus: number | null;
  readonly exchangeCode: string | null;
  readonly reasons: readonly string[];
} {
  const reasons: string[] = [];
  const result = gateway?.result ?? null;
  const parsed = parseBinancePreAcceptRejection(result?.failureReason ?? null);
  const tolerance = Math.max(1e-12, execution.request.quantity * 1e-9);

  if (execution.state !== "FAILED_SAFE") {
    reasons.push("Prior recovery execution is not durably FAILED_SAFE.");
  }
  if (
    execution.liveOrderSubmissionPerformed ||
    execution.exchangeOrderId !== null ||
    execution.filledQuantity !== 0
  ) {
    reasons.push("Prior execution has submission, order-ID or fill evidence.");
  }
  if (!gateway) {
    reasons.push("Central gateway evidence for the prior execution is missing.");
  } else {
    if (
      gateway.idempotencyKey !== execution.idempotencyKey ||
      gateway.state !== "FEE_RECONCILED" ||
      gateway.orderSubmissionPerformed ||
      gateway.lastError !== null ||
      !sameExactRecoveryRequest(gateway.request, execution.request)
    ) {
      reasons.push("Central gateway does not prove a clean terminal pre-accept rejection.");
    }
    if (
      !result ||
      result.success ||
      result.status !== "FAILED" ||
      result.orderId !== null ||
      result.filledQuantity !== 0 ||
      Math.abs(result.requestedQuantity - execution.request.quantity) > tolerance ||
      Math.abs(result.remainingQuantity - execution.request.quantity) > tolerance ||
      result.requestedPrice === null ||
      execution.request.price === undefined ||
      Math.abs(result.requestedPrice - execution.request.price) >
        Math.max(1e-12, execution.request.price * 1e-9) ||
      result.cancelled ||
      result.timedOut ||
      result.feeAmount !== 0 ||
      normalizeExchange(result.exchange) !== "binance" ||
      normalizeMarket(result.market) !== normalizeMarket(execution.request.market) ||
      result.side !== execution.request.side
    ) {
      reasons.push("Gateway result is not an exact zero-fill, non-timeout Binance FAILED result.");
    }
  }
  if (!parsed) {
    reasons.push("A deterministic Binance HTTP 4xx order rejection code is required.");
  }

  return {
    httpStatus: parsed?.httpStatus ?? null,
    exchangeCode: parsed?.exchangeCode ?? null,
    reasons: unique(reasons),
  };
}

function sameExactRecoveryRequest(
  first: LiveExecutionRequest,
  second: LiveExecutionRequest,
): boolean {
  const quantityTolerance = Math.max(1e-12, second.quantity * 1e-9);
  const firstPrice = first.price ?? null;
  const secondPrice = second.price ?? null;
  const priceTolerance = Math.max(1e-12, (secondPrice ?? 0) * 1e-9);

  return normalizeExchange(first.exchange) === normalizeExchange(second.exchange) &&
    normalizeMarket(first.market) === normalizeMarket(second.market) &&
    first.side === second.side &&
    first.orderType === second.orderType &&
    first.timeInForce === second.timeInForce &&
    (first.product ?? "SPOT") === (second.product ?? "SPOT") &&
    Math.abs(first.quantity - second.quantity) <= quantityTolerance &&
    firstPrice !== null &&
    secondPrice !== null &&
    Math.abs(firstPrice - secondPrice) <= priceTolerance;
}

function requestHash(request: LiveExecutionRequest): string {
  return createHash("sha256")
    .update(JSON.stringify(request))
    .digest("hex");
}

function safety() {
  return freeze({
    emergencyStopRequired: true as const,
    paperModeRequired: true as const,
    explicitlyApprovedPreviewRequired: true as const,
    actionTimeRevalidationRequired: true as const,
    exactFokLimitOnly: true as const,
    journalBeforeIo: true as const,
    stableSessionIdempotency: true as const,
    confirmedRejectSecondAttemptRequiresFreshApproval: true as const,
    confirmedRejectSecondAttemptMaximumCount: 1 as const,
    uncertainOrAcceptedSecondAttemptAllowed: false as const,
    automaticRetryAllowed: false as const,
    automaticCancelAllowed: false as const,
    automaticTransferAllowed: false as const,
    automaticWithdrawalAllowed: false as const,
    authoritativeFillFeeResolutionRequired: true as const,
  });
}

function isSnapshot(value: unknown): value is PersistedSnapshot {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const snapshot = value as Partial<PersistedSnapshot>;
  return snapshot.schemaVersion === "202.0" &&
    Number.isSafeInteger(snapshot.savedAt) &&
    Array.isArray(snapshot.records) &&
    snapshot.records.every((record) =>
      typeof record === "object" &&
      record !== null &&
      (record as Partial<StrategyOneResidualRecoveryExecutionRecord>)
        .schemaVersion === "202.0");
}

function requireIdentifier(value: string, label: string): string {
  const normalized = value.trim();

  if (!/^[A-Za-z0-9_.:/-]{8,240}$/u.test(normalized)) {
    throw new Error(`Strategy #1 recovery ${label} identity is invalid.`);
  }

  return normalized;
}

function requireText(value: string, label: string): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(`${label} is required.`);
  }

  return normalized;
}

function validateTime(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("Strategy #1 residual recovery execution timestamp is invalid.");
  }
}

function normalizeExchange(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeMarket(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/gu, "");
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown recovery execution failure.";
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function freeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }

  for (const child of Object.values(value)) {
    freeze(child);
  }

  return Object.freeze(value);
}

export const strategyOneResidualRecoveryExecutionService =
  new StrategyOneResidualRecoveryExecutionService();
