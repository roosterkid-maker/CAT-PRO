import type {
  ExecutionRequest,
} from "../../execution/models/ExecutionRequest";

import type {
  LiveExecutionRequest,
} from "../../execution/live/models/LiveExecutionRequest";

import type {
  ModeExecutionResult,
} from "./ExecutionModeRouter";

import {
  executionModeRouter,
} from "./ExecutionModeRouter";

import {
  executionModeConfig,
} from "./ExecutionModeConfig";

export interface TradingExecutionInput {
  paperRequest: ExecutionRequest;

  /*
   * Live mode के लिए quantity और price explicitly
   * provide करना mandatory है. Capital को यहाँ
   * automatically quantity में convert नहीं करेंगे.
   */
  liveRequest?:
    LiveExecutionRequest;
}

const LIVE_EXECUTION_CONFIRMATION =
  "ENABLE_CONFIRMED_LIVE_EXECUTION";

export class TradingExecutionCoordinator {
  async execute(
    input: TradingExecutionInput,
  ): Promise<ModeExecutionResult> {
    this.validatePaperRequest(
      input.paperRequest,
    );

    const mode =
      executionModeConfig.getMode();

    if (mode === "paper") {
      return executionModeRouter.execute({
        mode: "paper",

        request:
          input.paperRequest,
      });
    }

    const liveRequest =
      input.liveRequest;

    if (!liveRequest) {
      throw new Error(
        "Live execution request is required when TRADING_EXECUTION_MODE=live.",
      );
    }

    this.validateLiveRequest(
      liveRequest,
    );

    this.assertLiveExecutionEnabled();

    return executionModeRouter.execute({
      mode: "live",

      request:
        liveRequest,
    });
  }

  getMode():
  "paper" | "live" {
    return executionModeConfig.getMode();
  }

  isPaperMode(): boolean {
    return executionModeConfig.isPaper();
  }

  isLiveMode(): boolean {
    return executionModeConfig.isLive();
  }

  private assertLiveExecutionEnabled():
  void {
    const confirmation =
      process.env
        .LIVE_TRADING_CONFIRMATION
        ?.trim();

    if (
      confirmation !==
      LIVE_EXECUTION_CONFIRMATION
    ) {
      throw new Error(
        [
          "Live execution is blocked.",
          "Set LIVE_TRADING_CONFIRMATION=ENABLE_CONFIRMED_LIVE_EXECUTION",
          "only for an intentionally approved live session.",
        ].join(" "),
      );
    }
  }

  private validatePaperRequest(
    request: ExecutionRequest,
  ): void {
    if (
      typeof request.market !==
        "string" ||
      request.market
        .trim()
        .length === 0
    ) {
      throw new Error(
        "Paper execution market is required.",
      );
    }

    if (
      typeof request.buyExchange !==
        "string" ||
      request.buyExchange
        .trim()
        .length === 0
    ) {
      throw new Error(
        "Paper execution buy exchange is required.",
      );
    }

    if (
      typeof request.sellExchange !==
        "string" ||
      request.sellExchange
        .trim()
        .length === 0
    ) {
      throw new Error(
        "Paper execution sell exchange is required.",
      );
    }

    if (
      !Number.isFinite(
        request.capital,
      ) ||
      request.capital <= 0
    ) {
      throw new Error(
        "Paper execution capital must be a positive finite number.",
      );
    }
  }

  private validateLiveRequest(
    request: LiveExecutionRequest,
  ): void {
    if (
      typeof request.exchange !==
        "string" ||
      request.exchange
        .trim()
        .length === 0
    ) {
      throw new Error(
        "Live execution exchange is required.",
      );
    }

    if (
      typeof request.market !==
        "string" ||
      request.market
        .trim()
        .length === 0
    ) {
      throw new Error(
        "Live execution market is required.",
      );
    }

    if (
      request.side !== "buy" &&
      request.side !== "sell"
    ) {
      throw new Error(
        "Live execution side must be buy or sell.",
      );
    }

    if (
      request.orderType !== "limit" &&
      request.orderType !== "market"
    ) {
      throw new Error(
        "Live execution order type must be limit or market.",
      );
    }

    if (
      !Number.isFinite(
        request.quantity,
      ) ||
      request.quantity <= 0
    ) {
      throw new Error(
        "Live execution quantity must be a positive finite number.",
      );
    }

    if (
      request.orderType ===
        "limit" &&
      (
        request.price ===
          undefined ||
        !Number.isFinite(
          request.price,
        ) ||
        request.price <= 0
      )
    ) {
      throw new Error(
        "A positive finite price is required for a live limit order.",
      );
    }

    if (
      request.timeoutMs !==
        undefined &&
      (
        !Number.isFinite(
          request.timeoutMs,
        ) ||
        request.timeoutMs <= 0
      )
    ) {
      throw new Error(
        "Live execution timeout must be a positive finite number.",
      );
    }

    if (
      request.pollingIntervalMs !==
        undefined &&
      (
        !Number.isFinite(
          request.pollingIntervalMs,
        ) ||
        request.pollingIntervalMs <= 0
      )
    ) {
      throw new Error(
        "Live execution polling interval must be a positive finite number.",
      );
    }

    if (
      request.timeoutMs !==
        undefined &&
      request.pollingIntervalMs !==
        undefined &&
      request.pollingIntervalMs >
        request.timeoutMs
    ) {
      throw new Error(
        "Live polling interval cannot exceed live execution timeout.",
      );
    }
  }
}

export const tradingExecutionCoordinator =
  new TradingExecutionCoordinator();