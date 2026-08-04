import DashboardStatCard from "./DashboardStatCard";

interface ExecutionTerminalSummaryProps {
  referenceCapital: number;
  liveOpportunities: number;
  executableOpportunities: number;
  openPaperTrades: number;
  expectedProfit: number;
  systemHealthy: boolean;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value);
}

export default function ExecutionTerminalSummary({
  referenceCapital,
  liveOpportunities,
  executableOpportunities,
  openPaperTrades,
  expectedProfit,
  systemHealthy,
}: ExecutionTerminalSummaryProps) {
  return (
    <div className="mb-6">
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
          Execution Terminal
        </p>

        <h2 className="mt-1 text-2xl font-semibold text-text-primary">
          Live Trading Summary
        </h2>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <DashboardStatCard
          title="Reference Capital"
          value={formatCurrency(referenceCapital)}
          subtitle="Configured trade size"
        />

        <DashboardStatCard
          title="Live Opportunities"
          value={liveOpportunities.toLocaleString()}
          subtitle="Current ranked matches"
        />

        <DashboardStatCard
          title="Executable"
          value={executableOpportunities.toLocaleString()}
          subtitle="Passed execution analysis"
        />

        <DashboardStatCard
          title="Open Paper Trades"
          value={openPaperTrades.toLocaleString()}
          subtitle="Currently being monitored"
        />

        <DashboardStatCard
          title="Expected Profit"
          value={formatCurrency(expectedProfit)}
          subtitle="Across active paper trades"
        />

        <DashboardStatCard
          title="Terminal Status"
          value={systemHealthy ? "Ready" : "Degraded"}
          subtitle="Execution services"
        />
      </div>
    </div>
  );
}