import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Layers3,
  RefreshCw,
  ShieldCheck,
  Wrench,
  Workflow,
} from "lucide-react";

import {
  useEightStrategyPaperReadiness,
} from "../hooks/useStrategies";

import type {
  EightStrategyPaperGateState,
  EightStrategyPaperOperationalState,
  EightStrategyPaperReadinessResponse,
  EightStrategyPaperReadinessItem,
  EightStrategyRemediationClass,
  CentralPaperLifecycleTrace,
  CentralPaperTraceStageState,
  CentralPaperPlanPrerequisiteState,
} from "../types/EightStrategyPaperReadiness";

type ConvergenceWorkstream = EightStrategyPaperReadinessResponse["data"]["convergence"]["workstreams"][number];
type RemediationReport = EightStrategyPaperReadinessResponse["data"]["remediation"];

export function EightStrategyPaperReadinessPanel({selectedStrategyId}: {selectedStrategyId: string}) {
  const query = useEightStrategyPaperReadiness();
  const report = query.data?.data;

  if (query.isPending && !report) {
    return (
      <PanelState
        icon={<RefreshCw className="size-5 animate-spin" />}
        title="Loading unified PAPER readiness"
        detail="Correlating all eight controllers with actual admission, intake, queue and soak evidence."
      />
    );
  }

  if (query.isError || !report) {
    return (
      <PanelState
        danger
        icon={<AlertTriangle className="size-5" />}
        title="Unified PAPER readiness unavailable"
        detail="No strategy is inferred ready while the authoritative readiness endpoint is unavailable."
      />
    );
  }

  const selected = report.strategies.find((item) => item.strategyId === selectedStrategyId) ?? report.strategies[0];

  return (
    <section className="overflow-hidden rounded-xl border border-border-default bg-panel">
      <div className="border-b border-border-default p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-brand">
              <Workflow className="size-5" />
              <p className="text-xs font-semibold uppercase tracking-[0.16em]">
                V79.0 Stable Venue Failover
              </p>
            </div>
            <h2 className="mt-2 text-xl font-bold text-text-primary">
              Prioritized blocker convergence for all strategies
            </h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-text-muted">
              Strategy #2 now requires consecutive qualification and minimum dwell, keeps a healthy active route sticky, and fails closed through a cooldown before any venue failover.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <DecisionBadge decision={report.decision} />
            <button
              type="button"
              aria-label="Refresh eight-strategy PAPER readiness"
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
              className="rounded-md border border-border-default bg-panel-light p-2 text-text-muted hover:text-text-primary disabled:opacity-60"
            >
              <RefreshCw className={`size-4 ${query.isFetching ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <Metric label="Registered" value={report.summary.registered} suffix="/8" />
          <Metric label="Running" value={report.summary.running} suffix="/8" />
          <Metric label="Operationally unblocked" value={report.summary.operationallyUnblocked} suffix="/8" tone="success" />
          <Metric label="Action blocked" value={report.summary.blocked} tone={report.summary.blocked > 0 ? "danger" : "success"} />
          <Metric label="PAPER active" value={report.summary.paperActive} />
          <Metric label="Soak accepted" value={report.summary.soakAccepted} suffix="/8" />
        </div>
      </div>

      <div className="space-y-5 p-5">
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <PipelineFact label="Operator / allow-list"
            value={`${report.centralPipeline.allowedStrategies}/${report.centralPipeline.targetCentralStrategies}`}
            passed={report.centralPipeline.operatorEnabled && report.centralPipeline.confirmationPresent &&
              report.centralPipeline.allowedStrategies === report.centralPipeline.targetCentralStrategies} />
          <PipelineFact label="Admission / intake"
            value={`${report.centralPipeline.admissionRunning ? "UP" : "DOWN"} / ${report.centralPipeline.intakeRunning ? "UP" : "DOWN"}`}
            passed={report.centralPipeline.admissionRunning && report.centralPipeline.intakeRunning} />
          <PipelineFact label="Worker / active queue"
            value={`${report.centralPipeline.workerReady ? "READY" : "BLOCKED"} / ${report.centralPipeline.activeQueue}`}
            passed={report.centralPipeline.workerReady} />
          <PipelineFact label="Accounting / capital pending"
            value={`${report.centralPipeline.accountingPending} / ${report.centralPipeline.capitalReconciliationPending}`}
            passed={report.centralPipeline.accountingPending === 0 && report.centralPipeline.capitalReconciliationPending === 0} />
        </section>

        <AcceptanceFlow report={report.acceptanceFlow} />

        <RemediationBoard report={report.remediation} />

        {selectedStrategyId === "cross-exchange-market-making" && report.venueRouting
          ? <VenueRoutingBoard report={report.venueRouting} />
          : null}

        {selectedStrategyId === "cross-exchange-market-making" && report.inventoryRouting
          ? <InventoryRoutingBoard report={report.inventoryRouting} />
          : null}

        {report.lifecycleTrace ? <LifecycleTraceBoard report={report.lifecycleTrace}
          selectedStrategyId={selectedStrategyId} /> : null}

        <ConvergenceBoard report={report.convergence} />

        {selected ? <SelectedClosure item={selected} /> : null}

        <section>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.13em] text-text-muted">
                Unified per-strategy gate matrix
              </p>
              <p className="mt-1 text-xs text-text-muted">
                The highlighted row follows the strategy selected above. Every action names its evidence owner and is advisory only.
              </p>
            </div>
            <span className="font-mono text-[10px] text-text-muted">
              generated {formatTime(report.generatedAt)}
            </span>
          </div>

          <div className="mt-4 overflow-x-auto rounded-lg border border-border-default">
            <div className="min-w-[1280px]">
              <div className="grid grid-cols-[1.35fr_.75fr_.65fr_.65fr_.65fr_.75fr_.8fr_.8fr_1.8fr] gap-3 border-b border-border-default bg-panel-light px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.11em] text-text-muted">
                <span>Strategy</span><span>State</span><span>Control</span><span>Signal</span><span>Operator</span><span>Admission</span><span>Runtime / queue</span><span>Real soak</span><span>Next closure</span>
              </div>
              {report.strategies.map((item) => (
                <ReadinessRow key={item.strategyId} item={item} selected={item.strategyId === selectedStrategyId} />
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-3 lg:grid-cols-4">
          <SafetyFact label="Read-only aggregation" passed={report.safety.readOnlyAggregation} />
          <SafetyFact label="Actual lineage only" passed={report.safety.actualAdmissionIntakeAndQueueEvidenceOnly && report.safety.realSignalsOnly} />
          <SafetyFact label="Blockers never auto-closed" passed={report.safety.blockersNeverAutoClosed && !report.safety.operatorConfigurationMutated} />
          <SafetyFact label="Priorities are advisory only" passed={report.safety.duplicatedActionsCollapsedOnly && report.safety.workstreamsAdvisoryOnly && report.safety.priorityNeverGrantsExecution} />
          <SafetyFact label="No PAPER/LIVE/order action from read" passed={!report.safety.paperExecutionTriggered && !report.safety.liveExecutionAllowed && !report.safety.orderSubmissionAllowed && !report.safety.orderSubmissionPerformed} />
        </section>
      </div>
    </section>
  );
}

function VenueRoutingBoard({report}: {
  report: NonNullable<EightStrategyPaperReadinessResponse["data"]["venueRouting"]>;
}) {
  return (
    <section className="rounded-lg border border-brand/25 bg-brand/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-brand">
            <Layers3 className="size-4" />
            <p className="text-xs font-semibold uppercase tracking-[0.13em]">Strategy #2 route stability and anti-flapping</p>
          </div>
          <p className="mt-1 max-w-4xl text-xs leading-5 text-text-muted">
            Operator priority ranks candidates, but promotion requires a consecutive-pass streak plus dwell. The active route stays sticky while healthy; route loss emits no signal and starts a failover cooldown.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 font-mono text-[9px]">
          <span className="rounded border border-border-default bg-panel px-2 py-1 text-text-muted">{report.summary.operatorApprovedPairs} approved pairs</span>
          <span className="rounded border border-success/25 bg-success/5 px-2 py-1 text-success">{report.summary.inventoryQualified} funded</span>
          <span className="rounded border border-warning/25 bg-warning/5 px-2 py-1 text-warning">{report.summary.qualifying} qualifying</span>
          <span className="rounded border border-success/25 bg-success/5 px-2 py-1 text-success">{report.summary.stable} stable</span>
          <span className="rounded border border-brand/25 bg-brand/5 px-2 py-1 text-brand">{report.summary.selected} selected</span>
          <span className="rounded border border-border-default bg-panel px-2 py-1 text-text-muted">cooldown {report.summary.cooldownUntil ? `to ${formatTime(report.summary.cooldownUntil)}` : "clear"}</span>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-md border border-border-default">
        <div className="min-w-[1000px]">
          <div className="grid grid-cols-[.45fr_1.1fr_.75fr_.6fr_.7fr_.7fr_.85fr_1fr_1.8fr] gap-2 border-b border-border-default bg-panel-light px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.1em] text-text-muted">
            <span>Priority</span><span>Venue pair</span><span>Market / side</span><span>Edge</span><span>Price</span><span>Inventory</span><span>Stability</span><span>Selection</span><span>First blocker</span>
          </div>
          {report.candidates.map((candidate) => (
            <div key={candidate.candidateKey} className={`grid grid-cols-[.45fr_1.1fr_.75fr_.6fr_.7fr_.7fr_.85fr_1fr_1.8fr] gap-2 border-b border-border-default px-3 py-2 font-mono text-[9px] last:border-b-0 ${candidate.selectionState === "SELECTED" ? "bg-success/5" : "bg-panel"}`}>
              <span className="text-text-muted">#{candidate.pairPriority + 1}{candidate.rank ? ` · rank ${candidate.rank}` : ""}</span>
              <span className="text-text-primary">{candidate.makerExchange} → {candidate.hedgeExchange}</span>
              <span className="text-text-primary">{candidate.market} {candidate.side}</span>
              <span className="text-text-muted">{candidate.modeledRetainedEdgePercent === null ? "NO DATA" : `${candidate.modeledRetainedEdgePercent.toFixed(4)}%`}</span>
              <span className={candidate.priceState === "QUALIFIED" ? "text-success" : "text-danger"}>{candidate.priceState}</span>
              <span className={candidate.inventoryState === "FEASIBLE" ? "text-success" : "text-danger"}>{candidate.inventoryState.replaceAll("_", " ")}</span>
              <span className={candidate.stabilityState === "ACTIVE" || candidate.stabilityState === "STABLE" ? "text-success" : candidate.stabilityState === "RESET" ? "text-danger" : "text-warning"}>
                {candidate.stabilityState} {candidate.consecutivePasses}/{candidate.minimumConsecutivePasses} · {candidate.dwellAgeMs}/{candidate.minimumDwellMs}ms
              </span>
              <span className={candidate.selectionState === "SELECTED" ? "text-success" : candidate.selectionState === "BLOCKED" ? "text-danger" : "text-warning"}>{candidate.selectionState.replaceAll("_", " ")}</span>
              <span className="break-all text-text-muted">{candidate.blockers[0] ?? "NONE"}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 rounded-md border border-border-default bg-panel px-3 py-2">
        <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-text-muted">Recent route transitions</p>
        {report.recentTransitions.length === 0
          ? <p className="mt-2 text-xs text-text-muted">No route has completed the stability gate yet.</p>
          : <div className="mt-2 space-y-1 font-mono text-[9px] text-text-muted">
              {report.recentTransitions.slice(-5).reverse().map((transition) => (
                <p key={transition.id} className={transition.type === "LOST" ? "text-danger" : "text-success"}>
                  {formatTime(transition.at)} · {transition.type} · {transition.fromCandidateKey ?? "NONE"} → {transition.toCandidateKey ?? "NONE"} · {transition.reason.replaceAll("_", " ")}
                </p>
              ))}
            </div>}
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <SafetyFact label="Approved routes only" passed={report.safety.operatorApprovedPairsOnly && !report.safety.inferredVenueAllowed} />
        <SafetyFact label="Price + inventory required" passed={report.safety.priceQualificationRequired && report.safety.freshInventoryRequired} />
        <SafetyFact label="Dwell + sticky active route" passed={report.safety.consecutiveQualificationRequired && report.safety.minimumDwellRequired && report.safety.stickyWhileHealthy} />
        <SafetyFact label="Loss fails closed / no bypass" passed={report.safety.routeLossFailsClosed && !report.safety.cooldownBypassAllowed} />
        <SafetyFact label="No transfer/PAPER/LIVE/order" passed={!report.safety.transferPerformed && !report.safety.paperExecutionTriggered && !report.safety.liveExecutionAllowed && !report.safety.orderSubmissionAllowed} />
      </div>
    </section>
  );
}

function InventoryRoutingBoard({report}: {
  report: NonNullable<EightStrategyPaperReadinessResponse["data"]["inventoryRouting"]>;
}) {
  return (
    <section className="rounded-lg border border-brand/25 bg-brand/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-brand">
            <ShieldCheck className="size-4" />
            <p className="text-xs font-semibold uppercase tracking-[0.13em]">Strategy #2 funded direction gate</p>
          </div>
          <p className="mt-1 max-w-4xl text-xs leading-5 text-text-muted">
            Price-qualified BID and ASK directions are checked against fresh synchronized balances before signal publication. This gate is read-only and never transfers funds.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 font-mono text-[9px]">
          <span className="rounded border border-border-default bg-panel px-2 py-1 text-text-muted">{report.summary.currentRoutes} directions</span>
          <span className="rounded border border-success/25 bg-success/5 px-2 py-1 text-success">{report.summary.feasibleRoutes} feasible</span>
          <span className="rounded border border-danger/25 bg-danger/5 px-2 py-1 text-danger">{report.summary.blockedRoutes} blocked</span>
        </div>
      </div>

      {report.routes.length === 0 ? (
        <p className="mt-4 rounded-md border border-warning/25 bg-panel px-3 py-3 text-xs text-text-muted">
          Waiting for the first accepted economic price evaluation; no inventory readiness is inferred.
        </p>
      ) : (
        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          {report.routes.map((route) => (
            <article key={route.routeKey} className="rounded-md border border-border-default bg-panel p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-mono text-xs font-bold text-text-primary">{route.market} {route.side}</p>
                  <p className="mt-1 text-[10px] text-text-muted">maker {route.makerExchange} → hedge {route.hedgeExchange}</p>
                </div>
                <span className={`rounded border px-2 py-1 font-mono text-[9px] font-bold ${route.state === "FEASIBLE"
                  ? "border-success/30 bg-success/10 text-success"
                  : "border-danger/30 bg-danger/10 text-danger"}`}>
                  {route.state}
                </span>
              </div>
              <div className="mt-3 space-y-2">
                {route.requirements.map((requirement) => (
                  <div key={`${requirement.role}:${requirement.exchange}:${requirement.asset}`}
                    className="grid grid-cols-[.55fr_.75fr_1fr_1fr_.8fr] gap-2 rounded border border-border-default bg-panel-light px-2 py-2 font-mono text-[9px]">
                    <span className="text-text-muted">{requirement.role}</span>
                    <span className="text-text-primary">{requirement.action} {requirement.asset}</span>
                    <span className="text-text-muted">need {formatAmount(requirement.requiredAmount)}</span>
                    <span className="text-text-muted">have {requirement.availableAmount === null ? "NO DATA" : formatAmount(requirement.availableAmount)}</span>
                    <span className={requirement.state === "VERIFIED" ? "text-success" : "text-danger"}>{requirement.state}</span>
                  </div>
                ))}
              </div>
              {route.blockers.length > 0 ? (
                <p className="mt-3 break-all rounded border border-danger/20 bg-danger/5 px-2 py-2 font-mono text-[9px] text-danger">
                  {route.blockers.join(" · ")}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      )}

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <SafetyFact label="Read-only balance evidence" passed={report.safety.readOnly && !report.safety.inferredBalanceAllowed} />
        <SafetyFact label="No transfer or mutation" passed={!report.safety.transferPerformed && !report.safety.balanceMutationPerformed} />
        <SafetyFact label="No PAPER/LIVE/order action" passed={!report.safety.paperExecutionTriggered && !report.safety.liveExecutionAllowed && !report.safety.orderSubmissionAllowed} />
      </div>
    </section>
  );
}

function LifecycleTraceBoard({report, selectedStrategyId}: {
  report: NonNullable<EightStrategyPaperReadinessResponse["data"]["lifecycleTrace"]>;
  selectedStrategyId: string;
}) {
  const selected = report.strategies.find((item) => item.strategyId === selectedStrategyId) ?? null;
  const trace = selected?.latestTrace ?? null;

  return (
    <section className="rounded-lg border border-brand/25 bg-brand/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-brand">
            <Workflow className="size-4" />
            <p className="text-xs font-semibold uppercase tracking-[0.13em]">Exact central PAPER lifecycle</p>
          </div>
          <p className="mt-1 max-w-4xl text-xs leading-5 text-text-muted">
            Actual plan IDs only. Missing evidence is fail-closed, and this read-only trace cannot enqueue work, mutate balances or submit orders.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 font-mono text-[9px]">
          <span className="rounded border border-border-default bg-panel px-2 py-1 text-text-muted">{report.summary.plansObserved} plans</span>
          <span className="rounded border border-danger/25 bg-danger/5 px-2 py-1 text-danger">{report.summary.blocked} blocked</span>
          <span className="rounded border border-success/25 bg-success/5 px-2 py-1 text-success">{report.summary.closedAccounted} closed/accounted</span>
          <span className="rounded border border-warning/25 bg-warning/5 px-2 py-1 text-warning">{report.summary.deferredPrerequisites} deferred</span>
        </div>
      </div>

      {!selected ? (
        <p className="mt-4 rounded-md border border-border-default bg-panel px-3 py-3 text-xs text-text-muted">
          Strategy #1 uses its dedicated PAPER owner. Select Strategy #2-#8 for the central lifecycle trace.
        </p>
      ) : !trace ? (
        <div className="mt-4 rounded-md border border-warning/25 bg-panel px-3 py-3">
          <p className="font-mono text-[10px] font-bold text-warning">#{selected.strategyNumber} WAITING AT {selected.currentStage}</p>
          <p className="mt-2 text-xs text-text-muted">{selected.nextTransition}</p>
        </div>
      ) : (
        <LifecyclePlanTrace trace={trace} strategyNumber={selected.strategyNumber} />
      )}
    </section>
  );
}

function LifecyclePlanTrace({trace, strategyNumber}: {trace: CentralPaperLifecycleTrace; strategyNumber: number}) {
  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-border-default bg-panel px-3 py-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] font-bold text-text-primary">#{strategyNumber} {trace.state.replaceAll("_", " ")} AT {trace.currentStage}</p>
          <p className="mt-1 break-all font-mono text-[9px] text-text-muted">plan {trace.planId}</p>
          <p className="mt-2 text-xs leading-5 text-text-muted">{trace.nextTransition}</p>
        </div>
        <TraceStateBadge state={trace.state} />
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-7">
        {trace.stages.map((stage) => (
          <div key={stage.id} className="rounded-md border border-border-default bg-panel px-3 py-3" title={stage.detail}>
            <TraceStageBadge state={stage.state} />
            <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-text-muted">{stage.id}</p>
            <p className="mt-1 line-clamp-3 text-[10px] leading-4 text-text-muted">{stage.detail}</p>
          </div>
        ))}
      </div>
      {trace.planPrerequisites.length > 0 ? (
        <div className="mt-3 rounded-md border border-border-default bg-panel px-3 py-3">
          <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-text-muted">Stage-owned plan prerequisites</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {trace.planPrerequisites.map((item) => (
              <span key={`${item.code}:${item.ownerStage}`}
                className="rounded border border-border-default bg-panel-light px-2 py-1 font-mono text-[8px] text-text-muted">
                {item.code} · {item.ownerStage} · <PrerequisiteState state={item.state} />
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {trace.blockers.length > 0 ? <p className="mt-3 break-all rounded border border-danger/20 bg-danger/5 px-3 py-2 font-mono text-[9px] text-danger">
        First blocker: {trace.blockers[0]}
      </p> : null}
    </div>
  );
}

function PrerequisiteState({state}: {state: CentralPaperPlanPrerequisiteState}) {
  const color = state === "RESOLVED" ? "text-success" : state === "DUE_AT_STAGE" ? "text-danger" : "text-warning";
  return <span className={`font-bold ${color}`}>{state.replaceAll("_", " ")}</span>;
}

function TraceStateBadge({state}: {state: CentralPaperLifecycleTrace["state"]}) {
  const style = state === "SOAK_ACCEPTED" || state === "CLOSED_ACCOUNTED"
    ? "border-success/30 bg-success/10 text-success"
    : state === "BLOCKED" ? "border-danger/30 bg-danger/10 text-danger"
      : "border-warning/30 bg-warning/10 text-warning";
  return <span className={`rounded-full border px-2 py-1 font-mono text-[9px] font-bold ${style}`}>{state.replaceAll("_", " ")}</span>;
}

function TraceStageBadge({state}: {state: CentralPaperTraceStageState}) {
  const style = state === "PASSED" ? "border-success/30 bg-success/10 text-success"
    : state === "BLOCKED" ? "border-danger/30 bg-danger/10 text-danger"
      : state === "IN_PROGRESS" || state === "WAITING" ? "border-warning/30 bg-warning/10 text-warning"
        : "border-border-default bg-panel-light text-text-muted";
  return <span className={`inline-flex rounded border px-1.5 py-0.5 font-mono text-[8px] ${style}`}>{state.replaceAll("_", " ")}</span>;
}

function RemediationBoard({report}: {report: RemediationReport}) {
  const count = (resolutionClass: EightStrategyRemediationClass) =>
    report.classificationCounts.find((item) => item.resolutionClass === resolutionClass)?.count ?? 0;

  return (
    <section className="rounded-lg border border-success/20 bg-success/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-success">
            <Wrench className="size-4" />
            <p className="text-xs font-semibold uppercase tracking-[0.13em]">Build 30.1 exact blocker remediation</p>
          </div>
          <p className="mt-1 max-w-4xl text-xs leading-5 text-text-muted">
            Code defects, external exchange/account actions, genuine market waits and PAPER evidence waits are separated. No credential value is exposed and no blocker is auto-closed.
          </p>
        </div>
        <ResolutionBadge resolutionClass={report.decision === "CLEAR" ? "VERIFIED_HEALTHY" : report.decision === "EXTERNAL_ACTION_REQUIRED" ? "EXTERNAL_ACTION_REQUIRED" : "PAPER_EVIDENCE_WAIT"} label={report.decision} />
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        <RemediationMetric label="Code fixed" value={count("CODE_FIXED")} tone="success" />
        <RemediationMetric label="External action" value={count("EXTERNAL_ACTION_REQUIRED")} tone="danger" />
        <RemediationMetric label="Market wait" value={count("MARKET_WAIT")} />
        <RemediationMetric label="PAPER wait" value={count("PAPER_EVIDENCE_WAIT")} />
        <RemediationMetric label="Verified healthy" value={count("VERIFIED_HEALTHY")} tone="success" />
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        <RemediationCard
          title="Strategy #1 soak streak"
          resolutionClass={report.strategyOneSoak.resolutionClass}
          summary={report.strategyOneSoak.summary}
          facts={[
            `${report.strategyOneSoak.totalPasses} total completed passes`,
            `${report.strategyOneSoak.safeRejectionsExcludedFromStreak} safe rejections excluded from completed-pass streak`,
          ]}
        />
        <RemediationCard
          title="Authoritative daily risk budget"
          resolutionClass={report.dailyRiskBudget.resolutionClass}
          summary={report.dailyRiskBudget.summary}
          facts={[
            `${report.dailyRiskBudget.tradesToday ?? "NO_DATA"}/${report.dailyRiskBudget.maximumDailyTrades ?? "NO_DATA"} trades`,
            `${report.dailyRiskBudget.remainingTrades ?? "NO_DATA"} remaining`,
          ]}
        />
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        <ProviderGroup title="Derivative authenticated reads" icon={<ShieldCheck className="size-4" />}>
          {report.derivativeProviders.map((provider) => (
            <ProviderRow key={provider.exchange} exchange={provider.exchange}
              resolutionClass={provider.resolutionClass} summary={provider.summary}
              facts={`${provider.providerState} · margin ${provider.marginState} · positions ${provider.positionMarkets}`} />
          ))}
        </ProviderGroup>
        <ProviderGroup title="Spot balance synchronization" icon={<ShieldCheck className="size-4" />}>
          {report.spotBalanceProviders.map((provider) => (
            <ProviderRow key={provider.exchange} exchange={provider.exchange}
              resolutionClass={provider.resolutionClass} summary={provider.summary}
              facts={`${provider.synchronizationState} · ${provider.positiveAssets}/${provider.synchronizedBalances} positive assets`} />
          ))}
        </ProviderGroup>
      </div>

      <div className="mt-4 rounded-md border border-border-default bg-panel px-3 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.11em] text-text-muted">Corrected code defects</p>
        <div className="mt-2 grid gap-2 xl:grid-cols-3">
          {report.correctedCodeDefects.map((item) => (
            <div key={item.code} className="rounded border border-success/20 bg-success/5 px-3 py-2">
              <p className="font-mono text-[9px] font-bold text-success">{item.code}</p>
              <p className="mt-1 text-[11px] leading-5 text-text-muted">{item.summary}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function RemediationCard({title, resolutionClass, summary, facts}: {
  title: string;
  resolutionClass: EightStrategyRemediationClass;
  summary: string;
  facts: string[];
}) {
  return (
    <article className="rounded-md border border-border-default bg-panel p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-xs font-semibold text-text-primary">{title}</p>
        <ResolutionBadge resolutionClass={resolutionClass} />
      </div>
      <p className="mt-2 text-xs leading-5 text-text-muted">{summary}</p>
      <div className="mt-2 flex flex-wrap gap-2 font-mono text-[9px] text-text-muted">
        {facts.map((fact) => <span key={fact} className="rounded border border-border-default bg-panel-light px-2 py-1">{fact}</span>)}
      </div>
    </article>
  );
}

function ProviderGroup({title, icon, children}: {title: string; icon: React.ReactNode; children: React.ReactNode}) {
  return (
    <section className="rounded-md border border-border-default bg-panel p-3">
      <div className="flex items-center gap-2 text-brand">{icon}<p className="text-[10px] font-semibold uppercase tracking-[0.11em]">{title}</p></div>
      <div className="mt-3 space-y-2">{children}</div>
    </section>
  );
}

function ProviderRow({exchange, resolutionClass, summary, facts}: {
  exchange: string;
  resolutionClass: EightStrategyRemediationClass;
  summary: string;
  facts: string;
}) {
  return (
    <div className="rounded border border-border-default bg-panel-light px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-[10px] font-bold uppercase text-text-primary">{exchange}</p>
        <ResolutionBadge resolutionClass={resolutionClass} />
      </div>
      <p className="mt-1 text-[11px] leading-5 text-text-muted">{summary}</p>
      <p className="mt-1 font-mono text-[9px] text-text-muted">{facts}</p>
    </div>
  );
}

function ResolutionBadge({resolutionClass, label}: {resolutionClass: EightStrategyRemediationClass; label?: string}) {
  const style = resolutionClass === "VERIFIED_HEALTHY" || resolutionClass === "CODE_FIXED"
    ? "border-success/30 bg-success/10 text-success"
    : resolutionClass === "EXTERNAL_ACTION_REQUIRED"
      ? "border-danger/30 bg-danger/10 text-danger"
      : "border-warning/30 bg-warning/10 text-warning";
  return <span className={`rounded-full border px-2 py-1 font-mono text-[9px] font-bold ${style}`}>{(label ?? resolutionClass).replaceAll("_", " ")}</span>;
}

function RemediationMetric({label, value, tone = "default"}: {label: string; value: number; tone?: "default" | "success" | "danger"}) {
  const color = tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "text-text-primary";
  return <div className="rounded-md border border-border-default bg-panel px-3 py-2"><p className="text-[9px] uppercase tracking-[0.1em] text-text-muted">{label}</p><p className={`mt-1 font-mono text-base font-bold ${color}`}>{value}</p></div>;
}

function AcceptanceFlow({report}: {report: EightStrategyPaperReadinessResponse["data"]["acceptanceFlow"]}) {
  return (
    <section className="rounded-lg border border-border-default bg-panel-light p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.13em] text-text-muted">Integrated acceptance sequence</p>
          <p className="mt-1 text-xs text-text-muted">Current stage: {report.currentStage.replaceAll("_", " ")}</p>
        </div>
        <span className="font-mono text-xs font-bold text-text-primary">{report.completedStages}/{report.totalStages} stages complete</span>
      </div>
      <div className="mt-4 grid gap-2 xl:grid-cols-5">
        {report.stages.map((stage, index) => (
          <div key={stage.id} className="relative rounded-md border border-border-default bg-panel px-3 py-3" title={stage.detail}>
            <div className="flex items-center justify-between gap-2">
              <span className={`rounded border px-1.5 py-0.5 font-mono text-[9px] ${stage.state === "PASSED" ? "border-success/30 bg-success/10 text-success" : stage.state === "IN_PROGRESS" ? "border-warning/30 bg-warning/10 text-warning" : "border-border-default bg-panel-light text-text-muted"}`}>{stage.state.replaceAll("_", " ")}</span>
              <span className="font-mono text-xs font-bold text-text-primary">{stage.passed}/{stage.total}</span>
            </div>
            <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.09em] text-text-muted">{stage.label}</p>
            {index < report.stages.length - 1 ? <ArrowRight className="absolute -right-3 top-1/2 z-10 hidden size-4 -translate-y-1/2 text-text-muted xl:block" /> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function ConvergenceBoard({report}: {report: EightStrategyPaperReadinessResponse["data"]["convergence"]}) {
  return (
    <section className="rounded-lg border border-brand/20 bg-brand/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-brand"><Layers3 className="size-4" />
            <p className="text-xs font-semibold uppercase tracking-[0.13em]">Prioritized blocker convergence</p>
          </div>
          <p className="mt-1 text-xs text-text-muted">{report.rawActions} strategy actions collapsed into {report.uniqueWorkstreams} shared evidence workstreams.</p>
        </div>
        <div className="flex flex-wrap gap-2 font-mono text-[10px]">
          <span className="rounded border border-danger/20 bg-danger/5 px-2 py-1 text-danger">{report.actionableNow} ready now</span>
          <span className="rounded border border-border-default bg-panel px-2 py-1 text-text-muted">{report.deferred} deferred</span>
          <span className="rounded border border-success/20 bg-success/5 px-2 py-1 text-success">{report.duplicatedActionsCollapsed} duplicates collapsed</span>
        </div>
      </div>
      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        {report.workstreams.map((workstream) => <ConvergenceCard key={`${workstream.code}:${workstream.owner}`} item={workstream} />)}
      </div>
    </section>
  );
}

function ConvergenceCard({item}: {item: ConvergenceWorkstream}) {
  const ready = item.readyNowStrategies > 0 && item.state !== "COMPLETE";
  return (
    <article className={`rounded-md border p-3 ${ready ? "border-warning/25 bg-panel" : "border-border-default bg-panel-light"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <span className="rounded border border-brand/30 bg-brand/10 px-2 py-1 font-mono text-[10px] font-bold text-brand">#{item.rank} {item.priority}</span>
          <div className="min-w-0">
            <p className="break-all font-mono text-[10px] font-bold text-text-primary">{item.code}</p>
            <p className="mt-1 text-[10px] uppercase tracking-[0.09em] text-text-muted">{item.phase.replaceAll("_", " ")} · {item.owner.replaceAll("_", " ")}</p>
          </div>
        </div>
        <span className={`rounded-full border px-2 py-1 font-mono text-[9px] ${item.state === "COMPLETE" ? "border-success/30 bg-success/10 text-success" : item.state === "ACTION_REQUIRED" ? "border-danger/30 bg-danger/10 text-danger" : "border-warning/30 bg-warning/10 text-warning"}`}>{item.state.replaceAll("_", " ")}</span>
      </div>
      <p className="mt-3 line-clamp-3 break-all text-xs leading-5 text-text-muted">{item.evidenceDetails[0] ?? "No evidence detail reported."}</p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border-default pt-2">
        <div className="flex flex-wrap gap-1">
          {item.affectedStrategies.map((strategy) => <span key={strategy.strategyId} title={strategy.displayName}
            className="rounded border border-border-default bg-panel-light px-1.5 py-0.5 font-mono text-[9px] text-text-muted">#{strategy.strategyNumber}</span>)}
        </div>
        <span className={`font-mono text-[9px] ${ready ? "text-warning" : "text-text-muted"}`}>{item.readyNowStrategies}/{item.affectedCount} ready now · {item.deferredStrategies} deferred</span>
      </div>
    </article>
  );
}

function SelectedClosure({item}: {item: EightStrategyPaperReadinessItem}) {
  return (
    <section className="rounded-lg border border-brand/20 bg-brand/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.13em] text-brand">
            Selected strategy closure
          </p>
          <p className="mt-1 font-semibold text-text-primary">
            #{item.strategyNumber} {item.displayName}
          </p>
          <p className="mt-1 font-mono text-[10px] text-text-muted">
            {item.paperPath.replaceAll("_", " ")} · gates {item.operationalGatesPassed}/{item.operationalGatesTotal}
          </p>
        </div>
        <OperationalBadge state={item.operationalState} />
      </div>
      <div className="mt-4 grid gap-2 lg:grid-cols-2">
        {item.nextActions.map((action) => (
          <div key={`${action.code}:${action.detail}`} className="rounded-md border border-border-default bg-panel px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-[10px] font-bold text-text-primary">{action.code}</span>
              <span className="rounded border border-border-default bg-panel-light px-2 py-0.5 font-mono text-[9px] text-text-muted">{action.owner.replaceAll("_", " ")}</span>
            </div>
            <p className="mt-1 text-xs leading-5 text-text-muted">{action.detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function ReadinessRow({item, selected}: {item: EightStrategyPaperReadinessItem; selected: boolean}) {
  const firstAction = item.nextActions[0];
  return (
    <article className={`grid grid-cols-[1.35fr_.75fr_.65fr_.65fr_.65fr_.75fr_.8fr_.8fr_1.8fr] items-center gap-3 border-b border-border-default px-3 py-3 text-xs last:border-b-0 ${selected ? "bg-brand/5" : ""}`}>
      <div className="min-w-0">
        <p className="truncate font-semibold text-text-primary">#{item.strategyNumber} {item.displayName}</p>
        <p className="mt-1 font-mono text-[9px] text-text-muted">{item.paperPath === "EXISTING_STRATEGY_ONE" ? "EXISTING OWNER" : "CENTRAL PAPER"}</p>
      </div>
      <OperationalBadge state={item.operationalState} />
      <GateBadge state={item.stages.controller.state} />
      <div><GateBadge state={item.stages.signal.state} /><p className="mt-1 font-mono text-[9px] text-text-muted">{item.signalEvidence.current} now / {item.signalEvidence.observed} seen</p></div>
      <GateBadge state={item.stages.operator.state} />
      <GateBadge state={item.stages.admission.state} />
      <div><GateBadge state={item.stages.runtimeEvidence.state} /><p className="mt-1 font-mono text-[9px] text-text-muted">queue {item.lineage.activeQueue} / done {item.lineage.completedQueue}</p></div>
      <div><GateBadge state={item.stages.soak.state} /><p className="mt-1 font-mono text-[9px] text-text-muted">{item.soak.closedCycles}/{item.soak.minimumClosedCycles} · streak {item.soak.consecutivePasses}/{item.soak.minimumConsecutivePasses}</p></div>
      <div className="min-w-0" title={[...item.runtimeBlockers, ...item.soak.blockers].join(" · ")}>
        <p className="line-clamp-2 text-[10px] leading-4 text-text-muted">{firstAction?.detail ?? "No closure action reported."}</p>
        <p className="mt-1 font-mono text-[9px] text-brand">{firstAction?.owner.replaceAll("_", " ") ?? "NONE"}</p>
      </div>
    </article>
  );
}

function OperationalBadge({state}: {state: EightStrategyPaperOperationalState}) {
  const style = state === "SOAK_ACCEPTED" || state === "PAPER_ACTIVE"
    ? "border-success/30 bg-success/10 text-success"
    : state === "BLOCKED"
      ? "border-danger/30 bg-danger/10 text-danger"
      : "border-warning/30 bg-warning/10 text-warning";
  return <span className={`w-fit rounded-full border px-2 py-1 font-mono text-[9px] font-bold ${style}`}>{state.replaceAll("_", " ")}</span>;
}

function GateBadge({state}: {state: EightStrategyPaperGateState}) {
  const style = state === "PASSED" ? "border-success/30 bg-success/10 text-success"
    : state === "BLOCKED" ? "border-danger/30 bg-danger/10 text-danger"
      : state === "WAITING" ? "border-warning/30 bg-warning/10 text-warning"
        : "border-border-default bg-panel-light text-text-muted";
  return <span className={`inline-flex w-fit rounded border px-2 py-1 font-mono text-[9px] ${style}`}>{state.replaceAll("_", " ")}</span>;
}

function DecisionBadge({decision}: {decision: "ALL_SOAK_ACCEPTED" | "ACTION_REQUIRED" | "COLLECTING_PAPER_EVIDENCE"}) {
  const success = decision === "ALL_SOAK_ACCEPTED";
  return <span className={`rounded-full border px-3 py-1 font-mono text-[10px] font-bold ${success ? "border-success/30 bg-success/10 text-success" : "border-warning/30 bg-warning/10 text-warning"}`}>{decision.replaceAll("_", " ")}</span>;
}

function Metric({label, value, suffix = "", tone = "default"}: {label: string; value: number; suffix?: string; tone?: "default" | "success" | "danger"}) {
  const color = tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "text-text-primary";
  return <div className="rounded-lg border border-border-default bg-panel-light p-3"><p className="text-[10px] uppercase tracking-[0.12em] text-text-muted">{label}</p><p className={`mt-2 font-mono text-lg font-bold ${color}`}>{value}{suffix}</p></div>;
}

function PipelineFact({label, value, passed}: {label: string; value: string; passed: boolean}) {
  return <div className="flex items-center justify-between gap-3 rounded-lg border border-border-default bg-panel-light px-3 py-3"><div><p className="text-[10px] uppercase tracking-[0.11em] text-text-muted">{label}</p><p className="mt-1 font-mono text-xs font-bold text-text-primary">{value}</p></div>{passed ? <CheckCircle2 className="size-4 text-success" /> : <AlertTriangle className="size-4 text-danger" />}</div>;
}

function SafetyFact({label, passed}: {label: string; passed: boolean}) {
  return <div className="flex items-center justify-between gap-3 rounded-lg border border-border-default bg-panel-light px-3 py-2.5"><span className="text-xs text-text-muted">{label}</span>{passed ? <CheckCircle2 className="size-4 shrink-0 text-success" /> : <AlertTriangle className="size-4 shrink-0 text-danger" />}</div>;
}

function PanelState({icon, title, detail, danger = false}: {icon: React.ReactNode; title: string; detail: string; danger?: boolean}) {
  return <section className={`rounded-xl border bg-panel p-5 ${danger ? "border-danger/30" : "border-border-default"}`}><div className={`flex items-start gap-3 ${danger ? "text-danger" : "text-text-muted"}`}>{icon}<div><h2 className="text-lg font-bold text-text-primary">{title}</h2><p className="mt-2 text-sm text-text-muted">{detail}</p></div></div></section>;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("en-IN", {hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit"});
}

function formatAmount(value: number): string {
  return new Intl.NumberFormat("en-IN", {maximumFractionDigits: 8}).format(value);
}
