import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";

import {
  usePerpetualPerpetualPaperClosure,
} from "../hooks/useStrategies";

import type {
  PerpetualPerpetualPaperClosureState,
} from "../types/PerpetualPerpetualPaperClosure";

import {
  DerivativeVenueEvidenceGrid,
} from "./DerivativeVenueEvidenceGrid";

export function PerpetualPerpetualPaperClosurePanel() {
  const query = usePerpetualPerpetualPaperClosure();
  const report = query.data?.data;

  if (query.isPending && !report) {
    return <PanelState title="Loading Strategy #6 closure evidence"
      detail="Reading same-contract dislocations, full-depth costs, authenticated margin and central lineage." />;
  }

  if (query.isError || !report) {
    return <PanelState danger title="Strategy #6 closure evidence unavailable"
      detail="No perpetual dislocation, derivative readiness or PAPER eligibility is inferred while this evidence is unavailable." />;
  }

  const best = report.economics.bestGrossRoute;
  const bestNet = report.economics.bestNetRoute;

  return (
    <section className="overflow-hidden rounded-xl border border-border-default bg-panel">
      <div className="border-b border-border-default p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-brand">
              <Activity className="size-5" />
              <p className="text-xs font-semibold uppercase tracking-[0.16em]">
                V71 Strategy #6 PAPER Closure
              </p>
            </div>
            <h2 className="mt-2 text-xl font-bold text-text-primary">
              Same-contract perpetual dislocation and authenticated margin gates
            </h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-text-muted">{report.message}</p>
          </div>
          <div className="flex items-center gap-2">
            <StateBadge state={report.state} />
            <button type="button" aria-label="Refresh Strategy #6 PAPER closure"
              disabled={query.isFetching} onClick={() => void query.refetch()}
              className="rounded-md border border-border-default bg-panel-light p-2 text-text-muted hover:text-text-primary disabled:opacity-60">
              <RefreshCw className={`size-4 ${query.isFetching ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <Metric label="Routes evaluated" value={report.economics.evaluatedRoutes} />
          <Metric label="Dislocation evaluable" value={report.economics.dislocationEvaluableRoutes} />
          <Metric label="Gross qualified" value={report.economics.grossQualifiedRoutes}
            tone={report.economics.grossQualifiedRoutes > 0 ? "success" : "warning"} />
          <Metric label="Cost evaluable" value={report.economics.economicallyEvaluableRoutes} />
          <Metric label="Expected net positive" value={report.economics.netPositiveRoutes}
            tone={report.economics.netPositiveRoutes > 0 ? "success" : "warning"} />
          <Metric label="Qualified signals" value={report.economics.qualifiedRoutes}
            tone={report.economics.qualifiedRoutes > 0 ? "success" : "warning"} />
        </div>
      </div>

      <div className="grid gap-4 p-5 xl:grid-cols-[1.05fr_1.4fr]">
        <section className="rounded-lg border border-border-default bg-panel-light p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.13em] text-text-muted">Best current route</p>
            {bestNet?.economics ? (
              <span className="rounded-full border border-warning/30 bg-warning/10 px-2 py-1 font-mono text-[10px] font-bold text-warning">
                net shortfall {formatPercent(bestNet.economics.thresholdShortfallPercent)}
              </span>
            ) : null}
          </div>
          {best?.dislocation ? (
            <div className="mt-4">
              <p className="font-mono text-sm font-bold text-text-primary">{best.market}</p>
              <p className="mt-1 text-xs uppercase tracking-[0.1em] text-text-muted">
                LONG {best.dislocation.longExchange} / SHORT {best.dislocation.shortExchange}
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Fact label="Long best ask" value={formatNumber(best.dislocation.longBestAsk)} />
                <Fact label="Short best bid" value={formatNumber(best.dislocation.shortBestBid)} />
                <Fact label="Top-book gross"
                  value={formatPercent(best.dislocation.grossTopDislocationPercent)} />
                <Fact label="Required gross"
                  value={formatPercent(report.economics.minimumGrossDislocationPercent)} />
                <Fact label="Full-depth gross"
                  value={best.economics ? formatPercent(best.economics.grossDislocationPercent) : "NO_DATA"} />
                <Fact label="Expected net"
                  value={best.economics ? formatPercent(best.economics.expectedNetPercent) : "NO_DATA"} />
              </div>
              {best.economics ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <Cost label="Round-trip fees" value={best.economics.roundTripFeePercent} />
                  <Cost label={`Funding reserve x${best.economics.adverseFundingPeriodsReserved}`}
                    value={best.economics.adverseFundingReservePercent} />
                  <Cost label="Safety buffer" value={best.economics.safetyBufferPercent} />
                </div>
              ) : null}
            </div>
          ) : (
            <p className="mt-4 text-sm text-text-muted">No current same-contract two-venue perpetual route.</p>
          )}
        </section>

        <section className="rounded-lg border border-border-default bg-panel-light p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.13em] text-text-muted">
                Authenticated two-venue evidence
              </p>
              <p className="mt-1 text-xs text-text-muted">
                Each leg requires target margin: {formatNumber(report.derivativeEvidence.targetQuoteNotional)}
              </p>
            </div>
            <span className="font-mono text-xs font-bold text-text-primary">
              {report.derivativeEvidence.paperEvidenceReadyRoutes}/{report.economics.evaluatedRoutes} route-ready
            </span>
          </div>
          <div className="mt-4">
            <DerivativeVenueEvidenceGrid venues={report.derivativeEvidence.venues} />
          </div>
        </section>

        <section className="rounded-lg border border-border-default bg-panel-light p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.13em] text-text-muted">Central lineage</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Fact label="Signals now / observed"
              value={`${report.controller.currentSignals} / ${report.controller.totalSignalsObserved}`} />
            <Fact label="Plans admitted" value={report.lineage.plansAdmitted} />
            <Fact label="Latest intake" value={report.lineage.latestPlanIntakeState ?? "NO_DATA"} />
            <Fact label="Active / completed queue"
              value={`${report.lineage.activeQueue} / ${report.lineage.completedQueue}`} />
          </div>
        </section>

        <section className="rounded-lg border border-border-default bg-panel-light p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.13em] text-text-muted">Dominant blockers</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {report.economics.dominantBlockers.length > 0 ? report.economics.dominantBlockers.map((blocker) => (
              <span key={blocker.code} className="rounded-md border border-warning/20 bg-warning/5 px-3 py-2 font-mono text-[10px] text-warning">
                {blocker.code} / {blocker.count}
              </span>
            )) : <span className="text-xs text-text-muted">No current blocker evidence.</span>}
          </div>
        </section>

        <div className="xl:col-span-2 flex flex-wrap gap-2 border-t border-border-default pt-4 text-[10px] font-semibold uppercase tracking-[0.1em] text-text-muted">
          <Safety label="Matched long / short only" passed={report.safety.matchedLongShortOnly} />
          <Safety label="Convergence not guaranteed" passed={report.safety.convergenceNotGuaranteed} />
          <Safety label="Round-trip fees reserved" passed={report.safety.roundTripFeesReserved} />
          <Safety label="Adverse funding reserved" passed={report.safety.adverseFundingReserved} />
          <Safety label="No margin inference" passed={!report.safety.balanceOrMarginInferenceAllowed} />
          <Safety label="Thresholds unchanged" passed={!report.safety.profitabilityThresholdMutated} />
          <Safety label="LIVE / orders off" passed={!report.safety.liveExecutionAllowed && !report.safety.orderSubmissionAllowed} />
        </div>
      </div>
    </section>
  );
}

function Metric({label, value, tone = "neutral"}: {label: string; value: number | string; tone?: "neutral" | "success" | "warning"}) {
  const color = tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "text-text-primary";
  return <div className="rounded-lg border border-border-default bg-panel-light p-3"><p className="text-[10px] uppercase tracking-[0.12em] text-text-muted">{label}</p><p className={`mt-2 font-mono text-lg font-bold ${color}`}>{value}</p></div>;
}

function Fact({label, value}: {label: string; value: number | string}) {
  return <div className="rounded-md border border-border-default bg-panel px-3 py-2"><p className="text-[10px] uppercase tracking-[0.1em] text-text-muted">{label}</p><p className="mt-1 break-words font-mono text-xs font-bold text-text-primary">{value}</p></div>;
}

function Cost({label, value}: {label: string; value: number}) {
  return <div className="rounded-md border border-warning/20 bg-warning/5 px-2 py-2"><p className="text-[9px] uppercase tracking-[0.08em] text-text-muted">{label}</p><p className="mt-1 font-mono text-[10px] font-bold text-warning">-{formatPercent(value)}</p></div>;
}

function Safety({label, passed}: {label: string; passed: boolean}) {
  return <span className="inline-flex items-center gap-1 rounded-full border border-border-default bg-panel-light px-2 py-1">{passed ? <CheckCircle2 className="size-3 text-success" /> : <AlertTriangle className="size-3 text-danger" />}{label}</span>;
}

function StateBadge({state}: {state: PerpetualPerpetualPaperClosureState}) {
  const positive = state === "PAPER_QUEUED" || state === "SIGNAL_ADMITTED" || state === "SIGNAL_AVAILABLE";
  const danger = state === "NO_DATA" || state === "PAPER_BLOCKED" || state === "DERIVATIVE_EVIDENCE_BLOCKED";
  return <span className={`rounded-full border px-3 py-1 font-mono text-[10px] font-bold ${positive ? "border-success/30 bg-success/10 text-success" : danger ? "border-danger/30 bg-danger/10 text-danger" : "border-warning/30 bg-warning/10 text-warning"}`}>{state.replaceAll("_", " ")}</span>;
}

function PanelState({title, detail, danger = false}: {title: string; detail: string; danger?: boolean}) {
  return <section className={`rounded-xl border p-5 ${danger ? "border-danger/30 bg-danger/5" : "border-border-default bg-panel"}`}><div className="flex items-start gap-3">{danger ? <AlertTriangle className="mt-0.5 size-5 text-danger" /> : <RefreshCw className="mt-0.5 size-5 animate-spin text-brand" />}<div><h2 className="font-bold text-text-primary">{title}</h2><p className="mt-1 text-sm text-text-muted">{detail}</p></div></div></section>;
}

function formatPercent(value: number): string {
  return `${value.toFixed(4)}%`;
}

function formatNumber(value: number): string {
  return value.toLocaleString("en-IN", {maximumFractionDigits: 6});
}
