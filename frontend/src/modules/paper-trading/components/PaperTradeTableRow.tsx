import { PaperTradeStatusBadge } from "./PaperTradeStatusBadge";

import type { PaperTrade } from "../types/PaperTrade";

interface PaperTradeTableRowProps {
  trade: PaperTrade;
  onSelect: (trade: PaperTrade) => void;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDuration(
  openedAt: number,
  closedAt: number | null,
): string {
  const endTime = closedAt ?? Date.now();

  const elapsedSeconds = Math.max(
    0,
    Math.floor((endTime - openedAt) / 1000),
  );

  const hours = Math.floor(
    elapsedSeconds / 3600,
  );

  const minutes = Math.floor(
    (elapsedSeconds % 3600) / 60,
  );

  const seconds = elapsedSeconds % 60;

  return [hours, minutes, seconds]
    .map((value) =>
      value.toString().padStart(2, "0"),
    )
    .join(":");
}

function getProfitClass(value: number): string {
  if (value > 0) {
    return "text-success";
  }

  if (value < 0) {
    return "text-danger";
  }

  return "text-text-muted";
}

export function PaperTradeTableRow({
  trade,
  onSelect,
}: PaperTradeTableRowProps) {
  function handleSelect(): void {
    onSelect(trade);
  }

  function handleKeyDown(
    event: React.KeyboardEvent<HTMLTableRowElement>,
  ): void {
    if (
      event.key === "Enter" ||
      event.key === " "
    ) {
      event.preventDefault();
      onSelect(trade);
    }
  }

  return (
    <tr
      role="button"
      tabIndex={0}
      aria-label={`View ${trade.market} paper trade details`}
      onClick={handleSelect}
      onKeyDown={handleKeyDown}
      className="cursor-pointer border-b border-border-default transition-colors hover:bg-panel-light focus-visible:bg-panel-light focus-visible:outline-none"
    >
      <td className="p-4 font-semibold">
        {trade.market}
      </td>

      <td className="p-4 uppercase text-success">
        {trade.buyExchange}
      </td>

      <td className="p-4 uppercase text-danger">
        {trade.sellExchange}
      </td>

      <td className="p-4 text-right font-mono tabular-nums">
        {formatCurrency(trade.capital)}
      </td>

      <td
        className={`p-4 text-right font-mono tabular-nums ${getProfitClass(
          trade.currentProfit,
        )}`}
      >
        {formatCurrency(trade.currentProfit)}
      </td>

      <td
        className={`p-4 text-right font-mono tabular-nums ${getProfitClass(
          trade.highestProfit,
        )}`}
      >
        {formatCurrency(trade.highestProfit)}
      </td>

      <td
        className={`p-4 text-right font-mono tabular-nums ${getProfitClass(
          trade.lowestProfit,
        )}`}
      >
        {formatCurrency(trade.lowestProfit)}
      </td>

      <td className="p-4 font-mono tabular-nums">
        {formatDuration(
          trade.openedAt,
          trade.closedAt,
        )}
      </td>

      <td className="p-4">
        <PaperTradeStatusBadge
          status={trade.status}
        />
      </td>
    </tr>
  );
}