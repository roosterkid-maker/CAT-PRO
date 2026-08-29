import {getExchangeTakerFeePercent} from "../../arbitrage/config/fees";
import {
  STRATEGY_ONE_PILOT_DISPATCH_RESERVED_MAXIMUM_BOOK_AGE_MS,
  STRATEGY_ONE_PILOT_MAXIMUM_BOOK_SKEW_MS,
} from "../../arbitrage/execution/StrategyOnePilotEquivalentPaperEvidenceService";
import type {ArbitrageOpportunity} from "../../arbitrage/models/ArbitrageOpportunity";
import type {ExchangeMarketCapability} from "../../execution/capabilities/models/ExchangeCapability";
import {exchangeCapabilityService} from "../../execution/capabilities/services/ExchangeCapabilityService";
import type {OrderBook} from "../../orderbook/models/OrderBook";
import {orderBookService} from "../../orderbook/services/OrderBookService";
import {centralPaperCapitalValuationService} from "../../strategies/services/CentralPaperCapitalValuationService";
import {
  exchangeBalanceSynchronizationService,
  type ExchangeBalanceSynchronizationReport,
  type ExchangeBalanceSynchronizationStatus,
} from "../account/ExchangeBalanceSynchronizationService";
import {
  tradingAccountService,
  type ExchangeBalanceSnapshot,
} from "../account/TradingAccountService";
import {
  crossExchangeExecutableQuantityNormalizer,
  type CrossExchangeQuantityNormalizationReport,
} from "./CrossExchangeExecutableQuantityNormalizer";

export type StrategyOneFundedRouteState = "FUNDED" | "REDUCED" | "BLOCKED";

export type StrategyOneFundingBoundary =
  | "AUTHENTICATED_LIVE_READINESS"
  | "ISOLATED_PAPER";

export interface StrategyOneFundingLegEvidence {
  readonly exchange: string;
  readonly asset: string | null;
  readonly synchronizationStatus:
    | ExchangeBalanceSynchronizationStatus
    | "NO_REPORT"
    | "NOT_REQUIRED_PAPER";
  readonly availableBalance: number | null;
  readonly requiredBalance: number | null;
  readonly snapshotAgeMs: number | null;
  readonly maximumSnapshotAgeMs: number;
  readonly sufficient: boolean;
}

export type StrategyOneDepthCeilingSource =
  | "OPPORTUNITY_TOP_OF_BOOK"
  | "FRESH_MULTI_LEVEL_ORDER_BOOK";

export interface StrategyOneMultiLevelDepthEvidence {
  readonly status: "PASSED" | "BLOCKED";
  readonly buyBookAgeMs: number | null;
  readonly sellBookAgeMs: number | null;
  readonly bookSkewMs: number | null;
  readonly buyDepthQuantity: number | null;
  readonly sellDepthQuantity: number | null;
  readonly sharedDepthQuantity: number | null;
  readonly maximumBookAgeMs: number;
  readonly maximumBookSkewMs: number;
  readonly blockers: readonly string[];
}

export interface StrategyOneFundedRouteReport {
  readonly version: "86.0";
  readonly evaluatedAt: number;
  readonly opportunityId: string;
  readonly routeKey: string;
  readonly market: string;
  readonly buyExchange: string;
  readonly sellExchange: string;
  readonly baseAsset: string | null;
  readonly quoteAsset: string | null;
  readonly requestedCapitalInr: number;
  readonly maximumCapitalPerLegInr?: number;
  readonly convertedQuoteCapital: number | null;
  readonly maximumConvertedQuoteCapital?: number | null;
  readonly capitalQuantity: number | null;
  readonly depthQuantity: number | null;
  readonly availableDepthQuantity?: number | null;
  readonly depthCeilingSource?: StrategyOneDepthCeilingSource;
  readonly multiLevelDepthEvidence?: StrategyOneMultiLevelDepthEvidence | null;
  readonly preFundingQuantity: number | null;
  readonly balanceCappedQuantity: number | null;
  readonly executableQuantity: number | null;
  readonly estimatedExecutableCapitalInr: number | null;
  readonly estimatedBuyRequirementInr?: number | null;
  readonly reductionPercent: number | null;
  readonly state: StrategyOneFundedRouteState;
  readonly fundingBoundary: StrategyOneFundingBoundary;
  readonly buyFunding: StrategyOneFundingLegEvidence;
  readonly sellFunding: StrategyOneFundingLegEvidence;
  readonly quantityNormalization: CrossExchangeQuantityNormalizationReport | null;
  readonly blockers: readonly string[];
  readonly authenticatedBalancesRequired: boolean;
  readonly isolatedPaperCapital: boolean;
  readonly staleBalanceAllowed: false;
  readonly quantityNeverIncreased: boolean;
  readonly minimumOrderCushionUsed?: boolean;
  readonly liveExecutionAllowed: false;
  readonly orderSubmissionAllowed: false;
}

export interface StrategyOneFundedRouteRequest {
  readonly opportunity: ArbitrageOpportunity;
  readonly requestedCapitalInr: number;
  readonly maximumCapitalPerLegInr?: number;
  readonly requestedQuoteCapital?: number;
  readonly requestedQuantity?: number;
  readonly fundingBoundary?: StrategyOneFundingBoundary;
  readonly allowMinimumOrderRoundUpWithinHardCap?: boolean;
  readonly now?: number;
}

export interface StrategyOneFundedRouteDependencies {
  getCapability(exchange: string, market: string): ExchangeMarketCapability | null;
  getBalance(exchange: string, asset: string): ExchangeBalanceSnapshot | null;
  getSynchronizationReport(): ExchangeBalanceSynchronizationReport | null;
  convertInrToAsset(asset: string, capitalInr: number, contextId: string, now: number):
    {readonly targetQuantity: number} | null;
  getTakerFeePercent(exchange: string, market: string, now: number): number | null;
  getOrderBook(exchange: string, market: string): OrderBook | null;
  normalizeQuantity(request: {
    rawQuantity: number;
    buyPrice: number;
    sellPrice: number;
    buyCapability: ExchangeMarketCapability | null;
    sellCapability: ExchangeMarketCapability | null;
    allowIncompleteIncrementEvidenceForPaper?: boolean;
    maximumQuantity?: number;
    allowMinimumOrderRoundUpWithinHardCap?: boolean;
  }): CrossExchangeQuantityNormalizationReport;
}

const DEFAULT_MAXIMUM_BALANCE_AGE_MS = 15_000;
const MAXIMUM_CACHED_REPORTS = 500;

const DEFAULT_DEPENDENCIES: StrategyOneFundedRouteDependencies = {
  getCapability: (exchange, market) =>
    exchangeCapabilityService.getCachedCapability(exchange, market, "spot"),
  getBalance: (exchange, asset) => tradingAccountService.getExchangeBalance(exchange, asset),
  getSynchronizationReport: () => exchangeBalanceSynchronizationService.getLastReport(),
  convertInrToAsset: (asset, capitalInr, contextId, now) =>
    centralPaperCapitalValuationService.convertInrToAsset(asset, capitalInr, contextId, now),
  getTakerFeePercent: (exchange, market, now) =>
    getExchangeTakerFeePercent(exchange, market, now),
  getOrderBook: (exchange, market) => orderBookService.get(exchange, market),
  normalizeQuantity: (request) => crossExchangeExecutableQuantityNormalizer.normalize(request),
};

/**
 * Authenticated, fail-closed funding boundary for the personal Strategy #1
 * spot-arbitrage path. The hot path performs in-memory reads only: capability
 * and wallet evidence must already have been synchronized.
 */
export class StrategyOneFundedRouteService {
  private readonly dependencies: StrategyOneFundedRouteDependencies;
  private readonly reports = new Map<string, StrategyOneFundedRouteReport>();

  constructor(
    dependencies: Partial<StrategyOneFundedRouteDependencies> = {},
    private readonly maximumBalanceAgeMs = DEFAULT_MAXIMUM_BALANCE_AGE_MS,
  ) {
    this.dependencies = {...DEFAULT_DEPENDENCIES, ...dependencies};
    if (!Number.isSafeInteger(maximumBalanceAgeMs) || maximumBalanceAgeMs <= 0) {
      throw new Error("Strategy #1 maximum balance age must be a positive safe integer.");
    }
  }

  evaluate(request: StrategyOneFundedRouteRequest): StrategyOneFundedRouteReport {
    const now = request.now ?? Date.now();
    const opportunity = request.opportunity;
    const market = opportunity.pair.market.trim().toUpperCase();
    const buyExchange = opportunity.pair.buy.exchange.trim().toLowerCase();
    const sellExchange = opportunity.pair.sell.exchange.trim().toLowerCase();
    const routeKey = `${market}|${buyExchange}>${sellExchange}`;
    const fundingBoundary = request.fundingBoundary ?? "AUTHENTICATED_LIVE_READINESS";
    const authenticatedBalancesRequired =
      fundingBoundary === "AUTHENTICATED_LIVE_READINESS";
    const blockers: string[] = [];

    if (!Number.isSafeInteger(now) || now <= 0) {
      blockers.push("Funding evaluation timestamp must be a positive safe integer.");
    }
    if (!Number.isFinite(request.requestedCapitalInr) || request.requestedCapitalInr <= 0) {
      blockers.push("Requested Strategy #1 capital must be a positive INR amount.");
    }
    const maximumCapitalPerLegInr =
      request.maximumCapitalPerLegInr ?? request.requestedCapitalInr;
    const minimumOrderCushionPolicyEnabled =
      request.allowMinimumOrderRoundUpWithinHardCap === true &&
      request.maximumCapitalPerLegInr !== undefined &&
      maximumCapitalPerLegInr > request.requestedCapitalInr;
    if (
      !Number.isFinite(maximumCapitalPerLegInr) ||
      maximumCapitalPerLegInr < request.requestedCapitalInr
    ) {
      blockers.push("Maximum Strategy #1 capital must be finite and no lower than the target capital.");
    }

    const buyCapability = this.dependencies.getCapability(buyExchange, market);
    const sellCapability = this.dependencies.getCapability(sellExchange, market);
    if (!buyCapability) blockers.push("BUY exchange spot capability is not cached for the selected market.");
    if (!sellCapability) blockers.push("SELL exchange spot capability is not cached for the selected market.");

    const assets = this.resolveAssets(
      buyCapability,
      sellCapability,
      opportunity.quoteAsset,
      blockers,
    );

    const conversion = assets.quoteAsset && Number.isFinite(request.requestedCapitalInr) &&
      request.requestedCapitalInr > 0
      ? request.requestedQuoteCapital !== undefined
        ? {targetQuantity: request.requestedQuoteCapital}
        : this.dependencies.convertInrToAsset(
            assets.quoteAsset,
            request.requestedCapitalInr,
            `strategy-one-funding:${opportunity.id}:${now}`,
            now,
          )
      : null;
    const convertedQuoteCapital = conversion && Number.isFinite(conversion.targetQuantity) &&
      conversion.targetQuantity > 0 ? conversion.targetQuantity : null;
    if (assets.quoteAsset && convertedQuoteCapital === null) {
      blockers.push(`Fresh INR/${assets.quoteAsset} capital-conversion evidence is unavailable.`);
    }
    const maximumConvertedQuoteCapital =
      convertedQuoteCapital !== null &&
      Number.isFinite(maximumCapitalPerLegInr) &&
      maximumCapitalPerLegInr >= request.requestedCapitalInr &&
      request.requestedCapitalInr > 0
        ? convertedQuoteCapital *
          (maximumCapitalPerLegInr / request.requestedCapitalInr)
        : null;

    const capitalQuantity = convertedQuoteCapital !== null && Number.isFinite(opportunity.buyPrice) &&
      opportunity.buyPrice > 0 ? convertedQuoteCapital / opportunity.buyPrice : null;
    if (capitalQuantity === null || !Number.isFinite(capitalQuantity) || capitalQuantity <= 0) {
      blockers.push("A positive capital-bounded quantity could not be calculated.");
    }

    const depthInputs = [
      opportunity.executableQty,
      opportunity.availableExecutableQty,
      opportunity.buyAvailableQty,
      opportunity.sellAvailableQty,
    ];
    const depthQuantity = depthInputs.every((quantity) => Number.isFinite(quantity) && quantity > 0)
      ? Math.min(...depthInputs)
      : null;
    if (depthQuantity === null) blockers.push("Fresh positive two-leg executable depth is unavailable.");

    /*
     * executableQty is already capped to the scanner's target capital. Keep it
     * in depthQuantity so ordinary sizing never grows beyond the candidate.
     * The separately consented minimum-order cushion may use the smallest
     * number of shared quantity steps required by both venues. It remains
     * bounded by the hard capital cap, fresh synchronized multi-level depth,
     * authenticated balances and any explicit quantity cap. If that stronger
     * L2 evidence is unavailable, the original top-of-book ceiling remains.
     */
    const availableDepthInputs = [
      opportunity.availableExecutableQty,
      opportunity.buyAvailableQty,
      opportunity.sellAvailableQty,
    ];
    const topOfBookAvailableDepthQuantity = availableDepthInputs.every(
      (quantity) => Number.isFinite(quantity) && quantity > 0,
    )
      ? Math.min(...availableDepthInputs)
      : null;
    const multiLevelDepthEvidence =
      fundingBoundary === "AUTHENTICATED_LIVE_READINESS" &&
      minimumOrderCushionPolicyEnabled
        ? this.evaluateMultiLevelDepth({
            buyExchange,
            sellExchange,
            market,
            now,
          })
        : null;
    const availableDepthQuantity =
      multiLevelDepthEvidence?.status === "PASSED"
        ? multiLevelDepthEvidence.sharedDepthQuantity
        : topOfBookAvailableDepthQuantity;
    const depthCeilingSource: StrategyOneDepthCeilingSource =
      multiLevelDepthEvidence?.status === "PASSED"
        ? "FRESH_MULTI_LEVEL_ORDER_BOOK"
        : "OPPORTUNITY_TOP_OF_BOOK";

    const requestedQuantity = request.requestedQuantity ?? capitalQuantity;
    if (requestedQuantity === null || !Number.isFinite(requestedQuantity) || requestedQuantity <= 0) {
      blockers.push("Requested execution quantity must be positive.");
    }
    const preFundingQuantity = capitalQuantity !== null && depthQuantity !== null &&
      requestedQuantity !== null && Number.isFinite(requestedQuantity) && requestedQuantity > 0
      ? Math.min(capitalQuantity, depthQuantity, requestedQuantity)
      : null;

    const buyFeePercent = this.dependencies.getTakerFeePercent(buyExchange, market, now);
    if (buyFeePercent === null || !Number.isFinite(buyFeePercent) || buyFeePercent < 0) {
      blockers.push("BUY taker-fee evidence is unavailable for funding reservation.");
    }
    const buyUnitCost = buyFeePercent !== null && Number.isFinite(buyFeePercent) &&
      buyFeePercent >= 0 && Number.isFinite(opportunity.buyPrice) && opportunity.buyPrice > 0
      ? opportunity.buyPrice * (1 + buyFeePercent / 100)
      : null;

    const synchronizationReport = authenticatedBalancesRequired
      ? this.dependencies.getSynchronizationReport()
      : null;
    const buyFunding = authenticatedBalancesRequired
      ? this.evaluateFundingLeg({
          exchange: buyExchange,
          asset: assets.quoteAsset,
          requestedQuantity: preFundingQuantity,
          unitRequirement: buyUnitCost,
          synchronizationReport,
          now,
          blockers,
        })
      : this.createPaperFundingLeg(
          buyExchange,
          assets.quoteAsset,
          preFundingQuantity,
          buyUnitCost,
        );
    const sellFunding = authenticatedBalancesRequired
      ? this.evaluateFundingLeg({
          exchange: sellExchange,
          asset: assets.baseAsset,
          requestedQuantity: preFundingQuantity,
          unitRequirement: 1,
          synchronizationReport,
          now,
          blockers,
        })
      : this.createPaperFundingLeg(
          sellExchange,
          assets.baseAsset,
          preFundingQuantity,
          1,
        );

    const buyCapacity = authenticatedBalancesRequired
      ? buyFunding.availableBalance !== null && buyUnitCost !== null && buyUnitCost > 0
        ? buyFunding.availableBalance / buyUnitCost
        : null
      : preFundingQuantity;
    const sellCapacity = authenticatedBalancesRequired
      ? sellFunding.availableBalance
      : preFundingQuantity;
    const balanceCappedQuantity = preFundingQuantity !== null && buyCapacity !== null &&
      sellCapacity !== null ? Math.min(preFundingQuantity, buyCapacity, sellCapacity) : null;
    if (authenticatedBalancesRequired && balanceCappedQuantity !== null && balanceCappedQuantity <= 0) {
      blockers.push("Authenticated balances leave no positive two-leg funded quantity.");
    }

    let quantityNormalization: CrossExchangeQuantityNormalizationReport | null = null;
    if (blockers.length === 0 && balanceCappedQuantity !== null && balanceCappedQuantity > 0) {
      const maximumQuantityFromCapital =
        minimumOrderCushionPolicyEnabled &&
        maximumConvertedQuoteCapital !== null &&
        buyUnitCost !== null &&
        buyUnitCost > 0
          ? maximumConvertedQuoteCapital / buyUnitCost
          : null;
      const maximumNormalizationQuantity =
        maximumQuantityFromCapital !== null &&
        availableDepthQuantity !== null &&
        buyCapacity !== null &&
        sellCapacity !== null
          ? Math.min(
              maximumQuantityFromCapital,
              availableDepthQuantity,
              buyCapacity,
              sellCapacity,
              request.requestedQuantity ?? Number.POSITIVE_INFINITY,
            )
          : null;
      quantityNormalization = this.dependencies.normalizeQuantity({
        rawQuantity: balanceCappedQuantity,
        buyPrice: opportunity.buyPrice,
        sellPrice: opportunity.sellPrice,
        buyCapability,
        sellCapability,
        allowIncompleteIncrementEvidenceForPaper:
          fundingBoundary === "ISOLATED_PAPER",
        maximumQuantity: maximumNormalizationQuantity ?? undefined,
        allowMinimumOrderRoundUpWithinHardCap:
          fundingBoundary === "AUTHENTICATED_LIVE_READINESS" &&
          minimumOrderCushionPolicyEnabled,
      });
      if (quantityNormalization.state === "BLOCKED" ||
          quantityNormalization.normalizedQuantity === null) {
        blockers.push(...quantityNormalization.blockers);
        if (
          minimumOrderCushionPolicyEnabled &&
          multiLevelDepthEvidence?.status === "BLOCKED" &&
          quantityNormalization.blockers.some((blocker) =>
            blocker.toLowerCase().includes("safe quantity ceiling"),
          )
        ) {
          blockers.push(
            `Fresh multi-level shared depth was unavailable: ${multiLevelDepthEvidence.blockers.join("; ")}`,
          );
        }
      }
    }

    const executableQuantity = blockers.length === 0
      ? quantityNormalization?.normalizedQuantity ?? null
      : null;
    const minimumOrderCushionUsed =
      quantityNormalization?.minimumOrderCushionUsed === true;
    if (executableQuantity !== null && preFundingQuantity !== null &&
        executableQuantity > preFundingQuantity + Math.max(1e-12, preFundingQuantity * 1e-12) &&
        !minimumOrderCushionUsed) {
      blockers.push("Funded quantity attempted to increase pre-funding exposure.");
    }
    const provisionalBuyFunding = this.withFinalRequirement(
      buyFunding,
      executableQuantity,
      buyUnitCost,
    );
    const provisionalSellFunding = this.withFinalRequirement(
      sellFunding,
      executableQuantity,
      1,
    );
    if (
      executableQuantity !== null &&
      authenticatedBalancesRequired &&
      (!provisionalBuyFunding.sufficient || !provisionalSellFunding.sufficient)
    ) {
      blockers.push("The minimum-order cushion exceeds fresh authenticated two-leg balances.");
    }
    const estimatedBuyRequirementInr =
      executableQuantity !== null &&
      buyUnitCost !== null &&
      convertedQuoteCapital !== null &&
      convertedQuoteCapital > 0
        ? request.requestedCapitalInr *
          ((executableQuantity * buyUnitCost) / convertedQuoteCapital)
        : null;
    if (
      minimumOrderCushionPolicyEnabled &&
      estimatedBuyRequirementInr !== null &&
      estimatedBuyRequirementInr > maximumCapitalPerLegInr + 0.01
    ) {
      blockers.push(
        `Minimum-order cushion requires ₹${estimatedBuyRequirementInr.toFixed(2)}, above the ₹${maximumCapitalPerLegInr.toFixed(2)} hard cap.`,
      );
    }
    const finalExecutableQuantity = blockers.length === 0 ? executableQuantity : null;
    const estimatedExecutableCapitalInr = finalExecutableQuantity !== null && capitalQuantity !== null &&
      capitalQuantity > 0
      ? request.requestedCapitalInr * (finalExecutableQuantity / capitalQuantity)
      : null;
    const reductionPercent = finalExecutableQuantity !== null && capitalQuantity !== null &&
      capitalQuantity > 0
      ? Math.max(0, (1 - finalExecutableQuantity / capitalQuantity) * 100)
      : null;
    const state: StrategyOneFundedRouteState = blockers.length > 0 || finalExecutableQuantity === null
      ? "BLOCKED"
      : reductionPercent !== null && reductionPercent > 1e-9
        ? "REDUCED"
        : "FUNDED";

    const report: StrategyOneFundedRouteReport = {
      version: "86.0",
      evaluatedAt: now,
      opportunityId: opportunity.id,
      routeKey,
      market,
      buyExchange,
      sellExchange,
      baseAsset: assets.baseAsset,
      quoteAsset: assets.quoteAsset,
      requestedCapitalInr: request.requestedCapitalInr,
      maximumCapitalPerLegInr,
      convertedQuoteCapital,
      maximumConvertedQuoteCapital,
      capitalQuantity,
      depthQuantity,
      availableDepthQuantity,
      depthCeilingSource,
      multiLevelDepthEvidence,
      preFundingQuantity,
      balanceCappedQuantity,
      executableQuantity: finalExecutableQuantity,
      estimatedExecutableCapitalInr,
      estimatedBuyRequirementInr:
        finalExecutableQuantity === null ? null : estimatedBuyRequirementInr,
      reductionPercent,
      state,
      fundingBoundary,
      buyFunding: finalExecutableQuantity === null
        ? provisionalBuyFunding
        : this.withFinalRequirement(buyFunding, finalExecutableQuantity, buyUnitCost),
      sellFunding: finalExecutableQuantity === null
        ? provisionalSellFunding
        : this.withFinalRequirement(sellFunding, finalExecutableQuantity, 1),
      quantityNormalization,
      blockers: [...new Set(blockers)],
      authenticatedBalancesRequired,
      isolatedPaperCapital: !authenticatedBalancesRequired,
      staleBalanceAllowed: false,
      quantityNeverIncreased: !minimumOrderCushionUsed,
      minimumOrderCushionUsed,
      liveExecutionAllowed: false,
      orderSubmissionAllowed: false,
    };

    this.remember(report);
    return structuredClone(report);
  }

  getLatestReport(
    routeKey: string,
    fundingBoundary: StrategyOneFundingBoundary = "AUTHENTICATED_LIVE_READINESS",
  ): StrategyOneFundedRouteReport | null {
    const report = this.reports.get(this.createReportKey(routeKey, fundingBoundary));
    return report ? structuredClone(report) : null;
  }

  private resolveAssets(
    buyCapability: ExchangeMarketCapability | null,
    sellCapability: ExchangeMarketCapability | null,
    opportunityQuoteAsset: string | undefined,
    blockers: string[],
  ): {baseAsset: string | null; quoteAsset: string | null} {
    const buyBase = this.normalizeAsset(buyCapability?.baseAsset);
    const sellBase = this.normalizeAsset(sellCapability?.baseAsset);
    const buyQuote = this.normalizeAsset(buyCapability?.quoteAsset);
    const sellQuote = this.normalizeAsset(sellCapability?.quoteAsset);
    if (buyBase && sellBase && buyBase !== sellBase) {
      blockers.push(`Route base-asset mismatch: BUY ${buyBase}, SELL ${sellBase}.`);
    }
    if (buyQuote && sellQuote && buyQuote !== sellQuote) {
      blockers.push(`Route quote-asset mismatch: BUY ${buyQuote}, SELL ${sellQuote}.`);
    }
    const normalizedOpportunityQuote = this.normalizeAsset(opportunityQuoteAsset);
    if (normalizedOpportunityQuote && buyQuote && normalizedOpportunityQuote !== buyQuote) {
      blockers.push(
        `Opportunity quote asset ${normalizedOpportunityQuote} disagrees with capability evidence ${buyQuote}.`,
      );
    }
    return {baseAsset: buyBase ?? sellBase, quoteAsset: buyQuote ?? sellQuote};
  }

  private evaluateMultiLevelDepth(request: {
    buyExchange: string;
    sellExchange: string;
    market: string;
    now: number;
  }): StrategyOneMultiLevelDepthEvidence {
    const blockers: string[] = [];
    const buyBook = this.dependencies.getOrderBook(request.buyExchange, request.market);
    const sellBook = this.dependencies.getOrderBook(request.sellExchange, request.market);
    const buyBookAgeMs = buyBook ? request.now - buyBook.timestamp : null;
    const sellBookAgeMs = sellBook ? request.now - sellBook.timestamp : null;
    const bookSkewMs = buyBook && sellBook
      ? Math.abs(buyBook.timestamp - sellBook.timestamp)
      : null;

    if (!buyBook) blockers.push("BUY multi-level order book is unavailable");
    if (!sellBook) blockers.push("SELL multi-level order book is unavailable");
    if (
      buyBookAgeMs === null ||
      !Number.isSafeInteger(buyBookAgeMs) ||
      buyBookAgeMs < 0 ||
      buyBookAgeMs > STRATEGY_ONE_PILOT_DISPATCH_RESERVED_MAXIMUM_BOOK_AGE_MS
    ) {
      blockers.push("BUY multi-level order book is outside the dispatch-reserved freshness budget");
    }
    if (
      sellBookAgeMs === null ||
      !Number.isSafeInteger(sellBookAgeMs) ||
      sellBookAgeMs < 0 ||
      sellBookAgeMs > STRATEGY_ONE_PILOT_DISPATCH_RESERVED_MAXIMUM_BOOK_AGE_MS
    ) {
      blockers.push("SELL multi-level order book is outside the dispatch-reserved freshness budget");
    }
    if (
      bookSkewMs === null ||
      !Number.isSafeInteger(bookSkewMs) ||
      bookSkewMs > STRATEGY_ONE_PILOT_MAXIMUM_BOOK_SKEW_MS
    ) {
      blockers.push("Multi-level order-book timestamp skew exceeds the pilot ceiling");
    }

    const buyDepthQuantity = buyBook
      ? this.sumValidatedDepth(buyBook.asks, "BUY asks", "ASCENDING", blockers)
      : null;
    const sellDepthQuantity = sellBook
      ? this.sumValidatedDepth(sellBook.bids, "SELL bids", "DESCENDING", blockers)
      : null;
    const sharedDepthQuantity =
      blockers.length === 0 &&
      buyDepthQuantity !== null &&
      sellDepthQuantity !== null
        ? Math.min(buyDepthQuantity, sellDepthQuantity)
        : null;

    return {
      status: blockers.length === 0 && sharedDepthQuantity !== null && sharedDepthQuantity > 0
        ? "PASSED"
        : "BLOCKED",
      buyBookAgeMs,
      sellBookAgeMs,
      bookSkewMs,
      buyDepthQuantity,
      sellDepthQuantity,
      sharedDepthQuantity,
      maximumBookAgeMs: STRATEGY_ONE_PILOT_DISPATCH_RESERVED_MAXIMUM_BOOK_AGE_MS,
      maximumBookSkewMs: STRATEGY_ONE_PILOT_MAXIMUM_BOOK_SKEW_MS,
      blockers: [...new Set(blockers)],
    };
  }

  private sumValidatedDepth(
    levels: OrderBook["asks"],
    label: string,
    expectedOrder: "ASCENDING" | "DESCENDING",
    blockers: string[],
  ): number | null {
    if (levels.length === 0) {
      blockers.push(`${label} are empty`);
      return null;
    }

    let totalQuantity = 0;
    let previousPrice: number | null = null;
    for (const level of levels) {
      if (
        !Number.isFinite(level.price) ||
        level.price <= 0 ||
        !Number.isFinite(level.quantity) ||
        level.quantity <= 0
      ) {
        blockers.push(`${label} contain an invalid price or quantity`);
        return null;
      }
      if (
        previousPrice !== null &&
        ((expectedOrder === "ASCENDING" && level.price < previousPrice) ||
          (expectedOrder === "DESCENDING" && level.price > previousPrice))
      ) {
        blockers.push(`${label} are not price sorted`);
        return null;
      }
      totalQuantity += level.quantity;
      if (!Number.isFinite(totalQuantity) || totalQuantity <= 0) {
        blockers.push(`${label} aggregate quantity is invalid`);
        return null;
      }
      previousPrice = level.price;
    }
    return totalQuantity;
  }

  private evaluateFundingLeg(request: {
    exchange: string;
    asset: string | null;
    requestedQuantity: number | null;
    unitRequirement: number | null;
    synchronizationReport: ExchangeBalanceSynchronizationReport | null;
    now: number;
    blockers: string[];
  }): StrategyOneFundingLegEvidence {
    const synchronizationStatus = request.synchronizationReport?.results.find(
      (result) => result.exchange === request.exchange,
    )?.status ?? "NO_REPORT";
    if (synchronizationStatus !== "SYNCHRONIZED") {
      request.blockers.push(
        `${request.exchange} authenticated balance synchronization is ${synchronizationStatus}.`,
      );
    }

    const snapshot = request.asset
      ? this.dependencies.getBalance(request.exchange, request.asset)
      : null;
    const snapshotAgeMs = snapshot ? request.now - snapshot.synchronizedAt : null;
    if (!request.asset) {
      request.blockers.push(`${request.exchange} required funding asset is unresolved.`);
    } else if (!snapshot) {
      request.blockers.push(`${request.exchange} ${request.asset} authenticated balance is unavailable.`);
    } else if (snapshotAgeMs === null || snapshotAgeMs < 0 ||
               snapshotAgeMs > this.maximumBalanceAgeMs) {
      request.blockers.push(`${request.exchange} ${request.asset} balance is stale for funded execution.`);
    }

    const requiredBalance = request.requestedQuantity !== null && request.unitRequirement !== null
      ? request.requestedQuantity * request.unitRequirement
      : null;
    const availableBalance = snapshot && Number.isFinite(snapshot.availableBalance) &&
      snapshot.availableBalance >= 0 ? snapshot.availableBalance : null;
    if (snapshot && availableBalance === null) {
      request.blockers.push(
        `${request.exchange} ${request.asset ?? "UNKNOWN"} available balance is invalid.`,
      );
    }

    return {
      exchange: request.exchange,
      asset: request.asset,
      synchronizationStatus,
      availableBalance,
      requiredBalance,
      snapshotAgeMs,
      maximumSnapshotAgeMs: this.maximumBalanceAgeMs,
      sufficient: synchronizationStatus === "SYNCHRONIZED" && snapshotAgeMs !== null &&
        snapshotAgeMs >= 0 && snapshotAgeMs <= this.maximumBalanceAgeMs &&
        availableBalance !== null && requiredBalance !== null && availableBalance >= requiredBalance,
    };
  }

  private withFinalRequirement(
    evidence: StrategyOneFundingLegEvidence,
    quantity: number | null,
    unitRequirement: number | null,
  ): StrategyOneFundingLegEvidence {
    const requiredBalance = quantity !== null && unitRequirement !== null
      ? quantity * unitRequirement
      : evidence.requiredBalance;
    return {
      ...evidence,
      requiredBalance,
      sufficient: evidence.synchronizationStatus === "NOT_REQUIRED_PAPER"
        ? requiredBalance !== null && Number.isFinite(requiredBalance) && requiredBalance >= 0
        : evidence.synchronizationStatus === "SYNCHRONIZED" &&
          evidence.snapshotAgeMs !== null && evidence.snapshotAgeMs >= 0 &&
          evidence.snapshotAgeMs <= evidence.maximumSnapshotAgeMs &&
          evidence.availableBalance !== null && requiredBalance !== null &&
          evidence.availableBalance >= requiredBalance,
    };
  }

  private createPaperFundingLeg(
    exchange: string,
    asset: string | null,
    requestedQuantity: number | null,
    unitRequirement: number | null,
  ): StrategyOneFundingLegEvidence {
    const requiredBalance = requestedQuantity !== null && unitRequirement !== null
      ? requestedQuantity * unitRequirement
      : null;

    return {
      exchange,
      asset,
      synchronizationStatus: "NOT_REQUIRED_PAPER",
      availableBalance: null,
      requiredBalance,
      snapshotAgeMs: null,
      maximumSnapshotAgeMs: 0,
      sufficient: requiredBalance !== null && Number.isFinite(requiredBalance) && requiredBalance >= 0,
    };
  }

  private remember(report: StrategyOneFundedRouteReport): void {
    const key = this.createReportKey(report.routeKey, report.fundingBoundary);
    this.reports.delete(key);
    this.reports.set(key, structuredClone(report));
    while (this.reports.size > MAXIMUM_CACHED_REPORTS) {
      const oldestKey = this.reports.keys().next().value;
      if (typeof oldestKey !== "string") break;
      this.reports.delete(oldestKey);
    }
  }

  private createReportKey(
    routeKey: string,
    fundingBoundary: StrategyOneFundingBoundary,
  ): string {
    return `${fundingBoundary}|${routeKey.trim()}`;
  }

  private normalizeAsset(asset: string | undefined): string | null {
    const normalized = asset?.trim().toUpperCase() ?? "";
    return normalized || null;
  }
}

export const strategyOneFundedRouteService = new StrategyOneFundedRouteService();
