import {
  createHash,
  createHmac,
} from "node:crypto";

import WebSocket from "ws";

import {
  binanceCredentialsProvider,
  type BinanceCredentials,
} from "../../../exchanges/binance/api/BinanceCredentialsProvider";

import {
  bybitCredentialsProvider,
  type BybitCredentials,
} from "../../../exchanges/bybit/api/BybitCredentialsProvider";

import {
  BinanceSpotOrderFillFeeSource,
  BybitOrderFillFeeSource,
  type OrderFillFeeSource,
  type VenueOrderFill,
} from "../evidence/OrderFillFeeEvidenceService";

import {
  authenticatedPrivateFillEventOwner,
  type AuthenticatedFillVenue,
  type AuthenticatedPrivateFillEventOwner,
  type AuthenticatedPrivateStreamSession,
} from "./AuthenticatedPrivateFillEventOwner";

type PrivateStreamPhase =
  | "DISABLED"
  | "NOT_CONFIGURED"
  | "STOPPED"
  | "CONNECTING"
  | "AUTHENTICATING"
  | "SUBSCRIBING"
  | "BACKFILLING"
  | "READY"
  | "BACKOFF";

interface SocketHandlers {
  readonly onOpen: () => void;
  readonly onMessage: (
    message: string,
  ) => void;
  readonly onClose: (
    code: number,
    reason: string,
  ) => void;
  readonly onError: (
    error: Error,
  ) => void;
  readonly onPing: (
    data: Buffer,
  ) => void;
  readonly onPong: () => void;
}

export interface PrivateStreamSocket {
  sendText(
    value: string,
  ): void;
  sendPong(
    value: Buffer,
  ): void;
  close(): void;
  terminate(): void;
}

export interface PrivateStreamSocketFactory {
  connect(
    url: string,
    handlers: SocketHandlers,
  ): PrivateStreamSocket;
}

interface CredentialSource<Credentials> {
  isConfigured(): boolean;
  getCredentials(): Credentials;
}

interface PrivateFillOwnerPort {
  openAuthenticatedSession(
    session:
      AuthenticatedPrivateStreamSession,
    now?: number,
  ): AuthenticatedPrivateStreamSession;
  refreshAuthenticatedSession(
    session:
      AuthenticatedPrivateStreamSession,
    expiresAt: number,
    now?: number,
  ): AuthenticatedPrivateStreamSession;
  closeAuthenticatedSession(
    session:
      AuthenticatedPrivateStreamSession,
  ): boolean;
  listBackfillCandidates(
    venue: string,
    accountFingerprint: string,
  ): ReturnType<
    AuthenticatedPrivateFillEventOwner["listBackfillCandidates"]
  >;
  ingestRestBackfill(
    session:
      AuthenticatedPrivateStreamSession,
    lifecycleOrderId: string,
    records:
      readonly VenueOrderFill[],
    receivedAt?: number,
  ): unknown;
  ingestBinanceExecutionReport(
    session:
      AuthenticatedPrivateStreamSession,
    payload: unknown,
    receivedAt?: number,
  ): unknown;
  ingestBybitExecutionMessage(
    session:
      AuthenticatedPrivateStreamSession,
    payload: unknown,
    receivedAt?: number,
  ): unknown;
  ingestBybitOrderMessage(
    session:
      AuthenticatedPrivateStreamSession,
    payload: unknown,
    receivedAt?: number,
  ): unknown;
}

export interface AuthenticatedPrivateFillStreamConfiguration {
  readonly enabled?: boolean;
  readonly binanceUrl?: string;
  readonly bybitUrl?: string;
  readonly reconnectBaseDelayMs?: number;
  readonly reconnectMaximumDelayMs?: number;
  readonly handshakeTimeoutMs?: number;
  readonly heartbeatTimeoutMs?: number;
  readonly sessionLeaseMs?: number;
  readonly maximumBufferedMessages?: number;
  readonly maximumBackfillOrders?: number;
}

interface VenueState {
  readonly venue: AuthenticatedFillVenue;
  phase: PrivateStreamPhase;
  socket: PrivateStreamSocket | null;
  session: AuthenticatedPrivateStreamSession | null;
  generation: number;
  connectionId: string | null;
  requestId: string | null;
  subscriptionId: number | null;
  accountFingerprint: string | null;
  reconnectAttempts: number;
  reconnectTimer: NodeJS.Timeout | null;
  heartbeatTimer: NodeJS.Timeout | null;
  lastSignalAt: number | null;
  lastReadyAt: number | null;
  lastDisconnectedAt: number | null;
  lastBackfillAt: number | null;
  lastBackfillOrders: number;
  backfilledFills: number;
  messagesReceived: number;
  eventsApplied: number;
  bufferedMessages: unknown[];
  lastError: string | null;
  work: Promise<void>;
}

const BINANCE_DEFAULT_URL =
  "wss://ws-api.binance.com:443/ws-api/v3?returnRateLimits=false";

const BYBIT_DEFAULT_URL =
  "wss://stream.bybit.com/v5/private";

/**
 * V105 read-only authenticated transport owner for Binance/Bybit SPOT fills.
 *
 * A venue becomes ready only after authentication, subscription ACK and a
 * bounded signed-REST gap backfill. This class has no order, cancel, transfer,
 * withdrawal or balance-mutation method.
 */
export class AuthenticatedPrivateFillStreamService {
  private readonly enabled: boolean;
  private readonly binanceUrl: string;
  private readonly bybitUrl: string;
  private readonly reconnectBaseDelayMs: number;
  private readonly reconnectMaximumDelayMs: number;
  private readonly handshakeTimeoutMs: number;
  private readonly heartbeatTimeoutMs: number;
  private readonly sessionLeaseMs: number;
  private readonly maximumBufferedMessages: number;
  private readonly maximumBackfillOrders: number;
  private readonly states =
    new Map<AuthenticatedFillVenue, VenueState>();
  private running =
    false;

  constructor(
    configuration:
      AuthenticatedPrivateFillStreamConfiguration = {},
    private readonly sockets:
      PrivateStreamSocketFactory = new WsPrivateStreamSocketFactory(),
    private readonly owner:
      PrivateFillOwnerPort = authenticatedPrivateFillEventOwner,
    private readonly binanceCredentials:
      CredentialSource<BinanceCredentials> = binanceCredentialsProvider,
    private readonly bybitCredentials:
      CredentialSource<BybitCredentials> = bybitCredentialsProvider,
    private readonly backfillSources:
      readonly OrderFillFeeSource[] = [
        new BinanceSpotOrderFillFeeSource(),
        new BybitOrderFillFeeSource(
          "SPOT",
        ),
      ],
    private readonly now:
      () => number = Date.now,
  ) {
    this.enabled =
      configuration.enabled ??
      strictEnvironmentFlag(
        "CAT_PRO_PRIVATE_FILL_STREAMS_ENABLED",
        false,
      );
    this.binanceUrl =
      configuration.binanceUrl ??
      process.env.BINANCE_PRIVATE_WS_URL?.trim() ??
      BINANCE_DEFAULT_URL;
    this.bybitUrl =
      configuration.bybitUrl ??
      process.env.BYBIT_PRIVATE_WS_URL?.trim() ??
      BYBIT_DEFAULT_URL;
    this.reconnectBaseDelayMs =
      positiveInteger(
        configuration.reconnectBaseDelayMs ??
          1_000,
        "private-stream reconnect base delay",
      );
    this.reconnectMaximumDelayMs =
      positiveInteger(
        configuration.reconnectMaximumDelayMs ??
          30_000,
        "private-stream reconnect maximum delay",
      );
    this.handshakeTimeoutMs =
      positiveInteger(
        configuration.handshakeTimeoutMs ??
          20_000,
        "private-stream handshake timeout",
      );
    this.heartbeatTimeoutMs =
      positiveInteger(
        configuration.heartbeatTimeoutMs ??
          45_000,
        "private-stream heartbeat timeout",
      );
    this.sessionLeaseMs =
      positiveInteger(
        configuration.sessionLeaseMs ??
          60_000,
        "private-stream session lease",
      );
    this.maximumBufferedMessages =
      positiveInteger(
        configuration.maximumBufferedMessages ??
          1_000,
        "private-stream buffer capacity",
      );
    this.maximumBackfillOrders =
      positiveInteger(
        configuration.maximumBackfillOrders ??
          100,
        "private-stream backfill order capacity",
      );

    if (
      this.reconnectMaximumDelayMs <
        this.reconnectBaseDelayMs
    ) {
      throw new Error(
        "Private-stream maximum reconnect delay cannot be below its base delay.",
      );
    }

    this.states.set(
      "binance",
      createState(
        "binance",
      ),
    );
    this.states.set(
      "bybit",
      createState(
        "bybit",
      ),
    );
  }

  start(): void {
    if (this.running) {
      return;
    }

    this.running =
      true;

    for (const venue of [
      "binance",
      "bybit",
    ] as const) {
      const state =
        this.requireState(
          venue,
        );

      if (!this.enabled) {
        state.phase =
          "DISABLED";
        continue;
      }

      if (!this.credentialsFor(venue).isConfigured()) {
        state.phase =
          "NOT_CONFIGURED";
        continue;
      }

      this.connect(
        venue,
      );
    }
  }

  stop(): void {
    this.running =
      false;

    for (const state of this.states.values()) {
      if (state.reconnectTimer) {
        clearTimeout(
          state.reconnectTimer,
        );
        state.reconnectTimer =
          null;
      }

      if (state.heartbeatTimer) {
        clearInterval(
          state.heartbeatTimer,
        );
        state.heartbeatTimer =
          null;
      }

      if (state.session) {
        this.owner.closeAuthenticatedSession(
          state.session,
        );
        state.session =
          null;
      }

      const socket =
        state.socket;
      state.socket =
        null;
      socket?.close();
      state.phase =
        this.enabled
          ? "STOPPED"
          : "DISABLED";
    }
  }

  getDiagnostics(
    generatedAt = this.now(),
  ) {
    return freeze({
      version:
        "105.0" as const,
      generatedAt,
      enabled:
        this.enabled,
      running:
        this.running,
      venues:
        Object.fromEntries(
          Array.from(
            this.states.values(),
          ).map(
            (state) => [
              state.venue,
              {
                phase:
                  state.phase,
                ready:
                  state.phase ===
                  "READY" &&
                  state.session !==
                    null &&
                  state.session.expiresAt >=
                    generatedAt,
                generation:
                  state.generation,
                connectionId:
                  state.connectionId,
                subscriptionId:
                  state.subscriptionId,
                accountFingerprint:
                  state.accountFingerprint,
                reconnectAttempts:
                  state.reconnectAttempts,
                lastSignalAt:
                  state.lastSignalAt,
                lastReadyAt:
                  state.lastReadyAt,
                lastDisconnectedAt:
                  state.lastDisconnectedAt,
                lastBackfillAt:
                  state.lastBackfillAt,
                lastBackfillOrders:
                  state.lastBackfillOrders,
                backfilledFills:
                  state.backfilledFills,
                messagesReceived:
                  state.messagesReceived,
                eventsApplied:
                  state.eventsApplied,
                bufferedMessages:
                  state.bufferedMessages.length,
                lastError:
                  state.lastError,
              },
            ],
          ),
        ),
      safety: {
        authenticationAckRequired:
          true,
        subscriptionAckRequired:
          true,
        restGapBackfillBeforeReady:
          true,
        boundedReconnectBackoff:
          true,
        staleGenerationRevokedImmediately:
          true,
        orderSubmissionAvailable:
          false,
        cancellationAvailable:
          false,
        transferOrWithdrawalAvailable:
          false,
      },
    });
  }

  private connect(
    venue:
      AuthenticatedFillVenue,
  ): void {
    if (!this.running) {
      return;
    }

    const state =
      this.requireState(
        venue,
      );

    if (state.socket) {
      return;
    }

    state.generation +=
      1;
    const generation =
      state.generation;
    const credentials =
      this.credentialsFor(
        venue,
      ).getCredentials();
    state.accountFingerprint =
      accountFingerprint(
        credentials.apiKey,
      );
    state.phase =
      "CONNECTING";
    state.lastSignalAt =
      this.now();
    state.lastError =
      null;
    state.requestId =
      null;
    state.subscriptionId =
      null;
    state.connectionId =
      null;
    state.bufferedMessages.length =
      0;

    const socket =
      this.sockets.connect(
        venue ===
          "binance"
          ? this.binanceUrl
          : this.bybitUrl,
        {
          onOpen:
            () =>
              this.onOpen(
                venue,
                generation,
              ),
          onMessage:
            (message) =>
              this.enqueue(
                venue,
                generation,
                async () =>
                  this.onMessage(
                    venue,
                    generation,
                    message,
                  ),
              ),
          onClose:
            (code, reason) =>
              this.onClose(
                venue,
                generation,
                code,
                reason,
              ),
          onError:
            (error) =>
              this.failConnection(
                venue,
                generation,
                error,
              ),
          onPing:
            (data) => {
              if (
                this.isCurrent(
                  state,
                  generation,
                )
              ) {
                state.socket?.sendPong(
                  data,
                );
                this.touch(
                  state,
                );
              }
            },
          onPong:
            () => {
              if (
                this.isCurrent(
                  state,
                  generation,
                )
              ) {
                this.touch(
                  state,
                );
              }
            },
        },
      );

    state.socket =
      socket;
  }

  private onOpen(
    venue:
      AuthenticatedFillVenue,
    generation: number,
  ): void {
    const state =
      this.requireState(
        venue,
      );

    if (
      !this.isCurrent(
        state,
        generation,
      )
    ) {
      return;
    }

    state.phase =
      "AUTHENTICATING";
    this.touch(
      state,
    );
    this.startHeartbeat(
      state,
      generation,
    );

    const credentials =
      this.credentialsFor(
        venue,
      ).getCredentials();

    if (
      venue ===
      "binance"
    ) {
      const timestamp =
        this.now();
      const requestId =
        `cat-binance-private-${generation}`;
      const params = {
        apiKey:
          credentials.apiKey,
        recvWindow:
          5_000,
        timestamp,
      };
      const signature =
        createHmac(
          "sha256",
          credentials.apiSecret,
        )
          .update(
            canonicalQuery(
              params,
            ),
            "utf8",
          )
          .digest(
            "hex",
          );
      state.requestId =
        requestId;
      state.socket?.sendText(
        JSON.stringify({
          id:
            requestId,
          method:
            "userDataStream.subscribe.signature",
          params: {
            ...params,
            signature,
          },
        }),
      );
      return;
    }

    const expires =
      this.now() +
      10_000;
    const signature =
      createHmac(
        "sha256",
        credentials.apiSecret,
      )
        .update(
          `GET/realtime${expires}`,
          "utf8",
        )
        .digest(
          "hex",
        );
    const requestId =
      `cat-bybit-auth-${generation}`;
    state.requestId =
      requestId;
    state.socket?.sendText(
      JSON.stringify({
        req_id:
          requestId,
        op:
          "auth",
        args: [
          credentials.apiKey,
          expires,
          signature,
        ],
      }),
    );
  }

  private async onMessage(
    venue:
      AuthenticatedFillVenue,
    generation: number,
    raw: string,
  ): Promise<void> {
    const state =
      this.requireState(
        venue,
      );

    if (
      !this.isCurrent(
        state,
        generation,
      )
    ) {
      return;
    }

    state.messagesReceived +=
      1;
    this.touch(
      state,
    );

    const message =
      parseRecord(
        raw,
      );

    if (
      venue ===
      "binance"
    ) {
      await this.handleBinanceMessage(
        state,
        message,
      );
      return;
    }

    await this.handleBybitMessage(
      state,
      message,
    );
  }

  private async handleBinanceMessage(
    state: VenueState,
    message:
      Readonly<Record<string, unknown>>,
  ): Promise<void> {
    if (
      message.id ===
      state.requestId
    ) {
      if (
        Number(
          message.status,
        ) !==
        200
      ) {
        throw new Error(
          "Binance private-stream signature subscription was rejected.",
        );
      }

      const result =
        requireRecord(
          message.result,
          "Binance private-stream subscription result",
        );
      const subscriptionId =
        Number(
          result.subscriptionId,
        );

      if (
        !Number.isSafeInteger(
          subscriptionId,
        ) ||
        subscriptionId <
          0
      ) {
        throw new Error(
          "Binance private-stream subscription acknowledgement lacks an exact subscription ID.",
        );
      }

      state.subscriptionId =
        subscriptionId;
      state.connectionId =
        `binance-${state.generation}-${subscriptionId}`;
      await this.activate(
        state,
        [
          "executionReport",
        ],
      );
      return;
    }

    const event =
      isRecord(
        message.event,
      )
        ? message.event
        : message;

    if (
      event.e ===
      "serverShutdown" ||
      event.e ===
      "eventStreamTerminated"
    ) {
      throw new Error(
        "Binance private event stream terminated and requires a new generation.",
      );
    }

    if (
      event.e ===
      "executionReport"
    ) {
      this.applyOrBuffer(
        state,
        event,
      );
    }
  }

  private async handleBybitMessage(
    state: VenueState,
    message:
      Readonly<Record<string, unknown>>,
  ): Promise<void> {
    if (
      message.op ===
      "pong" ||
      message.ret_msg ===
      "pong"
    ) {
      return;
    }

    if (
      message.op ===
      "auth"
    ) {
      if (
        message.success !==
        true
      ) {
        throw new Error(
          "Bybit private-stream authentication was rejected.",
        );
      }

      state.connectionId =
        textOrNull(
          message.conn_id,
        ) ??
        `bybit-${state.generation}`;
      state.phase =
        "SUBSCRIBING";
      const requestId =
        `cat-bybit-subscribe-${state.generation}`;
      state.requestId =
        requestId;
      state.socket?.sendText(
        JSON.stringify({
          req_id:
            requestId,
          op:
            "subscribe",
          args: [
            "execution.spot",
            "order.spot",
          ],
        }),
      );
      return;
    }

    if (
      message.op ===
      "subscribe" &&
      message.req_id ===
        state.requestId
    ) {
      if (
        message.success !==
        true
      ) {
        throw new Error(
          "Bybit private-stream topic subscription was rejected.",
        );
      }

      await this.activate(
        state,
        [
          "execution.spot",
          "order.spot",
        ],
      );
      return;
    }

    if (
      message.topic ===
        "execution.spot" ||
      message.topic ===
        "order.spot"
    ) {
      this.applyOrBuffer(
        state,
        message,
      );
    }
  }

  private async activate(
    state: VenueState,
    topics:
      readonly string[],
  ): Promise<void> {
    if (
      !state.accountFingerprint ||
      !state.connectionId
    ) {
      throw new Error(
        "Authenticated private-stream identity is incomplete after subscription acknowledgement.",
      );
    }

    state.phase =
      "BACKFILLING";
    const candidates =
      this.owner.listBackfillCandidates(
        state.venue,
        state.accountFingerprint,
      );

    if (
      candidates.length >
      this.maximumBackfillOrders
    ) {
      throw new Error(
        "Authenticated private-stream REST gap backfill exceeded its bounded order capacity.",
      );
    }

    const source =
      this.backfillSources.find(
        (candidate) =>
          candidate.exchange ===
            state.venue &&
          candidate.product ===
            "SPOT",
      );

    if (!source) {
      throw new Error(
        `No signed REST fill backfill source is registered for ${state.venue}.`,
      );
    }

    const backfills:
      Array<{
        lifecycleOrderId: string;
        fills: readonly VenueOrderFill[];
      }> = [];

    for (const candidate of candidates) {
      if (!candidate.exchangeOrderId) {
        throw new Error(
          "An unresolved durable private order lacks an exchange order ID; stream readiness remains fail-closed.",
        );
      }

      const fills =
        await source.getFills(
          candidate.market,
          candidate.exchangeOrderId,
        );
      backfills.push({
        lifecycleOrderId:
          candidate.lifecycleOrderId,
        fills,
      });
    }

    const activatedAt =
      this.now();
    let session =
      this.owner.openAuthenticatedSession(
        {
          venue:
            state.venue,
          accountFingerprint:
            state.accountFingerprint,
          connectionId:
            state.connectionId,
          generation:
            state.generation,
          authenticatedAt:
            activatedAt,
          expiresAt:
            activatedAt +
            this.sessionLeaseMs,
          topics,
        },
        activatedAt,
      );
    state.session =
      session;

    let backfilledFills =
      0;

    for (const backfill of backfills) {
      this.owner.ingestRestBackfill(
        session,
        backfill.lifecycleOrderId,
        backfill.fills,
        activatedAt,
      );
      backfilledFills +=
        backfill.fills.length;
    }

    state.lastBackfillAt =
      activatedAt;
    state.lastBackfillOrders =
      candidates.length;
    state.backfilledFills +=
      backfilledFills;
    state.phase =
      "READY";
    state.lastReadyAt =
      activatedAt;
    state.reconnectAttempts =
      0;

    const buffered =
      state.bufferedMessages.splice(
        0,
      );

    for (const message of buffered) {
      session =
        this.refreshSession(
          state,
        );
      this.applyEvent(
        state,
        session,
        message,
      );
    }
  }

  private applyOrBuffer(
    state: VenueState,
    message: unknown,
  ): void {
    if (
      state.phase !==
        "READY" ||
      !state.session
    ) {
      if (
        state.bufferedMessages.length >=
        this.maximumBufferedMessages
      ) {
        throw new Error(
          "Authenticated private-stream pre-ready buffer capacity was exhausted.",
        );
      }

      state.bufferedMessages.push(
        structuredClone(
          message,
        ),
      );
      return;
    }

    const session =
      this.refreshSession(
        state,
      );
    this.applyEvent(
      state,
      session,
      message,
    );
  }

  private applyEvent(
    state: VenueState,
    session:
      AuthenticatedPrivateStreamSession,
    message: unknown,
  ): void {
    if (
      state.venue ===
      "binance"
    ) {
      this.owner.ingestBinanceExecutionReport(
        session,
        message,
        this.now(),
      );
      state.eventsApplied +=
        1;
      return;
    }

    const topic =
      requireRecord(
        message,
        "Bybit private event",
      ).topic;

    if (
      topic ===
      "execution.spot"
    ) {
      this.owner.ingestBybitExecutionMessage(
        session,
        message,
        this.now(),
      );
      state.eventsApplied +=
        1;
    } else if (
      topic ===
      "order.spot"
    ) {
      this.owner.ingestBybitOrderMessage(
        session,
        message,
        this.now(),
      );
      state.eventsApplied +=
        1;
    }
  }

  private refreshSession(
    state: VenueState,
  ): AuthenticatedPrivateStreamSession {
    if (!state.session) {
      throw new Error(
        "Authenticated private-stream session is not active.",
      );
    }

    const now =
      this.now();
    state.session =
      this.owner.refreshAuthenticatedSession(
        state.session,
        now +
          this.sessionLeaseMs,
        now,
      );

    return state.session;
  }

  private touch(
    state: VenueState,
  ): void {
    state.lastSignalAt =
      this.now();

    if (
      state.phase ===
        "READY" &&
      state.session
    ) {
      this.refreshSession(
        state,
      );
    }
  }

  private startHeartbeat(
    state: VenueState,
    generation: number,
  ): void {
    if (state.heartbeatTimer) {
      clearInterval(
        state.heartbeatTimer,
      );
    }

    state.heartbeatTimer =
      setInterval(
        () => {
          if (
            !this.running ||
            !this.isCurrent(
              state,
              generation,
            )
          ) {
            return;
          }

          const now =
            this.now();
          const timeout =
            state.phase ===
              "READY"
              ? this.heartbeatTimeoutMs
              : this.handshakeTimeoutMs;

          if (
            state.lastSignalAt ===
              null ||
            now -
                state.lastSignalAt >
              timeout
          ) {
            this.failConnection(
              state.venue,
              generation,
              new Error(
                "Authenticated private-stream heartbeat or handshake timed out.",
              ),
            );
            return;
          }

          if (
            state.venue ===
              "bybit" &&
            now -
                state.lastSignalAt >=
              15_000
          ) {
            state.socket?.sendText(
              JSON.stringify({
                req_id:
                  `cat-bybit-ping-${generation}-${now}`,
                op:
                  "ping",
              }),
            );
          }
        },
        5_000,
      );
    state.heartbeatTimer.unref?.();
  }

  private onClose(
    venue:
      AuthenticatedFillVenue,
    generation: number,
    _code: number,
    _reason: string,
  ): void {
    const state =
      this.requireState(
        venue,
      );

    if (
      !this.isCurrent(
        state,
        generation,
      )
    ) {
      return;
    }

    this.revoke(
      state,
    );
    state.socket =
      null;
    state.lastDisconnectedAt =
      this.now();
    this.scheduleReconnect(
      state,
    );
  }

  private failConnection(
    venue:
      AuthenticatedFillVenue,
    generation: number,
    error: Error,
  ): void {
    const state =
      this.requireState(
        venue,
      );

    if (
      !this.isCurrent(
        state,
        generation,
      )
    ) {
      return;
    }

    state.lastError =
      this.redact(
        venue,
        error.message,
      );
    this.revoke(
      state,
    );
    const socket =
      state.socket;
    state.socket =
      null;
    state.lastDisconnectedAt =
      this.now();
    socket?.terminate();
    this.scheduleReconnect(
      state,
    );
  }

  private revoke(
    state: VenueState,
  ): void {
    if (state.heartbeatTimer) {
      clearInterval(
        state.heartbeatTimer,
      );
      state.heartbeatTimer =
        null;
    }

    if (state.session) {
      this.owner.closeAuthenticatedSession(
        state.session,
      );
      state.session =
        null;
    }

    state.bufferedMessages.length =
      0;
  }

  private scheduleReconnect(
    state: VenueState,
  ): void {
    if (
      !this.running ||
      state.reconnectTimer
    ) {
      state.phase =
        this.running
          ? "BACKOFF"
          : "STOPPED";
      return;
    }

    state.phase =
      "BACKOFF";
    state.reconnectAttempts +=
      1;
    const exponent =
      Math.min(
        10,
        state.reconnectAttempts -
          1,
      );
    const delay =
      Math.min(
        this.reconnectMaximumDelayMs,
        this.reconnectBaseDelayMs *
          2 **
            exponent,
      );

    state.reconnectTimer =
      setTimeout(
        () => {
          state.reconnectTimer =
            null;
          this.connect(
            state.venue,
          );
        },
        delay,
      );
    state.reconnectTimer.unref?.();
  }

  private enqueue(
    venue:
      AuthenticatedFillVenue,
    generation: number,
    work:
      () => Promise<void>,
  ): void {
    const state =
      this.requireState(
        venue,
      );
    state.work =
      state.work
        .then(
          work,
        )
        .catch(
          (error: unknown) => {
            this.failConnection(
              venue,
              generation,
              error instanceof Error
                ? error
                : new Error(
                    "Unknown authenticated private-stream processing failure.",
                  ),
            );
          },
        );
  }

  private credentialsFor(
    venue:
      AuthenticatedFillVenue,
  ): CredentialSource<
    BinanceCredentials
  > | CredentialSource<
    BybitCredentials
  > {
    return venue ===
      "binance"
      ? this.binanceCredentials
      : this.bybitCredentials;
  }

  private redact(
    venue:
      AuthenticatedFillVenue,
    message: string,
  ): string {
    const credentials =
      this.credentialsFor(
        venue,
      ).getCredentials();

    return message
      .replaceAll(
        credentials.apiKey,
        "[REDACTED_API_KEY]",
      )
      .replaceAll(
        credentials.apiSecret,
        "[REDACTED_API_SECRET]",
      )
      .slice(
        0,
        500,
      );
  }

  private requireState(
    venue:
      AuthenticatedFillVenue,
  ): VenueState {
    const state =
      this.states.get(
        venue,
      );

    if (!state) {
      throw new Error(
        `Private-stream state is missing for ${venue}.`,
      );
    }

    return state;
  }

  private isCurrent(
    state: VenueState,
    generation: number,
  ): boolean {
    return state.generation ===
      generation;
  }
}

class WsPrivateStreamSocketFactory
  implements PrivateStreamSocketFactory
{
  connect(
    url: string,
    handlers: SocketHandlers,
  ): PrivateStreamSocket {
    const socket =
      new WebSocket(
        url,
      );

    socket.on(
      "open",
      handlers.onOpen,
    );
    socket.on(
      "message",
      (data) =>
        handlers.onMessage(
          data.toString(),
        ),
    );
    socket.on(
      "close",
      (code, reason) =>
        handlers.onClose(
          code,
          reason.toString(),
        ),
    );
    socket.on(
      "error",
      handlers.onError,
    );
    socket.on(
      "ping",
      handlers.onPing,
    );
    socket.on(
      "pong",
      handlers.onPong,
    );

    return {
      sendText:
        (value) => {
          if (
            socket.readyState !==
            WebSocket.OPEN
          ) {
            throw new Error(
              "Authenticated private-stream socket is not open.",
            );
          }

          socket.send(
            value,
          );
        },
      sendPong:
        (value) => {
          if (
            socket.readyState ===
            WebSocket.OPEN
          ) {
            socket.pong(
              value,
            );
          }
        },
      close:
        () =>
          socket.close(),
      terminate:
        () =>
          socket.terminate(),
    };
  }
}

function createState(
  venue:
    AuthenticatedFillVenue,
): VenueState {
  return {
    venue,
    phase:
      "STOPPED",
    socket:
      null,
    session:
      null,
    generation:
      0,
    connectionId:
      null,
    requestId:
      null,
    subscriptionId:
      null,
    accountFingerprint:
      null,
    reconnectAttempts:
      0,
    reconnectTimer:
      null,
    heartbeatTimer:
      null,
    lastSignalAt:
      null,
    lastReadyAt:
      null,
    lastDisconnectedAt:
      null,
    lastBackfillAt:
      null,
    lastBackfillOrders:
      0,
    backfilledFills:
      0,
    messagesReceived:
      0,
    eventsApplied:
      0,
    bufferedMessages: [],
    lastError:
      null,
    work:
      Promise.resolve(),
  };
}

function accountFingerprint(
  apiKey: string,
): string {
  return createHash(
    "sha256",
  )
    .update(
      apiKey.trim(),
      "utf8",
    )
    .digest(
      "hex",
    );
}

function canonicalQuery(
  parameters:
    Readonly<Record<string, string | number>>,
): string {
  return Object.entries(
    parameters,
  )
    .sort(
      ([first], [second]) =>
        first.localeCompare(
          second,
        ),
    )
    .map(
      ([key, value]) =>
        `${key}=${String(value)}`,
    )
    .join(
      "&",
    );
}

function strictEnvironmentFlag(
  name: string,
  fallback: boolean,
): boolean {
  const value =
    process.env[name]
      ?.trim()
      .toLowerCase();

  if (!value) {
    return fallback;
  }

  if (
    value ===
      "true" ||
    value ===
      "1"
  ) {
    return true;
  }

  if (
    value ===
      "false" ||
    value ===
      "0"
  ) {
    return false;
  }

  throw new Error(
    `${name} must be true or false.`,
  );
}

function positiveInteger(
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
      `${label} must be a positive integer.`,
    );
  }

  return value;
}

function parseRecord(
  raw: string,
): Readonly<Record<string, unknown>> {
  try {
    return requireRecord(
      JSON.parse(
        raw,
      ),
      "authenticated private-stream message",
    );
  } catch {
    throw new Error(
      "Authenticated private-stream message is not valid JSON object data.",
    );
  }
}

function requireRecord(
  value: unknown,
  label: string,
): Readonly<Record<string, unknown>> {
  if (!isRecord(value)) {
    throw new Error(
      `${label} must be an object.`,
    );
  }

  return value;
}

function isRecord(
  value: unknown,
): value is Readonly<Record<string, unknown>> {
  return typeof value ===
      "object" &&
    value !==
      null &&
    !Array.isArray(
      value,
    );
}

function textOrNull(
  value: unknown,
): string | null {
  return typeof value ===
      "string" &&
    value.trim()
      ? value.trim()
      : null;
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

export const authenticatedPrivateFillStreamService =
  new AuthenticatedPrivateFillStreamService();
