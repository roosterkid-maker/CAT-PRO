import type {
  ExchangeFee,
  ExchangeFeeEvidence,
  FeeRegistry,
} from "../models/FeeModel";

export const exchangeFees: FeeRegistry = {
  coindcx: {
    exchange: "coindcx",

    /*
     * Conservative no-market fallback for a Regular-1 account. CoinDCX's
     * published Spot INR fee is 0.50% and 18% GST applies to that fee.
     * Market-aware lookups below use the lower published C2C rate for
     * non-INR pairs. We must not assume a VIP tier without account evidence.
     */
    makerPercent: 0.59,
    takerPercent: 0.59,
  },

  binance: {
    exchange: "binance",

    makerPercent: 0.10,
    takerPercent: 0.10,
  },

  bybit: {
    exchange: "bybit",

    makerPercent: 0.10,
    takerPercent: 0.10,
  },

  kucoin: {
    exchange: "kucoin",

    makerPercent: 0.10,
    takerPercent: 0.10,
  },

  okx: {
    exchange: "okx",

    makerPercent: 0.08,
    takerPercent: 0.10,
  },

  gate: {
    exchange: "gate",

    makerPercent: 0.20,
    takerPercent: 0.20,
  },
};

const marketFeeEvidence =
  new Map<
    string,
    ExchangeFeeEvidence
  >();

export function getExchangeFees(
  exchange: string,
  market?: string,
): ExchangeFee {
  const evidence =
    getExchangeFeeEvidence(
      exchange,
      market,
    );

  if (!evidence) {
    throw new Error(
      `Fee configuration not found for exchange: ${exchange}${market ? ` market ${market}` : ""}.`,
    );
  }

  return {
    exchange:
      evidence.exchange,

    makerPercent:
      evidence.makerPercent,

    takerPercent:
      evidence.takerPercent,
  };
}

export function getExchangeFeeEvidence(
  exchange: string,
  market?: string,
): ExchangeFeeEvidence | null {
  const normalized =
    normalizeExchange(
      exchange,
    );

  const normalizedMarket =
    market ===
      undefined
      ? ""
      : normalizeMarket(
          market,
        );

  if (
    normalized &&
    normalizedMarket
  ) {
    const key =
      createMarketFeeKey(
        normalized,
        normalizedMarket,
      );

    const evidence =
      marketFeeEvidence.get(
        key,
      );

    if (evidence) {
      if (
        evidence.expiresAt ===
          null ||
        evidence.expiresAt >=
          Date.now()
      ) {
        return structuredClone(
          evidence,
        );
      }

      marketFeeEvidence.delete(
        key,
      );
    }
  }

  const fees =
    getStaticExchangeFees(
      normalized,
      normalizedMarket,
    );

  if (!fees) {
    return null;
  }

  return {
    ...structuredClone(
      fees,
    ),

    market:
      null,

    source:
      "STATIC_CONFIG",

    synchronizedAt:
      null,

    expiresAt:
      null,
  };
}

/**
 * Allocation-free internal lookup for the strategy hot path. Callers receive
 * only the primitive rate needed for economics; public evidence APIs continue
 * returning defensive clones with full source/expiry lineage.
 */
export function getExchangeTakerFeePercent(
  exchange:
    string,

  market?:
    string,

  now =
    Date.now(),
): number | null {
  const normalized =
    normalizeExchange(
      exchange,
    );

  const normalizedMarket =
    market ===
      undefined
      ? ""
      : normalizeMarket(
          market,
        );

  if (
    normalized &&
    normalizedMarket
  ) {
    const key =
      createMarketFeeKey(
        normalized,
        normalizedMarket,
      );

    const evidence =
      marketFeeEvidence.get(
        key,
      );

    if (
      evidence
    ) {
      if (
        evidence.expiresAt ===
          null ||
        evidence.expiresAt >=
          now
      ) {
        return evidence
          .takerPercent;
      }

      marketFeeEvidence.delete(
        key,
      );
    }
  }

  const fees =
    getStaticExchangeFees(
      normalized,
      normalizedMarket,
    );

  return fees
    ?.takerPercent ??
    null;
}

export function replaceExchangeMarketFeeEvidence(
  exchange: string,
  evidence:
    readonly ExchangeFeeEvidence[],
): void {
  const normalizedExchange =
    normalizeExchange(
      exchange,
    );

  if (!normalizedExchange) {
    throw new Error(
      "Market fee evidence requires an exchange.",
    );
  }

  const normalizedEvidence =
    evidence.map(
      (item) =>
        normalizeDynamicEvidence(
          normalizedExchange,
          item,
        ),
    );

  if (
    normalizedEvidence.length ===
      0
  ) {
    throw new Error(
      `Market fee evidence cannot be empty: ${normalizedExchange}.`,
    );
  }

  clearDynamicFeeEvidence(
    normalizedExchange,
  );

  for (const item of normalizedEvidence) {
    if (!item.market) {
      continue;
    }

    marketFeeEvidence.set(
      createMarketFeeKey(
        normalizedExchange,
        item.market,
      ),
      item,
    );
  }
}

export function getDynamicFeeEvidence(
  exchange?: string,
): ExchangeFeeEvidence[] {
  const normalizedExchange =
    exchange ===
      undefined
      ? null
      : normalizeExchange(
          exchange,
        );

  const now =
    Date.now();

  for (
    const [key, evidence]
    of marketFeeEvidence
  ) {
    if (
      evidence.expiresAt !==
        null &&
      evidence.expiresAt <
        now
    ) {
      marketFeeEvidence.delete(
        key,
      );
    }
  }

  return [
    ...marketFeeEvidence.values(),
  ]
    .filter(
      (evidence) =>
        normalizedExchange ===
          null ||
        evidence.exchange ===
          normalizedExchange,
    )
    .sort(
      (
        first,
        second,
      ) =>
        (
          first.market ??
          ""
        ).localeCompare(
          second.market ??
          "",
        ),
    )
    .map(
      (evidence) =>
        structuredClone(
          evidence,
        ),
    );
}

export function clearDynamicFeeEvidence(
  exchange?: string,
): void {
  if (
    exchange ===
      undefined
  ) {
    marketFeeEvidence.clear();

    return;
  }

  const normalizedExchange =
    normalizeExchange(
      exchange,
    );

  for (
    const [key, evidence]
    of marketFeeEvidence
  ) {
    if (
      evidence.exchange ===
      normalizedExchange
    ) {
      marketFeeEvidence.delete(
        key,
      );
    }
  }
}

function normalizeDynamicEvidence(
  expectedExchange: string,
  evidence:
    ExchangeFeeEvidence,
): ExchangeFeeEvidence {
  const exchange =
    normalizeExchange(
      evidence.exchange,
    );

  const market =
    evidence.market ===
      null
      ? ""
      : normalizeMarket(
          evidence.market,
        );

  const synchronizedAt =
    evidence.synchronizedAt;

  const expiresAt =
    evidence.expiresAt;

  if (
    exchange !==
      expectedExchange ||
    !market
  ) {
    throw new Error(
      "Dynamic market fee evidence has an invalid exchange or market.",
    );
  }

  if (
    evidence.source ===
      "STATIC_CONFIG"
  ) {
    throw new Error(
      "Dynamic market fee evidence requires a public or account API source.",
    );
  }

  if (
    !Number.isFinite(
      evidence.makerPercent,
    ) ||
    evidence.makerPercent <
      0 ||
    !Number.isFinite(
      evidence.takerPercent,
    ) ||
    evidence.takerPercent <
      0 ||
    !Number.isSafeInteger(
      synchronizedAt,
    ) ||
    synchronizedAt === null ||
    synchronizedAt <=
      0 ||
    synchronizedAt >
      Date.now() ||
    !Number.isSafeInteger(
      expiresAt,
    ) ||
    expiresAt === null ||
    expiresAt <=
      synchronizedAt
  ) {
    throw new Error(
      `Dynamic market fee evidence is invalid: ${exchange}:${market}.`,
    );
  }

  return {
    exchange,

    market,

    makerPercent:
      evidence.makerPercent,

    takerPercent:
      evidence.takerPercent,

    source:
      evidence.source,

    synchronizedAt:
      synchronizedAt,

    expiresAt:
      expiresAt,
  };
}

function createMarketFeeKey(
  exchange: string,
  market: string,
): string {
  return `${exchange}:${market}`;
}

function getStaticExchangeFees(
  exchange: string,
  market: string,
): ExchangeFee | undefined {
  if (
    exchange ===
      "coindcx" &&
    market
  ) {
    const isInrPair =
      market.endsWith(
        "INR",
      );

    /*
     * Published Regular-1 Spot rates as of 2026-08-14:
     * INR 0.50%, C2C 0.17%, with 18% GST on fees.
     */
    const effectivePercent =
      isInrPair
        ? 0.5 * 1.18
        : 0.17 * 1.18;

    return {
      exchange,
      makerPercent:
        effectivePercent,
      takerPercent:
        effectivePercent,
    };
  }

  return exchangeFees[
    exchange
  ];
}

function normalizeExchange(
  exchange: string,
): string {
  return exchange
    .trim()
    .toLowerCase();
}

function normalizeMarket(
  market: string,
): string {
  return market
    .trim()
    .toUpperCase()
    .replace(
      /[\s_,\-/]+/g,
      "",
    );
}
