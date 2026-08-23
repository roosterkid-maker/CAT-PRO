import type {
  V18ProductionReadinessReport,
} from "@/modules/production-safety/types/V18Readiness";

import DashboardStatCard from "./DashboardStatCard";

interface ExecutionTerminalSummaryProps {
  referenceCapital:
    | number
    | null;

  liveOpportunities:
    | number
    | null;

  executableOpportunities:
    | number
    | null;

  openPaperTrades:
    | number
    | null;

  expectedProfit:
    | number
    | null;

  readiness:
    | V18ProductionReadinessReport
    | undefined;

  readinessLoading: boolean;

  readinessUnavailable: boolean;
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

export default function ExecutionTerminalSummary({
  referenceCapital,
  liveOpportunities,
  executableOpportunities,
  openPaperTrades,
  expectedProfit,
  readiness,
  readinessLoading,
  readinessUnavailable,
}: ExecutionTerminalSummaryProps) {
  const liveSubmissionStatus =
    readiness
      ? readiness
          .liveSubmissionAllowed
        ? "Allowed"
        : "Off"
      : readinessLoading
        ? "Loading..."
        : null;

  const liveSubmissionSubtitle =
    readiness
      ? "Authoritative production-safety gate"
      : readinessUnavailable
        ? "Production-safety evidence unavailable"
        : "Awaiting production-safety evidence";

  return (
    <div className="dashboard-execution-summary mb-6">
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
          Execution Terminal
        </p>

        <h2 className="mt-1 text-2xl font-semibold text-text-primary">
          Execution Evidence Summary
        </h2>

        <p className="mt-1 text-sm text-text-muted">
          Read-only metrics. LIVE state is reported only by the
          production-safety gate.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <DashboardStatCard
          title="Available Capital"
          value={formatCurrency(referenceCapital)}
          subtitle="Backend portfolio snapshot"
        />

        <DashboardStatCard
          title="Current Opportunities"
          value={formatCount(
            liveOpportunities,
          )}
          subtitle="Current ranked matches"
        />

        <DashboardStatCard
          title="Executable"
          value={formatCount(
            executableOpportunities,
          )}
          subtitle="Backend decision, liquidity and freshness passed"
        />

        <DashboardStatCard
          title="Open Paper Trades"
          value={formatCount(
            openPaperTrades,
          )}
          subtitle="Currently being monitored"
        />

        <DashboardStatCard
          title="Expected Paper Profit"
          value={formatCurrency(expectedProfit)}
          subtitle="Across active paper trades"
        />

        <DashboardStatCard
          title="LIVE Submission"
          value={
            liveSubmissionStatus
          }
          subtitle={
            liveSubmissionSubtitle
          }
        />
      </div>
    </div>
  );
}

function formatCount(
  value:
    | number
    | null,
): string | null {
  return value === null
    ? null
    : value.toLocaleString();
}
