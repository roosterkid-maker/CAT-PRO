"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const market_routes_1 = __importDefault(require("./routes/market.routes"));
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.get("/", (_req, res) => {
    res.status(200).json({
        success: true,
        application: "Crypto Arbitrage Scanner",
        version: "1.0.0",
        status: "Running"
    });
});
app.use("/api/markets", market_routes_1.default);
exports.default = app;
//# sourceMappingURL=app.js.map