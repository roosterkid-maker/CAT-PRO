import type {
  ArbitrageOpportunity,
} from "../../arbitrage/models/ArbitrageOpportunity";

import {
  opportunityService,
} from "../../arbitrage/services/OpportunityService";

import type {
  OpportunitySnapshot,
  OpportunitySnapshotListener,
} from "../../arbitrage/services/OpportunityService";

import type {
  StrategyController,
  StrategySignalListener,
} from "../contracts/StrategyController";

import {
  crossExchangeArbitrageStrategyMetadata,
} from "../models/StrategyMetadata";

import type {
  StrategyMetadata,
} from "../models/StrategyMetadata";

import type {
  StrategyRuntimeSnapshot,
} from "../models/StrategyRuntimeSnapshot";

import {
  immutableStrategySignal,
} from "../models/StrategySignal";

import type {
  StrategySignal,
} from "../models/StrategySignal";

export interface CrossExchangeOpportunitySnapshotSource {
  getLastOpportunitySnapshot():
    OpportunitySnapshot | null;

  subscribeToOpportunitySnapshots(
    listener:
      OpportunitySnapshotListener,
  ):
    () => void;
}

export interface CrossExchangeArbitrageStrategyControllerConfig {
  maximumSignalAgeMs:
    number;
}

const DEFAULT_CONFIG:
  CrossExchangeArbitrageStrategyControllerConfig = {
  maximumSignalAgeMs:
    7_500,
};

export class CrossExchangeArbitrageStrategyController
implements StrategyController {
  private readonly config:
    CrossExchangeArbitrageStrategyControllerConfig;

  private readonly listeners =
    new Set<
      StrategySignalListener
    >();

  private unsubscribeFromSnapshots:
    (() => void) | null =
    null;

  private running =
    false;

  private startCount =
    0;

  private stopCount =
    0;

  private processedSnapshots =
    0;

  private duplicateSnapshotsIgnored =
    0;

  private totalSignalsObserved =
    0;

  private lastStartedAt:
    number | null =
    null;

  private lastStoppedAt:
    number | null =
    null;

  private lastSnapshotGeneratedAt:
    number | null =
    null;

  private lastSnapshotReceivedAt:
    number | null =
    null;

  private lastSnapshotOpportunityCount:
    number | null =
    null;

  private lastSignalObservedAt:
    number | null =
    null;

  private lastError:
    string | null =
    null;

  private currentSignals:
    StrategySignal[] =
    [];

  constructor(
    config:
      Partial<CrossExchangeArbitrageStrategyControllerConfig> = {},

    private readonly source:
      CrossExchangeOpportunitySnapshotSource =
        opportunityService,
  ) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };

    this.validateConfig();
  }

  getMetadata():
    StrategyMetadata {
    return structuredClone(
      crossExchangeArbitrageStrategyMetadata,
    );
  }

  getDiagnosticEvidence():
    unknown {
    return this.source
      .getLastOpportunitySnapshot();
  }

  start():
    void {
    if (
      this.running
    ) {
      return;
    }

    try {
      this.unsubscribeFromSnapshots =
        this.source
          .subscribeToOpportunitySnapshots(
            (snapshot) => {
              this.observeSnapshot(
                snapshot,
              );
            },
          );

      this.running =
        true;

      this.startCount +=
        1;

      this.lastStartedAt =
        Date.now();

      const latestSnapshot =
        this.source
          .getLastOpportunitySnapshot();

      if (
        latestSnapshot
      ) {
        this.observeSnapshot(
          latestSnapshot,
        );
      }

      this.lastError =
        null;
    } catch (
      error:
        unknown
    ) {
      this.unsubscribeFromSnapshots
        ?.();

      this.unsubscribeFromSnapshots =
        null;

      this.running =
        false;

      this.lastError =
        this.getErrorMessage(
          error,
        );

      throw error;
    }
  }

  stop():
    void {
    if (
      !this.running
    ) {
      return;
    }

    this.unsubscribeFromSnapshots
      ?.();

    this.unsubscribeFromSnapshots =
      null;

    this.running =
      false;

    this.stopCount +=
      1;

    this.lastStoppedAt =
      Date.now();
  }

  isRunning():
    boolean {
    return this.running;
  }

  getRuntimeSnapshot(
    now =
      Date.now(),
  ): StrategyRuntimeSnapshot {
    const snapshotAvailable =
      this.lastSnapshotGeneratedAt !==
        null &&
      now -
        this.lastSnapshotGeneratedAt <=
        this.config
          .maximumSignalAgeMs;

    const signals =
      this.getSignals(
        now,
      );

    return {
      strategyId:
        crossExchangeArbitrageStrategyMetadata
          .id,

      generatedAt:
        now,

      running:
        this.running,

      startCount:
        this.startCount,

      stopCount:
        this.stopCount,

      lastStartedAt:
        this.lastStartedAt,

      lastStoppedAt:
        this.lastStoppedAt,

      processedSnapshots:
        this.processedSnapshots,

      duplicateSnapshotsIgnored:
        this.duplicateSnapshotsIgnored,

      totalSignalsObserved:
        this.totalSignalsObserved,

      currentSignalCount:
        signals.length,

      lastSnapshotGeneratedAt:
        this.lastSnapshotGeneratedAt,

      lastSnapshotReceivedAt:
        this.lastSnapshotReceivedAt,

      lastSnapshotOpportunityCount:
        this.lastSnapshotOpportunityCount,

      lastSignalObservedAt:
        this.lastSignalObservedAt,

      lastError:
        this.lastError,

      evidence: {
        snapshot:
          snapshotAvailable
            ? "AVAILABLE"
            : "NO_DATA",

        signals:
          signals.length >
          0
            ? "AVAILABLE"
            : "NO_DATA",

        performance:
          "NOT_REPORTED",
      },

      legacyHistoryAttribution:
        "UNATTRIBUTED_LEGACY",

      safety: {
        readOnly:
          true,

        signalExecutionAllowed:
          false,

        intentExecutionAllowed:
          false,

        automaticExecutionAllowed:
          false,
      },
    };
  }

  getSignals(
    now =
      Date.now(),
  ): readonly StrategySignal[] {
    return this.currentSignals
      .filter(
        (signal) =>
          signal.expiresAt >=
          now,
      )
      .map(
        (signal) =>
          immutableStrategySignal(
            signal,
          ),
      );
  }

  subscribeToSignals(
    listener:
      StrategySignalListener,
  ): () => void {
    this.listeners.add(
      listener,
    );

    return () => {
      this.listeners.delete(
        listener,
      );
    };
  }

  private observeSnapshot(
    snapshot:
      OpportunitySnapshot,
  ): void {
    if (
      !Number.isFinite(
        snapshot.generatedAt,
      ) ||
      snapshot.generatedAt <=
        0
    ) {
      this.lastError =
        "Opportunity snapshot generatedAt must be a positive finite number.";

      return;
    }

    if (
      this.lastSnapshotGeneratedAt ===
      snapshot.generatedAt
    ) {
      this.duplicateSnapshotsIgnored +=
        1;

      return;
    }

    const observedAt =
      Date.now();

    const signals =
      snapshot.opportunities
        .map(
          (opportunity) =>
            this.toSignal(
              snapshot,
              opportunity,
              observedAt,
            ),
        )
        .sort(
          (
            first,
            second,
          ) =>
            first.id.localeCompare(
              second.id,
            ),
        );

    this.currentSignals =
      signals;

    this.processedSnapshots +=
      1;

    this.totalSignalsObserved +=
      signals.length;

    this.lastSnapshotGeneratedAt =
      snapshot.generatedAt;

    this.lastSnapshotReceivedAt =
      observedAt;

    this.lastSnapshotOpportunityCount =
      snapshot.opportunities
        .length;

    this.lastSignalObservedAt =
      signals.length >
      0
        ? observedAt
        : this.lastSignalObservedAt;

    this.lastError =
      null;

    for (
      const signal
      of signals
    ) {
      for (
        const listener
        of this.listeners
      ) {
        try {
          listener(
            immutableStrategySignal(
              signal,
            ),
          );
        } catch (
          error:
            unknown
        ) {
          console.error(
            "[CrossExchangeArbitrageStrategyController] Read-only signal listener failed:",
            this.getErrorMessage(
              error,
            ),
          );
        }
      }
    }
  }

  private toSignal(
    snapshot:
      OpportunitySnapshot,

    opportunity:
      ArbitrageOpportunity,

    observedAt:
      number,
  ): StrategySignal {
    const strategyId =
      crossExchangeArbitrageStrategyMetadata
        .id;

    return immutableStrategySignal({
      id: [
        strategyId,
        snapshot.generatedAt,
        opportunity.id,
      ].join(
        ":",
      ),

      strategyId,

      kind:
        "CROSS_EXCHANGE_ARBITRAGE_OPPORTUNITY",

      evidenceStatus:
        "AVAILABLE",

      source:
        "OpportunityService",

      sourceOpportunityId:
        opportunity.id,

      sourceSnapshotGeneratedAt:
        snapshot.generatedAt,

      generatedAt:
        snapshot.generatedAt,

      observedAt,

      expiresAt:
        snapshot.generatedAt +
        this.config
          .maximumSignalAgeMs,

      executionAuthorized:
        false,

      automaticExecutionAllowed:
        false,

      evidence: {
        market:
          opportunity.pair.market
            .trim()
            .toUpperCase(),

        buyExchange:
          opportunity.pair.buy.exchange
            .trim()
            .toLowerCase(),

        sellExchange:
          opportunity.pair.sell.exchange
            .trim()
            .toLowerCase(),

        buyPrice:
          opportunity.buyPrice,

        sellPrice:
          opportunity.sellPrice,

        executableQuantity:
          opportunity.executableQty,

        netProfit:
          opportunity.netProfit,

        netProfitPercent:
          opportunity.netProfitPercent,

        estimatedFees:
          opportunity.estimatedFees,

        rawSpread:
          opportunity.rawSpread,

        rawSpreadPercent:
          opportunity.rawSpreadPercent,

        liquidityScore:
          opportunity.liquidityScore,

        freshnessScore:
          opportunity.freshnessScore,

        decision:
          opportunity.decision,

        quotesAreFresh:
          opportunity.quotesAreFresh,

        enoughLiquidity:
          opportunity.enoughLiquidity,

        opportunityTimestamp:
          opportunity.timestamp,
      },
    });
  }

  private validateConfig():
    void {
    if (
      !Number.isSafeInteger(
        this.config
          .maximumSignalAgeMs,
      ) ||
      this.config
        .maximumSignalAgeMs <=
        0
    ) {
      throw new Error(
        "maximumSignalAgeMs must be a positive safe integer.",
      );
    }
  }

  private getErrorMessage(
    error:
      unknown,
  ): string {
    return error instanceof Error &&
      error.message.trim()
      ? error.message
      : "Unknown strategy-controller error.";
  }
}
