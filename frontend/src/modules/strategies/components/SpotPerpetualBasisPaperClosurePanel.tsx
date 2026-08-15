import {
  AlertTriangle,
  CheckCircle2,
  GitCompareArrows,
  RefreshCw,
} from "lucide-react";

import {
  useSpotPerpetualBasisPaperClosure,
} from "../hooks/useStrategies";

import type {
  SpotPerpetualBasisPaperClosureState,
} from "../types/SpotPerpetualBasisPaperClosure";

import {
  DerivativeVenueEvidenceGrid,
} from "./DerivativeVenueEvidenceGrid";

export function SpotPerpetualBasisPaperClosurePanel() {
  const query = useSpotPerpetualBasisPaperClosure();
  const report = query.data?.data;

  if (query.isPending && !report) {
    return <PanelState title="Loading Strategy #4 closure evidence"
      detail="Reading current basis economics, authenticated derivative accounts and central PAPER lineage." />;
  }

  if (query.isError || !report) {
    return <PanelState danger title="Strategy #4 closure evidence unavailable"
      detail="No derivative readiness, qualified edge or PAPER eligibility is inferred while this evidence is unavailable." />;
  }

  const best = report.economics.bestRoute;

  return (
    <section className="overflow-hidden rounded-xl border border-border-default bg-panel">
      <div className="border-b border-border-default p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-brand">
              <GitCompareArrows className="size-5" />
              <p className="text-xs font-semibold uppercase tracking-[0.16em]">
                V69 Strategy #4 PAPER Closure
              </p>
            </div>
            <h2 className="mt-2 text-xl font-bold text-text-primary">
              Spot–perpetual economics and authenticated derivative gates
            </h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-text-muted">{report.message}</p>
          </div>
          <div className="flex items-center gap-2">
            <StateBadge state={report.state} />
            <button type="button" aria-label="Refresh Strategy #4 PAPER closure"
              disabled={query.isFetching} onClick={() => void query.refetch()}
              className="rounded-md border border-border-default bg-panel-light p-2 text-text-muted hover:text-text-primary disabled:opacity-60">
              <RefreshCw className={`size-4 ${query.isFetching ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <Metric label="Routes evaluated" value={report.economics.evaluatedRoutes} />
          <Metric label="Economically evaluable" value={report.economics.economicallyEvaluableRoutes} />
          <Metric label="Gross basis positive" value={report.economics.grossPositiveRoutes} />
          <Metric label="Expected net positive" value={report.economics.netPositiveRoutes}
            tone={report.economics.netPositiveRoutes > 0 ? "success" : "warning"} />
          <Metric label="Qualified" value={report.economics.qualifiedRoutes}
            tone={report.economics.qualifiedRoutes > 0 ? "success" : "warning"} />
          <Metric label="Required expected net" value={formatPercent(report.economics.minimumExpectedNetPercent)} />
        </div>
      </div>

      <div className="grid gap-4 p-5 xl:grid-cols-[1.05fr_1.4fr]">
        <section className="rounded-lg border border-border-default bg-panel-light p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.13em] text-text-muted">Best current route</p>
            {best ? (
              <span className="rounded-full border border-warning/30 bg-warning/10 px-2 py-1 font-mono text-[10px] font-bold text-warning">
                shortfall {formatPercent(best.thresholdShortfallPercent)}
              </span>
            ) : null}
          </div>
          {best ? (
            <div className="mt-4">
              <p className="font-mono text-sm font-bold text-text-primary">
                {best.exchange.toUpperCase()} · {best.market}
              </p>
              <p className="mt-1 text-xs text-text-muted">LONG spot → SHORT linear perpetual</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Fact label="Gross basis" value={formatPercent(best.grossBasisPercent)} />
                <Fact label="Expected funding" value={formatPercent(best.expectedFundingPercent)} />
                <Fact label="Fees" value={formatPercent(best.totalFeePercent)} />
                <Fact label="Safety buffer" value={formatPercent(best.safetyBufferPercent)} />
                <Fact label="Expected net" value={formatPercent(best.expectedNetPercent)} />
                <Fact label="Quantity" value={formatNumber(best.quantity)} />
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-text-muted">No complete cost-aware route economics are available.</p>
          )}
        </section>

        <section className="rounded-lg border border-border-default bg-panel-light p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.13em] text-text-muted">
                Authenticated derivative evidence
              </p>
              <p className="mt-1 text-xs text-text-muted">
                Target capital coverage: {formatNumber(report.derivativeEvidence.targetQuoteCapital)} USDT
              </p>
            </div>
            <span className="font-mono text-xs font-bold text-text-primary">
              {report.derivativeEvidence.paperEvidenceReadyVenues}/{report.derivativeEvidence.configuredVenues} PAPER-ready
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
          <p className="text-xs font-semibold uppercase tracking-[0.13em] text-text-muted">Dominant market blockers</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {report.economics.dominantBlockers.length > 0 ? report.economics.dominantBlockers.map((blocker) => (
              <span key={blocker.code} className="rounded-md border border-warning/20 bg-warning/5 px-3 py-2 font-mono text-[10px] text-warning">
                {blocker.code} · {blocker.count}
              </span>
            )) : <span className="text-xs text-text-muted">No current blocker evidence.</span>}
          </div>
        </section>

        <div className="xl:col-span-2 flex flex-wrap gap-2 border-t border-border-default pt-4 text-[10px] font-semibold uppercase tracking-[0.1em] text-text-muted">
          <Safety label="Signed reads only" passed={report.safety.authenticatedReadsOnly} />
          <Safety label="No margin inference" passed={!report.safety.balanceOrMarginInferenceAllowed} />
          <Safety label="Fees and rules required" passed={report.safety.feesAndRulesRemainRequired} />
          <Safety label="Threshold unchanged" passed={!report.safety.profitabilityThresholdMutated} />
          <Safety label="No fabricated signals" passed={!report.safety.signalFabricationAllowed} />
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

function Safety({label, passed}: {label: string; passed: boolean}) {
  return <span className="inline-flex items-center gap-1 rounded-full border border-border-default bg-panel-light px-2 py-1">{passed ? <CheckCircle2 className="size-3 text-success" /> : <AlertTriangle className="size-3 text-danger" />}{label}</span>;
}

function StateBadge({state}: {state: SpotPerpetualBasisPaperClosureState}) {
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
