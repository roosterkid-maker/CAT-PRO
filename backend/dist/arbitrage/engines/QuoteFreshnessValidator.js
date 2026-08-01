"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.quoteFreshnessValidator = exports.QuoteFreshnessValidator = void 0;
class QuoteFreshnessValidator {
    isFresh(quote, maximumQuoteAgeMs, now = Date.now()) {
        if (!Number.isFinite(quote.timestamp)) {
            return false;
        }
        const ageMs = now - quote.timestamp;
        return ageMs >= 0 && ageMs <= maximumQuoteAgeMs;
    }
}
exports.QuoteFreshnessValidator = QuoteFreshnessValidator;
exports.quoteFreshnessValidator = new QuoteFreshnessValidator();
//# sourceMappingURL=QuoteFreshnessValidator.js.map