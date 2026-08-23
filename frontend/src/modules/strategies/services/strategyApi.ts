import {
  api,
} from "@/api/client";

import type {
  StrategyCollectionResponse,
  StrategyDetailResponse,
} from "../types/Strategy";

import type {
  CentralPaperLifecycleResponse,
} from "../types/CentralPaperLifecycle";

import type {
  CentralStrategyLiveReadinessResponse,
} from "../types/CentralStrategyLiveReadiness";

import type {
  StatisticalResearchEvidenceResponse,
} from "../types/StatisticalResearchEvidence";

import type {
  StatisticalPaperLifecycleResponse,
} from "../types/StatisticalPaperLifecycle";

import type {
  EightStrategyPaperReadinessResponse,
} from "../types/EightStrategyPaperReadiness";

import type {
  TriangularPaperClosureResponse,
} from "../types/TriangularPaperClosure";

import type {
  SpotPerpetualBasisPaperClosureResponse,
} from "../types/SpotPerpetualBasisPaperClosure";

import type {
  FundingRatePaperClosureResponse,
} from "../types/FundingRatePaperClosure";

import type {
  PerpetualPerpetualPaperClosureResponse,
} from "../types/PerpetualPerpetualPaperClosure";

import type {
  DynamicMarketMakingPaperClosureResponse,
} from "../types/DynamicMarketMakingPaperClosure";

import type {
  PersonalBotControlResponse,
  PersonalStrategyOneBotResponse,
  PersonalStrategyOnePerformanceSummaryResponse,
} from "../types/PersonalStrategyOneBot";

export async function fetchPersonalStrategyOneBot():
Promise<PersonalStrategyOneBotResponse> {
  const response = await api.get<PersonalStrategyOneBotResponse>(
    "/api/strategies/personal-bot",
  );
  return response.data;
}

export async function fetchPersonalStrategyOnePerformanceSummary():
Promise<PersonalStrategyOnePerformanceSummaryResponse> {
  const response = await api.get<PersonalStrategyOnePerformanceSummaryResponse>(
    "/api/strategies/personal-bot/performance-summary",
  );

  return response.data;
}

export async function updatePersonalBotControl(
  enabled: boolean,
): Promise<PersonalBotControlResponse> {
  const response = await api.post<PersonalBotControlResponse>(
    "/api/strategies/personal-bot/control",
    {enabled},
  );
  return response.data;
}

export async function fetchStrategies():
Promise<StrategyCollectionResponse> {
  const response =
    await api.get<StrategyCollectionResponse>(
      "/api/strategies",
    );

  return response.data;
}

export async function fetchStrategy(
  strategyId: string,
): Promise<StrategyDetailResponse> {
  const response =
    await api.get<StrategyDetailResponse>(
      `/api/strategies/${encodeURIComponent(
        strategyId,
      )}`,
    );

  return response.data;
}

export async function fetchCentralPaperLifecycle():
Promise<CentralPaperLifecycleResponse> {
  const response = await api.get<CentralPaperLifecycleResponse>(
    "/api/strategies/central-paper-lifecycle",
  );

  return response.data;
}

export async function fetchCentralStrategyLiveReadiness():
Promise<CentralStrategyLiveReadinessResponse> {
  const response = await api.get<CentralStrategyLiveReadinessResponse>(
    "/api/execution/strategy-live-readiness",
  );

  return response.data;
}

export async function fetchStatisticalResearchEvidence():
Promise<StatisticalResearchEvidenceResponse> {
  const response = await api.get<StatisticalResearchEvidenceResponse>(
    "/api/strategies/statistical-arbitrage/research-evidence",
  );

  return response.data;
}

export async function fetchStatisticalPaperLifecycle():
Promise<StatisticalPaperLifecycleResponse> {
  const response = await api.get<StatisticalPaperLifecycleResponse>(
    "/api/strategies/statistical-arbitrage/paper-lifecycle",
  );

  return response.data;
}

export async function fetchEightStrategyPaperReadiness():
Promise<EightStrategyPaperReadinessResponse> {
  const response = await api.get<EightStrategyPaperReadinessResponse>(
    "/api/strategies/eight-strategy-paper-readiness",
  );

  return response.data;
}

export async function fetchTriangularPaperClosure():
Promise<TriangularPaperClosureResponse> {
  const response = await api.get<TriangularPaperClosureResponse>(
    "/api/strategies/triangular-arbitrage/paper-closure",
  );

  return response.data;
}

export async function fetchSpotPerpetualBasisPaperClosure():
Promise<SpotPerpetualBasisPaperClosureResponse> {
  const response = await api.get<SpotPerpetualBasisPaperClosureResponse>(
    "/api/strategies/spot-perpetual-basis-arbitrage/paper-closure",
  );

  return response.data;
}

export async function fetchFundingRatePaperClosure():
Promise<FundingRatePaperClosureResponse> {
  const response = await api.get<FundingRatePaperClosureResponse>(
    "/api/strategies/funding-rate-arbitrage/paper-closure",
  );

  return response.data;
}

export async function fetchPerpetualPerpetualPaperClosure():
Promise<PerpetualPerpetualPaperClosureResponse> {
  const response = await api.get<PerpetualPerpetualPaperClosureResponse>(
    "/api/strategies/perpetual-perpetual-arbitrage/paper-closure",
  );

  return response.data;
}

export async function fetchDynamicMarketMakingPaperClosure():
Promise<DynamicMarketMakingPaperClosureResponse> {
  const response = await api.get<DynamicMarketMakingPaperClosureResponse>(
    "/api/strategies/dynamic-market-making/paper-closure",
  );

  return response.data;
}
