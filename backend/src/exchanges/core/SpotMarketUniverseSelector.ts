export interface SpotMarketCatalogEntry {
  readonly symbol: string;

  readonly baseAsset: string;

  readonly quoteAsset: string;
}

export interface SpotMarketActivityEvidence {
  readonly symbol: string;

  readonly turnover24h: number;

  readonly volume24h: number;
}

export interface SpotMarketUniverseSelection {
  readonly generatedAt: number;

  readonly catalogMarkets: number;

  readonly primaryQuoteAsset: string;

  readonly secondaryQuoteAssets: readonly string[];

  readonly maximumMarkets: number;

  readonly secondaryReserveMarkets: number;

  readonly selectedPrimaryMarkets: number;

  readonly selectedSecondaryMarkets: number;

  readonly selectedAnchorMarkets: number;

  readonly selectedProtectedMarkets: number;

  readonly selectedExternalOverlapMarkets: number;

  readonly selectedWithActivityEvidence: number;

  readonly quoteDistribution: Readonly<Record<string, number>>;

  readonly selected: readonly string[];

  readonly safety: {
    readonly advisoryActivityOnly: true;
    readonly freshnessThresholdMutationAllowed: false;
    readonly tradingPolicyMutationAllowed: false;
    readonly liveExecutionAllowed: false;
  };
}

interface RankedSpotMarket extends SpotMarketCatalogEntry {
  readonly externalOverlap: boolean;

  readonly activity: SpotMarketActivityEvidence | null;
}

/**
 * Builds a bounded spot subscription universe for both cross-exchange and
 * same-exchange topology discovery. Activity is advisory ranking evidence;
 * only websocket order books can later become executable price evidence.
 */
export class SpotMarketUniverseSelector {
  select(
    rawCatalog: readonly SpotMarketCatalogEntry[],
    rawActivity: readonly SpotMarketActivityEvidence[],
    rawExternalMarkets: ReadonlySet<string>,
    maximumMarkets: number,
    primaryQuoteAsset = "USDT",
    secondaryQuoteAssets: readonly string[] = [
      "BTC",
      "ETH",
      "USDC",
    ],
    secondaryReserveRatio = 0.2,
    now = Date.now(),
    rawProtectedMarkets: ReadonlySet<string> = new Set(),
  ): SpotMarketUniverseSelection {
    if (
      !Number.isSafeInteger(maximumMarkets) ||
      maximumMarkets <= 0
    ) {
      throw new Error(
        "Spot market-universe limit must be a positive integer.",
      );
    }

    if (
      !Number.isFinite(secondaryReserveRatio) ||
      secondaryReserveRatio < 0 ||
      secondaryReserveRatio > 0.5
    ) {
      throw new Error(
        "Secondary quote reserve ratio must be between 0 and 0.5.",
      );
    }

    const primaryQuote =
      this.normalizeAsset(primaryQuoteAsset);

    const secondaryQuotes =
      Array.from(
        new Set(
          secondaryQuoteAssets
            .map((asset) => this.normalizeAsset(asset))
            .filter((asset) => asset && asset !== primaryQuote),
        ),
      );

    const allowedQuotes =
      new Set([
        primaryQuote,
        ...secondaryQuotes,
      ]);

    const catalogBySymbol =
      new Map<string, SpotMarketCatalogEntry>();

    for (const rawEntry of rawCatalog) {
      const entry =
        this.normalizeEntry(rawEntry);

      if (
        entry &&
        allowedQuotes.has(entry.quoteAsset)
      ) {
        catalogBySymbol.set(entry.symbol, entry);
      }
    }

    const activityBySymbol =
      new Map<string, SpotMarketActivityEvidence>();

    for (const rawEvidence of rawActivity) {
      const symbol =
        this.normalizeSymbol(rawEvidence.symbol);

      if (
        symbol &&
        Number.isFinite(rawEvidence.turnover24h) &&
        rawEvidence.turnover24h >= 0 &&
        Number.isFinite(rawEvidence.volume24h) &&
        rawEvidence.volume24h >= 0
      ) {
        activityBySymbol.set(symbol, {
          symbol,
          turnover24h: rawEvidence.turnover24h,
          volume24h: rawEvidence.volume24h,
        });
      }
    }

    const externalMarkets =
      new Set(
        Array.from(rawExternalMarkets)
          .map((market) => this.normalizeSymbol(market))
          .filter(Boolean),
      );

    const protectedMarkets =
      new Set(
        Array.from(rawProtectedMarkets)
          .map((market) => this.normalizeSymbol(market))
          .filter(Boolean),
      );

    const ranked =
      Array.from(catalogBySymbol.values())
        .map((entry): RankedSpotMarket => ({
          ...entry,
          externalOverlap: externalMarkets.has(entry.symbol),
          activity: activityBySymbol.get(entry.symbol) ?? null,
        }))
        .sort((first, second) =>
          this.compareRanked(first, second),
        );

    const primary =
      ranked.filter((entry) =>
        entry.quoteAsset === primaryQuote,
      );

    const secondary =
      ranked.filter((entry) =>
        secondaryQuotes.includes(entry.quoteAsset),
      );

    const secondaryReserve =
      Math.min(
        secondary.length,
        Math.floor(maximumMarkets * secondaryReserveRatio),
      );

    const selectedSecondary =
      secondary.slice(0, secondaryReserve);

    /*
     * Every selected cross-quote leg gets its primary-quote base anchor and
     * primary-quote bridge asset when the exchange catalog supplies them.
     * This preserves coherent three-leg topology rather than collecting an
     * arbitrary bag of secondary-quote symbols.
     */
    const requiredPrimaryBases =
      new Set<string>();

    for (const entry of selectedSecondary) {
      requiredPrimaryBases.add(entry.baseAsset);
      requiredPrimaryBases.add(entry.quoteAsset);
    }

    const primaryCapacity =
      Math.max(0, maximumMarkets - selectedSecondary.length);

    const anchorPrimary =
      primary
        .filter((entry) => requiredPrimaryBases.has(entry.baseAsset))
        .slice(0, primaryCapacity);

    const selectedSymbols =
      new Set(anchorPrimary.map((entry) => entry.symbol));

    const selectedPrimary: RankedSpotMarket[] = [
      ...anchorPrimary,
    ];

    for (const entry of primary) {
      if (
        selectedPrimary.length >= primaryCapacity
      ) {
        break;
      }

      if (!selectedSymbols.has(entry.symbol)) {
        selectedSymbols.add(entry.symbol);
        selectedPrimary.push(entry);
      }
    }

    const selected: RankedSpotMarket[] = [
      ...selectedPrimary,
      ...selectedSecondary,
    ];

    /* If one side has too few candidates, use remaining ranked markets. */
    const selectedSet =
      new Set(selected.map((entry) => entry.symbol));

    for (const entry of ranked) {
      if (selected.length >= maximumMarkets) {
        break;
      }

      if (!selectedSet.has(entry.symbol)) {
        selectedSet.add(entry.symbol);
        selected.push(entry);
      }
    }

    /*
     * A bounded scanner may re-rank markets after every catalog refresh. Keep
     * explicitly audited routes in the websocket universe even when their
     * recent turnover is temporarily below the selection cut-off. Protection
     * changes subscription membership only; it grants no execution authority
     * and never changes freshness, fee, profit or risk policy.
     */
    const protectedEntries =
      ranked.filter((entry) => protectedMarkets.has(entry.symbol));

    const protectedFirst: RankedSpotMarket[] = [];
    const protectedFirstSymbols = new Set<string>();

    for (const entry of [...protectedEntries, ...selected]) {
      if (
        protectedFirst.length >= maximumMarkets ||
        protectedFirstSymbols.has(entry.symbol)
      ) {
        continue;
      }

      protectedFirstSymbols.add(entry.symbol);
      protectedFirst.push(entry);
    }

    selected.length = 0;
    selected.push(...protectedFirst);

    const quoteDistribution: Record<string, number> = {};

    for (const entry of selected) {
      quoteDistribution[entry.quoteAsset] =
        (quoteDistribution[entry.quoteAsset] ?? 0) + 1;
    }

    return Object.freeze({
      generatedAt: now,
      catalogMarkets: ranked.length,
      primaryQuoteAsset: primaryQuote,
      secondaryQuoteAssets: Object.freeze([...secondaryQuotes]),
      maximumMarkets,
      secondaryReserveMarkets: secondaryReserve,
      selectedPrimaryMarkets:
        selected.filter((entry) => entry.quoteAsset === primaryQuote).length,
      selectedSecondaryMarkets:
        selected.filter((entry) => entry.quoteAsset !== primaryQuote).length,
      selectedAnchorMarkets:
        selected.filter((entry) =>
          anchorPrimary.some((anchor) => anchor.symbol === entry.symbol),
        ).length,
      selectedProtectedMarkets:
        selected.filter((entry) => protectedMarkets.has(entry.symbol)).length,
      selectedExternalOverlapMarkets:
        selected.filter((entry) => entry.externalOverlap).length,
      selectedWithActivityEvidence:
        selected.filter((entry) => entry.activity !== null).length,
      quoteDistribution: Object.freeze({...quoteDistribution}),
      selected: Object.freeze(selected.map((entry) => entry.symbol)),
      safety: Object.freeze({
        advisoryActivityOnly: true,
        freshnessThresholdMutationAllowed: false,
        tradingPolicyMutationAllowed: false,
        liveExecutionAllowed: false,
      }),
    });
  }

  private compareRanked(
    first: RankedSpotMarket,
    second: RankedSpotMarket,
  ): number {
    if (first.externalOverlap !== second.externalOverlap) {
      return first.externalOverlap ? -1 : 1;
    }

    if ((first.activity !== null) !== (second.activity !== null)) {
      return first.activity !== null ? -1 : 1;
    }

    const turnoverDifference =
      (second.activity?.turnover24h ?? -1) -
      (first.activity?.turnover24h ?? -1);

    if (turnoverDifference !== 0) {
      return turnoverDifference;
    }

    const volumeDifference =
      (second.activity?.volume24h ?? -1) -
      (first.activity?.volume24h ?? -1);

    return volumeDifference !== 0
      ? volumeDifference
      : first.symbol.localeCompare(second.symbol);
  }

  private normalizeEntry(
    entry: SpotMarketCatalogEntry,
  ): SpotMarketCatalogEntry | null {
    const symbol = this.normalizeSymbol(entry.symbol);
    const baseAsset = this.normalizeAsset(entry.baseAsset);
    const quoteAsset = this.normalizeAsset(entry.quoteAsset);

    return symbol && baseAsset && quoteAsset && baseAsset !== quoteAsset
      ? {symbol, baseAsset, quoteAsset}
      : null;
  }

  private normalizeSymbol(value: string): string {
    return value
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
  }

  private normalizeAsset(value: string): string {
    return this.normalizeSymbol(value);
  }
}

export const spotMarketUniverseSelector =
  new SpotMarketUniverseSelector();
