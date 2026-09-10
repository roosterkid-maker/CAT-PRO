import {
  Activity,
  ArrowRight,
  Landmark,
  ShieldCheck,
  WalletCards,
  Zap,
} from "lucide-react";

import {
  useOpportunities,
} from "@/modules/arbitrage/hooks/useOpportunities";

import {
  useLiveOnlyRuntime,
} from "../hooks/useLiveOnlyRuntime";

export default function LiveOnlyDashboard() {
  const runtimeQuery =
    useLiveOnlyRuntime();
  const opportunitiesQuery =
    useOpportunities();
  const runtime =
    runtimeQuery.data?.data;
  const candidates =
    (opportunitiesQuery.data?.data ?? [])
      .filter(
        (opportunity) =>
          opportunity.decision === "EXECUTE",
      )
      .sort(
        (first, second) =>
          second.netProfitPercent - first.netProfitPercent,
      );

  if (
    runtimeQuery.isPending
  ) {
    return <StatePanel message="Loading LIVE-only runtime evidence..." />;
  }

  if (
    !runtime
  ) {
    return <StatePanel message="LIVE-only runtime evidence is unavailable. No execution state is inferred." danger />;
  }

  const live =
    runtime.profileSelected &&
    runtime.policy.enabled &&
    runtime.runner.runtimeEnabled &&
    runtime.runner.running &&
    !runtime.runner.halted;
  const capitalManagerReady =
    runtime.capitalManager.enabled &&
    runtime.capitalManager.runner.running;

  return (
    <section className="space-y-6 p-6 xl:p-8">
      <header className="rounded-2xl border border-emerald-300/25 bg-panel p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs font-bold tracking-[0.18em] text-emerald-300">CAT PRO · LIVE-ONLY</p>
            <h1 className="mt-2 text-3xl font-bold text-text-primary">One runtime, bounded real execution</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">
              PAPER, Shadow and Tiny-LIVE controls are retired from this operator surface. Every order still requires fresh exact-route preflight, final last-look, durable authority and journal-before-I/O.
            </p>
          </div>
          <StatusBadge label={live ? "LIVE RUNNER READY" : runtime.runner.halted ? "HALTED" : "LIVE LOCKED"} good={live} />
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric icon={<WalletCards />} label="Per-leg capital" value={`₹${runtime.policy.minimumCapitalPerLegInr}–₹${runtime.policy.maximumCapitalPerLegInr}`} detail={`Current target ₹${runtime.policy.preferredCapitalPerLegInr}`} good={runtime.policy.preferredCapitalPerLegInr >= runtime.policy.minimumCapitalPerLegInr && runtime.policy.preferredCapitalPerLegInr <= runtime.policy.maximumCapitalPerLegInr} />
        <Metric icon={<Zap />} label="Current net gate" value={`${runtime.policy.minimumCurrentNetProfitPercent.toFixed(2)}%`} detail={`Post-stress hard floor ≥ ${runtime.policy.minimumPostStressNetProfitPercent.toFixed(2)}%`} good />
        <Metric icon={<Activity />} label="Execution" value={runtime.runner.inFlight ? "IN FLIGHT" : runtime.runner.running ? "WATCHING" : "STOPPED"} detail={`${runtime.runner.completed}/${runtime.runner.attempts} completed`} good={runtime.runner.running && !runtime.runner.halted} />
        <Metric icon={<Landmark />} label="Capital Manager" value={capitalManagerReady ? "ENABLED" : "LOCKED"} detail={`${runtime.capitalManager.withdrawalWhitelistEntries} whitelisted destination(s)`} good={capitalManagerReady} />
      </div>

      {runtime.runner.halted ? (
        <section className="rounded-xl border border-red-400/35 bg-red-400/10 p-5">
          <p className="font-semibold text-red-300">Execution halted fail-closed</p>
          <p className="mt-2 text-sm text-red-200/80">{runtime.runner.haltedReason}</p>
        </section>
      ) : null}

      <section className="rounded-2xl border border-border-default bg-panel p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-primary">Current executable candidates</p>
            <h2 className="mt-1 text-xl font-bold text-text-primary">Fresh opportunity stream</h2>
          </div>
          <StatusBadge label={`${candidates.length} EXECUTE`} good={candidates.length > 0} />
        </div>
        <div className="mt-4 space-y-2">
          {candidates.length === 0 ? (
            <p className="rounded-xl border border-border-default bg-background-subtle p-4 text-sm text-text-muted">No route currently passes the opportunity engine. The runner waits; it does not weaken gates or create an order from stale evidence.</p>
          ) : candidates.slice(0, 10).map((opportunity) => (
            <article key={opportunity.id} className="grid gap-3 rounded-xl border border-border-default bg-background-subtle p-4 md:grid-cols-[1fr_auto_auto] md:items-center">
              <div>
                <p className="font-mono font-bold text-text-primary">{opportunity.market}</p>
                <p className="mt-1 flex items-center gap-2 text-xs uppercase text-text-muted">{opportunity.buyExchange}<ArrowRight className="size-3" />{opportunity.sellExchange}</p>
              </div>
              <div className="text-left md:text-right"><p className="text-xs text-text-muted">Net</p><p className="font-mono font-bold text-emerald-300">{opportunity.netProfitPercent.toFixed(3)}%</p></div>
              <div className="text-left md:text-right"><p className="text-xs text-text-muted">Quality</p><p className="font-mono font-bold text-text-primary">{opportunity.overallScore}</p></div>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <EvidencePanel title="Non-negotiable order boundary" icon={<ShieldCheck className="size-5" />} facts={[
          ["Fresh exact preflight", runtime.runner.safety.freshExactPreflightRequired],
          ["Final order-time last-look", runtime.runner.safety.finalOrderTimeLastLookRequired],
          ["One concurrent trade", runtime.runner.safety.oneConcurrentTrade],
          ["Same-opportunity retry disabled", runtime.runner.safety.sameOpportunityRetryAllowed === false],
          ["Halt on possible exposure", runtime.runner.safety.haltOnPossibleExposure],
        ]} />
        <EvidencePanel title="Capital movement boundary" icon={<Landmark className="size-5" />} facts={[
          ["Master switch", runtime.capitalManager.enabled],
          ["Same-exchange movement", runtime.capitalManager.sameExchangeEnabled],
          ["Cross-exchange movement", runtime.capitalManager.crossExchangeEnabled],
          ["Dedicated credentials", runtime.capitalManager.dedicatedBinanceCredentialsConfigured],
          ["Withdrawal whitelist", runtime.capitalManager.withdrawalWhitelistEntries > 0],
        ]} />
      </section>
    </section>
  );
}

function StatusBadge({label, good}: {label: string; good: boolean}) {
  return <span className={`rounded-full border px-3 py-1.5 font-mono text-xs font-bold ${good ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-amber-400/30 bg-amber-400/10 text-amber-300"}`}>{label}</span>;
}

function Metric({icon, label, value, detail, good}: {icon: React.ReactNode; label: string; value: string; detail: string; good: boolean}) {
  return <article className="rounded-xl border border-border-default bg-panel p-5"><div className={good ? "text-emerald-300" : "text-amber-300"}>{icon}</div><p className="mt-4 text-xs uppercase tracking-[0.13em] text-text-muted">{label}</p><p className="mt-1 font-mono text-xl font-bold text-text-primary">{value}</p><p className="mt-1 text-xs text-text-muted">{detail}</p></article>;
}

function EvidencePanel({title, icon, facts}: {title: string; icon: React.ReactNode; facts: Array<[string, boolean]>}) {
  return <article className="rounded-xl border border-border-default bg-panel p-5"><div className="flex items-center gap-2 text-text-primary">{icon}<h2 className="font-bold">{title}</h2></div><div className="mt-4 space-y-2">{facts.map(([label, passed]) => <div key={label} className="flex items-center justify-between rounded-lg border border-border-default bg-background-subtle px-3 py-2"><span className="text-sm text-text-muted">{label}</span><span className={`font-mono text-xs font-bold ${passed ? "text-emerald-300" : "text-amber-300"}`}>{passed ? "YES" : "LOCKED"}</span></div>)}</div></article>;
}

function StatePanel({message, danger = false}: {message: string; danger?: boolean}) {
  return <section className={`m-6 rounded-xl border p-6 text-sm ${danger ? "border-red-400/30 bg-red-400/10 text-red-200" : "border-border-default bg-panel text-text-muted"}`}>{message}</section>;
}
