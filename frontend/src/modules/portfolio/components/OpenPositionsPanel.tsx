import type { PaperTrade } from "@/modules/paper-trading/types/PaperTrade";

interface OpenPositionsPanelProps {
  trades: PaperTrade[];
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number) {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(2)}%`;
}

export default function OpenPositionsPanel({
  trades,
}: OpenPositionsPanelProps) {
  return (
    <div className="rounded-xl border border-border-default bg-panel">
      <div className="flex items-center justify-between border-b border-border-default px-6 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
            Paper Portfolio
          </p>

          <h2 className="mt-1 text-xl font-bold">
            Open Positions
          </h2>
        </div>

        <span className="rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold text-brand">
          {trades.length} OPEN
        </span>
      </div>

      {trades.length === 0 ? (
        <div className="p-8 text-center text-text-muted">
          No open paper trades.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-panel-light">
              <tr>
                <th className="px-4 py-3 text-left">
                  Market
                </th>
                <th className="px-4 py-3 text-left">
                  Capital
                </th>
                <th className="px-4 py-3 text-left">
                  Buy
                </th>
                <th className="px-4 py-3 text-left">
                  Sell
                </th>
                <th className="px-4 py-3 text-right">
                  Expected
                </th>
                <th className="px-4 py-3 text-right">
                  ROI
                </th>
                <th className="px-4 py-3 text-center">
                  Status
                </th>
              </tr>
            </thead>

            <tbody>
              {trades.map((trade) => (
                <tr
                  key={trade.id}
                  className="border-t border-border-default"
                >
                  <td className="px-4 py-3 font-semibold">
                    {trade.market}
                  </td>

                  <td className="px-4 py-3">
                    {formatCurrency(
                      trade.capital,
                    )}
                  </td>

                  <td className="px-4 py-3 font-mono">
                    {trade.buyPrice}
                  </td>

                  <td className="px-4 py-3 font-mono">
                    {trade.sellPrice}
                  </td>

                  <td className="px-4 py-3 text-right font-semibold text-success">
                    {formatCurrency(
                      trade.expectedProfit,
                    )}
                  </td>

                  <td className="px-4 py-3 text-right font-semibold text-success">
                    {formatPercent(
                      trade.expectedProfitPercent,
                    )}
                  </td>

                  <td className="px-4 py-3 text-center">
                    <span className="rounded-full bg-success/10 px-3 py-1 text-xs font-semibold text-success">
                      {trade.status.toUpperCase()}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
