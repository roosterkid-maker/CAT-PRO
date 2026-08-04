import type { DepthAnalysis } from "../../orderbook/models/DepthAnalysis";
import type { ProfitConfidence } from "../../profit/models/ProfitConfidence";
import type { ProfitWaterfall } from "../../profit/models/ProfitWaterfall";
import type { SlippageResult } from "../../orderbook/models/SlippageResult";
import type { VWAPResult } from "../../orderbook/models/VWAPResult";

import type { ExecutionDecision } from "./ExecutionDecision";

export interface ExecutionSimulation {
  buyVWAP: VWAPResult;

  sellVWAP: VWAPResult;

  buyDepth: DepthAnalysis;

  sellDepth: DepthAnalysis;

  buySlippage: SlippageResult;

  sellSlippage: SlippageResult;

  profit: ProfitWaterfall;

  confidence: ProfitConfidence;

  decision: ExecutionDecision;

  simulatedAt: number;
}