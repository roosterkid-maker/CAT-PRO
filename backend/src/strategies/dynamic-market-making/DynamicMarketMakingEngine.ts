import {getExchangeFeeEvidence} from "../../arbitrage/config/fees";
import type {ExchangeFeeEvidence} from "../../arbitrage/models/FeeModel";
import type {ExchangeMarketCapability} from "../../execution/capabilities/models/ExchangeCapability";
import {exchangeCapabilityService} from "../../execution/capabilities/services/ExchangeCapabilityService";
import type {OrderBook} from "../../orderbook/models/OrderBook";
import {tradingAccountService, type ExchangeBalanceSnapshot} from "../../trading/account/TradingAccountService";
import {crossExchangeMarketMakingPublicTradeTapeService, type CrossExchangeMarketMakingPublicTrade} from "../cross-exchange-market-making/CrossExchangeMarketMakingPublicTradeTapeService";
import type {DynamicMarketMakingSignalEvidence} from "../models/StrategySignal";
import type {DynamicMarketMakingConfiguration} from "./DynamicMarketMakingConfiguration";

export type DynamicMarketMakingBlocker =
  | "BOOK_STALE"
  | "BOOK_INVALID"
  | "FULL_DEPTH_MISSING"
  | "CAPABILITY_MISSING"
  | "CAPABILITY_STALE"
  | "FEE_EVIDENCE_MISSING"
  | "INVENTORY_EVIDENCE_MISSING"
  | "INVENTORY_EVIDENCE_STALE"
  | "INVENTORY_CAPACITY_INSUFFICIENT"
  | "PUBLIC_TRADE_EVIDENCE_INSUFFICIENT"
  | "EMPIRICAL_FILL_PROBABILITY_THRESHOLD_NOT_MET"
  | "POST_ONLY_UNSUPPORTED"
  | "HISTORY_INSUFFICIENT"
  | "MARKET_RULES_INCOMPLETE"
  | "QUOTE_INVALID"
  | "QUANTITY_INVALID"
  | "MINIMUM_NOTIONAL_NOT_MET"
  | "MODELED_NET_THRESHOLD_NOT_MET";

export interface DynamicMarketMakingBookDiagnostics {
  readonly bestBid: number;
  readonly bestAsk: number;
  readonly midPrice: number;
  readonly bookSpreadPercent: number;
  readonly bidDepthQuantity: number;
  readonly askDepthQuantity: number;
  readonly volatilitySampleCount: number;
  readonly minimumVolatilitySamples: number;
}

export interface DynamicMarketMakingCapabilityDiagnostics {
  readonly baseAsset: string;
  readonly quoteAsset: string;
  readonly postOnlySupported: boolean;
  readonly capabilitySynchronizedAt: number;
  readonly priceStep: number | null;
  readonly quantityStep: number | null;
  readonly minimumNotional: number | null;
  readonly makerFeePercent: number;
}

export interface DynamicMarketMakingInventoryDiagnostics {
  readonly source: "AUTHENTICATED_EXCHANGE_BALANCE_SNAPSHOTS";
  readonly synchronizedAt: number;
  readonly ageMs: number;
  readonly baseAsset: string;
  readonly quoteAsset: string;
  readonly baseTotal: number;
  readonly quoteTotal: number;
  readonly baseAvailable: number;
  readonly quoteAvailable: number;
  readonly baseValueQuote: number | null;
  readonly totalValueQuote: number | null;
  readonly baseSharePercent: number | null;
  readonly targetBasePercent: number;
  readonly deviationPercent: number | null;
  readonly skewPercent: number | null;
  readonly unadjustedFairPrice: number | null;
  readonly fairPrice: number | null;
}

export interface DynamicMarketMakingFillQualityDiagnostics {
  readonly source: "EXCHANGE_PUBLIC_TRADE_TAPE";
  readonly sampleCount: number;
  readonly minimumSamples: number;
  readonly lookbackMs: number;
  readonly aggressorFlowImbalance: number | null;
  readonly tradeFlowFairValueSkewPercent: number | null;
  readonly adverseSelectionSpreadPercent: number | null;
  readonly liquidityCoverageMultiple: number | null;
  readonly minimumLiquidityCoverageMultiple: number;
  readonly liquiditySpreadPenaltyPercent: number | null;
  readonly bidFillProbabilityPercent: number | null;
  readonly askFillProbabilityPercent: number | null;
  readonly minimumFillProbabilityPercent: number;
  readonly queuePositionKnown: false;
}

export interface DynamicMarketMakingRouteEconomics {
  readonly bidQuotePrice: number;
  readonly askQuotePrice: number;
  readonly quoteQuantity: number;
  readonly targetQuoteQuantity: number;
  readonly adaptiveHalfSpreadPercent: number;
  readonly modeledGrossCapturePercent: number;
  readonly makerRoundTripFeePercent: number;
  readonly safetyBufferPercent: number;
  readonly modeledNetCapturePercent: number;
  readonly minimumModeledNetCapturePercent: number;
  readonly thresholdShortfallPercent: number;
  readonly marketRegime: "CALM" | "NORMAL" | "VOLATILE";
  readonly realizedVolatilityPercent: number;
  readonly modeledCaptureGuaranteed: false;
}

export interface DynamicMarketMakingDiagnostics {
  readonly book: DynamicMarketMakingBookDiagnostics | null;
  readonly capability: DynamicMarketMakingCapabilityDiagnostics | null;
  readonly inventory: DynamicMarketMakingInventoryDiagnostics | null;
  readonly fillQuality: DynamicMarketMakingFillQualityDiagnostics | null;
  readonly economics: DynamicMarketMakingRouteEconomics | null;
}

export interface DynamicMarketMakingAssessment {
  readonly id: string;
  readonly exchange: string;
  readonly market: string;
  readonly status: "QUALIFIED" | "BLOCKED";
  readonly blockers: readonly DynamicMarketMakingBlocker[];
  readonly diagnostics: DynamicMarketMakingDiagnostics;
  readonly evidence: DynamicMarketMakingSignalEvidence | null;
  readonly executionAuthorized: false;
  readonly automaticExecutionAllowed: false;
}

export interface DynamicMarketMakingSnapshot {
  readonly generatedAt: number;
  readonly evaluatedMarkets: number;
  readonly qualifiedMarkets: number;
  readonly blockedMarkets: number;
  readonly assessments: readonly DynamicMarketMakingAssessment[];
  readonly safety: {
    readonly inventoryEvidenceAvailable: boolean;
    readonly inventoryAdjustmentApplied: boolean;
    readonly queuePositionKnown: false;
    readonly fillProbabilityKnown: boolean;
    readonly modeledCaptureGuaranteed: false;
    readonly shadowOnly: true;
    readonly paperExecutionAllowed: false;
    readonly liveExecutionAllowed: false;
    readonly orderSubmissionAllowed: false;
  };
}

export interface DynamicMarketMakingDependencies {
  getCapability(exchange: string, market: string): ExchangeMarketCapability | null;
  getFee(exchange: string, market: string): ExchangeFeeEvidence | null;
  getBalance(exchange: string, asset: string): ExchangeBalanceSnapshot | null;
  watchPublicTrades(exchange: string, markets: readonly string[]): void;
  getPublicTrades(exchange: string, market: string, afterExclusive: number, throughInclusive: number): readonly CrossExchangeMarketMakingPublicTrade[];
}

interface MidSample { readonly timestamp: number; readonly mid: number; }

const DEFAULT_DEPENDENCIES: DynamicMarketMakingDependencies = {
  getCapability: (exchange, market) => exchangeCapabilityService.getCachedCapability(exchange, market, "spot"),
  getFee: (exchange, market) => getExchangeFeeEvidence(exchange, market),
  getBalance: (exchange, asset) => tradingAccountService.getExchangeBalance(exchange, asset),
  watchPublicTrades: (exchange, markets) => crossExchangeMarketMakingPublicTradeTapeService.watch(exchange, markets),
  getPublicTrades: (exchange, market, afterExclusive, throughInclusive) =>
    crossExchangeMarketMakingPublicTradeTapeService.getTrades(exchange, market, afterExclusive, throughInclusive),
};

export class DynamicMarketMakingEngine {
  private readonly dependencies: DynamicMarketMakingDependencies;
  private readonly histories = new Map<string, MidSample[]>();

  constructor(dependencies: Partial<DynamicMarketMakingDependencies> = {}) {
    this.dependencies = {...DEFAULT_DEPENDENCIES, ...dependencies};
  }

  evaluate(
    books: readonly OrderBook[],
    configuration: DynamicMarketMakingConfiguration,
    now = Date.now(),
  ): DynamicMarketMakingSnapshot {
    const candidates = configuration.enabled
      ? books.filter((book) => configuration.exchanges.includes(book.exchange) && configuration.markets.includes(book.market))
      : [];
    for (const candidate of candidates) this.dependencies.watchPublicTrades(candidate.exchange, [candidate.market]);
    const assessments = candidates.map((book) => this.evaluateBook(book, configuration, now));
    return immutableClone({
      generatedAt: now,
      evaluatedMarkets: assessments.length,
      qualifiedMarkets: assessments.filter((item) => item.status === "QUALIFIED").length,
      blockedMarkets: assessments.filter((item) => item.status === "BLOCKED").length,
      assessments,
      safety: {inventoryEvidenceAvailable: assessments.length > 0 && assessments.every((item) =>
        item.evidence?.inventoryAdjustmentApplied === true),
        inventoryAdjustmentApplied: assessments.some((item) => item.evidence?.inventoryAdjustmentApplied === true),
        queuePositionKnown: false,
        fillProbabilityKnown: assessments.length > 0 && assessments.every((item) => item.evidence?.fillProbabilityKnown === true),
        modeledCaptureGuaranteed: false, shadowOnly: true, paperExecutionAllowed: false,
        liveExecutionAllowed: false, orderSubmissionAllowed: false},
    });
  }

  private evaluateBook(book: OrderBook, configuration: DynamicMarketMakingConfiguration, now: number): DynamicMarketMakingAssessment {
    const blockers = new Set<DynamicMarketMakingBlocker>();
    let bookDiagnostics: DynamicMarketMakingBookDiagnostics | null = null;
    let capabilityDiagnostics: DynamicMarketMakingCapabilityDiagnostics | null = null;
    let inventoryDiagnostics: DynamicMarketMakingInventoryDiagnostics | null = null;
    let fillQualityDiagnostics: DynamicMarketMakingFillQualityDiagnostics | null = null;
    let economicsDiagnostics: DynamicMarketMakingRouteEconomics | null = null;
    const diagnostics = (): DynamicMarketMakingDiagnostics => ({
      book: bookDiagnostics,
      capability: capabilityDiagnostics,
      inventory: inventoryDiagnostics,
      fillQuality: fillQualityDiagnostics,
      economics: economicsDiagnostics,
    });
    const bestBid = book.bids[0];
    const bestAsk = book.asks[0];
    if (book.timestamp <= 0 || book.timestamp > now || now - book.timestamp > configuration.maximumEvidenceAgeMs) blockers.add("BOOK_STALE");
    if (!bestBid || !bestAsk || !positive(bestBid.price) || !positive(bestAsk.price) ||
        !positive(bestBid.quantity) || !positive(bestAsk.quantity) || bestBid.price >= bestAsk.price) blockers.add("BOOK_INVALID");
    if (book.bids.length < 2 || book.asks.length < 2) blockers.add("FULL_DEPTH_MISSING");
    if (!bestBid || !bestAsk || blockers.has("BOOK_INVALID") || blockers.has("BOOK_STALE") ||
        blockers.has("FULL_DEPTH_MISSING")) return this.blocked(book, blockers, diagnostics());

    const midPrice = (bestBid.price + bestAsk.price) / 2;
    this.record(book.exchange, book.market, book.timestamp, midPrice, configuration.maximumSamples);
    const samples = this.histories.get(this.key(book.exchange, book.market)) ?? [];
    bookDiagnostics = {
      bestBid: bestBid.price,
      bestAsk: bestAsk.price,
      midPrice,
      bookSpreadPercent: (bestAsk.price - bestBid.price) / midPrice * 100,
      bidDepthQuantity: book.bids.reduce((sum, level) => sum + level.quantity, 0),
      askDepthQuantity: book.asks.reduce((sum, level) => sum + level.quantity, 0),
      volatilitySampleCount: samples.length,
      minimumVolatilitySamples: configuration.minimumSamples,
    };
    if (samples.length < configuration.minimumSamples) blockers.add("HISTORY_INSUFFICIENT");

    const capability = this.dependencies.getCapability(book.exchange, book.market);
    const fee = this.dependencies.getFee(book.exchange, book.market);
    if (!capability) blockers.add("CAPABILITY_MISSING");
    if (!fee) blockers.add("FEE_EVIDENCE_MISSING");
    if (!capability || !fee) return this.blocked(book, blockers, diagnostics());
    if (capability.synchronizedAt <= 0 || capability.synchronizedAt > now ||
        now - capability.synchronizedAt > configuration.maximumCapabilityEvidenceAgeMs) blockers.add("CAPABILITY_STALE");
    if (!capability.order.supportsPostOnly) blockers.add("POST_ONLY_UNSUPPORTED");
    const priceStep = capability.price.priceStep;
    const quantityStep = capability.quantity.quantityStep ?? precisionStep(capability.quantity.quantityPrecision);
    capabilityDiagnostics = {
      baseAsset: capability.baseAsset,
      quoteAsset: capability.quoteAsset,
      postOnlySupported: capability.order.supportsPostOnly,
      capabilitySynchronizedAt: capability.synchronizedAt,
      priceStep,
      quantityStep,
      minimumNotional: capability.notional.minimumNotional,
      makerFeePercent: fee.makerPercent,
    };
    if (!positive(priceStep ?? 0) || !positive(quantityStep ?? 0) || capability.notional.minimumNotional === null) blockers.add("MARKET_RULES_INCOMPLETE");
    if (blockers.size > 0 || priceStep === null || quantityStep === null || capability.notional.minimumNotional === null) {
      return this.blocked(book, blockers, diagnostics());
    }

    const baseBalance = this.dependencies.getBalance(book.exchange, capability.baseAsset);
    const quoteBalance = this.dependencies.getBalance(book.exchange, capability.quoteAsset);
    if (!baseBalance || !quoteBalance) blockers.add("INVENTORY_EVIDENCE_MISSING");
    const inventorySynchronizedAt = baseBalance && quoteBalance
      ? Math.min(baseBalance.synchronizedAt, quoteBalance.synchronizedAt)
      : null;
    if (inventorySynchronizedAt !== null && (inventorySynchronizedAt <= 0 || inventorySynchronizedAt > now ||
        now - inventorySynchronizedAt > configuration.maximumInventoryEvidenceAgeMs)) blockers.add("INVENTORY_EVIDENCE_STALE");
    if (baseBalance && quoteBalance && inventorySynchronizedAt !== null) {
      inventoryDiagnostics = {
        source: "AUTHENTICATED_EXCHANGE_BALANCE_SNAPSHOTS",
        synchronizedAt: inventorySynchronizedAt,
        ageMs: now - inventorySynchronizedAt,
        baseAsset: capability.baseAsset,
        quoteAsset: capability.quoteAsset,
        baseTotal: baseBalance.totalBalance,
        quoteTotal: quoteBalance.totalBalance,
        baseAvailable: baseBalance.availableBalance,
        quoteAvailable: quoteBalance.availableBalance,
        baseValueQuote: null,
        totalValueQuote: null,
        baseSharePercent: null,
        targetBasePercent: configuration.inventoryTargetBasePercent,
        deviationPercent: null,
        skewPercent: null,
        unadjustedFairPrice: null,
        fairPrice: null,
      };
    }
    if (blockers.size > 0 || !baseBalance || !quoteBalance || inventorySynchronizedAt === null) {
      return this.blocked(book, blockers, diagnostics());
    }

    const denominator = bestBid.quantity + bestAsk.quantity;
    const depthImbalance = denominator > 0 ? (bestBid.quantity - bestAsk.quantity) / denominator : 0;
    const microprice = (bestAsk.price * bestBid.quantity + bestBid.price * bestAsk.quantity) / denominator;
    const publicTrades = this.dependencies.getPublicTrades(
      book.exchange, book.market, now - configuration.publicTradeLookbackMs, now,
    ).filter((trade) => trade.occurredAt <= now && trade.occurredAt > now - configuration.publicTradeLookbackMs);
    fillQualityDiagnostics = {
      source: "EXCHANGE_PUBLIC_TRADE_TAPE",
      sampleCount: publicTrades.length,
      minimumSamples: configuration.minimumPublicTradeSamples,
      lookbackMs: configuration.publicTradeLookbackMs,
      aggressorFlowImbalance: null,
      tradeFlowFairValueSkewPercent: null,
      adverseSelectionSpreadPercent: null,
      liquidityCoverageMultiple: null,
      minimumLiquidityCoverageMultiple: configuration.minimumLiquidityCoverageMultiple,
      liquiditySpreadPenaltyPercent: null,
      bidFillProbabilityPercent: null,
      askFillProbabilityPercent: null,
      minimumFillProbabilityPercent: configuration.minimumEmpiricalFillProbabilityPercent,
      queuePositionKnown: false,
    };
    if (publicTrades.length < configuration.minimumPublicTradeSamples) {
      blockers.add("PUBLIC_TRADE_EVIDENCE_INSUFFICIENT");
      return this.blocked(book, blockers, diagnostics());
    }
    const buyAggressorQuantity = publicTrades.filter((trade) => trade.aggressorSide === "BUY")
      .reduce((sum, trade) => sum + trade.quantity, 0);
    const sellAggressorQuantity = publicTrades.filter((trade) => trade.aggressorSide === "SELL")
      .reduce((sum, trade) => sum + trade.quantity, 0);
    const totalPublicTradeQuantity = buyAggressorQuantity + sellAggressorQuantity;
    const aggressorFlowImbalance = positive(totalPublicTradeQuantity)
      ? (buyAggressorQuantity - sellAggressorQuantity) / totalPublicTradeQuantity
      : 0;
    const tradeFlowFairValueSkewPercent = aggressorFlowImbalance * configuration.maximumAdverseSelectionSpreadPercent * 0.5;
    const unadjustedFairPrice = (midPrice + (microprice - midPrice) * configuration.imbalanceFairValueWeight) *
      (1 + tradeFlowFairValueSkewPercent / 100);
    const inventoryBaseValueQuote = baseBalance.totalBalance * unadjustedFairPrice;
    const inventoryTotalValueQuote = inventoryBaseValueQuote + quoteBalance.totalBalance;
    if (!positive(inventoryTotalValueQuote)) {
      blockers.add("INVENTORY_CAPACITY_INSUFFICIENT");
      return this.blocked(book, blockers, diagnostics());
    }
    const inventoryBaseSharePercent = inventoryBaseValueQuote / inventoryTotalValueQuote * 100;
    const inventoryDeviationPercent = inventoryBaseSharePercent - configuration.inventoryTargetBasePercent;
    const deviationCapacity = inventoryDeviationPercent >= 0
      ? 100 - configuration.inventoryTargetBasePercent
      : configuration.inventoryTargetBasePercent;
    const normalizedInventoryDeviation = clamp(inventoryDeviationPercent / deviationCapacity, -1, 1);
    const inventorySkewPercent = -normalizedInventoryDeviation * configuration.maximumInventorySkewPercent;
    const fairPrice = unadjustedFairPrice * (1 + inventorySkewPercent / 100);
    inventoryDiagnostics = {
      source: "AUTHENTICATED_EXCHANGE_BALANCE_SNAPSHOTS",
      synchronizedAt: inventorySynchronizedAt,
      ageMs: now - inventorySynchronizedAt,
      baseAsset: capability.baseAsset,
      quoteAsset: capability.quoteAsset,
      baseTotal: baseBalance.totalBalance,
      quoteTotal: quoteBalance.totalBalance,
      baseAvailable: baseBalance.availableBalance,
      quoteAvailable: quoteBalance.availableBalance,
      baseValueQuote: inventoryBaseValueQuote,
      totalValueQuote: inventoryTotalValueQuote,
      baseSharePercent: inventoryBaseSharePercent,
      targetBasePercent: configuration.inventoryTargetBasePercent,
      deviationPercent: inventoryDeviationPercent,
      skewPercent: inventorySkewPercent,
      unadjustedFairPrice,
      fairPrice,
    };
    const realizedVolatilityPercent = volatility(samples);
    const marketRegime = realizedVolatilityPercent >= configuration.volatileRegimeThresholdPercent
      ? "VOLATILE" as const
      : realizedVolatilityPercent <= configuration.volatileRegimeThresholdPercent * 0.25
        ? "CALM" as const
        : "NORMAL" as const;
    const regimeSpreadMultiplier = marketRegime === "VOLATILE" ? 1.75 : marketRegime === "NORMAL" ? 1.25 : 1;
    const targetQuoteQuantity = roundDown(configuration.targetQuoteNotional / fairPrice, quantityStep);
    const minimumDepthQuantity = Math.min(
      book.bids.reduce((sum, level) => sum + level.quantity, 0),
      book.asks.reduce((sum, level) => sum + level.quantity, 0),
    );
    const liquidityCoverageMultiple = positive(targetQuoteQuantity) ? minimumDepthQuantity / targetQuoteQuantity : 0;
    const liquidityShortfallRatio = clamp(1 - liquidityCoverageMultiple / configuration.minimumLiquidityCoverageMultiple, 0, 1);
    const liquiditySpreadPenaltyPercent = liquidityShortfallRatio * configuration.maximumAdverseSelectionSpreadPercent;
    const adverseSelectionSpreadPercent = Math.abs(aggressorFlowImbalance) * configuration.maximumAdverseSelectionSpreadPercent;
    const makerRoundTripFeePercent = fee.makerPercent * 2;
    const requiredHalfSpread = (makerRoundTripFeePercent + configuration.safetyBufferPercent + configuration.minimumModeledNetCapturePercent) / 2;
    const adaptiveHalfSpreadPercent = Math.max(configuration.minimumHalfSpreadPercent, requiredHalfSpread) * regimeSpreadMultiplier +
      realizedVolatilityPercent * configuration.volatilitySpreadMultiplier + adverseSelectionSpreadPercent + liquiditySpreadPenaltyPercent;
    const rawBid = fairPrice * (1 - adaptiveHalfSpreadPercent / 100);
    const rawAsk = fairPrice * (1 + adaptiveHalfSpreadPercent / 100);
    const bidQuotePrice = Math.min(roundDown(rawBid, priceStep), bestBid.price);
    const askQuotePrice = Math.max(roundUp(rawAsk, priceStep), bestAsk.price);
    if (!positive(bidQuotePrice) || !positive(askQuotePrice) || bidQuotePrice >= bestAsk.price || askQuotePrice <= bestBid.price || bidQuotePrice >= askQuotePrice) blockers.add("QUOTE_INVALID");

    const baseAvailableQuantity = roundDown(baseBalance.availableBalance, quantityStep);
    const quoteFundedQuantity = roundDown(quoteBalance.availableBalance / bidQuotePrice, quantityStep);
    const quoteQuantity = roundDown(Math.min(targetQuoteQuantity, baseAvailableQuantity, quoteFundedQuantity), quantityStep);
    if (!positive(baseAvailableQuantity) || !positive(quoteFundedQuantity)) blockers.add("INVENTORY_CAPACITY_INSUFFICIENT");
    if (!positive(quoteQuantity) || (capability.quantity.minimumQuantity !== null && quoteQuantity < capability.quantity.minimumQuantity) ||
        (capability.quantity.maximumQuantity !== null && quoteQuantity > capability.quantity.maximumQuantity)) blockers.add("QUANTITY_INVALID");
    if (quoteQuantity * bidQuotePrice < capability.notional.minimumNotional || quoteQuantity * askQuotePrice < capability.notional.minimumNotional) blockers.add("MINIMUM_NOTIONAL_NOT_MET");
    const bidTradeThroughQuantity = publicTrades.filter((trade) =>
      trade.aggressorSide === "SELL" && trade.price <= bidQuotePrice - priceStep + 1e-12,
    ).reduce((sum, trade) => sum + trade.quantity, 0);
    const askTradeThroughQuantity = publicTrades.filter((trade) =>
      trade.aggressorSide === "BUY" && trade.price >= askQuotePrice + priceStep - 1e-12,
    ).reduce((sum, trade) => sum + trade.quantity, 0);
    const bidFillProbabilityPercent = positive(quoteQuantity) ? clamp(bidTradeThroughQuantity / quoteQuantity * 100, 0, 100) : 0;
    const askFillProbabilityPercent = positive(quoteQuantity) ? clamp(askTradeThroughQuantity / quoteQuantity * 100, 0, 100) : 0;
    fillQualityDiagnostics = {
      ...fillQualityDiagnostics,
      aggressorFlowImbalance,
      tradeFlowFairValueSkewPercent,
      adverseSelectionSpreadPercent,
      liquidityCoverageMultiple,
      liquiditySpreadPenaltyPercent,
      bidFillProbabilityPercent,
      askFillProbabilityPercent,
    };
    if (Math.min(bidFillProbabilityPercent, askFillProbabilityPercent) < configuration.minimumEmpiricalFillProbabilityPercent) {
      blockers.add("EMPIRICAL_FILL_PROBABILITY_THRESHOLD_NOT_MET");
    }
    const modeledGrossCapturePercent = (askQuotePrice - bidQuotePrice) / fairPrice * 100;
    const modeledNetCapturePercent = modeledGrossCapturePercent - makerRoundTripFeePercent - configuration.safetyBufferPercent;
    economicsDiagnostics = {
      bidQuotePrice,
      askQuotePrice,
      quoteQuantity,
      targetQuoteQuantity,
      adaptiveHalfSpreadPercent,
      modeledGrossCapturePercent,
      makerRoundTripFeePercent,
      safetyBufferPercent: configuration.safetyBufferPercent,
      modeledNetCapturePercent,
      minimumModeledNetCapturePercent: configuration.minimumModeledNetCapturePercent,
      thresholdShortfallPercent: Math.max(
        0,
        configuration.minimumModeledNetCapturePercent - modeledNetCapturePercent,
      ),
      marketRegime,
      realizedVolatilityPercent,
      modeledCaptureGuaranteed: false,
    };
    if (!Number.isFinite(modeledNetCapturePercent) || modeledNetCapturePercent < configuration.minimumModeledNetCapturePercent) blockers.add("MODELED_NET_THRESHOLD_NOT_MET");
    if (blockers.size > 0) return this.blocked(book, blockers, diagnostics());

    const evidence: DynamicMarketMakingSignalEvidence = {
      exchange: book.exchange, market: book.market, fairPrice, unadjustedFairPrice, midPrice, microprice,
      bookSpreadPercent: (bestAsk.price - bestBid.price) / midPrice * 100, depthImbalance,
      realizedVolatilityPercent, volatilitySampleCount: samples.length,
      marketRegime, regimeSpreadMultiplier, publicTradeEvidenceSource: "EXCHANGE_PUBLIC_TRADE_TAPE",
      publicTradeSampleCount: publicTrades.length, publicTradeLookbackMs: configuration.publicTradeLookbackMs,
      aggressorFlowImbalance, tradeFlowFairValueSkewPercent, adverseSelectionSpreadPercent,
      liquidityCoverageMultiple, liquiditySpreadPenaltyPercent, bidFillProbabilityPercent, askFillProbabilityPercent,
      bidQuotePrice, askQuotePrice,
      quoteQuantity, targetQuoteQuantity, adaptiveHalfSpreadPercent, modeledGrossCapturePercent, makerRoundTripFeePercent,
      safetyBufferPercent: configuration.safetyBufferPercent, modeledNetCapturePercent,
      modeledCaptureGuaranteed: false, priceStep, quantityStep, passiveQuotesEnforced: true,
      inventoryAdjustmentApplied: true,
      inventoryEvidenceSource: "AUTHENTICATED_EXCHANGE_BALANCE_SNAPSHOTS",
      inventorySynchronizedAt, inventoryAgeMs: now - inventorySynchronizedAt,
      inventoryBaseAsset: capability.baseAsset, inventoryQuoteAsset: capability.quoteAsset,
      inventoryBaseTotal: baseBalance.totalBalance, inventoryQuoteTotal: quoteBalance.totalBalance,
      inventoryBaseAvailable: baseBalance.availableBalance, inventoryQuoteAvailable: quoteBalance.availableBalance,
      inventoryBaseValueQuote, inventoryTotalValueQuote, inventoryBaseSharePercent,
      inventoryTargetBasePercent: configuration.inventoryTargetBasePercent,
      inventoryDeviationPercent, inventorySkewPercent,
      queuePositionKnown: false, fillProbabilityKnown: true,
      fullDepthApplied: true, marketRulesApplied: true, explicitFeesApplied: true,
      executionReadinessBlockers: ["QUEUE_POSITION_UNKNOWN", "POST_ONLY_EXECUTION_UNVERIFIED"],
    };
    return immutableClone({id: `${book.exchange}:${book.market}:${book.timestamp}`, exchange: book.exchange,
      market: book.market, status: "QUALIFIED", blockers: [], diagnostics: diagnostics(), evidence,
      executionAuthorized: false, automaticExecutionAllowed: false});
  }

  private record(exchange: string, market: string, timestamp: number, mid: number, maximum: number): void {
    const key = this.key(exchange, market); const history = this.histories.get(key) ?? [];
    if ((history.at(-1)?.timestamp ?? 0) >= timestamp) return;
    history.push({timestamp, mid});
    if (history.length > maximum) history.splice(0, history.length - maximum);
    this.histories.set(key, history);
  }
  private key(exchange: string, market: string): string { return `${exchange.toLowerCase()}:${market.toUpperCase()}`; }
  private blocked(
    book: OrderBook,
    blockers: ReadonlySet<DynamicMarketMakingBlocker>,
    diagnostics: DynamicMarketMakingDiagnostics = {
      book: null,
      capability: null,
      inventory: null,
      fillQuality: null,
      economics: null,
    },
  ): DynamicMarketMakingAssessment {
    return immutableClone({id: `${book.exchange}:${book.market}:${book.timestamp}`, exchange: book.exchange,
      market: book.market, status: "BLOCKED", blockers: [...blockers], diagnostics, evidence: null,
      executionAuthorized: false, automaticExecutionAllowed: false});
  }
}

function volatility(samples: readonly MidSample[]): number {
  if (samples.length < 2) return 0;
  const returns: number[] = [];
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1]?.mid ?? 0; const current = samples[index]?.mid ?? 0;
    if (positive(previous) && positive(current)) returns.push(Math.log(current / previous));
  }
  return returns.length === 0 ? 0 : Math.sqrt(returns.reduce((sum, value) => sum + value * value, 0) / returns.length) * 100;
}
function precisionStep(precision: number | null): number | null { return precision !== null && Number.isSafeInteger(precision) && precision >= 0 && precision <= 18 ? 10 ** -precision : null; }
function positive(value: number): boolean { return Number.isFinite(value) && value > 0; }
function roundDown(value: number, step: number): number { return Math.floor((value + Number.EPSILON) / step) * step; }
function roundUp(value: number, step: number): number { return Math.ceil((value - Number.EPSILON) / step) * step; }
function clamp(value: number, minimum: number, maximum: number): number { return Math.min(maximum, Math.max(minimum, value)); }
function immutableClone<T>(value: T): T { return deepFreeze(structuredClone(value)); }
function deepFreeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; for (const nested of Object.values(value)) deepFreeze(nested); return Object.freeze(value); }
