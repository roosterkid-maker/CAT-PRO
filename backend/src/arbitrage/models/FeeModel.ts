export interface ExchangeFee {
  exchange: string;

  makerPercent: number;
  takerPercent: number;

  withdrawalFee?: number;
}

export type FeeRegistry = Record<string, ExchangeFee>;

export type ExchangeFeeEvidenceSource =
  | "STATIC_CONFIG"
  | "PUBLIC_API"
  | "ACCOUNT_API";

export interface ExchangeFeeEvidence
  extends ExchangeFee
{
  market: string | null;

  source:
    ExchangeFeeEvidenceSource;

  synchronizedAt:
    number | null;

  expiresAt:
    number | null;
}
