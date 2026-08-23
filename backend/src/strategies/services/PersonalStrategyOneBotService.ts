import type {ArbitrageOpportunity} from "../../arbitrage/models/ArbitrageOpportunity";
import {opportunityService} from "../../arbitrage/services/OpportunityService";
import type {OpportunityDiagnosticsRunnerStatus, OpportunityLatencyDistribution} from "../../arbitrage/services/OpportunityDiagnosticsRunner";
import {opportunityDiagnosticsRunner} from "../../arbitrage/services/OpportunityDiagnosticsRunner";
import type {AutomationLatencyDistribution, AutomationSchedulerDiagnostics} from "../../automation/models/AutomationScheduler";
import {automationSchedulerService} from "../../automation/services/AutomationSchedulerService";
import type {AutomatedPaperExecutionControllerDiagnostics} from "../../automation/models/AutomatedPaperExecutionController";
import {automatedPaperExecutionControllerService} from "../../automation/services/AutomatedPaperExecutionControllerService";
import type {TradingAccount} from "../../trading/account/TradingAccount";
import type {TradingAccountCapitalReservationAttempt} from "../../trading/account/TradingAccountLedgerService";
import {tradingAccountLedgerService} from "../../trading/account/TradingAccountLedgerService";
import {tradingAccountService} from "../../trading/account/TradingAccountService";
import type {PaperCapitalConfiguration} from "../../trading/capital/PaperCapitalConfigurationService";
import {paperCapitalConfigurationService} from "../../trading/capital/PaperCapitalConfigurationService";
import type {PaperTrade} from "../../trading/models/PaperTrade";
import type {ExecutedPriceCredibilityReport} from "../../trading/analysis/CrossVenuePriceCredibilityService";
import {evaluateExecutedPriceCredibility} from "../../trading/analysis/CrossVenuePriceCredibilityService";
import type {
  DailyExecutionReservationEvidence,
  DailyExecutionReservationSessionEvidence,
} from "../../execution/live/coordinator/LiveExecutionSessionEvidenceService";
import {liveExecutionSessionEvidenceService} from "../../execution/live/coordinator/LiveExecutionSessionEvidenceService";
import {paperTradeStore} from "../../trading/services/PaperTradeStore";
import type {PostGuardProfitValidationReport} from "../../trading/services/PostGuardProfitValidationLedgerService";
import {postGuardProfitValidationLedgerService} from "../../trading/services/PostGuardProfitValidationLedgerService";
import type {StrategyOnePaperRuntimeAcceptanceReport} from "../../workflows/cross-exchange-arbitrage/models/StrategyOnePaperRuntimeAcceptance";
import type {UnifiedAutomatedExecutionDiagnostics} from "../../workflows/cross-exchange-arbitrage/models/UnifiedAutomatedExecution";
import {strategyOnePaperRuntimeAcceptanceService} from "../../workflows/cross-exchange-arbitrage/services/StrategyOnePaperRuntimeAcceptanceService";
import {unifiedAutomatedExecutionOrchestratorService} from "../../workflows/cross-exchange-arbitrage/services/UnifiedAutomatedExecutionOrchestratorService";
import type {PersonalBotRuntimeControl} from "./PersonalBotRuntimeControlService";
import {personalBotRuntimeControlService} from "./PersonalBotRuntimeControlService";
import type {PersonalOpportunityConversionReport} from "./PersonalOpportunityConversionService";
import {personalOpportunityConversionService} from "./PersonalOpportunityConversionService";
import type {
  StrategyOneFundedRouteReport,
  StrategyOneFundingBoundary,
} from "../../trading/execution/StrategyOneFundedRouteService";
import {strategyOneFundedRouteService} from "../../trading/execution/StrategyOneFundedRouteService";
import type {
  StrategyOneCapitalPlacementReport,
} from "./StrategyOneCapitalPlacementService";
import {
  strategyOneCapitalPlacementService,
} from "./StrategyOneCapitalPlacementService";
import type {
  ExchangeBalanceDashboardReport,
} from "../../portfolio/services/ExchangeBalancePortfolioService";
import {
  exchangeBalancePortfolioService,
} from "../../portfolio/services/ExchangeBalancePortfolioService";
import type {
  PersonalCapitalManagerReport,
} from "./PersonalCapitalManagerService";
import {
  personalCapitalManagerService,
} from "./PersonalCapitalManagerService";
import {
  normalizedInventorySnapshotService,
} from "../../rebalancing/services/NormalizedInventorySnapshotService";
import type {
  NormalizedInventorySnapshot,
} from "../../rebalancing/models/NormalizedInventorySnapshot";
import {
  capitalManagerSafetyContextService,
} from "../../rebalancing/services/CapitalManagerSafetyContextService";

const BOT_CLOCK_TIME_ZONE = "Asia/Kolkata" as const;
const BOT_CLOCK_UTC_OFFSET_MINUTES = 330;
const BOT_CLOCK_UTC_OFFSET_MS = BOT_CLOCK_UTC_OFFSET_MINUTES * 60 * 1_000;
const HOUR_MS = 60 * 60 * 1_000;
const PERSONAL_BOT_CAPITAL_PLACEMENT_ROUTE_LIMIT = 25;
const PERSONAL_BOT_EXCLUDED_EXECUTION_LIMIT = 20;

export type PersonalStrategyOneBotState =
  | "PAUSED"
  | "BLOCKED"
  | "COLLECTING_PAPER_SOAK"
  | "DAILY_LIMIT_REACHED"
  | "WAITING_FOR_OPPORTUNITY"
  | "WAITING_FOR_PAPER_CAPACITY"
  | "OBSERVING_OPPORTUNITY"
  | "READY_TO_EXECUTE_PAPER";

export interface PersonalStrategyOneNonSettledAttempt {
  readonly attemptId: string;
  readonly attemptNumber: number;
  readonly reservedAt: number;
  readonly reservedCapital: number;
  readonly accountMode: TradingAccount["mode"];
  readonly capitalReleaseStatus: "RELEASE_CONFIRMED" | "STILL_RESERVED";
  readonly releasedAt: number | null;
  readonly sessionLinkStatus: "LINKED" | "NO_DURABLE_SESSION_LINK";
  readonly sessionId: string | null;
  readonly sessionStatus: DailyExecutionReservationSessionEvidence["status"] | null;
  readonly market: string | null;
  readonly buyExchange: string | null;
  readonly sellExchange: string | null;
  readonly reason: string;
}

export interface PersonalStrategyOneHourlyBucket {
  readonly hour: number;
  readonly label: string;
  readonly startAt: number;
  readonly endAt: number;
  readonly successfulTrades: number;
  readonly realizedPnl: number;
  readonly current: boolean;
}

export interface PersonalStrategyOneInventoryRequirement {
  readonly side: "BUY_QUOTE" | "SELL_BASE";
  readonly exchange: string;
  readonly asset: string | null;
  readonly requiredAmount: number | null;
  readonly availableAmount: number | null;
  readonly planningAvailableAmount: number | null;
  readonly deficitAmount: number | null;
  readonly evidence: "PRESENT" | "SYNCHRONIZED_ASSET_OMITTED" | "UNAVAILABLE";
  readonly action: string;
}

export interface PersonalStrategyOneInventoryRoute {
  readonly rank: number;
  readonly opportunityId: string;
  readonly routeKey: string;
  readonly market: string;
  readonly buyExchange: string;
  readonly sellExchange: string;
  readonly baseAsset: string | null;
  readonly quoteAsset: string | null;
  readonly fundingState: StrategyOneFundedRouteReport["state"];
  readonly targetQuantity: number | null;
  readonly modeledNetProfitInr: number | null;
  readonly modeledNetReturnPercent: number;
  readonly fullySpecified: boolean;
  readonly requirements: readonly [
    PersonalStrategyOneInventoryRequirement,
    PersonalStrategyOneInventoryRequirement,
  ];
  readonly blockers: readonly string[];
}

export interface PersonalStrategyOneBotReport {
  readonly version: "90.0";
  readonly generatedAt: number;
  readonly profile: "PERSONAL_STRATEGY_ONE";
  readonly state: PersonalStrategyOneBotState;
  readonly strategy: {
    readonly id: "cross-exchange-arbitrage";
    readonly displayName: "Cross-Exchange Arbitrage";
    readonly runtimeOwner: "UNIFIED_AUTOMATED_EXECUTION_ORCHESTRATOR";
  };
  readonly control: PersonalBotRuntimeControl & {
    readonly scannerActive: true;
    readonly effectivePaperExecutionEnabled: boolean;
  };
  readonly opportunity: {
    readonly current: number;
    readonly executable: number;
    readonly fundedExecutable: number;
    readonly top: readonly PersonalStrategyOneOpportunity[];
    readonly accepted: readonly PersonalStrategyOneOpportunity[];
  };
  readonly funding: {
    readonly mode: "AUTHENTICATED_TWO_LEG_BALANCE";
    readonly requestedCapitalInr: number;
    readonly evaluatedRoutes: number;
    readonly fundedRoutes: number;
    readonly reducedRoutes: number;
    readonly blockedRoutes: number;
    readonly routes: readonly StrategyOneFundedRouteReport[];
  };
  readonly paperCapacity: {
    readonly mode: "ISOLATED_PAPER";
    readonly requestedCapitalInr: number;
    readonly evaluatedRoutes: number;
    readonly executableRoutes: number;
    readonly reducedRoutes: number;
    readonly blockedRoutes: number;
    readonly routes: readonly StrategyOneFundedRouteReport[];
    readonly authenticatedBalancesRequired: false;
    readonly liveBalancesMutated: false;
  };
  readonly inventoryPlan: {
    readonly mode: "ADVISORY_PREPOSITIONING";
    readonly generatedAt: number;
    readonly requestedCapitalInr: number;
    readonly recommendationStatus:
      | "NO_CURRENT_EXECUTE_ROUTE"
      | "EVIDENCE_INCOMPLETE"
      | "FUNDING_REQUIRED"
      | "READY";
    readonly recommendedRoute: PersonalStrategyOneInventoryRoute | null;
    readonly alternatives: readonly PersonalStrategyOneInventoryRoute[];
    readonly safety: {
      readonly advisoryOnly: true;
      readonly transferInitiated: false;
      readonly withdrawalInitiated: false;
      readonly balanceMutated: false;
      readonly liveExecutionAllowed: false;
      readonly orderSubmissionAllowed: false;
    };
  };
  readonly capitalPlacement: Omit<StrategyOneCapitalPlacementReport, "routes"> & {
    readonly totalRoutes: number;
    readonly routes: StrategyOneCapitalPlacementReport["routes"];
  };
  readonly capitalManager: PersonalCapitalManagerReport;
  readonly performance: {
    readonly storedExecutions: number;
    readonly successfulExecutions: number;
    readonly excludedUncredibleExecutions: number;
    readonly successfulToday: number;
    readonly successfulCurrentClockHour: number;
    readonly currentClockHourLabel: string;
    readonly hourlySuccessfulTrades: readonly PersonalStrategyOneHourlyBucket[];
    readonly hourlyClockBasis: "ASIA_KOLKATA";
    readonly hourlyTimeZone: "Asia/Kolkata";
    readonly winningExecutions: number;
    readonly winRatePercent: number | null;
    readonly realizedPnl: number;
    readonly realizedPnlToday: number;
    readonly pnlUnit: "ACCOUNT_CURRENCY";
  };
  readonly hotPath: {
    readonly codeSideOnly: true;
    readonly sampleWindowCapacity: 512;
    readonly state: "COLLECTING" | "PASS" | "MISS";
    readonly scanner: {
      readonly eventDriven: boolean;
      readonly minimumEventScanIntervalMs: number;
      readonly executableUpdatesReceived: number;
      readonly coalescedExecutableUpdates: number;
      readonly marketUpdateToDecisionMs: OpportunityLatencyDistribution;
      readonly evaluationMs: OpportunityLatencyDistribution;
    };
    readonly automation: {
      readonly decisionToQueueMs: AutomationLatencyDistribution;
      readonly candidateDecisionToExecutionStartMs: AutomationLatencyDistribution;
      readonly decisionToExecutionCompleteMs: AutomationLatencyDistribution;
      readonly pendingSnapshots: number;
      readonly pendingSnapshotHighWaterMark: number;
      readonly coalescedEmptySnapshots: number;
      readonly coalescedCandidateSnapshots: number;
      readonly droppedCandidateSnapshots: number;
    };
    readonly targets: {
      readonly marketUpdateToDecisionP95Ms: 25;
      readonly marketUpdateToDecisionP99Ms: 40;
      readonly decisionToQueueP95Ms: 10;
      readonly decisionToQueueP99Ms: 25;
      readonly candidateDecisionToExecutionStartP95Ms: 25;
      readonly candidateDecisionToExecutionStartP99Ms: 40;
      readonly decisionToExecutionCompleteP99Ms: 40;
      readonly maximumDroppedCandidateSnapshots: 0;
    };
    readonly gates: {
      readonly marketUpdateToDecision: "COLLECTING" | "PASS" | "MISS";
      readonly decisionToQueue: "COLLECTING" | "PASS" | "MISS";
      readonly candidateDecisionToExecutionStart: "COLLECTING" | "PASS" | "MISS";
      readonly decisionToExecutionComplete: "COLLECTING" | "PASS" | "MISS";
      readonly candidateSnapshotDrops: "COLLECTING" | "PASS" | "MISS";
    };
  };
  readonly profitValidation: PostGuardProfitValidationReport;
  readonly conversion: PersonalOpportunityConversionReport;
  readonly recentExecutions: readonly PersonalStrategyOneExecution[];
  readonly excludedExecutions: readonly PersonalStrategyOneExcludedExecution[];
  readonly paper: {
    readonly accountEnabled: boolean;
    readonly accountMode: TradingAccount["mode"];
    readonly emergencyStop: boolean;
    readonly automationArmed: boolean;
    readonly automationAllowed: boolean;
    readonly orchestratorMode: UnifiedAutomatedExecutionDiagnostics["mode"];
    readonly tradesToday: number;
    readonly maximumDailyTrades: number;
    readonly remainingDailyTrades: number;
    readonly dailyActivity: {
      readonly counterSemantics: "CAPITAL_RESERVED_ATTEMPTS";
      readonly reservationAttempts: number;
      readonly settledPaperExecutions: number;
      readonly credibleStrategyOneSettlements: number;
      readonly credibilityExcludedStrategyOneSettlements: number;
      readonly dryRunReservations: number;
      readonly failedDryRunReservations: number;
      readonly otherUnlinkedOrNonSettledReservations: number;
      readonly otherAttemptDetails: readonly PersonalStrategyOneNonSettledAttempt[];
      readonly otherAttemptDetailCoverage: {
        readonly expected: number;
        readonly available: number;
        readonly complete: boolean;
        readonly matchingWindowMs: 250;
        readonly routeAttributionAvailableForLinkedAttempts: true;
      };
      readonly remainingAttemptBudget: number;
      readonly equationBalanced: boolean;
    };
    readonly availableCapital: number;
    readonly paperTdsReceivable: number;
    readonly capitalBudgetInr: number;
    readonly minimumCapitalPerTrade: number;
    readonly maximumCapitalPerTrade: number;
    readonly capitalStep: number;
    readonly maximumExecutionsPerBatch: number;
    readonly maximumBatchCapital: number;
  };
  readonly soak: {
    readonly status: StrategyOnePaperRuntimeAcceptanceReport["soakStatus"];
    readonly acceptedPasses: number;
    readonly consecutivePasses: number;
    readonly minimumConsecutivePasses: number;
    readonly safeRejections: number;
    readonly evidenceIncomplete: number;
  };
  readonly lastExecutionCycle: {
    readonly status: string;
    readonly completedAt: number;
    readonly readyCandidates: number;
    readonly ownedCandidates: number;
    readonly reasons: readonly string[];
  } | null;
  readonly blockers: readonly string[];
  readonly nextAction: string;
  readonly safety: {
    readonly readOnlyAggregation: true;
    readonly fakeOpportunityAllowed: false;
    readonly fakeBalanceAllowed: false;
    readonly accountPolicyMutated: false;
    readonly paperExecutionTriggeredByRead: false;
    readonly liveExecutionAllowed: false;
    readonly orderSubmissionAllowed: false;
  };
}

export interface PersonalStrategyOnePerformanceSummary {
  readonly version: "148.0";
  readonly generatedAt: number;
  readonly profile: "PERSONAL_STRATEGY_ONE_PERFORMANCE_SUMMARY";
  readonly performance: PersonalStrategyOneBotReport["performance"];
  readonly safety: {
    readonly readOnlyAggregation: true;
    readonly paperExecutionTriggeredByRead: false;
    readonly liveExecutionAllowed: false;
    readonly orderSubmissionAllowed: false;
  };
}

export interface PersonalStrategyOneOpportunity {
  readonly id: string;
  readonly market: string;
  readonly buyExchange: string;
  readonly sellExchange: string;
  readonly decision: ArbitrageOpportunity["decision"];
  /** Sized account-currency profit; null when funded INR capacity is unavailable. */
  readonly modeledNetProfitInr: number | null;
  readonly netProfit: number;
  readonly netProfitPercent: number;
  readonly executableQuantity: number;
  readonly score: number;
  readonly observedAt: number;
  readonly funding: StrategyOneFundedRouteReport | null;
}

export interface PersonalStrategyOneExecution {
  readonly id: string;
  readonly strategyId: string;
  readonly strategyName: string;
  readonly market: string;
  readonly baseAsset: string;
  readonly quoteAsset: string;
  readonly buyExchange: string;
  readonly sellExchange: string;
  readonly quantity: number;
  readonly capital: number;
  readonly buyPrice: number;
  readonly sellPrice: number;
  readonly fees: number;
  readonly tdsWithheld: number;
  readonly deployableCashProfit: number;
  readonly pnl: number;
  readonly pnlPercent: number;
  readonly status: PaperTrade["status"];
  readonly executedAt: number;
  readonly completedAt: number | null;
  readonly simulated: true;
}

export interface PersonalStrategyOneExcludedExecution {
  readonly id: string;
  readonly market: string;
  readonly baseAsset: string;
  readonly quoteAsset: string;
  readonly buyExchange: string;
  readonly sellExchange: string;
  readonly quantity: number;
  readonly capital: number;
  readonly buyPrice: number;
  readonly sellPrice: number;
  readonly reportedPnl: number;
  readonly reportedPnlPercent: number;
  readonly completedAt: number;
  readonly priceRatio: number | null;
  readonly maximumCrediblePriceRatio: number;
  readonly ratioExcessPercent: number | null;
  readonly failureCode: "INVALID_EXECUTED_PRICE" | "PRICE_RATIO_EXCEEDED";
  readonly reason: string;
  readonly excludedFromPnl: true;
  readonly simulated: true;
}

export interface PersonalStrategyOneBotDependencies {
  getOpportunities(): readonly ArbitrageOpportunity[];
  getPaperController(): AutomatedPaperExecutionControllerDiagnostics;
  getAccount(): TradingAccount;
  getPaperCapitalConfiguration(): PaperCapitalConfiguration;
  getAcceptance(): Pick<
    StrategyOnePaperRuntimeAcceptanceReport,
    | "passed"
    | "rejectedSafe"
    | "evidenceIncomplete"
    | "consecutivePasses"
    | "minimumConsecutivePasses"
    | "soakStatus"
  >;
  getOrchestrator(): UnifiedAutomatedExecutionDiagnostics;
  getControl(): PersonalBotRuntimeControl;
  getTrades(): readonly PaperTrade[];
  getProfitValidation(now: number): PostGuardProfitValidationReport;
  getConversion(now: number): PersonalOpportunityConversionReport;
  getCapitalPlacement(
    trades: readonly PaperTrade[],
    now: number,
    settledRevision: number,
  ): StrategyOneCapitalPlacementReport;
  getSettledTradeRevision(): number;
  getExchangeBalanceReport(now: number): ExchangeBalanceDashboardReport;
  getNormalizedInventory(now: number): NormalizedInventorySnapshot;
  getRebalancingSafetyContext(
    now: number,
    account: TradingAccount,
  ): {
    readonly executionRecoveryPending: boolean;
    readonly settlementReconciliationPending: boolean;
    readonly emergencyStopActive: boolean;
  };
  getDailyReservationEvidence(now: number): DailyExecutionReservationEvidence;
  getDailyAccountReservationAttempts(now: number): readonly TradingAccountCapitalReservationAttempt[];
  getDailyReservationSessions(now: number): readonly DailyExecutionReservationSessionEvidence[];
  getOpportunityRunner(): OpportunityDiagnosticsRunnerStatus;
  getAutomationScheduler(): AutomationSchedulerDiagnostics;
  evaluateFunding(
    opportunity: ArbitrageOpportunity,
    requestedCapitalInr: number,
    now: number,
    fundingBoundary: StrategyOneFundingBoundary,
  ): StrategyOneFundedRouteReport;
}

interface PersonalStrategyOneTradeAnalytics {
  readonly strategyTrades: readonly PaperTrade[];
  readonly successfulTrades: readonly PaperTrade[];
  readonly excludedTrades: readonly {
    trade: PaperTrade;
    credibility: ExecutedPriceCredibilityReport;
  }[];
  readonly winningExecutions: number;
  readonly realizedPnl: number;
  readonly capitalManagerProfitEvidence: ReturnType<typeof buildCapitalManagerProfitEvidence>;
}

const DEFAULT_DEPENDENCIES: PersonalStrategyOneBotDependencies = {
  getOpportunities: () => opportunityService.getLastOpportunities(),
  getPaperController: () => automatedPaperExecutionControllerService.getDiagnostics(),
  getAccount: () => tradingAccountService.getAccount(),
  getPaperCapitalConfiguration: () => paperCapitalConfigurationService.getConfiguration(),
  getAcceptance: () => strategyOnePaperRuntimeAcceptanceService.getSummary(),
  getOrchestrator: () => unifiedAutomatedExecutionOrchestratorService.getDiagnostics(),
  getControl: () => personalBotRuntimeControlService.getControl(),
  getTrades: () =>
    paperTradeStore
      .getAllForReadOnlyAggregation(),
  getProfitValidation: (now) => postGuardProfitValidationLedgerService.getReport(now),
  getConversion: (now) => personalOpportunityConversionService.getReport(now),
  getCapitalPlacement: (trades, now, settledRevision) =>
    strategyOneCapitalPlacementService
      .getReport(
        trades,
        now,
        settledRevision,
      ),
  getSettledTradeRevision: () =>
    paperTradeStore
      .getSettledRevision(),
  getExchangeBalanceReport: (now) =>
    exchangeBalancePortfolioService
      .getReport(
        now,
      ),
  getNormalizedInventory: (now) =>
    normalizedInventorySnapshotService
      .getSnapshot(
        now,
      ),
  getRebalancingSafetyContext: (now, account) =>
    capitalManagerSafetyContextService
      .getContext(
        account,
        now,
      ),
  getDailyReservationEvidence: (now) =>
    liveExecutionSessionEvidenceService.getDailyReservationEvidence(now),
  getDailyAccountReservationAttempts: (now) =>
    tradingAccountLedgerService.getDailyCapitalReservationAttempts(now),
  getDailyReservationSessions: (now) =>
    liveExecutionSessionEvidenceService.getDailyReservationSessions(now),
  getOpportunityRunner: () => opportunityDiagnosticsRunner.getStatus(),
  getAutomationScheduler: () => automationSchedulerService.getDiagnostics(),
  evaluateFunding: (opportunity, requestedCapitalInr, now, fundingBoundary) =>
    strategyOneFundedRouteService.evaluate({
      opportunity,
      requestedCapitalInr,
      fundingBoundary,
      now,
    }),
};

/** Read-only personal-bot truth surface for the one proven Strategy #1 path. */
export class PersonalStrategyOneBotService {
  private readonly dependencies: PersonalStrategyOneBotDependencies;

  private cachedTradeSource:
    readonly PaperTrade[] | null =
    null;

  private cachedTradeAnalytics:
    PersonalStrategyOneTradeAnalytics | null =
    null;

  constructor(dependencies: Partial<PersonalStrategyOneBotDependencies> = {}) {
    this.dependencies = {...DEFAULT_DEPENDENCIES, ...dependencies};
  }

  getPerformanceSummary(
    now =
      Date.now(),
  ): PersonalStrategyOnePerformanceSummary {
    if (
      !Number.isSafeInteger(
        now,
      ) ||
      now <=
        0
    ) {
      throw new Error(
        "Personal Strategy #1 performance timestamp must be a positive safe integer.",
      );
    }

    const tradeAnalytics =
      this.getTradeAnalytics(
        this.dependencies
          .getTrades(),
      );
    const localDayStart =
      startOfLocalDay(
        now,
      );
    const successfulToday =
      tradeAnalytics
        .successfulTrades
        .filter(
          (
            trade,
          ) =>
            (
              trade.closedAt ??
              trade.openedAt
            ) >=
            localDayStart,
        );
    const hourlySuccessfulTrades =
      buildLocalHourlyBuckets(
        now,
        successfulToday,
      );
    const currentClockHour =
      hourlySuccessfulTrades.find(
        (
          bucket,
        ) =>
          bucket.current,
      );

    return freeze({
      version:
        "148.0" as const,
      generatedAt:
        now,
      profile:
        "PERSONAL_STRATEGY_ONE_PERFORMANCE_SUMMARY" as const,
      performance: {
        storedExecutions:
          tradeAnalytics
            .strategyTrades
            .length,
        successfulExecutions:
          tradeAnalytics
            .successfulTrades
            .length,
        excludedUncredibleExecutions:
          tradeAnalytics
            .excludedTrades
            .length,
        successfulToday:
          successfulToday.length,
        successfulCurrentClockHour:
          currentClockHour
            ?.successfulTrades ??
          0,
        currentClockHourLabel:
          currentClockHour
            ?.label ??
          "NO CURRENT HOUR",
        hourlySuccessfulTrades,
        hourlyClockBasis:
          "ASIA_KOLKATA" as const,
        hourlyTimeZone:
          BOT_CLOCK_TIME_ZONE,
        winningExecutions:
          tradeAnalytics
            .winningExecutions,
        winRatePercent:
          tradeAnalytics
            .successfulTrades
            .length >
          0
            ? tradeAnalytics
                .winningExecutions /
              tradeAnalytics
                .successfulTrades
                .length *
              100
            : null,
        realizedPnl:
          tradeAnalytics
            .realizedPnl,
        realizedPnlToday:
          sumRealizedPnl(
            successfulToday,
          ),
        pnlUnit:
          "ACCOUNT_CURRENCY" as const,
      },
      safety: {
        readOnlyAggregation:
          true as const,
        paperExecutionTriggeredByRead:
          false as const,
        liveExecutionAllowed:
          false as const,
        orderSubmissionAllowed:
          false as const,
      },
    });
  }

  getReport(now = Date.now()): PersonalStrategyOneBotReport {
    if (!Number.isSafeInteger(now) || now <= 0) {
      throw new Error("Personal Strategy #1 bot report timestamp must be a positive safe integer.");
    }

    const opportunities = this.dependencies.getOpportunities()
      .filter((item) => item.quotesAreFresh && !item.usedLastPriceFallback)
      .sort(compareOpportunities);
    const paperController = this.dependencies.getPaperController();
    const account = this.dependencies.getAccount();
    const paperCapital = this.dependencies.getPaperCapitalConfiguration();
    const fundingCapitalInr = Math.min(
      paperCapital.maximumCapitalPerTrade,
      account.availableCapital,
    );
    const fundingOpportunities = uniqueOpportunities([
      ...opportunities.slice(0, 10),
      ...opportunities.filter((item) => item.decision === "EXECUTE").slice(0, 20),
    ]);
    const fundingReports = fundingOpportunities.map((opportunity) =>
      this.dependencies.evaluateFunding(
        opportunity,
        fundingCapitalInr,
        now,
        "AUTHENTICATED_LIVE_READINESS",
      ));
    const fundingByOpportunityId = new Map(
      fundingReports.map((report) => [report.opportunityId, report] as const),
    );
    const paperCapacityReports = fundingOpportunities.map((opportunity) =>
      this.dependencies.evaluateFunding(
        opportunity,
        fundingCapitalInr,
        now,
        "ISOLATED_PAPER",
      ));
    const paperCapacityByOpportunityId = new Map(
      paperCapacityReports.map((report) => [report.opportunityId, report] as const),
    );
    const engineExecutable = opportunities.filter((item) => item.decision === "EXECUTE");
    const fundedExecutable = engineExecutable.filter((item) => {
      const funding = paperCapacityByOpportunityId.get(item.id);
      return funding !== undefined && funding.state !== "BLOCKED" &&
        funding.executableQuantity !== null;
    });
    const inventoryPlan = buildInventoryPlan(
      engineExecutable,
      fundingByOpportunityId,
      fundingCapitalInr,
      now,
    );
    const acceptance = this.dependencies.getAcceptance();
    const orchestrator = this.dependencies.getOrchestrator();
    const control = this.dependencies.getControl();
    const profitValidation = this.dependencies.getProfitValidation(now);
    const botProfitValidation: PostGuardProfitValidationReport = {
      ...profitValidation,
      routes:
        profitValidation.routes.slice(
          0,
          8,
        ),
      markets:
        profitValidation.markets.slice(
          0,
          8,
        ),
    };
    const conversion = this.dependencies.getConversion(now);
    const allTrades = this.dependencies.getTrades();
    const tradeAnalytics = this.getTradeAnalytics(allTrades);
    const strategyTrades = tradeAnalytics.strategyTrades;
    const successfulTrades = tradeAnalytics.successfulTrades;
    const excludedTrades = tradeAnalytics.excludedTrades;
    const excludedUncredibleExecutions = excludedTrades.length;
    const localDayStart = startOfLocalDay(now);
    const dailySettledTrades = allTrades.filter((trade) =>
      trade.status === "closed" && trade.closedAt !== null &&
      trade.actualProfit !== null && trade.closedAt >= localDayStart);
    const successfulToday = successfulTrades.filter((trade) =>
      (trade.closedAt ?? trade.openedAt) >= localDayStart);
    const hourlySuccessfulTrades = buildLocalHourlyBuckets(
      now,
      successfulToday,
    );
    const currentClockHour = hourlySuccessfulTrades.find(
      (bucket) => bucket.current,
    );
    const excludedToday = excludedTrades.filter(({trade}) =>
      (trade.closedAt ?? trade.openedAt) >= localDayStart);
    const capitalPlacement =
      this.dependencies
        .getCapitalPlacement(
          allTrades,
          now,
          this.dependencies
            .getSettledTradeRevision(),
        );
    const botCapitalPlacement =
      freeze({
        ...capitalPlacement,
        totalRoutes:
          capitalPlacement.routes.length,
        routes:
          capitalPlacement.routes.slice(
            0,
            PERSONAL_BOT_CAPITAL_PLACEMENT_ROUTE_LIMIT,
          ),
      });
    const capitalManager =
      personalCapitalManagerService
        .getReport({
          now,
          inventoryPlan,
          capitalPlacement,
          exchangeBalances:
            this.dependencies
              .getExchangeBalanceReport(
                now,
              ),
          paperCapital: {
            budgetInr: paperCapital.capitalBudgetInr,
            accountingEquityInr: account.currentCapital,
            availableAccountingEquityInr: account.availableCapital,
            tdsReceivableInr: account.paperTdsReceivable ?? 0,
          },
          profitEvidence:
            tradeAnalytics
              .capitalManagerProfitEvidence,
          normalizedInventory:
            this.dependencies
              .getNormalizedInventory(
                now,
              ),
          rebalancingSafetyContext:
            this.dependencies
              .getRebalancingSafetyContext(
                now,
                account,
              ),
        });
    const dailyReservationEvidence =
      this.dependencies
        .getDailyReservationEvidence(
          now,
        );
    const opportunityRunner = this.dependencies.getOpportunityRunner();
    const automationScheduler = this.dependencies.getAutomationScheduler();
    const hotPath = buildHotPathReport(
      opportunityRunner,
      automationScheduler,
    );
    const otherUnlinkedOrNonSettledReservations = Math.max(
      0,
      account.tradesToday - dailySettledTrades.length - dailyReservationEvidence.dryRunReservations,
    );
    const otherAttemptDetails = buildOtherReservationAttemptDetails(
      this.dependencies.getDailyAccountReservationAttempts(now),
      this.dependencies.getDailyReservationSessions(now),
      dailySettledTrades,
    );
    const dailyActivityEquationTotal = dailySettledTrades.length +
      dailyReservationEvidence.dryRunReservations + otherUnlinkedOrNonSettledReservations;
    const winningExecutions = tradeAnalytics.winningExecutions;
    const remainingDailyTrades = Math.max(0, account.limits.maximumDailyTrades - account.tradesToday);
    const blockers: string[] = [];

    if (!account.enabled) blockers.push("TRADING_ACCOUNT_DISABLED");
    if (account.mode !== "PAPER") blockers.push(`TRADING_ACCOUNT_MODE_NOT_PAPER:${account.mode}`);
    if (account.emergencyStop) blockers.push("EMERGENCY_STOP_ACTIVE");
    if (!control.enabled) blockers.push("BOT_PAUSED_BY_OPERATOR");
    if (control.enabled && !paperController.paperExecutionArmed) blockers.push("AUTOMATED_PAPER_NOT_ARMED");
    if (control.enabled && !paperController.paperExecutionAllowed) blockers.push("AUTOMATED_PAPER_READINESS_NOT_PASSED");
    if (acceptance.soakStatus !== "PASSED") blockers.push(`PAPER_SOAK_${acceptance.soakStatus}`);
    if (remainingDailyTrades === 0) blockers.push("AUTHORITATIVE_DAILY_TRADE_LIMIT_REACHED");
    if (opportunities.length === 0) blockers.push("NO_CURRENT_FRESH_OPPORTUNITY");
    if (engineExecutable.length > 0 && fundedExecutable.length === 0) {
      blockers.push("NO_CURRENT_PAPER_CAPACITY");
    }

    const hardBlocked = blockers.some((blocker) =>
      blocker === "TRADING_ACCOUNT_DISABLED" || blocker.startsWith("TRADING_ACCOUNT_MODE_NOT_PAPER") ||
      blocker === "EMERGENCY_STOP_ACTIVE" || blocker === "AUTOMATED_PAPER_NOT_ARMED" ||
      blocker === "AUTOMATED_PAPER_READINESS_NOT_PASSED");
    const state: PersonalStrategyOneBotState = !control.enabled
      ? "PAUSED"
      : hardBlocked
        ? "BLOCKED"
      : acceptance.soakStatus !== "PASSED"
        ? "COLLECTING_PAPER_SOAK"
        : remainingDailyTrades === 0
          ? "DAILY_LIMIT_REACHED"
          : opportunities.length === 0
            ? "WAITING_FOR_OPPORTUNITY"
            : engineExecutable.length > 0 && fundedExecutable.length === 0
              ? "WAITING_FOR_PAPER_CAPACITY"
            : fundedExecutable.length > 0
              ? "READY_TO_EXECUTE_PAPER"
              : "OBSERVING_OPPORTUNITY";

    return freeze({
      version: "90.0" as const,
      generatedAt: now,
      profile: "PERSONAL_STRATEGY_ONE" as const,
      state,
      strategy: {
        id: "cross-exchange-arbitrage" as const,
        displayName: "Cross-Exchange Arbitrage" as const,
        runtimeOwner: "UNIFIED_AUTOMATED_EXECUTION_ORCHESTRATOR" as const,
      },
      control: {
        ...control,
        scannerActive: true as const,
        effectivePaperExecutionEnabled: control.enabled && paperController.paperExecutionAllowed,
      },
      opportunity: {
        current: opportunities.length,
        executable: engineExecutable.length,
        fundedExecutable: fundedExecutable.length,
        top: opportunities.slice(0, 10).map((item) =>
          toOpportunity(item, paperCapacityByOpportunityId.get(item.id) ?? null)),
        accepted: fundedExecutable.slice(0, 10).map((item) =>
          toOpportunity(item, paperCapacityByOpportunityId.get(item.id) ?? null)),
      },
      funding: {
        mode: "AUTHENTICATED_TWO_LEG_BALANCE" as const,
        requestedCapitalInr: fundingCapitalInr,
        evaluatedRoutes: fundingReports.length,
        fundedRoutes: fundingReports.filter((item) => item.state === "FUNDED").length,
        reducedRoutes: fundingReports.filter((item) => item.state === "REDUCED").length,
        blockedRoutes: fundingReports.filter((item) => item.state === "BLOCKED").length,
        routes: fundingReports,
      },
      paperCapacity: {
        mode: "ISOLATED_PAPER" as const,
        requestedCapitalInr: fundingCapitalInr,
        evaluatedRoutes: paperCapacityReports.length,
        executableRoutes: paperCapacityReports.filter((item) => item.state === "FUNDED").length,
        reducedRoutes: paperCapacityReports.filter((item) => item.state === "REDUCED").length,
        blockedRoutes: paperCapacityReports.filter((item) => item.state === "BLOCKED").length,
        routes: paperCapacityReports,
        authenticatedBalancesRequired: false as const,
        liveBalancesMutated: false as const,
      },
      inventoryPlan,
      capitalPlacement:
        botCapitalPlacement,
      capitalManager,
      performance: {
        storedExecutions: strategyTrades.length,
        successfulExecutions: successfulTrades.length,
        excludedUncredibleExecutions,
        successfulToday: successfulToday.length,
        successfulCurrentClockHour: currentClockHour?.successfulTrades ?? 0,
        currentClockHourLabel: currentClockHour?.label ?? "NO CURRENT HOUR",
        hourlySuccessfulTrades,
        hourlyClockBasis: "ASIA_KOLKATA" as const,
        hourlyTimeZone: BOT_CLOCK_TIME_ZONE,
        winningExecutions,
        winRatePercent: successfulTrades.length > 0
          ? (winningExecutions / successfulTrades.length) * 100
          : null,
        realizedPnl: tradeAnalytics.realizedPnl,
        realizedPnlToday: sumRealizedPnl(successfulToday),
        pnlUnit: "ACCOUNT_CURRENCY" as const,
      },
      hotPath,
      profitValidation:
        botProfitValidation,
      conversion,
      recentExecutions: successfulTrades.slice(0, 20).map((trade) => {
        const assets = splitMarket(trade.market);
        return {
          id: trade.id,
          strategyId: trade.strategyAttribution.strategyId ?? "cross-exchange-arbitrage",
          strategyName: "Cross-Exchange Arbitrage",
          market: trade.market,
          baseAsset: assets.baseAsset,
          quoteAsset: assets.quoteAsset,
          buyExchange: trade.buyExchange,
          sellExchange: trade.sellExchange,
          quantity: trade.quantity,
          capital: trade.capital,
          buyPrice: trade.buyPrice,
          sellPrice: trade.actualSellPrice ?? trade.sellPrice,
          fees: trade.estimatedFees,
          tdsWithheld:
            trade.tdsWithheld ??
            0,
          deployableCashProfit:
            trade.deployableCashProfit ??
            trade.actualProfit ??
            0,
          pnl: trade.actualProfit ?? 0,
          pnlPercent: trade.actualProfitPercent ?? 0,
          status: trade.status,
          executedAt: trade.openedAt,
          completedAt: trade.closedAt,
          simulated: true as const,
        };
      }),
      excludedExecutions: excludedTrades
        .slice(
          0,
          PERSONAL_BOT_EXCLUDED_EXECUTION_LIMIT,
        )
        .map(({trade, credibility}) => {
        const assets = splitMarket(trade.market);
        const sellPrice = trade.actualSellPrice ?? trade.sellPrice;
        const ratioExcessPercent = credibility.priceRatio === null
          ? null
          : ((credibility.priceRatio / credibility.maximumPriceRatio) - 1) * 100;
        const failureCode = credibility.priceRatio === null
          ? "INVALID_EXECUTED_PRICE" as const
          : "PRICE_RATIO_EXCEEDED" as const;
        return {
          id: trade.id,
          market: trade.market,
          baseAsset: assets.baseAsset,
          quoteAsset: assets.quoteAsset,
          buyExchange: trade.buyExchange,
          sellExchange: trade.sellExchange,
          quantity: trade.quantity,
          capital: trade.capital,
          buyPrice: trade.buyPrice,
          sellPrice,
          reportedPnl: trade.actualProfit ?? 0,
          reportedPnlPercent: trade.actualProfitPercent ?? 0,
          completedAt: trade.closedAt!,
          priceRatio: credibility.priceRatio,
          maximumCrediblePriceRatio: credibility.maximumPriceRatio,
          ratioExcessPercent,
          failureCode,
          reason: credibility.priceRatio === null
            ? "Executed buy/sell prices were invalid, so price credibility could not be calculated."
            : `Executed cross-venue price ratio ${credibility.priceRatio.toFixed(4)}x exceeded the ${credibility.maximumPriceRatio.toFixed(4)}x credibility limit.`,
          excludedFromPnl: true as const,
          simulated: true as const,
        };
        }),
      paper: {
        accountEnabled: account.enabled,
        accountMode: account.mode,
        emergencyStop: account.emergencyStop,
        automationArmed: paperController.paperExecutionArmed,
        automationAllowed: paperController.paperExecutionAllowed,
        orchestratorMode: orchestrator.mode,
        tradesToday: account.tradesToday,
        maximumDailyTrades: account.limits.maximumDailyTrades,
        remainingDailyTrades,
        dailyActivity: {
          counterSemantics: "CAPITAL_RESERVED_ATTEMPTS" as const,
          reservationAttempts: account.tradesToday,
          settledPaperExecutions: dailySettledTrades.length,
          credibleStrategyOneSettlements: successfulToday.length,
          credibilityExcludedStrategyOneSettlements: excludedToday.length,
          dryRunReservations: dailyReservationEvidence.dryRunReservations,
          failedDryRunReservations: dailyReservationEvidence.failedDryRunReservations,
          otherUnlinkedOrNonSettledReservations,
          otherAttemptDetails,
          otherAttemptDetailCoverage: {
            expected: otherUnlinkedOrNonSettledReservations,
            available: otherAttemptDetails.length,
            complete: otherAttemptDetails.length === otherUnlinkedOrNonSettledReservations,
            matchingWindowMs: 250 as const,
            routeAttributionAvailableForLinkedAttempts: true as const,
          },
          remainingAttemptBudget: remainingDailyTrades,
          equationBalanced: dailyActivityEquationTotal === account.tradesToday,
        },
        availableCapital: account.availableCapital,
        paperTdsReceivable: account.paperTdsReceivable ?? 0,
        capitalBudgetInr: paperCapital.capitalBudgetInr,
        minimumCapitalPerTrade: paperCapital.minimumCapitalPerTrade,
        maximumCapitalPerTrade: paperCapital.maximumCapitalPerTrade,
        capitalStep: paperCapital.capitalStep,
        maximumExecutionsPerBatch: paperCapital.maximumExecutionsPerBatch,
        maximumBatchCapital: paperCapital.maximumBatchCapital,
      },
      soak: {
        status: acceptance.soakStatus,
        acceptedPasses: acceptance.passed,
        consecutivePasses: acceptance.consecutivePasses,
        minimumConsecutivePasses: acceptance.minimumConsecutivePasses,
        safeRejections: acceptance.rejectedSafe,
        evidenceIncomplete: acceptance.evidenceIncomplete,
      },
      lastExecutionCycle: orchestrator.lastCycle ? {
        status: orchestrator.lastCycle.status,
        completedAt: orchestrator.lastCycle.completedAt,
        readyCandidates: orchestrator.lastCycle.readyCandidates,
        ownedCandidates: orchestrator.lastCycle.ownedCandidates,
        reasons: [...orchestrator.lastCycle.reasons],
      } : null,
      blockers: [...new Set(blockers)],
      nextAction: nextAction(state),
      safety: {
        readOnlyAggregation: true as const,
        fakeOpportunityAllowed: false as const,
        fakeBalanceAllowed: false as const,
        accountPolicyMutated: false as const,
        paperExecutionTriggeredByRead: false as const,
        liveExecutionAllowed: false as const,
        orderSubmissionAllowed: false as const,
      },
    });
  }

  private getTradeAnalytics(
    allTrades: readonly PaperTrade[],
  ): PersonalStrategyOneTradeAnalytics {
    if (
      this.cachedTradeSource ===
        allTrades &&
      this.cachedTradeAnalytics !==
        null
    ) {
      return this.cachedTradeAnalytics;
    }

    const strategyTrades = allTrades
      .filter((trade) => trade.strategyAttribution?.strategyId === "cross-exchange-arbitrage")
      .sort((first, second) => second.openedAt - first.openedAt);
    const evaluatedSettledTrades = strategyTrades
      .filter((trade) =>
        trade.status === "closed" &&
        trade.closedAt !== null &&
        trade.actualProfit !== null)
      .map((trade) => ({
        trade,
        credibility: evaluateExecutedPriceCredibility(
          trade.buyPrice,
          trade.actualSellPrice ?? trade.sellPrice,
        ),
      }));
    const successfulTrades = evaluatedSettledTrades
      .filter(({credibility}) => credibility.credible)
      .map(({trade}) => trade);
    const excludedTrades = evaluatedSettledTrades
      .filter(({credibility}) => !credibility.credible);
    const analytics: PersonalStrategyOneTradeAnalytics = {
      strategyTrades,
      successfulTrades,
      excludedTrades,
      winningExecutions: successfulTrades.filter(
        (trade) => (trade.actualProfit ?? 0) > 0,
      ).length,
      realizedPnl: sumRealizedPnl(successfulTrades),
      capitalManagerProfitEvidence: buildCapitalManagerProfitEvidence(
        successfulTrades,
        strategyTrades,
      ),
    };

    this.cachedTradeSource =
      allTrades;
    this.cachedTradeAnalytics =
      analytics;

    return analytics;
  }
}

const RESERVATION_SESSION_MATCH_WINDOW_MS = 250;

function buildOtherReservationAttemptDetails(
  attempts: readonly TradingAccountCapitalReservationAttempt[],
  sessions: readonly DailyExecutionReservationSessionEvidence[],
  settledTrades: readonly PaperTrade[],
): PersonalStrategyOneNonSettledAttempt[] {
  const usedSessionIds = new Set<string>();
  const usedTradeIds = new Set<string>();
  const orderedSessions = toOrderedTimedValues(
    sessions,
    (session) => session.createdAt,
  );
  const orderedSettledTrades = toOrderedTimedValues(
    settledTrades,
    (trade) => trade.openedAt,
  );

  return attempts
    .map((attempt): PersonalStrategyOneNonSettledAttempt | null => {
      const matchingSession = findClosestTimedValue(
        orderedSessions,
        attempt.reservedAt,
        (session) =>
          !usedSessionIds.has(session.sessionId) &&
          Math.abs(session.capital - attempt.amount) <= 1e-9,
      );

      if (matchingSession) {
        usedSessionIds.add(matchingSession.sessionId);

        if (matchingSession.dryRun || matchingSession.status === "COMPLETED") {
          if (matchingSession.status === "COMPLETED") {
            const matchingTrade = findClosestTimedValue(
              orderedSettledTrades,
              matchingSession.createdAt,
              (trade) =>
                !usedTradeIds.has(trade.id) &&
                trade.market === matchingSession.market &&
                trade.buyExchange === matchingSession.buyExchange &&
                trade.sellExchange === matchingSession.sellExchange,
            );

            if (matchingTrade) {
              usedTradeIds.add(matchingTrade.id);
            }
          }

          return null;
        }

        return {
          attemptId: attempt.attemptId,
          attemptNumber: attempt.attemptNumber,
          reservedAt: attempt.reservedAt,
          reservedCapital: attempt.amount,
          accountMode: attempt.accountMode,
          capitalReleaseStatus: attempt.capitalReleaseStatus,
          releasedAt: attempt.releasedAt,
          sessionLinkStatus: "LINKED",
          sessionId: matchingSession.sessionId,
          sessionStatus: matchingSession.status,
          market: matchingSession.market,
          buyExchange: matchingSession.buyExchange,
          sellExchange: matchingSession.sellExchange,
          reason: matchingSession.failureReason ?? `Durable PAPER session ended as ${matchingSession.status}.`,
        };
      }

      const matchingLegacySettlement = findClosestTimedValue(
        orderedSettledTrades,
        attempt.reservedAt,
        (trade) =>
          !usedTradeIds.has(trade.id),
      );

      if (matchingLegacySettlement) {
        usedTradeIds.add(matchingLegacySettlement.id);
        return null;
      }

      return {
        attemptId: attempt.attemptId,
        attemptNumber: attempt.attemptNumber,
        reservedAt: attempt.reservedAt,
        reservedCapital: attempt.amount,
        accountMode: attempt.accountMode,
        capitalReleaseStatus: attempt.capitalReleaseStatus,
        releasedAt: attempt.releasedAt,
        sessionLinkStatus: "NO_DURABLE_SESSION_LINK",
        sessionId: null,
        sessionStatus: null,
        market: null,
        buyExchange: null,
        sellExchange: null,
        reason: "Account capital was reserved, but no durable PAPER execution session owns this attempt.",
      };
    })
    .filter((attempt): attempt is PersonalStrategyOneNonSettledAttempt => attempt !== null)
    .sort((first, second) => second.reservedAt - first.reservedAt);
}

interface OrderedTimedValue<T> {
  readonly value: T;
  readonly timestamp: number;
  readonly originalIndex: number;
}

function toOrderedTimedValues<T>(
  values: readonly T[],
  getTimestamp: (value: T) => number,
): OrderedTimedValue<T>[] {
  return values
    .map((value, originalIndex) => ({
      value,
      timestamp: getTimestamp(value),
      originalIndex,
    }))
    .sort((first, second) =>
      first.timestamp - second.timestamp ||
      first.originalIndex - second.originalIndex);
}

/**
 * Match only the narrow reservation time window. The previous implementation
 * filtered and sorted the complete session/trade history for every attempt,
 * making the BOT read surface quadratic as PAPER history grew.
 */
function findClosestTimedValue<T>(
  ordered: readonly OrderedTimedValue<T>[],
  targetTimestamp: number,
  predicate: (value: T) => boolean,
): T | null {
  const minimumTimestamp =
    targetTimestamp - RESERVATION_SESSION_MATCH_WINDOW_MS;
  const maximumTimestamp =
    targetTimestamp + RESERVATION_SESSION_MATCH_WINDOW_MS;

  let low = 0;
  let high = ordered.length;

  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (ordered[middle].timestamp < minimumTimestamp) low = middle + 1;
    else high = middle;
  }

  let best: OrderedTimedValue<T> | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let index = low; index < ordered.length; index += 1) {
    const candidate = ordered[index];
    if (candidate.timestamp > maximumTimestamp) break;
    if (!predicate(candidate.value)) continue;

    const distance = Math.abs(candidate.timestamp - targetTimestamp);
    if (
      distance < bestDistance ||
      (distance === bestDistance &&
        candidate.originalIndex < (best?.originalIndex ?? Number.POSITIVE_INFINITY))
    ) {
      best = candidate;
      bestDistance = distance;
    }
  }

  return best?.value ?? null;
}

function buildHotPathReport(
  runner:
    OpportunityDiagnosticsRunnerStatus,
  scheduler:
    AutomationSchedulerDiagnostics,
): PersonalStrategyOneBotReport["hotPath"] {
  const targets = {
    marketUpdateToDecisionP95Ms:
      25 as const,
    marketUpdateToDecisionP99Ms:
      40 as const,
    decisionToQueueP95Ms:
      10 as const,
    decisionToQueueP99Ms:
      25 as const,
    candidateDecisionToExecutionStartP95Ms:
      25 as const,
    candidateDecisionToExecutionStartP99Ms:
      40 as const,
    decisionToExecutionCompleteP99Ms:
      40 as const,
    maximumDroppedCandidateSnapshots:
      0 as const,
  };

  const gates = {
    marketUpdateToDecision:
      assessLatencyTarget(
        runner.latency
          .eventLatestUpdateToDecisionMs,
        targets
          .marketUpdateToDecisionP95Ms,
        targets
          .marketUpdateToDecisionP99Ms,
      ),
    decisionToQueue:
      assessLatencyTarget(
        scheduler.latency
          .decisionToQueueMs,
        targets
          .decisionToQueueP95Ms,
        targets
          .decisionToQueueP99Ms,
      ),
    candidateDecisionToExecutionStart:
      assessLatencyTarget(
        scheduler.latency
          .candidateDecisionToExecutionStartMs,
        targets
          .candidateDecisionToExecutionStartP95Ms,
        targets
          .candidateDecisionToExecutionStartP99Ms,
      ),
    decisionToExecutionComplete:
      assessTailLatencyTarget(
        scheduler.latency
          .decisionToExecutionCompleteMs,
        targets
          .decisionToExecutionCompleteP99Ms,
      ),
    candidateSnapshotDrops:
      scheduler.latency
        .decisionToQueueMs
        .sampleCount <
          20
        ? "COLLECTING" as const
        : scheduler
              .droppedCandidateSnapshotEvents <=
            targets
              .maximumDroppedCandidateSnapshots
          ? "PASS" as const
          : "MISS" as const,
  };

  const states =
    Object.values(
      gates,
    );

  const state:
    PersonalStrategyOneBotReport["hotPath"]["state"] =
    states.includes(
      "MISS",
    )
      ? "MISS"
      : states.every(
          (
            item,
          ) =>
            item ===
            "PASS",
        )
        ? "PASS"
        : "COLLECTING";

  return {
    codeSideOnly:
      true,
    sampleWindowCapacity:
      512,
    state,
    scanner: {
      eventDriven:
        runner.eventDriven,
      minimumEventScanIntervalMs:
        runner.minimumEventScanIntervalMs,
      executableUpdatesReceived:
        runner.executableUpdatesReceived,
      coalescedExecutableUpdates:
        runner.coalescedExecutableUpdates,
      marketUpdateToDecisionMs:
        runner.latency
          .eventLatestUpdateToDecisionMs,
      evaluationMs:
        runner.latency
          .endToEndEvaluationMs,
    },
    automation: {
      decisionToQueueMs:
        scheduler.latency
          .decisionToQueueMs,
      candidateDecisionToExecutionStartMs:
        scheduler.latency
          .candidateDecisionToExecutionStartMs,
      decisionToExecutionCompleteMs:
        scheduler.latency
          .decisionToExecutionCompleteMs,
      pendingSnapshots:
        scheduler.pendingSnapshotEvents,
      pendingSnapshotHighWaterMark:
        scheduler.pendingSnapshotHighWaterMark,
      coalescedEmptySnapshots:
        scheduler.coalescedEmptySnapshotEvents,
      coalescedCandidateSnapshots:
        scheduler.coalescedCandidateSnapshotEvents,
      droppedCandidateSnapshots:
        scheduler.droppedCandidateSnapshotEvents,
    },
    targets,
    gates,
  };
}

function assessLatencyTarget(
  distribution:
    OpportunityLatencyDistribution |
    AutomationLatencyDistribution,
  targetP95Ms:
    number,
  targetP99Ms:
    number,
): "COLLECTING" | "PASS" | "MISS" {
  if (
    distribution.sampleCount <
      20 ||
    distribution.p95Ms ===
      null ||
    distribution.p99Ms ===
      null
  ) {
    return "COLLECTING";
  }

  return distribution.p95Ms <=
      targetP95Ms &&
    distribution.p99Ms <=
      targetP99Ms
    ? "PASS"
    : "MISS";
}

function assessTailLatencyTarget(
  distribution:
    OpportunityLatencyDistribution |
    AutomationLatencyDistribution,
  targetP99Ms:
    number,
): "COLLECTING" | "PASS" | "MISS" {
  if (
    distribution.sampleCount <
      20 ||
    distribution.p99Ms ===
      null
  ) {
    return "COLLECTING";
  }

  return distribution.p99Ms <=
    targetP99Ms
    ? "PASS"
    : "MISS";
}

function compareOpportunities(first: ArbitrageOpportunity, second: ArbitrageOpportunity): number {
  const decisionRank = {EXECUTE: 0, REVIEW: 1, SKIP: 2};
  return decisionRank[first.decision] - decisionRank[second.decision] ||
    second.netProfitPercent - first.netProfitPercent || second.netProfit - first.netProfit ||
    first.pair.market.localeCompare(second.pair.market) || first.id.localeCompare(second.id);
}

function nextAction(state: PersonalStrategyOneBotState): string {
  switch (state) {
    case "PAUSED": return "BOT is paused. Market scanning remains active; turn BOT ON to permit new automatic PAPER executions.";
    case "BLOCKED": return "Resolve the exact PAPER/account blocker shown below; no execution is inferred.";
    case "COLLECTING_PAPER_SOAK": return "Keep the Strategy #1 PAPER path running until the required reconciled pass streak completes.";
    case "DAILY_LIMIT_REACHED": return "Wait for the natural local-day risk-budget reset; the bot will resume without changing policy.";
    case "WAITING_FOR_OPPORTUNITY": return "Keep market data running and wait for a fresh net-profitable cross-exchange opportunity.";
    case "WAITING_FOR_PAPER_CAPACITY": return "An EXECUTE signal exists, but current depth, fees, PAPER capital or exchange rules leave no safe simulated quantity.";
    case "OBSERVING_OPPORTUNITY": return "The current spread is being observed but has not earned an EXECUTE decision.";
    case "READY_TO_EXECUTE_PAPER": return "Automatic PAPER execution owns the next qualified candidate; no manual action is required.";
  }
}

function toOpportunity(
  item: ArbitrageOpportunity,
  funding: StrategyOneFundedRouteReport | null,
): PersonalStrategyOneOpportunity {
  const fundedCapitalInr =
    funding?.estimatedExecutableCapitalInr ??
    null;

  const modeledNetProfitInr =
    fundedCapitalInr !== null &&
    Number.isFinite(fundedCapitalInr) &&
    fundedCapitalInr > 0 &&
    Number.isFinite(item.netProfitPercent)
      ? fundedCapitalInr *
        item.netProfitPercent /
        100
      : null;

  return {
    id: item.id,
    market: item.pair.market,
    buyExchange: item.pair.buy.exchange,
    sellExchange: item.pair.sell.exchange,
    decision: item.decision,
    modeledNetProfitInr,
    netProfit: item.netProfit,
    netProfitPercent: item.netProfitPercent,
    executableQuantity: item.executableQty,
    score: item.score,
    observedAt: item.timestamp,
    funding,
  };
}

function uniqueOpportunities(
  opportunities: readonly ArbitrageOpportunity[],
): ArbitrageOpportunity[] {
  const byId = new Map<string, ArbitrageOpportunity>();
  for (const opportunity of opportunities) byId.set(opportunity.id, opportunity);
  return [...byId.values()];
}

function buildInventoryPlan(
  executableOpportunities: readonly ArbitrageOpportunity[],
  fundingByOpportunityId: ReadonlyMap<string, StrategyOneFundedRouteReport>,
  requestedCapitalInr: number,
  now: number,
): PersonalStrategyOneBotReport["inventoryPlan"] {
  const unrankedRoutes = executableOpportunities.flatMap((opportunity) => {
    const funding = fundingByOpportunityId.get(opportunity.id);
    if (!funding) return [];

    const buyRequirement = buildInventoryRequirement("BUY_QUOTE", funding.buyFunding);
    const sellRequirement = buildInventoryRequirement("SELL_BASE", funding.sellFunding);
    const targetQuantity = funding.preFundingQuantity;
    const quoteToInrRate = funding.convertedQuoteCapital !== null &&
      Number.isFinite(funding.convertedQuoteCapital) && funding.convertedQuoteCapital > 0 &&
      Number.isFinite(funding.requestedCapitalInr) && funding.requestedCapitalInr > 0
      ? funding.requestedCapitalInr / funding.convertedQuoteCapital
      : null;
    const modeledNetProfitInr = targetQuantity !== null &&
      Number.isFinite(targetQuantity) && targetQuantity > 0 && quoteToInrRate !== null &&
      Number.isFinite(opportunity.netProfit)
      ? opportunity.netProfit * targetQuantity * quoteToInrRate
      : null;
    const requirements = [buyRequirement, sellRequirement] as const;
    const fullySpecified = targetQuantity !== null && Number.isFinite(targetQuantity) &&
      targetQuantity > 0 && requirements.every((requirement) =>
        requirement.asset !== null && requirement.requiredAmount !== null &&
        requirement.planningAvailableAmount !== null && requirement.deficitAmount !== null);

    return [{
      rank: 0,
      opportunityId: opportunity.id,
      routeKey: funding.routeKey,
      market: funding.market,
      buyExchange: funding.buyExchange,
      sellExchange: funding.sellExchange,
      baseAsset: funding.baseAsset,
      quoteAsset: funding.quoteAsset,
      fundingState: funding.state,
      targetQuantity,
      modeledNetProfitInr,
      modeledNetReturnPercent: opportunity.netProfitPercent,
      fullySpecified,
      requirements,
      blockers: [...new Set([
        ...funding.blockers,
        ...requirements
          .filter((requirement) => requirement.evidence === "UNAVAILABLE")
          .map((requirement) => `${requirement.exchange} ${requirement.asset ?? "UNKNOWN"} balance evidence is unavailable.`),
      ])],
    } satisfies PersonalStrategyOneInventoryRoute];
  });

  const rankedRoutes = unrankedRoutes
    .sort(compareInventoryRoutes)
    .map((route, index) => ({...route, rank: index + 1}));
  const readyRoute = rankedRoutes.find((route) =>
    route.fundingState !== "BLOCKED" && route.requirements.every((requirement) =>
      requirement.deficitAmount === 0));
  const fundableRoute = rankedRoutes.find((route) => route.fullySpecified);
  const recommendedRoute = readyRoute ?? fundableRoute ?? null;
  const recommendationStatus = executableOpportunities.length === 0
    ? "NO_CURRENT_EXECUTE_ROUTE" as const
    : readyRoute
      ? "READY" as const
      : fundableRoute
        ? "FUNDING_REQUIRED" as const
        : "EVIDENCE_INCOMPLETE" as const;

  return {
    mode: "ADVISORY_PREPOSITIONING" as const,
    generatedAt: now,
    requestedCapitalInr,
    recommendationStatus,
    recommendedRoute,
    alternatives: rankedRoutes.filter((route) =>
      route.opportunityId !== recommendedRoute?.opportunityId),
    safety: {
      advisoryOnly: true as const,
      transferInitiated: false as const,
      withdrawalInitiated: false as const,
      balanceMutated: false as const,
      liveExecutionAllowed: false as const,
      orderSubmissionAllowed: false as const,
    },
  };
}

function buildInventoryRequirement(
  side: PersonalStrategyOneInventoryRequirement["side"],
  leg: StrategyOneFundedRouteReport["buyFunding"],
): PersonalStrategyOneInventoryRequirement {
  const availableAmount = leg.availableBalance !== null &&
    Number.isFinite(leg.availableBalance) && leg.availableBalance >= 0
    ? leg.availableBalance
    : null;
  const synchronizedAssetOmitted = availableAmount === null && leg.asset !== null &&
    leg.synchronizationStatus === "SYNCHRONIZED";
  const planningAvailableAmount = availableAmount ?? (synchronizedAssetOmitted ? 0 : null);
  const requiredAmount = leg.requiredBalance !== null &&
    Number.isFinite(leg.requiredBalance) && leg.requiredBalance >= 0
    ? leg.requiredBalance
    : null;
  const deficitAmount = planningAvailableAmount !== null && requiredAmount !== null
    ? Math.max(0, requiredAmount - planningAvailableAmount)
    : null;
  const evidence = availableAmount !== null
    ? "PRESENT" as const
    : synchronizedAssetOmitted
      ? "SYNCHRONIZED_ASSET_OMITTED" as const
      : "UNAVAILABLE" as const;
  const walletLabel = side === "BUY_QUOTE" ? "BUY wallet" : "SELL inventory";
  const action = leg.asset === null || deficitAmount === null
    ? `Refresh authenticated ${walletLabel} evidence on ${leg.exchange}.`
    : deficitAmount > 0
      ? `Pre-position ${formatInventoryAmount(deficitAmount)} ${leg.asset} in the ${leg.exchange} ${walletLabel}.`
      : `No additional ${leg.asset} is required in the ${leg.exchange} ${walletLabel}.`;

  return {
    side,
    exchange: leg.exchange,
    asset: leg.asset,
    requiredAmount,
    availableAmount,
    planningAvailableAmount,
    deficitAmount,
    evidence,
    action,
  };
}

function compareInventoryRoutes(
  first: PersonalStrategyOneInventoryRoute,
  second: PersonalStrategyOneInventoryRoute,
): number {
  const firstProfit = first.modeledNetProfitInr ?? Number.NEGATIVE_INFINITY;
  const secondProfit = second.modeledNetProfitInr ?? Number.NEGATIVE_INFINITY;
  return secondProfit - firstProfit ||
    second.modeledNetReturnPercent - first.modeledNetReturnPercent ||
    first.routeKey.localeCompare(second.routeKey) ||
    first.opportunityId.localeCompare(second.opportunityId);
}

function formatInventoryAmount(value: number): string {
  return Number(value.toPrecision(10)).toString();
}

function startOfLocalDay(now: number): number {
  const indiaClock = new Date(now + BOT_CLOCK_UTC_OFFSET_MS);

  return Date.UTC(
    indiaClock.getUTCFullYear(),
    indiaClock.getUTCMonth(),
    indiaClock.getUTCDate(),
  ) - BOT_CLOCK_UTC_OFFSET_MS;
}

function buildLocalHourlyBuckets(
  now: number,
  successfulToday: readonly PaperTrade[],
): PersonalStrategyOneHourlyBucket[] {
  const localDayStart = startOfLocalDay(now);
  const currentHour = new Date(now + BOT_CLOCK_UTC_OFFSET_MS).getUTCHours();
  const counts = Array.from({length: 24}, () => 0);
  const realizedPnl = Array.from({length: 24}, () => 0);

  for (const trade of successfulToday) {
    const completedAt = trade.closedAt ?? trade.openedAt;

    if (completedAt < localDayStart || completedAt > now) {
      continue;
    }

    const completedHour = new Date(completedAt + BOT_CLOCK_UTC_OFFSET_MS).getUTCHours();
    counts[completedHour] += 1;
    realizedPnl[completedHour] += trade.actualProfit ?? 0;
  }

  return counts.map((successfulTrades, hour) => {
    const startAt = localDayStart + hour * HOUR_MS;
    const endAt = startAt + HOUR_MS;

    return {
      hour,
      label: `${twoDigitHour(hour)}:00 - ${twoDigitHour((hour + 1) % 24)}:00`,
      startAt,
      endAt,
      successfulTrades,
      realizedPnl: realizedPnl[hour],
      current: hour === currentHour,
    };
  });
}

function twoDigitHour(hour: number): string {
  return String(hour).padStart(2, "0");
}

function sumRealizedPnl(trades: readonly PaperTrade[]): number {
  return trades.reduce((total, trade) => total + (trade.actualProfit ?? 0), 0);
}

function buildCapitalManagerProfitEvidence(
  credibleSettlements: readonly PaperTrade[],
  strategyTrades: readonly PaperTrade[],
): {
  credibleSettlements: number;
  grossTradingProfitInr: number;
  tradingFeesInr: number;
  economicNetPnlInr: number;
  tdsWithheldInr: number;
  deployableCashPnlInr: number;
  realizedLossesInr: number;
  pendingSettlements: number;
} {
  const tradingFeesInr = credibleSettlements.reduce(
    (total, trade) => total + trade.estimatedFees,
    0,
  );
  const economicNetPnlInr = sumRealizedPnl(credibleSettlements);
  const tdsWithheldInr = credibleSettlements.reduce(
    (total, trade) => total + (trade.tdsWithheld ?? 0),
    0,
  );
  const deployableCashPnlInr = credibleSettlements.reduce(
    (total, trade) => total + (
      trade.deployableCashProfit ??
      (trade.actualProfit ?? 0) - (trade.tdsWithheld ?? 0)
    ),
    0,
  );
  const realizedLossesInr = credibleSettlements.reduce(
    (total, trade) => total + Math.abs(Math.min(0, trade.actualProfit ?? 0)),
    0,
  );
  const finalStatuses = new Set<PaperTrade["status"]>([
    "closed",
    "cancelled",
    "failed",
  ]);

  return {
    credibleSettlements: credibleSettlements.length,
    grossTradingProfitInr: economicNetPnlInr + tradingFeesInr,
    tradingFeesInr,
    economicNetPnlInr,
    tdsWithheldInr,
    deployableCashPnlInr,
    realizedLossesInr,
    pendingSettlements: strategyTrades.filter(
      (trade) => !finalStatuses.has(trade.status),
    ).length,
  };
}

function splitMarket(market: string): {baseAsset: string; quoteAsset: string} {
  const normalized = market.trim().toUpperCase();
  const separated = normalized.split(/[_\-/]/).filter(Boolean);
  if (separated.length >= 2) {
    return {baseAsset: separated[0], quoteAsset: separated.slice(1).join("")};
  }
  const quoteAssets = ["USDT", "USDC", "BUSD", "INR", "BTC", "ETH"];
  const quoteAsset = quoteAssets.find((candidate) =>
    normalized.endsWith(candidate) && normalized.length > candidate.length) ?? "QUOTE";
  return {
    baseAsset: quoteAsset === "QUOTE" ? normalized : normalized.slice(0, -quoteAsset.length),
    quoteAsset,
  };
}

function freeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freeze(nested);
  return Object.freeze(value);
}

export const personalStrategyOneBotService = new PersonalStrategyOneBotService();
