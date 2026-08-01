"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const HealthService_1 = require("../health/HealthService");
const router = (0, express_1.Router)();
router.get("/", (_request, response) => {
    const report = HealthService_1.healthService.getReport();
    response.json({
        success: true,
        data: report,
    });
});
exports.default = router;
//# sourceMappingURL=systemHealth.js.map