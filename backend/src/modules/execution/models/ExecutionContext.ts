import { ExecutionState } from "./ExecutionState";

export interface ExecutionContext {
  tradeId: string;

  market: string;

  state: ExecutionState;

  capital: number;

  buyExchange: string;

  sellExchange: string;

  createdAt: number;

  updatedAt: number;
}