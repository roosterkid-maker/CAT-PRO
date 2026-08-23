export const SPOT_PERPETUAL_SPOT_VENUES = [
  "coindcx",
  "binance",
  "bybit",
  "unocoin",
  "coinswitch",
  "zebpay",
] as const;

export const SPOT_PERPETUAL_PERPETUAL_VENUES = [
  "binance",
  "bybit",
  "coindcx",
  "coinswitch",
  "zebpay",
] as const;

export type SpotPerpetualSpotVenue = typeof SPOT_PERPETUAL_SPOT_VENUES[number];
export type SpotPerpetualPerpetualVenue = typeof SPOT_PERPETUAL_PERPETUAL_VENUES[number];

export interface SpotPerpetualVenueRoute {
  readonly id: string;
  readonly spotExchange: SpotPerpetualSpotVenue;
  readonly perpetualExchange: SpotPerpetualPerpetualVenue;
  readonly topology: "INTRA_EXCHANGE" | "CROSS_EXCHANGE";
  readonly direction: "LONG_SPOT_SHORT_PERPETUAL";
  readonly executionAuthorized: false;
}

export interface DerivativeVenueCapabilitySnapshot {
  readonly version: "167.0";
  readonly generatedAt: number;
  readonly spotVenues: readonly SpotPerpetualSpotVenue[];
  readonly perpetualVenues: readonly SpotPerpetualPerpetualVenue[];
  readonly routes: readonly SpotPerpetualVenueRoute[];
  readonly summary: {
    readonly spotVenues: 6;
    readonly perpetualVenues: 5;
    readonly totalVenueCombinationsPerSharedMarket: 30;
    readonly intraExchangeCombinationsPerSharedMarket: 5;
    readonly crossExchangeCombinationsPerSharedMarket: 25;
  };
  readonly safety: {
    readonly cashAndCarryOnly: true;
    readonly reverseBasisAllowed: false;
    readonly shortSpotAllowed: false;
    readonly oneWayPerpetualRequired: true;
    readonly paperFirst: true;
    readonly liveExecutionAllowed: false;
    readonly orderSubmissionAllowed: false;
  };
}

export class DerivativeVenueCapabilityRegistry {
  private readonly routes: readonly SpotPerpetualVenueRoute[];

  constructor() {
    this.routes = deepFreeze(
      SPOT_PERPETUAL_SPOT_VENUES.flatMap((spotExchange) =>
        SPOT_PERPETUAL_PERPETUAL_VENUES.map((perpetualExchange) => ({
          id: `${spotExchange}:spot>${perpetualExchange}:perpetual`,
          spotExchange,
          perpetualExchange,
          topology: spotExchange === perpetualExchange
            ? "INTRA_EXCHANGE" as const
            : "CROSS_EXCHANGE" as const,
          direction: "LONG_SPOT_SHORT_PERPETUAL" as const,
          executionAuthorized: false as const,
        })),
      ),
    );

    if (
      this.routes.length !== 30 ||
      this.routes.filter((route) => route.topology === "INTRA_EXCHANGE").length !== 5 ||
      this.routes.filter((route) => route.topology === "CROSS_EXCHANGE").length !== 25
    ) {
      throw new Error("Spot-perpetual venue topology invariant failed.");
    }
  }

  getRoutes(): readonly SpotPerpetualVenueRoute[] {
    return immutable(this.routes);
  }

  supports(spotExchange: string, perpetualExchange: string): boolean {
    const spot = spotExchange.trim().toLowerCase();
    const perpetual = perpetualExchange.trim().toLowerCase();
    return this.routes.some((route) =>
      route.spotExchange === spot && route.perpetualExchange === perpetual,
    );
  }

  getSnapshot(now = Date.now()): DerivativeVenueCapabilitySnapshot {
    return immutable({
      version: "167.0",
      generatedAt: now,
      spotVenues: [...SPOT_PERPETUAL_SPOT_VENUES],
      perpetualVenues: [...SPOT_PERPETUAL_PERPETUAL_VENUES],
      routes: this.routes,
      summary: {
        spotVenues: 6,
        perpetualVenues: 5,
        totalVenueCombinationsPerSharedMarket: 30,
        intraExchangeCombinationsPerSharedMarket: 5,
        crossExchangeCombinationsPerSharedMarket: 25,
      },
      safety: {
        cashAndCarryOnly: true,
        reverseBasisAllowed: false,
        shortSpotAllowed: false,
        oneWayPerpetualRequired: true,
        paperFirst: true,
        liveExecutionAllowed: false,
        orderSubmissionAllowed: false,
      },
    });
  }
}

function immutable<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const nested of Object.values(value)) {
    deepFreeze(nested);
  }
  return Object.freeze(value);
}

export const derivativeVenueCapabilityRegistry =
  new DerivativeVenueCapabilityRegistry();
