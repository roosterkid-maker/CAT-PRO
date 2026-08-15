import {orderBookService} from "../../orderbook/services/OrderBookService";
import {getExchangeFeeEvidence} from "../../arbitrage/config/fees";
import {derivativeDepthService} from "../../derivatives/services/DerivativeDepthService";
import {derivativeFeeEvidenceService} from "../../derivatives/services/DerivativeFeeEvidenceService";
import {derivativeMarketDataService} from "../../derivatives/services/DerivativeMarketDataService";
import {exchangeCapabilityService} from "../../execution/capabilities/services/ExchangeCapabilityService";
import type {OrderBookLevel} from "../../orderbook/models/OrderBookLevel";
import type {CentralStrategyExecutionLeg} from "../models/CentralStrategyExecutionPlan";
import type {CentralPaperQueueRecord} from "./CentralPaperExecutionQueueService";
import type {CentralPaperSimulationEvidence, CentralPaperLegSimulationEvidence} from "./CentralMultiLegPaperSimulator";
import type {CentralPaperSimulationEvidenceProvider as EvidenceProviderPort} from "./CentralPaperExecutionWorkerService";
import {centralPaperPassiveFillEvidenceService, type CentralPaperPassiveFillEvidenceService} from "./CentralPaperPassiveFillEvidenceService";

export interface CentralPaperMarketSimulationSource {
  inspect(leg: CentralStrategyExecutionLeg, now: number): {
    readonly levels: readonly OrderBookLevel[];
    readonly quoteTimestamp: number;
    readonly feePercent: number;
    readonly feeEvidenceId: string;
    readonly feeEvidenceSource: CentralPaperLegSimulationEvidence["feeEvidenceSource"];
    readonly settlementAsset: string;
    readonly priceStep: number;
  } | null;
}

export class CentralPaperSimulationEvidenceProvider implements EvidenceProviderPort {
  constructor(private readonly source: CentralPaperMarketSimulationSource = new DefaultCentralPaperMarketSimulationSource(),
    private readonly maximumEvidenceAgeMs = 3_000,
    private readonly passiveFillEvidence: CentralPaperPassiveFillEvidenceService = centralPaperPassiveFillEvidenceService) {
    if (!Number.isSafeInteger(maximumEvidenceAgeMs) || maximumEvidenceAgeMs <= 0) throw new Error("Central PAPER simulation evidence age must be positive.");
  }

  getEvidence(record: CentralPaperQueueRecord, now: number): CentralPaperSimulationEvidence | null {
    if (record.state !== "LEASED" || !record.leaseId || record.leaseExpiresAt === null || record.leaseExpiresAt < now) return null;
    const evidence: CentralPaperLegSimulationEvidence[] = [];
    const inspected = new Map<string, NonNullable<ReturnType<CentralPaperMarketSimulationSource["inspect"]>>>();
    let oldestTimestamp = now;
    for (const leg of record.plan.legs) {
      if (leg.quantity === null) return null;
      const market = this.source.inspect(leg, now);
      if (!market || market.quoteTimestamp > now || now - market.quoteTimestamp > this.maximumEvidenceAgeMs) return null;
      inspected.set(leg.id, market); oldestTimestamp = Math.min(oldestTimestamp, market.quoteTimestamp);
    }
    const passiveLegs = record.plan.legs.filter((leg) => leg.orderType === "LIMIT_POST_ONLY");
    const passive = passiveLegs.length > 0
      ? this.passiveFillEvidence.observe(record, new Map(passiveLegs.map((leg) => [leg.id, inspected.get(leg.id)!.priceStep])), now)
      : null;
    if (passiveLegs.length > 0 && (!passive || !passive.ready)) return null;
    const passiveByLeg = new Map(passive?.legs.map((item) => [item.legId, item]) ?? []);
    const triggerFill = passive?.legs.find((item) => item.filledQuantity > 0) ?? null;

    for (const leg of record.plan.legs) {
      const market = inspected.get(leg.id)!;
      if (leg.orderType === "LIMIT_POST_ONLY") {
        const fill = passiveByLeg.get(leg.id)!;
        const ratio = normalize(Math.min(1, fill.filledQuantity / leg.quantity!));
        evidence.push({legId: leg.id, feePercent: market.feePercent, feeEvidenceId: market.feeEvidenceId,
          feeEvidenceSource: market.feeEvidenceSource, settlementAsset: market.settlementAsset,
          simulatedSlippagePercent: 0, fillRatio: ratio,
          terminalStatus: ratio >= 1 ? "FILLED" : ratio > 0 ? "PARTIALLY_FILLED" : "FAILED",
          passiveFillEvidenceId: fill.proofId});
        continue;
      }
      const targetQuantity = leg.dependency === "PASSIVE_FILL_TRIGGER" && triggerFill
        ? Math.min(leg.quantity!, triggerFill.filledQuantity)
        : leg.quantity!;
      const vwap = calculateVwap(market.levels, targetQuantity);
      if (!vwap || vwap.filledQuantity + 1e-12 < targetQuantity) {
        if (leg.dependency !== "PASSIVE_FILL_TRIGGER") return null;
        evidence.push({legId: leg.id, feePercent: market.feePercent, feeEvidenceId: market.feeEvidenceId,
          feeEvidenceSource: market.feeEvidenceSource, settlementAsset: market.settlementAsset,
          simulatedSlippagePercent: 0, fillRatio: 0, terminalStatus: "FAILED", passiveFillEvidenceId: null});
        continue;
      }
      const adverseSlippagePercent = leg.side === "BUY"
        ? Math.max(0, (vwap.vwap - leg.referencePrice) / leg.referencePrice * 100)
        : Math.max(0, (leg.referencePrice - vwap.vwap) / leg.referencePrice * 100);
      const ratio = normalize(targetQuantity / leg.quantity!);
      evidence.push({legId: leg.id, feePercent: market.feePercent, feeEvidenceId: market.feeEvidenceId,
        feeEvidenceSource: market.feeEvidenceSource, settlementAsset: market.settlementAsset,
        simulatedSlippagePercent: normalize(adverseSlippagePercent),
        fillRatio: ratio, terminalStatus: ratio >= 1 ? "FILLED" : "PARTIALLY_FILLED", passiveFillEvidenceId: null});
    }
    return freeze({planId: record.plan.id, queueRecordId: record.id, leaseId: record.leaseId, generatedAt: now,
      expiresAt: Math.min(record.plan.expiresAt, record.leaseExpiresAt, oldestTimestamp + this.maximumEvidenceAgeMs),
      legs: evidence, exchangeOrderEvidenceUsed: false});
  }

  getDiagnostics(now = Date.now()) {
    return freeze({version: "60.0" as const, generatedAt: now, maximumEvidenceAgeMs: this.maximumEvidenceAgeMs,
      passive: this.passiveFillEvidence.getDiagnostics(now),
      safety: {fullDepthForMarketLegs: true, explicitFeeEvidenceRequired: true, passivePublicTradeProofRequired: true,
        exchangeFillClaimed: false, liveExecutionAllowed: false, orderSubmissionAllowed: false}});
  }
}

export class DefaultCentralPaperMarketSimulationSource implements CentralPaperMarketSimulationSource {
  inspect(leg: CentralStrategyExecutionLeg, now: number) {
    if (leg.product === "SPOT") {
      const book = orderBookService.get(leg.exchange, leg.market);
      const fee = getExchangeFeeEvidence(leg.exchange, leg.market);
      const capability = exchangeCapabilityService.getCachedCapability(leg.exchange, leg.market, "spot");
      if (!book || book.timestamp > now || now - book.timestamp > 15_000 || !fee || !capability) return null;
      const percent = leg.orderType === "LIMIT_POST_ONLY" ? fee.makerPercent : fee.takerPercent;
      if (!Number.isFinite(percent) || percent < 0) return null;
      return {levels: leg.side === "BUY" ? book.asks : book.bids, quoteTimestamp: book.timestamp, feePercent: percent,
        feeEvidenceId: `spot-fee:${fee.exchange}:${fee.market ?? "default"}:${fee.synchronizedAt ?? "static"}`,
        feeEvidenceSource: fee.source, settlementAsset: capability.quoteAsset, priceStep: capability.price.priceStep ?? 0};
    }
    const book = derivativeDepthService.getBook(leg.exchange, leg.market, now);
    const fee = derivativeFeeEvidenceService.get(leg.exchange);
    const market = derivativeMarketDataService.getSnapshot(now).markets.find((item) => item.exchange === leg.exchange && item.market === leg.market);
    const capability = exchangeCapabilityService.getCachedCapability(leg.exchange, leg.market, "futures");
    if (!book || !fee || !market || !capability) return null;
    const percent = leg.orderType === "LIMIT_POST_ONLY" ? fee.makerPercent : fee.takerPercent;
    return {levels: leg.side === "BUY" ? book.asks : book.bids, quoteTimestamp: book.sourceTimestamp,
      feePercent: percent, feeEvidenceId: `derivative-fee:${fee.exchange}:${fee.configuredAt}`,
      feeEvidenceSource: "STATIC_CONFIG" as const, settlementAsset: market.settleAsset,
      priceStep: capability.price.priceStep ?? 0};
  }
}

function calculateVwap(levels: readonly OrderBookLevel[], quantity: number): {filledQuantity: number; vwap: number} | null {
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  let remaining = quantity; let notional = 0;
  for (const level of levels) {
    if (!Number.isFinite(level.price) || level.price <= 0 || !Number.isFinite(level.quantity) || level.quantity <= 0) continue;
    const fill = Math.min(remaining, level.quantity); notional += fill * level.price; remaining -= fill;
    if (remaining <= 1e-12) break;
  }
  const filledQuantity = quantity - Math.max(0, remaining);
  return filledQuantity > 0 ? {filledQuantity, vwap: notional / filledQuantity} : null;
}
function normalize(value: number): number { return Number(value.toFixed(12)); }
function freeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; for (const nested of Object.values(value)) freeze(nested); return Object.freeze(value); }

export const centralPaperSimulationEvidenceProvider = new CentralPaperSimulationEvidenceProvider();
