"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateConfidence = evaluateConfidence;
function evaluateConfidence(input) {
    let confidence = 100;
    if (!input.exchangesConnected) {
        confidence -= 40;
    }
    if (!input.quoteFresh) {
        confidence -= 30;
    }
    if (!input.spreadPositive) {
        confidence -= 20;
    }
    if (input.roi < 0.5) {
        confidence -= 10;
    }
    confidence = Math.max(0, confidence);
    return {
        confidence,
        reason: confidence >= 90
            ? "Very high confidence."
            : confidence >= 70
                ? "Good confidence."
                : confidence >= 50
                    ? "Moderate confidence."
                    : "Low confidence.",
    };
}
//# sourceMappingURL=ConfidenceEngine.js.map