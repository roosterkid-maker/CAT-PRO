import type {
  DynamicOpportunityDiscoverySnapshot,
} from "../models/DynamicOpportunityDiscovery";

import {
  dynamicOpportunityDiscoveryService,
  type DynamicOpportunityDiscoveryService,
} from "./DynamicOpportunityDiscoveryService";

export type DynamicOpportunityDiscoverySnapshotListener = (
  snapshot: DynamicOpportunityDiscoverySnapshot,
) => void;

/**
 * One shared read-only discovery clock for all strategy consumers. Individual
 * strategies subscribe to immutable snapshots instead of independently
 * rescanning the market cache at different times.
 */
export class DynamicOpportunityDiscoveryRunnerService {
  private readonly listeners =
    new Set<DynamicOpportunityDiscoverySnapshotListener>();

  private timer: NodeJS.Timeout | null = null;

  private latestSnapshot: DynamicOpportunityDiscoverySnapshot | null = null;

  constructor(
    private readonly service: DynamicOpportunityDiscoveryService =
      dynamicOpportunityDiscoveryService,
    private readonly intervalMs = 1_000,
  ) {
    if (!Number.isSafeInteger(intervalMs) || intervalMs <= 0) {
      throw new Error("Dynamic discovery interval must be a positive integer.");
    }
  }

  start(): void {
    if (this.timer) {
      return;
    }

    this.refresh();

    this.timer = setInterval(() => {
      this.refresh();
    }, this.intervalMs);

    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  isRunning(): boolean {
    return this.timer !== null;
  }

  refresh(now = Date.now()): DynamicOpportunityDiscoverySnapshot {
    /*
     * Discovery snapshots can contain thousands of books and paths. They are
     * already a read-only contract, so clone and freeze exactly once before
     * publishing. Re-cloning the same large graph for every listener and
     * getLatestSnapshot() call created synchronous event-loop stalls that
     * delayed the latency-critical Strategy #1 market-update path.
     */
    const snapshot = immutableClone(
      this.service.getSnapshot(now),
    );

    this.latestSnapshot = snapshot;

    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch (error: unknown) {
        console.error(
          "[DynamicOpportunityDiscoveryRunner] Snapshot listener failed:",
          error instanceof Error ? error.message : "Unknown listener error.",
        );
      }
    }

    return snapshot;
  }

  getLatestSnapshot(): DynamicOpportunityDiscoverySnapshot | null {
    return this.latestSnapshot;
  }

  subscribe(
    listener: DynamicOpportunityDiscoverySnapshotListener,
  ): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }
}

function immutableClone<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }

  for (const nested of Object.values(value)) {
    deepFreeze(nested);
  }

  return Object.freeze(value);
}

export const dynamicOpportunityDiscoveryRunnerService =
  new DynamicOpportunityDiscoveryRunnerService();
