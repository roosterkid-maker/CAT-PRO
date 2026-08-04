import type { PortfolioSummary } from "../types/PortfolioSummary";

interface PortfolioSummaryCardsProps {
  portfolio: PortfolioSummary;
}

interface MetricCardProps {
  title: string;
  value: string;
  subtitle: string;
  positive?: boolean;
  negative?: boolean;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number): string {
  const prefix = value > 0 ? "+" : "";

  return `${prefix}${value.toFixed(2)}%`;
}

function MetricCard({
  title,
  value,
  subtitle,
  positive = false,
  negative = false,
}: MetricCardProps) {
  const valueClassName = positive
    ? "text-success"
    : negative
      ? "text-danger"
      : "text-text-primary";

  return (
    <div className="rounded-xl border border-border-default bg-panel p-5 transition-transform hover:-translate-y-0.5">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
        {title}
      </p>

      <p
        className={`mt-3 text-2xl font-bold tabular-nums ${valueClassName}`}
      >
        {value}
      </p>

      <p className="mt-2 text-xs text-text-muted">
        {subtitle}
      </p>
    </div>
  );
}

export default function PortfolioSummaryCards({
  portfolio,
}: PortfolioSummaryCardsProps) {
  const pnlPositive =
    portfolio.todayNetProfit > 0;

  const pnlNegative =
    portfolio.todayNetProfit < 0;

  const roiPositive =
    portfolio.roiPercent > 0;

  const roiNegative =
    portfolio.roiPercent < 0;

  return (
    <section>
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">
          Portfolio Performance
        </p>

        <h2 className="mt-1 text-2xl font-bold text-text-primary">
          Capital & Trading Metrics
        </h2>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Current Capital"
          value={formatCurrency(
            portfolio.currentCapital,
          )}
          subtitle={`Initial ${formatCurrency(
            portfolio.initialCapital,
          )}`}
        />

        <MetricCard
          title="Available Capital"
          value={formatCurrency(
            portfolio.availableCapital,
          )}
          subtitle="Ready for new trades"
        />

        <MetricCard
          title="Allocated Capital"
          value={formatCurrency(
            portfolio.allocatedCapital,
          )}
          subtitle={`${portfolio.openTrades} open trades`}
        />

        <MetricCard
          title="Today's P&L"
          value={formatCurrency(
            portfolio.todayNetProfit,
          )}
          subtitle={`Profit ${formatCurrency(
            portfolio.todayProfit,
          )} · Loss ${formatCurrency(
            portfolio.todayLoss,
          )}`}
          positive={pnlPositive}
          negative={pnlNegative}
        />

        <MetricCard
          title="Total Realized P&L"
          value={formatCurrency(
            portfolio.totalRealizedProfit,
          )}
          subtitle={`${portfolio.closedTrades} completed trades`}
          positive={
            portfolio.totalRealizedProfit > 0
          }
          negative={
            portfolio.totalRealizedProfit < 0
          }
        />

        <MetricCard
          title="Portfolio ROI"
          value={formatPercent(
            portfolio.roiPercent,
          )}
          subtitle="Return on initial capital"
          positive={roiPositive}
          negative={roiNegative}
        />

        <MetricCard
          title="Win Rate"
          value={`${portfolio.winRatePercent.toFixed(
            1,
          )}%`}
          subtitle={`${portfolio.winningTrades} wins · ${portfolio.losingTrades} losses`}
          positive={
            portfolio.winRatePercent > 50
          }
        />

        <MetricCard
          title="Profit Factor"
          value={portfolio.profitFactor.toFixed(
            2,
          )}
          subtitle={`Best ${formatCurrency(
            portfolio.bestTradeProfit,
          )} · Worst ${formatCurrency(
            portfolio.worstTradeProfit,
          )}`}
          positive={
            portfolio.profitFactor > 1
          }
          negative={
            portfolio.profitFactor > 0 &&
            portfolio.profitFactor < 1
          }
        />
      </div>
    </section>
  );
}