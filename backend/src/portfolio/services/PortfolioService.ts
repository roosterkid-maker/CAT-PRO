import {
  tradingAccountService,
  type ExchangeBalanceSnapshot,
} from "../../trading/account/TradingAccountService";

import {
  toPaperAccountingDateKey,
  type TradingAccount,
} from "../../trading/account/TradingAccount";

import {
  evaluateExecutedPriceCredibility,
} from "../../trading/analysis/CrossVenuePriceCredibilityService";

import {
  CROSS_EXCHANGE_ARBITRAGE_STRATEGY_ID,
} from "../../strategies/models/StrategyMetadata";

import type {
  PaperTrade,
  PaperTradeStatus,
} from "../../trading/models/PaperTrade";

import {
  paperTradingService,
} from "../../trading/services/PaperTradingService";

import type {
  ExchangePortfolioSnapshot,
  PortfolioAssetPosition,
  PortfolioSnapshot,
} from "../models/PortfolioSnapshot";

import type {
  PortfolioSummary,
} from "../models/PortfolioSummary";

import {
  portfolioValuationService,
} from "./PortfolioValuationService";

const OPEN_TRADE_STATUSES =
  new Set<PaperTradeStatus>([
    "detected",
    "validated",
    "open",
    "monitoring",
  ]);

function isFiniteNumber(
  value: number | null,
): value is number {
  return (
    value !== null &&
    Number.isFinite(
      value,
    )
  );
}

function round(
  value: number,
  decimalPlaces = 2,
): number {
  if (
    !Number.isFinite(
      value,
    )
  ) {
    return 0;
  }

  const multiplier =
    10 **
    decimalPlaces;

  return (
    Math.round(
      (
        value +
        Number.EPSILON
      ) *
        multiplier,
    ) /
    multiplier
  );
}

type CompletedPaperTrade =
  PaperTrade & {
    actualProfit: number;
  };

function isDistortedStrategyOneFill(
  trade:
    CompletedPaperTrade,
): boolean {
  if (
    trade.strategyAttribution
      ?.attributionStatus !==
      "ATTRIBUTED" ||
    trade.strategyAttribution
      .strategyId !==
      CROSS_EXCHANGE_ARBITRAGE_STRATEGY_ID
  ) {
    return false;
  }

  return !evaluateExecutedPriceCredibility(
    trade.buyPrice,
    trade.actualSellPrice ??
      trade.sellPrice,
  ).credible;
}

export class PortfolioService {
  /*
   * Version 13.1
   *
   * Capital-aware portfolio snapshot.
   *
   * Sources:
   *
   * TradingAccountService
   *      ↓
   * synchronized exchange balances
   *
   * MarketCache
   *      ↓
   * USDT valuation
   *
   * PortfolioService
   *      ↓
   * equity / liquidity / tradable capital
   */
  getSnapshot(
    now =
      Date.now(),
  ): PortfolioSnapshot {
    const account =
      tradingAccountService
        .getAccount();

    const balances =
      tradingAccountService
        .getExchangeBalances();

    const exchangeNames =
      Array.from(
        new Set(
          balances.map(
            (balance) =>
              balance.exchange,
          ),
        ),
      ).sort();

    const exchanges =
      exchangeNames.map(
        (exchange) =>
          this.buildExchangeSnapshot(
            exchange,

            balances.filter(
              (balance) =>
                balance.exchange ===
                exchange,
            ),

            now,
          ),
      );

    const totalEquityUsdt =
      exchanges.reduce(
        (
          total,
          exchange,
        ) =>
          total +
          exchange
            .totalEquityUsdt,
        0,
      );

    const availableEquityUsdt =
      exchanges.reduce(
        (
          total,
          exchange,
        ) =>
          total +
          exchange
            .availableEquityUsdt,
        0,
      );

    const lockedEquityUsdt =
      exchanges.reduce(
        (
          total,
          exchange,
        ) =>
          total +
          exchange
            .lockedEquityUsdt,
        0,
      );

    /*
     * directUsdtAvailable is deliberately
     * different from availableEquityUsdt.
     *
     * BTC worth $10,000 is portfolio equity,
     * but it is NOT immediately spendable USDT
     * for a USDT buy leg until converted.
     */
    const liquidUsdt =
      exchanges.reduce(
        (
          total,
          exchange,
        ) =>
          total +
          exchange
            .directUsdtAvailable,
        0,
      );

    const assets =
      exchanges.reduce(
        (
          total,
          exchange,
        ) =>
          total +
          exchange
            .assetCount,
        0,
      );

    const valuedAssets =
      exchanges.reduce(
        (
          total,
          exchange,
        ) =>
          total +
          exchange
            .valuedAssetCount,
        0,
      );

    const unvaluedAssets =
      exchanges.reduce(
        (
          total,
          exchange,
        ) =>
          total +
          exchange
            .unvaluedAssetCount,
        0,
      );

    const accountReservedCapital =
      Math.max(
        0,

        account.currentCapital -
          account.availableCapital,
      );

    /*
     * PAPER mode:
     *
     * Uses the internal account ledger.
     *
     * TESTNET / LIVE:
     *
     * Never claim more tradable capital than
     * both:
     *
     * 1. internal risk/capital ledger allows
     * 2. synchronized exchanges physically hold
     */
    const tradableCapitalUsdt =
      account.mode ===
      "PAPER"
        ? account
            .availableCapital
        : Math.min(
            account
              .availableCapital,

            liquidUsdt,
          );

    return {
      baseCurrency:
        "USDT",

      generatedAt:
        now,

      capital: {
        mode:
          account.mode,

        accountInitialCapital:
          round(
            account
              .initialCapital,
          ),

        accountCurrentCapital:
          round(
            account
              .currentCapital,
          ),

        accountAvailableCapital:
          round(
            account
              .availableCapital,
          ),

        accountReservedCapital:
          round(
            accountReservedCapital,
          ),

        synchronizedExchangeEquityUsdt:
          round(
            totalEquityUsdt,
          ),

        synchronizedExchangeAvailableEquityUsdt:
          round(
            availableEquityUsdt,
          ),

        synchronizedExchangeLockedEquityUsdt:
          round(
            lockedEquityUsdt,
          ),

        liquidUsdt:
          round(
            liquidUsdt,
          ),

        tradableCapitalUsdt:
          round(
            tradableCapitalUsdt,
          ),
      },

      exchanges,

      totals: {
        exchanges:
          exchanges.length,

        assets,

        valuedAssets,

        unvaluedAssets,

        totalEquityUsdt:
          round(
            totalEquityUsdt,
          ),

        availableEquityUsdt:
          round(
            availableEquityUsdt,
          ),

        lockedEquityUsdt:
          round(
            lockedEquityUsdt,
          ),

        liquidUsdt:
          round(
            liquidUsdt,
          ),
      },
    };
  }

  /*
   * Existing paper-trading performance
   * summary is preserved.
   */
  getSummary(
    trades =
      paperTradingService
        .getTrades(),

    account:
      TradingAccount =
      tradingAccountService
        .getAccount(),

    now =
      Date.now(),
  ):
    PortfolioSummary {
    const openTrades =
      trades.filter(
        (trade) =>
          OPEN_TRADE_STATUSES
            .has(
              trade.status,
            ),
      );

    const completedTrades =
      trades.filter(
        (
          trade,
        ): trade is PaperTrade & {
          actualProfit:
            number;
        } =>
          isFiniteNumber(
            trade.actualProfit,
          ),
      );

    /*
     * Preserve the append-only ledger and stored PAPER evidence, but do not
     * let previously accepted cross-venue price distortions inflate the
     * operator-facing performance view. Other strategies are deliberately
     * left untouched because the Strategy #1 price-ratio rule is not a valid
     * universal credibility rule.
     */
    const excludedDistortedTrades =
      completedTrades.filter(
        isDistortedStrategyOneFill,
      );

    const excludedTradeIds =
      new Set(
        excludedDistortedTrades
          .map(
            (trade) =>
              trade.id,
          ),
      );

    const credibleCompletedTrades =
      completedTrades.filter(
        (trade) =>
          !excludedTradeIds.has(
            trade.id,
          ),
      );

    const winningTrades =
      credibleCompletedTrades
        .filter(
          (trade) =>
            trade.actualProfit >
            0,
        );

    const losingTrades =
      credibleCompletedTrades
        .filter(
          (trade) =>
            trade.actualProfit <
            0,
        );

    const grossProfit =
      winningTrades
        .reduce(
          (
            total,
            trade,
          ) =>
            total +
            trade.actualProfit,
          0,
        );

    const grossLoss =
      losingTrades
        .reduce(
          (
            total,
            trade,
          ) =>
            total +
            Math.abs(
              trade.actualProfit,
            ),
          0,
        );

    const totalRealizedProfit =
      credibleCompletedTrades
        .reduce(
          (
            total,
            trade,
          ) =>
            total +
            trade.actualProfit,
          0,
        );

    const excludedDistortedPnl =
      excludedDistortedTrades
        .reduce(
          (
            total,
            trade,
          ) =>
            total +
            trade.actualProfit,
          0,
        );

    const accountingDateKey =
      toPaperAccountingDateKey(
        now,
      );

    const excludedToday =
      excludedDistortedTrades
        .filter(
          (trade) =>
            toPaperAccountingDateKey(
              trade.closedAt ??
                trade.openedAt,
            ) ===
            accountingDateKey,
        );

    const excludedTodayProfit =
      excludedToday.reduce(
        (
          total,
          trade,
        ) =>
          total +
          Math.max(
            0,
            trade.actualProfit,
          ),
        0,
      );

    const excludedTodayLoss =
      excludedToday.reduce(
        (
          total,
          trade,
        ) =>
          total +
          Math.abs(
            Math.min(
              0,
              trade.actualProfit,
            ),
          ),
        0,
      );

    const currentCapital =
      Math.max(
        0,
        account.currentCapital -
          excludedDistortedPnl,
      );

    const reservedCapital =
      Math.max(
        0,
        account.currentCapital -
          account.availableCapital,
      );

    const availableCapital =
      Math.max(
        0,
        currentCapital -
          reservedCapital,
      );

    const allocatedCapital =
      Math.max(
        0,

        currentCapital -
          availableCapital,
      );

    const todayProfit =
      Math.max(
        0,
        account.todayProfit -
          excludedTodayProfit,
      );

    const todayLoss =
      Math.max(
        0,
        account.todayLoss -
          excludedTodayLoss,
      );

    const todayNetProfit =
      todayProfit -
      todayLoss;

    const winRatePercent =
      credibleCompletedTrades.length >
      0
        ? (
            winningTrades.length /
            credibleCompletedTrades.length
          ) *
          100
        : 0;

    const roiPercent =
      account.initialCapital >
      0
        ? (
            (
              account.currentCapital -
              excludedDistortedPnl -
              account.initialCapital
            ) /
            account.initialCapital
          ) *
          100
        : 0;

    /*
     * Infinity is avoided because it is not
     * represented safely by JSON.
     */
    const profitFactor =
      grossLoss >
      0
        ? grossProfit /
          grossLoss
        : 0;

    const bestTradeProfit =
      credibleCompletedTrades.length >
      0
        ? Math.max(
            ...credibleCompletedTrades
              .map(
                (trade) =>
                  trade.actualProfit,
              ),
          )
        : 0;

    const worstTradeProfit =
      credibleCompletedTrades.length >
      0
        ? Math.min(
            ...credibleCompletedTrades
              .map(
                (trade) =>
                  trade.actualProfit,
              ),
          )
        : 0;

    return {
      accountId:
        account.id,

      accountName:
        account.name,

      mode:
        account.mode,

      initialCapital:
        round(
          account.initialCapital,
        ),

      currentCapital:
        round(
          currentCapital,
        ),

      availableCapital:
        round(
          availableCapital,
        ),

      allocatedCapital:
        round(
          allocatedCapital,
        ),

      todayProfit:
        round(
          todayProfit,
        ),

      todayLoss:
        round(
          todayLoss,
        ),

      todayNetProfit:
        round(
          todayNetProfit,
        ),

      totalRealizedProfit:
        round(
          totalRealizedProfit,
        ),

      totalTrades:
        trades.length,

      openTrades:
        openTrades.length,

      closedTrades:
        credibleCompletedTrades.length,

      winningTrades:
        winningTrades.length,

      losingTrades:
        losingTrades.length,

      winRatePercent:
        round(
          winRatePercent,
        ),

      roiPercent:
        round(
          roiPercent,
        ),

      profitFactor:
        round(
          profitFactor,
        ),

      bestTradeProfit:
        round(
          bestTradeProfit,
        ),

      worstTradeProfit:
        round(
          worstTradeProfit,
        ),

      accountingBasis:
        "CREDIBILITY_ADJUSTED",

      storedClosedTrades:
        completedTrades.length,

      excludedDistortedTrades:
        excludedDistortedTrades.length,

      excludedDistortedPnl:
        round(
          excludedDistortedPnl,
        ),

      ledgerCurrentCapital:
        round(
          account.currentCapital,
        ),

      ledgerAvailableCapital:
        round(
          account.availableCapital,
        ),

      generatedAt:
        now,
    };
  }

  private buildExchangeSnapshot(
    exchange:
      string,

    balances:
      ExchangeBalanceSnapshot[],

    now:
      number,
  ): ExchangePortfolioSnapshot {
    /*
     * Zero balances are excluded from the
     * user-facing portfolio snapshot.
     */
    const assets =
      balances
        .filter(
          (balance) =>
            balance.totalBalance >
            0,
        )
        .map(
          (balance) =>
            this.buildAssetPosition(
              balance,
              now,
            ),
        )
        .sort(
          (
            first,
            second,
          ) => {
            const firstValue =
              first.totalValueUsdt ??
              -1;

            const secondValue =
              second.totalValueUsdt ??
              -1;

            if (
              firstValue !==
              secondValue
            ) {
              return (
                secondValue -
                firstValue
              );
            }

            return first.asset
              .localeCompare(
                second.asset,
              );
          },
        );

    const valuedAssets =
      assets.filter(
        (asset) =>
          asset.totalValueUsdt !==
          null,
      );

    const balanceAges =
      assets.map(
        (asset) =>
          asset.balanceAgeMs,
      );

    const synchronizationTimes =
      assets.map(
        (asset) =>
          asset.synchronizedAt,
      );

    const usdt =
      assets.find(
        (asset) =>
          asset.asset ===
          "USDT",
      );

    return {
      exchange,

      assets,

      assetCount:
        assets.length,

      valuedAssetCount:
        valuedAssets.length,

      unvaluedAssetCount:
        assets.length -
        valuedAssets.length,

      totalEquityUsdt:
        round(
          valuedAssets.reduce(
            (
              total,
              asset,
            ) =>
              total +
              (
                asset.totalValueUsdt ??
                0
              ),
            0,
          ),
        ),

      availableEquityUsdt:
        round(
          valuedAssets.reduce(
            (
              total,
              asset,
            ) =>
              total +
              (
                asset.availableValueUsdt ??
                0
              ),
            0,
          ),
        ),

      lockedEquityUsdt:
        round(
          valuedAssets.reduce(
            (
              total,
              asset,
            ) =>
              total +
              (
                asset.lockedValueUsdt ??
                0
              ),
            0,
          ),
        ),

      directUsdtAvailable:
        round(
          usdt
            ?.availableBalance ??
            0,
        ),

      directUsdtLocked:
        round(
          usdt
            ?.lockedBalance ??
            0,
        ),

      directUsdtTotal:
        round(
          usdt
            ?.totalBalance ??
            0,
        ),

      oldestBalanceAgeMs:
        balanceAges.length >
        0
          ? Math.max(
              ...balanceAges,
            )
          : null,

      newestBalanceAgeMs:
        balanceAges.length >
        0
          ? Math.min(
              ...balanceAges,
            )
          : null,

      lastSynchronizedAt:
        synchronizationTimes
          .length >
        0
          ? Math.max(
              ...synchronizationTimes,
            )
          : null,
    };
  }

  private buildAssetPosition(
    balance:
      ExchangeBalanceSnapshot,

    now:
      number,
  ): PortfolioAssetPosition {
    const valuation =
      portfolioValuationService
        .valueAsset(
          balance.exchange,
          balance.asset,
          now,
        );

    const priceUsdt =
      valuation.priceUsdt;

    return {
      exchange:
        balance.exchange,

      asset:
        balance.asset,

      availableBalance:
        balance.availableBalance,

      lockedBalance:
        balance.lockedBalance,

      totalBalance:
        balance.totalBalance,

      priceUsdt,

      availableValueUsdt:
        priceUsdt !==
        null
          ? round(
              balance.availableBalance *
                priceUsdt,
            )
          : null,

      lockedValueUsdt:
        priceUsdt !==
        null
          ? round(
              balance.lockedBalance *
                priceUsdt,
            )
          : null,

      totalValueUsdt:
        priceUsdt !==
        null
          ? round(
              balance.totalBalance *
                priceUsdt,
            )
          : null,

      valuationMarket:
        valuation.market,

      valuationSource:
        valuation.source,

      valuationTimestamp:
        valuation.timestamp,

      valuationAgeMs:
        valuation.ageMs,

      synchronizedAt:
        balance.synchronizedAt,

      balanceAgeMs:
        Math.max(
          0,

          now -
            balance.synchronizedAt,
        ),
    };
  }
}

export const portfolioService =
  new PortfolioService();
