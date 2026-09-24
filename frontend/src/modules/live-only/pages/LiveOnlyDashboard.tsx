import {
  Activity,
  Landmark,
  ShieldCheck,
  WalletCards,
  Zap,
} from "lucide-react";

import {
  useLiveOnlyRuntime,
} from "../hooks/useLiveOnlyRuntime";

import {
  BotOverviewPanels,
} from "../components/BotOverviewPanels";

import {
  InrScannerPanel,
} from "../components/InrScannerPanel";

/*
 * BOT page: the arbitrage scanner (USDT<->USDT, INR<->INR, USDT<->INR),
 * the wallet/order overview, and the live execution boundary. The legacy
 * opportunity-engine stream and the triangular panel were retired with the
 * old USDT-only system.
 */
export default function LiveOnlyDashboard() {
  const runtimeQuery =
    useLiveOnlyRuntime();
  const runtime =
    runtimeQuery.data?.data;

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
    <section className="space-y-4">
      <InrScannerPanel />

      <BotOverviewPanels runtime={runtime} />

      <header className="rounded-2xl border border-emerald-300/25 bg-panel p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs font-bold tracking-[0.18em] text-emerald-300">LIVE EXECUTION</p>
            <h1 className="mt-2 text-3xl font-bold text-text-primary">Order execution status</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">
              Every live order requires a fresh exact-route preflight, a final order-time last-look, durable authority and journal-before-I/O. One trade at a time; any possible exposure halts execution.
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
