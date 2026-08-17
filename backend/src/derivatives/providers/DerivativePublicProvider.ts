import type {
  DerivativeVenuePublicSnapshot,
} from "../models/DerivativeMarketEvidence";

export interface DerivativePublicProvider {
  readonly exchange: string;

  fetchSnapshot(now?: number): Promise<DerivativeVenuePublicSnapshot>;
}
