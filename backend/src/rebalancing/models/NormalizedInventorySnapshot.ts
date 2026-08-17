import type {
  ExchangeBalanceDashboardStatus,
} from "../../portfolio/services/ExchangeBalancePortfolioService";

import type {
  PortfolioValuationSource,
} from "../../portfolio/models/PortfolioSnapshot";

import type {
  TradingMode,
} from "../../trading/account/TradingAccount";

import type {
  CapitalReservationDiagnostics,
} from "../../trading/capital/CapitalReservation";

export type NormalizedInventoryState =
  | "READY_FOR_REBALANCING_ANALYSIS"
  | "PARTIAL_EVIDENCE"
  | "NO_BALANCE_EVIDENCE";

export type NormalizedInventoryValuationState =
  | "CURRENT"
  | "STALE"
  | "UNAVAILABLE";

export interface NormalizedInventoryAsset {
  readonly exchange: string;
  readonly asset: string;
  readonly availableBalance: number;
  readonly reservedBalance: number;
  readonly availableAfterReservations: number;
  readonly lockedBalance: number;
  readonly totalBalance: number;
  readonly synchronizedAt: number | null;
  readonly balanceAgeMs: number | null;
  readonly balanceUsableForDecision: boolean;
  readonly valuation: {
    readonly state: NormalizedInventoryValuationState;
    readonly source: PortfolioValuationSource;
    readonly market: string | null;
    readonly priceUsdt: number | null;
    readonly timestamp: number | null;
    readonly ageMs: number | null;
    readonly availableValueUsdt: number | null;
    readonly availableAfterReservationsValueUsdt: number | null;
    readonly lockedValueUsdt: number | null;
    readonly totalValueUsdt: number | null;
    readonly usableForDecision: boolean;
  };
}

export interface NormalizedExchangeInventorySnapshot {
  readonly exchange: string;
  readonly displayName: string;
  readonly balanceStatus: ExchangeBalanceDashboardStatus;
  readonly lastSynchronizedAt: number | null;
  readonly balanceAgeMs: number | null;
  readonly balanceUsableForDecision: boolean;
  readonly assets: readonly NormalizedInventoryAsset[];
  readonly totals: {
    readonly positiveAssets: number;
    readonly currentValuations: number;
    readonly staleValuations: number;
    readonly unavailableValuations: number;
    readonly knownAvailableValueUsdt: number;
    readonly knownAvailableAfterReservationsValueUsdt: number;
    readonly knownLockedValueUsdt: number;
    readonly knownTotalValueUsdt: number;
    readonly decisionUsableValueUsdt: number;
    readonly authoritativeAvailableValueUsdt: number | null;
    readonly authoritativeAvailableAfterReservationsValueUsdt: number | null;
    readonly authoritativeLockedValueUsdt: number | null;
    readonly authoritativeTotalValueUsdt: number | null;
    readonly directUsdtAvailable: number;
    readonly directUsdtAvailableAfterReservations: number;
    readonly directUsdtLocked: number;
    readonly directUsdtTotal: number;
  };
}

export interface NormalizedInventorySnapshot {
  readonly version: "121.0";
  readonly generatedAt: number;
  readonly state: NormalizedInventoryState;
  readonly valuationAsset: "USDT";
  readonly maximumBalanceAgeMs: number;
  readonly exchanges: readonly NormalizedExchangeInventorySnapshot[];
  readonly totals: {
    readonly exchanges: number;
    readonly synchronizedExchanges: number;
    readonly positiveAssets: number;
    readonly currentValuations: number;
    readonly staleValuations: number;
    readonly unavailableValuations: number;
    readonly knownAvailableValueUsdt: number;
    readonly knownAvailableAfterReservationsValueUsdt: number;
    readonly knownLockedValueUsdt: number;
    readonly knownTotalValueUsdt: number;
    readonly decisionUsableValueUsdt: number;
    readonly authoritativeAvailableCapitalUsdt: number | null;
    readonly authoritativeLockedCapitalUsdt: number | null;
    readonly authoritativeTotalCapitalUsdt: number | null;
    readonly directUsdtAvailable: number;
    readonly directUsdtAvailableAfterReservations: number;
    readonly directUsdtLocked: number;
    readonly directUsdtTotal: number;
  };
  readonly accountingCapital: {
    readonly mode: TradingMode;
    readonly unit: "ACCOUNTING_UNIT";
    readonly initial: number;
    readonly current: number;
    readonly available: number;
    readonly reserved: number;
    readonly includedInWalletValuation: false;
  };
  readonly reservations: {
    readonly scope: "GLOBAL_AND_EXCHANGE_ASSET";
    readonly accountingUnit: "ACCOUNTING_UNIT";
    readonly activeReservations: number;
    readonly activeReservedCapital: number;
    readonly activeInventoryReservations: number;
    readonly unscopedActiveReservations: number;
    readonly activeInventoryHolds: CapitalReservationDiagnostics["activeInventoryHolds"];
    readonly perExchangeAssetReservationSupported: true;
    readonly appliedToWalletInventory: true;
  };
  readonly transfers: {
    readonly state: "NO_TRANSFER_LEDGER";
    readonly pendingTransferCapitalUsdt: null;
    readonly inTransitCapitalUsdt: null;
    readonly includedInAvailableCapital: false;
  };
  readonly blockers: readonly string[];
  readonly limitations: readonly string[];
  readonly safety: {
    readonly readOnly: true;
    readonly balanceMutationAllowed: false;
    readonly paperAccountingMutationAllowed: false;
    readonly liveOrderSubmissionAllowed: false;
    readonly internalTransferSubmissionAllowed: false;
    readonly externalTransferSubmissionAllowed: false;
    readonly withdrawalSubmissionAllowed: false;
    readonly missingValuationsTreatedAsZero: false;
    readonly nativeAssetUnitsSummedAcrossAssets: false;
    readonly accountingCapitalMixedWithWalletValuation: false;
  };
}
