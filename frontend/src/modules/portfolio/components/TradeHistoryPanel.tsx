import type { PaperTrade } from "@/modules/paper-trading/types/PaperTrade";

interface TradeHistoryPanelProps {
  trades: PaperTrade[];
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(value);
}

export default function TradeHistoryPanel({
  trades,
}: TradeHistoryPanelProps) {
  return (
    <div className="rounded-xl border border-border-default bg-panel">
      <div className="border-b border-border-default px-6 py-4">
        <h2 className="text-xl font-bold">
          Trade History
        </h2>
      </div>

      {trades.length === 0 ? (
        <div className="p-8 text-center text-text-muted">
          No completed trades.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-panel-light">
              <tr>
                <th className="px-4 py-3 text-left">
                  Market
                </th>

                <th className="px-4 py-3">
                  Buy
                </th>

                <th className="px-4 py-3">
                  Sell
                </th>

                <th className="px-4 py-3">
                  Capital
                </th>

                <th className="px-4 py-3">
                  Profit
                </th>

                <th className="px-4 py-3">
                  ROI
                </th>

                <th className="px-4 py-3">
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
                    {trade.buyPrice}
                  </td>

                  <td className="px-4 py-3">
                    {trade.actualSellPrice ??
                      trade.sellPrice}
                  </td>

                  <td className="px-4 py-3">
                    {formatCurrency(
                      trade.capital,
                    )}
                  </td>

                  <td className="px-4 py-3 font-semibold">
                    {formatCurrency(
                      trade.actualProfit ??
                        trade.expectedProfit,
                    )}
                  </td>

                  <td className="px-4 py-3">
                    {(
                      trade.actualProfitPercent ??
                      trade.expectedProfitPercent
                    ).toFixed(2)}
                    %
                  </td>

                  <td className="px-4 py-3">
                    {trade.status}
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