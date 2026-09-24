import {
  resolve,
} from "node:path";

import {
  JsonlSnapshotStore,
} from "../../../core/persistence/JsonlSnapshotStore";

import type {
  OrderBook,
} from "../../../orderbook/models/OrderBook";

import {
  orderBookService,
} from "../../../orderbook/services/OrderBookService";

import {
  exchangeCapabilityService,
} from "../../capabilities/services/ExchangeCapabilityService";

import type {
  ExchangeMarketCapability,
} from "../../capabilities/models/ExchangeCapability";

import {
  tradingAccountService,
} from "../../../trading/account/TradingAccountService";

import {
  centralLiveOrderExecutionGateway,
} from "../central/CentralLiveOrderExecutionGateway";

import {
  getInrArbitrageScanner,
  type ScannedRoute,
} from "../../../strategies/inr-arbitrage/InrArbitrageScannerService";

import {
  computeDailyRealizedNetInr,
  dailyLossHaltDay,
  dailyLossHaltReason,
  istDayKey,
  loadDailyLossLimitInr,
  registerDailyRealizedNetSource,
  takerFeeWithSurcharge,
} from "../live-only/DailyLossGuard";

import {
  liveTradingInterlock,
  type LiveTradingInterlock,
} from "../LiveTradingInterlock";

import {
  loadInrRouteExecutionPolicy,
  type InrRouteExecutionPolicy,
} from "./InrRouteExecutionPolicy";

import {
  planInrRoute,
  type InrRoutePlan,
  type InrRouteLegRules,
} from "./InrRoutePlanner";

import {
  InrRouteSessionExecutor,
  type InrRouteSession,
  type InrRouteSessionRoute,
} from "./InrRouteSessionExecutor";

/*
 * INR ROUTE RUNNER: turns the scanner's qualified USDT<->INR / INR<->INR
 * routes into orders, one at a time.
 *
 * Every attempt re-checks, at action time: fresh books on both legs, both
 * markets trading, fresh balances synchronized after the previous trade,
 * the daily loss stop, and the shared live interlock. It then sizes the
 * trade from the fresh books (planInrRoute) and, in live mode, runs the
 * primary-then-hedge session. Shadow mode stops after planning and records
 * what it would have sent.
 *
 * RECOVERY_REQUIRED and POSSIBLE_EXPOSURE halt this runner and, through the
 * interlock, Strategy #1 as well. Only the operator can release that halt.
 */
export const INR_ROUTE_HALT_RELEASE_CONFIRMATION = "CONFIRM_INR_ROUTE_HALT_RELEASE";
const RUNNER_ID = "inr-routes";
const TICK_MS = 500;
const BLOCKED_ROUTE_COOLDOWN_MS = 15_000;
const MAXIMUM_ATTEMPTS = 300;

export type InrRouteAttemptStatus =
  | "BLOCKED"
  | "SHADOW"
  | "NO_FILL"
  | "COMPLETED"
  | "DUST_RESIDUAL"
  | "RECOVERY_REQUIRED"
  | "POSSIBLE_EXPOSURE";

export interface InrRouteAttempt {
  readonly at: number;
  readonly routeKey: string;
  readonly kind: string;
  readonly coin: string;
  readonly buyVenue: string;
  readonly buyMarket: string;
  readonly sellVenue: string;
  readonly sellMarket: string;
  readonly scannedNetPercent: number;
  readonly status: InrRouteAttemptStatus;
  readonly reason: string | null;
  readonly plan: InrRoutePlan | null;
  readonly sessionId: string | null;
  readonly realizedNetInr: number | null;
}

interface RunnerSnapshot {
  readonly schemaVersion: "1.0";
  readonly savedAt: number;
  readonly haltedReason: string | null;
  readonly attempts: readonly InrRouteAttempt[];
}

export interface InrRouteRunnerDependencies {
  readonly getPolicy: () => InrRouteExecutionPolicy;
  readonly getQualifiedRoutes: () => readonly ScannedRoute[];
  /** Every priced route (diagnostics only: readiness probe). */
  readonly getAllRoutes: () => readonly ScannedRoute[];
  readonly getBook: (venue: string, market: string) => OrderBook | null;
  readonly getCapability: (venue: string, market: string) => ExchangeMarketCapability | null;
  readonly getBalance: (venue: string, asset: string) => {readonly available: number; readonly synchronizedAt: number} | null;
  readonly getTakerFeePercent: (venue: string, market: string, side: "BUY" | "SELL") => number | null;
  readonly getDailyRealizedNetInr: (now: number) => Promise<number>;
  readonly getDailyLossLimitInr: () => number;
  readonly interlock: LiveTradingInterlock;
  readonly now: () => number;
}

const DEFAULT_DEPENDENCIES: InrRouteRunnerDependencies = {
  getPolicy: () => loadInrRouteExecutionPolicy(),
  getQualifiedRoutes: () => getInrArbitrageScanner()?.getQualifiedRoutes() ?? [],
  getAllRoutes: () => getInrArbitrageScanner()?.getAllRoutes() ?? [],
  getBook: (venue, market) => orderBookService.get(venue, market),
  getCapability: (venue, market) => exchangeCapabilityService.getCachedCapability(venue, market, "spot"),
  getBalance: (venue, asset) => {
    const balance = tradingAccountService.getExchangeBalance(venue, asset);
    return balance ? {available: balance.availableBalance, synchronizedAt: balance.synchronizedAt} : null;
  },
  getTakerFeePercent: takerFeeWithSurcharge,
  getDailyRealizedNetInr: computeDailyRealizedNetInr,
  getDailyLossLimitInr: () => loadDailyLossLimitInr(),
  interlock: liveTradingInterlock,
  now: Date.now,
};

const DEFAULT_FILE = resolve(process.cwd(), "logs", "live", "inr-route-runner.jsonl");

export class InrRouteLiveRunner {
  private readonly dependencies: InrRouteRunnerDependencies;
  private readonly store: JsonlSnapshotStore<RunnerSnapshot>;
  private timer: ReturnType<typeof setInterval> | null = null;
  private inFlight = false;
  private haltedReason: string | null = null;
  private attempts: InrRouteAttempt[] = [];
  private readonly nextAllowedAt = new Map<string, number>();
  private lastSessionCompletedAt = 0;
  private ticks = 0;
  private lastPolicyError: string | null = null;

  constructor(
    private readonly executor: InrRouteSessionExecutor = new InrRouteSessionExecutor(centralLiveOrderExecutionGateway),
    dependencies: Partial<InrRouteRunnerDependencies> = {},
    filePath = DEFAULT_FILE,
  ) {
    this.dependencies = {...DEFAULT_DEPENDENCIES, ...dependencies};
    this.store = new JsonlSnapshotStore({filePath, isPayload: isRunnerSnapshot});
    const restored = this.store.readLatest();
    if (restored) {
      this.haltedReason = restored.haltedReason;
      this.attempts = [...restored.attempts];
    }

    // A crash between order I/O and the final journal write leaves a
    // session whose orders may be live: nothing else runs until reviewed.
    const unfinished = this.executor.unfinishedSessions();
    if (unfinished.length > 0 && this.haltedReason === null) {
      this.haltedReason = `RECOVERY_REQUIRED: ${unfinished.length} INR session(s) were interrupted mid-attempt (${unfinished.map((session) => session.sessionId).join(", ")}). Reconcile their orders before release.`;
    }
    this.syncInterlock();
    this.lastSessionCompletedAt = Math.max(0, ...this.executor.listSessions().map((session) => session.updatedAt));

    registerDailyRealizedNetSource(RUNNER_ID, (now) => this.realizedNetInrToday(now));
  }

  start(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => {
      void this.tick().catch((error: unknown) => {
        console.error("[INR-Routes] Tick failed:", message(error));
      });
    }, TICK_MS);
    this.timer.unref?.();
    const policy = this.safePolicy();
    console.log(`[INR-Routes] Started: mode=${policy?.mode ?? "invalid"} inrVenues=${policy?.inrVenues.join(",") || "none"}.`);
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  releaseHalt(confirmation: string): boolean {
    if (confirmation.trim() !== INR_ROUTE_HALT_RELEASE_CONFIRMATION) {
      throw new Error(`Exact confirmation "${INR_ROUTE_HALT_RELEASE_CONFIRMATION}" is required.`);
    }
    if (this.inFlight) {
      throw new Error("An INR attempt is in flight; release after it settles.");
    }
    this.haltedReason = null;
    this.syncInterlock();
    this.persist();
    return true;
  }

  getDiagnostics() {
    const now = this.dependencies.now();
    const policy = this.safePolicy();
    return {
      schemaVersion: "1.0" as const,
      generatedAt: now,
      running: this.timer !== null,
      mode: policy?.mode ?? "off",
      policy,
      policyError: this.lastPolicyError,
      inFlight: this.inFlight,
      halted: this.haltedReason !== null,
      haltedReason: this.haltedReason,
      ticks: this.ticks,
      realizedNetInrToday: this.realizedNetInrToday(now),
      interlock: this.dependencies.interlock.getDiagnostics(),
      readiness: policy ? this.probeReadiness(policy, now) : [],
      recentAttempts: this.attempts.slice(-40).reverse(),
      recentSessions: this.executor.listSessions().slice(-20).reverse(),
      counts: countBy(this.attempts.map((attempt) => attempt.status)),
      blockers: countBy(
        this.attempts
          .filter((attempt) => attempt.status === "BLOCKED" && attempt.reason)
          .map((attempt) => (attempt.reason as string).split(":")[0]),
      ),
    };
  }

  async tick(): Promise<void> {
    this.ticks += 1;
    const policy = this.safePolicy();
    if (!policy || policy.mode === "off" || this.inFlight) return;

    const now = this.dependencies.now();
    const lossDay = dailyLossHaltDay(this.haltedReason);
    if (lossDay !== null && lossDay !== istDayKey(now)) {
      this.haltedReason = null;
      this.persist();
    }
    if (this.haltedReason !== null) return;

    const candidate = this.dependencies
      .getQualifiedRoutes()
      .filter((route) => this.eligible(route, policy, now))
      .sort((first, second) => second.netEdgePercent - first.netEdgePercent)[0];
    if (!candidate) return;

    if (!this.dependencies.interlock.tryAcquire(RUNNER_ID)) return;
    this.inFlight = true;
    try {
      await this.attempt(candidate, policy, now);
    } finally {
      this.inFlight = false;
      this.dependencies.interlock.release(RUNNER_ID);
    }
  }

  private eligible(route: ScannedRoute, policy: InrRouteExecutionPolicy, now: number): boolean {
    if (route.kind !== "INR_USDT" && route.kind !== "INR_INR") return false;
    if ((this.nextAllowedAt.get(route.routeKey) ?? 0) > now) return false;
    for (const [venue, market] of [[route.buyVenue, route.buyMarket], [route.sellVenue, route.sellMarket]] as const) {
      const allowed = market.endsWith("INR")
        ? policy.inrVenues.includes(venue)
        : (policy.hedgeVenues as readonly string[]).includes(venue);
      if (!allowed) return false;
    }
    // Two INR legs need a hedge venue with an IOC-grade contract; not yet.
    if (route.kind === "INR_INR") return false;
    return true;
  }

  private async attempt(route: ScannedRoute, policy: InrRouteExecutionPolicy, now: number): Promise<void> {
    const block = (reason: string) => {
      this.nextAllowedAt.set(route.routeKey, now + BLOCKED_ROUTE_COOLDOWN_MS);
      this.record(route, "BLOCKED", reason, null, null);
    };

    /* ---- daily loss stop ---- */
    let realizedNetInr: number;
    try {
      realizedNetInr = await this.dependencies.getDailyRealizedNetInr(now);
    } catch (error: unknown) {
      block(`PNL_UNAVAILABLE: ${message(error)}`);
      return;
    }
    const limitInr = this.dependencies.getDailyLossLimitInr();
    if (realizedNetInr <= -limitInr) {
      this.haltedReason = dailyLossHaltReason(istDayKey(now), realizedNetInr, limitInr);
      this.persist();
      return;
    }

    /* ---- fresh books ---- */
    const buyBook = this.dependencies.getBook(route.buyVenue, route.buyMarket);
    const sellBook = this.dependencies.getBook(route.sellVenue, route.sellMarket);
    if (!buyBook || !sellBook) return block("BOOK_MISSING: a leg has no live book.");
    const oldest = Math.max(now - buyBook.timestamp, now - sellBook.timestamp);
    if (oldest > policy.maximumBookAgeMs) return block(`BOOK_STALE: a leg's book is ${oldest} ms old (limit ${policy.maximumBookAgeMs}).`);

    /* ---- venue rules ---- */
    const buyCapability = this.dependencies.getCapability(route.buyVenue, route.buyMarket);
    const sellCapability = this.dependencies.getCapability(route.sellVenue, route.sellMarket);
    if (!buyCapability || !sellCapability) return block("RULES_MISSING: market rules are not loaded for a leg.");
    if (!buyCapability.tradingEnabled || buyCapability.maintenanceMode || !sellCapability.tradingEnabled || sellCapability.maintenanceMode) {
      return block("MARKET_CLOSED: a leg's market is not trading.");
    }

    /* ---- balances, synchronized after the last trade ---- */
    const buyQuote = quoteAsset(route.buyMarket);
    const sellBase = route.coin;
    const buyBalance = this.dependencies.getBalance(route.buyVenue, buyQuote);
    const sellBalance = this.dependencies.getBalance(route.sellVenue, sellBase);
    if (!buyBalance || !sellBalance) {
      return block(!sellBalance ? `NO_SELL_INVENTORY: no ${sellBase} balance on ${route.sellVenue}.` : `NO_BUY_FUNDS: no ${buyQuote} balance on ${route.buyVenue}.`);
    }
    for (const balance of [buyBalance, sellBalance]) {
      if (now - balance.synchronizedAt > policy.maximumBalanceAgeMs) return block("BALANCE_STALE: a balance is older than the freshness limit.");
      if (balance.synchronizedAt <= this.lastSessionCompletedAt) return block("BALANCE_NOT_RESYNCED: balances predate the last INR trade.");
    }

    /* ---- conversion factors, as the scanner priced the route ---- */
    const rate = route.usdtInrRate;
    const buyToInr = route.buyMarket.endsWith("INR") ? 1 : rate;
    const sellToInr = route.sellMarket.endsWith("INR") ? 1 : rate;
    if (buyToInr === null || sellToInr === null) return block("CONVERSION_UNAVAILABLE: no USDT/INR rate on the route.");

    const buyFeePercent = this.dependencies.getTakerFeePercent(route.buyVenue, route.buyMarket, "BUY");
    if (buyFeePercent === null) return block("FEE_UNKNOWN: buy venue taker fee is unknown.");

    const planned = planInrRoute({
      asks: buyBook.asks,
      bids: sellBook.bids,
      buyToInr,
      sellToInr,
      feesPercent: route.feesPercent,
      buyFeePercent,
      minimumNetPercent: policy.minimumNetPercent,
      buyRules: legRules(buyCapability),
      sellRules: legRules(sellCapability),
      buyQuoteAvailable: buyBalance.available,
      sellBaseAvailable: sellBalance.available,
      minimumCapitalInr: policy.minimumCapitalPerLegInr,
      targetCapitalInr: policy.targetCapitalPerLegInr,
      maximumCapitalInr: policy.maximumCapitalPerLegInr,
    });
    if (!planned.ok) return block(planned.reason);

    this.nextAllowedAt.set(route.routeKey, now + policy.routeCooldownMs);
    if (policy.mode === "shadow") {
      this.record(route, "SHADOW", "Planned from fresh books and balances; shadow mode sends no order.", planned.plan, null);
      return;
    }

    /* ---- live ---- */
    const sessionRoute: InrRouteSessionRoute = {
      routeKey: route.routeKey,
      kind: route.kind,
      coin: route.coin,
      buyVenue: route.buyVenue,
      buyMarket: route.buyMarket,
      sellVenue: route.sellVenue,
      sellMarket: route.sellMarket,
      buyToInr,
      sellToInr,
      feesPercent: route.feesPercent,
    };
    const hedgeIsSell = route.buyMarket.endsWith("INR");
    const hedgeCapability = hedgeIsSell ? sellCapability : buyCapability;
    const hedgeStep = hedgeCapability.quantity.quantityStep;
    if (!(hedgeStep !== null && hedgeStep > 0)) return block("RULES_MISSING: hedge lot step unknown.");

    const session = await this.executor.execute({
      route: sessionRoute,
      plan: planned.plan,
      primaryTimeoutMs: policy.primaryTimeoutMs,
      primaryPollingMs: policy.primaryPollingMs,
      hedgeBufferPercents: policy.hedgeBufferPercents,
      dustToleranceInr: policy.dustToleranceInr,
      hedgeRules: {
        quantityStep: hedgeStep,
        minimumQuantity: hedgeCapability.quantity.minimumQuantity,
        minimumNotional: hedgeCapability.notional.minimumNotional,
        priceStep: hedgeCapability.price.priceStep,
      },
      getHedgeLevels: () => {
        const book = hedgeIsSell
          ? this.dependencies.getBook(route.sellVenue, route.sellMarket)
          : this.dependencies.getBook(route.buyVenue, route.buyMarket);
        if (!book || this.dependencies.now() - book.timestamp > policy.maximumBookAgeMs) return null;
        return hedgeIsSell
          ? [...book.bids].sort((a, b) => b.price - a.price)
          : [...book.asks].sort((a, b) => a.price - b.price);
      },
    });
    this.lastSessionCompletedAt = this.dependencies.now();
    this.onSession(route, session);
  }

  private onSession(route: ScannedRoute, session: InrRouteSession): void {
    const status: InrRouteAttemptStatus =
      session.state === "COMPLETED" || session.state === "DUST_RESIDUAL" || session.state === "NO_FILL" ||
      session.state === "RECOVERY_REQUIRED" || session.state === "POSSIBLE_EXPOSURE"
        ? session.state
        : "POSSIBLE_EXPOSURE";
    this.record(route, status, session.reasons.at(-1) ?? null, session.plan, session.sessionId, session.realizedNetInr);

    if (status === "RECOVERY_REQUIRED" || status === "POSSIBLE_EXPOSURE") {
      this.haltedReason = `${status}: INR session ${session.sessionId} on ${route.routeKey}. ${session.reasons.at(-1) ?? ""}`.trim();
      this.syncInterlock();
      this.persist();
      console.error("[INR-Routes] Halted:", this.haltedReason);
    }
  }

  /**
   * For each enabled INR venue: whether the executor can see what an attempt
   * needs (live book, market rules, INR balance) on a sample of the INR
   * markets the scanner is pricing, best net first.
   */
  private probeReadiness(policy: InrRouteExecutionPolicy, now: number) {
    const routes = [...this.dependencies.getAllRoutes()].sort((a, b) => b.netEdgePercent - a.netEdgePercent);
    return policy.inrVenues.map((venue) => {
      const markets: string[] = [];
      for (const route of routes) {
        for (const [legVenue, market] of [[route.buyVenue, route.buyMarket], [route.sellVenue, route.sellMarket]] as const) {
          if (legVenue === venue && market.endsWith("INR") && !markets.includes(market)) markets.push(market);
        }
        if (markets.length >= 5) break;
      }
      const balance = this.dependencies.getBalance(venue, "INR");
      return {
        venue,
        inrBalance: balance?.available ?? null,
        inrBalanceAgeMs: balance ? now - balance.synchronizedAt : null,
        markets: markets.map((market) => {
          const book = this.dependencies.getBook(venue, market);
          const rules = this.dependencies.getCapability(venue, market);
          return {
            market,
            bookAgeMs: book ? now - book.timestamp : null,
            bookLevels: book ? {bids: book.bids.length, asks: book.asks.length} : null,
            rulesLoaded: rules !== null,
            tradingEnabled: rules ? rules.tradingEnabled && !rules.maintenanceMode : null,
            quantityStep: rules?.quantity.quantityStep ?? null,
            minimumNotional: rules?.notional.minimumNotional ?? null,
          };
        }),
      };
    });
  }

  private realizedNetInrToday(now: number): number {
    const day = istDayKey(now);
    return this.executor
      .listSessions()
      .filter((session) => session.realizedNetInr !== null && istDayKey(session.updatedAt) === day)
      .reduce((sum, session) => sum + (session.realizedNetInr as number), 0);
  }

  private record(
    route: ScannedRoute,
    status: InrRouteAttemptStatus,
    reason: string | null,
    plan: InrRoutePlan | null,
    sessionId: string | null,
    realizedNetInr: number | null = null,
  ): void {
    this.attempts.push({
      at: this.dependencies.now(),
      routeKey: route.routeKey,
      kind: route.kind,
      coin: route.coin,
      buyVenue: route.buyVenue,
      buyMarket: route.buyMarket,
      sellVenue: route.sellVenue,
      sellMarket: route.sellMarket,
      scannedNetPercent: route.netEdgePercent,
      status,
      reason,
      plan,
      sessionId,
      realizedNetInr,
    });
    if (this.attempts.length > MAXIMUM_ATTEMPTS) this.attempts = this.attempts.slice(-MAXIMUM_ATTEMPTS);
    this.persist();
  }

  private syncInterlock(): void {
    const exposure =
      this.haltedReason !== null &&
      (this.haltedReason.startsWith("RECOVERY_REQUIRED") || this.haltedReason.startsWith("POSSIBLE_EXPOSURE"));
    this.dependencies.interlock.setExposureHalt(RUNNER_ID, exposure ? this.haltedReason : null);
  }

  private persist(): void {
    try {
      this.store.replaceAllAtomically([{
        schemaVersion: "1.0",
        savedAt: this.dependencies.now(),
        haltedReason: this.haltedReason,
        attempts: this.attempts,
      }]);
    } catch (error: unknown) {
      console.error("[INR-Routes] Persist failed:", message(error));
    }
  }

  private safePolicy(): InrRouteExecutionPolicy | null {
    try {
      const policy = this.dependencies.getPolicy();
      this.lastPolicyError = null;
      return policy;
    } catch (error: unknown) {
      this.lastPolicyError = message(error);
      return null;
    }
  }
}

function legRules(capability: ExchangeMarketCapability): InrRouteLegRules {
  return {
    quantityStep: capability.quantity.quantityStep,
    minimumQuantity: capability.quantity.minimumQuantity,
    minimumNotional: capability.notional.minimumNotional,
  };
}

function quoteAsset(market: string): string {
  return market.endsWith("INR") ? "INR" : "USDT";
}

function countBy(values: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}

function isRunnerSnapshot(value: unknown): value is RunnerSnapshot {
  const snapshot = value as Partial<RunnerSnapshot> | null;
  return !!snapshot && snapshot.schemaVersion === "1.0" && Array.isArray(snapshot.attempts);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

let sharedRunner: InrRouteLiveRunner | null = null;

export function getInrRouteLiveRunner(): InrRouteLiveRunner {
  sharedRunner ??= new InrRouteLiveRunner();
  return sharedRunner;
}
