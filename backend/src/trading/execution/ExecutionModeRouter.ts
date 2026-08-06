import {
  executionSimulator,
} from "../../execution/services/ExecutionSimulator";

import type {
  ExecutionRequest,
} from "../../execution/models/ExecutionRequest";

import type {
  ExecutionResult,
} from "../../execution/models/ExecutionResult";

import {
  liveExecutionService,
} from "../../execution/live/LiveExecutionService";

import type {
  LiveExecutionRequest,
} from "../../execution/live/models/LiveExecutionRequest";

import type {
  LiveExecutionResult,
} from "../../execution/live/models/LiveExecutionResult";

export type ExecutionMode =
  | "paper"
  | "live";

export interface PaperModeExecutionRequest {
  mode: "paper";

  request: ExecutionRequest;
}

export interface LiveModeExecutionRequest {
  mode: "live";

  request: LiveExecutionRequest;
}

export type ModeExecutionRequest =
  | PaperModeExecutionRequest
  | LiveModeExecutionRequest;

export interface PaperModeExecutionResult {
  mode: "paper";

  result: ExecutionResult;
}

export interface LiveModeExecutionResult {
  mode: "live";

  result: LiveExecutionResult;
}

export type ModeExecutionResult =
  | PaperModeExecutionResult
  | LiveModeExecutionResult;

export class ExecutionModeRouter {
  execute(
    input: PaperModeExecutionRequest,
  ): Promise<PaperModeExecutionResult>;

  execute(
    input: LiveModeExecutionRequest,
  ): Promise<LiveModeExecutionResult>;

  async execute(
    input: ModeExecutionRequest,
  ): Promise<ModeExecutionResult> {
    if (input.mode === "paper") {
      return this.executePaper(
        input.request,
      );
    }

    return this.executeLive(
      input.request,
    );
  }

  private async executePaper(
    request: ExecutionRequest,
  ): Promise<PaperModeExecutionResult> {
    const result =
      executionSimulator.simulate(
        request,
      );

    return {
      mode: "paper",

      result,
    };
  }

  private async executeLive(
    request: LiveExecutionRequest,
  ): Promise<LiveModeExecutionResult> {
    const normalizedExchange =
      request.exchange
        .trim()
        .toLowerCase();

    if (!normalizedExchange) {
      throw new Error(
        "Live execution exchange is required.",
      );
    }

    if (
      !liveExecutionService.hasAdapter(
        normalizedExchange,
      )
    ) {
      throw new Error(
        `Live execution adapter is not registered for exchange: ${request.exchange}`,
      );
    }

    const adapter =
      liveExecutionService.getAdapter(
        normalizedExchange,
      );

    if (!adapter.isConnected()) {
      throw new Error(
        `Live execution adapter is not connected: ${normalizedExchange}`,
      );
    }

    const result =
      await adapter.execute({
        ...request,

        exchange:
          normalizedExchange,

        market:
          request.market
            .trim()
            .toUpperCase(),
      });

    return {
      mode: "live",

      result,
    };
  }
}

export const executionModeRouter =
  new ExecutionModeRouter();