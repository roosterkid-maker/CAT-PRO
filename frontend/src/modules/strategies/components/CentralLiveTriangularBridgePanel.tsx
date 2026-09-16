import {
  useEffect,
  useState,
} from "react";

import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Zap,
} from "lucide-react";

import {
  useCentralLiveTriangularBridge,
} from "../hooks/useStrategies";

import type {
  CentralLiveOperatorArmRecord,
  CentralLiveTriangularOutcome,
} from "../types/CentralLiveTriangularBridge";

export function CentralLiveTriangularBridgePanel() {
  const query = useCentralLiveTriangularBridge();
  const report = query.data?.data;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(interval);
  }, []);

  if (query.isPending && !report) {
    return <PanelState title="Loading Central LIVE triangular pipeline" detail="Reading bridge, dispatcher and operator-arm diagnostics." />;
  }

  if (query.isError || !report) {
    return <PanelState danger title="Central LIVE triangular pipeline unavailable"
      detail="This is the real-order pipeline's own status - if it can't be read, treat it as not running." />;
  }

  const {bridge, arm} = report;
  const state = deriveState(report, now);
  const armSecondsLeft = arm.currentlyArmed && arm.armedUntil !== null
    ? Math.max(0, Math.round((arm.armedUntil - now) / 1_000))
    : null;

  return (
    <section className="overflow-hidden rounded-xl border border-border-default bg-panel">
      <div className="border-b border-border-default p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-brand">
              <Zap className="size-5" />
              <p className="text-xs font-semibold uppercase tracking-[0.16em]">
                Central LIVE Real-Order Pipeline
              </p>
            </div>
            <h2 className="mt-2 text-xl font-bold text-text-primary">
              Bridge, operator arm and dispatch status
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">
              This is the ONLY pipeline that can ever place a real triangular-arbitrage order. A plan can reach dispatch
              only once every real evidence check passes AND an operator has submitted a fresh, single-use confirmation.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StateBadge state={state} />
            <button type="button" aria-label="Refresh Central LIVE triangular status"
              disabled={query.isFetching} onClick={() => void query.refetch()}
              className="rounded-md border border-border-default bg-panel-light p-2 text-text-muted hover:text-text-primary disabled:opacity-60">
              <RefreshCw className={`size-4 ${query.isFetching ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Metric label="Bridge" value={bridge.running ? "SUBSCRIBED" : "INERT"}
            tone={bridge.running ? "success" : "neutral"} />
          <Metric label="Operator arm" value={arm.currentlyArmed ? `ARMED (${armSecondsLeft}s)` : "NOT ARMED"}
            tone={arm.currentlyArmed ? "warning" : "neutral"} />
          <Metric label="Queue records" value={bridge.dispatcher.queue.records} />
          <Metric label="Admissions blocked" value={bridge.dispatcher.admissionJournal.blocked}
            tone={bridge.dispatcher.admissionJournal.blocked > 0 ? "warning" : "neutral"} />
          <Metric label="Halted strategies" value={bridge.dispatcher.dispatcher.sharedRecoveryHalt.haltedStrategyIds.length}
            tone={bridge.dispatcher.dispatcher.sharedRecoveryHalt.haltedStrategyIds.length > 0 ? "warning" : "success"} />
        </div>
      </div>

      <div className="grid gap-4 p-5 xl:grid-cols-2">
        <section className="rounded-lg border border-border-default bg-panel-light p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.13em] text-text-muted">Latest candidate</p>
          {bridge.latestCandidate ? (
            <div className="mt-3">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate font-mono text-xs font-bold text-text-primary">{bridge.latestCandidate.plan.id}</p>
                <span className={`shrink-0 rounded-full border px-2 py-1 font-mono text-[10px] font-bold ${bridge.latestCandidate.ready ? "border-success/30 bg-success/10 text-success" : "border-warning/30 bg-warning/10 text-warning"}`}>
                  {bridge.latestCandidate.ready ? "READY" : "BLOCKED"}
                </span>
              </div>
              <p className="mt-1 text-[10px] uppercase tracking-[0.1em] text-text-muted">
                observed {formatAge(now - bridge.latestCandidate.observedAt)} ago · expires {formatAge(bridge.latestCandidate.plan.expiresAt - now)}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {bridge.latestCandidate.plan.legs.map((leg) => (
                  <span key={leg.id} className="rounded-md border border-border-default bg-panel px-2 py-1 font-mono text-[10px] text-text-muted">
                    L{leg.sequence} {leg.side} {leg.market} · {leg.exchange}
                  </span>
                ))}
              </div>
              {bridge.latestCandidate.reasons.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {bridge.latestCandidate.reasons.slice(0, 6).map((reason) => (
                    <span key={reason} className="rounded-md border border-warning/20 bg-warning/5 px-2 py-2 font-mono text-[10px] leading-4 text-warning">
                      {reason}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <p className="mt-4 text-sm text-text-muted">No triangular signal has been observed by the bridge yet.</p>
          )}
        </section>

        <section className="rounded-lg border border-border-default bg-panel-light p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.13em] text-text-muted">Operator arm</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Fact label="Currently armed" value={arm.currentlyArmed ? "YES" : "NO"} />
            <Fact label="Window" value={`${arm.safety.maximumArmWindowMs / 1_000}s`} />
          </div>
          <p className="mt-3 text-xs text-text-muted">
            A real order requires the operator to POST the exact confirmation phrase - never inferred, never generated automatically.
          </p>
          {arm.recent.length > 0 ? (
            <div className="mt-3 flex flex-col gap-1.5">
              {arm.recent.slice(0, 5).map((record) => <ArmHistoryRow key={record.armId} record={record} now={now} />)}
            </div>
          ) : (
            <p className="mt-3 text-xs text-text-muted">No arm has ever been submitted for this strategy.</p>
          )}
        </section>

        <section className="rounded-lg border border-border-default bg-panel-light p-4 xl:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-[0.13em] text-text-muted">Recent intake outcomes</p>
          {bridge.recentOutcomes.length > 0 ? (
            <div className="mt-3 flex flex-col gap-1.5">
              {bridge.recentOutcomes.slice(0, 8).map((outcome) => <OutcomeRow key={`${outcome.planId}:${outcome.observedAt}`} outcome={outcome} />)}
            </div>
          ) : (
            <p className="mt-4 text-sm text-text-muted">No plan has ever been intaken - either no candidate has qualified, or none was armed in time.</p>
          )}
        </section>

        <div className="flex flex-wrap gap-2 border-t border-border-default pt-4 text-[10px] font-semibold uppercase tracking-[0.1em] text-text-muted xl:col-span-2">
          <Safety label="LIVE / orders off by default" passed={!bridge.dispatcher.safety.liveExecutionAllowed && !bridge.dispatcher.safety.orderSubmissionAllowed} />
          <Safety label="Order gateway default-disabled" passed={bridge.dispatcher.safety.productionOrderGatewayDefaultDisabled} />
          <Safety label="Exact confirmation phrase required" passed={arm.safety.exactConfirmationPhraseRequired} />
          <Safety label="Single-use arm" passed={arm.safety.singleUsePerArm} />
          <Safety label="Confirmation timestamp never regenerated" passed={arm.safety.operatorConfirmedTimestampNeverRegenerated} />
          <Safety label="Handlers fully wired" passed={bridge.dispatcher.production.fullyWired} />
        </div>
      </div>
    </section>
  );
}

function ArmHistoryRow({record, now}: {record: CentralLiveOperatorArmRecord; now: number}) {
  const tone = record.status === "CLAIMED" ? "border-success/20 bg-success/5 text-success"
    : record.status === "ARMED" ? "border-warning/20 bg-warning/5 text-warning"
      : "border-border-default bg-panel text-text-muted";
  return (
    <div className={`flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 font-mono text-[10px] ${tone}`}>
      <span>{record.status}{record.claimedByPlanId ? ` · ${record.claimedByPlanId}` : ""}</span>
      <span>{formatAge(now - record.armedAt)} ago</span>
    </div>
  );
}

function OutcomeRow({outcome}: {outcome: CentralLiveTriangularOutcome}) {
  const tone = outcome.intakeState === "QUEUED" ? "border-success/20 bg-success/5 text-success"
    : outcome.intakeState === "DUPLICATE" ? "border-border-default bg-panel text-text-muted"
      : "border-danger/20 bg-danger/5 text-danger";
  return (
    <div className={`rounded-md border px-2 py-1.5 font-mono text-[10px] ${tone}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate">{outcome.planId}</span>
        <span className="shrink-0 font-bold">{outcome.intakeState}</span>
      </div>
      {outcome.reasons.length > 0 ? <p className="mt-1 leading-4 text-danger/90">{outcome.reasons.join(" | ")}</p> : null}
    </div>
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

function PanelState({title, detail, danger = false}: {title: string; detail: string; danger?: boolean}) {
  return <section className={`rounded-xl border p-5 ${danger ? "border-danger/30 bg-danger/5" : "border-border-default bg-panel"}`}><div className="flex items-start gap-3">{danger ? <AlertTriangle className="mt-0.5 size-5 text-danger" /> : <RefreshCw className="mt-0.5 size-5 animate-spin text-brand" />}<div><h2 className="font-bold text-text-primary">{title}</h2><p className="mt-1 text-sm text-text-muted">{detail}</p></div></div></section>;
}

type BridgeDisplayState = "INERT" | "LISTENING" | "CANDIDATE_READY" | "ARMED" | "QUEUED_TODAY";

function deriveState(report: {bridge: {running: boolean; latestCandidate: {ready: boolean} | null; recentOutcomes: CentralLiveTriangularOutcome[]}; arm: {currentlyArmed: boolean}}, now: number): BridgeDisplayState {
  if (!report.bridge.running) return "INERT";
  if (report.bridge.recentOutcomes.some((outcome) => outcome.intakeState === "QUEUED" && outcome.observedAt > now - 86_400_000)) return "QUEUED_TODAY";
  if (report.arm.currentlyArmed) return "ARMED";
  if (report.bridge.latestCandidate?.ready) return "CANDIDATE_READY";
  return "LISTENING";
}

function StateBadge({state}: {state: BridgeDisplayState}) {
  const positive = state === "QUEUED_TODAY" || state === "CANDIDATE_READY";
  const warning = state === "ARMED";
  const neutral = state === "LISTENING";
  const tone = positive ? "border-success/30 bg-success/10 text-success"
    : warning ? "border-warning/30 bg-warning/10 text-warning"
      : neutral ? "border-brand/30 bg-brand/10 text-brand"
        : "border-danger/30 bg-danger/10 text-danger";
  return <span className={`rounded-full border px-3 py-1 font-mono text-[10px] font-bold ${tone}`}>{state.replaceAll("_", " ")}</span>;
}

function formatAge(value: number): string {
  const clamped = Math.max(0, value);
  if (clamped < 1_000) return `${Math.round(clamped)} ms`;
  if (clamped < 60_000) return `${(clamped / 1_000).toFixed(1)} s`;
  return `${(clamped / 60_000).toFixed(1)} min`;
}
