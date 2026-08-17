import {createHash} from "node:crypto";
import type {StrategyId} from "../../strategies/models/StrategyMetadata";
import {sharedRecoveryIntentService, type SharedRecoveryIntentService} from "../services/SharedRecoveryIntentService";

export interface CentralLiveResidualExposure {
  readonly planId: string;
  readonly dispatchId: string;
  readonly strategyId: StrategyId;
  readonly sourceEvidenceId: string;
  readonly exchange: string;
  readonly product: "SPOT" | "PERPETUAL";
  readonly market: string;
  readonly asset: string;
  readonly quoteAsset: string;
  readonly residualDirection: "LONG" | "SHORT";
  readonly side: "BUY" | "SELL";
  readonly quantity: number;
  readonly referencePrice: number;
  readonly capturedAt: number;
  readonly expiresAt: number;
  readonly reason: string;
}

/** Normalizes actual LIVE residual evidence into the same non-executable recovery registry. */
export class CentralLiveSharedRecoveryBridgeService {
  constructor(private readonly recovery: SharedRecoveryIntentService = sharedRecoveryIntentService) {}
  stage(input: CentralLiveResidualExposure, now = Date.now()): string {
    if (input.capturedAt > now || input.expiresAt <= now || !input.planId.trim() || !input.dispatchId.trim() ||
      !input.sourceEvidenceId.trim() || !input.reason.trim()) throw new Error("Central LIVE recovery lineage is incomplete or expired.");
    const routeId = `${input.product}:${input.planId}:${input.dispatchId}`;
    const validation = JSON.stringify({planId: input.planId, dispatchId: input.dispatchId, strategyId: input.strategyId,
      sourceEvidenceId: input.sourceEvidenceId, exchange: input.exchange, product: input.product, market: input.market,
      asset: input.asset, quoteAsset: input.quoteAsset, residualDirection: input.residualDirection, side: input.side,
      quantity: input.quantity, referencePrice: input.referencePrice, reason: input.reason});
    const intent = this.recovery.stage({sourceStrategyId: input.strategyId, sourceEvidenceId: input.sourceEvidenceId,
      sourceValidationHash: createHash("sha256").update(validation).digest("hex"),
      sourceType: "STRATEGY_RESIDUAL_EXPOSURE", mode: "LIVE",
      severity: input.quantity * input.referencePrice > 1_000 ? "CRITICAL" : "WARNING", routeId,
      asset: input.asset, quoteAsset: input.quoteAsset, residualDirection: input.residualDirection,
      venue: input.exchange, market: input.market, side: input.side, quantity: input.quantity,
      referencePrice: input.referencePrice, estimatedQuoteValue: input.quantity * input.referencePrice,
      sourceCreatedAt: input.capturedAt, sourceExpiresAt: input.expiresAt}, now);
    return intent.id;
  }
  getDiagnostics(now = Date.now()) { const report = this.recovery.getReport(now);
    return freeze({version: "78.0" as const, generatedAt: now, liveStaged: report.intents.filter((item) => item.mode === "LIVE").length,
      safety: {immutableEvidenceOnly: true, automaticRecoveryExecutionAllowed: false, liveOrderSubmissionAllowed: false}}); }
}
function freeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; for (const nested of Object.values(value)) freeze(nested); return Object.freeze(value); }
export const centralLiveSharedRecoveryBridgeService = new CentralLiveSharedRecoveryBridgeService();
