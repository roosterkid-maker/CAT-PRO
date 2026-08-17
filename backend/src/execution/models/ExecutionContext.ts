import type { DepthAnalysis } from "../../orderbook/models/DepthAnalysis";
import type { SlippageResult } from "../../orderbook/models/SlippageResult";
import type { VWAPResult } from "../../orderbook/models/VWAPResult";
import type { ProfitConfidence } from "../../profit/models/ProfitConfidence";
import type { ProfitWaterfall } from "../../profit/models/ProfitWaterfall";

import type { ExecutionDecision } from "./ExecutionDecision";
import type { ExecutionRequest } from "./ExecutionRequest";
import type { ExecutionValidationResult } from "./ExecutionValidationResult";

export interface ExecutionContext {
  request: ExecutionRequest;

  validation:
    | ExecutionValidationResult
    | null;

  depth?: DepthAnalysis;

  buyVWAP?: VWAPResult;
  sellVWAP?: VWAPResult;

  buySlippage?: SlippageResult;
  sellSlippage?: SlippageResult;

  profit?: ProfitWaterfall;

  confidence?: ProfitConfidence;

  decision?:
    | ExecutionDecision
    | null;
}