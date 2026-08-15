export type V18AcceptanceGateState =
  | "PASS"
  | "WARNING"
  | "BLOCKED";

export interface V18AcceptanceGate {
  key: string;

  state:
    V18AcceptanceGateState;

  category:
    | "PERSISTENCE"
    | "RECOVERY"
    | "ACCOUNTING"
    | "SECURITY"
    | "CLOCK"
    | "ALERTING"
    | "EXECUTION"
    | "VALIDATION"
    | "TINY_LIVE";

  requiredForV18Acceptance: boolean;

  requiredForTinyLive: boolean;

  message: string;

  reasons: string[];
}

export interface V18ProductionReadinessReport {
  generatedAt: number;

  version: "18.0";

  build: "16";

  finalAcceptanceGate: true;

  liveTradingEnabled: false;

  liveSubmissionAllowed: false;

  automaticLivePromotionAllowed: false;

  automaticOrderSubmissionAllowed: false;

  v18HardeningAccepted: boolean;

  tinyLiveOperationalReady: boolean;

  status:
    | "V18_ACCEPTED_TINY_LIVE_NOT_READY"
    | "V18_ACCEPTED_TINY_LIVE_READY"
    | "V18_NOT_ACCEPTED";

  summary: {
    totalGates: number;

    passed: number;

    warnings: number;

    blocked: number;

    v18AcceptanceBlockers: number;

    tinyLiveBlockers: number;
  };

  gates:
    V18AcceptanceGate[];

  blockers: {
    v18Acceptance:
      string[];

    tinyLive:
      string[];
  };

  safety: {
    maximumTinyLiveCapital: 500;

    minimumTinyLiveCapital: 100;

    realOrderSubmissionImplementedByBuild16:
      false;

    realMoneyUsedByAcceptanceCheck:
      false;

    recoveryMustBeClean:
      true;

    unresolvedCriticalAlertsAllowed:
      false;

    accountingUncertaintyAllowed:
      false;

    duplicateSubmissionRiskAllowed:
      false;
  };

  notes: string[];
}