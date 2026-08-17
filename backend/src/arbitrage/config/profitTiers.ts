export type ProfitTier =
  | "BELOW_DISCOVERY"
  | "DISCOVERED"
  | "QUALIFIED"
  | "LIVE_ELIGIBLE";

/*
 * V19.19
 *
 * Centralized profit policy.
 *
 * IMPORTANT:
 *
 * These thresholds apply only after the opportunity
 * engine's fee calculation. They do not bypass:
 *
 * - freshness
 * - pair synchronization
 * - liquidity
 * - quote integrity
 * - execution simulation
 * - slippage / safety buffer
 * - risk
 * - last-look
 */
export const PROFIT_TIER_POLICY = {
  discoveryMinimumNetProfitPercent:
    0.05,

  qualificationMinimumNetProfitPercent:
    0.30,

  liveMinimumNetProfitPercent:
    0.50,
} as const;

export function classifyProfitTier(
  netProfitPercent:
    number,
): ProfitTier {
  if (
    netProfitPercent >=
    PROFIT_TIER_POLICY
      .liveMinimumNetProfitPercent
  ) {
    return "LIVE_ELIGIBLE";
  }

  if (
    netProfitPercent >=
    PROFIT_TIER_POLICY
      .qualificationMinimumNetProfitPercent
  ) {
    return "QUALIFIED";
  }

  if (
    netProfitPercent >=
    PROFIT_TIER_POLICY
      .discoveryMinimumNetProfitPercent
  ) {
    return "DISCOVERED";
  }

  return "BELOW_DISCOVERY";
}
