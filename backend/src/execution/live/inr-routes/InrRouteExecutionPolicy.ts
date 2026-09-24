import {
  getLiveOnlyRuntimePolicy,
  isLiveOnlyRuntimeEnabled,
} from "../../../config/LiveOnlyRuntimePolicy";

import {
  getDynamicLegSize,
  loadDynamicLegConfig,
} from "./InrDynamicLegSize";

/*
 * Policy for executing the scanner's INR routes (USDT<->INR, INR<->INR).
 *
 * Modes:
 *   off     runner does nothing
 *   shadow  full action-time planning against fresh books and balances,
 *           recorded as SHADOW attempts; never submits an order
 *   live    plans and submits
 *
 * INR venues become executable one at a time as their order contract is
 * implemented. The USDT hedge venues are the ones Strategy #1 already
 * trades live.
 */
export type InrRouteExecutionMode = "off" | "shadow" | "live";

/** How an INR venue's primary order is placed and reconciled. */
export type InrVenueOrderStyle =
  /* Limit GTC with a bounded wait then cancel; reconciled by client order ID. */
  | "GTC_BOUNDED_CANCEL"
  /* Plain limit (no time-in-force on the venue), bounded wait then cancel;
   * reconciled by UUID client order ID. Emulates IOC. */
  | "LIMIT_BOUNDED_CANCEL"
  /* Plain limit, no client order ID on the venue: a lost create is matched
   * against an order-history baseline (side, rate, volume); anything
   * unmatched halts all trading. */
  | "LIMIT_BOUNDED_CANCEL_HEURISTIC";

export const INR_ROUTE_SUPPORTED_INR_VENUES: Readonly<Record<string, InrVenueOrderStyle>> = {
  coindcx: "GTC_BOUNDED_CANCEL",
  coinswitch: "LIMIT_BOUNDED_CANCEL",
  unocoin: "LIMIT_BOUNDED_CANCEL_HEURISTIC",
};

export const INR_ROUTE_HEDGE_VENUES = ["binance", "bybit", "coindcx"] as const;

export const INR_ROUTE_LIVE_CONFIRMATION = "ENABLE_CAT_PRO_INR_ROUTE_LIVE";

export interface InrRouteExecutionPolicy {
  readonly mode: InrRouteExecutionMode;
  /** INR venues whose legs may be executed (subset of the supported set). */
  readonly inrVenues: readonly string[];
  readonly hedgeVenues: readonly string[];
  readonly minimumCapitalPerLegInr: number;
  readonly targetCapitalPerLegInr: number;
  readonly maximumCapitalPerLegInr: number;
  readonly minimumNetPercent: number;
  /** Same route is not attempted again within this. */
  readonly routeCooldownMs: number;
  /** Book used at action time must be at most this old. */
  readonly maximumBookAgeMs: number;
  readonly maximumBalanceAgeMs: number;
  /** Primary (INR venue) order: bounded wait before cancel. */
  readonly primaryTimeoutMs: number;
  /** Successive hedge limit buffers beyond the fresh book, percent. */
  readonly hedgeBufferPercents: readonly number[];
  /** Unhedged remainder below this INR value is recorded as dust, not a halt. */
  readonly dustToleranceInr: number;
}

function number(environment: NodeJS.ProcessEnv, name: string, fallback: number, min: number, max: number): number {
  const raw = environment[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${name} must be between ${min} and ${max}.`);
  }
  return value;
}

export function loadInrRouteExecutionPolicy(
  environment: NodeJS.ProcessEnv = process.env,
): InrRouteExecutionPolicy {
  const requestedMode = environment.CAT_PRO_INR_LIVE_MODE?.trim().toLowerCase() ?? "off";
  if (requestedMode !== "off" && requestedMode !== "shadow" && requestedMode !== "live") {
    throw new Error("CAT_PRO_INR_LIVE_MODE must be off, shadow or live.");
  }

  // Live submission needs the LIVE-only runtime plus its own confirmation;
  // anything short of that degrades to shadow, never the other way round.
  const liveConfirmed =
    isLiveOnlyRuntimeEnabled(environment) &&
    environment.CAT_PRO_INR_LIVE_CONFIRMATION?.trim() === INR_ROUTE_LIVE_CONFIRMATION;
  const mode: InrRouteExecutionMode =
    requestedMode === "live" && !liveConfirmed ? "shadow" : requestedMode;

  const inrVenues = (environment.CAT_PRO_INR_LIVE_VENUES ?? "")
    .split(",")
    .map((venue) => venue.trim().toLowerCase())
    .filter((venue) => venue.length > 0);
  for (const venue of inrVenues) {
    if (!INR_ROUTE_SUPPORTED_INR_VENUES[venue]) {
      throw new Error(`CAT_PRO_INR_LIVE_VENUES: ${venue} has no implemented INR order contract yet.`);
    }
  }

  const livePolicy = getLiveOnlyRuntimePolicy(environment);
  // The leg grows with the capital the capital manager can deploy (never
  // below the configured leg, never above the dynamic hard cap).
  const dynamicLeg = loadDynamicLegConfig(environment);
  const published = dynamicLeg.enabled ? getDynamicLegSize() : null;
  const targetCapitalPerLegInr = published
    ? Math.max(livePolicy.preferredCapitalPerLegInr, Math.min(dynamicLeg.maximumInr, published.legInr))
    : livePolicy.preferredCapitalPerLegInr;

  return Object.freeze({
    mode,
    inrVenues: Object.freeze([...new Set(inrVenues)]),
    hedgeVenues: INR_ROUTE_HEDGE_VENUES,
    minimumCapitalPerLegInr: livePolicy.minimumCapitalPerLegInr,
    targetCapitalPerLegInr,
    maximumCapitalPerLegInr: Math.max(livePolicy.maximumCapitalPerLegInr, targetCapitalPerLegInr),
    minimumNetPercent: number(environment, "CAT_PRO_INR_LIVE_MIN_NET_PERCENT", 1, 0.5, 20),
    routeCooldownMs: number(environment, "CAT_PRO_INR_LIVE_ROUTE_COOLDOWN_MS", 60_000, 5_000, 3_600_000),
    maximumBookAgeMs: 3_000,
    maximumBalanceAgeMs: 15_000,
    primaryTimeoutMs: 2_500,
    hedgeBufferPercents: Object.freeze([0.15, 0.5, 1]),
    dustToleranceInr: 150,
  });
}
