import type {
  DerivativeMarketDataSnapshot,
  DerivativeMarketEvidence,
  DerivativeProviderStatus,
} from "../models/DerivativeMarketEvidence";

import {
  BinanceUsdMPerpetualPublicProvider,
} from "../providers/BinanceUsdMPerpetualPublicProvider";

import {
  BybitLinearPerpetualPublicProvider,
} from "../providers/BybitLinearPerpetualPublicProvider";
import {CoinDCXFuturesPublicProvider} from "../providers/CoinDCXFuturesPublicProvider";
import {CoinSwitchFuturesPublicProvider} from "../providers/CoinSwitchFuturesPublicProvider";
import {ZebPayFuturesPublicProvider} from "../providers/ZebPayFuturesPublicProvider";

import type {
  DerivativePublicProvider,
} from "../providers/DerivativePublicProvider";

import {
  derivativeFeeEvidenceService,
} from "./DerivativeFeeEvidenceService";

export interface DerivativeMarketDataServiceConfiguration {
  readonly refreshIntervalMs: number;
  readonly freshnessThresholdMs: number;
  readonly retentionMs: number;
  readonly maximumFutureClockSkewMs: number;
}

export type DerivativeMarketDataSnapshotListener = (
  snapshot: DerivativeMarketDataSnapshot,
) => void;

const DEFAULT_CONFIGURATION: DerivativeMarketDataServiceConfiguration = {
  refreshIntervalMs: 5_000,
  freshnessThresholdMs: 15_000,
  retentionMs: 60_000,
  maximumFutureClockSkewMs: 2_500,
};

export class DerivativeMarketDataService {
  private readonly providers: readonly DerivativePublicProvider[];
  private readonly configuration: DerivativeMarketDataServiceConfiguration;
  private readonly markets = new Map<string, DerivativeMarketEvidence>();
  private readonly statuses = new Map<string, DerivativeProviderStatus>();
  private readonly listeners = new Set<DerivativeMarketDataSnapshotListener>();
  private timer: NodeJS.Timeout | null = null;
  private refreshInProgress = false;

  constructor(
    providers: readonly DerivativePublicProvider[] = [
      new BinanceUsdMPerpetualPublicProvider(),
      new BybitLinearPerpetualPublicProvider(),
      new CoinDCXFuturesPublicProvider(),
      new CoinSwitchFuturesPublicProvider(),
      new ZebPayFuturesPublicProvider(),
    ],
    configuration: Partial<DerivativeMarketDataServiceConfiguration> = {},
  ) {
    this.providers = [...providers];
    this.configuration = {
      ...DEFAULT_CONFIGURATION,
      ...configuration,
    };

    for (const value of Object.values(this.configuration)) {
      if (!Number.isSafeInteger(value) || value <= 0) {
        throw new Error("Derivative market-data timing values must be positive integers.");
      }
    }

    for (const provider of this.providers) {
      this.statuses.set(provider.exchange, {
        exchange: provider.exchange,
        state: "NO_DATA",
        lastAttemptAt: null,
        lastSuccessAt: null,
        marketCount: 0,
        freshMarketCount: 0,
        lastError: null,
      });
    }
  }

  start(): void {
    if (this.timer) {
      return;
    }

    void this.refresh();
    this.timer = setInterval(() => {
      void this.refresh();
    }, this.configuration.refreshIntervalMs);
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

  async refresh(observationTime?: number): Promise<DerivativeMarketDataSnapshot> {
    const startedAt = observationTime ?? Date.now();
    if (this.refreshInProgress) {
      return this.getSnapshot(observationTime ?? Date.now());
    }

    this.refreshInProgress = true;

    try {
      const results = await Promise.allSettled(
        this.providers.map((provider) => provider.fetchSnapshot(startedAt)),
      );
      const completedAt = observationTime ?? Math.max(startedAt, Date.now());

      results.forEach((result, index) => {
        const provider = this.providers[index];

        if (!provider) {
          return;
        }

        const previous = this.statuses.get(provider.exchange);

        if (result.status === "fulfilled") {
          const receivedMarkets = result.value.markets.map((market) => {
            const rawSourceTimestamp = market.rawSourceTimestamp ?? market.sourceTimestamp;
            const futureClockSkewMs = rawSourceTimestamp - completedAt;
            const boundedFutureClockSkew = futureClockSkewMs > 0 &&
              futureClockSkewMs <= this.configuration.maximumFutureClockSkewMs;
            return {...market, sourceTimestamp: boundedFutureClockSkew ? completedAt : rawSourceTimestamp,
              rawSourceTimestamp, sourceClockOffsetMs: rawSourceTimestamp - completedAt,
              sourceTimestampNormalization: boundedFutureClockSkew ? "BOUNDED_FUTURE_CLOCK_SKEW" as const : "NONE" as const,
              observedAt: completedAt};
          });
          for (const market of receivedMarkets) {
            this.markets.set(this.key(market.exchange, market.market), immutableClone(market));
            if (market.fees) {
              derivativeFeeEvidenceService.observePublicInstrumentRules({
                exchange: market.exchange,
                market: market.market,
                makerPercent: market.fees.makerPercent,
                takerPercent: market.fees.takerPercent,
                observedAt: completedAt,
              });
            }
          }

          this.statuses.set(provider.exchange, {
            exchange: provider.exchange,
            state: "READY",
            lastAttemptAt: completedAt,
            lastSuccessAt: completedAt,
            marketCount: receivedMarkets.length,
            freshMarketCount:
              receivedMarkets.filter((market) => this.isFresh(market, completedAt)).length,
            lastError: null,
          });
        } else {
          const retained = this.getVenueMarkets(provider.exchange, completedAt);

          this.statuses.set(provider.exchange, {
            exchange: provider.exchange,
            state: retained.length > 0 ? "DEGRADED" : "NO_DATA",
            lastAttemptAt: completedAt,
            lastSuccessAt: previous?.lastSuccessAt ?? null,
            marketCount: retained.length,
            freshMarketCount: retained.filter((market) => this.isFresh(market, completedAt)).length,
            lastError:
              result.reason instanceof Error
                ? result.reason.message
                : "Unknown derivative provider failure.",
          });
        }
      });

      this.evictExpired(completedAt);
      const snapshot = this.getSnapshot(completedAt);

      for (const listener of this.listeners) {
        try {
          listener(immutableClone(snapshot));
        } catch (error: unknown) {
          console.error(
            "[DerivativeMarketData] Snapshot listener failed:",
            error instanceof Error ? error.message : "Unknown listener error.",
          );
        }
      }

      return snapshot;
    } finally {
      this.refreshInProgress = false;
    }
  }

  getSnapshot(now = Date.now()): DerivativeMarketDataSnapshot {
    const markets = [...this.markets.values()]
      .filter((market) => now - market.observedAt <= this.configuration.retentionMs)
      .sort((first, second) =>
        first.exchange.localeCompare(second.exchange) ||
        first.market.localeCompare(second.market),
      );
    const providers = [...this.statuses.values()]
      .map((status) => ({
        ...status,
        freshMarketCount:
          markets.filter((market) =>
            market.exchange === status.exchange && this.isFresh(market, now),
          ).length,
      }))
      .sort((first, second) => first.exchange.localeCompare(second.exchange));

    return immutableClone({
      generatedAt: now,
      version: "26.0",
      mode: "PUBLIC_READ_ONLY_DERIVATIVES_FOUNDATION",
      freshnessThresholdMs: this.configuration.freshnessThresholdMs,
      summary: {
        providers: providers.length,
        readyProviders: providers.filter((provider) => provider.state === "READY").length,
        markets: markets.length,
        freshMarkets: markets.filter((market) => this.isFresh(market, now)).length,
        exchanges: new Set(markets.map((market) => market.exchange)).size,
        positionEvidenceMarkets: 0,
        marginEvidenceMarkets: 0,
        derivativeExecutionAdapters: 0,
      },
      providers,
      markets,
      safety: {
        publicReadOnly: true,
        topOfBookOnly: true,
        fullDepthAvailable: false,
        positionStateAvailable: false,
        marginStateAvailable: false,
        liquidationControlAvailable: false,
        reduceOnlyVerified: false,
        paperExecutionAllowed: false,
        liveExecutionAllowed: false,
        orderSubmissionAllowed: false,
      },
    });
  }

  subscribe(listener: DerivativeMarketDataSnapshotListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  private isFresh(market: DerivativeMarketEvidence, now: number): boolean {
    return (
      market.observedAt <= now &&
      market.sourceTimestamp <= now &&
      now - market.observedAt <= this.configuration.freshnessThresholdMs &&
      now - market.sourceTimestamp <= this.configuration.freshnessThresholdMs
    );
  }

  private getVenueMarkets(exchange: string, now: number): DerivativeMarketEvidence[] {
    return [...this.markets.values()].filter((market) =>
      market.exchange === exchange && now - market.observedAt <= this.configuration.retentionMs,
    );
  }

  private evictExpired(now: number): void {
    for (const [key, market] of this.markets) {
      if (market.observedAt > now || now - market.observedAt > this.configuration.retentionMs) {
        this.markets.delete(key);
      }
    }
  }

  private key(exchange: string, market: string): string {
    return `${exchange.trim().toLowerCase()}:${market.trim().toUpperCase()}`;
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

export const derivativeMarketDataService = new DerivativeMarketDataService();
