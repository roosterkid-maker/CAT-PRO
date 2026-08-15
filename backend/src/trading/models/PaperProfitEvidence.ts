export interface PaperPriceCredibilityEvidence {
  schemaVersion: 1;

  guard:
    "CROSS_VENUE_PRICE_CREDIBILITY_V1";

  outcome:
    "PASSED";

  evaluatedAt: number;

  market: string;

  buyExchange: string;

  sellExchange: string;

  freshVenueCount: number;

  freshVenues: readonly string[];

  candidatePriceRatio: number;

  currentPriceRatio: number;

  medianMidPrice: number | null;

  buyDeviationFromMedianPercent: number | null;

  sellDeviationFromMedianPercent: number | null;

  maximumPriceRatio: number;

  maximumCandidatePriceDriftPercent: number;

  maximumConsensusDeviationPercent: number;

  reasons: readonly string[];
}

export interface PaperExecutionQualityEvidence {
  schemaVersion: 1;

  buyRequestedPrice: number;

  buyAverageFillPrice: number;

  sellRequestedPrice: number;

  sellAverageFillPrice: number;

  buyAdverseSlippagePercent: number;

  sellAdverseSlippagePercent: number;

  combinedAdverseSlippagePercent: number;
}

/**
 * Durable proof that Strategy #1 was rebound to the latest two exchange
 * books immediately before its PAPER lifecycle.  This is deliberately
 * separate from realized fill evidence: the reserve and safety buffer are
 * admission stresses, not invented exchange fills.
 */
export interface PaperExecutionStressEvidence {
  schemaVersion: 1;

  guard:
    "STRATEGY_ONE_PAPER_STRESS_V1";

  outcome:
    "PASSED";

  evaluatedAt: number;

  sourceOpportunityAgeMs: number;

  buyBookTimestamp: number;

  sellBookTimestamp: number;

  timestampSkewMs: number;

  quantity: number;

  buyFillPercent: number;

  sellFillPercent: number;

  buyVwap: number;

  sellVwap: number;

  buyLimitPrice: number;

  sellLimitPrice: number;

  combinedDepthSlippagePercent: number;

  adverseMoveReservePercentPerLeg: number;

  tradingFees: number;

  safetyBuffer: number;

  postStressNetProfit: number;

  postStressNetProfitPercent: number;

  minimumNetProfitPercent: number;

  reasons: readonly string[];

  paperOnly: true;

  liveExecutionAllowed: false;

  orderSubmissionAllowed: false;
}

export interface PaperCapitalConversionEvidence {
  schemaVersion: 1;

  accountCurrency: "INR";

  marketQuoteAsset: string;

  requestedCapitalInr: number;

  allocatedQuoteCapital: number;

  quoteToInrRate: number;

  inrToQuoteEvidenceId: string;

  quoteToInrEvidenceId: string;

  generatedAt: number;

  expiresAt: number;
}

export interface PaperVdaTaxWithholdingLegEvidence {
  side: "BUY" | "SELL";

  exchange: string;

  applicable: boolean;

  basis:
    | "NOT_APPLICABLE"
    | "GROSS_SELL_CONSIDERATION"
    | "NET_CRYPTO_TO_CRYPTO_CONSIDERATION"
    | "NET_UNOCOIN_SELL_CONSIDERATION";

  consideration: number;

  ratePercent: number;

  withheld: number;

  reason: string;
}

/**
 * PAPER-only cash-withholding evidence. Section 194S TDS is kept separate
 * from exchange fees and economic P&L because it is normally claimable as a
 * tax credit, while still reducing immediately deployable trading cash.
 */
export interface PaperVdaTaxWithholdingEvidence {
  schemaVersion: 1;

  policy:
    "MODELED_SECTION_194S_V1";

  currency: string;

  thresholdTreatment:
    "ASSUMED_EXCEEDED_FOR_CONSERVATIVE_PAPER";

  ratePercent: 1;

  legs:
    readonly PaperVdaTaxWithholdingLegEvidence[];

  totalWithheld: number;

  claimableTaxCredit: true;

  economicProfitDeduction: 0;

  generatedAt: number;

  paperOnly: true;

  liveExecutionAllowed: false;

  orderSubmissionAllowed: false;
}
