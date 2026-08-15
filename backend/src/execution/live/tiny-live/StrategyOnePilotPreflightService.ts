import {
  PROFIT_TIER_POLICY,
} from "../../../arbitrage/config/profitTiers";

import type {
  ArbitrageOpportunity,
} from "../../../arbitrage/models/ArbitrageOpportunity";

import {
  opportunityService,
} from "../../../arbitrage/services/OpportunityService";

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

const PILOT_CAPITAL_PER_LEG_INR =
  100 as const;

const MINIMUM_TWO_LEG_INVENTORY_INR =
  200 as const;

const MAXIMUM_CURRENT_OPPORTUNITY_AGE_MS =
  10_000;

const REQUIRED_CONFIRMATION_TOKEN =
  "RUN_STRATEGY_ONE_PILOT_PREFLIGHT_ONLY";

export type StrategyOnePilotPreviewState =
  | "WAITING_FOR_CURRENT_EXECUTE_OPPORTUNITY"
  | "WAITING_FOR_HISTORICAL_MATCH"
  | "BLOCKED_CURRENT_EVIDENCE"
  | "READY_FOR_OPERATOR_PREFLIGHT";

export interface StrategyOnePilotCheck {
  readonly key:
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
  readonly funding: StrategyOneFundedRouteReport;
  readonly stress: StrategyOnePaperStressGateReport | null;
  readonly checks: readonly StrategyOnePilotCheck[];
  readonly readyForOperatorPreflight: boolean;
}

export interface StrategyOnePilotPreviewReport {
  readonly version: "92.0";
  readonly generatedAt: number;
  readonly mode: "STRATEGY_ONE_ACTION_TIME_PREFLIGHT_PREVIEW";
  readonly state: StrategyOnePilotPreviewState;
  readonly requestedCapitalPerLegInr: 100;
  readonly minimumTwoLegInventoryInr: 200;
  readonly minimumCurrentNetProfitPercent: number;
  readonly maximumOpportunityAgeMs: number;
  readonly evidence: {
    readonly currentFreshExecuteOpportunities: number;
    readonly historicalAdapterReadyRoutes: number;
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
  readonly version: "92.0";
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
  getOpportunities(): readonly ArbitrageOpportunity[];
  getCapitalPlacement(now: number): StrategyOneCapitalPlacementReport;
  evaluateFunding(
    opportunity: ArbitrageOpportunity,
    now: number,
  ): StrategyOneFundedRouteReport;
  evaluateStress(
    opportunity: ArbitrageOpportunity,
    quantity: number,
    now: number,
  ): StrategyOnePaperStressGateReport;
  runCorePreflight(request: TinyLivePreflightRequest): TinyLivePreflightReport;
}

const DEFAULT_DEPENDENCIES:
  StrategyOnePilotPreflightDependencies = {
  getOpportunities:
    () =>
      opportunityService
        .getLastOpportunities(),
  getCapitalPlacement:
    (now) =>
      strategyOneCapitalPlacementService
        .getReport(
          paperTradeStore
            .getAllForReadOnlyAggregation(),
          now,
        ),
  evaluateFunding:
    (
      opportunity,
      now,
    ) =>
      strategyOneFundedRouteService
        .evaluate({
          opportunity,
          requestedCapitalInr:
            PILOT_CAPITAL_PER_LEG_INR,
          fundingBoundary:
            "AUTHENTICATED_LIVE_READINESS",
          now,
        }),
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
  ): StrategyOnePilotPreviewReport {
    assertTimestamp(
      now,
    );

    const placement =
      this.dependencies
        .getCapitalPlacement(
          now,
        );

    const historicalRoutes =
      placement.routes
        .filter(
          (route) =>
            route.liveAdapterFoundationReady &&
            route.uniqueSettlements >=
              placement.minimumRouteSample &&
            route.deployableCashPnlInr >
              0,
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

    const currentOpportunities =
      this.dependencies
        .getOpportunities()
        .filter(
          (opportunity) =>
            isCurrentExecuteOpportunity(
              opportunity,
              now,
            ),
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
        "92.0" as const,
      generatedAt:
        now,
      mode:
        "STRATEGY_ONE_ACTION_TIME_PREFLIGHT_PREVIEW" as const,
      state,
      requestedCapitalPerLegInr:
        PILOT_CAPITAL_PER_LEG_INR,
      minimumTwoLegInventoryInr:
        MINIMUM_TWO_LEG_INVENTORY_INR,
      minimumCurrentNetProfitPercent:
        PROFIT_TIER_POLICY
          .liveMinimumNetProfitPercent,
      maximumOpportunityAgeMs:
        MAXIMUM_CURRENT_OPPORTUNITY_AGE_MS,
      evidence: {
        currentFreshExecuteOpportunities:
          currentOpportunities.length,
        historicalAdapterReadyRoutes:
          historicalRoutes.length,
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

    const preview =
      this.getPreview(
        now,
      );

    const selected =
      preview.selected;

    const expectedOpportunityId =
      request.expectedOpportunityId
        .trim();

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
          "92.0" as const,
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
            PILOT_CAPITAL_PER_LEG_INR,
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
        "92.0" as const,
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
    now:
      number,
  ): StrategyOnePilotCandidate {
    const funding =
      this.dependencies
        .evaluateFunding(
          opportunity,
          now,
        );

    const exactPilotFunded =
      funding.state ===
        "FUNDED" &&
      funding.executableQuantity !==
        null &&
      funding.executableQuantity >
        0 &&
      funding.estimatedExecutableCapitalInr !==
        null &&
      funding.estimatedExecutableCapitalInr >=
        PILOT_CAPITAL_PER_LEG_INR -
          0.01 &&
      funding.buyFunding.sufficient &&
      funding.sellFunding.sufficient;

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
        PROFIT_TIER_POLICY
          .liveMinimumNetProfitPercent;

    const checks:
      StrategyOnePilotCheck[] = [
      check(
        "CURRENT_LIVE_PROFIT_THRESHOLD",
        currentProfitPassed,
        `Current fee-adjusted net return must be at least ${PROFIT_TIER_POLICY.liveMinimumNetProfitPercent.toFixed(2)}%.`,
        currentProfitPassed
          ? []
          : [
              `Current net return ${finiteFixed(opportunity.netProfitPercent, 4)}% is below the ${PROFIT_TIER_POLICY.liveMinimumNetProfitPercent.toFixed(4)}% Tiny-LIVE threshold.`,
            ],
      ),
      check(
        "HISTORICAL_ROUTE_EVIDENCE",
        historical.liveAdapterFoundationReady &&
          historical.uniqueSettlements >=
            minimumHistoricalRouteSample &&
          historical.deployableCashPnlInr >
            0,
        "The exact directional route has durable positive historical evidence and two registered adapter foundations.",
        [],
      ),
      check(
        "FRESH_TWO_LEG_FUNDING_AND_RULES",
        exactPilotFunded,
        "Fresh authenticated balances, exchange rules, depth and exact ₹100 sizing pass on both legs.",
        exactPilotFunded
          ? []
          : funding.blockers.length >
              0
            ? [
                ...funding.blockers,
              ]
            : [
                `Exact ₹${PILOT_CAPITAL_PER_LEG_INR} sizing was ${funding.state}; reduced pilots below the hard minimum are not accepted.`,
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

function isCurrentExecuteOpportunity(
  opportunity:
    ArbitrageOpportunity,
  now:
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
      MAXIMUM_CURRENT_OPPORTUNITY_AGE_MS &&
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
        "No fresh, executable, non-fallback Strategy #1 opportunity exists within the 10-second action-time window.",
      ];

    case "WAITING_FOR_HISTORICAL_MATCH":
      return [
        "Fresh executable opportunities exist, but none matches an adapter-ready route with sufficient credible historical evidence.",
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
