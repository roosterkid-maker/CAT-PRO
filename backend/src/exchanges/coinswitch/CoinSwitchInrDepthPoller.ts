import {
  CoinSwitchDepthApi,
  type CoinSwitchSignedDepthSnapshot,
} from "./api/CoinSwitchDepthApi";

import {
  orderBookService,
} from "../../orderbook/services/OrderBookService";

/*
 * CoinSwitch's public Socket.IO feed acknowledges INR ("coinswitchx")
 * order-book subscriptions but never streams them (verified against the
 * live feed), so INR depth only exists through the signed read-only REST
 * depth endpoint. This poller rotates through the INR arbitrage scanner's
 * best CoinSwitch INR nominations at a bounded request rate and publishes
 * each snapshot to the shared order-book store, where the scanner upgrades
 * that leg to BOOK evidence while it is fresh.
 *
 * Read-only market data: no order, balance or transfer authority.
 */

export interface CoinSwitchInrDepthPollerDiagnostics {
  readonly running: boolean;
  readonly requests: number;
  readonly successes: number;
  readonly failures: number;
  readonly consecutiveFailures: number;
  readonly pausedUntil: number | null;
  readonly lastMarket: string | null;
  readonly lastError: string | null;
  readonly lastSuccessAt: number | null;
  readonly activeMarkets: readonly string[];
  readonly skippedMarkets: readonly string[];
  readonly invalidMarketSkips: number;
}

export interface CoinSwitchInrDepthPollerDependencies {
  readonly getDepth: (market: string) => Promise<CoinSwitchSignedDepthSnapshot>;
  readonly publish: (snapshot: CoinSwitchSignedDepthSnapshot) => void;
  readonly now: () => number;
}

const depthApi = new CoinSwitchDepthApi();

const DEFAULT_DEPENDENCIES: CoinSwitchInrDepthPollerDependencies = {
  getDepth: (market) => depthApi.getDepth({venue: "coinswitchx", market}),
  publish: (snapshot) =>
    orderBookService.replace({
      exchange: "coinswitch",
      market: snapshot.market,
      bids: snapshot.bids,
      asks: snapshot.asks,
      timestamp: snapshot.timestamp,
    }),
  now: Date.now,
};

export class CoinSwitchInrDepthPoller {
  /** Two signed reads per second, well inside a conservative REST budget. */
  static readonly REQUEST_INTERVAL_MS = 500;
  /** Rotation set: each market is refreshed about every 6s. */
  static readonly MAXIMUM_ACTIVE_MARKETS = 12;
  private static readonly FAILURES_BEFORE_PAUSE = 5;
  private static readonly PAUSE_MS = 60_000;
  private static readonly BAD_MARKET_SKIP_MS = 10 * 60_000;

  private readonly skippedMarkets = new Map<string, number>();
  private invalidMarketSkips = 0;

  private readonly dependencies: CoinSwitchInrDepthPollerDependencies;
  private timer: ReturnType<typeof setInterval> | null = null;
  private inFlight = false;
  private cursor = 0;
  private requests = 0;
  private successes = 0;
  private failures = 0;
  private consecutiveFailures = 0;
  private pausedUntil: number | null = null;
  private lastMarket: string | null = null;
  private lastError: string | null = null;
  private lastSuccessAt: number | null = null;
  private activeMarkets: string[] = [];

  constructor(
    private readonly getNominations: () => readonly string[],
    dependencies: Partial<CoinSwitchInrDepthPollerDependencies> = {},
  ) {
    this.dependencies = {...DEFAULT_DEPENDENCIES, ...dependencies};
  }

  start(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => void this.tick(), CoinSwitchInrDepthPoller.REQUEST_INTERVAL_MS);
    this.timer.unref?.();
    console.log("[CoinSwitch INR Depth] Signed REST depth poller started for INR scanner nominations.");
  }

  stop(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  async tick(): Promise<void> {
    const now = this.dependencies.now();
    if (this.inFlight) return;
    if (this.pausedUntil !== null) {
      if (now < this.pausedUntil) return;
      this.pausedUntil = null;
      this.consecutiveFailures = 0;
    }

    for (const [market, until] of this.skippedMarkets) if (until <= now) this.skippedMarkets.delete(market);
    this.activeMarkets = this.getNominations()
      .filter((market) => /INR$/iu.test(market.replace(/[^A-Za-z0-9]/gu, "")) && !this.skippedMarkets.has(market))
      .slice(0, CoinSwitchInrDepthPoller.MAXIMUM_ACTIVE_MARKETS);
    if (this.activeMarkets.length === 0) return;

    const market = this.activeMarkets[this.cursor % this.activeMarkets.length];
    this.cursor = (this.cursor + 1) % Math.max(1, this.activeMarkets.length);
    this.inFlight = true;
    this.requests += 1;
    this.lastMarket = market;

    try {
      const snapshot = await this.dependencies.getDepth(market);
      this.dependencies.publish(snapshot);
      this.successes += 1;
      this.consecutiveFailures = 0;
      this.lastSuccessAt = this.dependencies.now();
    } catch (error: unknown) {
      this.failures += 1;
      this.lastError = error instanceof Error ? error.message : String(error);
      // A malformed book is one market's problem (CoinSwitch returns some
      // unsorted/duplicate levels), not an API outage: skip that market for
      // a while instead of pausing every other market's refresh.
      if (/invalid or unsorted levels|failed market, clock, or book integrity|does not support/iu.test(this.lastError)) {
        this.skippedMarkets.set(market, this.dependencies.now() + CoinSwitchInrDepthPoller.BAD_MARKET_SKIP_MS);
        this.invalidMarketSkips += 1;
        return;
      }
      this.consecutiveFailures += 1;
      if (this.consecutiveFailures >= CoinSwitchInrDepthPoller.FAILURES_BEFORE_PAUSE) {
        this.pausedUntil = this.dependencies.now() + CoinSwitchInrDepthPoller.PAUSE_MS;
        console.warn(`[CoinSwitch INR Depth] ${this.consecutiveFailures} consecutive failures; pausing 60s. Last: ${this.lastError}`);
      }
    } finally {
      this.inFlight = false;
    }
  }

  getDiagnostics(): CoinSwitchInrDepthPollerDiagnostics {
    return {
      running: this.timer !== null,
      requests: this.requests,
      successes: this.successes,
      failures: this.failures,
      consecutiveFailures: this.consecutiveFailures,
      pausedUntil: this.pausedUntil,
      lastMarket: this.lastMarket,
      lastError: this.lastError,
      lastSuccessAt: this.lastSuccessAt,
      activeMarkets: [...this.activeMarkets],
      skippedMarkets: [...this.skippedMarkets.keys()],
      invalidMarketSkips: this.invalidMarketSkips,
    };
  }
}

let sharedPoller: CoinSwitchInrDepthPoller | null = null;

/** Created by the websocket manager next to the INR arbitrage scanner. */
export function registerCoinSwitchInrDepthPoller(poller: CoinSwitchInrDepthPoller): void {
  sharedPoller = poller;
}

export function getCoinSwitchInrDepthPollerDiagnostics(): CoinSwitchInrDepthPollerDiagnostics | null {
  return sharedPoller?.getDiagnostics() ?? null;
}
