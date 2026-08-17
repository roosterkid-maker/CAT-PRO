import type {CentralStrategyExecutionLeg, CentralStrategyExecutionPlan} from "../models/CentralStrategyExecutionPlan";
import type {CentralStrategySettlementPolicy} from "../models/CentralStrategyExecutionPlan";
import type {CentralPaperQueueRecord} from "./CentralPaperExecutionQueueService";

export interface CentralPaperLegSimulationEvidence {
  readonly legId: string;
  readonly settlementAsset: string;
  readonly feePercent: number;
  readonly feeEvidenceId: string;
  readonly feeEvidenceSource: "STATIC_CONFIG" | "PUBLIC_API" | "ACCOUNT_API";
  readonly simulatedSlippagePercent: number;
  readonly fillRatio: number;
  readonly terminalStatus: "FILLED" | "PARTIALLY_FILLED" | "FAILED" | "CANCELLED";
  readonly passiveFillEvidenceId: string | null;
}

export interface CentralPaperSimulationEvidence {
  readonly planId: string;
  readonly queueRecordId: string;
  readonly leaseId: string;
  readonly generatedAt: number;
  readonly expiresAt: number;
  readonly legs: readonly CentralPaperLegSimulationEvidence[];
  readonly exchangeOrderEvidenceUsed: false;
}

export interface CentralPaperSimulatedLegResult {
  readonly legId: string;
  readonly sequence: number;
  readonly exchange: string;
  readonly product: "SPOT" | "PERPETUAL";
  readonly market: string;
  readonly side: "BUY" | "SELL";
  readonly settlementAsset: string;
  readonly status: "FILLED" | "PARTIALLY_FILLED" | "FAILED" | "CANCELLED" | "SKIPPED_DEPENDENCY";
  readonly requestedQuantity: number;
  readonly filledQuantity: number;
  readonly referencePrice: number;
  readonly averageFillPrice: number | null;
  readonly filledNotional: number;
  readonly feePercent: number;
  readonly feeQuote: number;
  readonly feeEvidenceId: string;
  readonly feeEvidenceSource: CentralPaperLegSimulationEvidence["feeEvidenceSource"];
  readonly signedPositionDelta: number;
  readonly simulated: true;
  readonly exchangeOrderId: null;
}

export interface CentralMultiLegPaperSimulationResult {
  readonly version: "38.0";
  readonly id: string;
  readonly planId: string;
  readonly strategyId: CentralStrategyExecutionPlan["strategyId"];
  readonly queueRecordId: string;
  readonly leaseId: string;
  readonly generatedAt: number;
  readonly status: "SIMULATED_ENTRY_COMPLETE" | "SIMULATED_CYCLE_COMPLETE" | "RECOVERY_REQUIRED" | "FAILED_NO_FILL";
  readonly legs: readonly CentralPaperSimulatedLegResult[];
  readonly totalFilledNotional: number;
  readonly totalFeeQuote: number;
  readonly economicExposure: readonly {
    readonly product: "SPOT" | "PERPETUAL";
    readonly market: string;
    readonly signedQuantity: number;
  }[];
  readonly settlementPolicy: CentralStrategySettlementPolicy;
  readonly cycleSettlement: {
    readonly id: string;
    readonly asset: string;
    readonly initialQuantity: number;
    readonly finalQuantity: number;
    readonly realizedNetProfit: number;
    readonly legResultIds: readonly string[];
    readonly source: "SIMULATED_FULL_FILL_PRICE_AND_EXPLICIT_FEE_FLOW" | "SIMULATED_NEUTRAL_PASSIVE_FILL_AND_HEDGE_FLOW";
  } | null;
  readonly recoveryRequired: boolean;
  readonly pnlEvidenceStatus: "NO_DATA" | "AVAILABLE";
  readonly realizedPnlAsset: string | null;
  readonly realizedNetProfit: number | null;
  readonly reasons: readonly string[];
  readonly paperOnly: true;
  readonly accountMutationPerformed: false;
  readonly capitalMutationPerformed: false;
  readonly liveAdapterReachable: false;
  readonly exchangeOrderSubmitted: false;
}

export class CentralMultiLegPaperSimulator {
  simulate(record: CentralPaperQueueRecord, evidence: CentralPaperSimulationEvidence, now = Date.now()): CentralMultiLegPaperSimulationResult {
    if (!Number.isSafeInteger(now) || now <= 0) throw new Error("Central PAPER simulation timestamp must be positive.");
    if (record.state !== "LEASED" || !record.leaseId || record.leaseExpiresAt === null || record.leaseExpiresAt < now) {
      throw new Error("Central PAPER simulation requires an active queue lease.");
    }
    if (evidence.planId !== record.plan.id || evidence.queueRecordId !== record.id || evidence.leaseId !== record.leaseId || evidence.generatedAt > now || evidence.expiresAt < now || evidence.exchangeOrderEvidenceUsed !== false) {
      throw new Error("Central PAPER simulation evidence lineage is stale or mismatched.");
    }
    if (record.plan.legs.length === 0 || evidence.legs.length !== record.plan.legs.length) {
      throw new Error("Central PAPER simulation requires exactly one evidence record per plan leg.");
    }
    const evidenceByLeg = new Map(evidence.legs.map((item) => [item.legId, item]));
    if (evidenceByLeg.size !== record.plan.legs.length || record.plan.legs.some((item) => !evidenceByLeg.has(item.id))) {
      throw new Error("Central PAPER simulation leg evidence must be unique and complete.");
    }

    const results: CentralPaperSimulatedLegResult[] = [];
    for (const planLeg of [...record.plan.legs].sort((a, b) => a.sequence - b.sequence)) {
      const legEvidence = evidenceByLeg.get(planLeg.id)!;
      validateLeg(planLeg, legEvidence);
      const priorResults = results.filter((item) => item.sequence < planLeg.sequence);
      const dependencyFailed = planLeg.dependency === "PASSIVE_FILL_TRIGGER"
        ? priorResults.every((item) => item.filledQuantity <= 0)
        : planLeg.dependency !== "PARALLEL" && priorResults.some((item) => item.status !== "FILLED");
      results.push(dependencyFailed ? skipped(planLeg, legEvidence) : simulateLeg(planLeg, legEvidence));
    }

    const filled = results.filter((item) => item.filledQuantity > 0);
    const allFilled = results.every((item) => item.status === "FILLED");
    const noFill = filled.length === 0;
    const exposure = aggregateExposure(results);
    const neutral = exposure.every((item) => Math.abs(item.signedQuantity) <= 1e-12);
    const intendedHedgeSatisfied = isIntendedHedgeSatisfied(record.plan, results, neutral);
    const completedNeutralPassiveCycle = (record.plan.pattern === "PASSIVE_MAKER_THEN_HEDGE" || record.plan.pattern === "TWO_SIDED_PASSIVE_MAKER") && !noFill && neutral;
    const recoveryRequired = (!allFilled && !completedNeutralPassiveCycle) || !intendedHedgeSatisfied;
    const conversionCycle = record.plan.pattern === "SEQUENTIAL_THREE_LEG";
    const realizedCycle = conversionCycle || completedNeutralPassiveCycle;
    const status = noFill ? "FAILED_NO_FILL" : recoveryRequired ? "RECOVERY_REQUIRED" : realizedCycle ? "SIMULATED_CYCLE_COMPLETE" : "SIMULATED_ENTRY_COMPLETE";
    const cycleSettlement = status === "SIMULATED_CYCLE_COMPLETE"
      ? conversionCycle ? settleConversionCycle(record.plan, results) : settleNeutralPassiveCycle(record.plan, results)
      : null;
    const reasons = [
      ...(recoveryRequired ? ["One or more simulated legs or economic exposures require the shared recovery lifecycle."] : []),
      ...(cycleSettlement ? [conversionCycle
        ? "Completed conversion cycle P&L was recomputed from simulated fill and explicit fee evidence."
        : "Completed neutral passive cycle P&L was recomputed from public fill proof and explicit fee evidence."]
        : ["Entry simulation does not create realized P&L; strategy-valid close and settlement evidence remains required."]),
    ];
    return freeze({
      version: "38.0",
      id: `central-paper-simulation:${record.plan.id}:${record.attempts}`,
      planId: record.plan.id,
      strategyId: record.plan.strategyId,
      queueRecordId: record.id,
      leaseId: record.leaseId,
      generatedAt: now,
      status,
      legs: results,
      totalFilledNotional: sum(results.map((item) => item.filledNotional)),
      totalFeeQuote: sum(results.map((item) => item.feeQuote)),
      economicExposure: exposure,
      settlementPolicy: structuredClone(record.plan.settlementPolicy),
      cycleSettlement,
      recoveryRequired,
      pnlEvidenceStatus: cycleSettlement ? "AVAILABLE" : "NO_DATA",
      realizedPnlAsset: cycleSettlement?.asset ?? null,
      realizedNetProfit: cycleSettlement?.realizedNetProfit ?? null,
      reasons,
      paperOnly: true,
      accountMutationPerformed: false,
      capitalMutationPerformed: false,
      liveAdapterReachable: false,
      exchangeOrderSubmitted: false,
    });
  }
}

function isIntendedHedgeSatisfied(
  plan: CentralStrategyExecutionPlan,
  results: readonly CentralPaperSimulatedLegResult[],
  rawExposureNeutral: boolean,
): boolean {
  if (plan.pattern === "PASSIVE_MAKER_THEN_HEDGE" || plan.pattern === "TWO_SIDED_PASSIVE_MAKER") {
    return rawExposureNeutral;
  }
  if (plan.pattern === "PARALLEL_TWO_LEG") {
    if (results.length !== 2 || results.some((item) => item.status !== "FILLED")) return false;
    const [first, second] = results;
    return Boolean(first && second && first.side !== second.side && first.market === second.market &&
      Math.abs(first.filledQuantity - second.filledQuantity) <= 1e-12);
  }
  if (plan.pattern === "PARALLEL_STATISTICAL_PAIR") {
    if (plan.settlementPolicy.kind !== "STATISTICAL_MEAN_REVERSION" || results.length !== 2 ||
        results.some((item) => item.status !== "FILLED")) return false;
    const [first, second] = results;
    return Boolean(first && second && first.side !== second.side && first.market !== second.market &&
      results.every((item) => item.filledQuantity > 0));
  }
  return true;
}

function settleNeutralPassiveCycle(
  plan: CentralStrategyExecutionPlan,
  results: readonly CentralPaperSimulatedLegResult[],
): NonNullable<CentralMultiLegPaperSimulationResult["cycleSettlement"]> {
  if ((plan.pattern !== "PASSIVE_MAKER_THEN_HEDGE" && plan.pattern !== "TWO_SIDED_PASSIVE_MAKER") ||
      results.length !== 2 || results.some((item) => item.filledQuantity <= 0 || item.averageFillPrice === null)) {
    throw new Error("Neutral passive PAPER settlement requires two genuine filled leg results.");
  }
  const settlementAssets = Array.from(new Set(results.map((item) => item.settlementAsset)));
  if (settlementAssets.length !== 1 || !settlementAssets[0]) throw new Error("Neutral passive PAPER settlement asset is ambiguous.");
  const bought = results.filter((item) => item.side === "BUY").reduce((total, item) => total + item.filledQuantity, 0);
  const sold = results.filter((item) => item.side === "SELL").reduce((total, item) => total + item.filledQuantity, 0);
  if (Math.abs(bought - sold) > 1e-12) throw new Error("Neutral passive PAPER settlement contains residual quantity.");
  const buyCost = results.filter((item) => item.side === "BUY").reduce((total, item) => total + item.filledNotional + item.feeQuote, 0);
  const sellProceeds = results.filter((item) => item.side === "SELL").reduce((total, item) => total + item.filledNotional - item.feeQuote, 0);
  const realized = normalize(sellProceeds - buyCost);
  return freeze({id: `central-paper-passive-settlement:${plan.id}`, asset: settlementAssets[0],
    initialQuantity: normalize(buyCost), finalQuantity: normalize(buyCost + realized), realizedNetProfit: realized,
    legResultIds: results.map((item) => item.legId), source: "SIMULATED_NEUTRAL_PASSIVE_FILL_AND_HEDGE_FLOW" as const});
}

function settleConversionCycle(
  plan: CentralStrategyExecutionPlan,
  results: readonly CentralPaperSimulatedLegResult[],
): NonNullable<CentralMultiLegPaperSimulationResult["cycleSettlement"]> {
  const policy = plan.settlementPolicy;
  if (policy.kind !== "IMMEDIATE_CONVERSION_CYCLE" || results.length !== 3 || results.some((item) => item.status !== "FILLED" || item.averageFillPrice === null)) {
    throw new Error("Completed sequential PAPER cycle requires exact conversion settlement policy and full fills.");
  }
  const byLeg = new Map(results.map((item) => [item.legId, item]));
  let asset = policy.startAsset;
  let quantity = policy.initialQuantity;
  const legResultIds: string[] = [];
  for (const flow of policy.flows) {
    const result = byLeg.get(flow.legId);
    if (!result || flow.fromAsset !== asset || result.averageFillPrice === null) {
      throw new Error("Triangular PAPER settlement flow lineage is incomplete or discontinuous.");
    }
    const feeMultiplier = 1 - result.feePercent / 100;
    if (result.side === "BUY") {
      const requiredInput = result.filledQuantity * result.averageFillPrice;
      if (requiredInput > quantity + 1e-9) throw new Error("Triangular PAPER BUY fill exceeds available conversion input.");
      quantity = result.filledQuantity * feeMultiplier;
    } else {
      if (result.filledQuantity > quantity + 1e-9) throw new Error("Triangular PAPER SELL fill exceeds available conversion input.");
      quantity = result.filledQuantity * result.averageFillPrice * feeMultiplier;
    }
    asset = flow.toAsset;
    legResultIds.push(result.legId);
  }
  if (asset !== policy.startAsset || !Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Triangular PAPER conversion cycle did not return valid start-asset evidence.");
  }
  return freeze({
    id: `central-paper-cycle-settlement:${plan.id}`,
    asset,
    initialQuantity: policy.initialQuantity,
    finalQuantity: normalize(quantity),
    realizedNetProfit: normalize(quantity - policy.initialQuantity),
    legResultIds,
    source: "SIMULATED_FULL_FILL_PRICE_AND_EXPLICIT_FEE_FLOW",
  });
}

function validateLeg(plan: CentralStrategyExecutionLeg, evidence: CentralPaperLegSimulationEvidence): void {
  if (plan.quantity === null || !Number.isFinite(plan.quantity) || plan.quantity <= 0) throw new Error(`Central PAPER leg quantity is unavailable: ${plan.id}`);
  if (!/^[A-Z0-9]{2,12}$/.test(evidence.settlementAsset)) throw new Error(`Central PAPER settlement asset is invalid: ${plan.id}`);
  if (!Number.isFinite(evidence.feePercent) || evidence.feePercent < 0 || evidence.feePercent > 100 || !evidence.feeEvidenceId.trim()) throw new Error(`Central PAPER fee evidence is invalid: ${plan.id}`);
  if (!Number.isFinite(evidence.simulatedSlippagePercent) || evidence.simulatedSlippagePercent < 0 || evidence.simulatedSlippagePercent > 100) throw new Error(`Central PAPER slippage is invalid: ${plan.id}`);
  if (!Number.isFinite(evidence.fillRatio) || evidence.fillRatio < 0 || evidence.fillRatio > 1) throw new Error(`Central PAPER fill ratio is invalid: ${plan.id}`);
  if (evidence.terminalStatus === "FILLED" && evidence.fillRatio !== 1) throw new Error(`Filled PAPER leg requires fillRatio=1: ${plan.id}`);
  if (evidence.terminalStatus === "PARTIALLY_FILLED" && !(evidence.fillRatio > 0 && evidence.fillRatio < 1)) throw new Error(`Partial PAPER leg requires 0<fillRatio<1: ${plan.id}`);
  if ((evidence.terminalStatus === "FAILED" || evidence.terminalStatus === "CANCELLED") && evidence.fillRatio !== 0) throw new Error(`Failed/cancelled PAPER leg requires fillRatio=0: ${plan.id}`);
  if (plan.orderType === "LIMIT_POST_ONLY" && evidence.fillRatio > 0 && !evidence.passiveFillEvidenceId?.trim()) throw new Error(`Passive PAPER fill requires explicit fill evidence: ${plan.id}`);
}

function simulateLeg(plan: CentralStrategyExecutionLeg, evidence: CentralPaperLegSimulationEvidence): CentralPaperSimulatedLegResult {
  const quantity = plan.quantity!;
  const filledQuantity = quantity * evidence.fillRatio;
  const slip = evidence.simulatedSlippagePercent / 100;
  const averageFillPrice = filledQuantity > 0 ? plan.referencePrice * (plan.side === "BUY" ? 1 + slip : 1 - slip) : null;
  const filledNotional = averageFillPrice === null ? 0 : averageFillPrice * filledQuantity;
  return freeze({legId: plan.id, sequence: plan.sequence, exchange: plan.exchange, product: plan.product, market: plan.market,
    side: plan.side, settlementAsset: evidence.settlementAsset, status: evidence.terminalStatus, requestedQuantity: quantity, filledQuantity, referencePrice: plan.referencePrice,
    averageFillPrice, filledNotional, feePercent: evidence.feePercent, feeQuote: filledNotional * evidence.feePercent / 100,
    feeEvidenceId: evidence.feeEvidenceId, feeEvidenceSource: evidence.feeEvidenceSource,
    signedPositionDelta: filledQuantity * (plan.side === "BUY" ? 1 : -1), simulated: true, exchangeOrderId: null});
}

function skipped(plan: CentralStrategyExecutionLeg, evidence: CentralPaperLegSimulationEvidence): CentralPaperSimulatedLegResult {
  return freeze({legId: plan.id, sequence: plan.sequence, exchange: plan.exchange, product: plan.product, market: plan.market,
    side: plan.side, settlementAsset: evidence.settlementAsset, status: "SKIPPED_DEPENDENCY", requestedQuantity: plan.quantity!, filledQuantity: 0, referencePrice: plan.referencePrice,
    averageFillPrice: null, filledNotional: 0, feePercent: evidence.feePercent, feeQuote: 0,
    feeEvidenceId: evidence.feeEvidenceId, feeEvidenceSource: evidence.feeEvidenceSource,
    signedPositionDelta: 0, simulated: true, exchangeOrderId: null});
}

function aggregateExposure(results: readonly CentralPaperSimulatedLegResult[]) {
  const values = new Map<string, {product: "SPOT" | "PERPETUAL"; market: string; signedQuantity: number}>();
  for (const item of results) {
    const key = `${item.product}:${item.market}`;
    const current = values.get(key);
    values.set(key, {product: item.product, market: item.market, signedQuantity: (current?.signedQuantity ?? 0) + item.signedPositionDelta});
  }
  return [...values.values()].map((item) => freeze({...item, signedQuantity: normalize(item.signedQuantity)}))
    .sort((a, b) => `${a.product}:${a.market}`.localeCompare(`${b.product}:${b.market}`));
}

function normalize(value: number): number { return Math.abs(value) <= 1e-12 ? 0 : Number(value.toFixed(12)); }
function sum(values: readonly number[]): number { return Number(values.reduce((total, value) => total + value, 0).toFixed(12)); }
function freeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; for (const nested of Object.values(value)) freeze(nested); return Object.freeze(value); }

export const centralMultiLegPaperSimulator = new CentralMultiLegPaperSimulator();
