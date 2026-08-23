import DashboardStatCard from "./DashboardStatCard";

interface PortfolioWidgetProps {
  capital:
    | number
    | null;

  openTrades:
    | number
    | null;

  expectedProfit:
    | number
    | null;

  actualProfit:
    | number
    | null;

  winRate:
    | number
    | null;
}

function formatCurrency(
  value:
    | number
    | null,
): string | null {
  if (value === null) {
    return null;
  }

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
    <div className="dashboard-portfolio-console rounded-xl border border-border-default bg-panel p-5">
      <div className="mb-5">
        <p className="text-xs uppercase tracking-[0.18em] text-text-muted">
          Portfolio
        </p>

        <h2 className="mt-1 text-2xl font-bold">
          Portfolio Evidence
        </h2>
      </div>

      <div className="grid gap-4">
        <DashboardStatCard
          title="Capital"
          value={formatCurrency(capital)}
          subtitle="Backend portfolio snapshot"
        />

        <DashboardStatCard
          title="Open Trades"
          value={openTrades}
          subtitle="Currently monitored"
        />

        <DashboardStatCard
          title="Expected Profit"
          value={formatCurrency(expectedProfit)}
          subtitle="Active paper-trade estimate"
        />

        <DashboardStatCard
          title="Actual Profit"
          value={formatCurrency(actualProfit)}
          subtitle="Realized P&L"
        />

        <DashboardStatCard
          title="Win Rate"
          value={
            winRate === null
              ? null
              : `${winRate.toFixed(
                  1,
                )}%`
          }
          subtitle="Completed trades"
        />
      </div>
    </div>
  );
}
