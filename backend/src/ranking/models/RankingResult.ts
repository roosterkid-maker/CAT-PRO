import type { OpportunityScore } from "./OpportunityScore";

export interface RankingResult {
  opportunities:
    OpportunityScore[];

  generatedAt: number;
}