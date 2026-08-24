import {
  getExchangeFeeEvidence,
} from "../../arbitrage/config/fees";

import {
  derivativeDepthService,
} from "../../derivatives/services/DerivativeDepthService";

import {
  derivativeFeeEvidenceService,
} from "../../derivatives/services/DerivativeFeeEvidenceService";

import type {
  DerivativeFundingSettlementEvidence,
} from "../../derivatives/models/DerivativeFundingSettlementEvidence";

import {
  derivativeFundingSettlementEvidenceService,
} from "../../derivatives/services/DerivativeFundingSettlementEvidenceService";

import type {
  OrderBookLevel,
} from "../../orderbook/models/OrderBookLevel";

import {
  orderBookService,
} from "../../orderbook/services/OrderBookService";

import type {
  CentralStrategySettlementPolicy,
} from "../models/CentralStrategyExecutionPlan";

import type {
  CentralPaperPositionCloseEvidence,
  CentralPaperPositionGroup,
  CentralPaperPositionLeg,
} from "./CentralPaperPositionLedgerService";

export interface CentralPaperExitMarketSource {
  inspect(
    position: CentralPaperPositionLeg,
    now: number,
  ): {
    readonly levels: readonly OrderBookLevel[];
    readonly observedAt: number;
    readonly sourceTimestamp: number;
    readonly feePercent: number;
    readonly feeEvidenceId: string;
    readonly feeEvidenceSource: "STATIC_CONFIG" | "PUBLIC_API" | "ACCOUNT_API";
  } | null;
}

export interface CentralPaperFundingSettlementSource {
  get(
    exchange: string,
    market: string,
    fundingTime: number,
    now?: number,
  ): DerivativeFundingSettlementEvidence | null;
}

export interface CentralPaperExitEvaluation {
  readonly state: "READY_TO_CLOSE" | "HOLD" | "BLOCKED";
  readonly policyKind: CentralStrategySettlementPolicy["kind"];
  readonly metric: number | null;
  readonly threshold: number | null;
  readonly blockers: readonly string[];
  readonly closeEvidence: CentralPaperPositionCloseEvidence | null;
}

export class CentralPaperExitEvidenceProvider {
  constructor(
    private readonly source: CentralPaperExitMarketSource = new DefaultCentralPaperExitMarketSource(),
    private readonly maximumEvidenceAgeMs = 5_000,
    private readonly fundingSource: CentralPaperFundingSettlementSource = derivativeFundingSettlementEvidenceService,
    private readonly maximumFundingTimeMatchSkewMs = 1_000,
  ) {}

  evaluate(
    group: CentralPaperPositionGroup,
    policy: CentralStrategySettlementPolicy,
    now = Date.now(),
  ): CentralPaperExitEvaluation {
    if (group.state !== "OPEN" || group.positions.length === 0) return result("BLOCKED", policy.kind, null, null, ["POSITION_GROUP_NOT_OPEN"]);
    if (policy.kind !== "FUNDING_CAPTURE_THEN_EXIT" && policy.kind !== "BASIS_CONVERGENCE" &&
        policy.kind !== "SPREAD_CONVERGENCE" && policy.kind !== "STATISTICAL_MEAN_REVERSION") {
      return result("BLOCKED", policy.kind, null, null, ["SETTLEMENT_POLICY_NOT_OPEN_POSITION_EXIT"]);
    }
    if (policy.kind === "FUNDING_CAPTURE_THEN_EXIT" && now < policy.notBefore) {
      return result("HOLD", policy.kind, null, null, ["FUNDING_WINDOW_NOT_REACHED"]);
    }
    const funding = group.positions.map((position) => this.fundingFor(position, policy, now));
    const fundingBlockers = funding.flatMap((item) => item.blocker ? [item.blocker] : []);
    if (fundingBlockers.length > 0) return result("BLOCKED", policy.kind, null, null, fundingBlockers);
    const closes = group.positions.map((position) => {
      const market = this.source.inspect(position, now);
      if (!market || market.observedAt > now || now - market.observedAt > this.maximumEvidenceAgeMs) return null;
      const fill = vwap(market.levels, Math.abs(position.signedQuantity));
      if (!fill || fill.filledQuantity + 1e-12 < Math.abs(position.signedQuantity)) return null;
      return {position, price: fill.price, market};
    });
    if (closes.some((item) => item === null)) return result("BLOCKED", policy.kind, null, null, ["FRESH_FULL_DEPTH_CLOSE_EVIDENCE_UNAVAILABLE"]);
    const complete = closes.filter((item): item is NonNullable<typeof item> => item !== null);
    const condition = policy.kind === "FUNDING_CAPTURE_THEN_EXIT"
      ? {met: true, metric: null, threshold: null}
      : exitCondition(policy, complete);
    if (!condition.met) return result("HOLD", policy.kind, condition.metric, condition.threshold, ["STRATEGY_EXIT_CONDITION_NOT_MET"]);
    const evidence: CentralPaperPositionCloseEvidence = freeze({
      id: `central-paper-close:${group.id}:${now}`,
      groupId: group.id,
      generatedAt: now,
      expiresAt: Math.min(...complete.map((item) => item.market.observedAt + this.maximumEvidenceAgeMs)),
      positions: complete.map((item, index) => ({
        positionId: item.position.id,
        closePrice: item.price,
        closeFeePercent: item.market.feePercent,
        feeEvidenceId: item.market.feeEvidenceId,
        feeEvidenceSource: item.market.feeEvidenceSource,
        fundingPaymentQuote: funding[index]!.paymentQuote,
        fundingPaymentEvidenceId: funding[index]!.evidenceId,
        fullyFilled: true,
      })),
      exchangeOrderEvidenceUsed: false,
    });
    return freeze({state: "READY_TO_CLOSE", policyKind: policy.kind, metric: condition.metric, threshold: condition.threshold, blockers: [], closeEvidence: evidence});
  }

  private fundingFor(
    position: CentralPaperPositionLeg,
    policy: Extract<CentralStrategySettlementPolicy, {
      kind: "FUNDING_CAPTURE_THEN_EXIT" | "BASIS_CONVERGENCE" | "SPREAD_CONVERGENCE" | "STATISTICAL_MEAN_REVERSION";
    }>,
    now: number,
  ): {paymentQuote: number; evidenceId: string; blocker: string | null} {
    if (position.product === "SPOT") {
      return {paymentQuote: 0, evidenceId: `funding-not-applicable:spot:${position.id}`, blocker: null};
    }
    const fundingTimes = fundingTimestampsFor(position, policy);
    if (fundingTimes.length === 0 || fundingTimes.some((fundingTime) =>
      !Number.isSafeInteger(fundingTime) || fundingTime <= 0,
    )) {
      return {paymentQuote: 0, evidenceId: "", blocker: `FUNDING_TIMESTAMP_INVALID:${position.id}`};
    }
    const evidenceIds: string[] = [];
    let paymentQuote = 0;
    for (const fundingTime of fundingTimes) {
      if (now < fundingTime) {
        evidenceIds.push(`funding-not-crossed:${position.id}:${fundingTime}`);
        continue;
      }
      const evidence = this.fundingSource.get(position.exchange, position.market, fundingTime, now);
      if (!evidence) {
        return {paymentQuote: 0, evidenceId: "",
          blocker: `PUBLIC_SETTLED_FUNDING_EVIDENCE_UNAVAILABLE:${position.exchange}:${position.market}:${fundingTime}`};
      }
      if (
        evidence.exchange !== position.exchange ||
        evidence.market !== position.market ||
        Math.abs(evidence.fundingTime - fundingTime) > this.maximumFundingTimeMatchSkewMs ||
        evidence.observedAt > now ||
        evidence.accountTransactionEvidenceUsed !== false ||
        evidence.liveExecutionAllowed !== false ||
        evidence.orderSubmissionAllowed !== false
      ) {
        return {paymentQuote: 0, evidenceId: "",
          blocker: `FUNDING_EVIDENCE_LINEAGE_MISMATCH:${position.exchange}:${position.market}:${fundingTime}`};
      }
      if (evidence.settlementAsset !== position.settlementAsset) {
        return {paymentQuote: 0, evidenceId: "",
          blocker: `FUNDING_SETTLEMENT_ASSET_MISMATCH:${position.exchange}:${position.market}:${fundingTime}`};
      }
      paymentQuote += -position.signedQuantity * evidence.markPrice * evidence.fundingRate;
      evidenceIds.push(`${evidence.id}:${evidence.priceQuality}`);
    }
    return {
      paymentQuote: normalize(paymentQuote),
      evidenceId: fundingTimes.length === 1
        ? evidenceIds[0]!
        : `funding-bundle:${fundingTimes.length}:${evidenceIds.join("|")}`,
      blocker: null,
    };
  }
}

class DefaultCentralPaperExitMarketSource implements CentralPaperExitMarketSource {
  inspect(position: CentralPaperPositionLeg, now: number) {
    if (position.product === "SPOT") {
      const book = orderBookService.get(position.exchange, position.market);
      const fee = getExchangeFeeEvidence(position.exchange, position.market);
      if (!book || !fee || book.timestamp > now || now - book.timestamp > 15_000) return null;
      return {levels: position.signedQuantity > 0 ? book.bids : book.asks, observedAt: book.timestamp, sourceTimestamp: book.timestamp,
        feePercent: fee.takerPercent, feeEvidenceId: `spot-fee:${fee.exchange}:${fee.market ?? "default"}:${fee.synchronizedAt ?? "static"}`,
        feeEvidenceSource: fee.source};
    }
    const book = derivativeDepthService.getBook(position.exchange, position.market, now);
    const fee = derivativeFeeEvidenceService.get(position.exchange);
    if (!book || !fee) return null;
    return {levels: position.signedQuantity > 0 ? book.bids : book.asks, observedAt: book.observedAt, sourceTimestamp: book.sourceTimestamp,
      feePercent: fee.takerPercent, feeEvidenceId: `derivative-fee:${fee.exchange}:${fee.configuredAt}`,
      feeEvidenceSource: "STATIC_CONFIG" as const};
  }
}

function exitCondition(
  policy: Extract<CentralStrategySettlementPolicy, {kind: "BASIS_CONVERGENCE" | "SPREAD_CONVERGENCE" | "STATISTICAL_MEAN_REVERSION"}>,
  closes: readonly {position: CentralPaperPositionLeg; price: number}[],
): {met: boolean; metric: number; threshold: number} {
  if (policy.kind === "BASIS_CONVERGENCE") {
    const spot = closes.find((item) => item.position.product === "SPOT");
    const perpetual = closes.find((item) => item.position.product === "PERPETUAL");
    if (!spot || !perpetual) return {met: false, metric: Number.POSITIVE_INFINITY, threshold: policy.closeAtOrBelowAbsoluteBasisPercent};
    const metric = Math.abs((perpetual.price - spot.price) / spot.price * 100);
    return {met: metric <= policy.closeAtOrBelowAbsoluteBasisPercent, metric: normalize(metric), threshold: policy.closeAtOrBelowAbsoluteBasisPercent};
  }
  if (policy.kind === "SPREAD_CONVERGENCE") {
    if (closes.length !== 2) return {met: false, metric: Number.POSITIVE_INFINITY, threshold: policy.closeAtOrBelowAbsoluteDislocationPercent};
    const midpoint = (closes[0]!.price + closes[1]!.price) / 2;
    const metric = Math.abs(closes[0]!.price - closes[1]!.price) / midpoint * 100;
    return {met: metric <= policy.closeAtOrBelowAbsoluteDislocationPercent, metric: normalize(metric), threshold: policy.closeAtOrBelowAbsoluteDislocationPercent};
  }
  const left = closes.find((item) => item.position.market === policy.leftMarket);
  const right = closes.find((item) => item.position.market === policy.rightMarket);
  if (!left || !right) return {met: false, metric: Number.POSITIVE_INFINITY, threshold: policy.closeAtOrBelowAbsoluteZScore};
  const spread = Math.log(left.price) - policy.hedgeBeta * Math.log(right.price);
  const zScore = (spread - policy.baselineSpreadMean) / policy.baselineSpreadStandardDeviation;
  const metric = Math.abs(zScore);
  return {met: metric <= policy.closeAtOrBelowAbsoluteZScore, metric: normalize(metric), threshold: policy.closeAtOrBelowAbsoluteZScore};
}

function fundingTimestampFor(
  position: CentralPaperPositionLeg,
  policy: Extract<CentralStrategySettlementPolicy, {
    kind: "FUNDING_CAPTURE_THEN_EXIT" | "BASIS_CONVERGENCE" | "SPREAD_CONVERGENCE" | "STATISTICAL_MEAN_REVERSION";
  }>,
): number {
  if (policy.fundingTimestamps.length === 1) return policy.fundingTimestamps[0]!;
  return position.signedQuantity > 0 ? policy.fundingTimestamps[0]! : policy.fundingTimestamps[1]!;
}

function fundingTimestampsFor(
  position: CentralPaperPositionLeg,
  policy: Extract<CentralStrategySettlementPolicy, {
    kind: "FUNDING_CAPTURE_THEN_EXIT" | "BASIS_CONVERGENCE" | "SPREAD_CONVERGENCE" | "STATISTICAL_MEAN_REVERSION";
  }>,
): readonly number[] {
  if (policy.kind === "FUNDING_CAPTURE_THEN_EXIT" && policy.fundingLegSchedules) {
    return position.signedQuantity > 0
      ? policy.fundingLegSchedules.longTimestamps
      : policy.fundingLegSchedules.shortTimestamps;
  }
  if (policy.kind === "FUNDING_CAPTURE_THEN_EXIT" && policy.fundingSchedule) {
    return policy.fundingSchedule.map((window) =>
      position.signedQuantity > 0 ? window.longTimestamp : window.shortTimestamp,
    );
  }
  return [fundingTimestampFor(position, policy)];
}

function vwap(levels: readonly OrderBookLevel[], quantity: number): {filledQuantity: number; price: number} | null {
  let remaining = quantity; let notional = 0;
  for (const level of levels) { const fill = Math.min(remaining, level.quantity); notional += fill * level.price; remaining -= fill; if (remaining <= 1e-12) break; }
  const filledQuantity = quantity - Math.max(0, remaining);
  return filledQuantity > 0 ? {filledQuantity, price: notional / filledQuantity} : null;
}
function result(state: CentralPaperExitEvaluation["state"], policyKind: CentralStrategySettlementPolicy["kind"], metric: number | null,
  threshold: number | null, blockers: readonly string[]): CentralPaperExitEvaluation { return freeze({state, policyKind, metric, threshold, blockers: [...blockers], closeEvidence: null}); }
function normalize(value: number): number { return Number(value.toFixed(12)); }
function freeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; for (const nested of Object.values(value)) freeze(nested); return Object.freeze(value); }

export const centralPaperExitEvidenceProvider = new CentralPaperExitEvidenceProvider();
