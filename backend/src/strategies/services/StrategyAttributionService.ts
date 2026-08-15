import type {
  OpportunitySnapshot,
} from "../../arbitrage/services/OpportunityService";

import type {
  StrategySignalListener,
} from "../contracts/StrategyController";

import {
  cloneStrategyAttribution,
  strategyAttributionFromSignal,
} from "../models/StrategyAttribution";

import type {
  StrategyAttribution,
} from "../models/StrategyAttribution";

import type {
  StrategySignal,
} from "../models/StrategySignal";

export interface StrategySignalSubscriptionSource {
  subscribeToSignals(
    listener: StrategySignalListener,
  ): () => void;
}

export interface StrategyAttributionServiceConfig {
  maximumSignals: number;
}

const DEFAULT_CONFIG: StrategyAttributionServiceConfig = {
  maximumSignals: 5_000,
};

/**
 * Read-only exact-key resolver between StrategySignal evidence
 * and the authoritative opportunity snapshot consumed by automation.
 *
 * It cannot infer attribution from market, exchange, or route and has
 * no execution, Paper, LIVE, capital, accounting, or recovery methods.
 */
export class StrategyAttributionService {
  private readonly config: StrategyAttributionServiceConfig;

  private readonly bySourceEvidence =
    new Map<string, StrategyAttribution>();

  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly signalSource: StrategySignalSubscriptionSource,
    config: Partial<StrategyAttributionServiceConfig> = {},
  ) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };

    if (
      !Number.isSafeInteger(this.config.maximumSignals) ||
      this.config.maximumSignals <= 0
    ) {
      throw new Error("maximumSignals must be a positive safe integer.");
    }
  }

  start(): void {
    if (this.unsubscribe) {
      return;
    }

    this.unsubscribe = this.signalSource.subscribeToSignals(
      (signal) => {
        this.observeSignal(signal);
      },
    );
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  isRunning(): boolean {
    return this.unsubscribe !== null;
  }

  resolve(
    sourceSnapshotGeneratedAt: number,
    sourceOpportunityId: string,
  ): StrategyAttribution | null {
    const attribution = this.bySourceEvidence.get(
      this.createKey(
        sourceSnapshotGeneratedAt,
        sourceOpportunityId,
      ),
    );

    return attribution
      ? cloneStrategyAttribution(attribution)
      : null;
  }

  resolveSnapshot(
    snapshot: OpportunitySnapshot,
  ): ReadonlyMap<string, StrategyAttribution> {
    const resolved = new Map<string, StrategyAttribution>();

    for (const opportunity of snapshot.opportunities) {
      const attribution = this.resolve(
        snapshot.generatedAt,
        opportunity.id,
      );

      if (attribution) {
        resolved.set(
          opportunity.id,
          attribution,
        );
      }
    }

    return resolved;
  }

  private observeSignal(
    signal: StrategySignal,
  ): void {
    /*
     * Opportunity attribution is exact-keyed to Strategy #1's
     * authoritative opportunity snapshot. XEMM pricing evidence has
     * no opportunity identity and must never be inferred into that
     * historical/automation attribution path.
     */
    if (
      signal.kind !==
      "CROSS_EXCHANGE_ARBITRAGE_OPPORTUNITY"
    ) {
      return;
    }

    const key = this.createKey(
      signal.sourceSnapshotGeneratedAt,
      signal.sourceOpportunityId,
    );

    this.bySourceEvidence.set(
      key,
      strategyAttributionFromSignal(signal),
    );

    while (
      this.bySourceEvidence.size >
      this.config.maximumSignals
    ) {
      const oldestKey = this.bySourceEvidence.keys().next().value;

      if (typeof oldestKey !== "string") {
        break;
      }

      this.bySourceEvidence.delete(oldestKey);
    }
  }

  private createKey(
    sourceSnapshotGeneratedAt: number,
    sourceOpportunityId: string,
  ): string {
    return `${sourceSnapshotGeneratedAt}:${sourceOpportunityId}`;
  }
}
