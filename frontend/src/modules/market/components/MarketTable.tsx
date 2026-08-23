import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/shared/ui/table";

import type {
  MarketViewModel,
} from "@/types/MarketViewModel";

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

interface MarketTableProps {
  sourceMarkets:
    MarketViewModel[];
}

const MARKET_ROW_HEIGHT_PX =
  72;

const MARKET_ROW_OVERSCAN =
  8;

export default function MarketTable({
  sourceMarkets,
}: MarketTableProps) {
  const scrollContainerRef =
    useRef<HTMLDivElement>(
      null,
    );

  const scrollFrameRef =
    useRef<number | null>(
      null,
    );

  const [
    scrollTop,
    setScrollTop,
  ] = useState(0);

  const [
    viewportHeight,
    setViewportHeight,
  ] = useState(640);

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
          sourceMarkets.filter(
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
        sourceMarkets,
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
            sourceMarkets.map(
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
        sourceMarkets,
      ],
    );

  const visibleRange =
    useMemo(
      () => {
        const start =
          Math.max(
            0,
            Math.floor(
              scrollTop /
                MARKET_ROW_HEIGHT_PX,
            ) -
              MARKET_ROW_OVERSCAN,
          );

        const visibleCount =
          Math.ceil(
            viewportHeight /
              MARKET_ROW_HEIGHT_PX,
          ) +
          MARKET_ROW_OVERSCAN *
            2;

        const end =
          Math.min(
            markets.length,
            start +
              visibleCount,
          );

        return {
          start,
          end,
          topHeight:
            start *
            MARKET_ROW_HEIGHT_PX,
          bottomHeight:
            Math.max(
              0,
              markets.length -
                end,
            ) *
            MARKET_ROW_HEIGHT_PX,
        };
      },
      [
        markets.length,
        scrollTop,
        viewportHeight,
      ],
    );

  const visibleMarkets =
    useMemo(
      () =>
        markets.slice(
          visibleRange.start,
          visibleRange.end,
        ),
      [
        markets,
        visibleRange.end,
        visibleRange.start,
      ],
    );

  const handleScroll =
    useCallback(
      () => {
        if (
          scrollFrameRef.current !==
          null
        ) {
          return;
        }

        scrollFrameRef.current =
          window.requestAnimationFrame(
            () => {
              scrollFrameRef.current =
                null;

              setScrollTop(
                scrollContainerRef.current
                  ?.scrollTop ??
                  0,
              );
            },
          );
      },
      [],
    );

  useEffect(
    () => {
      const container =
        scrollContainerRef.current;

      if (!container) {
        return;
      }

      const updateViewportHeight =
        () => {
          setViewportHeight(
            container.clientHeight,
          );
        };

      updateViewportHeight();

      const resizeObserver =
        new ResizeObserver(
          updateViewportHeight,
        );

      resizeObserver.observe(
        container,
      );

      return () => {
        resizeObserver.disconnect();

        if (
          scrollFrameRef.current !==
          null
        ) {
          window.cancelAnimationFrame(
            scrollFrameRef.current,
          );

          scrollFrameRef.current =
            null;
        }
      };
    },
    [],
  );

  useEffect(
    () => {
      const container =
        scrollContainerRef.current;

      if (!container) {
        return;
      }

      container.scrollTop =
        0;

      setScrollTop(0);
    },
    [
      exchange,
      favoritesOnly,
      search,
      sort,
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

      <div
        ref={
          scrollContainerRef
        }
        onScroll={
          handleScroll
        }
        className="max-h-[60vh] overflow-auto rounded-lg border border-border-default bg-panel"
      >
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
            {visibleRange.topHeight >
              0 && (
              <TableRow
                aria-hidden="true"
                className="border-0 hover:bg-transparent"
              >
                <TableCell
                  colSpan={7}
                  className="p-0"
                  style={{
                    height:
                      visibleRange.topHeight,
                  }}
                />
              </TableRow>
            )}

            {visibleMarkets.map(
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

            {visibleRange.bottomHeight >
              0 && (
              <TableRow
                aria-hidden="true"
                className="border-0 hover:bg-transparent"
              >
                <TableCell
                  colSpan={7}
                  className="p-0"
                  style={{
                    height:
                      visibleRange.bottomHeight,
                  }}
                />
              </TableRow>
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
