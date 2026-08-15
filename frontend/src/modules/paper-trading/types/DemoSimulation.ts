export interface DemoSimulationSession {
  market: string;
  buyExchange: string;
  sellExchange: string;
  capital: number;
}

export interface DemoSimulationFill {
  exchange: string;
  market: string;
  side: "buy" | "sell";
  filledQuantity: number;
  fillPercent: number;
  averageFillPrice: number;
  feeAmount: number;
  complete: boolean;
  lastStatus: string;
}

export interface DemoSimulationSettlement {
  status: string;
  quantity: number;
  grossProfit: number;
  totalFees: number;
  netProfit: number;
  roiPercent: number;
}

export interface SuccessfulDemoSimulation {
  scenario: "BALANCED_SUCCESS";
  passed: boolean;
  generatedAt: number;
  noExchangeOrderSubmitted: true;
  sessionId: string | null;
  accountCapitalBefore: number;
  accountCapitalAfter: number;
  accountCapitalUnchanged: boolean;
  checks: Record<string, boolean>;
  data: {
    preparation: {
      approved: boolean;
      session: DemoSimulationSession | null;
      reasons: string[];
    };
    buyFill: DemoSimulationFill;
    sellFill: DemoSimulationFill;
    recovery: {
      requiresRecovery: boolean;
      exposureDirection: string;
    };
    settlement: DemoSimulationSettlement;
  };
}

export interface SuccessfulDemoSimulationResponse {
  success: boolean;
  data: SuccessfulDemoSimulation;
}
