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
  authenticatedPrivateFillEventOwner,
  type AuthenticatedPrivateStreamSession,
} from "./AuthenticatedPrivateFillEventOwner";

type CoinDCXPrivateStreamPhase =
  | "DISABLED"
  | "NOT_CONFIGURED"
  | "STOPPED"
  | "CONNECTING"
  | "VERIFYING_SIGNED_READ"
  | "JOINING"
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
  ingestCoinDCXOrderMessage(
    session: AuthenticatedPrivateStreamSession,
    payload: unknown,
    receivedAt?: number,
  ): readonly unknown[];
  ingestCoinDCXTradeMessage(
    session: AuthenticatedPrivateStreamSession,
    payload: unknown,
    receivedAt?: number,
  ): readonly unknown[];
}

export interface CoinDCXAuthenticatedPrivateFillStreamConfiguration {
  readonly enabled?: boolean;
  readonly url?: string;
  readonly reconnectBaseDelayMs?: number;
  readonly reconnectMaximumDelayMs?: number;
  readonly sessionLeaseMs?: number;
  readonly signedReadRefreshMs?: number;
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
      if (
        topic ===
        "order-update"
      ) {
        this.owner.ingestCoinDCXOrderMessage(
          this.session,
          payload,
          receivedAt,
        );
      } else {
        this.owner.ingestCoinDCXTradeMessage(
          this.session,
          payload,
          receivedAt,
        );
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
