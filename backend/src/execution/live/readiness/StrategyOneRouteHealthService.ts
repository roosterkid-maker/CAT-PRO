import {
  executionHealthService,
  type ExchangeExecutionHealth,
} from "../health/ExecutionHealthService";

import {
  STRATEGY_ONE_DIRECTIONAL_ROUTES,
} from "../scope/StrategyOneExchangeScope";

import {
  strategyOnePilotPreflightService,
  type StrategyOnePilotCandidate,
} from "../tiny-live/StrategyOnePilotPreflightService";

import {
  strategyOneLiveVenueContractRegistry,
} from "../contracts/StrategyOneLiveVenueContractRegistry";

export type StrategyOneRouteHealthState =
  | "PREFLIGHT_ELIGIBLE"
  | "WAITING_FOR_CURRENT_OPPORTUNITY"
  | "BLOCKED_EXCHANGE_READINESS"
  | "BLOCKED_ROUTE_EVIDENCE"
  | "BLOCKED_ORDER_CONTRACT";

export interface StrategyOneRouteHealth {
  readonly buyExchange: string;
  readonly sellExchange: string;
  readonly routeKey: string;
  readonly state: StrategyOneRouteHealthState;
  readonly currentMarket: string | null;
  readonly currentOpportunityId: string | null;
  readonly buyVenueSubmissionReady: boolean;
  readonly sellVenueSubmissionReady: boolean;
  readonly blockers: readonly string[];
  readonly orderAuthorityGranted: false;
}

export interface StrategyOneRouteHealthReport {
  readonly schemaVersion: "1.0";
  readonly generatedAt: number;
  readonly coreExchangeHealth: readonly ExchangeExecutionHealth[];
  readonly routeHealth: readonly StrategyOneRouteHealth[];
  readonly executionEligibility: readonly StrategyOneRouteHealth[];
  readonly nonCoreExchangeStatus: readonly ExchangeExecutionHealth[];
  readonly globalAllExchangeGateUsed: false;
}

export class StrategyOneRouteHealthService {
  getReport(
    now = Date.now(),
  ): StrategyOneRouteHealthReport {
    const health =
      executionHealthService
        .getReport();
    const preview =
      strategyOnePilotPreflightService
        .getPreview(
          now,
        );
    const candidates = [
      ...(
        preview.selected
          ? [
              preview.selected,
            ]
          : []
      ),
      ...preview.alternatives,
    ];

    const routeHealth =
      STRATEGY_ONE_DIRECTIONAL_ROUTES
        .map(
          (route) =>
            this.evaluateRoute(
              route.buyExchange,
              route.sellExchange,
              health.coreExchanges,
              candidates,
              now,
            ),
        );

    return Object.freeze({
      schemaVersion:
        "1.0" as const,
      generatedAt:
        now,
      coreExchangeHealth:
        health.coreExchanges,
      routeHealth,
      executionEligibility:
        routeHealth.filter(
          (route) =>
            route.state ===
            "PREFLIGHT_ELIGIBLE",
        ),
      nonCoreExchangeStatus:
        health.nonCoreExchanges,
      globalAllExchangeGateUsed:
        false as const,
    });
  }

  private evaluateRoute(
    buyExchange: string,
    sellExchange: string,
    exchanges: readonly ExchangeExecutionHealth[],
    candidates: readonly StrategyOnePilotCandidate[],
    now: number,
  ): StrategyOneRouteHealth {
    const routeKey =
      `${buyExchange}>${sellExchange}`;
    const buy =
      exchanges.find(
        (exchange) =>
          exchange.exchange ===
          buyExchange,
      );
    const sell =
      exchanges.find(
        (exchange) =>
          exchange.exchange ===
          sellExchange,
      );
    const candidate =
      candidates.find(
        (item) =>
          item.buyExchange ===
            buyExchange &&
          item.sellExchange ===
            sellExchange,
      ) ??
      null;

    if (
      !buy?.submissionReady ||
      !sell?.submissionReady
    ) {
      return this.route(
        routeKey,
        buyExchange,
        sellExchange,
        candidate,
        "BLOCKED_EXCHANGE_READINESS",
        [
          ...(
            buy?.submissionReady
              ? []
              : [
                  `${buyExchange}: selected-route execution adapter is not submission-ready.`,
                ]
          ),
          ...(
            sell?.submissionReady
              ? []
              : [
                  `${sellExchange}: selected-route execution adapter is not submission-ready.`,
                ]
          ),
        ],
        Boolean(
          buy?.submissionReady,
        ),
        Boolean(
          sell?.submissionReady,
        ),
      );
    }

    if (!candidate) {
      return this.route(
        routeKey,
        buyExchange,
        sellExchange,
        null,
        "WAITING_FOR_CURRENT_OPPORTUNITY",
        [
          "No current fresh exact-direction opportunity is available.",
        ],
        true,
        true,
      );
    }

    const route = {
      market:
        candidate.market,
      buyExchange,
      sellExchange,
    };
    const contractBlockers =
      [
        buyExchange,
        sellExchange,
      ].flatMap(
        (exchange) => {
          const contract =
            strategyOneLiveVenueContractRegistry
              .getVenue(
                exchange,
                route,
                now,
              );

          return contract?.blockers.map(
            (blocker) =>
              `${exchange}: ${blocker}`,
          ) ?? [
            `${exchange}: venue order contract is unavailable.`,
          ];
        },
      );

    if (contractBlockers.length > 0) {
      return this.route(
        routeKey,
        buyExchange,
        sellExchange,
        candidate,
        "BLOCKED_ORDER_CONTRACT",
        contractBlockers,
        true,
        true,
      );
    }

    if (!candidate.readyForOperatorPreflight) {
      return this.route(
        routeKey,
        buyExchange,
        sellExchange,
        candidate,
        "BLOCKED_ROUTE_EVIDENCE",
        candidate.checks
          .filter(
            (check) =>
              check.state ===
              "BLOCKED",
          )
          .flatMap(
            (check) =>
              check.reasons.map(
                (reason) =>
                  `${check.key}: ${reason}`,
              ),
          ),
        true,
        true,
      );
    }

    return this.route(
      routeKey,
      buyExchange,
      sellExchange,
      candidate,
      "PREFLIGHT_ELIGIBLE",
      [],
      true,
      true,
    );
  }

  private route(
    routeKey: string,
    buyExchange: string,
    sellExchange: string,
    candidate: StrategyOnePilotCandidate | null,
    state: StrategyOneRouteHealthState,
    blockers: readonly string[],
    buyVenueSubmissionReady: boolean,
    sellVenueSubmissionReady: boolean,
  ): StrategyOneRouteHealth {
    return Object.freeze({
      buyExchange,
      sellExchange,
      routeKey,
      state,
      currentMarket:
        candidate?.market ??
        null,
      currentOpportunityId:
        candidate?.opportunityId ??
        null,
      buyVenueSubmissionReady,
      sellVenueSubmissionReady,
      blockers: [
        ...blockers,
      ],
      orderAuthorityGranted:
        false as const,
    });
  }
}

export const strategyOneRouteHealthService =
  new StrategyOneRouteHealthService();
