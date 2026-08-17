import type {
  CrossExchangeMarketMakingConfiguration,
} from "./CrossExchangeMarketMakingConfiguration";

import type {
  CrossExchangeMarketMakingPricingSnapshot,
} from "./CrossExchangeMarketMakingPriceEngine";

import {
  crossExchangeMarketMakingInventoryRouteSelector,
} from "./CrossExchangeMarketMakingInventoryRouteSelector";

import type {
  CrossExchangeMarketMakingInventoryRequirement,
  CrossExchangeMarketMakingInventoryRouteSelector,
} from "./CrossExchangeMarketMakingInventoryRouteSelector";

import type {
  CrossExchangeMarketMakingSafePriceEvidence,
} from "../models/StrategySignal";

export type CrossExchangeMarketMakingRouteSelectionState =
  | "SELECTED"
  | "STABLE_CANDIDATE"
  | "QUALIFYING"
  | "COOLDOWN"
  | "BLOCKED";

export type CrossExchangeMarketMakingRouteStabilityState =
  | "ACTIVE"
  | "STABLE"
  | "QUALIFYING"
  | "COOLDOWN"
  | "RESET";

export interface CrossExchangeMarketMakingVenueRouteAssessment {
  readonly version: "79.0";
  readonly id: string;
  readonly generatedAt: number;
  readonly candidateKey: string;
  readonly pairPriority: number;
  readonly rank: number | null;
  readonly market: string;
  readonly side: "BID" | "ASK";
  readonly makerExchange: string;
  readonly hedgeExchange: string;
  readonly priceState: "QUALIFIED" | "BLOCKED";
  readonly inventoryState: "FEASIBLE" | "BLOCKED" | "NOT_EVALUATED";
  readonly selectionState: CrossExchangeMarketMakingRouteSelectionState;
  readonly stabilityState: CrossExchangeMarketMakingRouteStabilityState;
  readonly consecutivePasses: number;
  readonly minimumConsecutivePasses: number;
  readonly qualifiedSince: number | null;
  readonly dwellAgeMs: number;
  readonly minimumDwellMs: number;
  readonly modeledRetainedEdgePercent: number | null;
  readonly inventoryRequirements: readonly CrossExchangeMarketMakingInventoryRequirement[];
  readonly blockers: readonly string[];
}

export interface CrossExchangeMarketMakingVenueRouteTransition {
  readonly id: string;
  readonly at: number;
  readonly type: "ACTIVATED" | "LOST";
  readonly fromCandidateKey: string | null;
  readonly toCandidateKey: string | null;
  readonly reason: "INITIAL_STABLE_ROUTE" | "STABLE_FAILOVER_ROUTE" | "ACTIVE_ROUTE_NO_LONGER_FEASIBLE";
}

export interface CrossExchangeMarketMakingVenueRoutingReport {
  readonly version: "79.0";
  readonly generatedAt: number;
  readonly mode: "STABLE_OPERATOR_APPROVED_XEMM_FAILOVER";
  readonly summary: {
    readonly operatorApprovedPairs: number;
    readonly markets: number;
    readonly directionsEvaluated: number;
    readonly priceQualified: number;
    readonly inventoryQualified: number;
    readonly qualifying: number;
    readonly stable: number;
    readonly selected: number;
    readonly selectedCandidateKey: string | null;
    readonly activeSince: number | null;
    readonly lastTransitionAt: number | null;
    readonly cooldownUntil: number | null;
  };
  readonly candidates: readonly CrossExchangeMarketMakingVenueRouteAssessment[];
  readonly recentTransitions: readonly CrossExchangeMarketMakingVenueRouteTransition[];
  readonly safety: CrossExchangeMarketMakingVenueRoutingSafety;
}

export interface CrossExchangeMarketMakingVenueRoutingSafety {
  readonly operatorApprovedPairsOnly: true;
  readonly deterministicRanking: true;
  readonly priceQualificationRequired: true;
  readonly freshInventoryRequired: true;
  readonly consecutiveQualificationRequired: true;
  readonly minimumDwellRequired: true;
  readonly stickyWhileHealthy: true;
  readonly routeLossFailsClosed: true;
  readonly cooldownBypassAllowed: false;
  readonly inferredVenueAllowed: false;
  readonly inferredBalanceAllowed: false;
  readonly balanceMutationPerformed: false;
  readonly transferPerformed: false;
  readonly paperExecutionTriggered: false;
  readonly liveExecutionAllowed: false;
  readonly orderSubmissionAllowed: false;
}

export interface CrossExchangeMarketMakingVenueRouteSelection {
  readonly report: CrossExchangeMarketMakingVenueRoutingReport;
  readonly selected: {
    readonly evidence: CrossExchangeMarketMakingSafePriceEvidence;
    readonly expiresAt: number;
  } | null;
}

interface StabilityEvidence {
  readonly consecutivePasses: number;
  readonly firstQualifiedAt: number;
  readonly lastQualifiedAt: number;
  readonly lastEvaluationSequence: number;
}

interface RawCandidate {
  readonly sourceEvidence: CrossExchangeMarketMakingSafePriceEvidence | null;
  readonly sourceExpiresAt: number | null;
  readonly assessment: Omit<CrossExchangeMarketMakingVenueRouteAssessment,
    "rank" | "selectionState" | "stabilityState" | "consecutivePasses" |
    "qualifiedSince" | "dwellAgeMs" | "blockers"> & {readonly blockers: readonly string[]};
}

const SAFETY: CrossExchangeMarketMakingVenueRoutingSafety = Object.freeze({
  operatorApprovedPairsOnly: true,
  deterministicRanking: true,
  priceQualificationRequired: true,
  freshInventoryRequired: true,
  consecutiveQualificationRequired: true,
  minimumDwellRequired: true,
  stickyWhileHealthy: true,
  routeLossFailsClosed: true,
  cooldownBypassAllowed: false,
  inferredVenueAllowed: false,
  inferredBalanceAllowed: false,
  balanceMutationPerformed: false,
  transferPerformed: false,
  paperExecutionTriggered: false,
  liveExecutionAllowed: false,
  orderSubmissionAllowed: false,
});

/**
 * Selects at most one operator-approved route. A candidate must remain price-
 * and inventory-qualified for the configured streak and dwell before it can
 * become active. A healthy active route is sticky; route loss is fail-closed
 * for the current evaluation and failover observes an explicit cooldown.
 */
export class CrossExchangeMarketMakingVenueRouteSelector {
  private latestReport: CrossExchangeMarketMakingVenueRoutingReport | null = null;
  private readonly stabilityEvidence = new Map<string, StabilityEvidence>();
  private evaluationSequence = 0;
  private activeCandidateKey: string | null = null;
  private activeSince: number | null = null;
  private lastTransitionAt: number | null = null;
  private cooldownUntil: number | null = null;
  private previousCandidateKeyForActivation: string | null = null;
  private readonly transitions: CrossExchangeMarketMakingVenueRouteTransition[] = [];

  constructor(
    private readonly inventorySelector: CrossExchangeMarketMakingInventoryRouteSelector =
      crossExchangeMarketMakingInventoryRouteSelector,
  ) {}

  select(
    snapshots: readonly CrossExchangeMarketMakingPricingSnapshot[],
    configuration: CrossExchangeMarketMakingConfiguration,
    now = Date.now(),
  ): CrossExchangeMarketMakingVenueRouteSelection {
    if (!Number.isSafeInteger(now) || now <= 0) {
      throw new Error("XEMM venue-route selection timestamp must be a positive integer.");
    }

    this.evaluationSequence += 1;
    const evaluationSequence = this.evaluationSequence;
    const priorityByPair = new Map(configuration.venuePairs.map((pair) => [pair.key, pair.priority]));
    const raw: RawCandidate[] = snapshots.flatMap((snapshot) => snapshot.results.map((result) => {
      const makerExchange = snapshot.makerExchange?.trim().toLowerCase() ?? "unknown";
      const hedgeExchange = snapshot.hedgeExchange?.trim().toLowerCase() ?? "unknown";
      const pairKey = `${makerExchange}>${hedgeExchange}`;
      const pairPriority = priorityByPair.get(pairKey) ?? Number.MAX_SAFE_INTEGER;
      const candidateKey = `${pairKey}:${snapshot.market}:${result.side}`;
      const priceQualified = result.status === "ACCEPTED" && result.evidence !== null && result.expiresAt !== null;
      let inventoryState: CrossExchangeMarketMakingVenueRouteAssessment["inventoryState"] = "NOT_EVALUATED";
      let inventoryRequirements: readonly CrossExchangeMarketMakingInventoryRequirement[] = [];
      const blockers: string[] = [];

      if (!priorityByPair.has(pairKey)) blockers.push(`VENUE_PAIR_NOT_OPERATOR_APPROVED:${pairKey}`);
      if (!priceQualified) blockers.push(...result.blockers.map((blocker) => `PRICING:${blocker}`));

      if (priceQualified && priorityByPair.has(pairKey)) {
        try {
          const inventory = this.inventorySelector.evaluate(result.evidence!, now);
          inventoryState = inventory.state;
          inventoryRequirements = inventory.requirements;
          blockers.push(...inventory.blockers);
        } catch (error: unknown) {
          inventoryState = "BLOCKED";
          blockers.push(`INVENTORY_EVALUATION_ERROR:${error instanceof Error ? error.message : "UNKNOWN"}`);
        }
      }

      return {
        sourceEvidence: priceQualified ? result.evidence : null,
        sourceExpiresAt: priceQualified ? result.expiresAt : null,
        assessment: {
          version: "79.0" as const,
          id: `xemm-venue-route:${now}:${candidateKey}`,
          generatedAt: now,
          candidateKey,
          pairPriority,
          market: snapshot.market,
          side: result.side,
          makerExchange,
          hedgeExchange,
          priceState: priceQualified ? "QUALIFIED" as const : "BLOCKED" as const,
          inventoryState,
          minimumConsecutivePasses: configuration.routeStability.minimumConsecutivePasses,
          minimumDwellMs: configuration.routeStability.minimumDwellMs,
          modeledRetainedEdgePercent: result.evidence?.modeledRetainedEdgePercent ?? null,
          inventoryRequirements,
          blockers: [...new Set(blockers)],
        },
      };
    }));

    const feasible = raw.filter((item) => item.sourceEvidence !== null && item.sourceExpiresAt !== null &&
      item.assessment.inventoryState === "FEASIBLE" && item.assessment.blockers.length === 0)
      .sort(compareCandidates);
    const feasibleKeys = new Set(feasible.map((item) => item.assessment.candidateKey));

    for (const item of raw) {
      const key = item.assessment.candidateKey;
      if (!feasibleKeys.has(key)) {
        this.stabilityEvidence.delete(key);
        continue;
      }
      const previous = this.stabilityEvidence.get(key);
      const consecutive = previous?.lastEvaluationSequence === evaluationSequence - 1 && previous.lastQualifiedAt <= now;
      this.stabilityEvidence.set(key, {
        consecutivePasses: consecutive ? previous.consecutivePasses + 1 : 1,
        firstQualifiedAt: consecutive ? previous.firstQualifiedAt : now,
        lastQualifiedAt: now,
        lastEvaluationSequence: evaluationSequence,
      });
    }

    const isStable = (key: string): boolean => {
      const evidence = this.stabilityEvidence.get(key);
      return Boolean(evidence &&
        evidence.consecutivePasses >= configuration.routeStability.minimumConsecutivePasses &&
        now - evidence.firstQualifiedAt >= configuration.routeStability.minimumDwellMs);
    };

    let routeLostThisEvaluation = false;
    if (this.activeCandidateKey !== null && !feasibleKeys.has(this.activeCandidateKey)) {
      const lostCandidateKey = this.activeCandidateKey;
      this.recordTransition(now, "LOST", lostCandidateKey, null, "ACTIVE_ROUTE_NO_LONGER_FEASIBLE");
      this.previousCandidateKeyForActivation = lostCandidateKey;
      this.activeCandidateKey = null;
      this.activeSince = null;
      this.cooldownUntil = now + configuration.routeStability.failoverCooldownMs;
      routeLostThisEvaluation = true;
    }

    const cooldownActive = this.cooldownUntil !== null && now < this.cooldownUntil;
    if (this.activeCandidateKey === null && !routeLostThisEvaluation && !cooldownActive) {
      const next = feasible.find((item) => isStable(item.assessment.candidateKey));
      if (next) {
        const nextKey = next.assessment.candidateKey;
        const reason = this.previousCandidateKeyForActivation === null
          ? "INITIAL_STABLE_ROUTE" as const
          : "STABLE_FAILOVER_ROUTE" as const;
        this.recordTransition(now, "ACTIVATED", this.previousCandidateKeyForActivation, nextKey, reason);
        this.activeCandidateKey = nextKey;
        this.activeSince = now;
        this.cooldownUntil = null;
        this.previousCandidateKeyForActivation = null;
      }
    }

    const rankByKey = new Map(feasible.map((item, index) => [item.assessment.candidateKey, index + 1]));
    const selectedCandidateKey = this.activeCandidateKey;
    const candidates = raw.map((item) => {
      const key = item.assessment.candidateKey;
      const rank = rankByKey.get(key) ?? null;
      const evidence = this.stabilityEvidence.get(key);
      const dwellAgeMs = evidence ? Math.max(0, now - evidence.firstQualifiedAt) : 0;
      const stable = rank !== null && isStable(key);
      const currentCooldown = this.cooldownUntil !== null && now < this.cooldownUntil;
      const failoverHold = routeLostThisEvaluation || currentCooldown;
      const selectionState: CrossExchangeMarketMakingRouteSelectionState = rank === null
        ? "BLOCKED"
        : key === selectedCandidateKey
          ? "SELECTED"
          : !stable
            ? "QUALIFYING"
            : failoverHold
              ? "COOLDOWN"
              : "STABLE_CANDIDATE";
      const stabilityState: CrossExchangeMarketMakingRouteStabilityState = rank === null
        ? "RESET"
        : key === selectedCandidateKey
          ? "ACTIVE"
          : !stable
            ? "QUALIFYING"
            : failoverHold
              ? "COOLDOWN"
              : "STABLE";
      const blockers = [...item.assessment.blockers];
      if (rank !== null && !stable) {
        if ((evidence?.consecutivePasses ?? 0) < configuration.routeStability.minimumConsecutivePasses) {
          blockers.push(`ROUTE_STABILITY_CONSECUTIVE_PASSES_PENDING:${evidence?.consecutivePasses ?? 0}/${configuration.routeStability.minimumConsecutivePasses}`);
        }
        if (dwellAgeMs < configuration.routeStability.minimumDwellMs) {
          blockers.push(`ROUTE_STABILITY_DWELL_PENDING:${dwellAgeMs}/${configuration.routeStability.minimumDwellMs}`);
        }
      } else if (rank !== null && failoverHold) {
        blockers.push(routeLostThisEvaluation
          ? "ROUTE_LOSS_FAIL_CLOSED_CURRENT_EVALUATION"
          : `ROUTE_FAILOVER_COOLDOWN_ACTIVE_UNTIL:${this.cooldownUntil}`);
      } else if (rank !== null && selectedCandidateKey !== null && key !== selectedCandidateKey) {
        blockers.push(`ACTIVE_ROUTE_STICKY:${selectedCandidateKey}`);
      }

      return freeze({
        ...item.assessment,
        rank,
        selectionState,
        stabilityState,
        consecutivePasses: evidence?.consecutivePasses ?? 0,
        qualifiedSince: evidence?.firstQualifiedAt ?? null,
        dwellAgeMs,
        blockers: [...new Set(blockers)],
      });
    }).sort((first, second) => first.pairPriority - second.pairPriority ||
      first.market.localeCompare(second.market) || first.side.localeCompare(second.side));

    const report = freeze({
      version: "79.0" as const,
      generatedAt: now,
      mode: "STABLE_OPERATOR_APPROVED_XEMM_FAILOVER" as const,
      summary: {
        operatorApprovedPairs: configuration.venuePairs.length,
        markets: configuration.marketAllowlist.length,
        directionsEvaluated: candidates.length,
        priceQualified: candidates.filter((item) => item.priceState === "QUALIFIED").length,
        inventoryQualified: candidates.filter((item) => item.inventoryState === "FEASIBLE").length,
        qualifying: candidates.filter((item) => item.stabilityState === "QUALIFYING").length,
        stable: candidates.filter((item) => item.stabilityState === "STABLE" || item.stabilityState === "ACTIVE").length,
        selected: selectedCandidateKey === null ? 0 : 1,
        selectedCandidateKey,
        activeSince: this.activeSince,
        lastTransitionAt: this.lastTransitionAt,
        cooldownUntil: this.cooldownUntil !== null && now < this.cooldownUntil ? this.cooldownUntil : null,
      },
      candidates,
      recentTransitions: this.transitions.slice(-25),
      safety: SAFETY,
    });
    this.latestReport = report;

    const selected = selectedCandidateKey === null
      ? undefined
      : feasible.find((item) => item.assessment.candidateKey === selectedCandidateKey);
    return clone({
      report,
      selected: selected?.sourceEvidence && selected.sourceExpiresAt !== null
        ? {evidence: selected.sourceEvidence, expiresAt: selected.sourceExpiresAt}
        : null,
    });
  }

  getSnapshot(): CrossExchangeMarketMakingVenueRoutingReport | null {
    return this.latestReport ? clone(this.latestReport) : null;
  }

  private recordTransition(
    at: number,
    type: CrossExchangeMarketMakingVenueRouteTransition["type"],
    fromCandidateKey: string | null,
    toCandidateKey: string | null,
    reason: CrossExchangeMarketMakingVenueRouteTransition["reason"],
  ): void {
    this.lastTransitionAt = at;
    this.transitions.push(freeze({
      id: `xemm-route-transition:${at}:${type}:${fromCandidateKey ?? "none"}:${toCandidateKey ?? "none"}`,
      at,
      type,
      fromCandidateKey,
      toCandidateKey,
      reason,
    }));
    if (this.transitions.length > 25) this.transitions.splice(0, this.transitions.length - 25);
  }
}

function compareCandidates(first: RawCandidate, second: RawCandidate): number {
  return first.assessment.pairPriority - second.assessment.pairPriority ||
    (second.assessment.modeledRetainedEdgePercent ?? Number.NEGATIVE_INFINITY) -
      (first.assessment.modeledRetainedEdgePercent ?? Number.NEGATIVE_INFINITY) ||
    first.assessment.market.localeCompare(second.assessment.market) ||
    first.assessment.side.localeCompare(second.assessment.side) ||
    first.assessment.candidateKey.localeCompare(second.assessment.candidateKey);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function freeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freeze(nested);
  return Object.freeze(value);
}

export const crossExchangeMarketMakingVenueRouteSelector =
  new CrossExchangeMarketMakingVenueRouteSelector();
