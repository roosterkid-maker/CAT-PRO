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
    | "AUTHORITATIVE_COMPENSATING_ORDER_BALANCED";
  readonly evidenceFingerprint: string;
  readonly resolutionNote: string;
  readonly resolvedAt: number;
  readonly buyFilledQuantity: number;
  readonly sellFilledQuantity: number;
  readonly terminalStatuses: readonly string[];
  readonly compensatingOrder?: StrategyOneCompensatingOrderEvidence | null;
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

  async resolveSession(
    sessionIdValue: string,
    resolutionNoteValue: string,
    now = Date.now(),
  ): Promise<StrategyOneTwoLegRecoveryResolutionRecord> {
    const sessionId = requireText(sessionIdValue, "sessionId");
    const resolutionNote = requireText(resolutionNoteValue, "resolutionNote");
    validateTime(now);
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

  async resolveCompensatingOrder(
    sessionIdValue: string,
    evidenceValue: StrategyOneCompensatingOrderEvidence,
    resolutionNoteValue: string,
    now = Date.now(),
  ): Promise<StrategyOneTwoLegRecoveryResolutionRecord> {
    const sessionId = requireText(sessionIdValue, "sessionId");
    const resolutionNote = requireText(resolutionNoteValue, "resolutionNote");
    validateTime(now);
    const evidence = validateCompensatingEvidence(evidenceValue);
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
  }): StrategyOneTwoLegRecoveryResolutionRecord {
    const compensatingOrder = input.compensatingOrder ?? null;
    const record = freeze({
      schemaVersion: "109.0" as const,
      sessionId: input.session.sessionId,
      status: "RESOLVED" as const,
      basis: input.basis,
      evidenceFingerprint: resolutionFingerprint(
        input.session,
        compensatingOrder,
      ),
      resolutionNote: input.resolutionNote,
      resolvedAt: input.resolvedAt,
      buyFilledQuantity: input.buyFilledQuantity,
      sellFilledQuantity: input.sellFilledQuantity,
      terminalStatuses: [...input.terminalStatuses],
      compensatingOrder: compensatingOrder ? clone(compensatingOrder) : null,
      automaticOrderActionPerformed: compensatingOrder !== null,
    });

    this.store.append(record);
    this.latest.set(record.sessionId, record);
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

function terminal(value: string): boolean {
  return value === "FILLED" ||
    value === "CANCELLED" ||
    value === "REJECTED" ||
    value === "FAILED";
}

function fingerprint(session: StrategyOneTwoLegSessionRecord): string {
  return createHash("sha256")
    .update(JSON.stringify(session))
    .digest("hex");
}

function resolutionFingerprint(
  session: StrategyOneTwoLegSessionRecord,
  compensatingOrder: StrategyOneCompensatingOrderEvidence | null,
): string {
  if (!compensatingOrder) {
    return fingerprint(session);
  }

  return createHash("sha256")
    .update(JSON.stringify({
      session,
      compensatingOrder,
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
