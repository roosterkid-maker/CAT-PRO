import {
  Activity,
  CircleDollarSign,
  Clock3,
  Gauge,
} from "lucide-react";

import {
  ExchangeStatusCard,
} from "../components/ExchangeStatusCard";

import {
  ExchangeAnalyticsPanel,
} from "../components/ExchangeAnalyticsPanel";

import {
  SystemOverviewCard,
} from "../components/SystemOverviewCard";

import {
  LiveAlertCenter,
} from "../components/LiveAlertCenter";

import {
  ExecutionAnalyticsCharts,
} from "../components/ExecutionAnalyticsCharts";

import {
  ExecutionHealthCard,
} from "../components/ExecutionHealthCard";

import {
  ExecutionMetricsCard,
} from "../components/ExecutionMetricsCard";

import {
  ExecutionPerformancePanel,
} from "../components/ExecutionPerformancePanel";

import {
  LiveOpportunityFeed,
} from "../components/LiveOpportunityFeed";

import {
  RecentArbitrageCycles,
} from "../components/RecentArbitrageCycles";

import {
  RecentExecutionErrors,
} from "../components/RecentExecutionErrors";

import {
  RecentExecutionsTable,
} from "../components/RecentExecutionsTable";

import {
  StatCard,
} from "../components/StatCard";

import {
  TradingPnLCard,
} from "../components/TradingPnLCard";

import {
  useArbitragePnL,
  useExecutionHealth,
  useExecutionMetrics,
} from "../hooks/useExecutionMonitoring";

export function ExecutionMonitoringDashboard() {
  const healthQuery =
    useExecutionHealth();

  const metricsQuery =
    useExecutionMetrics();

  const pnlQuery =
    useArbitragePnL();

  const health =
    healthQuery.data;

  const metrics =
    metricsQuery.data;

  const pnl =
    pnlQuery.data;

  const averageExecutionTime =
    metrics?.exchanges.length
      ? metrics.exchanges.reduce(
          (
            total,
            exchange,
          ) =>
            total +
            exchange.averageExecutionTimeMs,
          0,
        ) /
        metrics.exchanges.length
      : 0;

  const exchangeNames =
    Array.from(
      new Set([
        ...(
          health?.exchanges.map(
            (exchange) =>
              exchange.exchange,
          ) ??
          []
        ),

        ...(
          metrics?.exchanges.map(
            (exchange) =>
              exchange.exchange,
          ) ??
          []
        ),

        "coindcx",
        "binance",
      ]),
    );

  const netProfit =
    pnl?.netProfit ??
    0;

  const pnlTrendDirection:
    | "up"
    | "down"
    | "neutral" =
    netProfit > 0
      ? "up"
      : netProfit < 0
        ? "down"
        : "neutral";

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-text-primary">
          Execution Monitoring
        </h1>

        <p className="mt-2 text-sm text-text-muted">
          Live execution health, exchange performance and trading reliability.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total Executions"
          value={
            metrics?.totalExecutions ??
            0
          }
          description="Recorded live executions"
          icon={
            <Activity size={20} />
          }
        />

        <StatCard
          title="Healthy Exchanges"
          value={
            health?.healthyExchanges ??
            0
          }
          description="Within configured limits"
          icon={
            <Gauge size={20} />
          }
        />

        <StatCard
          title="Average Execution"
          value={`${averageExecutionTime.toFixed(
            0,
          )} ms`}
          description="Across all exchanges"
          icon={
            <Clock3 size={20} />
          }
        />

        <StatCard
          title="Net P&L"
          value={`₹${netProfit.toFixed(
            2,
          )}`}
          description={`${pnl?.completedCycles ?? 0} completed cycles`}
          icon={
            <CircleDollarSign
              size={20}
            />
          }
          trend={{
            label: `${(
              pnl?.winRatePercent ??
              0
            ).toFixed(1)}% Win Rate`,

            direction:
              pnlTrendDirection,
          }}
        />
      </section>
      <section>
  <SystemOverviewCard />
</section>

      <section>
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-text-primary">
            Exchange Execution
          </h2>

          <p className="mt-1 text-sm text-text-muted">
            Live adapter connectivity and execution reliability by exchange.
          </p>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          {exchangeNames.map(
            (exchange) => (
              <ExchangeStatusCard
                key={
                  exchange
                }
                exchange={
                  exchange
                }
                health={
                  health?.exchanges.find(
                    (item) =>
                      item.exchange ===
                      exchange,
                  ) ??
                  null
                }
                metrics={
                  metrics?.exchanges.find(
                    (item) =>
                      item.exchange ===
                      exchange,
                  ) ??
                  null
                }
              />
            ),
          )}
        </div>
      </section>

      <section>
        <ExecutionPerformancePanel />
      </section>

      <section>
  <ExchangeAnalyticsPanel />
</section>

      <section>
  <ExecutionAnalyticsCharts />
</section>

      <section>
        <LiveOpportunityFeed />
      </section>
      <section>
  <LiveAlertCenter />
</section>

      <section className="grid gap-6 xl:grid-cols-2">
        <ExecutionHealthCard />

        <ExecutionMetricsCard />
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <RecentExecutionErrors />

        <TradingPnLCard />
      </section>

      <section>
        <RecentArbitrageCycles />
      </section>

      <section>
        <RecentExecutionsTable />
      </section>
    </div>
  );
}