import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bot,
  CheckCircle2,
  CircleDollarSign,
  Coins,
  Power,
  Radio,
  RefreshCw,
  Route,
  ShieldCheck,
  TrendingUp,
  WalletCards,
  Workflow,
  Zap,
} from "lucide-react";

import {
  useState,
} from "react";

import {
  usePersonalBotControl,
  usePersonalStrategyOneBot,
} from "@/modules/strategies/hooks/useStrategies";

import type {
  PersonalBotExcludedExecution,
  PersonalBotExecution,
  PersonalBotOpportunity,
  PersonalBotFundingLeg,
  PersonalOpportunityConversion,
  PersonalOpportunityConversionStageStatus,
  PersonalStrategyOneBotData,
  PersonalStrategyOneBotState,
  PostGuardProfitValidation,
  PostGuardRouteState,
} from "@/modules/strategies/types/PersonalStrategyOneBot";

import {
  useRunStrategyOnePilotPreflight,
  useStrategyOnePilotPreview,
} from "@/modules/tiny-live/hooks/useTinyLivePreflight";

import type {
  StrategyOnePilotPreflightRunReport,
  StrategyOnePilotPreviewReport,
} from "@/modules/tiny-live/types/TinyLivePreflight";

export default function BotDashboard() {
  const query = usePersonalStrategyOneBot();
  const control = usePersonalBotControl();
  const pilotQuery = useStrategyOnePilotPreview();
  const pilotPreflight = useRunStrategyOnePilotPreflight();
  const [pilotAcknowledged, setPilotAcknowledged] = useState(false);
  const report = query.data?.data;
  const pilotPreview = pilotQuery.data?.data ?? null;

  if (!report) {
    return (
      <section className="flex min-h-[65vh] items-center justify-center">
        <div className="rounded-2xl border border-border-default bg-panel px-8 py-10 text-center">
          <RefreshCw className={`mx-auto size-7 text-brand ${query.isPending ? "animate-spin" : ""}`} />
          <h1 className="mt-4 text-xl font-semibold text-text-primary">BOT control plane unavailable</h1>
          <p className="mt-2 max-w-md text-sm text-text-muted">No running or execution claim is made until the local PAPER controller responds.</p>
          <button type="button" onClick={() => void query.refetch()} className="mt-5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white">Retry</button>
        </div>
      </section>
    );
  }

  const appearance = stateAppearance(report.state);
  const feed = report.opportunity.accepted;
  const latestExecution = report.recentExecutions[0] ?? null;

  function toggleBot(): void {
    if (!report || control.isPending) return;
    control.mutate(!report.control.enabled);
  }

  function runPilotPreflight(): void {
    const candidate = pilotPreview?.selected;
    if (!candidate || !pilotAcknowledged || pilotPreflight.isPending) return;
    pilotPreflight.mutate({
      confirmationToken: "RUN_STRATEGY_ONE_PILOT_PREFLIGHT_ONLY",
      expectedOpportunityId: candidate.opportunityId,
    });
  }

  return (
    <section className="space-y-5 pb-8">
      <div className="bot-command-hero relative overflow-hidden rounded-2xl border">
        <div className="pointer-events-none absolute -left-24 top-0 size-80 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -right-16 top-0 size-72 rounded-full bg-amber-500/10 blur-3xl" />

        <div className="relative border-b border-white/8 px-5 py-5 lg:px-7">
          <div className="flex flex-wrap items-center justify-between gap-5">
            <div className="flex items-center gap-4">
              <div className="grid size-12 place-items-center rounded-xl border border-emerald-400/20 bg-emerald-400/10 text-emerald-300 shadow-[0_0_28px_rgba(52,211,153,.12)]">
                <Bot className="size-6" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-semibold tracking-tight text-white">CAT PRO BOT</h1>
                  <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-[10px] font-bold tracking-[0.14em] text-slate-300">PAPER ONLY</span>
                </div>
                <p className="mt-1 text-sm text-slate-400">One operational view for opportunities, execution, strategy and P&amp;L.</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className={`hidden rounded-lg border px-3 py-2 text-right sm:block ${appearance.surface}`}>
                <p className="font-mono text-[10px] uppercase tracking-[0.13em] text-slate-400">Runtime</p>
                <p className={`mt-1 text-xs font-bold ${appearance.text}`}>{appearance.label}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={report.control.enabled}
                aria-label={report.control.enabled ? "Turn automatic PAPER bot off" : "Turn automatic PAPER bot on"}
                disabled={control.isPending}
                onClick={toggleBot}
                className={`group flex min-w-32 items-center justify-between gap-3 rounded-xl border px-3 py-2.5 transition disabled:cursor-wait disabled:opacity-60 ${report.control.enabled ? "border-emerald-400/35 bg-emerald-400/12" : "border-slate-600 bg-slate-800/70"}`}
              >
                <span className={`grid size-8 place-items-center rounded-lg ${report.control.enabled ? "bg-emerald-400 text-emerald-950" : "bg-slate-700 text-slate-300"}`}>
                  {control.isPending ? <RefreshCw className="size-4 animate-spin" /> : <Power className="size-4" />}
                </span>
                <span className="text-left">
                  <span className="block text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400">BOT CONTROL</span>
                  <span className={`block text-sm font-bold ${report.control.enabled ? "text-emerald-300" : "text-slate-300"}`}>{report.control.enabled ? "ON" : "OFF"}</span>
                </span>
              </button>
            </div>
          </div>

          {control.isError ? (
            <p className="mt-3 rounded-lg border border-red-400/25 bg-red-400/10 px-3 py-2 text-xs text-red-300">
              Control update failed: {control.error instanceof Error ? control.error.message : "Unknown error"}
            </p>
          ) : null}
        </div>

        <div className="relative grid gap-px bg-white/8 sm:grid-cols-2 xl:grid-cols-6">
          <HeroMetric icon={<CircleDollarSign />} label="Credible PAPER P&L" value={formatWholeRupees(report.performance.realizedPnl)} detail={`Today ${signedWholeRupees(report.performance.realizedPnlToday)}`} tone={report.performance.realizedPnl >= 0 ? "positive" : "negative"} />
          <HeroMetric icon={<Coins />} label="PAPER capital budget" value={`₹${formatInteger(report.paper.capitalBudgetInr)}`} detail={`₹${formatInteger(report.paper.minimumCapitalPerTrade)}–₹${formatInteger(report.paper.maximumCapitalPerTrade)} / trade`} />
          <HeroMetric icon={<Activity />} label="Successful trades / hour" value={formatInteger(report.performance.successfulCurrentClockHour)} detail={`${report.performance.currentClockHourLabel} · IST`} tone="positive" />
          <HeroMetric icon={<CheckCircle2 />} label="Credible executions" value={formatInteger(report.performance.successfulExecutions)} detail={`${report.performance.excludedUncredibleExecutions} distorted fill${report.performance.excludedUncredibleExecutions === 1 ? "" : "s"} excluded`} tone="positive" />
          <HeroMetric icon={<TrendingUp />} label="Accepted settlement rate" value={report.performance.winRatePercent === null ? "NO DATA" : `${report.performance.winRatePercent.toFixed(1)}%`} detail={`${report.performance.winningExecutions} positive PAPER closes · not LIVE`} />
          <HeroMetric icon={<Zap />} label="Daily attempt safety cap" value={`${report.paper.dailyActivity.reservationAttempts}/${report.paper.maximumDailyTrades}`} detail={`${report.paper.dailyActivity.settledPaperExecutions} settled · ${report.paper.dailyActivity.remainingAttemptBudget} attempts remaining`} tone={report.paper.dailyActivity.remainingAttemptBudget === 0 ? "warning" : "default"} />
        </div>
      </div>

      <HotPathLatencyPanel hotPath={report.hotPath} />

      <DailyActivityReconciliationPanel activity={report.paper.dailyActivity} limit={report.paper.maximumDailyTrades} />

      <FundingReadinessPanel report={report} />

      <HistoricalCapitalPlacementPanel placement={report.capitalPlacement} />

      <StrategyOneActionTimePreflightPanel
        preview={pilotPreview}
        latestRun={pilotPreflight.data?.data ?? null}
        loading={pilotQuery.isPending}
        refreshing={pilotQuery.isFetching}
        running={pilotPreflight.isPending}
        acknowledged={pilotAcknowledged}
        error={pilotQuery.error ?? pilotPreflight.error}
        onAcknowledgedChange={setPilotAcknowledged}
        onRefresh={() => void pilotQuery.refetch()}
        onRun={runPilotPreflight}
      />

      <InventoryDeploymentPanel plan={report.inventoryPlan} />

      <HourlySuccessfulTradesPanel performance={report.performance} />

      <OpportunityConversionPanel report={report.conversion} />

      <ProfitValidationPanel report={report.profitValidation} />

      <div className="grid gap-5 xl:grid-cols-[1.45fr_.9fr]">
        <article className="overflow-hidden rounded-2xl border border-border-default bg-panel">
          <PanelHeader icon={<Radio className="size-4" />} eyebrow="PAPER SIGNAL FEED" title="Live accepted opportunities" right={<LivePill active={report.control.scannerActive} label={`${report.opportunity.current} fresh`} />} />
          <div className="divide-y divide-border-default">
            {feed.length > 0 ? feed.slice(0, 8).map((opportunity) => (
              <OpportunityRow key={opportunity.id} opportunity={opportunity} />
            )) : (
              <EmptyState title="No PAPER-capable opportunity right now" detail={`The scanner has ${report.opportunity.executable} EXECUTE decision${report.opportunity.executable === 1 ? "" : "s"}; ${report.paperCapacity.blockedRoutes} evaluated route${report.paperCapacity.blockedRoutes === 1 ? " is" : "s are"} currently blocked by depth, fees, PAPER capital or exchange rules. Real wallet balances do not block PAPER.`} />
            )}
          </div>
        </article>

        <article className="overflow-hidden rounded-2xl border border-border-default bg-panel">
          <PanelHeader icon={<Activity className="size-4" />} eyebrow="EXECUTION PULSE" title="Latest successful execution" right={<span className="font-mono text-[10px] text-text-muted">AUTO REFRESH 5S</span>} />
          {latestExecution ? (
            <div className="p-5">
              <div className="rounded-xl border border-emerald-400/20 bg-gradient-to-br from-emerald-400/10 to-transparent p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <CoinMark symbol={latestExecution.baseAsset} />
                    <div>
                      <p className="text-lg font-bold text-text-primary">{latestExecution.baseAsset}<span className="ml-1 text-sm font-medium text-text-muted">/{latestExecution.quoteAsset}</span></p>
                      <p className="mt-0.5 text-xs text-text-muted">{latestExecution.strategyName}</p>
                    </div>
                  </div>
                  <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 font-mono text-[10px] font-bold text-emerald-300">SUCCESS</span>
                </div>
                <div className="mt-5 flex items-center gap-3 rounded-lg border border-white/8 bg-black/15 px-3 py-3">
                  <ExchangeName name={latestExecution.buyExchange} action="BUY" />
                  <ArrowRight className="size-4 shrink-0 text-emerald-300" />
                  <ExchangeName name={latestExecution.sellExchange} action="SELL" />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <CompactStat label="Economic P&L" value={signedNumber(latestExecution.pnl)} positive={latestExecution.pnl >= 0} />
                  <CompactStat label="Return" value={`${latestExecution.pnlPercent >= 0 ? "+" : ""}${latestExecution.pnlPercent.toFixed(3)}%`} positive={latestExecution.pnlPercent >= 0} />
                  <CompactStat label="Fees + GST" value={formatNumber(latestExecution.fees)} />
                  <CompactStat label="TDS withheld" value={formatNumber(latestExecution.tdsWithheld)} />
                  <CompactStat label="Deployable cash Δ" value={signedNumber(latestExecution.deployableCashProfit)} positive={latestExecution.deployableCashProfit >= 0} />
                  <CompactStat label="Quantity" value={formatNumber(latestExecution.quantity)} />
                  <CompactStat label="Completed" value={formatTime(latestExecution.completedAt ?? latestExecution.executedAt)} />
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-border-default bg-panel-light/45 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">Current owner cycle</p>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="font-mono text-xs font-bold text-text-primary">{report.lastExecutionCycle?.status ?? "NO CYCLE"}</span>
                  <span className="text-xs text-text-muted">{report.lastExecutionCycle ? timeAgo(report.lastExecutionCycle.completedAt) : "—"}</span>
                </div>
                <p className="mt-2 text-xs leading-5 text-text-muted">{report.lastExecutionCycle?.reasons[0] ?? report.nextAction}</p>
              </div>
            </div>
          ) : (
            <EmptyState title="No successful execution evidence" detail="A success card appears only after both PAPER legs, reconciliation and accounting complete." />
          )}
        </article>
      </div>

      <article className="overflow-hidden rounded-2xl border border-border-default bg-panel">
        <PanelHeader icon={<Route className="size-4" />} eyebrow="EXECUTION LEDGER" title="Successfully executed trades" right={<span className="rounded-full border border-border-default bg-panel-light px-2.5 py-1 font-mono text-[10px] text-text-muted">{report.recentExecutions.length} RECENT</span>} />
        <div className="overflow-x-auto">
          <div className="min-w-[1120px]">
            <div className="grid grid-cols-[1.1fr_1.35fr_1fr_.8fr_.8fr_1fr_.8fr_.8fr] gap-4 border-b border-border-default bg-panel-light/50 px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.11em] text-text-muted">
              <span>Coin / strategy</span><span>Route</span><span>Quantity</span><span>Buy</span><span>Sell</span><span>Fees / TDS</span><span>P&amp;L</span><span>Completed</span>
            </div>
            {report.recentExecutions.length > 0 ? report.recentExecutions.map((execution) => (
              <ExecutionRow key={execution.id} execution={execution} />
            )) : <EmptyState title="No completed trades" detail="The ledger remains empty until successful PAPER settlement is stored." />}
          </div>
        </div>
      </article>

      <article className="overflow-hidden rounded-2xl border border-red-400/20 bg-panel">
        <PanelHeader
          icon={<AlertTriangle className="size-4" />}
          eyebrow="PRICE CREDIBILITY AUDIT"
          title="Excluded distorted fills"
          right={<span className="rounded-full border border-red-400/25 bg-red-400/10 px-2.5 py-1 font-mono text-[10px] font-bold text-red-300">{report.excludedExecutions.length} EXCLUDED</span>}
        />
        <div className="border-b border-red-400/15 bg-red-400/5 px-5 py-3">
          <p className="text-xs leading-5 text-red-100/80">
            These completed PAPER records are preserved for audit, but their reported P&amp;L is not counted because the executed buy/sell price relationship failed the 1.05x credibility limit.
          </p>
        </div>
        <div className="max-h-[560px] overflow-auto">
          <div className="min-w-[1180px]">
            <div className="sticky top-0 z-10 grid grid-cols-[1fr_1.35fr_.75fr_.8fr_.8fr_1fr_.95fr_1.6fr_.75fr] gap-4 border-b border-border-default bg-panel-light px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.11em] text-text-muted">
              <span>Coin</span><span>Route</span><span>Quantity</span><span>Buy</span><span>Sell</span><span>Price ratio</span><span>Reported P&amp;L</span><span>Exclusion reason</span><span>Completed</span>
            </div>
            {report.excludedExecutions.length > 0 ? report.excludedExecutions.map((execution) => (
              <ExcludedExecutionRow key={execution.id} execution={execution} />
            )) : <EmptyState title="No distorted fills" detail="Every settled PAPER record currently passes executed-price credibility." />}
          </div>
        </div>
      </article>

      <div className="grid gap-3 md:grid-cols-3">
        <SafetyFact icon={<ShieldCheck />} label="Execution mode" value="PAPER simulation only" passed />
        <SafetyFact icon={<Activity />} label="Market scanner" value={report.control.scannerActive ? "Active while BOT is ON or OFF" : "Unavailable"} passed={report.control.scannerActive} />
        <SafetyFact icon={<Power />} label="Real orders" value="Disabled · 0 submitted" passed={!report.safety.liveExecutionAllowed && !report.safety.orderSubmissionAllowed} />
      </div>
    </section>
  );
}

function PanelHeader({icon, eyebrow, title, right}: {icon: React.ReactNode; eyebrow: string; title: string; right: React.ReactNode}) {
  return <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-default px-5 py-4"><div className="flex items-center gap-3"><span className="text-brand">{icon}</span><div><p className="text-[9px] font-semibold tracking-[0.16em] text-brand">{eyebrow}</p><h2 className="mt-0.5 text-base font-semibold text-text-primary">{title}</h2></div></div>{right}</div>;
}

function HeroMetric({icon, label, value, detail, tone = "default"}: {icon: React.ReactElement<{className?: string}>; label: string; value: string; detail: string; tone?: "default" | "positive" | "negative" | "warning"}) {
  const valueTone = tone === "positive" ? "text-emerald-300" : tone === "negative" ? "text-red-300" : tone === "warning" ? "text-amber-300" : "text-white";
  return <div className="bot-hero-metric px-5 py-5 lg:px-6"><div className="flex items-center gap-2 text-slate-500">{<span className="[&>svg]:size-4">{icon}</span>}<p className="text-[10px] font-semibold uppercase tracking-[0.13em]">{label}</p></div><p className={`mt-3 font-mono text-2xl font-bold tracking-tight ${valueTone}`}>{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></div>;
}

function HotPathLatencyPanel({hotPath}: {
  hotPath: PersonalStrategyOneBotData["hotPath"];
}) {
  return (
    <article className="overflow-hidden rounded-2xl border border-border-default bg-panel">
      <PanelHeader
        icon={<Zap className="size-4" />}
        eyebrow="STRATEGY #1 LIGHTNING PATH"
        title="Code-side execution latency"
        right={<LatencyStatePill state={hotPath.state} />}
      />
      <div className="border-b border-border-default px-5 py-3 text-xs text-text-muted">
        Rolling last {hotPath.sampleWindowCapacity} samples. Exchange and internet latency are excluded; no missing sample is treated as a pass.
      </div>
      <div className="grid gap-px bg-border-default md:grid-cols-2 xl:grid-cols-4">
        <LatencyMetric
          label="Market update → decision"
          distribution={hotPath.scanner.marketUpdateToDecisionMs}
          targetP95Ms={hotPath.targets.marketUpdateToDecisionP95Ms}
          targetP99Ms={hotPath.targets.marketUpdateToDecisionP99Ms}
          state={hotPath.gates.marketUpdateToDecision}
        />
        <LatencyMetric
          label="Decision → PAPER queue"
          distribution={hotPath.automation.decisionToQueueMs}
          targetP95Ms={hotPath.targets.decisionToQueueP95Ms}
          targetP99Ms={hotPath.targets.decisionToQueueP99Ms}
          state={hotPath.gates.decisionToQueue}
        />
        <LatencyMetric
          label="Candidate → execution start"
          distribution={hotPath.automation.candidateDecisionToExecutionStartMs}
          targetP95Ms={hotPath.targets.candidateDecisionToExecutionStartP95Ms}
          targetP99Ms={hotPath.targets.candidateDecisionToExecutionStartP99Ms}
          state={hotPath.gates.candidateDecisionToExecutionStart}
        />
        <LatencyMetric
          label="Decision to PAPER completion"
          distribution={hotPath.automation.decisionToExecutionCompleteMs}
          targetP99Ms={hotPath.targets.decisionToExecutionCompleteP99Ms}
          state={hotPath.gates.decisionToExecutionComplete}
        />
      </div>
      <div className="grid gap-3 border-t border-border-default px-5 py-3 text-[10px] sm:grid-cols-2 xl:grid-cols-6">
        <LatencyFact label="Scanner evaluation P95" value={formatLatency(hotPath.scanner.evaluationMs.p95Ms)} />
        <LatencyFact label="Pending snapshots" value={String(hotPath.automation.pendingSnapshots)} />
        <LatencyFact label="Queue high-water" value={String(hotPath.automation.pendingSnapshotHighWaterMark)} />
        <LatencyFact label="Empty snapshots coalesced" value={formatInteger(hotPath.automation.coalescedEmptySnapshots)} />
        <LatencyFact label="Superseded candidates coalesced" value={formatInteger(hotPath.automation.coalescedCandidateSnapshots)} />
        <LatencyFact label="Candidate snapshots dropped" value={formatInteger(hotPath.automation.droppedCandidateSnapshots)} danger={hotPath.automation.droppedCandidateSnapshots > 0} />
      </div>
    </article>
  );
}

function LatencyMetric({label, distribution, targetP95Ms, targetP99Ms, state}: {
  label: string;
  distribution: PersonalStrategyOneBotData["hotPath"]["scanner"]["marketUpdateToDecisionMs"];
  targetP95Ms?: number;
  targetP99Ms: number;
  state: "COLLECTING" | "PASS" | "MISS";
}) {
  return (
    <div className="bg-panel px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-text-muted">{label}</p>
        <LatencyStatePill state={state} compact />
      </div>
      <p className="mt-3 font-mono text-xl font-bold text-text-primary">P95 {formatLatency(distribution.p95Ms)} / P99 {formatLatency(distribution.p99Ms)}</p>
      <p className="mt-1 font-mono text-[10px] text-text-muted">
        P50 {formatLatency(distribution.p50Ms)} {targetP95Ms === undefined ? "" : `· P95 ≤ ${targetP95Ms} ms `}· P99 ≤ {targetP99Ms} ms · n={distribution.sampleCount}
      </p>
    </div>
  );
}

function LatencyStatePill({state, compact = false}: {state: "COLLECTING" | "PASS" | "MISS"; compact?: boolean}) {
  const tone = state === "PASS"
    ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"
    : state === "MISS"
      ? "border-red-400/25 bg-red-400/10 text-red-300"
      : "border-amber-400/25 bg-amber-400/10 text-amber-300";
  return <span className={`rounded-full border font-mono font-bold ${compact ? "px-2 py-0.5 text-[8px]" : "px-2.5 py-1 text-[9px]"} ${tone}`}>{state}</span>;
}

function LatencyFact({label, value, danger = false}: {label: string; value: string; danger?: boolean}) {
  return <div><p className="uppercase tracking-[0.1em] text-text-muted">{label}</p><p className={`mt-1 font-mono font-bold ${danger ? "text-red-300" : "text-text-primary"}`}>{value}</p></div>;
}

function formatLatency(value: number | null): string {
  return value === null ? "NO DATA" : `${value.toFixed(value < 10 ? 3 : 1)} ms`;
}

function DailyActivityReconciliationPanel({activity, limit}: {
  activity: PersonalStrategyOneBotData["paper"]["dailyActivity"];
  limit: number;
}) {
  const attemptDetails = activity.otherAttemptDetails ?? [];
  const detailCoverage = activity.otherAttemptDetailCoverage ?? {
    expected: activity.otherUnlinkedOrNonSettledReservations,
    available: attemptDetails.length,
    complete: false,
  };

  return (
    <article className="overflow-hidden rounded-2xl border border-border-default bg-panel">
      <PanelHeader
        icon={<Activity className="size-4" />}
        eyebrow="V85 DAILY ACTIVITY ACCOUNTING"
        title="Attempts and settlements"
        right={<span className={`rounded-full border px-2.5 py-1 font-mono text-[9px] font-bold ${activity.equationBalanced ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300" : "border-red-400/25 bg-red-400/10 text-red-300"}`}>{activity.equationBalanced ? "RECONCILED" : "MISMATCH"}</span>}
      />
      <div className="grid gap-px bg-border-default sm:grid-cols-2 xl:grid-cols-4">
        <ActivityMetric label="Reserved attempts" value={`${activity.reservationAttempts}/${limit}`} detail="Safety cap · includes non-settled attempts" tone="warning" />
        <ActivityMetric label="Actual PAPER settlements" value={formatInteger(activity.settledPaperExecutions)} detail={`${activity.credibleStrategyOneSettlements} credible · ${activity.credibilityExcludedStrategyOneSettlements} excluded`} tone="positive" />
        <ActivityMetric label="Dry-run reservations" value={formatInteger(activity.dryRunReservations)} detail={`${activity.failedDryRunReservations} failed after reservation`} />
        <ActivityMetric label="Other non-settled / unlinked" value={formatInteger(activity.otherUnlinkedOrNonSettledReservations)} detail="Reserved capital released without a stored settlement" tone={activity.otherUnlinkedOrNonSettledReservations > 0 ? "negative" : "default"} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-default px-5 py-3 text-xs">
        <p className="text-text-muted">The 500 cap protects against retry storms; it is an attempt limit, not a successful-trade claim.</p>
        <p className="font-mono font-bold text-text-primary">{activity.settledPaperExecutions} settled + {activity.dryRunReservations} dry-run + {activity.otherUnlinkedOrNonSettledReservations} other = {activity.reservationAttempts} attempts</p>
      </div>
      {activity.otherUnlinkedOrNonSettledReservations > 0 && (
        <details open className="border-t border-border-default">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 bg-panel-light/35 px-5 py-3 text-xs hover:bg-panel-light/60">
            <span className="font-semibold text-text-primary">Other attempt evidence</span>
            <span className={`rounded-full border px-2 py-0.5 font-mono text-[9px] font-bold ${detailCoverage.complete ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300" : "border-amber-400/25 bg-amber-400/10 text-amber-300"}`}>
              {detailCoverage.available}/{detailCoverage.expected} VISIBLE
            </span>
          </summary>
          <div className="border-t border-border-default px-5 py-3 text-[11px] leading-5 text-text-muted">
            These are real capital-reservation ledger rows without a stored PAPER settlement. A missing route means the older ledger row never captured market/exchange attribution; it is not inferred.
          </div>
          <div className="max-h-[360px] overflow-auto border-t border-border-default">
            <div className="min-w-[980px]">
              <div className="grid grid-cols-[.65fr_.7fr_.8fr_1.15fr_1.2fr_2fr] gap-4 border-b border-border-default bg-panel-light/45 px-5 py-2.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-text-muted">
                <span>Reserved at</span><span>Attempt</span><span>Capital</span><span>Capital release</span><span>Session</span><span>Route / evidence</span>
              </div>
              {attemptDetails.map((attempt) => (
                <div key={attempt.attemptId} className="grid grid-cols-[.65fr_.7fr_.8fr_1.15fr_1.2fr_2fr] items-start gap-4 border-b border-border-default px-5 py-3 text-xs last:border-b-0 hover:bg-panel-light/25">
                  <div><p className="font-mono font-bold text-text-primary">{formatTime(attempt.reservedAt)}</p><p className="mt-0.5 font-mono text-[9px] text-text-muted">local time</p></div>
                  <div><p className="font-mono font-bold text-text-primary">#{attempt.attemptNumber}</p><p className="mt-0.5 max-w-[100px] truncate font-mono text-[9px] text-text-muted" title={attempt.attemptId}>{attempt.attemptId}</p></div>
                  <div><p className="font-mono font-bold text-text-primary">INR {formatNumber(attempt.reservedCapital)}</p><p className="mt-0.5 font-mono text-[9px] text-text-muted">{attempt.accountMode}</p></div>
                  <div>
                    <p className={`font-mono text-[10px] font-bold ${attempt.capitalReleaseStatus === "RELEASE_CONFIRMED" ? "text-emerald-300" : "text-red-300"}`}>{attempt.capitalReleaseStatus.replaceAll("_", " ")}</p>
                    <p className="mt-0.5 font-mono text-[9px] text-text-muted">{attempt.releasedAt === null ? "no release entry" : `at ${formatTime(attempt.releasedAt)}`}</p>
                  </div>
                  <div><p className={`font-mono text-[10px] font-bold ${attempt.sessionLinkStatus === "LINKED" ? "text-amber-300" : "text-text-muted"}`}>{attempt.sessionStatus ?? "NOT LINKED"}</p><p className="mt-0.5 max-w-[150px] truncate font-mono text-[9px] text-text-muted" title={attempt.sessionId ?? undefined}>{attempt.sessionId ?? "no session id"}</p></div>
                  <div>
                    <p className="font-semibold text-text-primary">{attempt.market === null ? "ROUTE NOT CAPTURED" : `${attempt.market} · ${attempt.buyExchange} → ${attempt.sellExchange}`}</p>
                    <p className="mt-1 text-[10px] leading-4 text-text-muted">{attempt.reason}</p>
                  </div>
                </div>
              ))}
              {attemptDetails.length === 0 && <EmptyState title="Detailed ledger rows unavailable" detail="The reconciliation count exists, but matching reservation rows were not present in the current ledger." />}
            </div>
          </div>
        </details>
      )}
    </article>
  );
}

function FundingReadinessPanel({report}: {report: PersonalStrategyOneBotData}) {
  return (
    <article className="overflow-hidden rounded-2xl border border-border-default bg-panel">
      <PanelHeader
        icon={<WalletCards className="size-4" />}
        eyebrow="V86 FUNDED ROUTE SIZING"
        title="Authenticated two-leg LIVE-readiness capacity"
        right={<span className="rounded-full border border-border-default bg-panel-light px-2.5 py-1 font-mono text-[9px] text-text-muted">₹{formatInteger(report.funding.requestedCapitalInr)} REQUEST</span>}
      />
      <div className="border-b border-border-default px-5 py-3 text-xs leading-5 text-text-muted">
        Future LIVE readiness only: the BUY exchange needs fresh quote balance and the SELL exchange needs fresh coin inventory. These real balances are advisory here and do not block isolated PAPER execution.
      </div>
      <div className="grid gap-px bg-border-default sm:grid-cols-2 xl:grid-cols-4">
        <ActivityMetric label="Evaluated routes" value={formatInteger(report.funding.evaluatedRoutes)} detail="Current top / EXECUTE routes" />
        <ActivityMetric label="Fully funded" value={formatInteger(report.funding.fundedRoutes)} detail="No funding reduction" tone="positive" />
        <ActivityMetric label="Safely reduced" value={formatInteger(report.funding.reducedRoutes)} detail="Executable at a smaller quantity" tone="warning" />
        <ActivityMetric label="Blocked" value={formatInteger(report.funding.blockedRoutes)} detail="Future LIVE readiness only" tone={report.funding.blockedRoutes > 0 ? "negative" : "default"} />
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[1120px]">
          <div className="grid grid-cols-[1fr_1.2fr_.7fr_1.15fr_1.15fr_.8fr_1.6fr] gap-4 border-b border-border-default bg-panel-light/50 px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.11em] text-text-muted">
            <span>Market</span><span>Route</span><span>State</span><span>BUY quote funds</span><span>SELL coin funds</span><span>Final qty</span><span>Exact blocker</span>
          </div>
          {report.funding.routes.length > 0 ? report.funding.routes.slice(0, 10).map((route) => (
            <div key={`${route.opportunityId}:${route.routeKey}`} className="grid grid-cols-[1fr_1.2fr_.7fr_1.15fr_1.15fr_.8fr_1.6fr] items-center gap-4 border-b border-border-default px-5 py-3.5 text-xs last:border-b-0 hover:bg-panel-light/25">
              <div><p className="font-mono font-bold text-text-primary">{route.market}</p><p className="mt-0.5 font-mono text-[9px] text-text-muted">{route.baseAsset ?? "?"}/{route.quoteAsset ?? "?"}</p></div>
              <div className="flex items-center gap-2"><span className="font-semibold capitalize text-text-primary">{route.buyExchange}</span><ArrowRight className="size-3 text-brand"/><span className="font-semibold capitalize text-text-primary">{route.sellExchange}</span></div>
              <FundingState state={route.state} />
              <FundingAmount leg={route.buyFunding} />
              <FundingAmount leg={route.sellFunding} />
              <div><p className="font-mono font-bold text-text-primary">{route.executableQuantity === null ? "—" : formatNumber(route.executableQuantity)}</p><p className="mt-0.5 font-mono text-[9px] text-text-muted">{route.reductionPercent === null ? "NO SIZE" : `${route.reductionPercent.toFixed(2)}% reduced`}</p></div>
              <p className={`line-clamp-2 text-[10px] leading-4 ${route.blockers.length > 0 ? "text-red-300" : "text-emerald-300"}`}>{route.blockers[0] ?? "Fresh authenticated balances and order rules passed."}</p>
            </div>
          )) : <EmptyState title="No funding evaluation yet" detail="Funding evidence appears when a current top or EXECUTE opportunity exists." />}
        </div>
      </div>
    </article>
  );
}

function HistoricalCapitalPlacementPanel({placement}: {
  placement: PersonalStrategyOneBotData["capitalPlacement"];
}) {
  const pilot = placement.pilot.recommendedRoute;

  return (
    <article className="overflow-hidden rounded-2xl border border-border-default bg-panel">
      <PanelHeader
        icon={<Coins className="size-4" />}
        eyebrow="V91 DURABLE CAPITAL PLACEMENT"
        title="Where Strategy #1 historically buys and sells"
        right={(
          <span className={`rounded-full border px-2.5 py-1 font-mono text-[9px] font-bold ${capitalPlacementStateTone(placement.pilot.state)}`}>
            {placement.pilot.state.replaceAll("_", " ")}
          </span>
        )}
      />

      <div className="border-b border-border-default px-5 py-3 text-xs leading-5 text-text-muted">
        Ranked from unique, credible, closed Strategy #1 PAPER settlements—not repeated scanner snapshots. Historical rank selects only a Tiny-LIVE preflight candidate; it never moves funds or authorizes an order.
      </div>

      <div className="grid gap-px bg-border-default sm:grid-cols-2 xl:grid-cols-4">
        <ActivityMetric
          label="Credible unique settlements"
          value={formatInteger(placement.evidence.credibleSettlements)}
          detail={`${placement.evidence.excludedDistortedSettlements} distorted excluded · ${placement.evidence.duplicateIdsIgnored} duplicate IDs ignored`}
          tone="positive"
        />
        <ActivityMetric
          label="Historical routes"
          value={formatInteger(placement.routes.length)}
          detail={`${placement.buyVenues.length} BUY venues · ${placement.sellVenues.length} SELL venues`}
        />
        <ActivityMetric
          label="Tiny-LIVE pilot / leg"
          value={`₹${formatInteger(placement.pilot.requestedPerLegInr)}`}
          detail="Subject to current exchange minimum-notional rules"
          tone="warning"
        />
        <ActivityMetric
          label="Minimum two-leg inventory"
          value={`₹${formatInteger(placement.pilot.minimumTwoLegInventoryInr)}`}
          detail="BUY quote funds + equivalent SELL base inventory"
          tone="warning"
        />
      </div>

      {pilot ? (
        <div className="border-b border-border-default bg-gradient-to-r from-emerald-400/8 via-transparent to-amber-400/5 px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-emerald-300">Historical Tiny-LIVE preflight candidate</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm font-semibold text-text-primary">
                <span className="font-mono">{pilot.market}</span>
                <span className="capitalize">{pilot.buyExchange}</span>
                <ArrowRight className="size-3 text-brand" />
                <span className="capitalize">{pilot.sellExchange}</span>
                <ConfidenceBadge confidence={pilot.confidence} />
              </div>
              <p className="mt-2 max-w-3xl text-[10px] leading-4 text-text-muted">{placement.pilot.reasons.join(" ")}</p>
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-right sm:grid-cols-4">
              <PlacementStat label="Settlements" value={formatInteger(pilot.uniqueSettlements)} />
              <PlacementStat label="Net PAPER P&L" value={signedCurrency(pilot.realizedPnlInr)} positive={pilot.realizedPnlInr >= 0} />
              <PlacementStat label="Avg return" value={`${pilot.averageNetReturnPercent >= 0 ? "+" : ""}${pilot.averageNetReturnPercent.toFixed(3)}%`} positive={pilot.averageNetReturnPercent >= 0} />
              <PlacementStat label="Adapters" value={pilot.liveAdapterFoundationReady ? "2/2" : "BLOCKED"} positive={pilot.liveAdapterFoundationReady} />
            </div>
          </div>
        </div>
      ) : (
        <EmptyState title="No adapter-ready historical route" detail={placement.pilot.reasons[0] ?? "More credible Strategy #1 evidence is required."} />
      )}

      <div className="grid border-b border-border-default xl:grid-cols-2 xl:divide-x xl:divide-border-default">
        <PlacementVenueTable title="BUY venue ranking" rows={placement.buyVenues} />
        <PlacementVenueTable title="SELL venue ranking" rows={placement.sellVenues} />
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[1120px]">
          <div className="grid grid-cols-[.35fr_.85fr_1.2fr_.65fr_.65fr_.7fr_.7fr_.65fr_.65fr] gap-4 border-b border-border-default bg-panel-light/50 px-5 py-3 text-[9px] font-semibold uppercase tracking-[0.1em] text-text-muted">
            <span>Rank</span><span>Market</span><span>Route</span><span>Settled</span><span>Confidence</span><span>Net P&amp;L</span><span>Avg return</span><span>Fees / TDS</span><span>Adapters</span>
          </div>
          {placement.routes.slice(0, 10).map((route) => (
            <div key={route.routeKey} className="grid grid-cols-[.35fr_.85fr_1.2fr_.65fr_.65fr_.7fr_.7fr_.65fr_.65fr] items-center gap-4 border-b border-border-default px-5 py-3 text-xs last:border-b-0 hover:bg-panel-light/25">
              <span className="font-mono font-bold text-text-muted">#{route.rank}</span>
              <div><p className="font-mono font-bold text-text-primary">{route.market}</p><p className="mt-0.5 font-mono text-[9px] text-text-muted">{route.baseAsset}/{route.quoteAsset}</p></div>
              <span className="capitalize text-text-primary">{route.buyExchange} <ArrowRight className="mx-1 inline size-3 text-brand" /> {route.sellExchange}</span>
              <span className="font-mono font-bold text-text-primary">{formatInteger(route.uniqueSettlements)}</span>
              <ConfidenceBadge confidence={route.confidence} />
              <span className={`font-mono font-bold ${route.realizedPnlInr >= 0 ? "text-emerald-300" : "text-red-300"}`}>{signedCurrency(route.realizedPnlInr)}</span>
              <span className={`font-mono font-bold ${route.averageNetReturnPercent >= 0 ? "text-emerald-300" : "text-red-300"}`}>{route.averageNetReturnPercent >= 0 ? "+" : ""}{route.averageNetReturnPercent.toFixed(3)}%</span>
              <div><p className="font-mono text-text-primary">₹{formatNumber(route.feesInr)}</p><p className="font-mono text-[9px] text-amber-300">₹{formatNumber(route.tdsWithheldInr)}</p></div>
              <span className={`w-fit rounded border px-1.5 py-0.5 font-mono text-[8px] font-bold ${route.liveAdapterFoundationReady ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300" : "border-red-400/25 bg-red-400/10 text-red-300"}`}>{route.liveAdapterFoundationReady ? "2/2" : "BLOCKED"}</span>
            </div>
          ))}
          {placement.routes.length === 0 ? <EmptyState title="No historical route evidence" detail="The report will populate from unique credible closed Strategy #1 PAPER settlements." /> : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-default bg-panel-light/30 px-5 py-3 text-[10px]">
        <p className="text-text-muted">Current depth, fees, order rules and authenticated balances must still pass at action time.</p>
        <p className="font-mono font-bold text-emerald-300">NO AUTOMATIC FUND MOVEMENT · LIVE/OFF</p>
      </div>
    </article>
  );
}

function StrategyOneActionTimePreflightPanel({
  preview,
  latestRun,
  loading,
  refreshing,
  running,
  acknowledged,
  error,
  onAcknowledgedChange,
  onRefresh,
  onRun,
}: {
  preview: StrategyOnePilotPreviewReport | null;
  latestRun: StrategyOnePilotPreflightRunReport | null;
  loading: boolean;
  refreshing: boolean;
  running: boolean;
  acknowledged: boolean;
  error: Error | null;
  onAcknowledgedChange: (checked: boolean) => void;
  onRefresh: () => void;
  onRun: () => void;
}) {
  const candidate = preview?.selected ?? null;
  const canRun = preview?.state === "READY_FOR_OPERATOR_PREFLIGHT" &&
    candidate?.readyForOperatorPreflight === true && acknowledged && !running;

  return (
    <article className="overflow-hidden rounded-2xl border border-border-default bg-panel">
      <PanelHeader
        icon={<ShieldCheck className="size-4" />}
        eyebrow="V92 ACTION-TIME PILOT GATE"
        title="Fresh opportunity → ₹100 Tiny-LIVE preflight"
        right={(
          <div className="flex items-center gap-2">
            <span className={`rounded-full border px-2.5 py-1 font-mono text-[9px] font-bold ${pilotPreviewStateTone(preview?.state ?? null)}`}>
              {preview?.state.replaceAll("_", " ") ?? (loading ? "LOADING" : "NO DATA")}
            </span>
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              aria-label="Refresh Strategy #1 pilot preview"
              className="grid size-8 place-items-center rounded-lg border border-border-default bg-panel-light text-text-muted transition hover:text-brand disabled:cursor-wait disabled:opacity-50"
            >
              <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
            </button>
          </div>
        )}
      />

      <div className="border-b border-border-default px-5 py-3 text-xs leading-5 text-text-muted">
        A route appears here only when a fresh EXECUTE opportunity matches durable credible history. Exact ₹100 sizing then reuses authenticated two-leg balances, exchange order rules, quantity normalization and post-stress depth/fee/slippage checks.
      </div>

      {preview ? (
        <>
          <div className="grid gap-px bg-border-default sm:grid-cols-2 xl:grid-cols-4">
            <ActivityMetric label="Fresh EXECUTE now" value={formatInteger(preview.evidence.currentFreshExecuteOpportunities)} detail={`Maximum age ${formatInteger(preview.maximumOpportunityAgeMs)} ms`} />
            <ActivityMetric label="Historical eligible routes" value={formatInteger(preview.evidence.historicalAdapterReadyRoutes)} detail="Credible + adapter-ready" />
            <ActivityMetric label="Current matches" value={formatInteger(preview.evidence.matchedCurrentRoutes)} detail={`${preview.evidence.fullyPreflightableMatches} fully preflightable`} tone={preview.evidence.fullyPreflightableMatches > 0 ? "positive" : "warning"} />
            <ActivityMetric label="Pilot inventory" value={`₹${formatInteger(preview.requestedCapitalPerLegInr)} + ₹${formatInteger(preview.requestedCapitalPerLegInr)}`} detail={`₹${formatInteger(preview.minimumTwoLegInventoryInr)} minimum across both legs`} tone="warning" />
          </div>

          {candidate ? (
            <div className="border-b border-border-default px-5 py-5">
              <div className="flex flex-wrap items-start justify-between gap-5">
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-brand">Current exact-lineage candidate</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-sm font-semibold text-text-primary">
                    <span className="font-mono">{candidate.market}</span>
                    <span className="capitalize">{candidate.buyExchange}</span>
                    <ArrowRight className="size-3 text-brand" />
                    <span className="capitalize">{candidate.sellExchange}</span>
                    <span className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[8px] text-text-muted">HISTORY #{candidate.historical.rank}</span>
                  </div>
                  <p className="mt-2 font-mono text-[10px] text-text-muted">
                    Opportunity {candidate.opportunityId} · age {formatInteger(candidate.ageMs)} ms · current net {candidate.currentNetProfitPercent >= 0 ? "+" : ""}{candidate.currentNetProfitPercent.toFixed(4)}%
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-x-7 gap-y-2 text-right sm:grid-cols-4">
                  <PlacementStat label="Historical settles" value={formatInteger(candidate.historical.uniqueSettlements)} />
                  <PlacementStat label="Funded size" value={candidate.funding.estimatedExecutableCapitalInr === null ? "NO SIZE" : `₹${formatNumber(candidate.funding.estimatedExecutableCapitalInr)}`} positive={candidate.funding.state === "FUNDED"} />
                  <PlacementStat label="Post-stress net" value={candidate.stress?.postStressNetProfitPercent === null || candidate.stress?.postStressNetProfitPercent === undefined ? "NO DATA" : `${candidate.stress.postStressNetProfitPercent >= 0 ? "+" : ""}${candidate.stress.postStressNetProfitPercent.toFixed(4)}%`} positive={candidate.stress?.status === "PASSED"} />
                  <PlacementStat label="Candidate" value={candidate.readyForOperatorPreflight ? "READY" : "BLOCKED"} positive={candidate.readyForOperatorPreflight} />
                </div>
              </div>

              <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                {candidate.checks.map((check) => (
                  <div key={check.key} className={`rounded-lg border p-3 ${check.state === "PASS" ? "border-emerald-400/20 bg-emerald-400/7" : "border-red-400/20 bg-red-400/7"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-mono text-[8px] font-bold text-text-muted">{check.key.replaceAll("_", " ")}</p>
                      <span className={`font-mono text-[8px] font-bold ${check.state === "PASS" ? "text-emerald-300" : "text-red-300"}`}>{check.state}</span>
                    </div>
                    <p className="mt-2 line-clamp-3 text-[10px] leading-4 text-text-muted">{check.reasons[0] ?? check.message}</p>
                  </div>
                ))}
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <PilotBalanceLeg title="BUY quote" leg={candidate.funding.buyFunding} />
                <PilotBalanceLeg title="SELL inventory" leg={candidate.funding.sellFunding} />
              </div>
            </div>
          ) : (
            <EmptyState title="No current historical intersection" detail={preview.blockers[0] ?? "Waiting for a fresh eligible Strategy #1 route."} />
          )}

          {preview.blockers.length > 0 ? (
            <div className="border-b border-border-default bg-amber-400/5 px-5 py-3">
              <p className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-amber-300">Current exact blocker</p>
              <p className="mt-1 text-xs leading-5 text-text-muted">{preview.blockers[0]}</p>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
            <label className="flex max-w-3xl cursor-pointer items-start gap-3 text-xs leading-5 text-text-muted">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(event) => onAcknowledgedChange(event.target.checked)}
                className="mt-1 size-4 rounded border-border-default bg-panel-light accent-emerald-400"
              />
              <span>I understand this runs a fresh eligibility check only. A PASS does not enable LIVE, reserve capital, move money, create a session or submit an exchange order.</span>
            </label>

            <button
              type="button"
              onClick={onRun}
              disabled={!canRun}
              className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-4 py-2.5 text-xs font-bold text-emerald-300 transition hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:border-border-default disabled:bg-panel-light disabled:text-text-muted"
            >
              {running ? "Running fresh preflight…" : "Run ₹100 preflight only"}
            </button>
          </div>
        </>
      ) : (
        <EmptyState title={loading ? "Loading action-time evidence" : "Pilot preview unavailable"} detail={error?.message ?? "The endpoint has not returned a truthful preview."} />
      )}

      {latestRun ? (
        <div className={`border-t px-5 py-4 ${latestRun.approvedForActivationReview ? "border-emerald-400/20 bg-emerald-400/7" : "border-red-400/20 bg-red-400/7"}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-text-muted">Latest explicit preflight</p>
              <p className={`mt-1 text-sm font-bold ${latestRun.approvedForActivationReview ? "text-emerald-300" : "text-red-300"}`}>{latestRun.decision.replaceAll("_", " ")}</p>
            </div>
            <span className="font-mono text-[9px] font-bold text-emerald-300">NO ORDER · NO RESERVATION · LIVE OFF</span>
          </div>
          <p className="mt-2 text-xs leading-5 text-text-muted">{latestRun.blockers[0] ?? "All core preflight gates passed for activation review only; explicit LIVE activation remains separate and disabled."}</p>
        </div>
      ) : null}

      {error && preview ? (
        <p className="border-t border-red-400/20 bg-red-400/7 px-5 py-3 text-xs text-red-300">Preflight request failed: {error.message}</p>
      ) : null}
    </article>
  );
}

function PilotBalanceLeg({title, leg}: {
  title: string;
  leg: PersonalBotFundingLeg;
}) {
  return (
    <div className="rounded-lg border border-border-default bg-panel-light/35 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-text-muted">{title}</p>
        <span className={`font-mono text-[9px] font-bold ${leg.sufficient ? "text-emerald-300" : "text-red-300"}`}>{leg.sufficient ? "SUFFICIENT" : "BLOCKED"}</span>
      </div>
      <p className="mt-2 font-mono text-xs font-bold text-text-primary">{leg.exchange.toUpperCase()} · {leg.asset ?? "NO ASSET"}</p>
      <p className="mt-1 font-mono text-[10px] text-text-muted">need {leg.requiredBalance === null ? "NO DATA" : formatNumber(leg.requiredBalance)} · have {leg.availableBalance === null ? "NO DATA" : formatNumber(leg.availableBalance)}</p>
    </div>
  );
}

function PlacementVenueTable({title, rows}: {
  title: string;
  rows: PersonalStrategyOneBotData["capitalPlacement"]["buyVenues"];
}) {
  return (
    <div className="min-w-0 p-5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-text-muted">{title}</p>
      <div className="mt-3 overflow-x-auto">
        <div className="min-w-[560px]">
          <div className="grid grid-cols-[.35fr_1fr_.65fr_.65fr_.75fr_.55fr] gap-3 border-b border-border-default pb-2 text-[9px] font-semibold uppercase tracking-[0.1em] text-text-muted">
            <span>Rank</span><span>Exchange</span><span>Settled</span><span>Share</span><span>Net P&amp;L</span><span>Adapter</span>
          </div>
          {rows.slice(0, 5).map((row) => (
            <div key={`${row.side}:${row.exchange}`} className="grid grid-cols-[.35fr_1fr_.65fr_.65fr_.75fr_.55fr] items-center gap-3 border-b border-border-default/70 py-2.5 text-xs last:border-0">
              <span className="font-mono font-bold text-text-muted">#{row.rank}</span>
              <div><p className="font-semibold capitalize text-text-primary">{row.exchange}</p><p className="mt-0.5 font-mono text-[9px] text-text-muted">{row.uniqueMarkets} markets · {row.confidence}</p></div>
              <span className="font-mono font-bold text-text-primary">{formatInteger(row.uniqueSettlements)}</span>
              <span className="font-mono text-text-muted">{row.settlementSharePercent.toFixed(1)}%</span>
              <span className={`font-mono font-bold ${row.realizedPnlInr >= 0 ? "text-emerald-300" : "text-red-300"}`}>{signedCurrency(row.realizedPnlInr)}</span>
              <span className={`font-mono text-[9px] font-bold ${row.liveAdapterRegistered ? "text-emerald-300" : "text-red-300"}`}>{row.liveAdapterRegistered ? "YES" : "NO"}</span>
            </div>
          ))}
          {rows.length === 0 ? <p className="py-6 text-center text-xs text-text-muted">NO DATA</p> : null}
        </div>
      </div>
    </div>
  );
}

function PlacementStat({label, value, positive}: {label: string; value: string; positive?: boolean}) {
  return <div><p className="text-[8px] uppercase tracking-[0.1em] text-text-muted">{label}</p><p className={`mt-1 font-mono text-xs font-bold ${positive === undefined ? "text-text-primary" : positive ? "text-emerald-300" : "text-red-300"}`}>{value}</p></div>;
}

function ConfidenceBadge({confidence}: {confidence: "LOW" | "MEDIUM" | "HIGH"}) {
  const tone = confidence === "HIGH"
    ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"
    : confidence === "MEDIUM"
      ? "border-amber-400/25 bg-amber-400/10 text-amber-300"
      : "border-slate-500/30 bg-slate-500/10 text-slate-300";
  return <span className={`w-fit rounded border px-1.5 py-0.5 font-mono text-[8px] font-bold ${tone}`}>{confidence}</span>;
}

function InventoryDeploymentPanel({plan}: {plan: PersonalStrategyOneBotData["inventoryPlan"]}) {
  const route = plan.recommendedRoute;
  return (
    <article className="overflow-hidden rounded-2xl border border-border-default bg-panel">
      <PanelHeader
        icon={<Route className="size-4" />}
        eyebrow="V87 INVENTORY DEPLOYMENT"
        title="Fund the best current Strategy #1 route"
        right={<span className={`rounded-full border px-2.5 py-1 font-mono text-[9px] font-bold ${inventoryPlanStatusTone(plan.recommendationStatus)}`}>{plan.recommendationStatus.replaceAll("_", " ")}</span>}
      />
      <div className="border-b border-border-default px-5 py-3 text-xs leading-5 text-text-muted">
        Ranked by modeled PAPER profit from current EXECUTE evidence. Advisory only: no transfer, withdrawal, balance mutation or LIVE order is initiated.
      </div>

      {route ? (
        <>
          <div className="grid gap-px bg-border-default lg:grid-cols-[1.1fr_.7fr_.7fr_1.25fr_1.25fr]">
            <div className="bg-panel px-5 py-4">
              <p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-text-muted">Priority #{route.rank}</p>
              <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-text-primary">
                <span className="font-mono">{route.market}</span>
                <span className="capitalize">{route.buyExchange}</span>
                <ArrowRight className="size-3 text-brand" />
                <span className="capitalize">{route.sellExchange}</span>
              </div>
            </div>
            <ActivityMetric label="Modeled PAPER P&L" value={route.modeledNetProfitInr === null ? "NO DATA" : signedCurrency(route.modeledNetProfitInr)} detail={`${route.modeledNetReturnPercent >= 0 ? "+" : ""}${route.modeledNetReturnPercent.toFixed(3)}% net`} tone={route.modeledNetProfitInr !== null && route.modeledNetProfitInr > 0 ? "positive" : "warning"} />
            <ActivityMetric label="Target quantity" value={route.targetQuantity === null ? "NO DATA" : formatNumber(route.targetQuantity)} detail={`${route.baseAsset ?? "base asset"} before funding cap`} />
            <InventoryRequirementCard requirement={route.requirements[0]} />
            <InventoryRequirementCard requirement={route.requirements[1]} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-default bg-panel-light/30 px-5 py-3 text-[10px]">
            <p className={route.fullySpecified ? "text-text-muted" : "text-amber-300"}>{route.blockers[0] ?? "Both authenticated wallet requirements are currently satisfied."}</p>
            <p className="font-mono font-bold text-emerald-300">NO AUTOMATIC FUND MOVEMENT</p>
          </div>
        </>
      ) : (
        <EmptyState
          title={plan.recommendationStatus === "NO_CURRENT_EXECUTE_ROUTE" ? "No EXECUTE route to fund right now" : "Inventory requirement is not fully specified"}
          detail={plan.recommendationStatus === "NO_CURRENT_EXECUTE_ROUTE" ? "The planner will rank the next fresh Strategy #1 EXECUTE route automatically." : "Refresh capability, conversion and authenticated balance evidence before positioning funds."}
        />
      )}

      {plan.alternatives.length > 0 ? (
        <div className="overflow-x-auto">
          <div className="min-w-[900px]">
            <div className="grid grid-cols-[.35fr_.9fr_1.25fr_.7fr_.75fr_1.4fr] gap-4 border-b border-border-default bg-panel-light/50 px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.11em] text-text-muted">
              <span>Rank</span><span>Market</span><span>Route</span><span>Modeled P&amp;L</span><span>Target</span><span>Primary requirement</span>
            </div>
            {plan.alternatives.slice(0, 5).map((alternative) => {
              const primaryRequirement = alternative.requirements.find((requirement) =>
                requirement.deficitAmount !== null && requirement.deficitAmount > 0) ?? alternative.requirements[0];
              return (
                <div key={alternative.opportunityId} className="grid grid-cols-[.35fr_.9fr_1.25fr_.7fr_.75fr_1.4fr] items-center gap-4 border-b border-border-default px-5 py-3 text-xs last:border-b-0">
                  <span className="font-mono font-bold text-text-muted">#{alternative.rank}</span>
                  <span className="font-mono font-bold text-text-primary">{alternative.market}</span>
                  <span className="capitalize text-text-primary">{alternative.buyExchange} <ArrowRight className="mx-1 inline size-3 text-brand" /> {alternative.sellExchange}</span>
                  <span className={`font-mono font-bold ${alternative.modeledNetProfitInr !== null && alternative.modeledNetProfitInr > 0 ? "text-emerald-300" : "text-text-muted"}`}>{alternative.modeledNetProfitInr === null ? "NO DATA" : signedCurrency(alternative.modeledNetProfitInr)}</span>
                  <span className="font-mono text-text-muted">{alternative.targetQuantity === null ? "NO DATA" : formatNumber(alternative.targetQuantity)}</span>
                  <span className="text-[10px] text-text-muted">{primaryRequirement.action}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </article>
  );
}

function InventoryRequirementCard({requirement}: {
  requirement: PersonalStrategyOneBotData["inventoryPlan"]["alternatives"][number]["requirements"][number];
}) {
  const availableLabel = requirement.availableAmount !== null
    ? formatNumber(requirement.availableAmount)
    : requirement.evidence === "SYNCHRONIZED_ASSET_OMITTED"
      ? "0 (omitted)"
      : "NO DATA";
  const deficit = requirement.deficitAmount;
  return (
    <div className="bg-panel px-5 py-4">
      <p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-text-muted">{requirement.side === "BUY_QUOTE" ? "BUY wallet" : "SELL inventory"} · <span className="capitalize">{requirement.exchange}</span></p>
      <p className={`mt-2 font-mono text-base font-bold ${deficit === 0 ? "text-emerald-300" : deficit === null ? "text-amber-300" : "text-red-300"}`}>{deficit === null ? "UNKNOWN" : `${formatNumber(deficit)} ${requirement.asset ?? "?"} short`}</p>
      <p className="mt-1 font-mono text-[9px] text-text-muted">have {availableLabel} · need {requirement.requiredAmount === null ? "NO DATA" : formatNumber(requirement.requiredAmount)} {requirement.asset ?? "?"}</p>
    </div>
  );
}

function FundingState({state}: {state: "FUNDED" | "REDUCED" | "BLOCKED"}) {
  const tone = state === "FUNDED"
    ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"
    : state === "REDUCED"
      ? "border-amber-400/25 bg-amber-400/10 text-amber-300"
      : "border-red-400/25 bg-red-400/10 text-red-300";
  return <span className={`w-fit rounded-full border px-2 py-1 font-mono text-[9px] font-bold ${tone}`}>{state}</span>;
}

function FundingAmount({leg}: {leg: PersonalStrategyOneBotData["funding"]["routes"][number]["buyFunding"]}) {
  return <div><p className={`font-mono font-bold ${leg.sufficient ? "text-emerald-300" : "text-red-300"}`}>{leg.availableBalance === null ? "NO DATA" : formatNumber(leg.availableBalance)} {leg.asset ?? "?"}</p><p className="mt-0.5 font-mono text-[9px] text-text-muted">need {leg.requiredBalance === null ? "—" : formatNumber(leg.requiredBalance)} · {leg.synchronizationStatus.replaceAll("_", " ")}</p></div>;
}

function HourlySuccessfulTradesPanel({performance}: {
  performance: PersonalStrategyOneBotData["performance"];
}) {
  return (
    <article className="overflow-hidden rounded-2xl border border-border-default bg-panel">
      <PanelHeader
        icon={<BarChart3 className="size-4" />}
        eyebrow="CLOCK-HOUR EXECUTION COUNT"
        title="Successful trades by IST hour"
        right={<span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 font-mono text-[9px] font-bold text-emerald-300">{performance.successfulToday} TODAY</span>}
      />
      <div className="border-b border-border-default px-5 py-3 text-xs text-text-muted">
        Fixed Asia/Kolkata (IST) buckets: 00:00–01:00 through 23:00–00:00. Only credible, closed Strategy #1 PAPER settlements are counted.
      </div>
      <div className="grid grid-cols-2 gap-px bg-border-default sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
        {performance.hourlySuccessfulTrades.map((bucket) => (
          <div
            key={bucket.hour}
            className={`px-4 py-3 ${bucket.current ? "bg-emerald-400/10 ring-1 ring-inset ring-emerald-400/30" : "bg-panel"}`}
          >
            <div className="flex items-center justify-between gap-2">
              <p className={`font-mono text-[9px] font-semibold ${bucket.current ? "text-emerald-300" : "text-text-muted"}`}>{bucket.label}</p>
              {bucket.current ? <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" /> : null}
            </div>
            <p className={`mt-2 font-mono text-xl font-bold ${bucket.current ? "text-emerald-300" : "text-text-primary"}`}>{formatInteger(bucket.successfulTrades)}</p>
            <p className="mt-0.5 text-[9px] text-text-muted">successful</p>
            <p className={`mt-1 font-mono text-[10px] font-bold ${bucket.realizedPnl > 0 ? "text-emerald-300" : bucket.realizedPnl < 0 ? "text-red-300" : "text-text-muted"}`}>
              {signedCurrency(bucket.realizedPnl)} net P&amp;L
            </p>
          </div>
        ))}
      </div>
    </article>
  );
}

function ActivityMetric({label, value, detail, tone = "default"}: {label: string; value: string; detail: string; tone?: "default" | "positive" | "negative" | "warning"}) {
  const valueTone = tone === "positive" ? "text-emerald-300" : tone === "negative" ? "text-red-300" : tone === "warning" ? "text-amber-300" : "text-text-primary";
  return <div className="bg-panel px-5 py-4"><p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-text-muted">{label}</p><p className={`mt-2 font-mono text-xl font-bold ${valueTone}`}>{value}</p><p className="mt-1 text-[10px] leading-4 text-text-muted">{detail}</p></div>;
}

function OpportunityConversionPanel({report}: {report: PersonalOpportunityConversion}) {
  const primary = report.primaryBottleneck;

  return (
    <article className="overflow-hidden rounded-2xl border border-border-default bg-panel">
      <PanelHeader
        icon={<Workflow className="size-4" />}
        eyebrow="V84 PERSONAL BOT CONVERSION"
        title="Opportunity → PAPER execution"
        right={<span className={`rounded-full border px-2.5 py-1 font-mono text-[9px] font-bold ${conversionStatusTone(report.status)}`}>{report.status.replaceAll("_", " ")}</span>}
      />

      <div className="border-b border-border-default p-5">
        <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-9">
          {report.stages.map((stage, index) => (
            <div key={stage.key} className="relative min-w-0">
              <div className={`h-full rounded-xl border px-3 py-3 ${conversionStageTone(stage.status)}`} title={stage.reason}>
                <div className="flex items-start justify-between gap-2">
                  <span className="font-mono text-xl font-bold text-text-primary">{formatInteger(stage.count)}</span>
                  <span className="font-mono text-[8px] font-bold">{stage.status.replaceAll("_", " ")}</span>
                </div>
                <p className="mt-2 min-h-8 text-[9px] font-semibold uppercase leading-4 tracking-[0.08em] text-text-muted">{stage.label}</p>
                <p className="mt-1 font-mono text-[8px] text-text-muted">{stage.scope.replaceAll("_", " ")}</p>
              </div>
              {index < report.stages.length - 1 ? <ArrowRight className="absolute -right-2.5 top-1/2 z-10 hidden size-3 -translate-y-1/2 text-slate-600 xl:block" /> : null}
            </div>
          ))}
        </div>
      </div>

      <div className="grid divide-y divide-border-default xl:grid-cols-[.9fr_1.1fr] xl:divide-x xl:divide-y-0">
        <div className="p-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-text-muted">Current primary bottleneck</p>
          {primary ? (
            <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/6 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-300" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-mono text-sm font-bold text-text-primary">{primary.label}</p>
                    <span className="rounded bg-black/15 px-1.5 py-0.5 font-mono text-[9px] text-amber-300">{primary.count} {primary.percentOfEvaluatedPairs === null ? "" : `· ${primary.percentOfEvaluatedPairs.toFixed(1)}%`}</span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-text-muted">{primary.reason}</p>
                  <p className="mt-2 text-xs font-semibold leading-5 text-amber-200">{report.nextAction}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-3 rounded-xl border border-emerald-400/20 bg-emerald-400/6 p-4 text-xs leading-5 text-emerald-200">No current blocking stage. {report.nextAction}</div>
          )}

          <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.13em] text-text-muted">Current scan rejection leaders</p>
          <div className="mt-2 space-y-2">
            {report.engineRejections.length > 0 ? report.engineRejections.slice(0, 5).map((item) => (
              <div key={`${item.stage}-${item.code}`} className="grid grid-cols-[1fr_auto] gap-3 rounded-lg border border-border-default bg-panel-light/35 px-3 py-2.5">
                <div className="min-w-0"><p className="truncate text-xs font-semibold text-text-primary">{item.label}</p><p className="mt-0.5 truncate font-mono text-[9px] text-text-muted">{item.stage} · {item.code}</p></div>
                <div className="text-right"><p className="font-mono text-xs font-bold text-text-primary">{formatInteger(item.count)}</p><p className="mt-0.5 font-mono text-[9px] text-text-muted">{item.percentOfEvaluatedPairs === null ? "NO RATIO" : `${item.percentOfEvaluatedPairs.toFixed(1)}%`}</p></div>
              </div>
            )) : <p className="rounded-lg border border-border-default bg-panel-light/35 px-3 py-4 text-xs text-text-muted">No current engine rejection evidence.</p>}
          </div>
        </div>

        <div className="min-w-0 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-text-muted">Current accepted candidate trace</p>
            <span className="font-mono text-[9px] text-text-muted">{report.snapshot.evaluatedPairs} EVALUATED · {report.snapshot.currentOpportunities} ACCEPTED · {report.snapshot.executeDecisions} EXECUTE</span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <ConversionFact
              label="Current profit leader"
              value={report.arbitration.currentLeaderCandidateKey ?? "NO MODELED ROUTE"}
              detail={report.arbitration.currentLeaderModeledNetProfitInr === null
                ? "Waiting for INR-sized economic evidence"
                : `${signedCurrency(report.arbitration.currentLeaderModeledNetProfitInr)} modeled on ₹${formatNumber(report.arbitration.currentLeaderModeledCapitalInr ?? 0)}`}
            />
            <ConversionFact
              label="Next PAPER winner"
              value={report.arbitration.paperWinnerCandidateKey ?? "NOT READY"}
              detail={`${report.arbitration.paperReady} ready · ${report.arbitration.admissionBlocked} quarantined`}
            />
            <ConversionFact
              label="Arbitration"
              value="Modeled ₹ profit first"
              detail="Full-depth economics; route history is tie-break only"
            />
          </div>
          {report.currentCandidates.length > 0 ? (
            <div className="mt-3 overflow-x-auto">
              <div className="min-w-[820px]">
                <div className="grid grid-cols-[1fr_1.15fr_.6fr_.8fr_.8fr_1.4fr] gap-3 border-b border-border-default pb-2 text-[9px] font-semibold uppercase tracking-[0.09em] text-text-muted"><span>Market</span><span>Route</span><span>Net</span><span>Modeled ₹</span><span>Stage</span><span>Exact reason</span></div>
                {report.currentCandidates.slice(0, 8).map((candidate) => (
                  <div key={candidate.opportunityId} className="grid grid-cols-[1fr_1.15fr_.6fr_.8fr_.8fr_1.4fr] items-center gap-3 border-b border-border-default/70 py-2.5 text-xs last:border-0">
                    <div><p className="font-mono font-bold text-text-primary">{candidate.market}</p><p className={`mt-0.5 font-mono text-[9px] ${candidate.decision === "EXECUTE" ? "text-emerald-300" : "text-amber-300"}`}>{candidate.decision}</p></div>
                    <div className="min-w-0"><p className="truncate font-semibold capitalize text-text-primary">{candidate.buyExchange} → {candidate.sellExchange}</p><p className={`mt-0.5 font-mono text-[8px] ${candidate.paperAdmissionAllowed ? "text-emerald-300" : "text-red-300"}`}>{candidate.routeProfitState} · {candidate.routeSampleTrades} samples</p></div>
                    <p className={`font-mono font-bold ${candidate.netProfitPercent > 0 ? "text-emerald-300" : "text-red-300"}`}>{candidate.netProfitPercent.toFixed(3)}%</p>
                    <div><p className={`font-mono font-bold ${candidate.modeledNetProfitInr !== null && candidate.modeledNetProfitInr > 0 ? "text-emerald-300" : "text-text-muted"}`}>{candidate.modeledNetProfitInr === null ? "NO DATA" : signedCurrency(candidate.modeledNetProfitInr)}</p><p className="mt-0.5 font-mono text-[8px] text-text-muted">{candidate.economicEvidence.replaceAll("_", " ")}</p></div>
                    <div><p className="font-mono text-[9px] font-bold text-brand">{candidate.currentStage.replaceAll("_", " ")}</p><p className="mt-0.5 font-mono text-[8px] text-text-muted">{candidate.qualificationStatus}</p></div>
                    <p className="line-clamp-2 text-[10px] leading-4 text-text-muted" title={candidate.reason}>{candidate.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-3 rounded-xl border border-border-default bg-panel-light/30 px-4 py-7 text-center">
              <p className="text-sm font-semibold text-text-primary">No engine-accepted route in this scan</p>
              <p className="mt-1 text-xs text-text-muted">The rejection leaders on the left explain the current conversion loss. Nothing is fabricated to fill this table.</p>
            </div>
          )}

          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <ConversionFact label="Recent PAPER" value={`${report.recentPaper.executed} executed / ${report.recentPaper.rejected} rejected`} />
            <ConversionFact label="Owner" value={`${report.recentPaper.orchestratorMode} · ${report.recentPaper.orchestratorStatus ?? "NO CYCLE"}`} />
            <ConversionFact label="Profit cohort" value={`${report.postGuard.taggedSettlements}/${report.postGuard.targetSettlements} tagged`} />
          </div>
        </div>
      </div>
    </article>
  );
}

function ConversionFact({label, value, detail}: {label: string; value: string; detail?: string}) {
  return <div className="rounded-lg border border-border-default bg-panel-light/35 px-3 py-2.5"><p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-text-muted">{label}</p><p className="mt-1 truncate font-mono text-[10px] font-bold text-text-primary" title={value}>{value}</p>{detail ? <p className="mt-1 truncate text-[9px] text-text-muted" title={detail}>{detail}</p> : null}</div>;
}

function conversionStageTone(status: PersonalOpportunityConversionStageStatus): string {
  if (status === "PASSED") return "border-emerald-400/20 bg-emerald-400/6 text-emerald-300";
  if (status === "BLOCKED") return "border-red-400/20 bg-red-400/6 text-red-300";
  if (status === "WAITING") return "border-amber-400/20 bg-amber-400/6 text-amber-300";
  return "border-border-default bg-panel-light/25 text-slate-500";
}

function conversionStatusTone(status: PersonalOpportunityConversion["status"]): string {
  if (status === "COLLECTING_POST_GUARD" || status === "READY_FOR_PAPER") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-300";
  if (status === "PAPER_REJECTED" || status === "QUALIFICATION_BLOCKED") return "border-red-400/25 bg-red-400/10 text-red-300";
  return "border-amber-400/25 bg-amber-400/10 text-amber-300";
}

function ProfitValidationPanel({report}: {report: PostGuardProfitValidation}) {
  const targetProgress = Math.min(100, (report.overall.trades / report.targetValidationTrades) * 100);
  const metric = report.overall;

  return (
    <article className="overflow-hidden rounded-2xl border border-border-default bg-panel">
      <PanelHeader
        icon={<BarChart3 className="size-4" />}
        eyebrow="POST-GUARD PROFIT TRUTH"
        title="Profit validation ledger"
        right={(
          <span className={`rounded-full border px-2.5 py-1 font-mono text-[9px] font-bold ${validationTone(report.validationStatus)}`}>
            {report.validationStatus.replaceAll("_", " ")}
          </span>
        )}
      />

      <div className="border-b border-border-default p-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <ValidationMetric label="Tagged sample" value={`${metric.trades}/${report.targetValidationTrades}`} detail={`${report.remainingMinimumTrades} to minimum review`} />
          <ValidationMetric label="Net expectancy / trade" value={metric.expectancyPerTrade === null ? "NO DATA" : signedNumber(metric.expectancyPerTrade)} detail={`${metric.wins} wins · ${metric.losses} losses`} tone={metric.expectancyPerTrade === null ? "default" : metric.expectancyPerTrade > 0 ? "positive" : "negative"} />
          <ValidationMetric label="Profit factor" value={profitFactorLabel(metric.profitFactor, metric.profitFactorState)} detail={report.expectancyDecision.replaceAll("_", " ")} tone={metric.profitFactor !== null && metric.profitFactor <= 1 ? "negative" : "default"} />
          <ValidationMetric label="Maximum drawdown" value={formatNumber(metric.maximumDrawdown)} detail={`Net P&L ${signedNumber(metric.netPnl)}`} tone={metric.maximumDrawdown > 0 ? "warning" : "default"} />
          <ValidationMetric label="Fees / slippage" value={formatNumber(metric.totalFees)} detail={`Adverse slip ${metric.averageAdverseSlippagePercent === null ? "NO DATA" : `${metric.averageAdverseSlippagePercent.toFixed(4)}%`}`} />
        </div>

        <div className="mt-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-text-muted">
            <span>Credibility + final stress tagged PAPER settlements only</span>
            <span className="font-mono">MIN {report.minimumValidationTrades} · TARGET {report.targetValidationTrades} · {report.quarantinedRoutes} ROUTES QUARANTINED</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-panel-light">
            <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-amber-300 transition-all" style={{width: `${targetProgress}%`}} />
          </div>
        </div>
      </div>

      {report.routes.length === 0 ? (
        <div className="px-5 py-7 text-center">
          <p className="text-sm font-semibold text-text-primary">Waiting for the first post-guard PAPER settlement</p>
          <p className="mx-auto mt-1 max-w-2xl text-xs leading-5 text-text-muted">
            Existing partial-evidence trades stay visible above, but are deliberately excluded here. The cohort begins only when a settlement stores passed cross-venue credibility and final depth/fee stress evidence.
          </p>
        </div>
      ) : (
        <div className="grid divide-y divide-border-default xl:grid-cols-2 xl:divide-x xl:divide-y-0">
          <ProfitBreakdownTable title="Route profitability" rows={report.routes.slice(0, 8).map((route) => ({
            key: route.routeKey,
            label: `${route.buyExchange} → ${route.sellExchange}`,
            detail: route.market,
            trades: route.metrics.trades,
            expectancy: route.metrics.expectancyPerTrade,
            pnl: route.metrics.netPnl,
            state: route.state,
          }))} />
          <ProfitBreakdownTable title="Coin profitability" rows={report.markets.slice(0, 8).map((market) => ({
            key: market.market,
            label: market.market,
            detail: `${market.metrics.wins}W · ${market.metrics.losses}L`,
            trades: market.metrics.trades,
            expectancy: market.metrics.expectancyPerTrade,
            pnl: market.metrics.netPnl,
            state: null,
          }))} />
        </div>
      )}
    </article>
  );
}

function ValidationMetric({label, value, detail, tone = "default"}: {label: string; value: string; detail: string; tone?: "default" | "positive" | "negative" | "warning"}) {
  const valueTone = tone === "positive" ? "text-emerald-300" : tone === "negative" ? "text-red-300" : tone === "warning" ? "text-amber-300" : "text-text-primary";
  return <div className="rounded-xl border border-border-default bg-panel-light/40 px-4 py-3"><p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-text-muted">{label}</p><p className={`mt-2 font-mono text-lg font-bold ${valueTone}`}>{value}</p><p className="mt-1 truncate text-[10px] text-text-muted">{detail}</p></div>;
}

interface ProfitBreakdownRow {
  key: string;
  label: string;
  detail: string;
  trades: number;
  expectancy: number | null;
  pnl: number;
  state: PostGuardRouteState | null;
}

function ProfitBreakdownTable({title, rows}: {title: string; rows: ProfitBreakdownRow[]}) {
  return <div className="min-w-0 p-5"><p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-text-muted">{title}</p><div className="mt-3 overflow-x-auto"><div className="min-w-[510px]"><div className="grid grid-cols-[1.5fr_.5fr_.8fr_.8fr] gap-3 border-b border-border-default pb-2 text-[9px] font-semibold uppercase tracking-[0.1em] text-text-muted"><span>Market / lane</span><span>Trades</span><span>Expectancy</span><span>Net P&amp;L</span></div>{rows.map((row) => <div key={row.key} className="grid grid-cols-[1.5fr_.5fr_.8fr_.8fr] items-center gap-3 border-b border-border-default/70 py-2.5 text-xs last:border-0"><div className="min-w-0"><p className="truncate font-semibold capitalize text-text-primary">{row.label}</p><div className="mt-0.5 flex items-center gap-2"><span className="font-mono text-[9px] text-text-muted">{row.detail}</span>{row.state ? <span className={`rounded px-1.5 py-0.5 font-mono text-[8px] font-bold ${routeStateTone(row.state)}`}>{row.state.replaceAll("_", " ")}</span> : null}</div></div><span className="font-mono text-text-primary">{row.trades}</span><span className={`font-mono font-bold ${row.expectancy !== null && row.expectancy < 0 ? "text-red-300" : "text-emerald-300"}`}>{row.expectancy === null ? "NO DATA" : signedNumber(row.expectancy)}</span><span className={`font-mono font-bold ${row.pnl < 0 ? "text-red-300" : "text-emerald-300"}`}>{signedNumber(row.pnl)}</span></div>)}</div></div></div>;
}

function validationTone(status: PostGuardProfitValidation["validationStatus"]): string {
  if (status === "SAMPLE_COMPLETE") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-300";
  if (status === "NO_DATA") return "border-slate-500/30 bg-slate-500/10 text-slate-300";
  return "border-amber-400/25 bg-amber-400/10 text-amber-300";
}

function routeStateTone(state: PostGuardRouteState): string {
  if (state === "ELIGIBLE") return "bg-emerald-400/10 text-emerald-300";
  if (state === "QUARANTINED") return "bg-red-400/10 text-red-300";
  return "bg-amber-400/10 text-amber-300";
}

function profitFactorLabel(value: number | null, state: PostGuardProfitValidation["overall"]["profitFactorState"]): string {
  if (state === "NO_LOSSES") return "NO LOSSES";
  return value === null ? "NO DATA" : value.toFixed(3);
}

function OpportunityRow({opportunity}: {opportunity: PersonalBotOpportunity}) {
  const accepted = opportunity.funding?.state !== "BLOCKED" && opportunity.funding !== null;
  return <div className="grid grid-cols-[1fr_auto] items-center gap-4 px-5 py-3.5 transition hover:bg-panel-light/35 sm:grid-cols-[1fr_1.3fr_.7fr_.65fr]">
    <div><p className="font-mono text-sm font-bold text-text-primary">{opportunity.market}</p><p className="mt-0.5 text-[10px] text-text-muted">score {opportunity.score} · {timeAgo(opportunity.observedAt)}</p></div>
    <div className="hidden items-center gap-2 sm:flex"><span className="text-xs font-semibold capitalize text-text-primary">{opportunity.buyExchange}</span><ArrowRight className="size-3.5 text-brand"/><span className="text-xs font-semibold capitalize text-text-primary">{opportunity.sellExchange}</span></div>
    <div className="hidden sm:block"><p className={`font-mono text-sm font-bold ${opportunity.netProfitPercent > 0 ? "text-emerald-300" : "text-red-300"}`}>{opportunity.netProfitPercent >= 0 ? "+" : ""}{opportunity.netProfitPercent.toFixed(3)}%</p><p className="text-[10px] text-text-muted">{opportunity.modeledNetProfitInr === null ? "NO SIZED P&L" : `${signedCurrency(opportunity.modeledNetProfitInr)} est.`}</p></div>
    <span className={`justify-self-end rounded-full border px-2.5 py-1 font-mono text-[9px] font-bold ${accepted ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300" : "border-amber-400/20 bg-amber-400/8 text-amber-300"}`}>{opportunity.funding?.state ?? opportunity.decision}</span>
  </div>;
}

function ExecutionRow({execution}: {execution: PersonalBotExecution}) {
  return <div className="grid grid-cols-[1.1fr_1.35fr_1fr_.8fr_.8fr_1fr_.8fr_.8fr] items-center gap-4 border-b border-border-default px-5 py-3.5 text-xs last:border-b-0 hover:bg-panel-light/25">
    <div className="flex items-center gap-2.5"><CoinMark symbol={execution.baseAsset}/><div><p className="font-mono font-bold text-text-primary">{execution.baseAsset}/{execution.quoteAsset}</p><p className="mt-0.5 text-[9px] text-text-muted">Cross-Exchange Arbitrage</p></div></div>
    <div className="flex items-center gap-2"><span className="font-semibold capitalize text-text-primary">{execution.buyExchange}</span><ArrowRight className="size-3 text-brand"/><span className="font-semibold capitalize text-text-primary">{execution.sellExchange}</span></div>
    <span className="font-mono text-text-muted">{formatNumber(execution.quantity)}</span>
    <span className="font-mono text-text-primary">{formatNumber(execution.buyPrice)}</span>
    <span className="font-mono text-text-primary">{formatNumber(execution.sellPrice)}</span>
    <div><p className="font-mono text-text-primary">{formatNumber(execution.fees)} fees</p><p className="mt-0.5 font-mono text-[9px] text-amber-300">{formatNumber(execution.tdsWithheld)} TDS</p></div>
    <div><p className={`font-mono font-bold ${execution.pnl >= 0 ? "text-emerald-300" : "text-red-300"}`}>{signedNumber(execution.pnl)}</p><p className="text-[9px] text-text-muted">{execution.pnlPercent >= 0 ? "+" : ""}{execution.pnlPercent.toFixed(3)}%</p></div>
    <div><p className="text-text-primary">{formatTime(execution.completedAt ?? execution.executedAt)}</p><p className="mt-0.5 font-mono text-[9px] text-emerald-300">PAPER · CLOSED</p></div>
  </div>;
}

function ExcludedExecutionRow({execution}: {execution: PersonalBotExcludedExecution}) {
  return <div className="grid grid-cols-[1fr_1.35fr_.75fr_.8fr_.8fr_1fr_.95fr_1.6fr_.75fr] items-center gap-4 border-b border-border-default px-5 py-3.5 text-xs last:border-b-0 hover:bg-red-400/5">
    <div className="flex items-center gap-2.5"><CoinMark symbol={execution.baseAsset}/><div><p className="font-mono font-bold text-text-primary">{execution.baseAsset}/{execution.quoteAsset}</p><p className="mt-0.5 font-mono text-[9px] text-red-300">EXCLUDED</p></div></div>
    <div className="flex items-center gap-2"><span className="font-semibold capitalize text-text-primary">{execution.buyExchange}</span><ArrowRight className="size-3 text-red-300"/><span className="font-semibold capitalize text-text-primary">{execution.sellExchange}</span></div>
    <span className="font-mono text-text-muted">{formatNumber(execution.quantity)}</span>
    <span className="font-mono text-text-primary">{formatNumber(execution.buyPrice)}</span>
    <span className="font-mono text-text-primary">{formatNumber(execution.sellPrice)}</span>
    <div><p className="font-mono font-bold text-red-300">{execution.priceRatio === null ? "INVALID" : `${execution.priceRatio.toFixed(4)}x`}</p><p className="mt-0.5 font-mono text-[9px] text-text-muted">limit {execution.maximumCrediblePriceRatio.toFixed(4)}x{execution.ratioExcessPercent === null ? "" : ` · +${execution.ratioExcessPercent.toFixed(1)}%`}</p></div>
    <div><p className="font-mono font-bold text-amber-300">{signedNumber(execution.reportedPnl)}</p><p className="mt-0.5 font-mono text-[9px] text-red-300">NOT COUNTED</p></div>
    <div title={execution.reason}><p className="font-mono text-[9px] font-bold text-red-300">{execution.failureCode.replaceAll("_", " ")}</p><p className="mt-1 line-clamp-2 text-[10px] leading-4 text-text-muted">{execution.reason}</p></div>
    <div><p className="text-text-primary">{formatTime(execution.completedAt)}</p><p className="mt-0.5 font-mono text-[9px] text-text-muted">PAPER AUDIT</p></div>
  </div>;
}

function CoinMark({symbol}: {symbol: string}) {
  return <span className="grid size-9 shrink-0 place-items-center rounded-full border border-amber-300/20 bg-gradient-to-br from-amber-300/20 to-emerald-300/10 font-mono text-[10px] font-bold text-amber-200">{symbol.slice(0, 3)}</span>;
}

function ExchangeName({name, action}: {name: string; action: string}) {
  return <div className="min-w-0 flex-1"><p className="text-[9px] font-bold tracking-[0.13em] text-slate-500">{action}</p><p className="truncate text-sm font-semibold capitalize text-white">{name}</p></div>;
}

function CompactStat({label, value, positive}: {label: string; value: string; positive?: boolean}) {
  return <div><p className="text-[9px] uppercase tracking-[0.11em] text-text-muted">{label}</p><p className={`mt-1 truncate font-mono text-xs font-bold ${positive === undefined ? "text-text-primary" : positive ? "text-emerald-300" : "text-red-300"}`}>{value}</p></div>;
}

function LivePill({active, label}: {active: boolean; label: string}) {
  return <span className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/8 px-2.5 py-1 font-mono text-[10px] text-emerald-300"><span className={`size-1.5 rounded-full bg-emerald-400 ${active ? "animate-pulse" : ""}`}/>{label}</span>;
}

function EmptyState({title, detail}: {title: string; detail: string}) {
  return <div className="px-5 py-10 text-center"><Coins className="mx-auto size-6 text-text-muted"/><p className="mt-3 text-sm font-semibold text-text-primary">{title}</p><p className="mx-auto mt-1 max-w-md text-xs leading-5 text-text-muted">{detail}</p></div>;
}

function SafetyFact({icon, label, value, passed}: {icon: React.ReactNode; label: string; value: string; passed: boolean}) {
  return <div className="flex items-center gap-3 rounded-xl border border-border-default bg-panel px-4 py-3"><span className={passed ? "text-emerald-300" : "text-red-300"}>{icon}</span><div><p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-text-muted">{label}</p><p className="mt-1 text-xs font-semibold text-text-primary">{value}</p></div></div>;
}

function stateAppearance(state: PersonalStrategyOneBotState): {label: string; text: string; surface: string} {
  if (state === "READY_TO_EXECUTE_PAPER") return {label: "READY TO EXECUTE", text: "text-emerald-300", surface: "border-emerald-400/20 bg-emerald-400/8"};
  if (state === "PAUSED") return {label: "PAUSED", text: "text-slate-300", surface: "border-slate-600 bg-slate-800/60"};
  if (state === "BLOCKED") return {label: "BLOCKED", text: "text-red-300", surface: "border-red-400/20 bg-red-400/8"};
  return {label: state.replaceAll("_", " "), text: "text-amber-300", surface: "border-amber-400/20 bg-amber-400/8"};
}

function inventoryPlanStatusTone(status: PersonalStrategyOneBotData["inventoryPlan"]["recommendationStatus"]): string {
  if (status === "READY") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-300";
  if (status === "FUNDING_REQUIRED") return "border-amber-400/25 bg-amber-400/10 text-amber-300";
  if (status === "EVIDENCE_INCOMPLETE") return "border-red-400/25 bg-red-400/10 text-red-300";
  return "border-border-default bg-panel-light text-text-muted";
}

function capitalPlacementStateTone(status: PersonalStrategyOneBotData["capitalPlacement"]["pilot"]["state"]): string {
  if (status === "CANDIDATE_FOR_PREFLIGHT") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-300";
  if (status === "COLLECTING") return "border-amber-400/25 bg-amber-400/10 text-amber-300";
  if (status === "NO_ADAPTER_READY_ROUTE") return "border-red-400/25 bg-red-400/10 text-red-300";
  return "border-border-default bg-panel-light text-text-muted";
}

function pilotPreviewStateTone(status: StrategyOnePilotPreviewReport["state"] | null): string {
  if (status === "READY_FOR_OPERATOR_PREFLIGHT") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-300";
  if (status === "BLOCKED_CURRENT_EVIDENCE") return "border-red-400/25 bg-red-400/10 text-red-300";
  if (status?.startsWith("WAITING")) return "border-amber-400/25 bg-amber-400/10 text-amber-300";
  return "border-border-default bg-panel-light text-text-muted";
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-IN", {maximumFractionDigits: 6}).format(value);
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat("en-IN", {maximumFractionDigits: 0}).format(value);
}

function signedNumber(value: number): string {
  return `${value >= 0 ? "+" : ""}${formatNumber(value)}`;
}

function signedCurrency(value: number): string {
  const absoluteValue = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(value));
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}₹${absoluteValue}`;
}

function formatWholeRupees(value: number): string {
  const sign = value < 0 ? "-" : "";
  return `${sign}₹${formatInteger(Math.abs(value))}`;
}

function signedWholeRupees(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}₹${formatInteger(Math.abs(value))}`;
}

function formatTime(value: number): string {
  return new Intl.DateTimeFormat("en-IN", {hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false}).format(value);
}

function timeAgo(value: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - value) / 1_000));
  if (seconds < 5) return "now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}
