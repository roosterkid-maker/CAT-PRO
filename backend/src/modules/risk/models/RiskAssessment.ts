export interface RiskAssessment {
  approved: boolean;

  score: number;

  rejectionReasons: string[];

  liquidityScore: number;

  spreadScore: number;

  feeScore: number;

  capitalScore: number;

  overallScore: number;

  evaluatedAt: number;
}