export interface DiscoveryVenueBook {
  readonly exchange: string;

  readonly market: string;

  readonly baseAsset: string;

  readonly quoteAsset: string;

  readonly bidPrice: number;

  readonly bidQuantity: number;

  readonly askPrice: number;

  readonly askQuantity: number;

  readonly timestamp: number;
}

export interface CrossExchangeDiscoveryRoute {
  readonly id: string;

  readonly kind:
    "CROSS_EXCHANGE_SPOT_ROUTE";

  readonly market: string;

  readonly buyExchange: string;

  readonly sellExchange: string;

  readonly buyAskPrice: number;

  readonly buyAskQuantity: number;

  readonly sellBidPrice: number;

  readonly sellBidQuantity: number;

  readonly maximumTopOfBookQuantity: number;

  readonly grossSpreadPercent: number;

  readonly economicallyQualified: false;

  readonly executionAuthorized: false;
}

export interface TriangularDiscoveryLeg {
  readonly market: string;

  readonly fromAsset: string;

  readonly toAsset: string;

  readonly action:
    | "SELL_BASE"
    | "BUY_BASE";

  readonly referenceRate: number;

  readonly maximumInputQuantity: number;

  readonly timestamp: number;
}

export interface TriangularDiscoveryPath {
  readonly id: string;

  readonly kind:
    "TRIANGULAR_SPOT_PATH";

  readonly exchange: string;

  readonly startAsset: string;

  readonly assets:
    readonly [
      string,
      string,
      string,
      string,
    ];

  readonly legs:
    readonly [
      TriangularDiscoveryLeg,
      TriangularDiscoveryLeg,
      TriangularDiscoveryLeg,
    ];

  readonly referenceGrossMultiplier: number;

  readonly feesApplied: false;

  readonly marketRulesApplied: false;

  readonly economicallyQualified: false;

  readonly executionAuthorized: false;
}

export interface DynamicOpportunityDiscoverySnapshot {
  readonly generatedAt: number;

  readonly version: "24.0";

  readonly mode:
    "READ_ONLY_DYNAMIC_DISCOVERY";

  readonly summary: {
    readonly cachedQuotes: number;
    readonly freshExecutableBooks: number;
    readonly rejectedQuotes: number;
    readonly exchanges: number;
    readonly normalizedSpotMarkets: number;
    readonly sharedSpotMarkets: number;
    readonly crossExchangeRoutes: number;
    readonly triangularPaths: number;
  };

  readonly books:
    readonly DiscoveryVenueBook[];

  readonly crossExchangeRoutes:
    readonly CrossExchangeDiscoveryRoute[];

  readonly triangularPaths:
    readonly TriangularDiscoveryPath[];

  readonly safety: {
    readonly marketCacheMutationAllowed: false;
    readonly freshnessThresholdMutationAllowed: false;
    readonly profitabilityQualificationAllowed: false;
    readonly capitalMutationAllowed: false;
    readonly paperExecutionAllowed: false;
    readonly liveExecutionAllowed: false;
    readonly orderSubmissionAllowed: false;
  };

  readonly notes:
    readonly string[];
}
