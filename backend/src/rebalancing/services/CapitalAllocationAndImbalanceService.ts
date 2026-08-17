import type {
  NormalizedExchangeInventorySnapshot,
  NormalizedInventorySnapshot,
} from "../models/NormalizedInventorySnapshot";

export type ExchangeImbalanceState =
  | "CRITICAL_LOW"
  | "UNDERFUNDED"
  | "BALANCED"
  | "OVERFUNDED"
  | "CRITICAL_HIGH";

export interface ExchangeAllocationTarget {
  readonly exchange: string;
  readonly targetPercent: number;
  readonly minimumPercent: number;
  readonly maximumPercent: number;
  readonly emergencyReserveUsdt: number;
}

export interface CapitalAllocationPolicy {
  readonly policyId: string;
  readonly revision: number;
  readonly softImbalancePercent: number;
  readonly hardImbalancePercent: number;
  readonly criticalImbalancePercent: number;
  readonly targets: readonly ExchangeAllocationTarget[];
}

export interface ExchangeImbalanceAssessment {
  readonly exchange: string;
  readonly displayName: string;
  readonly state: ExchangeImbalanceState;
  readonly currentCapitalUsdt: number;
  readonly availableCapitalUsdt: number;
  readonly targetCapitalUsdt: number;
  readonly minimumCapitalUsdt: number;
  readonly maximumCapitalUsdt: number;
  readonly emergencyReserveUsdt: number;
  readonly imbalanceUsdt: number;
  readonly imbalancePercentOfTarget: number;
  readonly deficitToTargetUsdt: number;
  readonly surplusAboveTargetUsdt: number;
  readonly transferableSurplusUsdt: number;
  readonly activeReservedCapitalUsdt: number;
  readonly suggestedAction:
    | "NO_ACTION"
    | "PREFER_NATURAL_REBALANCE"
    | "SOFT_REBALANCE_ANALYSIS"
    | "HARD_REBALANCE_ANALYSIS";
  readonly reasons: readonly string[];
}

export interface CapitalAllocationAndImbalanceReport {
  readonly version: "122.0";
  readonly generatedAt: number;
  readonly state: "READY" | "BLOCKED_EVIDENCE" | "BLOCKED_POLICY";
  readonly policy: CapitalAllocationPolicy;
  readonly capital: {
    readonly totalUsdt: number | null;
    readonly availableAfterReservationsUsdt: number | null;
    readonly reservedInventoryUsdt: number | null;
    readonly inTransitUsdt: null;
  };
  readonly exchanges: readonly ExchangeImbalanceAssessment[];
  readonly summary: {
    readonly criticalLow: number;
    readonly underfunded: number;
    readonly balanced: number;
    readonly overfunded: number;
    readonly criticalHigh: number;
    readonly totalDeficitToTargetUsdt: number;
    readonly totalSurplusAboveTargetUsdt: number;
    readonly totalTransferableSurplusUsdt: number;
  };
  readonly blockers: readonly string[];
  readonly safety: {
    readonly readOnly: true;
    readonly paperAccountingMutated: false;
    readonly balanceMutated: false;
    readonly transferPlanned: false;
    readonly transferSubmitted: false;
    readonly withdrawalSubmitted: false;
    readonly liveOrderSubmitted: false;
    readonly reservedCapitalExcluded: true;
    readonly neverDrainRuleApplied: true;
  };
}

const TARGET_EXCHANGES = [
  "binance",
  "bybit",
  "coindcx",
  "coinswitch",
  "unocoin",
] as const;

/**
 * One centralized default; callers can supply an operator-approved policy.
 * Values are analysis defaults only and grant no transfer or order authority.
 */
export const DEFAULT_CAPITAL_ALLOCATION_POLICY: CapitalAllocationPolicy = {
  policyId: "cat-pro-five-exchange-allocation-v1",
  revision: 1,
  softImbalancePercent: 10,
  hardImbalancePercent: 20,
  criticalImbalancePercent: 35,
  targets: TARGET_EXCHANGES.map((exchange) => ({
    exchange,
    targetPercent: 20,
    minimumPercent: 10,
    maximumPercent: 35,
    emergencyReserveUsdt: 0,
  })),
};

/**
 * Pure cached-snapshot calculation. No balance API, persistence, transfer,
 * order or accounting command is reachable from this service.
 */
export class CapitalAllocationAndImbalanceService {
  evaluate(
    inventory: NormalizedInventorySnapshot,
    policy: CapitalAllocationPolicy = DEFAULT_CAPITAL_ALLOCATION_POLICY,
    now = Date.now(),
  ): CapitalAllocationAndImbalanceReport {
    const policyBlockers = this.validatePolicy(policy, inventory.exchanges);
    const evidenceBlockers = this.validateInventory(inventory, now);
    const blockers = [...new Set([...policyBlockers, ...evidenceBlockers])];
    const policyValid = policyBlockers.length === 0;
    const evidenceValid = evidenceBlockers.length === 0;
    const totalUsdt = evidenceValid
      ? inventory.totals.authoritativeTotalCapitalUsdt
      : null;
    const availableUsdt = evidenceValid
      ? inventory.totals.authoritativeAvailableCapitalUsdt
      : null;
    const targets = new Map(
      policy.targets.map((target) => [
        target.exchange.trim().toLowerCase(),
        target,
      ]),
    );
    const exchanges = policyValid && evidenceValid && totalUsdt !== null
      ? inventory.exchanges.map((exchange) =>
          this.assessExchange(
            exchange,
            targets.get(exchange.exchange)!,
            policy,
            totalUsdt,
          ),
        )
      : [];
    const reservedInventoryUsdt = evidenceValid && availableUsdt !== null &&
      totalUsdt !== null
      ? this.round(Math.max(
          0,
          inventory.totals.knownAvailableValueUsdt -
            inventory.totals.knownAvailableAfterReservationsValueUsdt,
        ))
      : null;

    return this.freeze({
      version: "122.0" as const,
      generatedAt: now,
      state: !policyValid
        ? "BLOCKED_POLICY" as const
        : !evidenceValid
          ? "BLOCKED_EVIDENCE" as const
          : "READY" as const,
      policy: structuredClone(policy),
      capital: {
        totalUsdt,
        availableAfterReservationsUsdt: availableUsdt,
        reservedInventoryUsdt,
        inTransitUsdt: null,
      },
      exchanges,
      summary: {
        criticalLow: this.count(exchanges, "CRITICAL_LOW"),
        underfunded: this.count(exchanges, "UNDERFUNDED"),
        balanced: this.count(exchanges, "BALANCED"),
        overfunded: this.count(exchanges, "OVERFUNDED"),
        criticalHigh: this.count(exchanges, "CRITICAL_HIGH"),
        totalDeficitToTargetUsdt: this.sum(exchanges, "deficitToTargetUsdt"),
        totalSurplusAboveTargetUsdt: this.sum(exchanges, "surplusAboveTargetUsdt"),
        totalTransferableSurplusUsdt: this.sum(exchanges, "transferableSurplusUsdt"),
      },
      blockers,
      safety: {
        readOnly: true as const,
        paperAccountingMutated: false as const,
        balanceMutated: false as const,
        transferPlanned: false as const,
        transferSubmitted: false as const,
        withdrawalSubmitted: false as const,
        liveOrderSubmitted: false as const,
        reservedCapitalExcluded: true as const,
        neverDrainRuleApplied: true as const,
      },
    });
  }

  private assessExchange(
    exchange: NormalizedExchangeInventorySnapshot,
    target: ExchangeAllocationTarget,
    policy: CapitalAllocationPolicy,
    totalUsdt: number,
  ): ExchangeImbalanceAssessment {
    const currentCapitalUsdt = exchange.totals.authoritativeTotalValueUsdt!;
    const availableCapitalUsdt =
      exchange.totals.authoritativeAvailableAfterReservationsValueUsdt!;
    const rawAvailableUsdt = exchange.totals.authoritativeAvailableValueUsdt!;
    const targetCapitalUsdt = totalUsdt * target.targetPercent / 100;
    const minimumCapitalUsdt = totalUsdt * target.minimumPercent / 100;
    const maximumCapitalUsdt = totalUsdt * target.maximumPercent / 100;
    const imbalanceUsdt = currentCapitalUsdt - targetCapitalUsdt;
    const imbalancePercentOfTarget = targetCapitalUsdt > 0
      ? imbalanceUsdt / targetCapitalUsdt * 100
      : 0;
    const absoluteImbalance = Math.abs(imbalancePercentOfTarget);
    const state: ExchangeImbalanceState =
      currentCapitalUsdt < minimumCapitalUsdt ||
      imbalancePercentOfTarget <= -policy.criticalImbalancePercent
        ? "CRITICAL_LOW"
        : currentCapitalUsdt > maximumCapitalUsdt ||
          imbalancePercentOfTarget >= policy.criticalImbalancePercent
          ? "CRITICAL_HIGH"
          : imbalancePercentOfTarget <= -policy.softImbalancePercent
            ? "UNDERFUNDED"
            : imbalancePercentOfTarget >= policy.softImbalancePercent
              ? "OVERFUNDED"
              : "BALANCED";
    const reserveSafeTransferCapacityUsdt = Math.max(
      0,
      availableCapitalUsdt - minimumCapitalUsdt - target.emergencyReserveUsdt,
    );
    const surplusAboveTargetUsdt = Math.max(0, imbalanceUsdt);
    const transferableSurplusUsdt = Math.min(
      surplusAboveTargetUsdt,
      reserveSafeTransferCapacityUsdt,
    );
    const suggestedAction = state === "BALANCED"
      ? "NO_ACTION" as const
      : absoluteImbalance >= policy.hardImbalancePercent
        ? "HARD_REBALANCE_ANALYSIS" as const
        : state === "UNDERFUNDED" || state === "CRITICAL_LOW"
          ? "PREFER_NATURAL_REBALANCE" as const
          : "SOFT_REBALANCE_ANALYSIS" as const;

    return {
      exchange: exchange.exchange,
      displayName: exchange.displayName,
      state,
      currentCapitalUsdt: this.round(currentCapitalUsdt),
      availableCapitalUsdt: this.round(availableCapitalUsdt),
      targetCapitalUsdt: this.round(targetCapitalUsdt),
      minimumCapitalUsdt: this.round(minimumCapitalUsdt),
      maximumCapitalUsdt: this.round(maximumCapitalUsdt),
      emergencyReserveUsdt: this.round(target.emergencyReserveUsdt),
      imbalanceUsdt: this.round(imbalanceUsdt),
      imbalancePercentOfTarget: this.round(imbalancePercentOfTarget),
      deficitToTargetUsdt: this.round(Math.max(0, -imbalanceUsdt)),
      surplusAboveTargetUsdt: this.round(surplusAboveTargetUsdt),
      transferableSurplusUsdt: this.round(transferableSurplusUsdt),
      activeReservedCapitalUsdt: this.round(Math.max(
        0,
        rawAvailableUsdt - availableCapitalUsdt,
      )),
      suggestedAction,
      reasons: [
        `${exchange.displayName} is ${state} at ${this.round(imbalancePercentOfTarget)}% versus target.`,
        `Transferable surplus preserves minimum allocation, emergency reserve and active reservations.`,
      ],
    };
  }

  private validateInventory(
    inventory: NormalizedInventorySnapshot,
    now: number,
  ): string[] {
    const blockers: string[] = [];
    if (!Number.isSafeInteger(now) || now <= 0 || now < inventory.generatedAt) {
      blockers.push("Imbalance evaluation timestamp is invalid or predates inventory evidence.");
    }
    if (
      Number.isSafeInteger(now) &&
      now >= inventory.generatedAt &&
      now - inventory.generatedAt > inventory.maximumBalanceAgeMs
    ) {
      blockers.push(
        `Normalized inventory is ${now - inventory.generatedAt} ms old; maximum is ${inventory.maximumBalanceAgeMs} ms.`,
      );
    }
    if (inventory.state !== "READY_FOR_REBALANCING_ANALYSIS") {
      blockers.push(`Normalized inventory state is ${inventory.state}.`);
    }
    blockers.push(...inventory.blockers);
    if (inventory.totals.authoritativeTotalCapitalUsdt === null ||
      inventory.totals.authoritativeAvailableCapitalUsdt === null) {
      blockers.push("Authoritative total or available wallet capital is unavailable.");
    }
    for (const exchange of inventory.exchanges) {
      if (
        exchange.totals.authoritativeTotalValueUsdt === null ||
        exchange.totals.authoritativeAvailableValueUsdt === null ||
        exchange.totals.authoritativeAvailableAfterReservationsValueUsdt === null
      ) {
        blockers.push(
          `${exchange.displayName} has incomplete authoritative capital evidence.`,
        );
      }
    }
    if (inventory.transfers.inTransitCapitalUsdt !== null) {
      blockers.push("Unexpected transfer-capital evidence was supplied before a transfer ledger exists.");
    }
    return blockers;
  }

  private validatePolicy(
    policy: CapitalAllocationPolicy,
    exchanges: readonly NormalizedExchangeInventorySnapshot[],
  ): string[] {
    const blockers: string[] = [];
    if (!policy.policyId.trim() || !Number.isSafeInteger(policy.revision) || policy.revision <= 0) {
      blockers.push("Allocation policy identity or revision is invalid.");
    }
    if (!(policy.softImbalancePercent > 0 &&
      policy.hardImbalancePercent > policy.softImbalancePercent &&
      policy.criticalImbalancePercent > policy.hardImbalancePercent)) {
      blockers.push("Allocation imbalance bands must be positive and strictly increasing.");
    }
    const seen = new Set<string>();
    let targetTotal = 0;
    for (const target of policy.targets) {
      const exchange = target.exchange.trim().toLowerCase();
      if (!exchange || seen.has(exchange)) {
        blockers.push("Allocation policy contains a missing or duplicate exchange.");
        continue;
      }
      seen.add(exchange);
      targetTotal += target.targetPercent;
      if (!(target.minimumPercent >= 0 &&
        target.minimumPercent <= target.targetPercent &&
        target.targetPercent <= target.maximumPercent &&
        target.maximumPercent <= 100 &&
        Number.isFinite(target.emergencyReserveUsdt) &&
        target.emergencyReserveUsdt >= 0)) {
        blockers.push(`${exchange} allocation limits are invalid.`);
      }
    }
    if (Math.abs(targetTotal - 100) > 1e-9) {
      blockers.push("Allocation target percentages must total exactly 100%.");
    }
    for (const exchange of exchanges) {
      if (!seen.has(exchange.exchange)) {
        blockers.push(`${exchange.exchange} has no allocation target.`);
      }
    }
    if (seen.size !== exchanges.length) {
      blockers.push("Allocation policy and normalized exchange fleet do not match exactly.");
    }
    return [...new Set(blockers)];
  }

  private count(
    exchanges: readonly ExchangeImbalanceAssessment[],
    state: ExchangeImbalanceState,
  ): number {
    return exchanges.filter((exchange) => exchange.state === state).length;
  }

  private sum(
    exchanges: readonly ExchangeImbalanceAssessment[],
    field: "deficitToTargetUsdt" | "surplusAboveTargetUsdt" | "transferableSurplusUsdt",
  ): number {
    return this.round(exchanges.reduce((total, exchange) => total + exchange[field], 0));
  }

  private round(value: number): number {
    return Math.round((value + Number.EPSILON) * 100_000_000) / 100_000_000;
  }

  private freeze<T>(value: T): T {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const nested of Object.values(value)) this.freeze(nested);
    }
    return value;
  }
}

export const capitalAllocationAndImbalanceService =
  new CapitalAllocationAndImbalanceService();
