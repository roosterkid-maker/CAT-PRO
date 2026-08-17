import type {CentralStrategyExecutionLeg} from "../models/CentralStrategyExecutionPlan";
import type {CentralPaperQueueRecord} from "./CentralPaperExecutionQueueService";
import {crossExchangeMarketMakingPublicTradeTapeService, type CrossExchangeMarketMakingPublicTrade} from "../cross-exchange-market-making/CrossExchangeMarketMakingPublicTradeTapeService";

export interface CentralPaperPassiveTradeSource {
  watch(exchange: string, markets: readonly string[]): void;
  getTrades(exchange: string, market: string, afterExclusive: number, throughInclusive: number): readonly CrossExchangeMarketMakingPublicTrade[];
}

export interface CentralPaperPassiveLegObservation {
  readonly legId: string;
  readonly filledQuantity: number;
  readonly proofId: string | null;
  readonly proofTradeIds: readonly string[];
  readonly stagedAt: number;
  readonly method: "PUBLIC_TRADE_ONE_TICK_THROUGH_CONSERVATIVE_V60";
}

export interface CentralPaperPassiveObservation {
  readonly ready: boolean;
  readonly legs: readonly CentralPaperPassiveLegObservation[];
}

interface MutableLegState {
  stagedAt: number;
  filledQuantity: number;
  processedTradeIds: Set<string>;
  proofTradeIds: string[];
}

export class CentralPaperPassiveFillEvidenceService {
  private readonly states = new Map<string, MutableLegState>();
  private staged = 0;
  private observedFills = 0;

  constructor(
    private readonly source: CentralPaperPassiveTradeSource = crossExchangeMarketMakingPublicTradeTapeService,
    private readonly minimumRestingTimeMs = 1_000,
    private readonly partialSettlementGraceMs = 1_500,
    private readonly maximumStates = 2_000,
  ) {
    if (!Number.isSafeInteger(minimumRestingTimeMs) || minimumRestingTimeMs < 250 || minimumRestingTimeMs > 60_000) {
      throw new Error("Central PAPER passive minimum resting time must be 250-60000 ms.");
    }
    if (!Number.isSafeInteger(partialSettlementGraceMs) || partialSettlementGraceMs < 250 || partialSettlementGraceMs > 60_000) {
      throw new Error("Central PAPER passive settlement grace must be 250-60000 ms.");
    }
    if (!Number.isSafeInteger(maximumStates) || maximumStates < 1) throw new Error("Central PAPER passive state capacity must be positive.");
  }

  observe(record: CentralPaperQueueRecord, priceStepByLegId: ReadonlyMap<string, number>, now: number): CentralPaperPassiveObservation | null {
    const passiveLegs = record.plan.legs.filter((leg) => leg.orderType === "LIMIT_POST_ONLY");
    if (passiveLegs.length === 0 || passiveLegs.some((leg) => leg.quantity === null || !Number.isFinite(leg.quantity) || leg.quantity <= 0)) return null;
    this.prune(record, now);
    for (const leg of passiveLegs) this.source.watch(leg.exchange, [leg.market]);

    const observations = passiveLegs.map((leg) => this.observeLeg(record, leg, priceStepByLegId.get(leg.id) ?? null, now));
    if (observations.some((item) => item === null)) return null;
    const legs = observations as CentralPaperPassiveLegObservation[];
    const anyFill = legs.some((item) => item.filledQuantity > 0);
    const everyFull = legs.every((item, index) => item.filledQuantity + 1e-12 >= (passiveLegs[index]!.quantity ?? Number.POSITIVE_INFINITY));
    const singlePassiveMaker = record.plan.pattern === "PASSIVE_MAKER_THEN_HEDGE" && passiveLegs.length === 1;
    const partialSettlementDue = anyFill && now + this.partialSettlementGraceMs >= record.plan.expiresAt;
    return freeze({ready: (singlePassiveMaker && anyFill) || everyFull || partialSettlementDue, legs});
  }

  getDiagnostics(now = Date.now()) {
    return freeze({version: "60.0" as const, generatedAt: now, activeLegStates: this.states.size, staged: this.staged,
      observedFills: this.observedFills, minimumRestingTimeMs: this.minimumRestingTimeMs,
      partialSettlementGraceMs: this.partialSettlementGraceMs,
      safety: {publicTradesOnly: true, oneTickTradeThroughRequired: true, touchIsNotFill: true,
        exchangeFillClaimed: false, liveExecutionAllowed: false, orderSubmissionAllowed: false}});
  }

  private observeLeg(record: CentralPaperQueueRecord, leg: CentralStrategyExecutionLeg, priceStep: number | null, now: number): CentralPaperPassiveLegObservation | null {
    if (priceStep === null || !Number.isFinite(priceStep) || priceStep <= 0 || leg.quantity === null) return null;
    const key = `${record.id}:${leg.id}`;
    let state = this.states.get(key);
    if (!state) {
      if (this.states.size >= this.maximumStates) this.pruneOldest();
      state = {stagedAt: now, filledQuantity: 0, processedTradeIds: new Set(), proofTradeIds: []};
      this.states.set(key, state); this.staged += 1;
    }
    const eligibleAfter = state.stagedAt + this.minimumRestingTimeMs;
    if (now >= eligibleAfter && state.filledQuantity + 1e-12 < leg.quantity) {
      const trades = this.source.getTrades(leg.exchange, leg.market, state.stagedAt, now)
        .filter((trade) => trade.occurredAt >= eligibleAfter && trade.occurredAt <= now)
        .sort((a, b) => a.occurredAt - b.occurredAt || a.id.localeCompare(b.id));
      for (const trade of trades) {
        if (state.processedTradeIds.has(trade.id)) continue;
        state.processedTradeIds.add(trade.id);
        const crossed = leg.side === "BUY"
          ? trade.aggressorSide === "SELL" && trade.price <= leg.referencePrice - priceStep + 1e-12
          : trade.aggressorSide === "BUY" && trade.price >= leg.referencePrice + priceStep - 1e-12;
        if (!crossed) continue;
        const before = state.filledQuantity;
        state.filledQuantity = normalize(Math.min(leg.quantity, state.filledQuantity + trade.quantity));
        if (state.filledQuantity > before) { state.proofTradeIds.push(trade.id); this.observedFills += 1; }
        if (state.filledQuantity + 1e-12 >= leg.quantity) break;
      }
    }
    return freeze({legId: leg.id, filledQuantity: state.filledQuantity,
      proofId: state.proofTradeIds.length > 0 ? `central-passive-fill:${record.id}:${leg.id}:${state.proofTradeIds.join(",")}` : null,
      proofTradeIds: [...state.proofTradeIds], stagedAt: state.stagedAt,
      method: "PUBLIC_TRADE_ONE_TICK_THROUGH_CONSERVATIVE_V60" as const});
  }

  private prune(record: CentralPaperQueueRecord, now: number): void {
    for (const key of this.states.keys()) {
      if (key.startsWith(`${record.id}:`) && record.plan.expiresAt < now) this.states.delete(key);
    }
  }

  private pruneOldest(): void {
    const oldest = [...this.states.entries()].sort((a, b) => a[1].stagedAt - b[1].stagedAt || a[0].localeCompare(b[0]))[0];
    if (oldest) this.states.delete(oldest[0]);
  }
}

function normalize(value: number): number { return Number(value.toFixed(12)); }
function freeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; for (const nested of Object.values(value)) freeze(nested); return Object.freeze(value); }

export const centralPaperPassiveFillEvidenceService = new CentralPaperPassiveFillEvidenceService();
