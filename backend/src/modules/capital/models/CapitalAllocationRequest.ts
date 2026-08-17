export interface CapitalAllocationRequest {
  opportunityId: string;

  requestedCapital: number;

  expectedProfitPercent: number;

  priority: number;
}