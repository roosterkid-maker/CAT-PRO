import type {
  ArbitrageOpportunity,
} from "../../../arbitrage/models/ArbitrageOpportunity";

import {
  isStrategyOneTinyLiveDynamicRoute,
} from "../../../arbitrage/execution/StrategyOneTinyLiveBasketPolicy";

import {
  STRATEGY_ONE_LIVE_DISPATCH_RESERVED_MAXIMUM_BOOK_AGE_MS,
  STRATEGY_ONE_LIVE_MAXIMUM_BOOK_SKEW_MS,
} from "../../../arbitrage/execution/StrategyOneLiveTimingPolicy";

import {
  getLiveOnlyRuntimePolicy,
  isLiveOnlyRuntimeEnabled,
} from "../../../config/LiveOnlyRuntimePolicy";

import {
  strategyOneFundedRouteService,
  type StrategyOneFundedRouteReport,
} from "../../../trading/execution/StrategyOneFundedRouteService";

import {
  strategyOneApiPermissionBoundaryService,
  type StrategyOneApiPermissionBoundaryReport,
  type StrategyOneApiPermissionExchange,
} from "../tiny-live/StrategyOneApiPermissionBoundaryService";

import {
  tinyLivePreflightService,
} from "../tiny-live/TinyLivePreflightService";

import type {
  TinyLivePreflightReport,
} from "../tiny-live/TinyLivePreflight";

import {
  strategyOneLiveOnlyStressGateService,
  type StrategyOneLiveOnlyStressReport,
} from "./StrategyOneLiveOnlyStressGateService";

import {
  opportunityCapitalStudyService,
  type OpportunityCapitalStudyDecision,
} from "../../../rebalancing/services/OpportunityCapitalStudyService";

export interface StrategyOneLiveOnlyPreflightReport {
  readonly schemaVersion: "1.0";
  readonly evaluatedAt: number;
  readonly opportunityId: string;
  readonly market: string;
  readonly buyExchange: string;
  readonly sellExchange: string;
  readonly approved: boolean;
  readonly requestedCapitalPerLegInr: number;
  readonly maximumCapitalPerLegInr: number;
  readonly opportunityAgeMs: number;
  readonly buyQuoteAgeMs: number;
  readonly sellQuoteAgeMs: number;
  readonly quoteSkewMs: number;
  readonly capitalStudy: OpportunityCapitalStudyDecision;
  readonly permissionBoundary: StrategyOneApiPermissionBoundaryReport;
  readonly funding: StrategyOneFundedRouteReport;
  readonly stress: StrategyOneLiveOnlyStressReport | null;
  readonly core: TinyLivePreflightReport | null;
  readonly blockers: readonly string[];
  readonly safety: {
    readonly paperHistoryRequired: false;
    readonly exactCurrentBooksRequired: true;
    readonly authenticatedBalancesRequired: true;
    readonly fullDepthRequired: true;
    readonly finalLastLookRequired: true;
    readonly authorityGranted: false;
    readonly orderSubmitted: false;
  };
}

/**
 * Complete synchronous action-time preflight for the LIVE-only runtime.
 * It reads current execution evidence only and never imports PAPER history,
 * PAPER settlement, Shadow or Tiny-LIVE arm/lease stores.
 */
export class StrategyOneLiveOnlyPreflightService {
  evaluate(
    opportunity:
      ArbitrageOpportunity,
    now =
      Date.now(),
  ): StrategyOneLiveOnlyPreflightReport {
    if (
      !Number.isSafeInteger(now) ||
      now <= 0
    ) {
      throw new Error(
        "LIVE-only preflight time must be a positive safe integer.",
      );
    }

    const policy =
      getLiveOnlyRuntimePolicy();
    const market =
      opportunity.pair.market
        .trim()
        .toUpperCase();
    const buyExchange =
      opportunity.pair.buy.exchange
        .trim()
        .toLowerCase();
    const sellExchange =
      opportunity.pair.sell.exchange
        .trim()
        .toLowerCase();
    const opportunityAgeMs =
      now - opportunity.timestamp;
    const buyQuoteAgeMs =
      now - opportunity.pair.buy.timestamp;
    const sellQuoteAgeMs =
      now - opportunity.pair.sell.timestamp;
    const quoteSkewMs =
      Math.abs(
        opportunity.pair.buy.timestamp -
        opportunity.pair.sell.timestamp,
      );
    const blockers:
      string[] =
      [];
    const capitalStudy =
      opportunityCapitalStudyService
        .getDecision(
          opportunity,
          now,
        );

    if (
      !isLiveOnlyRuntimeEnabled()
    ) {
      blockers.push(
        "The exact LIVE-only process confirmation and execution mode are not enabled.",
      );
    }

    if (
      opportunity.decision !==
        "EXECUTE"
    ) {
      blockers.push(
        `Current opportunity decision is ${opportunity.decision}, not EXECUTE.`,
      );
    }

    if (
      !isStrategyOneTinyLiveDynamicRoute({
        market,
        buyExchange,
        sellExchange,
      })
    ) {
      blockers.push(
        "Route is outside the audited USDT SPOT execution venue pool.",
      );
    }

    if (
      opportunity.usedLastPriceFallback
    ) {
      blockers.push(
        "Fallback or last-price evidence cannot authorize LIVE execution.",
      );
    }

    if (
      !opportunity.quotesAreFresh
    ) {
      blockers.push(
        "Opportunity quotes are not marked fresh by the authoritative engine.",
      );
    }

    if (
      !Number.isFinite(opportunity.netProfitPercent) ||
      opportunity.netProfitPercent <
        capitalStudy.effectiveMinimumCurrentNetProfitPercent
    ) {
      blockers.push(
        `Current fee-adjusted net must be at least ${capitalStudy.effectiveMinimumCurrentNetProfitPercent.toFixed(2)}% for this studied route.`,
      );
    }

    if (!capitalStudy.executionQualified) {
      blockers.push(
        `CAPITAL_STUDY: Exact route has ${capitalStudy.currentConsecutiveSamples}/${capitalStudy.requiredCurrentSamples} consecutive independent safe samples.`,
      );
    }

    if (
      !Number.isSafeInteger(opportunityAgeMs) ||
      opportunityAgeMs < 0 ||
      opportunityAgeMs >
        policy.maximumOpportunityAgeMs
    ) {
      blockers.push(
        `Opportunity age must be 0-${policy.maximumOpportunityAgeMs} ms.`,
      );
    }

    this.requireActionTimeAge(
      "BUY",
      buyQuoteAgeMs,
      blockers,
    );
    this.requireActionTimeAge(
      "SELL",
      sellQuoteAgeMs,
      blockers,
    );

    if (
      !Number.isSafeInteger(quoteSkewMs) ||
      quoteSkewMs >
        STRATEGY_ONE_LIVE_MAXIMUM_BOOK_SKEW_MS
    ) {
      blockers.push(
        `BUY/SELL quote skew exceeds ${STRATEGY_ONE_LIVE_MAXIMUM_BOOK_SKEW_MS} ms.`,
      );
    }

    const permissionBoundary =
      strategyOneApiPermissionBoundaryService
        .getReportForVenues(
          [
            buyExchange,
            sellExchange,
          ] as readonly StrategyOneApiPermissionExchange[],
          now,
        );

    if (
      !permissionBoundary.ready
    ) {
      blockers.push(
        ...permissionBoundary.blockers.map(
          (blocker) =>
            `API_PERMISSION: ${blocker}`,
        ),
      );
    }

    const funding =
      strategyOneFundedRouteService
        .evaluate({
          opportunity,
          requestedCapitalInr:
            policy.preferredCapitalPerLegInr,
          maximumCapitalPerLegInr:
            policy.maximumCapitalPerLegInr,
          allowMinimumOrderRoundUpWithinHardCap:
            true,
          enforceRequestedCapitalFloorWithinHardCap:
            true,
          fundingBoundary:
            "AUTHENTICATED_LIVE_READINESS",
          now,
        });
    const fundingPassed =
      this.isFundingSafe(
        funding,
        policy.minimumCapitalPerLegInr,
        policy.maximumCapitalPerLegInr,
      );

    if (
      !fundingPassed
    ) {
      blockers.push(
        ...(
          funding.blockers.length
            ? funding.blockers.map(
                (blocker) =>
                  `FUNDING: ${blocker}`,
              )
            : [
                "FUNDING: Exact executable capital, balances, rules or quantity normalization did not remain inside ₹600-₹1,000.",
              ]
        ),
      );
    }

    const stress =
      fundingPassed &&
      funding.executableQuantity !==
        null
        ? strategyOneLiveOnlyStressGateService
            .evaluate({
              opportunity,
              quantity:
                funding.executableQuantity,
              minimumNetProfitPercent:
                policy.minimumPostStressNetProfitPercent,
              now,
            })
        : null;

    if (
      stress?.status !==
        "PASSED"
    ) {
      blockers.push(
        ...(
          stress?.reasons.length
            ? stress.reasons.map(
                (reason) =>
                  `STRESS: ${reason}`,
              )
            : [
                "STRESS: Exact post-stress economics are unavailable.",
              ]
        ),
      );
    }

    const core =
      fundingPassed &&
      funding.buyFunding.asset &&
      funding.sellFunding.asset &&
      funding.buyFunding.requiredBalance !==
        null &&
      funding.sellFunding.requiredBalance !==
        null
        ? tinyLivePreflightService
            .evaluate({
              requestedCapital:
                policy.preferredCapitalPerLegInr,
              market,
              buyExchange,
              sellExchange,
              confirmationToken:
                "RUN_TINY_LIVE_PREFLIGHT_ONLY",
              balanceRequirements: [
                {
                  exchange:
                    funding.buyFunding.exchange,
                  asset:
                    funding.buyFunding.asset,
                  requiredAmount:
                    funding.buyFunding.requiredBalance,
                  maximumAgeMs:
                    funding.buyFunding.maximumSnapshotAgeMs,
                },
                {
                  exchange:
                    funding.sellFunding.exchange,
                  asset:
                    funding.sellFunding.asset,
                  requiredAmount:
                    funding.sellFunding.requiredBalance,
                  maximumAgeMs:
                    funding.sellFunding.maximumSnapshotAgeMs,
                },
              ],
            })
        : null;

    if (
      core?.approved !==
        true
    ) {
      blockers.push(
        ...(
          core?.blockers.length
            ? core.blockers.map(
                (blocker) =>
                  `CORE: ${blocker}`,
              )
            : [
                "CORE: LIVE account, recovery, alerts, credentials, adapters, clocks or balances are not ready.",
              ]
        ),
      );
    }

    const uniqueBlockers =
      Object.freeze([
        ...new Set(blockers),
      ]);

    return Object.freeze({
      schemaVersion:
        "1.0" as const,
      evaluatedAt:
        now,
      opportunityId:
        opportunity.id,
      market,
      buyExchange,
      sellExchange,
      approved:
        uniqueBlockers.length === 0,
      requestedCapitalPerLegInr:
        policy.preferredCapitalPerLegInr,
      maximumCapitalPerLegInr:
        policy.maximumCapitalPerLegInr,
      opportunityAgeMs,
      buyQuoteAgeMs,
      sellQuoteAgeMs,
      quoteSkewMs,
      capitalStudy,
      permissionBoundary,
      funding,
      stress,
      core,
      blockers:
        uniqueBlockers,
      safety:
        Object.freeze({
          paperHistoryRequired:
            false as const,
          exactCurrentBooksRequired:
            true as const,
          authenticatedBalancesRequired:
            true as const,
          fullDepthRequired:
            true as const,
          finalLastLookRequired:
            true as const,
          authorityGranted:
            false as const,
          orderSubmitted:
            false as const,
        }),
    });
  }

  private requireActionTimeAge(
    side: "BUY" | "SELL",
    ageMs: number,
    blockers: string[],
  ): void {
    if (
      !Number.isSafeInteger(ageMs) ||
      ageMs < 0 ||
      ageMs >
        STRATEGY_ONE_LIVE_DISPATCH_RESERVED_MAXIMUM_BOOK_AGE_MS
    ) {
      blockers.push(
        `${side} quote age must be 0-${STRATEGY_ONE_LIVE_DISPATCH_RESERVED_MAXIMUM_BOOK_AGE_MS} ms (current=${ageMs}).`,
      );
    }
  }

  private isFundingSafe(
    funding: StrategyOneFundedRouteReport,
    minimumCapitalInr: number,
    maximumCapitalInr: number,
  ): boolean {
    const normalization =
      funding.quantityNormalization;
    const estimatedCapital =
      funding.estimatedExecutableCapitalInr;
    const estimatedBuyRequirement =
      funding.estimatedBuyRequirementInr;

    return funding.state !==
        "BLOCKED" &&
      funding.fundingBoundary ===
        "AUTHENTICATED_LIVE_READINESS" &&
      funding.authenticatedBalancesRequired &&
      !funding.isolatedPaperCapital &&
      !funding.staleBalanceAllowed &&
      funding.maximumCapitalPerLegInr ===
        maximumCapitalInr &&
      funding.executableQuantity !==
        null &&
      Number.isFinite(
        funding.executableQuantity,
      ) &&
      funding.executableQuantity > 0 &&
      estimatedCapital !==
        null &&
      Number.isFinite(
        estimatedCapital,
      ) &&
      estimatedCapital >=
        minimumCapitalInr - 0.01 &&
      estimatedCapital <=
        maximumCapitalInr + 0.01 &&
      estimatedBuyRequirement !==
        undefined &&
      estimatedBuyRequirement !==
        null &&
      Number.isFinite(
        estimatedBuyRequirement,
      ) &&
      estimatedBuyRequirement <=
        maximumCapitalInr + 0.01 &&
      funding.buyFunding.sufficient &&
      funding.sellFunding.sufficient &&
      normalization !==
        null &&
      normalization.state !==
        "BLOCKED" &&
      normalization.liveOrderSafe &&
      normalization.incrementEvidenceComplete &&
      !normalization.paperOnlyFallbackUsed &&
      normalization.blockers.length ===
        0;
  }
}

export const strategyOneLiveOnlyPreflightService =
  new StrategyOneLiveOnlyPreflightService();
