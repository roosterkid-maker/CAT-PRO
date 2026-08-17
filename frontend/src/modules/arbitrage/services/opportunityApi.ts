import {
  api,
} from "@/api/client";

import type {
  CandidateLastLookResponse,
} from "../types/LastLook";

import type {
  OpportunitiesResponse,
} from "../types/Opportunity";

export async function fetchOpportunities(): Promise<OpportunitiesResponse> {
  const response =
    await api.get<OpportunitiesResponse>(
      "/api/opportunities",
    );

  return response.data;
}

export async function fetchOpportunityLastLook(
  opportunityId: string,
): Promise<CandidateLastLookResponse> {
  const response =
    await api.get<CandidateLastLookResponse>(
      `/api/debug/candidates/${encodeURIComponent(
        opportunityId,
      )}/last-look`,
      {
        validateStatus: (
          status,
        ) =>
          status === 200 ||
          status === 404,
      },
    );

  return response.data;
}