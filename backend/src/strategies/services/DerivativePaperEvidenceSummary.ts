import type {
  DerivativeAccountEvidenceSnapshot,
} from "../../derivatives/models/DerivativeAccountEvidence";

import type {
  DerivativeFeeEvidenceSnapshot,
} from "../../derivatives/models/DerivativeFeeEvidence";

export interface DerivativePaperVenueEvidenceSummary {
  readonly exchange: string;
  readonly configured: boolean;
  readonly state: "READY" | "DEGRADED" | "NO_DATA";
  readonly authenticatedReadReady: boolean;
  readonly positionMarkets: number;
  readonly availableMargin: number | null;
  readonly availableMarginUnit: "USDT" | "ACCOUNT_USD_VALUE" | null;
  readonly targetMarginCovered: boolean;
  readonly feeConfigured: boolean;
  readonly paperEvidenceReady: boolean;
  readonly lastSuccessAt: number | null;
  readonly lastError: string | null;
}

/**
 * One shared read-only interpretation of signed derivative account, position,
 * target-margin and explicit-fee evidence for Strategies #4/#5/#6/#8.
 * It never infers absent balances and never changes provider state.
 */
export function summarizeDerivativePaperVenues(input: {
  readonly exchanges: readonly string[];
  readonly targetQuoteAmount: number;
  readonly account: DerivativeAccountEvidenceSnapshot;
  readonly fees: DerivativeFeeEvidenceSnapshot;
}): readonly DerivativePaperVenueEvidenceSummary[] {
  return input.exchanges.map((exchange) => {
    const status = input.account.providers.find((item) => item.exchange === exchange) ?? null;
    const evidence = input.account.evidence.find((item) => item.exchange === exchange) ?? null;
    const fee = input.fees.evidence.find((item) => item.exchange === exchange) ?? null;
    const authenticatedReadReady = Boolean(
      status?.state === "READY" &&
      evidence?.authenticatedReadVerified &&
      evidence.marginReadVerified &&
      evidence.positionReadVerified,
    );
    const targetMarginCovered = Boolean(
      evidence &&
      Number.isFinite(evidence.availableMargin) &&
      evidence.availableMargin >= input.targetQuoteAmount,
    );

    return freeze({
      exchange,
      configured: status?.configured ?? false,
      state: status?.state ?? "NO_DATA",
      authenticatedReadReady,
      positionMarkets: evidence?.positions.length ?? status?.positionMarkets ?? 0,
      availableMargin: evidence?.availableMargin ?? null,
      availableMarginUnit: evidence?.availableMarginUnit ?? null,
      targetMarginCovered,
      feeConfigured: fee !== null,
      paperEvidenceReady: authenticatedReadReady && targetMarginCovered && fee !== null,
      lastSuccessAt: status?.lastSuccessAt ?? null,
      lastError: status?.lastError ?? null,
    });
  });
}

function freeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freeze(nested);
  return Object.freeze(value);
}
