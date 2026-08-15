import {
  exposureService,
} from "../../portfolio/services/ExposureService";

import {
  portfolioService,
} from "../../portfolio/services/PortfolioService";

import {
  tradingAccountService,
} from "../../trading/account/TradingAccountService";

import type {
  RiskAssessment,
  RiskAssessmentChecks,
} from "../models/RiskAssessment";

import type {
  RiskRequest,
} from "../models/RiskRequest";

const MINIMUM_CONFIDENCE_PERCENT =
  70;

const MINIMUM_FILL_PERCENT =
  90;

const MAXIMUM_CAPITAL =
  50_000;

const MAXIMUM_EXECUTION_TIME_MS =
  1_000;

const MINIMUM_LIQUIDITY_SCORE =
  70;

export interface RiskEngineDependencies {
  getDailyLimits(): {
    readonly maximumDailyLoss: number;
    readonly maximumDailyTrades: number;
  };
}

const DEFAULT_DEPENDENCIES:
  RiskEngineDependencies = {
  getDailyLimits:
    () =>
      tradingAccountService
        .getAccount()
        .limits,
};

export class RiskEngine {
  constructor(
    private readonly dependencies:
      RiskEngineDependencies =
      DEFAULT_DEPENDENCIES,
  ) {}

  assess(
    request:
      RiskRequest,
  ): RiskAssessment {
    const validationReasons =
      this.validateRequest(
        request,
      );

    if (
      validationReasons.length >
      0
    ) {
      return this.createBlockedAssessment(
        validationReasons,
      );
    }

    const accountLimits =
      this.dependencies
        .getDailyLimits();

    const maximumDailyLoss =
      accountLimits
        .maximumDailyLoss;

    const maximumDailyTradeCount =
      accountLimits
        .maximumDailyTrades;

    if (
      !Number.isFinite(
        maximumDailyLoss,
      ) ||
      maximumDailyLoss <=
        0 ||
      !Number.isSafeInteger(
        maximumDailyTradeCount,
      ) ||
      maximumDailyTradeCount <=
        0
    ) {
      return this.createBlockedAssessment([
        "Authoritative trading-account daily risk limits are unavailable or invalid.",
      ]);
    }

    const blockingReasons:
      string[] =
      [];

    const warnings:
      string[] =
      [];

    /*
     * Version 13.5
     *
     * Portfolio capital is now part of the
     * unified risk decision.
     */
    const portfolio =
      portfolioService
        .getSnapshot();

    const tradableCapital =
      portfolio
        .capital
        .tradableCapitalUsdt;

    /*
     * Version 12 owns freshness and pair
     * synchronization policy.
     *
     * Risk Engine consumes those results
     * rather than redefining another global
     * quote timeout.
     */
    const marketIntegrity =
      request.quotesFresh !==
        false &&
      request.pairSynchronized !==
        false;

    const capitalAvailable =
      request.balanceAvailable &&
      request.capital <=
        tradableCapital;

    const dailyLimitsAllowed =
      request.dailyLoss <
        maximumDailyLoss &&
      request.dailyTradeCount <
        maximumDailyTradeCount;

    /*
     * Version 13.4 Exposure Engine
     * integration.
     */
    let exposureAllowed =
      true;

    if (
      request.market &&
      request.buyExchange &&
      request.sellExchange
    ) {
      const exposure =
        exposureService
          .assessProposedExposure({
            capital:
              request.capital,

            market:
              request.market,

            buyExchange:
              request.buyExchange,

            sellExchange:
              request.sellExchange,
          });

      exposureAllowed =
        exposure.approved;

      if (
        !exposure.approved
      ) {
        blockingReasons.push(
          ...exposure.reasons,
        );
      } else if (
        exposure.health ===
        "WARNING"
      ) {
        warnings.push(
          ...exposure.reasons,
        );
      }
    }

    /*
     * Hard blocking conditions.
     */
    if (
      request.netProfit <=
      0
    ) {
      blockingReasons.push(
        "Expected net profit is not positive.",
      );
    }

    if (
      !request.exchangeConnected
    ) {
      blockingReasons.push(
        "One or more required exchange connections are unavailable.",
      );
    }

    if (
      !request.balanceAvailable
    ) {
      blockingReasons.push(
        "Available exchange balance is insufficient for the requested trade.",
      );
    }

    if (
      request.capital >
      tradableCapital
    ) {
      blockingReasons.push(
        "Requested capital exceeds current tradable portfolio capital.",
      );
    }

    if (
      request.quotesFresh ===
      false
    ) {
      blockingReasons.push(
        "Market quotes failed the Version 12 exchange-specific freshness check.",
      );
    }

    if (
      request.pairSynchronized ===
      false
    ) {
      blockingReasons.push(
        "Buy and sell books failed the Version 12 pair synchronization check.",
      );
    }

    if (
      request.dailyLoss >=
      maximumDailyLoss
    ) {
      blockingReasons.push(
        `Daily loss limit of ₹${maximumDailyLoss.toLocaleString(
          "en-IN",
        )} has been reached.`,
      );
    }

    if (
      request.dailyTradeCount >=
      maximumDailyTradeCount
    ) {
      blockingReasons.push(
        `Daily trade limit of ${maximumDailyTradeCount} has been reached.`,
      );
    }

    const checks:
      RiskAssessmentChecks = {
      marketIntegrity,

      executionQuality:
        request.confidence >=
          MINIMUM_CONFIDENCE_PERCENT &&
        request.fillPercent >=
          MINIMUM_FILL_PERCENT &&
        request.liquidityScore >=
          MINIMUM_LIQUIDITY_SCORE,

      capitalAvailable,

      exposureAllowed,

      dailyLimitsAllowed,
    };

    if (
      blockingReasons.length >
      0
    ) {
      return this.createBlockedAssessment(
        blockingReasons,
        warnings,
        checks,
      );
    }

    /*
     * Soft risk scoring.
     *
     * These conditions do not immediately
     * block execution but reduce confidence.
     */
    let score =
      100;

    if (
      request.confidence <
      MINIMUM_CONFIDENCE_PERCENT
    ) {
      score -=
        30;

      warnings.push(
        `Execution confidence is below ${MINIMUM_CONFIDENCE_PERCENT}%.`,
      );
    }

    if (
      request.fillPercent <
      MINIMUM_FILL_PERCENT
    ) {
      score -=
        25;

      warnings.push(
        `Expected fill percentage is below ${MINIMUM_FILL_PERCENT}%.`,
      );
    }

    if (
      request.capital >
      MAXIMUM_CAPITAL
    ) {
      score -=
        20;

      warnings.push(
        `Capital exceeds the recommended maximum of ₹${MAXIMUM_CAPITAL.toLocaleString(
          "en-IN",
        )}.`,
      );
    }

    if (
      request.executionTimeMs >
      MAXIMUM_EXECUTION_TIME_MS
    ) {
      score -=
        15;

      warnings.push(
        `Expected execution latency exceeds ${MAXIMUM_EXECUTION_TIME_MS} ms.`,
      );
    }

    if (
      request.liquidityScore <
      MINIMUM_LIQUIDITY_SCORE
    ) {
      score -=
        20;

      warnings.push(
        `Liquidity score is below ${MINIMUM_LIQUIDITY_SCORE}.`,
      );
    }

    if (
      request.dailyLoss >
      maximumDailyLoss *
        0.75
    ) {
      score -=
        15;

      warnings.push(
        "Daily loss is approaching the configured safety limit.",
      );
    }

    if (
      request.dailyTradeCount >=
      maximumDailyTradeCount *
        0.8
    ) {
      score -=
        10;

      warnings.push(
        "Daily trade count is approaching the configured limit.",
      );
    }

    /*
     * Pair synchronization warning.
     *
     * It is still valid, but getting close
     * to the configured skew boundary.
     */
    if (
      request.maximumPairSkewMs &&
      request.timestampSkewMs !==
        null &&
      request.timestampSkewMs !==
        undefined &&
      request.timestampSkewMs >
        request.maximumPairSkewMs *
          0.75
    ) {
      score -=
        10;

      warnings.push(
        "Cross-exchange quote synchronization is approaching its maximum allowed skew.",
      );
    }

    score =
      clampScore(
        score,
      );

    const level =
      getRiskLevel(
        score,
      );

    return {
      level,

      approved:
        level !==
        "HIGH",

      score,

      reasons:
        warnings.length ===
        0
          ? [
              "Unified risk assessment passed all configured checks.",
            ]
          : [
              ...new Set(
                warnings,
              ),
            ],

      warnings: [
        ...new Set(
          warnings,
        ),
      ],

      checks,
    };
  }

  private validateRequest(
    request:
      RiskRequest,
  ): string[] {
    const reasons:
      string[] =
      [];

    if (
      !isPositiveFiniteNumber(
        request.capital,
      )
    ) {
      reasons.push(
        "Capital must be a positive finite number.",
      );
    }

    if (
      !isPercentage(
        request.confidence,
      )
    ) {
      reasons.push(
        "Confidence must be between 0 and 100.",
      );
    }

    if (
      !isPercentage(
        request.fillPercent,
      )
    ) {
      reasons.push(
        "Fill percentage must be between 0 and 100.",
      );
    }

    if (
      !Number.isFinite(
        request.netProfit,
      )
    ) {
      reasons.push(
        "Expected net profit must be a finite number.",
      );
    }

    if (
      !isNonNegativeFiniteNumber(
        request.executionTimeMs,
      )
    ) {
      reasons.push(
        "Execution time must be zero or greater.",
      );
    }

    if (
      !isPercentage(
        request.liquidityScore,
      )
    ) {
      reasons.push(
        "Liquidity score must be between 0 and 100.",
      );
    }

    if (
      !isNonNegativeFiniteNumber(
        request.quoteAgeMs,
      )
    ) {
      reasons.push(
        "Quote age must be zero or greater.",
      );
    }

    if (
      !isNonNegativeFiniteNumber(
        request.dailyLoss,
      )
    ) {
      reasons.push(
        "Daily loss must be zero or greater.",
      );
    }

    if (
      !Number.isInteger(
        request.dailyTradeCount,
      ) ||
      request.dailyTradeCount <
        0
    ) {
      reasons.push(
        "Daily trade count must be a non-negative integer.",
      );
    }

    if (
      request.timestampSkewMs !==
        undefined &&
      request.timestampSkewMs !==
        null &&
      !isNonNegativeFiniteNumber(
        request.timestampSkewMs,
      )
    ) {
      reasons.push(
        "Timestamp skew must be zero or greater when provided.",
      );
    }

    if (
      request.maximumPairSkewMs !==
        undefined &&
      request.maximumPairSkewMs !==
        null &&
      !isPositiveFiniteNumber(
        request.maximumPairSkewMs,
      )
    ) {
      reasons.push(
        "Maximum pair skew must be positive when provided.",
      );
    }

    return reasons;
  }

  private createBlockedAssessment(
    reasons:
      string[],

    warnings:
      string[] =
      [],

    checks?:
      RiskAssessmentChecks,
  ): RiskAssessment {
    return {
      level:
        "BLOCKED",

      approved:
        false,

      score:
        0,

      reasons: [
        ...new Set(
          reasons,
        ),
      ],

      warnings: [
        ...new Set(
          warnings,
        ),
      ],

      checks:
        checks ?? {
          marketIntegrity:
            false,

          executionQuality:
            false,

          capitalAvailable:
            false,

          exposureAllowed:
            false,

          dailyLimitsAllowed:
            false,
        },
    };
  }
}

function getRiskLevel(
  score:
    number,
):
  | "LOW"
  | "MEDIUM"
  | "HIGH" {
  if (
    score >=
    80
  ) {
    return "LOW";
  }

  if (
    score >=
    60
  ) {
    return "MEDIUM";
  }

  return "HIGH";
}

function clampScore(
  score:
    number,
): number {
  return Math.max(
    0,
    Math.min(
      100,
      score,
    ),
  );
}

function isPercentage(
  value:
    number,
): boolean {
  return (
    Number.isFinite(
      value,
    ) &&
    value >=
      0 &&
    value <=
      100
  );
}

function isPositiveFiniteNumber(
  value:
    number,
): boolean {
  return (
    Number.isFinite(
      value,
    ) &&
    value >
      0
  );
}

function isNonNegativeFiniteNumber(
  value:
    number,
): boolean {
  return (
    Number.isFinite(
      value,
    ) &&
    value >=
      0
  );
}

export const riskEngine =
  new RiskEngine();
