export interface ExecutionContext {
  requestedCapital: number;

  requestedQty: number;

  availableQty: number;

  executableQty: number;

  executableCapital: number;

  unfilledQty: number;

  unfilledCapital: number;

  liquidityPercent: number;

  fillPercent: number;

  partialFill: boolean;

  enoughLiquidity: boolean;
}