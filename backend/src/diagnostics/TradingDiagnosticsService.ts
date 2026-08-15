import {
  opportunityService,
  type OpportunityPipelineDiagnostics,
} from "../arbitrage/services/OpportunityService";

import {
  opportunityDiagnosticsRunner,
  type OpportunityDiagnosticsRunnerStatus,
} from "../arbitrage/services/OpportunityDiagnosticsRunner";

import {
  opportunityRejectionStore,
  type OpportunityRejectionRecord,
  type OpportunityRejectionSummary,
} from "../arbitrage/services/OpportunityRejectionStore";

import {
  exchangeCapabilityService,
  type ExchangeCapabilityServiceStatus,
} from "../execution/capabilities/services/ExchangeCapabilityService";

import {
  executionHealthService,
  type ExecutionHealthReport,
} from "../execution/live/health/ExecutionHealthService";

import {
  exchangeBalanceSynchronizationRunner,
  type ExchangeBalanceSynchronizationRunnerStatus,
} from "../trading/services/ExchangeBalanceSynchronizationRunner";

import {
  tradingAccountService,
  type ExchangeBalanceSnapshot,
} from "../trading/account/TradingAccountService";

export interface TradingDiagnosticsReport {
  generatedAt:
    number;

  opportunityPipeline:
    OpportunityPipelineDiagnostics | null;

  opportunityRunner:
    OpportunityDiagnosticsRunnerStatus;

  opportunityRejections: {
    summary:
      OpportunityRejectionSummary;

    recent:
      readonly OpportunityRejectionRecord[];
  };

  executionHealth:
    ExecutionHealthReport;

  capabilityEngine:
    ExchangeCapabilityServiceStatus;

  balanceSynchronization:
    ExchangeBalanceSynchronizationRunnerStatus;

  exchangeBalances:
    readonly ExchangeBalanceSnapshot[];

  tradingAccount: {
    mode:
      string;

    enabled:
      boolean;

    emergencyStop:
      boolean;

    currentCapital:
      number;

    availableCapital:
      number;

    openTrades:
      number;

    tradesToday:
      number;

    todayProfit:
      number;

    todayLoss:
      number;
  };
}

export class TradingDiagnosticsService {
  getReport():
    TradingDiagnosticsReport {
    const account =
      tradingAccountService
        .getAccount();

    return {
      generatedAt:
        Date.now(),

      opportunityPipeline:
        opportunityService
          .getLastDiagnostics(),

      opportunityRunner:
        opportunityDiagnosticsRunner
          .getStatus(),

      opportunityRejections: {
        summary:
          opportunityRejectionStore
            .getSummary(),

        recent:
          opportunityRejectionStore
            .getRecent(
              25,
            ),
      },

      executionHealth:
        executionHealthService
          .getReport(),

      capabilityEngine:
        exchangeCapabilityService
          .getStatus(),

      balanceSynchronization:
        exchangeBalanceSynchronizationRunner
          .getStatus(),

      exchangeBalances:
        tradingAccountService
          .getExchangeBalances(),

      tradingAccount: {
        mode:
          account.mode,

        enabled:
          account.enabled,

        emergencyStop:
          account.emergencyStop,

        currentCapital:
          account.currentCapital,

        availableCapital:
          account.availableCapital,

        openTrades:
          account.openTrades,

        tradesToday:
          account.tradesToday,

        todayProfit:
          account.todayProfit,

        todayLoss:
          account.todayLoss,
      },
    };
  }
}

export const tradingDiagnosticsService =
  new TradingDiagnosticsService();
