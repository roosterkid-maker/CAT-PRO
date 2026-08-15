export type AutomationDashboardStage =
  | "SHADOW_LEARNING"
  | "READY_FOR_PAPER"
  | "PAPER_ARMED"
  | "PAPER_ACTIVE"
  | "DEGRADED";

export interface AutomationDashboardModuleState {
  name: string;

  healthy: boolean;

  status: string;

  details: Record<
    string,
    string | number | boolean | null
  >;
}

export interface AutomationPerformanceDashboard {
  generatedAt: number;

  version: "16.4";

  mode: "AUTOMATION";

  stage: AutomationDashboardStage;

  overallHealthy: boolean;

  liveExecutionAllowed: false;

  summary: {
    schedulerRunning: boolean;

    activeOpportunities: number;

    qualifiedCandidates: number;

    readyQueueItems: number;

    shadowDispatches: number;

    completedShadowOutcomes: number;

    shadowSuccessRatePercent: number;

    readinessScore: number;

    readinessLevel: string;

    paperExecutionArmed: boolean;

    paperExecutionAllowed: boolean;

    paperTradesExecuted: number;

    adaptiveCapitalAllocations: number;

    automationLedgerEntries: number;

    currentPaperCapital: number;

    availablePaperCapital: number;

    automationNetProfit: number;
  };

  safety: {
    shadowReadinessPassed: boolean;

    paperAutomationArmed: boolean;

    paperAccountMode: boolean;

    accountingIntegrityPassed: boolean;

    liveExecutionDisabled: true;

    blockers: string[];
  };

  pipeline: {
    scannerToAutomation: boolean;

    persistence: boolean;

    qualification: boolean;

    queue: boolean;

    shadowDispatcher: boolean;

    outcomeTracking: boolean;

    performanceAnalytics: boolean;

    paperController: boolean;

    paperScheduler: boolean;

    adaptiveCapital: boolean;

    accounting: boolean;
  };

  modules: {
    scheduler: AutomationDashboardModuleState;

    monitor: AutomationDashboardModuleState;

    qualification: AutomationDashboardModuleState;

    queue: AutomationDashboardModuleState;

    shadowDispatcher: AutomationDashboardModuleState;

    shadowOutcomes: AutomationDashboardModuleState;

    shadowPerformance: AutomationDashboardModuleState;

    paperController: AutomationDashboardModuleState;

    paperScheduler: AutomationDashboardModuleState;

    adaptiveCapital: AutomationDashboardModuleState;

    accounting: AutomationDashboardModuleState;
  };
}