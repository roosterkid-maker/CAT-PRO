import type { DepthAnalysis } from "../../orderbook/models/DepthAnalysis";
import type { SlippageResult } from "../../orderbook/models/SlippageResult";
import type { VWAPResult } from "../../orderbook/models/VWAPResult";
import type { ProfitConfidence } from "../../profit/models/ProfitConfidence";
import type { ProfitWaterfall } from "../../profit/models/ProfitWaterfall";

import type { ExecutionDecision } from "./ExecutionDecision";

export interface ExecutionSimulation {
  depth: DepthAnalysis;

  buyVWAP: VWAPResult;
  sellVWAP: VWAPResult;

  buySlippage: SlippageResult;
  sellSlippage: SlippageResult;

  profit: ProfitWaterfall;

  confidence: ProfitConfidence;

  decision: ExecutionDecision;

  simulatedAt: number;
}