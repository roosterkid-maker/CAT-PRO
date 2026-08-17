import type {
  StrategyAttribution,
} from "../../strategies/models/StrategyAttribution";

export type PaperAutomationLedgerStatus =
  | "MATCHED"
  | "PAPER_TRADE_MISSING"
  | "PAPER_TRADE_INCOMPLETE"
  | "PROFIT_MISMATCH";

export interface PaperAutomationLedgerEntry {
  strategyAttribution: StrategyAttribution;

  id: string;

  cycleId: number;

  planId: string;

  candidateKey: string;

  candidateGeneration: string;

  market: string;

  buyExchange: string;

  sellExchange: string;

  capitalUsed: number;

  grossProfit: number;

  totalFees: number;

  netProfit: number;

  netProfitPercent: number;

  successful: boolean;

  executedAt: number;

  synchronizedAt: number;

  paperTradeId: string | null;

  paperTradeStatus: string | null;

  paperTradeActualProfit: number | null;

  status: PaperAutomationLedgerStatus;

  reasons: string[];
}

export interface PaperAutomationAccountingIntegrity {
  accountCapitalValid: boolean;

  availableCapitalValid: boolean;

  portfolioCapitalMatchesAccount: boolean;

  automationLedgerMatchesPaperTrades: boolean;

  exclusiveAutomationCoverage: boolean;

  accountProfitMatchesAutomationLedger:
    boolean | null;

  reasons: string[];
}

export interface PaperAutomationAccountingDiagnostics {
  generatedAt: number;

  mode: "PAPER";

  accountingMutationAllowed: false;

  liveExecutionAllowed: false;

  synchronizations: number;

  lastSynchronizedAt: number | null;

  totalEntries: number;

  matched: number;

  missingPaperTrades: number;

  incompletePaperTrades: number;

  profitMismatches: number;

  winningTrades: number;

  losingTrades: number;

  breakEvenTrades: number;

  totals: {
    capitalUsed: number;

    grossProfit: number;

    totalFees: number;

    netProfit: number;

    netProfitPercentOnCapitalUsed: number;
  };

  account: {
    initialCapital: number;

    currentCapital: number;

    availableCapital: number;

    allocatedCapital: number;

    todayProfit: number;

    todayLoss: number;

    todayNetProfit: number;

    openTrades: number;

    tradesToday: number;

    totalCapitalChange: number;
  };

  portfolio: {
    totalTrades: number;

    openTrades: number;

    closedTrades: number;

    winningTrades: number;

    losingTrades: number;

    totalRealizedProfit: number;

    winRatePercent: number;

    roiPercent: number;

    profitFactor: number;
  };

  integrity: PaperAutomationAccountingIntegrity;

  entries: PaperAutomationLedgerEntry[];
}
