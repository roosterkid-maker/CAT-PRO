import "dotenv/config";

import {
  binanceMarketRulesApi,
} from "./BinanceMarketRulesApi";

import {
  binanceOrderNormalizer,
} from "./BinanceOrderNormalizer";

const TEST_SYMBOL =
  "XRPUSDT";

async function main(): Promise<void> {
  const rules =
    await binanceMarketRulesApi
      .getMarketRules(
        TEST_SYMBOL,
      );

  const requestedPrice =
    0.1;

  const requestedQuantity =
    100;

  const normalized =
    binanceOrderNormalizer.normalize({
      price:
        requestedPrice,

      quantity:
        requestedQuantity,

      rules,
    });

  console.log(
    "\n================================",
  );

  console.log(
    "BINANCE MARKET RULES TEST",
  );

  console.log(
    "================================",
  );

  console.table([
    {
      Symbol:
        rules.symbol,

      Status:
        rules.status,

      Base:
        rules.baseAsset,

      Quote:
        rules.quoteAsset,

      MinPrice:
        rules.minimumPrice,

      PriceStep:
        rules.priceStep,

      MinQuantity:
        rules.minimumQuantity,

      QuantityStep:
        rules.quantityStep,

      MinNotional:
        rules.minimumNotional,

      SpotAllowed:
        rules.spotTradingAllowed,
    },
  ]);

  console.log(
    "\nNORMALIZED TEST ORDER",
  );

  console.table([
    {
      RequestedPrice:
        requestedPrice,

      RequestedQuantity:
        requestedQuantity,

      NormalizedPrice:
        normalized.normalizedPrice,

      NormalizedQuantity:
        normalized.normalizedQuantity,

      Notional:
        normalized.notional,

      Valid:
        normalized.valid,
    },
  ]);

  if (
    normalized.reasons.length >
    0
  ) {
    console.log(
      "\nReasons:",
    );

    for (
      const reason
      of normalized.reasons
    ) {
      console.log(
        `- ${reason}`,
      );
    }
  }

  console.log(
    "\nBinance public market-rules test complete.",
  );
}

void main().catch(
  (error: unknown) => {
    console.error(
      "\n[Binance Market Rules Test]",
      error instanceof Error
        ? error.message
        : error,
    );

    process.exitCode = 1;
  },
);