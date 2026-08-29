import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bot,
  CheckCircle2,
  CircleDollarSign,
  Coins,
  Database,
  Maximize2,
  Power,
  Radio,
  RefreshCw,
  Route,
  ShieldCheck,
  Target,
  TrendingUp,
  WalletCards,
  Workflow,
  X,
  Zap,
} from "lucide-react";

import {
  useEffect,
  useState,
} from "react";

import {
  usePersonalBotControl,
  usePersonalStrategyOneBot,
} from "@/modules/strategies/hooks/useStrategies";

import {
  useStrategyOneTwoLegRecovery,
} from "@/modules/recovery/hooks/useRecoveryDiagnostics";

import type {
  StrategyOneTwoLegRecoveryData,
} from "@/modules/recovery/types/RecoveryDiagnostics";

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
  useActivateStrategyOneTinyLiveAccountLease,
  useArmStrategyOneTinyLive,
  useClearRecoveredStrategyOneTinyLiveEmergencyStop,
  useDisarmStrategyOneTinyLive,
  useRestoreStrategyOnePaperAccountMode,
  useRunStrategyOnePilotPreflight,
  useStrategyOnePilotPreview,
  useStrategyOneTinyLiveOpportunityAudit,
  useStrategyOneTinyLivePreArm,
} from "@/modules/tiny-live/hooks/useTinyLivePreflight";

import type {
  StrategyOnePilotPreflightRunReport,
  StrategyOnePilotCandidate,
  StrategyOnePilotPreviewReport,
  StrategyOneTinyLiveOpportunityAuditReport,
  StrategyOneTinyLiveAttemptCount,
  StrategyOneTinyLiveEmergencyStopRecoveryDiagnostics,
  StrategyOneTinyLivePreArmDiagnostics,
} from "@/modules/tiny-live/types/TinyLivePreflight";

interface StrategyOnePreArmRoute {
  market: string;
  buyExchange: "binance" | "bybit" | "coindcx";
  sellExchange: "binance" | "bybit" | "coindcx";
}

export default function BotDashboard() {
  const [pilotAcknowledged, setPilotAcknowledged] = useState(false);
  const [preArmAcknowledged, setPreArmAcknowledged] = useState(false);
  const [leaseConfirmation, setLeaseConfirmation] = useState("");
  const [modeTransition, setModeTransition] = useState<SimpleOperatingMode | null>(null);
  const [modeTransitionError, setModeTransitionError] = useState<string | null>(null);
  const [modeTransitionNotice, setModeTransitionNotice] = useState<string | null>(null);
  const [liveConfirmationOpen, setLiveConfirmationOpen] = useState(false);
  const [viewMode, setViewMode] = useState<BotViewMode>("FOCUS");
  const [missionOpen, setMissionOpen] = useState(false);
  const deepAuditEnabled = viewMode === "DEEP_AUDIT";
  const query = usePersonalStrategyOneBot();
  const control = usePersonalBotControl();
  const pilotQuery = useStrategyOnePilotPreview(deepAuditEnabled);
  const pilotPreflight = useRunStrategyOnePilotPreflight();
  // This lightweight authority snapshot is the single source of truth for the
  // global PAPER / Tiny-LIVE selector, so it must remain available in every view.
  const preArmQuery = useStrategyOneTinyLivePreArm(true);
  const opportunityAuditQuery = useStrategyOneTinyLiveOpportunityAudit(deepAuditEnabled);
  const twoLegRecoveryQuery = useStrategyOneTwoLegRecovery(deepAuditEnabled);
  const armPreArm = useArmStrategyOneTinyLive();
  const disarmPreArm = useDisarmStrategyOneTinyLive();
  const activateAccountLease = useActivateStrategyOneTinyLiveAccountLease();
  const clearRecoveredEmergencyStop = useClearRecoveredStrategyOneTinyLiveEmergencyStop();
  const restorePaperAccountMode = useRestoreStrategyOnePaperAccountMode();
  const report = query.data?.data;
  const pilotPreview = pilotQuery.data?.data ?? null;
  const preArmDiagnostics = preArmQuery.data?.data ?? null;
  const tinyLiveStatus = tinyLiveAuthorityStatus(preArmDiagnostics);
  const routePoolArmAttempts =
    preArmDiagnostics?.dailyAttemptBudget.routePoolArmAttempts ?? null;

  useEffect(() => {
    if (!missionOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMissionOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [missionOpen]);

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
  const currentPilotRoute = (pilotPreview?.evidence.fullyPreflightableMatches ?? 0) > 0 &&
    pilotPreview?.selected && isSupportedPreArmRoute(pilotPreview.selected)
    ? pilotPreview.selected
    : null;
  const suggestedPreArmRoute = toPreArmRoute(currentPilotRoute);
  const preArmCapitalPerLegInr = preArmDiagnostics?.routePool?.capitalPerLegInr ??
    pilotPreview?.requestedCapitalPerLegInr ??
    report.capitalPlacement.pilot.requestedPerLegInr;

  const activePreArm = preArmDiagnostics?.activeArm ?? null;
  const activeAccountLease = preArmDiagnostics?.accountModeLease.activeLease ?? null;
  const tinyLiveActive = preArmDiagnostics?.accountModeLease.accountMode === "LIVE" &&
    activeAccountLease?.state === "ACTIVE";
  const paperExecutionEnabled = report.control.enabled;
  const operatingMode: SimpleOperatingMode = tinyLiveActive
    ? "TINY_LIVE"
    : paperExecutionEnabled
      ? "PAPER"
      : "OFF";

  async function stopTinyLiveAuthority(): Promise<void> {
    if (activeAccountLease) {
      await restorePaperAccountMode.mutateAsync({
        leaseId: activeAccountLease.id,
        confirmation: activeAccountLease.requiredRestorePhrase,
      });
    }

    if (activePreArm) {
      await disarmPreArm.mutateAsync({
        preArmId: activePreArm.id,
        confirmation: `DISARM ${activePreArm.id}`,
      });
    }
  }

  function resetTinyLiveUiState(): void {
    setPreArmAcknowledged(false);
    setLeaseConfirmation("");
    setLiveConfirmationOpen(false);
    setModeTransitionError(null);
    setModeTransitionNotice(null);
    armPreArm.reset();
    disarmPreArm.reset();
    activateAccountLease.reset();
    restorePaperAccountMode.reset();
    clearRecoveredEmergencyStop.reset();
  }

  async function selectOperatingMode(target: SimpleOperatingMode): Promise<void> {
    if (modeTransition || target === operatingMode) return;

    setModeTransition(target);
    setModeTransitionError(null);

    try {
      if (target === "PAPER") {
        await stopTinyLiveAuthority();
        if (!paperExecutionEnabled) await control.mutateAsync(true);
        resetTinyLiveUiState();
        return;
      }

      if (target === "OFF") {
        await stopTinyLiveAuthority();
        if (paperExecutionEnabled) await control.mutateAsync(false);
        resetTinyLiveUiState();
        return;
      }

      const routePool = preArmDiagnostics?.routePool;
      if (!routePool) {
        throw new Error("Tiny-LIVE status abhi available nahi hai. Refresh karke dobara try karein.");
      }
      if (preArmDiagnostics.runtimeGateEnabled !== true) {
        throw new Error("Tiny-LIVE runtime AWS par enabled nahi hai. DEEP AUDIT mein exact runtime blocker dekhein.");
      }
      if (routePoolArmAttempts === null) {
        throw new Error(
          "Tiny-LIVE daily attempt cap exhausted hai; next IST reset ke baad arm karein.",
        );
      }

      // PAPER and LIVE execution are intentionally mutually exclusive.
      if (paperExecutionEnabled) await control.mutateAsync(false);

      let preArmId = activePreArm?.id ?? null;
      if (!preArmId) {
        const armResult = await armPreArm.mutateAsync({
          market: "DYNAMIC_POOL",
          buyExchange: "coindcx",
          sellExchange: "binance",
          durationMinutes: routePool.durationMinutes,
          maximumAttempts: routePoolArmAttempts,
          routePoolId: routePool.id,
          confirmation: routePoolArmPhrase(
            routePool.capitalPerLegInr,
            routePool.maximumCapitalPerLegInr,
            routePoolArmAttempts,
          ),
        });
        preArmId = armResult.data.id;
      }

      await activateAccountLease.mutateAsync({
        preArmId,
        confirmation: `ACTIVATE TINY-LIVE ACCOUNT LEASE ${preArmId}`,
      });
      setLiveConfirmationOpen(false);
    } catch (error) {
      setModeTransitionError(readRequestError(error));
      setViewMode("DEEP_AUDIT");
    } finally {
      setModeTransition(null);
    }
  }

  function requestOperatingMode(target: SimpleOperatingMode): void {
    if (target === "TINY_LIVE" && operatingMode !== "TINY_LIVE") {
      setModeTransitionError(null);
      setModeTransitionNotice(null);
      setLiveConfirmationOpen(true);
      return;
    }
    void selectOperatingMode(target);
  }

  async function clearRecoveredStop(): Promise<void> {
    const recovery = preArmDiagnostics?.emergencyStopRecovery;

    if (!recovery?.eligible || !recovery.requiredConfirmation) {
      setModeTransitionError(
        recovery?.blockers[0] ??
          "Recovered emergency-stop reset evidence abhi complete nahi hai.",
      );
      setLiveConfirmationOpen(false);
      return;
    }

    setModeTransitionError(null);
    setModeTransitionNotice(null);

    try {
      await clearRecoveredEmergencyStop.mutateAsync({
        confirmation: recovery.requiredConfirmation,
      });
      setLiveConfirmationOpen(false);
      setModeTransitionNotice(
        "Recovered emergency stop clear ho gaya. Tiny-LIVE start karne ke liye LIVE ko dobara confirm karein.",
      );
    } catch (error) {
      setModeTransitionError(readRequestError(error));
      setLiveConfirmationOpen(false);
      setViewMode("DEEP_AUDIT");
    }
  }

  function runPilotPreflight(): void {
    const candidate = pilotPreview?.selected;
    if (!candidate || !pilotAcknowledged || pilotPreflight.isPending) return;
    pilotPreflight.mutate({
      confirmationToken: "RUN_STRATEGY_ONE_PILOT_PREFLIGHT_ONLY",
      expectedOpportunityId: candidate.opportunityId,
    });
  }

  function armOneShot(): void {
    const routePool = preArmDiagnostics?.routePool;

    if (
      !routePool ||
      routePoolArmAttempts === null ||
      !preArmAcknowledged ||
      armPreArm.isPending
    ) {
      return;
    }

    armPreArm.mutate({
      market: "DYNAMIC_POOL",
      buyExchange: "coindcx",
      sellExchange: "binance",
      durationMinutes: routePool.durationMinutes,
      maximumAttempts: routePoolArmAttempts,
      routePoolId: routePool.id,
      confirmation: routePoolArmPhrase(
        routePool.capitalPerLegInr,
        routePool.maximumCapitalPerLegInr,
        routePoolArmAttempts,
      ),
    });
  }

  function disarmOneShot(): void {
    const active = preArmQuery.data?.data.activeArm;

    if (!active || disarmPreArm.isPending) {
      return;
    }

    disarmPreArm.mutate({
      preArmId: active.id,
      confirmation: `DISARM ${active.id}`,
    });
  }

  function activateTinyLiveLease(): void {
    const active = preArmQuery.data?.data.activeArm;
    const requiredPhrase = active
      ? `ACTIVATE TINY-LIVE ACCOUNT LEASE ${active.id}`
      : "";

    if (
      !active ||
      report?.control.enabled !== false ||
      leaseConfirmation !== requiredPhrase ||
      activateAccountLease.isPending
    ) {
      return;
    }

    activateAccountLease.mutate({
      preArmId: active.id,
      confirmation: leaseConfirmation,
    }, {
      onSuccess: () => setLeaseConfirmation(""),
    });
  }

  function restorePaperMode(): void {
    const lease = preArmQuery.data?.data.accountModeLease.activeLease;

    if (
      !lease ||
      leaseConfirmation !== lease.requiredRestorePhrase ||
      restorePaperAccountMode.isPending
    ) {
      return;
    }

    restorePaperAccountMode.mutate({
      leaseId: lease.id,
      confirmation: leaseConfirmation,
    }, {
      onSuccess: () => setLeaseConfirmation(""),
    });
  }

  return (
    <section className="space-y-5 pb-8">
      <div className="bot-command-hero relative overflow-hidden rounded-2xl border">
        <div className="pointer-events-none absolute -left-24 top-0 size-80 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -right-16 top-0 size-72 rounded-full bg-amber-500/10 blur-3xl" />

        <div className="bot-command-header relative border-b border-white/8 px-5 py-5 lg:px-7">
          <div className="flex flex-wrap items-center justify-between gap-5">
            <div className="bot-command-heading flex items-center gap-4">
              <div className="grid size-12 place-items-center rounded-xl border border-emerald-400/20 bg-emerald-400/10 text-emerald-300 shadow-[0_0_28px_rgba(52,211,153,.12)]">
                <Bot className="size-6" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-semibold tracking-tight text-white">CAT PRO BOT</h1>
                  <span className="rounded-full border border-cyan-300/20 bg-cyan-300/8 px-2.5 py-1 font-mono text-[10px] font-bold tracking-[0.12em] text-cyan-200">PAPER ANALYTICS</span>
                  <span className={`rounded-full border px-2.5 py-1 font-mono text-[10px] font-bold tracking-[0.12em] ${tinyLiveStatus.tone}`}>{tinyLiveStatus.label}</span>
                </div>
                <p className="mt-1 text-sm text-slate-400">One operational view for opportunities, execution, strategy and P&amp;L.</p>
              </div>
            </div>

            <div className="bot-command-controls flex items-center gap-3">
              <BotViewModeSwitch mode={viewMode} onChange={setViewMode} />
              <button
                type="button"
                onClick={() => setMissionOpen(true)}
                className="mission-launch-button flex items-center justify-center gap-2 rounded-xl border border-violet-300/25 bg-violet-400/8 px-3 py-2.5 font-mono text-[9px] font-bold tracking-[0.12em] text-violet-200 transition hover:border-violet-300/45 hover:bg-violet-400/14"
                aria-label="Open full-screen PAPER Mission Control"
              >
                <Maximize2 className="size-4" />
                <span>MISSION</span>
              </button>
              <div className={`hidden rounded-lg border px-3 py-2 text-right sm:block ${appearance.surface}`}>
                <p className="font-mono text-[10px] uppercase tracking-[0.13em] text-slate-400">Runtime</p>
                <p className={`mt-1 text-xs font-bold ${appearance.text}`}>{appearance.label}</p>
              </div>
              <SimpleOperatingModeControl
                mode={operatingMode}
                pending={modeTransition}
                onSelect={requestOperatingMode}
              />
            </div>
          </div>

          {modeTransitionError || control.isError ? (
            <p className="mt-3 rounded-lg border border-red-400/25 bg-red-400/10 px-3 py-2 text-xs text-red-300">
              Mode change blocked: {modeTransitionError ?? readRequestError(control.error)}
            </p>
          ) : null}
          {modeTransitionNotice ? (
            <p className="mt-3 rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-300">
              {modeTransitionNotice}
            </p>
          ) : null}
        </div>

        <div className="bot-command-metrics relative grid grid-cols-2 gap-px bg-white/8 xl:grid-cols-6">
          <HeroMetric icon={<CircleDollarSign />} label="Credible PAPER P&L" value={formatWholeRupees(report.performance.realizedPnl)} detail={`Today ${signedWholeRupees(report.performance.realizedPnlToday)}`} tone={report.performance.realizedPnl >= 0 ? "positive" : "negative"} />
          <HeroMetric icon={<Coins />} label="PAPER capital budget" value={`₹${formatInteger(report.paper.capitalBudgetInr)}`} detail={`₹${formatInteger(report.paper.minimumCapitalPerTrade)}–₹${formatInteger(report.paper.maximumCapitalPerTrade)} / trade`} />
          <HeroMetric
            icon={<Activity />}
            label={report.control.enabled ? "Successful PAPER trades / hour" : "PAPER closes this IST hour"}
            value={formatInteger(report.performance.successfulCurrentClockHour)}
            detail={report.control.enabled
              ? `${report.performance.currentClockHourLabel} · IST · automation ON`
              : `${report.performance.currentClockHourLabel} · settled before pause · automation OFF`}
            tone={report.control.enabled ? "positive" : "default"}
          />
          <HeroMetric icon={<CheckCircle2 />} label="Credible executions" value={formatInteger(report.performance.successfulExecutions)} detail={`${report.performance.excludedUncredibleExecutions} distorted fill${report.performance.excludedUncredibleExecutions === 1 ? "" : "s"} excluded`} tone="positive" />
          <HeroMetric icon={<TrendingUp />} label="Accepted settlement rate" value={report.performance.winRatePercent === null ? "NO DATA" : `${report.performance.winRatePercent.toFixed(1)}%`} detail={`${report.performance.winningExecutions} positive PAPER closes · not LIVE`} />
          <HeroMetric icon={<Zap />} label="Daily attempt safety cap" value={`${report.paper.dailyActivity.reservationAttempts}/${report.paper.maximumDailyTrades}`} detail={`${report.paper.dailyActivity.settledPaperExecutions} settled · ${report.paper.dailyActivity.remainingAttemptBudget} attempts remaining`} tone={report.paper.dailyActivity.remainingAttemptBudget === 0 ? "warning" : "default"} />
        </div>
      </div>

      {viewMode === "FOCUS" ? (
        <BotFocusCockpit report={report} latestExecution={latestExecution} feed={feed} diagnostics={preArmDiagnostics} />
      ) : viewMode === "CAPITAL_MANAGER" ? (
        <PersonalCapitalManagerView report={report} />
      ) : (
        <div className="bot-deep-audit space-y-5">
      <div className="rounded-xl border border-cyan-300/15 bg-cyan-300/[0.035] px-4 py-3 text-xs leading-5 text-text-muted">
        <strong className="font-mono text-cyan-200">ADVANCED AUDIT</strong>
        <span className="ml-2">Heavy Tiny-LIVE diagnostics poll only while this view is open. FOCUS and Capital Manager stay lightweight.</span>
      </div>

      <StrategyOnePreArmedOneShotPanel
        diagnostics={preArmDiagnostics}
        twoLegRecovery={twoLegRecoveryQuery.data?.data ?? null}
        candidate={currentPilotRoute}
        suggestedRoute={suggestedPreArmRoute}
        capitalPerLegInr={preArmCapitalPerLegInr}
        acknowledged={preArmAcknowledged}
        loading={preArmQuery.isPending}
        arming={armPreArm.isPending}
        disarming={disarmPreArm.isPending}
        paperBotEnabled={report.control.enabled}
        paperControlPending={control.isPending}
        leaseConfirmation={leaseConfirmation}
        activatingLease={activateAccountLease.isPending}
        restoringPaper={restorePaperAccountMode.isPending}
        error={preArmQuery.error ?? armPreArm.error ?? disarmPreArm.error ?? activateAccountLease.error ?? clearRecoveredEmergencyStop.error ?? restorePaperAccountMode.error ?? control.error}
        onAcknowledgedChange={setPreArmAcknowledged}
        onLeaseConfirmationChange={setLeaseConfirmation}
        onArm={armOneShot}
        onDisarm={disarmOneShot}
        onActivateLease={activateTinyLiveLease}
        onRestorePaper={restorePaperMode}
        onPaperControlChange={(enabled) => control.mutate(enabled)}
      />

      <StrategyOneTinyLiveOpportunityAuditPanel
        audit={opportunityAuditQuery.data?.data ?? null}
        loading={opportunityAuditQuery.isPending}
        error={opportunityAuditQuery.error}
        onRefresh={() => void opportunityAuditQuery.refetch()}
      />

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
          <PanelHeader icon={<Activity className="size-4" />} eyebrow="PAPER EXECUTION PULSE" title="Latest PAPER execution" right={<span className="font-mono text-[10px] text-text-muted">SIMULATED · AUTO REFRESH 5S</span>} />
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
                  <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 font-mono text-[10px] font-bold text-emerald-300">PAPER SUCCESS</span>
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
        <PanelHeader icon={<Route className="size-4" />} eyebrow="SIMULATED EXECUTION LEDGER" title="PAPER executed trades" right={<span className="rounded-full border border-border-default bg-panel-light px-2.5 py-1 font-mono text-[10px] text-text-muted">{report.recentExecutions.length} RECENT</span>} />
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
        <SafetyFact icon={<ShieldCheck />} label="PAPER ledger" value="SIMULATED · NOT REAL FILLS" passed />
        <SafetyFact icon={<Activity />} label="Market scanner" value={report.control.scannerActive ? "Active while BOT is ON or OFF" : "Unavailable"} passed={report.control.scannerActive} />
        <SafetyFact icon={<Power />} label="Tiny-LIVE authority" value={tinyLiveStatus.label} passed={preArmDiagnostics?.activeArm === null} />
      </div>
        </div>
      )}

      {missionOpen ? (
        <MissionControlOverlay
          report={report}
          execution={latestExecution}
          feed={feed}
          onClose={() => setMissionOpen(false)}
        />
      ) : null}

      {liveConfirmationOpen ? (
        <TinyLiveModeConfirmation
          capitalPerLegInr={preArmDiagnostics?.routePool?.capitalPerLegInr ?? 500}
          maximumAttempts={routePoolArmAttempts ??
            preArmDiagnostics?.dailyAttemptBudget.remainingDailyAttempts ?? 0}
          durationMinutes={preArmDiagnostics?.routePool?.durationMinutes ?? 180}
          emergencyStopRecovery={preArmDiagnostics?.emergencyStopRecovery ?? null}
          pending={modeTransition === "TINY_LIVE" || clearRecoveredEmergencyStop.isPending}
          onCancel={() => setLiveConfirmationOpen(false)}
          onConfirm={() => preArmDiagnostics?.emergencyStopRecovery.active
            ? void clearRecoveredStop()
            : void selectOperatingMode("TINY_LIVE")}
        />
      ) : null}
    </section>
  );
}

type SimpleOperatingMode = "OFF" | "PAPER" | "TINY_LIVE";
type BotViewMode = "FOCUS" | "CAPITAL_MANAGER" | "DEEP_AUDIT";

function SimpleOperatingModeControl({
  mode,
  pending,
  onSelect,
}: {
  mode: SimpleOperatingMode;
  pending: SimpleOperatingMode | null;
  onSelect: (mode: SimpleOperatingMode) => void;
}) {
  return (
    <div className="rounded-xl border border-emerald-300/20 bg-black/35 p-1.5" aria-label="CAT PRO operating mode">
      <p className="px-1 pb-1.5 font-mono text-[8px] font-bold tracking-[0.16em] text-emerald-200/65">OPERATING MODE</p>
      <div className="flex items-center gap-1">
        {(["OFF", "PAPER", "TINY_LIVE"] as const).map((option) => {
          const selected = mode === option;
          const busy = pending === option;
          const label = option === "TINY_LIVE" ? "LIVE" : option;
          return (
            <button
              key={option}
              type="button"
              aria-pressed={selected}
              disabled={pending !== null}
              onClick={() => onSelect(option)}
              className={`flex min-w-16 items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2 font-mono text-[9px] font-bold tracking-[0.1em] transition disabled:cursor-wait disabled:opacity-60 ${
                selected
                  ? option === "TINY_LIVE"
                    ? "border-amber-300/45 bg-amber-300/14 text-amber-200 shadow-[0_0_18px_rgba(252,211,77,.14)]"
                    : option === "PAPER"
                      ? "border-emerald-300/45 bg-emerald-300/14 text-emerald-200 shadow-[0_0_18px_rgba(52,211,153,.14)]"
                      : "border-slate-500/50 bg-slate-600/20 text-slate-200"
                  : "border-transparent text-slate-500 hover:border-emerald-300/20 hover:text-emerald-200"
              }`}
            >
              {busy ? <RefreshCw className="size-3 animate-spin" /> : selected ? <Power className="size-3" /> : null}
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TinyLiveModeConfirmation({
  capitalPerLegInr,
  maximumAttempts,
  durationMinutes,
  emergencyStopRecovery,
  pending,
  onCancel,
  onConfirm,
}: {
  capitalPerLegInr: number;
  maximumAttempts: number;
  durationMinutes: number;
  emergencyStopRecovery: StrategyOneTinyLiveEmergencyStopRecoveryDiagnostics | null;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const recoveringStop =
    emergencyStopRecovery?.active ===
      true;
  const resetEligible =
    emergencyStopRecovery?.eligible ===
      true;

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/80 px-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="tiny-live-mode-title">
      <article className="w-full max-w-lg overflow-hidden rounded-2xl border border-amber-300/35 bg-[#030b08] shadow-[0_0_70px_rgba(251,191,36,.13)]">
        <div className="flex items-start justify-between gap-4 border-b border-amber-300/15 px-5 py-4">
          <div>
            <p className="font-mono text-[9px] font-bold tracking-[0.16em] text-amber-300">{recoveringStop ? "RECOVERED FAIL-CLOSED STOP" : "REAL ORDER MODE"}</p>
            <h2 id="tiny-live-mode-title" className="mt-1 text-lg font-semibold text-white">{recoveringStop ? "Clear recovered emergency stop?" : "Turn Tiny-LIVE ON?"}</h2>
          </div>
          <button type="button" onClick={onCancel} disabled={pending} className="rounded-lg p-2 text-slate-400 transition hover:bg-white/5 hover:text-white disabled:opacity-50" aria-label="Cancel Tiny-LIVE mode change"><X className="size-4" /></button>
        </div>
        <div className="space-y-3 px-5 py-5 text-sm leading-6 text-slate-300">
          {recoveringStop ? (
            <>
              <p>
                Failed two-leg attempt ka emergency stop ab authoritative terminal-balanced recovery se resolved hai. Yeh action sirf us exact durable stop instance ko clear karega; arm, lease ya order submit nahi karega.
              </p>
              {resetEligible && emergencyStopRecovery?.recovery ? (
                <div className="rounded-lg border border-emerald-300/20 bg-emerald-300/5 px-3 py-3 text-xs text-emerald-200">
                  RECOVERY CLEAN · {emergencyStopRecovery.recovery.basis.replaceAll("_", " ")} · resolved {formatTime(emergencyStopRecovery.recovery.resolvedAt)}
                </div>
              ) : (
                <div className="rounded-lg border border-red-300/20 bg-red-300/5 px-3 py-3 text-xs text-red-200">
                  {emergencyStopRecovery?.blockers[0] ?? "Recovery evidence unavailable."}
                </div>
              )}
              <p className="text-xs text-slate-500">Clear hone ke baad LIVE ko dobara confirm karna hoga. Automatic reset, order retry, transfer aur withdrawal disabled rahenge.</p>
            </>
          ) : (
            <>
              <p>PAPER automatically pause hoga. Existing safety checks pass hone par real exchange orders submit ho sakte hain.</p>
              <div className="grid grid-cols-3 gap-2 font-mono text-[10px]">
                <span className="rounded-lg border border-amber-300/15 bg-amber-300/5 px-2 py-2 text-center">₹{formatInteger(capitalPerLegInr)} / LEG</span>
                <span className="rounded-lg border border-amber-300/15 bg-amber-300/5 px-2 py-2 text-center">MAX {maximumAttempts}</span>
                <span className="rounded-lg border border-amber-300/15 bg-amber-300/5 px-2 py-2 text-center">{formatInteger(durationMinutes / 60)} HOURS</span>
              </div>
              <p className="text-xs text-slate-500">No transfer or withdrawal. Fresh timing approval, inventory, fee, depth, profit and last-look gates remain mandatory.</p>
            </>
          )}
        </div>
        <div className="flex justify-end gap-3 border-t border-white/8 px-5 py-4">
          <button type="button" onClick={onCancel} disabled={pending} className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 transition hover:bg-white/5 disabled:opacity-50">Cancel</button>
          <button type="button" onClick={onConfirm} disabled={pending || (recoveringStop && !resetEligible)} className="flex items-center gap-2 rounded-lg border border-amber-300/40 bg-amber-300/15 px-4 py-2 text-sm font-bold text-amber-200 transition hover:bg-amber-300/20 disabled:cursor-not-allowed disabled:opacity-60">
            {pending ? <RefreshCw className="size-4 animate-spin" /> : <Power className="size-4" />}
            {pending ? "Working..." : recoveringStop ? "Clear recovered stop only" : "Confirm Tiny-LIVE"}
          </button>
        </div>
      </article>
    </div>
  );
}

function BotViewModeSwitch({
  mode,
  onChange,
}: {
  mode: BotViewMode;
  onChange: (mode: BotViewMode) => void;
}) {
  return (
    <div className="focus-mode-switch flex items-center rounded-xl border border-cyan-300/20 bg-black/20 p-1">
      {(["FOCUS", "CAPITAL_MANAGER", "DEEP_AUDIT"] as const).map((option) => {
        const selected = mode === option;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option)}
            className={`relative rounded-lg px-3 py-2 font-mono text-[9px] font-bold tracking-[0.13em] transition ${
              selected
                ? "bg-cyan-300/12 text-cyan-200 shadow-[inset_0_0_18px_rgba(34,211,238,.08),0_0_14px_rgba(34,211,238,.08)]"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {option === "FOCUS" ? "FOCUS" : option === "CAPITAL_MANAGER" ? "CAPITAL" : "DEEP AUDIT"}
          </button>
        );
      })}
    </div>
  );
}

function PersonalCapitalManagerView({report}: {report: PersonalStrategyOneBotData}) {
  const manager = report.capitalManager;
  const route = manager.route;
  const verifiedInr = manager.capitalTruth.verifiedInrSubtotal;
  const rebalancing = manager.rebalancing;
  const normalizedCapital = rebalancing.inventory.totals;

  return (
    <div className="capital-manager-view space-y-5">
      <article className="capital-manager-hero relative overflow-hidden rounded-2xl border border-cyan-300/20 bg-panel">
        <div className="pointer-events-none absolute -left-20 -top-24 size-80 rounded-full bg-cyan-400/8 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 right-0 size-80 rounded-full bg-violet-500/10 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-5 border-b border-white/8 px-5 py-5 lg:px-7">
          <div className="flex items-center gap-4">
            <span className="capital-manager-orb grid size-12 shrink-0 place-items-center rounded-xl border border-cyan-300/25 bg-cyan-300/8 text-cyan-200"><WalletCards className="size-6" /></span>
            <div>
              <p className="font-mono text-[9px] font-bold tracking-[0.18em] text-cyan-200">V{manager.version} PERSONAL CAPITAL OWNER</p>
              <h2 className="mt-1 text-xl font-semibold text-white">Personal Capital Manager</h2>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-text-muted">One advisory owner for five-exchange inventory, pilot allocation, reserve separation and the next exact operator action.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-3 py-1.5 font-mono text-[9px] font-bold ${capitalManagerStateTone(manager.state)}`}>{manager.state.replaceAll("_", " ")}</span>
            <span className="rounded-full border border-amber-300/25 bg-amber-300/8 px-3 py-1.5 font-mono text-[9px] font-bold text-amber-200">ADVISORY ONLY</span>
          </div>
        </div>

        <div className="relative grid grid-cols-2 gap-px bg-white/8 lg:grid-cols-4">
          <FocusHeadline label="Recommended bankroll" value={`₹${formatInteger(manager.pilotPolicy.recommendedStartingBankrollInr)}`} detail="Tiny-LIVE starting boundary" tone="cyan" />
          <FocusHeadline label="Maximum exchange exposure" value={`₹${formatInteger(manager.pilotPolicy.maximumInitialExchangeExposureInr)}`} detail="across active route venues" />
          <FocusHeadline label="Off-exchange reserve" value={`₹${formatInteger(manager.pilotPolicy.offExchangeReserveInr)}`} detail="linked bank · not observed by bot" />
          <FocusHeadline label="Pilot sizing" value={`₹${formatInteger(manager.pilotPolicy.requestedPerLegInr)} / leg`} detail={`₹${formatInteger(manager.pilotPolicy.minimumTwoLegInventoryInr)} two-leg minimum`} tone="positive" />
        </div>
      </article>

      <article className="overflow-hidden rounded-2xl border border-border-default bg-panel">
        <PanelHeader icon={<Database className="size-4" />} eyebrow="PHASE A · UNIFIED CAPITAL TRUTH" title="Verified capital without false conversion" right={<span className={`rounded-full border px-2.5 py-1 font-mono text-[8px] font-bold ${manager.capitalTruth.valuationState === "FULLY_INR_DENOMINATED" ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300" : "border-amber-400/25 bg-amber-400/10 text-amber-300"}`}>{manager.capitalTruth.valuationState.replaceAll("_", " ")}</span>} />
        <div className="grid grid-cols-2 gap-px bg-border-default lg:grid-cols-4">
          <FocusHeadline label="Verified INR subtotal" value={verifiedInr.totalInr === null ? "NO DATA" : formatWholeRupees(verifiedInr.totalInr)} detail={`${verifiedInr.contributingExchanges} exchanges with explicit INR`} tone="cyan" />
          <FocusHeadline label="All-asset INR value" value={manager.capitalTruth.allAssetPortfolioValueInr === null ? "NO DATA" : formatWholeRupees(manager.capitalTruth.allAssetPortfolioValueInr)} detail={manager.capitalTruth.allAssetPortfolioValueInr === null ? `${manager.capitalTruth.positiveUnvaluedAssetCount} native assets need valuation` : "fully INR-denominated evidence"} />
          <FocusHeadline label="PAPER equity" value={formatWholeRupees(manager.capitalTruth.paper.accountingEquityInr)} detail="isolated · excluded from LIVE balances" />
          <FocusHeadline label="TDS receivable" value={formatWholeRupees(manager.capitalTruth.paper.tdsReceivableInr)} detail="recoverable claim · locked from PAPER spendable cash" tone="cyan" />
        </div>
        <div className="grid gap-px border-t border-border-default bg-border-default md:grid-cols-3 2xl:grid-cols-6">
          <CapitalTruthMetric label="PAPER gross" value={signedWholeRupees(manager.profitTruth.grossTradingProfitInr)} />
          <CapitalTruthMetric label="Trading fees" value={formatWholeRupees(manager.profitTruth.tradingFeesInr)} />
          <CapitalTruthMetric label="Economic net P&L" value={signedWholeRupees(manager.profitTruth.economicNetPnlInr)} positive={manager.profitTruth.economicNetPnlInr >= 0} />
          <CapitalTruthMetric label="Modeled TDS total" value={formatWholeRupees(manager.profitTruth.tdsWithheldInr)} />
          <CapitalTruthMetric label="Deployable PAPER cash" value={signedWholeRupees(manager.profitTruth.deployableCashPnlInr)} positive={manager.profitTruth.deployableCashPnlInr >= 0} />
          <CapitalTruthMetric label="Pending P&L" value="NO DATA" />
        </div>
        <p className="border-t border-border-default px-5 py-3 text-[10px] text-text-muted">INR is summed only when explicitly present. BTC, USDT and other assets remain in native units until authoritative conversion evidence exists. PAPER profit is evidence—not withdrawable money.</p>
      </article>

      <article className="overflow-hidden rounded-2xl border border-border-default bg-panel">
        <PanelHeader
          icon={<Workflow className="size-4" />}
          eyebrow="V158 · PHASE A/B INTEGRATION"
          title="Five-exchange capital & rebalancing truth"
          right={<span className={`rounded-full border px-2.5 py-1 font-mono text-[8px] font-bold ${rebalancing.allocation.state === "READY" ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300" : "border-amber-400/25 bg-amber-400/10 text-amber-300"}`}>{rebalancing.allocation.state.replaceAll("_", " ")}</span>}
        />
        <div className="grid grid-cols-2 gap-px bg-border-default lg:grid-cols-4">
          <FocusHeadline label="Authoritative wallet capital" value={normalizedCapital.authoritativeTotalCapitalUsdt === null ? "NO DATA" : `${formatNumber(normalizedCapital.authoritativeTotalCapitalUsdt)} USDT`} detail={rebalancing.inventory.state.replaceAll("_", " ")} tone="cyan" />
          <FocusHeadline label="Deployable after holds" value={normalizedCapital.authoritativeAvailableCapitalUsdt === null ? "NO DATA" : `${formatNumber(normalizedCapital.authoritativeAvailableCapitalUsdt)} USDT`} detail={`${formatNumber(rebalancing.allocation.capital.reservedInventoryUsdt ?? 0)} USDT reservation-aware`} />
          <FocusHeadline label="Valuation coverage" value={`${formatInteger(normalizedCapital.currentValuations)}/${formatInteger(normalizedCapital.positiveAssets)}`} detail={`${formatInteger(normalizedCapital.unavailableValuations)} unavailable · never counted as zero`} />
          <FocusHeadline label="Rebalancing action" value={rebalancing.plan.currentAction.replaceAll("_", " ")} detail={`${rebalancing.plan.desiredMoves.length} analysis-only proposal(s)`} tone={rebalancing.plan.state === "BLOCKED" ? undefined : "positive"} />
        </div>

        <div className="border-t border-border-default px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[9px] font-bold tracking-[0.13em] text-cyan-200">DYNAMIC STRATEGY #1 TARGETS</p>
              <p className="mt-1 max-w-4xl text-[10px] leading-4 text-text-muted">{rebalancing.policyBasis.formula}</p>
            </div>
            <span className="rounded-full border border-emerald-400/20 bg-emerald-400/8 px-3 py-1 font-mono text-[8px] font-bold text-emerald-300">STATIC EQUAL: OFF</span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {rebalancing.allocation.policy.targets.map((target) => {
              const actual = rebalancing.allocation.exchanges.find((exchange) => exchange.exchange === target.exchange);
              const inventory = rebalancing.inventory.exchanges.find((exchange) => exchange.exchange === target.exchange);
              return (
                <div key={target.exchange} className="rounded-xl border border-white/7 bg-black/18 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-text-primary">{inventory?.displayName ?? target.exchange}</p>
                    <span className={`rounded-full border px-2 py-1 font-mono text-[8px] font-bold ${actual?.state === "BALANCED" ? "border-emerald-400/20 bg-emerald-400/8 text-emerald-300" : actual ? "border-amber-400/20 bg-amber-400/8 text-amber-300" : "border-border-default bg-panel-light text-text-muted"}`}>{actual?.state ?? "NO DATA"}</span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <CompactStat label="Target" value={`${formatNumber(target.targetPercent)}%`} />
                    <CompactStat label="Actual" value={actual ? `${formatNumber(actual.currentCapitalUsdt)} USDT` : "NO DATA"} />
                  </div>
                  <p className="mt-3 text-[9px] leading-4 text-text-muted">Available {actual ? `${formatNumber(actual.availableCapitalUsdt)} USDT` : "NO DATA"} · reserve {formatNumber(target.emergencyReserveUsdt)} USDT</p>
                  {(inventory?.unvaluedPositiveAssets.length ?? 0) > 0 && <p className="mt-2 font-mono text-[8px] text-amber-300">UNVALUED: {inventory!.unvaluedPositiveAssets.join(", ")}</p>}
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid gap-px border-t border-border-default bg-border-default xl:grid-cols-[1.15fr_.85fr]">
          <div className="bg-[#07111d] p-5">
            <p className="font-mono text-[9px] font-bold tracking-[0.13em] text-text-muted">ADVISORY MOVE PLAN</p>
            {rebalancing.plan.desiredMoves.length > 0 ? (
              <div className="mt-3 space-y-2">
                {rebalancing.plan.desiredMoves.map((move) => (
                  <div key={`${move.sequence}:${move.sourceExchange}:${move.destinationExchange}`} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/7 bg-black/18 px-3 py-3">
                    <span className="font-mono text-[10px] font-bold text-text-primary">{move.sourceExchange} → {move.destinationExchange}</span>
                    <span className="font-mono text-[10px] font-bold text-cyan-200">{formatNumber(move.amountUsdt)} USDT · ANALYSIS ONLY</span>
                  </div>
                ))}
              </div>
            ) : <p className="mt-3 text-xs leading-5 text-text-muted">{rebalancing.plan.blockers[0] ?? rebalancing.plan.reasons[0] ?? "No capital move is currently required."}</p>}
          </div>
          <div className="bg-[#07111d] p-5">
            <p className="font-mono text-[9px] font-bold tracking-[0.13em] text-text-muted">AUTHORITY BOUNDARY</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <MissionSafetyCell label="Phase A truth" value="ACTIVE" passed />
              <MissionSafetyCell label="Phase B advice" value="ACTIVE" passed />
              <MissionSafetyCell label="Phase C transfer" value="LOCKED" passed />
              <MissionSafetyCell label="Auto rebalance" value="LOCKED" passed />
            </div>
            <p className="mt-3 font-mono text-[8px] font-bold text-emerald-300">NO TRANSFER · NO WITHDRAWAL · NO ORDER</p>
          </div>
        </div>
      </article>

      <div className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
        <article className="overflow-hidden rounded-2xl border border-border-default bg-panel">
          <PanelHeader
            icon={<Route className="size-4" />}
            eyebrow="CURRENT INVENTORY OBJECTIVE"
            title="Best Strategy #1 route"
            right={<span className={`rounded-full border px-2.5 py-1 font-mono text-[9px] font-bold ${route ? fundingStateTone(route.fundingState) : "border-border-default bg-panel-light text-text-muted"}`}>{route?.fundingState ?? "NO ROUTE"}</span>}
          />
          {route ? (
            <>
              <div className="border-b border-border-default bg-gradient-to-r from-cyan-300/6 via-transparent to-violet-400/6 px-5 py-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <CoinMark symbol={route.baseAsset ?? route.market} />
                    <div><p className="font-mono text-lg font-bold text-text-primary">{route.market}</p><p className="mt-1 text-[9px] uppercase tracking-[0.12em] text-text-muted">Historical rank {route.historicalRank === null ? "NO MATCH" : `#${route.historicalRank}`} · {route.historicalSettlements === null ? "NO DATA" : `${formatInteger(route.historicalSettlements)} settlements`}</p></div>
                  </div>
                  <div className="flex min-w-[250px] items-center gap-3 rounded-xl border border-white/7 bg-black/20 p-3">
                    <ExchangeName name={route.buyExchange} action="BUY" />
                    <ArrowRight className="size-4 text-cyan-200" />
                    <ExchangeName name={route.sellExchange} action="SELL" />
                  </div>
                </div>
              </div>
              <div className="grid gap-px bg-border-default md:grid-cols-2">
                {route.requirements.map((requirement) => <InventoryRequirementCard key={`${requirement.side}:${requirement.exchange}:${requirement.asset ?? "unknown"}`} requirement={requirement} />)}
              </div>
            </>
          ) : <EmptyState title="No current EXECUTE route" detail="Manager will wait for a fresh Strategy #1 route before recommending any exchange funding." />}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-default px-5 py-3 text-[10px]">
            <span className="text-text-muted">Historical ranking never substitutes for current depth, fees, rules or balances.</span>
            <span className="font-mono font-bold text-emerald-300">NO TRANSFER INITIATED</span>
          </div>
        </article>

        <article className="overflow-hidden rounded-2xl border border-border-default bg-panel">
          <PanelHeader icon={<ShieldCheck className="size-4" />} eyebrow="CAPITAL BOUNDARY" title="Reserve and authority" right={<span className="focus-runtime-orb focus-runtime-orb-small" aria-hidden="true"><span /></span>} />
          <div className="grid grid-cols-2 gap-px bg-border-default">
            <MissionSafetyCell label="PAPER capital" value="ISOLATED" passed={manager.safety.paperCapitalIsolated} />
            <MissionSafetyCell label="Fund movement" value="OFF" passed={!manager.safety.automaticFundMovementAllowed} />
            <MissionSafetyCell label="Bank withdrawal" value="OFF" passed={!manager.safety.bankWithdrawalAllowed} />
            <MissionSafetyCell label="LIVE orders" value="0" passed={!manager.safety.orderSubmissionAllowed} />
          </div>
          <div className="space-y-3 border-t border-border-default px-5 py-4 text-xs leading-5 text-text-muted">
            <p><span className="font-semibold text-text-primary">₹1,000 reserve location:</span> operator-linked bank account.</p>
            <p>The reserve is a declared policy—not authenticated bank evidence. CAT PRO cannot read or spend it.</p>
            <p className="font-mono text-[9px] font-bold text-emerald-300">PAPER EXECUTION AFFECTED: NO</p>
          </div>
        </article>
      </div>

      <article className="overflow-hidden rounded-2xl border border-border-default bg-panel">
        <PanelHeader icon={<WalletCards className="size-4" />} eyebrow="AUTHENTICATED FIVE-EXCHANGE EVIDENCE" title="Inventory map" right={<LivePill active={manager.evidence.allExchangeBalancesFresh} label={`${manager.evidence.freshExchanges}/${manager.evidence.exchanges} FRESH`} />} />
        <div className="grid gap-px bg-border-default md:grid-cols-2 2xl:grid-cols-5">
          {manager.venues.map((venue) => (
            <div key={venue.exchange} className="min-w-0 bg-[#07111d] p-4">
              <div className="flex items-start justify-between gap-2"><div><p className="text-[8px] font-bold uppercase tracking-[0.13em] text-text-muted">Exchange</p><p className="mt-1 font-semibold text-text-primary">{venue.displayName}</p></div><span className={`rounded-full border px-2 py-1 font-mono text-[8px] font-bold ${capitalManagerBalanceTone(venue.status)}`}>{venue.status}</span></div>
              <div className="mt-4 space-y-2">
                {venue.assets.length > 0 ? venue.assets.map((asset) => (
                  <div key={asset.asset} className="flex items-center justify-between gap-3 rounded-lg border border-white/6 bg-black/18 px-3 py-2"><span className="font-mono text-[9px] font-bold text-cyan-200">{asset.asset}</span><span className="truncate font-mono text-[10px] font-bold text-text-primary">{formatNumber(asset.availableBalance)}</span></div>
                )) : <p className="rounded-lg border border-white/6 bg-black/18 px-3 py-3 text-center font-mono text-[9px] text-text-muted">NO POSITIVE ASSET</p>}
              </div>
              <p className="mt-3 text-[9px] text-text-muted">{venue.positiveAssetCount} positive · {venue.synchronizedAssetCount} fetched{venue.assetsTruncated ? " · list clipped" : ""}</p>
            </div>
          ))}
        </div>
        <p className="border-t border-border-default px-5 py-3 text-[10px] text-text-muted">Balances remain in native asset units. BTC, INR and USDT are never added into a false combined total.</p>
      </article>

      <article className="overflow-hidden rounded-2xl border border-border-default bg-panel">
        <PanelHeader icon={<Target className="size-4" />} eyebrow="CURRENT ROUTE INVENTORY" title="Exact per-asset operating requirement" right={<span className={`rounded-full border px-2.5 py-1 font-mono text-[8px] font-bold ${manager.allocation.status === "TARGETS_AVAILABLE" ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300" : "border-amber-400/25 bg-amber-400/10 text-amber-300"}`}>{manager.allocation.status.replaceAll("_", " ")}</span>} />
        {manager.allocation.targets.length > 0 ? (
          <div className="grid gap-px bg-border-default md:grid-cols-2">
            {manager.allocation.targets.map((target) => (
              <div key={`${target.side}:${target.exchange}:${target.asset}`} className="bg-[#07111d] p-5">
                <div className="flex items-start justify-between gap-3"><div><p className="font-mono text-[9px] font-bold text-cyan-200">{target.side.replaceAll("_", " ")}</p><p className="mt-1 text-lg font-semibold text-text-primary">{target.exchange} · {target.asset}</p></div><span className={`rounded-full border px-2 py-1 font-mono text-[8px] font-bold ${target.state === "DEFICIT" ? "border-red-400/25 bg-red-400/10 text-red-300" : target.state === "SURPLUS" ? "border-cyan-400/25 bg-cyan-400/10 text-cyan-300" : "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"}`}>{target.state}</span></div>
                <div className="mt-4 grid grid-cols-3 gap-2"><CompactStat label="Current" value={formatNumber(target.currentAmount)} /><CompactStat label="Target" value={formatNumber(target.targetAmount)} /><CompactStat label={target.deficitAmount > 0 ? "Deficit" : "Surplus"} value={formatNumber(target.deficitAmount > 0 ? target.deficitAmount : target.surplusAmount)} /></div>
                <p className="mt-3 text-[10px] leading-4 text-text-muted">{target.reason}</p>
              </div>
            ))}
          </div>
        ) : <EmptyState title="Waiting for current route evidence" detail="No allocation target is invented from historical rank alone." />}
        {manager.allocation.demandRanking.length > 0 && (
          <div className="border-t border-border-default px-5 py-4"><p className="font-mono text-[9px] font-bold tracking-[0.13em] text-text-muted">DURABLE DEMAND RANKING</p><div className="mt-3 flex flex-wrap gap-2">{manager.allocation.demandRanking.map((item) => <span key={`${item.side}:${item.exchange}:${item.rank}`} className="rounded-lg border border-white/7 bg-black/18 px-3 py-2 font-mono text-[9px] text-text-muted"><strong className="text-text-primary">{item.side} #{item.rank} {item.exchange}</strong> · {formatNumber(item.settlementSharePercent)}% · {formatInteger(item.uniqueSettlements)} settlements</span>)}</div></div>
        )}
        <p className="border-t border-border-default px-5 py-3 text-[10px] text-text-muted">{manager.allocation.explanation}</p>
      </article>

      <article className="overflow-hidden rounded-2xl border border-border-default bg-panel">
        <PanelHeader icon={<Workflow className="size-4" />} eyebrow="OPERATOR ACTION QUEUE" title="What happens next" right={<span className="rounded-full border border-border-default bg-panel-light px-2.5 py-1 font-mono text-[9px] text-text-muted">{manager.actions.length} ACTIONS</span>} />
        <div className="grid gap-3 p-4 lg:grid-cols-2 2xl:grid-cols-3">
          {manager.actions.map((action) => (
            <div key={`${action.priority}:${action.kind}:${action.exchange ?? "none"}:${action.asset ?? "none"}`} className="capital-manager-action rounded-xl border border-white/7 bg-black/18 p-4">
              <div className="flex items-start justify-between gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-lg border border-cyan-300/18 bg-cyan-300/7 font-mono text-[10px] font-bold text-cyan-200">{String(action.priority).padStart(2, "0")}</span><span className={`rounded-full border px-2 py-1 font-mono text-[8px] font-bold ${capitalManagerActionTone(action.state)}`}>{action.state.replaceAll("_", " ")}</span></div>
              <p className="mt-4 font-mono text-[9px] font-bold tracking-[0.11em] text-text-primary">{action.kind.replaceAll("_", " ")}</p>
              <p className="mt-2 text-xs leading-5 text-text-muted">{action.instruction}</p>
              <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/6 pt-3 font-mono text-[8px]"><span className={action.operatorApprovalRequired ? "text-amber-300" : "text-text-muted"}>{action.operatorApprovalRequired ? "OPERATOR APPROVAL" : "NO ACTION"}</span><span className="text-emerald-300">AUTO: OFF</span></div>
            </div>
          ))}
        </div>
      </article>
    </div>
  );
}

function BotFocusCockpit({
  report,
  latestExecution,
  feed,
  diagnostics,
}: {
  report: PersonalStrategyOneBotData;
  latestExecution: PersonalBotExecution | null;
  feed: PersonalBotOpportunity[];
  diagnostics: StrategyOneTinyLivePreArmDiagnostics | null;
}) {
  const attemptUsage = report.paper.maximumDailyTrades > 0
    ? (report.paper.dailyActivity.reservationAttempts / report.paper.maximumDailyTrades) * 100
    : null;
  const soakProgress = report.soak.status === "PASSED"
    ? 100
    : report.soak.minimumConsecutivePasses > 0
      ? (report.soak.consecutivePasses / report.soak.minimumConsecutivePasses) * 100
      : null;

  return (
    <div className="focus-cockpit space-y-5">
      <div className="grid gap-5 xl:grid-cols-[1.65fr_.85fr]">
        <FocusPerformanceChart performance={report.performance} />

        <article className="focus-gauge-deck overflow-hidden rounded-2xl border border-border-default bg-panel">
          <PanelHeader
            icon={<Activity className="size-4" />}
            eyebrow="ORBITAL TELEMETRY"
            title="PAPER evidence rings"
            right={<span className="font-mono text-[9px] text-cyan-200">REAL DATA</span>}
          />
          <div className="grid grid-cols-3 gap-px bg-border-default">
            <CircularGauge
              label="Attempt use"
              value={attemptUsage}
              detail={`${formatInteger(report.paper.dailyActivity.reservationAttempts)} / ${formatInteger(report.paper.maximumDailyTrades)}`}
              accent="cyan"
            />
            <CircularGauge
              label="Accepted rate"
              value={report.performance.winRatePercent}
              detail="credible PAPER · not LIVE"
              accent="green"
            />
            <CircularGauge
              label="Soak gate"
              value={soakProgress}
              detail={`${formatInteger(report.soak.consecutivePasses)} / ${formatInteger(report.soak.minimumConsecutivePasses)} consecutive`}
              accent="violet"
            />
          </div>
          <div className="border-t border-border-default px-5 py-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-text-muted">Runtime verdict</p>
                <p className="mt-1 font-mono text-sm font-bold text-emerald-300">{report.state.replaceAll("_", " ")}</p>
              </div>
              <span className="focus-runtime-orb" aria-hidden="true"><span /></span>
            </div>
            <p className="mt-3 text-xs leading-5 text-text-muted">{report.nextAction}</p>
          </div>
        </article>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
        <FocusOpportunityBoard feed={feed} report={report} />
        <FocusLatestExecution execution={latestExecution} report={report} />
      </div>

      <LiveExecutionReplay execution={latestExecution} />

      <FocusLightningRail hotPath={report.hotPath} />

      <div className="grid gap-3 md:grid-cols-3">
        <SafetyFact icon={<ShieldCheck />} label="PAPER ledger" value="SIMULATED · NOT REAL FILLS" passed />
        <SafetyFact icon={<Radio />} label="Scanner" value={report.control.scannerActive ? `${report.opportunity.current} current opportunities` : "Unavailable"} passed={report.control.scannerActive} />
        <SafetyFact
          icon={<Power />}
          label="Tiny-LIVE authority"
          value={diagnostics ? tinyLiveAuthorityStatus(diagnostics).label : "CHECK IN DEEP AUDIT"}
          passed={diagnostics !== null && diagnostics.activeArm === null}
        />
      </div>
    </div>
  );
}

function LiveExecutionReplay({
  execution,
  immersive = false,
}: {
  execution: PersonalBotExecution | null;
  immersive?: boolean;
}) {
  const stages = execution ? [
    {
      label: "SIGNAL",
      value: `${execution.baseAsset}/${execution.quoteAsset}`,
      detail: "stored opportunity evidence",
    },
    {
      label: "QUALIFIED",
      value: `${execution.pnlPercent >= 0 ? "+" : ""}${execution.pnlPercent.toFixed(3)}%`,
      detail: `${formatWholeRupees(execution.capital)} PAPER capital`,
    },
    {
      label: "BUY LEG",
      value: execution.buyExchange,
      detail: `QTY ${formatNumber(execution.quantity)} · @ ${formatNumber(execution.buyPrice)}`,
    },
    {
      label: "SELL LEG",
      value: execution.sellExchange,
      detail: `QTY ${formatNumber(execution.quantity)} · @ ${formatNumber(execution.sellPrice)}`,
    },
    {
      label: "RECONCILED",
      value: formatWholeRupees(execution.fees + execution.tdsWithheld),
      detail: "fees + GST and TDS recorded",
    },
    {
      label: "SETTLED",
      value: signedWholeRupees(execution.pnl),
      detail: formatTime(execution.completedAt ?? execution.executedAt),
    },
  ] : [];

  return (
    <article className={`execution-replay overflow-hidden rounded-2xl border border-border-default bg-panel ${immersive ? "execution-replay-immersive" : ""}`}>
      <PanelHeader
        icon={<Workflow className="size-4" />}
        eyebrow="SIX-STAGE PAPER PLAYBACK"
        title="PAPER execution replay"
        right={<span className="rounded-full border border-amber-300/25 bg-amber-300/8 px-2.5 py-1 font-mono text-[9px] font-bold text-amber-200">PAPER REPLAY · NOT LIVE</span>}
      />
      {execution ? (
        <div className="execution-replay-viewport overflow-x-auto">
          <div className="execution-replay-track relative grid min-w-[920px] grid-cols-6 gap-3 px-5 py-7">
            <div className="execution-replay-beam" aria-hidden="true"><span /></div>
            {stages.map((stage, index) => (
              <div
                key={stage.label}
                className="execution-replay-stage relative z-10 rounded-xl border border-cyan-300/14 bg-[#07111d]/95 p-4"
                style={{"--replay-delay": `${index * 0.32}s`} as React.CSSProperties}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="execution-replay-node" aria-hidden="true"><span /></span>
                  <span className="font-mono text-[8px] text-cyan-200/50">0{index + 1}</span>
                </div>
                <p className="mt-4 font-mono text-[9px] font-bold tracking-[0.14em] text-cyan-200">{stage.label}</p>
                <p className={`mt-2 truncate font-mono text-sm font-bold ${index === stages.length - 1 && execution.pnl >= 0 ? "text-emerald-300" : "text-text-primary"}`}>{stage.value}</p>
                <p className="execution-replay-detail mt-1 text-[9px] leading-4 text-text-muted">{stage.detail}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <EmptyState title="No closed settlement to replay" detail="The playback activates only when both simulated legs, reconciliation and PAPER accounting are stored." />
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-default px-5 py-3 text-[9px] text-text-muted">
        <span>Playback visualizes one persisted closed Strategy #1 PAPER settlement.</span>
        <span className="font-mono text-emerald-300">NO EXCHANGE ORDER SUBMITTED</span>
      </div>
    </article>
  );
}

function MissionControlOverlay({
  report,
  execution,
  feed,
  onClose,
}: {
  report: PersonalStrategyOneBotData;
  execution: PersonalBotExecution | null;
  feed: PersonalBotOpportunity[];
  onClose: () => void;
}) {
  const topOpportunity = feed[0] ?? null;
  const appearance = stateAppearance(report.state);
  return (
    <div className="mission-control fixed inset-0 z-[100] overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="mission-control-title">
      <div className="mission-control-grid" aria-hidden="true" />
      <div className="mission-control-shell relative mx-auto min-h-[100dvh] max-w-[1920px]">
        <header className="mission-control-header sticky top-0 z-20 flex flex-wrap items-center justify-between gap-4 border-b border-cyan-300/15 px-5 py-4 backdrop-blur-xl lg:px-8">
          <div className="flex min-w-0 items-center gap-4">
            <span className="mission-control-emblem grid size-11 shrink-0 place-items-center rounded-xl border border-cyan-300/25 bg-cyan-300/8 text-cyan-200"><Bot className="size-5" /></span>
            <div className="min-w-0">
              <p className="font-mono text-[9px] font-bold tracking-[0.2em] text-cyan-200">HOPUN HFT BOT · STRATEGY #1</p>
              <h2 id="mission-control-title" className="truncate text-xl font-semibold tracking-tight text-white">PAPER Mission Control</h2>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`hidden rounded-full border px-3 py-1.5 font-mono text-[9px] font-bold sm:inline-flex ${appearance.surface} ${appearance.text}`}>{appearance.label}</span>
            <span className="rounded-full border border-amber-300/25 bg-amber-300/8 px-3 py-1.5 font-mono text-[9px] font-bold text-amber-200">PAPER REPLAY · NOT LIVE FILLS</span>
            <button type="button" onClick={onClose} className="grid size-11 place-items-center rounded-xl border border-white/10 bg-white/5 text-slate-300 transition hover:border-cyan-300/30 hover:text-cyan-200" aria-label="Close Mission Control">
              <X className="size-5" />
            </button>
          </div>
        </header>

        <main className="space-y-5 px-4 py-5 pb-28 sm:px-5 lg:px-8">
          <section className="mission-control-metrics grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-cyan-300/12 bg-cyan-300/10 lg:grid-cols-4">
            <FocusHeadline label="Today net P&L" value={signedWholeRupees(report.performance.realizedPnlToday)} tone={report.performance.realizedPnlToday >= 0 ? "positive" : "negative"} />
            <FocusHeadline label="Credible today" value={formatInteger(report.performance.successfulToday)} detail="closed PAPER settlements" tone="cyan" />
            <FocusHeadline label="Fresh opportunities" value={formatInteger(report.opportunity.current)} detail="accepted Strategy #1 evidence" />
            <FocusHeadline label="Lightning path" value={report.hotPath.state} detail={`P95 ${formatLatency(report.hotPath.scanner.marketUpdateToDecisionMs.p95Ms)}`} tone={report.hotPath.state === "PASS" ? "positive" : report.hotPath.state === "MISS" ? "negative" : "cyan"} />
          </section>

          <LiveExecutionReplay execution={execution} immersive />

          <section className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
            <article className="overflow-hidden rounded-2xl border border-border-default bg-panel">
              <PanelHeader icon={<Radio className="size-4" />} eyebrow="NEXT PAPER TARGET" title="Top accepted opportunity" right={<LivePill active={report.control.scannerActive} label={`${feed.length} ACCEPTED`} />} />
              {topOpportunity ? (
                <div className="grid gap-4 p-5 sm:grid-cols-[auto_1fr_auto] sm:items-center">
                  <div className="flex items-center gap-3"><CoinMark symbol={topOpportunity.market} /><div><p className="font-mono text-lg font-bold text-text-primary">{topOpportunity.market}</p><p className="text-[9px] uppercase tracking-[0.12em] text-text-muted">PAPER candidate</p></div></div>
                  <div className="flex items-center gap-3 rounded-xl border border-white/7 bg-black/20 p-3"><ExchangeName name={topOpportunity.buyExchange} action="BUY" /><ArrowRight className="size-4 text-cyan-200" /><ExchangeName name={topOpportunity.sellExchange} action="SELL" /></div>
                  <div className="sm:text-right"><p className="font-mono text-xl font-bold text-emerald-300">+{topOpportunity.netProfitPercent.toFixed(3)}%</p><p className="mt-1 text-[9px] text-text-muted">estimated PAPER return</p></div>
                </div>
              ) : <EmptyState title="Radar clear" detail="No currently accepted Strategy #1 PAPER opportunity is being claimed." />}
            </article>

            <article className="overflow-hidden rounded-2xl border border-border-default bg-panel">
              <PanelHeader icon={<ShieldCheck className="size-4" />} eyebrow="SAFETY LOCK" title="Execution boundary" right={<span className="focus-runtime-orb focus-runtime-orb-small" aria-hidden="true"><span /></span>} />
              <div className="grid grid-cols-3 gap-px bg-border-default">
                <MissionSafetyCell label="Mode" value="PAPER" passed />
                <MissionSafetyCell label="LIVE" value="OFF" passed={!report.safety.liveExecutionAllowed} />
                <MissionSafetyCell label="Orders" value="0" passed={!report.safety.orderSubmissionAllowed} />
              </div>
              <p className="border-t border-border-default px-5 py-4 text-xs leading-5 text-text-muted">{report.nextAction}</p>
            </article>
          </section>

          <FocusLightningRail hotPath={report.hotPath} />
        </main>

        <footer className="mission-control-footer fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-[1920px] items-center justify-between gap-4 border-t border-cyan-300/15 px-5 py-3 backdrop-blur-xl lg:px-8">
          <div className="flex items-center gap-2 font-mono text-[9px] text-slate-400"><span className="size-2 rounded-full bg-emerald-300 shadow-[0_0_12px_#19f6a5]" />SNAPSHOT {formatTime(report.generatedAt)}</div>
          <p className="font-mono text-[9px] font-bold tracking-[0.13em] text-amber-200">SIMULATION ONLY · LIVE EXECUTION OFF · ORDER SUBMISSION OFF</p>
        </footer>
      </div>
    </div>
  );
}

function MissionSafetyCell({label, value, passed}: {label: string; value: string; passed: boolean}) {
  return <div className="bg-[#07111d] px-3 py-5 text-center"><p className="text-[8px] font-bold uppercase tracking-[0.13em] text-text-muted">{label}</p><p className={`mt-2 font-mono text-lg font-bold ${passed ? "text-emerald-300" : "text-red-300"}`}>{value}</p></div>;
}

function FocusPerformanceChart({
  performance,
}: {
  performance: PersonalStrategyOneBotData["performance"];
}) {
  const buckets = performance.hourlySuccessfulTrades;
  const width = 760;
  const height = 270;
  const left = 30;
  const right = 18;
  const top = 26;
  const bottom = 34;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const step = plotWidth / Math.max(1, buckets.length);
  const maxTrades = Math.max(1, ...buckets.map((bucket) => bucket.successfulTrades));
  const minimumPnl = Math.min(0, ...buckets.map((bucket) => bucket.realizedPnl));
  const maximumPnl = Math.max(1, ...buckets.map((bucket) => bucket.realizedPnl));
  const pnlRange = Math.max(1, maximumPnl - minimumPnl);
  const xAt = (index: number) => left + step * index + step / 2;
  const pnlY = (value: number) => top + ((maximumPnl - value) / pnlRange) * plotHeight;
  const zeroY = pnlY(0);
  const linePath = buckets.map((bucket, index) => `${index === 0 ? "M" : "L"} ${xAt(index).toFixed(2)} ${pnlY(bucket.realizedPnl).toFixed(2)}`).join(" ");
  const areaPath = buckets.length > 0
    ? `${linePath} L ${xAt(buckets.length - 1).toFixed(2)} ${zeroY.toFixed(2)} L ${xAt(0).toFixed(2)} ${zeroY.toFixed(2)} Z`
    : "";
  const currentIndex = buckets.findIndex((bucket) => bucket.current);

  return (
    <article className="focus-chart-card overflow-hidden rounded-2xl border border-border-default bg-panel">
      <PanelHeader
        icon={<BarChart3 className="size-4" />}
        eyebrow="24-HOUR QUANTUM TRACE · IST"
        title="Trades and hourly net P&L"
        right={<LivePill active label={`${formatInteger(performance.successfulToday)} TODAY`} />}
      />
      <div className="grid gap-px border-b border-border-default bg-border-default sm:grid-cols-3">
        <FocusHeadline label="Today net P&L" value={signedWholeRupees(performance.realizedPnlToday)} tone={performance.realizedPnlToday >= 0 ? "positive" : "negative"} />
        <FocusHeadline label="Current IST hour" value={formatInteger(performance.successfulCurrentClockHour)} detail={performance.currentClockHourLabel} tone="cyan" />
        <FocusHeadline label="Credible today" value={formatInteger(performance.successfulToday)} detail="closed PAPER settlements" />
      </div>
      <div className="focus-chart-viewport overflow-x-auto">
        <div className="relative min-w-[680px] p-4 sm:min-w-0 sm:p-5">
        <div className="absolute right-5 top-4 flex items-center gap-4 font-mono text-[9px] text-text-muted">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-cyan-300/35" />TRADES</span>
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-emerald-300" />NET P&amp;L</span>
        </div>
        <svg className="mt-4 h-auto w-full overflow-visible" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Hourly successful PAPER trades and net profit or loss for 24 IST clock-hour buckets">
          <defs>
            <linearGradient id="focusPnlArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#19f6a5" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#19f6a5" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="focusTradeBar" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#67e8f9" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#4f7cff" stopOpacity="0.08" />
            </linearGradient>
          </defs>

          {[0, 1, 2, 3, 4].map((line) => {
            const y = top + (plotHeight / 4) * line;
            return <line key={line} x1={left} y1={y} x2={width - right} y2={y} stroke="rgba(127,153,175,.10)" strokeWidth="1" />;
          })}

          {currentIndex >= 0 ? (
            <rect x={left + step * currentIndex} y={top} width={step} height={plotHeight} rx="6" fill="rgba(34,211,238,.055)" stroke="rgba(34,211,238,.16)" />
          ) : null}

          {buckets.map((bucket, index) => {
            const barHeight = (bucket.successfulTrades / maxTrades) * plotHeight * 0.72;
            return (
              <g key={bucket.hour}>
                <rect
                  x={xAt(index) - Math.max(4, step * 0.22)}
                  y={top + plotHeight - barHeight}
                  width={Math.max(8, step * 0.44)}
                  height={barHeight}
                  rx="3"
                  fill="url(#focusTradeBar)"
                  stroke={bucket.current ? "rgba(103,232,249,.72)" : "rgba(103,232,249,.18)"}
                >
                  <title>{`${bucket.label}: ${bucket.successfulTrades} successful, ${signedCurrency(bucket.realizedPnl)} net P&L`}</title>
                </rect>
                {index % 3 === 0 ? (
                  <text x={xAt(index)} y={height - 10} textAnchor="middle" fill="rgba(127,153,175,.72)" fontSize="9" fontFamily="monospace">
                    {String(bucket.hour).padStart(2, "0")}:00
                  </text>
                ) : null}
              </g>
            );
          })}

          {areaPath ? <path d={areaPath} fill="url(#focusPnlArea)" /> : null}
          {linePath ? <path className="focus-chart-line" d={linePath} fill="none" stroke="#19f6a5" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /> : null}
          <line x1={left} y1={zeroY} x2={width - right} y2={zeroY} stroke="rgba(255,255,255,.12)" strokeDasharray="4 6" />
          {buckets.map((bucket, index) => (
            <circle key={`pnl-${bucket.hour}`} cx={xAt(index)} cy={pnlY(bucket.realizedPnl)} r={bucket.current ? 4 : 2.4} fill={bucket.realizedPnl >= 0 ? "#19f6a5" : "#ff4d6d"} stroke="#061019" strokeWidth="1.5">
              <title>{`${bucket.label}: ${signedCurrency(bucket.realizedPnl)} net P&L`}</title>
            </circle>
          ))}
        </svg>
        </div>
      </div>
    </article>
  );
}

function FocusHeadline({
  label,
  value,
  detail,
  tone = "default",
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "default" | "positive" | "negative" | "cyan";
}) {
  const toneClass = tone === "positive"
    ? "text-emerald-300"
    : tone === "negative"
      ? "text-red-300"
      : tone === "cyan"
        ? "text-cyan-200"
        : "text-text-primary";
  return (
    <div className="bg-[#07111d] px-5 py-4">
      <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-text-muted">{label}</p>
      <p className={`mt-2 font-mono text-xl font-bold ${toneClass}`}>{value}</p>
      {detail ? <p className="mt-1 text-[10px] text-text-muted">{detail}</p> : null}
    </div>
  );
}

function CircularGauge({
  label,
  value,
  detail,
  accent,
}: {
  label: string;
  value: number | null;
  detail: string;
  accent: "cyan" | "green" | "violet";
}) {
  const normalized = value === null ? 0 : Math.min(100, Math.max(0, value));
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - normalized / 100);
  const colors = {
    cyan: {stroke: "#39ff88", text: "text-cyan-200"},
    green: {stroke: "#19f6a5", text: "text-emerald-300"},
    violet: {stroke: "#7dffab", text: "text-violet-300"},
  } as const;
  const color = colors[accent];

  return (
    <div className="focus-gauge-cell bg-[#07111d] px-3 py-5 text-center">
      <div className="focus-gauge-visual relative mx-auto size-24">
        <svg className="size-full -rotate-90" viewBox="0 0 112 112" aria-hidden="true">
          <circle cx="56" cy="56" r={radius} fill="rgba(2,8,15,.72)" stroke="rgba(127,153,175,.12)" strokeWidth="8" />
          <circle
            className="focus-gauge-ring"
            cx="56"
            cy="56"
            r={radius}
            fill="none"
            stroke={color.stroke}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <div>
            <p className={`font-mono text-xl font-bold ${value === null ? "text-text-muted" : color.text}`}>
              {value === null ? "—" : `${Math.round(normalized)}%`}
            </p>
            <p className="mt-0.5 text-[8px] font-bold uppercase tracking-[0.11em] text-text-muted">{label}</p>
          </div>
        </div>
      </div>
      <p className="mt-2 min-h-8 text-[9px] leading-4 text-text-muted">{detail}</p>
    </div>
  );
}

function FocusOpportunityBoard({
  feed,
  report,
}: {
  feed: PersonalBotOpportunity[];
  report: PersonalStrategyOneBotData;
}) {
  return (
    <article className="overflow-hidden rounded-2xl border border-border-default bg-panel">
      <PanelHeader
        icon={<Radio className="size-4" />}
        eyebrow="LIVE PAPER RADAR"
        title="Accepted opportunity constellation"
        right={<LivePill active={report.control.scannerActive} label={`${report.opportunity.current} FRESH`} />}
      />
      {feed.length > 0 ? (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-3 p-4">
          {feed.slice(0, 4).map((opportunity, index) => (
            <div key={opportunity.id} className="focus-opportunity-card relative overflow-hidden rounded-xl border border-cyan-300/14 bg-black/18 p-4">
              <span className="absolute right-3 top-3 font-mono text-[8px] text-cyan-200/60">NODE {String(index + 1).padStart(2, "0")}</span>
              <div className="flex items-center gap-3">
                <CoinMark symbol={opportunity.market} />
                <div>
                  <p className="font-mono text-base font-bold text-text-primary">{opportunity.market}</p>
                  <p className="mt-0.5 text-[9px] uppercase tracking-[0.12em] text-text-muted">Strategy #1 · PAPER</p>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-2 rounded-lg border border-white/6 bg-black/20 px-3 py-2.5">
                <ExchangeName name={opportunity.buyExchange} action="BUY" />
                <span className="relative flex w-9 items-center justify-center">
                  <span className="absolute h-px w-full bg-gradient-to-r from-cyan-300/20 via-cyan-300 to-violet-400/30" />
                  <ArrowRight className="relative size-3 text-cyan-200" />
                </span>
                <ExchangeName name={opportunity.sellExchange} action="SELL" />
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <FocusMiniMetric label="Net return" value={`${opportunity.netProfitPercent >= 0 ? "+" : ""}${opportunity.netProfitPercent.toFixed(3)}%`} positive={opportunity.netProfitPercent >= 0} />
                <FocusMiniMetric label="Modeled P&L" value={opportunity.modeledNetProfitInr === null ? "NO DATA" : signedWholeRupees(opportunity.modeledNetProfitInr)} positive={opportunity.modeledNetProfitInr !== null && opportunity.modeledNetProfitInr >= 0} />
                <FocusMiniMetric label="Score" value={formatInteger(opportunity.score)} />
              </div>
              <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/5">
                <div className="h-full rounded-full bg-gradient-to-r from-cyan-300 via-blue-400 to-violet-400 shadow-[0_0_10px_rgba(34,211,238,.45)]" style={{width: `${Math.min(100, Math.max(0, opportunity.score))}%`}} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="Radar clear right now" detail={`The scanner has ${report.opportunity.executable} EXECUTE decision${report.opportunity.executable === 1 ? "" : "s"}; only currently accepted Strategy #1 PAPER opportunities appear here.`} />
      )}
    </article>
  );
}

function FocusLatestExecution({
  execution,
  report,
}: {
  execution: PersonalBotExecution | null;
  report: PersonalStrategyOneBotData;
}) {
  return (
    <article className="focus-execution-core overflow-hidden rounded-2xl border border-border-default bg-panel">
      <PanelHeader
        icon={<Zap className="size-4" />}
        eyebrow="SETTLEMENT CORE"
        title="Latest PAPER execution"
        right={<span className="focus-runtime-orb focus-runtime-orb-small" aria-hidden="true"><span /></span>}
      />
      {execution ? (
        <div className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <CoinMark symbol={execution.baseAsset} />
              <div>
                <p className="font-mono text-xl font-bold text-text-primary">{execution.baseAsset}<span className="text-sm text-text-muted">/{execution.quoteAsset}</span></p>
                <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-text-muted">closed · credible · PAPER</p>
              </div>
            </div>
            <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 font-mono text-[9px] font-bold text-emerald-300">PAPER SUCCESS</span>
          </div>
          <div className="focus-route-beam mt-6 flex items-center gap-3 rounded-xl border border-white/7 bg-black/20 p-3">
            <ExchangeName name={execution.buyExchange} action="BUY" />
            <div className="relative flex w-14 items-center justify-center">
              <span className="absolute h-px w-full bg-gradient-to-r from-cyan-300/20 via-emerald-300 to-violet-400/20" />
              <ArrowRight className="relative size-4 text-emerald-300" />
            </div>
            <ExchangeName name={execution.sellExchange} action="SELL" />
          </div>
          <div className="mt-5 rounded-xl border border-emerald-300/12 bg-emerald-300/5 p-4 text-center">
            <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-text-muted">Economic PAPER P&amp;L</p>
            <p className={`mt-2 font-mono text-3xl font-bold ${execution.pnl >= 0 ? "text-emerald-300" : "text-red-300"}`}>{signedWholeRupees(execution.pnl)}</p>
            <p className="mt-1 font-mono text-xs text-text-muted">{execution.pnlPercent >= 0 ? "+" : ""}{execution.pnlPercent.toFixed(3)}% return</p>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <CompactStat label="Deployable cash Δ" value={signedWholeRupees(execution.deployableCashProfit)} positive={execution.deployableCashProfit >= 0} />
            <CompactStat label="Fees + GST" value={formatWholeRupees(execution.fees)} />
            <CompactStat label="TDS withheld" value={formatWholeRupees(execution.tdsWithheld)} />
            <CompactStat label="Completed" value={timeAgo(execution.completedAt ?? execution.executedAt)} />
          </div>
          <div className="mt-5 border-t border-border-default pt-4">
            <div className="flex items-center justify-between gap-3 text-[10px]">
              <span className="uppercase tracking-[0.12em] text-text-muted">Owner cycle</span>
              <span className="font-mono font-bold text-cyan-200">{report.lastExecutionCycle?.status ?? "NO CYCLE"}</span>
            </div>
          </div>
        </div>
      ) : (
        <EmptyState title="No successful execution evidence" detail="This core activates only after both PAPER legs, reconciliation and accounting complete." />
      )}
    </article>
  );
}

function FocusLightningRail({
  hotPath,
}: {
  hotPath: PersonalStrategyOneBotData["hotPath"];
}) {
  const metrics = [
    {label: "UPDATE → DECISION", distribution: hotPath.scanner.marketUpdateToDecisionMs},
    {label: "DECISION → QUEUE", distribution: hotPath.automation.decisionToQueueMs},
    {label: "CANDIDATE → START", distribution: hotPath.automation.candidateDecisionToExecutionStartMs},
    {label: "DECISION → COMPLETE", distribution: hotPath.automation.decisionToExecutionCompleteMs},
  ];
  return (
    <article className="overflow-hidden rounded-2xl border border-border-default bg-panel">
      <div className="grid gap-px bg-border-default md:grid-cols-[1.1fr_repeat(4,1fr)]">
        <div className="bg-[#07111d] px-5 py-4">
          <div className="flex items-center gap-2 text-cyan-200"><Zap className="size-4" /><span className="font-mono text-[9px] font-bold tracking-[0.14em]">LIGHTNING PATH</span></div>
          <p className={`mt-2 font-mono text-lg font-bold ${hotPath.state === "PASS" ? "text-emerald-300" : hotPath.state === "MISS" ? "text-red-300" : "text-amber-300"}`}>{hotPath.state}</p>
          <p className="mt-1 text-[9px] text-text-muted">code-side only · n≤{hotPath.sampleWindowCapacity}</p>
        </div>
        {metrics.map((metric) => (
          <div key={metric.label} className="bg-[#07111d] px-5 py-4">
            <p className="font-mono text-[8px] font-bold tracking-[0.11em] text-text-muted">{metric.label}</p>
            <p className="mt-2 font-mono text-lg font-bold text-text-primary">{formatLatency(metric.distribution.p95Ms)}</p>
            <p className="mt-1 font-mono text-[9px] text-cyan-200/70">P99 {formatLatency(metric.distribution.p99Ms)}</p>
          </div>
        ))}
      </div>
    </article>
  );
}

function FocusMiniMetric({label, value, positive}: {label: string; value: string; positive?: boolean}) {
  return (
    <div>
      <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-text-muted">{label}</p>
      <p className={`mt-1 truncate font-mono text-[11px] font-bold ${positive === undefined ? "text-text-primary" : positive ? "text-emerald-300" : "text-red-300"}`}>{value}</p>
    </div>
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
          value={formatInteger(placement.totalRoutes)}
          detail={`${placement.buyVenues.length} BUY venues · ${placement.sellVenues.length} SELL venues · top ${placement.routes.length} loaded`}
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
          {placement.totalRoutes === 0 ? <EmptyState title="No historical route evidence" detail="The report will populate from unique credible closed Strategy #1 PAPER settlements." /> : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-default bg-panel-light/30 px-5 py-3 text-[10px]">
        <p className="text-text-muted">Current depth, fees, order rules and authenticated balances must still pass at action time.</p>
        <p className="font-mono font-bold text-emerald-300">NO AUTOMATIC FUND MOVEMENT · LIVE/OFF</p>
      </div>
    </article>
  );
}

function StrategyOnePreArmedOneShotPanel({
  diagnostics,
  twoLegRecovery,
  candidate,
  suggestedRoute,
  capitalPerLegInr,
  acknowledged,
  loading,
  arming,
  disarming,
  paperBotEnabled,
  paperControlPending,
  leaseConfirmation,
  activatingLease,
  restoringPaper,
  error,
  onAcknowledgedChange,
  onLeaseConfirmationChange,
  onArm,
  onDisarm,
  onActivateLease,
  onRestorePaper,
  onPaperControlChange,
}: {
  diagnostics: StrategyOneTinyLivePreArmDiagnostics | null;
  twoLegRecovery: StrategyOneTwoLegRecoveryData | null;
  candidate: StrategyOnePilotCandidate | null;
  suggestedRoute: StrategyOnePreArmRoute | null;
  capitalPerLegInr: number;
  acknowledged: boolean;
  loading: boolean;
  arming: boolean;
  disarming: boolean;
  paperBotEnabled: boolean;
  paperControlPending: boolean;
  leaseConfirmation: string;
  activatingLease: boolean;
  restoringPaper: boolean;
  error: Error | null;
  onAcknowledgedChange: (checked: boolean) => void;
  onLeaseConfirmationChange: (value: string) => void;
  onArm: () => void;
  onDisarm: () => void;
  onActivateLease: () => void;
  onRestorePaper: () => void;
  onPaperControlChange: (enabled: boolean) => void;
}) {
  const active = diagnostics?.activeArm ?? null;
  const accountLease = diagnostics?.accountModeLease ?? null;
  const activeAccountLease = accountLease?.activeLease ?? null;
  const readinessWaterfall = diagnostics?.readinessWaterfall ?? null;
  const dailyAttemptBudget = diagnostics?.dailyAttemptBudget ?? null;
  const armAttempts = dailyAttemptBudget?.routePoolArmAttempts ?? null;
  const route = active?.routeScope === "DYNAMIC_POOL" ? suggestedRoute : active ?? suggestedRoute;
  const recent = diagnostics?.records[0] ?? null;
  const lastActionTimeRefresh = diagnostics?.actionTimeBookRefresh?.lastResult ?? null;
  const attempts = recent?.attempts ?? [];
  const latestRecoveryResolution =
    twoLegRecovery?.resolutions.resolutions[0] ?? null;
  const recoveryIsClean =
    twoLegRecovery?.recoveryGate.classification === "CLEAN" &&
    twoLegRecovery.recoveryGate.summary.unresolvedSessions === 0;
  const candidateMatchesRoute = candidate !== null && (
    active?.routeScope === "DYNAMIC_POOL"
      ? isDynamicPoolRoute(candidate)
      : route !== null &&
        normalizedMarket(candidate.market) === normalizedMarket(route.market) &&
        candidate.buyExchange.toLowerCase() === route.buyExchange.toLowerCase() &&
        candidate.sellExchange.toLowerCase() === route.sellExchange.toLowerCase()
  );
  const blockedChecks = candidate?.checks.filter((check) => check.state === "BLOCKED") ?? [];
  const canArm = diagnostics?.runtimeGateEnabled === true &&
    !active &&
    diagnostics.routePool !== null &&
    armAttempts !== null &&
    !paperBotEnabled &&
    acknowledged &&
    !arming;
  const activationPhrase = active
    ? `ACTIVATE TINY-LIVE ACCOUNT LEASE ${active.id}`
    : "";
  const leasePhrase = activeAccountLease?.requiredRestorePhrase ?? activationPhrase;
  const canActivateLease = active !== null &&
    activeAccountLease === null &&
    accountLease?.accountMode === "PAPER" &&
    !paperBotEnabled &&
    leaseConfirmation === activationPhrase &&
    !activatingLease;
  const canRestorePaper = activeAccountLease !== null &&
    leaseConfirmation === activeAccountLease.requiredRestorePhrase &&
    !restoringPaper;
  const paperControlLocked = paperControlPending || (
    !paperBotEnabled && (
      active !== null ||
      activeAccountLease !== null ||
      accountLease?.accountMode !== "PAPER"
    )
  );
  const status = active
    ? diagnostics?.triggerInProgress
      ? "TRIGGERING"
      : "ARMED"
    : diagnostics?.runtimeGateEnabled
      ? "STANDBY"
      : "LIVE GATE OFF";

  return (
    <article className={`overflow-hidden rounded-2xl border ${active ? "border-emerald-400/30 bg-emerald-400/[0.035] shadow-[0_0_34px_rgba(52,211,153,.08)]" : "border-border-default bg-panel"}`}>
      <PanelHeader
        icon={<Zap className="size-4" />}
        eyebrow="V190 DYNAMIC ROUTE POOL"
        title="Current USDT routes and controlled execution evidence"
        right={(
          <span className={`rounded-full border px-2.5 py-1 font-mono text-[9px] font-bold ${active ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : diagnostics?.runtimeGateEnabled ? "border-amber-400/30 bg-amber-400/10 text-amber-300" : "border-border-default bg-panel-light text-text-muted"}`}>
            {loading ? "LOADING" : status}
          </span>
        )}
      />

      <div className="grid gap-px bg-border-default sm:grid-cols-2 xl:grid-cols-4">
        <ActivityMetric
          label="Route scope"
          value="DYNAMIC USDT POOL"
          detail="Current exact routes across Binance, Bybit and CoinDCX"
          tone="positive"
        />
        <ActivityMetric
          label="Hard capital cap"
          value={`₹${formatInteger(active?.maximumCapitalPerLegInr ?? diagnostics?.routePool.maximumCapitalPerLegInr ?? 1000)} / leg`}
          detail={`₹${formatInteger(active?.capitalPerLegInr ?? capitalPerLegInr)} target · minimum exchange steps within cap`}
        />
        <ActivityMetric
          label="Authority lifetime"
          value={active ? `until ${formatTime(active.expiresAt)}` : "3 hours"}
          detail="Unused arm expires automatically"
        />
        <ActivityMetric
          label="Attempts"
          value={`${dailyAttemptBudget?.attemptsToday ?? 0}/${dailyAttemptBudget?.maximumDailyAttempts ?? 10}`}
          detail={active
            ? `Daily used · current batch ${active.attemptsUsed ?? 0}/${active.maximumAttempts} · ${dailyAttemptBudget?.remainingDailyAttempts ?? 0} remaining`
            : `${dailyAttemptBudget?.remainingDailyAttempts ?? 0} daily attempts remaining · failed attempts stay counted`}
          tone="warning"
        />
      </div>

      {diagnostics?.routePool ? (
        <div className="border-t border-border-default bg-[#07111d] px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-mono text-[9px] font-bold tracking-[.16em] text-cyan-300">PER-ATTEMPT EXACT INVENTORY</p>
              <p className="mt-1 text-xs text-text-muted">No coin is pinned. The selected BUY/SELL route must prove both live balances before every attempt.</p>
            </div>
            <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 font-mono text-[9px] font-bold text-emerald-300">₹{formatInteger(diagnostics.routePool.capitalPerLegInr)} TARGET · ₹{formatInteger(diagnostics.routePool.maximumCapitalPerLegInr)} MAX</span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {diagnostics.routePool.eligibility.map((gate) => (
              <div key={gate} className="rounded-lg border border-white/7 bg-black/20 px-3 py-2 font-mono text-[10px] font-bold text-text-primary">
                {gate.replaceAll("_", " ")}
              </div>
            ))}
          </div>
          <p className="mt-3 font-mono text-[9px] leading-4 text-amber-300">CoinSwitch, UnoCoin and ZebPay remain excluded from this LIVE pool. No transfer or withdrawal is automatic.</p>
        </div>
      ) : null}

      {readinessWaterfall ? (
        <div className="border-t border-border-default bg-[#050d16] px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="max-w-3xl">
              <p className="font-mono text-[9px] font-bold tracking-[.16em] text-cyan-300">REAL ORDER READINESS WATERFALL</p>
              <p className="mt-1 text-sm font-semibold text-text-primary">Every independent gate, in execution order</p>
              <p className="mt-2 text-xs leading-5 text-text-muted">
                Policy and settings never grant order authority. Runtime confirmations, paused PAPER, a dynamic arm, account lease, current exact-route preflight, one-time authority and final last-look are separate fail-closed stages.
              </p>
            </div>
            <span className={`rounded-full border px-2.5 py-1 font-mono text-[9px] font-bold ${readinessWaterfall.operationalState.startsWith("BLOCKED") ? "border-red-400/30 bg-red-400/10 text-red-300" : "border-amber-400/30 bg-amber-400/10 text-amber-300"}`}>
              {readinessWaterfall.operationalState.replaceAll("_", " ")}
            </span>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {readinessWaterfall.stages.map((stage, index) => (
              <div key={stage.key} className={`rounded-xl border p-3 ${stage.state === "PASS" ? "border-emerald-400/20 bg-emerald-400/[0.04]" : stage.state === "BLOCKED" ? "border-red-400/20 bg-red-400/[0.04]" : "border-amber-400/20 bg-amber-400/[0.04]"}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[9px] font-bold text-text-muted">{String(index + 1).padStart(2, "0")}</span>
                  <span className={`font-mono text-[9px] font-bold ${stage.state === "PASS" ? "text-emerald-300" : stage.state === "BLOCKED" ? "text-red-300" : "text-amber-300"}`}>{stage.state}</span>
                </div>
                <p className="mt-2 font-mono text-[9px] font-bold leading-4 text-text-primary">{stage.key.replaceAll("_", " ")}</p>
                <p className="mt-1 text-[10px] leading-4 text-text-muted">{stage.summary}</p>
                {stage.reasons[0] ? <p className="mt-2 text-[9px] leading-4 text-amber-200/75">{stage.reasons[0]}</p> : null}
              </div>
            ))}
          </div>
          <p className="mt-3 font-mono text-[9px] leading-4 text-text-muted">
            FIRST INCOMPLETE: {readinessWaterfall.firstIncompleteStage?.replaceAll("_", " ") ?? "NONE"} · THIS REPORT IS READ-ONLY AND CANNOT ARM, LEASE, AUTHORIZE OR SUBMIT.
          </p>
        </div>
      ) : null}

      <div className="grid gap-px border-t border-border-default bg-border-default sm:grid-cols-2 xl:grid-cols-4">
        <ActivityMetric
          label="Trading account mode"
          value={accountLease?.accountMode ?? "UNKNOWN"}
          detail={accountLease?.accountMode === "LIVE"
            ? "Bounded route lease only · not general LIVE"
            : "Safe default · no real order can pass account gate"}
          tone={accountLease?.accountMode === "LIVE" ? "warning" : "positive"}
        />
        <ActivityMetric
          label="Account-mode lease"
          value={activeAccountLease?.state ?? "NOT ACTIVE"}
          detail={activeAccountLease
            ? `Auto PAPER restore by ${formatTime(activeAccountLease.expiresAt)}`
            : active
              ? "Separate exact account-mode confirmation required"
              : "No route-bound lease exists"}
          tone={activeAccountLease ? "warning" : "default"}
        />
        <ActivityMetric
          label="Lease binding"
          value={activeAccountLease ? activeAccountLease.market : "NO LEASE"}
          detail={activeAccountLease
            ? `${activeAccountLease.buyExchange.toUpperCase()} BUY → ${activeAccountLease.sellExchange.toUpperCase()} SELL`
            : "Cannot be reused for another arm or route"}
        />
        <ActivityMetric
          label="Lease safety"
          value={accountLease?.lastReconciliationError ? "FAIL-CLOSED" : "HEALTHY"}
          detail={accountLease?.lastReconciliationError ?? "Journal-first · no transfer · no withdrawal"}
          tone={accountLease?.lastReconciliationError ? "negative" : "positive"}
        />
      </div>

      <div className="grid gap-px border-t border-border-default bg-border-default lg:grid-cols-2">
        <div className="bg-panel px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-mono text-[9px] font-bold tracking-[.16em] text-cyan-300">PAPER AUTOMATION</p>
              <p className="mt-1 text-sm font-semibold text-text-primary">Separate PAPER execution toggle</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={paperBotEnabled}
              disabled={paperControlLocked}
              onClick={() => onPaperControlChange(!paperBotEnabled)}
              className={`flex min-w-32 items-center justify-between gap-3 rounded-xl border px-3 py-2 transition disabled:cursor-not-allowed disabled:opacity-50 ${paperBotEnabled ? "border-emerald-400/35 bg-emerald-400/10 text-emerald-300" : "border-slate-600 bg-slate-800/70 text-slate-300"}`}
            >
              <Power className="size-4" />
              <span className="font-mono text-[10px] font-bold">PAPER {paperBotEnabled ? "ON" : "OFF"}</span>
            </button>
          </div>
          <p className="mt-3 text-xs leading-5 text-text-muted">
            Turn PAPER OFF before arming Tiny-LIVE. After disarm or lease restoration, account mode returns to PAPER but simulated execution stays paused until you turn this control ON.
          </p>
          {paperBotEnabled && !active ? (
            <p className="mt-2 font-mono text-[10px] text-amber-300">Pause PAPER first to unlock the Tiny-LIVE arm button.</p>
          ) : null}
        </div>

        <div className="bg-panel px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-mono text-[9px] font-bold tracking-[.16em] text-amber-300">TINY-LIVE ACCOUNT LEASE</p>
              <p className="mt-1 text-sm font-semibold text-text-primary">
                {activeAccountLease ? "Restore PAPER mode" : active ? "Activate bounded route-pool lease" : "Arm the dynamic route pool first"}
              </p>
            </div>
            <span className={`rounded-full border px-2.5 py-1 font-mono text-[9px] font-bold ${activeAccountLease ? "border-amber-400/30 bg-amber-400/10 text-amber-300" : "border-border-default bg-panel-light text-text-muted"}`}>
              {activeAccountLease ? "LIVE LEASE ACTIVE" : "NO LIVE LEASE"}
            </span>
          </div>

          {leasePhrase ? (
            <>
              <p className="mt-3 break-all font-mono text-[9px] leading-4 text-text-muted">TYPE EXACTLY: {leasePhrase}</p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  value={leaseConfirmation}
                  onChange={(event) => onLeaseConfirmationChange(event.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  aria-label={activeAccountLease ? "Exact PAPER restore confirmation" : "Exact Tiny-LIVE lease activation confirmation"}
                  className="min-w-0 flex-1 rounded-lg border border-border-default bg-panel-light px-3 py-2 font-mono text-[10px] text-text-primary outline-none transition focus:border-cyan-300/40"
                />
                <button
                  type="button"
                  onClick={activeAccountLease ? onRestorePaper : onActivateLease}
                  disabled={activeAccountLease ? !canRestorePaper : !canActivateLease}
                  className={`rounded-lg border px-4 py-2 text-xs font-bold transition disabled:cursor-not-allowed disabled:border-border-default disabled:bg-panel-light disabled:text-text-muted ${activeAccountLease ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-200" : "border-amber-400/30 bg-amber-400/10 text-amber-300"}`}
                >
                  {activeAccountLease
                    ? restoringPaper ? "Restoring…" : "Restore PAPER"
                    : activatingLease ? "Activating…" : "Activate Tiny-LIVE"}
                </button>
              </div>
            </>
          ) : (
            <p className="mt-3 text-xs leading-5 text-text-muted">This control appears only after a durable route-bound arm exists. It cannot activate general LIVE mode.</p>
          )}
        </div>
      </div>

      <div className="border-t border-border-default bg-panel px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className="font-mono text-[9px] font-bold tracking-[.16em] text-cyan-300">AUTOMATIC EXACT-ROUTE TIMING</p>
            <p className="mt-1 text-sm font-semibold text-text-primary">No per-coin approval is required</p>
            <p className="mt-2 text-xs leading-5 text-text-muted">
              The dynamic pool recomputes timing qualification from the selected route's genuine evidence during preview and again during final authorization. A route with immature timing remains blocked, but it never asks for a separate operator phrase.
            </p>
          </div>
          <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 font-mono text-[9px] font-bold text-emerald-300">
            POOL-SCOPED
          </span>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <MiniEvidence label="Operator approval" value="DYNAMIC ARM ONCE" />
          <MiniEvidence label="Timing qualification" value="AUTOMATIC / VENUE LANE" />
          <MiniEvidence label="Safety ceiling" value="≤ 300 ms" />
        </div>
      </div>

      <div className="border-t border-cyan-300/15 bg-cyan-300/[0.025] px-5 py-3 text-xs leading-5 text-text-muted">
        <strong className="font-mono text-cyan-200">SEPARATE EVIDENCE:</strong>
        <span className="ml-2">PAPER settlements remain in PaperTradeStore and Trade Intelligence. Tiny-LIVE attempts remain in the LIVE session, order, fill, settlement and pre-arm journals shown below. Their counts and P&amp;L are never merged.</span>
      </div>

      <div className="grid gap-4 px-5 py-4 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          {active ? (
            <>
              <p className="font-mono text-[10px] font-bold text-emerald-300">
                ARMED {active.routeScope === "DYNAMIC_POOL" ? "DYNAMIC USDT ROUTE POOL" : `${active.market} · ${active.buyExchange.toUpperCase()} → ${active.sellExchange.toUpperCase()}`}
              </p>
              <p className="mt-1 text-xs leading-5 text-text-muted">
                The highest-net current eligible USDT route is considered, but its exact market and direction must independently pass credible history, permissions, clocks, balances, minimum order, depth, fees, stress profit and final last-look. CoinDCX uses its audited bounded-GTC contract; Binance/Bybit remain FOK.
              </p>
            </>
          ) : (
            <label className="flex cursor-pointer items-start gap-3 text-xs leading-5 text-text-muted">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(event) => onAcknowledgedChange(event.target.checked)}
                className="mt-1 size-4 rounded border-border-default bg-panel-light accent-emerald-400"
              />
              <span>
                I understand that arming submits no order now. {armAttempts !== null ? (
                  <>During the next 3 hours, up to {armAttempts} fully-qualified current USDT routes can each submit one real ₹{formatInteger(diagnostics?.routePool.capitalPerLegInr ?? capitalPerLegInr)} target attempt, with a hard ₹{formatInteger(diagnostics?.routePool.maximumCapitalPerLegInr ?? 1000)} minimum-order ceiling per leg.</>
                ) : (
                  <>The daily Tiny-LIVE cap is exhausted and stays unavailable until {formatIstTime(dailyAttemptBudget?.resetsAt ?? 0)} IST.</>
                )} Every exact route gets credible-history, inventory, timing, minimum-order, fee, depth and last-look checks; any failed, partial, unknown or exposed result stops the remaining batch. LIVE OFF never resets consumed daily attempts.
              </span>
            </label>
          )}

          {!active && diagnostics?.runtimeGateEnabled === false ? (
            <p className="mt-2 font-mono text-[10px] text-amber-300">
              Locked safely: runtime is not in explicitly enabled Strategy #1 Tiny-LIVE mode.
            </p>
          ) : null}

          {!active && diagnostics?.runtimeGateEnabled === true && paperBotEnabled ? (
            <p className="mt-2 font-mono text-[10px] text-amber-300">
              Arm locked: turn PAPER OFF, then tick the acknowledgment.
            </p>
          ) : !active && !paperBotEnabled && armAttempts === null ? (
            <p className="mt-2 font-mono text-[10px] text-amber-300">
              Daily route-pool budget: {dailyAttemptBudget?.remainingDailyAttempts ?? 0} remaining · next reset {formatIstTime(dailyAttemptBudget?.resetsAt ?? 0)} IST. LIVE OFF does not reset consumed attempts.
            </p>
          ) : !active && !paperBotEnabled && !acknowledged ? (
            <p className="mt-2 font-mono text-[10px] text-amber-300">
              Arm locked: tick the acknowledgment to enable the {armAttempts}-attempt batch.
            </p>
          ) : null}

          {diagnostics?.lastEvaluation ? (
            <p className="mt-2 font-mono text-[9px] text-text-muted">
              LATEST CANDIDATE {diagnostics.lastEvaluation.outcome} · {diagnostics.lastEvaluation.reason}
            </p>
          ) : recent && recent.state !== "ARMED" ? (
            <p className="mt-2 font-mono text-[9px] text-text-muted">
              LAST ARM {recent.state}{recent.executionStatus ? ` · ${recent.executionStatus}` : ""}
            </p>
          ) : null}

          {lastActionTimeRefresh ? (
            <div className="mt-2 rounded-lg border border-amber-300/15 bg-amber-300/[0.035] px-3 py-2 font-mono text-[9px] leading-4 text-text-muted">
              <p className="font-bold text-amber-200">
                LAST ACTION-TIME {lastActionTimeRefresh.state} · {lastActionTimeRefresh.route.market} {lastActionTimeRefresh.route.buyExchange.toUpperCase()} BUY → {lastActionTimeRefresh.route.sellExchange.toUpperCase()} SELL · {lastActionTimeRefresh.durationMs} ms
              </p>
              <p className="mt-1">
                {lastActionTimeRefresh.blocker ?? "Fresh exact-route books passed and the full preflight continued."}
              </p>
              {lastActionTimeRefresh.legs.length > 0 ? (
                <p className="mt-1">
                  LEGS {lastActionTimeRefresh.legs.map((leg) => `${leg.exchange.toUpperCase()} ${leg.accepted ? `${leg.roundTripMs} ms` : `BLOCKED: ${leg.error ?? "no fresh book"}`}`).join(" · ")}
                </p>
              ) : null}
            </div>
          ) : null}

          {diagnostics?.pipelineTelemetry ? (
            <div className="mt-3 flex flex-wrap gap-2 font-mono text-[9px] text-text-muted">
              <span>CANDIDATES {diagnostics.pipelineTelemetry.candidatesEvaluated}</span>
              <span>· FINAL BLOCKS {diagnostics.pipelineTelemetry.preflightBlocks}</span>
              <span>· HISTORY SKIPS {diagnostics.pipelineTelemetry.historicalMismatchesSkipped ?? 0}</span>
              <span>· REFRESH {diagnostics.pipelineTelemetry.refreshesRecovered}/{diagnostics.pipelineTelemetry.refreshesRequested}</span>
              <span>· COORDINATOR STARTS {diagnostics.pipelineTelemetry.coordinatorStarts}</span>
            </div>
          ) : null}
        </div>

        {active ? (
          <button
            type="button"
            onClick={onDisarm}
            disabled={disarming || diagnostics?.triggerInProgress}
            className="rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-2.5 text-xs font-bold text-red-300 transition hover:bg-red-400/15 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {disarming ? "Disarming…" : diagnostics?.triggerInProgress ? "Trigger in progress" : "Disarm batch"}
          </button>
        ) : (
          <button
            type="button"
            onClick={onArm}
            disabled={!canArm}
            className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-4 py-2.5 text-xs font-bold text-emerald-300 transition hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:border-border-default disabled:bg-panel-light disabled:text-text-muted"
          >
            {arming
              ? "Arming durably…"
              : armAttempts !== null
                ? `Arm dynamic USDT pool · ${armAttempts} attempts / 3 hours`
                : `Route pool unavailable · ${dailyAttemptBudget?.remainingDailyAttempts ?? 0} daily slots remain`}
          </button>
        )}
      </div>

      <div className="border-t border-border-default px-5 py-4">
        <div className="grid gap-3 lg:grid-cols-[1.15fr_.85fr]">
          <div className="rounded-xl border border-cyan-300/15 bg-cyan-300/[0.035] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
            <p className="font-mono text-[9px] font-bold tracking-[.16em] text-cyan-300">LIVE AUDITED OPPORTUNITY</p>
                <p className="mt-1 text-sm font-semibold text-text-primary">
                  {candidateMatchesRoute && candidate ? `${candidate.market} · ${candidate.buyExchange.toUpperCase()} BUY → ${candidate.sellExchange.toUpperCase()} SELL` : "Waiting for a qualified dynamic route"}
                </p>
              </div>
              <span className={`rounded-full border px-2.5 py-1 font-mono text-[9px] font-bold ${candidateMatchesRoute && candidate?.readyForOperatorPreflight ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-amber-400/30 bg-amber-400/10 text-amber-300"}`}>
                {candidateMatchesRoute && candidate?.readyForOperatorPreflight ? "QUALIFIED NOW" : "WAITING / BLOCKED"}
              </span>
            </div>

            {candidateMatchesRoute && candidate ? (
              <>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <MiniEvidence label="Book age" value={`${candidate.ageMs} ms`} />
                  <MiniEvidence label="Current net" value={`${candidate.currentNetProfitPercent.toFixed(4)}%`} />
                  <MiniEvidence label="Economic stress net" value={candidate.stress?.postStressNetProfitPercent === null || candidate.stress?.postStressNetProfitPercent === undefined ? "NO DATA" : `${candidate.stress.postStressNetProfitPercent.toFixed(4)}%`} />
                  <MiniEvidence label="Cash after TDS" value={candidate.stress?.deployableCashPostStressNetProfitPercent === null || candidate.stress?.deployableCashPostStressNetProfitPercent === undefined ? "NO DATA" : `${candidate.stress.deployableCashPostStressNetProfitPercent.toFixed(4)}%`} />
                  <MiniEvidence label="TDS lock (USDT)" value={candidate.stress?.statutoryCashWithholding === null || candidate.stress?.statutoryCashWithholding === undefined ? "NO DATA" : formatNumber(candidate.stress.statutoryCashWithholding)} />
                  <MiniEvidence label="Quantity" value={candidate.stress?.quantity ? formatNumber(candidate.stress.quantity) : "NO DATA"} />
                </div>
                <p className="mt-3 break-all font-mono text-[9px] text-text-muted">ID {candidate.opportunityId}</p>
                {blockedChecks.length > 0 ? (
                  <div className="mt-3 space-y-1">
                    {blockedChecks.slice(0, 3).map((check) => (
                      <p key={check.key} className="text-[10px] leading-4 text-amber-300">{check.key.replaceAll("_", " ")}: {check.reasons[0] ?? check.message}</p>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-[10px] text-emerald-300">All current preview checks passed. Final action-time checks still run before every order.</p>
                )}
              </>
            ) : (
              <p className="mt-3 text-xs leading-5 text-text-muted">No current qualified route in the dynamic USDT pool. This is normal between genuine cross-exchange spreads; no order is created from stale or unrelated evidence.</p>
            )}
          </div>

          <div className="rounded-xl border border-border-default bg-panel-light/40 p-4">
            <p className="font-mono text-[9px] font-bold tracking-[.16em] text-cyan-300">EXECUTION RESULTS</p>
            {recoveryIsClean && latestRecoveryResolution ? (
              <div className="mt-3 rounded-lg border border-emerald-400/25 bg-emerald-400/[0.06] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-[9px] font-bold text-emerald-300">AUTHORITATIVE RECOVERY CLEAN</span>
                  <span className="font-mono text-[9px] text-emerald-200/80">{latestRecoveryResolution.basis.replaceAll("_", " ")}</span>
                </div>
                <p className="mt-1 text-[10px] leading-4 text-text-muted">
                  Latest resolved session: BUY {formatNumber(latestRecoveryResolution.buyFilledQuantity)} · SELL {formatNumber(latestRecoveryResolution.sellFilledQuantity)} · {latestRecoveryResolution.terminalStatuses.join(" / ")}. No automatic exchange order action was performed.
                </p>
                <p className="mt-1 text-[9px] leading-4 text-emerald-200/70">The red card below is the immutable original attempt outcome; this recovery record is the current authoritative journal state.</p>
              </div>
            ) : null}
            {attempts.length > 0 ? (
              <div className="mt-3 space-y-2">
                {attempts.map((attempt) => (
                  <div key={`${attempt.attemptNumber}-${attempt.opportunityId}`} className={`rounded-lg border p-3 ${attempt.success ? "border-emerald-400/20 bg-emerald-400/[0.04]" : "border-red-400/20 bg-red-400/[0.04]"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[10px] font-bold text-text-primary">ATTEMPT {attempt.attemptNumber}{attempt.market ? ` · ${attempt.market}` : ""}</span>
                      <span className={`font-mono text-[9px] font-bold ${attempt.success ? "text-emerald-300" : "text-red-300"}`}>{attempt.success ? "SUCCESS" : recoveryIsClean ? "ORIGINAL FAILED SAFE" : "FAILED SAFE"} · {attempt.executionStatus}</span>
                    </div>
                    <p className="mt-1 text-[10px] leading-4 text-text-muted">{attempt.reason}</p>
                    {(attempt.reasons?.length ?? 0) > 1 ? (
                      <ul className="mt-2 space-y-1 border-l border-red-300/20 pl-3 text-[10px] leading-4 text-amber-200/80">
                        {attempt.reasons?.slice(1).map((reason, index) => (
                          <li key={`${attempt.attemptNumber}-reason-${index}`}>{reason}</li>
                        ))}
                      </ul>
                    ) : null}
                    <p className="mt-1 font-mono text-[9px] text-text-muted">{attempt.buyExchange && attempt.sellExchange ? `${attempt.buyExchange.toUpperCase()} BUY → ${attempt.sellExchange.toUpperCase()} SELL · ` : ""}BUY {attempt.buyStatus ?? "—"} · SELL {attempt.sellStatus ?? "—"} · matched {attempt.matchedFilledQuantity === null ? "—" : formatNumber(attempt.matchedFilledQuantity)} · {attempt.executionTimeMs === null ? "—" : `${attempt.executionTimeMs} ms`}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-xs leading-5 text-text-muted">No real attempt recorded for this batch yet. Success or fail, exchange-leg status, matched quantity, timing and reason will appear here.</p>
            )}
          </div>
        </div>
      </div>

      {error ? (
        <p className="border-t border-red-400/20 bg-red-400/7 px-5 py-3 text-xs text-red-300">
          Ten-slot control failed closed: {apiErrorMessage(error)}
        </p>
      ) : null}
    </article>
  );
}

function StrategyOneTinyLiveOpportunityAuditPanel({
  audit,
  loading,
  error,
  onRefresh,
}: {
  audit: StrategyOneTinyLiveOpportunityAuditReport | null;
  loading: boolean;
  error: Error | null;
  onRefresh: () => void;
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const actionableNow = (audit?.currentActionTime.fullyPreflightableMatches ?? 0) > 0;
  const currentRoute = actionableNow
    ? audit?.routeRanking.find((route) =>
        route.routeKey === audit.currentActionTime.selectedRouteKey) ?? null
    : null;
  const stateTone = actionableNow
    ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
    : "border-amber-400/30 bg-amber-400/10 text-amber-300";
  const topBlockers = audit?.blockerRanking.slice(0, 4) ?? [];
  const topRoutes = audit?.routeRanking.slice(0, 6) ?? [];

  return (
    <article className="overflow-hidden rounded-2xl border border-cyan-300/18 bg-panel">
      <PanelHeader
        icon={<Target className="size-4" />}
        eyebrow="CURRENT ACTION-TIME EVIDENCE"
        title="Tiny-LIVE gate right now"
        right={(
          <div className="flex items-center gap-2">
            <span className={`rounded-full border px-2.5 py-1 font-mono text-[9px] font-bold ${stateTone}`}>
              {loading ? "LOADING" : actionableNow ? "ACTIONABLE NOW" : "WAITING / BLOCKED"}
            </span>
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              aria-label="Refresh Tiny-LIVE opportunity audit"
              className="grid size-8 place-items-center rounded-lg border border-border-default bg-panel-light text-text-muted transition hover:text-cyan-200 disabled:cursor-wait disabled:opacity-50"
            >
              <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        )}
      />

      {audit ? (
        <>
          <div className="grid gap-px bg-border-default sm:grid-cols-3">
            <ActivityMetric
              label="Current qualified routes"
              value={formatInteger(audit.currentActionTime.fullyPreflightableMatches)}
              detail="Current exact USDT routes passing the complete preflight"
              tone={actionableNow ? "positive" : "warning"}
            />
            <ActivityMetric
              label="Dynamic candidate now"
              value={currentRoute ? currentRoute.market : "NO QUALIFIED ROUTE"}
              detail={currentRoute
                ? `${currentRoute.buyExchange.toUpperCase()} BUY → ${currentRoute.sellExchange.toUpperCase()} SELL`
                : "Scanning current USDT directions; no coin is pinned"}
              tone={currentRoute ? "positive" : "warning"}
            />
            <ActivityMetric
              label="Current gate"
              value={audit.currentActionTime.state.replaceAll("_", " ")}
              detail={audit.currentActionTime.blockers[0] ?? "All current categories passed"}
              tone={actionableNow ? "positive" : "warning"}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-border-default bg-[#07111d] px-5 py-3">
            <span className="mr-1 font-mono text-[9px] font-bold tracking-[0.12em] text-cyan-200">DYNAMIC SCOPE</span>
            {(["USDT markets", "Binance", "Bybit", "CoinDCX", "Exact-route history", "Fresh inventory"] as const).map((label) => (
              <span key={label} className="rounded-full border border-border-default bg-panel-light px-2.5 py-1 font-mono text-[9px] font-bold text-text-muted">
                {label}
              </span>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-default bg-[#07111d] px-5 py-3">
            <p className="text-xs text-text-muted">
              Historical observations explain route quality; they are not attempts, orders, fills or profit.
            </p>
            <button
              type="button"
              onClick={() => setHistoryOpen((value) => !value)}
              className="rounded-lg border border-border-default bg-panel-light px-3 py-2 font-mono text-[9px] font-bold text-cyan-200 transition hover:border-cyan-300/30"
            >
              {historyOpen ? "Hide historical audit" : "Show historical audit"}
            </button>
          </div>

          {historyOpen ? (
            <>
          <div className="grid gap-px bg-border-default sm:grid-cols-2 xl:grid-cols-5">
            <ActivityMetric
              label="Unique economics"
              value={formatInteger(audit.observation.economicsGenerations)}
              detail={`${formatAuditSpan(audit.observation.wallClockSpanMs)} audit window · ${
                audit.observation.idleSinceLastObservationMs === null
                  ? "no sample yet"
                  : `${formatAuditSpan(audit.observation.idleSinceLastObservationMs)} since latest sample`
              }`}
            />
            <ActivityMetric
              label={`Discovery ≥${audit.thresholds.discoveryNetProfitPercent.toFixed(2)}%`}
              value={formatInteger(audit.observation.profitBands.discovered)}
              detail="below qualification band"
            />
            <ActivityMetric
              label={`Intermediate band ≥${audit.thresholds.qualificationNetProfitPercent.toFixed(2)}%`}
              value={formatInteger(audit.observation.profitBands.qualified)}
              detail="empty when qualification and LIVE floors match"
              tone="warning"
            />
            <ActivityMetric
              label={`Current LIVE evidence ≥${audit.thresholds.liveNetProfitPercent.toFixed(2)}%`}
              value={formatInteger(audit.observation.profitBands.liveEligible)}
              detail={`same active gate ≥${audit.thresholds.activeTinyLiveNetProfitPercent.toFixed(2)}%`}
              tone={audit.observation.profitBands.liveEligible > 0 ? "positive" : "warning"}
            />
            <ActivityMetric
              label="Historical dispatch-ready observations"
              value={formatInteger(audit.observation.dispatchReservedLiveEligibleGenerations)}
              detail={`not attempts/orders · books ≤${formatInteger(audit.thresholds.dispatchReservedMaximumBookAgeMs)} ms`}
              tone={audit.observation.dispatchReservedLiveEligibleGenerations > 0 ? "positive" : "warning"}
            />
          </div>

          <div className="grid gap-px bg-border-default xl:grid-cols-[1.2fr_.8fr]">
            <div className="min-w-0 bg-panel px-5 py-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-[9px] font-bold tracking-[0.13em] text-cyan-200">STRATEGY #1 PILOT ROUTE RANKING</p>
                  <p className="mt-1 text-xs text-text-muted">Unique post-orchestrator generations; repeated quote snapshots are ignored.</p>
                </div>
                <span className="font-mono text-[9px] text-text-muted">TOP {topRoutes.length}</span>
              </div>
              {topRoutes.length > 0 ? (
                <div className="mt-4 overflow-x-auto">
                  <div className="min-w-[760px]">
                    <div className="grid grid-cols-[.35fr_1fr_1.35fr_.65fr_.65fr_.65fr_1fr] gap-3 border-b border-border-default pb-2 text-[8px] font-bold uppercase tracking-[0.1em] text-text-muted">
                      <span>#</span><span>Market</span><span>Route</span><span>LIVE</span><span>Fresh LIVE</span><span>P95 net</span><span>Dominant blocker</span>
                    </div>
                    {topRoutes.map((route) => (
                      <div key={route.routeKey} className="grid grid-cols-[.35fr_1fr_1.35fr_.65fr_.65fr_.65fr_1fr] items-center gap-3 border-b border-border-default/70 py-3 text-[10px] last:border-0">
                        <span className="font-mono text-text-muted">{route.rank}</span>
                        <div><p className="font-mono font-bold text-text-primary">{route.market}</p><p className={`mt-0.5 font-mono text-[8px] ${route.current ? "text-emerald-300" : "text-text-muted"}`}>{route.current ? "CURRENT" : timeAgo(route.lastObservedAt)}</p></div>
                        <span className="font-semibold capitalize text-text-primary">{route.buyExchange} → {route.sellExchange}</span>
                        <span className="font-mono font-bold text-cyan-200">{formatInteger(route.liveEligibleGenerations)}</span>
                        <span className="font-mono font-bold text-emerald-300">{formatInteger(route.dispatchReservedLiveEligibleGenerations)}</span>
                        <span className="font-mono text-text-primary">{route.p95NetProfitPercent === null ? "—" : `${route.p95NetProfitPercent.toFixed(3)}%`}</span>
                        <span className="truncate font-mono text-[8px] text-amber-300" title={route.dominantBlocker ?? "No counted blocker"}>{route.dominantBlocker?.replaceAll("_", " ") ?? "NONE COUNTED"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <EmptyState title="Collecting fresh economics" detail="This deployment starts a truthful economics cohort from new unique audited pilot-route quote generations; no historical profit sample is fabricated." />
              )}
            </div>

            <div className="min-w-0 bg-panel px-5 py-5">
              <p className="font-mono text-[9px] font-bold tracking-[0.13em] text-amber-200">COUNTED BLOCKERS</p>
              <div className="mt-3 space-y-2">
                {topBlockers.length > 0 ? topBlockers.map((blocker) => (
                  <div key={blocker.code} className="rounded-lg border border-border-default bg-panel-light/40 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-mono text-[9px] font-bold text-text-primary">{blocker.rank}. {blocker.code.replaceAll("_", " ")}</p>
                      <span className="rounded border border-amber-300/20 bg-amber-300/8 px-2 py-0.5 font-mono text-[9px] font-bold text-amber-200">{formatInteger(blocker.count)}</span>
                    </div>
                    <p className="mt-1.5 text-[10px] leading-4 text-text-muted">{blocker.detail}</p>
                  </div>
                )) : <p className="rounded-lg border border-border-default bg-panel-light/40 p-3 text-xs text-text-muted">No blocker count is available yet.</p>}
              </div>
            </div>
          </div>
            </>
          ) : null}

          <div className="border-t border-border-default px-5 py-4">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
              {audit.currentActionTime.categories.map((category) => (
                <div key={category.category} className={`rounded-lg border p-3 ${auditCategoryTone(category.state)}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[8px] font-bold text-text-muted">{category.category.replaceAll("_", " ")}</span>
                    <span className="font-mono text-[8px] font-bold">{category.state.replaceAll("_", " ")}</span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-[9px] leading-4 text-text-muted">{category.reasons[0] ?? "No current candidate reached this check."}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 font-mono text-[9px] text-text-muted">
              READ ONLY · policy unchanged · no capital reserved · no fund movement · no LIVE session · no order submission
            </p>
          </div>
        </>
      ) : (
        <EmptyState title={error ? "Tiny-LIVE audit unavailable" : "Loading Tiny-LIVE audit"} detail={error?.message ?? "Waiting for the read-only audit endpoint."} />
      )}
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
        eyebrow="V115 ACTION-TIME PILOT GATE"
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
        A route appears here only when a fresh EXECUTE opportunity matches durable credible history and preserves measured dispatch plus operational timing headroom inside the operator-reviewed 300 ms ceiling. Exact ₹100 sizing then reuses authenticated two-leg balances, exchange order rules, quantity normalization and post-stress depth/fee/slippage checks.
      </div>

      {preview ? (
        <>
          <div className="grid gap-px bg-border-default sm:grid-cols-2 xl:grid-cols-4">
            <ActivityMetric label="Binance/Bybit EXECUTE now" value={formatInteger(preview.evidence.currentFreshExecuteOpportunities)} detail={`Dispatch-ready ≤${formatInteger(preview.maximumDispatchReservedBookAgeMs)} ms · absolute ceiling ${formatInteger(preview.maximumExecutionGradeBookAgeMs)} ms`} />
            <ActivityMetric label="Audited historical routes" value={formatInteger(preview.evidence.historicalAdapterReadyRoutes)} detail={`${formatInteger(preview.evidence.excludedNonPilotHistoricalRoutes)} non-pilot excluded`} />
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

                <div className="grid grid-cols-2 gap-x-7 gap-y-2 text-right sm:grid-cols-5">
                  <PlacementStat label="Historical settles" value={formatInteger(candidate.historical.uniqueSettlements)} />
                  <PlacementStat label="Timing headroom" value={candidate.timing.residualOperationalHeadroomMs === null ? "NO DATA" : `${formatInteger(candidate.timing.residualOperationalHeadroomMs)} ms`} positive={candidate.timing.state === "READY"} />
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
  const minimumNotionalBlocked = plan.recommendationStatus === "MIN_NOTIONAL_BLOCKED";
  return (
    <article className="overflow-hidden rounded-2xl border border-border-default bg-panel">
      <PanelHeader
        icon={<Route className="size-4" />}
        eyebrow="V87 INVENTORY DEPLOYMENT"
        title={minimumNotionalBlocked
          ? "Wait for the next legal Strategy #1 route"
          : "Fund the best current Strategy #1 route"}
        right={<span className={`rounded-full border px-2.5 py-1 font-mono text-[9px] font-bold ${inventoryPlanStatusTone(plan.recommendationStatus)}`}>{plan.recommendationStatus.replaceAll("_", " ")}</span>}
      />
      <div className="border-b border-border-default px-5 py-3 text-xs leading-5 text-text-muted">
        {minimumNotionalBlocked
          ? "Current wallet balances are sufficient, but the top route cannot meet exchange minimum-order rules inside the configured hard cap. It will be skipped when a legal route appears."
          : "Ranked by modeled PAPER profit from current EXECUTE evidence. Advisory only: no transfer, withdrawal, balance mutation or LIVE order is initiated."}
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
  const currentStages = report.stages.filter((stage) =>
    stage.scope === "CURRENT_SCAN" ||
    stage.scope === "CURRENT_STATE");
  const evidenceStages = report.stages.filter((stage) =>
    stage.scope === "RECENT_5_MIN" ||
    stage.scope === "DURABLE_COHORT");

  return (
    <article className="overflow-hidden rounded-2xl border border-border-default bg-panel">
      <PanelHeader
        icon={<Workflow className="size-4" />}
        eyebrow="V84 PERSONAL BOT CONVERSION"
        title="Opportunity → PAPER execution"
        right={<span className={`rounded-full border px-2.5 py-1 font-mono text-[9px] font-bold ${conversionStatusTone(report.status)}`}>{report.status.replaceAll("_", " ")}</span>}
      />

      <div className="border-b border-border-default p-5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="font-mono text-[9px] font-bold tracking-[0.12em] text-cyan-200">CURRENT SCAN / CURRENT STATE</p>
          <p className="text-[10px] text-text-muted">Counts below belong to one live pipeline snapshot.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-7">
          {currentStages.map((stage, index) => (
            <div key={stage.key} className="relative min-w-0">
              <div className={`h-full rounded-xl border px-3 py-3 ${conversionStageTone(stage.status)}`} title={stage.reason}>
                <div className="flex items-start justify-between gap-2">
                  <span className="font-mono text-xl font-bold text-text-primary">{formatInteger(stage.count)}</span>
                  <span className="font-mono text-[8px] font-bold">{stage.status.replaceAll("_", " ")}</span>
                </div>
                <p className="mt-2 min-h-8 text-[9px] font-semibold uppercase leading-4 tracking-[0.08em] text-text-muted">{stage.label}</p>
                <p className="mt-1 font-mono text-[8px] text-text-muted">{stage.scope.replaceAll("_", " ")}</p>
              </div>
              {index < currentStages.length - 1 ? <ArrowRight className="absolute -right-2.5 top-1/2 z-10 hidden size-3 -translate-y-1/2 text-slate-600 xl:block" /> : null}
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-xl border border-amber-300/15 bg-amber-300/[0.035] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-mono text-[9px] font-bold tracking-[0.12em] text-amber-200">SEPARATE TIME WINDOWS · NOT THIS SCAN&apos;S CONVERSION</p>
            <p className="text-[10px] text-text-muted">Recent attempts and lifetime tagged settlements can stay non-zero when current qualification is zero.</p>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {evidenceStages.map((stage) => (
              <div key={stage.key} className={`rounded-xl border px-3 py-3 ${conversionStageTone(stage.status)}`} title={stage.reason}>
                <div className="flex items-start justify-between gap-2">
                  <span className="font-mono text-xl font-bold text-text-primary">{formatInteger(stage.count)}</span>
                  <span className="font-mono text-[8px] font-bold">{stage.status.replaceAll("_", " ")}</span>
                </div>
                <p className="mt-2 text-[9px] font-semibold uppercase tracking-[0.08em] text-text-muted">{stage.label}</p>
                <p className="mt-1 font-mono text-[8px] text-text-muted">{stage.scope.replaceAll("_", " ")}</p>
              </div>
            ))}
          </div>
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
    <div className="flex items-center gap-2.5"><CoinMark symbol={execution.baseAsset}/><div><p className="font-mono font-bold text-text-primary">{execution.baseAsset}/{execution.quoteAsset}</p><p className="mt-0.5 text-[9px] font-bold text-amber-200">PAPER SIMULATED</p></div></div>
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

function CapitalTruthMetric({label, value, positive}: {label: string; value: string; positive?: boolean}) {
  return <div className="bg-[#07111d] px-4 py-4"><CompactStat label={label} value={value} positive={positive} /></div>;
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

function capitalManagerStateTone(state: PersonalStrategyOneBotData["capitalManager"]["state"]): string {
  if (state === "READY_FOR_PREFLIGHT") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-300";
  if (state === "OPERATOR_ACTION_REQUIRED") return "border-amber-400/25 bg-amber-400/10 text-amber-300";
  if (state === "EVIDENCE_INCOMPLETE" || state === "ORDER_RULE_BLOCKED") return "border-red-400/25 bg-red-400/10 text-red-300";
  return "border-cyan-300/25 bg-cyan-300/8 text-cyan-200";
}

function fundingStateTone(state: "FUNDED" | "REDUCED" | "BLOCKED"): string {
  if (state === "FUNDED") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-300";
  if (state === "REDUCED") return "border-amber-400/25 bg-amber-400/10 text-amber-300";
  return "border-red-400/25 bg-red-400/10 text-red-300";
}

function capitalManagerBalanceTone(status: PersonalStrategyOneBotData["capitalManager"]["venues"][number]["status"]): string {
  if (status === "SYNCHRONIZED") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-300";
  if (status === "FAILED" || status === "STALE") return "border-red-400/25 bg-red-400/10 text-red-300";
  return "border-amber-400/25 bg-amber-400/10 text-amber-300";
}

function capitalManagerActionTone(state: PersonalStrategyOneBotData["capitalManager"]["actions"][number]["state"]): string {
  if (state === "READY") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-300";
  if (state === "ACTION_REQUIRED" || state === "WAITING") return "border-amber-400/25 bg-amber-400/10 text-amber-300";
  return "border-red-400/25 bg-red-400/10 text-red-300";
}

function inventoryPlanStatusTone(status: PersonalStrategyOneBotData["inventoryPlan"]["recommendationStatus"]): string {
  if (status === "READY") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-300";
  if (status === "FUNDING_REQUIRED") return "border-amber-400/25 bg-amber-400/10 text-amber-300";
  if (status === "MIN_NOTIONAL_BLOCKED") return "border-red-400/25 bg-red-400/10 text-red-300";
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

function isSupportedPreArmRoute(route: {
  market: string;
  buyExchange: string;
  sellExchange: string;
}): boolean {
  const market = normalizedMarket(route.market);
  const buy = route.buyExchange.trim().toLowerCase();
  const sell = route.sellExchange.trim().toLowerCase();
  const supportedVenues = new Set(["binance", "bybit", "coindcx"]);

  return market.endsWith("USDT") && market.length >= 7 &&
    market.length <= 24 && buy !== sell && supportedVenues.has(buy) &&
    supportedVenues.has(sell);
}

function isDynamicPoolRoute(route: {
  market: string;
  buyExchange: string;
  sellExchange: string;
}): boolean {
  return isSupportedPreArmRoute(route);
}

function toPreArmRoute(route: {
  market: string;
  buyExchange: string;
  sellExchange: string;
} | null): StrategyOnePreArmRoute | null {
  if (!route || !isSupportedPreArmRoute(route)) {
    return null;
  }

  const buyExchange = route.buyExchange.trim().toLowerCase();
  const sellExchange = route.sellExchange.trim().toLowerCase();

  if (
    (buyExchange !== "binance" && buyExchange !== "bybit" && buyExchange !== "coindcx") ||
    (sellExchange !== "binance" && sellExchange !== "bybit" && sellExchange !== "coindcx")
  ) {
    return null;
  }

  return {
    market: normalizedMarket(route.market),
    buyExchange,
    sellExchange,
  };
}

function routePoolArmPhrase(
  capitalPerLegInr: number,
  maximumCapitalPerLegInr: number,
  maximumAttempts: StrategyOneTinyLiveAttemptCount,
): string {
  return `ARM DYNAMIC-POOL USDT INR${capitalPerLegInr} MAXINR${maximumCapitalPerLegInr} MINORDER-STEPS ATTEMPTS${maximumAttempts} MINUTES180`;
}

function formatIstTime(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return "next IST day";
  }

  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(timestamp);
}

function apiErrorMessage(error: Error): string {
  const responseData = (error as Error & {
    response?: {data?: unknown};
  }).response?.data;

  if (
    responseData &&
    typeof responseData === "object" &&
    "message" in responseData &&
    typeof responseData.message === "string"
  ) {
    return responseData.message;
  }

  return error.message || "Unknown fail-closed error.";
}

function normalizedMarket(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/gu, "");
}

function MiniEvidence({label, value}: {label: string; value: string}) {
  return (
    <div className="rounded-lg border border-border-default bg-panel px-2.5 py-2">
      <p className="font-mono text-[8px] uppercase tracking-[.12em] text-text-muted">{label}</p>
      <p className="mt-1 font-mono text-[11px] font-bold text-text-primary">{value}</p>
    </div>
  );
}

function tinyLiveAuthorityStatus(
  diagnostics: StrategyOneTinyLivePreArmDiagnostics | null,
): {label: string; tone: string} {
  if (!diagnostics) {
    return {
      label: "TINY-LIVE UNKNOWN",
      tone: "border-slate-500/30 bg-slate-500/10 text-slate-300",
    };
  }
  if (diagnostics.activeArm) {
    return {
      label: "TINY-LIVE ARMED",
      tone: "border-red-400/35 bg-red-400/10 text-red-300",
    };
  }
  if (diagnostics.runtimeGateEnabled) {
    return {
      label: "TINY-LIVE DISARMED",
      tone: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
    };
  }
  return {
    label: "TINY-LIVE OFF",
    tone: "border-slate-500/30 bg-slate-500/10 text-slate-300",
  };
}

function auditCategoryTone(state: "PASS" | "BLOCKED" | "NOT_EVALUATED"): string {
  if (state === "PASS") return "border-emerald-400/20 bg-emerald-400/7 text-emerald-300";
  if (state === "BLOCKED") return "border-red-400/20 bg-red-400/7 text-red-300";
  return "border-border-default bg-panel-light/40 text-slate-300";
}

function formatAuditSpan(spanMs: number): string {
  if (spanMs < 60_000) return `${Math.floor(spanMs / 1_000)} sec`;
  if (spanMs < 3_600_000) return `${Math.floor(spanMs / 60_000)} min`;
  return `${(spanMs / 3_600_000).toFixed(1)} hr`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-IN", {maximumFractionDigits: 6}).format(value);
}

function readRequestError(error: unknown): string {
  if (!error) return "Unknown control error.";
  if (typeof error === "string") return error;

  const candidate = error as {
    message?: unknown;
    response?: {
      data?: {
        error?: unknown;
        message?: unknown;
        reason?: unknown;
      };
    };
  };
  const data = candidate.response?.data;
  const serverMessage = data?.message ?? data?.error ?? data?.reason;
  if (typeof serverMessage === "string" && serverMessage.trim()) return serverMessage;
  if (typeof candidate.message === "string" && candidate.message.trim()) return candidate.message;
  return "Unknown control error.";
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
