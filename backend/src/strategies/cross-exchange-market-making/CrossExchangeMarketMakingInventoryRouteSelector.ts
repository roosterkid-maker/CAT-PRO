import type {
  ExchangeMarketCapability,
} from "../../execution/capabilities/models/ExchangeCapability";

import {
  exchangeCapabilityService,
} from "../../execution/capabilities/services/ExchangeCapabilityService";

import {
  tradingAccountService,
} from "../../trading/account/TradingAccountService";

import type {
  ExchangeBalanceSnapshot,
} from "../../trading/account/TradingAccountService";

import type {
  CrossExchangeMarketMakingSafePriceEvidence,
} from "../models/StrategySignal";

export type CrossExchangeMarketMakingInventoryRequirementState =
  | "VERIFIED"
  | "NOT_SYNCHRONIZED"
  | "STALE"
  | "INSUFFICIENT";

export interface CrossExchangeMarketMakingInventoryRoutePort {
  getMarketCapability(
    exchange: string,
    market: string,
  ): ExchangeMarketCapability | null;

  getBalance(
    exchange: string,
    asset: string,
  ): ExchangeBalanceSnapshot | null;
}

export interface CrossExchangeMarketMakingInventoryRequirement {
  readonly role: "MAKER" | "HEDGE";
  readonly action: "BUY" | "SELL";
  readonly exchange: string;
  readonly asset: string;
  readonly requiredAmount: number;
  readonly availableAmount: number | null;
  readonly synchronizedAt: number | null;
  readonly ageMs: number | null;
  readonly state: CrossExchangeMarketMakingInventoryRequirementState;
}

export interface CrossExchangeMarketMakingInventoryRouteAssessment {
  readonly version: "77.0";
  readonly id: string;
  readonly generatedAt: number;
  readonly routeKey: string;
  readonly market: string;
  readonly side: "BID" | "ASK";
  readonly makerExchange: string;
  readonly hedgeExchange: string;
  readonly quantity: number | null;
  readonly state: "FEASIBLE" | "BLOCKED";
  readonly requirements: readonly CrossExchangeMarketMakingInventoryRequirement[];
  readonly blockers: readonly string[];
  readonly safety: CrossExchangeMarketMakingInventorySafety;
}

export interface CrossExchangeMarketMakingInventorySafety {
  readonly readOnly: true;
  readonly inferredBalanceAllowed: false;
  readonly balanceMutationPerformed: false;
  readonly transferPerformed: false;
  readonly paperExecutionTriggered: false;
  readonly liveExecutionAllowed: false;
  readonly orderSubmissionAllowed: false;
}

export interface CrossExchangeMarketMakingInventoryRoutingSnapshot {
  readonly version: "77.0";
  readonly generatedAt: number;
  readonly mode: "XEMM_INVENTORY_AWARE_DIRECTION_SELECTION";
  readonly summary: {
    readonly evaluations: number;
    readonly feasible: number;
    readonly blocked: number;
    readonly currentRoutes: number;
    readonly feasibleRoutes: number;
    readonly blockedRoutes: number;
    readonly lastFeasibleAt: number | null;
  };
  readonly routes: readonly CrossExchangeMarketMakingInventoryRouteAssessment[];
  readonly safety: CrossExchangeMarketMakingInventorySafety;
}

const SAFETY: CrossExchangeMarketMakingInventorySafety = Object.freeze({
  readOnly: true,
  inferredBalanceAllowed: false,
  balanceMutationPerformed: false,
  transferPerformed: false,
  paperExecutionTriggered: false,
  liveExecutionAllowed: false,
  orderSubmissionAllowed: false,
});

const DEFAULT_MAXIMUM_BALANCE_AGE_MS = 15_000;

class DefaultCrossExchangeMarketMakingInventoryRoutePort
implements CrossExchangeMarketMakingInventoryRoutePort {
  getMarketCapability(exchange: string, market: string): ExchangeMarketCapability | null {
    return exchangeCapabilityService.getCachedCapability(exchange, market, "spot");
  }

  getBalance(exchange: string, asset: string): ExchangeBalanceSnapshot | null {
    return tradingAccountService.getExchangeBalance(exchange, asset);
  }
}

/**
 * Read-only, fail-closed inventory gate for an already price-qualified XEMM
 * direction. It never changes the operator-selected venue pair and never
 * transfers, reserves or mutates funds.
 */
export class CrossExchangeMarketMakingInventoryRouteSelector {
  private readonly latestByRoute = new Map<string, CrossExchangeMarketMakingInventoryRouteAssessment>();
  private evaluations = 0;
  private feasible = 0;
  private blocked = 0;
  private lastFeasibleAt: number | null = null;

  constructor(
    private readonly port: CrossExchangeMarketMakingInventoryRoutePort =
      new DefaultCrossExchangeMarketMakingInventoryRoutePort(),
    private readonly maximumBalanceAgeMs = DEFAULT_MAXIMUM_BALANCE_AGE_MS,
  ) {
    if (!Number.isSafeInteger(maximumBalanceAgeMs) || maximumBalanceAgeMs <= 0) {
      throw new Error("XEMM inventory maximum balance age must be a positive integer.");
    }
  }

  evaluate(
    evidence: CrossExchangeMarketMakingSafePriceEvidence,
    now = Date.now(),
  ): CrossExchangeMarketMakingInventoryRouteAssessment {
    if (!Number.isSafeInteger(now) || now <= 0) {
      throw new Error("XEMM inventory evaluation timestamp must be a positive integer.");
    }

    const market = normalizeMarket(evidence.market);
    const makerExchange = normalizeExchange(evidence.makerExchange);
    const hedgeExchange = normalizeExchange(evidence.hedgeExchange);
    const routeKey = [market, makerExchange, hedgeExchange, evidence.side].join(":");
    const blockers: string[] = [];
    const quantity = validPositive(evidence.configuredMakerQuantity)
      ? evidence.configuredMakerQuantity
      : null;
    const makerCapability = this.port.getMarketCapability(makerExchange, market);
    const hedgeCapability = this.port.getMarketCapability(hedgeExchange, market);

    if (quantity === null) blockers.push("INVENTORY_CONFIGURED_QUANTITY_MISSING");
    if (!makerCapability) blockers.push(`INVENTORY_MARKET_ASSETS_UNRESOLVED:MAKER:${makerExchange}:${market}`);
    if (!hedgeCapability) blockers.push(`INVENTORY_MARKET_ASSETS_UNRESOLVED:HEDGE:${hedgeExchange}:${market}`);

    if (makerCapability && hedgeCapability &&
        (normalizeAsset(makerCapability.baseAsset) !== normalizeAsset(hedgeCapability.baseAsset) ||
          normalizeAsset(makerCapability.quoteAsset) !== normalizeAsset(hedgeCapability.quoteAsset))) {
      blockers.push("INVENTORY_ASSET_PAIR_MISMATCH");
    }

    const requirements = quantity !== null && makerCapability && hedgeCapability && blockers.length === 0
      ? this.buildRequirements(evidence, makerCapability, hedgeCapability, quantity, now)
      : [];

    for (const requirement of requirements) {
      if (requirement.state === "VERIFIED") continue;
      blockers.push([
        "INVENTORY_BALANCE",
        requirement.state,
        requirement.role,
        requirement.exchange,
        requirement.asset,
      ].join(":"));
    }

    const state = blockers.length === 0 ? "FEASIBLE" as const : "BLOCKED" as const;
    const assessment = freeze({
      version: "77.0" as const,
      id: `xemm-inventory:${now}:${routeKey}`,
      generatedAt: now,
      routeKey,
      market,
      side: evidence.side,
      makerExchange,
      hedgeExchange,
      quantity,
      state,
      requirements,
      blockers: [...new Set(blockers)],
      safety: SAFETY,
    });

    this.evaluations += 1;
    if (state === "FEASIBLE") {
      this.feasible += 1;
      this.lastFeasibleAt = now;
    } else {
      this.blocked += 1;
    }
    this.latestByRoute.set(routeKey, assessment);

    return clone(assessment);
  }

  getSnapshot(now = Date.now()): CrossExchangeMarketMakingInventoryRoutingSnapshot {
    if (!Number.isSafeInteger(now) || now <= 0) {
      throw new Error("XEMM inventory snapshot timestamp must be a positive integer.");
    }
    const routes = [...this.latestByRoute.values()]
      .sort((first, second) => first.routeKey.localeCompare(second.routeKey));
    return clone(freeze({
      version: "77.0" as const,
      generatedAt: now,
      mode: "XEMM_INVENTORY_AWARE_DIRECTION_SELECTION" as const,
      summary: {
        evaluations: this.evaluations,
        feasible: this.feasible,
        blocked: this.blocked,
        currentRoutes: routes.length,
        feasibleRoutes: routes.filter((route) => route.state === "FEASIBLE").length,
        blockedRoutes: routes.filter((route) => route.state === "BLOCKED").length,
        lastFeasibleAt: this.lastFeasibleAt,
      },
      routes,
      safety: SAFETY,
    }));
  }

  private buildRequirements(
    evidence: CrossExchangeMarketMakingSafePriceEvidence,
    makerCapability: ExchangeMarketCapability,
    hedgeCapability: ExchangeMarketCapability,
    quantity: number,
    now: number,
  ): CrossExchangeMarketMakingInventoryRequirement[] {
    const makerBuy = evidence.side === "BID";
    const makerFeeMultiplier = 1 + Math.max(0, evidence.makerFee.percent) / 100;
    const hedgeFeeMultiplier = 1 + Math.max(0, evidence.hedgeTakerFee.percent) / 100;
    return [
      this.requirement({
        role: "MAKER",
        action: makerBuy ? "BUY" : "SELL",
        exchange: evidence.makerExchange,
        asset: makerBuy ? makerCapability.quoteAsset : makerCapability.baseAsset,
        requiredAmount: makerBuy ? quantity * evidence.safeMakerPrice * makerFeeMultiplier : quantity,
        now,
      }),
      this.requirement({
        role: "HEDGE",
        action: makerBuy ? "SELL" : "BUY",
        exchange: evidence.hedgeExchange,
        asset: makerBuy ? hedgeCapability.baseAsset : hedgeCapability.quoteAsset,
        requiredAmount: makerBuy ? quantity : quantity * evidence.hedgeReferencePrice * hedgeFeeMultiplier,
        now,
      }),
    ];
  }

  private requirement(input: {
    role: "MAKER" | "HEDGE";
    action: "BUY" | "SELL";
    exchange: string;
    asset: string;
    requiredAmount: number;
    now: number;
  }): CrossExchangeMarketMakingInventoryRequirement {
    const exchange = normalizeExchange(input.exchange);
    const asset = normalizeAsset(input.asset);
    const requiredAmount = normalizeNumber(input.requiredAmount);
    const balance = this.port.getBalance(exchange, asset);
    const ageMs = balance && Number.isSafeInteger(balance.synchronizedAt)
      ? input.now - balance.synchronizedAt
      : null;
    const state: CrossExchangeMarketMakingInventoryRequirementState = !balance
      ? "NOT_SYNCHRONIZED"
      : ageMs === null || ageMs < 0 || ageMs > this.maximumBalanceAgeMs
        ? "STALE"
        : balance.availableBalance + 1e-12 < requiredAmount
          ? "INSUFFICIENT"
          : "VERIFIED";
    return freeze({
      role: input.role,
      action: input.action,
      exchange,
      asset,
      requiredAmount,
      availableAmount: balance ? normalizeNumber(balance.availableBalance) : null,
      synchronizedAt: balance?.synchronizedAt ?? null,
      ageMs,
      state,
    });
  }
}

function validPositive(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value > 0;
}

function normalizeExchange(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeMarket(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeAsset(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeNumber(value: number): number {
  return Number(value.toPrecision(15));
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function freeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freeze(nested);
  return Object.freeze(value);
}

export const crossExchangeMarketMakingInventoryRouteSelector =
  new CrossExchangeMarketMakingInventoryRouteSelector();
