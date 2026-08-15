import {
  marketCache,
} from "../../services/cache.service";

import type {
  PaperTrade,
} from "../../trading/models/PaperTrade";

import {
  paperTradingService,
} from "../../trading/services/PaperTradingService";

import type {
  ExchangePositionExposure,
  PortfolioPosition,
  PositionMarkSource,
  PositionSnapshot,
} from "../models/PositionSnapshot";

const OPEN_STATUSES =
  new Set([
    "detected",
    "validated",
    "open",
    "monitoring",
    "target-hit",
  ] as const);

export class PositionService {
  getSnapshot(
    now = Date.now(),
  ): PositionSnapshot {
    const trades =
      paperTradingService
        .getTrades();

    const positions =
      trades.map(
        (trade) =>
          this.buildPosition(
            trade,
            now,
          ),
      );

    const open =
      positions
        .filter(
          (position) =>
            this.isOpenStatus(
              position.status,
            ),
        )
        .sort(
          (first, second) =>
            second.openedAt -
            first.openedAt,
        );

    const closed =
      positions
        .filter(
          (position) =>
            !this.isOpenStatus(
              position.status,
            ),
        )
        .sort(
          (first, second) =>
            (second.closedAt ??
              second.openedAt) -
            (first.closedAt ??
              first.openedAt),
        );

    const unrealizedProfit =
      open.reduce(
        (
          total,
          position,
        ) =>
          total +
          (
            position.unrealizedProfit ??
            0
          ),
        0,
      );

    const realizedProfit =
      closed.reduce(
        (
          total,
          position,
        ) =>
          total +
          (
            position.realizedProfit ??
            0
          ),
        0,
      );

    return {
      generatedAt:
        now,

      summary: {
        totalPositions:
          positions.length,

        openPositions:
          open.length,

        closedPositions:
          closed.length,

        openCapital:
          this.round(
            open.reduce(
              (
                total,
                position,
              ) =>
                total +
                position.capital,
              0,
            ),
          ),

        unrealizedProfit:
          this.round(
            unrealizedProfit,
          ),

        realizedProfit:
          this.round(
            realizedProfit,
          ),

        profitableOpenPositions:
          open.filter(
            (position) =>
              position.unrealizedProfit !==
                null &&
              position.unrealizedProfit >
                0,
          ).length,

        losingOpenPositions:
          open.filter(
            (position) =>
              position.unrealizedProfit !==
                null &&
              position.unrealizedProfit <
                0,
          ).length,

        unpricedOpenPositions:
          open.filter(
            (position) =>
              position.markPrice ===
              null,
          ).length,
      },

      exposureByExchange:
        this.buildExchangeExposure(
          open,
        ),

      open,

      closed,
    };
  }

  private buildPosition(
    trade:
      PaperTrade,

    now:
      number,
  ): PortfolioPosition {
    const open =
      this.isOpenStatus(
        trade.status,
      );

    const mark =
      open
        ? this.resolveMark(
            trade,
            now,
          )
        : {
            price:
              trade.actualSellPrice ??
              trade.currentPrice,

            source:
              "TRADE_PRICE" as const,

            timestamp:
              trade.closedAt ??
              trade.lastUpdatedAt,

            ageMs:
              Math.max(
                0,

                now -
                  (
                    trade.closedAt ??
                    trade.lastUpdatedAt
                  ),
              ),
          };

    const unrealizedProfit =
      open &&
      mark.price !==
        null
        ? (
            mark.price -
            trade.buyPrice
          ) *
            trade.quantity -
          trade.estimatedFees
        : null;

    const unrealizedProfitPercent =
      unrealizedProfit !==
        null &&
      trade.capital >
        0
        ? (
            unrealizedProfit /
            trade.capital
          ) *
          100
        : null;

    const realizedProfit =
      open
        ? null
        : trade.actualProfit;

    const realizedProfitPercent =
      open
        ? null
        : trade.actualProfitPercent;

    return {
      id:
        trade.id,

      market:
        trade.market,

      buyExchange:
        trade.buyExchange,

      sellExchange:
        trade.sellExchange,

      status:
        trade.status,

      quantity:
        trade.quantity,

      capital:
        this.round(
          trade.capital,
        ),

      entryBuyPrice:
        trade.buyPrice,

      expectedSellPrice:
        trade.sellPrice,

      markPrice:
        mark.price,

      markSource:
        mark.source,

      markTimestamp:
        mark.timestamp,

      markAgeMs:
        mark.ageMs,

      estimatedFees:
        this.round(
          trade.estimatedFees,
        ),

      unrealizedProfit:
        unrealizedProfit !==
        null
          ? this.round(
              unrealizedProfit,
            )
          : null,

      unrealizedProfitPercent:
        unrealizedProfitPercent !==
        null
          ? this.round(
              unrealizedProfitPercent,
              4,
            )
          : null,

      realizedProfit:
        realizedProfit !==
        null
          ? this.round(
              realizedProfit,
            )
          : null,

      realizedProfitPercent:
        realizedProfitPercent !==
        null
          ? this.round(
              realizedProfitPercent,
              4,
            )
          : null,

      openedAt:
        trade.openedAt,

      closedAt:
        trade.closedAt,

      ageMs:
        Math.max(
          0,

          (
            trade.closedAt ??
            now
          ) -
            trade.openedAt,
        ),
    };
  }

  private resolveMark(
    trade:
      PaperTrade,

    now:
      number,
  ): {
    price: number | null;

    source: PositionMarkSource;

    timestamp: number | null;

    ageMs: number | null;
  } {
    const quote =
      marketCache.get(
        trade.sellExchange,
        trade.market,
      );

    if (!quote) {
      return {
        price:
          null,

        source:
          "UNAVAILABLE",

        timestamp:
          null,

        ageMs:
          null,
      };
    }

    /*
     * Executable best bid is preferred
     * because this represents the price at
     * which the position could currently be
     * exited on the sell exchange.
     */
    const bestBid =
      quote.executable &&
      quote.bestBidPrice !==
        null &&
      Number.isFinite(
        quote.bestBidPrice,
      ) &&
      quote.bestBidPrice >
        0
        ? quote.bestBidPrice
        : null;

    if (
      bestBid !==
      null
    ) {
      return {
        price:
          bestBid,

        source:
          "BEST_BID",

        timestamp:
          quote.timestamp,

        ageMs:
          Math.max(
            0,

            now -
              quote.timestamp,
          ),
      };
    }

    /*
     * lastPrice is informational fallback.
     *
     * Risk/live execution later should rely
     * only on executable order-book pricing.
     */
    const rawLastPrice =
      quote.lastPrice;

    const lastPrice =
      rawLastPrice !==
        null &&
      Number.isFinite(
        rawLastPrice,
      ) &&
      rawLastPrice >
        0
        ? rawLastPrice
        : null;

    if (
      lastPrice !==
      null
    ) {
      return {
        price:
          lastPrice,

        source:
          "LAST_PRICE",

        timestamp:
          quote.timestamp,

        ageMs:
          Math.max(
            0,

            now -
              quote.timestamp,
          ),
      };
    }

    return {
      price:
        null,

      source:
        "UNAVAILABLE",

      timestamp:
        null,

      ageMs:
        null,
    };
  }

  private buildExchangeExposure(
    open:
      readonly PortfolioPosition[],
  ): ExchangePositionExposure[] {
    const exposure =
      new Map<
        string,
        ExchangePositionExposure
      >();

    for (
      const position
      of open
    ) {
      /*
       * Buy-side exposure.
       */
      const buy =
        this.getOrCreateExposure(
          exposure,
          position.buyExchange,
        );

      buy.openPositions +=
        1;

      buy.buySideCapital +=
        position.capital;

      buy.totalReferencedCapital +=
        position.capital;

      /*
       * Sell-side exposure.
       */
      const sell =
        this.getOrCreateExposure(
          exposure,
          position.sellExchange,
        );

      if (
        position.sellExchange !==
        position.buyExchange
      ) {
        sell.openPositions +=
          1;
      }

      const sellNotional =
        position.quantity *
        position.expectedSellPrice;

      sell.sellSideNotional +=
        sellNotional;

      sell.totalReferencedCapital +=
        sellNotional;
    }

    return Array.from(
      exposure.values(),
    )
      .map(
        (item) => ({
          ...item,

          buySideCapital:
            this.round(
              item.buySideCapital,
            ),

          sellSideNotional:
            this.round(
              item.sellSideNotional,
            ),

          totalReferencedCapital:
            this.round(
              item.totalReferencedCapital,
            ),
        }),
      )
      .sort(
        (
          first,
          second,
        ) =>
          second.totalReferencedCapital -
          first.totalReferencedCapital,
      );
  }

  private getOrCreateExposure(
    exposure:
      Map<
        string,
        ExchangePositionExposure
      >,

    exchange:
      string,
  ): ExchangePositionExposure {
    const normalized =
      exchange
        .trim()
        .toLowerCase();

    const existing =
      exposure.get(
        normalized,
      );

    if (existing) {
      return existing;
    }

    const created:
      ExchangePositionExposure = {
      exchange:
        normalized,

      openPositions:
        0,

      buySideCapital:
        0,

      sellSideNotional:
        0,

      totalReferencedCapital:
        0,
    };

    exposure.set(
      normalized,
      created,
    );

    return created;
  }

  private isOpenStatus(
    status:
      PaperTrade["status"],
  ): boolean {
    return OPEN_STATUSES.has(
      status as
        | "detected"
        | "validated"
        | "open"
        | "monitoring"
        | "target-hit",
    );
  }

  private round(
    value:
      number,

    decimalPlaces =
      2,
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
}

export const positionService =
  new PositionService();