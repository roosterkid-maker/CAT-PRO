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
    const snapshot = this.service.getSnapshot(now);

    this.latestSnapshot = immutableClone(snapshot);

    for (const listener of this.listeners) {
      try {
        listener(immutableClone(snapshot));
      } catch (error: unknown) {
        console.error(
          "[DynamicOpportunityDiscoveryRunner] Snapshot listener failed:",
          error instanceof Error ? error.message : "Unknown listener error.",
        );
      }
    }

    return immutableClone(snapshot);
  }

  getLatestSnapshot(): DynamicOpportunityDiscoverySnapshot | null {
    return this.latestSnapshot
      ? immutableClone(this.latestSnapshot)
      : null;
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
