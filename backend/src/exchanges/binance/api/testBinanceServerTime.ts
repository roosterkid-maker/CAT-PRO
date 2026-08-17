import "dotenv/config";

import {
  binanceHttpClient,
} from "./BinanceHttpClient";

async function main(): Promise<void> {
  const offsetMs =
    await binanceHttpClient
      .synchronizeServerTime();

  const synchronizedTimestamp =
    binanceHttpClient
      .getSynchronizedTimestamp();

  console.log(
    "\n==============================",
  );

  console.log(
    "BINANCE SERVER TIME TEST",
  );

  console.log(
    "==============================",
  );

  console.table([
    {
      LocalTimestamp:
        Date.now(),

      ServerOffsetMs:
        offsetMs,

      SynchronizedTimestamp:
        synchronizedTimestamp,

      DifferenceFromLocalMs:
        synchronizedTimestamp -
        Date.now(),
    },
  ]);

  console.log(
    "\nBinance server-time synchronization passed.",
  );
}

void main().catch(
  (error: unknown) => {
    console.error(
      "\n[Binance Server Time Test]",
      error instanceof Error
        ? error.message
        : error,
    );

    process.exitCode = 1;
  },
);