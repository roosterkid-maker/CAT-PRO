import type {
  BybitSpotMarketActivity,
} from "./marketLoader";

export type BybitMarketUniverseSelectionMode =
  | "OVERLAP_AND_ACTIVITY"
  | "ACTIVITY_ONLY"
  | "CATALOG_FALLBACK";

export interface BybitMarketUniverseSelection {
  generatedAt: number;

  mode: BybitMarketUniverseSelectionMode;

  catalogMarkets: number;

  externalOverlapMarkets: number;

  marketsWithActivityEvidence: number;

  selectedMarkets: number;

  selectedExternalOverlapMarkets: number;

  selectedWithActivityEvidence: number;

  marketDataMutationAllowed: true;

  freshnessThresholdMutationAllowed: false;

  tradingPolicyMutationAllowed: false;

  liveExecutionAllowed: false;

  selected: string[];

  observations: string[];
}

interface RankedMarket {
  symbol: string;

  externalOverlap: boolean;

  activity: BybitSpotMarketActivity | null;
}

export class BybitMarketUniverseSelector {
  select(
    rawCatalogMarkets: readonly string[],
    activityEvidence: readonly BybitSpotMarketActivity[],
    rawExternalMarkets: ReadonlySet<string>,
    maximumMarkets: number,
    now = Date.now(),
  ): BybitMarketUniverseSelection {
    if (
      !Number.isSafeInteger(
        maximumMarkets,
      ) ||
      maximumMarkets <= 0
    ) {
      throw new Error(
        "Bybit market-universe limit must be a positive integer.",
      );
    }

    const catalog =
      Array.from(
        new Set(
          rawCatalogMarkets
            .map((market) =>
              this.normalizeMarket(
                market,
              ))
            .filter(Boolean),
        ),
      );

    const externalMarkets =
      new Set(
        Array.from(
          rawExternalMarkets,
        )
          .map((market) =>
            this.normalizeMarket(
              market,
            ))
          .filter(Boolean),
      );

    const activityByMarket =
      new Map<
        string,
        BybitSpotMarketActivity
      >();

    for (
      const activity
      of activityEvidence
    ) {
      const symbol =
        this.normalizeMarket(
          activity.symbol,
        );

      if (
        !symbol ||
        !Number.isFinite(
          activity.turnover24h,
        ) ||
        activity.turnover24h < 0 ||
        !Number.isFinite(
          activity.volume24h,
        ) ||
        activity.volume24h < 0
      ) {
        continue;
      }

      activityByMarket.set(
        symbol,
        {
          symbol,
          turnover24h:
            activity.turnover24h,
          volume24h:
            activity.volume24h,
        },
      );
    }

    const ranked:
      RankedMarket[] =
      catalog.map((symbol) => ({
        symbol,
        externalOverlap:
          externalMarkets.has(
            symbol,
          ),
        activity:
          activityByMarket.get(
            symbol,
          ) ?? null,
      }));

    ranked.sort(
      (
        first,
        second,
      ) => {
        if (
          first.externalOverlap !==
          second.externalOverlap
        ) {
          return first.externalOverlap
            ? -1
            : 1;
        }

        const firstHasActivity =
          first.activity !== null;
        const secondHasActivity =
          second.activity !== null;

        if (
          firstHasActivity !==
          secondHasActivity
        ) {
          return firstHasActivity
            ? -1
            : 1;
        }

        const turnoverDifference =
          (second.activity?.turnover24h ?? -1) -
          (first.activity?.turnover24h ?? -1);

        if (
          turnoverDifference !== 0
        ) {
          return turnoverDifference;
        }

        const volumeDifference =
          (second.activity?.volume24h ?? -1) -
          (first.activity?.volume24h ?? -1);

        if (
          volumeDifference !== 0
        ) {
          return volumeDifference;
        }

        return first.symbol.localeCompare(
          second.symbol,
        );
      },
    );

    const selectedRecords =
      ranked.slice(
        0,
        maximumMarkets,
      );

    const overlapMarkets =
      ranked.filter(
        (market) =>
          market.externalOverlap,
      ).length;

    const activityMarkets =
      ranked.filter(
        (market) =>
          market.activity !== null,
      ).length;

    const mode:
      BybitMarketUniverseSelectionMode =
      overlapMarkets > 0 &&
      activityMarkets > 0
        ? "OVERLAP_AND_ACTIVITY"
        : activityMarkets > 0
          ? "ACTIVITY_ONLY"
          : "CATALOG_FALLBACK";

    return {
      generatedAt:
        now,
      mode,
      catalogMarkets:
        catalog.length,
      externalOverlapMarkets:
        overlapMarkets,
      marketsWithActivityEvidence:
        activityMarkets,
      selectedMarkets:
        selectedRecords.length,
      selectedExternalOverlapMarkets:
        selectedRecords.filter(
          (market) =>
            market.externalOverlap,
        ).length,
      selectedWithActivityEvidence:
        selectedRecords.filter(
          (market) =>
            market.activity !== null,
        ).length,
      marketDataMutationAllowed:
        true,
      freshnessThresholdMutationAllowed:
        false,
      tradingPolicyMutationAllowed:
        false,
      liveExecutionAllowed:
        false,
      selected:
        selectedRecords.map(
          (market) =>
            market.symbol,
        ),
      observations: [
        "Selection prioritizes markets already observed on another exchange, then genuine Bybit 24-hour turnover and volume evidence.",
        "The REST ticker snapshot ranks subscriptions only; executable prices and quantities still require genuine fresh websocket order books.",
        "If activity evidence is unavailable, selection falls back deterministically without widening freshness or enabling execution.",
      ],
    };
  }

  private normalizeMarket(
    market: string,
  ): string {
    return market
      .trim()
      .toUpperCase()
      .replace(
        /[^A-Z0-9]/g,
        "",
      );
  }
}

export const bybitMarketUniverseSelector =
  new BybitMarketUniverseSelector();
