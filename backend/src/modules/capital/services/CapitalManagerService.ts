import type { CapitalAllocationRequest } from "../models/CapitalAllocationRequest";
import type { CapitalAllocationResult } from "../models/CapitalAllocationResult";
import type { CapitalState } from "../models/CapitalState";

interface CapitalManagerConfig {
  totalCapital: number;
  maxConcurrentTrades: number;
  maxCapitalPerTrade: number;
  minimumReserveCapital: number;
}

export class CapitalManagerService {
  private state: CapitalState;

  constructor() {
    this.state = {
      totalCapital: 0,
      availableCapital: 0,
      reservedCapital: 0,
      allocatedCapital: 0,
      activeTrades: 0,
      maxConcurrentTrades: 0,
      maxCapitalPerTrade: 0,
      minimumReserveCapital: 0,
      dailyProfit: 0,
      dailyLoss: 0,
      updatedAt: Date.now(),
    };
  }

  initialize(config: CapitalManagerConfig): void {
    this.validateInitializationConfig(config);

    this.state = {
      totalCapital: config.totalCapital,
      availableCapital: config.totalCapital,
      reservedCapital: 0,
      allocatedCapital: 0,
      activeTrades: 0,
      maxConcurrentTrades: config.maxConcurrentTrades,
      maxCapitalPerTrade: config.maxCapitalPerTrade,
      minimumReserveCapital:
        config.minimumReserveCapital,
      dailyProfit: 0,
      dailyLoss: 0,
      updatedAt: Date.now(),
    };
  }

  getState(): Readonly<CapitalState> {
    return {
      ...this.state,
    };
  }

  canAllocate(
    request: CapitalAllocationRequest,
  ): CapitalAllocationResult {
    if (
      !Number.isFinite(request.requestedCapital) ||
      request.requestedCapital <= 0
    ) {
      return this.createRejectedResult(
        "Requested capital must be greater than zero.",
      );
    }

    if (
      this.state.activeTrades >=
      this.state.maxConcurrentTrades
    ) {
      return this.createRejectedResult(
        "Maximum concurrent trades reached.",
      );
    }

    if (
      request.requestedCapital >
      this.state.maxCapitalPerTrade
    ) {
      return this.createRejectedResult(
        "Requested capital exceeds the per-trade limit.",
      );
    }

    const remainingCapital =
      this.state.availableCapital -
      request.requestedCapital;

    if (
      remainingCapital <
      this.state.minimumReserveCapital
    ) {
      return this.createRejectedResult(
        "Minimum reserve capital would be violated.",
      );
    }

    return {
      approved: true,
      allocatedCapital: request.requestedCapital,
      rejectionReason: null,
      availableCapitalAfterAllocation:
        remainingCapital,
    };
  }

  allocateCapital(
    request: CapitalAllocationRequest,
  ): CapitalAllocationResult {
    const result = this.canAllocate(request);

    if (!result.approved) {
      return result;
    }

    this.state.availableCapital -=
      result.allocatedCapital;

    this.state.allocatedCapital +=
      result.allocatedCapital;

    this.state.activeTrades += 1;
    this.state.updatedAt = Date.now();

    return {
      ...result,
      availableCapitalAfterAllocation:
        this.state.availableCapital,
    };
  }

  releaseCapital(amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error(
        "Released capital must be greater than zero.",
      );
    }

    if (amount > this.state.allocatedCapital) {
      throw new Error(
        "Released capital cannot exceed allocated capital.",
      );
    }

    this.state.allocatedCapital -= amount;
    this.state.availableCapital += amount;

    this.state.activeTrades = Math.max(
      0,
      this.state.activeTrades - 1,
    );

    this.state.updatedAt = Date.now();
  }

  reserveCapital(amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error(
        "Reserved capital must be greater than zero.",
      );
    }

    if (amount > this.state.availableCapital) {
      throw new Error(
        "Insufficient available capital to create reserve.",
      );
    }

    this.state.availableCapital -= amount;
    this.state.reservedCapital += amount;
    this.state.updatedAt = Date.now();
  }

  updateDailyProfit(amount: number): void {
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error(
        "Daily profit must be zero or greater.",
      );
    }

    this.state.dailyProfit += amount;
    this.state.totalCapital += amount;
    this.state.availableCapital += amount;
    this.state.updatedAt = Date.now();
  }

  updateDailyLoss(amount: number): void {
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error(
        "Daily loss must be zero or greater.",
      );
    }

    if (amount > this.state.availableCapital) {
      throw new Error(
        "Daily loss cannot exceed available capital.",
      );
    }

    this.state.dailyLoss += amount;
    this.state.totalCapital -= amount;
    this.state.availableCapital -= amount;
    this.state.updatedAt = Date.now();
  }

  resetDailyMetrics(): void {
    this.state.dailyProfit = 0;
    this.state.dailyLoss = 0;
    this.state.updatedAt = Date.now();
  }

  private createRejectedResult(
    rejectionReason: string,
  ): CapitalAllocationResult {
    return {
      approved: false,
      allocatedCapital: 0,
      rejectionReason,
      availableCapitalAfterAllocation:
        this.state.availableCapital,
    };
  }

  private validateInitializationConfig(
    config: CapitalManagerConfig,
  ): void {
    if (
      !Number.isFinite(config.totalCapital) ||
      config.totalCapital <= 0
    ) {
      throw new Error(
        "Total capital must be greater than zero.",
      );
    }

    if (
      !Number.isInteger(
        config.maxConcurrentTrades,
      ) ||
      config.maxConcurrentTrades <= 0
    ) {
      throw new Error(
        "Maximum concurrent trades must be a positive integer.",
      );
    }

    if (
      !Number.isFinite(config.maxCapitalPerTrade) ||
      config.maxCapitalPerTrade <= 0
    ) {
      throw new Error(
        "Maximum capital per trade must be greater than zero.",
      );
    }

    if (
      !Number.isFinite(
        config.minimumReserveCapital,
      ) ||
      config.minimumReserveCapital < 0
    ) {
      throw new Error(
        "Minimum reserve capital cannot be negative.",
      );
    }

    if (
      config.maxCapitalPerTrade >
      config.totalCapital
    ) {
      throw new Error(
        "Maximum capital per trade cannot exceed total capital.",
      );
    }

    if (
      config.minimumReserveCapital >=
      config.totalCapital
    ) {
      throw new Error(
        "Minimum reserve capital must be lower than total capital.",
      );
    }
  }
}

export const capitalManagerService =
  new CapitalManagerService();