export type LiquidityQualificationAlignment =
  | "SIMULATION_UNAVAILABLE"
  | "ALIGNED_INSUFFICIENT"
  | "CAPITAL_AWARE_MISMATCH"
  | "CAPITAL_DEPENDENT"
  | "ALIGNED_HEALTHY";

export interface LiquidityCapitalAuditPoint {
  capital: number;

  simulationSuccess: boolean;

  fullyExecutable: boolean;

  fillPercent: number | null;

  requestedQuantity: number | null;

  executableQuantity: number | null;

  executableCapital: number | null;

  consumedLevels: number | null;

  buyVWAP: number | null;

  sellVWAP: number | null;

  buySlippagePercent: number | null;

  sellSlippagePercent: number | null;

  totalSlippagePercent: number | null;

  netProfit: number | null;

  netProfitPercent: number | null;

  confidenceScore: number | null;

  recommendation: string | null;

  failureReason: string | null;
}

export interface LiquidityQualificationAuditRoute {
  candidateKey: string;

  market: string;

  buyExchange: string;

  sellExchange: string;

  currentCandidateActive: boolean;

  evidence: {
    maximumLiquidityScore: number;

    maximumFreshnessScore: number;

    bestNetProfitPercent: number;

    bestQualificationScore: number;

    maximumConsecutiveObservations: number;

    maximumLifetimeMs: number;

    qualifiedEvaluations: number;

    liquidityFailureObservations: number;
  };

  currentQualification: {
    found: boolean;

    status: string | null;

    liquidityScore: number | null;

    liquidityPassed: boolean | null;
  };

  referenceLiquidity: {
    referenceCapital: number;

    engineMinimumLiquidityPercent: number;

    qualificationMinimumLiquidityScore: number;

    approximateMaximumTopOfBookCapitalFromEvidence:
      number | null;
  };

  alignment:
    LiquidityQualificationAlignment;

  smallestFullyExecutableCapital:
    number | null;

  largestFullyExecutableCapital:
    number | null;

  smallestProfitableFullyExecutableCapital:
    number | null;

  largestProfitableFullyExecutableCapital:
    number | null;

  capitalAudit:
    LiquidityCapitalAuditPoint[];

  observations: string[];
}

export interface LiquidityQualificationAuditReport {
  generatedAt: number;

  version: "17.4";

  build: "11";

  mode: "DIAGNOSTIC_ONLY";

  tradingPolicyMutationAllowed: false;

  paperExecutionAllowed: false;

  liveExecutionAllowed: false;

  configuration: {
    policyReferenceCapital: number;

    engineMinimumLiquidityPercent: number;

    qualificationMinimumLiquidityScore: number;

    testedCapitalPoints: number[];

    maximumRoutesAnalyzed: number;
  };

  summary: {
    evidenceRoutes: number;

    analyzedRoutes: number;

    routesWithLiquidityFailureEvidence: number;

    routesWithSuccessfulSimulation: number;

    alignedInsufficientRoutes: number;

    capitalAwareMismatchRoutes: number;

    capitalDependentRoutes: number;

    alignedHealthyRoutes: number;
  };

  routes:
    LiquidityQualificationAuditRoute[];

  observations: string[];
}