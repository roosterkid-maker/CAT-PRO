import {
  useState,
} from "react";

import {
  Activity,
  AlertTriangle,
  BrainCircuit,
  Check,
  Clipboard,
  Clock3,
  Gauge,
  RefreshCw,
  Route,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react";

import type {
  ReactNode,
} from "react";

import {
  useAgentSakhondraReport,
} from "../agentSakhondraApi";

export default function AgentSakhondraDashboard() {
  const {
    data,
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useAgentSakhondraReport();
  const [copied, setCopied] = useState(false);
  const report = data?.data;

  if (isLoading && !report) {
    return <PageState title="AGENT SAKHONDRA is studying LIVE evidence" detail="Joining candidate, timing, LIVE session and settlement journals..." spinning />;
  }
  if (isError || !report) {
    return <PageState title="AGENT SAKHONDRA evidence unavailable" detail="The advisor failed closed. No recommendation is inferred from missing evidence." onRetry={() => void refetch()} />;
  }

  const copyPrompt = async () => {
    await navigator.clipboard.writeText(report.codexPrompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  };
  const stateTone = report.agent.state === "ATTENTION_REQUIRED"
    ? "border-rose-400/40 bg-rose-500/10 text-rose-300"
    : report.agent.state === "LIVE_EVIDENCE_AVAILABLE"
      ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-300"
      : "border-amber-400/40 bg-amber-500/10 text-amber-300";

  return (
    <section className="space-y-4 pb-10 text-emerald-50">
      <header className="relative overflow-hidden rounded-2xl border border-emerald-400/35 bg-[radial-gradient(circle_at_15%_20%,rgba(16,185,129,0.16),transparent_38%),linear-gradient(135deg,rgba(1,18,10,0.98),rgba(0,7,5,0.99)_58%,rgba(4,30,18,0.98))] p-5 shadow-[0_20px_70px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(110,231,183,0.12)] sm:p-7">
        <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(52,211,153,.15)_1px,transparent_1px),linear-gradient(90deg,rgba(52,211,153,.15)_1px,transparent_1px)] [background-size:28px_28px]" />
        <div className="relative flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
          <div className="flex gap-4">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-emerald-300/40 bg-emerald-400/10 shadow-[0_0_30px_rgba(52,211,153,0.25),inset_0_0_18px_rgba(52,211,153,0.15)]">
              <BrainCircuit className="text-emerald-300" size={30} />
            </div>
            <div>
              <p className="text-[10px] font-black tracking-[0.3em] text-emerald-400">CAT PRO LIVE INTELLIGENCE</p>
              <h1 className="mt-1 text-2xl font-black tracking-[0.08em] text-white sm:text-3xl">AGENT SAKHONDRA</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-emerald-100/65">Self-studying, evidence-bound advisor for Tiny-LIVE and Main-LIVE. It measures; it never trades, arms, moves funds or changes policy.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="border-emerald-400/35 bg-emerald-500/10 text-emerald-300">LIVE DATA ONLY</Badge>
            <Badge className="border-cyan-400/30 bg-cyan-500/10 text-cyan-200">READ ONLY</Badge>
            <Badge className={stateTone}>{humanize(report.agent.state)}</Badge>
            <button type="button" onClick={() => void refetch()} className="rounded-xl border border-emerald-400/25 bg-black/30 p-2.5 text-emerald-200 transition hover:border-emerald-300 hover:bg-emerald-500/10" aria-label="Refresh AGENT SAKHONDRA">
              <RefreshCw className={isFetching ? "animate-spin" : ""} size={17} />
            </button>
          </div>
        </div>
        <p className="relative mt-5 rounded-xl border border-emerald-400/20 bg-black/35 px-4 py-3 text-sm text-emerald-100/75">{report.agent.summary}</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Metric icon={<Activity size={16} />} label="LIVE candidates" value={number(report.conversion.candidateGenerations)} detail="market observations · not trades" />
        <Metric icon={<Target size={16} />} label="Dispatch-ready" value={number(report.conversion.dispatchReadyCandidateGenerations)} detail="candidate evidence" />
        <Metric icon={<Zap size={16} />} label="LIVE attempts" value={number(report.conversion.liveAttempts)} detail={`${report.conversion.liveAttemptsLastHour} in rolling hour`} />
        <Metric icon={<Check size={16} />} label="Settled LIVE" value={number(report.conversion.settledLiveTrades)} detail={`${formatPercent(report.conversion.attemptToSettlementPercent)} of attempts`} positive />
        <Metric icon={<AlertTriangle size={16} />} label="Unsuccessful" value={number(report.conversion.unsuccessfulLiveAttempts)} detail={`${report.conversion.possibleExposureOrRecovery} exposure/recovery`} warning={report.conversion.unsuccessfulLiveAttempts > 0} />
        <Metric icon={<TrendingUp size={16} />} label="Realized LIVE net" value={nullable(report.economics.realizedNetProfit, 6)} detail={`${report.economics.settledSamples} linked settlements`} positive={(report.economics.realizedNetProfit ?? 0) > 0} warning={(report.economics.realizedNetProfit ?? 0) < 0} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
        <Panel title="LIVE conversion lattice" eyebrow="CANDIDATE → REAL SETTLEMENT" icon={<Route size={18} />}>
          <div className="grid gap-2 sm:grid-cols-5">
            <Stage label="Candidates" value={report.conversion.candidateGenerations} />
            <Stage label="Qualified" value={report.conversion.qualifiedCandidateGenerations} />
            <Stage label="Dispatch-ready" value={report.conversion.dispatchReadyCandidateGenerations} />
            <Stage label="Attempted" value={report.conversion.liveAttempts} live />
            <Stage label="Settled" value={report.conversion.settledLiveTrades} live />
          </div>
          <p className="mt-4 text-xs leading-5 text-emerald-100/50">Candidate stages are genuine market observations, not orders. Attempted and settled stages come only from the durable Strategy #1 LIVE journal.</p>
        </Panel>

        <Panel title="LIVE latency and freshness" eyebrow="LIVE-DISPATCH P99 HEADROOM" icon={<Gauge size={18} />}>
          <div className="grid grid-cols-2 gap-3">
            <MiniMetric label="LIVE book-age budget" value={`${report.timing.maximumBookAgeMs} ms`} />
            <MiniMetric label="Worst LIVE book age P99" value={milliseconds(report.timing.worstBookAgeP99Ms)} />
            <MiniMetric label="LIVE decision → start P99" value={milliseconds(report.timing.decisionToStartP99Ms)} />
            <MiniMetric label="LIVE operational headroom" value={milliseconds(report.timing.operationalHeadroomMs)} alert={report.timing.operationalHeadroomMs !== null && report.timing.operationalHeadroomMs < report.timing.requiredHeadroomMs} />
          </div>
          <p className="mt-3 text-xs text-emerald-100/50">Required headroom: ≥ {report.timing.requiredHeadroomMs} ms · LIVE dispatch timing routes: {report.timing.routesWithLiveDispatches}{report.timing.routesWithLiveDispatches === 0 ? " · PAPER/candidate timing is intentionally not substituted" : ""}</p>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Why execution did not happen" eyebrow="RANKED ROOT CAUSES" icon={<AlertTriangle size={18} />}>
          <div className="space-y-2">
            {report.unsuccessfulReasons.length === 0 ? <Empty text="No failure reason evidence recorded yet." /> : report.unsuccessfulReasons.map((item) => (
              <div key={`${item.source}-${item.reason}`} className="grid grid-cols-[auto_1fr_auto] items-start gap-3 rounded-xl border border-emerald-400/15 bg-black/25 p-3">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-400/10 font-mono text-xs text-emerald-300">{item.rank}</span>
                <div className="min-w-0"><p className="break-words text-sm font-semibold text-emerald-50/90">{item.reason}</p><p className="mt-1 text-[10px] font-bold tracking-wider text-emerald-300/50">{humanize(item.source)}</p></div>
                <span className="font-mono text-sm font-black text-amber-300">{number(item.count)}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Recommended change queue" eyebrow="HUMAN REVIEW REQUIRED" icon={<Sparkles size={18} />}>
          <div className="space-y-3">
            {report.recommendations.map((item) => (
              <article key={item.id} className="rounded-xl border border-emerald-400/15 bg-black/25 p-4">
                <div className="flex flex-wrap items-center gap-2"><Badge className={item.priority === "P0" ? "border-rose-400/35 bg-rose-500/10 text-rose-300" : "border-amber-400/30 bg-amber-500/10 text-amber-200"}>{item.priority}</Badge><span className="text-[10px] font-black tracking-widest text-emerald-400/70">{item.area} · {item.confidence} CONFIDENCE · n={number(item.evidenceSamples)}</span></div>
                <h3 className="mt-2 font-bold text-white">{item.title}</h3>
                <p className="mt-1 text-sm leading-5 text-emerald-100/60">{item.finding}</p>
                <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2"><p className="rounded-lg bg-black/35 p-2 text-emerald-100/65"><span className="text-emerald-400">Observed:</span> {item.observed}</p><p className="rounded-lg bg-black/35 p-2 text-emerald-100/65"><span className="text-emerald-400">Target:</span> {item.target}</p></div>
                <p className="mt-3 text-xs leading-5 text-emerald-100/75">{item.action}</p>
              </article>
            ))}
          </div>
        </Panel>
      </div>

      <Panel title="Route intelligence" eyebrow="CANDIDATE + LIVE JOURNAL JOIN" icon={<Route size={18} />}>
        <div className="overflow-x-auto rounded-xl border border-emerald-400/15">
          <table className="min-w-[1180px] w-full text-left text-xs">
            <thead className="bg-emerald-500/8 text-[10px] uppercase tracking-widest text-emerald-300/65"><tr><Th>Route</Th><Th>Candidates</Th><Th>Eligible</Th><Th>Attempts</Th><Th>Settled</Th><Th>Net P&amp;L</Th><Th>P95 net</Th><Th>Book age P99</Th><Th>Decision P99</Th><Th>Headroom</Th><Th>Dominant blocker</Th></tr></thead>
            <tbody>{report.routes.length === 0 ? <tr><td colSpan={11} className="p-6 text-center text-emerald-100/50">No route evidence retained.</td></tr> : report.routes.map((route) => (
              <tr key={route.routeKey} className="border-t border-emerald-400/10 bg-black/15 text-emerald-50/80 hover:bg-emerald-400/5">
                <Td><p className="font-bold text-white">{route.market}</p><p className="mt-1 text-[10px] text-emerald-300/60">{route.buyExchange} → {route.sellExchange}</p></Td>
                <Td>{number(route.candidateGenerations)}</Td><Td>{number(route.liveEligibleGenerations)}</Td><Td>{route.attempts}</Td><Td>{route.settled}</Td><Td>{nullable(route.realizedNetProfit, 6)}</Td><Td>{formatPercent(route.p95CandidateNetPercent)}</Td><Td>{milliseconds(maxNullable(route.buyBookAgeP99Ms, route.sellBookAgeP99Ms))}</Td><Td>{milliseconds(route.decisionToStartP99Ms)}</Td><Td alert={route.operationalHeadroomMs !== null && route.operationalHeadroomMs < report.timing.requiredHeadroomMs}>{milliseconds(route.operationalHeadroomMs)}</Td><Td>{route.dominantBlocker ?? "—"}</Td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Codex improvement prompt" eyebrow="READY TO COPY · EVIDENCE LOCKED" icon={<Clipboard size={18} />} action={
        <button type="button" onClick={() => void copyPrompt()} className="inline-flex items-center gap-2 rounded-xl border border-emerald-300/30 bg-emerald-400/10 px-4 py-2 text-xs font-bold text-emerald-200 transition hover:bg-emerald-400/20">{copied ? <Check size={15} /> : <Clipboard size={15} />}{copied ? "Copied" : "Copy prompt"}</button>
      }>
        <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap rounded-xl border border-emerald-400/15 bg-black/45 p-4 font-mono text-xs leading-6 text-emerald-100/75">{report.codexPrompt}</pre>
      </Panel>

      <footer className="flex flex-col gap-2 rounded-xl border border-emerald-400/20 bg-black/30 px-4 py-3 text-xs text-emerald-100/55 sm:flex-row sm:items-center sm:justify-between">
        <span className="inline-flex items-center gap-2"><ShieldCheck size={15} className="text-emerald-400" /> PAPER and synthetic executions excluded · no order/policy/fund authority</span>
        <span className="inline-flex items-center gap-2 font-mono"><Clock3 size={14} /> Updated {new Date(report.generatedAt).toLocaleTimeString("en-IN", {timeZone: "Asia/Kolkata"})} IST · auto 15s</span>
      </footer>
    </section>
  );
}

function Panel({title, eyebrow, icon, action, children}: {title: string; eyebrow: string; icon: ReactNode; action?: ReactNode; children: ReactNode}) {
  return <section className="overflow-hidden rounded-2xl border border-emerald-400/25 bg-[linear-gradient(145deg,rgba(3,17,11,.96),rgba(0,8,5,.98))] shadow-[0_14px_45px_rgba(0,0,0,.35),inset_0_1px_0_rgba(110,231,183,.08)]"><header className="flex items-center justify-between gap-3 border-b border-emerald-400/15 px-4 py-4 sm:px-5"><div className="flex items-center gap-3 text-emerald-300">{icon}<div><p className="text-[9px] font-black tracking-[.22em] text-emerald-400/65">{eyebrow}</p><h2 className="mt-1 text-base font-bold text-emerald-50">{title}</h2></div></div>{action}</header><div className="p-4 sm:p-5">{children}</div></section>;
}

function Metric({icon, label, value, detail, positive, warning}: {icon: ReactNode; label: string; value: string; detail: string; positive?: boolean; warning?: boolean}) {
  const tone = warning ? "text-rose-300" : positive ? "text-emerald-300" : "text-white";
  return <article className="rounded-2xl border border-emerald-400/20 bg-black/35 p-4 shadow-[inset_0_1px_0_rgba(110,231,183,.07)]"><div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[.18em] text-emerald-300/55">{icon}{label}</div><p className={`mt-3 font-mono text-2xl font-black ${tone}`}>{value}</p><p className="mt-2 text-[10px] leading-4 text-emerald-100/45">{detail}</p></article>;
}

function Stage({label, value, live}: {label: string; value: number; live?: boolean}) {
  return <div className={`relative rounded-xl border p-3 ${live ? "border-emerald-300/35 bg-emerald-400/10" : "border-emerald-400/15 bg-black/25"}`}><p className="text-[9px] font-bold uppercase tracking-widest text-emerald-300/55">{label}</p><p className="mt-2 font-mono text-xl font-black text-white">{number(value)}</p>{live && <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(52,211,153,1)]" />}</div>;
}

function MiniMetric({label, value, alert}: {label: string; value: string; alert?: boolean}) {
  return <div className="rounded-xl border border-emerald-400/15 bg-black/25 p-3"><p className="text-[9px] uppercase tracking-wider text-emerald-300/50">{label}</p><p className={`mt-2 font-mono text-lg font-black ${alert ? "text-rose-300" : "text-emerald-100"}`}>{value}</p></div>;
}

function Badge({children, className}: {children: ReactNode; className: string}) { return <span className={`rounded-full border px-3 py-1.5 text-[9px] font-black tracking-widest ${className}`}>{children}</span>; }
function Th({children}: {children: ReactNode}) { return <th className="whitespace-nowrap px-3 py-3 font-black">{children}</th>; }
function Td({children, alert}: {children: ReactNode; alert?: boolean}) { return <td className={`max-w-[240px] px-3 py-3 font-mono ${alert ? "text-rose-300" : ""}`}>{children}</td>; }
function Empty({text}: {text: string}) { return <p className="rounded-xl border border-dashed border-emerald-400/20 p-6 text-center text-sm text-emerald-100/45">{text}</p>; }
function number(value: number): string { return value.toLocaleString("en-IN"); }
function nullable(value: number | null, decimals = 2): string { return value === null ? "NO DATA" : value.toLocaleString("en-IN", {maximumFractionDigits: decimals}); }
function milliseconds(value: number | null): string { return value === null ? "NO DATA" : `${nullable(value, 2)} ms`; }
function formatPercent(value: number | null): string { return value === null ? "NO DATA" : `${nullable(value, 3)}%`; }
function maxNullable(first: number | null, second: number | null): number | null { const values = [first, second].filter((value): value is number => value !== null); return values.length ? Math.max(...values) : null; }
function humanize(value: string): string { return value.replaceAll("_", " "); }

function PageState({title, detail, spinning, onRetry}: {title: string; detail: string; spinning?: boolean; onRetry?: () => void}) {
  return <section className="grid min-h-[420px] place-items-center rounded-2xl border border-emerald-400/25 bg-black/50 p-8 text-center"><div><BrainCircuit className={`mx-auto text-emerald-300 ${spinning ? "animate-pulse" : ""}`} size={38} /><h1 className="mt-4 text-xl font-bold text-white">{title}</h1><p className="mt-2 text-sm text-emerald-100/55">{detail}</p>{onRetry && <button type="button" onClick={onRetry} className="mt-5 rounded-xl border border-emerald-300/30 bg-emerald-400/10 px-4 py-2 text-sm font-bold text-emerald-200">Retry</button>}</div></section>;
}
