import type {
  CoinSwitchPublicVenue,
} from "./constants";

export interface CoinSwitchMarketRuleEvidence {
  exchange: "coinswitch";

  venue:
    CoinSwitchPublicVenue;

  market: string;

  priceStep: number;

  pricePrecision: number;

  quantityStep: number;

  quantityPrecision: number;

  minimumNotional: number;

  maximumNotional: number;

  source: "ACCOUNT_API";

  synchronizedAt: number;

  expiresAt: number;
}

const evidenceByMarket =
  new Map<
    string,
    CoinSwitchMarketRuleEvidence
  >();

export function replaceCoinSwitchMarketRuleEvidence(
  evidence:
    readonly CoinSwitchMarketRuleEvidence[],
): void {
  if (
    evidence.length ===
      0
  ) {
    throw new Error(
      "CoinSwitch market-rule evidence cannot be empty.",
    );
  }

  const normalized =
    evidence.map(
      normalizeEvidence,
    );

  evidenceByMarket.clear();

  for (const item of normalized) {
    evidenceByMarket.set(
      item.market,
      item,
    );
  }
}

export function getCoinSwitchMarketRuleEvidence(
  market: string,
): CoinSwitchMarketRuleEvidence | null {
  const normalizedMarket =
    normalizeMarket(
      market,
    );

  const evidence =
    evidenceByMarket.get(
      normalizedMarket,
    );

  if (!evidence) {
    return null;
  }

  if (
    evidence.expiresAt <
    Date.now()
  ) {
    evidenceByMarket.delete(
      normalizedMarket,
    );

    return null;
  }

  return structuredClone(
    evidence,
  );
}

export function getAllCoinSwitchMarketRuleEvidence():
  CoinSwitchMarketRuleEvidence[] {
  const now =
    Date.now();

  for (
    const [
      market,
      evidence,
    ]
    of evidenceByMarket
  ) {
    if (
      evidence.expiresAt <
      now
    ) {
      evidenceByMarket.delete(
        market,
      );
    }
  }

  return [
    ...evidenceByMarket
      .values(),
  ]
    .sort(
      (
        first,
        second,
      ) =>
        first.market.localeCompare(
          second.market,
        ),
    )
    .map(
      (evidence) =>
        structuredClone(
          evidence,
        ),
    );
}

export function clearCoinSwitchMarketRuleEvidence():
  void {
  evidenceByMarket.clear();
}

function normalizeEvidence(
  evidence:
    CoinSwitchMarketRuleEvidence,
): CoinSwitchMarketRuleEvidence {
  const market =
    normalizeMarket(
      evidence.market,
    );

  if (
    evidence.exchange !==
      "coinswitch" ||
    !market ||
    !positive(
      evidence.priceStep,
    ) ||
    !nonNegativeInteger(
      evidence.pricePrecision,
    ) ||
    !positive(
      evidence.quantityStep,
    ) ||
    !nonNegativeInteger(
      evidence.quantityPrecision,
    ) ||
    !positive(
      evidence.minimumNotional,
    ) ||
    !positive(
      evidence.maximumNotional,
    ) ||
    evidence.maximumNotional <
      evidence.minimumNotional ||
    !Number.isSafeInteger(
      evidence.synchronizedAt,
    ) ||
    evidence.synchronizedAt <= 0 ||
    !Number.isSafeInteger(
      evidence.expiresAt,
    ) ||
    evidence.expiresAt <=
      evidence.synchronizedAt
  ) {
    throw new Error(
      `CoinSwitch market-rule evidence is invalid: ${market || "unknown"}.`,
    );
  }

  return {
    ...structuredClone(
      evidence,
    ),
    market,
  };
}

function normalizeMarket(
  market: string,
): string {
  const assets =
    market
      .trim()
      .toUpperCase()
      .split(
        /[\s_,\-/]+/,
      )
      .filter(
        (asset) =>
          asset.length > 0,
      );

  return assets.length ===
    2
    ? `${assets[0]}_${assets[1]}`
    : "";
}

function positive(
  value: number,
): boolean {
  return Number.isFinite(
    value,
  ) &&
    value > 0;
}

function nonNegativeInteger(
  value: number,
): boolean {
  return Number.isSafeInteger(
    value,
  ) &&
    value >= 0;
}
