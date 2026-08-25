import {
  authenticatedPrivateFillEventOwner,
} from "../fills/AuthenticatedPrivateFillEventOwner";

import {
  strategyOneTimingCalibrationService,
} from "../../../arbitrage/execution/StrategyOneTimingCalibrationService";
import {
  isStrategyOneTinyLiveBasketRoute,
} from "../../../arbitrage/execution/StrategyOneTinyLiveBasketPolicy";

export type StrategyOneTimeInForce =
  | "GTC"
  | "IOC"
  | "FOK";

export type StrategyOneTargetExchange =
  | "binance"
  | "bybit"
  | "coindcx"
  | "coinswitch"
  | "unocoin";

export interface StrategyOneVenueOrderContract {
  readonly exchange: string;
  readonly maximumOrderBookAgeMs:
    | number
    | null;
  readonly supportedTimeInForce:
    readonly StrategyOneTimeInForce[];
  readonly requiredTimeInForce:
    StrategyOneTimeInForce;
  readonly authoritativeFillConfirmationReady:
    boolean;
}

/**
 * One fail-closed definition of an action-ready venue contract. Keeping this
 * check shared prevents preview, pre-arm and final authorization from drifting
 * onto different time-in-force assumptions.
 */
export function isStrategyOneVenueOrderContractReady(
  contract: StrategyOneVenueOrderContract | null,
): contract is StrategyOneVenueOrderContract {
  return contract !== null &&
    contract.maximumOrderBookAgeMs !== null &&
    Number.isSafeInteger(contract.maximumOrderBookAgeMs) &&
    contract.maximumOrderBookAgeMs > 0 &&
    contract.supportedTimeInForce.includes(contract.requiredTimeInForce) &&
    contract.authoritativeFillConfirmationReady;
}

export interface StrategyOneVenueContractEvidence {
  readonly exchange: StrategyOneTargetExchange;
  readonly product: "SPOT";
  readonly classification:
    | "SAFE_PILOT_CANDIDATE"
    | "EXCLUDED_FROM_STRATEGY_ONE_LIVE";
  readonly requiredTimeInForce:
    StrategyOneTimeInForce;
  readonly documentedTimeInForce:
    readonly (
      | "GTC"
      | "IOC"
      | "FOK"
    )[];
  readonly exactFokAdapterMapping: boolean;
  readonly deterministicClientOrderIdentity:
    | "SUPPORTED_AND_MAPPED"
    | "DOCUMENTED_NOT_MAPPED"
    | "NOT_DOCUMENTED";
  readonly privateOrderEvidence:
    | "AUTHENTICATED_WS_IMPLEMENTED"
    | "DOCUMENTED_NOT_IMPLEMENTED"
    | "NOT_DOCUMENTED";
  readonly privateFillEvidence:
    | "AUTHENTICATED_WS_IMPLEMENTED"
    | "DOCUMENTED_NOT_IMPLEMENTED"
    | "NOT_DOCUMENTED";
  readonly runtimePrivateFillSessionReady: boolean;
  readonly calibratedOrderSubmissionTtlMs:
    | number
    | null;
  readonly documentation: readonly {
    readonly title: string;
    readonly url: string;
    readonly verifiedOn: "2026-08-15";
  }[];
  readonly blockers: readonly string[];
  readonly liveOrderSubmissionAuthorized: false;
}

export interface StrategyOneVenueContractReport {
  readonly schemaVersion: "107.0";
  readonly generatedAt: number;
  readonly requiredProduct: "SPOT";
  readonly requiredTimeInForce: "FOK";
  readonly venues: readonly StrategyOneVenueContractEvidence[];
  readonly summary: {
    readonly targetVenues: 5;
    readonly safePilotCandidates: number;
    readonly excludedFromLive: number;
    readonly runtimeContractReady: number;
  };
  readonly safety: {
    readonly documentationDoesNotGrantAuthority: true;
    readonly pollingCannotSubstituteForPrivateFillEvidence: true;
    readonly unsupportedTimeInForceNeverFallsBackToGtc: true;
    readonly paperEvidenceCannotSatisfyLiveFillEvidence: true;
    readonly automaticTtlActivationAllowed: false;
    readonly liveOrderSubmissionAuthorized: false;
  };
}

export interface StrategyOneLiveVenueContractDependencies {
  isPrivateFillSessionReady(
    exchange:
      | "binance"
      | "bybit"
      | "coindcx",
  ): boolean;

  getApprovedRouteTtl(input: {
    readonly market: string;
    readonly buyExchange: string;
    readonly sellExchange: string;
    readonly now: number;
  }): number | null;
}

const VERIFIED_ON =
  "2026-08-15" as const;

const STATIC_EVIDENCE:
  Readonly<Record<
    StrategyOneTargetExchange,
    Omit<
      StrategyOneVenueContractEvidence,
      | "runtimePrivateFillSessionReady"
      | "calibratedOrderSubmissionTtlMs"
      | "blockers"
      | "liveOrderSubmissionAuthorized"
    >
  >> = Object.freeze({
    binance: {
      exchange: "binance",
      product: "SPOT",
      classification: "SAFE_PILOT_CANDIDATE",
      requiredTimeInForce: "FOK",
      documentedTimeInForce: ["GTC", "IOC", "FOK"],
      exactFokAdapterMapping: true,
      deterministicClientOrderIdentity: "SUPPORTED_AND_MAPPED",
      privateOrderEvidence: "AUTHENTICATED_WS_IMPLEMENTED",
      privateFillEvidence: "AUTHENTICATED_WS_IMPLEMENTED",
      documentation: [
        {
          title: "Binance Spot trading endpoints",
          url: "https://developers.binance.com/docs/binance-spot-api-docs/rest-api/trading-endpoints",
          verifiedOn: VERIFIED_ON,
        },
        {
          title: "Binance Spot user data stream",
          url: "https://developers.binance.com/docs/binance-spot-api-docs/user-data-stream",
          verifiedOn: VERIFIED_ON,
        },
      ],
    },
    bybit: {
      exchange: "bybit",
      product: "SPOT",
      classification: "SAFE_PILOT_CANDIDATE",
      requiredTimeInForce: "FOK",
      documentedTimeInForce: ["GTC", "IOC", "FOK"],
      exactFokAdapterMapping: true,
      deterministicClientOrderIdentity: "SUPPORTED_AND_MAPPED",
      privateOrderEvidence: "AUTHENTICATED_WS_IMPLEMENTED",
      privateFillEvidence: "AUTHENTICATED_WS_IMPLEMENTED",
      documentation: [
        {
          title: "Bybit V5 place order",
          url: "https://bybit-exchange.github.io/docs/v5/order/create-order",
          verifiedOn: VERIFIED_ON,
        },
        {
          title: "Bybit private execution stream",
          url: "https://bybit-exchange.github.io/docs/v5/websocket/private/execution",
          verifiedOn: VERIFIED_ON,
        },
        {
          title: "Bybit private order stream",
          url: "https://bybit-exchange.github.io/docs/v5/websocket/private/order",
          verifiedOn: VERIFIED_ON,
        },
      ],
    },
    coindcx: {
      exchange: "coindcx",
      product: "SPOT",
      classification: "EXCLUDED_FROM_STRATEGY_ONE_LIVE",
      requiredTimeInForce: "FOK",
      documentedTimeInForce: ["GTC"],
      exactFokAdapterMapping: false,
      deterministicClientOrderIdentity: "SUPPORTED_AND_MAPPED",
      privateOrderEvidence: "AUTHENTICATED_WS_IMPLEMENTED",
      privateFillEvidence: "AUTHENTICATED_WS_IMPLEMENTED",
      documentation: [
        {
          title: "CoinDCX Spot API reference",
          url: "https://docs.coindcx.com/",
          verifiedOn: VERIFIED_ON,
        },
      ],
    },
    coinswitch: {
      exchange: "coinswitch",
      product: "SPOT",
      classification: "EXCLUDED_FROM_STRATEGY_ONE_LIVE",
      requiredTimeInForce: "FOK",
      documentedTimeInForce: [],
      exactFokAdapterMapping: false,
      deterministicClientOrderIdentity: "NOT_DOCUMENTED",
      privateOrderEvidence: "DOCUMENTED_NOT_IMPLEMENTED",
      privateFillEvidence: "DOCUMENTED_NOT_IMPLEMENTED",
      documentation: [
        {
          title: "CoinSwitch Spot create order",
          url: "https://api-trading.coinswitch.co/spot/reference/create-order",
          verifiedOn: VERIFIED_ON,
        },
        {
          title: "CoinSwitch Spot order updates",
          url: "https://api-trading.coinswitch.co/spot/websockets/order-updates",
          verifiedOn: VERIFIED_ON,
        },
      ],
    },
    unocoin: {
      exchange: "unocoin",
      product: "SPOT",
      classification: "EXCLUDED_FROM_STRATEGY_ONE_LIVE",
      requiredTimeInForce: "FOK",
      documentedTimeInForce: [],
      exactFokAdapterMapping: false,
      deterministicClientOrderIdentity: "NOT_DOCUMENTED",
      privateOrderEvidence: "NOT_DOCUMENTED",
      privateFillEvidence: "NOT_DOCUMENTED",
      documentation: [
        {
          title: "UnoCoin API documentation",
          url: "https://unocoin.com/in/support/api-documentation/",
          verifiedOn: VERIFIED_ON,
        },
      ],
    },
  });

const TARGET_EXCHANGES:
  readonly StrategyOneTargetExchange[] = Object.freeze([
    "binance",
    "bybit",
    "coindcx",
    "coinswitch",
    "unocoin",
  ]);

const DEFAULT_DEPENDENCIES:
  StrategyOneLiveVenueContractDependencies = {
  isPrivateFillSessionReady: (exchange) =>
    authenticatedPrivateFillEventOwner.isVenueReady(exchange),
  getApprovedRouteTtl: (input) =>
    strategyOneTimingCalibrationService
      .getDynamicPoolRouteQualification(input)
      ?.maximumBookAgeMs ?? null,
  };

/**
 * Immutable, read-only owner for the exact Strategy #1 SPOT execution
 * contracts. It can exclude a venue but cannot submit, cancel or reconcile an
 * order. Documentation support never grants runtime or operator authority.
 */
export class StrategyOneLiveVenueContractRegistry {
  private readonly dependencies:
    StrategyOneLiveVenueContractDependencies;

  constructor(
    dependencies:
      Partial<StrategyOneLiveVenueContractDependencies> = {},
  ) {
    this.dependencies = {
      ...DEFAULT_DEPENDENCIES,
      ...dependencies,
    };
  }

  getOrderTimeSafetyContract(
    exchange: string,
    route?: {
      readonly market: string;
      readonly buyExchange: string;
      readonly sellExchange: string;
    },
    now = Date.now(),
  ): StrategyOneVenueOrderContract | null {
    const evidence =
      this.getVenue(exchange, route, now);

    if (!evidence) {
      return null;
    }

    return deepFreeze({
      exchange: evidence.exchange,
      maximumOrderBookAgeMs:
        evidence.calibratedOrderSubmissionTtlMs,
      requiredTimeInForce:
        evidence.requiredTimeInForce,
      supportedTimeInForce:
        hasExactTimeInForceMapping(
          evidence,
          route,
        )
          ? evidence.documentedTimeInForce.filter(
              (value): value is StrategyOneTimeInForce =>
                value ===
                  evidence.requiredTimeInForce ||
                (
                  evidence.requiredTimeInForce ===
                    "FOK" &&
                  value ===
                    "IOC"
                ),
            )
          : [],
      authoritativeFillConfirmationReady:
        evidence.runtimePrivateFillSessionReady &&
        evidence.privateFillEvidence ===
          "AUTHENTICATED_WS_IMPLEMENTED",
    });
  }

  getVenue(
    exchange: string,
    route?: {
      readonly market: string;
      readonly buyExchange: string;
      readonly sellExchange: string;
    },
    now = Date.now(),
  ): StrategyOneVenueContractEvidence | null {
    const normalized =
      normalizeExchange(exchange);

    if (!isTargetExchange(normalized)) {
      return null;
    }

    const evidence =
      STATIC_EVIDENCE[normalized];
    const coinDCXPilotRoute =
      normalized ===
        "coindcx" &&
      isApprovedCoinDCXPilotBasketRoute(
        route,
      );
    const classification =
      coinDCXPilotRoute
        ? "SAFE_PILOT_CANDIDATE" as const
        : evidence.classification;
    const requiredTimeInForce:
      StrategyOneTimeInForce =
      coinDCXPilotRoute
        ? "GTC"
        : evidence.requiredTimeInForce;
    const supportsRequiredTimeInForce =
      hasExactTimeInForceMapping(
        {
          ...evidence,
          requiredTimeInForce,
        },
        route,
      );
    const runtimePrivateFillSessionReady =
      normalized === "binance" ||
      normalized === "bybit" ||
      normalized === "coindcx"
        ? this.dependencies.isPrivateFillSessionReady(normalized)
        : false;
    const calibratedOrderSubmissionTtlMs =
      route && classification === "SAFE_PILOT_CANDIDATE"
        ? this.dependencies.getApprovedRouteTtl({
            ...route,
            now,
          })
        : null;
    const blockers: string[] = [];

    if (classification !== "SAFE_PILOT_CANDIDATE") {
      blockers.push("VENUE_EXCLUDED_FROM_STRATEGY_ONE_LIVE");
    }

    if (!supportsRequiredTimeInForce) {
      blockers.push(
        requiredTimeInForce ===
          "FOK"
          ? "AUDITED_SPOT_FOK_CONTRACT_UNAVAILABLE"
          : "AUDITED_SPOT_GTC_BOUNDED_CANCEL_CONTRACT_UNAVAILABLE",
      );
    }

    if (evidence.deterministicClientOrderIdentity !== "SUPPORTED_AND_MAPPED") {
      blockers.push("DURABLE_CLIENT_ORDER_IDENTITY_UNAVAILABLE");
    }

    if (evidence.privateFillEvidence !== "AUTHENTICATED_WS_IMPLEMENTED") {
      blockers.push("AUTHENTICATED_PRIVATE_FILL_OWNER_UNAVAILABLE");
    } else if (!runtimePrivateFillSessionReady) {
      blockers.push("AUTHENTICATED_PRIVATE_FILL_SESSION_NOT_READY");
    }

    if (calibratedOrderSubmissionTtlMs === null) {
      blockers.push("CALIBRATED_ORDER_SUBMISSION_TTL_MISSING");
    }

    return deepFreeze({
      ...evidence,
      classification,
      requiredTimeInForce,
      runtimePrivateFillSessionReady,
      calibratedOrderSubmissionTtlMs,
      blockers: [...new Set(blockers)],
      liveOrderSubmissionAuthorized: false,
    });
  }

  getReport(
    now = Date.now(),
  ): StrategyOneVenueContractReport {
    if (!Number.isSafeInteger(now) || now <= 0) {
      throw new Error("Strategy #1 venue-contract report timestamp is invalid.");
    }

    const venues =
      TARGET_EXCHANGES.map((exchange) => {
        const venue = this.getVenue(exchange);

        if (!venue) {
          throw new Error(`Missing Strategy #1 venue contract: ${exchange}.`);
        }

        return venue;
      });

    return deepFreeze({
      schemaVersion: "107.0",
      generatedAt: now,
      requiredProduct: "SPOT",
      requiredTimeInForce: "FOK",
      venues,
      summary: {
        targetVenues: 5,
        safePilotCandidates: venues.filter(
          (venue) => venue.classification === "SAFE_PILOT_CANDIDATE",
        ).length,
        excludedFromLive: venues.filter(
          (venue) => venue.classification === "EXCLUDED_FROM_STRATEGY_ONE_LIVE",
        ).length,
        runtimeContractReady: venues.filter(
          (venue) => venue.blockers.length === 0,
        ).length,
      },
      safety: {
        documentationDoesNotGrantAuthority: true,
        pollingCannotSubstituteForPrivateFillEvidence: true,
        unsupportedTimeInForceNeverFallsBackToGtc: true,
        paperEvidenceCannotSatisfyLiveFillEvidence: true,
        automaticTtlActivationAllowed: false,
        liveOrderSubmissionAuthorized: false,
      },
    });
  }
}

function normalizeExchange(
  value: string,
): string {
  return value.trim().toLowerCase();
}

function isTargetExchange(
  value: string,
): value is StrategyOneTargetExchange {
  return TARGET_EXCHANGES.includes(
    value as StrategyOneTargetExchange,
  );
}

function hasExactTimeInForceMapping(
  evidence: Pick<
    StrategyOneVenueContractEvidence,
    | "exchange"
    | "requiredTimeInForce"
    | "documentedTimeInForce"
    | "exactFokAdapterMapping"
  >,
  route?: {
    readonly market: string;
    readonly buyExchange: string;
    readonly sellExchange: string;
  },
): boolean {
  if (
    evidence.exchange ===
      "coindcx"
  ) {
    return evidence.requiredTimeInForce ===
        "GTC" &&
      evidence.documentedTimeInForce.includes(
        "GTC",
      ) &&
      isApprovedCoinDCXPilotBasketRoute(
        route,
      );
  }

  return evidence.requiredTimeInForce ===
      "FOK" &&
    evidence.documentedTimeInForce.includes(
      "FOK",
    ) &&
    evidence.exactFokAdapterMapping;
}

function isApprovedCoinDCXPilotBasketRoute(
  route?: {
    readonly market: string;
    readonly buyExchange: string;
    readonly sellExchange: string;
  },
): boolean {
  return Boolean(route &&
    (normalizeExchange(route.buyExchange) === "coindcx" ||
      normalizeExchange(route.sellExchange) === "coindcx") &&
    isStrategyOneTinyLiveBasketRoute(route));
}

function deepFreeze<T>(
  value: T,
): T {
  if (
    typeof value !== "object" ||
    value === null ||
    Object.isFrozen(value)
  ) {
    return value;
  }

  for (const nested of Object.values(value)) {
    deepFreeze(nested);
  }

  return Object.freeze(value);
}

export const strategyOneLiveVenueContractRegistry =
  new StrategyOneLiveVenueContractRegistry();
