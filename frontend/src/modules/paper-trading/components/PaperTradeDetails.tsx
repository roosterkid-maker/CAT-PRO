import type { PaperTrade } from "../types/PaperTrade";

interface PaperTradeDetailsProps {
  trade: PaperTrade;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

interface DetailRowProps {
  label: string;
  value: string;
}

function DetailRow({
  label,
  value,
}: DetailRowProps) {
  return (
    <div className="flex items-center justify-between border-b border-border-default py-3">
      <span className="text-text-muted">
        {label}
      </span>

      <span className="font-medium text-text-primary">
        {value}
      </span>
    </div>
  );
}

export function PaperTradeDetails({
  trade,
}: PaperTradeDetailsProps) {
  return (
    <div className="rounded-xl border border-border-default bg-panel p-6">
      <h2 className="mb-5 text-xl font-semibold">
        Trade Details
      </h2>

      <DetailRow
        label="Market"
        value={trade.market}
      />

      <DetailRow
        label="Buy Exchange"
        value={trade.buyExchange.toUpperCase()}
      />

      <DetailRow
        label="Sell Exchange"
        value={trade.sellExchange.toUpperCase()}
      />

      <DetailRow
        label="Capital"
        value={formatCurrency(trade.capital)}
      />

      <DetailRow
        label="Expected Profit"
        value={formatCurrency(
          trade.expectedProfit,
        )}
      />

      <DetailRow
        label="Current Profit"
        value={formatCurrency(
          trade.currentProfit,
        )}
      />

      <DetailRow
        label="Highest Profit"
        value={formatCurrency(
          trade.highestProfit,
        )}
      />

      <DetailRow
        label="Lowest Profit"
        value={formatCurrency(
          trade.lowestProfit,
        )}
      />

      <DetailRow
        label="Status"
        value={trade.status}
      />
    </div>
  );
}