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

interface SortIndicatorProps {
  field: SortField;
  sort: MarketSort;
}

function SortIndicator({
  field,
  sort,
}: SortIndicatorProps) {
  if (sort.field !== field) {
    return (
      <span
        aria-hidden="true"
        className="ml-1 text-text-muted"
      >
        ↕
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className="ml-1 text-brand"
    >
      {sort.direction === "asc"
        ? "↑"
        : "↓"}
    </span>
  );
}

export default function MarketTableHeader({
  sort,
  onSort,
}: MarketTableHeaderProps) {
  return (
    <TableHeader className="sticky top-0 z-20 bg-panel-light">
      <TableRow className="border-border-default hover:bg-panel-light">
        <TableHead className="w-12 text-center text-xs font-semibold uppercase tracking-wide text-text-muted">
          ★
        </TableHead>

        <TableHead className="min-w-40 text-left">
          <SortButton
            label="Market"
            field="market"
            sort={sort}
            onSort={onSort}
          />
        </TableHead>

        <TableHead className="min-w-32 text-left">
          <SortButton
            label="Exchange"
            field="exchange"
            sort={sort}
            onSort={onSort}
          />
        </TableHead>

        <TableHead className="min-w-36 text-right">
          <SortButton
            label="Last"
            field="lastPrice"
            sort={sort}
            onSort={onSort}
            align="right"
          />
        </TableHead>

        <TableHead className="min-w-32 text-right text-xs font-semibold uppercase tracking-wide text-success">
          Bid
        </TableHead>

        <TableHead className="min-w-32 text-right text-xs font-semibold uppercase tracking-wide text-danger">
          Ask
        </TableHead>

        <TableHead className="min-w-28 text-right text-xs font-semibold uppercase tracking-wide text-text-muted">
          Updated
        </TableHead>
      </TableRow>
    </TableHeader>
  );
}

interface SortButtonProps {
  label: string;
  field: SortField;
  sort: MarketSort;
  onSort: (field: SortField) => void;
  align?: "left" | "right";
}

function SortButton({
  label,
  field,
  sort,
  onSort,
  align = "left",
}: SortButtonProps) {
  const active = sort.field === field;

  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      aria-label={`Sort by ${label}`}
      className={`inline-flex w-full items-center text-xs font-semibold uppercase tracking-wide transition-colors hover:text-brand ${
        align === "right"
          ? "justify-end"
          : "justify-start"
      } ${
        active
          ? "text-brand"
          : "text-text-primary"
      }`}
    >
      {label}

      <SortIndicator
        field={field}
        sort={sort}
      />
    </button>
  );
}