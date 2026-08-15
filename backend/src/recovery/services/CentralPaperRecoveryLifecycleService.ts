import {getExchangeFeeEvidence} from "../../arbitrage/config/fees";
import {derivativeDepthService} from "../../derivatives/services/DerivativeDepthService";
import {derivativeFeeEvidenceService} from "../../derivatives/services/DerivativeFeeEvidenceService";
import type {OrderBookLevel} from "../../orderbook/models/OrderBookLevel";
import {orderBookService} from "../../orderbook/services/OrderBookService";
import {strategyRuntimeOperatorConfiguration} from "../../strategies/config/StrategyRuntimeOperatorConfiguration";
import {centralPaperCapitalAllocationService} from "../../strategies/services/CentralPaperCapitalAllocationService";
import {centralPaperCapitalValuationService} from "../../strategies/services/CentralPaperCapitalValuationService";
import {centralPaperPositionAccountingService} from "../../strategies/services/CentralPaperPositionAccountingService";
import {centralPaperPositionLedgerService, type CentralPaperRecoverySettlementEvidence} from "../../strategies/services/CentralPaperPositionLedgerService";
import {centralPaperSimulationJournalService, type CentralPaperSimulationJournalRecord} from "../../strategies/services/CentralPaperSimulationJournalService";
import type {CentralPaperSimulatedLegResult} from "../../strategies/services/CentralMultiLegPaperSimulator";

export interface CentralPaperRecoveryMarketSource {
  inspect(exchange: string, product: "SPOT" | "PERPETUAL", market: string, side: "BUY" | "SELL", now: number): {
    readonly levels: readonly OrderBookLevel[]; readonly sourceTimestamp: number; readonly feePercent: number; readonly feeEvidenceId: string;
  } | null;
}

export interface CentralPaperRecoveryLifecyclePort {
  getPending(): readonly CentralPaperSimulationJournalRecord[];
  recordSettlement(journal: CentralPaperSimulationJournalRecord, evidence: CentralPaperRecoverySettlementEvidence, now: number): ReturnType<typeof centralPaperPositionLedgerService.recordRecoveredSettlement>;
  markCompleted(resultId: string, evidenceId: string, now: number): void;
  convert(asset: string, quantity: number, contextId: string, now: number): ReturnType<typeof centralPaperCapitalValuationService.convertAssetToInr>;
  book(group: ReturnType<typeof centralPaperPositionLedgerService.recordRecoveredSettlement>, conversion: NonNullable<ReturnType<typeof centralPaperCapitalValuationService.convertAssetToInr>>, now: number): void;
  releaseCapital(planId: string, reason: string, now: number): void;
}

export class CentralPaperRecoveryLifecycleService {
  private readonly enabled: boolean; private readonly pollIntervalMs: number; private readonly maximumRecoveryAgeMs: number;
  private timer: ReturnType<typeof setInterval> | null = null; private running = false; private scans = 0;
  private completed = 0; private accounted = 0; private blocked = 0; private lastRun: ReturnType<CentralPaperRecoveryLifecycleService["runOnce"]> | null = null;

  constructor(configuration: {enabled?: boolean; pollIntervalMs?: number; maximumRecoveryAgeMs?: number} = {},
    private readonly port: CentralPaperRecoveryLifecyclePort = new DefaultCentralPaperRecoveryLifecyclePort(),
    private readonly source: CentralPaperRecoveryMarketSource = new DefaultCentralPaperRecoveryMarketSource()) {
    this.enabled = configuration.enabled ?? false; this.pollIntervalMs = configuration.pollIntervalMs ?? 1_000;
    this.maximumRecoveryAgeMs = configuration.maximumRecoveryAgeMs ?? 30_000;
    if (!Number.isSafeInteger(this.pollIntervalMs) || this.pollIntervalMs < 500 || this.pollIntervalMs > 60_000) throw new Error("Central PAPER recovery poll interval must be 500-60000 ms.");
    if (!Number.isSafeInteger(this.maximumRecoveryAgeMs) || this.maximumRecoveryAgeMs < 1_000 || this.maximumRecoveryAgeMs > 300_000) throw new Error("Central PAPER recovery age must be 1000-300000 ms.");
  }

  start(): void { if (!this.enabled || this.timer) return; this.timer = setInterval(() => { try { this.runOnce(); } catch (error: unknown) {
    console.error("[CentralPaperRecovery] Scan failed:", error instanceof Error ? error.message : "Unknown recovery failure."); } }, this.pollIntervalMs); this.timer.unref?.(); }
  stop(): void { if (this.timer) clearInterval(this.timer); this.timer = null; }

  runOnce(now = Date.now()) {
    if (!this.enabled) return this.finish("DISABLED", 0, 0, 0, [{resultId: null, state: "DISABLED", reason: "Central PAPER recovery is disabled."}], now);
    if (this.running) return this.finish("BLOCKED", 0, 0, 1, [{resultId: null, state: "BLOCKED", reason: "Central PAPER recovery is already running."}], now);
    this.running = true; this.scans += 1; let completed = 0; let accounted = 0; let blocked = 0;
    const outcomes: Array<{resultId: string | null; state: string; reason: string}> = [];
    try {
      for (const journal of this.port.getPending()) {
        try {
          if (now < journal.simulation.generatedAt || now - journal.simulation.generatedAt > this.maximumRecoveryAgeMs) {
            blocked += 1; outcomes.push({resultId: journal.resultId, state: "BLOCKED", reason: "Recovery evidence window expired; capital remains held for operator-safe reconciliation."}); continue;
          }
          if (crossedFundingBoundary(journal, now)) {
            blocked += 1; outcomes.push({resultId: journal.resultId, state: "BLOCKED", reason: "Residual crossed a funding boundary; funding settlement evidence is required before recovery accounting."}); continue;
          }
          const evidence = this.buildEvidence(journal, now);
          if (!evidence) { blocked += 1; outcomes.push({resultId: journal.resultId, state: "WAITING_FOR_DEPTH", reason: "Fresh full-depth recovery and explicit fee evidence is unavailable."}); continue; }
          const group = this.port.recordSettlement(journal, evidence, now);
          this.port.markCompleted(journal.resultId, group.id, now); completed += 1;
          const conversion = this.port.convert(evidence.settlementAsset, Math.abs(evidence.realizedNetPnlQuote), group.id, now);
          if (!conversion) { outcomes.push({resultId: journal.resultId, state: "SETTLED_PENDING_ACCOUNTING", reason: "Recovery settled durably; INR conversion will reconcile later."}); continue; }
          this.port.book(group, conversion, now); this.port.releaseCapital(journal.planId, "Shared PAPER recovery settled and account-posted.", now);
          accounted += 1; outcomes.push({resultId: journal.resultId, state: "RECOVERED_ACCOUNTED", reason: "Residual closed with full-depth PAPER evidence and durable accounting."});
        } catch (error: unknown) { blocked += 1; outcomes.push({resultId: journal.resultId, state: "FAILED", reason: error instanceof Error ? error.message : "Recovery lifecycle failed."}); }
      }
      this.completed += completed; this.accounted += accounted; this.blocked += blocked;
      return this.finish(outcomes.length === 0 ? "NO_DATA" : blocked > 0 ? "PARTIAL" : "COMPLETED", completed, accounted, blocked, outcomes, now);
    } finally { this.running = false; }
  }

  getDiagnostics(now = Date.now()) { return freeze({version: "62.0" as const, generatedAt: now, enabled: this.enabled,
    serviceRunning: this.timer !== null, running: this.running, pollIntervalMs: this.pollIntervalMs, maximumRecoveryAgeMs: this.maximumRecoveryAgeMs,
    scans: this.scans, completed: this.completed, accounted: this.accounted, blocked: this.blocked, lastRun: this.lastRun ? structuredClone(this.lastRun) : null,
    safety: {stagedJournalRequired: true, freshFullDepthRequired: true, explicitFeesRequired: true, fundingBoundaryFailClosed: true,
      durableSettlementBeforeAccounting: true, capitalHeldUntilAccounting: true, liveExecutionAllowed: false, orderSubmissionAllowed: false}}); }

  private buildEvidence(journal: CentralPaperSimulationJournalRecord, now: number): CentralPaperRecoverySettlementEvidence | null {
    const simulation = journal.simulation; const filled = simulation.legs.filter((leg) => leg.filledQuantity > 0);
    const settlementAssets = Array.from(new Set(filled.map((leg) => leg.settlementAsset)));
    if (settlementAssets.length !== 1 || !settlementAssets[0]) return null;
    const actions: CentralPaperRecoverySettlementEvidence["actions"][number][] = [];
    for (const exposure of simulation.economicExposure.filter((item) => Math.abs(item.signedQuantity) > 1e-12)) {
      const contribution = selectContribution(filled, exposure.product, exposure.market, exposure.signedQuantity);
      if (!contribution) return null;
      const closeSide = exposure.signedQuantity > 0 ? "SELL" as const : "BUY" as const; const quantity = Math.abs(exposure.signedQuantity);
      const market = this.source.inspect(contribution.exchange, exposure.product, exposure.market, closeSide, now);
      if (!market || market.sourceTimestamp > now || now - market.sourceTimestamp > 5_000 || !Number.isFinite(market.feePercent) || market.feePercent < 0) return null;
      const fill = vwap(market.levels, quantity); if (!fill || fill.quantity + 1e-12 < quantity) return null;
      const closeFee = normalize(fill.notional * market.feePercent / 100);
      const attributedEntryFee = normalize(contribution.feeQuote * Math.min(1, quantity / contribution.filledQuantity));
      const realized = normalize((exposure.signedQuantity > 0 ? fill.price - contribution.averageFillPrice! : contribution.averageFillPrice! - fill.price) * quantity - attributedEntryFee - closeFee);
      actions.push(freeze({id: `central-paper-recovery-action:${journal.resultId}:${exposure.product}:${exposure.market}`,
        sourceLegId: contribution.legId, exchange: contribution.exchange, product: exposure.product, market: exposure.market,
        residualSignedQuantity: exposure.signedQuantity, entryPrice: contribution.averageFillPrice!, attributedEntryFeeQuote: attributedEntryFee,
        closeSide, closePrice: fill.price, closeFeeQuote: closeFee, realizedPnlQuote: realized,
        depthEvidenceId: `recovery-depth:${contribution.exchange}:${exposure.market}:${market.sourceTimestamp}`, feeEvidenceId: market.feeEvidenceId}));
    }
    if (actions.length === 0) return null;
    const originalCash = filled.reduce((total, leg) => total + (leg.side === "SELL" ? leg.filledNotional : -leg.filledNotional) - leg.feeQuote, 0);
    const recoveryCash = actions.reduce((total, action) => total + (action.closeSide === "SELL" ? action.closePrice * Math.abs(action.residualSignedQuantity) : -action.closePrice * Math.abs(action.residualSignedQuantity)) - action.closeFeeQuote, 0);
    return freeze({version: "62.0", id: `central-paper-recovery-settlement:${journal.resultId}`, resultId: journal.resultId,
      generatedAt: now, settlementAsset: settlementAssets[0], realizedNetPnlQuote: normalize(originalCash + recoveryCash), actions,
      exchangeOrderEvidenceUsed: false});
  }

  private finish(state: "DISABLED" | "BLOCKED" | "NO_DATA" | "PARTIAL" | "COMPLETED", completed: number, accounted: number, blocked: number,
    outcomes: readonly {resultId: string | null; state: string; reason: string}[], now: number) {
    const result = freeze({version: "62.0" as const, generatedAt: now, state, completed, accounted, blocked,
      outcomes: outcomes.map((item) => ({...item})), liveExecutionAllowed: false as const, orderSubmissionAllowed: false as const});
    this.lastRun = result; return structuredClone(result);
  }
}

class DefaultCentralPaperRecoveryLifecyclePort implements CentralPaperRecoveryLifecyclePort {
  getPending() { return centralPaperSimulationJournalService.getRecoveryRecords(); }
  recordSettlement(journal: CentralPaperSimulationJournalRecord, evidence: CentralPaperRecoverySettlementEvidence, now: number) { return centralPaperPositionLedgerService.recordRecoveredSettlement(journal, evidence, now); }
  markCompleted(resultId: string, evidenceId: string, now: number) { centralPaperSimulationJournalService.markRecoveryCompleted(resultId, evidenceId, now); }
  convert(asset: string, quantity: number, contextId: string, now: number) { return centralPaperCapitalValuationService.convertAssetToInr(asset, quantity, contextId, now); }
  book(group: ReturnType<typeof centralPaperPositionLedgerService.recordRecoveredSettlement>, conversion: NonNullable<ReturnType<typeof centralPaperCapitalValuationService.convertAssetToInr>>, now: number) { centralPaperPositionAccountingService.book(group, conversion, now); }
  releaseCapital(planId: string, reason: string, now: number) { centralPaperCapitalAllocationService.releaseByPlanId(planId, reason, now); }
}

class DefaultCentralPaperRecoveryMarketSource implements CentralPaperRecoveryMarketSource {
  inspect(exchange: string, product: "SPOT" | "PERPETUAL", market: string, side: "BUY" | "SELL", now: number) {
    if (product === "SPOT") { const book = orderBookService.get(exchange, market); const fee = getExchangeFeeEvidence(exchange, market);
      if (!book || !fee || book.timestamp > now || now - book.timestamp > 15_000) return null;
      return {levels: side === "BUY" ? book.asks : book.bids, sourceTimestamp: book.timestamp, feePercent: fee.takerPercent,
        feeEvidenceId: `spot-fee:${fee.exchange}:${fee.market ?? "default"}:${fee.synchronizedAt ?? "static"}`}; }
    const book = derivativeDepthService.getBook(exchange, market, now); const fee = derivativeFeeEvidenceService.get(exchange); if (!book || !fee) return null;
    return {levels: side === "BUY" ? book.asks : book.bids, sourceTimestamp: book.sourceTimestamp, feePercent: fee.takerPercent,
      feeEvidenceId: `derivative-fee:${fee.exchange}:${fee.configuredAt}`};
  }
}

function selectContribution(legs: readonly CentralPaperSimulatedLegResult[], product: "SPOT" | "PERPETUAL", market: string, signed: number) {
  return legs.filter((leg) => leg.product === product && leg.market === market && Math.sign(leg.signedPositionDelta) === Math.sign(signed) && leg.averageFillPrice !== null)
    .sort((a, b) => Math.abs(b.signedPositionDelta) - Math.abs(a.signedPositionDelta) || a.legId.localeCompare(b.legId))[0] ?? null;
}
function crossedFundingBoundary(journal: CentralPaperSimulationJournalRecord, now: number): boolean {
  const policy = journal.simulation.settlementPolicy;
  if (!("fundingTimestamps" in policy)) return false;
  return policy.fundingTimestamps.some((time) => time > journal.simulation.generatedAt && time <= now);
}
function vwap(levels: readonly OrderBookLevel[], quantity: number): {quantity: number; price: number; notional: number} | null {
  let remaining = quantity; let notional = 0; for (const level of levels) { if (level.price <= 0 || level.quantity <= 0) continue;
    const fill = Math.min(remaining, level.quantity); notional += fill * level.price; remaining -= fill; if (remaining <= 1e-12) break; }
  const filled = quantity - Math.max(0, remaining); return filled > 0 ? {quantity: filled, price: notional / filled, notional} : null;
}
function normalize(value: number): number { return Number(value.toFixed(12)); }
function freeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; for (const nested of Object.values(value)) freeze(nested); return Object.freeze(value); }

export const centralPaperRecoveryLifecycleService = new CentralPaperRecoveryLifecycleService({enabled: strategyRuntimeOperatorConfiguration.centralPaper.enabled});
