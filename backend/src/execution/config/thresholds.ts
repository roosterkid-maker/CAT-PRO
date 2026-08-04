export const EXECUTION_THRESHOLDS = {
  confidence: {
    execute: 85,
    review: 60,
  },

  liquidity: {
    minimumFillPercent: 100,
  },

  slippage: {
    maximumPercent: 0.50,
  },

  profit: {
    minimumNetProfitPercent: 0.05,
  },
} as const;