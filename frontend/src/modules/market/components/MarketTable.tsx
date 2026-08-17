import {
  useMemo,
  useState,
} from "react";

import {
  Table,
  TableBody,
} from "@/shared/ui/table";

import {
  useMarketStore,
} from "@/store/market.store";

import {
  useFavoritesStore,
} from "../store/favorites.store";

import MarketTableHeader from "./MarketTableHeader";
import MarketTableRow from "./MarketTableRow";
import MarketTableToolbar from "./MarketTableToolbar";

import type {
  MarketSort,
  SortField,
} from "../types/MarketSort";

export default function MarketTable() {
  const marketMap =
    useMarketStore(
      (state) =>
        state.markets,
    );

  const [
    search,
    setSearch,
  ] =
    useState("");

  const [
    exchange,
    setExchange,
  ] =
    useState(
      "ALL",
    );

  const [
    favoritesOnly,
    setFavoritesOnly,
  ] =
    useState(
      false,
    );

  const favoriteMarkets =
    useFavoritesStore(
      (state) =>
        state.favorites,
    );

  const [
    sort,
    setSort,
  ] =
    useState<MarketSort>({
      field:
        "market",

      direction:
        "asc",
    });

  const handleSort =
    (
      field:
        SortField,
    ) => {
      setSort(
        (
          current,
        ) => {
          if (
            current.field ===
            field
          ) {
            return {
              field,

              direction:
                current.direction ===
                "asc"
                  ? "desc"
                  : "asc",
            };
          }

          return {
            field,

            direction:
              "asc",
          };
        },
      );
    };

  const markets =
    useMemo(
      () => {
        const normalizedSearch =
          search
            .trim()
            .toLowerCase();

        const filteredMarkets =
          Object.values(
            marketMap,
          ).filter(
            (
              market,
            ) => {
              const matchesSearch =
                !normalizedSearch ||
                market.market
                  .toLowerCase()
                  .includes(
                    normalizedSearch,
                  ) ||
                market.exchange
                  .toLowerCase()
                  .includes(
                    normalizedSearch,
                  );

              const matchesExchange =
                exchange ===
                  "ALL" ||
                market.exchange
                  .toLowerCase() ===
                  exchange
                    .toLowerCase();

              const favoriteKey =
                `${market.exchange.toLowerCase()}:${market.market.toUpperCase()}`;

              const matchesFavorite =
                !favoritesOnly ||
                favoriteMarkets.has(
                  favoriteKey,
                );

              return (
                matchesSearch &&
                matchesExchange &&
                matchesFavorite
              );
            },
          );

        return [
          ...filteredMarkets,
        ].sort(
          (
            first,
            second,
          ) => {
            const comparison =
              sort.field ===
              "lastPrice"
                ? comparePrices(
                    first.lastPrice,
                    second.lastPrice,
                  )
                : first[
                    sort.field
                  ].localeCompare(
                    second[
                      sort.field
                    ],
                  );

            if (
              comparison !==
              0
            ) {
              return sort.direction ===
                "asc"
                ? comparison
                : -comparison;
            }

            return first.market.localeCompare(
              second.market,
            );
          },
        );
      },
      [
        marketMap,
        search,
        sort,
        exchange,
        favoritesOnly,
        favoriteMarkets,
      ],
    );

  const exchanges =
    useMemo(
      () =>
        Array.from(
          new Set(
            Object.values(
              marketMap,
            ).map(
              (
                market,
              ) =>
                market.exchange,
            ),
          ),
        ).sort(
          (
            first,
            second,
          ) =>
            first.localeCompare(
              second,
            ),
        ),
      [
        marketMap,
      ],
    );

  return (
    <div>
      <MarketTableToolbar
        search={
          search
        }
        onSearchChange={
          setSearch
        }
        marketCount={
          markets.length
        }
        exchange={
          exchange
        }
        exchanges={
          exchanges
        }
        onExchangeChange={
          setExchange
        }
        favoritesOnly={
          favoritesOnly
        }
        onFavoritesOnlyChange={
          setFavoritesOnly
        }
      />

      <div className="max-h-[60vh] overflow-auto rounded-lg border border-border-default bg-panel">
        <Table>
          <MarketTableHeader
            sort={
              sort
            }
            onSort={
              handleSort
            }
          />

          <TableBody>
            {markets.map(
              (
                market,
              ) => (
                <MarketTableRow
                  key={`${market.exchange}-${market.market}`}
                  market={
                    market
                  }
                />
              ),
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function comparePrices(
  firstPrice:
    | number
    | null
    | undefined,

  secondPrice:
    | number
    | null
    | undefined,
): number {
  const normalizedFirst =
    firstPrice ??
    Number.NEGATIVE_INFINITY;

  const normalizedSecond =
    secondPrice ??
    Number.NEGATIVE_INFINITY;

  return (
    normalizedFirst -
    normalizedSecond
  );
}