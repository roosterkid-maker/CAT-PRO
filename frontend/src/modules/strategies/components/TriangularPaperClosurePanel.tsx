import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Triangle,
} from "lucide-react";

import {
  useTriangularPaperClosure,
} from "../hooks/useStrategies";

import type {
  TriangularPaperClosureState,
  TriangularPathSummary,
} from "../types/TriangularPaperClosure";

export function TriangularPaperClosurePanel() {
  const query = useTriangularPaperClosure();
  const report = query.data?.data;

  if (query.isPending && !report) {
    return <PanelState title="Loading triangular economic evidence" detail="Reading current three-leg depth, fees, rules and central lineage." />;
  }

  if (query.isError || !report) {
    return <PanelState danger title="Triangular closure evidence unavailable"
      detail="No qualified edge or PAPER readiness is inferred while this evidence is unavailable." />;
  }

  const best = report.economics.bestNetPath ?? report.economics.bestGrossPath;

  return (
    <section className="overflow-hidden rounded-xl border border-border-default bg-panel">
      <div className="border-b border-border-default p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-brand">
              <Triangle className="size-5" />
              <p className="text-xs font-semibold uppercase tracking-[0.16em]">
                V180 Adaptive Closed-Loop Arbitrage
              </p>
            </div>
            <h2 className="mt-2 text-xl font-bold text-text-primary">
              Three-leg economics and exact central handoff
            </h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-text-muted">{report.message}</p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-text-muted">
              Source {report.economics.evidenceState.replaceAll("_", " ")} / current scan {report.economics.currentEvaluatedPaths} paths / age {formatAge(report.economics.evidenceAgeMs)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StateBadge state={report.state} />
            <button type="button" aria-label="Refresh triangular PAPER closure"
              disabled={query.isFetching} onClick={() => void query.refetch()}
              className="rounded-md border border-border-default bg-panel-light p-2 text-text-muted hover:text-text-primary disabled:opacity-60">
              <RefreshCw className={`size-4 ${query.isFetching ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <Metric label="Paths evaluated" value={report.economics.evaluatedPaths} />
          <Metric label="Economically evaluable" value={report.economics.economicallyEvaluablePaths} />
          <Metric label="Gross positive" value={report.economics.grossPositivePaths} />
          <Metric label="Net positive" value={report.economics.netPositivePaths}
            tone={report.economics.netPositivePaths > 0 ? "success" : "warning"} />
          <Metric label="Qualified" value={report.economics.qualifiedPaths}
            tone={report.economics.qualifiedPaths > 0 ? "success" : "warning"} />
          <Metric label="Required net edge" value={`${formatPercent(report.economics.minimumNetProfitPercent)}`} />
        </div>
      </div>

      <div className="grid gap-4 p-5 xl:grid-cols-[1.3fr_1fr]">
        <AclaOperations report={report.acla} />

        <section className="rounded-lg border border-border-default bg-panel-light p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.13em] text-text-muted">Best current path</p>
            {report.economics.thresholdShortfallPercent !== null ? (
              <span className="rounded-full border border-warning/30 bg-warning/10 px-2 py-1 font-mono text-[10px] font-bold text-warning">
                shortfall {formatPercent(report.economics.thresholdShortfallPercent)}
              </span>
            ) : null}
          </div>
          {best ? <BestPath path={best} /> : (
            <p className="mt-4 text-sm text-text-muted">No complete current path economics are available.</p>
          )}
        </section>

        <section className="rounded-lg border border-border-default bg-panel-light p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.13em] text-text-muted">Central lineage</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Fact label="Signals now" value={report.controller.currentSignals} />
            <Fact label="Signals observed" value={report.controller.totalSignalsObserved} />
            <Fact label="Plans admitted" value={report.lineage.plansAdmitted} />
            <Fact label="Active / completed queue" value={`${report.lineage.activeQueue} / ${report.lineage.completedQueue}`} />
          </div>
          <p className="mt-4 text-xs text-text-muted">
            Latest plan intake: <span className="font-mono font-semibold text-text-primary">{report.lineage.latestPlanIntakeState ?? "NO_DATA"}</span>
          </p>
          <div className="mt-3 rounded-md border border-success/20 bg-success/5 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-success">Sequential funding contract</p>
            <p className="mt-1 text-xs leading-5 text-text-muted">
              Leg 1 requires authenticated {report.fundingPolicy.startAsset ?? "start-asset"} wallet balance. Legs 2 and 3 use fee-adjusted proceeds from the immediately previous filled leg; duplicate intermediate wallet balances are not required.
            </p>
          </div>
          {report.lineage.latestPlanIntakeBlockers.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {report.lineage.latestPlanIntakeBlockers.slice(0, 6).map((blocker) => (
                <span key={blocker} className="rounded-md border border-danger/20 bg-danger/5 px-2 py-1 font-mono text-[10px] text-danger">
                  {blocker}
                </span>
              ))}
            </div>
          ) : null}
        </section>

        <section className="xl:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-[0.13em] text-text-muted">Dominant blockers</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {report.economics.dominantBlockers.length > 0 ? report.economics.dominantBlockers.map((blocker) => (
              <span key={blocker.code} className="rounded-md border border-warning/20 bg-warning/5 px-3 py-2 font-mono text-[10px] text-warning">
                {blocker.code} · {blocker.count}
              </span>
            )) : <span className="text-xs text-text-muted">No blocker evidence.</span>}
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-border-default bg-panel-light xl:col-span-2">
          <div className="border-b border-border-default px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.13em] text-text-muted">Exchange conversion funnel</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="text-[10px] uppercase tracking-[0.1em] text-text-muted">
                <tr>
                  <th className="px-4 py-3">Exchange</th>
                  <th className="px-4 py-3">Evaluated</th>
                  <th className="px-4 py-3">Economic</th>
                  <th className="px-4 py-3">Gross +</th>
                  <th className="px-4 py-3">Net +</th>
                  <th className="px-4 py-3">Qualified</th>
                  <th className="px-4 py-3">Best net</th>
                </tr>
              </thead>
              <tbody>
                {report.economics.exchanges.map((exchange) => (
                  <tr key={exchange.exchange} className="border-t border-border-default font-mono text-text-primary">
                    <td className="px-4 py-3 font-bold uppercase">{exchange.exchange}</td>
                    <td className="px-4 py-3">{exchange.evaluatedPaths}</td>
                    <td className="px-4 py-3">{exchange.economicallyEvaluablePaths}</td>
                    <td className="px-4 py-3">{exchange.grossPositivePaths}</td>
                    <td className="px-4 py-3">{exchange.netPositivePaths}</td>
                    <td className="px-4 py-3">{exchange.qualifiedPaths}</td>
                    <td className="px-4 py-3">{exchange.bestNetProfitPercent === null ? "NO_DATA" : formatPercent(exchange.bestNetProfitPercent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="xl:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-[0.13em] text-text-muted">Nearest real routes</p>
          <div className="mt-3 grid gap-3 xl:grid-cols-5">
            {report.economics.nearestPaths.map((path) => (
              <div key={path.pathId} className="rounded-lg border border-border-default bg-panel-light p-3">
                <p className="truncate font-mono text-xs font-bold text-text-primary">{path.assets.join(" > ")}</p>
                <p className="mt-1 text-[10px] uppercase tracking-[0.1em] text-text-muted">{path.exchange}</p>
                <p className={`mt-3 font-mono text-sm font-bold ${path.netProfitPercent !== null && path.netProfitPercent > 0 ? "text-success" : "text-warning"}`}>
                  {path.netProfitPercent === null ? "NO_DATA" : formatPercent(path.netProfitPercent)}
                </p>
                <p className="mt-1 text-[10px] text-text-muted">fee drag {nullablePercent(path.feeDragPercent)} / rounding {nullablePercent(path.quantizationDragPercent)}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="xl:col-span-2 flex flex-wrap gap-2 border-t border-border-default pt-4 text-[10px] font-semibold uppercase tracking-[0.1em] text-text-muted">
          <Safety label="Real paths only" passed={report.safety.genuineMarketPathsOnly} />
          <Safety label="Fees and rules required" passed={report.safety.feesAndRulesRemainRequired} />
          <Safety label="Threshold unchanged" passed={!report.safety.profitabilityThresholdMutated} />
          <Safety label="No fabricated signals" passed={!report.safety.signalFabricationAllowed} />
          <Safety label="LIVE / orders off" passed={!report.safety.liveExecutionAllowed && !report.safety.orderSubmissionAllowed} />
        </div>
      </div>
    </section>
  );
}

function BestPath({path}: {path: TriangularPathSummary}) {
  return (
    <div className="mt-4">
      <p className="font-mono text-sm font-bold text-text-primary">{path.assets.join(" → ")}</p>
      <p className="mt-1 text-xs uppercase tracking-[0.12em] text-text-muted">{path.exchange}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Fact label="Gross edge" value={formatPercent(path.grossProfitPercent)} />
        <Fact label="Expected net" value={nullablePercent(path.expectedNetProfitPercent)} />
        <Fact label="Stress net" value={nullablePercent(path.stressNetProfitPercent)} />
        <Fact label="Absolute net" value={path.absoluteNetProfitInr === null ? "NO_DATA" : formatInr(path.absoluteNetProfitInr)} />
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Fact label="Actual start traded" value={formatQuantity(path.initialInputQuantity)} />
        <Fact label="Start asset retained" value={formatQuantity(path.retainedStartQuantity)} />
        <Fact label="Capital utilized" value={formatPercent(path.capitalUtilizationPercent)} />
        <Fact label="Reserve drag" value={formatPercent(path.reserveDragPercent)} />
        <Fact label="TDS capital lock" value={path.tdsCapitalLockInr === null ? "NO_DATA" : formatInr(path.tdsCapitalLockInr)} />
        <Fact label="Book skew" value={path.maximumBookSkewMs === null ? "NO_DATA" : `${path.maximumBookSkewMs} ms`} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {path.legs.map((leg, index) => (
          <span key={`${leg.market}:${index}`} className="rounded-md border border-border-default bg-panel px-2 py-1 font-mono text-[10px] text-text-muted">
            L{index + 1} {leg.action === "BUY_BASE" ? "BUY" : "SELL"} {leg.market} · VWAP {formatQuantity(leg.averageFillPrice)} · {leg.consumedDepthLevels} level(s) · {leg.orderBookAgeMs} ms
          </span>
        ))}
      </div>
    </div>
  );
}

function AclaOperations({report}: {report: import("../types/TriangularPaperClosure").TriangularPaperClosureReport["acla"]}) {
  const pool = report.capital?.pool;
  const lifecycle = report.lifecycle;
  const performance = report.performance;
  const invariantHealthy = report.capital !== null && Object.values(report.capital.invariant).every(Boolean);
  return (
    <section className="xl:col-span-2 overflow-hidden rounded-lg border border-brand/30 bg-panel-light">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border-default px-4 py-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.13em] text-brand">ACLA capital loop · genuine SHADOW</p>
          <p className="mt-1 text-xs text-text-muted">One strategy-scoped, restart-safe capital pool. PAPER is implemented but OFF; LIVE and order submission are OFF.</p>
        </div>
        <div className="flex gap-2">
          <span className="rounded-full border border-success/30 bg-success/10 px-2 py-1 font-mono text-[10px] font-bold text-success">{report.rolloutStage}</span>
          <span className={`rounded-full border px-2 py-1 font-mono text-[10px] font-bold ${invariantHealthy ? "border-success/30 bg-success/10 text-success" : "border-danger/30 bg-danger/10 text-danger"}`}>CAPITAL {invariantHealthy ? "BALANCED" : "NO DATA"}</span>
        </div>
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-6">
        <Metric label="Pool allocation" value={pool ? formatInr(pool.totalAllocationInr) : "NO_DATA"} />
        <Metric label="Active free" value={pool ? formatInr(pool.activeFreeInr) : "NO_DATA"} />
        <Metric label="Reserved / in-flight" value={pool ? `${formatInr(pool.reservedInr)} / ${formatInr(pool.inFlightInr)}` : "NO_DATA"} />
        <Metric label="Recovery reserve" value={pool ? `${formatInr(pool.recoveryReserveInr)} · ${formatInr(pool.recoveryReserveInUseInr)} in use` : "NO_DATA"} />
        <Metric label="TDS / dust locked" value={pool ? `${formatInr(pool.tdsLockedInr)} / ${formatInr(pool.dustLedgerInr)}` : "NO_DATA"} />
        <Metric label="Realized P&L" value={pool ? formatInr(pool.realizedPnlInr) : "NO_DATA"} tone={pool && pool.realizedPnlInr > 0 ? "success" : "neutral"} />
      </div>
      <div className="grid gap-3 border-t border-border-default p-4 sm:grid-cols-2 xl:grid-cols-6">
        <Fact label="Circuit breaker" value={pool ? `${pool.circuitBreakerState}${pool.circuitBreakerReason ? ` · ${pool.circuitBreakerReason}` : ""}` : "NO_DATA"} />
        <Fact label="Daily loss" value={pool ? `${formatInr(pool.dailyLossInr)} / ${formatInr(report.capital?.configuration.dailyLossLimitInr ?? 0)}` : "NO_DATA"} />
        <Fact label="Consecutive failures" value={pool ? `${pool.consecutiveFailedCycles} / ${report.capital?.configuration.maximumConsecutiveFailedCycles ?? 0}` : "NO_DATA"} />
        <Fact label="Dust assets" value={pool ? Object.keys(pool.dustByAsset).length : "NO_DATA"} />
        <Fact label="Reinvested / sweepable" value={pool ? `${formatInr(pool.reinvestedProfitInr)} / ${formatInr(pool.sweepableProfitInr)}` : "NO_DATA"} />
        <Fact label="TDS credits released" value={pool ? formatInr(pool.tdsCreditReleasedInr) : "NO_DATA"} />
      </div>
      <div className="grid gap-3 border-t border-border-default p-4 sm:grid-cols-2 xl:grid-cols-8">
        <Fact label="Lifecycle" value={lifecycle?.running ? "RUNNING" : "NO_DATA"} />
        <Fact label="Admitted" value={lifecycle?.admitted ?? 0} />
        <Fact label="Completed" value={lifecycle?.completed ?? 0} />
        <Fact label="Rejected / failed" value={`${lifecycle?.rejected ?? 0} / ${lifecycle?.failed ?? 0}`} />
        <Fact label="Cycles / rolling hour" value={lifecycle?.cyclesInRollingHour ?? 0} />
        <Fact label="Event route wakeups" value={performance?.affectedRouteWakeups ?? 0} />
        <Fact label="Fast-screen avoided" value={performance?.affectedPathsFastScreened ?? 0} />
        <Fact label="Last evaluation" value={performance ? `${performance.lastEvaluationDurationMs.toFixed(3)} ms` : "NO_DATA"} />
      </div>
      {lifecycle?.recentOutcomes.length ? (
        <div className="border-t border-border-default px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-text-muted">Recent closed-loop outcomes</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {lifecycle.recentOutcomes.slice(0, 6).map((outcome) => <span key={`${outcome.signalId}:${outcome.generatedAt}`} className={`rounded-md border px-2 py-1 font-mono text-[10px] ${outcome.state === "COMPLETED" ? "border-success/20 bg-success/5 text-success" : "border-warning/20 bg-warning/5 text-warning"}`}>{outcome.state} · {outcome.reason}</span>)}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Metric({label, value, tone = "neutral"}: {label: string; value: number | string; tone?: "neutral" | "success" | "warning"}) {
  const color = tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "text-text-primary";
  return <div className="rounded-lg border border-border-default bg-panel-light p-3"><p className="text-[10px] uppercase tracking-[0.12em] text-text-muted">{label}</p><p className={`mt-2 font-mono text-lg font-bold ${color}`}>{value}</p></div>;
}

function Fact({label, value}: {label: string; value: number | string}) {
  return <div className="rounded-md border border-border-default bg-panel px-3 py-2"><p className="text-[10px] uppercase tracking-[0.1em] text-text-muted">{label}</p><p className="mt-1 font-mono text-xs font-bold text-text-primary">{value}</p></div>;
}

function Safety({label, passed}: {label: string; passed: boolean}) {
  return <span className="inline-flex items-center gap-1 rounded-full border border-border-default bg-panel-light px-2 py-1">{passed ? <CheckCircle2 className="size-3 text-success" /> : <AlertTriangle className="size-3 text-danger" />}{label}</span>;
}

function StateBadge({state}: {state: TriangularPaperClosureState}) {
  const positive = state === "PAPER_QUEUED" || state === "SIGNAL_ADMITTED" || state === "SIGNAL_AVAILABLE";
  const danger = state === "NO_DATA" || state === "PAPER_BLOCKED";
  return <span className={`rounded-full border px-3 py-1 font-mono text-[10px] font-bold ${positive ? "border-success/30 bg-success/10 text-success" : danger ? "border-danger/30 bg-danger/10 text-danger" : "border-warning/30 bg-warning/10 text-warning"}`}>{state.replaceAll("_", " ")}</span>;
}

function PanelState({title, detail, danger = false}: {title: string; detail: string; danger?: boolean}) {
  return <section className={`rounded-xl border p-5 ${danger ? "border-danger/30 bg-danger/5" : "border-border-default bg-panel"}`}><div className="flex items-start gap-3">{danger ? <AlertTriangle className="mt-0.5 size-5 text-danger" /> : <RefreshCw className="mt-0.5 size-5 animate-spin text-brand" />}<div><h2 className="font-bold text-text-primary">{title}</h2><p className="mt-1 text-sm text-text-muted">{detail}</p></div></div></section>;
}

function formatPercent(value: number): string {
  return `${value.toFixed(4)}%`;
}

function nullablePercent(value: number | null): string {
  return value === null ? "NO_DATA" : formatPercent(value);
}

function formatQuantity(value: number): string {
  return value.toLocaleString(undefined, {maximumFractionDigits: 8});
}

function formatAge(value: number | null): string {
  if (value === null) return "NO_DATA";
  if (value < 1_000) return `${value} ms`;
  return `${(value / 1_000).toFixed(1)} s`;
}

function formatInr(value: number): string {
  return `₹${value.toLocaleString("en-IN", {maximumFractionDigits: 2})}`;
}
