import {
  defaultArbitragePolicy,
} from "../../arbitrage/config/policy";

import {
  environment,
} from "../../config/Environment";

import {
  credentialSafetyService,
} from "../../execution/live/security/CredentialSafetyService";

import {
  freshnessIntegrityConfig,
} from "../../freshness/config/freshness";

import {
  exposureLimits,
} from "../../portfolio/config/exposure";

import {
  tradingAccountService,
} from "../../trading/account/TradingAccountService";

import {
  MAXIMUM_DAILY_PAPER_ATTEMPT_LIMIT,
} from "../../trading/account/TradingAccount";

import {
  paperCapitalConfigurationService,
} from "../../trading/capital/PaperCapitalConfigurationService";

import {
  defaultExecutableProfitConfig,
  defaultTradingExecutionConfig,
} from "../../trading/config/execution";

import {
  strategyOneExecutionPolicyService,
} from "../../trading/policy/StrategyOneExecutionPolicyService";

import type {
  OperatorSettingsReport,
} from "../models/OperatorSettings";

export class OperatorSettingsService {
  getReport(): OperatorSettingsReport {
    const account =
      tradingAccountService.getAccount();

    const credentialSafety =
      credentialSafetyService.getReport();

    const paperCapital =
      paperCapitalConfigurationService
        .getConfiguration();

    return {
      generatedAt: Date.now(),

      mode: "READ_ONLY_OPERATOR_SETTINGS",

      mutableFromFrontend: false,

      account: {
        id: account.id,
        name: account.name,
        mode: account.mode,
        enabled: account.enabled,
        emergencyStop: account.emergencyStop,
        initialCapital: account.initialCapital,
        currentCapital: account.currentCapital,
        availableCapital: account.availableCapital,
        todayProfit: account.todayProfit,
        todayLoss: account.todayLoss,
        openTrades: account.openTrades,
        tradesToday: account.tradesToday,
        limits: {
          maximumCapitalPerTrade:
            account.limits.maximumCapitalPerTrade,

          maximumDailyLoss:
            account.limits.maximumDailyLoss,

          maximumOpenTrades:
            account.limits.maximumOpenTrades,

          maximumDailyTrades:
            account.limits.maximumDailyTrades,
        },
      },

      paperCapital: {
        ...paperCapital,

        accountingEquityInr:
          account.currentCapital,

        availableAccountingEquityInr:
          account.availableCapital,

        mutableFromFrontend:
          true,
      },

      runtime: {
        nodeEnv:
          environment.nodeEnv,

        tradingMode:
          environment.tradingMode,

        liveTradingEnabled:
          environment.liveTradingEnabled,

        frontendOrigin:
          environment.frontendOrigin,

        executionTimeoutMs:
          environment.executionTimeoutMs,

        executionPollingIntervalMs:
          environment.executionPollingIntervalMs,

        executionCancelOnTimeout:
          environment.executionCancelOnTimeout,

        maximumQuoteAgeMs:
          environment.maximumQuoteAgeMs,

        minimumNetProfitPercent:
          environment.minimumNetProfitPercent,

        minimumLiquidityPercent:
          environment.minimumLiquidityPercent,

        logLevel:
          environment.logLevel,

        logDirectory:
          environment.logDirectory,
      },

      opportunityPolicy: {
        ...defaultArbitragePolicy,
      },

      executionPolicy: {
        ...defaultTradingExecutionConfig,

        executableProfit: {
          ...defaultExecutableProfitConfig,
        },
      },

      exposureLimits: {
        ...exposureLimits,
      },

      freshness: {
        evictionIntervalMs:
          freshnessIntegrityConfig.evictionIntervalMs,

        defaultRule: {
          ...freshnessIntegrityConfig.defaultRule,
        },

        exchanges:
          Object.fromEntries(
            Object.entries(
              freshnessIntegrityConfig.exchanges,
            ).map(
              (
                [
                  exchange,
                  rule,
                ],
              ) => [
                exchange,
                {
                  ...rule,
                },
              ],
            ),
          ),
      },

      credentials: {
        credentialValuesReturned:
          false,

        logRedactionEnabled:
          credentialSafety.logRedactionEnabled,

        auditRedactionEnabled:
          credentialSafety.auditRedactionEnabled,

        allConfigured:
          credentialSafety.allConfigured,

        exchanges:
          credentialSafety.exchanges.map(
            (
              exchange,
            ) => ({
              exchange:
                exchange.exchange,

              configured:
                exchange.configured,

              source:
                exchange.source,

              requiredVariables: [
                ...exchange.requiredVariables,
              ],

              secretValuesExposed:
                false,
            }),
          ),
      },

      tinyLive: {
        preflightOnly:
          true,

        preflightOnlyScope:
          "OPERATOR_SETTINGS_SURFACE",

        executionAuthorityModel:
          "STAGED_RUNTIME_ARM_LEASE_ONE_TIME_AUTHORITY",

        minimumCapital:
          100,

        maximumCapital:
          500,

        currency:
          "INR",

        liveOrderSubmissionFromSettingsAllowed:
          false,
      },

      strategyOnePolicy:
        strategyOneExecutionPolicyService
          .getReport(),

      paperControls: {
        minimumDailyAttemptLimit:
          1,

        maximumDailyAttemptLimit:
          MAXIMUM_DAILY_PAPER_ATTEMPT_LIMIT,

        dailyAttemptLimitMutable:
          true,

        paperDataResetAvailable:
          true,

        resetPausesBot:
          true,

        liveDataResetAllowed:
          false,
      },

      safetyInvariants: [
        "General settings remain read-only; only bounded PAPER capital and daily-attempt controls have dedicated mutation endpoints.",

        "PAPER capital updates preserve accounting equity and settled P&L history.",

        "PAPER data reset requires an exact confirmation, pauses the personal bot, and never clears LIVE evidence or credentials.",

        "Settings cannot enable LIVE trading or change the trading account mode.",

        "Settings cannot submit, cancel, hedge, or unwind exchange orders.",

        "Settings cannot reserve real capital or bypass readiness gates.",

        "API key and secret values are never returned to the frontend.",

        "Emergency-stop behavior is not weakened or overridden by this surface.",

        "This settings surface is preflight-only and cannot grant order authority; controlled Tiny-LIVE uses separate runtime, arm, account-lease, exact-route, one-time-authority and final-last-look gates with a hard ₹100–₹500 range.",

        "Strategy #1 policy changes require a registered code version, an exact confirmation, a paused bot, and zero open execution exposure.",

        "Policy activation cannot enable LIVE orders, automatic fund movement, or mid-trade mutation.",
      ],
    };
  }
}

export const operatorSettingsService =
  new OperatorSettingsService();
