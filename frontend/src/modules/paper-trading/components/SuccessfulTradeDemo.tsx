import {
  CheckCircle2,
  FlaskConical,
  Play,
  ShieldCheck,
} from "lucide-react";

import {
  useSuccessfulDemoSimulation,
} from "../hooks/usePaperTrades";

import type {
  DemoSimulationFill,
} from "../types/DemoSimulation";

import {
  Button,
} from "@/shared/ui/button";

export function SuccessfulTradeDemo() {
  const simulation =
    useSuccessfulDemoSimulation();

  const result =
    simulation.data?.data;

  const session =
    result?.data.preparation
      .session;

  return (
    <section className="mb-6 overflow-hidden rounded-xl border border-warning/40 bg-panel">
      <div className="flex flex-col gap-4 border-b border-warning/20 bg-warning/5 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-warning/30 bg-warning/10 text-warning">
            <FlaskConical className="h-5 w-5" />
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-text-primary">
                Successful Trade Demo
              </h2>

              <span className="rounded-full border border-warning/40 bg-warning/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-warning">
                Synthetic demo
              </span>

              <span className="rounded-full border border-danger/30 bg-danger/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-danger">
                Not market evidence
              </span>
            </div>

            <p className="mt-2 max-w-3xl text-sm text-text-muted">
              Runs a fixed successful lifecycle fixture through fills,
              reconciliation, exposure checks and settlement. It does not
              claim a real opportunity, price, fill, profit or exchange order.
            </p>
          </div>
        </div>

        <Button
          type="button"
          onClick={() => simulation.mutate()}
          disabled={simulation.isPending}
          className="h-10 min-w-48 bg-warning text-black hover:bg-warning/80"
        >
          <Play className="h-4 w-4" />
          {simulation.isPending
            ? "Running synthetic cycle..."
            : result
              ? "Run successful demo again"
              : "Run successful demo"}
        </Button>
      </div>

      {simulation.isError ? (
        <div className="m-5 rounded-lg border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
          Demo simulation failed: {simulation.error instanceof Error
            ? simulation.error.message
            : "Unknown error"}
        </div>
      ) : null}

      {result && session ? (
        <div className="p-5" aria-live="polite">
          <div className="flex flex-col gap-4 rounded-xl border border-success/30 bg-success/5 p-5 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-9 w-9 shrink-0 text-success" />

              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-success">
                  Simulated trade successful
                </p>

                <p className="mt-1 text-xl font-semibold text-text-primary">
                  {session.market} · {formatExchange(session.buyExchange)} →{" "}
                  {formatExchange(session.sellExchange)}
                </p>

                <p className="mt-1 text-xs text-text-muted">
                  Synthetic fixture completed at {formatTimestamp(result.generatedAt)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <DemoMetric
                label="Fixture capital"
                value={formatUsdt(session.capital)}
              />

              <DemoMetric
                label="Fixture gross"
                value={`+${formatUsdt(result.data.settlement.grossProfit)}`}
              />

              <DemoMetric
                label="Fixture fees"
                value={formatUsdt(result.data.settlement.totalFees)}
              />

              <DemoMetric
                label="Fixture net"
                value={`+${formatUsdt(result.data.settlement.netProfit)}`}
                success
              />
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <DemoFillCard title="Synthetic BUY fill" fill={result.data.buyFill} />
            <DemoFillCard title="Synthetic SELL fill" fill={result.data.sellFill} />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SafetyCheck
              label="No exchange order submitted"
              passed={result.noExchangeOrderSubmitted}
            />

            <SafetyCheck
              label="Account capital unchanged"
              passed={result.accountCapitalUnchanged}
            />

            <SafetyCheck
              label="Exposure balanced"
              passed={result.checks.exposureBalanced === true}
            />

            <SafetyCheck
              label="Synthetic settlement completed"
              passed={result.checks.settlementCompleted === true}
            />
          </div>

          <div className="mt-4 flex items-start gap-2 rounded-lg border border-brand/20 bg-brand/5 p-3 text-xs text-text-muted">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
            <p>
              This synthetic result is not inserted into genuine Paper Trades,
              real Execution History, arbitrage P&amp;L, balances or readiness.
              LIVE remains OFF.
            </p>
          </div>
        </div>
      ) : (
        <div className="p-5 text-sm text-text-muted">
          Run the demo to see a clearly isolated successful BUY/SELL cycle.
        </div>
      )}
    </section>
  );
}

function DemoFillCard({
  title,
  fill,
}: {
  title: string;
  fill: DemoSimulationFill;
}) {
  return (
    <div className="rounded-xl border border-border-default bg-app-bg/40 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-text-muted">
          {title}
        </p>

        <span className="rounded-full border border-success/30 bg-success/10 px-2 py-1 text-[10px] font-bold uppercase text-success">
          {fill.lastStatus}
        </span>
      </div>

      <p className="mt-3 text-lg font-semibold text-text-primary">
        {formatExchange(fill.exchange)}
      </p>

      <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
        <DemoMetric label="Fixture qty" value={formatNumber(fill.filledQuantity)} />
        <DemoMetric label="Fixture price" value={formatUsdt(fill.averageFillPrice)} />
        <DemoMetric label="Fixture fee" value={formatUsdt(fill.feeAmount)} />
      </div>
    </div>
  );
}

function DemoMetric({
  label,
  value,
  success = false,
}: {
  label: string;
  value: string;
  success?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-text-muted">
        {label}
      </p>

      <p
        className={`mt-1 truncate font-mono text-sm font-semibold tabular-nums ${
          success ? "text-success" : "text-text-primary"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function SafetyCheck({
  label,
  passed,
}: {
  label: string;
  passed: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-lg border p-3 text-xs font-semibold ${
        passed
          ? "border-success/30 bg-success/5 text-success"
          : "border-danger/30 bg-danger/5 text-danger"
      }`}
    >
      <CheckCircle2 className="h-4 w-4 shrink-0" />
      {label}
    </div>
  );
}

function formatUsdt(value: number): string {
  return `${formatNumber(value)} USDT`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  }).format(value);
}

function formatExchange(exchange: string): string {
  const names: Record<string, string> = {
    binance: "Binance",
    coindcx: "CoinDCX",
    bybit: "Bybit",
    unocoin: "UnoCoin",
    coinswitch: "CoinSwitch",
  };

  return names[exchange.trim().toLowerCase()] ?? exchange;
}

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
