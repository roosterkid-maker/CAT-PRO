import {Router} from "express";

import {
  derivativeMarketDataService,
} from "../services/DerivativeMarketDataService";

const router = Router();

router.get("/", (_request, response) => {
  response.json({
    success: true,
    data: derivativeMarketDataService.getSnapshot(),
  });
});

export default router;
