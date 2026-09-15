import {
  sharedRecoveryIntentService,
  type SharedRecoveryIntentService,
} from "./SharedRecoveryIntentService";

import {
  sharedRecoveryResolutionService,
  type SharedRecoveryResolutionService,
} from "./SharedRecoveryResolutionService";

export interface SharedRecoveryHaltEntry {
  readonly intentId: string;
  readonly sourceStrategyId: string;
  readonly asset: string;
  readonly venue: string;
  readonly residualDirection: "LONG" | "SHORT";
  readonly quantity: number;
  readonly stagedAt: number;
}

export interface SharedRecoveryHaltReport {
  readonly schemaVersion: "1.0";
  readonly generatedAt: number;
  readonly haltedStrategyIds: readonly string[];
  readonly unresolved: readonly SharedRecoveryHaltEntry[];
  readonly safety: {
    readonly newLiveDispatchBlockedForHaltedStrategies: true;
    readonly inFlightDispatchesStillResumed: true;
  };
}

/**
 * Computes, per strategy, whether ANY residual exposure staged into
 * SharedRecoveryIntentService remains unresolved - i.e. whether it is safe
 * to start a BRAND NEW central LIVE dispatch for that strategy.
 *
 * This is the piece the Central LIVE dispatcher never had (unlike
 * StrategyOneLiveOnlyRunnerService's haltedReason/
 * releaseAuthoritativelyResolvedRecoveryHalt): a residual staged by
 * SequentialThreeLegLiveLifecycleHandler.stageResiduals() previously left
 * nothing stopping the dispatcher from leasing and starting the next queued
 * plan for the same strategy immediately after. Intentionally does NOT
 * block resuming an already-in-flight dispatch (a stuck operation must
 * still be allowed to finish/reconcile) - only new leases are gated, by the
 * dispatcher passing haltedStrategyIds into
 * CentralLiveExecutionQueueService.leaseNext()'s exclusion set.
 */
export class SharedRecoveryHaltGateService {
  constructor(
    private readonly intents: Pick<SharedRecoveryIntentService, "getReport"> = sharedRecoveryIntentService,
    private readonly resolutions: Pick<SharedRecoveryResolutionService, "isIntentResolved"> = sharedRecoveryResolutionService,
  ) {}

  getReport(now = Date.now()): SharedRecoveryHaltReport {
    const intentReport = this.intents.getReport(now);

    // Deliberately NOT filtered to effectiveStatus === "STAGED": an
    // intent's TTL bounds how long its evidence is considered fresh for
    // display, not whether the underlying residual exposure it recorded
    // has gone away. A real coin holding does not disappear because a
    // report's freshness window lapsed - only an explicit resolution
    // (proving the exposure is safely accounted for) may clear a halt.
    const unresolved = intentReport.intents
      .filter((intent) =>
        !this.resolutions.isIntentResolved(intent.id))
      .map((intent): SharedRecoveryHaltEntry => ({
        intentId: intent.id,
        sourceStrategyId: intent.sourceStrategyId,
        asset: intent.asset,
        venue: intent.leg.venue,
        residualDirection: intent.residualDirection,
        quantity: intent.leg.quantity,
        stagedAt: intent.stagedAt,
      }))
      .sort((first, second) => first.stagedAt - second.stagedAt);

    const haltedStrategyIds = [
      ...new Set(unresolved.map((entry) => entry.sourceStrategyId)),
    ].sort();

    return {
      schemaVersion: "1.0",
      generatedAt: now,
      haltedStrategyIds,
      unresolved,
      safety: {
        newLiveDispatchBlockedForHaltedStrategies: true,
        inFlightDispatchesStillResumed: true,
      },
    };
  }

  getHaltedStrategyIds(now = Date.now()): ReadonlySet<string> {
    return new Set(this.getReport(now).haltedStrategyIds);
  }

  isStrategyHalted(strategyId: string, now = Date.now()): boolean {
    return this.getHaltedStrategyIds(now).has(strategyId.trim());
  }
}

export const sharedRecoveryHaltGateService =
  new SharedRecoveryHaltGateService();
