import {
  defaultArbitragePolicy,
} from "../../arbitrage/config/policy";

import {
  quoteIntegrityAnalyzer,
} from "../../trading/analysis/analyzers/QuoteIntegrityAnalyzer";

import {
  orderBookService,
} from "../../orderbook/services/OrderBookService";

import type {
  OrderBook,
} from "../../orderbook/models/OrderBook";

import type {
  OpportunityCandidateBoardItem,
} from "./OpportunityCandidateBoardService";

export type CandidateVerificationCheckName =
  | "CANDIDATE_STATE"
  | "MARKET_IDENTITY"
  | "EXCHANGE_DIRECTION"
  | "ORDER_BOOKS_PRESENT"
  | "ORDER_BOOK_FRESHNESS"
  | "ORDER_BOOK_STRUCTURE"
  | "CROSS_EXCHANGE_SPREAD"
  | "EXECUTABLE_DEPTH"
  | "QUOTE_INTEGRITY";

export interface CandidateVerificationCheck {
  name:
    CandidateVerificationCheckName;

  passed:
    boolean;

  reason:
    string;
}

export interface CandidateVerificationSnapshot {
  market:
    string;

  buyExchange:
    string;

  sellExchange:
    string;

  buyBestAsk:
    number | null;

  buyBestAskQuantity:
    number | null;

  sellBestBid:
    number | null;

  sellBestBidQuantity:
    number | null;

  currentRawSpread:
    number | null;

  currentRawSpreadPercent:
    number | null;

  buyBookAgeMs:
    number | null;

  sellBookAgeMs:
    number | null;

  executableBuyDepth:
    number | null;

  executableSellDepth:
    number | null;

  verifiedExecutableQuantity:
    number | null;

  priceRatio:
    number | null;
}

export interface CandidateVerificationResult {
  candidateId:
    string;

  market:
    string;

  buyExchange:
    string;

  sellExchange:
    string;

  candidateStatus:
    OpportunityCandidateBoardItem["status"];

  candidateDecision:
    OpportunityCandidateBoardItem["decision"];

  candidateReadiness:
    OpportunityCandidateBoardItem["distance"]["readiness"];

  verified:
    boolean;

  checks:
    CandidateVerificationCheck[];

  reasons:
    string[];

  snapshot:
    CandidateVerificationSnapshot;

  verifiedAt:
    number;
}

export class OpportunityCandidateVerificationService {
  verify(
    candidate:
      OpportunityCandidateBoardItem,

    now =
      Date.now(),
  ): CandidateVerificationResult {
    const market =
      candidate.market
        .trim()
        .toUpperCase();

    const buyExchange =
      candidate.buyExchange
        .trim()
        .toLowerCase();

    const sellExchange =
      candidate.sellExchange
        .trim()
        .toLowerCase();

    const checks:
      CandidateVerificationCheck[] =
      [];

    /*
     * -------------------------------------------------
     * 1. Candidate state
     * -------------------------------------------------
     *
     * READY is now an execution-authorized state.
     *
     * The candidate must be:
     *
     * ACCEPTED
     * +
     * EXECUTE
     * +
     * READY
     *
     * REVIEW and SKIP are never allowed through
     * independent verification.
     */
    const candidateStatePassed =
      candidate.status ===
        "ACCEPTED" &&
      candidate.decision ===
        "EXECUTE" &&
      candidate.distance
        .readiness ===
        "READY";

    checks.push({
      name:
        "CANDIDATE_STATE",

      passed:
        candidateStatePassed,

      reason:
        candidateStatePassed
          ? "Candidate is ACCEPTED with EXECUTE decision and READY readiness."
          : this.resolveCandidateStateReason(
              candidate,
            ),
    });

    /*
     * -------------------------------------------------
     * 2. Market identity
     * -------------------------------------------------
     */
    const marketIdentityPassed =
      market.length >
      0;

    checks.push({
      name:
        "MARKET_IDENTITY",

      passed:
        marketIdentityPassed,

      reason:
        marketIdentityPassed
          ? `Normalized candidate market is ${market}.`
          : "Candidate market is empty or invalid.",
    });

    /*
     * -------------------------------------------------
     * 3. Exchange direction
     * -------------------------------------------------
     */
    const directionPassed =
      buyExchange.length >
        0 &&
      sellExchange.length >
        0 &&
      buyExchange !==
        sellExchange;

    checks.push({
      name:
        "EXCHANGE_DIRECTION",

      passed:
        directionPassed,

      reason:
        directionPassed
          ? `Candidate direction is ${buyExchange} -> ${sellExchange}.`
          : "Buy and sell exchanges must be valid and different.",
    });

    /*
     * -------------------------------------------------
     * 4. Fetch current independent order books
     * -------------------------------------------------
     */
    const buyBook =
      orderBookService
        .get(
          buyExchange,
          market,
        );

    const sellBook =
      orderBookService
        .get(
          sellExchange,
          market,
        );

    const booksPresent =
      buyBook !==
        null &&
      sellBook !==
        null;

    checks.push({
      name:
        "ORDER_BOOKS_PRESENT",

      passed:
        booksPresent,

      reason:
        booksPresent
          ? "Both exchange order books are available."
          : this.resolveMissingBookReason(
              buyBook,
              sellBook,
              buyExchange,
              sellExchange,
            ),
    });

    /*
     * -------------------------------------------------
     * 5. Freshness
     * -------------------------------------------------
     */
    const buyBookAgeMs =
      buyBook
        ? Math.max(
            0,
            now -
              buyBook.timestamp,
          )
        : null;

    const sellBookAgeMs =
      sellBook
        ? Math.max(
            0,
            now -
              sellBook.timestamp,
          )
        : null;

    const buyFresh =
      buyBook !==
        null &&
      orderBookService
        .isFresh(
          buyExchange,
          market,
          defaultArbitragePolicy
            .maximumQuoteAgeMs,
          now,
        );

    const sellFresh =
      sellBook !==
        null &&
      orderBookService
        .isFresh(
          sellExchange,
          market,
          defaultArbitragePolicy
            .maximumQuoteAgeMs,
          now,
        );

    const booksFresh =
      buyFresh &&
      sellFresh;

    checks.push({
      name:
        "ORDER_BOOK_FRESHNESS",

      passed:
        booksFresh,

      reason:
        booksFresh
          ? `Both order books are fresh. Oldest book age is ${Math.max(
              buyBookAgeMs ??
                0,
              sellBookAgeMs ??
                0,
            )}ms.`
          : `Order-book freshness failed. Buy age=${this.formatNullableNumber(
              buyBookAgeMs,
            )}ms, sell age=${this.formatNullableNumber(
              sellBookAgeMs,
            )}ms, maximum=${defaultArbitragePolicy.maximumQuoteAgeMs}ms.`,
    });

    /*
     * -------------------------------------------------
     * 6. Top-of-book structure
     * -------------------------------------------------
     */
    const buyBestAsk =
      buyBook
        ?.asks[
          0
        ] ??
      null;

    const sellBestBid =
      sellBook
        ?.bids[
          0
        ] ??
      null;

    const buyBookStructureValid =
      this.isOrderBookStructureValid(
        buyBook,
      );

    const sellBookStructureValid =
      this.isOrderBookStructureValid(
        sellBook,
      );

    const structurePassed =
      buyBookStructureValid &&
      sellBookStructureValid;

    checks.push({
      name:
        "ORDER_BOOK_STRUCTURE",

      passed:
        structurePassed,

      reason:
        structurePassed
          ? "Both order books contain valid, non-crossed top-of-book prices."
          : "One or both order books have invalid, empty or crossed top-of-book data.",
    });

    /*
     * -------------------------------------------------
     * 7. Recalculate cross-exchange spread
     * -------------------------------------------------
     */
    const currentRawSpread =
      buyBestAsk &&
      sellBestBid
        ? sellBestBid.price -
          buyBestAsk.price
        : null;

    const currentRawSpreadPercent =
      currentRawSpread !==
          null &&
      buyBestAsk &&
      buyBestAsk.price >
        0
        ? (
            currentRawSpread /
            buyBestAsk.price
          ) *
          100
        : null;

    const spreadPassed =
      currentRawSpreadPercent !==
        null &&
      Number.isFinite(
        currentRawSpreadPercent,
      ) &&
      currentRawSpreadPercent >=
        defaultArbitragePolicy
          .minimumSpreadPercent;

    checks.push({
      name:
        "CROSS_EXCHANGE_SPREAD",

      passed:
        spreadPassed,

      reason:
        currentRawSpreadPercent ===
        null
          ? "Unable to calculate current executable cross-exchange spread."
          : spreadPassed
            ? `Current executable spread ${currentRawSpreadPercent.toFixed(
                6,
              )}% meets minimum ${defaultArbitragePolicy.minimumSpreadPercent.toFixed(
                6,
              )}%.`
            : `Current executable spread ${currentRawSpreadPercent.toFixed(
                6,
              )}% is below minimum ${defaultArbitragePolicy.minimumSpreadPercent.toFixed(
                6,
              )}%.`,
    });

    /*
     * -------------------------------------------------
     * 8. Independently executable depth
     * -------------------------------------------------
     *
     * BUY asks remain executable while their price
     * stays strictly below the live sell best bid.
     *
     * SELL bids remain executable while their price
     * stays strictly above the live buy best ask.
     *
     * Once prices meet/cross the opposite side,
     * positive arbitrage no longer exists.
     */
    const executableBuyDepth =
      buyBook &&
      sellBestBid
        ? this.calculateExecutableBuyDepth(
            buyBook,
            sellBestBid.price,
          )
        : null;

    const executableSellDepth =
      sellBook &&
      buyBestAsk
        ? this.calculateExecutableSellDepth(
            sellBook,
            buyBestAsk.price,
          )
        : null;

    const verifiedExecutableQuantity =
      executableBuyDepth !==
          null &&
      executableSellDepth !==
        null
        ? Math.min(
            executableBuyDepth,
            executableSellDepth,
          )
        : null;

    /*
     * Use executableQuantity first because this is
     * the actual quantity approved by the upstream
     * execution analysis.
     *
     * Fallback to requiredQuantity only if necessary.
     */
    const requiredExecutableQuantity =
      candidate.executableQuantity ??
      candidate.requiredQuantity;

    const depthPassed =
      requiredExecutableQuantity !==
        null &&
      Number.isFinite(
        requiredExecutableQuantity,
      ) &&
      requiredExecutableQuantity >
        0 &&
      verifiedExecutableQuantity !==
        null &&
      Number.isFinite(
        verifiedExecutableQuantity,
      ) &&
      verifiedExecutableQuantity >=
        requiredExecutableQuantity;

    checks.push({
      name:
        "EXECUTABLE_DEPTH",

      passed:
        depthPassed,

      reason:
        requiredExecutableQuantity ===
        null
          ? "Candidate does not contain a valid target execution quantity."
          : verifiedExecutableQuantity ===
              null
            ? "Unable to calculate independently executable cross-exchange depth."
            : depthPassed
              ? `Verified depth ${verifiedExecutableQuantity.toFixed(
                  8,
                )} covers target quantity ${requiredExecutableQuantity.toFixed(
                  8,
                )}.`
              : `Verified depth ${verifiedExecutableQuantity.toFixed(
                  8,
                )} does not cover target quantity ${requiredExecutableQuantity.toFixed(
                  8,
                )}.`,
    });

    /*
     * -------------------------------------------------
     * 9. Quote integrity
     * -------------------------------------------------
     */
    const quoteIntegrity =
      buyBestAsk &&
      sellBestBid
        ? quoteIntegrityAnalyzer
            .analyze({
              buyPrice:
                buyBestAsk.price,

              sellPrice:
                sellBestBid.price,

              maximumPriceRatio:
                defaultArbitragePolicy
                  .maximumCrossExchangePriceRatio,
            })
        : null;

    const quoteIntegrityPassed =
      quoteIntegrity
        ?.acceptable ??
      false;

    checks.push({
      name:
        "QUOTE_INTEGRITY",

      passed:
        quoteIntegrityPassed,

      reason:
        quoteIntegrity
          ?.reason ??
        "Quote integrity could not be evaluated because executable prices are unavailable.",
    });

    /*
     * -------------------------------------------------
     * 10. Final verification verdict
     * -------------------------------------------------
     *
     * Fail closed.
     *
     * Every check must pass.
     */
    const reasons =
      checks
        .filter(
          (
            check,
          ) =>
            !check.passed,
        )
        .map(
          (
            check,
          ) =>
            `${check.name}: ${check.reason}`,
        );

    const verified =
      checks.every(
        (
          check,
        ) =>
          check.passed,
      );

    return {
      candidateId:
        candidate.id,

      market,

      buyExchange,

      sellExchange,

      candidateStatus:
        candidate.status,

      candidateDecision:
        candidate.decision,

      candidateReadiness:
        candidate
          .distance
          .readiness,

      verified,

      checks:
        structuredClone(
          checks,
        ),

      reasons,

      snapshot: {
        market,

        buyExchange,

        sellExchange,

        buyBestAsk:
          buyBestAsk
            ?.price ??
          null,

        buyBestAskQuantity:
          buyBestAsk
            ?.quantity ??
          null,

        sellBestBid:
          sellBestBid
            ?.price ??
          null,

        sellBestBidQuantity:
          sellBestBid
            ?.quantity ??
          null,

        currentRawSpread,

        currentRawSpreadPercent,

        buyBookAgeMs,

        sellBookAgeMs,

        executableBuyDepth,

        executableSellDepth,

        verifiedExecutableQuantity,

        priceRatio:
          quoteIntegrity
            ?.priceRatio ??
          null,
      },

      verifiedAt:
        now,
    };
  }

  private resolveCandidateStateReason(
    candidate:
      OpportunityCandidateBoardItem,
  ): string {
    if (
      candidate.status !==
      "ACCEPTED"
    ) {
      return (
        `Candidate status is ${candidate.status}; ACCEPTED is required for verification.`
      );
    }

    if (
      candidate.decision !==
      "EXECUTE"
    ) {
      return (
        `Candidate decision is ${candidate.decision}; EXECUTE is required for verification.`
      );
    }

    if (
      candidate.distance
        .readiness !==
      "READY"
    ) {
      return (
        `Candidate readiness is ${candidate.distance.readiness}; READY is required for verification.`
      );
    }

    return (
      "Candidate state is not eligible for execution verification."
    );
  }

  private isOrderBookStructureValid(
    book:
      OrderBook | null,
  ): boolean {
    if (
      !book
    ) {
      return false;
    }

    const bestBid =
      book.bids[
        0
      ];

    const bestAsk =
      book.asks[
        0
      ];

    if (
      !bestBid ||
      !bestAsk
    ) {
      return false;
    }

    return (
      Number.isFinite(
        bestBid.price,
      ) &&
      Number.isFinite(
        bestBid.quantity,
      ) &&
      Number.isFinite(
        bestAsk.price,
      ) &&
      Number.isFinite(
        bestAsk.quantity,
      ) &&
      bestBid.price >
        0 &&
      bestBid.quantity >
        0 &&
      bestAsk.price >
        0 &&
      bestAsk.quantity >
        0 &&
      bestAsk.price >=
        bestBid.price
    );
  }

  private calculateExecutableBuyDepth(
    book:
      OrderBook,

    maximumBuyPrice:
      number,
  ): number {
    if (
      !Number.isFinite(
        maximumBuyPrice,
      ) ||
      maximumBuyPrice <=
        0
    ) {
      return 0;
    }

    let quantity =
      0;

    for (
      const level
      of book.asks
    ) {
      if (
        !Number.isFinite(
          level.price,
        ) ||
        !Number.isFinite(
          level.quantity,
        ) ||
        level.price <=
          0 ||
        level.quantity <=
          0
      ) {
        continue;
      }

      /*
       * Equal prices provide zero raw spread,
       * therefore they are not executable
       * arbitrage depth.
       */
      if (
        level.price >=
        maximumBuyPrice
      ) {
        break;
      }

      quantity +=
        level.quantity;
    }

    return quantity;
  }

  private calculateExecutableSellDepth(
    book:
      OrderBook,

    minimumSellPrice:
      number,
  ): number {
    if (
      !Number.isFinite(
        minimumSellPrice,
      ) ||
      minimumSellPrice <=
        0
    ) {
      return 0;
    }

    let quantity =
      0;

    for (
      const level
      of book.bids
    ) {
      if (
        !Number.isFinite(
          level.price,
        ) ||
        !Number.isFinite(
          level.quantity,
        ) ||
        level.price <=
          0 ||
        level.quantity <=
          0
      ) {
        continue;
      }

      if (
        level.price <=
        minimumSellPrice
      ) {
        break;
      }

      quantity +=
        level.quantity;
    }

    return quantity;
  }

  private resolveMissingBookReason(
    buyBook:
      OrderBook | null,

    sellBook:
      OrderBook | null,

    buyExchange:
      string,

    sellExchange:
      string,
  ): string {
    if (
      !buyBook &&
      !sellBook
    ) {
      return (
        `Order books are missing for both ${buyExchange} and ${sellExchange}.`
      );
    }

    if (
      !buyBook
    ) {
      return (
        `Buy-side order book is missing for ${buyExchange}.`
      );
    }

    return (
      `Sell-side order book is missing for ${sellExchange}.`
    );
  }

  private formatNullableNumber(
    value:
      number | null,
  ): string {
    if (
      value ===
        null ||
      !Number.isFinite(
        value,
      )
    ) {
      return "unknown";
    }

    return value.toFixed(
      0,
    );
  }
}

export const opportunityCandidateVerificationService =
  new OpportunityCandidateVerificationService();