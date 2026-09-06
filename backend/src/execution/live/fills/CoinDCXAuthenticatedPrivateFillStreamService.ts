import {
  createHash,
  createHmac,
} from "node:crypto";

import {
  coinDCXAccountApi,
} from "../../../exchanges/coindcx/api/CoinDCXAccountApi";

import {
  coinDCXCredentialsProvider,
} from "../../../exchanges/coindcx/api/CoinDCXCredentialsProvider";

import type {
  CoinDCXCredentials,
} from "../../../exchanges/coindcx/api/CoinDCXHttpClient";

import {
  coinDCXOrderApi,
} from "../../../exchanges/coindcx/api/CoinDCXOrderApi";

import type {
  CoinDCXOrder,
} from "../../../exchanges/coindcx/api/CoinDCXOrderApi";

import {
  authenticatedPrivateFillEventOwner,
  type AuthenticatedPrivateOrderState,
  type AuthenticatedPrivateStreamSession,
  type PrivateFillBackfillRecord,
  type PrivateFillIngestResult,
} from "./AuthenticatedPrivateFillEventOwner";

type CoinDCXPrivateStreamPhase =
  | "DISABLED"
  | "NOT_CONFIGURED"
  | "STOPPED"
  | "CONNECTING"
  | "VERIFYING_SIGNED_READ"
  | "JOINING"
  | "BACKFILLING"
  | "READY"
  | "BACKOFF";

export interface CoinDCXPrivateSocket {
  on(
    event: string,
    handler: (
      payload?: unknown,
    ) => void,
  ): CoinDCXPrivateSocket;
  emit(
    event: string,
    payload: unknown,
  ): CoinDCXPrivateSocket;
  disconnect(): void;
}

export interface CoinDCXPrivateSocketFactory {
  connect(
    url: string,
  ): CoinDCXPrivateSocket;
}

interface CoinDCXCredentialSource {
  isConfigured(): boolean;
  getCredentials(): CoinDCXCredentials;
}

interface CoinDCXSignedReadProbe {
  verify(
    credentials: CoinDCXCredentials,
  ): Promise<void>;
}

interface CoinDCXOrderStatusPort {
  getOrderStatus(
    orderId: string,
    credentials: CoinDCXCredentials,
  ): Promise<CoinDCXOrder>;
}

interface CoinDCXPrivateFillOwnerPort {
  openAuthenticatedSession(
    session: AuthenticatedPrivateStreamSession,
    now?: number,
  ): AuthenticatedPrivateStreamSession;
  refreshAuthenticatedSession(
    session: AuthenticatedPrivateStreamSession,
    expiresAt: number,
    now?: number,
  ): AuthenticatedPrivateStreamSession;
  closeAuthenticatedSession(
    session: AuthenticatedPrivateStreamSession,
  ): boolean;
  listBackfillCandidates(
    venue: string,
    accountFingerprint: string,
  ): readonly AuthenticatedPrivateOrderState[];
  ingestRestBackfill(
    session: AuthenticatedPrivateStreamSession,
    lifecycleOrderId: string,
    records: readonly PrivateFillBackfillRecord[],
    receivedAt?: number,
  ): readonly PrivateFillIngestResult[];
  ingestCoinDCXOrderMessage(
    session: AuthenticatedPrivateStreamSession,
    payload: unknown,
    receivedAt?: number,
  ): readonly PrivateFillIngestResult[];
  ingestCoinDCXTradeMessage(
    session: AuthenticatedPrivateStreamSession,
    payload: unknown,
    receivedAt?: number,
  ): readonly PrivateFillIngestResult[];
}

export interface CoinDCXAuthenticatedPrivateFillStreamConfiguration {
  readonly enabled?: boolean;
  readonly url?: string;
  readonly reconnectBaseDelayMs?: number;
  readonly reconnectMaximumDelayMs?: number;
  readonly sessionLeaseMs?: number;
  readonly signedReadRefreshMs?: number;
  readonly maximumBackfillOrders?: number;
}

const DEFAULT_URL =
  "wss://stream.coindcx.com";

/**
 * Authenticated, observation-only CoinDCX Socket.IO owner.
 *
 * CoinDCX documents a signed `join` request but no separate subscription ACK.
 * Readiness therefore requires a successful signed REST account read on the
 * same credentials immediately before the signed join, plus a short renewable
 * session lease. The service owns no order, cancel, transfer or withdrawal
 * method. Fill identity remains fail-closed in the durable event owner.
 */
export class CoinDCXAuthenticatedPrivateFillStreamService {
  private readonly enabled: boolean;
  private readonly url: string;
  private readonly reconnectBaseDelayMs: number;
  private readonly reconnectMaximumDelayMs: number;
  private readonly sessionLeaseMs: number;
  private readonly signedReadRefreshMs: number;
  private readonly maximumBackfillOrders: number;
  private phase:
    CoinDCXPrivateStreamPhase =
    "STOPPED";
  private socket:
    CoinDCXPrivateSocket | null =
    null;
  private session:
    AuthenticatedPrivateStreamSession | null =
    null;
  private generation =
    0;
  private running =
    false;
  private reconnectAttempts =
    0;
  private reconnectTimer:
    NodeJS.Timeout | null =
    null;
  private refreshTimer:
    NodeJS.Timeout | null =
    null;
  private lastConnectedAt:
    number | null =
    null;
  private lastReadyAt:
    number | null =
    null;
  private lastSignedReadAt:
    number | null =
    null;
  private lastEventAt:
    number | null =
    null;
  private messagesReceived =
    0;
  private rejectedMessages =
    0;
  private lastError:
    string | null =
    null;

  constructor(
    configuration:
      CoinDCXAuthenticatedPrivateFillStreamConfiguration = {},
    private readonly sockets:
      CoinDCXPrivateSocketFactory = new RealCoinDCXPrivateSocketFactory(),
    private readonly owner:
      CoinDCXPrivateFillOwnerPort = authenticatedPrivateFillEventOwner,
    private readonly credentials:
      CoinDCXCredentialSource = coinDCXCredentialsProvider,
    private readonly signedRead:
      CoinDCXSignedReadProbe = new DefaultCoinDCXSignedReadProbe(),
    private readonly now:
      () => number = Date.now,
    private readonly orderStatus:
      CoinDCXOrderStatusPort = coinDCXOrderApi,
  ) {
    this.enabled =
      configuration.enabled ??
      strictEnvironmentFlag(
        "CAT_PRO_PRIVATE_FILL_STREAMS_ENABLED",
        false,
      );
    this.url =
      configuration.url ??
      process.env.COINDCX_PRIVATE_WS_URL?.trim() ??
      DEFAULT_URL;
    this.reconnectBaseDelayMs =
      positiveInteger(
        configuration.reconnectBaseDelayMs ??
          1_000,
        "CoinDCX reconnect base delay",
      );
    this.reconnectMaximumDelayMs =
      positiveInteger(
        configuration.reconnectMaximumDelayMs ??
          30_000,
        "CoinDCX reconnect maximum delay",
      );
    this.sessionLeaseMs =
      positiveInteger(
        configuration.sessionLeaseMs ??
          90_000,
        "CoinDCX private session lease",
      );
    this.signedReadRefreshMs =
      positiveInteger(
        configuration.signedReadRefreshMs ??
          30_000,
        "CoinDCX signed-read refresh",
      );
    this.maximumBackfillOrders =
      positiveInteger(
        configuration.maximumBackfillOrders ??
          100,
        "CoinDCX private-stream backfill order capacity",
      );

    if (
      this.reconnectMaximumDelayMs <
        this.reconnectBaseDelayMs ||
      this.sessionLeaseMs <=
        this.signedReadRefreshMs
    ) {
      throw new Error(
        "CoinDCX private-stream timing configuration is invalid.",
      );
    }
  }

  start(): void {
    if (this.running) {
      return;
    }

    this.running =
      true;

    if (!this.enabled) {
      this.phase =
        "DISABLED";
      return;
    }

    if (!this.credentials.isConfigured()) {
      this.phase =
        "NOT_CONFIGURED";
      return;
    }

    this.connect();
  }

  stop(): void {
    this.running =
      false;
    this.clearTimers();
    this.revokeSession();
    const socket =
      this.socket;
    this.socket =
      null;
    socket?.disconnect();
    this.phase =
      this.enabled
        ? "STOPPED"
        : "DISABLED";
  }

  getDiagnostics(
    generatedAt = this.now(),
  ) {
    const ready =
      this.phase ===
        "READY" &&
      this.session !==
        null &&
      this.session.expiresAt >=
        generatedAt;

    return freeze({
      schemaVersion:
        "139.0" as const,
      generatedAt,
      enabled:
        this.enabled,
      running:
        this.running,
      phase:
        this.phase,
      ready,
      generation:
        this.generation,
      reconnectAttempts:
        this.reconnectAttempts,
      lastConnectedAt:
        this.lastConnectedAt,
      lastReadyAt:
        this.lastReadyAt,
      lastSignedReadAt:
        this.lastSignedReadAt,
      lastEventAt:
        this.lastEventAt,
      messagesReceived:
        this.messagesReceived,
      rejectedMessages:
        this.rejectedMessages,
      lastError:
        this.lastError,
      safety: {
        officialSocketIoClientVersion:
          "2.4.0" as const,
        documentedSubscriptionAcknowledgementAvailable:
          false,
        signedRestReadBeforeJoin:
          true,
        renewableShortLease:
          true,
        durableClientOrderBindingRequired:
          true,
        orderSubmissionAvailable:
          false,
        cancellationAvailable:
          false,
        transferOrWithdrawalAvailable:
          false,
        liveOrderSubmissionAuthorized:
          false,
      },
    });
  }

  private connect(): void {
    if (
      !this.running ||
      this.socket
    ) {
      return;
    }

    this.generation +=
      1;
    const generation =
      this.generation;
    this.phase =
      "CONNECTING";
    this.lastError =
      null;
    const socket =
      this.sockets.connect(
        this.url,
      );
    this.socket =
      socket;

    socket.on(
      "connect",
      () => {
        void this.handleConnected(
          generation,
        );
      },
    );
    socket.on(
      "order-update",
      (payload) =>
        this.handlePrivateEvent(
          generation,
          "order-update",
          payload,
        ),
    );
    socket.on(
      "trade-update",
      (payload) =>
        this.handlePrivateEvent(
          generation,
          "trade-update",
          payload,
        ),
    );
    socket.on(
      "connect_error",
      (payload) =>
        this.handleDisconnect(
          generation,
          message(
            payload,
            "CoinDCX private Socket.IO connection failed.",
          ),
        ),
    );
    socket.on(
      "error",
      (payload) =>
        this.handleDisconnect(
          generation,
          message(
            payload,
            "CoinDCX private Socket.IO error.",
          ),
        ),
    );
    socket.on(
      "disconnect",
      (payload) =>
        this.handleDisconnect(
          generation,
          `CoinDCX private Socket.IO disconnected: ${String(payload ?? "unknown")}.`,
        ),
    );
  }

  private async handleConnected(
    generation: number,
  ): Promise<void> {
    if (!this.isCurrent(generation)) {
      return;
    }

    this.lastConnectedAt =
      this.now();
    this.phase =
      "VERIFYING_SIGNED_READ";

    try {
      const credentials =
        this.credentials.getCredentials();
      await this.signedRead.verify(
        credentials,
      );

      if (!this.isCurrent(generation)) {
        return;
      }

      const verifiedAt =
        this.now();
      this.lastSignedReadAt =
        verifiedAt;
      const body = {
        channel:
          "coindcx",
      } as const;
      const authSignature =
        createHmac(
          "sha256",
          credentials.apiSecret,
        )
          .update(
            JSON.stringify(
              body,
            ),
          )
          .digest(
            "hex",
          );
      this.phase =
        "JOINING";
      this.socket?.emit(
        "join",
        {
          channelName:
            body.channel,
          authSignature,
          apiKey:
            credentials.apiKey,
        },
      );

      const session:
        AuthenticatedPrivateStreamSession = {
        venue:
          "coindcx",
        accountFingerprint:
          createHash(
            "sha256",
          )
            .update(
              credentials.apiKey,
            )
            .digest(
              "hex",
            ),
        connectionId:
          `coindcx-${generation}-${verifiedAt}`,
        generation,
        authenticatedAt:
          verifiedAt,
        expiresAt:
          verifiedAt +
          this.sessionLeaseMs,
        topics: [
          "order-update",
          "trade-update",
        ],
      };
      this.session =
        this.owner.openAuthenticatedSession(
          session,
          verifiedAt,
        );

      this.phase =
        "BACKFILLING";
      await this.performBackfill(
        this.session,
        credentials,
      );

      this.phase =
        "READY";
      this.lastReadyAt =
        verifiedAt;
      this.reconnectAttempts =
        0;
      this.startRefresh(
        generation,
      );
    } catch (error: unknown) {
      this.handleDisconnect(
        generation,
        message(
          error,
          "CoinDCX private signed-read or join setup failed.",
        ),
      );
    }
  }

  /**
   * Reconciles every non-terminal CoinDCX order's authoritative cumulative
   * filled quantity (via signed REST order-status) against what has been
   * recorded so far, injecting a synthetic catch-up fill for exactly the
   * missing quantity. Unlike Binance/Bybit, CoinDCX has no authenticated
   * "my trades" REST endpoint wired into this codebase, so this cannot
   * reconstruct individual trade slices - it only closes the "a fill that
   * happened while disconnected is lost forever" gap for the cumulative
   * total, which is what actually protects real exposure from going
   * undetected. Never throws: one bad candidate (network error, an order
   * still missing its exchange order ID) must never block every other
   * healthy order's backfill, and a backfill problem must never prevent
   * this venue from reaching READY.
   */
  private async performBackfill(
    session:
      AuthenticatedPrivateStreamSession,
    credentials:
      CoinDCXCredentials,
  ): Promise<void> {
    let candidates:
      readonly AuthenticatedPrivateOrderState[];

    try {
      candidates =
        this.owner.listBackfillCandidates(
          "coindcx",
          session.accountFingerprint,
        );
    } catch (error: unknown) {
      this.lastError =
        message(
          error,
          "CoinDCX backfill candidate lookup failed.",
        );
      return;
    }

    const boundedCandidates =
      candidates.slice(
        0,
        this.maximumBackfillOrders,
      );

    const skipped:
      string[] = [];

    for (const candidate of boundedCandidates) {
      try {
        if (!candidate.exchangeOrderId) {
          throw new Error(
            "An unresolved durable CoinDCX order lacks an exchange order ID.",
          );
        }

        const order =
          await this.orderStatus.getOrderStatus(
            candidate.exchangeOrderId,
            credentials,
          );

        const authoritativeFilled =
          order.totalQuantity -
          order.remainingQuantity;
        const missing =
          authoritativeFilled -
          candidate.filledQuantity;

        if (
          !Number.isFinite(
            missing,
          ) ||
          missing <=
            1e-9
        ) {
          continue;
        }

        const record:
          PrivateFillBackfillRecord = {
          executionId:
            `coindcx-catchup:${candidate.exchangeOrderId}:${authoritativeFilled}`,
          orderId:
            candidate.exchangeOrderId,
          market:
            candidate.market,
          price:
            order.averagePrice,
          quantity:
            missing,
          quoteQuantity:
            missing *
            order.averagePrice,
          feeAsset:
            candidate.fees[0]?.asset ??
            "UNKNOWN",
          // CoinDCX's order-status endpoint only reports one cumulative
          // fee total, not a per-trade breakdown, so the missing slice's
          // fee is estimated proportionally to the quantity it covers.
          feeAmount:
            authoritativeFilled >
            0
              ? order.feeAmount *
                (missing /
                  authoritativeFilled)
              : 0,
          maker:
            false,
          executedAt:
            this.now(),
          additionalFeeMetadataPresent:
            false,
        };

        this.owner.ingestRestBackfill(
          session,
          candidate.lifecycleOrderId,
          [record],
          this.now(),
        );
      } catch (error: unknown) {
        skipped.push(
          `${candidate.lifecycleOrderId}: ${
            error instanceof Error
              ? error.message
              : "Unknown CoinDCX backfill failure."
          }`,
        );
      }
    }

    if (
      skipped.length >
      0
    ) {
      this.lastError =
        `CoinDCX backfill skipped ${skipped.length} candidate(s): ${skipped.join("; ")}`;
    }
  }

  private handlePrivateEvent(
    generation: number,
    topic:
      "order-update" |
      "trade-update",
    payload: unknown,
  ): void {
    if (
      !this.isCurrent(
        generation,
      ) ||
      !this.session ||
      this.phase !==
        "READY"
    ) {
      this.rejectedMessages +=
        1;
      return;
    }

    const receivedAt =
      this.now();
    this.messagesReceived +=
      1;
    this.lastEventAt =
      receivedAt;

    try {
      const results:
        readonly PrivateFillIngestResult[] =
        topic ===
        "order-update"
          ? this.owner.ingestCoinDCXOrderMessage(
              this.session,
              payload,
              receivedAt,
            )
          : this.owner.ingestCoinDCXTradeMessage(
              this.session,
              payload,
              receivedAt,
            );

      // A batched message can contain a mix of valid and malformed items
      // (see AuthenticatedPrivateFillEventOwner.normalizeCoinDCXTradeMessage) -
      // the valid ones are already durably ingested by this point, but a
      // malformed one must still surface here so it isn't silently lost
      // from rejectedMessages/lastError diagnostics.
      const malformed =
        results.find(
          (result) =>
            result.outcome ===
            "MALFORMED",
        );

      if (
        malformed
      ) {
        this.rejectedMessages +=
          1;
        this.lastError =
          malformed.reason;
      }
    } catch (error: unknown) {
      this.rejectedMessages +=
        1;
      this.lastError =
        message(
          error,
          "CoinDCX private event was rejected.",
        );
    }
  }

  private startRefresh(
    generation: number,
  ): void {
    if (this.refreshTimer) {
      clearInterval(
        this.refreshTimer,
      );
    }

    this.refreshTimer =
      setInterval(
        () => {
          void this.refreshLease(
            generation,
          );
        },
        this.signedReadRefreshMs,
      );
    this.refreshTimer.unref?.();
  }

  private async refreshLease(
    generation: number,
  ): Promise<void> {
    if (
      !this.isCurrent(
        generation,
      ) ||
      !this.session
    ) {
      return;
    }

    try {
      await this.signedRead.verify(
        this.credentials.getCredentials(),
      );

      if (
        !this.isCurrent(
          generation,
        ) ||
        !this.session
      ) {
        return;
      }

      const refreshedAt =
        this.now();
      this.lastSignedReadAt =
        refreshedAt;
      this.session =
        this.owner.refreshAuthenticatedSession(
          this.session,
          refreshedAt +
            this.sessionLeaseMs,
          refreshedAt,
        );
    } catch (error: unknown) {
      this.handleDisconnect(
        generation,
        message(
          error,
          "CoinDCX private signed-read lease refresh failed.",
        ),
      );
    }
  }

  private handleDisconnect(
    generation: number,
    reason: string,
  ): void {
    if (!this.isCurrent(generation)) {
      return;
    }

    this.lastError =
      reason;
    if (this.refreshTimer) {
      clearInterval(
        this.refreshTimer,
      );
      this.refreshTimer =
        null;
    }
    this.revokeSession();
    const socket =
      this.socket;
    this.socket =
      null;
    socket?.disconnect();

    if (!this.running) {
      this.phase =
        "STOPPED";
      return;
    }

    this.phase =
      "BACKOFF";
    this.reconnectAttempts +=
      1;
    const delay =
      Math.min(
        this.reconnectMaximumDelayMs,
        this.reconnectBaseDelayMs *
          2 **
            Math.min(
              this.reconnectAttempts -
                1,
              10,
            ),
      );
    this.reconnectTimer =
      setTimeout(
        () => {
          this.reconnectTimer =
            null;
          this.connect();
        },
        delay,
      );
    this.reconnectTimer.unref?.();
  }

  private revokeSession(): void {
    if (this.session) {
      this.owner.closeAuthenticatedSession(
        this.session,
      );
      this.session =
        null;
    }
  }

  private clearTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(
        this.reconnectTimer,
      );
      this.reconnectTimer =
        null;
    }

    if (this.refreshTimer) {
      clearInterval(
        this.refreshTimer,
      );
      this.refreshTimer =
        null;
    }
  }

  private isCurrent(
    generation: number,
  ): boolean {
    return this.running &&
      generation ===
        this.generation &&
      this.socket !==
        null;
  }
}

class DefaultCoinDCXSignedReadProbe
  implements CoinDCXSignedReadProbe
{
  async verify(
    credentials: CoinDCXCredentials,
  ): Promise<void> {
    await coinDCXAccountApi.getBalances(
      credentials,
    );
  }
}

class RealCoinDCXPrivateSocketFactory
  implements CoinDCXPrivateSocketFactory
{
  connect(
    url: string,
  ): CoinDCXPrivateSocket {
    type Connect = (
      endpoint: string,
      options: Readonly<{
        transports: readonly string[];
        reconnection: boolean;
        forceNew: boolean;
      }>,
    ) => CoinDCXPrivateSocket;
    type Module =
      | Connect
      | {
          readonly connect: Connect;
        };
    const module =
      require(
        "coindcx-socketio-client",
      ) as Module;
    const connect =
      typeof module ===
        "function"
        ? module
        : module.connect;

    return connect(
      url,
      {
        transports: [
          "websocket",
        ],
        reconnection:
          false,
        forceNew:
          true,
      },
    );
  }
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
    `${name} must be true, false, 1 or 0.`,
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

function message(
  value: unknown,
  fallback: string,
): string {
  return value instanceof Error
    ? value.message
    : typeof value ===
          "string" &&
        value.trim()
      ? value.trim()
      : fallback;
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
    freeze(nested);
  }

  return Object.freeze(
    value,
  );
}

export const coinDCXAuthenticatedPrivateFillStreamService =
  new CoinDCXAuthenticatedPrivateFillStreamService();
