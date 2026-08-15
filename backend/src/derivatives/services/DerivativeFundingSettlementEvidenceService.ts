import type {
  DerivativeFundingSettlementEvidence,
  DerivativeFundingSettlementProviderStatus,
  DerivativeFundingSettlementSnapshot,
} from "../models/DerivativeFundingSettlementEvidence";

import {
  BinanceUsdMFundingSettlementProvider,
} from "../providers/BinanceUsdMFundingSettlementProvider";

import {
  BybitLinearFundingSettlementProvider,
} from "../providers/BybitLinearFundingSettlementProvider";

import type {
  DerivativeFundingSettlementProvider,
} from "../providers/DerivativeFundingSettlementProvider";

export interface DerivativeFundingSettlementServiceConfiguration {
  readonly refreshIntervalMs: number;
  readonly retentionMs: number;
  readonly maximumEvidence: number;
  readonly maximumFundingTimeMatchSkewMs: number;
}

const DEFAULT_CONFIGURATION: DerivativeFundingSettlementServiceConfiguration = {
  refreshIntervalMs: 60_000,
  retentionMs: 72 * 60 * 60 * 1_000,
  maximumEvidence: 100,
  maximumFundingTimeMatchSkewMs: 1_000,
};

export class DerivativeFundingSettlementEvidenceService {
  private readonly configuration: DerivativeFundingSettlementServiceConfiguration;
  private readonly evidence = new Map<string, DerivativeFundingSettlementEvidence>();
  private readonly statuses = new Map<string, DerivativeFundingSettlementProviderStatus>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private refreshing = false;

  constructor(
    private readonly providers: readonly DerivativeFundingSettlementProvider[] = [
      new BinanceUsdMFundingSettlementProvider(),
      new BybitLinearFundingSettlementProvider(),
    ],
    configuration: Partial<DerivativeFundingSettlementServiceConfiguration> = {},
  ) {
    this.configuration = {...DEFAULT_CONFIGURATION, ...configuration};
    if (!Number.isSafeInteger(this.configuration.refreshIntervalMs) || this.configuration.refreshIntervalMs < 10_000 ||
        !Number.isSafeInteger(this.configuration.retentionMs) || this.configuration.retentionMs < 60_000 ||
        !Number.isSafeInteger(this.configuration.maximumEvidence) || this.configuration.maximumEvidence < 1 ||
        !Number.isSafeInteger(this.configuration.maximumFundingTimeMatchSkewMs) ||
        this.configuration.maximumFundingTimeMatchSkewMs < 0 ||
        this.configuration.maximumFundingTimeMatchSkewMs > 60_000) {
      throw new Error("Derivative funding settlement service configuration is invalid.");
    }
    for (const provider of providers) this.statuses.set(provider.exchange, status(provider.exchange));
  }

  start(): void {
    if (this.timer) return;
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), this.configuration.refreshIntervalMs);
    this.timer.unref?.();
  }
  stop(): void { if (this.timer) clearInterval(this.timer); this.timer = null; }
  isRunning(): boolean { return this.timer !== null; }

  async refresh(now = Date.now()): Promise<DerivativeFundingSettlementSnapshot> {
    validateNow(now);
    if (this.refreshing) return this.getSnapshot(now);
    this.refreshing = true;
    try {
      const results = await Promise.allSettled(this.providers.map((provider) => provider.fetchSettlements(now)));
      results.forEach((result, index) => {
        const provider = this.providers[index]; if (!provider) return;
        const previous = this.statuses.get(provider.exchange) ?? status(provider.exchange);
        if (result.status === "fulfilled") {
          for (const item of result.value.evidence) if (validEvidence(item, provider.exchange, now)) this.evidence.set(item.id, clone(item));
          this.statuses.set(provider.exchange, {exchange: provider.exchange, state: result.value.evidence.length > 0 ? "READY" : "NO_DATA",
            lastAttemptAt: now, lastSuccessAt: result.value.evidence.length > 0 ? now : previous.lastSuccessAt,
            evidenceCount: result.value.evidence.length, lastError: null});
        } else {
          const retained = [...this.evidence.values()].filter((item) => item.exchange === provider.exchange && now - item.fundingTime <= this.configuration.retentionMs);
          this.statuses.set(provider.exchange, {exchange: provider.exchange, state: retained.length > 0 ? "DEGRADED" : "NO_DATA",
            lastAttemptAt: now, lastSuccessAt: previous.lastSuccessAt, evidenceCount: retained.length,
            lastError: result.reason instanceof Error ? result.reason.message : "Unknown funding evidence provider failure."});
        }
      });
      this.evict(now);
      return this.getSnapshot(now);
    } finally { this.refreshing = false; }
  }

  get(exchange: string, market: string, fundingTime: number, now = Date.now()): DerivativeFundingSettlementEvidence | null {
    validateNow(now);
    const normalizedExchange = exchange.trim().toLowerCase(); const normalizedMarket = symbol(market);
    const id = `funding-settlement:${normalizedExchange}:${normalizedMarket}:${fundingTime}`;
    const exact = this.evidence.get(id);
    const item = exact ?? [...this.evidence.values()]
      .filter((candidate) =>
        candidate.exchange === normalizedExchange &&
        candidate.market === normalizedMarket &&
        Math.abs(candidate.fundingTime - fundingTime) <=
          this.configuration.maximumFundingTimeMatchSkewMs,
      )
      .sort((first, second) =>
        Math.abs(first.fundingTime - fundingTime) - Math.abs(second.fundingTime - fundingTime) ||
        second.observedAt - first.observedAt ||
        first.id.localeCompare(second.id),
      )[0];
    if (!item || item.fundingTime > now || now - item.fundingTime > this.configuration.retentionMs || item.observedAt > now) return null;
    return clone(item);
  }

  getSnapshot(now = Date.now()): DerivativeFundingSettlementSnapshot {
    validateNow(now);
    const evidence = [...this.evidence.values()].filter((item) => item.fundingTime <= now && now - item.fundingTime <= this.configuration.retentionMs)
      .sort((first, second) => second.fundingTime - first.fundingTime || first.exchange.localeCompare(second.exchange) || first.market.localeCompare(second.market));
    const providers = [...this.statuses.values()].sort((first, second) => first.exchange.localeCompare(second.exchange));
    return freeze({version: "56.0", generatedAt: now, mode: "PUBLIC_SETTLED_FUNDING_PAPER_EVIDENCE", retentionMs: this.configuration.retentionMs,
      evidence, providers, summary: {evidence: evidence.length,
        exactExchangeMarkPrices: evidence.filter((item) => item.priceQuality === "EXACT_EXCHANGE_ASSOCIATED_MARK_PRICE").length,
        boundedMarkPriceProxies: evidence.filter((item) => item.priceQuality === "BOUNDED_PUBLIC_MARK_KLINE_PROXY").length,
        readyProviders: providers.filter((item) => item.state === "READY").length},
      safety: {publicReadOnly: true, accountTransactionsAttributedToPaperPositions: false, proxyEvidenceLabeled: true,
        liveExecutionAllowed: false, orderSubmissionAllowed: false}});
  }

  private evict(now: number): void {
    for (const [id, item] of this.evidence) if (item.fundingTime > now || now - item.fundingTime > this.configuration.retentionMs) this.evidence.delete(id);
    const ordered = [...this.evidence.values()].sort((first, second) => first.fundingTime - second.fundingTime || first.id.localeCompare(second.id));
    for (const item of ordered.slice(0, Math.max(0, ordered.length - this.configuration.maximumEvidence))) this.evidence.delete(item.id);
  }
}

function validEvidence(item: DerivativeFundingSettlementEvidence, exchange: string, now: number): boolean {
  return item.version === "56.0" && item.exchange === exchange && Boolean(item.id.trim()) && Boolean(item.market.trim()) && item.settlementAsset === "USDT" &&
    Number.isSafeInteger(item.fundingTime) && item.fundingTime > 0 && item.fundingTime <= now && Number.isFinite(item.fundingRate) && Math.abs(item.fundingRate) <= 1 &&
    Number.isFinite(item.markPrice) && item.markPrice > 0 && item.observedAt === now && item.accountTransactionEvidenceUsed === false &&
    item.liveExecutionAllowed === false && item.orderSubmissionAllowed === false;
}
function status(exchange: string): DerivativeFundingSettlementProviderStatus { return {exchange, state: "NO_DATA", lastAttemptAt: null, lastSuccessAt: null, evidenceCount: 0, lastError: null}; }
function validateNow(now: number): void { if (!Number.isSafeInteger(now) || now <= 0) throw new Error("Funding settlement service timestamp is invalid."); }
function symbol(value: string): string { return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, ""); }
function clone<T>(value: T): T { return structuredClone(value); }
function freeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; for (const nested of Object.values(value)) freeze(nested); return Object.freeze(value); }

export const derivativeFundingSettlementEvidenceService = new DerivativeFundingSettlementEvidenceService();
