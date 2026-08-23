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
  centralLiveOrderExecutionGateway,
  type CentralLiveOrderGatewayResponse,
} from "../central/CentralLiveOrderExecutionGateway";

import type {
  LiveExecutionRequest,
} from "../models/LiveExecutionRequest";
import {
  isStrategyOneTinyLiveBasketRoute,
} from "../../../arbitrage/execution/StrategyOneTinyLiveBasketPolicy";

export type StrategyOneTwoLegSessionState =
  | "PREPARED"
  | "DISPATCHING"
  | "COMPLETED"
  | "RECOVERY_REQUIRED"
  | "POSSIBLE_EXPOSURE"
  | "FAILED";

export interface StrategyOneTwoLegSessionRecord {
  readonly schemaVersion: "108.0";
  readonly sessionId: string;
  readonly requestHash: string;
  readonly opportunityId: string;
  readonly lastLookDecisionId: string;
  readonly buyIdempotencyKey: string;
  readonly sellIdempotencyKey: string;
  readonly buyRequest: LiveExecutionRequest;
  readonly sellRequest: LiveExecutionRequest;
  readonly state: StrategyOneTwoLegSessionState;
  readonly preparedAt: number;
  readonly updatedAt: number;
  readonly buyDispatchedAt: number | null;
  readonly sellDispatchedAt: number | null;
  readonly buyResponse: CentralLiveOrderGatewayResponse | null;
  readonly sellResponse: CentralLiveOrderGatewayResponse | null;
  readonly reasons: readonly string[];
  readonly automaticRetryAllowed: false;
  readonly automaticRecoveryOrderAllowed: false;
  readonly newOrderSubmissionAllowed: false;
}

export interface StrategyOneTwoLegExecutionResult {
  readonly session: StrategyOneTwoLegSessionRecord;
  readonly possibleExposure: boolean;
  readonly recoveryRequired: boolean;
  readonly buyDispatchedAt: number | null;
  readonly sellDispatchedAt: number | null;
  readonly buyResponse: CentralLiveOrderGatewayResponse | null;
  readonly sellResponse: CentralLiveOrderGatewayResponse | null;
}

export interface StrategyOneTwoLegGatewayPort {
  executeOrReconcile(input: {
    readonly request: LiveExecutionRequest;
    readonly idempotencyKey: string;
    readonly allowNewSubmission: boolean;
    readonly now?: number;
  }): Promise<CentralLiveOrderGatewayResponse>;
}

export interface StrategyOneTwoLegServiceConfiguration {
  readonly maximumSessions?: number;
}

interface PersistedSnapshot {
  readonly schemaVersion: "108.0";
  readonly savedAt: number;
  readonly sessions: readonly StrategyOneTwoLegSessionRecord[];
}

const DEFAULT_FILE =
  resolve(
    process.cwd(),
    "logs",
    "live",
    "strategy-one-two-leg-sessions.jsonl",
  );

/**
 * Durable Strategy #1 pair owner. The pair is journaled before either leg can
 * reach an exchange. Unknown outcomes are never retried and always become
 * POSSIBLE_EXPOSURE. This service does not own an authority token and cannot
 * enable the central order gateway.
 */
export class StrategyOneTwoLegLiveExecutionService {
  private readonly maximumSessions: number;
  private readonly store:
    JsonlSnapshotStore<PersistedSnapshot>;
  private readonly sessions =
    new Map<string, StrategyOneTwoLegSessionRecord>();
  private readonly inFlight =
    new Map<string, Promise<StrategyOneTwoLegExecutionResult>>();

  constructor(
    private readonly gateway:
      StrategyOneTwoLegGatewayPort = centralLiveOrderExecutionGateway,
    filePath = DEFAULT_FILE,
    configuration:
      StrategyOneTwoLegServiceConfiguration = {},
  ) {
    this.maximumSessions =
      configuration.maximumSessions ?? 500;

    if (
      !Number.isSafeInteger(this.maximumSessions) ||
      this.maximumSessions <= 0
    ) {
      throw new Error("Strategy #1 two-leg session capacity must be positive.");
    }

    this.store =
      new JsonlSnapshotStore({
        filePath,
        isPayload: isSnapshot,
      });

    const latest =
      this.store.readAll().at(-1);

    if (latest) {
      for (const session of latest.sessions) {
        this.sessions.set(
          session.sessionId,
          deepFreeze(clone(session)),
        );
      }
    }
  }

  executeOrReconcile(input: {
    readonly sessionId: string;
    readonly opportunityId: string;
    readonly lastLookDecisionId: string;
    readonly buyRequest: LiveExecutionRequest;
    readonly sellRequest: LiveExecutionRequest;
    readonly allowNewSubmission: boolean;
    readonly now?: number;
  }): Promise<StrategyOneTwoLegExecutionResult> {
    const sessionId =
      requireIdentifier(input.sessionId, "session");
    const active =
      this.inFlight.get(sessionId);

    if (active) {
      return active;
    }

    const work =
      this.executeInternal({
        ...input,
        sessionId,
      }).finally(() => {
        this.inFlight.delete(sessionId);
      });

    this.inFlight.set(sessionId, work);
    return work;
  }

  getSession(
    sessionId: string,
  ): StrategyOneTwoLegSessionRecord | null {
    const value =
      this.sessions.get(
        requireIdentifier(sessionId, "session"),
      );

    return value
      ? clone(value)
      : null;
  }

  reconcileSession(
    sessionId: string,
    now = Date.now(),
  ): Promise<StrategyOneTwoLegExecutionResult> {
    const existing =
      this.getSession(sessionId);

    if (!existing) {
      throw new Error("Strategy #1 two-leg session is not known.");
    }

    if (
      existing.state === "COMPLETED" ||
      existing.state === "FAILED"
    ) {
      return Promise.resolve(resultFromSession(existing));
    }

    return this.executeOrReconcile({
      sessionId: existing.sessionId,
      opportunityId: existing.opportunityId,
      lastLookDecisionId: existing.lastLookDecisionId,
      buyRequest: existing.buyRequest,
      sellRequest: existing.sellRequest,
      allowNewSubmission: false,
      now,
    });
  }

  listSessions():
    readonly StrategyOneTwoLegSessionRecord[] {
    return [...this.sessions.values()]
      .sort((first, second) =>
        second.updatedAt - first.updatedAt)
      .map(clone);
  }

  getDiagnostics(
    now = Date.now(),
  ) {
    validateTime(now);
    const sessions =
      [...this.sessions.values()];

    return deepFreeze({
      schemaVersion: "108.0" as const,
      generatedAt: now,
      sessions: sessions.length,
      states: Object.fromEntries(
        [
          "PREPARED",
          "DISPATCHING",
          "COMPLETED",
          "RECOVERY_REQUIRED",
          "POSSIBLE_EXPOSURE",
          "FAILED",
        ].map((state) => [
          state,
          sessions.filter((session) => session.state === state).length,
        ]),
      ),
      inFlight: this.inFlight.size,
      persistence: this.store.getDiagnostics(),
      safety: {
        journalBeforeAnyExchangeIo: true,
        concurrentLegDispatch: true,
        stablePerLegIdempotency: true,
        unknownOutcomeNeverRetried: true,
        possibleExposureBlocksSuccess: true,
        automaticRetryAllowed: false,
        automaticRecoveryOrderAllowed: false,
        liveOrderSubmissionAuthorized: false,
      },
    });
  }

  private async executeInternal(input: {
    readonly sessionId: string;
    readonly opportunityId: string;
    readonly lastLookDecisionId: string;
    readonly buyRequest: LiveExecutionRequest;
    readonly sellRequest: LiveExecutionRequest;
    readonly allowNewSubmission: boolean;
    readonly now?: number;
  }): Promise<StrategyOneTwoLegExecutionResult> {
    const now =
      input.now ?? Date.now();
    validateTime(now);
    this.validatePair(input.buyRequest, input.sellRequest);

    const requestHashValue =
      requestHash(input);
    const existing =
      this.sessions.get(input.sessionId);

    if (existing && existing.requestHash !== requestHashValue) {
      throw new Error(
        "Strategy #1 two-leg session identity was reused with different requests.",
      );
    }

    const buyIdempotencyKey =
      `${input.sessionId}:buy`;
    const sellIdempotencyKey =
      `${input.sessionId}:sell`;
    let session =
      existing ?? this.prepare({
        ...input,
        now,
        requestHash: requestHashValue,
        buyIdempotencyKey,
        sellIdempotencyKey,
      });

    const allowNewSubmission =
      !existing && input.allowNewSubmission;
    const dispatchBoundaryAt =
      Date.now();

    session = deepFreeze({
      ...clone(session),
      state: "DISPATCHING" as const,
      updatedAt: Math.max(now, dispatchBoundaryAt),
      buyDispatchedAt: dispatchBoundaryAt,
      sellDispatchedAt: dispatchBoundaryAt,
      reasons: [
        ...session.reasons,
        "Both leg dispatch boundaries were durably recorded before either gateway call.",
      ],
    });
    this.setAndPersist(session);

    const buyDispatchedAt =
      dispatchBoundaryAt;
    const buyPromise =
      this.gateway.executeOrReconcile({
        request: session.buyRequest,
        idempotencyKey: session.buyIdempotencyKey,
        allowNewSubmission,
        now,
      });
    const sellDispatchedAt =
      dispatchBoundaryAt;
    const sellPromise =
      this.gateway.executeOrReconcile({
        request: session.sellRequest,
        idempotencyKey: session.sellIdempotencyKey,
        allowNewSubmission,
        now,
      });
    const [buySettled, sellSettled] =
      await Promise.allSettled([buyPromise, sellPromise]);
    const buyResponse =
      buySettled.status === "fulfilled"
        ? buySettled.value
        : null;
    const sellResponse =
      sellSettled.status === "fulfilled"
        ? sellSettled.value
        : null;
    const reasons = [
      ...(buySettled.status === "rejected"
        ? [`BUY gateway failure: ${message(buySettled.reason)}`]
        : buyResponse?.reasons.map((reason) => `BUY: ${reason}`) ?? []),
      ...(sellSettled.status === "rejected"
        ? [`SELL gateway failure: ${message(sellSettled.reason)}`]
        : sellResponse?.reasons.map((reason) => `SELL: ${reason}`) ?? []),
    ];
    const possibleExposure =
      isPossibleExposure(buySettled, buyResponse) ||
      isPossibleExposure(sellSettled, sellResponse);
    const buyFilled =
      buyResponse?.record?.result?.filledQuantity ?? 0;
    const sellFilled =
      sellResponse?.record?.result?.filledQuantity ?? 0;
    const mismatch =
      Math.abs(buyFilled - sellFilled) >
      Math.max(1e-12, Math.max(buyFilled, sellFilled) * 1e-9);
    const bothComplete =
      !possibleExposure &&
      !mismatch &&
      buyResponse?.state === "READY" &&
      sellResponse?.state === "READY" &&
      buyResponse.record?.result?.status === "FILLED" &&
      sellResponse.record?.result?.status === "FILLED";
    const recoveryRequired =
      possibleExposure || mismatch;
    const state:
      StrategyOneTwoLegSessionState =
      possibleExposure
        ? "POSSIBLE_EXPOSURE"
        : mismatch
          ? "RECOVERY_REQUIRED"
          : bothComplete
            ? "COMPLETED"
            : "FAILED";

    if (possibleExposure) {
      reasons.push(
        "At least one leg has an unknown, open, or evidence-incomplete outcome; automatic retry and replacement are forbidden.",
      );
    }

    if (mismatch) {
      reasons.push(
        "Authoritative leg quantities do not match; residual exposure requires audited recovery.",
      );
    }

    session = deepFreeze({
      ...clone(session),
      state,
      updatedAt: Math.max(now, Date.now()),
      buyDispatchedAt,
      sellDispatchedAt,
      buyResponse: buyResponse ? clone(buyResponse) : null,
      sellResponse: sellResponse ? clone(sellResponse) : null,
      reasons: [...new Set(reasons)],
      automaticRetryAllowed: false,
      automaticRecoveryOrderAllowed: false,
      newOrderSubmissionAllowed: false,
    });
    this.setAndPersist(session);

    return deepFreeze({
      session: clone(session),
      possibleExposure,
      recoveryRequired,
      buyDispatchedAt,
      sellDispatchedAt,
      buyResponse: buyResponse ? clone(buyResponse) : null,
      sellResponse: sellResponse ? clone(sellResponse) : null,
    });
  }

  private prepare(input: {
    readonly sessionId: string;
    readonly opportunityId: string;
    readonly lastLookDecisionId: string;
    readonly buyRequest: LiveExecutionRequest;
    readonly sellRequest: LiveExecutionRequest;
    readonly now: number;
    readonly requestHash: string;
    readonly buyIdempotencyKey: string;
    readonly sellIdempotencyKey: string;
  }): StrategyOneTwoLegSessionRecord {
    if (this.sessions.size >= this.maximumSessions) {
      throw new Error("Strategy #1 two-leg session capacity is exhausted.");
    }

    const prepared = deepFreeze({
      schemaVersion: "108.0" as const,
      sessionId: input.sessionId,
      requestHash: input.requestHash,
      opportunityId: requireIdentifier(input.opportunityId, "opportunity"),
      lastLookDecisionId: requireIdentifier(
        input.lastLookDecisionId,
        "last-look decision",
      ),
      buyIdempotencyKey: input.buyIdempotencyKey,
      sellIdempotencyKey: input.sellIdempotencyKey,
      buyRequest: clone(input.buyRequest),
      sellRequest: clone(input.sellRequest),
      state: "PREPARED" as const,
      preparedAt: input.now,
      updatedAt: input.now,
      buyDispatchedAt: null,
      sellDispatchedAt: null,
      buyResponse: null,
      sellResponse: null,
      reasons: [
        "Two-leg identity was durably prepared before either gateway call.",
      ],
      automaticRetryAllowed: false as const,
      automaticRecoveryOrderAllowed: false as const,
      newOrderSubmissionAllowed: false as const,
    });

    this.setAndPersist(prepared);
    return prepared;
  }

  private validatePair(
    buy: LiveExecutionRequest,
    sell: LiveExecutionRequest,
  ): void {
    const buyExchange =
      normalize(
        buy.exchange,
      );
    const sellExchange =
      normalize(
        sell.exchange,
      );
    const market =
      normalizeMarket(
        buy.market,
      );
    const legacyFokLane =
      new Set([
        buyExchange,
        sellExchange,
      ]).size ===
        2 &&
      [
        buyExchange,
        sellExchange,
      ].every(
        (exchange) =>
          exchange ===
            "binance" ||
          exchange ===
            "bybit",
      ) &&
      buy.timeInForce ===
        "FOK" &&
      sell.timeInForce ===
        "FOK";
    const basketCoinDCXLane =
      isStrategyOneTinyLiveBasketRoute({
        market,
        buyExchange,
        sellExchange,
      }) &&
      (buyExchange === "coindcx" || sellExchange === "coindcx") &&
      (buyExchange === "binance" || buyExchange === "bybit" || buyExchange === "coindcx") &&
      (sellExchange === "binance" || sellExchange === "bybit" || sellExchange === "coindcx") &&
      buy.timeInForce === (buyExchange === "coindcx" ? "GTC" : "FOK") &&
      sell.timeInForce === (sellExchange === "coindcx" ? "GTC" : "FOK") &&
      (buyExchange !== "coindcx" || hasBoundedCancel(buy)) &&
      (sellExchange !== "coindcx" || hasBoundedCancel(sell));

    if (
      buy.side !== "buy" ||
      sell.side !== "sell" ||
      market !== normalizeMarket(sell.market) ||
      !(
        legacyFokLane ||
        basketCoinDCXLane
      ) ||
      (buy.product ?? "SPOT") !== "SPOT" ||
      (sell.product ?? "SPOT") !== "SPOT" ||
      buy.orderType !== "limit" ||
      sell.orderType !== "limit" ||
      !buy.clientOrderId?.trim() ||
      !sell.clientOrderId?.trim() ||
      !Number.isFinite(buy.quantity) ||
      buy.quantity <= 0 ||
      buy.quantity !== sell.quantity
    ) {
      throw new Error(
        "Strategy #1 two-leg LIVE pair requires either the audited Binance/Bybit SPOT limit-FOK lane or an immutable pilot-basket route with CoinDCX GTC bounded-cancel and Binance/Bybit FOK, with equal positive quantity and durable client IDs.",
      );
    }
  }

  private setAndPersist(
    session: StrategyOneTwoLegSessionRecord,
  ): void {
    const immutable =
      deepFreeze(clone(session));
    const next =
      new Map(this.sessions);

    next.set(session.sessionId, immutable);
    this.store.append({
      schemaVersion: "108.0",
      savedAt: session.updatedAt,
      sessions: [...next.values()].map(clone),
    });
    this.sessions.set(session.sessionId, immutable);
  }
}

function hasBoundedCancel(request: LiveExecutionRequest): boolean {
  return request.cancelOnTimeout === true &&
    Number.isSafeInteger(request.timeoutMs) &&
    (request.timeoutMs ?? 0) > 0 &&
    (request.timeoutMs ?? 0) <= 10_000;
}

function isPossibleExposure(
  settled: PromiseSettledResult<CentralLiveOrderGatewayResponse>,
  response: CentralLiveOrderGatewayResponse | null,
): boolean {
  if (settled.status === "rejected" || !response) {
    return true;
  }

  if (
    response.state === "UNCERTAIN_SUBMISSION" ||
    response.state === "OPEN" ||
    response.state === "EVIDENCE_INCOMPLETE"
  ) {
    return true;
  }

  return response.state === "BLOCKED" &&
    response.record !== null;
}

function resultFromSession(
  session: StrategyOneTwoLegSessionRecord,
): StrategyOneTwoLegExecutionResult {
  return deepFreeze({
    session: clone(session),
    possibleExposure: session.state === "POSSIBLE_EXPOSURE",
    recoveryRequired:
      session.state === "POSSIBLE_EXPOSURE" ||
      session.state === "RECOVERY_REQUIRED",
    buyDispatchedAt: session.buyDispatchedAt,
    sellDispatchedAt: session.sellDispatchedAt,
    buyResponse: session.buyResponse ? clone(session.buyResponse) : null,
    sellResponse: session.sellResponse ? clone(session.sellResponse) : null,
  });
}

function requestHash(input: {
  readonly opportunityId: string;
  readonly lastLookDecisionId: string;
  readonly buyRequest: LiveExecutionRequest;
  readonly sellRequest: LiveExecutionRequest;
}): string {
  return createHash("sha256")
    .update(JSON.stringify({
      opportunityId: input.opportunityId,
      lastLookDecisionId: input.lastLookDecisionId,
      buyRequest: input.buyRequest,
      sellRequest: input.sellRequest,
    }))
    .digest("hex");
}

function isSnapshot(
  value: unknown,
): value is PersistedSnapshot {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const item =
    value as Partial<PersistedSnapshot>;

  return item.schemaVersion === "108.0" &&
    Number.isSafeInteger(item.savedAt) &&
    Array.isArray(item.sessions) &&
    item.sessions.every((session) =>
      typeof session === "object" &&
      session !== null &&
      (session as Partial<StrategyOneTwoLegSessionRecord>).schemaVersion ===
        "108.0" &&
      typeof (session as Partial<StrategyOneTwoLegSessionRecord>).sessionId ===
        "string");
}

function requireIdentifier(
  value: string,
  label: string,
): string {
  const normalized =
    value.trim();

  if (!/^[A-Za-z0-9_.:/-]{8,240}$/u.test(normalized)) {
    throw new Error(`Strategy #1 two-leg ${label} identity is invalid.`);
  }

  return normalized;
}

function validateTime(
  value: number,
): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("Strategy #1 two-leg timestamp must be positive.");
  }
}

function normalize(
  value: string,
): string {
  return value.trim().toLowerCase();
}

function normalizeMarket(
  value: string,
): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/gu, "");
}

function message(
  error: unknown,
): string {
  return error instanceof Error
    ? error.message
    : "Unknown Strategy #1 two-leg gateway failure.";
}

function clone<T>(
  value: T,
): T {
  return structuredClone(value);
}

function deepFreeze<T>(
  value: T,
): T {
  if (
    typeof value !== "object" ||
    value === null ||
    Object.isFrozen(value)
  ) {
    return value;
  }

  for (const nested of Object.values(value)) {
    deepFreeze(nested);
  }

  return Object.freeze(value);
}

export const strategyOneTwoLegLiveExecutionService =
  new StrategyOneTwoLegLiveExecutionService();
