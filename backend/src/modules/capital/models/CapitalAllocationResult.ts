export interface CapitalAllocationResult {
  approved: boolean;

  allocatedCapital: number;

  rejectionReason: string | null;

  availableCapitalAfterAllocation: number;
}