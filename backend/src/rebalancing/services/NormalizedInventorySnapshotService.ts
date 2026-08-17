import type {
  PortfolioAssetPosition,
  PortfolioSnapshot,
} from "../../portfolio/models/PortfolioSnapshot";

import {
  exchangeBalancePortfolioService,
  type ExchangeBalanceDashboardReport,
} from "../../portfolio/services/ExchangeBalancePortfolioService";

import {
  portfolioService,
} from "../../portfolio/services/PortfolioService";

import type {
  NormalizedExchangeInventorySnapshot,
  NormalizedInventoryAsset,
  NormalizedInventorySnapshot,
  NormalizedInventoryValuationState,
} from "../models/NormalizedInventorySnapshot";

import {
  tradingAccountService,
} from "../../trading/account/TradingAccountService";

import type {
  TradingAccount,
} from "../../trading/account/TradingAccount";

import type {
  CapitalReservationDiagnostics,
} from "../../trading/capital/CapitalReservation";

import {
  capitalReservationService,
} from "../../trading/capital/CapitalReservationService";

export interface NormalizedInventorySnapshotDependencies {
  getExchangeBalanceReport(now: number): ExchangeBalanceDashboardReport;
  getPortfolioSnapshot(now: number): PortfolioSnapshot;
  getTradingAccount(): TradingAccount;
  getReservationDiagnostics(): CapitalReservationDiagnostics;
}

const DEFAULT_DEPENDENCIES: NormalizedInventorySnapshotDependencies = {
  getExchangeBalanceReport: (now) =>
    exchangeBalancePortfolioService.getReport(now),
  getPortfolioSnapshot: (now) =>
    portfolioService.getSnapshot(now),
  getTradingAccount: () =>
    tradingAccountService.getAccount(),
  getReservationDiagnostics: () =>
    capitalReservationService.getDiagnostics(),
};

/**
 * Builds a single read-only inventory truth from CAT PRO's existing balance,
 * valuation, account and reservation owners. Native asset quantities are
 * never summed together and account-ledger units never enter wallet USDT
 * totals.
 */
export class NormalizedInventorySnapshotService {
  private readonly dependencies: NormalizedInventorySnapshotDependencies;

  constructor(
    dependencies: Partial<NormalizedInventorySnapshotDependencies> = {},
  ) {
    this.dependencies = {
      ...DEFAULT_DEPENDENCIES,
      ...dependencies,
    };
  }

  getSnapshot(
    now = Date.now(),
  ): NormalizedInventorySnapshot {
    if (!Number.isSafeInteger(now) || now <= 0) {
      throw new Error(
        "Normalized inventory timestamp must be a positive safe integer.",
      );
    }

    const balanceReport =
      this.dependencies.getExchangeBalanceReport(now);
    const portfolio =
      this.dependencies.getPortfolioSnapshot(now);
    const account =
      this.dependencies.getTradingAccount();
    const reservations =
      this.dependencies.getReservationDiagnostics();
    const reservedInventoryByKey =
      new Map(
        reservations.activeInventoryHolds.map(
          (hold) => [
            this.createInventoryKey(
              hold.exchange,
              hold.asset,
            ),
            hold.reservedAmount,
          ],
        ),
      );

    const portfolioByExchange = new Map(
      portfolio.exchanges.map((exchange) => [
        exchange.exchange.trim().toLowerCase(),
        exchange,
      ]),
    );

    const exchanges = balanceReport.exchanges.map((exchange) =>
      this.buildExchange(
        exchange,
        portfolioByExchange.get(exchange.exchange) ?? null,
        balanceReport.maximumFreshAgeMs,
        reservedInventoryByKey,
      ),
    );

    const synchronizedExchanges = exchanges.filter(
      (exchange) => exchange.balanceStatus === "SYNCHRONIZED",
    ).length;
    const positiveAssets = this.sum(
      exchanges.map((exchange) => exchange.totals.positiveAssets),
    );
    const currentValuations = this.sum(
      exchanges.map((exchange) => exchange.totals.currentValuations),
    );
    const staleValuations = this.sum(
      exchanges.map((exchange) => exchange.totals.staleValuations),
    );
    const unavailableValuations = this.sum(
      exchanges.map((exchange) => exchange.totals.unavailableValuations),
    );
    const walletValuationAuthoritative =
      exchanges.length > 0 &&
      synchronizedExchanges === exchanges.length &&
      staleValuations === 0 &&
      unavailableValuations === 0;
    const availabilityAuthoritative =
      walletValuationAuthoritative &&
      reservations.unscopedActiveReservations === 0;
    const hasBalanceEvidence = exchanges.some(
      (exchange) =>
        exchange.lastSynchronizedAt !== null ||
        exchange.totals.positiveAssets > 0,
    );
    const blockers = this.buildBlockers(
      exchanges,
      reservations,
    );
    const knownAvailableValueUsdt = this.round(
      this.sum(exchanges.map(
        (exchange) => exchange.totals.knownAvailableValueUsdt,
      )),
    );
    const knownAvailableAfterReservationsValueUsdt = this.round(
      this.sum(exchanges.map(
        (exchange) =>
          exchange.totals.knownAvailableAfterReservationsValueUsdt,
      )),
    );
    const knownLockedValueUsdt = this.round(
      this.sum(exchanges.map(
        (exchange) => exchange.totals.knownLockedValueUsdt,
      )),
    );
    const knownTotalValueUsdt = this.round(
      this.sum(exchanges.map(
        (exchange) => exchange.totals.knownTotalValueUsdt,
      )),
    );

    return this.deepFreeze({
      version: "121.0" as const,
      generatedAt: now,
      state: availabilityAuthoritative
        ? "READY_FOR_REBALANCING_ANALYSIS" as const
        : hasBalanceEvidence
          ? "PARTIAL_EVIDENCE" as const
          : "NO_BALANCE_EVIDENCE" as const,
      valuationAsset: "USDT" as const,
      maximumBalanceAgeMs: balanceReport.maximumFreshAgeMs,
      exchanges,
      totals: {
        exchanges: exchanges.length,
        synchronizedExchanges,
        positiveAssets,
        currentValuations,
        staleValuations,
        unavailableValuations,
        knownAvailableValueUsdt,
        knownAvailableAfterReservationsValueUsdt,
        knownLockedValueUsdt,
        knownTotalValueUsdt,
        decisionUsableValueUsdt: this.round(
          this.sum(exchanges.map(
            (exchange) => exchange.totals.decisionUsableValueUsdt,
          )),
        ),
        authoritativeAvailableCapitalUsdt: availabilityAuthoritative
          ? knownAvailableAfterReservationsValueUsdt
          : null,
        authoritativeLockedCapitalUsdt: walletValuationAuthoritative
          ? knownLockedValueUsdt
          : null,
        authoritativeTotalCapitalUsdt: walletValuationAuthoritative
          ? knownTotalValueUsdt
          : null,
        directUsdtAvailable: this.round(
          this.sum(exchanges
            .filter((exchange) => exchange.balanceUsableForDecision)
            .map((exchange) => exchange.totals.directUsdtAvailable)),
        ),
        directUsdtAvailableAfterReservations: this.round(
          this.sum(exchanges
            .filter((exchange) => exchange.balanceUsableForDecision)
            .map(
              (exchange) =>
                exchange.totals.directUsdtAvailableAfterReservations,
            )),
        ),
        directUsdtLocked: this.round(
          this.sum(exchanges
            .filter((exchange) => exchange.balanceUsableForDecision)
            .map((exchange) => exchange.totals.directUsdtLocked)),
        ),
        directUsdtTotal: this.round(
          this.sum(exchanges
            .filter((exchange) => exchange.balanceUsableForDecision)
            .map((exchange) => exchange.totals.directUsdtTotal)),
        ),
      },
      accountingCapital: {
        mode: account.mode,
        unit: "ACCOUNTING_UNIT" as const,
        initial: this.round(account.initialCapital),
        current: this.round(account.currentCapital),
        available: this.round(account.availableCapital),
        reserved: this.round(Math.max(
          0,
          account.currentCapital - account.availableCapital,
        )),
        includedInWalletValuation: false as const,
      },
      reservations: {
        scope: "GLOBAL_AND_EXCHANGE_ASSET" as const,
        accountingUnit: "ACCOUNTING_UNIT" as const,
        activeReservations: reservations.activeReservations,
        activeReservedCapital: this.round(
          reservations.activeReservedCapital,
        ),
        activeInventoryReservations:
          reservations.activeInventoryReservations,
        unscopedActiveReservations:
          reservations.unscopedActiveReservations,
        activeInventoryHolds:
          structuredClone(reservations.activeInventoryHolds),
        perExchangeAssetReservationSupported: true as const,
        appliedToWalletInventory: true as const,
      },
      transfers: {
        state: "NO_TRANSFER_LEDGER" as const,
        pendingTransferCapitalUsdt: null,
        inTransitCapitalUsdt: null,
        includedInAvailableCapital: false as const,
      },
      blockers,
      limitations: [
        "Pending and in-transit capital remain unknown until a persistent transfer ledger exists.",
      ],
      safety: {
        readOnly: true as const,
        balanceMutationAllowed: false as const,
        paperAccountingMutationAllowed: false as const,
        liveOrderSubmissionAllowed: false as const,
        internalTransferSubmissionAllowed: false as const,
        externalTransferSubmissionAllowed: false as const,
        withdrawalSubmissionAllowed: false as const,
        missingValuationsTreatedAsZero: false as const,
        nativeAssetUnitsSummedAcrossAssets: false as const,
        accountingCapitalMixedWithWalletValuation: false as const,
      },
    });
  }

  private buildExchange(
    exchange: ExchangeBalanceDashboardReport["exchanges"][number],
    portfolio: PortfolioSnapshot["exchanges"][number] | null,
    maximumFreshAgeMs: number,
    reservedInventoryByKey: ReadonlyMap<string, number>,
  ): NormalizedExchangeInventorySnapshot {
    const portfolioByAsset = new Map(
      (portfolio?.assets ?? []).map((asset) => [
        asset.asset.trim().toUpperCase(),
        asset,
      ]),
    );
    const balanceUsableForDecision =
      exchange.status === "SYNCHRONIZED";
    const assets = exchange.assets.map((asset) =>
      this.buildAsset(
        exchange.exchange,
        asset,
        portfolioByAsset.get(asset.asset.trim().toUpperCase()) ?? null,
        exchange.lastSynchronizedAt,
        exchange.balanceAgeMs,
        balanceUsableForDecision,
        maximumFreshAgeMs,
        reservedInventoryByKey.get(
          this.createInventoryKey(
            exchange.exchange,
            asset.asset,
          ),
        ) ?? 0,
      ),
    );
    const currentValuations = assets.filter(
      (asset) => asset.valuation.state === "CURRENT",
    ).length;
    const staleValuations = assets.filter(
      (asset) => asset.valuation.state === "STALE",
    ).length;
    const unavailableValuations = assets.filter(
      (asset) => asset.valuation.state === "UNAVAILABLE",
    ).length;
    const exchangeAuthoritative =
      balanceUsableForDecision &&
      staleValuations === 0 &&
      unavailableValuations === 0;
    const knownAvailableValueUsdt = this.sumNullable(
      assets.map((asset) => asset.valuation.availableValueUsdt),
    );
    const knownAvailableAfterReservationsValueUsdt = this.sumNullable(
      assets.map(
        (asset) =>
          asset.valuation.availableAfterReservationsValueUsdt,
      ),
    );
    const knownLockedValueUsdt = this.sumNullable(
      assets.map((asset) => asset.valuation.lockedValueUsdt),
    );
    const knownTotalValueUsdt = this.sumNullable(
      assets.map((asset) => asset.valuation.totalValueUsdt),
    );
    const usdt = assets.find((asset) => asset.asset === "USDT") ?? null;

    return {
      exchange: exchange.exchange,
      displayName: exchange.displayName,
      balanceStatus: exchange.status,
      lastSynchronizedAt: exchange.lastSynchronizedAt,
      balanceAgeMs: exchange.balanceAgeMs,
      balanceUsableForDecision,
      assets,
      totals: {
        positiveAssets: assets.length,
        currentValuations,
        staleValuations,
        unavailableValuations,
        knownAvailableValueUsdt: this.round(knownAvailableValueUsdt),
        knownAvailableAfterReservationsValueUsdt: this.round(
          knownAvailableAfterReservationsValueUsdt,
        ),
        knownLockedValueUsdt: this.round(knownLockedValueUsdt),
        knownTotalValueUsdt: this.round(knownTotalValueUsdt),
        decisionUsableValueUsdt: this.round(this.sumNullable(
          assets
            .filter((asset) => asset.valuation.usableForDecision)
            .map((asset) => asset.valuation.totalValueUsdt),
        )),
        authoritativeAvailableValueUsdt: exchangeAuthoritative
          ? this.round(knownAvailableValueUsdt)
          : null,
        authoritativeAvailableAfterReservationsValueUsdt:
          exchangeAuthoritative
            ? this.round(knownAvailableAfterReservationsValueUsdt)
            : null,
        authoritativeLockedValueUsdt: exchangeAuthoritative
          ? this.round(knownLockedValueUsdt)
          : null,
        authoritativeTotalValueUsdt: exchangeAuthoritative
          ? this.round(knownTotalValueUsdt)
          : null,
        directUsdtAvailable: this.round(usdt?.availableBalance ?? 0),
        directUsdtAvailableAfterReservations: this.round(
          usdt?.availableAfterReservations ?? 0,
        ),
        directUsdtLocked: this.round(usdt?.lockedBalance ?? 0),
        directUsdtTotal: this.round(usdt?.totalBalance ?? 0),
      },
    };
  }

  private buildAsset(
    exchange: string,
    balance: ExchangeBalanceDashboardReport["exchanges"][number]["assets"][number],
    position: PortfolioAssetPosition | null,
    synchronizedAt: number | null,
    balanceAgeMs: number | null,
    balanceUsableForDecision: boolean,
    maximumFreshAgeMs: number,
    reservedBalance: number,
  ): NormalizedInventoryAsset {
    const valuationState = this.resolveValuationState(
      position,
      maximumFreshAgeMs,
    );
    const valuationUsable =
      balanceUsableForDecision &&
      valuationState === "CURRENT";
    const normalizedReservedBalance =
      Number.isFinite(reservedBalance) && reservedBalance > 0
        ? reservedBalance
        : 0;
    const availableAfterReservations =
      Math.max(
        0,
        balance.availableBalance - normalizedReservedBalance,
      );
    const availableAfterReservationsValueUsdt =
      valuationState === "UNAVAILABLE" || position?.priceUsdt === null ||
      position?.priceUsdt === undefined
        ? null
        : availableAfterReservations * position.priceUsdt;

    return {
      exchange,
      asset: balance.asset.trim().toUpperCase(),
      availableBalance: balance.availableBalance,
      reservedBalance: normalizedReservedBalance,
      availableAfterReservations,
      lockedBalance: balance.lockedBalance,
      totalBalance: balance.totalBalance,
      synchronizedAt,
      balanceAgeMs,
      balanceUsableForDecision,
      valuation: {
        state: valuationState,
        source: position?.valuationSource ?? "UNAVAILABLE",
        market: position?.valuationMarket ?? null,
        priceUsdt: position?.priceUsdt ?? null,
        timestamp: position?.valuationTimestamp ?? null,
        ageMs: position?.valuationAgeMs ?? null,
        availableValueUsdt: position?.availableValueUsdt ?? null,
        availableAfterReservationsValueUsdt,
        lockedValueUsdt: position?.lockedValueUsdt ?? null,
        totalValueUsdt: position?.totalValueUsdt ?? null,
        usableForDecision: valuationUsable,
      },
    };
  }

  private resolveValuationState(
    position: PortfolioAssetPosition | null,
    maximumFreshAgeMs: number,
  ): NormalizedInventoryValuationState {
    if (
      position === null ||
      position.priceUsdt === null ||
      position.availableValueUsdt === null ||
      position.lockedValueUsdt === null ||
      position.totalValueUsdt === null
    ) {
      return "UNAVAILABLE";
    }

    if (
      position.valuationAgeMs !== null &&
      position.valuationAgeMs > maximumFreshAgeMs
    ) {
      return "STALE";
    }

    return "CURRENT";
  }

  private buildBlockers(
    exchanges: readonly NormalizedExchangeInventorySnapshot[],
    reservations: CapitalReservationDiagnostics,
  ): string[] {
    const blockers: string[] = [];

    for (const exchange of exchanges) {
      if (!exchange.balanceUsableForDecision) {
        blockers.push(
          `${exchange.displayName} balance status is ${exchange.balanceStatus}.`,
        );
      }
      if (exchange.totals.staleValuations > 0) {
        blockers.push(
          `${exchange.displayName} has ${exchange.totals.staleValuations} stale asset valuation(s).`,
        );
      }
      if (exchange.totals.unavailableValuations > 0) {
        blockers.push(
          `${exchange.displayName} has ${exchange.totals.unavailableValuations} unvalued positive asset(s).`,
        );
      }
    }

    if (reservations.unscopedActiveReservations > 0) {
      blockers.push(
        `${reservations.unscopedActiveReservations} active accounting reservation(s) have no exchange-asset scope and cannot be subtracted from wallet availability.`,
      );
    }

    return blockers;
  }

  private sum(values: readonly number[]): number {
    return values.reduce((total, value) => total + value, 0);
  }

  private sumNullable(values: readonly (number | null)[]): number {
    return values.reduce<number>(
      (total, value) => total + (value ?? 0),
      0,
    );
  }

  private round(value: number): number {
    return Number.isFinite(value)
      ? Math.round((value + Number.EPSILON) * 100_000_000) / 100_000_000
      : 0;
  }

  private createInventoryKey(
    exchange: string,
    asset: string,
  ): string {
    return `${exchange.trim().toLowerCase()}\u0000${asset.trim().toUpperCase()}`;
  }

  private deepFreeze<T>(value: T): T {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const nested of Object.values(value)) {
        this.deepFreeze(nested);
      }
    }
    return value;
  }
}

export const normalizedInventorySnapshotService =
  new NormalizedInventorySnapshotService();
