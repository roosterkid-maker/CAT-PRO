"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const cache_service_1 = require("../services/cache.service");
const router = (0, express_1.Router)();
router.get("/", (_, res) => {
    res.json({
        success: true,
        count: cache_service_1.marketCache.size(),
        data: cache_service_1.marketCache.getAll(),
    });
});
exports.default = router;
//# sourceMappingURL=live.js.map