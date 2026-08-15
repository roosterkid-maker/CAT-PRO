export type ExchangeBalanceStatus =
  | "SYNCHRONIZED"
  | "STALE"
  | "FAILED"
  | "NOT_CONFIGURED"
  | "PENDING";

export interface ExchangeBalanceAsset {
  asset: string;

  availableBalance: number;

  lockedBalance: number;

  totalBalance: number;
}

export interface ExchangeBalanceExchange {
  exchange: string;

  displayName: string;

  status:
    ExchangeBalanceStatus;

  lastAttemptedAt:
    number | null;

  lastSynchronizedAt:
    number | null;

  balanceAgeMs:
    number | null;

  synchronizedAssetCount: number;

  positiveAssetCount: number;

  zeroAssetCount: number;

  retainedAfterFailure: boolean;

  reasons: string[];

  assets:
    ExchangeBalanceAsset[];
}

export interface ExchangeBalanceReport {
  generatedAt: number;

  synchronizationInProgress: boolean;

  maximumFreshAgeMs: number;

  totals: {
    exchanges: number;

    synchronized: number;

    stale: number;

    failed: number;

    notConfigured: number;

    pending: number;

    positiveAssets: number;
  };

  exchanges:
    ExchangeBalanceExchange[];
}

export interface ExchangeBalanceResponse {
  success: boolean;

  data:
    ExchangeBalanceReport;
}
