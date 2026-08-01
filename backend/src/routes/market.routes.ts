import { Router } from "express";
import {
  getAllMarkets,
  getInrMarkets,
  getUsdtMarkets,
} from "../controllers/market.controller";

const router = Router();

router.get("/", getAllMarkets);
router.get("/inr", getInrMarkets);
router.get("/usdt", getUsdtMarkets);

export default router;