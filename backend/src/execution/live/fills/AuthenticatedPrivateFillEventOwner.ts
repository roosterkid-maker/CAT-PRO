import {
  createHash,
} from "node:crypto";

import {
  resolve,
} from "node:path";

import {
  JsonlSnapshotStore,
} from "../../../core/persistence/JsonlSnapshotStore";

export type AuthenticatedFillVenue =
  | "binance"
  | "bybit"
  | "coindcx";

export type AuthenticatedOrderStatus =
  | "OPEN"
  | "PARTIALLY_FILLED"
  | "FILLED"
  | "CANCELLED"
  | "REJECTED";

export interface AuthenticatedPrivateStreamSession {
  readonly venue: AuthenticatedFillVenue;
  readonly accountFingerprint: string;
  readonly connectionId: string;
  readonly generation: number;
  readonly authenticatedAt: number;
  readonly expiresAt: number;
  readonly topics: readonly string[];
}

export interface PrivateFillOrderBinding {
  readonly lifecycleOrderId: string;
  readonly venue: AuthenticatedFillVenue;
  readonly accountFingerprint: string;
  readonly product: "SPOT";
  readonly market: string;
  readonly side:
    | "buy"
    | "sell";
  readonly requestedQuantity: number;
  readonly clientOrderId: string;
  readonly exchangeOrderId: string | null;
  readonly registeredAt: number;
}

export interface PrivateFillFeeComponent {
  readonly asset: string;
  readonly amount: number;
  readonly kind:
    | "TRADING"
    | "ADDITIONAL";
}

export interface AuthenticatedPrivateFill {
  readonly kind: "FILL";
  readonly venue: AuthenticatedFillVenue;
  readonly product: "SPOT";
  readonly market: string;
  readonly orderId: string;
  readonly clientOrderId: string | null;
  readonly side:
    | "buy"
    | "sell";
  readonly executionId: string;
  readonly price: number;
  readonly quantity: number;
  readonly quoteQuantity: number;
  readonly fees: readonly PrivateFillFeeComponent[];
  readonly maker: boolean;
  readonly executedAt: number;
  readonly sourceEventAt: number;
  readonly reportedCumulativeQuantity: number | null;
  readonly reportedRemainingQuantity: number | null;
  readonly reportedStatus: AuthenticatedOrderStatus;
}

export interface AuthenticatedPrivateOrderUpdate {
  readonly kind: "ORDER_STATUS";
  readonly venue: AuthenticatedFillVenue;
  readonly product: "SPOT";
  readonly market: string;
  readonly orderId: string;
  readonly clientOrderId: string | null;
  readonly side:
    | "buy"
    | "sell";
  readonly sourceEventAt: number;
  readonly reportedCumulativeQuantity: number;
  readonly reportedRemainingQuantity: number;
  readonly reportedAveragePrice: number;
  readonly reportedStatus: AuthenticatedOrderStatus;
}

export type AuthenticatedPrivateOrderEvent =
  | AuthenticatedPrivateFill
  | AuthenticatedPrivateOrderUpdate;

export interface AuthenticatedPrivateFillTimingObservation {
  readonly source:
    | "WEBSOCKET"
    | "REST_BACKFILL";
  readonly binding: PrivateFillOrderBinding;
  readonly event: AuthenticatedPrivateOrderEvent;
  readonly receivedAt: number;
}

export interface AuthenticatedPrivateFillTimingObserver {
  observePrivateEvent(input: AuthenticatedPrivateFillTimingObservation): void;
  recordObserverFailure(): void;
}

export interface AuthenticatedPrivateOrderState {
  readonly lifecycleOrderId: string;
  readonly venue: AuthenticatedFillVenue;
  readonly accountFingerprint: string;
  readonly market: string;
  readonly side:
    | "buy"
    | "sell";
  readonly requestedQuantity: number;
  readonly clientOrderId: string;
  readonly exchangeOrderId: string | null;
  readonly status: AuthenticatedOrderStatus;
  readonly filledQuantity: number;
  readonly remainingQuantity: number;
  readonly quoteQuantity: number;
  readonly averageFillPrice: number;
  readonly fees: readonly PrivateFillFeeComponent[];
  readonly fills: readonly AuthenticatedPrivateFill[];
  readonly reportedCumulativeQuantity: number | null;
  readonly lastStatusEventAt: number | null;
  readonly lastFillEventAt: number | null;
  readonly quantityReconciled: boolean;
  readonly authoritativeTerminal: boolean;
  readonly authoritativeFillComplete: boolean;
  readonly updatedAt: number;
}

export interface PrivateFillIngestResult {
  readonly outcome:
    | "APPLIED"
    | "DUPLICATE"
    | "OUT_OF_ORDER_IGNORED"
    | "STALE_SESSION"
    | "UNKNOWN_ORDER";
  readonly eventKey: string | null;
  readonly lifecycleOrderId: string | null;
  readonly state: AuthenticatedPrivateOrderState | null;
  readonly reason: string;
}

interface BindingJournalRecord {
  readonly version: "104.0";
  readonly type: "ORDER_BINDING";
  readonly capturedAt: number;
  readonly binding: PrivateFillOrderBinding;
}

interface EventJournalRecord {
  readonly version: "104.0";
  readonly type: "PRIVATE_EVENT";
  readonly capturedAt: number;
  readonly lifecycleOrderId: string;
  readonly accountFingerprint: string;
  readonly eventKey: string;
  readonly event: AuthenticatedPrivateOrderEvent;
}

interface ExchangeOrderBindingJournalRecord {
  readonly version: "105.0";
  readonly type: "EXCHANGE_ORDER_BINDING";
  readonly capturedAt: number;
  readonly lifecycleOrderId: string;
  readonly exchangeOrderId: string;
}

interface PreAcceptRejectionJournalRecord {
  readonly version: "106.0";
  readonly type: "PRE_ACCEPT_REJECTION";
  readonly capturedAt: number;
  readonly lifecycleOrderId: string;
  readonly exchangeHttpStatus: number;
  readonly exchangeCode: string;
  readonly evidenceDigest: string;
}

type PrivateFillJournalRecord =
  | BindingJournalRecord
  | EventJournalRecord
  | ExchangeOrderBindingJournalRecord
  | PreAcceptRejectionJournalRecord;

export interface PrivateFillBackfillRecord {
  readonly executionId: string;
  readonly orderId: string;
  readonly market: string;
  readonly price: number;
  readonly quantity: number;
  readonly quoteQuantity: number;
  readonly feeAsset: string;
  readonly feeAmount: number;
  readonly maker: boolean;
  readonly executedAt: number;
  readonly additionalFeeMetadataPresent: boolean;
}

interface MutableOrderState {
  binding: PrivateFillOrderBinding;
  status: AuthenticatedOrderStatus;
  fills: AuthenticatedPrivateFill[];
  reportedCumulativeQuantity: number | null;
  reportedRemainingQuantity: number | null;
  lastStatusEventAt: number | null;
  lastFillEventAt: number | null;
  updatedAt: number;
}

export interface AuthenticatedPrivateFillEventOwnerOptions {
  readonly filePath?: string;
  readonly maximumJournalRecords?: number;
  readonly timingObserver?: AuthenticatedPrivateFillTimingObserver;
}

const DEFAULT_FILE =
  resolve(
    process.cwd(),
    "logs",
    "live",
    "authenticated-private-fill-events.jsonl",
  );

const EPSILON =
  1e-10;

/**
 * V104 single owner for authenticated Binance/Bybit SPOT order updates.
 *
 * The owner has no order-submission method. A caller must first register a
 * durable CAT PRO order identity and then present evidence from the currently
 * authenticated private-stream generation. Every accepted event is appended
 * before state mutation, so a crash can replay without submitting anything.
 */
export class AuthenticatedPrivateFillEventOwner {
  private readonly sessions =
    new Map<string, AuthenticatedPrivateStreamSession>();

  private readonly bindings =
    new Map<string, PrivateFillOrderBinding>();

  private readonly exchangeOrderIndex =
    new Map<string, string>();

  private readonly clientOrderIndex =
    new Map<string, string>();

  private readonly states =
    new Map<string, MutableOrderState>();

  private readonly eventKeys =
    new Set<string>();

  private readonly preAcceptRejections =
    new Map<string, PreAcceptRejectionJournalRecord>();

  private readonly store:
    JsonlSnapshotStore<PrivateFillJournalRecord>;

  private readonly maximumJournalRecords:
    number;

  private journalRecords =
    0;

  private duplicates =
    0;

  private staleSessionEvents =
    0;

  private unknownOrderEvents =
    0;

  private outOfOrderStatusEvents =
    0;

  private timingObserver:
    AuthenticatedPrivateFillTimingObserver |
    undefined;

  constructor(
    options:
      AuthenticatedPrivateFillEventOwnerOptions = {},
  ) {
    this.maximumJournalRecords =
      options.maximumJournalRecords ??
      100_000;

    this.timingObserver =
      options.timingObserver;

    if (
      !Number.isSafeInteger(
        this.maximumJournalRecords,
      ) ||
      this.maximumJournalRecords <= 0
    ) {
      throw new Error(
        "Private fill-event journal capacity must be a positive integer.",
      );
    }

    this.store =
      new JsonlSnapshotStore({
        filePath:
          options.filePath ??
          DEFAULT_FILE,
        isPayload:
          isJournalRecord,
      });

    const records =
      this.store.readAll();

    for (const record of records) {
      this.applyJournalRecord(
        record,
      );
    }

    this.journalRecords =
      records.length;
  }

  setTimingObserver(
    observer:
      AuthenticatedPrivateFillTimingObserver |
      undefined,
  ): void {
    this.timingObserver =
      observer;
  }

  openAuthenticatedSession(
    session:
      AuthenticatedPrivateStreamSession,
    now = Date.now(),
  ): AuthenticatedPrivateStreamSession {
    const normalized =
      normalizeSession(
        session,
        now,
      );

    const key =
      sessionKey(
        normalized.venue,
        normalized.accountFingerprint,
      );

    const current =
      this.sessions.get(
        key,
      );

    if (
      current &&
      normalized.generation <=
        current.generation
    ) {
      throw new Error(
        "Authenticated private-stream generation must increase on reconnect.",
      );
    }

    this.sessions.set(
      key,
      normalized,
    );

    return clone(
      normalized,
    );
  }

  refreshAuthenticatedSession(
    candidate:
      AuthenticatedPrivateStreamSession,
    expiresAt: number,
    now = Date.now(),
  ): AuthenticatedPrivateStreamSession {
    requireTime(
      now,
      "private session refresh",
    );
    requireTime(
      expiresAt,
      "private session refreshed expiry",
    );

    const current =
      this.sessions.get(
        sessionKey(
          candidate.venue,
          candidate.accountFingerprint,
        ),
      );

    if (
      !current ||
      !sameSessionIdentity(
        current,
        candidate,
      ) ||
      current.expiresAt <
        now ||
      expiresAt <=
        now
    ) {
      throw new Error(
        "Only the current authenticated private-stream generation can refresh its lease.",
      );
    }

    const refreshed =
      normalizeSession(
        {
          ...current,
          expiresAt,
        },
        now,
      );

    this.sessions.set(
      sessionKey(
        refreshed.venue,
        refreshed.accountFingerprint,
      ),
      refreshed,
    );

    return clone(
      refreshed,
    );
  }

  closeAuthenticatedSession(
    candidate:
      AuthenticatedPrivateStreamSession,
  ): boolean {
    const key =
      sessionKey(
        candidate.venue,
        candidate.accountFingerprint,
      );
    const current =
      this.sessions.get(
        key,
      );

    if (
      !current ||
      !sameSessionIdentity(
        current,
        candidate,
      )
    ) {
      return false;
    }

    return this.sessions.delete(
      key,
    );
  }

  registerOrder(
    input:
      Omit<PrivateFillOrderBinding, "product">,
  ): PrivateFillOrderBinding {
    const binding =
      normalizeBinding({
        ...input,
        product:
          "SPOT",
      });

    const existing =
      this.bindings.get(
        binding.lifecycleOrderId,
      );

    if (existing) {
      if (
        canonical(existing) !==
        canonical(binding)
      ) {
        throw new Error(
          "Private fill owner order identity is immutable.",
        );
      }

      return clone(
        existing,
      );
    }

    this.assertOrderIndexesAvailable(
      binding,
    );

    this.append({
      version:
        "104.0",
      type:
        "ORDER_BINDING",
      capturedAt:
        binding.registeredAt,
      binding,
    });

    this.applyBinding(
      binding,
    );

    return clone(
      binding,
    );
  }

  attachExchangeOrderId(
    lifecycleOrderId: string,
    exchangeOrderId: string,
    capturedAt = Date.now(),
  ): PrivateFillOrderBinding {
    const lifecycleId =
      requireId(
        lifecycleOrderId,
        "lifecycle order",
      );
    const exchangeId =
      requireId(
        exchangeOrderId,
        "exchange order",
      );
    requireTime(
      capturedAt,
      "exchange-order binding capture",
    );

    const binding =
      this.bindings.get(
        lifecycleId,
      );

    if (!binding) {
      throw new Error(
        "Private fill owner cannot attach an exchange order ID without a durable lifecycle binding.",
      );
    }

    if (
      binding.exchangeOrderId ===
      exchangeId
    ) {
      return clone(
        binding,
      );
    }

    if (
      binding.exchangeOrderId !==
      null
    ) {
      throw new Error(
        "Private fill owner exchange-order identity is immutable after attachment.",
      );
    }

    this.assertExchangeOrderIndexAvailable(
      binding,
      exchangeId,
    );

    this.append({
      version:
        "105.0",
      type:
        "EXCHANGE_ORDER_BINDING",
      capturedAt,
      lifecycleOrderId:
        lifecycleId,
      exchangeOrderId:
        exchangeId,
    });

    return clone(
      this.applyExchangeOrderId(
        lifecycleId,
        exchangeId,
        capturedAt,
      ),
    );
  }

  recordConfirmedPreAcceptRejection(
    input: {
      readonly lifecycleOrderId: string;
      readonly exchangeHttpStatus: number;
      readonly exchangeCode: string;
      readonly evidenceDigest: string;
      readonly capturedAt: number;
    },
  ): AuthenticatedPrivateOrderState {
    const record =
      normalizePreAcceptRejection({
        version:
          "106.0",
        type:
          "PRE_ACCEPT_REJECTION",
        capturedAt:
          input.capturedAt,
        lifecycleOrderId:
          input.lifecycleOrderId,
        exchangeHttpStatus:
          input.exchangeHttpStatus,
        exchangeCode:
          input.exchangeCode,
        evidenceDigest:
          input.evidenceDigest,
      });
    const existing =
      this.preAcceptRejections.get(
        record.lifecycleOrderId,
      );

    if (existing) {
      if (
        canonical(existing) !==
          canonical(record)
      ) {
        throw new Error(
          "Private fill owner confirmed-reject evidence is immutable.",
        );
      }

      return clone(
        this.requireOrderState(
          record.lifecycleOrderId,
        ),
      );
    }

    this.assertPreAcceptRejectionSafe(
      record.lifecycleOrderId,
    );
    this.append(
      record,
    );

    return clone(
      this.applyPreAcceptRejection(
        record,
      ),
    );
  }

  listBackfillCandidates(
    venue: string,
    accountFingerprint: string,
  ): readonly AuthenticatedPrivateOrderState[] {
    const normalizedVenue =
      normalizeVenue(
        venue,
      );
    const fingerprint =
      normalizeFingerprint(
        accountFingerprint,
      );

    return freeze(
      Array.from(
        this.states.values(),
      )
        .filter(
          (state) =>
            state.binding.venue ===
              normalizedVenue &&
            state.binding.accountFingerprint ===
              fingerprint &&
            !this.buildState(
              state,
            ).authoritativeTerminal,
        )
        .map(
          (state) =>
            this.buildState(
              state,
            ),
        ),
    );
  }

  ingestRestBackfill(
    session:
      AuthenticatedPrivateStreamSession,
    lifecycleOrderId: string,
    records:
      readonly PrivateFillBackfillRecord[],
    receivedAt = Date.now(),
  ): readonly PrivateFillIngestResult[] {
    requireTime(
      receivedAt,
      "private REST backfill receipt",
    );

    const binding =
      this.bindings.get(
        requireId(
          lifecycleOrderId,
          "backfill lifecycle order",
        ),
      );

    if (!binding) {
      throw new Error(
        "Private REST backfill requires a durable CAT PRO order binding.",
      );
    }

    if (
      binding.exchangeOrderId ===
      null
    ) {
      throw new Error(
        "Private REST backfill requires an authoritative exchange order ID.",
      );
    }

    let cumulative =
      0;

    return [...records]
      .sort(
        (first, second) =>
          first.executedAt -
            second.executedAt ||
          first.executionId.localeCompare(
            second.executionId,
          ),
      )
      .map(
        (record) => {
          if (
            record.additionalFeeMetadataPresent
          ) {
            throw new Error(
              "Private REST backfill contains additional fee metadata that is not fully normalized.",
            );
          }

          if (
            normalizeMarket(
              record.market,
            ) !==
              binding.market ||
            requireId(
              record.orderId,
              "backfill exchange order",
            ) !==
              binding.exchangeOrderId
          ) {
            throw new Error(
              "Private REST backfill identity mismatches the durable CAT PRO order binding.",
            );
          }

          const quantity =
            positiveNumber(
              record.quantity,
              "backfill quantity",
            );
          const price =
            positiveNumber(
              record.price,
              "backfill price",
            );
          const quoteQuantity =
            positiveNumber(
              record.quoteQuantity,
              "backfill quote quantity",
            );
          cumulative =
            normalizeNumber(
              cumulative +
                quantity,
            );
          const remaining =
            normalizeNumber(
              Math.max(
                0,
                binding.requestedQuantity -
                  cumulative,
              ),
            );

          return this.ingest(
            session,
            freeze({
              kind:
                "FILL" as const,
              venue:
                binding.venue,
              product:
                "SPOT" as const,
              market:
                binding.market,
              orderId:
                binding.exchangeOrderId as string,
              clientOrderId:
                binding.clientOrderId,
              side:
                binding.side,
              executionId:
                requireId(
                  record.executionId,
                  "backfill execution",
                ),
              price,
              quantity,
              quoteQuantity,
              fees: [
                freeze({
                  asset:
                    requireAsset(
                      record.feeAsset,
                      "backfill fee asset",
                    ),
                  amount:
                    nonNegativeNumber(
                      record.feeAmount,
                      "backfill fee amount",
                    ),
                  kind:
                    "TRADING" as const,
                }),
              ],
              maker:
                record.maker ===
                true,
              executedAt:
                requireTime(
                  record.executedAt,
                  "backfill execution",
                ),
              sourceEventAt:
                requireTime(
                  record.executedAt,
                  "backfill source event",
                ),
              reportedCumulativeQuantity:
                cumulative,
              reportedRemainingQuantity:
                remaining,
              reportedStatus:
                remaining <=
                EPSILON
                  ? "FILLED" as const
                  : "PARTIALLY_FILLED" as const,
            }),
            receivedAt,
            "REST_BACKFILL",
          );
        },
      );
  }

  ingestBinanceExecutionReport(
    session:
      AuthenticatedPrivateStreamSession,
    payload: unknown,
    receivedAt = Date.now(),
  ): PrivateFillIngestResult {
    return this.ingest(
      session,
      normalizeBinanceExecutionReport(
        payload,
      ),
      receivedAt,
      "WEBSOCKET",
    );
  }

  ingestCoinDCXOrderMessage(
    session:
      AuthenticatedPrivateStreamSession,
    payload: unknown,
    receivedAt = Date.now(),
  ): readonly PrivateFillIngestResult[] {
    return normalizeCoinDCXOrderMessage(
      payload,
    ).map(
      (event) =>
        this.ingest(
          session,
          event,
          receivedAt,
          "WEBSOCKET",
        ),
    );
  }

  ingestCoinDCXTradeMessage(
    session:
      AuthenticatedPrivateStreamSession,
    payload: unknown,
    receivedAt = Date.now(),
  ): readonly PrivateFillIngestResult[] {
    return normalizeCoinDCXTradeMessage(
      payload,
      ({
        orderId,
        clientOrderId,
      }) =>
        this.findBindingSideByIdentity(
          "coindcx",
          session.accountFingerprint,
          orderId,
          clientOrderId,
        ),
    ).map(
      (event) =>
        this.ingest(
          session,
          event,
          receivedAt,
          "WEBSOCKET",
        ),
    );
  }

  ingestBybitExecutionMessage(
    session:
      AuthenticatedPrivateStreamSession,
    payload: unknown,
    receivedAt = Date.now(),
  ): readonly PrivateFillIngestResult[] {
    return normalizeBybitExecutionMessage(
      payload,
    ).map(
      (event) =>
        this.ingest(
          session,
          event,
          receivedAt,
          "WEBSOCKET",
        ),
    );
  }

  ingestBybitOrderMessage(
    session:
      AuthenticatedPrivateStreamSession,
    payload: unknown,
    receivedAt = Date.now(),
  ): readonly PrivateFillIngestResult[] {
    return normalizeBybitOrderMessage(
      payload,
    ).map(
      (event) =>
        this.ingest(
          session,
          event,
          receivedAt,
          "WEBSOCKET",
        ),
    );
  }

  getOrder(
    lifecycleOrderId: string,
  ): AuthenticatedPrivateOrderState | null {
    const state =
      this.states.get(
        requireId(
          lifecycleOrderId,
          "lifecycle order",
        ),
      );

    return state
      ? this.buildState(
          state,
        )
      : null;
  }

  isVenueReady(
    venue: string,
    now = Date.now(),
  ): boolean {
    const normalizedVenue =
      normalizeVenue(
        venue,
      );

    return Array.from(
      this.sessions.values(),
    ).some(
      (session) =>
        session.venue ===
          normalizedVenue &&
        session.expiresAt >=
          now &&
        hasRequiredTopics(
          session,
        ),
    );
  }

  getDiagnostics(
    now = Date.now(),
  ) {
    const sessions =
      Array.from(
        this.sessions.values(),
      );

    const orders =
      Array.from(
        this.states.values(),
      ).map(
        (state) =>
          this.buildState(
            state,
          ),
      );

    return freeze({
      version:
        "104.0" as const,
      generatedAt:
        now,
      journalRecords:
        this.journalRecords,
      registeredOrders:
        this.bindings.size,
      trackedOrders:
        orders.length,
      uniqueFillEvents:
        orders.reduce(
          (total, order) =>
            total +
            order.fills.length,
          0,
        ),
      duplicates:
        this.duplicates,
      staleSessionEvents:
        this.staleSessionEvents,
      unknownOrderEvents:
        this.unknownOrderEvents,
      outOfOrderStatusEvents:
        this.outOfOrderStatusEvents,
      authoritativeTerminalOrders:
        orders.filter(
          (order) =>
            order.authoritativeTerminal,
        ).length,
      confirmedPreAcceptRejections:
        this.preAcceptRejections.size,
      activeSessions:
        sessions.filter(
          (session) =>
            session.expiresAt >=
              now &&
            hasRequiredTopics(
              session,
            ),
        ).length,
      venues: {
        binance:
          this.isVenueReady(
            "binance",
            now,
          ),
        bybit:
          this.isVenueReady(
            "bybit",
            now,
          ),
        coindcx:
          this.isVenueReady(
            "coindcx",
            now,
          ),
      },
      persistence:
        this.store.getDiagnostics(),
      safety: {
        journalBeforeStateMutation:
          true,
        acknowledgementIsNotFillProof:
          true,
        exactExecutionIdDeduplication:
          true,
        reconnectGenerationIsolation:
          true,
        unknownOrdersNeverCreated:
          true,
        orderSubmissionAvailable:
          false,
      },
    });
  }

  private ingest(
    session:
      AuthenticatedPrivateStreamSession,
    event:
      AuthenticatedPrivateOrderEvent,
    receivedAt: number,
    source:
      "WEBSOCKET" |
      "REST_BACKFILL",
  ): PrivateFillIngestResult {
    requireTime(
      receivedAt,
      "private event receipt",
    );

    const normalizedEvent =
      normalizeOwnedEvent(
        event,
      );

    if (
      normalizedEvent.sourceEventAt >
        receivedAt +
          5_000 ||
      (
        normalizedEvent.kind ===
          "FILL" &&
        normalizedEvent.executedAt >
          receivedAt +
            5_000
      )
    ) {
      throw new Error(
        "Authenticated private event timestamp is implausibly ahead of receipt time.",
      );
    }

    const active =
      this.currentSession(
        session,
        receivedAt,
      );

    if (!active) {
      this.staleSessionEvents +=
        1;

      return result(
        "STALE_SESSION",
        null,
        null,
        null,
        "Event did not come from the current authenticated private-stream generation.",
      );
    }

    if (
      normalizedEvent.venue !==
      active.venue
    ) {
      throw new Error(
        "Private event venue does not match authenticated session.",
      );
    }

    const binding =
      this.findBinding(
        normalizedEvent,
        active.accountFingerprint,
      );

    if (!binding) {
      this.unknownOrderEvents +=
        1;

      return result(
        "UNKNOWN_ORDER",
        null,
        null,
        null,
        "No durable CAT PRO order identity matches this private event.",
      );
    }

    this.validateEventIdentity(
      binding,
      normalizedEvent,
    );

    const eventKey =
      createEventKey(
        active.accountFingerprint,
        normalizedEvent,
      );

    if (
      this.eventKeys.has(
        eventKey,
      )
    ) {
      this.duplicates +=
        1;

      return result(
        "DUPLICATE",
        eventKey,
        binding.lifecycleOrderId,
        this.getOrder(
          binding.lifecycleOrderId,
        ),
        "Duplicate private event was ignored idempotently.",
      );
    }

    this.append({
      version:
        "104.0",
      type:
        "PRIVATE_EVENT",
      capturedAt:
        receivedAt,
      lifecycleOrderId:
        binding.lifecycleOrderId,
      accountFingerprint:
        active.accountFingerprint,
      eventKey,
      event:
        normalizedEvent,
    });

    const outOfOrder =
      this.applyEvent(
        binding.lifecycleOrderId,
        active.accountFingerprint,
      eventKey,
      normalizedEvent,
        receivedAt,
      );

    if (outOfOrder) {
      this.outOfOrderStatusEvents +=
        1;
    }

    const appliedResult = result(
      outOfOrder
        ? "OUT_OF_ORDER_IGNORED"
        : "APPLIED",
      eventKey,
      binding.lifecycleOrderId,
      this.getOrder(
        binding.lifecycleOrderId,
      ),
      outOfOrder
        ? "Older order-status evidence was journaled but could not regress current state."
        : "Authenticated private event was durably journaled and applied.",
    );

    if (
      this.timingObserver
    ) {
      try {
        this.timingObserver
          .observePrivateEvent({
            source,
            binding:
              clone(binding),
            event:
              clone(normalizedEvent),
            receivedAt,
          });
      } catch {
        try {
          this.timingObserver
            .recordObserverFailure();
        } catch {
          /* Timing diagnostics can never invalidate a durably owned fill. */
        }
      }
    }

    return appliedResult;
  }

  private currentSession(
    candidate:
      AuthenticatedPrivateStreamSession,
    now: number,
  ): AuthenticatedPrivateStreamSession | null {
    let normalized:
      AuthenticatedPrivateStreamSession;

    try {
      normalized =
        normalizeSession(
          candidate,
          Math.min(
            now,
            candidate.authenticatedAt,
          ),
        );
    } catch {
      return null;
    }

    const active =
      this.sessions.get(
        sessionKey(
          normalized.venue,
          normalized.accountFingerprint,
        ),
      );

    return active &&
      canonical(
        active,
      ) ===
        canonical(
          normalized,
        ) &&
      active.expiresAt >=
        now &&
      hasRequiredTopics(
        active,
      )
      ? active
      : null;
  }

  private findBinding(
    event:
      AuthenticatedPrivateOrderEvent,
    accountFingerprint: string,
  ): PrivateFillOrderBinding | null {
    const exchangeMatch =
      this.exchangeOrderIndex.get(
        exchangeIndexKey(
          event.venue,
          accountFingerprint,
          event.orderId,
        ),
      );

    if (exchangeMatch) {
      return this.bindings.get(
        exchangeMatch,
      ) ??
      null;
    }

    if (!event.clientOrderId) {
      return null;
    }

    const clientMatch =
      this.clientOrderIndex.get(
        clientIndexKey(
          event.venue,
          accountFingerprint,
          event.clientOrderId,
        ),
      );

    if (!clientMatch) {
      return null;
    }

    const binding =
      this.bindings.get(
        clientMatch,
      );

    return binding ??
      null;
  }

  private findBindingSideByIdentity(
    venue: AuthenticatedFillVenue,
    accountFingerprint: string,
    orderId: string,
    clientOrderId: string | null,
  ): "buy" | "sell" | null {
    const normalizedAccount =
      normalizeFingerprint(
        accountFingerprint,
      );
    const exchangeMatch =
      this.exchangeOrderIndex.get(
        exchangeIndexKey(
          venue,
          normalizedAccount,
          orderId,
        ),
      );

    if (exchangeMatch) {
      return this.bindings.get(
        exchangeMatch,
      )?.side ?? null;
    }

    if (!clientOrderId) {
      return null;
    }

    const clientMatch =
      this.clientOrderIndex.get(
        clientIndexKey(
          venue,
          normalizedAccount,
          clientOrderId,
        ),
      );

    return clientMatch
      ? this.bindings.get(
          clientMatch,
        )?.side ?? null
      : null;
  }

  private validateEventIdentity(
    binding:
      PrivateFillOrderBinding,
    event:
      AuthenticatedPrivateOrderEvent,
  ): void {
    if (
      binding.venue !==
        event.venue ||
      binding.market !==
        event.market ||
      binding.side !==
        event.side ||
      (
        binding.exchangeOrderId !==
          null &&
        binding.exchangeOrderId !==
          event.orderId
      ) ||
      (
        event.clientOrderId !==
          null &&
        event.clientOrderId !==
          binding.clientOrderId
      )
    ) {
      throw new Error(
        "Authenticated private event identity mismatches durable CAT PRO order binding.",
      );
    }
  }

  private applyJournalRecord(
    record:
      PrivateFillJournalRecord,
  ): void {
    if (
      record.type ===
      "ORDER_BINDING"
    ) {
      this.applyBinding(
        normalizeBinding(
          record.binding,
        ),
      );

      return;
    }

    if (
      record.type ===
      "EXCHANGE_ORDER_BINDING"
    ) {
      this.applyExchangeOrderId(
        record.lifecycleOrderId,
        record.exchangeOrderId,
        record.capturedAt,
      );

      return;
    }

    if (
      record.type ===
      "PRE_ACCEPT_REJECTION"
    ) {
      this.applyPreAcceptRejection(
        record,
      );

      return;
    }

    if (
      this.eventKeys.has(
        record.eventKey,
      )
    ) {
      return;
    }

    this.applyEvent(
      record.lifecycleOrderId,
      normalizeFingerprint(
        record.accountFingerprint,
      ),
      record.eventKey,
      normalizeOwnedEvent(
        record.event,
      ),
      record.capturedAt,
    );
  }

  private applyBinding(
    binding:
      PrivateFillOrderBinding,
  ): void {
    const existing =
      this.bindings.get(
        binding.lifecycleOrderId,
      );

    if (existing) {
      if (
        canonical(existing) !==
        canonical(binding)
      ) {
        throw new Error(
          "Private fill owner journal contains conflicting order identities.",
        );
      }

      return;
    }

    this.assertOrderIndexesAvailable(
      binding,
    );

    this.bindings.set(
      binding.lifecycleOrderId,
      freeze(
        clone(binding),
      ),
    );

    this.clientOrderIndex.set(
      clientIndexKey(
        binding.venue,
        binding.accountFingerprint,
        binding.clientOrderId,
      ),
      binding.lifecycleOrderId,
    );

    if (binding.exchangeOrderId) {
      this.exchangeOrderIndex.set(
        exchangeIndexKey(
          binding.venue,
          binding.accountFingerprint,
          binding.exchangeOrderId,
        ),
        binding.lifecycleOrderId,
      );
    }

    this.states.set(
      binding.lifecycleOrderId,
      {
        binding:
          clone(binding),
        status:
          "OPEN",
        fills:
          [],
        reportedCumulativeQuantity:
          null,
        reportedRemainingQuantity:
          null,
        lastStatusEventAt:
          null,
        lastFillEventAt:
          null,
        updatedAt:
          binding.registeredAt,
      },
    );
  }

  private applyExchangeOrderId(
    lifecycleOrderId: string,
    exchangeOrderId: string,
    capturedAt: number,
  ): PrivateFillOrderBinding {
    const state =
      this.states.get(
        lifecycleOrderId,
      );

    if (!state) {
      throw new Error(
        "Private fill journal exchange-order attachment has no lifecycle binding.",
      );
    }

    if (
      state.binding.exchangeOrderId !==
        null &&
      state.binding.exchangeOrderId !==
        exchangeOrderId
    ) {
      throw new Error(
        "Private fill journal contains conflicting exchange-order identities.",
      );
    }

    this.assertExchangeOrderIndexAvailable(
      state.binding,
      exchangeOrderId,
    );

    const updated =
      freeze({
        ...state.binding,
        exchangeOrderId,
      });

    state.binding =
      updated;
    state.updatedAt =
      Math.max(
        state.updatedAt,
        capturedAt,
      );
    this.bindings.set(
      lifecycleOrderId,
      updated,
    );
    this.exchangeOrderIndex.set(
      exchangeIndexKey(
        updated.venue,
        updated.accountFingerprint,
        exchangeOrderId,
      ),
      lifecycleOrderId,
    );

    return updated;
  }

  private applyPreAcceptRejection(
    record:
      PreAcceptRejectionJournalRecord,
  ): AuthenticatedPrivateOrderState {
    const normalized =
      normalizePreAcceptRejection(
        record,
      );
    const existing =
      this.preAcceptRejections.get(
        normalized.lifecycleOrderId,
      );

    if (existing) {
      if (
        canonical(existing) !==
          canonical(normalized)
      ) {
        throw new Error(
          "Private fill owner journal contains conflicting confirmed-reject evidence.",
        );
      }

      return this.requireOrderState(
        normalized.lifecycleOrderId,
      );
    }

    this.assertPreAcceptRejectionSafe(
      normalized.lifecycleOrderId,
    );
    const state =
      this.states.get(
        normalized.lifecycleOrderId,
      ) as MutableOrderState;

    state.status =
      "REJECTED";
    state.reportedCumulativeQuantity =
      0;
    state.reportedRemainingQuantity =
      state.binding.requestedQuantity;
    state.lastStatusEventAt =
      normalized.capturedAt;
    state.updatedAt =
      Math.max(
        state.updatedAt,
        normalized.capturedAt,
      );
    this.preAcceptRejections.set(
      normalized.lifecycleOrderId,
      freeze(
        clone(normalized),
      ),
    );

    return this.buildState(
      state,
    );
  }

  private assertPreAcceptRejectionSafe(
    lifecycleOrderId: string,
  ): void {
    const state =
      this.states.get(
        lifecycleOrderId,
      );

    if (!state) {
      throw new Error(
        "Private fill owner cannot terminalize a confirmed rejection without a durable lifecycle binding.",
      );
    }

    const current =
      this.buildState(
        state,
      );

    if (
      current.exchangeOrderId !==
        null ||
      current.filledQuantity !==
        0 ||
      current.fills.length !==
        0 ||
      current.status !==
        "OPEN"
    ) {
      throw new Error(
        "Private fill owner confirmed-reject terminalization requires an open zero-fill binding without an exchange order ID.",
      );
    }
  }

  private requireOrderState(
    lifecycleOrderId: string,
  ): AuthenticatedPrivateOrderState {
    const state =
      this.states.get(
        lifecycleOrderId,
      );

    if (!state) {
      throw new Error(
        "Private fill owner lifecycle state is unavailable.",
      );
    }

    return this.buildState(
      state,
    );
  }

  private applyEvent(
    lifecycleOrderId: string,
    accountFingerprint: string,
    eventKey: string,
    event:
      AuthenticatedPrivateOrderEvent,
    capturedAt: number,
  ): boolean {
    const state =
      this.states.get(
        lifecycleOrderId,
      );

    if (
      !state ||
      state.binding.accountFingerprint !==
        accountFingerprint
    ) {
      throw new Error(
        "Private fill journal event has no exact durable order binding.",
      );
    }

    if (
      state.binding.exchangeOrderId ===
      null
    ) {
      const updatedBinding =
        freeze({
          ...state.binding,
          exchangeOrderId:
            event.orderId,
        });

      state.binding =
        updatedBinding;

      this.bindings.set(
        lifecycleOrderId,
        updatedBinding,
      );

      this.exchangeOrderIndex.set(
        exchangeIndexKey(
          updatedBinding.venue,
          updatedBinding.accountFingerprint,
          event.orderId,
        ),
        lifecycleOrderId,
      );
    }

    this.eventKeys.add(
      eventKey,
    );

    let outOfOrder =
      false;

    if (
      event.kind ===
      "FILL"
    ) {
      state.fills.push(
        freeze(
          clone(event),
        ),
      );
      state.fills.sort(
        (first, second) =>
          first.executedAt -
            second.executedAt ||
          first.executionId.localeCompare(
            second.executionId,
          ),
      );
      state.lastFillEventAt =
        Math.max(
          state.lastFillEventAt ??
            0,
          event.sourceEventAt,
        );
      state.reportedCumulativeQuantity =
        maximumNullable(
          state.reportedCumulativeQuantity,
          event.reportedCumulativeQuantity,
        );
      state.reportedRemainingQuantity =
        minimumNullable(
          state.reportedRemainingQuantity,
          event.reportedRemainingQuantity,
        );
      this.promoteStatus(
        state,
        event.reportedStatus,
        event.sourceEventAt,
      );
    } else if (
      state.lastStatusEventAt !==
        null &&
      event.sourceEventAt <
        state.lastStatusEventAt
    ) {
      outOfOrder =
        true;
    } else {
      state.reportedCumulativeQuantity =
        event.reportedCumulativeQuantity;
      state.reportedRemainingQuantity =
        event.reportedRemainingQuantity;
      this.promoteStatus(
        state,
        event.reportedStatus,
        event.sourceEventAt,
      );
    }

    state.updatedAt =
      Math.max(
        state.updatedAt,
        capturedAt,
        event.sourceEventAt,
      );

    return outOfOrder;
  }

  private promoteStatus(
    state:
      MutableOrderState,
    incoming:
      AuthenticatedOrderStatus,
    sourceEventAt: number,
  ): void {
    if (
      state.status !==
        "FILLED" &&
      (
        incoming ===
          "FILLED" ||
        !isTerminal(
          state.status,
        )
      )
    ) {
      state.status =
        incoming;
    }

    state.lastStatusEventAt =
      Math.max(
        state.lastStatusEventAt ??
          0,
        sourceEventAt,
      );
  }

  private buildState(
    state:
      MutableOrderState,
  ): AuthenticatedPrivateOrderState {
    const filledQuantity =
      normalizeNumber(
        state.fills.reduce(
          (total, fill) =>
            total +
            fill.quantity,
          0,
        ),
      );

    const quoteQuantity =
      normalizeNumber(
        state.fills.reduce(
          (total, fill) =>
            total +
            fill.quoteQuantity,
          0,
        ),
      );

    const reported =
      state.reportedCumulativeQuantity;

    const quantityReconciled =
      reported ===
        null
        ? state.fills.length ===
            0
        : nearlyEqual(
            reported,
            filledQuantity,
          );

    const remainingQuantity =
      normalizeNumber(
        Math.max(
          0,
          state.binding.requestedQuantity -
            filledQuantity,
        ),
      );

    const fees =
      aggregateFees(
        state.fills,
      );

    const authoritativeTerminal =
      isTerminal(
        state.status,
      ) &&
      quantityReconciled &&
      (
        state.reportedRemainingQuantity ===
          null ||
        nearlyEqual(
          state.reportedRemainingQuantity,
          remainingQuantity,
        )
      );

    const authoritativeFillComplete =
      state.status ===
        "FILLED" &&
      authoritativeTerminal &&
      nearlyEqual(
        filledQuantity,
        state.binding.requestedQuantity,
      );

    return freeze({
      lifecycleOrderId:
        state.binding.lifecycleOrderId,
      venue:
        state.binding.venue,
      accountFingerprint:
        state.binding.accountFingerprint,
      market:
        state.binding.market,
      side:
        state.binding.side,
      requestedQuantity:
        state.binding.requestedQuantity,
      clientOrderId:
        state.binding.clientOrderId,
      exchangeOrderId:
        state.binding.exchangeOrderId,
      status:
        state.status,
      filledQuantity,
      remainingQuantity,
      quoteQuantity,
      averageFillPrice:
        filledQuantity >
          EPSILON
          ? normalizeNumber(
              quoteQuantity /
                filledQuantity,
            )
          : 0,
      fees,
      fills:
        clone(
          state.fills,
        ),
      reportedCumulativeQuantity:
        reported,
      lastStatusEventAt:
        state.lastStatusEventAt,
      lastFillEventAt:
        state.lastFillEventAt,
      quantityReconciled,
      authoritativeTerminal,
      authoritativeFillComplete,
      updatedAt:
        state.updatedAt,
    });
  }

  private assertOrderIndexesAvailable(
    binding:
      PrivateFillOrderBinding,
  ): void {
    const clientKey =
      clientIndexKey(
        binding.venue,
        binding.accountFingerprint,
        binding.clientOrderId,
      );

    const clientOwner =
      this.clientOrderIndex.get(
        clientKey,
      );

    if (
      clientOwner &&
      clientOwner !==
        binding.lifecycleOrderId
    ) {
      throw new Error(
        "Private fill owner client-order identity is already registered.",
      );
    }

    if (binding.exchangeOrderId) {
      const exchangeOwner =
        this.exchangeOrderIndex.get(
          exchangeIndexKey(
            binding.venue,
            binding.accountFingerprint,
            binding.exchangeOrderId,
          ),
        );

      if (
        exchangeOwner &&
        exchangeOwner !==
          binding.lifecycleOrderId
      ) {
        throw new Error(
          "Private fill owner exchange-order identity is already registered.",
        );
      }
    }
  }

  private assertExchangeOrderIndexAvailable(
    binding:
      PrivateFillOrderBinding,
    exchangeOrderId: string,
  ): void {
    const exchangeOwner =
      this.exchangeOrderIndex.get(
        exchangeIndexKey(
          binding.venue,
          binding.accountFingerprint,
          exchangeOrderId,
        ),
      );

    if (
      exchangeOwner &&
      exchangeOwner !==
        binding.lifecycleOrderId
    ) {
      throw new Error(
        "Private fill owner exchange-order identity is already registered.",
      );
    }
  }

  private append(
    record:
      PrivateFillJournalRecord,
  ): void {
    if (
      this.journalRecords >=
      this.maximumJournalRecords
    ) {
      throw new Error(
        "Private fill-event journal capacity is exhausted; event was not applied.",
      );
    }

    this.store.append(
      freeze(
        clone(record),
      ),
    );

    this.journalRecords +=
      1;
  }
}

export function normalizeBinanceExecutionReport(
  payload: unknown,
): AuthenticatedPrivateOrderEvent {
  const item =
    requireRecord(
      payload,
      "Binance execution report",
    );

  if (
    item.e !==
    "executionReport"
  ) {
    throw new Error(
      "Binance private event is not an executionReport.",
    );
  }

  const executionType =
    requireText(
      item.x,
      "Binance execution type",
    ).toUpperCase();

  const common = {
    venue:
      "binance" as const,
    product:
      "SPOT" as const,
    market:
      normalizeMarket(
        item.s,
      ),
    orderId:
      requireId(
        item.i,
        "Binance order",
      ),
    clientOrderId:
      optionalId(
        item.c,
      ),
    side:
      normalizeSide(
        item.S,
      ),
    sourceEventAt:
      requireTime(
        numberValue(
          item.E,
          "Binance event time",
        ),
        "Binance event",
      ),
    reportedCumulativeQuantity:
      nonNegativeNumber(
        item.z,
        "Binance cumulative fill quantity",
      ),
    reportedRemainingQuantity:
      normalizeNumber(
        Math.max(
          0,
          nonNegativeNumber(
            item.q,
            "Binance order quantity",
          ) -
            nonNegativeNumber(
              item.z,
              "Binance cumulative fill quantity",
            ),
        ),
      ),
    reportedStatus:
      normalizeBinanceStatus(
        item.X,
      ),
  };

  if (
    executionType !==
    "TRADE"
  ) {
    return freeze({
      kind:
        "ORDER_STATUS" as const,
      ...common,
      reportedAveragePrice:
        averagePrice(
          item.Z,
          item.z,
        ),
    });
  }

  const feeAmount =
    nonNegativeNumber(
      item.n,
      "Binance commission",
    );

  const feeAsset =
    feeAmount <=
      EPSILON
      ? optionalAsset(
          item.N,
        ) ??
        "NONE"
      : requireAsset(
          item.N,
          "Binance commission asset",
        );

  return freeze({
    kind:
      "FILL" as const,
    ...common,
    executionId:
      requireId(
        item.t,
        "Binance trade",
      ),
    price:
      positiveNumber(
        item.L,
        "Binance last fill price",
      ),
    quantity:
      positiveNumber(
        item.l,
        "Binance last fill quantity",
      ),
    quoteQuantity:
      positiveNumber(
        item.Y,
        "Binance last fill quote quantity",
      ),
    fees: [
      {
        asset:
          feeAsset,
        amount:
          feeAmount,
        kind:
          "TRADING" as const,
      },
    ],
    maker:
      item.m ===
      true,
    executedAt:
      requireTime(
        numberValue(
          item.T,
          "Binance transaction time",
        ),
        "Binance transaction",
      ),
  });
}

export function normalizeBybitExecutionMessage(
  payload: unknown,
): readonly AuthenticatedPrivateFill[] {
  const message =
    requireRecord(
      payload,
      "Bybit execution message",
    );

  const topic =
    requireText(
      message.topic,
      "Bybit execution topic",
    ).toLowerCase();

  if (
    topic !==
      "execution" &&
    topic !==
      "execution.spot"
  ) {
    throw new Error(
      "Bybit private message is not a SPOT execution topic.",
    );
  }

  const creationTime =
    requireTime(
      numberValue(
        message.creationTime,
        "Bybit execution creation time",
      ),
      "Bybit execution creation",
    );

  if (
    !Array.isArray(
      message.data,
    ) ||
    message.data.length ===
      0
  ) {
    throw new Error(
      "Bybit execution message has no executions.",
    );
  }

  return freeze(
    message.data.map(
      (value) => {
        const item =
          requireRecord(
            value,
            "Bybit execution",
          );

        if (
          String(
            item.category,
          ).toLowerCase() !==
            "spot" ||
          String(
            item.execType ??
              "Trade",
          ).toUpperCase() !==
            "TRADE"
        ) {
          throw new Error(
            "Bybit fill owner accepts only SPOT Trade executions.",
          );
        }

        const remaining =
          nonNegativeNumber(
            item.leavesQty,
            "Bybit remaining quantity",
          );

        return freeze({
          kind:
            "FILL" as const,
          venue:
            "bybit" as const,
          product:
            "SPOT" as const,
          market:
            normalizeMarket(
              item.symbol,
            ),
          orderId:
            requireId(
              item.orderId,
              "Bybit order",
            ),
          clientOrderId:
            optionalId(
              item.orderLinkId,
            ),
          side:
            normalizeSide(
              item.side,
            ),
          executionId:
            requireId(
              item.execId,
              "Bybit execution",
            ),
          price:
            positiveNumber(
              item.execPrice,
              "Bybit execution price",
            ),
          quantity:
            positiveNumber(
              item.execQty,
              "Bybit execution quantity",
            ),
          quoteQuantity:
            positiveNumber(
              item.execValue,
              "Bybit execution value",
            ),
          fees:
            bybitFees(
              item,
            ),
          maker:
            item.isMaker ===
            true,
          executedAt:
            requireTime(
              numberValue(
                item.execTime,
                "Bybit execution time",
              ),
              "Bybit execution",
            ),
          sourceEventAt:
            creationTime,
          reportedCumulativeQuantity:
            null,
          reportedRemainingQuantity:
            remaining,
          reportedStatus:
            remaining <=
              EPSILON
              ? "FILLED" as const
              : "PARTIALLY_FILLED" as const,
        });
      },
    ),
  );
}

export function normalizeBybitOrderMessage(
  payload: unknown,
): readonly AuthenticatedPrivateOrderUpdate[] {
  const message =
    requireRecord(
      payload,
      "Bybit order message",
    );

  const topic =
    requireText(
      message.topic,
      "Bybit order topic",
    ).toLowerCase();

  if (
    topic !==
      "order" &&
    topic !==
      "order.spot"
  ) {
    throw new Error(
      "Bybit private message is not a SPOT order topic.",
    );
  }

  if (
    !Array.isArray(
      message.data,
    ) ||
    message.data.length ===
      0
  ) {
    throw new Error(
      "Bybit order message has no order updates.",
    );
  }

  return freeze(
    message.data.map(
      (value) => {
        const item =
          requireRecord(
            value,
            "Bybit order update",
          );

        if (
          String(
            item.category,
          ).toLowerCase() !==
          "spot"
        ) {
          throw new Error(
            "Bybit fill owner accepts only SPOT order updates.",
          );
        }

        return freeze({
          kind:
            "ORDER_STATUS" as const,
          venue:
            "bybit" as const,
          product:
            "SPOT" as const,
          market:
            normalizeMarket(
              item.symbol,
            ),
          orderId:
            requireId(
              item.orderId,
              "Bybit order",
            ),
          clientOrderId:
            optionalId(
              item.orderLinkId,
            ),
          side:
            normalizeSide(
              item.side,
            ),
          sourceEventAt:
            requireTime(
              numberValue(
                item.updatedTime,
                "Bybit order update time",
              ),
              "Bybit order update",
            ),
          reportedCumulativeQuantity:
            nonNegativeNumber(
              item.cumExecQty,
              "Bybit cumulative execution quantity",
            ),
          reportedRemainingQuantity:
            nonNegativeNumber(
              item.leavesQty,
              "Bybit remaining quantity",
            ),
          reportedAveragePrice:
            optionalNonNegativeNumber(
              item.avgPrice,
              "Bybit average price",
            ),
          reportedStatus:
            normalizeBybitStatus(
              item.orderStatus,
            ),
        });
      },
    ),
  );
}

export function normalizeCoinDCXOrderMessage(
  payload: unknown,
): readonly AuthenticatedPrivateOrderUpdate[] {
  return freeze(
    coinDCXMessageItems(
      payload,
      "CoinDCX order update",
    ).map(
      (item) => {
        const totalQuantity =
          nonNegativeNumber(
            item.total_quantity,
            "CoinDCX total quantity",
          );
        const remainingQuantity =
          nonNegativeNumber(
            item.remaining_quantity,
            "CoinDCX remaining quantity",
          );

        if (
          remainingQuantity >
          totalQuantity +
            EPSILON
        ) {
          throw new Error(
            "CoinDCX remaining quantity exceeds total quantity.",
          );
        }

        return freeze({
          kind:
            "ORDER_STATUS" as const,
          venue:
            "coindcx" as const,
          product:
            "SPOT" as const,
          market:
            normalizeMarket(
              item.market,
            ),
          orderId:
            requireId(
              item.id,
              "CoinDCX order",
            ),
          clientOrderId:
            optionalId(
              item.client_order_id,
            ),
          side:
            normalizeSide(
              item.side,
            ),
          sourceEventAt:
            coinDCXTimestamp(
              item.updated_at ??
                item.created_at,
              "CoinDCX order update",
            ),
          reportedCumulativeQuantity:
            normalizeNumber(
              Math.max(
                0,
                totalQuantity -
                  remainingQuantity,
              ),
            ),
          reportedRemainingQuantity:
            remainingQuantity,
          reportedAveragePrice:
            nonNegativeNumber(
              item.avg_price,
              "CoinDCX average price",
            ),
          reportedStatus:
            normalizeCoinDCXStatus(
              item.status,
            ),
        });
      },
    ),
  );
}

export function normalizeCoinDCXTradeMessage(
  payload: unknown,
  resolveSide?: (
    identity: Readonly<{
      orderId: string;
      clientOrderId: string | null;
    }>,
  ) => "buy" | "sell" | null,
): readonly AuthenticatedPrivateFill[] {
  return freeze(
    coinDCXMessageItems(
      payload,
      "CoinDCX trade update",
    ).map(
      (item) => {
        const orderId =
          requireId(
            item.o,
            "CoinDCX order",
          );
        const clientOrderId =
          optionalId(
            item.c,
          );
        const payloadSide =
          item.side ??
          item.S;
        const side =
          payloadSide ===
            undefined ||
          payloadSide ===
            null ||
          String(
            payloadSide,
          ).trim() ===
            ""
            ? resolveSide?.({
                orderId,
                clientOrderId,
              }) ?? null
            : normalizeSide(
                payloadSide,
              );

        if (!side) {
          throw new Error(
            "CoinDCX trade side is absent and no durable CAT PRO order binding resolves it.",
          );
        }

        const market =
          normalizeMarket(
            item.s,
          );
        const price =
          positiveNumber(
            item.p,
            "CoinDCX trade price",
          );
        const quantity =
          positiveNumber(
            item.q,
            "CoinDCX trade quantity",
          );

        return freeze({
          kind:
            "FILL" as const,
          venue:
            "coindcx" as const,
          product:
            "SPOT" as const,
          market,
          orderId:
            orderId,
          clientOrderId:
            clientOrderId,
          side:
            side,
          executionId:
            requireId(
              item.t,
              "CoinDCX trade",
            ),
          price,
          quantity,
          quoteQuantity:
            normalizeNumber(
              price *
                quantity,
            ),
          fees: [
            {
              asset:
                quoteAssetFromMarket(
                  market,
                ),
              amount:
                nonNegativeNumber(
                  item.f,
                  "CoinDCX trade fee",
                ),
              kind:
                "TRADING" as const,
            },
          ],
          maker:
            item.m ===
            true,
          executedAt:
            coinDCXTimestamp(
              item.T,
              "CoinDCX trade",
            ),
          sourceEventAt:
            coinDCXTimestamp(
              item.T,
              "CoinDCX trade event",
            ),
          reportedCumulativeQuantity:
            null,
          reportedRemainingQuantity:
            null,
          reportedStatus:
            normalizeCoinDCXStatus(
              item.x ??
                "partially_filled",
            ),
        });
      },
    ),
  );
}

function normalizeSession(
  input:
    AuthenticatedPrivateStreamSession,
  now: number,
): AuthenticatedPrivateStreamSession {
  requireTime(
    now,
    "session observation",
  );

  const session =
    freeze({
      venue:
        normalizeVenue(
          input.venue,
        ),
      accountFingerprint:
        normalizeFingerprint(
          input.accountFingerprint,
        ),
      connectionId:
        requireId(
          input.connectionId,
          "private connection",
        ),
      generation:
        input.generation,
      authenticatedAt:
        requireTime(
          input.authenticatedAt,
          "private authentication",
        ),
      expiresAt:
        requireTime(
          input.expiresAt,
          "private session expiry",
        ),
      topics:
        Array.from(
          new Set(
            input.topics.map(
              (topic) =>
                requireText(
                  topic,
                  "private topic",
                ).toLowerCase(),
            ),
          ),
        ).sort(),
    });

  if (
    !Number.isSafeInteger(
      session.generation,
    ) ||
    session.generation <= 0 ||
    session.authenticatedAt >
      now ||
    session.expiresAt <=
      session.authenticatedAt ||
    !hasRequiredTopics(
      session,
    )
  ) {
    throw new Error(
      "Authenticated private-stream session evidence is invalid or incomplete.",
    );
  }

  return session;
}

function sameSessionIdentity(
  first:
    AuthenticatedPrivateStreamSession,
  second:
    AuthenticatedPrivateStreamSession,
): boolean {
  return first.venue ===
      second.venue &&
    first.accountFingerprint ===
      second.accountFingerprint &&
    first.connectionId ===
      second.connectionId &&
    first.generation ===
      second.generation &&
    first.authenticatedAt ===
      second.authenticatedAt &&
    canonical(
      first.topics,
    ) ===
      canonical(
        second.topics,
      );
}

function normalizeBinding(
  input:
    PrivateFillOrderBinding,
): PrivateFillOrderBinding {
  const requestedQuantity =
    positiveNumber(
      input.requestedQuantity,
      "private order requested quantity",
    );

  return freeze({
    lifecycleOrderId:
      requireId(
        input.lifecycleOrderId,
        "lifecycle order",
      ),
    venue:
      normalizeVenue(
        input.venue,
      ),
    accountFingerprint:
      normalizeFingerprint(
        input.accountFingerprint,
      ),
    product:
      "SPOT" as const,
    market:
      normalizeMarket(
        input.market,
      ),
    side:
      normalizeSide(
        input.side,
      ),
    requestedQuantity,
    clientOrderId:
      requireId(
        input.clientOrderId,
        "client order",
      ),
    exchangeOrderId:
      input.exchangeOrderId ===
        null
        ? null
        : requireId(
            input.exchangeOrderId,
            "exchange order",
          ),
    registeredAt:
      requireTime(
        input.registeredAt,
        "private order registration",
      ),
  });
}

function normalizePreAcceptRejection(
  input:
    PreAcceptRejectionJournalRecord,
): PreAcceptRejectionJournalRecord {
  const exchangeHttpStatus =
    numberValue(
      input.exchangeHttpStatus,
      "confirmed-reject HTTP status",
    );
  const exchangeCode =
    requireText(
      input.exchangeCode,
      "confirmed-reject exchange code",
    );
  const evidenceDigest =
    requireText(
      input.evidenceDigest,
      "confirmed-reject evidence digest",
    ).toLowerCase();

  if (
    input.version !==
      "106.0" ||
    input.type !==
      "PRE_ACCEPT_REJECTION" ||
    !Number.isSafeInteger(
      exchangeHttpStatus,
    ) ||
    ![
      400,
      401,
      403,
      409,
      418,
      429,
    ].includes(
      exchangeHttpStatus,
    ) ||
    !/^-?\d{1,12}$/u.test(
      exchangeCode,
    ) ||
    !/^[a-f0-9]{64}$/u.test(
      evidenceDigest,
    )
  ) {
    throw new Error(
      "Confirmed pre-accept rejection evidence is invalid.",
    );
  }

  return freeze({
    version:
      "106.0",
    type:
      "PRE_ACCEPT_REJECTION",
    capturedAt:
      requireTime(
        input.capturedAt,
        "confirmed-reject capture",
      ),
    lifecycleOrderId:
      requireId(
        input.lifecycleOrderId,
        "confirmed-reject lifecycle order",
      ),
    exchangeHttpStatus,
    exchangeCode,
    evidenceDigest,
  });
}

function hasRequiredTopics(
  session:
    AuthenticatedPrivateStreamSession,
): boolean {
  const topics =
    new Set(
      session.topics.map(
        (topic) =>
          topic.toLowerCase(),
      ),
    );

  if (
    session.venue ===
    "binance"
  ) {
    return topics.has(
      "executionreport",
    );
  }

  if (
    session.venue ===
    "coindcx"
  ) {
    return topics.has(
        "order-update",
      ) &&
      topics.has(
        "trade-update",
      );
  }

  return (
        topics.has(
          "execution",
        ) ||
        topics.has(
          "execution.spot",
        )
      ) &&
      (
        topics.has(
          "order",
        ) ||
        topics.has(
          "order.spot",
        )
      );
}

function coinDCXMessageItems(
  payload: unknown,
  label: string,
): readonly Readonly<Record<string, unknown>>[] {
  const parsedPayload =
    parseCoinDCXSocketPayload(
      payload,
      label,
    );
  const raw =
    Array.isArray(
      parsedPayload,
    )
      ? parsedPayload
      : (() => {
          const wrapper =
            requireRecord(
              parsedPayload,
              label,
            );

          const data =
            parseCoinDCXSocketPayload(
              wrapper.data,
              label,
              false,
            );

          return Array.isArray(
            data,
          )
            ? data
            : data !==
                undefined
              ? [data]
              : [wrapper];
        })();

  if (
    raw.length ===
    0
  ) {
    throw new Error(
      `${label} has no records.`,
    );
  }

  return raw.map(
    (value) =>
      requireRecord(
        value,
        label,
      ),
  );
}

function parseCoinDCXSocketPayload(
  value: unknown,
  label: string,
  required = true,
): unknown {
  if (
    typeof value !==
      "string"
  ) {
    if (
      required &&
      value ===
        undefined
    ) {
      throw new Error(
        `${label} is absent.`,
      );
    }

    return value;
  }

  const normalized =
    value.trim();

  if (!normalized) {
    if (required) {
      throw new Error(
        `${label} is empty.`,
      );
    }

    return undefined;
  }

  try {
    return JSON.parse(
      normalized,
    ) as unknown;
  } catch {
    throw new Error(
      `${label} contains malformed JSON.`,
    );
  }
}

function coinDCXTimestamp(
  value: unknown,
  label: string,
): number {
  if (
    typeof value ===
      "string" &&
    value.trim()
  ) {
    const parsed =
      Date.parse(
        value,
      );

    if (
      Number.isSafeInteger(
        parsed,
      ) &&
      parsed >
        0
    ) {
      return parsed;
    }
  }

  const parsed =
    Math.floor(
      numberValue(
        value,
        label,
      ),
    );

  return requireTime(
    parsed,
    label,
  );
}

function quoteAssetFromMarket(
  market: string,
): string {
  for (const asset of [
    "USDT",
    "USDC",
    "INR",
    "BTC",
    "ETH",
  ] as const) {
    if (
      market.endsWith(
        asset,
      ) &&
      market.length >
        asset.length
    ) {
      return asset;
    }
  }

  throw new Error(
    "CoinDCX trade fee asset cannot be derived from the market.",
  );
}

function createEventKey(
  accountFingerprint: string,
  event:
    AuthenticatedPrivateOrderEvent,
): string {
  if (
    event.kind ===
    "FILL"
  ) {
    return [
      event.venue,
      accountFingerprint,
      event.market,
      "fill",
      event.executionId,
    ].join(
      "|",
    );
  }

  return [
    event.venue,
    accountFingerprint,
    event.market,
    "status",
    createHash(
      "sha256",
    )
      .update(
        canonical(event),
      )
      .digest(
        "hex",
      ),
  ].join(
    "|",
  );
}

function aggregateFees(
  fills:
    readonly AuthenticatedPrivateFill[],
): readonly PrivateFillFeeComponent[] {
  const totals =
    new Map<string, PrivateFillFeeComponent>();

  for (const fill of fills) {
    for (const fee of fill.fees) {
      const key =
        `${fee.kind}|${fee.asset}`;
      const existing =
        totals.get(
          key,
        );

      totals.set(
        key,
        {
          ...fee,
          amount:
            normalizeNumber(
              (
                existing?.amount ??
                0
              ) +
                fee.amount,
            ),
        },
      );
    }
  }

  return freeze(
    Array.from(
      totals.values(),
    ).sort(
      (first, second) =>
        first.kind.localeCompare(
          second.kind,
        ) ||
        first.asset.localeCompare(
          second.asset,
        ),
    ),
  );
}

function bybitFees(
  item:
    Readonly<Record<string, unknown>>,
): readonly PrivateFillFeeComponent[] {
  const fees:
    PrivateFillFeeComponent[] = [
    {
      asset:
        requireAsset(
          item.feeCurrency,
          "Bybit fee currency",
        ),
      amount:
        nonNegativeNumber(
          item.execFee,
          "Bybit execution fee",
        ),
      kind:
        "TRADING",
    },
  ];

  if (
    item.extraFees ===
      "" ||
    item.extraFees ===
      null ||
    item.extraFees ===
      undefined
  ) {
    return freeze(
      fees,
    );
  }

  if (
    !Array.isArray(
      item.extraFees,
    )
  ) {
    throw new Error(
      "Bybit additional fee metadata is malformed.",
    );
  }

  for (const value of item.extraFees) {
    const extra =
      requireRecord(
        value,
        "Bybit additional fee",
      );

    fees.push({
      asset:
        requireAsset(
          extra.feeCoin,
          "Bybit additional fee asset",
        ),
      amount:
        nonNegativeNumber(
          extra.fee,
          "Bybit additional fee amount",
        ),
      kind:
        "ADDITIONAL",
    });
  }

  return freeze(
    fees,
  );
}

function normalizeBinanceStatus(
  value: unknown,
): AuthenticatedOrderStatus {
  switch (
    requireText(
      value,
      "Binance order status",
    ).toUpperCase()
  ) {
    case "NEW":
      return "OPEN";
    case "PARTIALLY_FILLED":
      return "PARTIALLY_FILLED";
    case "FILLED":
      return "FILLED";
    case "CANCELED":
    case "EXPIRED":
    case "EXPIRED_IN_MATCH":
      return "CANCELLED";
    case "REJECTED":
      return "REJECTED";
    default:
      throw new Error(
        "Binance order status is unsupported.",
      );
  }
}

function normalizeBybitStatus(
  value: unknown,
): AuthenticatedOrderStatus {
  switch (
    requireText(
      value,
      "Bybit order status",
    ).toUpperCase()
  ) {
    case "NEW":
    case "UNTRIGGERED":
      return "OPEN";
    case "PARTIALLYFILLED":
      return "PARTIALLY_FILLED";
    case "FILLED":
      return "FILLED";
    case "CANCELLED":
    case "CANCELED":
    case "PARTIALLYFILLEDCANCELED":
    case "DEACTIVATED":
      return "CANCELLED";
    case "REJECTED":
      return "REJECTED";
    default:
      throw new Error(
        "Bybit order status is unsupported.",
      );
  }
}

function normalizeCoinDCXStatus(
  value: unknown,
): AuthenticatedOrderStatus {
  switch (
    requireText(
      value,
      "CoinDCX order status",
    ).toLowerCase()
  ) {
    case "init":
    case "open":
      return "OPEN";
    case "partially_filled":
      return "PARTIALLY_FILLED";
    case "filled":
      return "FILLED";
    case "cancelled":
    case "partially_cancelled":
      return "CANCELLED";
    case "rejected":
      return "REJECTED";
    default:
      throw new Error(
        "CoinDCX order status is unsupported.",
      );
  }
}

function normalizeOwnedEvent(
  value:
    AuthenticatedPrivateOrderEvent,
): AuthenticatedPrivateOrderEvent {
  const item =
    requireRecord(
      value,
      "normalized private order event",
    );
  const kind =
    requireText(
      item.kind,
      "private order event kind",
    );
  const venue =
    normalizeVenue(
      requireText(
        item.venue,
        "private order event venue",
      ),
    );
  const common = {
    venue,
    product:
      item.product ===
        "SPOT"
        ? "SPOT" as const
        : fail<"SPOT">(
            "Private fill owner accepts SPOT events only.",
          ),
    market:
      normalizeMarket(
        item.market,
      ),
    orderId:
      requireId(
        item.orderId,
        "private event order",
      ),
    clientOrderId:
      optionalId(
        item.clientOrderId,
      ),
    side:
      normalizeSide(
        item.side,
      ),
    sourceEventAt:
      requireTime(
        numberValue(
          item.sourceEventAt,
          "private source event time",
        ),
        "private source event",
      ),
    reportedStatus:
      normalizeOwnedStatus(
        item.reportedStatus,
      ),
  };

  if (
    kind ===
    "ORDER_STATUS"
  ) {
    return freeze({
      kind:
        "ORDER_STATUS" as const,
      ...common,
      reportedCumulativeQuantity:
        nonNegativeNumber(
          item.reportedCumulativeQuantity,
          "reported cumulative quantity",
        ),
      reportedRemainingQuantity:
        nonNegativeNumber(
          item.reportedRemainingQuantity,
          "reported remaining quantity",
        ),
      reportedAveragePrice:
        nonNegativeNumber(
          item.reportedAveragePrice,
          "reported average price",
        ),
    });
  }

  if (
    kind !==
    "FILL"
  ) {
    throw new Error(
      "Private order event kind is unsupported.",
    );
  }

  if (
    !Array.isArray(
      item.fees,
    ) ||
    item.fees.length ===
      0
  ) {
    throw new Error(
      "Authenticated private fill requires explicit fee evidence.",
    );
  }

  const fees =
    item.fees.map(
      (value) => {
        const fee =
          requireRecord(
            value,
            "private fill fee",
          );
        const feeKind =
          requireText(
            fee.kind,
            "private fill fee kind",
          );

        if (
          feeKind !==
            "TRADING" &&
          feeKind !==
            "ADDITIONAL"
        ) {
          throw new Error(
            "Private fill fee kind is unsupported.",
          );
        }

        const normalizedKind:
          PrivateFillFeeComponent["kind"] =
          feeKind ===
            "TRADING"
            ? "TRADING"
            : "ADDITIONAL";

        return freeze({
          asset:
            requireAsset(
              fee.asset,
              "private fill fee asset",
            ),
          amount:
            nonNegativeNumber(
              fee.amount,
              "private fill fee amount",
            ),
          kind:
            normalizedKind,
        });
      },
    );

  return freeze({
    kind:
      "FILL" as const,
    ...common,
    executionId:
      requireId(
        item.executionId,
        "private execution",
      ),
    price:
      positiveNumber(
        item.price,
        "private fill price",
      ),
    quantity:
      positiveNumber(
        item.quantity,
        "private fill quantity",
      ),
    quoteQuantity:
      positiveNumber(
        item.quoteQuantity,
        "private fill quote quantity",
      ),
    fees,
    maker:
      typeof item.maker ===
        "boolean"
        ? item.maker
        : fail<boolean>(
            "Private fill maker flag must be boolean.",
          ),
    executedAt:
      requireTime(
        numberValue(
          item.executedAt,
          "private fill execution time",
        ),
        "private fill execution",
      ),
    reportedCumulativeQuantity:
      nullableNonNegativeNumber(
        item.reportedCumulativeQuantity,
        "reported cumulative quantity",
      ),
    reportedRemainingQuantity:
      nullableNonNegativeNumber(
        item.reportedRemainingQuantity,
        "reported remaining quantity",
      ),
  });
}

function normalizeOwnedStatus(
  value: unknown,
): AuthenticatedOrderStatus {
  const status =
    requireText(
      value,
      "private order status",
    );

  if (
    status ===
      "OPEN" ||
    status ===
      "PARTIALLY_FILLED" ||
    status ===
      "FILLED" ||
    status ===
      "CANCELLED" ||
    status ===
      "REJECTED"
  ) {
    return status;
  }

  throw new Error(
    "Private order status is unsupported.",
  );
}

function isTerminal(
  value:
    AuthenticatedOrderStatus,
): boolean {
  return value ===
    "FILLED" ||
    value ===
    "CANCELLED" ||
    value ===
    "REJECTED";
}

function result(
  outcome:
    PrivateFillIngestResult["outcome"],
  eventKey: string | null,
  lifecycleOrderId: string | null,
  state:
    AuthenticatedPrivateOrderState | null,
  reason: string,
): PrivateFillIngestResult {
  return freeze({
    outcome,
    eventKey,
    lifecycleOrderId,
    state,
    reason,
  });
}

function sessionKey(
  venue:
    AuthenticatedFillVenue,
  accountFingerprint: string,
): string {
  return `${venue}|${accountFingerprint}`;
}

function exchangeIndexKey(
  venue:
    AuthenticatedFillVenue,
  accountFingerprint: string,
  orderId: string,
): string {
  return `${sessionKey(venue, accountFingerprint)}|exchange|${orderId}`;
}

function clientIndexKey(
  venue:
    AuthenticatedFillVenue,
  accountFingerprint: string,
  clientOrderId: string,
): string {
  return `${sessionKey(venue, accountFingerprint)}|client|${clientOrderId}`;
}

function normalizeVenue(
  value: string,
): AuthenticatedFillVenue {
  const normalized =
    value
      .trim()
      .toLowerCase();

  if (
    normalized !==
      "binance" &&
    normalized !==
      "bybit" &&
    normalized !==
      "coindcx"
  ) {
    throw new Error(
      "Authenticated private fill owner supports Binance, Bybit and CoinDCX only.",
    );
  }

  return normalized;
}

function normalizeFingerprint(
  value: string,
): string {
  const normalized =
    value
      .trim()
      .toLowerCase();

  if (
    !/^[a-f0-9]{16,128}$/u.test(
      normalized,
    )
  ) {
    throw new Error(
      "Private account fingerprint must be a non-secret hexadecimal digest.",
    );
  }

  return normalized;
}

function normalizeMarket(
  value: unknown,
): string {
  const market =
    requireText(
      value,
      "private event market",
    )
      .toUpperCase()
      .replace(
        /[^A-Z0-9]/gu,
        "",
      );

  if (
    !/^[A-Z0-9]{4,30}$/u.test(
      market,
    )
  ) {
    throw new Error(
      "Private event market is invalid.",
    );
  }

  return market;
}

function normalizeSide(
  value: unknown,
): "buy" | "sell" {
  const side =
    requireText(
      value,
      "private event side",
    ).toLowerCase();

  if (
    side !==
      "buy" &&
    side !==
      "sell"
  ) {
    throw new Error(
      "Private event side must be buy or sell.",
    );
  }

  return side;
}

function requireRecord(
  value: unknown,
  label: string,
): Readonly<Record<string, unknown>> {
  if (
    typeof value !==
      "object" ||
    value ===
      null ||
    Array.isArray(
      value,
    )
  ) {
    throw new Error(
      `${label} must be an object.`,
    );
  }

  return value as Readonly<Record<string, unknown>>;
}

function requireText(
  value: unknown,
  label: string,
): string {
  if (
    typeof value !==
    "string"
  ) {
    throw new Error(
      `${label} must be text.`,
    );
  }

  const text =
    value.trim();

  if (!text) {
    throw new Error(
      `${label} is required.`,
    );
  }

  return text;
}

function requireId(
  value: unknown,
  label: string,
): string {
  const text =
    typeof value ===
      "number" &&
    Number.isSafeInteger(
      value,
    )
      ? String(
          value,
        )
      : requireText(
          value,
          label,
        );

  if (
    text.length >
      200 ||
    /[\r\n|]/u.test(
      text,
    )
  ) {
    throw new Error(
      `${label} ID is invalid.`,
    );
  }

  return text;
}

function optionalId(
  value: unknown,
): string | null {
  return value ===
      null ||
    value ===
      undefined ||
    String(
      value,
    ).trim() ===
      ""
    ? null
    : requireId(
        value,
        "optional private event",
      );
}

function requireAsset(
  value: unknown,
  label: string,
): string {
  const asset =
    requireText(
      value,
      label,
    ).toUpperCase();

  if (
    !/^[A-Z0-9]{2,20}$/u.test(
      asset,
    )
  ) {
    throw new Error(
      `${label} is invalid.`,
    );
  }

  return asset;
}

function optionalAsset(
  value: unknown,
): string | null {
  return value ===
      null ||
    value ===
      undefined ||
    String(
      value,
    ).trim() ===
      ""
    ? null
    : requireAsset(
        value,
        "optional fee asset",
      );
}

function numberValue(
  value: unknown,
  label: string,
): number {
  const number =
    Number(
      value,
    );

  if (
    !Number.isFinite(
      number,
    )
  ) {
    throw new Error(
      `${label} must be finite.`,
    );
  }

  return number;
}

function positiveNumber(
  value: unknown,
  label: string,
): number {
  const number =
    numberValue(
      value,
      label,
    );

  if (
    number <=
    0
  ) {
    throw new Error(
      `${label} must be positive.`,
    );
  }

  return normalizeNumber(
    number,
  );
}

function nonNegativeNumber(
  value: unknown,
  label: string,
): number {
  const number =
    numberValue(
      value,
      label,
    );

  if (
    number <
    0
  ) {
    throw new Error(
      `${label} must be non-negative.`,
    );
  }

  return normalizeNumber(
    number,
  );
}

function optionalNonNegativeNumber(
  value: unknown,
  label: string,
): number {
  if (
    value ===
      null ||
    value ===
      undefined ||
    String(
      value,
    ).trim() ===
      ""
  ) {
    return 0;
  }

  return nonNegativeNumber(
    value,
    label,
  );
}

function nullableNonNegativeNumber(
  value: unknown,
  label: string,
): number | null {
  return value ===
    null
    ? null
    : nonNegativeNumber(
        value,
        label,
      );
}

function requireTime(
  value: number,
  label: string,
): number {
  if (
    !Number.isSafeInteger(
      value,
    ) ||
    value <=
      0
  ) {
    throw new Error(
      `${label} timestamp must be a positive integer.`,
    );
  }

  return value;
}

function averagePrice(
  quote: unknown,
  quantity: unknown,
): number {
  const cumulativeQuote =
    nonNegativeNumber(
      quote,
      "cumulative quote quantity",
    );
  const cumulativeQuantity =
    nonNegativeNumber(
      quantity,
      "cumulative fill quantity",
    );

  return cumulativeQuantity >
    EPSILON
    ? normalizeNumber(
        cumulativeQuote /
          cumulativeQuantity,
      )
    : 0;
}

function maximumNullable(
  first: number | null,
  second: number | null,
): number | null {
  if (first === null) {
    return second;
  }

  if (second === null) {
    return first;
  }

  return Math.max(
    first,
    second,
  );
}

function minimumNullable(
  first: number | null,
  second: number | null,
): number | null {
  if (first === null) {
    return second;
  }

  if (second === null) {
    return first;
  }

  return Math.min(
    first,
    second,
  );
}

function nearlyEqual(
  first: number,
  second: number,
): boolean {
  return Math.abs(
    first -
      second,
  ) <=
    Math.max(
      EPSILON,
      Math.max(
        Math.abs(
          first,
        ),
        Math.abs(
          second,
        ),
      ) *
        1e-9,
    );
}

function normalizeNumber(
  value: number,
): number {
  return Math.abs(
    value,
  ) <=
    EPSILON
    ? 0
    : Number(
        value.toFixed(
          12,
        ),
      );
}

function canonical(
  value: unknown,
): string {
  return JSON.stringify(
    value,
  );
}

function isJournalRecord(
  value: unknown,
): value is PrivateFillJournalRecord {
  if (
    typeof value !==
      "object" ||
    value ===
      null ||
    Array.isArray(
      value,
    )
  ) {
    return false;
  }

  const record =
    value as Readonly<Record<string, unknown>>;

  if (
    (
      record.version !==
        "104.0" &&
      record.version !==
        "105.0" &&
      record.version !==
        "106.0"
    ) ||
    (
      record.type !==
        "ORDER_BINDING" &&
      record.type !==
        "PRIVATE_EVENT" &&
      record.type !==
        "EXCHANGE_ORDER_BINDING" &&
      record.type !==
        "PRE_ACCEPT_REJECTION"
    )
  ) {
    return false;
  }

  try {
    requireTime(
      numberValue(
        record.capturedAt,
        "private journal capture time",
      ),
      "private journal capture",
    );

    if (
      record.type ===
      "ORDER_BINDING"
    ) {
      normalizeBinding(
        record.binding as PrivateFillOrderBinding,
      );

      return record.version ===
        "104.0";
    }

    if (
      record.type ===
      "EXCHANGE_ORDER_BINDING"
    ) {
      return record.version ===
          "105.0" &&
        requireId(
          record.lifecycleOrderId,
          "journal lifecycle order",
        ).length >
          0 &&
        requireId(
          record.exchangeOrderId,
          "journal exchange order",
        ).length >
          0;
    }

    if (
      record.type ===
      "PRE_ACCEPT_REJECTION"
    ) {
      normalizePreAcceptRejection(
        record as unknown as PreAcceptRejectionJournalRecord,
      );

      return record.version ===
        "106.0";
    }

    const lifecycleOrderId =
      requireId(
        record.lifecycleOrderId,
        "journal lifecycle order",
      );
    const accountFingerprint =
      normalizeFingerprint(
        requireText(
          record.accountFingerprint,
          "journal account fingerprint",
        ),
      );
    const event =
      normalizeOwnedEvent(
        record.event as AuthenticatedPrivateOrderEvent,
      );
    const eventKey =
      requireText(
        record.eventKey,
        "journal event key",
      );

    return lifecycleOrderId.length >
        0 &&
      record.version ===
        "104.0" &&
      eventKey.length <=
        1_000 &&
      !/[\r\n]/u.test(
        eventKey,
      ) &&
      eventKey ===
        createEventKey(
          accountFingerprint,
          event,
        );
  } catch {
    return false;
  }
}

function fail<T>(
  message: string,
): T {
  throw new Error(
    message,
  );
}

function clone<T>(
  value: T,
): T {
  return structuredClone(
    value,
  );
}

function freeze<T>(
  value: T,
): T {
  if (
    typeof value !==
      "object" ||
    value ===
      null ||
    Object.isFrozen(
      value,
    )
  ) {
    return value;
  }

  for (const nested of Object.values(value)) {
    freeze(
      nested,
    );
  }

  return Object.freeze(
    value,
  );
}

export const authenticatedPrivateFillEventOwner =
  new AuthenticatedPrivateFillEventOwner();
