export interface CentralPaperLifecycleSnapshot {
  version: "62.0";
  generatedAt: number;
  state: "DISABLED" | "BLOCKED" | "OBSERVING" | "ACTIVE";
  evidenceStatus: "AVAILABLE";
  operator: {
    centralPaperEnabled: boolean;
    confirmationPresent: boolean;
    allowedStrategies: string[];
  };
  pipeline: {
    admission: {running: boolean; observed: number; plansCompiled: number};
    intake: {running: boolean; observed: number; blocked: number; queued: number; duplicate: number; failed: number};
    queue: {records: number; queued: number; leased: number; completed: number; rejected: number; expired: number};
    worker: {enabled: boolean; serviceRunning: boolean; running: boolean; runs: number; completed: number; recoveryStaged: number; failed: number};
    journal: {records: number; readyForPositionAccounting: number; pendingSharedRecovery: number; sharedRecoveryStaged: number; recoveryStagingFailed: number; recoveryCompleted: number; positionAccounted: number};
    positions: {groups: number; openGroups: number; cycleCapturedGroups: number; closedGroups: number; realizedPnlEvidenceStatus: "AVAILABLE" | "NO_DATA"; realizedNetPnlQuote: number | null};
    positionLifecycle: {enabled: boolean; serviceRunning: boolean; running: boolean; scans: number; closed: number; accounted: number; reconciled: number; blocked: number};
    accounting: {records: number; pending: number; posted: number; totalPostedPnlInr: number};
    capital: {records: number; pendingReserve: number; active: number; pendingRelease: number; released: number; rejected: number; activeAmountInr: number};
    recovery: {enabled: boolean; serviceRunning: boolean; running: boolean; scans: number; completed: number; accounted: number; blocked: number};
  };
  derivativeEvidence: {
    requiredByStrategies: string[];
    authenticatedProvidersReady: number;
    authenticatedProviders: Array<{exchange: string; state: string; configured: boolean; lastError: string | null}>;
    feeProvidersConfigured: number;
    missingFeeProviders: string[];
    settledFundingEvidence: number;
    exactFundingMarkPrices: number;
    proxyFundingMarkPrices: number;
    fundingProvidersReady: number;
    fundingProviders: Array<{exchange: string; state: string; lastError: string | null}>;
  };
  blockers: string[];
  safety: {
    oneCentralAdmission: true;
    oneDurableQueue: true;
    journalBeforeAccounting: true;
    closedUnaccountedReconciliation: true;
    durableCapitalAllocation: true;
    sharedRecoveryOnly: true;
    executablePaperRecovery: true;
    evidenceIsNotProfitClaim: true;
    liveExecutionAllowed: false;
    orderSubmissionAllowed: false;
  };
}

export interface CentralPaperLifecycleResponse {
  success: true;
  data: CentralPaperLifecycleSnapshot;
}
