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
const MAXIMUM_HISTORY = 50;

export interface RouteRefillExecution {
  readonly at: number;
  readonly actionId: string;
  readonly toVenue: string;
  readonly amountUsdt: number;
  readonly status: RebalancingMoveOutcome["status"] | "SKIPPED_COOLDOWN" | "SKIPPED_TOO_SMALL";
  readonly detail: string;
  readonly referenceId: string | null;
}

interface RefillState {
  readonly schemaVersion: "1.0";
  lastTopUpAt: Record<string, number>;
  history: RouteRefillExecution[];
}

export interface RouteRefillPort {
  executeCrossExchangeMoves(plan: RebalancingDecisionPlan): Promise<readonly RebalancingMoveOutcome[]>;
}

export interface RouteRefillDependencies {
  readonly getTargets: (tradeSizeInr: number, valuation: InventoryValuation) => readonly RefillTarget[];
  readonly getValuation: (now: number) => InventoryValuation;
  readonly getConfig: () => RebalancingExecutionConfig;
  readonly getTradeSizeInr: () => number;
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
      })),
  getValuation: (now) => createInventoryValuation(now),
  getConfig: () => loadRebalancingExecutionConfig(),
  getTradeSizeInr: () => getLiveOnlyRuntimePolicy().preferredCapitalPerLegInr,
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
    filePath = resolve(process.cwd(), "data", "rebalancing", "route-refill.jsonl"),
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
    const targets = this.dependencies.getTargets(this.dependencies.getTradeSizeInr(), valuation);
    const plan = planRouteRefills({
      targets,
      venues: VENUES,
      holdingInr: (venue, asset) => valuation.holdingInr(venue, asset),
      priceInr: (asset) => valuation.priceInr(asset),
      autoUsdtDestinations,
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
        maximumPerTransferUsdt: config.maximumPerTransferUsdt,
        maximumPerDayUsdt: config.maximumPerDayCrossExchangeUsdt,
        destinationCooldownMinutes: DESTINATION_COOLDOWN_MS / 60_000,
        lastTopUpAt: {...this.state.lastTopUpAt},
      },
      recentExecutions: [...this.state.history].reverse().slice(0, 20),
    };
  }

  /** Runs the AUTO actions once; called from the capital manager's cycle. */
  async executeAuto(port: RouteRefillPort, now = Date.now()): Promise<readonly RouteRefillExecution[]> {
    const plan = this.getPlan(now);
    const usdtInr = plan.usdtInr;
    if (!plan.automation.enabled || usdtInr === null) return [];

    const results: RouteRefillExecution[] = [];
    for (const action of plan.actions.filter((item: RefillAction) => item.mode === "AUTO" && item.kind === "MOVE_USDT")) {
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
      const [outcome] = await port.executeCrossExchangeMoves({
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
      if (outcome.status === "EXECUTED") this.state.lastTopUpAt[action.toVenue] = now;
      results.push(this.record({at: now, actionId: action.id, toVenue: action.toVenue, amountUsdt, status: outcome.status,
        detail: outcome.detail, referenceId: outcome.referenceId}, true));
    }
    this.persist();
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
