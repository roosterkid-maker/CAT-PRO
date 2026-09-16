import {
  useEffect,
  useState,
} from "react";

import {
  GitBranch,
} from "lucide-react";

import {
  useCentralLiveTriangularBridge,
} from "@/modules/strategies/hooks/useStrategies";

export function CentralLiveTriangularSection() {
  const query = useCentralLiveTriangularBridge();
  const report = query.data?.data;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(interval);
  }, []);

  if (query.isPending && !report) {
    return (
      <section className="m-0 rounded-xl border border-border-default bg-panel p-6 text-sm text-text-muted">
        Loading Central LIVE triangular pipeline...
      </section>
    );
  }

  if (query.isError || !report) {
    return (
      <section className="rounded-xl border border-red-400/30 bg-red-400/10 p-6 text-sm text-red-200">
        Central LIVE triangular pipeline status is unavailable. Treat this pipeline as not running while unavailable.
      </section>
    );
  }

  const {bridge, arm} = report;
  const armSecondsLeft = arm.currentlyArmed && arm.armedUntil !== null
    ? Math.max(0, Math.round((arm.armedUntil - now) / 1_000))
    : null;

  return (
    <section className="rounded-2xl border border-border-default bg-panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 font-mono text-xs font-bold tracking-[0.16em] text-emerald-300">
            <GitBranch className="size-4" /> CENTRAL LIVE · TRIANGULAR ARBITRAGE
          </p>
          <h2 className="mt-2 text-xl font-bold text-text-primary">Bridge, operator arm and dispatch status</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">
            This is the only path that can ever place a real triangular-arbitrage order. A candidate reaches dispatch
            only once every real evidence check passes AND an operator has submitted a fresh, single-use confirmation.
          </p>
        </div>
        <StatusBadge label={bridge.running ? "SUBSCRIBED" : "INERT"} good={bridge.running} />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Operator arm" value={arm.currentlyArmed ? `ARMED (${armSecondsLeft}s)` : "NOT ARMED"} good={!arm.currentlyArmed} />
        <Metric label="Queue records" value={String(bridge.dispatcher.queue.records)} good />
        <Metric label="Admissions blocked" value={String(bridge.dispatcher.admissionJournal.blocked)} good={bridge.dispatcher.admissionJournal.blocked === 0} />
        <Metric label="Halted strategies" value={String(bridge.dispatcher.dispatcher.sharedRecoveryHalt.haltedStrategyIds.length)} good={bridge.dispatcher.dispatcher.sharedRecoveryHalt.haltedStrategyIds.length === 0} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <article className="rounded-xl border border-border-default bg-background-subtle p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.13em] text-text-muted">Latest candidate</p>
          {bridge.latestCandidate ? (
            <div className="mt-3">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate font-mono text-xs font-bold text-text-primary">{bridge.latestCandidate.plan.id}</p>
                <StatusBadge label={bridge.latestCandidate.ready ? "READY" : "BLOCKED"} good={bridge.latestCandidate.ready} />
              </div>
              {bridge.latestCandidate.reasons.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {bridge.latestCandidate.reasons.slice(0, 5).map((reason) => (
                    <span key={reason} className="rounded-md border border-amber-400/25 bg-amber-400/5 px-2 py-1.5 font-mono text-[10px] leading-4 text-amber-300">
                      {reason}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <p className="mt-3 text-sm text-text-muted">No triangular signal has been observed by the bridge yet.</p>
          )}
        </article>

        <article className="rounded-xl border border-border-default bg-background-subtle p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.13em] text-text-muted">Recent intake outcomes</p>
          {bridge.recentOutcomes.length > 0 ? (
            <div className="mt-3 flex flex-col gap-1.5">
              {bridge.recentOutcomes.slice(0, 5).map((outcome) => (
                <div key={`${outcome.planId}:${outcome.observedAt}`} className="flex items-center justify-between gap-2 rounded-md border border-border-default bg-panel px-2 py-1.5 font-mono text-[10px] text-text-muted">
                  <span className="truncate">{outcome.planId}</span>
                  <span className="shrink-0 font-bold text-text-primary">{outcome.intakeState}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-text-muted">No plan has ever been intaken.</p>
          )}
        </article>
      </div>
    </section>
  );
}

function StatusBadge({label, good}: {label: string; good: boolean}) {
  return <span className={`shrink-0 rounded-full border px-3 py-1.5 font-mono text-xs font-bold ${good ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-amber-400/30 bg-amber-400/10 text-amber-300"}`}>{label}</span>;
}

function Metric({label, value, good}: {label: string; value: string; good: boolean}) {
  return (
    <article className="rounded-xl border border-border-default bg-background-subtle p-4">
      <p className="text-xs uppercase tracking-[0.13em] text-text-muted">{label}</p>
      <p className={`mt-2 font-mono text-lg font-bold ${good ? "text-emerald-300" : "text-amber-300"}`}>{value}</p>
    </article>
  );
}
