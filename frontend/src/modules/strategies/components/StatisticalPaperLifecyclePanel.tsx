import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  RefreshCw,
  Route,
  ShieldCheck,
} from "lucide-react";

import {
  useState,
} from "react";

import {
  useStatisticalPaperLifecycle,
} from "../hooks/useStrategies";

import type {
  StatisticalPaperClosureState,
  StatisticalPaperGateSet,
  StatisticalPaperLifecycleLane,
  StatisticalPaperLifecycleState,
} from "../types/StatisticalPaperLifecycle";

import {
  DerivativeVenueEvidenceGrid,
} from "./DerivativeVenueEvidenceGrid";

export function StatisticalPaperLifecyclePanel() {
  const query = useStatisticalPaperLifecycle();
  const report = query.data?.data;
  const [expandedPairId, setExpandedPairId] = useState<string | null>(null);

  if (query.isPending && !report) {
    return <PanelState icon={<RefreshCw className="size-5 animate-spin" />}
      title="Loading Strategy #8 PAPER lineage"
      detail="Correlating actual signals with central plans, read-only runtime evidence, intake and queue records." />;
  }
  if (query.isError || !report) {
    return <PanelState danger icon={<AlertTriangle className="size-5" />}
      title="Strategy #8 PAPER lineage unavailable"
      detail="Missing lineage is not treated as an admitted plan or queued PAPER work."
      action={<button type="button" onClick={() => void query.refetch()}
        className="mt-4 inline-flex items-center gap-2 rounded-md border border-border-default bg-panel-light px-3 py-2 text-xs font-semibold text-text-primary">
        <RefreshCw className="size-4" /> Retry lineage read
      </button>} />;
  }

  return (
    <section className="overflow-hidden rounded-xl border border-border-default bg-panel">
      <div className="border-b border-border-default p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-brand">
              <Route className="size-5" />
              <p className="text-xs font-semibold uppercase tracking-[0.16em]">
                V73 Strategy #8 PAPER Closure
              </p>
            </div>
            <h2 className="mt-2 text-xl font-bold text-text-primary">
              Statistical research-to-PAPER closure
            </h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-text-muted">
              {report.message} Only real, current Strategy #8 signals can enter central admission; research thresholds, capital and queues are never changed by this read.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ClosureBadge state={report.state} />
            <button type="button" aria-label="Refresh Strategy #8 PAPER lineage" disabled={query.isFetching}
              onClick={() => void query.refetch()}
              className="rounded-md border border-border-default bg-panel-light p-2 text-text-muted hover:text-text-primary disabled:opacity-60">
              <RefreshCw className={`size-4 ${query.isFetching ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-8">
          <Metric label="Selected pairs" value={report.summary.selectedPairs} />
          <Metric label="Research promoted" value={report.summary.researchPromoted} tone="success" />
          <Metric label="Current signals" value={report.summary.currentSignals} />
          <Metric label="Plans compiled" value={report.summary.plansCompiled} />
          <Metric label="Dry runs" value={report.summary.dryRunsEvaluated} />
          <Metric label="PAPER eligible" value={report.summary.paperEligible} tone="success" />
          <Metric label="Blocked lanes" value={report.summary.paperBlocked} tone="warning" />
          <Metric label="Actual queue" value={report.summary.queued} tone={report.summary.queued > 0 ? "success" : "default"} />
        </div>
      </div>

      <div className="space-y-5 p-5">
        <div className="grid gap-4 xl:grid-cols-2">
          <section className="rounded-lg border border-border-default bg-panel-light p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.13em] text-text-muted">Research promotion gate</p>
                <p className="mt-1 text-xs text-text-muted">Persistent walk-forward evidence; no threshold relaxation.</p>
              </div>
              <span className="font-mono text-xs font-bold text-text-primary">
                {report.research.promotedPairs}/{report.research.selectedPairs} promoted
              </span>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <Fact label="Eligible markets" value={report.research.eligibleMarkets} />
              <Fact label="Candidates" value={report.research.candidatePairs} />
              <Fact label="Signal eligible" value={report.research.signalEligiblePairs} />
              <Fact label="Collecting" value={report.research.collectingPairs} />
              <Fact label="Rejected" value={report.research.rejectedPairs} />
              <Fact label="Required OOS trades" value={report.research.minimumOutOfSampleTrades ?? "NO_DATA"} />
            </div>
            {report.research.closestCandidate ? (
              <div className="mt-3 rounded-md border border-warning/20 bg-warning/5 p-3">
                <p className="font-mono text-xs font-bold text-text-primary">{report.research.closestCandidate.pairId}</p>
                <p className="mt-1 text-xs text-text-muted">
                  {report.research.closestCandidate.sampleCount} samples · {report.research.closestCandidate.outOfSampleTrades} OOS trades · {report.research.closestCandidate.state.replaceAll("_", " ")}
                </p>
                <p className="mt-2 text-xs text-warning">{report.research.closestCandidate.blockers[0] ?? "Confirmed promotion evidence available."}</p>
              </div>
            ) : null}
          </section>

          <section className="rounded-lg border border-border-default bg-panel-light p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.13em] text-text-muted">Current entry economics</p>
                <p className="mt-1 text-xs text-text-muted">Z-score, full depth, fees, funding reserve and safety buffer.</p>
              </div>
              <span className="font-mono text-xs font-bold text-text-primary">
                {report.economics.qualifiedPairs}/{report.economics.evaluatedPairs} qualified
              </span>
            </div>
            {report.economics.bestQualifiedPair ? (
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <Fact label="Pair" value={report.economics.bestQualifiedPair.pairId} />
                <Fact label="Z-score / entry" value={`${formatNumber(report.economics.bestQualifiedPair.zScore)} / ${formatNumber(report.economics.bestQualifiedPair.entryZScoreThreshold)}`} />
                <Fact label="Modeled net" value={`${formatNumber(report.economics.bestQualifiedPair.modeledNetPercent)}%`} />
              </div>
            ) : (
              <p className="mt-4 rounded-md border border-warning/20 bg-warning/5 p-3 text-xs text-text-muted">
                No promoted pair currently passes the entry z-score, depth, explicit-cost and modeled-net gates.
              </p>
            )}
            <BlockerChips blockers={report.economics.dominantBlockers} />
          </section>

          <section className="rounded-lg border border-border-default bg-panel-light p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.13em] text-text-muted">Authenticated derivative preflight</p>
                <p className="mt-1 text-xs text-text-muted">
                  Conservative pair-margin target {formatNumber(report.derivativeEvidence.conservativePairMarginTarget)}; exact capital is recalculated at admission.
                </p>
              </div>
              <span className="font-mono text-xs font-bold text-text-primary">
                {report.derivativeEvidence.paperEvidenceReadyPairs}/{report.research.selectedPairs} pair-ready
              </span>
            </div>
            <div className="mt-4">
              <DerivativeVenueEvidenceGrid venues={report.derivativeEvidence.venues} />
            </div>
          </section>

          <section className="rounded-lg border border-border-default bg-panel-light p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.13em] text-text-muted">Central lineage</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Fact label="Signals now / observed" value={`${report.controller.currentSignals} / ${report.controller.totalSignalsObserved}`} />
              <Fact label="Plans admitted" value={report.lineage.plansAdmitted} />
              <Fact label="Latest intake" value={report.lineage.latestPlanIntakeState ?? "NO_DATA"} />
              <Fact label="Active / completed queue" value={`${report.lineage.activeQueue} / ${report.lineage.completedQueue}`} />
            </div>
            <BlockerChips blockers={report.research.dominantBlockers} />
          </section>
        </div>

        <PipelineOverview report={report.summary} />

        {report.lanes.length > 0 ? (
          <section>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.13em] text-text-muted">
                  Per-pair lifecycle lanes
                </p>
                <p className="mt-1 text-xs text-text-muted">
                  Expand a lane to inspect exact gates, leg readiness, immutable IDs and owned blockers.
                </p>
              </div>
              <span className="font-mono text-[10px] text-text-muted">actual signals only · no synthetic plan</span>
            </div>
            <div className="mt-4 space-y-2">
              {report.lanes.map((lane) => (
                <LifecycleLane key={lane.pairId} lane={lane} expanded={expandedPairId === lane.pairId}
                  onToggle={() => setExpandedPairId((current) => current === lane.pairId ? null : lane.pairId)} />
              ))}
            </div>
          </section>
        ) : (
          <div className="rounded-lg border border-warning/20 bg-warning/10 p-4 text-sm text-text-muted">
            No selected statistical pair evidence exists yet. No PAPER lineage is inferred.
          </div>
        )}

        <div className="grid gap-3 lg:grid-cols-4">
          <SafetyFact label="Read-only observability" passed={report.safety.readOnlyObservability} />
          <SafetyFact label="Synthetic signals prohibited" passed={!report.safety.syntheticSignalsAllowed && report.safety.actualSignalsOnly} />
          <SafetyFact label="No queue/capital mutation from preview" passed={!report.safety.previewQueueMutationPerformed && !report.safety.capitalReservationMutationPerformed} />
          <SafetyFact label="PAPER, LIVE and orders not executed" passed={!report.safety.paperExecutionPerformed && !report.safety.liveExecutionAllowed && !report.safety.orderSubmissionAllowed} />
          <SafetyFact label="Research thresholds unchanged" passed={!report.safety.researchThresholdsMutated} />
          <SafetyFact label="No margin inference" passed={!report.safety.balanceOrMarginInferenceAllowed} />
          <SafetyFact label="Cointegration not claimed" passed={!report.safety.cointegrationVerified} />
          <SafetyFact label="Mean reversion not guaranteed" passed={!report.safety.meanReversionGuaranteed} />
        </div>
      </div>
    </section>
  );
}

function ClosureBadge({state}: {state: StatisticalPaperClosureState}) {
  const positive = state === "PAPER_QUEUED" || state === "SIGNAL_ADMITTED" || state === "SIGNAL_AVAILABLE";
  const danger = state === "NO_DATA" || state === "PAPER_BLOCKED" || state === "DERIVATIVE_EVIDENCE_BLOCKED";
  return <span className={`rounded-full border px-3 py-1 font-mono text-[10px] font-bold ${positive ? "border-success/30 bg-success/10 text-success" : danger ? "border-danger/30 bg-danger/10 text-danger" : "border-warning/30 bg-warning/10 text-warning"}`}>
    {state.replaceAll("_", " ")}
  </span>;
}

function Fact({label, value}: {label: string; value: number | string}) {
  return <div className="rounded-md border border-border-default bg-panel px-3 py-2">
    <p className="text-[10px] uppercase tracking-[0.1em] text-text-muted">{label}</p>
    <p className="mt-1 break-words font-mono text-xs font-bold text-text-primary">{value}</p>
  </div>;
}

function BlockerChips({blockers}: {blockers: Array<{code: string; count: number}>}) {
  return <div className="mt-3 flex flex-wrap gap-2">
    {blockers.length > 0 ? blockers.map((blocker) => (
      <span key={blocker.code} className="rounded border border-warning/20 bg-warning/5 px-2 py-1 font-mono text-[10px] text-warning">
        {blocker.code} · {blocker.count}
      </span>
    )) : <span className="text-xs text-text-muted">No current blocker evidence.</span>}
  </div>;
}

function PipelineOverview({report}: {report: {
  researchPromoted: number; currentSignals: number; plansCompiled: number; dryRunsEvaluated: number;
  paperEligible: number; queued: number;
}}) {
  const stages = [
    ["Research promoted", report.researchPromoted],
    ["Entry signal", report.currentSignals],
    ["Central plan", report.plansCompiled],
    ["Evidence preview", report.dryRunsEvaluated],
    ["PAPER eligible", report.paperEligible],
    ["Actual queue", report.queued],
  ] as const;
  return (
    <section className="rounded-lg border border-border-default bg-panel-light p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.13em] text-text-muted">Fail-closed pipeline</p>
      <div className="mt-4 grid gap-2 md:grid-cols-6">
        {stages.map(([label, value], index) => (
          <div key={label} className="relative rounded-md border border-border-default bg-panel px-3 py-3">
            <div className="flex items-center gap-2">
              {value > 0 ? <CheckCircle2 className="size-4 text-success" /> : <CircleDashed className="size-4 text-text-muted" />}
              <span className="font-mono text-sm font-bold text-text-primary">{value}</span>
            </div>
            <p className="mt-2 text-[10px] uppercase tracking-[0.1em] text-text-muted">{label}</p>
            {index < stages.length - 1 ? <span className="absolute -right-2.5 top-1/2 z-10 hidden -translate-y-1/2 text-text-muted md:block">→</span> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function LifecycleLane({lane, expanded, onToggle}: {lane: StatisticalPaperLifecycleLane; expanded: boolean; onToggle(): void}) {
  return (
    <article className="overflow-hidden rounded-lg border border-border-default bg-panel-light">
      <button type="button" onClick={onToggle} aria-expanded={expanded}
        className="grid w-full gap-3 px-4 py-3 text-left md:grid-cols-[1.4fr_.9fr_.75fr_.75fr_.75fr_1.2fr] md:items-center">
        <div className="min-w-0">
          <p className="truncate font-semibold text-text-primary">{lane.leftMarket} / {lane.rightMarket}</p>
          <p className="mt-1 font-mono text-[10px] uppercase text-text-muted">{lane.exchange}</p>
        </div>
        <LifecycleBadge state={lane.state} />
        <StageValue label="Research" value={lane.research.state.replaceAll("_", " ")} good={lane.research.state === "PROMOTED"} />
        <StageValue label="Signal" value={lane.lineage.signalId ? "AVAILABLE" : "NO DATA"} good={lane.lineage.signalId !== null} />
        <StageValue label="PAPER preview" value={lane.dryRun.state.replaceAll("_", " ")} good={lane.dryRun.state === "ELIGIBLE"} />
        <p className="line-clamp-2 text-[10px] leading-4 text-text-muted">
          {lane.blockers[0] ?? "All observed gates passed."}
        </p>
      </button>

      {expanded ? (
        <div className="border-t border-border-default bg-panel p-4">
          <div className="grid gap-4 xl:grid-cols-[.85fr_1.15fr]">
            <section>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">Immutable lineage</p>
              <div className="mt-3 space-y-2">
                {Object.entries(lane.lineage).map(([label, value]) => (
                  <div key={label} className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 text-xs">
                    <span className="text-text-muted">{humanize(label)}</span>
                    <span className="truncate font-mono text-text-primary" title={value ?? "NO_DATA"}>{value ?? "NO_DATA"}</span>
                  </div>
                ))}
                <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 text-xs">
                  <span className="text-text-muted">Actual intake</span>
                  <span className="font-mono text-text-primary">{lane.actualIntakeState}</span>
                </div>
                <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 text-xs">
                  <span className="text-text-muted">Actual queue</span>
                  <span className="font-mono text-text-primary">{lane.queueState}</span>
                </div>
              </div>
            </section>
            <section>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">Current PAPER gates</p>
              {lane.dryRun.gates ? <GateGrid gates={lane.dryRun.gates} /> : (
                <p className="mt-3 rounded-md border border-warning/20 bg-warning/10 p-3 text-xs text-text-muted">
                  Dry-run not applicable until an actual current signal and central plan exist.
                </p>
              )}
            </section>
          </div>

          {lane.dryRun.legs.length > 0 ? (
            <section className="mt-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">Perpetual leg readiness</p>
              <div className="mt-3 grid gap-2 lg:grid-cols-2">
                {lane.dryRun.legs.map((leg) => (
                  <div key={leg.legId} className="rounded-md border border-border-default bg-panel-light p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate font-mono text-[10px] text-text-primary">{leg.legId}</span>
                      {leg.ready ? <CheckCircle2 className="size-4 text-success" /> : <AlertTriangle className="size-4 text-warning" />}
                    </div>
                    <p className="mt-2 text-[10px] text-text-muted">
                      balance {yesNo(leg.balanceVerified)} · adapter {yesNo(leg.paperAdapterSupported)} · rules {yesNo(leg.marketRulesVerified)} · fee {yesNo(leg.feeEvidenceFresh)} · quote {yesNo(leg.quoteFresh)}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="mt-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">Owned blockers</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(lane.blockers.length > 0 ? lane.blockers : ["NONE"]).map((blocker) => (
                <span key={blocker} className={`rounded border px-2 py-1 font-mono text-[10px] ${blocker === "NONE" ? "border-success/30 bg-success/10 text-success" : "border-warning/20 bg-warning/10 text-warning"}`}>
                  {blocker}
                </span>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </article>
  );
}

function GateGrid({gates}: {gates: StatisticalPaperGateSet}) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
      {Object.entries(gates).map(([label, passed]) => (
        <div key={label} className="flex items-center justify-between gap-2 rounded-md border border-border-default bg-panel-light px-2.5 py-2">
          <span className="text-[10px] text-text-muted">{humanize(label)}</span>
          {passed ? <CheckCircle2 className="size-3.5 shrink-0 text-success" /> : <AlertTriangle className="size-3.5 shrink-0 text-warning" />}
        </div>
      ))}
    </div>
  );
}

function LifecycleBadge({state, label}: {state: StatisticalPaperLifecycleState; label?: string}) {
  const success = state === "QUEUED" || state === "DUPLICATE" || state === "PAPER_ADMISSION_ELIGIBLE";
  const waiting = state === "AWAITING_ENTRY_SIGNAL" || state === "AWAITING_CENTRAL_ADMISSION";
  return <span className={`w-fit rounded-full border px-2 py-1 font-mono text-[9px] font-bold ${success ? "border-success/30 bg-success/10 text-success" : waiting ? "border-brand/30 bg-brand/10 text-brand" : "border-warning/30 bg-warning/10 text-warning"}`}>
    {label ?? state.replaceAll("_", " ")}
  </span>;
}

function Metric({label, value, tone = "default"}: {label: string; value: number; tone?: "default" | "success" | "warning"}) {
  return <div className="rounded-lg border border-border-default bg-panel-light p-3">
    <p className="text-[10px] uppercase tracking-[0.1em] text-text-muted">{label}</p>
    <p className={`mt-2 font-mono text-lg font-bold ${tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "text-text-primary"}`}>{value.toLocaleString()}</p>
  </div>;
}

function StageValue({label, value, good}: {label: string; value: string; good: boolean}) {
  return <div><p className="text-[9px] uppercase tracking-[0.1em] text-text-muted">{label}</p>
    <p className={`mt-1 font-mono text-[10px] font-bold ${good ? "text-success" : "text-text-muted"}`}>{value}</p></div>;
}

function SafetyFact({label, passed}: {label: string; passed: boolean}) {
  return <div className="flex items-center justify-between gap-3 rounded-lg border border-border-default bg-panel-light px-3 py-2.5">
    <span className="text-xs text-text-muted">{label}</span>
    {passed ? <ShieldCheck className="size-4 shrink-0 text-success" /> : <AlertTriangle className="size-4 shrink-0 text-danger" />}
  </div>;
}

function PanelState({icon, title, detail, danger = false, action}: {icon: React.ReactNode; title: string; detail: string; danger?: boolean; action?: React.ReactNode}) {
  return <section className={`rounded-xl border bg-panel p-5 ${danger ? "border-danger/30" : "border-border-default"}`}>
    <div className={`flex items-start gap-3 ${danger ? "text-danger" : "text-text-muted"}`}>{icon}<div>
      <h2 className="text-lg font-bold text-text-primary">{title}</h2><p className="mt-2 text-sm text-text-muted">{detail}</p>{action}
    </div></div>
  </section>;
}

function humanize(value: string): string { return value.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ").toLowerCase(); }
function yesNo(value: boolean): string { return value ? "YES" : "NO"; }
function formatNumber(value: number): string { return value.toLocaleString("en-IN", {maximumFractionDigits: 6}); }
