import {
  resolve,
} from "node:path";

import {
  JsonlSnapshotStore,
} from "../../core/persistence/JsonlSnapshotStore";

import {
  getLiveOnlyRuntimePolicy,
} from "../../config/LiveOnlyRuntimePolicy";

import {
  getCoinStudyService,
} from "../../strategies/inr-arbitrage/CoinStudyService";

import {
  loadRebalancingExecutionConfig,
  type RebalancingExecutionConfig,
} from "../execution/RebalancingExecutionConfig";

import type {
  RebalancingMoveOutcome,
} from "../execution/RebalancingExecutionService";

import type {
  RebalancingDecisionPlan,
} from "./RebalancingDecisionEngine";

import {
  createInventoryValuation,
  type InventoryValuation,
} from "./InventoryValuation";

import {
  planRouteRefills,
  type RefillAction,
  type RefillTarget,
} from "./RouteInventoryRefillPlanner";

import type {
  StockBuyPort,
} from "./StockBuyExecutor";

import {
  allocateCapital,
  cashPool,
  type AllocationCandidate,
  type CapitalAllocation,
} from "./CapitalAllocator";

/*
 * Capital manager step B: keeps the core coin basket's route inventory
 * stocked. Builds the refill plan from the coin study's placement targets
 * and live holdings, and auto-executes the one kind of move the capital
 * manager can make itself - USDT from Binance to a whitelisted exchange -
 * through the existing guarded withdrawal path (master switch, phase flag,
 * per-transfer and daily caps, whitelist). A destination that was just
 * topped up waits out a cooldown so a transfer still in flight is not sent
 * twice. Everything else stays a manual instruction.
 */
const VENUES = ["binance", "bybit", "coindcx", "coinswitch", "unocoin"] as const;
const REFILL_BELOW_SHARE = 0.5;
const SOURCE_FLOOR_INR = 500;
const MINIMUM_ACTION_INR = 300;
const MINIMUM_AUTO_USDT = 10;
const DESTINATION_COOLDOWN_MS = 30 * 60_000;
/* A refused withdrawal is not retried every cycle (each attempt spends cap). */
const FAILURE_BACKOFF_MS = 30 * 60_000;
/* Binance -4104: Travel Rule details are missing for this destination; only
 * the operator can fix that in the Binance app, so wait much longer. */
const TRAVEL_RULE_BACKOFF_MS = 6 * 3_600_000;
const MAXIMUM_HISTORY = 50;
/* Stock buying (operator-approved limits): core coins only, up to target. */
const BUY_VENUES = ["binance", "bybit", "coindcx", "coinswitch", "unocoin"] as const;
const MINIMUM_BUY_INR = 300;
const BUY_NO_FILL_BACKOFF_MS = 30 * 60_000;
const BUY_UNKNOWN_BACKOFF_MS = 6 * 3_600_000;
/* Capital manager v2 (operator, 2026-09-25): allocation follows the last
 * hours of live opportunity, smoothed; stock sells are guarded. */
const LIVE_SIGNAL_HOURS = 6;
const LIVE_WEIGHT = 0.8;
const MAXIMUM_TRADES_PER_COIN = 5;
/* Below this per-trade size a route cannot clear venue minimums. */
const MINIMUM_PER_TRADE_INR = 500;
/* Capital kept out of the allocation (fees, rounding, floors). */
const BUDGET_RESERVE_SHARE = 0.1;
/* Selling stock and buying other stock costs about this share (fees + spread). */
const SWITCH_COST_SHARE = 0.012;
/* A switch must earn at least this multiple of its cost within a day. */
const SWITCH_BENEFIT_MULTIPLE = 2;
/* Stock the capital manager bought is held at least this long. */
const MINIMUM_HOLD_MS = 24 * 3_600_000;
/* Core stock is only surplus above this multiple of its allocation. */
const SURPLUS_MARGIN = 1.25;
const MINIMUM_SELL_INR = 300;
const SELL_VENUE_QUOTES: Readonly<Record<string, readonly ("INR" | "USDT")[]>> = {
  binance: ["USDT"],
  bybit: ["USDT"],
  coindcx: ["INR", "USDT"],
  coinswitch: ["INR"],
  unocoin: ["INR"],
};

export interface AutoBuyConfig {
  readonly enabled: boolean;
  readonly dailyCapInr: number;
  readonly cashFloorInr: number;
}

export function loadAutoBuyConfig(environment: NodeJS.ProcessEnv = process.env): AutoBuyConfig {
  const number = (name: string, fallback: number) => {
    const value = Number(environment[name]?.trim() || fallback);
    return Number.isFinite(value) && value >= 0 ? value : fallback;
  };
  return {
    enabled: environment.CAT_PRO_REFILL_AUTO_BUY_ENABLED?.trim().toLowerCase() === "true",
    dailyCapInr: Math.min(number("CAT_PRO_REFILL_AUTO_BUY_DAILY_CAP_INR", 5_000), 50_000),
    cashFloorInr: number("CAT_PRO_REFILL_AUTO_BUY_CASH_FLOOR_INR", 1_000),
  };
}

export interface AutoSellConfig {
  readonly enabled: boolean;
  readonly dailyCapInr: number;
}

export function loadAutoSellConfig(environment: NodeJS.ProcessEnv = process.env): AutoSellConfig {
  const cap = Number(environment.CAT_PRO_REFILL_AUTO_SELL_DAILY_CAP_INR?.trim() || 5_000);
  return {
    enabled: environment.CAT_PRO_REFILL_AUTO_SELL_ENABLED?.trim().toLowerCase() === "true",
    dailyCapInr: Number.isFinite(cap) && cap >= 0 ? Math.min(cap, 25_000) : 5_000,
  };
}

/**
 * Capital manager v2: turns the coin study (7 days) and the live signal
 * (last hours) into allocation candidates and splits the capital that
 * exists across them. Mostly live: 80% of a coin's weight is its share of
 * recent opportunity, 20% its share of the 7-day study.
 */
export function buildCapitalAllocation(tradeSizeInr: number, valuation: InventoryValuation): CapitalAllocation {
  const study = getCoinStudyService().getReport(tradeSizeInr, (venue, asset) => valuation.holdingInr(venue, asset));
  const live = getCoinStudyService().getLiveSignal(tradeSizeInr, LIVE_SIGNAL_HOURS);
  const studyScore = new Map(study.coins.map((coin) => [
    coin.coin,
    coin.edgeMinutes * coin.averageNetPercent * (coin.averageDepthInr === null ? 0.5 : Math.min(1, coin.averageDepthInr / tradeSizeInr)),
  ]));
  const studyTotal = [...studyScore.values()].reduce((sum, value) => sum + Math.max(0, value), 0);
  const liveTotal = live.reduce((sum, coin) => sum + Math.max(0, coin.score), 0);
  const liveByCoin = new Map(live.map((coin) => [coin.coin, coin]));
  const coins = new Set([...live.filter((coin) => coin.score > 0).map((coin) => coin.coin), ...study.coreBasket]);

  const candidates: AllocationCandidate[] = [];
  for (const coin of coins) {
    const signal = liveByCoin.get(coin);
    const entry = study.coins.find((item) => item.coin === coin);
    const liveShare = signal && liveTotal > 0 ? Math.max(0, signal.score) / liveTotal : 0;
    const studyShare = studyTotal > 0 ? Math.max(0, studyScore.get(coin) ?? 0) / studyTotal : 0;
    const route = signal?.main ?? entry?.directions[0];
    if (!route) continue;
    const depth = signal?.averageDepthInr ?? entry?.averageDepthInr ?? null;
    const perTradeInr = Math.round(depth === null ? tradeSizeInr : Math.min(tradeSizeInr, depth));
    if (perTradeInr < MINIMUM_PER_TRADE_INR) continue;
    candidates.push({
      coin,
      weight: LIVE_WEIGHT * liveShare + (1 - LIVE_WEIGHT) * studyShare,
      coinVenue: route.sellVenue,
      coinVenueQuote: route.sellQuote,
      cashVenue: route.buyVenue,
      cashAsset: route.buyQuote,
      perTradeInr,
      maximumTrades: MAXIMUM_TRADES_PER_COIN,
      expectedDailyProfitInr: signal?.expectedDailyProfitInr ?? 0,
      studyRank: entry?.rank ?? null,
    });
  }

  // What each cash pool can supply: its cash, plus idle coins on that
  // exchange (they can be sold into its quote). A candidate coin already on
  // its sell venue covers its own coin side; one sitting elsewhere has to
  // be moved and counts for neither.
  const pools: Record<string, number> = {};
  const held = new Map<string, number>();
  const candidateVenue = new Map(candidates.map((candidate) => [candidate.coin, candidate.coinVenue]));
  for (const venue of VENUES) {
    for (const asset of valuation.assets?.(venue) ?? []) {
      const value = Math.max(0, valuation.holdingInr(venue, asset) ?? 0);
      if (!(value > 0)) continue;
      if (asset === "INR" || asset === "USDT") {
        const pool = cashPool(venue, asset);
        pools[pool] = (pools[pool] ?? 0) + value * (1 - BUDGET_RESERVE_SHARE);
      } else if (candidateVenue.get(asset) === venue) {
        held.set(asset, (held.get(asset) ?? 0) + value);
      } else if (!candidateVenue.has(asset)) {
        const pool = cashPool(venue, SELL_VENUE_QUOTES[venue]?.includes("USDT") ? "USDT" : "INR");
        pools[pool] = (pools[pool] ?? 0) + value * (1 - BUDGET_RESERVE_SHARE);
      }
    }
  }
  const budgetInr = Math.floor(Object.values(pools).reduce((sum, value) => sum + value, 0) + [...held.values()].reduce((sum, value) => sum + value, 0));
  return allocateCapital({
    budgetInr,
    poolCapacityInr: pools,
    candidates: candidates.map((candidate) => ({...candidate, coinHeldInr: held.get(candidate.coin) ?? 0})),
  });
}

function targetsFromAllocation(allocation: CapitalAllocation): RefillTarget[] {
  return allocation.coins.map((coin, index) => ({
    coin: coin.coin,
    rank: index + 1,
    coinVenue: coin.coinVenue,
    coinNeedInr: coin.coinNeedInr,
    cashVenue: coin.cashVenue,
    cashAsset: coin.cashAsset,
    cashNeedInr: coin.cashNeedInr,
    coinVenueQuote: coin.coinVenueQuote,
  }));
}

function istDay(timestamp: number): string {
  return new Date(timestamp + 330 * 60_000).toISOString().slice(0, 10);
}

export interface RouteRefillExecution {
  readonly at: number;
  readonly actionId: string;
  readonly toVenue: string;
  readonly amountUsdt: number;
  readonly status:
    | RebalancingMoveOutcome["status"]
    | "SKIPPED_COOLDOWN"
    | "SKIPPED_TOO_SMALL"
    | "SKIPPED_BACKOFF"
    | "BUY_FILLED"
    | "BUY_PARTIAL"
    | "BUY_NO_FILL"
    | "BUY_SKIPPED"
    | "BUY_UNKNOWN"
    | "SELL_FILLED"
    | "SELL_PARTIAL"
    | "SELL_NO_FILL"
    | "SELL_SKIPPED"
    | "SELL_UNKNOWN";
  readonly kind?: "USDT_TOPUP" | "STOCK_BUY" | "STOCK_SELL" | "FUNDING_SWEEP";
  readonly coin?: string;
  readonly spentInr?: number;
  readonly detail: string;
  readonly referenceId: string | null;
}

interface RefillState {
  readonly schemaVersion: "1.0";
  lastTopUpAt: Record<string, number>;
  /** Destination -> when automatic top-ups may be tried again after a refusal, and why. */
  blockedUntil?: Record<string, {until: number; reason: string}>;
  /** IST day -> INR spent on stock buys (the daily cap). */
  buySpentInr?: Record<string, number>;
  /** "venue|coin" -> when stock buying may be tried again, and why. */
  buyBlockedUntil?: Record<string, {until: number; reason: string}>;
  /** "venue|coin" -> last time the capital manager bought that stock (minimum hold). */
  lastBuyAt?: Record<string, number>;
  /** IST day -> INR received from stock sells (the daily sell cap). */
  sellSpentInr?: Record<string, number>;
  /** "venue|coin" -> when a stock sell may be tried again, and why. */
  sellBlockedUntil?: Record<string, {until: number; reason: string}>;
  /** Why the last candidate sell did not happen (shown in the panel). */
  lastSellSkip?: {at: number; reason: string} | null;
  history: RouteRefillExecution[];
}

export interface RouteRefillPort {
  executeCrossExchangeMoves(plan: RebalancingDecisionPlan): Promise<readonly RebalancingMoveOutcome[]>;
  executeBybitWithdrawal?(destination: string, amountUsdt: number, requestId: string): Promise<RebalancingMoveOutcome>;
  sweepBybitFundingToUnified?(): Promise<readonly RebalancingMoveOutcome[]>;
}

/* blockedUntil key for the Bybit Funding -> Unified sweep. */
const SWEEP_BLOCK_KEY = "bybit-funding-sweep";

export interface RouteRefillDependencies {
  readonly getTargets: (tradeSizeInr: number, valuation: InventoryValuation) => readonly RefillTarget[];
  readonly getValuation: (now: number) => InventoryValuation;
  readonly getConfig: () => RebalancingExecutionConfig;
  readonly getTradeSizeInr: () => number;
  readonly getAutoBuyConfig: () => AutoBuyConfig;
  readonly getBuyPort: () => Promise<StockBuyPort>;
  /** Allocation behind the targets; null when targets come from elsewhere (no sells then). */
  readonly getAllocation: (tradeSizeInr: number, valuation: InventoryValuation) => CapitalAllocation | null;
  readonly getAutoSellConfig: () => AutoSellConfig;
}

const DEFAULT_DEPENDENCIES: RouteRefillDependencies = {
  getTargets: (tradeSizeInr, valuation) => targetsFromAllocation(buildCapitalAllocation(tradeSizeInr, valuation)),
  getValuation: (now) => createInventoryValuation(now),
  getConfig: () => loadRebalancingExecutionConfig(),
  getTradeSizeInr: () => getLiveOnlyRuntimePolicy().preferredCapitalPerLegInr,
  getAutoBuyConfig: () => loadAutoBuyConfig(),
  getBuyPort: async () => new (await import("./StockBuyExecutor")).DefaultStockBuyExecutor(),
  getAllocation: (tradeSizeInr, valuation) => buildCapitalAllocation(tradeSizeInr, valuation),
  getAutoSellConfig: () => loadAutoSellConfig(),
};

function isState(value: unknown): value is RefillState {
  const state = value as Partial<RefillState> | null;
  return !!state && state.schemaVersion === "1.0" && typeof state.lastTopUpAt === "object" && Array.isArray(state.history);
}

export class RouteRefillService {
  private readonly dependencies: RouteRefillDependencies;
  private readonly store: JsonlSnapshotStore<RefillState>;
  private state: RefillState;

  constructor(
    dependencies: Partial<RouteRefillDependencies> = {},
    // logs/ is the host-mounted volume: cooldowns and backoffs survive redeploys.
    filePath = resolve(process.cwd(), "logs", "live", "route-refill.jsonl"),
  ) {
    // Targets supplied by the caller (tests) carry no allocation, so no sells.
    this.dependencies = {
      ...DEFAULT_DEPENDENCIES,
      ...(dependencies.getTargets && !dependencies.getAllocation ? {getAllocation: () => null} : {}),
      ...dependencies,
    };
    this.store = new JsonlSnapshotStore({filePath, isPayload: isState});
    this.state = this.store.readLatest() ?? {schemaVersion: "1.0", lastTopUpAt: {}, history: []};
  }

  getPlan(now = Date.now()) {
    const valuation = this.dependencies.getValuation(now);
    const config = this.dependencies.getConfig();
    const autoUsdtDestinations =
      config.enabled && config.crossExchangeEnabled
        ? [...new Set(config.withdrawalWhitelist.filter((entry) => entry.asset === "USDT").map((entry) => entry.exchange))]
        : [];
    const bybitAutoUsdtDestinations =
      config.enabled && config.crossExchangeEnabled && config.bybitWithdrawEnabled && config.bybitTravelRuleBeneficiaryName
        ? [...new Set(config.withdrawalWhitelist
          .filter((entry) => entry.asset === "USDT" && entry.exchange !== "bybit")
          .map((entry) => entry.exchange))]
        : [];
    const autoBuy = this.dependencies.getAutoBuyConfig();
    const autoBuyVenues = config.enabled && autoBuy.enabled ? [...BUY_VENUES] : [];
    const tradeSizeInr = this.dependencies.getTradeSizeInr();
    const allocation = this.dependencies.getAllocation(tradeSizeInr, valuation);
    const targets = allocation ? targetsFromAllocation(allocation) : this.dependencies.getTargets(tradeSizeInr, valuation);
    const autoSell = this.dependencies.getAutoSellConfig();
    const plan = planRouteRefills({
      targets,
      venues: VENUES,
      holdingInr: (venue, asset) => valuation.holdingInr(venue, asset),
      priceInr: (asset) => valuation.priceInr(asset),
      autoUsdtDestinations,
      bybitAutoUsdtDestinations,
      autoBuyVenues,
      autoBuyMinimumCashSideInr: tradeSizeInr,
      refillBelowShare: REFILL_BELOW_SHARE,
      sourceFloorInr: SOURCE_FLOOR_INR,
      minimumActionInr: MINIMUM_ACTION_INR,
    });
    return {
      schemaVersion: "1.0" as const,
      generatedAt: now,
      usdtInr: valuation.usdtInr,
      targets,
      allocation: allocation
        ? {
          budgetInr: allocation.budgetInr,
          allocatedInr: allocation.allocatedInr,
          liveSignalHours: LIVE_SIGNAL_HOURS,
          coins: allocation.coins.map((coin) => ({
            coin: coin.coin,
            weightPercent: coin.weight * 100,
            trades: coin.trades,
            perTradeInr: coin.perTradeInr,
            coinVenue: coin.coinVenue,
            coinNeedInr: coin.coinNeedInr,
            coinHaveInr: valuation.holdingInr(coin.coinVenue, coin.coin),
            cashVenue: coin.cashVenue,
            cashAsset: coin.cashAsset,
            cashNeedInr: coin.cashNeedInr,
            cashHaveInr: valuation.holdingInr(coin.cashVenue, coin.cashAsset),
            expectedDailyProfitInr: coin.expectedDailyProfitInr,
          })),
          unfunded: allocation.unfunded,
          unfundedBy: allocation.unfundedBy ?? {},
        }
        : null,
      actions: plan.actions,
      covered: plan.covered,
      automation: {
        enabled: config.enabled && config.crossExchangeEnabled,
        autoUsdtDestinations,
        bybitAutoUsdtDestinations,
        bybitFundingSweep: config.enabled && config.bybitFundingSweepEnabled === true,
        maximumPerTransferUsdt: config.maximumPerTransferUsdt,
        maximumPerDayUsdt: config.maximumPerDayCrossExchangeUsdt,
        destinationCooldownMinutes: DESTINATION_COOLDOWN_MS / 60_000,
        lastTopUpAt: {...this.state.lastTopUpAt},
        blocked: Object.fromEntries(
          Object.entries(this.state.blockedUntil ?? {}).filter(([, block]) => block.until > now),
        ),
        autoBuy: {
          enabled: autoBuyVenues.length > 0,
          dailyCapInr: autoBuy.dailyCapInr,
          spentTodayInr: this.state.buySpentInr?.[istDay(now)] ?? 0,
          cashFloorInr: autoBuy.cashFloorInr,
          paused: Object.fromEntries(
            Object.entries(this.state.buyBlockedUntil ?? {}).filter(([, block]) => block.until > now),
          ),
        },
        autoSell: {
          enabled: config.enabled && autoSell.enabled && allocation !== null,
          dailyCapInr: autoSell.dailyCapInr,
          spentTodayInr: this.state.sellSpentInr?.[istDay(now)] ?? 0,
          minimumHoldHours: MINIMUM_HOLD_MS / 3_600_000,
          lastSkip: this.state.lastSellSkip ?? null,
          paused: Object.fromEntries(
            Object.entries(this.state.sellBlockedUntil ?? {}).filter(([, block]) => block.until > now),
          ),
        },
      },
      recentExecutions: [...this.state.history].reverse().slice(0, 20),
    };
  }

  /** Operator action: lift a destination's failure pause (e.g. after fixing its cause). */
  clearPause(venue: string): boolean {
    if (!this.state.blockedUntil?.[venue]) return false;
    delete this.state.blockedUntil[venue];
    this.persist();
    return true;
  }

  /** Runs the AUTO actions once; called from the capital manager's cycle. */
  async executeAuto(port: RouteRefillPort, now = Date.now()): Promise<readonly RouteRefillExecution[]> {
    const plan = this.getPlan(now);
    const usdtInr = plan.usdtInr;
    if (!plan.automation.enabled || usdtInr === null) return [];

    const results: RouteRefillExecution[] = [];
    results.push(...(await this.sweepBybitFunding(port, now)));
    for (const action of plan.actions.filter((item: RefillAction) => item.mode === "AUTO" && item.kind === "MOVE_USDT")) {
      const block = this.state.blockedUntil?.[action.toVenue];
      if (block && block.until > now) {
        results.push(this.record({at: now, actionId: action.id, toVenue: action.toVenue, amountUsdt: 0, status: "SKIPPED_BACKOFF",
          detail: `Paused until ${new Date(block.until).toISOString()} after: ${block.reason}`, referenceId: null}, false));
        continue;
      }
      const lastAt = this.state.lastTopUpAt[action.toVenue] ?? 0;
      if (now - lastAt < DESTINATION_COOLDOWN_MS) {
        results.push(this.record({at: now, actionId: action.id, toVenue: action.toVenue, amountUsdt: 0, status: "SKIPPED_COOLDOWN",
          detail: `Topped up ${Math.round((now - lastAt) / 60_000)} min ago; waiting for that transfer to land.`, referenceId: null}, false));
        continue;
      }
      const amountUsdt = Math.floor(Math.min(action.amountInr / usdtInr, plan.automation.maximumPerTransferUsdt) * 100) / 100;
      if (amountUsdt < MINIMUM_AUTO_USDT) {
        results.push(this.record({at: now, actionId: action.id, toVenue: action.toVenue, amountUsdt, status: "SKIPPED_TOO_SMALL",
          detail: `${amountUsdt} USDT is below the ${MINIMUM_AUTO_USDT} USDT minimum worth a withdrawal fee.`, referenceId: null}, false));
        continue;
      }
      const fromBybit = action.fromVenue === "bybit";
      if (fromBybit && !port.executeBybitWithdrawal) continue;
      const [outcome] = fromBybit
        ? [await port.executeBybitWithdrawal!(action.toVenue, amountUsdt, `catpro${now.toString(36)}${action.toVenue.slice(0, 3)}`)]
        : await port.executeCrossExchangeMoves({
        desiredMoves: [{
          sequence: 1,
          sourceExchange: "binance",
          destinationExchange: action.toVenue,
          amountUsdt,
          sourceTransferableBeforeUsdt: 0,
          sourceTransferableAfterUsdt: 0,
          destinationDeficitBeforeUsdt: amountUsdt,
          destinationDeficitAfterUsdt: 0,
          routeLevel: 5,
          kind: "CROSS_EXCHANGE_CAPITAL_MOVE_ANALYSIS",
          submissionState: "ANALYSIS_ONLY",
          transferAsset: null,
          transferNetwork: null,
          estimatedCostUsdt: null,
          reason: action.reason,
        }],
      } as unknown as RebalancingDecisionPlan);
      if (!outcome) continue;
      if (outcome.status === "EXECUTED") {
        this.state.lastTopUpAt[action.toVenue] = now;
        if (this.state.blockedUntil) delete this.state.blockedUntil[action.toVenue];
      } else if (outcome.status === "FAILED") {
        const travelRule = /-4104|travel rule|beneficiary|vasp/iu.test(outcome.detail);
        this.state.blockedUntil = {
          ...(this.state.blockedUntil ?? {}),
          [action.toVenue]: {
            until: now + (travelRule ? TRAVEL_RULE_BACKOFF_MS : FAILURE_BACKOFF_MS),
            reason: travelRule
              ? fromBybit
                ? `Bybit refused the withdrawal under Travel Rule: ${outcome.detail}`
                : "Binance refused the withdrawal under Travel Rule (-4104): complete the Travel Rule details for this destination in the Binance app."
              : outcome.detail,
          },
        };
      }
      results.push(this.record({at: now, actionId: action.id, toVenue: action.toVenue, amountUsdt, status: outcome.status,
        detail: outcome.detail, referenceId: outcome.referenceId}, true));
    }
    results.push(...(await this.executeStockBuys(plan, now)));
    results.push(...(await this.executeStockSells(plan, now)));
    this.persist();
    return results;
  }

  /** Bybit deposits land in Funding; the bot trades from Unified. */
  private async sweepBybitFunding(port: RouteRefillPort, now: number): Promise<RouteRefillExecution[]> {
    if (!port.sweepBybitFundingToUnified) return [];
    const block = this.state.blockedUntil?.[SWEEP_BLOCK_KEY];
    if (block && block.until > now) return [];
    let outcomes: readonly RebalancingMoveOutcome[];
    try {
      outcomes = await port.sweepBybitFundingToUnified();
    } catch (error: unknown) {
      outcomes = [{kind: "SAME_EXCHANGE", exchange: "bybit", destinationExchange: null, amountUsdt: 0, status: "FAILED",
        detail: `Bybit Funding balance read failed: ${error instanceof Error ? error.message : String(error)}`, referenceId: null}];
    }
    const failed = outcomes.find((outcome) => outcome.status === "FAILED");
    if (failed) {
      this.state.blockedUntil = {...(this.state.blockedUntil ?? {}), [SWEEP_BLOCK_KEY]: {until: now + FAILURE_BACKOFF_MS, reason: failed.detail}};
    }
    return outcomes.map((outcome) => this.record({
      at: now,
      actionId: "FUNDING_SWEEP|bybit",
      toVenue: "bybit",
      amountUsdt: outcome.amountUsdt,
      status: outcome.status,
      kind: "FUNDING_SWEEP",
      detail: outcome.detail,
      referenceId: outcome.referenceId,
    }, true));
  }

  /** AUTO BUY_COIN actions within the daily cap and each venue's cash floor. */
  private async executeStockBuys(
    plan: ReturnType<RouteRefillService["getPlan"]>,
    now: number,
  ): Promise<RouteRefillExecution[]> {
    const usdtInr = plan.usdtInr;
    const actions = plan.actions.filter((item: RefillAction) => item.mode === "AUTO" && item.kind === "BUY_COIN" && item.buyQuote);
    if (!plan.automation.autoBuy.enabled || usdtInr === null || actions.length === 0) return [];

    const valuation = this.dependencies.getValuation(now);
    const day = istDay(now);
    const results: RouteRefillExecution[] = [];
    let port: StockBuyPort | null = null;

    for (const action of actions) {
      const quote = action.buyQuote as "INR" | "USDT";
      const key = `${action.toVenue}|${action.asset}`;
      const block = this.state.buyBlockedUntil?.[key];
      if (block && block.until > now) continue;

      const spent = this.state.buySpentInr?.[day] ?? 0;
      const remaining = plan.automation.autoBuy.dailyCapInr - spent;
      const cash = valuation.holdingInr(action.toVenue, quote) ?? 0;
      const allowedByCash = cash - plan.automation.autoBuy.cashFloorInr;
      const amountInr = Math.floor(Math.min(action.amountInr, remaining, allowedByCash));
      if (amountInr < MINIMUM_BUY_INR) continue;

      port ??= await this.dependencies.getBuyPort();
      const outcome = await port.buy({venue: action.toVenue, coin: action.asset, quote, amountInr, usdtInr, now});
      const status = `BUY_${outcome.status}` as RouteRefillExecution["status"];
      if (outcome.status !== "SKIPPED") {
        // Unknown outcomes count in full against the cap: never assume less was spent.
        this.state.buySpentInr = {[day]: spent + outcome.spentInr};
      }
      if (outcome.status === "FILLED" || outcome.status === "PARTIAL" || outcome.status === "UNKNOWN") {
        this.state.lastBuyAt = {...(this.state.lastBuyAt ?? {}), [key]: now};
      }
      if (outcome.status === "UNKNOWN" || outcome.status === "NO_FILL") {
        this.state.buyBlockedUntil = {
          ...(this.state.buyBlockedUntil ?? {}),
          [key]: {
            until: now + (outcome.status === "UNKNOWN" ? BUY_UNKNOWN_BACKOFF_MS : BUY_NO_FILL_BACKOFF_MS),
            reason: outcome.detail,
          },
        };
      }
      results.push(this.record({
        at: now,
        actionId: action.id,
        toVenue: action.toVenue,
        amountUsdt: 0,
        status,
        kind: "STOCK_BUY",
        coin: action.asset,
        spentInr: outcome.spentInr,
        detail: outcome.detail,
        referenceId: outcome.orderId,
      }, outcome.status !== "SKIPPED"));
    }
    return results;
  }

  /**
   * Sells idle stock (a coin no longer allocated) and surplus stock (well
   * above its allocation) into cash that an allocated, short coin can use.
   * Guards: auto-sell switch, daily sell cap, 24 h minimum hold on stock the
   * manager bought, freed cash must land in a pool with unmet demand, the
   * switch must earn >= 2x its cost within a day on the live signal, and the
   * executor's no-discount price check. At most one sell per cycle.
   */
  private async executeStockSells(
    plan: ReturnType<RouteRefillService["getPlan"]>,
    now: number,
  ): Promise<RouteRefillExecution[]> {
    const usdtInr = plan.usdtInr;
    const allocation = plan.allocation;
    if (!plan.automation.autoSell.enabled || usdtInr === null || allocation === null) return [];
    const valuation = this.dependencies.getValuation(now);
    const day = istDay(now);
    const remainingCap = plan.automation.autoSell.dailyCapInr - (this.state.sellSpentInr?.[day] ?? 0);
    const skip = (reason: string): RouteRefillExecution[] => {
      this.state.lastSellSkip = {at: now, reason};
      return [];
    };
    if (remainingCap < MINIMUM_SELL_INR) return skip("Daily stock-sell cap reached.");

    // Unmet demand per cash pool, and the daily profit of the coins waiting on it.
    const demand = new Map<string, {inr: number; profitInr: number; coins: Set<string>}>();
    const addDemand = (pool: string, inr: number, coin: string, profitInr: number) => {
      if (!(inr > 0)) return;
      const entry = demand.get(pool) ?? {inr: 0, profitInr: 0, coins: new Set<string>()};
      entry.inr += inr;
      if (!entry.coins.has(coin)) {
        entry.coins.add(coin);
        entry.profitInr += profitInr;
      }
      demand.set(pool, entry);
    };
    for (const coin of allocation.coins) {
      const coinShort = coin.coinNeedInr - (valuation.holdingInr(coin.coinVenue, coin.coin) ?? 0);
      const cashShort = coin.cashNeedInr - (valuation.holdingInr(coin.cashVenue, coin.cashAsset) ?? 0);
      addDemand(cashPool(coin.coinVenue, (plan.targets.find((target) => target.coin === coin.coin)?.coinVenueQuote ?? "USDT")), coinShort, coin.coin, coin.expectedDailyProfitInr);
      addDemand(cashPool(coin.cashVenue, coin.cashAsset), cashShort, coin.coin, coin.expectedDailyProfitInr);
    }
    if (demand.size === 0) return skip("Every allocated coin is funded; nothing needs freed cash.");

    const allocatedAt = new Map(allocation.coins.map((coin) => [coin.coin, coin]));
    // A coin with opportunity that is only waiting for capital keeps its stock.
    const waiting = new Set(allocation.unfunded);
    const candidates: {venue: string; coin: string; surplusInr: number; idle: boolean}[] = [];
    for (const venue of VENUES) {
      for (const asset of valuation.assets?.(venue) ?? []) {
        if (asset === "INR" || asset === "USDT") continue;
        const held = valuation.holdingInr(venue, asset) ?? 0;
        if (held < MINIMUM_SELL_INR) continue;
        const allocated = allocatedAt.get(asset);
        if (waiting.has(asset)) continue;
        // Stock allocated to another venue is moved there, not sold.
        if (allocated && allocated.coinVenue !== venue) continue;
        const surplus = allocated ? held - allocated.coinNeedInr * SURPLUS_MARGIN : held;
        if (surplus < MINIMUM_SELL_INR) continue;
        candidates.push({venue, coin: asset, surplusInr: surplus, idle: !allocated});
      }
    }
    // Idle (non-allocated) stock first, then surplus core stock; bigger first.
    candidates.sort((a, b) => Number(b.idle) - Number(a.idle) || b.surplusInr - a.surplusInr);
    if (candidates.length === 0) return skip("No idle or surplus stock to sell.");

    let lastReason = "";
    for (const candidate of candidates) {
      const key = `${candidate.venue}|${candidate.coin}`;
      const block = this.state.sellBlockedUntil?.[key];
      if (block && block.until > now) {
        lastReason = `${candidate.coin} on ${candidate.venue} paused: ${block.reason}`;
        continue;
      }
      const boughtAt = this.state.lastBuyAt?.[key];
      if (boughtAt !== undefined && now - boughtAt < MINIMUM_HOLD_MS) {
        lastReason = `${candidate.coin} on ${candidate.venue} was bought ${Math.round((now - boughtAt) / 3_600_000)} h ago (minimum hold 24 h).`;
        continue;
      }
      const options = (SELL_VENUE_QUOTES[candidate.venue] ?? [])
        .map((quote) => ({quote, pool: demand.get(cashPool(candidate.venue, quote))}))
        .filter((option) => option.pool !== undefined && option.pool.inr >= MINIMUM_SELL_INR)
        .sort((a, b) => (b.pool?.profitInr ?? 0) - (a.pool?.profitInr ?? 0));
      const option = options[0];
      if (!option?.pool) {
        lastReason = `Cash from ${candidate.coin} on ${candidate.venue} would not reach any coin that needs it.`;
        continue;
      }
      const amountInr = Math.floor(Math.min(candidate.surplusInr, option.pool.inr, remainingCap));
      if (amountInr < MINIMUM_SELL_INR) {
        lastReason = `${candidate.coin}: sellable amount ₹${amountInr} is below the ₹${MINIMUM_SELL_INR} minimum.`;
        continue;
      }
      const cost = amountInr * SWITCH_COST_SHARE;
      if (option.pool.profitInr < SWITCH_BENEFIT_MULTIPLE * cost) {
        lastReason = `Selling ₹${amountInr} of ${candidate.coin} costs ≈₹${cost.toFixed(0)}; the coins waiting on that cash (${[...option.pool.coins].join(", ")}) earn ≈₹${option.pool.profitInr.toFixed(0)}/day, under ${SWITCH_BENEFIT_MULTIPLE}x the cost.`;
        continue;
      }

      const port = await this.dependencies.getBuyPort();
      if (!port.sell) return skip("Stock sells are not available in this build.");
      const quantity = valuation.quantity(candidate.venue, candidate.coin) ?? 0;
      const outcome = await port.sell({
        venue: candidate.venue,
        coin: candidate.coin,
        quote: option.quote,
        amountInr,
        maximumQuantity: quantity,
        usdtInr,
        now,
      });
      if (outcome.status === "SKIPPED") {
        lastReason = outcome.detail;
        continue;
      }
      // Unknown outcomes count in full against the cap.
      this.state.sellSpentInr = {[day]: (this.state.sellSpentInr?.[day] ?? 0) + (outcome.status === "UNKNOWN" ? amountInr : outcome.spentInr)};
      if (outcome.status === "UNKNOWN" || outcome.status === "NO_FILL") {
        this.state.sellBlockedUntil = {
          ...(this.state.sellBlockedUntil ?? {}),
          [key]: {until: now + (outcome.status === "UNKNOWN" ? BUY_UNKNOWN_BACKOFF_MS : BUY_NO_FILL_BACKOFF_MS), reason: outcome.detail},
        };
      }
      this.state.lastSellSkip = null;
      return [this.record({
        at: now,
        actionId: `SELL_COIN|${candidate.coin}|${candidate.venue}`,
        toVenue: candidate.venue,
        amountUsdt: 0,
        status: `SELL_${outcome.status}` as RouteRefillExecution["status"],
        kind: "STOCK_SELL",
        coin: candidate.coin,
        spentInr: outcome.spentInr,
        detail: `${outcome.detail} ${candidate.idle ? "Idle stock" : "Surplus stock"} → ${option.quote} for ${[...option.pool.coins].join(", ")}.`,
        referenceId: outcome.orderId,
      }, true)];
    }
    return skip(lastReason || "No stock sell passed the guards.");
  }

  private record(execution: RouteRefillExecution, keep: boolean): RouteRefillExecution {
    if (keep) {
      this.state.history.push(execution);
      if (this.state.history.length > MAXIMUM_HISTORY) this.state.history = this.state.history.slice(-MAXIMUM_HISTORY);
    }
    return execution;
  }

  private persist(): void {
    try {
      this.store.replaceAllAtomically([this.state]);
    } catch (error: unknown) {
      console.warn("[Route-Refill] Persist failed:", error instanceof Error ? error.message : error);
    }
  }
}

let shared: RouteRefillService | null = null;

export function getRouteRefillService(): RouteRefillService {
  shared ??= new RouteRefillService();
  return shared;
}
