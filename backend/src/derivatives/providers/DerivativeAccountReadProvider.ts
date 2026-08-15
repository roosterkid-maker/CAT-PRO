import type {
  DerivativeVenueAccountEvidence,
} from "../models/DerivativeAccountEvidence";

export interface DerivativeAccountReadProvider {
  readonly exchange: string;

  isConfigured(): boolean;

  fetch(
    markets: readonly string[],
    now?: number,
  ): Promise<DerivativeVenueAccountEvidence>;
}
