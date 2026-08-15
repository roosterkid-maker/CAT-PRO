export type FailureInjectionDrillStatus =
  | "PASS"
  | "FAIL";

export interface FailureInjectionDrillResult {
  key: string;

  title: string;

  status:
    FailureInjectionDrillStatus;

  expected: string;

  observed: string;

  durationMs: number;

  error:
    string | null;
}

export interface FailureInjectionValidationReport {
  generatedAt: number;

  version: "18.0";

  build: "14";

  syntheticOnly: true;

  realExchangeCallsMade: false;

  realOrdersSubmitted: false;

  realOrdersCancelled: false;

  realMoneyUsed: false;

  liveTradingEnabled: false;

  liveSubmissionAllowed: false;

  summary: {
    total: number;

    passed: number;

    failed: number;

    allPassed: boolean;
  };

  drills:
    FailureInjectionDrillResult[];

  notes: string[];
}