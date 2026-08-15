import {AlertTriangle, Bot, CheckCircle2, RefreshCw, ShieldCheck} from "lucide-react";
import {usePersonalStrategyOneBot} from "../hooks/useStrategies";
import type {PersonalStrategyOneBotState} from "../types/PersonalStrategyOneBot";

export function PersonalStrategyOneBotPanel() {
  const query = usePersonalStrategyOneBot();
  const report = query.data?.data;

  if (!report) {
    return (
      <section className="rounded-xl border border-border-default bg-panel p-5">
        <div className="flex items-center gap-3 text-text-muted">
          <RefreshCw className={`size-5 ${query.isPending ? "animate-spin" : ""}`} />
          <div>
            <h2 className="font-bold text-text-primary">Personal bot status unavailable</h2>
            <p className="mt-1 text-sm">No execution readiness is inferred until the Strategy #1 control plane responds.</p>
          </div>
        </div>
      </section>
    );
  }

  const state = stateAppearance(report.state);
  return (
    <section className="overflow-hidden rounded-xl border border-brand/30 bg-panel">
      <div className="border-b border-border-default bg-brand/5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-brand">
              <Bot className="size-5" />
              <p className="text-xs font-semibold uppercase tracking-[0.16em]">V90.0 Personal Strategy #1 Bot</p>
            </div>
            <h2 className="mt-2 text-xl font-bold text-text-primary">One strategy, one execution owner, truthful PAPER state</h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-text-muted">
              Cross-exchange arbitrage is the active personal-bot lane. This view combines current opportunities, automatic PAPER authority, risk budget and accepted soak without treating the other seven strategies as prerequisites.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full border px-3 py-1.5 font-mono text-[10px] font-bold ${state.className}`}>{state.label}</span>
            <button type="button" aria-label="Refresh personal bot status" disabled={query.isFetching}
              onClick={() => void query.refetch()}
              className="rounded-md border border-border-default bg-panel p-2 text-text-muted hover:text-text-primary disabled:opacity-60">
              <RefreshCw className={`size-4 ${query.isFetching ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <Metric label="Fresh opportunities" value={report.opportunity.current} />
          <Metric label="PAPER-capable EXECUTE" value={`${report.opportunity.fundedExecutable}/${report.opportunity.executable}`} />
          <Metric label="PAPER automation" value={report.paper.automationAllowed ? "ARMED" : "BLOCKED"} />
          <Metric label="Accepted soak" value={`${report.soak.consecutivePasses}/${report.soak.minimumConsecutivePasses}`} />
          <Metric label="Daily trades" value={`${report.paper.tradesToday}/${report.paper.maximumDailyTrades}`} />
          <Metric label="Remaining" value={report.paper.remainingDailyTrades} />
        </div>
      </div>

      <div className="space-y-4 p-5">
        <div className={`rounded-lg border p-4 ${state.panelClassName}`}>
          <div className="flex items-start gap-3">
            {report.state === "READY_TO_EXECUTE_PAPER" ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />
              : <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" />}
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">Exact next action</p>
              <p className="mt-1 text-sm font-semibold text-text-primary">{report.nextAction}</p>
              {report.blockers.length > 0 ? (
                <p className="mt-2 break-words font-mono text-[10px] text-text-muted">{report.blockers.join(" · ")}</p>
              ) : null}
            </div>
          </div>
        </div>

        {report.opportunity.top.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-border-default">
            <div className="min-w-[800px]">
              <div className="grid grid-cols-[1fr_1.2fr_.7fr_.7fr_.7fr_.7fr] gap-3 border-b border-border-default bg-panel-light px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-text-muted">
                <span>Market</span><span>Route</span><span>Decision</span><span>Net %</span><span>Net profit</span><span>Quantity</span>
              </div>
              {report.opportunity.top.map((opportunity) => (
                <div key={opportunity.id} className="grid grid-cols-[1fr_1.2fr_.7fr_.7fr_.7fr_.7fr] gap-3 border-b border-border-default px-3 py-2 font-mono text-[10px] last:border-b-0">
                  <span className="font-bold text-text-primary">{opportunity.market}</span>
                  <span className="text-text-muted">{opportunity.buyExchange} → {opportunity.sellExchange}</span>
                  <span className={opportunity.decision === "EXECUTE" ? "text-success" : "text-warning"}>{opportunity.decision}</span>
                  <span className="text-text-primary">{opportunity.netProfitPercent.toFixed(4)}%</span>
                  <span className="text-text-primary">
                    {opportunity.modeledNetProfitInr === null
                      ? "NO DATA"
                      : `₹${formatNumber(opportunity.modeledNetProfitInr)}`}
                  </span>
                  <span className="text-text-muted">{formatNumber(opportunity.executableQuantity)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="rounded-lg border border-border-default bg-panel-light px-4 py-3 text-sm text-text-muted">
            No fresh net-qualified opportunity exists at this instant. The scanner and automatic PAPER owner remain running.
          </p>
        )}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Fact label="Execution owner" value="Unified Strategy #1" passed />
          <Fact label="Account mode" value={report.paper.accountMode} passed={report.paper.accountEnabled && report.paper.accountMode === "PAPER" && !report.paper.emergencyStop} />
          <Fact label="Available PAPER capital" value={`₹${formatNumber(report.paper.availableCapital)}`} passed={report.paper.availableCapital > 0} />
          <Fact label="Read cannot execute" value="PAPER/LIVE isolated" passed={report.safety.readOnlyAggregation && !report.safety.paperExecutionTriggeredByRead && !report.safety.liveExecutionAllowed && !report.safety.orderSubmissionAllowed} />
        </div>

        {report.lastExecutionCycle ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-default bg-panel-light px-4 py-3 text-xs text-text-muted">
            <span>Last owner cycle: <strong className="font-mono text-text-primary">{report.lastExecutionCycle.status}</strong></span>
            <span>{report.lastExecutionCycle.reasons[0] ?? "No rejection reason"}</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function Metric({label, value}: {label: string; value: string | number}) {
  return <div className="rounded-lg border border-border-default bg-panel px-3 py-3"><p className="text-[10px] uppercase tracking-[0.11em] text-text-muted">{label}</p><p className="mt-2 font-mono text-lg font-bold text-text-primary">{value}</p></div>;
}

function Fact({label, value, passed}: {label: string; value: string; passed: boolean}) {
  return <div className="flex items-center justify-between gap-3 rounded-lg border border-border-default bg-panel-light px-3 py-3"><div><p className="text-[10px] uppercase tracking-[0.1em] text-text-muted">{label}</p><p className="mt-1 text-xs font-semibold text-text-primary">{value}</p></div>{passed ? <ShieldCheck className="size-4 shrink-0 text-success" /> : <AlertTriangle className="size-4 shrink-0 text-danger" />}</div>;
}

function stateAppearance(state: PersonalStrategyOneBotState): {label: string; className: string; panelClassName: string} {
  if (state === "READY_TO_EXECUTE_PAPER") return {label: "PAPER READY", className: "border-success/30 bg-success/10 text-success", panelClassName: "border-success/25 bg-success/5"};
  if (state === "BLOCKED") return {label: "BLOCKED", className: "border-danger/30 bg-danger/10 text-danger", panelClassName: "border-danger/25 bg-danger/5"};
  return {label: state.replaceAll("_", " "), className: "border-warning/30 bg-warning/10 text-warning", panelClassName: "border-warning/25 bg-warning/5"};
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-IN", {maximumFractionDigits: 8}).format(value);
}
