import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";

import {
  useFundingRatePaperClosure,
} from "../hooks/useStrategies";

import type {
  FundingRatePaperClosureState,
} from "../types/FundingRatePaperClosure";

import {
  DerivativeVenueEvidenceGrid,
} from "./DerivativeVenueEvidenceGrid";

export function FundingRatePaperClosurePanel() {
  const query = useFundingRatePaperClosure();
  const report = query.data?.data;

  if (query.isPending && !report) {
    return <PanelState title="Loading Strategy #5 closure evidence"
      detail="Reading synchronized funding windows, full-depth costs, authenticated margin and central lineage." />;
  }

  if (query.isError || !report) {
    return <PanelState danger title="Strategy #5 closure evidence unavailable"
      detail="No funding edge, derivative readiness or PAPER eligibility is inferred while this evidence is unavailable." />;
  }

  const best = report.economics.bestDifferentialRoute;
  const bestNet = report.economics.bestNetRoute;

  return (
    <section className="overflow-hidden rounded-xl border border-border-default bg-panel">
      <div className="border-b border-border-default p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-brand">
              <Activity className="size-5" />
              <p className="text-xs font-semibold uppercase tracking-[0.16em]">
                V88 Strategy #5 Bounded Funding Carry
              </p>
            </div>
            <h2 className="mt-2 text-xl font-bold text-text-primary">
              Multi-settlement funding carry with exact PAPER evidence
            </h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-text-muted">{report.message}</p>
          </div>
          <div className="flex items-center gap-2">
            <StateBadge state={report.state} />
            <button type="button" aria-label="Refresh Strategy #5 PAPER closure"
              disabled={query.isFetching} onClick={() => void query.refetch()}
              className="rounded-md border border-border-default bg-panel-light p-2 text-text-muted hover:text-text-primary disabled:opacity-60">
              <RefreshCw className={`size-4 ${query.isFetching ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <Metric label="Pairs evaluated" value={report.economics.evaluatedRoutes} />
          <Metric label="Differential evaluable" value={report.economics.differentialEvaluableRoutes} />
          <Metric label="Differential qualified" value={report.economics.differentialQualifiedRoutes}
            tone={report.economics.differentialQualifiedRoutes > 0 ? "success" : "warning"} />
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
            <p className="text-xs font-semibold uppercase tracking-[0.13em] text-text-muted">Best current pair</p>
            {bestNet?.economics ? (
              <span className="rounded-full border border-warning/30 bg-warning/10 px-2 py-1 font-mono text-[10px] font-bold text-warning">
                net shortfall {formatPercent(bestNet.economics.thresholdShortfallPercent)}
              </span>
            ) : null}
          </div>
          {best ? (
            <div className="mt-4">
              <p className="font-mono text-sm font-bold text-text-primary">{best.market}</p>
              <p className="mt-1 text-xs uppercase tracking-[0.1em] text-text-muted">
                LONG {best.differential.longExchange} → SHORT {best.differential.shortExchange}
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Fact label="Long funding" value={formatRate(best.differential.longFundingRate)} />
                <Fact label="Short funding" value={formatRate(best.differential.shortFundingRate)} />
                <Fact label="Funding differential"
                  value={formatPercent(best.differential.fundingDifferentialPercent)} />
                <Fact label="Required differential"
                  value={formatPercent(report.economics.minimumFundingDifferentialPercent)} />
                <Fact label="Single-period funding"
                  value={best.economics ? formatPercent(best.economics.singlePeriodExpectedFundingPercent) : "NO_DATA"} />
                <Fact label="Projected carry funding"
                  value={best.economics ? formatPercent(best.economics.expectedFundingPercent) : "NO_DATA"} />
                <Fact label="Expected net"
                  value={best.economics ? formatPercent(best.economics.expectedNetPercent) : "NO_DATA"} />
                <Fact label="Funding periods / cap"
                  value={best.economics
                    ? `${best.economics.modeledFundingPeriods} / ${best.economics.maximumFundingPeriodsToCapture}`
                    : "NO_DATA"} />
                <Fact label="Periods needed"
                  value={best.economics?.minimumQualifyingFundingPeriods ?? "NO_DATA"} />
                <Fact label="Projected hold"
                  value={best.economics ? formatDuration(best.economics.projectedHoldingTimeMs) : "NO_DATA"} />
              </div>
              {best.economics ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <Cost label="Entry basis cost" value={best.economics.entryBasisCostPercent} />
                  <Cost label="Round-trip fees" value={best.economics.roundTripFeePercent} />
                  <Cost label="Safety buffer" value={best.economics.safetyBufferPercent} />
                </div>
              ) : null}
            </div>
          ) : (
            <p className="mt-4 text-sm text-text-muted">No current synchronized two-venue funding pair.</p>
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
                {blocker.code} · {blocker.count}
              </span>
            )) : <span className="text-xs text-text-muted">No current blocker evidence.</span>}
          </div>
        </section>

        <div className="xl:col-span-2 flex flex-wrap gap-2 border-t border-border-default pt-4 text-[10px] font-semibold uppercase tracking-[0.1em] text-text-muted">
          <Safety label="Matched long / short only" passed={report.safety.matchedLongShortOnly} />
          <Safety label="Funding not guaranteed" passed={report.safety.expectedFundingNotGuaranteed} />
          <Safety label="Rate persistence required"
            passed={report.safety.projectedFundingRatePersistenceRequired} />
          <Safety label="Round-trip fees reserved" passed={report.safety.roundTripFeesReserved} />
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

function StateBadge({state}: {state: FundingRatePaperClosureState}) {
  const positive = state === "PAPER_QUEUED" || state === "SIGNAL_ADMITTED" || state === "SIGNAL_AVAILABLE";
  const danger = state === "NO_DATA" || state === "PAPER_BLOCKED" || state === "DERIVATIVE_EVIDENCE_BLOCKED";
  return <span className={`rounded-full border px-3 py-1 font-mono text-[10px] font-bold ${positive ? "border-success/30 bg-success/10 text-success" : danger ? "border-danger/30 bg-danger/10 text-danger" : "border-warning/30 bg-warning/10 text-warning"}`}>{state.replaceAll("_", " ")}</span>;
}

function PanelState({title, detail, danger = false}: {title: string; detail: string; danger?: boolean}) {
  return <section className={`rounded-xl border p-5 ${danger ? "border-danger/30 bg-danger/5" : "border-border-default bg-panel"}`}><div className="flex items-start gap-3">{danger ? <AlertTriangle className="mt-0.5 size-5 text-danger" /> : <RefreshCw className="mt-0.5 size-5 animate-spin text-brand" />}<div><h2 className="font-bold text-text-primary">{title}</h2><p className="mt-1 text-sm text-text-muted">{detail}</p></div></div></section>;
}

function formatRate(value: number): string {
  return `${(value * 100).toFixed(5)}%`;
}

function formatPercent(value: number): string {
  return `${value.toFixed(4)}%`;
}

function formatNumber(value: number): string {
  return value.toLocaleString("en-IN", {maximumFractionDigits: 6});
}

function formatDuration(valueMs: number): string {
  const hours = valueMs / 3_600_000;
  return hours < 1 ? `${Math.round(valueMs / 60_000)}m` : `${hours.toFixed(hours < 10 ? 1 : 0)}h`;
}
