"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateTradingIntelligence = evaluateTradingIntelligence;
const DecisionEngine_1 = require("./DecisionEngine");
const RiskEngine_1 = require("./RiskEngine");
const ConfidenceEngine_1 = require("./ConfidenceEngine");
function evaluateTradingIntelligence(input) {
    const decision = (0, DecisionEngine_1.evaluateDecision)(input.roi);
    const risk = (0, RiskEngine_1.evaluateRisk)({
        roi: input.roi,
        quoteFresh: input.quoteFresh,
        exchangesConnected: input.exchangesConnected,
    });
    const confidence = (0, ConfidenceEngine_1.evaluateConfidence)({
        roi: input.roi,
        quoteFresh: input.quoteFresh,
        exchangesConnected: input.exchangesConnected,
        spreadPositive: input.spreadPositive,
    });
    const summary = [];
    summary.push(decision.reason);
    summary.push(risk.reason);
    summary.push(confidence.reason);
    return {
        decision,
        risk,
        confidence,
        summary,
    };
}
//# sourceMappingURL=TradingIntelligence.js.map