import "dotenv/config";

import axios from "axios";

import { COINDCX } from "../constants";
import {
  loadMarkets,
} from "../marketLoader";
import {
  marketRegistry,
} from "../registry";
import {
  orderValidationEngine,
} from "../OrderValidationEngine";

interface CoinDCXTicker {
  market?: string;
  ask?: string | number;
  bid?: string | number;
  last_price?: string | number;
}

const TEST_MARKET = "DOGEINR";
const TEST_CAPITAL = 100;

/*
 * Current ask se 20% neeche limit price.
 * Script केवल validation करेगा; order place नहीं करेगा.
 */
const LIMIT_PRICE_FACTOR = 0.8;

async function main(): Promise<void> {
  const markets = await loadMarkets();

  marketRegistry.clear();
  marketRegistry.registerMany(markets);

  const market =
    marketRegistry.get(TEST_MARKET);

  if (!market) {
    throw new Error(
      `Market metadata not found: ${TEST_MARKET}`,
    );
  }

  const tickerResponse =
    await axios.get<CoinDCXTicker[]>(
      `${COINDCX.REST.BASE_URL}/exchange/ticker`,
      {
        timeout: 10_000,
      },
    );

  if (!Array.isArray(tickerResponse.data)) {
    throw new Error(
      "Invalid CoinDCX ticker response.",
    );
  }

  const ticker =
    tickerResponse.data.find(
      (item) =>
        item.market
          ?.trim()
          .toUpperCase() === TEST_MARKET,
    );

  if (!ticker) {
    throw new Error(
      `Ticker not found: ${TEST_MARKET}`,
    );
  }

  const currentAsk =
    Number(
      ticker.ask ??
      ticker.last_price,
    );

  if (
    !Number.isFinite(currentAsk) ||
    currentAsk <= 0
  ) {
    throw new Error(
      "Current market price is invalid.",
    );
  }

  const requestedPrice =
    currentAsk * LIMIT_PRICE_FACTOR;

  const requestedQuantity =
    TEST_CAPITAL / requestedPrice;

  const validation =
    orderValidationEngine.validate({
      market,
      price: requestedPrice,
      quantity: requestedQuantity,
    });

  console.log(
    "\n===================================",
  );
  console.log(
    "CoinDCX LIMIT BUY — DRY RUN ONLY",
  );
  console.log(
    "===================================",
  );

  console.table([
    {
      Market: market.symbol,
      CurrentAsk: currentAsk,
      RequestedCapital: TEST_CAPITAL,
      NormalizedPrice:
        validation.normalizedPrice,
      NormalizedQuantity:
        validation.normalizedQuantity,
      FinalNotional:
        validation.notional,
      Valid: validation.valid,
    },
  ]);

  console.log(
    "\nMarket Rules:",
  );

  console.log({
    minimumQuantity:
      market.minimumQuantity,

    maximumQuantity:
      market.maximumQuantity,

    minimumPrice:
      market.minimumPrice,

    maximumPrice:
      market.maximumPrice,

    minimumNotional:
      market.minimumNotional,

    quantityStep:
      market.quantityStep,

    quantityPrecision:
      market.quantityPrecision,

    pricePrecision:
      market.pricePrecision,

    orderTypes:
      market.orderTypes,
  });

  if (!validation.valid) {
    console.log(
      "\nORDER BLOCKED:",
    );

    for (
      const reason
      of validation.reasons
    ) {
      console.log(
        `- ${reason}`,
      );
    }

    process.exitCode = 1;
    return;
  }

  const proposedOrder = {
    market: market.symbol,

    side: "buy" as const,

    orderType:
      "limit_order" as const,

    totalQuantity:
      validation.normalizedQuantity,

    pricePerUnit:
      validation.normalizedPrice,
  };

  console.log(
    "\nVALIDATED ORDER PAYLOAD:",
  );

  console.log(
    JSON.stringify(
      proposedOrder,
      null,
      2,
    ),
  );

  console.log(
    "\nDRY RUN COMPLETE — NO ORDER WAS PLACED.",
  );
}

void main().catch(
  (error: unknown) => {
    console.error(
      "[CoinDCX Order Dry Run]",
      error instanceof Error
        ? error.message
        : error,
    );

    process.exitCode = 1;
  },
);