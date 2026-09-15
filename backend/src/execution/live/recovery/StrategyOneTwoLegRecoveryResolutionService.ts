import {
  createHash,
} from "node:crypto";

import {
  resolve,
} from "node:path";

import {
  JsonlSnapshotStore,
} from "../../../core/persistence/JsonlSnapshotStore";

import {
  strategyOneTwoLegLiveExecutionService,
  type StrategyOneTwoLegSessionRecord,
} from "../arbitrage/StrategyOneTwoLegLiveExecutionService";

export interface StrategyOneTwoLegRecoveryResolutionRecord {
  readonly schemaVersion: "109.0";
  readonly sessionId: string;
  readonly status: "RESOLVED";
  readonly basis:
    | "PERSISTED_PRE_DISPATCH_NO_ORDER"
    | "AUTHORITATIVE_TERMINAL_BALANCED"
    | "AUTHORITATIVE_COMPENSATING_ORDER_BALANCED"
    | "AUTHORITATIVE_PRE_EXISTING_INVENTORY_COVERED";
  readonly evidenceFingerprint: string;
  readonly resolutionNote: string;
  readonly resolvedAt: number;
  readonly buyFilledQuantity: number;
  readonly sellFilledQuantity: number;
  readonly terminalStatuses: readonly string[];
  readonly compensatingOrder?: StrategyOneCompensatingOrderEvidence | null;
  readonly balanceEvidence?: StrategyOneAuthoritativeBalanceEvidence | null;
  readonly automaticOrderActionPerformed: boolean;
}

export interface StrategyOneCompensatingOrderEvidence {
  readonly exchange: string;
  readonly market: string;
  readonly side: "buy" | "sell";
  readonly orderId: string;
  readonly clientOrderId: string | null;
  readonly status: "FILLED";
  readonly requestedQuantity: number;
  readonly filledQuantity: number;
  readonly remainingQuantity: 0;
  readonly averageFillPrice: number;
  readonly feeEvidenceId: string;
  readonly completedAt: number;
}

/**
 * A live, authoritative (freshly signed-request) account balance check for
 * the asset left over by a session where one leg genuinely FILLED (spot,
 * never PERPETUAL) and the other leg terminated with zero fill. Proves the
 * filled leg's economic residual was absorbed by inventory the account
 * already held - not a naked/borrowed short - because a real spot exchange
 * cannot fill a sell order from balance the account does not have.
 */
export interface StrategyOneAuthoritativeBalanceEvidence {
  readonly exchange: string;
  readonly asset: string;
  readonly availableBalance: number;
  readonly borrowedAmount: number;
  readonly queriedAt: number;
  readonly evidenceSource: string;
}

interface PairPort {
  getSession(sessionId: string): StrategyOneTwoLegSessionRecord | null;
  reconcileSession(
    sessionId: string,
    now?: number,
  ): ReturnType<typeof strategyOneTwoLegLiveExecutionService.reconcileSession>;
}

const DEFAULT_FILE =
  resolve(
    process.cwd(),
    "logs",
    "live",
    "strategy-one-two-leg-recovery-resolutions.jsonl",
  );

/**
 * Explicit, evidence-bound resolution owner for V108 pair sessions. The only
 * network action it may trigger is idempotent status reconciliation through
 * the pair owner with allowNewSubmission=false.
 */
export class StrategyOneTwoLegRecoveryResolutionService {
  private readonly store:
    JsonlSnapshotStore<StrategyOneTwoLegRecoveryResolutionRecord>;
  private readonly latest =
    new Map<string, StrategyOneTwoLegRecoveryResolutionRecord>();
  // Shared by resolveSession() and resolveCompensatingOrder() so the two
  // entry points can never race each other for the same session - without
  // this, two concurrent resolution attempts (e.g. an operator retry
  // overlapping an in-progress residual-recovery compensating order) could
  // each independently validate and persist() for the same sessionId.
  private readonly inFlight =
    new Map<string, Promise<StrategyOneTwoLegRecoveryResolutionRecord>>();

  constructor(
    private readonly pairs: PairPort = strategyOneTwoLegLiveExecutionService,
    filePath = DEFAULT_FILE,
  ) {
    this.store =
      new JsonlSnapshotStore({
        filePath,
        isPayload: isResolution,
      });

    for (const record of this.store.readAll()) {
      const current = this.latest.get(record.sessionId);

      if (!current || record.resolvedAt >= current.resolvedAt) {
        this.latest.set(record.sessionId, freeze(clone(record)));
      }
    }
  }

  resolveSession(
    sessionIdValue: string,
    resolutionNoteValue: string,
    now = Date.now(),
  ): Promise<StrategyOneTwoLegRecoveryResolutionRecord> {
    const sessionId = requireText(sessionIdValue, "sessionId");
    const resolutionNote = requireText(resolutionNoteValue, "resolutionNote");
    validateTime(now);

    const active = this.inFlight.get(sessionId);

    if (active) {
      return active;
    }

    const work = this.resolveSessionInternal(
      sessionId,
      resolutionNote,
      now,
    ).finally(() => {
      this.inFlight.delete(sessionId);
    });

    this.inFlight.set(sessionId, work);
    return work;
  }

  private async resolveSessionInternal(
    sessionId: string,
    resolutionNote: string,
    now: number,
  ): Promise<StrategyOneTwoLegRecoveryResolutionRecord> {
    const existing = this.pairs.getSession(sessionId);

    if (!existing) {
      throw new Error("No persisted Strategy #1 two-leg session exists.");
    }

    if (
      existing.state === "PREPARED" &&
      existing.buyDispatchedAt === null &&
      existing.sellDispatchedAt === null &&
      existing.buyResponse === null &&
      existing.sellResponse === null
    ) {
      return this.persist({
        session: existing,
        basis: "PERSISTED_PRE_DISPATCH_NO_ORDER",
        resolutionNote,
        resolvedAt: now,
        buyFilledQuantity: 0,
        sellFilledQuantity: 0,
        terminalStatuses: [],
      });
    }

    const reconciled =
      await this.pairs.reconcileSession(sessionId, now);
    const session = reconciled.session;
    const terminal = terminalBalancedEvidence(session);

    if (!terminal) {
      throw new Error(
        "Strategy #1 recovery remains unresolved: both exchange legs must have authoritative terminal, quantity-balanced evidence.",
      );
    }

    return this.persist({
      session,
      basis: "AUTHORITATIVE_TERMINAL_BALANCED",
      resolutionNote,
      resolvedAt: now,
      ...terminal,
    });
  }

  resolveCompensatingOrder(
    sessionIdValue: string,
    evidenceValue: StrategyOneCompensatingOrderEvidence,
    resolutionNoteValue: string,
    now = Date.now(),
  ): Promise<StrategyOneTwoLegRecoveryResolutionRecord> {
    const sessionId = requireText(sessionIdValue, "sessionId");
    const resolutionNote = requireText(resolutionNoteValue, "resolutionNote");
    validateTime(now);
    const evidence = validateCompensatingEvidence(evidenceValue);

    const active = this.inFlight.get(sessionId);

    if (active) {
      return active;
    }

    const work = this.resolveCompensatingOrderInternal(
      sessionId,
      evidence,
      resolutionNote,
      now,
    ).finally(() => {
      this.inFlight.delete(sessionId);
    });

    this.inFlight.set(sessionId, work);
    return work;
  }

  private async resolveCompensatingOrderInternal(
    sessionId: string,
    evidence: StrategyOneCompensatingOrderEvidence,
    resolutionNote: string,
    now: number,
  ): Promise<StrategyOneTwoLegRecoveryResolutionRecord> {
    const existing = this.pairs.getSession(sessionId);

    if (!existing) {
      throw new Error("No persisted Strategy #1 two-leg session exists.");
    }

    const reconciled = await this.pairs.reconcileSession(sessionId, now);
    const session = reconciled.session;
    const compensated = compensatedTerminalEvidence(session, evidence);

    if (!compensated) {
      throw new Error(
        "Strategy #1 compensating recovery remains unresolved: terminal original legs and one exact authoritative opposite-side fill are required.",
      );
    }

    return this.persist({
      session,
      basis: "AUTHORITATIVE_COMPENSATING_ORDER_BALANCED",
      resolutionNote,
      resolvedAt: now,
      compensatingOrder: evidence,
      ...compensated,
    });
  }

  resolveByPreExistingInventoryCoverage(
    sessionIdValue: string,
    balanceEvidenceValue: StrategyOneAuthoritativeBalanceEvidence,
    resolutionNoteValue: string,
    now = Date.now(),
  ): Promise<StrategyOneTwoLegRecoveryResolutionRecord> {
    const sessionId = requireText(sessionIdValue, "sessionId");
    const resolutionNote = requireText(resolutionNoteValue, "resolutionNote");
    validateTime(now);
    const balanceEvidence = validateBalanceEvidence(balanceEvidenceValue, now);

    const active = this.inFlight.get(sessionId);

    if (active) {
      return active;
    }

    const work = this.resolveByPreExistingInventoryCoverageInternal(
      sessionId,
      balanceEvidence,
      resolutionNote,
      now,
    ).finally(() => {
      this.inFlight.delete(sessionId);
    });

    this.inFlight.set(sessionId, work);
    return work;
  }

  private async resolveByPreExistingInventoryCoverageInternal(
    sessionId: string,
    balanceEvidence: StrategyOneAuthoritativeBalanceEvidence,
    resolutionNote: string,
    now: number,
  ): Promise<StrategyOneTwoLegRecoveryResolutionRecord> {
    const existing = this.pairs.getSession(sessionId);

    if (!existing) {
      throw new Error("No persisted Strategy #1 two-leg session exists.");
    }

    const reconciled = await this.pairs.reconcileSession(sessionId, now);
    const session = reconciled.session;
    const covered = preExistingInventoryCoverageEvidence(
      session,
      balanceEvidence,
    );

    if (!covered) {
      throw new Error(
        "Strategy #1 recovery remains unresolved: a genuine spot fill on exactly one leg, a zero-fill terminal on the other, and a live authoritative zero-borrow balance for the held asset are all required.",
      );
    }

    return this.persist({
      session,
      basis: "AUTHORITATIVE_PRE_EXISTING_INVENTORY_COVERED",
      resolutionNote,
      resolvedAt: now,
      balanceEvidence,
      ...covered,
    });
  }

  isSessionResolved(
    sessionId: string,
  ): boolean {
    const resolution = this.latest.get(sessionId);
    const session = this.pairs.getSession(sessionId);

    return Boolean(
      resolution &&
      session &&
      resolution.evidenceFingerprint === resolutionFingerprint(
        session,
        resolution.compensatingOrder ?? null,
        resolution.balanceEvidence ?? null,
      ),
    );
  }

  getResolution(
    sessionId: string,
  ): StrategyOneTwoLegRecoveryResolutionRecord | null {
    const value = this.latest.get(sessionId);
    return value ? clone(value) : null;
  }

  getDiagnostics(
    now = Date.now(),
  ) {
    validateTime(now);
    const resolutions = [...this.latest.values()]
      .sort((first, second) => second.resolvedAt - first.resolvedAt)
      .map(clone);

    return freeze({
      schemaVersion: "109.0" as const,
      generatedAt: now,
      resolutions,
      currentlyValid: resolutions.filter((item) =>
        this.isSessionResolved(item.sessionId)).length,
      persistence: this.store.getDiagnostics(),
      safety: {
        explicitResolutionRequired: true,
        authoritativeTerminalBalanceRequired: true,
        authoritativeCompensatingOrderSupported: true,
        allowNewSubmission: false,
        automaticCancelAllowed: false,
        automaticHedgeAllowed: false,
        automaticUnwindAllowed: false,
      },
    });
  }

  private persist(input: {
    readonly session: StrategyOneTwoLegSessionRecord;
    readonly basis: StrategyOneTwoLegRecoveryResolutionRecord["basis"];
    readonly resolutionNote: string;
    readonly resolvedAt: number;
    readonly buyFilledQuantity: number;
    readonly sellFilledQuantity: number;
    readonly terminalStatuses: readonly string[];
    readonly compensatingOrder?: StrategyOneCompensatingOrderEvidence | null;
    readonly balanceEvidence?: StrategyOneAuthoritativeBalanceEvidence | null;
  }): StrategyOneTwoLegRecoveryResolutionRecord {
    const compensatingOrder = input.compensatingOrder ?? null;
    const balanceEvidence = input.balanceEvidence ?? null;
    const record = freeze({
      schemaVersion: "109.0" as const,
      sessionId: input.session.sessionId,
      status: "RESOLVED" as const,
      basis: input.basis,
      evidenceFingerprint: resolutionFingerprint(
        input.session,
        compensatingOrder,
        balanceEvidence,
      ),
      resolutionNote: input.resolutionNote,
      resolvedAt: input.resolvedAt,
      buyFilledQuantity: input.buyFilledQuantity,
      sellFilledQuantity: input.sellFilledQuantity,
      terminalStatuses: [...input.terminalStatuses],
      compensatingOrder: compensatingOrder ? clone(compensatingOrder) : null,
      balanceEvidence: balanceEvidence ? clone(balanceEvidence) : null,
      automaticOrderActionPerformed: compensatingOrder !== null,
    });

    this.store.append(record);

    // Mirror the constructor's restore() ordering guard: never let an
    // older resolution silently clobber a newer one already in memory.
    const current = this.latest.get(record.sessionId);

    if (!current || record.resolvedAt >= current.resolvedAt) {
      this.latest.set(record.sessionId, record);
    }

    return clone(record);
  }
}

function terminalBalancedEvidence(
  session: StrategyOneTwoLegSessionRecord,
): {
  readonly buyFilledQuantity: number;
  readonly sellFilledQuantity: number;
  readonly terminalStatuses: readonly string[];
} | null {
  const buy = session.buyResponse?.record?.result;
  const sell = session.sellResponse?.record?.result;

  if (!buy || !sell || !terminal(buy.status) || !terminal(sell.status)) {
    return null;
  }

  // Number.isFinite() rejects NaN explicitly. Without this, a corrupted or
  // partially-deserialized filledQuantity (NaN) would make every comparison
  // below (">"/"<=" against NaN is always false in JS) fail OPEN instead of
  // blocking - silently journaling a RESOLVED record with a NaN quantity and
  // clearing the session from StrategyOneTwoLegRestartRecoveryService's
  // unresolved list without the residual ever actually being verified.
  if (
    !Number.isFinite(buy.filledQuantity) ||
    !Number.isFinite(sell.filledQuantity)
  ) {
    return null;
  }

  const tolerance =
    Math.max(1e-12, Math.max(buy.filledQuantity, sell.filledQuantity) * 1e-9);

  if (Math.abs(buy.filledQuantity - sell.filledQuantity) > tolerance) {
    return null;
  }

  return {
    buyFilledQuantity: buy.filledQuantity,
    sellFilledQuantity: sell.filledQuantity,
    terminalStatuses: [buy.status, sell.status],
  };
}

function compensatedTerminalEvidence(
  session: StrategyOneTwoLegSessionRecord,
  evidence: StrategyOneCompensatingOrderEvidence,
): {
  readonly buyFilledQuantity: number;
  readonly sellFilledQuantity: number;
  readonly terminalStatuses: readonly string[];
} | null {
  const buy = session.buyResponse?.record?.result;
  const sell = session.sellResponse?.record?.result;

  if (!buy || !sell || !terminal(buy.status) || !terminal(sell.status)) {
    return null;
  }

  // Same NaN-fails-open hazard as terminalBalancedEvidence() above: every
  // guard below is a "block unless clearly satisfied" comparison, which is
  // always false (i.e. does not block) against NaN.
  if (
    !Number.isFinite(buy.filledQuantity) ||
    !Number.isFinite(sell.filledQuantity) ||
    !Number.isFinite(evidence.filledQuantity) ||
    !Number.isFinite(evidence.requestedQuantity)
  ) {
    return null;
  }

  const residual = buy.filledQuantity - sell.filledQuantity;
  const tolerance = Math.max(
    1e-12,
    Math.max(
      buy.filledQuantity,
      sell.filledQuantity,
      evidence.filledQuantity,
    ) * 1e-9,
  );

  if (Math.abs(residual) <= tolerance) {
    return null;
  }

  const expectedExchange = residual > 0
    ? session.buyRequest.exchange
    : session.sellRequest.exchange;
  const expectedSide = residual > 0 ? "sell" : "buy";
  const expectedQuantity = Math.abs(residual);

  if (
    normalizeExchange(evidence.exchange) !== normalizeExchange(expectedExchange) ||
    normalizeMarket(evidence.market) !== normalizeMarket(session.buyRequest.market) ||
    evidence.side !== expectedSide ||
    Math.abs(evidence.requestedQuantity - expectedQuantity) > tolerance ||
    Math.abs(evidence.filledQuantity - expectedQuantity) > tolerance ||
    evidence.remainingQuantity !== 0 ||
    evidence.status !== "FILLED"
  ) {
    return null;
  }

  const effectiveBuy = buy.filledQuantity +
    (evidence.side === "buy" ? evidence.filledQuantity : 0);
  const effectiveSell = sell.filledQuantity +
    (evidence.side === "sell" ? evidence.filledQuantity : 0);

  if (Math.abs(effectiveBuy - effectiveSell) > tolerance) {
    return null;
  }

  return {
    buyFilledQuantity: effectiveBuy,
    sellFilledQuantity: effectiveSell,
    terminalStatuses: [buy.status, sell.status, evidence.status],
  };
}

/**
 * Covers the exact real-incident shape seen on WAVESUSDT and PYBOBOUSDT: the
 * SELL leg genuinely FILLED (spot only - a real exchange cannot fill a spot
 * sell from balance it does not hold) while the paired BUY leg terminated
 * with zero fill. The account is never in a naked short here; it sold from
 * pre-existing inventory instead of from freshly-bought inventory. This is
 * only "resolved" once a LIVE authoritative balance check (not the cached
 * snapshot, which can be stale) confirms zero borrow and a non-negative
 * remaining balance of that exact asset on that exact exchange.
 */
function preExistingInventoryCoverageEvidence(
  session: StrategyOneTwoLegSessionRecord,
  balanceEvidence: StrategyOneAuthoritativeBalanceEvidence,
): {
  readonly buyFilledQuantity: number;
  readonly sellFilledQuantity: number;
  readonly terminalStatuses: readonly string[];
} | null {
  const buy = session.buyResponse?.record?.result;
  const sell = session.sellResponse?.record?.result;

  if (!buy || !sell || !terminal(buy.status) || !terminal(sell.status)) {
    return null;
  }

  if (
    !Number.isFinite(buy.filledQuantity) ||
    !Number.isFinite(sell.filledQuantity)
  ) {
    return null;
  }

  if (buy.filledQuantity !== 0 || sell.filledQuantity <= 0) {
    return null;
  }

  if (
    sell.status !== "FILLED" ||
    session.sellRequest.product === "PERPETUAL" ||
    sell.product === "PERPETUAL" ||
    Boolean(sell.reduceOnly) ||
    Boolean(sell.positionSide)
  ) {
    return null;
  }

  const baseAsset = extractBaseAsset(session.sellRequest.market);

  if (
    !baseAsset ||
    normalizeExchange(balanceEvidence.exchange) !==
      normalizeExchange(session.sellRequest.exchange) ||
    normalizeAsset(balanceEvidence.asset) !== normalizeAsset(baseAsset)
  ) {
    return null;
  }

  if (
    balanceEvidence.borrowedAmount !== 0 ||
    balanceEvidence.availableBalance < 0
  ) {
    return null;
  }

  return {
    buyFilledQuantity: buy.filledQuantity,
    sellFilledQuantity: sell.filledQuantity,
    terminalStatuses: [buy.status, sell.status],
  };
}

function extractBaseAsset(market: string): string | null {
  const normalized = market.trim().toUpperCase();

  if (!normalized.endsWith("USDT")) {
    return null;
  }

  const baseAsset = normalized.slice(0, -"USDT".length);
  return baseAsset || null;
}

function normalizeAsset(value: string): string {
  return value.trim().toUpperCase();
}

/**
 * The evidence must reflect account state queried AFTER the incident, close
 * enough to "now" that it cannot be stale leftover evidence from an earlier,
 * unrelated resolution attempt. 5 minutes mirrors the freshness discipline
 * used elsewhere in this codebase for authoritative balance evidence.
 */
const MAXIMUM_BALANCE_EVIDENCE_AGE_MS = 5 * 60 * 1000;

function validateBalanceEvidence(
  value: StrategyOneAuthoritativeBalanceEvidence,
  now: number,
): StrategyOneAuthoritativeBalanceEvidence {
  const valid =
    typeof value === "object" &&
    value !== null &&
    Boolean(requireText(value.exchange, "balance exchange")) &&
    Boolean(requireText(value.asset, "balance asset")) &&
    Number.isFinite(value.availableBalance) &&
    Number.isFinite(value.borrowedAmount) &&
    Number.isSafeInteger(value.queriedAt) &&
    value.queriedAt > 0 &&
    value.queriedAt <= now &&
    now - value.queriedAt <= MAXIMUM_BALANCE_EVIDENCE_AGE_MS &&
    Boolean(requireText(value.evidenceSource, "balance evidenceSource"));

  if (!valid) {
    throw new Error(
      "Authoritative balance evidence is incomplete or stale (must be queried within the last 5 minutes).",
    );
  }

  return freeze(clone(value));
}

function terminal(value: string): boolean {
  return value === "FILLED" ||
    value === "CANCELLED" ||
    value === "REJECTED" ||
    value === "FAILED";
}

/**
 * Fingerprint only durable order and financial evidence.
 *
 * Read-only reconciliation (reconcileSession()/executeOrReconcile()) rewrites
 * transport metadata on every call - updatedAt, dispatch timestamps, gateway
 * timestamps, lastError and diagnostic reasons - even when nothing financial
 * changed. Hashing the entire session (as this function used to) therefore
 * made an already-resolved, unchanged session look "stale" the moment
 * anything else (the restart-recovery gate, a dashboard refresh, another
 * resolve attempt) triggered one more reconciliation, silently reopening a
 * resolved incident and blocking new LIVE preparation for no financial
 * reason. This mirrors StrategyOneResidualRecoveryAssistantService.ts's own
 * fingerprint(), which carries the identical comment and field list for the
 * identical reason - keep the two in sync; both must exclude the same
 * transport-only fields.
 */
function fingerprint(session: StrategyOneTwoLegSessionRecord): string {
  return createHash("sha256")
    .update(JSON.stringify({
      schemaVersion: session.schemaVersion,
      sessionId: session.sessionId,
      requestHash: session.requestHash,
      opportunityId: session.opportunityId,
      lastLookDecisionId: session.lastLookDecisionId,
      buyIdempotencyKey: session.buyIdempotencyKey,
      sellIdempotencyKey: session.sellIdempotencyKey,
      buyRequest: session.buyRequest,
      sellRequest: session.sellRequest,
      state: session.state,
      buyResponse: gatewayEvidence(session.buyResponse),
      sellResponse: gatewayEvidence(session.sellResponse),
      automaticRetryAllowed: session.automaticRetryAllowed,
      automaticRecoveryOrderAllowed: session.automaticRecoveryOrderAllowed,
      newOrderSubmissionAllowed: session.newOrderSubmissionAllowed,
    }))
    .digest("hex");
}

function gatewayEvidence(
  response: StrategyOneTwoLegSessionRecord["buyResponse"],
) {
  const record = response?.record;
  const result = record?.result;
  const feeEvidence = record?.feeEvidence;

  if (!response) {
    return null;
  }

  return {
    state: response.state,
    record: record
      ? {
        id: record.id,
        idempotencyKey: record.idempotencyKey,
        requestHash: record.requestHash,
        request: record.request,
        state: record.state,
        result: result
          ? {
            success: result.success,
            exchange: result.exchange,
            product: result.product ?? null,
            reduceOnly: result.reduceOnly ?? null,
            positionMode: result.positionMode ?? null,
            positionSide: result.positionSide ?? null,
            market: result.market,
            side: result.side,
            orderId: result.orderId,
            clientOrderId: result.clientOrderId,
            status: result.status,
            requestedQuantity: result.requestedQuantity,
            filledQuantity: result.filledQuantity,
            remainingQuantity: result.remainingQuantity,
            requestedPrice: result.requestedPrice,
            averageFillPrice: result.averageFillPrice,
            feeAmount: result.feeAmount,
            authoritativeFeeQuoteAmount:
              result.authoritativeFeeQuoteAmount ?? null,
            authoritativeWithholdingQuoteAmount:
              result.authoritativeWithholdingQuoteAmount ?? null,
            authoritativeCashDeductionQuoteAmount:
              result.authoritativeCashDeductionQuoteAmount ?? null,
            authoritativeWithholdingEvidenceComplete:
              result.authoritativeWithholdingEvidenceComplete ?? null,
            authoritativeFeeEvidenceId:
              result.authoritativeFeeEvidenceId ?? null,
            cancelled: result.cancelled,
            timedOut: result.timedOut,
          }
          : null,
        feeEvidence: feeEvidence
          ? {
            version: feeEvidence.version,
            id: feeEvidence.id,
            exchange: feeEvidence.exchange,
            product: feeEvidence.product,
            market: feeEvidence.market,
            orderId: feeEvidence.orderId,
            expectedFilledQuantity: feeEvidence.expectedFilledQuantity,
            observedFilledQuantity: feeEvidence.observedFilledQuantity,
            observedQuoteQuantity: feeEvidence.observedQuoteQuantity,
            averageFillPrice: feeEvidence.averageFillPrice,
            fills: feeEvidence.fills,
            fees: feeEvidence.fees,
            withholdings: feeEvidence.withholdings,
            quoteAsset: feeEvidence.quoteAsset,
            totalFeeQuoteAmount: feeEvidence.totalFeeQuoteAmount,
            totalWithholdingQuoteAmount:
              feeEvidence.totalWithholdingQuoteAmount,
            totalCashDeductionQuoteAmount:
              feeEvidence.totalCashDeductionQuoteAmount,
            withholdingEvidenceComplete:
              feeEvidence.withholdingEvidenceComplete,
            complete: feeEvidence.complete,
            source: feeEvidence.source,
          }
          : null,
        cancellationRequested: record.cancelRequestedAt !== null,
        orderSubmissionPerformed: record.orderSubmissionPerformed,
      }
      : null,
  };
}

function resolutionFingerprint(
  session: StrategyOneTwoLegSessionRecord,
  compensatingOrder: StrategyOneCompensatingOrderEvidence | null,
  balanceEvidence: StrategyOneAuthoritativeBalanceEvidence | null = null,
): string {
  if (!compensatingOrder && !balanceEvidence) {
    return fingerprint(session);
  }

  return createHash("sha256")
    .update(JSON.stringify({
      session,
      compensatingOrder,
      balanceEvidence,
    }))
    .digest("hex");
}

function validateCompensatingEvidence(
  value: StrategyOneCompensatingOrderEvidence,
): StrategyOneCompensatingOrderEvidence {
  const valid =
    typeof value === "object" &&
    value !== null &&
    Boolean(requireText(value.exchange, "compensating exchange")) &&
    Boolean(requireText(value.market, "compensating market")) &&
    (value.side === "buy" || value.side === "sell") &&
    Boolean(requireText(value.orderId, "compensating orderId")) &&
    value.status === "FILLED" &&
    Number.isFinite(value.requestedQuantity) &&
    value.requestedQuantity > 0 &&
    Number.isFinite(value.filledQuantity) &&
    value.filledQuantity > 0 &&
    value.remainingQuantity === 0 &&
    Number.isFinite(value.averageFillPrice) &&
    value.averageFillPrice > 0 &&
    Boolean(requireText(value.feeEvidenceId, "compensating feeEvidenceId")) &&
    Number.isSafeInteger(value.completedAt) &&
    value.completedAt > 0;

  if (!valid) {
    throw new Error("Authoritative compensating-order evidence is incomplete.");
  }

  return freeze(clone(value));
}

function normalizeExchange(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeMarket(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/gu, "");
}

function isResolution(
  value: unknown,
): value is StrategyOneTwoLegRecoveryResolutionRecord {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const item = value as Partial<StrategyOneTwoLegRecoveryResolutionRecord>;
  return item.schemaVersion === "109.0" &&
    item.status === "RESOLVED" &&
    typeof item.sessionId === "string" &&
    typeof item.evidenceFingerprint === "string" &&
    typeof item.resolutionNote === "string" &&
    Number.isSafeInteger(item.resolvedAt) &&
    typeof item.automaticOrderActionPerformed === "boolean";
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
    throw new Error("Strategy #1 recovery timestamp must be positive.");
  }
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

export const strategyOneTwoLegRecoveryResolutionService =
  new StrategyOneTwoLegRecoveryResolutionService();
