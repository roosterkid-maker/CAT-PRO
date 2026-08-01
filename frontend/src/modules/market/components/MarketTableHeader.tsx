import {
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";

import type {
  MarketSort,
  SortField,
} from "../types/MarketSort";

interface MarketTableHeaderProps {
  sort: MarketSort;
  onSort: (field: SortField) => void;
}

function SortIndicator({
  field,
  sort,
}: {
  field: SortField;
  sort: MarketSort;
}) {
  if (sort.field !== field) {
    return <span className="ml-1 text-text-muted">↕</span>;
  }

  return (
    <span className="ml-1">
      {sort.direction === "asc" ? "↑" : "↓"}
    </span>
  );
}

export default function MarketTableHeader({
  sort,
  onSort,
}: MarketTableHeaderProps) {
  return (
 <TableHeader className="sticky top-0 z-10 bg-panel-light">
  <TableRow className="border-border-default hover:bg-panel-light">
    <TableHead className="w-12 text-center text-text-primary">
      ★
    </TableHead>

    <TableHead className="text-left text-text-primary">
      <button
        type="button"
        onClick={() => onSort("market")}
        className="inline-flex items-center font-semibold hover:text-brand"
      >
        Market
        <SortIndicator field="market" sort={sort} />
      </button>
    </TableHead>

        <TableHead className="text-left text-text-primary">
          <button
            type="button"
            onClick={() => onSort("exchange")}
            className="inline-flex items-center font-semibold hover:text-brand"
          >
            Exchange
            <SortIndicator field="exchange" sort={sort} />
          </button>
        </TableHead>

        <TableHead className="text-right text-text-primary">
          <button
            type="button"
            onClick={() => onSort("lastPrice")}
            className="ml-auto inline-flex items-center font-semibold hover:text-brand"
          >
            Last Price
            <SortIndicator field="lastPrice" sort={sort} />
          </button>
        </TableHead>

        <TableHead className="text-right text-text-primary">
          Bid
        </TableHead>

        <TableHead className="text-right text-text-primary">
          Ask
        </TableHead>
        <TableHead className="text-right text-text-primary">
  Updated
</TableHead>
      </TableRow>
    </TableHeader>
  );
}