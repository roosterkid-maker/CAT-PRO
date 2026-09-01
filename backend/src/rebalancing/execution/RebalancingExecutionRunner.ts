/*
 * Periodic trigger for the Automated Capital Rebalancer. Nothing else in the
 * codebase calls RebalancingExecutionService on a schedule - the existing
 * GET /rebalancing-status route computes the same plan on demand for the
 * dashboard, but only when a human loads the page. This runner is what
 * makes the rebalancer actually "automatic": it recomputes the plan on its
 * own interval and hands it to the execution service.
 *
 * It deliberately reuses the EXACT same call sequence as
 * GET /rebalancing-status (portfolioRoutes.ts) to build the plan -
 * normalizedInventorySnapshotService -> capitalAllocationAndImbalanceService
 * (default policy) -> rebalancingDecisionEngine - rather than re-deriving
 * that pipeline a second time. Two independent implementations of "what is
 * the current rebalancing plan" could drift apart; one path used by both
 * the read-only dashboard and the execution layer cannot.
 *
 * Every tick is safe by construction even when misconfigured: both
 * RebalancingExecutionService methods internally check
 * loadRebalancingExecutionConfig().enabled (and the per-phase flag) before
 * doing anything, so a tick with the feature OFF just returns
 * SKIPPED_DISABLED outcomes without ever calling Binance.
 */

import {
  normalizedInventorySnapshotService,
} from "../services/NormalizedInventorySnapshotService";

import {
  capitalAllocationAndImbalanceService,
} from "../services/CapitalAllocationAndImbalanceService";

import {
  rebalancingDecisionEngine,
} from "../services/RebalancingDecisionEngine";

import {
  capitalManagerSafetyContextService,
} from "../services/CapitalManagerSafetyContextService";

import {
  tradingAccountService,
} from "../../trading/account/TradingAccountService";

import {
  loadRebalancingExecutionConfig,
} from "./RebalancingExecutionConfig";

import {
  rebalancingExecutionService,
  type RebalancingMoveOutcome,
} from "./RebalancingExecutionService";

export interface RebalancingExecutionRunnerConfig {
  pollIntervalMs: number;
}

export interface RebalancingExecutionRunnerStatus {
  running: boolean;
  cycleInProgress: boolean;
  pollIntervalMs: number;
  lastCycleAt: number | null;
  lastOutcomes: readonly RebalancingMoveOutcome[];
  lastError: string | null;
}

const DEFAULT_POLL_INTERVAL_MS = 180_000;

function resolvePollIntervalMs(): number {
  const raw = process.env.CAT_PRO_REBALANCER_POLL_INTERVAL_MS?.trim();
  if (!raw) return DEFAULT_POLL_INTERVAL_MS;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed >= 30_000 ? parsed : DEFAULT_POLL_INTERVAL_MS;
}

export class RebalancingExecutionRunner {
  private readonly config: RebalancingExecutionRunnerConfig;
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private cycleInProgress = false;
  private lastCycleAt: number | null = null;
  private lastOutcomes: readonly RebalancingMoveOutcome[] = [];
  private lastError: string | null = null;

  constructor(config: Partial<RebalancingExecutionRunnerConfig> = {}) {
    this.config = {
      pollIntervalMs: config.pollIntervalMs ?? resolvePollIntervalMs(),
    };
    if (!Number.isSafeInteger(this.config.pollIntervalMs) || this.config.pollIntervalMs < 30_000) {
      throw new Error("Rebalancing execution poll interval must be an integer of at least 30000 ms.");
    }
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    const enabled = loadRebalancingExecutionConfig().enabled;
    console.log(
      `[RebalancingExecutionRunner] Started with interval ${this.config.pollIntervalMs} ms ` +
        `(CAT_PRO_REBALANCER_ENABLED=${enabled}).`,
    );

    this.timer = setInterval(() => {
      void this.runCycle();
    }, this.config.pollIntervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (!this.running) return;
    this.running = false;
    console.log("[RebalancingExecutionRunner] Stopped.");
  }

  isRunning(): boolean {
    return this.running;
  }

  getStatus(): RebalancingExecutionRunnerStatus {
    return {
      running: this.running,
      cycleInProgress: this.cycleInProgress,
      pollIntervalMs: this.config.pollIntervalMs,
      lastCycleAt: this.lastCycleAt,
      lastOutcomes: this.lastOutcomes,
      lastError: this.lastError,
    };
  }

  /** Exposed for tests and for a manual "run one cycle now" operator action. */
  async runCycleNow(): Promise<readonly RebalancingMoveOutcome[]> {
    return this.runCycle();
  }

  private async runCycle(): Promise<readonly RebalancingMoveOutcome[]> {
    if (this.cycleInProgress) {
      console.warn("[RebalancingExecutionRunner] Cycle skipped - previous cycle still running.");
      return this.lastOutcomes;
    }

    this.cycleInProgress = true;
    const now = Date.now();

    try {
      const inventory = normalizedInventorySnapshotService.getSnapshot(now);
      const allocation = capitalAllocationAndImbalanceService.evaluate(inventory, undefined, now);
      const account = tradingAccountService.getAccount();
      const safetyContext = capitalManagerSafetyContextService.getContext(account, now);
      const plan = rebalancingDecisionEngine.plan(allocation, safetyContext, undefined, now);

      const crossExchangeOutcomes = await rebalancingExecutionService.executeCrossExchangeMoves(plan);
      const sameExchangeOutcome = await rebalancingExecutionService.executeSameExchangeTopUp();
      const outcomes = [...crossExchangeOutcomes, sameExchangeOutcome];

      this.lastOutcomes = outcomes;
      this.lastCycleAt = now;
      this.lastError = null;

      const executed = outcomes.filter((outcome) => outcome.status === "EXECUTED");
      const failed = outcomes.filter((outcome) => outcome.status === "FAILED");
      if (executed.length > 0 || failed.length > 0) {
        console.log("[RebalancingExecutionRunner] Cycle complete:", {
          executed: executed.length,
          failed: failed.length,
          skipped: outcomes.length - executed.length - failed.length,
        });
      }
      if (failed.length > 0) {
        console.error(
          "[RebalancingExecutionRunner] One or more transfers failed:",
          failed.map((outcome) => outcome.detail),
        );
      }

      return outcomes;
    } catch (error: unknown) {
      this.lastError = error instanceof Error ? error.message : "Unknown rebalancing execution cycle error.";
      this.lastCycleAt = now;
      console.error("[RebalancingExecutionRunner] Cycle failed:", this.lastError);
      return this.lastOutcomes;
    } finally {
      this.cycleInProgress = false;
    }
  }
}

export const rebalancingExecutionRunner = new RebalancingExecutionRunner();
