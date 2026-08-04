import { ExecutionPipeline } from "./ExecutionPipeline";

import { depthStage } from "./stages/DepthStage";
import { slippageStage } from "./stages/SlippageStage";
import { validationStage } from "./stages/ValidationStage";
import { vwapStage } from "./stages/VWAPStage";
import { profitStage } from "./stages/ProfitStage";
import { confidenceStage } from "./stages/ConfidenceStage";
import { decisionStage } from "./stages/DecisionStage";

export const defaultExecutionPipeline =
  new ExecutionPipeline([
    validationStage,
    depthStage,
    vwapStage,
    slippageStage,
    profitStage,
    confidenceStage,
    decisionStage,
  ]);