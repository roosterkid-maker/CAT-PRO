export type RecoveryResolutionBasis =
  | "AUTHORITATIVE_TERMINAL_BALANCED"
  | "PERSISTED_PRE_SUBMISSION_NO_ORDER";

export interface ExecutionRecoveryResolutionRecord {
  schemaVersion: 1;

  sessionId: string;

  status:
    "RESOLVED";

  basis:
    RecoveryResolutionBasis;

  evidenceFingerprint:
    string;

  resolutionNote:
    string;

  resolvedAt:
    number;

  authoritativeOrdersChecked:
    number;

  authoritativeFilledBuyQuantity:
    number;

  authoritativeFilledSellQuantity:
    number;

  evidence: {
    interruptedSessionStatus:
      string | null;

    riskyOrderIds:
      string[];

    authoritativeStatuses:
      Array<{
        lifecycleOrderId: string;

        leg:
          "BUY" |
          "SELL";

        exchange: string;

        exchangeOrderId:
          string | null;

        status:
          string | null;

        filledQuantity:
          number | null;
      }>;
  };
}

export interface ExecutionRecoveryResolutionDiagnostics {
  generatedAt: number;

  version: "18.0";

  build: "13";

  liveTradingEnabled: false;

  liveSubmissionAllowed: false;

  automaticRecoveryAllowed: false;

  automaticGateClearingAllowed: false;

  explicitEvidenceRequired: true;

  restored: boolean;

  restoredAt:
    number | null;

  totalResolutions: number;

  currentlyValidResolutions: number;

  staleResolutions: number;

  writes: number;

  writeFailures: number;

  lastError:
    string | null;

  resolutions:
    ExecutionRecoveryResolutionRecord[];
}