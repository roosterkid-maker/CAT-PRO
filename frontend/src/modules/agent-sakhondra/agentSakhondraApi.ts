import {
  useQuery,
} from "@tanstack/react-query";

import {
  api,
} from "@/api/client";

export interface AgentSakhondraRecommendation {
  id: string;
  priority: "P0" | "P1" | "P2";
  area: "EXECUTION" | "PROFIT" | "TIMING" | "DATA" | "INVENTORY";
  title: string;
  finding: string;
  observed: string;
  target: string;
  action: string;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  evidenceSamples: number;
  requiresHumanApproval: true;
}

export interface AgentSakhondraRouteReport {
  routeKey: string;
  market: string;
  buyExchange: string;
  sellExchange: string;
  candidateGenerations: number;
  liveEligibleGenerations: number;
  attempts: number;
  completedTwoLeg: number;
  settled: number;
  unsuccessful: number;
  realizedNetProfit: number | null;
  averageRoiPercent: number | null;
  p95CandidateNetPercent: number | null;
  buyBookAgeP99Ms: number | null;
  sellBookAgeP99Ms: number | null;
  decisionToStartP99Ms: number | null;
  operationalHeadroomMs: number | null;
  dominantBlocker: string | null;
}

export interface AgentSakhondraReport {
  schemaVersion: "1.0";
  generatedAt: number;
  agent: {
    id: "AGENT_SAKHONDRA";
    name: "AGENT SAKHONDRA";
    mode: "LIVE_INTELLIGENCE_ONLY";
    state: "NO_LIVE_ATTEMPTS" | "LIVE_EVIDENCE_COLLECTING" | "LIVE_EVIDENCE_AVAILABLE" | "ATTENTION_REQUIRED";
    summary: string;
  };
  evidenceBoundary: {
    opportunityEvidence: string;
    executionEvidence: string;
    settlementEvidence: string;
    paperExecutionsIncluded: false;
    syntheticExecutionsIncluded: false;
  };
  window: {
    liveJournalFirstAt: number | null;
    liveJournalLastAt: number | null;
    retainedLiveSessions: number;
    rollingHourStartsAt: number;
  };
  conversion: {
    candidateGenerations: number;
    qualifiedCandidateGenerations: number;
    dispatchReadyCandidateGenerations: number;
    currentFullyPreflightableRoutes: number;
    liveAttempts: number;
    liveAttemptsLastHour: number;
    completedTwoLeg: number;
    completedTwoLegLastHour: number;
    settledLiveTrades: number;
    unsuccessfulLiveAttempts: number;
    possibleExposureOrRecovery: number;
    attemptToSettlementPercent: number | null;
    completedToSettlementPercent: number | null;
  };
  economics: {
    settledSamples: number;
    profitableSettlements: number;
    lossSettlements: number;
    realizedNetProfit: number | null;
    totalFees: number | null;
    averageRoiPercent: number | null;
    minimumRoiPercent: number | null;
    maximumRoiPercent: number | null;
    evidenceAvailable: boolean;
  };
  timing: {
    maximumBookAgeMs: number;
    routesWithEvidence: number;
    routesWithLiveDispatches: number;
    worstBookAgeP99Ms: number | null;
    decisionToStartP99Ms: number | null;
    operationalHeadroomMs: number | null;
    requiredHeadroomMs: 5;
  };
  unsuccessfulReasons: Array<{
    rank: number;
    reason: string;
    count: number;
    source: "LIVE_SESSION" | "LIVE_SETTLEMENT" | "CANDIDATE_GATE";
  }>;
  routes: AgentSakhondraRouteReport[];
  recommendations: AgentSakhondraRecommendation[];
  codexPrompt: string;
  safety: {
    readOnly: true;
    canSubmitOrders: false;
    canChangePolicy: false;
    canArmLive: false;
    canMoveFunds: false;
    recommendationsRequireHumanReview: true;
    profitIsNotGuaranteed: true;
  };
}

interface AgentSakhondraResponse {
  success: true;
  data: AgentSakhondraReport;
}

async function fetchAgentSakhondraReport(): Promise<AgentSakhondraResponse> {
  const response = await api.get<AgentSakhondraResponse>("/api/agent-sakhondra/report");
  return response.data;
}

export function useAgentSakhondraReport() {
  return useQuery({
    queryKey: ["agent-sakhondra", "live-intelligence", "v1"],
    queryFn: fetchAgentSakhondraReport,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    staleTime: 5_000,
    retry: 2,
  });
}
