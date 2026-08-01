import { useMemo, useState } from "react";

import { Table, TableBody } from "@/shared/ui/table";
import { useMarketStore } from "@/store/market.store";

import MarketTableHeader from "./MarketTableHeader";
import MarketTableRow from "./MarketTableRow";
import MarketTableToolbar from "./MarketTableToolbar";

import type {
  MarketSort,
  SortField,
} from "../types/MarketSort";

export default function MarketTable() {
  const marketMap = useMarketStore((state) => state.markets);

  const [search, setSearch] = useState("");

  const [sort, setSort] = useState<MarketSort>({
    field: "market",
    direction: "asc",
  });

  const handleSort = (field: SortField) => {
    setSort((current) => {
      if (current.field === field) {
        return {
          field,
          direction: current.direction === "asc" ? "desc" : "asc",
        };
      }

      return {
        field,
        direction: "asc",
      };
    });
  };

  const markets = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    const filteredMarkets = Object.values(marketMap).filter((market) => {
      if (!normalizedSearch) {
        return true;
      }

      return (
        market.market.toLowerCase().includes(normalizedSearch) ||
        market.exchange.toLowerCase().includes(normalizedSearch)
      );
    });

    return [...filteredMarkets].sort((first, second) => {
      let comparison = 0;

      if (sort.field === "lastPrice") {
        comparison = first.lastPrice - second.lastPrice;
      } else {
        comparison = first[sort.field].localeCompare(second[sort.field]);
      }

      return sort.direction === "asc" ? comparison : -comparison;
    });
  }, [marketMap, search, sort]);

  return (
    <div>
      <MarketTableToolbar
        search={search}
        onSearchChange={setSearch}
        marketCount={markets.length}
      />

      <div className="max-h-[60vh] overflow-auto rounded-lg border border-border-default bg-panel">
        <Table>
          <MarketTableHeader
            sort={sort}
            onSort={handleSort}
          />

          <TableBody>
            {markets.map((market) => (
              <MarketTableRow
                key={`${market.exchange}-${market.market}`}
                market={market}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}