/*
 * DYNAMIC PER-LEG SIZE for the INR route executor.
 *
 * The capital manager publishes the capital it can deploy each cycle; the
 * per-leg trade size follows it so that the budget always covers at least
 * DYNAMIC_LEG_MINIMUM_TRADES full trades (coin side + cash side each). Small
 * capital keeps the operator's configured leg; more capital means bigger
 * legs, never above the hard cap. The route planner still sizes every order
 * to live book depth and balances, so a bigger leg only fills where the
 * book can take it. A missing or stale publication falls back to the
 * configured leg.
 */
export const DYNAMIC_LEG_MINIMUM_TRADES = 8;
const LEG_STEP_INR = 100;
const STALE_AFTER_MS = 15 * 60_000;

export interface DynamicLegSize {
  readonly legInr: number;
  readonly budgetInr: number;
  readonly at: number;
}

export interface DynamicLegConfig {
  readonly enabled: boolean;
  readonly maximumInr: number;
}

export function loadDynamicLegConfig(environment: NodeJS.ProcessEnv = process.env): DynamicLegConfig {
  const cap = Number(environment.CAT_PRO_INR_DYNAMIC_LEG_MAX_INR?.trim() || 5_000);
  return {
    enabled: environment.CAT_PRO_INR_DYNAMIC_LEG_ENABLED?.trim().toLowerCase() === "true",
    maximumInr: Number.isFinite(cap) ? Math.min(25_000, Math.max(1_500, cap)) : 5_000,
  };
}

/** Pure: the leg for a budget, between the configured leg and the hard cap. */
export function legSizeForBudget(budgetInr: number, configuredLegInr: number, maximumInr: number): number {
  const scaled = Math.floor(Math.max(0, budgetInr) / (2 * DYNAMIC_LEG_MINIMUM_TRADES) / LEG_STEP_INR) * LEG_STEP_INR;
  return Math.max(configuredLegInr, Math.min(Math.max(configuredLegInr, maximumInr), scaled));
}

let latest: DynamicLegSize | null = null;

export function publishDynamicLegSize(size: DynamicLegSize): void {
  latest = size;
}

export function getDynamicLegSize(now = Date.now()): DynamicLegSize | null {
  return latest && now - latest.at <= STALE_AFTER_MS ? latest : null;
}

/** Tests only. */
export function resetDynamicLegSizeForTests(): void {
  latest = null;
}
