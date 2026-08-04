import { ExecutionPipeline } from "./ExecutionPipeline";

import { depthStage } from "./stages/DepthStage";
import { slippageStage } from "./stages/SlippageStage";
import { validationStage } from "./stages/ValidationStage";
import { vwapStage } from "./stages/VWAPStage";

export const defaultExecutionPipeline =
  new ExecutionPipeline([
    validationStage,

    depthStage,

    vwapStage,

    slippageStage,
  ]);