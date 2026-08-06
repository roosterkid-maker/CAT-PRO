import type {
  ExecutionMode,
} from "./ExecutionModeRouter";

export class ExecutionModeConfig {
  getMode(): ExecutionMode {
    const configuredMode =
      process.env.TRADING_EXECUTION_MODE
        ?.trim()
        .toLowerCase();

    if (
      !configuredMode ||
      configuredMode === "paper"
    ) {
      return "paper";
    }

    if (configuredMode === "live") {
      return "live";
    }

    throw new Error(
      `Invalid TRADING_EXECUTION_MODE: ${configuredMode}. Expected paper or live.`,
    );
  }

  isPaper(): boolean {
    return (
      this.getMode() === "paper"
    );
  }

  isLive(): boolean {
    return (
      this.getMode() === "live"
    );
  }
}

export const executionModeConfig =
  new ExecutionModeConfig();