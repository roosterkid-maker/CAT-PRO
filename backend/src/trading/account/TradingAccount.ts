export type TradingMode =
  | "PAPER"
  | "TESTNET"
  | "LIVE";

export interface TradingLimits {
  maximumCapitalPerTrade: number;

  maximumDailyLoss: number;

  maximumOpenTrades: number;

  maximumDailyTrades: number;
}

export interface TradingAccount {
  id: string;

  name: string;

  mode: TradingMode;

  enabled: boolean;

  emergencyStop: boolean;

  limits: TradingLimits;

  initialCapital: number;

  currentCapital: number;

  availableCapital: number;

  todayProfit: number;

  todayLoss: number;

  openTrades: number;

  tradesToday: number;
}

/*
 * PAPER research throughput policy.
 *
 * This raises only the account-side daily admission budget. It does not
 * enable LIVE mode, bypass per-trade risk checks, or submit exchange orders.
 */
export const MAXIMUM_DAILY_PAPER_ATTEMPT_LIMIT =
  5_000;

export const DEFAULT_MAXIMUM_DAILY_PAPER_TRADES =
  500;

/**
 * CAT PRO's operator-facing PAPER day is always India Standard Time.
 *
 * Do not derive this key from the host's local timezone: production VPS
 * hosts commonly run in UTC, which would move the daily safety reset from
 * 00:00 IST to 05:30 IST.
 */
export const PAPER_ACCOUNTING_TIME_ZONE =
  "Asia/Kolkata" as const;

const paperAccountingDateFormatter =
  new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone:
        PAPER_ACCOUNTING_TIME_ZONE,
      year:
        "numeric",
      month:
        "2-digit",
      day:
        "2-digit",
    },
  );

export function toPaperAccountingDateKey(
  timestamp:
    number,
): string {
  const parts =
    paperAccountingDateFormatter
      .formatToParts(
        new Date(
          timestamp,
        ),
      );

  const values =
    new Map(
      parts.map(
        (
          part,
        ) => [
          part.type,
          part.value,
        ],
      ),
    );

  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

export const defaultTradingAccount: TradingAccount = {
  id: "default",

  name: "CAT PRO",

  mode: "PAPER",

  enabled: true,

  emergencyStop: false,

  limits: {
    maximumCapitalPerTrade: 100_000,

    maximumDailyLoss: 10_000,

    maximumOpenTrades: 5,

    maximumDailyTrades:
      DEFAULT_MAXIMUM_DAILY_PAPER_TRADES,
  },

  initialCapital: 100_000,

  currentCapital: 100_000,

  availableCapital: 100_000,

  todayProfit: 0,

  todayLoss: 0,

  openTrades: 0,

  tradesToday: 0,
};
