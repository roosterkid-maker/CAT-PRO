import type { CapitalAllocationRequest } from "../../modules/capital/models/CapitalAllocationRequest";
import type { CapitalAllocationResult } from "../../modules/capital/models/CapitalAllocationResult";
import type { CapitalState } from "../../modules/capital/models/CapitalState";

export interface CapitalEngine {
  getState(): Readonly<CapitalState>;

  checkAllocation(
    request: CapitalAllocationRequest,
  ): CapitalAllocationResult;

  allocate(
    request: CapitalAllocationRequest,
  ): CapitalAllocationResult;

  release(
    amount: number,
  ): Readonly<CapitalState>;
}