import DashboardStatCard from "./DashboardStatCard";

interface PortfolioWidgetProps {
  capital: number;

  openTrades: number;

  expectedProfit: number;

  actualProfit: number;

  winRate: number;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value);
}

export default function PortfolioWidget({
  capital,
  openTrades,
  expectedProfit,
  actualProfit,
  winRate,
}: PortfolioWidgetProps) {
  return (
    <div className="rounded-xl border border-border-default bg-panel p-5">
      <div className="mb-5">
        <p className="text-xs uppercase tracking-[0.18em] text-text-muted">
          Portfolio
        </p>

        <h2 className="mt-1 text-2xl font-bold">
          Trading Capital
        </h2>
      </div>

      <div className="grid gap-4">
        <DashboardStatCard
          title="Capital"
          value={formatCurrency(capital)}
          subtitle="Configured trading capital"
        />

        <DashboardStatCard
          title="Open Trades"
          value={openTrades}
          subtitle="Currently monitored"
        />

        <DashboardStatCard
          title="Expected Profit"
          value={formatCurrency(expectedProfit)}
          subtitle="Projected return"
        />

        <DashboardStatCard
          title="Actual Profit"
          value={formatCurrency(actualProfit)}
          subtitle="Realized P&L"
        />

        <DashboardStatCard
          title="Win Rate"
          value={`${winRate.toFixed(1)}%`}
          subtitle="Completed trades"
        />
      </div>
    </div>
  );
}