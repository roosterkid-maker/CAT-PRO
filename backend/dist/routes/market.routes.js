"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const market_controller_1 = require("../controllers/market.controller");
const router = (0, express_1.Router)();
router.get("/", market_controller_1.getAllMarkets);
router.get("/inr", market_controller_1.getInrMarkets);
router.get("/usdt", market_controller_1.getUsdtMarkets);
exports.default = router;
//# sourceMappingURL=market.routes.js.map