"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateRisk = evaluateRisk;
function evaluateRisk(input) {
    if (!input.exchangesConnected) {
        return {
            risk: "HIGH",
            score: 100,
            reason: "Exchange unavailable.",
        };
    }
    if (!input.quoteFresh) {
        return {
            risk: "HIGH",
            score: 90,
            reason: "Quotes are stale.",
        };
    }
    if (input.roi >= 1.0) {
        return {
            risk: "LOW",
            score: 15,
            reason: "Strong spread.",
        };
    }
    if (input.roi >= 0.5) {
        return {
            risk: "MEDIUM",
            score: 40,
            reason: "Acceptable spread.",
        };
    }
    return {
        risk: "HIGH",
        score: 80,
        reason: "Spread too small.",
    };
}
//# sourceMappingURL=RiskEngine.js.map