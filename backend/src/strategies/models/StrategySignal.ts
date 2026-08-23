import type {
  StrategyEvidenceStatus,
} from "./StrategyEvidenceStatus";

import type {
  StrategyId,
} from "./StrategyMetadata";

import type {
  ExchangeFeeEvidenceSource,
} from "../../arbitrage/models/FeeModel";

export interface CrossExchangeArbitrageSignalEvidence {
  readonly market:
    string;

  readonly buyExchange:
    string;

  readonly sellExchange:
    string;

  readonly buyPrice:
    number;

  readonly sellPrice:
    number;

  readonly executableQuantity:
    number;

  readonly netProfit:
    number;

  readonly netProfitPercent:
    number;

  readonly estimatedFees:
    number;

  readonly rawSpread:
    number;

  readonly rawSpreadPercent:
    number;

  readonly liquidityScore:
    number;

  readonly freshnessScore:
    number;

  readonly decision:
    | "EXECUTE"
    | "REVIEW"
    | "SKIP";

  readonly quotesAreFresh:
    boolean;

  readonly enoughLiquidity:
    boolean;

  readonly opportunityTimestamp:
    number;
}

export interface CrossExchangeArbitrageStrategySignal {
  readonly id:
    string;

  readonly strategyId:
    StrategyId;

  readonly kind:
    "CROSS_EXCHANGE_ARBITRAGE_OPPORTUNITY";

  readonly evidenceStatus:
    Extract<
      StrategyEvidenceStatus,
      "AVAILABLE"
    >;

  readonly source:
    "OpportunityService";

  readonly sourceOpportunityId:
    string;

  readonly sourceSnapshotGeneratedAt:
    number;

  readonly generatedAt:
    number;

  readonly observedAt:
    number;

  readonly expiresAt:
    number;

  readonly executionAuthorized:
    false;

  readonly automaticExecutionAllowed:
    false;

  readonly evidence:
    CrossExchangeArbitrageSignalEvidence;
}

export type CrossExchangeMarketMakingSide =
  | "BID"
  | "ASK";

export interface CrossExchangeMarketMakingFeeEvidence {
  readonly percent:
    number;

  readonly source:
    ExchangeFeeEvidenceSource;

  readonly market:
    string | null;

  readonly synchronizedAt:
    number | null;

  readonly expiresAt:
    number | null;
}

export interface CrossExchangeMarketMakingSafePriceEvidence {
  readonly market:
    string;

  readonly side:
    CrossExchangeMarketMakingSide;

  readonly makerExchange:
    string;

  readonly hedgeExchange:
    string;

  readonly makerBestBidPrice:
    number;

  readonly makerBestBidQuantity:
    number;

  readonly makerBestAskPrice:
    number;

  readonly makerBestAskQuantity:
    number;

  readonly hedgeReferenceSide:
    | "BID"
    | "ASK";

  readonly hedgeReferencePrice:
    number;

  readonly hedgeReferenceQuantity:
    number;

  readonly economicBoundaryPrice:
    number;

  readonly passiveBoundaryPrice:
    number;

  readonly safeMakerPrice:
    number;

  readonly priceStep:
    number;

  readonly minimumRetainedEdgePercent:
    number;

  readonly modeledRetainedEdgePercent:
    number;

  readonly makerFee:
    CrossExchangeMarketMakingFeeEvidence;

  readonly hedgeTakerFee:
    CrossExchangeMarketMakingFeeEvidence;

  readonly makerQuoteTimestamp:
    number;

  readonly hedgeQuoteTimestamp:
    number;

  readonly makerQuoteAgeMs:
    number;

  readonly hedgeQuoteAgeMs:
    number;

  readonly timestampSkewMs:
    number;

  readonly maximumPairSkewMs:
    number;

  readonly makerCapabilitySynchronizedAt:
    number;

  readonly maximumCapabilityAgeMs:
    number;

  readonly postOnlyRequired:
    true;

  readonly configuredMakerQuantity:
    number | null;

  readonly pricingModel:
    "ONE_BASE_UNIT_QUOTE_VALUE_PERCENT_V21_1";

  readonly quantitySizing:
    | "NOT_EVALUATED_V21_1"
    | "CONFIGURED_MARKET_QUANTITY_V60";

  readonly queuePosition:
    "NOT_EVALUATED_V21_1";

  readonly fillProbability:
    "NOT_EVALUATED_V21_1";

  readonly makerPlacement:
    "NOT_SIMULATED_V21_1";

  readonly hedgeSlippage:
    "NOT_EVALUATED_V21_1";
}

export interface CrossExchangeMarketMakingStrategySignal {
  readonly id:
    string;

  readonly strategyId:
    "cross-exchange-market-making";

  readonly kind:
    "XEMM_SAFE_MAKER_PRICE";

  readonly evidenceStatus:
    Extract<
      StrategyEvidenceStatus,
      "AVAILABLE"
    >;

  readonly source:
    "XEMMPriceEngine";

  readonly generatedAt:
    number;

  readonly observedAt:
    number;

  readonly expiresAt:
    number;

  readonly executionAuthorized:
    false;

  readonly automaticExecutionAllowed:
    false;

  readonly evidence:
    CrossExchangeMarketMakingSafePriceEvidence;
}

export interface TriangularArbitrageLegSignalEvidence {
  readonly market: string;
  readonly fromAsset: string;
  readonly toAsset: string;
  readonly action: "SELL_BASE" | "BUY_BASE";
  readonly inputQuantity: number;
  readonly tradedInputQuantity: number;
  readonly outputBeforeFee: number;
  readonly feePercent: number;
  readonly feeAmount: number;
  readonly outputAfterFee: number;
  readonly feeAsset: string;
  readonly averageFillPrice: number;
  readonly topOfBookPrice: number;
  readonly depthSlippagePercent: number;
  readonly roundingDustInputQuantity: number;
  readonly consumedDepthLevels: number;
  readonly orderBookTimestamp: number;
  readonly orderBookAgeMs: number;
  readonly topOfBookMaximumInput: number;
  readonly capabilitySynchronizedAt: number;
  readonly executionPolicy: "FOK_OR_IOC_LIMIT_FUTURE_ONLY";
}

export interface TriangularArbitrageSignalEvidence {
  readonly pathId: string;
  readonly exchange: string;
  readonly startAsset: string;
  readonly assets: readonly [string, string, string, string];
  readonly initialInputQuantity: number;
  readonly finalOutputQuantity: number;
  readonly expectedNetProfitQuantity: number;
  readonly expectedNetProfitPercent: number;
  readonly netProfitQuantity: number;
  readonly netProfitPercent: number;
  readonly stressNetProfitQuantity: number;
  readonly stressNetProfitPercent: number;
  readonly absoluteNetProfitInr: number;
  readonly tdsCapitalLockInr: number;
  readonly reserveDragPercent: number;
  readonly maximumBookSkewMs: number;
  readonly minimumNetProfitPercent: number;
  readonly referenceGrossMultiplier: number;
  readonly computedNetMultiplier: number;
  readonly legs: readonly TriangularArbitrageLegSignalEvidence[];
  readonly feesApplied: true;
  readonly marketRulesApplied: true;
  readonly topOfBookDepthApplied: true;
  readonly fullDepthVwapApplied: true;
  readonly stressTestApplied: true;
  readonly tdsTreatedAsCapitalLock: true;
  readonly lifecycleOwner: "CENTRAL_SHARED_ORCHESTRATOR";
  readonly capitalOwner: "ACLA_STRATEGY_SCOPED_SUBLEDGER";
}

export interface TriangularArbitrageStrategySignal {
  readonly id: string;
  readonly strategyId: "triangular-arbitrage";
  readonly kind: "TRIANGULAR_ARBITRAGE_SHADOW_PATH";
  readonly evidenceStatus: Extract<StrategyEvidenceStatus, "AVAILABLE">;
  readonly source: "DynamicOpportunityDiscovery";
  readonly sourceSnapshotGeneratedAt: number;
  readonly generatedAt: number;
  readonly observedAt: number;
  readonly expiresAt: number;
  readonly executionAuthorized: false;
  readonly automaticExecutionAllowed: false;
  readonly evidence: TriangularArbitrageSignalEvidence;
}

export interface SpotPerpetualBasisSignalEvidence {
  readonly spotExchange: string;
  readonly perpetualExchange: string;
  readonly market: string;
  readonly direction: "LONG_SPOT_SHORT_PERPETUAL";
  readonly quantity: number;
  readonly spotBestAsk: number;
  readonly spotBuyVwap: number;
  readonly perpetualBestBid: number;
  readonly perpetualSellVwap: number;
  readonly grossBasisPercent: number;
  readonly spotSlippagePercent: number;
  readonly perpetualSlippagePercent: number;
  readonly spotFeePercent: number;
  readonly derivativeFeePercent: number;
  readonly entryFeeQuote: number;
  readonly exitFeeReserveQuote: number;
  readonly roundTripFeeQuote: number;
  readonly totalFeeQuote: number;
  readonly fundingRate: number;
  readonly nextFundingTime: number;
  readonly expectedFundingQuote: number;
  readonly expectedFundingIsGuaranteed: false;
  readonly fundingQualificationCreditQuote: number;
  readonly positiveFundingExcludedFromQualification: boolean;
  readonly slippageBufferQuote: number;
  readonly spotSlippageBufferPercent: number;
  readonly perpetualSlippageBufferPercent: number;
  readonly safetyBufferQuote: number;
  readonly expectedNetQuote: number;
  readonly expectedNetPercent: number;
  readonly minimumExpectedNetPercent: number;
  readonly closeAtOrBelowAbsoluteBasisPercent: number;
  readonly nextOpeningDelayMs: number;
  readonly perpetualLeverage: 1;
  readonly spotBookTimestamp: number;
  readonly derivativeBookTimestamp: number;
  readonly derivativeTickerTimestamp: number;
  readonly maximumObservedSkewMs: number;
  readonly fullDepthApplied: true;
  readonly marketRulesApplied: true;
  readonly feesApplied: true;
  readonly executionReadinessBlockers: readonly (
    | "POSITION_EVIDENCE_MISSING"
    | "MARGIN_EVIDENCE_MISSING"
    | "LIQUIDATION_CONTROL_MISSING"
    | "REDUCE_ONLY_UNVERIFIED"
    | "DERIVATIVE_ADAPTER_MISSING"
  )[];
}

export interface SpotPerpetualBasisStrategySignal {
  readonly id: string;
  readonly strategyId: "spot-perpetual-basis-arbitrage";
  readonly kind: "SPOT_PERPETUAL_BASIS_SHADOW_OPPORTUNITY";
  readonly evidenceStatus: Extract<StrategyEvidenceStatus, "AVAILABLE">;
  readonly source: "DerivativeMarketData";
  readonly sourceSnapshotGeneratedAt: number;
  readonly generatedAt: number;
  readonly observedAt: number;
  readonly expiresAt: number;
  readonly executionAuthorized: false;
  readonly automaticExecutionAllowed: false;
  readonly evidence: SpotPerpetualBasisSignalEvidence;
}

export interface FundingRateArbitrageSignalEvidence {
  readonly market: string;
  readonly longExchange: string;
  readonly shortExchange: string;
  readonly quantity: number;
  readonly longFundingRate: number;
  readonly shortFundingRate: number;
  readonly fundingDifferentialPercent: number;
  readonly singlePeriodExpectedFundingQuote: number;
  readonly singlePeriodExpectedFundingPercent: number;
  readonly expectedFundingQuote: number;
  readonly expectedFundingGuaranteed: false;
  readonly projectedFundingRatePersistenceRequired: true;
  readonly modeledFundingPeriods: number;
  readonly minimumQualifyingFundingPeriods: number;
  readonly maximumFundingPeriodsToCapture: number;
  readonly projectedHoldingTimeMs: number;
  readonly longEntryBestAsk: number;
  readonly longEntryVwap: number;
  readonly shortEntryBestBid: number;
  readonly shortEntryVwap: number;
  readonly entryBasisCostQuote: number;
  readonly favorableEntryBasisExcluded: true;
  readonly roundTripFeeQuote: number;
  readonly safetyBufferQuote: number;
  readonly expectedNetQuote: number;
  readonly expectedNetPercent: number;
  readonly minimumExpectedNetPercent: number;
  readonly fundingIntervalMinutes: number;
  readonly nextFundingTimeLong: number;
  readonly nextFundingTimeShort: number;
  readonly fundingTimeSkewMs: number;
  readonly maximumObservedEvidenceSkewMs: number;
  readonly fullDepthApplied: true;
  readonly marketRulesApplied: true;
  readonly explicitFeesApplied: true;
  readonly roundTripFeesReserved: true;
  readonly executionReadinessBlockers: readonly (
    | "POSITION_EVIDENCE_MISSING"
    | "MARGIN_EVIDENCE_MISSING"
    | "LIQUIDATION_CONTROL_MISSING"
    | "REDUCE_ONLY_UNVERIFIED"
    | "DERIVATIVE_ADAPTER_MISSING"
  )[];
}

export interface FundingRateArbitrageStrategySignal {
  readonly id: string;
  readonly strategyId: "funding-rate-arbitrage";
  readonly kind: "FUNDING_RATE_ARBITRAGE_SHADOW_OPPORTUNITY";
  readonly evidenceStatus: Extract<StrategyEvidenceStatus, "AVAILABLE">;
  readonly source: "DerivativeMarketData";
  readonly sourceSnapshotGeneratedAt: number;
  readonly generatedAt: number;
  readonly observedAt: number;
  readonly expiresAt: number;
  readonly executionAuthorized: false;
  readonly automaticExecutionAllowed: false;
  readonly evidence: FundingRateArbitrageSignalEvidence;
}

export interface PerpetualPerpetualArbitrageSignalEvidence {
  readonly market: string;
  readonly longExchange: string;
  readonly shortExchange: string;
  readonly quantity: number;
  readonly longBestAsk: number;
  readonly longEntryVwap: number;
  readonly shortBestBid: number;
  readonly shortEntryVwap: number;
  readonly grossDislocationQuote: number;
  readonly grossDislocationPercent: number;
  readonly nextFundingTimeLong: number;
  readonly nextFundingTimeShort: number;
  readonly convergenceGuaranteed: false;
  readonly roundTripFeeQuote: number;
  readonly adverseFundingReserveQuote: number;
  readonly adverseFundingPeriodsReserved: number;
  readonly safetyBufferQuote: number;
  readonly expectedNetQuote: number;
  readonly expectedNetPercent: number;
  readonly minimumExpectedNetPercent: number;
  readonly maximumObservedEvidenceSkewMs: number;
  readonly fullDepthApplied: true;
  readonly marketRulesApplied: true;
  readonly explicitFeesApplied: true;
  readonly roundTripFeesReserved: true;
  readonly executionReadinessBlockers: readonly (
    | "POSITION_EVIDENCE_MISSING"
    | "MARGIN_EVIDENCE_MISSING"
    | "LIQUIDATION_CONTROL_MISSING"
    | "REDUCE_ONLY_UNVERIFIED"
    | "DERIVATIVE_ADAPTER_MISSING"
  )[];
}

export interface PerpetualPerpetualArbitrageStrategySignal {
  readonly id: string;
  readonly strategyId: "perpetual-perpetual-arbitrage";
  readonly kind: "PERPETUAL_PERPETUAL_ARBITRAGE_SHADOW_OPPORTUNITY";
  readonly evidenceStatus: Extract<StrategyEvidenceStatus, "AVAILABLE">;
  readonly source: "DerivativeMarketData";
  readonly sourceSnapshotGeneratedAt: number;
  readonly generatedAt: number;
  readonly observedAt: number;
  readonly expiresAt: number;
  readonly executionAuthorized: false;
  readonly automaticExecutionAllowed: false;
  readonly evidence: PerpetualPerpetualArbitrageSignalEvidence;
}

export interface DynamicMarketMakingSignalEvidence {
  readonly exchange: string;
  readonly market: string;
  readonly fairPrice: number;
  readonly unadjustedFairPrice: number;
  readonly midPrice: number;
  readonly microprice: number;
  readonly bookSpreadPercent: number;
  readonly depthImbalance: number;
  readonly realizedVolatilityPercent: number;
  readonly volatilitySampleCount: number;
  readonly marketRegime: "CALM" | "NORMAL" | "VOLATILE";
  readonly regimeSpreadMultiplier: number;
  readonly publicTradeEvidenceSource: "EXCHANGE_PUBLIC_TRADE_TAPE";
  readonly publicTradeSampleCount: number;
  readonly publicTradeLookbackMs: number;
  readonly aggressorFlowImbalance: number;
  readonly tradeFlowFairValueSkewPercent: number;
  readonly adverseSelectionSpreadPercent: number;
  readonly liquidityCoverageMultiple: number;
  readonly liquiditySpreadPenaltyPercent: number;
  readonly bidFillProbabilityPercent: number;
  readonly askFillProbabilityPercent: number;
  readonly bidQuotePrice: number;
  readonly askQuotePrice: number;
  readonly quoteQuantity: number;
  readonly targetQuoteQuantity: number;
  readonly adaptiveHalfSpreadPercent: number;
  readonly modeledGrossCapturePercent: number;
  readonly makerRoundTripFeePercent: number;
  readonly safetyBufferPercent: number;
  readonly modeledNetCapturePercent: number;
  readonly modeledCaptureGuaranteed: false;
  readonly priceStep: number;
  readonly quantityStep: number;
  readonly passiveQuotesEnforced: true;
  readonly inventoryAdjustmentApplied: true;
  readonly inventoryEvidenceSource: "AUTHENTICATED_EXCHANGE_BALANCE_SNAPSHOTS";
  readonly inventorySynchronizedAt: number;
  readonly inventoryAgeMs: number;
  readonly inventoryBaseAsset: string;
  readonly inventoryQuoteAsset: string;
  readonly inventoryBaseTotal: number;
  readonly inventoryQuoteTotal: number;
  readonly inventoryBaseAvailable: number;
  readonly inventoryQuoteAvailable: number;
  readonly inventoryBaseValueQuote: number;
  readonly inventoryTotalValueQuote: number;
  readonly inventoryBaseSharePercent: number;
  readonly inventoryTargetBasePercent: number;
  readonly inventoryDeviationPercent: number;
  readonly inventorySkewPercent: number;
  readonly queuePositionKnown: false;
  readonly fillProbabilityKnown: true;
  readonly fullDepthApplied: true;
  readonly marketRulesApplied: true;
  readonly explicitFeesApplied: true;
  readonly executionReadinessBlockers: readonly (
    | "QUEUE_POSITION_UNKNOWN"
    | "POST_ONLY_EXECUTION_UNVERIFIED"
  )[];
}

export interface DynamicMarketMakingStrategySignal {
  readonly id: string;
  readonly strategyId: "dynamic-market-making";
  readonly kind: "DYNAMIC_MARKET_MAKING_SHADOW_QUOTE_PLAN";
  readonly evidenceStatus: Extract<StrategyEvidenceStatus, "AVAILABLE">;
  readonly source: "OrderBookService";
  readonly sourceSnapshotGeneratedAt: number;
  readonly generatedAt: number;
  readonly observedAt: number;
  readonly expiresAt: number;
  readonly executionAuthorized: false;
  readonly automaticExecutionAllowed: false;
  readonly evidence: DynamicMarketMakingSignalEvidence;
}

export interface StatisticalArbitrageSignalEvidence {
  readonly pairId: string;
  readonly exchange: string;
  readonly leftMarket: string;
  readonly rightMarket: string;
  readonly direction: "SHORT_LEFT_LONG_RIGHT" | "LONG_LEFT_SHORT_RIGHT";
  readonly baselineSampleCount: number;
  readonly baselineExcludesCurrentObservation: true;
  readonly hedgeBeta: number;
  readonly returnCorrelation: number;
  readonly currentSpread: number;
  readonly baselineSpreadMean: number;
  readonly baselineSpreadStandardDeviation: number;
  readonly zScore: number;
  readonly entryZScoreThreshold: number;
  readonly nextFundingTimeLong: number;
  readonly nextFundingTimeShort: number;
  readonly longMarket: string;
  readonly shortMarket: string;
  readonly longQuantity: number;
  readonly shortQuantity: number;
  readonly longEntryVwap: number;
  readonly shortEntryVwap: number;
  readonly modeledGrossReversionQuote: number;
  readonly roundTripFeeQuote: number;
  readonly adverseFundingReserveQuote: number;
  readonly safetyBufferQuote: number;
  readonly modeledNetQuote: number;
  readonly modeledNetPercent: number;
  readonly modeledReversionGuaranteed: false;
  readonly cointegrationVerified: false;
  readonly correlationImpliesCausation: false;
  readonly fullDepthApplied: true;
  readonly marketRulesApplied: true;
  readonly explicitFeesApplied: true;
  readonly executionReadinessBlockers: readonly (
    | "POSITION_EVIDENCE_MISSING"
    | "MARGIN_EVIDENCE_MISSING"
    | "LIQUIDATION_CONTROL_MISSING"
    | "REDUCE_ONLY_UNVERIFIED"
    | "DERIVATIVE_ADAPTER_MISSING"
  )[];
}

export interface StatisticalArbitrageStrategySignal {
  readonly id: string;
  readonly strategyId: "statistical-arbitrage";
  readonly kind: "STATISTICAL_ARBITRAGE_SHADOW_PAIR";
  readonly evidenceStatus: Extract<StrategyEvidenceStatus, "AVAILABLE">;
  readonly source: "DerivativeMarketData";
  readonly sourceSnapshotGeneratedAt: number;
  readonly generatedAt: number;
  readonly observedAt: number;
  readonly expiresAt: number;
  readonly executionAuthorized: false;
  readonly automaticExecutionAllowed: false;
  readonly evidence: StatisticalArbitrageSignalEvidence;
}

export type StrategySignal =
  | CrossExchangeArbitrageStrategySignal
  | CrossExchangeMarketMakingStrategySignal
  | TriangularArbitrageStrategySignal
  | SpotPerpetualBasisStrategySignal
  | FundingRateArbitrageStrategySignal
  | PerpetualPerpetualArbitrageStrategySignal
  | DynamicMarketMakingStrategySignal
  | StatisticalArbitrageStrategySignal;

export function immutableStrategySignal(
  signal:
    StrategySignal,
): StrategySignal {
  return deepFreeze(
    structuredClone(
      signal,
    ),
  );
}

function deepFreeze<T>(
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
    const nestedValue
    of Object.values(
      value,
    )
  ) {
    deepFreeze(
      nestedValue,
    );
  }

  return Object.freeze(
    value,
  );
}
