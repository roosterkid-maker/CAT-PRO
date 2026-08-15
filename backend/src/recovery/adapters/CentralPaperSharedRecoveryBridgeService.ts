import {createHash} from "node:crypto";
import type {CentralMultiLegPaperSimulationResult, CentralPaperSimulatedLegResult} from "../../strategies/services/CentralMultiLegPaperSimulator";
import type {CentralPaperQueueRecord} from "../../strategies/services/CentralPaperExecutionQueueService";
import type {SharedRecoveryIntent} from "../models/SharedRecoveryIntent";
import {sharedRecoveryIntentService, type SharedRecoveryIntentService} from "../services/SharedRecoveryIntentService";

export interface CentralPaperSharedRecoveryBridgeResult {
  readonly version: "39.0";
  readonly generatedAt: number;
  readonly sourceSimulationId: string;
  readonly required: boolean;
  readonly staged: number;
  readonly rejected: number;
  readonly intents: readonly SharedRecoveryIntent[];
  readonly rejections: readonly {readonly exposureId: string; readonly reason: string}[];
  readonly paperRecoveryExecuted: false;
  readonly capitalMutationAllowed: false;
  readonly liveExecutionAllowed: false;
  readonly orderSubmissionAllowed: false;
}

export class CentralPaperSharedRecoveryBridgeService {
  constructor(private readonly recoveryService: SharedRecoveryIntentService = sharedRecoveryIntentService) {}

  synchronize(record: CentralPaperQueueRecord, simulation: CentralMultiLegPaperSimulationResult, now = Date.now()): CentralPaperSharedRecoveryBridgeResult {
    if (record.plan.id !== simulation.planId || record.id !== simulation.queueRecordId || record.leaseId !== simulation.leaseId) {
      throw new Error("Central PAPER recovery bridge requires exact queue, plan and lease lineage.");
    }
    if (!simulation.recoveryRequired) return this.result(simulation.id, false, [], [], now);
    const intents: SharedRecoveryIntent[] = [];
    const rejections: Array<{exposureId: string; reason: string}> = [];
    for (const exposure of simulation.economicExposure.filter((item) => Math.abs(item.signedQuantity) > 1e-12)) {
      const exposureId = `${exposure.product}:${exposure.market}`;
      try {
        const assets = parseMarket(exposure.market);
        const contribution = selectContribution(simulation.legs, exposure.product, exposure.market, exposure.signedQuantity);
        if (!contribution) throw new Error("No exact simulated fill contribution matches residual direction.");
        const quantity = Math.abs(exposure.signedQuantity);
        const referencePrice = contribution.averageFillPrice ?? contribution.referencePrice;
        const quoteValue = quantity * referencePrice;
        const validationHash = createHash("sha256").update([simulation.id, exposureId, quantity, referencePrice, contribution.exchange].join("|")).digest("hex");
        intents.push(this.recoveryService.stage({
          sourceStrategyId: simulation.strategyId,
          sourceEvidenceId: `${simulation.id}:${exposureId}`,
          sourceValidationHash: validationHash,
          sourceType: "STRATEGY_RESIDUAL_EXPOSURE",
          mode: "PAPER",
          severity: quoteValue > 1_000 ? "CRITICAL" : "WARNING",
          routeId: `${record.plan.routeFamily}:${record.plan.id}`,
          asset: assets.base,
          quoteAsset: assets.quote,
          residualDirection: exposure.signedQuantity > 0 ? "LONG" : "SHORT",
          venue: contribution.exchange,
          market: exposure.market,
          side: exposure.signedQuantity > 0 ? "SELL" : "BUY",
          quantity,
          referencePrice,
          estimatedQuoteValue: quoteValue,
          sourceCreatedAt: simulation.generatedAt,
          sourceExpiresAt: record.plan.expiresAt,
        }, now));
      } catch (error: unknown) {
        rejections.push({exposureId, reason: error instanceof Error ? error.message : "Central PAPER recovery staging failed."});
      }
    }
    if (intents.length === 0 && rejections.length === 0) rejections.push({exposureId: "NO_RESIDUAL", reason: "Recovery was required but no non-zero residual exposure was available."});
    return this.result(simulation.id, true, intents, rejections, now);
  }

  private result(sourceSimulationId: string, required: boolean, intents: readonly SharedRecoveryIntent[], rejections: readonly {readonly exposureId: string; readonly reason: string}[], now: number): CentralPaperSharedRecoveryBridgeResult {
    return freeze({version: "39.0", generatedAt: now, sourceSimulationId, required, staged: intents.length, rejected: rejections.length,
      intents: structuredClone(intents), rejections: structuredClone(rejections), paperRecoveryExecuted: false, capitalMutationAllowed: false,
      liveExecutionAllowed: false, orderSubmissionAllowed: false});
  }
}

function selectContribution(legs: readonly CentralPaperSimulatedLegResult[], product: "SPOT" | "PERPETUAL", market: string, signedQuantity: number) {
  return legs.filter((item) => item.product === product && item.market === market && item.filledQuantity > 0 && Math.sign(item.signedPositionDelta) === Math.sign(signedQuantity))
    .sort((a, b) => Math.abs(b.signedPositionDelta) - Math.abs(a.signedPositionDelta) || a.legId.localeCompare(b.legId))[0] ?? null;
}

function parseMarket(market: string): {base: string; quote: string} {
  const normalized = market.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const quotes = ["USDT", "USDC", "BUSD", "INR", "USD", "BTC", "ETH"];
  const quote = quotes.find((item) => normalized.endsWith(item) && normalized.length > item.length);
  if (!quote) throw new Error(`Recovery asset identity cannot be derived from market: ${market}`);
  return {base: normalized.slice(0, -quote.length), quote};
}

function freeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; for (const nested of Object.values(value)) freeze(nested); return Object.freeze(value); }

export const centralPaperSharedRecoveryBridgeService = new CentralPaperSharedRecoveryBridgeService();

