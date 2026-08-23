import { Router } from "express";

import { paperTradingService } from "../trading/services/PaperTradingService";

import type {
  PaperTradePageCursor,
} from "../trading/services/PaperTradeStore";

import type {
  PaperTrade,
} from "../trading/models/PaperTrade";

const router = Router();
const DEFAULT_HISTORY_LIMIT = 100;
const MAXIMUM_HISTORY_LIMIT = 500;

router.get("/", (request, response) => {
  const requestedLimit = request.query.limit;
  const limit = requestedLimit === undefined
    ? DEFAULT_HISTORY_LIMIT
    : typeof requestedLimit === "string"
      ? Number(requestedLimit)
      : Number.NaN;

  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > MAXIMUM_HISTORY_LIMIT
  ) {
    return response.status(400).json({
      success: false,
      message: `Paper trade history limit must be an integer between 1 and ${MAXIMUM_HISTORY_LIMIT}.`,
    });
  }

  let cursor:
    PaperTradePageCursor | null =
      null;

  try {
    cursor = decodeCursor(
      request.query.cursor,
    );
  } catch (
    error:
      unknown
  ) {
    return response.status(400).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Invalid PAPER trade cursor.",
    });
  }

  const summary = paperTradingService.getTradeSummary();
  const page = paperTradingService.getTradePage(
    limit,
    cursor,
  );
  const nextCursor = page.nextCursor
    ? encodeCursor(
        page.nextCursor,
      )
    : null;

  response.setHeader("Cache-Control", "no-store");

  return response.json({
    success: true,
    count: page.totalStoredRecords,
    returned: page.trades.length,
    limit,
    cursor: typeof request.query.cursor === "string"
      ? request.query.cursor
      : null,
    nextCursor,
    hasMore: page.hasMore,
    revision: page.revision,
    view: "OPERATOR_COMPACT",
    truncated: page.hasMore,
    summary,
    data: page.trades.map(
      toOperatorPaperTrade,
    ),
  });
});

router.get("/:id", (request, response) => {
  const trade = paperTradingService.getTrade(
    request.params.id,
  );

  if (!trade) {
    response.status(404).json({
      success: false,
      message: "Paper trade not found.",
    });

    return;
  }

  response.json({
    success: true,
    data: trade,
  });
});

router.post("/", (_request, response) => {
  response.status(410).json({
    success: false,
    message:
      "Legacy paper-trade creation is retired. Use /api/paper/execute so INR capital is converted through the authoritative quote-currency evidence path.",
  });
});

export default router;

function decodeCursor(
  value:
    unknown,
): PaperTradePageCursor | null {
  if (
    value ===
      undefined
  ) {
    return null;
  }

  if (
    typeof value !==
      "string" ||
    value.length ===
      0 ||
    value.length >
      512
  ) {
    throw new Error(
      "PAPER trade cursor must be one non-empty opaque string.",
    );
  }

  let parsed:
    unknown;

  try {
    parsed = JSON.parse(
      Buffer.from(
        value,
        "base64url",
      ).toString(
        "utf8",
      ),
    );
  } catch {
    throw new Error(
      "PAPER trade cursor is malformed.",
    );
  }

  if (
    typeof parsed !==
      "object" ||
    parsed ===
      null ||
    Array.isArray(
      parsed,
    ) ||
    !Number.isSafeInteger(
      (
        parsed as {
          openedAt?: unknown;
        }
      ).openedAt,
    ) ||
    Number(
      (
        parsed as {
          openedAt: number;
        }
      ).openedAt,
    ) <=
      0 ||
    typeof (
      parsed as {
        id?: unknown;
      }
    ).id !==
      "string" ||
    (
      parsed as {
        id: string;
      }
    ).id.trim().length ===
      0
  ) {
    throw new Error(
      "PAPER trade cursor payload is invalid.",
    );
  }

  return {
    openedAt:
      (
        parsed as {
          openedAt: number;
        }
      ).openedAt,
    id:
      (
        parsed as {
          id: string;
        }
      ).id,
  };
}

function encodeCursor(
  cursor:
    PaperTradePageCursor,
): string {
  return Buffer.from(
    JSON.stringify(
      cursor,
    ),
    "utf8",
  ).toString(
    "base64url",
  );
}

function toOperatorPaperTrade(
  trade:
    PaperTrade,
) {
  return {
    capitalConversion:
      trade.capitalConversion ??
      null,
    quoteCapitalUsed:
      trade.quoteCapitalUsed ??
      null,
    quoteGrossProfit:
      trade.quoteGrossProfit ??
      null,
    quoteTotalFees:
      trade.quoteTotalFees ??
      null,
    quoteNetProfit:
      trade.quoteNetProfit ??
      null,
    id:
      trade.id,
    market:
      trade.market,
    buyExchange:
      trade.buyExchange,
    sellExchange:
      trade.sellExchange,
    capital:
      trade.capital,
    quantity:
      trade.quantity,
    buyPrice:
      trade.buyPrice,
    sellPrice:
      trade.sellPrice,
    estimatedFees:
      trade.estimatedFees,
    expectedProfit:
      trade.expectedProfit,
    expectedProfitPercent:
      trade.expectedProfitPercent,
    status:
      trade.status,
    openedAt:
      trade.openedAt,
    closedAt:
      trade.closedAt,
    currentPrice:
      trade.currentPrice,
    currentProfit:
      trade.currentProfit,
    currentProfitPercent:
      trade.currentProfitPercent,
    highestProfit:
      trade.highestProfit,
    lowestProfit:
      trade.lowestProfit,
    lastUpdatedAt:
      trade.lastUpdatedAt,
    actualSellPrice:
      trade.actualSellPrice,
    actualProfit:
      trade.actualProfit,
    actualProfitPercent:
      trade.actualProfitPercent,
    failureReason:
      trade.failureReason,
  };
}
