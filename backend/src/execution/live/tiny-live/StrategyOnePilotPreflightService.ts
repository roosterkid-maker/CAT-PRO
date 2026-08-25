import type {
  ArbitrageOpportunity,
} from "../../../arbitrage/models/ArbitrageOpportunity";

import {
  opportunityService,
} from "../../../arbitrage/services/OpportunityService";

import {
  assessStrategyOnePilotDispatchReservedFreshness,
  isExactStrategyOnePilotRoute,
  STRATEGY_ONE_PILOT_DISPATCH_RESERVED_MAXIMUM_BOOK_AGE_MS,
  STRATEGY_ONE_PILOT_MAXIMUM_BOOK_AGE_MS,
  STRATEGY_ONE_PILOT_MAXIMUM_BOOK_SKEW_MS,
} from "../../../arbitrage/execution/StrategyOnePilotEquivalentPaperEvidenceService";

import {
  strategyOneTimingCalibrationService,
  type StrategyOneTimingHeadroomReview,
} from "../../../arbitrage/execution/StrategyOneTimingCalibrationService";

import {
  strategyOneCapitalPlacementService,
  type StrategyOneCapitalPlacementReport,
  type StrategyOneCapitalPlacementRouteRank,
} from "../../../strategies/services/StrategyOneCapitalPlacementService";

import {
  paperTradeStore,
} from "../../../trading/services/PaperTradeStore";

import {
  strategyOneFundedRouteService,
  type StrategyOneFundedRouteReport,
} from "../../../trading/execution/StrategyOneFundedRouteService";

import {
  strategyOneExecutionPolicyService,
} from "../../../trading/policy/StrategyOneExecutionPolicyService";
import {
  STRATEGY_ONE_TINY_LIVE_ROUTE_POOL_POLICY,
} from "../../../arbitrage/execution/StrategyOneTinyLiveBasketPolicy";

import {
  strategyOnePaperStressGate,
  type StrategyOnePaperStressGateReport,
} from "../../../trading/execution/AutomatedPaperTradingService";

import type {
  TinyLivePreflightReport,
  TinyLivePreflightRequest,
} from "./TinyLivePreflight";

import {
  tinyLivePreflightService,
} from "./TinyLivePreflightService";

import {
  strategyOneApiPermissionBoundaryService,
  type StrategyOneApiPermissionExchange,
  type StrategyOneApiPermissionBoundaryReport,
} from "./StrategyOneApiPermissionBoundaryService";

const REQUIRED_CONFIRMATION_TOKEN =
  "RUN_STRATEGY_ONE_PILOT_PREFLIGHT_ONLY";

export interface StrategyOnePilotRuntimePolicy {
  readonly capitalPerLegInr: number;
  readonly maximumCapitalPerLegInr?: number;
  readonly minimumNetProfitPercent: number;
  readonly maximumPreviewOpportunityAgeMs: number;
}

export type StrategyOnePilotPreviewState =
  | "WAITING_FOR_CURRENT_EXECUTE_OPPORTUNITY"
  | "WAITING_FOR_HISTORICAL_MATCH"
  | "BLOCKED_CURRENT_EVIDENCE"
  | "READY_FOR_OPERATOR_PREFLIGHT";

export interface StrategyOnePilotCheck {
  readonly key:
    | "AUDITED_LIVE_VENUE_CONTRACT"
    | "API_KEY_PERMISSION_BOUNDARY"
    | "PILOT_TIMING_HEADROOM"
    | "CURRENT_DISPATCH_RESERVED_FRESHNESS"
    | "CURRENT_LIVE_PROFIT_THRESHOLD"
    | "HISTORICAL_ROUTE_EVIDENCE"
    | "FRESH_TWO_LEG_FUNDING_AND_RULES"
    | "POST_STRESS_DEPTH_AND_ECONOMICS";
  readonly state: "PASS" | "BLOCKED";
  readonly message: string;
  readonly reasons: readonly string[];
}

export interface StrategyOnePilotCandidate {
  readonly opportunityId: string;
  readonly routeKey: string;
  readonly market: string;
  readonly buyExchange: string;
  readonly sellExchange: string;
  readonly observedAt: number;
  readonly ageMs: number;
  readonly currentNetProfitPercent: number;
  readonly currentNetProfitPerBaseUnit: number;
  readonly currentScore: number;
  readonly historical: StrategyOneCapitalPlacementRouteRank;
  readonly apiPermissionBoundary: StrategyOneApiPermissionBoundaryReport;
  readonly timing: StrategyOneTimingHeadroomReview;
  readonly funding: StrategyOneFundedRouteReport;
  readonly stress: StrategyOnePaperStressGateReport | null;
  readonly checks: readonly StrategyOnePilotCheck[];
  readonly readyForOperatorPreflight: boolean;
}

export interface StrategyOnePilotPreviewReport {
  readonly version: "115.0";
  readonly generatedAt: number;
  readonly mode: "STRATEGY_ONE_ACTION_TIME_PREFLIGHT_PREVIEW";
  readonly state: StrategyOnePilotPreviewState;
  readonly requestedCapitalPerLegInr: number;
  readonly minimumTwoLegInventoryInr: number;
  readonly minimumCurrentNetProfitPercent: number;
  readonly maximumOpportunityAgeMs: number;
  readonly maximumExecutionGradeBookAgeMs: 250;
  readonly maximumDispatchReservedBookAgeMs: 190;
  readonly maximumExecutionGradeBookSkewMs: 250;
  readonly evidence: {
    readonly currentFreshExecuteOpportunities: number;
    readonly historicalAdapterReadyRoutes: number;
    readonly excludedNonPilotCurrentOpportunities: number;
    readonly excludedNonPilotHistoricalRoutes: number;
    readonly matchedCurrentRoutes: number;
    readonly fullyPreflightableMatches: number;
  };
  readonly selected: StrategyOnePilotCandidate | null;
  readonly alternatives: readonly StrategyOnePilotCandidate[];
  readonly blockers: readonly string[];
  readonly requiredConfirmationToken: typeof REQUIRED_CONFIRMATION_TOKEN;
  readonly safety: StrategyOnePilotSafety;
}

export interface StrategyOnePilotSafety {
  readonly readOnlyPreview: true;
  readonly historicalEvidenceIsNotCurrentAuthorization: true;
  readonly operatorPreflightIsNotOrderAuthorization: true;
  readonly automaticFundMovementAllowed: false;
  readonly transferInitiated: false;
  readonly withdrawalInitiated: false;
  readonly balanceMutated: false;
  readonly capitalReserved: false;
  readonly liveSessionCreated: false;
  readonly liveExecutionAllowed: false;
  readonly orderSubmissionAllowed: false;
  readonly orderSubmissionPerformed: false;
}

export interface StrategyOnePilotPreflightRunReport {
  readonly version: "115.0";
  readonly generatedAt: number;
  readonly mode: "STRATEGY_ONE_ACTION_TIME_PREFLIGHT";
  readonly decision:
    | "BLOCKED_BEFORE_CORE_PREFLIGHT"
    | "CORE_PREFLIGHT_BLOCKED"
    | "CORE_PREFLIGHT_PASSED";
  readonly approvedForActivationReview: boolean;
  readonly expectedOpportunityId: string;
  readonly preview: StrategyOnePilotPreviewReport;
  readonly corePreflight: TinyLivePreflightReport | null;
  readonly blockers: readonly string[];
  readonly safety: StrategyOnePilotSafety;
}

export interface StrategyOnePilotPreflightDependencies {
  getTinyLivePolicy(): StrategyOnePilotRuntimePolicy;
  getOpportunities(): readonly ArbitrageOpportunity[];
  getOpportunityById(id: string): ArbitrageOpportunity | null;
  getCapitalPlacement(now: number): StrategyOneCapitalPlacementReport;
  getApiPermissionBoundary(
    now: number,
    requiredVenues?: readonly StrategyOneApiPermissionExchange[],
  ): StrategyOneApiPermissionBoundaryReport;
  evaluateFunding(
    opportunity: ArbitrageOpportunity,
    requestedCapitalInr: number,
    now: number,
    requestedQuoteCapital?: number,
  ): StrategyOneFundedRouteReport;
  reviewTiming(
    input: {
      readonly market: string;
      readonly buyExchange: string;
      readonly sellExchange: string;
    },
    now: number,
  ): StrategyOneTimingHeadroomReview;
  evaluateStress(
    opportunity: ArbitrageOpportunity,
    quantity: number,
    now: number,
  ): StrategyOnePaperStressGateReport;
  runCorePreflight(request: TinyLivePreflightRequest): TinyLivePreflightReport;
}

const DEFAULT_DEPENDENCIES:
  StrategyOnePilotPreflightDependencies = {
  getTinyLivePolicy:
    () => {
      const policy =
        strategyOneExecutionPolicyService
          .getActivePolicy()
          .values
          .tinyLive;

      return {
        capitalPerLegInr:
          policy.capitalPerLegInr,
        maximumCapitalPerLegInr:
          STRATEGY_ONE_TINY_LIVE_ROUTE_POOL_POLICY.maximumCapitalPerLegInr,
        minimumNetProfitPercent:
          policy.minimumNetProfitPercent,
        maximumPreviewOpportunityAgeMs:
          policy.maximumPreviewOpportunityAgeMs,
      };
    },
  getOpportunities:
    () =>
      opportunityService
        .getLastOpportunities(),
  getOpportunityById:
    (id) =>
      opportunityService
        .getOpportunityById(
          id,
        ),
  getCapitalPlacement:
    (now) =>
      strategyOneCapitalPlacementService
        .getReport(
          paperTradeStore
            .getAllForReadOnlyAggregation(),
          now,
          paperTradeStore
            .getSettledRevision(),
        ),
  getApiPermissionBoundary:
    (
      now,
      requiredVenues = [
        "binance",
        "bybit",
      ],
    ) =>
      strategyOneApiPermissionBoundaryService
        .getReportForVenues(
          requiredVenues,
          now,
        ),
  evaluateFunding:
    (
      opportunity,
      requestedCapitalInr,
      now,
      requestedQuoteCapital,
    ) =>
      strategyOneFundedRouteService
        .evaluate({
          opportunity,
          requestedCapitalInr:
            requestedCapitalInr,
          requestedQuoteCapital,
          maximumCapitalPerLegInr:
            STRATEGY_ONE_TINY_LIVE_ROUTE_POOL_POLICY.maximumCapitalPerLegInr,
          allowSingleIncrementMinimumOrderRoundUp:
            true,
          fundingBoundary:
            "AUTHENTICATED_LIVE_READINESS",
          now,
        }),
  reviewTiming:
    (input, now) =>
      strategyOneTimingCalibrationService
        .reviewDynamicPoolHeadroom(
          input,
          now,
        ),
  evaluateStress:
    (
      opportunity,
      quantity,
      now,
    ) =>
      strategyOnePaperStressGate
        .evaluate({
          opportunity,
          quantity,
          now,
        }),
  runCorePreflight:
    (request) =>
      tinyLivePreflightService
        .evaluate(
          request,
        ),
};

/**
 * Binds durable Strategy #1 evidence to one fresh current opportunity and the
 * existing exact funded-route and stress gates. This service never reserves
 * capital, creates a LIVE session, moves funds, or submits an order.
 */
export class StrategyOnePilotPreflightService {
  private readonly dependencies:
    StrategyOnePilotPreflightDependencies;

  constructor(
    dependencies:
      Partial<StrategyOnePilotPreflightDependencies> = {},
  ) {
    this.dependencies = {
      ...DEFAULT_DEPENDENCIES,
      ...dependencies,
    };
  }

  getPreview(
    now =
      Date.now(),
    expectedOpportunityId?:
      string,
  ): StrategyOnePilotPreviewReport {
    assertTimestamp(
      now,
    );

    const tinyLivePolicy =
      this.dependencies
        .getTinyLivePolicy();

    assertTinyLivePolicy(
      tinyLivePolicy,
    );

    const placement =
      this.dependencies
        .getCapitalPlacement(
          now,
        );

    const historicalCandidates = placement.routes.filter(
      (route) => hasCredibleHistoricalRouteEvidence(
        route,
        placement.minimumRouteSample,
      ),
    );

    const historicalRoutes =
      historicalCandidates
        .filter(
          (route) =>
            isExactStrategyOnePilotRoute(route),
        );

    const historicalByRoute =
      new Map(
        historicalRoutes.map(
          (route) => [
            route.routeKey,
            route,
          ] as const,
        ),
      );

    const normalizedExpectedOpportunityId =
      expectedOpportunityId
        ?.trim() ??
      "";
    const requestedOpportunity =
      normalizedExpectedOpportunityId
        ? this.dependencies
            .getOpportunityById(
              normalizedExpectedOpportunityId,
            )
        : null;
    const opportunitySource =
      normalizedExpectedOpportunityId
        ? requestedOpportunity
          ? [requestedOpportunity]
          : []
        : this.dependencies
            .getOpportunities();

    const currentCandidates = opportunitySource.filter(
      (opportunity) => isCurrentExecuteOpportunity(
        opportunity,
        now,
        tinyLivePolicy.maximumPreviewOpportunityAgeMs,
      ),
    );

    const currentOpportunities =
      currentCandidates
        .filter(
          (opportunity) =>
            isExactStrategyOnePilotRoute({
              market: opportunity.pair.market,
              buyExchange: opportunity.pair.buy.exchange,
              sellExchange: opportunity.pair.sell.exchange,
            }),
        );

    const matched =
      currentOpportunities
        .flatMap(
          (opportunity) => {
            const historical =
              historicalByRoute.get(
                routeKeyFor(
                  opportunity,
                ),
              );

            return historical
              ? [
                  this.evaluateCandidate(
                    opportunity,
                    historical,
                    placement.minimumRouteSample,
                    tinyLivePolicy,
                    this.dependencies
                      .getApiPermissionBoundary(
                        now,
                        [
                          opportunity.pair.buy.exchange
                            .trim()
                            .toLowerCase() as StrategyOneApiPermissionExchange,
                          opportunity.pair.sell.exchange
                            .trim()
                            .toLowerCase() as StrategyOneApiPermissionExchange,
                        ],
                      ),
                    now,
                  ),
                ]
              : [];
          },
        )
        .sort(
          compareCandidates,
        );

    const ready =
      matched.filter(
        (candidate) =>
          candidate.readyForOperatorPreflight,
      );

    const selected =
      ready[0] ??
      matched[0] ??
      null;

    const state:
      StrategyOnePilotPreviewState =
      currentOpportunities.length ===
        0
        ? "WAITING_FOR_CURRENT_EXECUTE_OPPORTUNITY"
        : matched.length ===
            0
          ? "WAITING_FOR_HISTORICAL_MATCH"
          : ready.length ===
              0
            ? "BLOCKED_CURRENT_EVIDENCE"
            : "READY_FOR_OPERATOR_PREFLIGHT";

    const blockers =
      buildPreviewBlockers(
        state,
        selected,
      );

    return freeze({
      version:
        "115.0" as const,
      generatedAt:
        now,
      mode:
        "STRATEGY_ONE_ACTION_TIME_PREFLIGHT_PREVIEW" as const,
      state,
      requestedCapitalPerLegInr:
        tinyLivePolicy.capitalPerLegInr,
      minimumTwoLegInventoryInr:
        tinyLivePolicy.capitalPerLegInr *
          2,
      minimumCurrentNetProfitPercent:
        tinyLivePolicy.minimumNetProfitPercent,
      maximumOpportunityAgeMs:
        tinyLivePolicy.maximumPreviewOpportunityAgeMs,
      maximumExecutionGradeBookAgeMs:
        STRATEGY_ONE_PILOT_MAXIMUM_BOOK_AGE_MS,
      maximumDispatchReservedBookAgeMs:
        STRATEGY_ONE_PILOT_DISPATCH_RESERVED_MAXIMUM_BOOK_AGE_MS,
      maximumExecutionGradeBookSkewMs:
        STRATEGY_ONE_PILOT_MAXIMUM_BOOK_SKEW_MS,
      evidence: {
        currentFreshExecuteOpportunities:
          currentOpportunities.length,
        historicalAdapterReadyRoutes:
          historicalRoutes.length,
        excludedNonPilotCurrentOpportunities:
          currentCandidates.length - currentOpportunities.length,
        excludedNonPilotHistoricalRoutes:
          historicalCandidates.length - historicalRoutes.length,
        matchedCurrentRoutes:
          matched.length,
        fullyPreflightableMatches:
          ready.length,
      },
      selected,
      alternatives:
        matched
          .filter(
            (candidate) =>
              candidate.opportunityId !==
              selected?.opportunityId,
          )
          .slice(
            0,
            4,
          ),
      blockers,
      requiredConfirmationToken:
        REQUIRED_CONFIRMATION_TOKEN,
      safety:
        safety(),
    });
  }

  run(
    request: {
      confirmationToken: string;
      expectedOpportunityId: string;
      now?: number;
    },
  ): StrategyOnePilotPreflightRunReport {
    if (
      request.confirmationToken
        .trim() !==
      REQUIRED_CONFIRMATION_TOKEN
    ) {
      throw new Error(
        `confirmationToken must equal ${REQUIRED_CONFIRMATION_TOKEN}.`,
      );
    }

    const now =
      request.now ??
      Date.now();

    const expectedOpportunityId =
      request.expectedOpportunityId
        .trim();

    /*
     * An action-time exact-route refresh is deliberately registered in the
     * immutable ID store without replacing the scanner's shared snapshot.
     * Bind operator preflight to that exact stored object; otherwise a prior
     * snapshot for the same route can supply stale book timestamps while the
     * refreshed opportunity ID is being authorized.
     */
    const preview =
      this.getPreview(
        now,
        expectedOpportunityId ||
          undefined,
      );

    const selected =
      preview.selected;

    const preCoreBlockers:
      string[] = [
      ...preview.blockers,
    ];

    if (
      !expectedOpportunityId
    ) {
      preCoreBlockers.push(
        "Expected current opportunity ID is required.",
      );
    }

    if (
      selected &&
      selected.opportunityId !==
        expectedOpportunityId
    ) {
      preCoreBlockers.push(
        "The selected current opportunity changed before preflight; refresh and confirm the new candidate.",
      );
    }

    if (
      preview.state !==
        "READY_FOR_OPERATOR_PREFLIGHT" ||
      !selected ||
      !selected.readyForOperatorPreflight
    ) {
      preCoreBlockers.push(
        "No current Strategy #1 candidate is ready for explicit core Tiny-LIVE preflight.",
      );
    }

    const buyRequirement =
      selected?.funding
        .buyFunding;

    const sellRequirement =
      selected?.funding
        .sellFunding;

    if (
      !buyRequirement?.asset ||
      buyRequirement.requiredBalance ===
        null ||
      !Number.isFinite(
        buyRequirement.requiredBalance,
      ) ||
      buyRequirement.requiredBalance <=
        0
    ) {
      preCoreBlockers.push(
        "Exact BUY quote-balance requirement is unavailable.",
      );
    }

    if (
      !sellRequirement?.asset ||
      sellRequirement.requiredBalance ===
        null ||
      !Number.isFinite(
        sellRequirement.requiredBalance,
      ) ||
      sellRequirement.requiredBalance <=
        0
    ) {
      preCoreBlockers.push(
        "Exact SELL inventory requirement is unavailable.",
      );
    }

    if (
      preCoreBlockers.length >
        0 ||
      !selected ||
      !buyRequirement?.asset ||
      buyRequirement.requiredBalance ===
        null ||
      !sellRequirement?.asset ||
      sellRequirement.requiredBalance ===
        null
    ) {
      return freeze({
        version:
          "115.0" as const,
        generatedAt:
          now,
        mode:
          "STRATEGY_ONE_ACTION_TIME_PREFLIGHT" as const,
        decision:
          "BLOCKED_BEFORE_CORE_PREFLIGHT" as const,
        approvedForActivationReview:
          false,
        expectedOpportunityId,
        preview,
        corePreflight:
          null,
        blockers: [
          ...new Set(
            preCoreBlockers,
          ),
        ],
        safety:
          safety(),
      });
    }

    const corePreflight =
      this.dependencies
        .runCorePreflight({
          requestedCapital:
            preview.requestedCapitalPerLegInr,
          market:
            selected.market,
          buyExchange:
            selected.buyExchange,
          sellExchange:
            selected.sellExchange,
          confirmationToken:
            "RUN_TINY_LIVE_PREFLIGHT_ONLY",
          balanceRequirements: [
            {
              exchange:
                buyRequirement.exchange,
              asset:
                buyRequirement.asset,
              requiredAmount:
                buyRequirement.requiredBalance,
              maximumAgeMs:
                buyRequirement.maximumSnapshotAgeMs,
            },
            {
              exchange:
                sellRequirement.exchange,
              asset:
                sellRequirement.asset,
              requiredAmount:
                sellRequirement.requiredBalance,
              maximumAgeMs:
                sellRequirement.maximumSnapshotAgeMs,
            },
          ],
        });

    return freeze({
      version:
        "115.0" as const,
      generatedAt:
        now,
      mode:
        "STRATEGY_ONE_ACTION_TIME_PREFLIGHT" as const,
      decision:
        corePreflight.approved
          ? "CORE_PREFLIGHT_PASSED" as const
          : "CORE_PREFLIGHT_BLOCKED" as const,
      approvedForActivationReview:
        corePreflight.approved,
      expectedOpportunityId,
      preview,
      corePreflight,
      blockers:
        corePreflight.blockers,
      safety:
        safety(),
    });
  }

  private evaluateCandidate(
    opportunity:
      ArbitrageOpportunity,
    historical:
      StrategyOneCapitalPlacementRouteRank,
    minimumHistoricalRouteSample:
      number,
    tinyLivePolicy:
      StrategyOnePilotRuntimePolicy,
    apiPermissionBoundary:
      StrategyOneApiPermissionBoundaryReport,
    now:
      number,
  ): StrategyOnePilotCandidate {
    const timing =
      this.dependencies
        .reviewTiming({
          market: opportunity.pair.market,
          buyExchange: opportunity.pair.buy.exchange,
          sellExchange: opportunity.pair.sell.exchange,
        }, now);

    const funding =
      this.dependencies
        .evaluateFunding(
          opportunity,
          tinyLivePolicy.capitalPerLegInr,
          now,
          Number.isFinite(
            opportunity.requestedQuoteCapital,
          ) &&
          (opportunity.requestedQuoteCapital ?? 0) >
            0
            ? opportunity.requestedQuoteCapital
            : undefined,
        );

    const exactPilotFunded =
      isExactPilotFunding(
        funding,
        tinyLivePolicy.capitalPerLegInr,
      );

    const stress =
      exactPilotFunded &&
      funding.executableQuantity !==
        null
        ? this.dependencies
            .evaluateStress(
              opportunity,
              funding.executableQuantity,
              now,
            )
        : null;

    const currentProfitPassed =
      Number.isFinite(
        opportunity.netProfitPercent,
      ) &&
      opportunity.netProfitPercent >=
        tinyLivePolicy.minimumNetProfitPercent;

    const currentDispatchFreshness =
      assessStrategyOnePilotDispatchReservedFreshness({
        buyExchange: opportunity.pair.buy.exchange,
        sellExchange: opportunity.pair.sell.exchange,
        buyTimestamp: opportunity.pair.buy.timestamp,
        sellTimestamp: opportunity.pair.sell.timestamp,
        quotesAreFresh: opportunity.quotesAreFresh,
        usedLastPriceFallback: opportunity.usedLastPriceFallback,
        now,
      });

    const checks:
      StrategyOnePilotCheck[] = [
      check(
        "AUDITED_LIVE_VENUE_CONTRACT",
        isExactStrategyOnePilotRoute({
          market: opportunity.pair.market,
          buyExchange: opportunity.pair.buy.exchange,
          sellExchange: opportunity.pair.sell.exchange,
        }),
        "Strategy #1 LIVE pilot is restricted to an explicitly audited SPOT lane.",
        [],
      ),
      check(
        "API_KEY_PERMISSION_BOUNDARY",
        apiPermissionBoundary.ready,
        "Every route venue key must have signed-read plus SPOT trading access, withdrawals disabled and explicit IP binding.",
        apiPermissionBoundary.blockers,
      ),
      check(
        "PILOT_TIMING_HEADROOM",
        timing.state ===
          "READY",
        "Mature execution-grade quote timing preserves dispatch budget plus operational headroom inside the immutable 250 ms ceiling.",
        timing.blockers,
      ),
      check(
        "CURRENT_DISPATCH_RESERVED_FRESHNESS",
        currentDispatchFreshness.passed,
        `Current BUY and SELL books must each be at most ${STRATEGY_ONE_PILOT_DISPATCH_RESERVED_MAXIMUM_BOOK_AGE_MS} ms old before the action-time pipeline starts.`,
        currentDispatchFreshness.passed
          ? []
          : [
              `Current dispatch-reserved freshness failed: buyAge=${currentDispatchFreshness.buyAgeMs} ms, sellAge=${currentDispatchFreshness.sellAgeMs} ms, skew=${currentDispatchFreshness.skewMs} ms (${currentDispatchFreshness.reasons.join(", ")}).`,
            ],
      ),
      check(
        "CURRENT_LIVE_PROFIT_THRESHOLD",
        currentProfitPassed,
        `Current fee-adjusted net return must be at least ${tinyLivePolicy.minimumNetProfitPercent.toFixed(2)}%.`,
        currentProfitPassed
          ? []
          : [
              `Current net return ${finiteFixed(opportunity.netProfitPercent, 4)}% is below the ${tinyLivePolicy.minimumNetProfitPercent.toFixed(4)}% Tiny-LIVE threshold.`,
            ],
      ),
      check(
        "HISTORICAL_ROUTE_EVIDENCE",
        hasCredibleHistoricalRouteEvidence(
          historical,
          minimumHistoricalRouteSample,
        ),
        "The exact directional route has durable positive realized PAPER evidence and audited LIVE contracts; TDS cash lock remains separate funding evidence.",
        [],
      ),
      check(
        "FRESH_TWO_LEG_FUNDING_AND_RULES",
        exactPilotFunded,
        `Fresh authenticated balances, exchange rules and depth pass at the ₹${tinyLivePolicy.capitalPerLegInr} target; one shared-step minimum-order cushion is bounded by the ₹${tinyLivePolicy.maximumCapitalPerLegInr ?? tinyLivePolicy.capitalPerLegInr} hard cap.`,
        exactPilotFunded
          ? []
          : funding.blockers.length >
              0
            ? [
                ...funding.blockers,
              ]
            : [
                `₹${tinyLivePolicy.capitalPerLegInr} target sizing was ${funding.state}; only exchange-mandated rounding within the hard cap is accepted.`,
              ],
      ),
      check(
        "POST_STRESS_DEPTH_AND_ECONOMICS",
        stress?.status ===
          "PASSED",
        "Fresh exact-quantity order books pass fee, slippage, safety-buffer and adverse-move stress.",
        stress?.status ===
          "PASSED"
          ? []
          : stress?.reasons.length
            ? [
                ...stress.reasons,
              ]
            : [
                "Post-stress evaluation is unavailable until exact two-leg funding and rules pass.",
              ],
      ),
    ];

    return {
      opportunityId:
        opportunity.id,
      routeKey:
        routeKeyFor(
          opportunity,
        ),
      market:
        opportunity.pair.market
          .trim()
          .toUpperCase(),
      buyExchange:
        opportunity.pair.buy.exchange
          .trim()
          .toLowerCase(),
      sellExchange:
        opportunity.pair.sell.exchange
          .trim()
          .toLowerCase(),
      observedAt:
        opportunity.timestamp,
      ageMs:
        now -
        opportunity.timestamp,
      currentNetProfitPercent:
        opportunity.netProfitPercent,
      currentNetProfitPerBaseUnit:
        opportunity.netProfit,
      currentScore:
        opportunity.score,
      historical,
      apiPermissionBoundary,
      timing,
      funding,
      stress,
      checks,
      readyForOperatorPreflight:
        checks.every(
          (item) =>
            item.state ===
            "PASS",
        ),
    };
  }
}

function isExactPilotFunding(
  funding:
    StrategyOneFundedRouteReport,
  requestedCapitalInr:
    number,
): boolean {
  const commonSafetyPassed =
    funding.fundingBoundary ===
      "AUTHENTICATED_LIVE_READINESS" &&
    funding.authenticatedBalancesRequired &&
    !funding.isolatedPaperCapital &&
    !funding.staleBalanceAllowed &&
    (
      funding.quantityNeverIncreased ||
      isBoundedMinimumOrderCushion(
        funding,
        requestedCapitalInr,
      )
    ) &&
    funding.blockers.length ===
      0 &&
    funding.executableQuantity !==
      null &&
    Number.isFinite(
      funding.executableQuantity,
    ) &&
    funding.executableQuantity >
      0 &&
    funding.estimatedExecutableCapitalInr !==
      null &&
    Number.isFinite(
      funding.estimatedExecutableCapitalInr,
    ) &&
    funding.buyFunding.sufficient &&
    funding.sellFunding.sufficient;

  if (
    !commonSafetyPassed ||
    funding.estimatedExecutableCapitalInr ===
      null
  ) {
    return false;
  }

  if (
    funding.state ===
      "FUNDED"
  ) {
    return funding.estimatedExecutableCapitalInr >=
      requestedCapitalInr -
        0.01;
  }

  return funding.state ===
      "REDUCED" &&
    isMandatorySharedIncrementOnlyReduction(
      funding,
      requestedCapitalInr,
    );
}

function isBoundedMinimumOrderCushion(
  funding: StrategyOneFundedRouteReport,
  requestedCapitalInr: number,
): boolean {
  const normalization = funding.quantityNormalization;
  const maximumCapitalPerLegInr = funding.maximumCapitalPerLegInr;
  const estimatedBuyRequirementInr = funding.estimatedBuyRequirementInr;
  const increaseQuantity = normalization?.increaseQuantity;

  if (
    funding.minimumOrderCushionUsed !== true ||
    funding.quantityNeverIncreased ||
    normalization === null ||
    normalization.state !== "NORMALIZED" ||
    normalization.minimumOrderCushionUsed !== true ||
    normalization.roundDownOnly ||
    normalization.quantityNeverIncreased ||
    !normalization.liveOrderSafe ||
    !normalization.incrementEvidenceComplete ||
    normalization.paperOnlyFallbackUsed ||
    normalization.blockers.length > 0 ||
    normalization.commonQuantityIncrement === null ||
    increaseQuantity === undefined ||
    increaseQuantity === null ||
    normalization.normalizedQuantity === null ||
    maximumCapitalPerLegInr === undefined ||
    estimatedBuyRequirementInr === undefined ||
    estimatedBuyRequirementInr === null
  ) {
    return false;
  }

  const tolerance = Math.max(
    1e-12,
    normalization.commonQuantityIncrement * 1e-12,
  );

  return Number.isFinite(increaseQuantity) &&
    increaseQuantity > tolerance &&
    increaseQuantity <=
      normalization.commonQuantityIncrement + tolerance &&
    normalization.normalizedQuantity > normalization.rawQuantity &&
    Number.isFinite(maximumCapitalPerLegInr) &&
    maximumCapitalPerLegInr ===
      STRATEGY_ONE_TINY_LIVE_ROUTE_POOL_POLICY.maximumCapitalPerLegInr &&
    estimatedBuyRequirementInr > requestedCapitalInr &&
    estimatedBuyRequirementInr <= maximumCapitalPerLegInr + 0.01;
}

function isMandatorySharedIncrementOnlyReduction(
  funding:
    StrategyOneFundedRouteReport,
  requestedCapitalInr:
    number,
): boolean {
  const normalization =
    funding.quantityNormalization;
  const capitalQuantity =
    funding.capitalQuantity;
  const preFundingQuantity =
    funding.preFundingQuantity;
  const balanceCappedQuantity =
    funding.balanceCappedQuantity;
  const executableQuantity =
    funding.executableQuantity;
  const estimatedCapitalInr =
    funding.estimatedExecutableCapitalInr;

  if (
    normalization ===
      null ||
    normalization.state !==
      "NORMALIZED" ||
    !normalization.liveOrderSafe ||
    !normalization.incrementEvidenceComplete ||
    normalization.paperOnlyFallbackUsed ||
    !normalization.roundDownOnly ||
    !normalization.quantityNeverIncreased ||
    normalization.blockers.length >
      0 ||
    normalization.commonQuantityIncrement ===
      null ||
    !Number.isFinite(
      normalization.commonQuantityIncrement,
    ) ||
    normalization.commonQuantityIncrement <=
      0 ||
    normalization.reductionQuantity ===
      null ||
    !Number.isFinite(
      normalization.reductionQuantity,
    ) ||
    capitalQuantity ===
      null ||
    !Number.isFinite(
      capitalQuantity,
    ) ||
    capitalQuantity <=
      0 ||
    preFundingQuantity ===
      null ||
    balanceCappedQuantity ===
      null ||
    executableQuantity ===
      null ||
    estimatedCapitalInr ===
      null
  ) {
    return false;
  }

  const quantityTolerance =
    Math.max(
      1e-12,
      capitalQuantity *
        1e-12,
      normalization.commonQuantityIncrement *
        1e-12,
    );
  const approximatelyEqual =
    (
      first:
        number,
      second:
        number,
    ): boolean =>
      Number.isFinite(
        first,
      ) &&
      Number.isFinite(
        second,
      ) &&
      Math.abs(
        first -
          second,
      ) <=
        quantityTolerance;

  const reductionQuantity =
    capitalQuantity -
      executableQuantity;
  const maximumOneStepCapitalLossInr =
    requestedCapitalInr *
      (
        normalization.commonQuantityIncrement /
        capitalQuantity
      );
  const actualCapitalLossInr =
    requestedCapitalInr -
      estimatedCapitalInr;

  return (
    approximatelyEqual(
      preFundingQuantity,
      capitalQuantity,
    ) &&
    approximatelyEqual(
      balanceCappedQuantity,
      preFundingQuantity,
    ) &&
    approximatelyEqual(
      normalization.rawQuantity,
      balanceCappedQuantity,
    ) &&
    normalization.normalizedQuantity !==
      null &&
    approximatelyEqual(
      normalization.normalizedQuantity,
      executableQuantity,
    ) &&
    approximatelyEqual(
      normalization.reductionQuantity,
      reductionQuantity,
    ) &&
    reductionQuantity >
      quantityTolerance &&
    reductionQuantity <
      normalization.commonQuantityIncrement +
        quantityTolerance &&
    actualCapitalLossInr >
      0 &&
    actualCapitalLossInr <=
      maximumOneStepCapitalLossInr +
        0.01 &&
    Math.abs(
      estimatedCapitalInr -
        requestedCapitalInr *
          (
            executableQuantity /
            capitalQuantity
          ),
    ) <=
      0.01
  );
}

function isCurrentExecuteOpportunity(
  opportunity:
    ArbitrageOpportunity,
  now:
    number,
  maximumAgeMs:
    number,
): boolean {
  const ageMs =
    now -
    opportunity.timestamp;

  return (
    opportunity.decision ===
      "EXECUTE" &&
    opportunity.quotesAreFresh &&
    !opportunity.usedLastPriceFallback &&
    Number.isSafeInteger(
      opportunity.timestamp,
    ) &&
    ageMs >=
      0 &&
    ageMs <=
      maximumAgeMs &&
    Number.isFinite(
      opportunity.executableQty,
    ) &&
    opportunity.executableQty >
      0
  );
}

function routeKeyFor(
  opportunity:
    ArbitrageOpportunity,
): string {
  return `${opportunity.pair.market.trim().toUpperCase()}|${opportunity.pair.buy.exchange.trim().toLowerCase()}>${opportunity.pair.sell.exchange.trim().toLowerCase()}`;
}

function hasCredibleHistoricalRouteEvidence(
  route: StrategyOneCapitalPlacementRouteRank,
  minimumHistoricalRouteSample: number,
): boolean {
  return route.liveAdapterFoundationReady &&
    route.uniqueSettlements >= minimumHistoricalRouteSample &&
    Number.isFinite(route.realizedPnlInr) &&
    route.realizedPnlInr > 0;
}

function compareCandidates(
  first:
    StrategyOnePilotCandidate,
  second:
    StrategyOnePilotCandidate,
): number {
  return (
    Number(
      second.readyForOperatorPreflight,
    ) -
      Number(
        first.readyForOperatorPreflight,
      ) ||
    Number(
      second.timing.state ===
        "READY",
    ) -
      Number(
        first.timing.state ===
          "READY",
      ) ||
    (second.timing.residualOperationalHeadroomMs ?? Number.NEGATIVE_INFINITY) -
      (first.timing.residualOperationalHeadroomMs ?? Number.NEGATIVE_INFINITY) ||
    first.historical.rank -
      second.historical.rank ||
    second.currentNetProfitPercent -
      first.currentNetProfitPercent ||
    second.currentScore -
      first.currentScore ||
    first.opportunityId.localeCompare(
      second.opportunityId,
    )
  );
}

function buildPreviewBlockers(
  state:
    StrategyOnePilotPreviewState,
  selected:
    StrategyOnePilotCandidate | null,
): string[] {
  switch (
    state
  ) {
    case "WAITING_FOR_CURRENT_EXECUTE_OPPORTUNITY":
      return [
        "No fresh, executable, non-fallback audited Strategy #1 opportunity exists within the route-seed window.",
      ];

    case "WAITING_FOR_HISTORICAL_MATCH":
      return [
        "A current audited-lane opportunity exists, but it has no matching route with sufficient credible historical evidence.",
      ];

    case "BLOCKED_CURRENT_EVIDENCE":
      return selected
        ? selected.checks
            .filter(
              (item) =>
                item.state ===
                "BLOCKED",
            )
            .flatMap(
              (item) =>
                item.reasons.map(
                  (reason) =>
                    `${item.key}: ${reason}`,
                ),
            )
        : [
            "Current candidate evidence is incomplete.",
          ];

    case "READY_FOR_OPERATOR_PREFLIGHT":
      return [];
  }
}

function check(
  key:
    StrategyOnePilotCheck["key"],
  passed:
    boolean,
  message:
    string,
  reasons:
    readonly string[],
): StrategyOnePilotCheck {
  return {
    key,
    state:
      passed
        ? "PASS"
        : "BLOCKED",
    message,
    reasons:
      passed
        ? []
        : reasons.length >
            0
          ? [
              ...reasons,
            ]
          : [
              message,
            ],
  };
}

function safety(): StrategyOnePilotSafety {
  return {
    readOnlyPreview:
      true,
    historicalEvidenceIsNotCurrentAuthorization:
      true,
    operatorPreflightIsNotOrderAuthorization:
      true,
    automaticFundMovementAllowed:
      false,
    transferInitiated:
      false,
    withdrawalInitiated:
      false,
    balanceMutated:
      false,
    capitalReserved:
      false,
    liveSessionCreated:
      false,
    liveExecutionAllowed:
      false,
    orderSubmissionAllowed:
      false,
    orderSubmissionPerformed:
      false,
  };
}

function assertTinyLivePolicy(
  policy:
    StrategyOnePilotRuntimePolicy,
): void {
  if (
    !Number.isSafeInteger(
      policy.capitalPerLegInr,
    ) ||
    policy.capitalPerLegInr <
      100 ||
    policy.capitalPerLegInr >
      500 ||
    !Number.isFinite(
      policy.minimumNetProfitPercent,
    ) ||
    policy.minimumNetProfitPercent <
      0 ||
    !Number.isSafeInteger(
      policy.maximumPreviewOpportunityAgeMs,
    ) ||
    policy.maximumPreviewOpportunityAgeMs <=
      0
  ) {
    throw new Error(
      "Active Strategy #1 Tiny-LIVE policy is invalid.",
    );
  }
}

function assertTimestamp(
  now:
    number,
): void {
  if (
    !Number.isSafeInteger(
      now,
    ) ||
    now <=
      0
  ) {
    throw new Error(
      "Strategy #1 pilot preflight timestamp must be a positive safe integer.",
    );
  }
}

function finiteFixed(
  value:
    number,
  places:
    number,
): string {
  return Number.isFinite(
    value,
  )
    ? value.toFixed(
        places,
      )
    : "INVALID";
}

function freeze<T>(
  value:
    T,
): T {
  if (
    typeof value !==
      "object" ||
    value ===
      null ||
    Object.isFrozen(
      value,
    )
  ) {
    return value;
  }

  for (
    const nested
    of Object.values(
      value,
    )
  ) {
    freeze(
      nested,
    );
  }

  return Object.freeze(
    value,
  );
}

export const strategyOnePilotPreflightService =
  new StrategyOnePilotPreflightService();
