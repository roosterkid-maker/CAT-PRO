export type PortfolioValuationSource =
  | "STABLE_ASSET"
  | "BEST_BID"
  | "LAST_PRICE"
  | "UNAVAILABLE";

export interface PortfolioAssetPosition {
  exchange: string;
  asset: string;

  availableBalance: number;
  lockedBalance: number;
  totalBalance: number;

  priceUsdt: number | null;
  availableValueUsdt: number | null;
  lockedValueUsdt: number | null;
  totalValueUsdt: number | null;

  valuationMarket: string | null;
  valuationSource: PortfolioValuationSource;
  valuationTimestamp: number | null;
  valuationAgeMs: number | null;

  synchronizedAt: number;
  balanceAgeMs: number;
}

export interface ExchangePortfolioSnapshot {
  exchange: string;

  assets: PortfolioAssetPosition[];

  assetCount: number;
  valuedAssetCount: number;
  unvaluedAssetCount: number;

  totalEquityUsdt: number;
  availableEquityUsdt: number;
  lockedEquityUsdt: number;

  directUsdtAvailable: number;
  directUsdtLocked: number;
  directUsdtTotal: number;

  oldestBalanceAgeMs: number | null;
  newestBalanceAgeMs: number | null;
  lastSynchronizedAt: number | null;
}

export interface PortfolioCapitalSnapshot {
  mode: string;

  accountInitialCapital: number;
  accountCurrentCapital: number;
  accountAvailableCapital: number;
  accountReservedCapital: number;

  synchronizedExchangeEquityUsdt: number;
  synchronizedExchangeAvailableEquityUsdt: number;
  synchronizedExchangeLockedEquityUsdt: number;

  liquidUsdt: number;
  tradableCapitalUsdt: number;
}

export interface PortfolioSnapshot {
  baseCurrency: "USDT";

  generatedAt: number;

  capital: PortfolioCapitalSnapshot;

  exchanges: ExchangePortfolioSnapshot[];

  totals: {
    exchanges: number;

    assets: number;
    valuedAssets: number;
    unvaluedAssets: number;

    totalEquityUsdt: number;
    availableEquityUsdt: number;
    lockedEquityUsdt: number;

    liquidUsdt: number;
  };
}