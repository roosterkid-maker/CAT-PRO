import assert from "node:assert/strict";

import type {
  AuthenticatedPrivateStreamSession,
} from "../fills/AuthenticatedPrivateFillEventOwner";

import {
  CoinDCXAuthenticatedPrivateFillStreamService,
  type CoinDCXPrivateSocket,
  type CoinDCXPrivateSocketFactory,
} from "../fills/CoinDCXAuthenticatedPrivateFillStreamService";

const now =
  1_787_200_000_000;

async function main(): Promise<void> {
  const socket =
    new FixtureCoinDCXSocket();
  const owner =
    new FixtureOwner();
  let signedReads =
    0;
  const service =
    new CoinDCXAuthenticatedPrivateFillStreamService(
      {
        enabled:
          true,
        url:
          "wss://fixture.coindcx",
        reconnectBaseDelayMs:
          1_000,
        reconnectMaximumDelayMs:
          2_000,
        sessionLeaseMs:
          60_000,
        signedReadRefreshMs:
          30_000,
      },
      {
        connect: () =>
          socket,
      } satisfies CoinDCXPrivateSocketFactory,
      owner,
      {
        isConfigured: () =>
          true,
        getCredentials: () => ({
          apiKey:
            "fixture-coindcx-key",
          apiSecret:
            "fixture-coindcx-secret",
        }),
      },
      {
        verify: async () => {
          signedReads +=
            1;
        },
      },
      () =>
        now,
    );

  service.start();
  assert.equal(
    service.getDiagnostics().phase,
    "CONNECTING",
  );

  socket.trigger(
    "connect",
  );
  await eventually(
    () =>
      service.getDiagnostics().ready,
  );

  const diagnostics =
    service.getDiagnostics();
  assert.equal(
    diagnostics.ready,
    true,
  );
  assert.equal(
    diagnostics.safety.orderSubmissionAvailable,
    false,
  );
  assert.equal(
    diagnostics.safety.documentedSubscriptionAcknowledgementAvailable,
    false,
  );
  assert.equal(
    signedReads,
    1,
  );
  assert.equal(
    owner.opened?.venue,
    "coindcx",
  );
  assert.deepEqual(
    owner.opened?.topics,
    [
      "order-update",
      "trade-update",
    ],
  );

  const join =
    socket.emitted.find(
      (entry) =>
        entry.event ===
        "join",
    );
  assert.equal(
    typeof join?.payload,
    "object",
  );
  assert.equal(
    (
      join?.payload as {
        channelName?: string;
      }
    ).channelName,
    "coindcx",
  );

  socket.trigger(
    "order-update",
    {
      data:
        "{}",
    },
  );
  socket.trigger(
    "trade-update",
    {
      data:
        "{}",
    },
  );
  assert.equal(
    owner.orderMessages,
    1,
  );
  assert.equal(
    owner.tradeMessages,
    1,
  );

  service.stop();
  assert.equal(
    service.getDiagnostics().phase,
    "STOPPED",
  );
  assert.equal(
    owner.closed,
    1,
  );
  assert.equal(
    socket.disconnected,
    true,
  );

  console.log(
    "COINDCX AUTHENTICATED PRIVATE FILL STREAM TEST PASSED.",
  );
  console.log(
    "Signed read, official Socket.IO join, short lease, durable owner handoff and zero order/transfer methods were verified.",
  );
}

class FixtureCoinDCXSocket
  implements CoinDCXPrivateSocket
{
  readonly handlers =
    new Map<
      string,
      (
        payload?: unknown,
      ) => void
    >();
  readonly emitted:
    {
      event: string;
      payload: unknown;
    }[] = [];
  disconnected =
    false;

  on(
    event: string,
    handler: (
      payload?: unknown,
    ) => void,
  ): CoinDCXPrivateSocket {
    this.handlers.set(
      event,
      handler,
    );
    return this;
  }

  emit(
    event: string,
    payload: unknown,
  ): CoinDCXPrivateSocket {
    this.emitted.push({
      event,
      payload,
    });
    return this;
  }

  disconnect(): void {
    this.disconnected =
      true;
  }

  trigger(
    event: string,
    payload?: unknown,
  ): void {
    this.handlers.get(
      event,
    )?.(
      payload,
    );
  }
}

class FixtureOwner {
  opened:
    AuthenticatedPrivateStreamSession | null =
    null;
  closed =
    0;
  orderMessages =
    0;
  tradeMessages =
    0;

  openAuthenticatedSession(
    session: AuthenticatedPrivateStreamSession,
  ): AuthenticatedPrivateStreamSession {
    this.opened =
      session;
    return session;
  }

  refreshAuthenticatedSession(
    session: AuthenticatedPrivateStreamSession,
    expiresAt: number,
  ): AuthenticatedPrivateStreamSession {
    return {
      ...session,
      expiresAt,
    };
  }

  closeAuthenticatedSession(): boolean {
    this.closed +=
      1;
    return true;
  }

  ingestCoinDCXOrderMessage(): readonly unknown[] {
    this.orderMessages +=
      1;
    return [];
  }

  ingestCoinDCXTradeMessage(): readonly unknown[] {
    this.tradeMessages +=
      1;
    return [];
  }
}

async function eventually(
  predicate: () => boolean,
): Promise<void> {
  for (
    let attempt =
      0;
    attempt <
      20;
    attempt +=
      1
  ) {
    if (predicate()) {
      return;
    }

    await new Promise<void>(
      (resolve) =>
        setImmediate(
          resolve,
        ),
    );
  }

  throw new Error(
    "CoinDCX private stream did not reach expected state.",
  );
}

void main().catch(
  (error: unknown) => {
    console.error(
      error,
    );
    process.exitCode =
      1;
  },
);
