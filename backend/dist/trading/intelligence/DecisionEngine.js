"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateDecision = evaluateDecision;
function evaluateDecision(roi) {
    if (!Number.isFinite(roi)) {
        return {
            decision: "SKIP",
            reason: "ROI is invalid.",
            confidence: 100,
        };
    }
    if (roi >= 0.5) {
        return {
            decision: "EXECUTE",
            reason: "ROI meets the minimum execution target.",
            confidence: 95,
        };
    }
    if (roi >= 0.3) {
        return {
            decision: "REVIEW",
            reason: "ROI is close to the minimum execution target.",
            confidence: 70,
        };
    }
    return {
        decision: "SKIP",
        reason: "ROI is below the minimum execution target.",
        confidence: 100,
    };
}
//# sourceMappingURL=DecisionEngine.js.map