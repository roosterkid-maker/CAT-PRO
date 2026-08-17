export interface BybitSpotInstrument {
  symbol:
    string;

  baseCoin:
    string;

  quoteCoin:
    string;

  status:
    string;

  priceFilter?: {
    tickSize?: unknown;
  };

  lotSizeFilter?: {
    basePrecision?: unknown;

    quotePrecision?: unknown;

    minOrderQty?: unknown;

    maxOrderQty?: unknown;

    minOrderAmt?: unknown;

    maxOrderAmt?: unknown;

    maxLimitOrderQty?: unknown;

    maxMarketOrderQty?: unknown;

    postOnlyMaxLimitOrderSize?: unknown;
  };

  marginTrading?: unknown;
}

interface BybitInstrumentsResponse {
  retCode:
    number;

  retMsg:
    string;

  result?: {
    category?:
      string;

    list?: unknown;
  };
}

export interface BybitSpotMarketActivity {
  symbol:
    string;

  turnover24h:
    number;

  volume24h:
    number;
}

interface BybitTickersResponse {
  retCode:
    number;

  retMsg:
    string;

  result?: {
    category?:
      string;

    list?:
      unknown;
  };
}

const BYBIT_INSTRUMENTS_URL =
  "https://api.bybit.com/v5/market/instruments-info?category=spot";

const BYBIT_TICKERS_URL =
  "https://api.bybit.com/v5/market/tickers?category=spot";

export async function loadBybitSpotInstruments():
Promise<BybitSpotInstrument[]> {
  const response =
    await fetch(
      BYBIT_INSTRUMENTS_URL,
      {
        signal:
          AbortSignal.timeout(
            10_000,
          ),
      },
    );

  if (
    !response.ok
  ) {
    throw new Error(
      `Bybit instruments request failed with HTTP ${response.status}.`,
    );
  }

  const data =
    (await response.json()) as
      BybitInstrumentsResponse;

  if (
    data.retCode !==
      0
  ) {
    throw new Error(
      `Bybit instruments request failed: ${data.retMsg}`,
    );
  }

  const incomingInstruments =
    data.result
      ?.list;

  if (
    !Array.isArray(
      incomingInstruments,
    )
  ) {
    throw new Error(
      "Invalid Bybit instruments response.",
    );
  }

  const instruments =
    incomingInstruments
      .filter(
        (
          instrument,
        ): instrument is BybitSpotInstrument =>
          isBybitSpotInstrument(
            instrument,
          ),
      )
      .map(
        (instrument) => ({
          ...structuredClone(
            instrument,
          ),

          symbol:
            instrument.symbol
              .trim()
              .toUpperCase(),

          baseCoin:
            instrument.baseCoin
              .trim()
              .toUpperCase(),

          quoteCoin:
            instrument.quoteCoin
              .trim()
              .toUpperCase(),

          status:
            instrument.status
              .trim(),
        }),
      );

  if (
    instruments.length ===
      0
  ) {
    throw new Error(
      "Bybit returned no valid spot instruments.",
    );
  }

  return instruments;
}

export async function loadBybitUSDTMarkets():
Promise<string[]> {
  const instruments =
    await loadBybitSpotInstruments();

  const symbols =
    instruments
      .filter(
        (
          instrument,
        ) =>
          instrument.status
            ?.trim()
            .toUpperCase() ===
            "TRADING" &&
          instrument.quoteCoin
            ?.trim()
            .toUpperCase() ===
            "USDT",
      )
      .map(
        (
          instrument,
        ) =>
          instrument.symbol
            .trim()
            .toUpperCase(),
      )
      .filter(
        (
          symbol,
        ) =>
          symbol.length >
          0,
      );

  return Array.from(
    new Set(
      symbols,
    ),
  ).sort();
}

/*
 * Advisory subscription-ranking evidence only.
 *
 * This endpoint is never used as an executable quote and
 * never changes the Bybit freshness boundary. If it is
 * unavailable the adapter keeps a deterministic catalog
 * fallback rather than claiming activity evidence.
 */
export async function loadBybitSpotMarketActivity():
Promise<BybitSpotMarketActivity[]> {
  const response =
    await fetch(
      BYBIT_TICKERS_URL,
      {
        signal:
          AbortSignal.timeout(
            10_000,
          ),
      },
    );

  if (
    !response.ok
  ) {
    throw new Error(
      `Bybit tickers request failed with HTTP ${response.status}.`,
    );
  }

  const data =
    (await response.json()) as
      BybitTickersResponse;

  if (
    data.retCode !== 0
  ) {
    throw new Error(
      `Bybit tickers request failed: ${data.retMsg}`,
    );
  }

  const incomingTickers =
    data.result?.list;

  if (
    !Array.isArray(
      incomingTickers,
    )
  ) {
    throw new Error(
      "Invalid Bybit tickers response.",
    );
  }

  return incomingTickers
    .map(
      (ticker) =>
        normalizeSpotMarketActivity(
          ticker,
        ),
    )
    .filter(
      (
        ticker,
      ): ticker is BybitSpotMarketActivity =>
        ticker !== null,
    );
}

function normalizeSpotMarketActivity(
  value: unknown,
): BybitSpotMarketActivity | null {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(
      value,
    )
  ) {
    return null;
  }

  const candidate =
    value as Record<string, unknown>;

  const symbol =
    typeof candidate.symbol === "string"
      ? candidate.symbol
          .trim()
          .toUpperCase()
      : "";

  const turnover24h =
    toNonNegativeNumber(
      candidate.turnover24h,
    );

  const volume24h =
    toNonNegativeNumber(
      candidate.volume24h,
    );

  if (
    symbol.length === 0 ||
    turnover24h === null ||
    volume24h === null
  ) {
    return null;
  }

  return {
    symbol,
    turnover24h,
    volume24h,
  };
}

function toNonNegativeNumber(
  value: unknown,
): number | null {
  const parsed =
    typeof value === "number" ||
    typeof value === "string"
      ? Number(
          value,
        )
      : Number.NaN;

  return Number.isFinite(
    parsed,
  ) &&
    parsed >= 0
    ? parsed
    : null;
}

function isBybitSpotInstrument(
  value: unknown,
): value is BybitSpotInstrument {
  if (
    !value ||
    typeof value !==
      "object" ||
    Array.isArray(
      value,
    )
  ) {
    return false;
  }

  const candidate =
    value as
      Partial<BybitSpotInstrument>;

  return [
    candidate.symbol,
    candidate.baseCoin,
    candidate.quoteCoin,
    candidate.status,
  ].every(
    (field) =>
      typeof field ===
        "string" &&
      field.trim().length >
        0,
  );
}
