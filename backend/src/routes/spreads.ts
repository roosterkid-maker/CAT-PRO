import { Router } from "express";

import { comparisonEngine } from "../arbitrage/ComparisonEngine";
import { exchangePairGenerator } from "../arbitrage/engines/ExchangePairGenerator";
import { feeEngine } from "../arbitrage/engines/FeeEngine";
import { spreadEngine } from "../arbitrage/SpreadEngine";
import { marketCache } from "../services/cache.service";

const router = Router();

router.get("/", (_request, response) => {
  const snapshots = comparisonEngine.groupByMarket(
    marketCache.getAll(),
  );

  const opportunities = snapshots.flatMap((snapshot) => {
    const pairs = exchangePairGenerator.generate(snapshot);

    return pairs
      .map((pair) => spreadEngine.calculate(pair))
      .filter(
        (
          opportunity,
        ): opportunity is NonNullable<typeof opportunity> =>
          opportunity !== null,
      )
      .map((opportunity) => feeEngine.apply(opportunity))
      .filter(
        (
          opportunity,
        ): opportunity is NonNullable<typeof opportunity> =>
          opportunity !== null,
      );
  });

  response.json({
    success: true,
    count: opportunities.length,
    data: opportunities,
  });
});

export default router;