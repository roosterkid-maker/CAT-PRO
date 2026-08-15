import assert from "node:assert/strict";

import type {
  ExchangeAdapter,
} from "../core/ExchangeAdapter";

import {
  ExchangeManager,
} from "../core/ExchangeManager";

import type {
  NormalizedTicker,
} from "../coindcx/types";

class FlakyExchangeAdapter
implements ExchangeAdapter {
  readonly name =
    "flaky-exchange";

  connectCalls =
    0;

  disconnectCalls =
    0;

  private connected =
    false;

  async connect():
    Promise<void> {
    this.connectCalls +=
      1;

    if (
      this.connectCalls <
      3
    ) {
      throw new Error(
        "Transient public market-data failure.",
      );
    }

    this.connected =
      true;
  }

  async disconnect():
    Promise<void> {
    this.disconnectCalls +=
      1;

    this.connected =
      false;
  }

  async subscribe(
    _markets: string[],
  ): Promise<void> {}

  async unsubscribe(
    _markets: string[],
  ): Promise<void> {}

  isConnected():
    boolean {
    return this.connected;
  }

  simulateTransportLoss():
    void {
    this.connected =
      false;
  }

  getMarketCount():
    number {
    return 0;
  }

  getLastUpdate():
    number {
    return 0;
  }

  onTicker(
    _callback: (
      ticker: NormalizedTicker,
    ) => void,
  ): void {}
}

async function main():
  Promise<void> {
  const observedDelays:
    number[] =
    [];

  const manager =
    new ExchangeManager({
      maximumConnectionAttempts:
        3,

      connectionRetryDelayMs:
        25,

      sleep:
        async (
          delayMs,
        ) => {
          observedDelays.push(
            delayMs,
          );
        },
    });

  const adapter =
    new FlakyExchangeAdapter();

  manager.register(
    adapter,
  );

  await manager.connectAll();

  assert.equal(
    adapter.connectCalls,
    3,
    "A transient adapter must receive bounded startup retries.",
  );

  assert.equal(
    adapter.disconnectCalls,
    2,
    "Each failed attempt must be cleaned up before retrying.",
  );

  assert.deepEqual(
    observedDelays,
    [
      25,
      25,
    ],
  );

  assert.equal(
    adapter.isConnected(),
    true,
  );

  const connectedRecovery =
    await manager
      .recoverDisconnected(
        adapter.name,
      );

  assert.equal(
    connectedRecovery.status,
    "NOT_REQUIRED",
  );

  adapter.simulateTransportLoss();

  const disconnectedRecovery =
    await manager
      .recoverDisconnected(
        adapter.name,
      );

  assert.equal(
    disconnectedRecovery.status,
    "RECOVERY_STARTED",
  );

  assert.equal(
    adapter.connectCalls,
    4,
    "A disconnected adapter must receive a bounded top-level reconnect.",
  );

  assert.equal(
    adapter.disconnectCalls,
    3,
    "Top-level recovery must clean the stale adapter before reconnecting.",
  );

  assert.equal(
    adapter.isConnected(),
    true,
  );

  console.log(
    "EXCHANGE MANAGER CONNECTION RETRY TEST PASSED.",
  );
}

void main();
