export type RiskLevel =
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "BLOCKED";

export interface RiskAssessmentChecks {
  marketIntegrity: boolean;

  executionQuality: boolean;

  capitalAvailable: boolean;

  exposureAllowed: boolean;

  dailyLimitsAllowed: boolean;
}

export interface RiskAssessment {
  level:
    RiskLevel;

  approved:
    boolean;

  score:
    number;

  reasons:
    string[];

  warnings:
    string[];

  checks:
    RiskAssessmentChecks;
}