import assert from "node:assert/strict";

import {
  DerivativeEvidenceRefreshCoordinator,
  type DerivativeEvidenceRefreshSource,
} from "../services/DerivativeEvidenceRefreshCoordinator";

import {
  DerivativeDepthService,
  type DerivativeDepthFetcher,
} from "../services/DerivativeDepthService";

class OrderedFixtureSource implements DerivativeEvidenceRefreshSource {
  constructor(
    private readonly name: string,
    private readonly events: string[],
  ) {}

  async refresh(now?: number): Promise<void> {
    this.events.push(`${this.name}:${now ?? "none"}`);
  }
}

class CompletionTimestampDepthFetcher implements DerivativeDepthFetcher {
  readonly exchange = "fixture";

  async fetch(markets: readonly string[], startedAt = Date.now()) {
    await new Promise((resolve) => setTimeout(resolve, 5));
    const observedAt = Date.now();
    return {
      exchange: this.exchange,
      generatedAt: startedAt,
      books: markets.map((market) => ({
        exchange: this.exchange,
        market,
        product: "LINEAR_PERPETUAL" as const,
        bids: [{price: 100, quantity: 1}],
        asks: [{price: 101, quantity: 1}],
        sourceTimestamp: observedAt,
        observedAt,
        source: "PUBLIC_REST_FULL_DEPTH" as const,
        executionAuthorized: false as const,
        orderSubmissionAllowed: false as const,
      })),
    };
  }
}

async function main(): Promise<void> {
  const events: string[] = [];
  const coordinator = new DerivativeEvidenceRefreshCoordinator(
    new OrderedFixtureSource("depth", events),
    new OrderedFixtureSource("market", events),
    {refreshIntervalMs: 60_000},
  );

  await coordinator.refresh(10_000);

  assert.equal(events.length, 2);
  assert.equal(events[0], "depth:10000");
  assert.match(events[1] ?? "", /^market:\d+$/);
  assert.equal(coordinator.isRunning(), false);

  const startedAt = Date.now();
  const depth = new DerivativeDepthService(
    [new CompletionTimestampDepthFetcher()],
    {markets: ["BTCUSDT"], refreshIntervalMs: 60_000},
  );
  const depthSnapshot = await depth.refresh(startedAt);
  assert.equal(depthSnapshot.summary.retainedBooks, 1);
  assert.equal(depthSnapshot.summary.freshBooks, 1);
  assert.ok((depthSnapshot.books[0]?.observedAt ?? 0) >= startedAt);

  console.log("DERIVATIVE EVIDENCE REFRESH COORDINATOR TEST PASSED.");
  console.log("Bounded full depth completed before the market snapshot notification; no execution path was reachable.");
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
