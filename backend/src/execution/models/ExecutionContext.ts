import type { ExecutionDecision } from "./ExecutionDecision";
import type { ExecutionRequest } from "./ExecutionRequest";
import type { ExecutionValidationResult } from "./ExecutionValidationResult";
import type { DepthAnalysis } from "../../orderbook/models/DepthAnalysis";
import type { VWAPResult } from "../../orderbook/models/VWAPResult";
import type { SlippageResult } from "../../orderbook/models/SlippageResult";
import type { ProfitWaterfall } from "../../profit/models/ProfitWaterfall";
import type { ProfitConfidence } from "../../profit/models/ProfitConfidence";
export interface ExecutionContext {
  request: ExecutionRequest;

  validation:
    | ExecutionValidationResult
    | null;

  decision?:
    | ExecutionDecision
    | null;

    depth?: DepthAnalysis;
    buyVWAP?: VWAPResult;
    buySlippage?: SlippageResult;
    profit?: ProfitWaterfall;
    confidence?: ProfitConfidence;
    

sellSlippage?: SlippageResult;

sellVWAP?: VWAPResult;

failed?: boolean;

failureReason?: string;
}