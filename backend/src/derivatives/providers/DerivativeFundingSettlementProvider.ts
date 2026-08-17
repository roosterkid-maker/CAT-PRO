import type {
  DerivativeFundingSettlementEvidence,
} from "../models/DerivativeFundingSettlementEvidence";

export interface DerivativeFundingSettlementProviderResult {
  readonly exchange: string;
  readonly generatedAt: number;
  readonly evidence: readonly DerivativeFundingSettlementEvidence[];
}

export interface DerivativeFundingSettlementProvider {
  readonly exchange: string;
  fetchSettlements(now?: number): Promise<DerivativeFundingSettlementProviderResult>;
}
