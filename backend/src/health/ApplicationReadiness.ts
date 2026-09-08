export type ApplicationInitializationState =
  | "STARTING"
  | "READY"
  | "FAILED";

export interface MarketDataConnectionSnapshot {
  name: string;

  connected: boolean;
}

export interface ApplicationReadinessReport {
  status:
    | "READY"
    | "STARTING"
    | "INITIALIZATION_FAILED"
    | "INSUFFICIENT_MARKET_DATA";

  ready: boolean;

  initializationState:
    ApplicationInitializationState;

  minimumConnectedExchanges:
    number;

  registeredExchanges:
    number;

  connectedExchanges:
    number;

  connected:
    readonly string[];

  disconnected:
    readonly string[];
}

export const MINIMUM_CONNECTED_EXCHANGES_FOR_READINESS =
  2;

export function evaluateApplicationReadiness(
  initializationState:
    ApplicationInitializationState,
  exchanges:
    readonly MarketDataConnectionSnapshot[],
  minimumConnectedExchanges =
    MINIMUM_CONNECTED_EXCHANGES_FOR_READINESS,
): ApplicationReadinessReport {
  if (
    !Number.isSafeInteger(
      minimumConnectedExchanges,
    ) ||
    minimumConnectedExchanges <=
      0
  ) {
    throw new Error(
      "Minimum connected exchanges must be a positive integer.",
    );
  }

  const connected =
    exchanges
      .filter(
        (
          exchange,
        ) =>
          exchange.connected,
      )
      .map(
        (
          exchange,
        ) =>
          exchange.name,
      )
      .sort();

  const disconnected =
    exchanges
      .filter(
        (
          exchange,
        ) =>
          !exchange.connected,
      )
      .map(
        (
          exchange,
        ) =>
          exchange.name,
      )
      .sort();

  const hasEnoughMarketData =
    connected.length >=
    minimumConnectedExchanges;

  const ready =
    initializationState ===
      "READY" &&
    hasEnoughMarketData;

  const status =
    initializationState ===
      "FAILED"
      ? "INITIALIZATION_FAILED"
      : initializationState ===
          "STARTING"
        ? "STARTING"
        : hasEnoughMarketData
          ? "READY"
          : "INSUFFICIENT_MARKET_DATA";

  return {
    status,
    ready,
    initializationState,
    minimumConnectedExchanges,
    registeredExchanges:
      exchanges.length,
    connectedExchanges:
      connected.length,
    connected,
    disconnected,
  };
}
