import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Database,
  RefreshCw,
} from "lucide-react";

import {
  useMemo,
  useState,
} from "react";

import {
  useStatisticalResearchEvidence,
} from "../hooks/useStrategies";

import type {
  StatisticalPromotionLifecycleState,
  StatisticalResearchCandidate,
  StatisticalResearchState,
} from "../types/StatisticalResearchEvidence";

type CandidateFilter = "ALL" | StatisticalResearchState;

const FILTERS: CandidateFilter[] = [
  "ALL",
  "PROMOTED",
  "COLLECTING_HISTORY",
  "REJECTED",
];

export function StatisticalResearchPanel() {
  const query = useStatisticalResearchEvidence();
  const [filter, setFilter] = useState<CandidateFilter>("ALL");
  const evidence = query.data?.data;
  const discovery = evidence?.discovery;

  const rows = useMemo(
    () => discovery?.rankings.filter((candidate) =>
      filter === "ALL" || candidate.state === filter) ?? [],
    [discovery, filter],
  );

  const venues = useMemo(() => {
    if (!discovery) return [];
    const selected = new Set(discovery.selectedPairs.map((pair) => pair.pairId));
    const grouped = new Map<string, {
      candidates: number;
      promoted: number;
      collecting: number;
      rejected: number;
      selected: number;
    }>();
    for (const candidate of discovery.rankings) {
      const current = grouped.get(candidate.exchange) ?? {
        candidates: 0,
        promoted: 0,
        collecting: 0,
        rejected: 0,
        selected: 0,
      };
      current.candidates += 1;
      current.promoted += Number(candidate.state === "PROMOTED");
      current.collecting += Number(candidate.state === "COLLECTING_HISTORY");
      current.rejected += Number(candidate.state === "REJECTED");
      current.selected += Number(selected.has(candidate.pairId));
      grouped.set(candidate.exchange, current);
    }
    return [...grouped.entries()].sort(([first], [second]) => first.localeCompare(second));
  }, [discovery]);

  if (query.isPending && !evidence) {
    return (
      <PanelState
        icon={<RefreshCw className="size-5 animate-spin" />}
        title="Loading statistical research evidence"
        detail="Reading persistent pair history, walk-forward folds and current regime evidence."
      />
    );
  }

  if (query.isError || !evidence) {
    return (
      <PanelState
        danger
        icon={<AlertTriangle className="size-5" />}
        title="Statistical research evidence unavailable"
        detail="No pair is treated as promoted while the authoritative evidence endpoint is unavailable."
        action={(
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="mt-4 inline-flex items-center gap-2 rounded-md border border-border-default bg-panel-light px-3 py-2 text-xs font-semibold text-text-primary"
          >
            <RefreshCw className="size-4" />
            Retry evidence read
          </button>
        )}
      />
    );
  }

  if (!discovery) {
    return (
      <PanelState
        icon={<Database className="size-5" />}
        title="Waiting for the first derivative snapshot"
        detail="Dynamic candidates will appear only after fresh two-sided perpetual evidence is available."
      />
    );
  }

  const requirements = discovery.requirements;
  const firstFoldReady = discovery.rankings.filter((candidate) =>
    candidate.sampleCount >= requirements.minimumSamplesForFirstFold).length;
  const requiredFoldsReady = discovery.rankings.filter((candidate) =>
    candidate.sampleCount >= requirements.minimumSamplesForRequiredFolds).length;

  return (
    <section className="overflow-hidden rounded-xl border border-border-default bg-panel">
      <div className="border-b border-border-default p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-brand">
              <BarChart3 className="size-5" />
              <p className="text-xs font-semibold uppercase tracking-[0.16em]">
                V35 Strategy #8 Promotion Stability
              </p>
            </div>
            <h2 className="mt-2 text-xl font-bold text-text-primary">
              Persistent research promotion and demotion control
            </h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-text-muted">
              Same-venue pairs must pass repeated cost-aware walk-forward and regime checks before signal eligibility. A failed check blocks signals immediately while persistent demotion evidence is confirmed.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <StateBadge state={discovery.promotedPairs > 0 ? "PROMOTED" : "COLLECTING_HISTORY"}
              label={discovery.promotedPairs > 0 ? `${discovery.promotedPairs} PROMOTED` : "RESEARCH ACTIVE"} />
            <button
              type="button"
              aria-label="Refresh statistical research evidence"
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
              className="rounded-md border border-border-default bg-panel-light p-2 text-text-muted hover:text-text-primary disabled:opacity-60"
            >
              <RefreshCw className={`size-4 ${query.isFetching ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <ResearchMetric label="Eligible markets" value={discovery.eligibleMarkets} />
          <ResearchMetric label="Bounded candidates" value={discovery.candidatePairs}
            suffix={`/${requirements.maximumCandidatePairs}`} />
          <ResearchMetric label="Promoted" value={discovery.promotedPairs} tone="success" />
          <ResearchMetric label="Collecting" value={discovery.collectingPairs} tone="warning" />
          <ResearchMetric label="Rejected" value={discovery.rejectedPairs} tone="danger" />
          <ResearchMetric label="Persistent samples" value={evidence.history.totalSamples} />
        </div>
      </div>

      <div className="space-y-5 p-5">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,.72fr)]">
          <section className="rounded-lg border border-border-default bg-panel-light p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.13em] text-text-muted">
                  Historical qualification progress
                </p>
                <p className="mt-1 text-sm text-text-primary">
                  {requiredFoldsReady}/{discovery.candidatePairs} pairs have enough samples for the required fold count
                </p>
              </div>
              <span className="font-mono text-xs text-text-muted">
                first fold {requirements.minimumSamplesForFirstFold} / required folds {requirements.minimumSamplesForRequiredFolds}
              </span>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-panel">
              <div
                className="h-full rounded-full bg-brand transition-[width] duration-500"
                style={{
                  width: `${discovery.candidatePairs > 0
                    ? Math.min(100, requiredFoldsReady / discovery.candidatePairs * 100)
                    : 0}%`,
                }}
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-xs text-text-muted">
              <span>{firstFoldReady} first-fold ready</span>
              <span>{requiredFoldsReady} required-fold ready</span>
              <span>{requirements.minimumOutOfSampleTrades} minimum OOS trades</span>
              <span>|correlation| ≥ {formatNumber(requirements.minimumAbsoluteRegimeCorrelation, 2)}</span>
              <span>drawdown ≤ {formatPercent(requirements.maximumDrawdownPercent)}</span>
            </div>
          </section>

          <section className="rounded-lg border border-border-default bg-panel-light p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.13em] text-text-muted">
              Persistent evidence health
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
              <Fact label="Tracked pairs" value={`${evidence.history.pairCount}/${evidence.history.maximumTrackedPairs}`} />
              <Fact label="Per-pair cap" value={evidence.history.maximumSamplesPerPair.toLocaleString()} />
              <Fact label="Restore" value={evidence.history.restoreStatus} />
              <Fact label="Write failures" value={evidence.history.writeFailures.toLocaleString()} danger={evidence.history.writeFailures > 0} />
              <Fact label="Bounded evictions" value={evidence.history.pairEvictions.toLocaleString()} />
              <Fact label="Last update" value={formatTime(discovery.generatedAt)} />
            </div>
          </section>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)]">
          <section className="rounded-lg border border-border-default bg-panel-light p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.13em] text-text-muted">
              Hysteretic lifecycle gate
            </p>
            <p className="mt-2 text-xs leading-5 text-text-muted">
              Promotion requires {evidence.promotionLifecycle.configuration.promotionConfirmationsRequired} consecutive passes. Demotion requires {evidence.promotionLifecycle.configuration.demotionConfirmationsRequired} failures, but the first failure removes signal eligibility.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
              <Fact label="Signal eligible" value={evidence.promotionLifecycle.summary.signalEligible.toString()} />
              <Fact label="Promotion pending" value={evidence.promotionLifecycle.summary.promotionPending.toString()} />
              <Fact label="Demotion pending" value={evidence.promotionLifecycle.summary.demotionPending.toString()}
                danger={evidence.promotionLifecycle.summary.demotionPending > 0} />
              <Fact label="Transitions" value={evidence.promotionLifecycle.summary.transitionsRetained.toString()} />
              <Fact label="Startup restore" value={evidence.promotionLifecycle.persistence.restoreStatus} />
              <Fact label="Write failures" value={evidence.promotionLifecycle.persistence.writeFailures.toString()}
                danger={evidence.promotionLifecycle.persistence.writeFailures > 0} />
            </div>
          </section>

          <section className="rounded-lg border border-border-default bg-panel-light p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.13em] text-text-muted">
                Recent persistent transitions
              </p>
              <span className="font-mono text-[10px] text-text-muted">
                newest first
              </span>
            </div>
            {evidence.promotionLifecycle.transitions.length > 0 ? (
              <div className="mt-3 space-y-2">
                {evidence.promotionLifecycle.transitions.slice(0, 4).map((transition) => (
                  <div key={transition.id} className="grid gap-2 rounded-md border border-border-default bg-panel px-3 py-2 text-xs sm:grid-cols-[1fr_auto_auto] sm:items-center">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-text-primary">{transition.pairId}</p>
                      <p className="mt-0.5 font-mono text-[9px] uppercase text-text-muted">{transition.reason.replaceAll("_", " ")}</p>
                    </div>
                    <LifecycleBadge state={transition.nextState} />
                    <span className="font-mono text-[10px] text-text-muted">{formatTime(transition.occurredAt)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3 rounded-md border border-border-default bg-panel p-3 text-xs text-text-muted">
                Transition ledger will populate with the first evaluated candidate.
              </div>
            )}
          </section>
        </div>

        <section>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.13em] text-text-muted">
                Venue-balanced research universe
              </p>
              <p className="mt-1 text-xs text-text-muted">
                Candidate admission is balanced; final selection still prioritizes actual promotion state and rank.
              </p>
            </div>
            <span className="font-mono text-[10px] text-text-muted">
              selected {discovery.selectedPairs.length}/{requirements.maximumSelectedPairs}
            </span>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {venues.map(([venue, counts]) => (
              <article key={venue} className="rounded-lg border border-border-default bg-panel-light p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold uppercase text-text-primary">{venue}</p>
                  <span className="rounded-full border border-brand/30 bg-brand/10 px-2.5 py-1 font-mono text-[10px] text-brand">
                    {counts.candidates} candidates
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
                  <Fact label="Selected" value={counts.selected.toString()} />
                  <Fact label="Promoted" value={counts.promoted.toString()} />
                  <Fact label="Collecting" value={counts.collecting.toString()} />
                  <Fact label="Rejected" value={counts.rejected.toString()} danger={counts.rejected > 0} />
                </div>
              </article>
            ))}
          </div>
        </section>

        <section>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.13em] text-text-muted">
                Evidence-ranked candidates
              </p>
              <p className="mt-1 text-xs text-text-muted">
                Every rejection remains visible with its exact walk-forward or regime blocker.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilter(value)}
                  className={`rounded-full border px-3 py-1.5 font-mono text-[10px] font-bold transition-colors ${
                    filter === value
                      ? "border-brand/40 bg-brand/10 text-brand"
                      : "border-border-default bg-panel-light text-text-muted hover:text-text-primary"
                  }`}
                >
                  {filterLabel(value)} {filterCount(value, discovery.rankings)}
                </button>
              ))}
            </div>
          </div>

          {rows.length > 0 ? (
            <div className="mt-4 overflow-x-auto rounded-lg border border-border-default">
              <div className="min-w-[1120px]">
                <div className="grid grid-cols-[1.35fr_.9fr_.8fr_1fr_.65fr_.8fr_.75fr_.55fr_1.7fr] gap-3 border-b border-border-default bg-panel-light px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.11em] text-text-muted">
                  <span>Pair</span><span>Lifecycle</span><span>Samples</span><span>Regime</span><span>Corr.</span><span>WF folds / trades</span><span>OOS net</span><span>Rank</span><span>Current blockers</span>
                </div>
                {rows.map((candidate) => (
                  <CandidateRow
                    key={candidate.pairId}
                    candidate={candidate}
                    requiredSamples={requirements.minimumSamplesForRequiredFolds}
                    selected={discovery.selectedPairs.some((pair) => pair.pairId === candidate.pairId)}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-lg border border-warning/20 bg-warning/10 p-4 text-sm text-text-muted">
              No candidates match this evidence filter.
            </div>
          )}
        </section>

        <div className="grid gap-3 lg:grid-cols-4">
          <SafetyFact label="Bounded sticky universe" passed={discovery.safety.boundedUniverse && discovery.safety.stickyCandidateUniverse} />
          <SafetyFact label="Explicit costs and out-of-sample folds" passed={discovery.safety.explicitCostsRequired && discovery.rankings.every((item) => item.walkForward.safety.outOfSampleOnly)} />
          <SafetyFact label="Persistent promotion hysteresis" passed={discovery.safety.promotionHysteresisRequired && discovery.safety.lifecyclePersistent} />
          <SafetyFact label="Demotion blocks signals immediately" passed={discovery.safety.demotionBlocksSignalsImmediately && discovery.safety.signalsRequireConfirmedPromotion} />
          <SafetyFact label="Thresholds were not relaxed" passed={!discovery.safety.thresholdsRelaxed} />
          <SafetyFact label="PAPER, LIVE and orders remain disabled" passed={!evidence.safety.paperExecutionAllowed && !evidence.safety.liveExecutionAllowed && !evidence.safety.orderSubmissionAllowed} />
        </div>
      </div>
    </section>
  );
}

function CandidateRow({
  candidate,
  requiredSamples,
  selected,
}: {
  candidate: StatisticalResearchCandidate;
  requiredSamples: number;
  selected: boolean;
}) {
  const progress = Math.min(100, candidate.sampleCount / Math.max(1, requiredSamples) * 100);
  return (
    <article className="grid grid-cols-[1.35fr_.9fr_.8fr_1fr_.65fr_.8fr_.75fr_.55fr_1.7fr] items-center gap-3 border-b border-border-default px-3 py-3 text-xs last:border-b-0">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate font-semibold text-text-primary">{candidate.leftMarket} / {candidate.rightMarket}</p>
          {selected ? <span className="rounded border border-brand/30 bg-brand/10 px-1.5 py-0.5 font-mono text-[9px] text-brand">SELECTED</span> : null}
        </div>
        <p className="mt-1 font-mono text-[10px] uppercase text-text-muted">{candidate.exchange}{candidate.seeded ? " · seed" : ""}</p>
      </div>
      <div>
        <LifecycleBadge state={candidate.lifecycle.state} />
        <p className="mt-1 font-mono text-[9px] text-text-muted">
          raw {filterLabel(candidate.qualificationState)}
        </p>
      </div>
      <div>
        <p className="font-mono font-bold text-text-primary">{candidate.sampleCount}/{requiredSamples}</p>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-panel">
          <div className="h-full rounded-full bg-brand" style={{width: `${progress}%`}} />
        </div>
      </div>
      <RegimeBadge regime={candidate.regime.regime} />
      <span className="font-mono text-text-primary">{formatNumber(candidate.returnCorrelation, 3)}</span>
      <span className="font-mono text-text-primary">
        {candidate.walkForward.summary.completedFolds} / {candidate.outOfSampleTrades}
      </span>
      <span className={candidate.outOfSampleNetPercent !== null && candidate.outOfSampleNetPercent > 0 ? "font-mono text-success" : "font-mono text-text-muted"}>
        {formatPercent(candidate.outOfSampleNetPercent)}
      </span>
      <span className="font-mono font-bold text-text-primary">{formatNumber(candidate.rankScore, 2)}</span>
      <p className="line-clamp-3 break-words text-[10px] leading-4 text-text-muted" title={candidate.blockers.join(" · ")}>
        {candidate.blockers.join(" · ") || "All research gates passed."}
      </p>
    </article>
  );
}

function StateBadge({state, label}: {state: StatisticalResearchState; label?: string}) {
  const style = state === "PROMOTED"
    ? "border-success/30 bg-success/10 text-success"
    : state === "COLLECTING_HISTORY"
      ? "border-warning/30 bg-warning/10 text-warning"
      : "border-danger/30 bg-danger/10 text-danger";
  return <span className={`w-fit rounded-full border px-2 py-1 font-mono text-[9px] font-bold ${style}`}>{label ?? filterLabel(state)}</span>;
}

function LifecycleBadge({state}: {state: StatisticalPromotionLifecycleState}) {
  const style = state === "PROMOTED"
    ? "border-success/30 bg-success/10 text-success"
    : state === "REJECTED"
      ? "border-danger/30 bg-danger/10 text-danger"
      : state === "DEMOTION_PENDING"
        ? "border-danger/30 bg-danger/10 text-danger"
        : "border-warning/30 bg-warning/10 text-warning";
  return (
    <span className={`inline-flex w-fit rounded-full border px-2 py-1 font-mono text-[9px] font-bold ${style}`}>
      {state.replaceAll("_", " ")}
    </span>
  );
}

function RegimeBadge({regime}: {regime: StatisticalResearchCandidate["regime"]["regime"]}) {
  const healthy = regime === "STABLE_CORRELATED";
  const unavailable = regime === "INSUFFICIENT_DATA";
  return (
    <span className={`w-fit rounded border px-2 py-1 font-mono text-[9px] ${
      healthy ? "border-success/30 bg-success/10 text-success"
        : unavailable ? "border-warning/30 bg-warning/10 text-warning"
          : "border-danger/30 bg-danger/10 text-danger"
    }`}>
      {regime.replaceAll("_", " ")}
    </span>
  );
}

function ResearchMetric({label, value, suffix = "", tone = "default"}: {
  label: string;
  value: number;
  suffix?: string;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const color = tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : tone === "danger" ? "text-danger" : "text-text-primary";
  return (
    <div className="rounded-lg border border-border-default bg-panel-light p-3">
      <p className="text-[10px] uppercase tracking-[0.12em] text-text-muted">{label}</p>
      <p className={`mt-2 font-mono text-lg font-bold ${color}`}>{value.toLocaleString()}{suffix}</p>
    </div>
  );
}

function Fact({label, value, danger = false}: {label: string; value: string; danger?: boolean}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.1em] text-text-muted">{label}</p>
      <p className={`mt-1 break-words font-mono font-bold ${danger ? "text-danger" : "text-text-primary"}`}>{value}</p>
    </div>
  );
}

function SafetyFact({label, passed}: {label: string; passed: boolean}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border-default bg-panel-light px-3 py-2.5">
      <span className="text-xs text-text-muted">{label}</span>
      {passed ? <CheckCircle2 className="size-4 shrink-0 text-success" /> : <AlertTriangle className="size-4 shrink-0 text-danger" />}
    </div>
  );
}

function PanelState({icon, title, detail, danger = false, action}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  danger?: boolean;
  action?: React.ReactNode;
}) {
  return (
    <section className={`rounded-xl border bg-panel p-5 ${danger ? "border-danger/30" : "border-border-default"}`}>
      <div className={`flex items-start gap-3 ${danger ? "text-danger" : "text-text-muted"}`}>
        {icon}
        <div>
          <h2 className="text-lg font-bold text-text-primary">{title}</h2>
          <p className="mt-2 text-sm text-text-muted">{detail}</p>
          {action}
        </div>
      </div>
    </section>
  );
}

function filterLabel(value: CandidateFilter): string {
  return value === "COLLECTING_HISTORY" ? "COLLECTING" : value;
}

function filterCount(value: CandidateFilter, candidates: StatisticalResearchCandidate[]): string {
  const count = value === "ALL" ? candidates.length : candidates.filter((candidate) => candidate.state === value).length;
  return `(${count})`;
}

function formatNumber(value: number | null, digits: number): string {
  return value === null || !Number.isFinite(value) ? "NO_DATA" : value.toFixed(digits);
}

function formatPercent(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "NO_DATA" : `${value.toFixed(4)}%`;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("en-IN", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
