import type { CapitalAllocationRequest } from "../models/CapitalAllocationRequest";
import type { CapitalAllocationResult } from "../models/CapitalAllocationResult";
import type { CapitalState } from "../models/CapitalState";
import type { CapitalEngine } from "../../../core/contracts/CapitalEngine";
import {
  CapitalManagerService,
  capitalManagerService,
} from "../services/CapitalManagerService";

export interface InitializeCapitalInput {
  totalCapital: number;
  maxConcurrentTrades: number;
  maxCapitalPerTrade: number;
  minimumReserveCapital: number;
}

export interface ReleaseCapitalInput {
  amount: number;
}

export interface ReserveCapitalInput {
  amount: number;
}

export interface UpdateCapitalPnlInput {
  amount: number;
}

export class CapitalFacade
  implements CapitalEngine
{
  constructor(
    private readonly capitalManager: CapitalManagerService,
  ) {}

  initialize(
    input: InitializeCapitalInput,
  ): Readonly<CapitalState> {
    this.capitalManager.initialize(input);

    return this.capitalManager.getState();
  }

  getState(): Readonly<CapitalState> {
    return this.capitalManager.getState();
  }

  checkAllocation(
    request: CapitalAllocationRequest,
  ): CapitalAllocationResult {
    return this.capitalManager.canAllocate(request);
  }

  allocate(
    request: CapitalAllocationRequest,
  ): CapitalAllocationResult {
    return this.capitalManager.allocateCapital(request);
  }

release(
  amount: number,
): Readonly<CapitalState> {
  this.capitalManager.releaseCapital(amount);

  return this.capitalManager.getState();
}

  reserve(
    input: ReserveCapitalInput,
  ): Readonly<CapitalState> {
    this.capitalManager.reserveCapital(input.amount);

    return this.capitalManager.getState();
  }

  recordProfit(
    input: UpdateCapitalPnlInput,
  ): Readonly<CapitalState> {
    this.capitalManager.updateDailyProfit(input.amount);

    return this.capitalManager.getState();
  }

  recordLoss(
    input: UpdateCapitalPnlInput,
  ): Readonly<CapitalState> {
    this.capitalManager.updateDailyLoss(input.amount);

    return this.capitalManager.getState();
  }

  resetDailyMetrics(): Readonly<CapitalState> {
    this.capitalManager.resetDailyMetrics();

    return this.capitalManager.getState();
  }
}

export const capitalFacade = new CapitalFacade(
  capitalManagerService,
);