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
    | "BUY_UNKNOWN";
  readonly kind?: "USDT_TOPUP" | "STOCK_BUY" | "FUNDING_SWEEP";
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
}

const DEFAULT_DEPENDENCIES: RouteRefillDependencies = {
  getTargets: (tradeSizeInr, valuation) =>
    getCoinStudyService()
      .getReport(tradeSizeInr, (venue, asset) => valuation.holdingInr(venue, asset))
      .coins
      .filter((coin) => coin.core && coin.placement.trades > 0)
      .map((coin) => ({
        coin: coin.coin,
        rank: coin.rank,
        coinVenue: coin.placement.coin.venue,
        coinNeedInr: coin.placement.coin.needInr,
        cashVenue: coin.placement.cash.venue,
        cashAsset: coin.placement.cash.asset,
        cashNeedInr: coin.placement.cash.needInr,
        coinVenueQuote: coin.directions[0]?.sellQuote,
      })),
  getValuation: (now) => createInventoryValuation(now),
  getConfig: () => loadRebalancingExecutionConfig(),
  getTradeSizeInr: () => getLiveOnlyRuntimePolicy().preferredCapitalPerLegInr,
  getAutoBuyConfig: () => loadAutoBuyConfig(),
  getBuyPort: async () => new (await import("./StockBuyExecutor")).DefaultStockBuyExecutor(),
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
    this.dependencies = {...DEFAULT_DEPENDENCIES, ...dependencies};
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
    const targets = this.dependencies.getTargets(this.dependencies.getTradeSizeInr(), valuation);
    const plan = planRouteRefills({
      targets,
      venues: VENUES,
      holdingInr: (venue, asset) => valuation.holdingInr(venue, asset),
      priceInr: (asset) => valuation.priceInr(asset),
      autoUsdtDestinations,
      bybitAutoUsdtDestinations,
      autoBuyVenues,
      autoBuyMinimumCashSideInr: this.dependencies.getTradeSizeInr(),
      refillBelowShare: REFILL_BELOW_SHARE,
      sourceFloorInr: SOURCE_FLOOR_INR,
      minimumActionInr: MINIMUM_ACTION_INR,
    });
    return {
      schemaVersion: "1.0" as const,
      generatedAt: now,
      usdtInr: valuation.usdtInr,
      targets,
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
