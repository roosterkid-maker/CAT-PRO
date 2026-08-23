import type {
  DerivativeAccountEvidenceSnapshot,
  DerivativeAccountProviderStatus,
  DerivativeVenueAccountEvidence,
} from "../models/DerivativeAccountEvidence";

import {
  BinanceUsdMAccountReadProvider,
} from "../providers/BinanceUsdMAccountReadProvider";

import {
  BybitLinearAccountReadProvider,
} from "../providers/BybitLinearAccountReadProvider";

import type {
  DerivativeAccountReadProvider,
} from "../providers/DerivativeAccountReadProvider";
import {CoinDCXFuturesAccountReadProvider, CoinSwitchFuturesAccountReadProvider,
  ZebPayFuturesAccountReadProvider} from "../providers/MultiVenueDerivativeAccountProviders";
import {DERIVATIVE_CANDIDATE_MARKETS} from "../providers/DerivativeProviderUtilities";

export interface DerivativeAccountEvidenceConfiguration {
  readonly markets: readonly string[];
  readonly refreshIntervalMs: number;
  readonly freshnessThresholdMs: number;
  readonly retentionMs: number;
}

const DEFAULT_CONFIGURATION: DerivativeAccountEvidenceConfiguration = {
  markets: DERIVATIVE_CANDIDATE_MARKETS,
  refreshIntervalMs: 15_000,
  freshnessThresholdMs: 30_000,
  retentionMs: 120_000,
};

export class DerivativeAccountEvidenceService {
  private readonly providers: readonly DerivativeAccountReadProvider[];
  private readonly configuration: DerivativeAccountEvidenceConfiguration;
  private readonly evidence = new Map<string, DerivativeVenueAccountEvidence>();
  private readonly statuses = new Map<string, DerivativeAccountProviderStatus>();
  private timer: NodeJS.Timeout | null = null;
  private refreshing = false;

  constructor(
    providers: readonly DerivativeAccountReadProvider[] = [
      new BinanceUsdMAccountReadProvider(),
      new BybitLinearAccountReadProvider(),
      new CoinDCXFuturesAccountReadProvider(),
      new CoinSwitchFuturesAccountReadProvider(),
      new ZebPayFuturesAccountReadProvider(),
    ],
    configuration: Partial<DerivativeAccountEvidenceConfiguration> = {},
  ) {
    this.providers = [...providers];
    this.configuration = {
      ...DEFAULT_CONFIGURATION,
      ...configuration,
      markets: normalizeMarkets(configuration.markets ?? DEFAULT_CONFIGURATION.markets),
    };
    if (this.configuration.markets.length === 0 || this.configuration.markets.length > 20) {
      throw new Error("Derivative account evidence requires one to twenty bounded markets.");
    }
    for (const timing of [this.configuration.refreshIntervalMs, this.configuration.freshnessThresholdMs, this.configuration.retentionMs]) {
      if (!Number.isSafeInteger(timing) || timing <= 0) throw new Error("Derivative account evidence timings must be positive integers.");
    }
    if (this.configuration.retentionMs < this.configuration.freshnessThresholdMs) {
      throw new Error("Derivative account evidence retention cannot be shorter than freshness.");
    }
    for (const provider of this.providers) {
      this.statuses.set(provider.exchange, status(provider));
    }
  }

  start(): void {
    if (this.timer) return;
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), this.configuration.refreshIntervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  async refresh(now = Date.now()): Promise<DerivativeAccountEvidenceSnapshot> {
    if (this.refreshing) return this.getSnapshot(now);
    this.refreshing = true;
    try {
      const results = await Promise.allSettled(
        this.providers.map((provider) => provider.fetch(this.configuration.markets, now)),
      );
      results.forEach((result, index) => {
        const provider = this.providers[index];
        if (!provider) return;
        const previous = this.statuses.get(provider.exchange) ?? status(provider);
        if (result.status === "fulfilled") {
          validateEvidence(result.value, provider.exchange, this.configuration.markets, now);
          this.evidence.set(provider.exchange, immutable(result.value));
          this.statuses.set(provider.exchange, {
            exchange: provider.exchange,
            state: "READY",
            configured: provider.isConfigured(),
            lastAttemptAt: now,
            lastSuccessAt: now,
            retainedUntil: result.value.expiresAt,
            positionMarkets: result.value.positions.length,
            lastError: null,
          });
        } else {
          const retained = this.evidence.get(provider.exchange);
          const usable = Boolean(retained && retained.observedAt <= now && now - retained.observedAt <= this.configuration.retentionMs);
          this.statuses.set(provider.exchange, {
            exchange: provider.exchange,
            state: usable ? "DEGRADED" : "NO_DATA",
            configured: provider.isConfigured(),
            lastAttemptAt: now,
            lastSuccessAt: previous.lastSuccessAt,
            retainedUntil: usable ? retained!.expiresAt : null,
            positionMarkets: usable ? retained!.positions.length : 0,
            lastError: safeMessage(result.reason),
          });
        }
      });
      this.evict(now);
      return this.getSnapshot(now);
    } finally {
      this.refreshing = false;
    }
  }

  getMarketEvidence(
    exchange: string,
    market: string,
    now = Date.now(),
  ): {readonly account: DerivativeVenueAccountEvidence; readonly position: DerivativeVenueAccountEvidence["positions"][number]} | null {
    const venue = this.evidence.get(exchange.trim().toLowerCase());
    if (!venue || venue.observedAt > now || venue.expiresAt < now || now - venue.observedAt > this.configuration.freshnessThresholdMs) return null;
    const normalizedMarket = normalizeMarket(market);
    const position = venue.positions.find((item) => item.market === normalizedMarket);
    return position ? immutable({account: venue, position}) : null;
  }

  getSnapshot(now = Date.now()): DerivativeAccountEvidenceSnapshot {
    const evidence = [...this.evidence.values()]
      .filter((item) => item.observedAt <= now && now - item.observedAt <= this.configuration.retentionMs)
      .sort((first, second) => first.exchange.localeCompare(second.exchange));
    const providers = [...this.statuses.values()]
      .map((item) => {
        const record = evidence.find((candidate) => candidate.exchange === item.exchange);
        const fresh = Boolean(record && record.expiresAt >= now && now - record.observedAt <= this.configuration.freshnessThresholdMs);
        return {...item, state: fresh ? item.state : record ? "DEGRADED" as const : "NO_DATA" as const};
      })
      .sort((first, second) => first.exchange.localeCompare(second.exchange));
    return immutable({
      version: "49.0",
      generatedAt: now,
      mode: "AUTHENTICATED_READ_ONLY_DERIVATIVE_ACCOUNT_EVIDENCE",
      configuredMarkets: [...this.configuration.markets],
      freshnessThresholdMs: this.configuration.freshnessThresholdMs,
      providers,
      evidence,
      safety: {
        signedGetOnly: true,
        credentialValuesExposed: false,
        balanceInferenceAllowed: false,
        positionInferenceAllowed: false,
        orderSubmissionAllowed: false,
        liveExecutionAllowed: false,
      },
    });
  }

  private evict(now: number): void {
    for (const [exchange, record] of this.evidence) {
      if (record.observedAt > now || now - record.observedAt > this.configuration.retentionMs) this.evidence.delete(exchange);
    }
  }
}

function validateEvidence(
  value: DerivativeVenueAccountEvidence,
  exchange: string,
  markets: readonly string[],
  now: number,
): void {
  if (value.exchange !== exchange || value.observedAt !== now || value.expiresAt <= now || !Number.isFinite(value.availableMargin) || value.availableMargin < 0) {
    throw new Error(`Invalid derivative account evidence from ${exchange}.`);
  }
  for (const market of markets) {
    if (!value.positions.some((position) => position.market === market && position.observedAt === now)) {
      throw new Error(`${exchange} authenticated position evidence is incomplete for ${market}.`);
    }
  }
  if (value.orderSubmissionAllowed || value.liveExecutionAllowed) {
    throw new Error(`${exchange} account evidence provider violated read-only safety.`);
  }
}
function status(provider: DerivativeAccountReadProvider): DerivativeAccountProviderStatus { return {exchange: provider.exchange, state: "NO_DATA", configured: provider.isConfigured(), lastAttemptAt: null, lastSuccessAt: null, retainedUntil: null, positionMarkets: 0, lastError: null}; }
function normalizeMarket(value: string): string { return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, ""); }
function normalizeMarkets(values: readonly string[]): string[] { return Array.from(new Set(values.map(normalizeMarket).filter(Boolean))).sort(); }
function safeMessage(value: unknown): string { const message = value instanceof Error ? value.message : "Unknown derivative account evidence failure."; return message.replace(/[A-Za-z0-9+/=_-]{24,}/g, "[REDACTED]").slice(0, 500); }
function immutable<T>(value: T): T { return Object.freeze(structuredClone(value)); }

export const derivativeAccountEvidenceService = new DerivativeAccountEvidenceService();
