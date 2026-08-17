import {tradingAccountService} from "../../trading/account/TradingAccountService";
import {riskEngine} from "../../risk/services/RiskEngine";
import {orderBookService} from "../../orderbook/services/OrderBookService";
import {exchangeCapabilityService} from "../../execution/capabilities/services/ExchangeCapabilityService";
import {derivativeDepthService} from "../../derivatives/services/DerivativeDepthService";
import {derivativeMarketDataService} from "../../derivatives/services/DerivativeMarketDataService";
import {derivativeFeeEvidenceService} from "../../derivatives/services/DerivativeFeeEvidenceService";
import {derivativeAccountEvidenceService} from "../../derivatives/services/DerivativeAccountEvidenceService";
import {statisticalHistoricalDataService} from "../statistical-arbitrage/StatisticalHistoricalDataService";
import {statisticalWalkForwardValidationService} from "../statistical-arbitrage/StatisticalWalkForwardValidationService";
import {getExchangeFeeEvidence} from "../../arbitrage/config/fees";
import type {CentralStrategyExecutionLeg, CentralStrategyExecutionPlan} from "../models/CentralStrategyExecutionPlan";
import type {CentralPaperPlanEvidence} from "./CentralPaperPlanAdmissionService";
import {centralPaperCapitalValuationService} from "./CentralPaperCapitalValuationService";

export interface CentralPaperRuntimeLegInspection {
  readonly legId: string;
  readonly balanceVerified: boolean;
  readonly fundingVerified?: boolean;
  readonly fundingSource?: "AUTHENTICATED_ACCOUNT_BALANCE" | "PREVIOUS_LEG_MODELED_PROCEEDS";
  readonly externalBalanceRequired?: boolean;
  readonly paperAdapterSupported: boolean;
  readonly marketRulesVerified: boolean;
  readonly feeEvidenceFresh: boolean;
  readonly quoteFresh: boolean;
  readonly fullQuantityAvailable: boolean;
  readonly quoteTimestamp: number | null;
  readonly blockers: readonly string[];
}

export interface CentralPaperLegFundingContext {
  readonly source: "AUTHENTICATED_ACCOUNT_BALANCE" | "PREVIOUS_LEG_MODELED_PROCEEDS";
  readonly externalBalanceRequired: boolean;
  readonly expectedInputAsset: string | null;
  readonly previousLeg: CentralStrategyExecutionLeg | null;
}

export interface CentralPaperRuntimeEvidencePort {
  getAccount(): ReturnType<typeof tradingAccountService.getAccount>;
  evaluateAccountCapital(amount: number): {readonly approved: boolean; readonly reasons: readonly string[]};
  valueCapital(plan: CentralStrategyExecutionPlan, now: number): ReturnType<typeof centralPaperCapitalValuationService.value>;
  inspectLeg(leg: CentralStrategyExecutionLeg, now: number, funding: CentralPaperLegFundingContext): CentralPaperRuntimeLegInspection;
  assessRisk(input: {readonly plan: CentralStrategyExecutionPlan; readonly capital: number; readonly legs: readonly CentralPaperRuntimeLegInspection[]; readonly now: number}): {
    readonly approved: boolean; readonly level: "LOW" | "MEDIUM" | "HIGH" | "BLOCKED"; readonly score: number; readonly reasons: readonly string[];
  };
  getStatisticalPromotion(plan: CentralStrategyExecutionPlan, now: number): {readonly walkForwardPassed: boolean; readonly regimeAdmitted: boolean; readonly blockers: readonly string[]} | null;
}

export interface CentralPaperRuntimeEvidenceReport {
  readonly version: "46.0";
  readonly generatedAt: number;
  readonly planId: string;
  readonly evidence: CentralPaperPlanEvidence;
  readonly requestedCapital: number | null;
  readonly blockers: readonly string[];
  readonly safety: {
    readonly readOnly: true;
    readonly inferredBalanceAllowed: false;
    readonly inferredMarginAllowed: false;
    readonly undocumentedFeeAllowed: false;
    readonly capitalReservationMutationPerformed: false;
    readonly liveExecutionAllowed: false;
    readonly orderSubmissionAllowed: false;
  };
}

export class CentralPaperRuntimeEvidenceCollector {
  constructor(private readonly port: CentralPaperRuntimeEvidencePort = new DefaultCentralPaperRuntimeEvidencePort(), private readonly maximumEvidenceAgeMs = 10_000) {
    if (!Number.isSafeInteger(maximumEvidenceAgeMs) || maximumEvidenceAgeMs <= 0) throw new Error("Central PAPER runtime evidence age must be positive.");
  }

  collect(plan: CentralStrategyExecutionPlan, now = Date.now()): CentralPaperRuntimeEvidenceReport {
    if (!Number.isSafeInteger(now) || now <= 0 || plan.expiresAt < now) throw new Error("Central PAPER runtime evidence requires a current plan.");
    const blockers: string[] = [];
    const valuation = this.port.valueCapital(plan, now);
    const capital = valuation.amount;
    const account = this.port.getAccount();
    const capitalAssessment = capital === null
      ? {approved: false, reasons: valuation.blockers}
      : this.port.evaluateAccountCapital(capital);
    blockers.push(...valuation.blockers.map((item) => `CAPITAL_VALUATION:${item}`));
    if (!capitalAssessment.approved) blockers.push(...capitalAssessment.reasons.map((item) => `CAPITAL:${item}`));
    const orderedLegs = [...plan.legs].sort((left, right) => left.sequence - right.sequence);
    const legs = orderedLegs.map((leg, index) => normalizeInspection(
      this.port.inspectLeg(leg, now, fundingContext(plan, orderedLegs, index)),
    ));
    for (const leg of legs) blockers.push(...leg.blockers.map((item) => `${leg.legId}:${item}`));
    const risk = this.port.assessRisk({plan, capital: capital ?? 0, legs, now});
    if (!risk.approved) blockers.push(...risk.reasons.map((item) => `RISK:${item}`));
    const statistical = this.port.getStatisticalPromotion(plan, now);
    if (statistical) blockers.push(...statistical.blockers.map((item) => `STATISTICAL:${item}`));
    const evidence: CentralPaperPlanEvidence = {
      planId: plan.id,
      generatedAt: now,
      expiresAt: Math.min(plan.expiresAt, now + this.maximumEvidenceAgeMs),
      account,
      capital: {assessmentId: `central-capital-assessment:${plan.id}:${now}`, planId: plan.id, requestedAmount: capital,
        currency: "INR", conversionEvidenceIds: valuation.conversions.map((item) => item.id),
        approved: capital !== null && capitalAssessment.approved, reservationMutationPerformed: false},
      risk: {assessmentId: `central-risk-assessment:${plan.id}:${now}`, planId: plan.id, approved: risk.approved,
        level: risk.level, score: risk.score},
      legs: legs.map((item) => ({legId: item.legId, balanceVerified: item.balanceVerified,
        fundingVerified: item.fundingVerified, fundingSource: item.fundingSource,
        externalBalanceRequired: item.externalBalanceRequired,
        paperAdapterSupported: item.paperAdapterSupported, marketRulesVerified: item.marketRulesVerified,
        feeEvidenceFresh: item.feeEvidenceFresh, quoteFresh: item.quoteFresh && item.fullQuantityAvailable})),
      controls: {planId: plan.id, paperSimulatorAvailable: true, failureRecoveryAvailable: true,
        accountingJournalAvailable: true, settlementAvailable: true, liveAdapterReachable: false},
      statisticalPromotion: statistical ? {planId: plan.id, walkForwardPassed: statistical.walkForwardPassed, regimeAdmitted: statistical.regimeAdmitted} : null,
    };
    return freeze({version: "46.0", generatedAt: now, planId: plan.id, evidence, requestedCapital: capital,
      blockers: Array.from(new Set(blockers)), safety: {readOnly: true, inferredBalanceAllowed: false, inferredMarginAllowed: false,
        undocumentedFeeAllowed: false, capitalReservationMutationPerformed: false, liveExecutionAllowed: false, orderSubmissionAllowed: false}});
  }
}

export class DefaultCentralPaperRuntimeEvidencePort implements CentralPaperRuntimeEvidencePort {
  getAccount() { return tradingAccountService.getAccount(); }
  evaluateAccountCapital(amount: number) { return tradingAccountService.evaluateTrade(amount); }
  valueCapital(plan: CentralStrategyExecutionPlan, now: number) { return centralPaperCapitalValuationService.value(plan, now); }

  inspectLeg(leg: CentralStrategyExecutionLeg, now: number, funding: CentralPaperLegFundingContext): CentralPaperRuntimeLegInspection {
    return leg.product === "SPOT" ? this.inspectSpot(leg, now, funding) : this.inspectPerpetual(leg, now);
  }

  assessRisk(input: {readonly plan: CentralStrategyExecutionPlan; readonly capital: number; readonly legs: readonly CentralPaperRuntimeLegInspection[]; readonly now: number}) {
    const complete = input.legs.length > 0 && input.legs.every((item) => (item.fundingVerified ?? item.balanceVerified) && item.paperAdapterSupported && item.marketRulesVerified && item.feeEvidenceFresh && item.quoteFresh && item.fullQuantityAvailable);
    const timestamps = input.legs.map((item) => item.quoteTimestamp).filter((value): value is number => value !== null);
    const skew = timestamps.length > 0 ? Math.max(...timestamps) - Math.min(...timestamps) : null;
    const first = input.plan.legs[0]; const second = input.plan.legs[1];
    const account = tradingAccountService.getAccount();
    const assessment = riskEngine.assess({capital: input.capital, confidence: complete ? 100 : 0, fillPercent: complete ? 100 : 0,
      netProfit: input.plan.modeledNetValue ?? 0, executionTimeMs: 0, liquidityScore: complete ? 100 : 0,
      quoteAgeMs: timestamps.length > 0 ? input.now - Math.min(...timestamps) : Number.MAX_SAFE_INTEGER,
      exchangeConnected: input.legs.every((item) => item.quoteFresh), balanceAvailable: input.legs.every((item) => item.fundingVerified ?? item.balanceVerified),
      dailyLoss: account.todayLoss, dailyTradeCount: account.tradesToday, market: first?.market,
      buyExchange: input.plan.legs.find((item) => item.side === "BUY")?.exchange ?? first?.exchange,
      sellExchange: input.plan.legs.find((item) => item.side === "SELL")?.exchange ?? second?.exchange,
      quotesFresh: input.legs.every((item) => item.quoteFresh), pairSynchronized: skew !== null && skew <= 5_000,
      timestampSkewMs: skew, maximumPairSkewMs: 5_000});
    return {approved: assessment.approved && complete, level: assessment.level, score: assessment.score, reasons: assessment.reasons};
  }

  getStatisticalPromotion(plan: CentralStrategyExecutionPlan, now: number) {
    if (plan.strategyId !== "statistical-arbitrage") return null;
    const exchange = plan.legs[0]?.exchange; const markets = plan.legs.map((item) => item.market).sort();
    const pair = statisticalHistoricalDataService.getPairs().find((item) => item.exchange === exchange && [item.leftMarket, item.rightMarket].sort().join(":") === markets.join(":"));
    if (!pair) return {walkForwardPassed: false, regimeAdmitted: false, blockers: ["PAIR_HISTORY_NOT_FOUND"]};
    const fee = derivativeFeeEvidenceService.get(pair.exchange);
    if (!fee) return {walkForwardPassed: false, regimeAdmitted: false, blockers: ["EXPLICIT_DERIVATIVE_FEE_EVIDENCE_MISSING"]};
    const history = statisticalHistoricalDataService.getHistory(pair.pairId, 5_000);
    const validation = statisticalWalkForwardValidationService.validate(pair.pairId, history, {roundTripCostPercent: fee.takerPercent * 4}, now);
    const regime = statisticalWalkForwardValidationService.monitorRegime(pair.pairId, history, {}, now);
    return {walkForwardPassed: validation.validationPassed, regimeAdmitted: regime.regime === "STABLE_CORRELATED",
      blockers: [...validation.blockers, ...(regime.regime === "STABLE_CORRELATED" ? [] : [`REGIME_${regime.regime}`])]};
  }

  private inspectSpot(leg: CentralStrategyExecutionLeg, now: number, funding: CentralPaperLegFundingContext): CentralPaperRuntimeLegInspection {
    const blockers: string[] = [];
    const capability = exchangeCapabilityService.getCachedCapability(leg.exchange, leg.market, "spot");
    const book = orderBookService.get(leg.exchange, leg.market);
    const quantity = leg.quantity;
    const capabilityFresh = Boolean(capability && capability.synchronizedAt <= now && now - capability.synchronizedAt <= 300_000);
    const rules = Boolean(capabilityFresh && capability && capability.tradingEnabled && !capability.maintenanceMode && quantity !== null && validRules(capability.quantity.minimumQuantity, capability.quantity.quantityStep, capability.notional.minimumNotional));
    if (!rules) blockers.push("SPOT_MARKET_RULES_UNAVAILABLE");
    const feeEvidence = getExchangeFeeEvidence(leg.exchange, leg.market);
    const fee = leg.orderType === "LIMIT_POST_ONLY" ? feeEvidence?.makerPercent : feeEvidence?.takerPercent;
    const feeFresh = Boolean(feeEvidence && fee !== undefined && Number.isFinite(fee) && fee >= 0 &&
      (feeEvidence.expiresAt === null || feeEvidence.expiresAt >= now));
    if (!feeFresh) blockers.push("SPOT_FEE_EVIDENCE_UNAVAILABLE");
    const bookFresh = Boolean(book && book.timestamp <= now && now - book.timestamp <= 15_000);
    if (!bookFresh) blockers.push("SPOT_QUOTE_UNAVAILABLE_OR_STALE");
    const top = bookFresh && book ? (leg.side === "BUY" ? book.asks[0] : book.bids[0]) : null;
    const fullQuantity = Boolean(top && quantity !== null && top.quantity >= quantity);
    if (!fullQuantity) blockers.push("SPOT_TOP_LEVEL_QUANTITY_INSUFFICIENT");
    const asset = leg.side === "BUY" ? capability?.quoteAsset : capability?.baseAsset;
    const required = leg.side === "BUY" ? (quantity ?? 0) * leg.referencePrice : quantity ?? 0;
    let balanceVerified = false;
    let fundingVerified = false;
    if (funding.externalBalanceRequired) {
      const balance = asset ? tradingAccountService.evaluateExchangeBalance({exchange: leg.exchange, asset, requiredAmount: required, maximumAgeMs: 15_000}) : null;
      balanceVerified = Boolean(balance?.approved);
      fundingVerified = balanceVerified;
      if (!balanceVerified) blockers.push([
        "SPOT_EXCHANGE_BALANCE_UNVERIFIED",
        leg.exchange.trim().toLowerCase() || "unknown-exchange",
        asset?.trim().toUpperCase() || "UNKNOWN_ASSET",
        balanceFailureCode(balance),
      ].join(":"));
    } else {
      fundingVerified = Boolean(
        asset &&
        funding.expectedInputAsset === asset.trim().toUpperCase() &&
        funding.previousLeg &&
        modeledPreviousLegProceeds(funding.previousLeg, now) + 1e-9 >= required,
      );
      if (!fundingVerified) blockers.push([
        "SEQUENTIAL_PREVIOUS_LEG_PROCEEDS_UNVERIFIED",
        leg.exchange.trim().toLowerCase() || "unknown-exchange",
        funding.expectedInputAsset ?? "UNKNOWN_ASSET",
      ].join(":"));
    }
    const adapter = leg.orderType === "MARKET" ? Boolean(capability?.order.supportedOrderTypes.includes("market")) : Boolean(capability?.order.supportedOrderTypes.includes("limit") && capability.order.supportsPostOnly);
    if (!adapter) blockers.push("PAPER_ORDER_TYPE_UNSUPPORTED_BY_MARKET_RULES");
    return {legId: leg.id, balanceVerified, fundingVerified, fundingSource: funding.source,
      externalBalanceRequired: funding.externalBalanceRequired, paperAdapterSupported: adapter, marketRulesVerified: rules,
      feeEvidenceFresh: feeFresh, quoteFresh: bookFresh, fullQuantityAvailable: fullQuantity, quoteTimestamp: bookFresh ? book!.timestamp : null, blockers};
  }

  private inspectPerpetual(leg: CentralStrategyExecutionLeg, now: number): CentralPaperRuntimeLegInspection {
    const blockers: string[] = [];
    const snapshot = derivativeMarketDataService.getSnapshot(now);
    const market = snapshot.markets.find((item) => item.exchange === leg.exchange && item.market === leg.market) ?? null;
    const depth = derivativeDepthService.getBook(leg.exchange, leg.market, now);
    const fee = derivativeFeeEvidenceService.get(leg.exchange);
    const quantity = leg.quantity;
    const rules = Boolean(market && market.tradingEnabled && quantity !== null && validRules(market.rules.minimumQuantity, market.rules.quantityStep, market.rules.minimumNotional));
    if (!rules) blockers.push("PERPETUAL_MARKET_RULES_UNAVAILABLE");
    if (!fee) blockers.push("EXPLICIT_DERIVATIVE_FEE_EVIDENCE_UNAVAILABLE");
    const top = depth ? (leg.side === "BUY" ? depth.asks[0] : depth.bids[0]) : null;
    const fullQuantity = Boolean(top && quantity !== null && top.quantity >= quantity);
    if (!depth) blockers.push("PERPETUAL_DEPTH_UNAVAILABLE_OR_STALE");
    if (!fullQuantity) blockers.push("PERPETUAL_DEPTH_QUANTITY_INSUFFICIENT");
    const accountEvidence = derivativeAccountEvidenceService.getMarketEvidence(leg.exchange, leg.market, now);
    const requiredMargin = quantity === null ? Number.POSITIVE_INFINITY : quantity * leg.referencePrice;
    const marginEvidence = Boolean(
      accountEvidence &&
      accountEvidence.account.authenticatedReadVerified &&
      accountEvidence.account.positionReadVerified &&
      accountEvidence.account.settlementAsset === market?.settleAsset &&
      Number.isFinite(requiredMargin) &&
      accountEvidence.account.availableMargin >= requiredMargin,
    );
    if (!accountEvidence) blockers.push("AUTHENTICATED_MARGIN_AND_POSITION_EVIDENCE_UNAVAILABLE");
    else if (accountEvidence.account.settlementAsset !== market?.settleAsset) blockers.push("DERIVATIVE_SETTLEMENT_ASSET_MISMATCH");
    else if (accountEvidence.account.availableMargin < requiredMargin) blockers.push("DERIVATIVE_AVAILABLE_MARGIN_INSUFFICIENT");
    return {legId: leg.id, balanceVerified: marginEvidence, fundingVerified: marginEvidence,
      fundingSource: "AUTHENTICATED_ACCOUNT_BALANCE", externalBalanceRequired: true,
      paperAdapterSupported: Boolean(market), marketRulesVerified: rules,
      feeEvidenceFresh: fee !== null, quoteFresh: depth !== null, fullQuantityAvailable: fullQuantity,
      quoteTimestamp: depth?.sourceTimestamp ?? null, blockers};
  }
}

function fundingContext(
  plan: CentralStrategyExecutionPlan,
  orderedLegs: readonly CentralStrategyExecutionLeg[],
  index: number,
): CentralPaperLegFundingContext {
  const leg = orderedLegs[index];
  const policy = plan.settlementPolicy;
  const flows = policy?.kind === "IMMEDIATE_CONVERSION_CYCLE" ? policy.flows : [];
  const flow = leg ? flows.find((item) => item.legId === leg.id) : null;
  const previousLeg = index > 0 ? orderedLegs[index - 1] ?? null : null;
  const previousFlow = previousLeg ? flows.find((item) => item.legId === previousLeg.id) : null;
  const sequentiallyFunded = Boolean(
    plan.pattern === "SEQUENTIAL_THREE_LEG" &&
    policy?.kind === "IMMEDIATE_CONVERSION_CYCLE" &&
    leg && index > 0 && leg.dependency === "AFTER_PREVIOUS" &&
    previousLeg && previousLeg.exchange === leg.exchange &&
    flow && previousFlow && previousFlow.toAsset === flow.fromAsset,
  );
  return {
    source: sequentiallyFunded ? "PREVIOUS_LEG_MODELED_PROCEEDS" : "AUTHENTICATED_ACCOUNT_BALANCE",
    externalBalanceRequired: !sequentiallyFunded,
    expectedInputAsset: flow?.fromAsset.trim().toUpperCase() ?? null,
    previousLeg: sequentiallyFunded ? previousLeg : null,
  };
}

function normalizeInspection(value: CentralPaperRuntimeLegInspection): CentralPaperRuntimeLegInspection {
  return {
    ...value,
    fundingVerified: value.fundingVerified ?? value.balanceVerified,
    fundingSource: value.fundingSource ?? "AUTHENTICATED_ACCOUNT_BALANCE",
    externalBalanceRequired: value.externalBalanceRequired ?? true,
  };
}

function modeledPreviousLegProceeds(leg: CentralStrategyExecutionLeg, now: number): number {
  if (leg.quantity === null) return 0;
  const feeEvidence = getExchangeFeeEvidence(leg.exchange, leg.market);
  const feePercent = leg.orderType === "LIMIT_POST_ONLY" ? feeEvidence?.makerPercent : feeEvidence?.takerPercent;
  if (!feeEvidence || feePercent === undefined || !Number.isFinite(feePercent) || feePercent < 0 ||
      (feeEvidence.expiresAt !== null && feeEvidence.expiresAt < now)) return 0;
  const grossOutput = leg.side === "BUY" ? leg.quantity : leg.quantity * leg.referencePrice;
  return grossOutput * (1 - feePercent / 100);
}

function validRules(minimumQuantity: number | null, quantityStep: number | null, minimumNotional: number | null): boolean {
  return (minimumQuantity === null || minimumQuantity > 0) &&
    quantityStep !== null && quantityStep > 0 &&
    minimumNotional !== null && minimumNotional > 0;
}

function balanceFailureCode(balance: ReturnType<typeof tradingAccountService.evaluateExchangeBalance> | null): string {
  if (!balance) return "ASSET_UNRESOLVED";
  if (balance.snapshotAgeMs === null) return "NOT_SYNCHRONIZED";
  if (balance.reasons.some((reason) => reason.includes("stale"))) return "STALE_SNAPSHOT";
  if (balance.availableAmount < balance.requiredAmount) return "INSUFFICIENT_AVAILABLE";
  return "VALIDATION_FAILED";
}

function freeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; for (const nested of Object.values(value)) freeze(nested); return Object.freeze(value); }

export const centralPaperRuntimeEvidenceCollector = new CentralPaperRuntimeEvidenceCollector();
