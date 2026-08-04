import type { ExecutionRequest } from "../models/ExecutionRequest";
import type { ExecutionValidationResult } from "../models/ExecutionValidationResult";

export class ExecutionValidator {
  validate(
    request: ExecutionRequest,
  ): ExecutionValidationResult {
    const reasons: string[] = [];

    if (!request.market.trim()) {
      reasons.push(
        "Market is required.",
      );
    }

    if (!request.buyExchange.trim()) {
      reasons.push(
        "Buy exchange is required.",
      );
    }

    if (!request.sellExchange.trim()) {
      reasons.push(
        "Sell exchange is required.",
      );
    }

    if (
      request.buyExchange ===
      request.sellExchange
    ) {
      reasons.push(
        "Buy and sell exchanges must be different.",
      );
    }

    if (
      !Number.isFinite(request.capital) ||
      request.capital <= 0
    ) {
      reasons.push(
        "Capital must be greater than zero.",
      );
    }

    return {
      valid:
        reasons.length === 0,

      reasons,
    };
  }
}

export const executionValidator =
  new ExecutionValidator();