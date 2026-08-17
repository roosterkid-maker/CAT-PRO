type NodeEnvironment =
  | "development"
  | "test"
  | "production";

type TradingMode =
  | "paper"
  | "live";

export interface ApplicationEnvironment {
  nodeEnv:
    NodeEnvironment;

  port:
    number;

  backendHost:
    string;

  frontendOrigin:
    string;

  tradingMode:
    TradingMode;

  liveTradingEnabled:
    boolean;

  executionTimeoutMs:
    number;

  executionPollingIntervalMs:
    number;

  executionCancelOnTimeout:
    boolean;

  maximumQuoteAgeMs:
    number;

  minimumNetProfitPercent:
    number;

  minimumLiquidityPercent:
    number;

  logLevel:
    string;

  logDirectory:
    string;
}

export function loadEnvironment():
ApplicationEnvironment {
  const nodeEnv =
    readEnum(
      "NODE_ENV",
      [
        "development",
        "test",
        "production",
      ] as const,
      "development",
    );

  const tradingMode =
    readEnum(
      "TRADING_MODE",
      [
        "paper",
        "live",
      ] as const,
      "paper",
    );

  const environment:
    ApplicationEnvironment = {
    nodeEnv,

    port:
      readPositiveInteger(
        "PORT",
        5000,
      ),

    backendHost:
      readString(
        "CAT_PRO_BACKEND_HOST",
        "127.0.0.1",
      ),

    frontendOrigin:
      readString(
        "FRONTEND_ORIGIN",
        "http://localhost:5173",
      ),

    tradingMode,

    liveTradingEnabled:
      readBoolean(
        "LIVE_TRADING_ENABLED",
        false,
      ),

    executionTimeoutMs:
      readPositiveInteger(
        "EXECUTION_TIMEOUT_MS",
        15_000,
      ),

    executionPollingIntervalMs:
      readPositiveInteger(
        "EXECUTION_POLLING_INTERVAL_MS",
        1_000,
      ),

    executionCancelOnTimeout:
      readBoolean(
        "EXECUTION_CANCEL_ON_TIMEOUT",
        true,
      ),

    maximumQuoteAgeMs:
      readPositiveInteger(
        "MAXIMUM_QUOTE_AGE_MS",
        5_000,
      ),

    minimumNetProfitPercent:
      readNonNegativeNumber(
        "MINIMUM_NET_PROFIT_PERCENT",
        0.1,
      ),

    minimumLiquidityPercent:
      readPositiveNumber(
        "MINIMUM_LIQUIDITY_PERCENT",
        100,
      ),

    logLevel:
      readString(
        "LOG_LEVEL",
        "info",
      ),

    logDirectory:
      readString(
        "LOG_DIRECTORY",
        "logs",
      ),
  };

  validateTradingSafety(
    environment,
  );

  return environment;
}

function validateTradingSafety(
  environment:
    ApplicationEnvironment,
): void {
  if (
    environment.tradingMode ===
      "live" &&
    !environment.liveTradingEnabled
  ) {
    throw new Error(
      "TRADING_MODE is live but LIVE_TRADING_ENABLED is false.",
    );
  }

  if (
    environment.nodeEnv ===
      "production" &&
    environment.tradingMode ===
      "live" &&
    process.env
      .ARBITRAGE_LIVE_CONFIRMATION
      ?.trim() !==
      "ENABLE_CONFIRMED_ARBITRAGE_EXECUTION"
  ) {
    throw new Error(
      "Production live trading requires ARBITRAGE_LIVE_CONFIRMATION.",
    );
  }
}

function readString(
  name: string,
  fallback?: string,
): string {
  const value =
    process.env[name]
      ?.trim();

  if (value) {
    return value;
  }

  if (
    fallback !==
    undefined
  ) {
    return fallback;
  }

  throw new Error(
    `Missing required environment variable: ${name}.`,
  );
}

function readBoolean(
  name: string,
  fallback: boolean,
): boolean {
  const value =
    process.env[name]
      ?.trim()
      .toLowerCase();

  if (!value) {
    return fallback;
  }

  if (
    value === "true" ||
    value === "1"
  ) {
    return true;
  }

  if (
    value === "false" ||
    value === "0"
  ) {
    return false;
  }

  throw new Error(
    `${name} must be true or false.`,
  );
}

function readPositiveInteger(
  name: string,
  fallback: number,
): number {
  const value =
    readNumber(
      name,
      fallback,
    );

  if (
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new Error(
      `${name} must be a positive integer.`,
    );
  }

  return value;
}

function readPositiveNumber(
  name: string,
  fallback: number,
): number {
  const value =
    readNumber(
      name,
      fallback,
    );

  if (value <= 0) {
    throw new Error(
      `${name} must be greater than zero.`,
    );
  }

  return value;
}

function readNonNegativeNumber(
  name: string,
  fallback: number,
): number {
  const value =
    readNumber(
      name,
      fallback,
    );

  if (value < 0) {
    throw new Error(
      `${name} must be zero or greater.`,
    );
  }

  return value;
}

function readNumber(
  name: string,
  fallback: number,
): number {
  const rawValue =
    process.env[name]
      ?.trim();

  if (!rawValue) {
    return fallback;
  }

  const value =
    Number(rawValue);

  if (
    !Number.isFinite(value)
  ) {
    throw new Error(
      `${name} must be a finite number.`,
    );
  }

  return value;
}

function readEnum<
  const Values extends
    readonly string[],
>(
  name: string,
  values: Values,
  fallback:
    Values[number],
): Values[number] {
  const value =
    process.env[name]
      ?.trim()
      .toLowerCase();

  if (!value) {
    return fallback;
  }

  if (
    values.includes(
      value,
    )
  ) {
    return value;
  }

  throw new Error(
    `${name} must be one of: ${values.join(
      ", ",
    )}.`,
  );
}

export const environment =
  loadEnvironment();
