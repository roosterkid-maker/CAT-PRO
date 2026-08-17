import { Router } from "express";

import { comparisonEngine } from "../arbitrage/ComparisonEngine";
import { marketCache } from "../services/cache.service";

const router = Router();

router.get("/", (_request, response) => {
  const snapshots = comparisonEngine
    .groupByMarket(marketCache.getAll())
    .filter(
      (snapshot) =>
        Object.keys(snapshot.quotes).length >= 2,
    );

  response.json({
    success: true,
    count: snapshots.length,
    data: snapshots,
  });
});

export default router;