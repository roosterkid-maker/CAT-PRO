export type RiskLevel =
  | "LOW"
  | "MEDIUM"
  | "HIGH";

export interface RiskAssessment {
  level: RiskLevel;

  approved: boolean;

  score: number;

  reasons: string[];
}