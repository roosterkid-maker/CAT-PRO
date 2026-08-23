import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Database,
  RefreshCw,
  ShieldCheck,
  Workflow,
  XCircle,
} from "lucide-react";

import {
  lazy,
  Suspense,
  useState,
} from "react";

import {
  useCentralPaperLifecycle,
  useCentralStrategyLiveReadiness,
  useStrategies,
  useStrategy,
} from "../hooks/useStrategies";

import type {
  StrategyAttributionCoverage,
  StrategyEvidenceStatus,
} from "../types/Strategy";

const PRIMARY_STRATEGY_ID =
  "cross-exchange-arbitrage";

const StatisticalResearchPanel = lazy(() =>
  import("../components/StatisticalResearchPanel").then((module) => ({
    default: module.StatisticalResearchPanel,
  })),
);

const StatisticalPaperLifecyclePanel = lazy(() =>
  import("../components/StatisticalPaperLifecyclePanel").then((module) => ({
    default: module.StatisticalPaperLifecyclePanel,
  })),
);

const EightStrategyPaperReadinessPanel = lazy(() =>
  import("../components/EightStrategyPaperReadinessPanel").then((module) => ({
    default: module.EightStrategyPaperReadinessPanel,
  })),
);

const PersonalStrategyOneBotPanel = lazy(() =>
  import("../components/PersonalStrategyOneBotPanel").then((module) => ({
    default: module.PersonalStrategyOneBotPanel,
  })),
);

const TriangularPaperClosurePanel = lazy(() =>
  import("../components/TriangularPaperClosurePanel").then((module) => ({
    default: module.TriangularPaperClosurePanel,
  })),
);

const SpotPerpetualBasisPaperClosurePanel = lazy(() =>
  import("../components/SpotPerpetualBasisPaperClosurePanel").then((module) => ({
    default: module.SpotPerpetualBasisPaperClosurePanel,
  })),
);

const FundingRatePaperClosurePanel = lazy(() =>
  import("../components/FundingRatePaperClosurePanel").then((module) => ({
    default: module.FundingRatePaperClosurePanel,
  })),
);

const PerpetualPerpetualPaperClosurePanel = lazy(() =>
  import("../components/PerpetualPerpetualPaperClosurePanel").then((module) => ({
    default: module.PerpetualPerpetualPaperClosurePanel,
  })),
);

const DynamicMarketMakingPaperClosurePanel = lazy(() =>
  import("../components/DynamicMarketMakingPaperClosurePanel").then((module) => ({
    default: module.DynamicMarketMakingPaperClosurePanel,
  })),
);

export default function StrategyDashboard() {
  const [
    selectedStrategyId,
    setSelectedStrategyId,
  ] = useState(
    PRIMARY_STRATEGY_ID,
  );

  const collectionQuery =
    useStrategies();

  const lifecycleQuery =
    useCentralPaperLifecycle();

  const liveReadinessQuery =
    useCentralStrategyLiveReadiness();

  const detailQuery =
    useStrategy(
      selectedStrategyId,
    );

  const collection =
    collectionQuery.data
      ?.data;

  const strategy =
    detailQuery.data
      ?.data;

  const refresh =
    async () => {
      await Promise.all([
        collectionQuery.refetch(),
        detailQuery.refetch(),
        lifecycleQuery.refetch(),
        liveReadinessQuery.refetch(),
      ]);
    };

  if (
    (
      collectionQuery.isPending ||
      detailQuery.isPending
    ) &&
    !strategy
  ) {
    return (
      <StatusPanel
        icon={
          <RefreshCw className="size-5 animate-spin" />
        }
        title="Loading strategy evidence"
        detail="Reading the immutable Strategy Registry and attributed evidence snapshots."
      />
    );
  }

  if (
    collectionQuery.isError ||
    detailQuery.isError ||
    !collection ||
    !strategy
  ) {
    return (
      <StatusPanel
        danger
        icon={
          <XCircle className="size-5" />
        }
        title="Strategy evidence unavailable"
        detail="Missing strategy evidence is not treated as healthy, profitable, or ready."
        action={
          <button
            type="button"
            onClick={() =>
              void refresh()
            }
            className="mt-4 inline-flex items-center gap-2 rounded-md border border-border-default bg-panel-light px-3 py-2 text-sm font-semibold text-text-primary"
          >
            <RefreshCw className="size-4" />
            Retry
          </button>
        }
      />
    );
  }

  const analytics =
    strategy.analytics
      .metrics;

  const xemmAnalytics =
    strategy.shadowAnalytics
      ?.value;

  const hedgeExposure =
    strategy.exposure
      ?.value;

  const hedgeTargets =
    strategy.hedgeTargets
      ?.value;

  const hedgeRoutes =
    strategy.hedgeRoutes
      ?.value;

  const hedgeMarketRules =
    strategy.hedgeMarketRules
      ?.value;

  const hedgePostRuleEconomics =
    strategy.hedgePostRuleEconomics
      ?.value;

  const hedgeBasisRisk =
    strategy.hedgeBasisRisk
      ?.value;

  const hedgeRiskApproval =
    strategy.hedgeRiskApproval
      ?.value;

  const hedgeCapitalReservation =
    strategy.hedgeCapitalReservation
      ?.value;

  const hedgeIntentProposal =
    strategy.hedgeIntentProposal
      ?.value;

  const hedgeIntentPersistence =
    strategy.hedgeIntentPersistence
      ?.value;

  const hedgeIntentLifecycle =
    strategy.hedgeIntentLifecycle
      ?.value;

  const hedgeIntentLastLook =
    strategy.hedgeIntentLastLook
      ?.value;

  const hedgeExecutionPlanProposal =
    strategy.hedgeExecutionPlanProposal
      ?.value;

  const hedgeShadowFillSimulation =
    strategy.hedgeShadowFillSimulation
      ?.value;

  const hedgeResidualReconciliation =
    strategy.hedgeResidualReconciliation
      ?.value;

  const hedgeRecoveryProposal =
    strategy.hedgeRecoveryProposal
      ?.value;

  const hedgeRecoveryProposalLifecycle =
    strategy.hedgeRecoveryProposalLifecycle
      ?.value;

  const hedgeRecoveryActionHandoff =
    strategy.hedgeRecoveryActionHandoff
      ?.value;

  const refreshing =
    collectionQuery.isFetching ||
    detailQuery.isFetching ||
    lifecycleQuery.isFetching ||
    liveReadinessQuery.isFetching;

  const liveReadiness =
    liveReadinessQuery.data?.data;

  const lifecycle =
    lifecycleQuery.data?.data;

  return (
    <section className="space-y-6">
      <section className="rounded-xl border border-border-default bg-panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-brand">
              <Workflow className="size-4" />
              <p className="text-xs font-semibold uppercase tracking-[0.18em]">
                CAT PRO Strategy Registry
              </p>
            </div>

            <h1 className="mt-2 text-3xl font-bold text-text-primary">
              Strategy #{strategy.metadata.strategyNumber}: {strategy.metadata.displayName}
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">
              {strategy.metadata.description}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge
              status={
                strategy.runtime.running
                  ? "AVAILABLE"
                  : "NO_DATA"
              }
              label={
                strategy.runtime.running
                  ? "CONTROLLER OBSERVING"
                  : "CONTROLLER STOPPED"
              }
            />

            <span className="rounded-full border border-success/30 bg-success/10 px-3 py-1 text-xs font-bold text-success">
              LIVE OFF
            </span>

            <button
              type="button"
              aria-label="Refresh strategy evidence"
              disabled={refreshing}
              onClick={() =>
                void refresh()
              }
              className="rounded-md border border-border-default bg-panel-light p-2 text-text-muted hover:text-text-primary disabled:opacity-60"
            >
              <RefreshCw
                className={`size-4 ${
                  refreshing
                    ? "animate-spin"
                    : ""
                }`}
              />
            </button>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2 border-t border-border-default pt-4">
          {collection.strategies.map(
            (registered) => (
              <button
                key={registered.metadata.id}
                type="button"
                onClick={() =>
                  setSelectedStrategyId(
                    registered.metadata.id,
                  )
                }
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  registered.metadata.id ===
                  strategy.metadata.id
                    ? "border-brand/40 bg-brand/10 text-brand"
                    : "border-border-default bg-panel-light text-text-muted hover:text-text-primary"
                }`}
              >
                #{registered.metadata.strategyNumber} {registered.metadata.displayName}
              </button>
            ),
          )}
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Metric
            label="Registered Strategies"
            value={collection.strategyCount.toLocaleString()}
            status={collection.evidenceStatus}
          />
          <Metric
            label="Market Snapshots Processed"
            value={strategy.runtime.processedSnapshots.toLocaleString()}
            status={strategy.runtime.evidence.snapshot}
          />
          <Metric
            label="Current Signals"
            value={strategy.runtime.currentSignalCount.toLocaleString()}
            status={strategy.runtime.evidence.signals}
          />
          <Metric
            label="Qualified Signals Emitted"
            value={strategy.runtime.totalSignalsObserved.toLocaleString()}
            status={strategy.runtime.evidence.snapshot}
          />
          <Metric
            label="Proposal Intents"
            value={strategy.intents.records.length.toLocaleString()}
            status={strategy.intents.evidenceStatus}
          />
        </div>
      </section>

      <Suspense fallback={<StrategyEvidenceLoading />}>
        {strategy.metadata.id === "statistical-arbitrage" ? (
          <>
            <StatisticalResearchPanel />
            <StatisticalPaperLifecyclePanel />
          </>
        ) : null}

        {strategy.metadata.id === "triangular-arbitrage" ? (
          <TriangularPaperClosurePanel />
        ) : null}

        {strategy.metadata.id === "spot-perpetual-basis-arbitrage" ? (
          <SpotPerpetualBasisPaperClosurePanel />
        ) : null}

        {strategy.metadata.id === "funding-rate-arbitrage" ? (
          <FundingRatePaperClosurePanel />
        ) : null}

        {strategy.metadata.id === "perpetual-perpetual-arbitrage" ? (
          <PerpetualPerpetualPaperClosurePanel />
        ) : null}

        {strategy.metadata.id === "dynamic-market-making" ? (
          <DynamicMarketMakingPaperClosurePanel />
        ) : null}

        {strategy.metadata.id === "cross-exchange-arbitrage" ? <PersonalStrategyOneBotPanel /> : null}

        {strategy.metadata.id !== "cross-exchange-arbitrage"
          ? <EightStrategyPaperReadinessPanel selectedStrategyId={strategy.metadata.id} />
          : null}
      </Suspense>

      <section className="rounded-xl border border-border-default bg-panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-warning" />
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
                Exact Strategy Blockers
              </p>
            </div>
            <h2 className="mt-2 text-xl font-bold text-text-primary">
              Why this strategy has no current signal
            </h2>
            <p className="mt-2 text-sm text-text-muted">
              Counts come from this controller&apos;s own configuration and latest engine evidence. They are not inferred from another strategy.
            </p>
          </div>
          <StatusBadge
            status={strategy.blockerDiagnostics.evidenceStatus}
            label={`${strategy.blockerDiagnostics.blockers.length} blocker types`}
          />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Metric
            label="Evaluated Records"
            value={strategy.blockerDiagnostics.evaluatedRecords.toLocaleString()}
            status={strategy.blockerDiagnostics.evidenceStatus}
          />
          <Metric
            label="Blocked Records"
            value={strategy.blockerDiagnostics.blockedRecords.toLocaleString()}
            status={strategy.blockerDiagnostics.blockedRecords > 0 ? "NO_DATA" : "AVAILABLE"}
          />
          <Metric
            label="Qualified Records"
            value={strategy.blockerDiagnostics.qualifiedRecords.toLocaleString()}
            status={strategy.blockerDiagnostics.qualifiedRecords > 0 ? "AVAILABLE" : "NO_DATA"}
          />
        </div>

        {strategy.blockerDiagnostics.blockers.length > 0 ? (
          <div className="mt-4 grid gap-2 lg:grid-cols-2">
            {strategy.blockerDiagnostics.blockers.slice(0, 16).map((blocker) => (
              <article
                key={blocker.code}
                className="rounded-lg border border-warning/20 bg-warning/5 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="break-all font-mono text-xs font-bold text-warning">
                    {blocker.code}
                  </p>
                  <span className="rounded-full border border-border-default bg-panel-light px-2 py-0.5 font-mono text-xs text-text-primary">
                    {blocker.count}
                  </span>
                </div>
                <p className="mt-2 break-all text-xs text-text-muted">
                  {blocker.detail ?? blocker.sources.join(" · ")}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <NoData text="No strategy-owned blockers are present in the latest evidence." />
        )}
      </section>

      <section className="rounded-xl border border-border-default bg-panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Activity className="size-5 text-brand" />
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
                V62 Central PAPER Lifecycle
              </p>
            </div>
            <h2 className="mt-2 text-xl font-bold text-text-primary">
              One admission, queue, worker and accounting chain
            </h2>
            <p className="mt-2 text-sm text-text-muted">
              Strategy #1 keeps its proven orchestrator. Strategies #2–#8 can only enter this central PAPER chain after explicit operator opt-in and current evidence.
            </p>
          </div>
          <StatusBadge
            status={lifecycle && lifecycle.state !== "BLOCKED" && lifecycle.state !== "DISABLED" ? "AVAILABLE" : "NO_DATA"}
            label={lifecycle?.state ?? "NO_DATA"}
          />
        </div>

        {lifecycle ? (
          <>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-8">
              <EvidenceMetric label="Plans compiled" value={lifecycle.pipeline.admission.plansCompiled} />
              <EvidenceMetric label="Queued" value={lifecycle.pipeline.queue.queued} />
              <EvidenceMetric label="Completed" value={lifecycle.pipeline.queue.completed} />
              <EvidenceMetric label="Open groups" value={lifecycle.pipeline.positions.openGroups} />
              <EvidenceMetric label="P&amp;L posted" value={lifecycle.pipeline.accounting.posted} />
              <EvidenceMetric label="Reconciled" value={lifecycle.pipeline.positionLifecycle.reconciled} />
              <EvidenceMetric label="Derivative reads" value={lifecycle.derivativeEvidence.authenticatedProvidersReady} suffix="/2" />
              <EvidenceMetric label="Funding records" value={lifecycle.derivativeEvidence.settledFundingEvidence} />
              <EvidenceMetric label="Capital held (INR)" value={lifecycle.pipeline.capital.activeAmountInr} />
              <EvidenceMetric label="Recovered" value={lifecycle.pipeline.recovery.completed} />
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-4">
              <SafetyRow label="Central admission and intake running" passed={lifecycle.pipeline.admission.running && lifecycle.pipeline.intake.running} />
              <SafetyRow label="Journal-first durable accounting" passed={lifecycle.safety.journalBeforeAccounting && lifecycle.pipeline.accounting.pending === 0} />
              <SafetyRow label="Closed-position reconciliation" passed={lifecycle.safety.closedUnaccountedReconciliation && (lifecycle.pipeline.positions.openGroups === 0 || lifecycle.pipeline.positionLifecycle.serviceRunning)} />
              <SafetyRow label="Durable capital allocation" passed={lifecycle.safety.durableCapitalAllocation && lifecycle.pipeline.capital.pendingReserve === 0 && lifecycle.pipeline.capital.pendingRelease === 0} />
              <SafetyRow label="PAPER residual recovery" passed={lifecycle.safety.executablePaperRecovery && (lifecycle.pipeline.journal.sharedRecoveryStaged === 0 || lifecycle.pipeline.recovery.serviceRunning)} />
              <SafetyRow label="LIVE and order submission disabled" passed={!lifecycle.safety.liveExecutionAllowed && !lifecycle.safety.orderSubmissionAllowed} />
            </div>

            {lifecycle.blockers.length > 0 ? (
              <div className="mt-5 rounded-lg border border-warning/20 bg-warning/10 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.13em] text-warning">
                  Fail-closed blockers
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {lifecycle.blockers.map((blocker) => (
                    <span key={blocker} className="rounded border border-border-default bg-panel-light px-2 py-1 font-mono text-[10px] text-text-muted">
                      {blocker}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <NoData text="Central PAPER lifecycle evidence is unavailable. No queue, execution, position or profit state is inferred." />
        )}
      </section>

      <section className="rounded-xl border border-border-default bg-panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-brand" />
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
                V65 Eight-Strategy Controlled-LIVE Audit
              </p>
            </div>
            <h2 className="mt-2 text-xl font-bold text-text-primary">
              Evidence and architecture gates before activation review
            </h2>
            <p className="mt-2 text-sm text-text-muted">
              PAPER evidence, authenticated reads and registered adapters never grant order authority. Missing LIVE contracts remain explicit blockers.
            </p>
          </div>
          <StatusBadge status="NO_DATA" label={liveReadiness?.decision ?? "NO_DATA"} />
        </div>

        {liveReadiness ? (
          <>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <EvidenceMetric label="Strategies registered" value={liveReadiness.registeredActualStrategies} suffix="/8" />
              <EvidenceMetric label="PAPER accepted" value={liveReadiness.paperAcceptedStrategies} suffix="/8" />
              <EvidenceMetric label="Architecture ready" value={liveReadiness.architectureReadyStrategies} suffix="/8" />
              <EvidenceMetric label="LIVE adapters" value={liveReadiness.adapters.registered} suffix={`/${liveReadiness.adapters.target}`} />
              <EvidenceMetric label="Reads verified" value={liveReadiness.adapters.readVerified} suffix={`/${liveReadiness.adapters.target}`} />
            </div>

            <div className="mt-5 overflow-x-auto">
              <div className="min-w-[900px] space-y-2">
                <div className="grid grid-cols-[1.5fr_.7fr_.7fr_.9fr_2fr] gap-3 px-3 text-[10px] font-semibold uppercase tracking-[0.13em] text-text-muted">
                  <span>Strategy</span><span>Controller</span><span>PAPER</span><span>LIVE stage</span><span>Missing architecture / evidence</span>
                </div>
                {liveReadiness.strategies.map((item) => (
                  <div key={item.strategyId} className="grid grid-cols-[1.5fr_.7fr_.7fr_.9fr_2fr] items-center gap-3 rounded-lg border border-border-default bg-panel-light px-3 py-3 text-xs">
                    <span className="font-semibold text-text-primary">#{item.strategyNumber} {item.displayName}</span>
                    <span className={item.controllerRegistered ? "text-success" : "text-danger"}>{item.controllerRegistered ? "REGISTERED" : "MISSING"}</span>
                    <span className={item.paperEvidence.accepted ? "text-success" : "text-warning"}>{item.paperEvidence.state}</span>
                    <span className="font-mono text-warning">{item.state}</span>
                    <span className="text-text-muted">
                      {item.blockers.filter((blocker) => blocker.startsWith("ARCHITECTURE:") || blocker.startsWith("PAPER:")).slice(0, 3).join(" · ") || "Action-time confirmation still required"}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-3">
              <SafetyRow label="Audit is read-only" passed={liveReadiness.safety.readOnlyAudit} />
              <SafetyRow label="No automatic promotion" passed={liveReadiness.safety.noAutomaticPromotion} />
              <SafetyRow label="LIVE/order submission remains OFF" passed={!liveReadiness.safety.liveExecutionAllowed && !liveReadiness.safety.orderSubmissionAllowed && !liveReadiness.safety.orderSubmissionPerformed} />
            </div>
          </>
        ) : (
          <NoData text="Controlled-LIVE readiness evidence is unavailable. No strategy is inferred ready." />
        )}
      </section>

      {xemmAnalytics ? (
        <section className="rounded-xl border border-border-default bg-panel p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <BarChart3 className="size-5 text-brand" />
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
                  V21.5 XEMM Queue-Aware SHADOW Analytics
                </p>
              </div>
              <h2 className="mt-2 text-xl font-bold text-text-primary">
                Route evidence and readiness
              </h2>
              <p className="mt-2 text-sm text-text-muted">
                Public-trade FIFO queue evidence only. Partial fills remain simulated, fill probability is not inferred, and readiness grants no PAPER or LIVE authority.
              </p>
            </div>
            <StatusBadge
              status={xemmAnalytics.evidenceStatus}
              label={xemmAnalytics.readiness.state}
            />
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
            <EvidenceMetric
              label="Evidence Routes"
              value={xemmAnalytics.summary.evidenceRoutes}
            />
            <EvidenceMetric
              label="Price Evaluations"
              value={xemmAnalytics.summary.pricingEvaluations}
            />
            <EvidenceMetric
              label="Simulated Fills"
              value={xemmAnalytics.summary.simulatedFills}
            />
            <EvidenceMetric
              label="Partial Fills"
              value={xemmAnalytics.summary.simulatedPartialFills}
            />
            <EvidenceMetric
              label="Queue Modeled"
              value={xemmAnalytics.summary.queueModeledFills}
            />
            <EvidenceMetric
              label="Hedge Ready"
              value={xemmAnalytics.summary.hedgeReady}
            />
            <EvidenceMetric
              label="Hedge Blocked"
              value={xemmAnalytics.summary.hedgeBlocked}
            />
          </div>

          {xemmAnalytics.routes.length > 0 ? (
            <div className="mt-5 grid gap-3 xl:grid-cols-2">
              {xemmAnalytics.routes.map(
                (route) => (
                  <article
                    key={route.routeId}
                    className="rounded-lg border border-border-default bg-panel-light p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-text-primary">
                          {route.market}
                        </p>
                        <p className="mt-1 text-xs uppercase text-text-muted">
                          {route.makerExchange} maker / {route.hedgeExchange} hedge
                        </p>
                      </div>
                      <StatusBadge
                        status={route.evidenceStatus}
                        label={route.readiness.state}
                      />
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                      <CoverageValue
                        label="Accepted Prices"
                        value={route.pricing.accepted}
                      />
                      <CoverageValue
                        label="Simulated Fills"
                        value={route.fills.simulatedFillEvents}
                      />
                      <CoverageValue
                        label="Hedge Ready Rate"
                        value={route.hedges.readyRatePercent}
                        suffix="%"
                      />
                      <CoverageValue
                        label="Modeled Edge"
                        value={route.economics.modeledRetainedEdgePercent}
                        suffix="%"
                      />
                    </div>

                    <p className="mt-4 text-xs text-text-muted">
                      PAPER eligible: NO · LIVE eligible: NO · unresolved PAPER gates: {route.readiness.paperBlockers.length}
                    </p>
                  </article>
                ),
              )}
            </div>
          ) : (
            <NoData text="No XEMM route evidence. Readiness remains NO_DATA and no profitability is inferred." />
          )}
        </section>
      ) : null}

      {hedgeExposure ? (
        <section className="rounded-xl border border-border-default bg-panel p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-5 text-brand" />
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
                  V22.1 Hedge / Inventory SHADOW Evidence
                </p>
              </div>
              <h2 className="mt-2 text-xl font-bold text-text-primary">
                Inventory deviation and urgency
              </h2>
              <p className="mt-2 text-sm text-text-muted">
                Freshness-bounded PortfolioSnapshot evidence only. Classifications are not hedge instructions and grant no intent, PAPER, LIVE, capital, balance, or order authority.
              </p>
            </div>
            <StatusBadge
              status={hedgeExposure.evidenceStatus}
              label={hedgeExposure.configurationState}
            />
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
            <EvidenceMetric
              label="Configured Assets"
              value={hedgeExposure.summary.configuredAssets}
            />
            <EvidenceMetric
              label="Assessed Assets"
              value={hedgeExposure.summary.assessedAssets}
            />
            <EvidenceMetric
              label="Within Target"
              value={hedgeExposure.summary.withinTargetAssets}
            />
            <EvidenceMetric
              label="Hedge Review"
              value={hedgeExposure.summary.hedgeReviewAssets}
            />
            <EvidenceMetric
              label="Limit Breached"
              value={hedgeExposure.summary.exposureLimitBreachedAssets}
            />
            <EvidenceMetric
              label="Unavailable"
              value={hedgeExposure.summary.unavailableAssets}
            />
            <EvidenceMetric
              label={`Gross Deviation ${hedgeExposure.valuationQuoteAsset ?? "Quote"}`}
              value={hedgeExposure.summary.grossDeviationQuoteValue}
            />
          </div>

          {hedgeExposure.assessments.length > 0 ? (
            <div className="mt-5 grid gap-3 xl:grid-cols-2">
              {hedgeExposure.assessments.map(
                (assessment) => (
                  <article
                    key={assessment.asset}
                    className="rounded-lg border border-border-default bg-panel-light p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-text-primary">
                          {assessment.asset}
                        </p>
                        <p className="mt-1 text-xs uppercase text-text-muted">
                          {assessment.direction} · urgency {assessment.hedgeUrgency}
                        </p>
                      </div>
                      <StatusBadge
                        status={assessment.evidenceStatus}
                        label={assessment.state}
                      />
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                      <CoverageValue
                        label="Actual Quantity"
                        value={assessment.actualQuantity}
                      />
                      <CoverageValue
                        label="Target Quantity"
                        value={assessment.targetQuantity}
                      />
                      <CoverageValue
                        label="Deviation Quantity"
                        value={assessment.deviationQuantity}
                      />
                      <CoverageValue
                        label="Deviation Quote"
                        value={assessment.deviationQuoteValue}
                      />
                    </div>

                    <p className="mt-4 text-xs text-text-muted">
                      Observed venues: {assessment.observedExchanges.join(", ") || "NO_DATA"} · blockers: {assessment.blockers.join(", ") || "none"}
                    </p>
                  </article>
                ),
              )}
            </div>
          ) : (
            <NoData text={`No inventory exposure evidence. Blockers: ${hedgeExposure.blockers.join(", ") || "PORTFOLIO_EVIDENCE_UNAVAILABLE"}.`} />
          )}
        </section>
      ) : null}

      {hedgeTargets ? (
        <section className="rounded-xl border border-border-default bg-panel p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Workflow className="size-5 text-brand" />
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
                  V22.2 Bounded SHADOW Hedge Targets
                </p>
              </div>
              <h2 className="mt-2 text-xl font-bold text-text-primary">
                Reduction targets and residual exposure
              </h2>
              <p className="mt-2 text-sm text-text-muted">
                Target sizing only. Candidate venues are not selected routes; depth, fees, slippage, basis risk, risk approval, capital, intents, PAPER, LIVE, and orders remain blocked.
              </p>
            </div>
            <StatusBadge
              status={hedgeTargets.evidenceStatus}
              label={hedgeTargets.configurationState}
            />
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
            <EvidenceMetric
              label="Configured Assets"
              value={hedgeTargets.summary.configuredAssets}
            />
            <EvidenceMetric
              label="Hedge Required"
              value={hedgeTargets.summary.hedgeRequiredAssets}
            />
            <EvidenceMetric
              label="Modeled Targets"
              value={hedgeTargets.summary.modeledTargets}
            />
            <EvidenceMetric
              label="Not Required"
              value={hedgeTargets.summary.notRequiredAssets}
            />
            <EvidenceMetric
              label="Blocked Assets"
              value={hedgeTargets.summary.blockedAssets}
            />
            <EvidenceMetric
              label="Modeled Target Value"
              value={hedgeTargets.summary.totalModeledTargetQuoteValue}
            />
            <EvidenceMetric
              label="Actionable Targets"
              value={hedgeTargets.summary.actionableTargets}
            />
          </div>

          {hedgeTargets.targets.length > 0 ? (
            <div className="mt-5 grid gap-3 xl:grid-cols-2">
              {hedgeTargets.targets.map(
                (target) => (
                  <article
                    key={target.id}
                    className="rounded-lg border border-border-default bg-panel-light p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-text-primary">
                          {target.asset} · {target.side}
                        </p>
                        <p className="mt-1 text-xs uppercase text-text-muted">
                          urgency {target.urgency} · hedge ratio {(target.hedgeRatio * 100).toFixed(2)}%
                        </p>
                      </div>
                      <StatusBadge
                        status={target.evidenceStatus}
                        label={target.state}
                      />
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                      <CoverageValue
                        label="Target Quantity"
                        value={target.modeledTargetQuantity}
                      />
                      <CoverageValue
                        label="Target Quote Value"
                        value={target.modeledTargetQuoteValue}
                      />
                      <CoverageValue
                        label="Residual Quantity"
                        value={target.modeledResidualDeviationQuantity}
                      />
                      <CoverageValue
                        label="Residual Quote Value"
                        value={target.modeledResidualDeviationQuoteValue}
                      />
                    </div>

                    <p className="mt-4 text-xs text-text-muted">
                      Residual state: {target.modeledResidualState} · candidate venues: {target.candidateVenues.join(", ") || "NO_DATA"} · unresolved gates: {target.blockers.length}
                    </p>
                  </article>
                ),
              )}
            </div>
          ) : (
            <NoData text={`No SHADOW hedge-target evidence. Blockers: ${hedgeTargets.blockers.join(", ") || "EXPOSURE_EVIDENCE_UNAVAILABLE"}.`} />
          )}
        </section>
      ) : null}

      {hedgeRoutes ? (
        <section className="rounded-xl border border-border-default bg-panel p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <BarChart3 className="size-5 text-brand" />
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
                  V22.3 Read-only Hedge-route Economics
                </p>
              </div>
              <h2 className="mt-2 text-xl font-bold text-text-primary">
                Full-depth VWAP, fees, slippage, and SHADOW route ranking
              </h2>
              <p className="mt-2 text-sm text-text-muted">
                A selected route is economic evidence, not execution approval. Market rules, basis/correlation risk, risk approval, capital, intents, PAPER, LIVE, and orders remain blocked.
              </p>
            </div>
            <StatusBadge
              status={hedgeRoutes.evidenceStatus}
              label={hedgeRoutes.routeEconomicsConfigurationState}
            />
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-8">
            <EvidenceMetric
              label="Targets Requiring Route"
              value={hedgeRoutes.summary.targetsRequiringRoute}
            />
            <EvidenceMetric
              label="Candidates Evaluated"
              value={hedgeRoutes.summary.candidatesEvaluated}
            />
            <EvidenceMetric
              label="Economics Passed"
              value={hedgeRoutes.summary.candidatesPassingEconomics}
            />
            <EvidenceMetric
              label="SHADOW Routes"
              value={hedgeRoutes.summary.shadowRoutesSelected}
            />
            <EvidenceMetric
              label="Blocked Targets"
              value={hedgeRoutes.summary.blockedTargets}
            />
            <EvidenceMetric
              label="Modeled Fees"
              value={hedgeRoutes.summary.modeledFeeQuoteValue}
            />
            <EvidenceMetric
              label="Modeled Slippage"
              value={hedgeRoutes.summary.modeledSlippageQuoteValue}
            />
            <EvidenceMetric
              label="Actionable Routes"
              value={hedgeRoutes.summary.actionableRoutes}
            />
          </div>

          {hedgeRoutes.routes.length > 0 ? (
            <div className="mt-5 grid gap-3 xl:grid-cols-2">
              {hedgeRoutes.routes.map(
                (route) => (
                  <article
                    key={route.id}
                    className="rounded-lg border border-border-default bg-panel-light p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-text-primary">
                          {route.asset} · {route.side}
                        </p>
                        <p className="mt-1 text-xs uppercase text-text-muted">
                          {route.selectedCandidate
                            ? `${route.selectedCandidate.venue} · ${route.selectedCandidate.market} · ${route.selectedCandidate.feeSource}`
                            : "NO SHADOW ROUTE SELECTED"}
                        </p>
                      </div>
                      <StatusBadge
                        status={route.evidenceStatus}
                        label={route.state}
                      />
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                      <CoverageValue
                        label="Target Quantity"
                        value={route.targetQuantity}
                      />
                      <CoverageValue
                        label="VWAP"
                        value={route.selectedCandidate?.vwapPrice ?? null}
                      />
                      <CoverageValue
                        label="Fee Quote"
                        value={route.selectedCandidate?.estimatedFeeQuoteValue ?? null}
                      />
                      <CoverageValue
                        label="Slippage %"
                        value={route.selectedCandidate?.slippagePercent ?? null}
                      />
                    </div>

                    <p className="mt-4 text-xs text-text-muted">
                      Candidates: {route.candidates.length} · passing: {route.candidates.filter((candidate) => candidate.state === "ECONOMICS_PASS").length} · unresolved gates: {route.blockers.join(", ") || "none"}
                    </p>
                  </article>
                ),
              )}
            </div>
          ) : (
            <NoData text={`No SHADOW hedge-route evidence. Blockers: ${hedgeRoutes.blockers.join(", ") || "ROUTE_EVIDENCE_UNAVAILABLE"}.`} />
          )}
        </section>
      ) : null}

      {hedgeMarketRules ? (
        <section className="rounded-xl border border-border-default bg-panel p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-5 text-brand" />
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
                  V22.4 Read-only Hedge Market-rule Feasibility
                </p>
              </div>
              <h2 className="mt-2 text-xl font-bold text-text-primary">
                Canonical precision, quantity, and notional checks
              </h2>
              <p className="mt-2 text-sm text-text-muted">
                Conservative quantity rounding is feasibility evidence only—not an order instruction. Changed quantities require economics revalidation; basis risk, risk approval, capital, intents, PAPER, LIVE, and orders remain blocked.
              </p>
            </div>
            <StatusBadge
              status={hedgeMarketRules.evidenceStatus}
              label={hedgeMarketRules.marketRuleConfigurationState}
            />
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-8">
            <EvidenceMetric
              label="SHADOW Routes"
              value={hedgeMarketRules.summary.shadowRoutesSelected}
            />
            <EvidenceMetric
              label="Capabilities"
              value={hedgeMarketRules.summary.capabilitiesEvaluated}
            />
            <EvidenceMetric
              label="Rules Passed"
              value={hedgeMarketRules.summary.feasibleRoutes}
            />
            <EvidenceMetric
              label="Rules Rejected"
              value={hedgeMarketRules.summary.rejectedRoutes}
            />
            <EvidenceMetric
              label="Blocked Routes"
              value={hedgeMarketRules.summary.blockedRoutes}
            />
            <EvidenceMetric
              label="Original Quantity"
              value={hedgeMarketRules.summary.totalOriginalQuantity}
            />
            <EvidenceMetric
              label="Quantized Quantity"
              value={hedgeMarketRules.summary.totalQuantizedQuantity}
            />
            <EvidenceMetric
              label="Actionable Routes"
              value={hedgeMarketRules.summary.actionableRoutes}
            />
          </div>

          {hedgeMarketRules.assessments.length > 0 ? (
            <div className="mt-5 grid gap-3 xl:grid-cols-2">
              {hedgeMarketRules.assessments.map(
                (assessment) => (
                  <article
                    key={assessment.id}
                    className="rounded-lg border border-border-default bg-panel-light p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-text-primary">
                          {assessment.asset} · {assessment.side}
                        </p>
                        <p className="mt-1 text-xs uppercase text-text-muted">
                          {assessment.venue && assessment.market
                            ? `${assessment.venue} · ${assessment.market}`
                            : "NO SELECTED SHADOW ROUTE"}
                        </p>
                      </div>
                      <StatusBadge
                        status={assessment.evidenceStatus}
                        label={assessment.state}
                      />
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                      <CoverageValue
                        label="Original Quantity"
                        value={assessment.originalTargetQuantity}
                      />
                      <CoverageValue
                        label="Quantized Quantity"
                        value={assessment.quantizedQuantity}
                      />
                      <CoverageValue
                        label="Quantization Loss %"
                        value={assessment.quantizationLossPercent}
                      />
                      <CoverageValue
                        label="Modeled Notional"
                        value={assessment.modeledNotionalQuoteValue}
                      />
                    </div>

                    <p className="mt-4 text-xs text-text-muted">
                      Quantity step: {assessment.rules.quantityStep ?? "NO_DATA"} · minimum quantity: {assessment.rules.minimumQuantity ?? "NO_DATA"} · minimum notional: {assessment.rules.minimumNotional ?? "NO_DATA"}
                    </p>
                    <p className="mt-2 text-xs text-text-muted">
                      Blockers: {assessment.blockers.join(", ") || "none"} · remaining gates: {assessment.remainingGates.length}
                    </p>
                  </article>
                ),
              )}
            </div>
          ) : (
            <NoData text={`No hedge market-rule evidence. Blockers: ${hedgeMarketRules.blockers.join(", ") || "MARKET_RULE_EVIDENCE_UNAVAILABLE"}.`} />
          )}
        </section>
      ) : null}

      {hedgePostRuleEconomics ? (
        <section className="rounded-xl border border-border-default bg-panel p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-5 text-brand" />
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
                  V22.5 Post-quantization Economics Revalidation
                </p>
              </div>
              <h2 className="mt-2 text-xl font-bold text-text-primary">
                Exact rounded quantity rechecked on fresh route evidence
              </h2>
              <p className="mt-2 text-sm text-text-muted">
                The V22.4-selected venue and market are held fixed while
                full-depth VWAP, taker fees, freshness, executable depth and
                slippage are recalculated. Passing remains SHADOW evidence;
                basis risk, RiskEngine approval, capital, intents, PAPER,
                LIVE, and orders stay blocked.
              </p>
            </div>
            <StatusBadge
              status={hedgePostRuleEconomics.evidenceStatus}
              label={hedgePostRuleEconomics.postRuleEconomicsConfigurationState}
            />
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-8">
            <EvidenceMetric
              label="Requires Recheck"
              value={hedgePostRuleEconomics.summary.routesRequiringRevalidation}
            />
            <EvidenceMetric
              label="Revalidated"
              value={hedgePostRuleEconomics.summary.routesRevalidated}
            />
            <EvidenceMetric
              label="Rejected"
              value={hedgePostRuleEconomics.summary.routesRejected}
            />
            <EvidenceMetric
              label="Blocked"
              value={hedgePostRuleEconomics.summary.blockedRoutes}
            />
            <EvidenceMetric
              label="Quantity Changed"
              value={hedgePostRuleEconomics.summary.changedQuantityRoutes}
            />
            <EvidenceMetric
              label="Revalidated Fees"
              value={hedgePostRuleEconomics.summary.revalidatedFeeQuoteValue}
            />
            <EvidenceMetric
              label="Revalidated Slippage"
              value={hedgePostRuleEconomics.summary.revalidatedSlippageQuoteValue}
            />
            <EvidenceMetric
              label="Actionable Routes"
              value={hedgePostRuleEconomics.summary.actionableRoutes}
            />
          </div>

          {hedgePostRuleEconomics.assessments.length > 0 ? (
            <div className="mt-5 grid gap-3 xl:grid-cols-2">
              {hedgePostRuleEconomics.assessments.map(
                (assessment) => (
                  <article
                    key={assessment.id}
                    className="rounded-lg border border-border-default bg-panel-light p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-text-primary">
                          {assessment.asset} · {assessment.side}
                        </p>
                        <p className="mt-1 text-xs uppercase text-text-muted">
                          {assessment.venue && assessment.market
                            ? `${assessment.venue} · ${assessment.market}`
                            : "NO SELECTED SHADOW ROUTE"}
                        </p>
                      </div>
                      <StatusBadge
                        status={assessment.evidenceStatus}
                        label={assessment.state}
                      />
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                      <CoverageValue
                        label="Original Quantity"
                        value={assessment.originalTargetQuantity}
                      />
                      <CoverageValue
                        label="Rounded Quantity"
                        value={assessment.quantizedQuantity}
                      />
                      <CoverageValue
                        label="Revalidated VWAP"
                        value={assessment.revalidatedEconomics.vwapPrice}
                      />
                      <CoverageValue
                        label="Revalidated All-in"
                        value={assessment.revalidatedEconomics.modeledAllInQuoteValue}
                      />
                    </div>

                    <p className="mt-4 text-xs text-text-muted">
                      Executable quantity: {assessment.revalidatedEconomics.executableQuantity ?? "NO_DATA"} · fee: {assessment.revalidatedEconomics.estimatedFeeQuoteValue ?? "NO_DATA"} · slippage: {assessment.revalidatedEconomics.estimatedSlippageQuoteValue ?? "NO_DATA"}
                    </p>
                    <p className="mt-2 text-xs text-text-muted">
                      Blockers: {[...assessment.blockers, ...assessment.candidateBlockers].join(", ") || "none"} · remaining gates: {assessment.remainingGates.length}
                    </p>
                  </article>
                ),
              )}
            </div>
          ) : (
            <NoData text={`No post-rule economics evidence. Blockers: ${hedgePostRuleEconomics.blockers.join(", ") || "REVALIDATION_EVIDENCE_UNAVAILABLE"}.`} />
          )}
        </section>
      ) : null}

      {hedgeBasisRisk ? (
        <section className="rounded-xl border border-border-default bg-panel p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-5 text-brand" />
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
                  V22.6 Explicit Basis / Correlation Risk Screen
                </p>
              </div>
              <h2 className="mt-2 text-xl font-bold text-text-primary">
                Fresh basis deviation and synchronized-return correlation
              </h2>
              <p className="mt-2 text-sm text-text-muted">
                Evidence must match the V22.5-selected venue, market, asset,
                and quote asset. Correlation is never inferred from a shared
                symbol or a single price observation. A pass is not
                RiskEngine approval; capital, intents, PAPER, LIVE, and order
                submission remain blocked.
              </p>
            </div>
            <StatusBadge
              status={hedgeBasisRisk.evidenceStatus}
              label={hedgeBasisRisk.basisRiskConfigurationState}
            />
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-8">
            <EvidenceMetric
              label="Revalidated Routes"
              value={hedgeBasisRisk.summary.revalidatedRoutes}
            />
            <EvidenceMetric
              label="Evidence Matched"
              value={hedgeBasisRisk.summary.evidenceRecordsMatched}
            />
            <EvidenceMetric
              label="Risk Pass"
              value={hedgeBasisRisk.summary.riskPassingRoutes}
            />
            <EvidenceMetric
              label="Risk Rejected"
              value={hedgeBasisRisk.summary.riskRejectedRoutes}
            />
            <EvidenceMetric
              label="Blocked"
              value={hedgeBasisRisk.summary.blockedRoutes}
            />
            <EvidenceMetric
              label="Max Basis"
              value={hedgeBasisRisk.summary.maximumObservedBasisDeviationPercent}
              suffix="%"
            />
            <EvidenceMetric
              label="Min Correlation"
              value={hedgeBasisRisk.summary.minimumObservedCorrelationCoefficient}
            />
            <EvidenceMetric
              label="Actionable Routes"
              value={hedgeBasisRisk.summary.actionableRoutes}
            />
          </div>

          <p className="mt-4 text-xs text-text-muted">
            Limits: maximum evidence age {hedgeBasisRisk.thresholds.maximumEvidenceAgeMs} ms · maximum basis {hedgeBasisRisk.thresholds.maximumBasisDeviationPercent}% · minimum correlation {hedgeBasisRisk.thresholds.minimumCorrelationCoefficient} across at least {hedgeBasisRisk.thresholds.minimumCorrelationObservations} synchronized observations.
          </p>

          {hedgeBasisRisk.assessments.length > 0 ? (
            <div className="mt-5 grid gap-3 xl:grid-cols-2">
              {hedgeBasisRisk.assessments.map(
                (assessment) => (
                  <article
                    key={assessment.id}
                    className="rounded-lg border border-border-default bg-panel-light p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-text-primary">
                          {assessment.asset} · {assessment.side}
                        </p>
                        <p className="mt-1 text-xs uppercase text-text-muted">
                          {assessment.venue && assessment.market
                            ? `${assessment.venue} · ${assessment.market}`
                            : "NO MATCHED SHADOW ROUTE"}
                        </p>
                      </div>
                      <StatusBadge
                        status={assessment.evidenceStatus}
                        label={assessment.state}
                      />
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                      <CoverageValue
                        label="Hedge VWAP"
                        value={assessment.hedgeVwapPrice}
                      />
                      <CoverageValue
                        label="Reference Price"
                        value={assessment.referencePrice}
                      />
                      <CoverageValue
                        label="Absolute Basis %"
                        value={assessment.absoluteBasisDeviationPercent}
                      />
                      <CoverageValue
                        label="Correlation"
                        value={assessment.correlationCoefficient}
                      />
                    </div>

                    <p className="mt-4 text-xs text-text-muted">
                      Synchronized observations: {assessment.correlationObservations ?? "NO_DATA"} · window: {assessment.correlationWindowMs ?? "NO_DATA"} ms · evidence age: {assessment.evidenceAgeMs ?? "NO_DATA"} ms
                    </p>
                    <p className="mt-2 text-xs text-text-muted">
                      Blockers: {assessment.blockers.join(", ") || "none"} · remaining gates: {assessment.remainingGates.join(", ") || "none"}
                    </p>
                  </article>
                ),
              )}
            </div>
          ) : (
            <NoData text={`No explicit basis/correlation evidence. Blockers: ${hedgeBasisRisk.blockers.join(", ") || "BASIS_RISK_EVIDENCE_UNAVAILABLE"}.`} />
          )}
        </section>
      ) : null}

      {hedgeRiskApproval ? (
        <section className="rounded-xl border border-border-default bg-panel p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-5 text-brand" />
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
                  V22.7 Canonical RiskEngine Approval Evidence
                </p>
              </div>
              <h2 className="mt-2 text-xl font-bold text-text-primary">
                Exact-route risk decision consumed without bypass
              </h2>
              <p className="mt-2 text-sm text-text-muted">
                Only fresh canonical RiskEngine evidence matched to the exact
                V22.6 basis-risk assessment and route is accepted. The
                strategy never calls RiskEngine directly. Approval is not
                execution authorization; capital, intents, PAPER, LIVE, and
                order submission remain blocked.
              </p>
            </div>
            <StatusBadge
              status={hedgeRiskApproval.evidenceStatus}
              label={hedgeRiskApproval.riskApprovalConfigurationState}
            />
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-8">
            <EvidenceMetric
              label="Basis Pass"
              value={hedgeRiskApproval.summary.basisRiskPassingRoutes}
            />
            <EvidenceMetric
              label="Evidence Matched"
              value={hedgeRiskApproval.summary.evidenceRecordsMatched}
            />
            <EvidenceMetric
              label="Risk Approved"
              value={hedgeRiskApproval.summary.riskApprovalsGranted}
            />
            <EvidenceMetric
              label="Risk Rejected"
              value={hedgeRiskApproval.summary.riskRejections}
            />
            <EvidenceMetric
              label="Blocked"
              value={hedgeRiskApproval.summary.blockedRoutes}
            />
            <EvidenceMetric
              label="Minimum Score"
              value={hedgeRiskApproval.summary.minimumObservedRiskScore}
            />
            <EvidenceMetric
              label="Capital Reserved"
              value={hedgeRiskApproval.summary.capitalReservations}
            />
            <EvidenceMetric
              label="Actionable Routes"
              value={hedgeRiskApproval.summary.actionableRoutes}
            />
          </div>

          <p className="mt-4 text-xs text-text-muted">
            {hedgeRiskApproval.riskApprovalConfigurationState === "READY"
              ? `Maximum canonical assessment age: ${hedgeRiskApproval.thresholds.maximumAssessmentAgeMs} ms.`
              : "Canonical RiskEngine approval evidence is not configured."}
          </p>

          {hedgeRiskApproval.assessments.length > 0 ? (
            <div className="mt-5 grid gap-3 xl:grid-cols-2">
              {hedgeRiskApproval.assessments.map(
                (assessment) => (
                  <article
                    key={assessment.id}
                    className="rounded-lg border border-border-default bg-panel-light p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-text-primary">
                          {assessment.asset} · {assessment.side}
                        </p>
                        <p className="mt-1 text-xs uppercase text-text-muted">
                          {assessment.venue && assessment.market
                            ? `${assessment.venue} · ${assessment.market}`
                            : "NO MATCHED SHADOW ROUTE"}
                        </p>
                      </div>
                      <StatusBadge
                        status={assessment.evidenceStatus}
                        label={assessment.state}
                      />
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                      <CoverageValue
                        label="Risk Level"
                        value={assessment.riskLevel}
                      />
                      <CoverageValue
                        label="Risk Score"
                        value={assessment.riskScore}
                      />
                      <CoverageValue
                        label="Assessment Age"
                        value={assessment.assessmentAgeMs}
                      />
                      <CoverageValue
                        label="Approval"
                        value={assessment.riskApprovalGranted ? "GRANTED" : "NOT GRANTED"}
                      />
                    </div>

                    <p className="mt-4 text-xs text-text-muted">
                      Reasons: {assessment.reasons.join(", ") || "none"} · warnings: {assessment.warnings.join(", ") || "none"}
                    </p>
                    <p className="mt-2 text-xs text-text-muted">
                      Blockers: {assessment.blockers.join(", ") || "none"} · remaining gates: {assessment.remainingGates.join(", ") || "none"}
                    </p>
                  </article>
                ),
              )}
            </div>
          ) : (
            <NoData text={`No canonical RiskEngine approval evidence. Blockers: ${hedgeRiskApproval.blockers.join(", ") || "RISK_APPROVAL_EVIDENCE_UNAVAILABLE"}.`} />
          )}
        </section>
      ) : null}

      {hedgeCapitalReservation ? (
        <section className="rounded-xl border border-border-default bg-panel p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Database className="size-5 text-brand" />
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
                  V22.8 Canonical Capital-reservation Evidence
                </p>
              </div>
              <h2 className="mt-2 text-xl font-bold text-text-primary">
                Active capital ownership verified for the risk-approved route
              </h2>
              <p className="mt-2 text-sm text-text-muted">
                Only fresh CapitalReservationService evidence owned by the
                exact V22.7 risk approval is accepted. The strategy never
                creates, commits, or releases reservations. An active hold is
                not execution authorization; intents, PAPER, LIVE, and order
                submission remain blocked.
              </p>
            </div>
            <StatusBadge
              status={hedgeCapitalReservation.evidenceStatus}
              label={hedgeCapitalReservation.capitalReservationConfigurationState}
            />
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-8">
            <EvidenceMetric
              label="Risk Approved"
              value={hedgeCapitalReservation.summary.riskApprovedRoutes}
            />
            <EvidenceMetric
              label="Evidence Matched"
              value={hedgeCapitalReservation.summary.evidenceRecordsMatched}
            />
            <EvidenceMetric
              label="Active Reservations"
              value={hedgeCapitalReservation.summary.activeReservations}
            />
            <EvidenceMetric
              label="Rejected"
              value={hedgeCapitalReservation.summary.reservationRejections}
            />
            <EvidenceMetric
              label="Blocked"
              value={hedgeCapitalReservation.summary.blockedRoutes}
            />
            <EvidenceMetric
              label="Reserved Amount"
              value={hedgeCapitalReservation.summary.totalReservedAmount}
            />
            <EvidenceMetric
              label="Minimum TTL"
              value={hedgeCapitalReservation.summary.minimumObservedRemainingTtlMs}
              suffix=" ms"
            />
            <EvidenceMetric
              label="Actionable Routes"
              value={hedgeCapitalReservation.summary.actionableRoutes}
            />
          </div>

          <p className="mt-4 text-xs text-text-muted">
            {hedgeCapitalReservation.capitalReservationConfigurationState === "READY"
              ? `Maximum evidence age: ${hedgeCapitalReservation.thresholds.maximumEvidenceAgeMs} ms · minimum remaining reservation TTL: ${hedgeCapitalReservation.thresholds.minimumRemainingTtlMs} ms.`
              : "Canonical capital-reservation evidence is not configured."}
          </p>

          {hedgeCapitalReservation.assessments.length > 0 ? (
            <div className="mt-5 grid gap-3 xl:grid-cols-2">
              {hedgeCapitalReservation.assessments.map(
                (assessment) => (
                  <article
                    key={assessment.id}
                    className="rounded-lg border border-border-default bg-panel-light p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-text-primary">
                          {assessment.asset} · {assessment.side}
                        </p>
                        <p className="mt-1 text-xs uppercase text-text-muted">
                          {assessment.venue && assessment.market
                            ? `${assessment.venue} · ${assessment.market}`
                            : "NO MATCHED SHADOW ROUTE"}
                        </p>
                      </div>
                      <StatusBadge
                        status={assessment.evidenceStatus}
                        label={assessment.state}
                      />
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                      <CoverageValue
                        label="Requested"
                        value={assessment.requestedAmount}
                      />
                      <CoverageValue
                        label="Reserved"
                        value={assessment.reservedAmount}
                      />
                      <CoverageValue
                        label="Status"
                        value={assessment.reservationStatus}
                      />
                      <CoverageValue
                        label="Remaining TTL"
                        value={assessment.remainingTtlMs}
                        suffix=" ms"
                      />
                    </div>

                    <p className="mt-4 break-all text-xs text-text-muted">
                      Reservation: {assessment.reservationId ?? "NO_DATA"} · owner: {assessment.reservationOwnerType ?? "NO_DATA"} / {assessment.reservationOwnerId ?? "NO_DATA"}
                    </p>
                    <p className="mt-2 text-xs text-text-muted">
                      Reasons: {assessment.reservationReasons.join(", ") || "none"} · blockers: {assessment.blockers.join(", ") || "none"} · remaining gates: {assessment.remainingGates.join(", ") || "none"}
                    </p>
                  </article>
                ),
              )}
            </div>
          ) : (
            <NoData text={`No canonical capital-reservation evidence. Blockers: ${hedgeCapitalReservation.blockers.join(", ") || "CAPITAL_RESERVATION_EVIDENCE_UNAVAILABLE"}.`} />
          )}
        </section>
      ) : null}

      {hedgeIntentProposal ? (
        <section className="rounded-xl border border-border-default bg-panel p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Workflow className="size-5 text-brand" />
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
                  V22.9 Bounded Hedge-intent Proposal
                </p>
              </div>
              <h2 className="mt-2 text-xl font-bold text-text-primary">
                Exact-route proposal bounded by active reserved capital
              </h2>
              <p className="mt-2 text-sm text-text-muted">
                A deterministic SHADOW proposal can be derived only from the
                exact approved route, quantity, VWAP, and unexpired V22.8
                reservation. It is not persisted as a StrategyIntent and
                cannot mutate capital, recurse, execute, or submit an order.
              </p>
            </div>
            <StatusBadge
              status={hedgeIntentProposal.evidenceStatus}
              label={hedgeIntentProposal.intentProposalConfigurationState}
            />
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-8">
            <EvidenceMetric
              label="Capital Reserved"
              value={hedgeIntentProposal.summary.capitalReservedRoutes}
            />
            <EvidenceMetric
              label="Proposals Ready"
              value={hedgeIntentProposal.summary.proposalsReady}
            />
            <EvidenceMetric
              label="Blocked"
              value={hedgeIntentProposal.summary.blockedRoutes}
            />
            <EvidenceMetric
              label="Not Applicable"
              value={hedgeIntentProposal.summary.notApplicableRoutes}
            />
            <EvidenceMetric
              label="Proposed Quantity"
              value={hedgeIntentProposal.summary.totalProposedQuantity}
            />
            <EvidenceMetric
              label="Proposed Capital"
              value={hedgeIntentProposal.summary.totalProposedCapital}
            />
            <EvidenceMetric
              label="Actual Intents"
              value={hedgeIntentProposal.summary.strategyIntentsGenerated}
            />
            <EvidenceMetric
              label="Actionable Routes"
              value={hedgeIntentProposal.summary.actionableRoutes}
            />
          </div>

          <p className="mt-4 text-xs text-text-muted">
            {hedgeIntentProposal.intentProposalConfigurationState === "READY"
              ? `Maximum reservation-source age: ${hedgeIntentProposal.thresholds.maximumCapitalReservationAgeMs} ms · proposal TTL: ${hedgeIntentProposal.thresholds.proposalTtlMs} ms · maximum recursion depth: ${hedgeIntentProposal.thresholds.maximumRecursionDepth}.`
              : "Bounded hedge-intent proposal generation is not configured."}
          </p>

          {hedgeIntentProposal.assessments.length > 0 ? (
            <div className="mt-5 grid gap-3 xl:grid-cols-2">
              {hedgeIntentProposal.assessments.map(
                (assessment) => (
                  <article
                    key={assessment.id}
                    className="rounded-lg border border-border-default bg-panel-light p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-text-primary">
                          {assessment.asset} · {assessment.side}
                        </p>
                        <p className="mt-1 text-xs uppercase text-text-muted">
                          {assessment.venue && assessment.market
                            ? `${assessment.venue} · ${assessment.market}`
                            : "NO EXACT RESERVED ROUTE"}
                        </p>
                      </div>
                      <StatusBadge
                        status={assessment.evidenceStatus}
                        label={assessment.state}
                      />
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                      <CoverageValue
                        label="Quantity"
                        value={assessment.proposal?.proposedQuantity ?? null}
                      />
                      <CoverageValue
                        label="VWAP"
                        value={assessment.proposal?.referenceVwapPrice ?? null}
                      />
                      <CoverageValue
                        label="Capital Bound"
                        value={assessment.proposal?.proposedCapital ?? null}
                      />
                      <CoverageValue
                        label="Source Age"
                        value={assessment.sourceAgeMs}
                        suffix=" ms"
                      />
                    </div>

                    <p className="mt-4 break-all text-xs text-text-muted">
                      Proposal: {assessment.proposal?.id ?? "NO_DATA"} · reservation: {assessment.proposal?.capitalReservationId ?? "NO_DATA"}
                    </p>
                    <p className="mt-2 text-xs text-text-muted">
                      Canonical StrategyIntent: {assessment.persistedAsStrategyIntent ? "YES" : "NOT GENERATED"} · execution authorized: {assessment.executionAuthorized ? "YES" : "NO"} · recursion depth: {assessment.proposal?.recursionDepth ?? 0}
                    </p>
                    <p className="mt-2 text-xs text-text-muted">
                      Blockers: {assessment.blockers.join(", ") || "none"} · remaining gates: {assessment.remainingGates.join(", ") || "none"}
                    </p>
                  </article>
                ),
              )}
            </div>
          ) : (
            <NoData text={`No bounded hedge-intent proposals. Blockers: ${hedgeIntentProposal.blockers.join(", ") || "CAPITAL_RESERVATION_EVIDENCE_UNAVAILABLE"}.`} />
          )}
        </section>
      ) : null}

      {hedgeIntentPersistence ? (
        <section className="rounded-xl border border-border-default bg-panel p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-5 text-brand" />
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
                  V22.10 Canonical StrategyIntent Persistence
                </p>
              </div>
              <h2 className="mt-2 text-xl font-bold text-text-primary">
                Explicit handoff to immutable SHADOW intent evidence
              </h2>
              <p className="mt-2 text-sm text-text-muted">
                Only fresh, unexpired V22.9 proposals can be persisted through
                the central StrategyIntent service. Dashboard and API reads
                never create intents; exact replays deduplicate and one capital
                reservation cannot back conflicting intents. Execution remains blocked.
              </p>
            </div>
            <StatusBadge
              status={hedgeIntentPersistence.evidenceStatus}
              label={hedgeIntentPersistence.intentPersistenceConfigurationState}
            />
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
            <EvidenceMetric
              label="Proposals Ready"
              value={hedgeIntentPersistence.summary.proposalsReady}
            />
            <EvidenceMetric
              label="Intents Persisted"
              value={hedgeIntentPersistence.summary.canonicalIntentsPersisted}
            />
            <EvidenceMetric
              label="Not Persisted"
              value={hedgeIntentPersistence.summary.proposalsNotPersisted}
            />
            <EvidenceMetric
              label="Blocked"
              value={hedgeIntentPersistence.summary.blockedRoutes}
            />
            <EvidenceMetric
              label="Active SHADOW"
              value={hedgeIntentPersistence.summary.activeShadowIntents}
            />
            <EvidenceMetric
              label="Executable Intents"
              value={hedgeIntentPersistence.summary.executableIntents}
            />
            <EvidenceMetric
              label="Actionable Routes"
              value={hedgeIntentPersistence.summary.actionableRoutes}
            />
          </div>

          <p className="mt-4 text-xs text-text-muted">
            {hedgeIntentPersistence.intentPersistenceConfigurationState === "READY"
              ? `Maximum proposal age: ${hedgeIntentPersistence.thresholds.maximumProposalAgeMs} ms. Persistence requires an explicit handoff; read-model refreshes remain side-effect free.`
              : "Canonical hedge StrategyIntent persistence is not configured."}
          </p>

          {hedgeIntentPersistence.assessments.length > 0 ? (
            <div className="mt-5 grid gap-3 xl:grid-cols-2">
              {hedgeIntentPersistence.assessments.map(
                (assessment) => (
                  <article
                    key={assessment.id}
                    className="rounded-lg border border-border-default bg-panel-light p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-text-primary">
                          {assessment.asset} · {assessment.side}
                        </p>
                        <p className="mt-1 text-xs uppercase text-text-muted">
                          {assessment.venue && assessment.market
                            ? `${assessment.venue} · ${assessment.market}`
                            : "NO CANONICAL INTENT ROUTE"}
                        </p>
                      </div>
                      <StatusBadge
                        status={assessment.evidenceStatus}
                        label={assessment.state}
                      />
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                      <CoverageValue
                        label="Quantity"
                        value={assessment.intent?.evidence.proposedQuantity ?? null}
                      />
                      <CoverageValue
                        label="VWAP"
                        value={assessment.intent?.evidence.referenceVwapPrice ?? null}
                      />
                      <CoverageValue
                        label="Capital"
                        value={assessment.intent?.proposedCapital ?? null}
                      />
                      <CoverageValue
                        label="Proposal Age"
                        value={assessment.proposalAgeMs}
                        suffix=" ms"
                      />
                    </div>

                    <p className="mt-4 break-all text-xs text-text-muted">
                      StrategyIntent: {assessment.intent?.id ?? "NO_DATA"} · source proposal: {assessment.sourceProposalId ?? "NO_DATA"}
                    </p>
                    <p className="mt-2 text-xs text-text-muted">
                      Mode: {assessment.intent?.proposedMode ?? "NO_DATA"} · execution authorized: {assessment.executionAuthorized ? "YES" : "NO"} · reservation mutation: {assessment.intent?.evidence.reservationMutationAuthorized ? "YES" : "NO"}
                    </p>
                    <p className="mt-2 text-xs text-text-muted">
                      Blockers: {assessment.blockers.join(", ") || "none"} · remaining gates: {assessment.remainingGates.join(", ") || "none"}
                    </p>
                  </article>
                ),
              )}
            </div>
          ) : (
            <NoData text={`No canonical hedge StrategyIntent evidence. Blockers: ${hedgeIntentPersistence.blockers.join(", ") || "INTENT_PROPOSAL_EVIDENCE_UNAVAILABLE"}.`} />
          )}
        </section>
      ) : null}

      {hedgeIntentLifecycle ? (
        <section className="rounded-xl border border-border-default bg-panel p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-5 text-brand" />
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
                  V22.11 Immutable StrategyIntent Lifecycle
                </p>
              </div>
              <h2 className="mt-2 text-xl font-bold text-text-primary">
                Exact-source revalidation, expiry and irreversible revocation
              </h2>
              <p className="mt-2 text-sm text-text-muted">
                Every canonical SHADOW hedge intent is rechecked against its
                exact source proposal and both intent and reservation TTLs.
                Terminal evidence is immutable; reads create nothing and the
                original StrategyIntent is never edited. Execution remains blocked.
              </p>
            </div>
            <StatusBadge
              status={hedgeIntentLifecycle.evidenceStatus}
              label={hedgeIntentLifecycle.intentLifecycleConfigurationState}
            />
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-8">
            <EvidenceMetric
              label="Canonical Intents"
              value={hedgeIntentLifecycle.summary.canonicalIntents}
            />
            <EvidenceMetric
              label="Active"
              value={hedgeIntentLifecycle.summary.activeIntents}
            />
            <EvidenceMetric
              label="Expired"
              value={hedgeIntentLifecycle.summary.expiredIntents}
            />
            <EvidenceMetric
              label="Revoked"
              value={hedgeIntentLifecycle.summary.revokedIntents}
            />
            <EvidenceMetric
              label="Blocked"
              value={hedgeIntentLifecycle.summary.blockedIntents}
            />
            <EvidenceMetric
              label="Terminal Events"
              value={hedgeIntentLifecycle.summary.terminalEventsRecorded}
            />
            <EvidenceMetric
              label="Executable"
              value={hedgeIntentLifecycle.summary.executableIntents}
            />
            <EvidenceMetric
              label="Actionable"
              value={hedgeIntentLifecycle.summary.actionableIntents}
            />
          </div>

          <p className="mt-4 text-xs text-text-muted">
            {hedgeIntentLifecycle.intentLifecycleConfigurationState === "READY"
              ? `Maximum intent age: ${hedgeIntentLifecycle.thresholds.maximumIntentAgeMs} ms. Terminalization requires an explicit lifecycle handoff; reads stay write-free.`
              : "Hedge StrategyIntent lifecycle revalidation is not configured."}
          </p>

          {hedgeIntentLifecycle.assessments.length > 0 ? (
            <div className="mt-5 grid gap-3 xl:grid-cols-2">
              {hedgeIntentLifecycle.assessments.map(
                (assessment) => (
                  <article
                    key={assessment.id}
                    className="rounded-lg border border-border-default bg-panel-light p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-text-primary">
                          {assessment.asset} / {assessment.quoteAsset} - {assessment.side}
                        </p>
                        <p className="mt-1 text-xs uppercase text-text-muted">
                          {assessment.venue} - {assessment.market}
                        </p>
                      </div>
                      <StatusBadge
                        status={assessment.evidenceStatus}
                        label={assessment.state}
                      />
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                      <CoverageValue
                        label="Intent Age"
                        value={assessment.intentAgeMs}
                        suffix=" ms"
                      />
                      <CoverageValue
                        label="Intent Expires"
                        value={assessment.intentExpiresAt}
                      />
                      <CoverageValue
                        label="Reservation Expires"
                        value={assessment.capitalReservationExpiresAt}
                      />
                      <CoverageValue
                        label="Terminal Recorded"
                        value={assessment.terminalEvent?.recordedAt ?? null}
                      />
                    </div>

                    <p className="mt-4 break-all text-xs text-text-muted">
                      StrategyIntent: {assessment.intentId} - source proposal: {assessment.sourceProposalId}
                    </p>
                    <p className="mt-2 text-xs text-text-muted">
                      Terminal event: {assessment.terminalEvent?.id ?? "NO_DATA"} - canonical intent mutated: {assessment.terminalEvent?.canonicalIntentMutated ? "YES" : "NO"} - execution authorized: {assessment.executionAuthorized ? "YES" : "NO"}
                    </p>
                    <p className="mt-2 text-xs text-text-muted">
                      Blockers: {assessment.blockers.join(", ") || "none"} - remaining gates: {assessment.remainingGates.join(", ") || "none"}
                    </p>
                  </article>
                ),
              )}
            </div>
          ) : (
            <NoData text={`No hedge StrategyIntent lifecycle evidence. Blockers: ${hedgeIntentLifecycle.blockers.join(", ") || "CANONICAL_STRATEGY_INTENT_NOT_FOUND"}.`} />
          )}
        </section>
      ) : null}

      {hedgeIntentLastLook ? (
        <section className="rounded-xl border border-border-default bg-panel p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-5 text-brand" />
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
                  V22.12 Lifecycle-active Intent Last Look
                </p>
              </div>
              <h2 className="mt-2 text-xl font-bold text-text-primary">
                Final freshness and exact-lineage preflight evidence
              </h2>
              <p className="mt-2 text-sm text-text-muted">
                Only lifecycle-ACTIVE canonical SHADOW intents enter this
                preflight. Exact source lineage and both intent and reservation
                TTLs are checked again. A pass creates no execution plan and
                grants no capital, PAPER, LIVE or order authority.
              </p>
            </div>
            <StatusBadge
              status={hedgeIntentLastLook.evidenceStatus}
              label={hedgeIntentLastLook.intentPreflightConfigurationState}
            />
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-8">
            <EvidenceMetric
              label="Lifecycle Intents"
              value={hedgeIntentLastLook.summary.lifecycleIntents}
            />
            <EvidenceMetric
              label="Lifecycle Active"
              value={hedgeIntentLastLook.summary.lifecycleActiveIntents}
            />
            <EvidenceMetric
              label="Preflight Passed"
              value={hedgeIntentLastLook.summary.preflightPassedIntents}
            />
            <EvidenceMetric
              label="Preflight Rejected"
              value={hedgeIntentLastLook.summary.preflightRejectedIntents}
            />
            <EvidenceMetric
              label="Blocked"
              value={hedgeIntentLastLook.summary.blockedIntents}
            />
            <EvidenceMetric
              label="Execution Plans"
              value={hedgeIntentLastLook.summary.executionPlansCreated}
            />
            <EvidenceMetric
              label="Executable"
              value={hedgeIntentLastLook.summary.executableIntents}
            />
            <EvidenceMetric
              label="Actionable"
              value={hedgeIntentLastLook.summary.actionableIntents}
            />
          </div>

          <p className="mt-4 text-xs text-text-muted">
            {hedgeIntentLastLook.intentPreflightConfigurationState === "READY"
              ? `Maximum lifecycle age: ${hedgeIntentLastLook.thresholds.maximumLifecycleAgeMs} ms. A pass remains SHADOW evidence and does not create an execution plan.`
              : "Hedge intent last-look preflight is not configured."}
          </p>

          {hedgeIntentLastLook.assessments.length > 0 ? (
            <div className="mt-5 grid gap-3 xl:grid-cols-2">
              {hedgeIntentLastLook.assessments.map(
                (assessment) => (
                  <article
                    key={assessment.id}
                    className="rounded-lg border border-border-default bg-panel-light p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-text-primary">
                          {assessment.asset} / {assessment.quoteAsset} - {assessment.side}
                        </p>
                        <p className="mt-1 text-xs uppercase text-text-muted">
                          {assessment.venue} - {assessment.market}
                        </p>
                      </div>
                      <StatusBadge
                        status={assessment.evidenceStatus}
                        label={assessment.state}
                      />
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                      <CoverageValue
                        label="Quantity"
                        value={assessment.proposedQuantity}
                      />
                      <CoverageValue
                        label="VWAP"
                        value={assessment.referenceVwapPrice}
                      />
                      <CoverageValue
                        label="Capital"
                        value={assessment.proposedCapital}
                      />
                      <CoverageValue
                        label="Lifecycle Age"
                        value={assessment.lifecycleAgeMs}
                        suffix=" ms"
                      />
                    </div>

                    <p className="mt-4 break-all text-xs text-text-muted">
                      StrategyIntent: {assessment.intentId} - source proposal: {assessment.sourceProposalId} - reservation: {assessment.capitalReservationId}
                    </p>
                    <p className="mt-2 text-xs text-text-muted">
                      Last look passed: {assessment.lastLookPassed ? "YES" : "NO"} - execution plan created: {assessment.executionPlanCreated ? "YES" : "NO"} - execution authorized: {assessment.executionAuthorized ? "YES" : "NO"}
                    </p>
                    <p className="mt-2 text-xs text-text-muted">
                      Blockers: {assessment.blockers.join(", ") || "none"} - remaining gates: {assessment.remainingGates.join(", ") || "none"}
                    </p>
                  </article>
                ),
              )}
            </div>
          ) : (
            <NoData text={`No hedge intent last-look evidence. Blockers: ${hedgeIntentLastLook.blockers.join(", ") || "INTENT_LIFECYCLE_EVIDENCE_UNAVAILABLE"}.`} />
          )}
        </section>
      ) : null}

      {hedgeExecutionPlanProposal ? (
        <section className="rounded-xl border border-border-default bg-panel p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-5 text-brand" />
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
                  V22.13 Bounded SHADOW Execution-plan Proposal
                </p>
              </div>
              <h2 className="mt-2 text-xl font-bold text-text-primary">
                Deterministic single-leg plan proposal without order authority
              </h2>
              <p className="mt-2 text-sm text-text-muted">
                Only fresh V22.12 PREFLIGHT_PASS evidence produces this immutable
                proposal. It is not the canonical trading ExecutionPlan, selects
                no order type or time-in-force, and cannot commit capital or submit orders.
              </p>
            </div>
            <StatusBadge
              status={hedgeExecutionPlanProposal.evidenceStatus}
              label={hedgeExecutionPlanProposal.executionPlanProposalConfigurationState}
            />
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-9">
            <EvidenceMetric label="Preflight Passed" value={hedgeExecutionPlanProposal.summary.preflightPassedIntents} />
            <EvidenceMetric label="Proposals Ready" value={hedgeExecutionPlanProposal.summary.planProposalsReady} />
            <EvidenceMetric label="Not Applicable" value={hedgeExecutionPlanProposal.summary.notApplicableIntents} />
            <EvidenceMetric label="Blocked" value={hedgeExecutionPlanProposal.summary.blockedIntents} />
            <EvidenceMetric label="Quantity" value={hedgeExecutionPlanProposal.summary.totalProposedQuantity} />
            <EvidenceMetric label="Capital" value={hedgeExecutionPlanProposal.summary.totalProposedCapital} />
            <EvidenceMetric label="Canonical Plans" value={hedgeExecutionPlanProposal.summary.canonicalExecutionPlansCreated} />
            <EvidenceMetric label="Executable" value={hedgeExecutionPlanProposal.summary.executablePlans} />
            <EvidenceMetric label="Actionable" value={hedgeExecutionPlanProposal.summary.actionablePlans} />
          </div>

          <p className="mt-4 text-xs text-text-muted">
            {hedgeExecutionPlanProposal.executionPlanProposalConfigurationState === "READY"
              ? `Maximum preflight age: ${hedgeExecutionPlanProposal.thresholds.maximumPreflightAgeMs} ms - proposal TTL: ${hedgeExecutionPlanProposal.thresholds.proposalTtlMs} ms.`
              : "SHADOW hedge execution-plan proposal generation is not configured."}
          </p>

          {hedgeExecutionPlanProposal.assessments.length > 0 ? (
            <div className="mt-5 grid gap-3 xl:grid-cols-2">
              {hedgeExecutionPlanProposal.assessments.map((assessment) => (
                <article key={assessment.id} className="rounded-lg border border-border-default bg-panel-light p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-text-primary">
                        {assessment.asset} / {assessment.quoteAsset} - {assessment.side}
                      </p>
                      <p className="mt-1 text-xs uppercase text-text-muted">
                        {assessment.venue} - {assessment.market}
                      </p>
                    </div>
                    <StatusBadge status={assessment.evidenceStatus} label={assessment.state} />
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                    <CoverageValue label="Quantity" value={assessment.proposal?.leg.quantity ?? null} />
                    <CoverageValue label="Reference Price" value={assessment.proposal?.leg.referencePrice ?? null} />
                    <CoverageValue label="Capital" value={assessment.proposal?.proposedCapital ?? null} />
                    <CoverageValue label="Preflight Age" value={assessment.preflightAgeMs} suffix=" ms" />
                  </div>
                  <p className="mt-4 break-all text-xs text-text-muted">
                    Proposal: {assessment.proposal?.id ?? "NO_DATA"} - validation: {assessment.proposal?.validationHash ?? "NO_DATA"}
                  </p>
                  <p className="mt-2 text-xs text-text-muted">
                    Order type selected: {assessment.proposal?.leg.orderTypeSelected ? "YES" : "NO"} - canonical plan created: {assessment.executionPlanCreated ? "YES" : "NO"} - execution authorized: {assessment.executionAuthorized ? "YES" : "NO"}
                  </p>
                  <p className="mt-2 text-xs text-text-muted">
                    Blockers: {assessment.blockers.join(", ") || "none"} - remaining gates: {assessment.remainingGates.join(", ") || "none"}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <NoData text={`No SHADOW execution-plan proposals. Blockers: ${hedgeExecutionPlanProposal.blockers.join(", ") || "INTENT_PREFLIGHT_EVIDENCE_UNAVAILABLE"}.`} />
          )}
        </section>
      ) : null}

      {hedgeShadowFillSimulation ? (
        <section className="rounded-xl border border-border-default bg-panel p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Activity className="size-5 text-brand" />
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
                  V22.14 Exact-match SHADOW Fill Simulation
                </p>
              </div>
              <h2 className="mt-2 text-xl font-bold text-text-primary">
                Fees, VWAP, slippage, partial fill and residual exposure
              </h2>
              <p className="mt-2 text-sm text-text-muted">
                Fresh replay evidence must exactly match the V22.13 proposal ID,
                validation hash and route leg. Results are analytical only: no
                exchange fill, balance mutation, canonical plan or order action is created.
              </p>
            </div>
            <StatusBadge
              status={hedgeShadowFillSimulation.evidenceStatus}
              label={hedgeShadowFillSimulation.shadowFillSimulationConfigurationState}
            />
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <EvidenceMetric label="Plans Evaluated" value={hedgeShadowFillSimulation.summary.planProposalsEvaluated} />
            <EvidenceMetric label="Full Fills" value={hedgeShadowFillSimulation.summary.simulatedFullFills} />
            <EvidenceMetric label="Partial Fills" value={hedgeShadowFillSimulation.summary.simulatedPartialFills} />
            <EvidenceMetric label="Rejected" value={hedgeShadowFillSimulation.summary.rejectedSimulations} />
            <EvidenceMetric label="Blocked" value={hedgeShadowFillSimulation.summary.blockedPlans} />
            <EvidenceMetric label="Actual Fills" value={hedgeShadowFillSimulation.summary.actualExchangeFills} />
            <EvidenceMetric label="Requested Qty" value={hedgeShadowFillSimulation.summary.totalRequestedQuantity} />
            <EvidenceMetric label="Simulated Qty" value={hedgeShadowFillSimulation.summary.totalSimulatedFilledQuantity} />
            <EvidenceMetric label="Residual Qty" value={hedgeShadowFillSimulation.summary.totalSimulatedResidualQuantity} />
            <EvidenceMetric label="Fees" value={hedgeShadowFillSimulation.summary.totalSimulatedFeeQuoteValue} />
            <EvidenceMetric label="Slippage Value" value={hedgeShadowFillSimulation.summary.totalSimulatedSlippageQuoteValue} />
            <EvidenceMetric label="Residual Exposure" value={hedgeShadowFillSimulation.summary.totalResidualExposureQuoteValue} />
          </div>

          <p className="mt-4 text-xs text-text-muted">
            {hedgeShadowFillSimulation.shadowFillSimulationConfigurationState === "READY"
              ? `Maximum evidence age: ${hedgeShadowFillSimulation.thresholds.maximumEvidenceAgeMs} ms - maximum adverse slippage: ${hedgeShadowFillSimulation.thresholds.maximumSlippagePercent}%.`
              : "Exact-match SHADOW fill simulation is not configured."}
          </p>

          {hedgeShadowFillSimulation.assessments.length > 0 ? (
            <div className="mt-5 grid gap-3 xl:grid-cols-2">
              {hedgeShadowFillSimulation.assessments.map((assessment) => (
                <article key={assessment.id} className="rounded-lg border border-border-default bg-panel-light p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-text-primary">
                        {assessment.asset} / {assessment.quoteAsset} - {assessment.side}
                      </p>
                      <p className="mt-1 text-xs uppercase text-text-muted">
                        {assessment.venue} - {assessment.market}
                      </p>
                    </div>
                    <StatusBadge status={assessment.evidenceStatus} label={assessment.state} />
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                    <CoverageValue label="Requested" value={assessment.simulation?.requestedQuantity ?? null} />
                    <CoverageValue label="Filled" value={assessment.simulation?.simulatedFilledQuantity ?? null} />
                    <CoverageValue label="Residual" value={assessment.simulation?.simulatedResidualQuantity ?? null} />
                    <CoverageValue label="Fill Ratio" value={assessment.simulation?.fillRatioPercent ?? null} suffix="%" />
                    <CoverageValue label="VWAP" value={assessment.simulation?.simulatedVwapPrice ?? null} />
                    <CoverageValue label="Fee" value={assessment.simulation?.simulatedFeeQuoteValue ?? null} />
                    <CoverageValue label="Slippage" value={assessment.simulation?.simulatedSlippagePercent ?? null} suffix="%" />
                    <CoverageValue label="Residual Exposure" value={assessment.simulation?.residualExposureQuoteValue ?? null} />
                  </div>
                  <p className="mt-4 break-all text-xs text-text-muted">
                    Plan: {assessment.planProposalId ?? "NO_DATA"} - simulation: {assessment.simulation?.id ?? "NO_DATA"}
                  </p>
                  <p className="mt-2 text-xs text-text-muted">
                    Exchange fill: {assessment.exchangeFillCreated ? "YES" : "NO"} - reconciled: {assessment.executionReconciled ? "YES" : "NO"} - execution authorized: {assessment.executionAuthorized ? "YES" : "NO"}
                  </p>
                  <p className="mt-2 text-xs text-text-muted">
                    Blockers: {assessment.blockers.join(", ") || "none"} - remaining gates: {assessment.remainingGates.join(", ") || "none"}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <NoData text={`No SHADOW fill simulations. Blockers: ${hedgeShadowFillSimulation.blockers.join(", ") || "SHADOW_FILL_EVIDENCE_UNAVAILABLE"}.`} />
          )}
        </section>
      ) : null}

      {hedgeResidualReconciliation ? (
        <section className="rounded-xl border border-border-default bg-panel p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-5 text-brand" />
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
                  V22.15 Residual Reconciliation and Recovery Evidence
                </p>
              </div>
              <h2 className="mt-2 text-xl font-bold text-text-primary">
                Exact SHADOW-ledger closeout or recovery-required classification
              </h2>
              <p className="mt-2 text-sm text-text-muted">
                Fresh evidence must exactly match the V22.14 simulation and its
                complete lineage. Residual exposure can be classified warning or
                critical, but no LIVE reconciliation record, incident or recovery action is created.
              </p>
            </div>
            <StatusBadge
              status={hedgeResidualReconciliation.evidenceStatus}
              label={hedgeResidualReconciliation.residualReconciliationConfigurationState}
            />
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <EvidenceMetric label="Eligible" value={hedgeResidualReconciliation.summary.eligibleSimulations} />
            <EvidenceMetric label="Closed" value={hedgeResidualReconciliation.summary.reconciledClosed} />
            <EvidenceMetric label="Recovery Required" value={hedgeResidualReconciliation.summary.recoveryRequired} />
            <EvidenceMetric label="Warnings" value={hedgeResidualReconciliation.summary.warningResiduals} />
            <EvidenceMetric label="Critical" value={hedgeResidualReconciliation.summary.criticalResiduals} />
            <EvidenceMetric label="Rejected" value={hedgeResidualReconciliation.summary.rejectedReconciliations} />
            <EvidenceMetric label="Blocked" value={hedgeResidualReconciliation.summary.blockedSimulations} />
            <EvidenceMetric label="Residual Qty" value={hedgeResidualReconciliation.summary.totalReconciledResidualQuantity} />
            <EvidenceMetric label="Residual Exposure" value={hedgeResidualReconciliation.summary.totalReconciledResidualExposureQuoteValue} />
            <EvidenceMetric label="LIVE Reconciliations" value={hedgeResidualReconciliation.summary.liveReconciliationRecordsCreated} />
            <EvidenceMetric label="Recovery Incidents" value={hedgeResidualReconciliation.summary.recoveryIncidentsCreated} />
            <EvidenceMetric label="Recovery Actions" value={hedgeResidualReconciliation.summary.recoveryActionsCreated} />
          </div>

          <p className="mt-4 text-xs text-text-muted">
            {hedgeResidualReconciliation.residualReconciliationConfigurationState === "READY"
              ? `Maximum evidence age: ${hedgeResidualReconciliation.thresholds.maximumEvidenceAgeMs} ms - residual tolerance: ${hedgeResidualReconciliation.thresholds.residualQuantityTolerance} - critical exposure: ${hedgeResidualReconciliation.thresholds.criticalResidualExposureQuoteValue}.`
              : "Residual reconciliation evidence is not configured."}
          </p>

          {hedgeResidualReconciliation.assessments.length > 0 ? (
            <div className="mt-5 grid gap-3 xl:grid-cols-2">
              {hedgeResidualReconciliation.assessments.map((assessment) => (
                <article key={assessment.id} className="rounded-lg border border-border-default bg-panel-light p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-text-primary">
                        {assessment.asset} / {assessment.quoteAsset} - {assessment.side}
                      </p>
                      <p className="mt-1 text-xs uppercase text-text-muted">
                        {assessment.venue} - {assessment.market}
                      </p>
                    </div>
                    <StatusBadge status={assessment.evidenceStatus} label={assessment.state} />
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                    <CoverageValue label="Filled" value={assessment.reconciliation?.reconciledFilledQuantity ?? null} />
                    <CoverageValue label="Residual" value={assessment.reconciliation?.reconciledResidualQuantity ?? null} />
                    <CoverageValue label="Exposure" value={assessment.reconciliation?.reconciledResidualExposureQuoteValue ?? null} />
                    <CoverageValue label="Evidence Age" value={assessment.evidenceAgeMs} suffix=" ms" />
                  </div>
                  <p className="mt-4 text-xs text-text-muted">
                    Direction: {assessment.reconciliation?.residualDirection ?? "NO_DATA"} - severity: {assessment.reconciliation?.severity ?? "NO_DATA"} - recommendation: {assessment.reconciliation?.recommendedAction ?? "NO_DATA"}
                  </p>
                  <p className="mt-2 break-all text-xs text-text-muted">
                    Simulation: {assessment.simulationId ?? "NO_DATA"} - reconciliation: {assessment.reconciliation?.id ?? "NO_DATA"}
                  </p>
                  <p className="mt-2 text-xs text-text-muted">
                    Recovery incident: {assessment.recoveryIncidentCreated ? "YES" : "NO"} - recovery action: {assessment.recoveryActionCreated ? "YES" : "NO"} - execution authorized: {assessment.executionAuthorized ? "YES" : "NO"}
                  </p>
                  <p className="mt-2 text-xs text-text-muted">
                    Blockers: {assessment.blockers.join(", ") || "none"} - remaining gates: {assessment.remainingGates.join(", ") || "none"}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <NoData text={`No residual reconciliation evidence. Blockers: ${hedgeResidualReconciliation.blockers.join(", ") || "RESIDUAL_RECONCILIATION_EVIDENCE_UNAVAILABLE"}.`} />
          )}
        </section>
      ) : null}

      {hedgeRecoveryProposal ? (
        <section className="rounded-xl border border-border-default bg-panel p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Workflow className="size-5 text-brand" />
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
                  V22.16 Bounded SHADOW Recovery-action Proposal
                </p>
              </div>
              <h2 className="mt-2 text-xl font-bold text-text-primary">
                Residual counter-side proposal without recovery or order authority
              </h2>
              <p className="mt-2 text-sm text-text-muted">
                Exact V22.15 recovery-required evidence maps LONG residuals to SELL
                and SHORT residuals to BUY. Quantity, quote value and TTL stay bounded;
                no incident, recovery action, canonical plan or exchange order is created.
              </p>
            </div>
            <StatusBadge
              status={hedgeRecoveryProposal.evidenceStatus}
              label={hedgeRecoveryProposal.recoveryProposalConfigurationState}
            />
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <EvidenceMetric label="Recovery Required" value={hedgeRecoveryProposal.summary.recoveryRequiredAssessments} />
            <EvidenceMetric label="Proposals Ready" value={hedgeRecoveryProposal.summary.recoveryProposalsReady} />
            <EvidenceMetric label="Warnings" value={hedgeRecoveryProposal.summary.warningProposals} />
            <EvidenceMetric label="Critical" value={hedgeRecoveryProposal.summary.criticalProposals} />
            <EvidenceMetric label="Not Required" value={hedgeRecoveryProposal.summary.notRequiredAssessments} />
            <EvidenceMetric label="Blocked" value={hedgeRecoveryProposal.summary.blockedAssessments} />
            <EvidenceMetric label="Proposed Qty" value={hedgeRecoveryProposal.summary.totalProposedRecoveryQuantity} />
            <EvidenceMetric label="Proposed Value" value={hedgeRecoveryProposal.summary.totalProposedRecoveryQuoteValue} />
            <EvidenceMetric label="Recovery Incidents" value={hedgeRecoveryProposal.summary.recoveryIncidentsCreated} />
            <EvidenceMetric label="Recovery Actions" value={hedgeRecoveryProposal.summary.recoveryActionsCreated} />
            <EvidenceMetric label="Canonical Plans" value={hedgeRecoveryProposal.summary.canonicalExecutionPlansCreated} />
            <EvidenceMetric label="Actionable" value={hedgeRecoveryProposal.summary.actionableRecoveryActions} />
          </div>

          <p className="mt-4 text-xs text-text-muted">
            {hedgeRecoveryProposal.recoveryProposalConfigurationState === "READY"
              ? `Maximum reconciliation age: ${hedgeRecoveryProposal.thresholds.maximumReconciliationAgeMs} ms - proposal TTL: ${hedgeRecoveryProposal.thresholds.proposalTtlMs} ms - maximum proposal value: ${hedgeRecoveryProposal.thresholds.maximumProposalQuoteValue}.`
              : "Bounded SHADOW recovery proposal generation is not configured."}
          </p>

          {hedgeRecoveryProposal.assessments.length > 0 ? (
            <div className="mt-5 grid gap-3 xl:grid-cols-2">
              {hedgeRecoveryProposal.assessments.map((assessment) => (
                <article key={assessment.id} className="rounded-lg border border-border-default bg-panel-light p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-text-primary">
                        {assessment.asset} / {assessment.quoteAsset}
                      </p>
                      <p className="mt-1 text-xs uppercase text-text-muted">
                        {assessment.venue} - {assessment.market}
                      </p>
                    </div>
                    <StatusBadge status={assessment.evidenceStatus} label={assessment.state} />
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                    <CoverageValue label="Side" value={assessment.proposal?.leg.side ?? null} />
                    <CoverageValue label="Quantity" value={assessment.proposal?.leg.quantity ?? null} />
                    <CoverageValue label="Reference" value={assessment.proposal?.leg.referencePrice ?? null} />
                    <CoverageValue label="Quote Value" value={assessment.proposal?.leg.estimatedQuoteValue ?? null} />
                  </div>
                  <p className="mt-4 text-xs text-text-muted">
                    Type: {assessment.proposal?.recoveryActionType ?? "NO_DATA"} - severity: {assessment.proposal?.sourceSeverity ?? "NO_DATA"} - age: {assessment.reconciliationAgeMs ?? "NO_DATA"} ms
                  </p>
                  <p className="mt-2 break-all text-xs text-text-muted">
                    Proposal: {assessment.proposal?.id ?? "NO_DATA"} - reconciliation: {assessment.reconciliationId ?? "NO_DATA"}
                  </p>
                  <p className="mt-2 text-xs text-text-muted">
                    Incident: {assessment.recoveryIncidentCreated ? "YES" : "NO"} - action created: {assessment.recoveryActionCreated ? "YES" : "NO"} - canonical plan: {assessment.canonicalExecutionPlanCreated ? "YES" : "NO"} - execution: {assessment.executionAuthorized ? "YES" : "NO"}
                  </p>
                  <p className="mt-2 text-xs text-text-muted">
                    Blockers: {assessment.blockers.join(", ") || "none"} - remaining gates: {assessment.remainingGates.join(", ") || "none"}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <NoData text={`No SHADOW recovery proposals. Blockers: ${hedgeRecoveryProposal.blockers.join(", ") || "RESIDUAL_RECONCILIATION_EVIDENCE_UNAVAILABLE"}.`} />
          )}
        </section>
      ) : null}

      {hedgeRecoveryProposalLifecycle ? (
        <section className="rounded-xl border border-border-default bg-panel p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Workflow className="size-5 text-brand" />
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
                  V22.17 Immutable Recovery-proposal Lifecycle
                </p>
              </div>
              <h2 className="mt-2 text-xl font-bold text-text-primary">
                Expiry and exact operator-decision evidence without action authority
              </h2>
              <p className="mt-2 text-sm text-text-muted">
                Exact V22.16 proposal IDs and validation hashes are rechecked before
                external APPROVE or REJECT evidence is accepted. Approval remains
                analytical evidence and cannot create a recovery action, plan or order.
              </p>
            </div>
            <StatusBadge
              status={hedgeRecoveryProposalLifecycle.evidenceStatus}
              label={hedgeRecoveryProposalLifecycle.recoveryProposalLifecycleConfigurationState}
            />
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <EvidenceMetric label="Source Ready" value={hedgeRecoveryProposalLifecycle.summary.sourceProposalsReady} />
            <EvidenceMetric label="Awaiting Decision" value={hedgeRecoveryProposalLifecycle.summary.activeAwaitingOperatorDecision} />
            <EvidenceMetric label="Approved" value={hedgeRecoveryProposalLifecycle.summary.operatorApproved} />
            <EvidenceMetric label="Rejected" value={hedgeRecoveryProposalLifecycle.summary.operatorRejected} />
            <EvidenceMetric label="Expired" value={hedgeRecoveryProposalLifecycle.summary.expiredProposals} />
            <EvidenceMetric label="Blocked" value={hedgeRecoveryProposalLifecycle.summary.blockedAssessments} />
            <EvidenceMetric label="Decisions Accepted" value={hedgeRecoveryProposalLifecycle.summary.explicitOperatorDecisionsAccepted} />
            <EvidenceMetric label="Lifecycle Records" value={hedgeRecoveryProposalLifecycle.summary.lifecycleRecordsProduced} />
            <EvidenceMetric label="Recovery Incidents" value={hedgeRecoveryProposalLifecycle.summary.recoveryIncidentsCreated} />
            <EvidenceMetric label="Recovery Actions" value={hedgeRecoveryProposalLifecycle.summary.recoveryActionsCreated} />
            <EvidenceMetric label="Canonical Plans" value={hedgeRecoveryProposalLifecycle.summary.canonicalExecutionPlansCreated} />
            <EvidenceMetric label="Actionable" value={hedgeRecoveryProposalLifecycle.summary.actionableRecoveryActions} />
          </div>

          <p className="mt-4 text-xs text-text-muted">
            {hedgeRecoveryProposalLifecycle.recoveryProposalLifecycleConfigurationState === "READY"
              ? `Maximum proposal age: ${hedgeRecoveryProposalLifecycle.thresholds.maximumProposalAgeMs} ms - maximum operator-decision age: ${hedgeRecoveryProposalLifecycle.thresholds.maximumOperatorDecisionAgeMs} ms - operator evidence: ${hedgeRecoveryProposalLifecycle.operatorDecisionEvidenceStatus}.`
              : "Recovery-proposal lifecycle evaluation is not configured."}
          </p>

          {hedgeRecoveryProposalLifecycle.assessments.length > 0 ? (
            <div className="mt-5 grid gap-3 xl:grid-cols-2">
              {hedgeRecoveryProposalLifecycle.assessments.map((assessment) => (
                <article key={assessment.id} className="rounded-lg border border-border-default bg-panel-light p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-text-primary">
                        {assessment.asset} / {assessment.quoteAsset}
                      </p>
                      <p className="mt-1 text-xs uppercase text-text-muted">
                        {assessment.venue} - {assessment.market}
                      </p>
                    </div>
                    <StatusBadge status={assessment.evidenceStatus} label={assessment.state} />
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                    <CoverageValue label="Side" value={assessment.side} />
                    <CoverageValue label="Proposal Age" value={assessment.proposalAgeMs} />
                    <CoverageValue label="Decision" value={assessment.operatorDecision?.decision ?? null} />
                    <CoverageValue label="Decision Age" value={assessment.operatorDecisionAgeMs} />
                  </div>
                  <p className="mt-4 break-all text-xs text-text-muted">
                    Proposal: {assessment.proposalId ?? "NO_DATA"} - lifecycle: {assessment.lifecycleRecord?.id ?? "NO_DATA"}
                  </p>
                  <p className="mt-2 text-xs text-text-muted">
                    Operator: {assessment.operatorDecision?.decidedBy ?? "NO_DATA"} - terminal: {assessment.terminal ? "YES" : "NO"} - source mutated: {assessment.sourceProposalMutated ? "YES" : "NO"}
                  </p>
                  <p className="mt-2 text-xs text-text-muted">
                    Incident: {assessment.recoveryIncidentCreated ? "YES" : "NO"} - action created: {assessment.recoveryActionCreated ? "YES" : "NO"} - canonical plan: {assessment.canonicalExecutionPlanCreated ? "YES" : "NO"} - execution: {assessment.executionAuthorized ? "YES" : "NO"}
                  </p>
                  <p className="mt-2 text-xs text-text-muted">
                    Blockers: {assessment.blockers.join(", ") || "none"} - remaining gates: {assessment.remainingGates.join(", ") || "none"}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <NoData text={`No recovery-proposal lifecycle evidence. Blockers: ${hedgeRecoveryProposalLifecycle.blockers.join(", ") || "RECOVERY_PROPOSAL_EVIDENCE_UNAVAILABLE"}.`} />
          )}
        </section>
      ) : null}

      {hedgeRecoveryActionHandoff ? (
        <section className="rounded-xl border border-border-default bg-panel p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Workflow className="size-5 text-brand" />
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
                  V22.18 Operator-approved SHADOW Recovery Handoff
                </p>
              </div>
              <h2 className="mt-2 text-xl font-bold text-text-primary">
                Bounded approved handoff without recovery-action or order authority
              </h2>
              <p className="mt-2 text-sm text-text-muted">
                Only exact V22.17 OPERATOR_APPROVED lifecycle evidence can produce this
                immutable handoff. Quantity, quote value and TTL remain bounded by the
                unchanged V22.16 proposal; no action, capital hold, plan or order is created.
              </p>
            </div>
            <StatusBadge
              status={hedgeRecoveryActionHandoff.evidenceStatus}
              label={hedgeRecoveryActionHandoff.recoveryActionHandoffConfigurationState}
            />
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <EvidenceMetric label="Lifecycle" value={hedgeRecoveryActionHandoff.summary.lifecycleAssessments} />
            <EvidenceMetric label="Operator Approved" value={hedgeRecoveryActionHandoff.summary.operatorApprovedAssessments} />
            <EvidenceMetric label="Handoffs Ready" value={hedgeRecoveryActionHandoff.summary.recoveryHandoffsReady} />
            <EvidenceMetric label="Awaiting Decision" value={hedgeRecoveryActionHandoff.summary.awaitingOperatorDecision} />
            <EvidenceMetric label="Not Approved" value={hedgeRecoveryActionHandoff.summary.notApprovedAssessments} />
            <EvidenceMetric label="Blocked" value={hedgeRecoveryActionHandoff.summary.blockedAssessments} />
            <EvidenceMetric label="Handoff Qty" value={hedgeRecoveryActionHandoff.summary.totalHandoffQuantity} />
            <EvidenceMetric label="Handoff Value" value={hedgeRecoveryActionHandoff.summary.totalHandoffQuoteValue} />
            <EvidenceMetric label="Recovery Actions" value={hedgeRecoveryActionHandoff.summary.recoveryActionsCreated} />
            <EvidenceMetric label="Capital Holds" value={hedgeRecoveryActionHandoff.summary.capitalReservationsCreated} />
            <EvidenceMetric label="Canonical Plans" value={hedgeRecoveryActionHandoff.summary.canonicalExecutionPlansCreated} />
            <EvidenceMetric label="Actionable" value={hedgeRecoveryActionHandoff.summary.actionableRecoveryActions} />
          </div>

          <p className="mt-4 text-xs text-text-muted">
            {hedgeRecoveryActionHandoff.recoveryActionHandoffConfigurationState === "READY"
              ? `Maximum lifecycle age: ${hedgeRecoveryActionHandoff.thresholds.maximumLifecycleAgeMs} ms - handoff TTL: ${hedgeRecoveryActionHandoff.thresholds.handoffTtlMs} ms - maximum handoff value: ${hedgeRecoveryActionHandoff.thresholds.maximumHandoffQuoteValue}.`
              : "Operator-approved SHADOW recovery-action handoff is not configured."}
          </p>

          {hedgeRecoveryActionHandoff.assessments.length > 0 ? (
            <div className="mt-5 grid gap-3 xl:grid-cols-2">
              {hedgeRecoveryActionHandoff.assessments.map((assessment) => (
                <article key={assessment.id} className="rounded-lg border border-border-default bg-panel-light p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-text-primary">
                        {assessment.asset} / {assessment.quoteAsset}
                      </p>
                      <p className="mt-1 text-xs uppercase text-text-muted">
                        {assessment.venue} - {assessment.market}
                      </p>
                    </div>
                    <StatusBadge status={assessment.evidenceStatus} label={assessment.state} />
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                    <CoverageValue label="Side" value={assessment.handoff?.leg.side ?? null} />
                    <CoverageValue label="Quantity" value={assessment.handoff?.leg.quantity ?? null} />
                    <CoverageValue label="Quote Value" value={assessment.handoff?.leg.estimatedQuoteValue ?? null} />
                    <CoverageValue label="Lifecycle Age" value={assessment.lifecycleAgeMs} />
                  </div>
                  <p className="mt-4 text-xs text-text-muted">
                    Operator: {assessment.handoff?.operator.decidedBy ?? "NO_DATA"} - type: {assessment.handoff?.recoveryActionType ?? "NO_DATA"} - expires: {assessment.handoff?.expiresAt ?? "NO_DATA"}
                  </p>
                  <p className="mt-2 break-all text-xs text-text-muted">
                    Handoff: {assessment.handoff?.id ?? "NO_DATA"} - proposal: {assessment.recoveryProposalId ?? "NO_DATA"}
                  </p>
                  <p className="mt-2 text-xs text-text-muted">
                    Action created: {assessment.recoveryActionCreated ? "YES" : "NO"} - capital: {assessment.capitalReservationCreated ? "YES" : "NO"} - canonical plan: {assessment.canonicalExecutionPlanCreated ? "YES" : "NO"} - execution: {assessment.executionAuthorized ? "YES" : "NO"}
                  </p>
                  <p className="mt-2 text-xs text-text-muted">
                    Blockers: {assessment.blockers.join(", ") || "none"} - remaining gates: {assessment.remainingGates.join(", ") || "none"}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <NoData text={`No SHADOW recovery-action handoffs. Blockers: ${hedgeRecoveryActionHandoff.blockers.join(", ") || "RECOVERY_PROPOSAL_LIFECYCLE_EVIDENCE_UNAVAILABLE"}.`} />
          )}
        </section>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-2">
        <EvidencePanel
          title="Attributed Shadow Evidence"
          icon={
            <Activity className="size-5 text-brand" />
          }
          status={
            analytics?.shadow
              .evidenceStatus ??
            "NOT_REPORTED"
          }
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <EvidenceMetric
              label="Completed"
              value={analytics?.shadow.completedOutcomes}
            />
            <EvidenceMetric
              label="Successful"
              value={analytics?.shadow.successfulOutcomes}
            />
            <EvidenceMetric
              label="Success Rate"
              value={analytics?.shadow.successRatePercent}
              suffix="%"
            />
            <EvidenceMetric
              label="Profit Retention"
              value={analytics?.shadow.averageProfitRetentionPercent}
              suffix="%"
            />
          </div>
        </EvidencePanel>

        <EvidencePanel
          title="Attributed PAPER Evidence"
          icon={
            <BarChart3 className="size-5 text-brand" />
          }
          status={
            analytics?.paper
              .evidenceStatus ??
            "NOT_REPORTED"
          }
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <EvidenceMetric
              label="Trades"
              value={analytics?.paper.totalTrades}
            />
            <EvidenceMetric
              label="Closed"
              value={analytics?.paper.closedTrades}
            />
            <EvidenceMetric
              label="Win Rate"
              value={analytics?.paper.winRatePercent}
              suffix="%"
            />
            <EvidenceMetric
              label="Net Profit"
              value={analytics?.paper.netProfit}
              suffix=" PAPER"
            />
          </div>
        </EvidencePanel>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <section className="rounded-xl border border-border-default bg-panel p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Database className="size-5 text-brand" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
                  Immutable Evidence
                </p>
                <h2 className="mt-1 text-xl font-bold text-text-primary">
                  Current Strategy Signals
                </h2>
              </div>
            </div>
            <StatusBadge
              status={strategy.signals.evidenceStatus}
            />
          </div>

          {strategy.signals.records.length > 0 ? (
            <div className="mt-4 space-y-2">
              {strategy.signals.records
                .slice(0, 10)
                .map(
                  (signal) => (
                    <article
                      key={signal.id}
                      className="grid gap-3 rounded-lg border border-border-default bg-panel-light p-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center"
                    >
                      <div>
                        <p className="font-semibold text-text-primary">
                          {signal.evidence.market}
                        </p>
                        <p className="mt-1 text-xs uppercase text-text-muted">
                          {signal.kind === "XEMM_SAFE_MAKER_PRICE"
                            ? `${signal.evidence.makerExchange} maker / ${signal.evidence.hedgeExchange} hedge`
                            : `${signal.evidence.buyExchange} → ${signal.evidence.sellExchange}`}
                        </p>
                      </div>
                      <div className="font-mono text-sm text-text-primary">
                        {signal.kind === "XEMM_SAFE_MAKER_PRICE"
                          ? `${signal.evidence.safeMakerPrice} · ${signal.evidence.modeledRetainedEdgePercent.toFixed(4)}%`
                          : `${signal.evidence.netProfitPercent.toFixed(4)}%`}
                      </div>
                      <StatusBadge
                        status="AVAILABLE"
                        label={signal.kind === "XEMM_SAFE_MAKER_PRICE"
                          ? `${signal.evidence.side} SHADOW`
                          : signal.evidence.decision}
                      />
                    </article>
                  ),
                )}
            </div>
          ) : (
            <NoData text="No current StrategySignal evidence. No opportunity, profit, or readiness is inferred." />
          )}
        </section>

        <section className="rounded-xl border border-border-default bg-panel p-5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-brand" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
                Safety Isolation
              </p>
              <h2 className="mt-1 text-xl font-bold text-text-primary">
                Strategy Permissions
              </h2>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <SafetyRow label="Read-only controller" passed={strategy.safety.readOnly} />
            <SafetyRow label="Signal execution disabled" passed={!strategy.safety.signalExecutionAllowed} />
            <SafetyRow label="Intent execution disabled" passed={!strategy.safety.intentExecutionAllowed} />
            <SafetyRow label="Automatic execution disabled" passed={!strategy.safety.automaticExecutionAllowed} />
            <SafetyRow label="Capital reservation disabled" passed={!strategy.safety.capitalReservationAllowed} />
            <SafetyRow label="Order submission disabled" passed={!strategy.safety.orderSubmissionAllowed} />
            <SafetyRow label="LIVE execution disabled" passed={!strategy.safety.liveExecutionAllowed} />
          </div>
        </section>
      </section>

      <section className="rounded-xl border border-border-default bg-panel p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
              Attribution Coverage
            </p>
            <h2 className="mt-1 text-xl font-bold text-text-primary">
              New evidence vs legacy history
            </h2>
          </div>
          <StatusBadge status={strategy.attribution.evidenceStatus} />
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <CoverageCard
            label="Shadow outcomes"
            coverage={strategy.attribution.shadowCoverage}
          />
          <CoverageCard
            label="PAPER trades"
            coverage={strategy.attribution.paperCoverage}
          />
        </div>

        <p className="mt-4 text-xs leading-5 text-text-muted">
          Legacy records are never inferred from market, exchange, or route. Strategy metrics only use explicit matching strategy identity.
        </p>
      </section>
    </section>
  );
}

function StrategyEvidenceLoading() {
  return (
    <section
      aria-live="polite"
      className="rounded-xl border border-border-default bg-panel p-5 text-sm text-text-muted"
    >
      Loading selected strategy evidence...
    </section>
  );
}

function StatusPanel({
  icon,
  title,
  detail,
  danger = false,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  danger?: boolean;
  action?: React.ReactNode;
}) {
  return (
    <section className={`rounded-xl border bg-panel p-6 ${
      danger
        ? "border-danger/30"
        : "border-border-default"
    }`}>
      <div className={`flex items-start gap-3 ${
        danger
          ? "text-danger"
          : "text-text-muted"
      }`}>
        {icon}
        <div>
          <h1 className="text-xl font-bold">
            {title}
          </h1>
          <p className="mt-2 text-sm text-text-muted">
            {detail}
          </p>
          {action}
        </div>
      </div>
    </section>
  );
}

function StatusBadge({
  status,
  label,
}: {
  status: StrategyEvidenceStatus;
  label?: string;
}) {
  const style =
    status === "AVAILABLE"
      ? "border-success/30 bg-success/10 text-success"
      : status === "NO_DATA"
        ? "border-warning/30 bg-warning/10 text-warning"
        : "border-border-default bg-panel-light text-text-muted";

  return (
    <span className={`rounded-full border px-2.5 py-1 font-mono text-[10px] font-bold ${style}`}>
      {label ?? status}
    </span>
  );
}

function Metric({
  label,
  value,
  status,
}: {
  label: string;
  value: string;
  status: StrategyEvidenceStatus;
}) {
  return (
    <div className="rounded-lg border border-border-default bg-panel-light p-4">
      <p className="text-xs uppercase tracking-[0.13em] text-text-muted">
        {label}
      </p>
      <p className="mt-2 break-words font-mono text-lg font-bold text-text-primary">
        {value}
      </p>
      <div className="mt-2">
        <StatusBadge status={status} />
      </div>
    </div>
  );
}

function EvidencePanel({
  title,
  icon,
  status,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  status: StrategyEvidenceStatus;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border-default bg-panel p-5">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-lg font-bold text-text-primary">
            {title}
          </h2>
        </div>
        <StatusBadge status={status} />
      </div>
      <div className="mt-4">
        {children}
      </div>
    </section>
  );
}

function EvidenceMetric({
  label,
  value,
  suffix = "",
}: {
  label: string;
  value: number | null | undefined;
  suffix?: string;
}) {
  return (
    <div className="rounded-lg border border-border-default bg-panel-light p-3">
      <p className="text-[10px] uppercase tracking-[0.12em] text-text-muted">
        {label}
      </p>
      <p className="mt-2 break-words font-mono text-sm font-bold text-text-primary">
        {value === null || value === undefined
          ? "NO_DATA"
          : `${value.toLocaleString("en-IN", {
              maximumFractionDigits: 4,
            })}${suffix}`}
      </p>
    </div>
  );
}

function SafetyRow({
  label,
  passed,
}: {
  label: string;
  passed: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-border-default bg-panel-light px-3 py-2">
      <span className="text-xs text-text-muted">
        {label}
      </span>
      {passed ? (
        <CheckCircle2 className="size-4 shrink-0 text-success" />
      ) : (
        <AlertTriangle className="size-4 shrink-0 text-danger" />
      )}
    </div>
  );
}

function CoverageCard({
  label,
  coverage,
}: {
  label: string;
  coverage: StrategyAttributionCoverage | null;
}) {
  if (!coverage) {
    return (
      <NoData text={`${label}: NOT_REPORTED`} />
    );
  }

  return (
    <article className="rounded-lg border border-border-default bg-panel-light p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold text-text-primary">
          {label}
        </p>
        <StatusBadge status={coverage.evidenceStatus} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <CoverageValue label="Attributed" value={coverage.attributedToStrategy} />
        <CoverageValue label="Legacy" value={coverage.unattributedLegacy} />
        <CoverageValue label="Total" value={coverage.totalRecords} />
        <CoverageValue
          label="Coverage"
          value={coverage.attributionCoveragePercent}
          suffix="%"
        />
      </div>
    </article>
  );
}

function CoverageValue({
  label,
  value,
  suffix = "",
}: {
  label: string;
  value: number | string | null;
  suffix?: string;
}) {
  return (
    <div>
      <p className="text-text-muted">
        {label}
      </p>
      <p className="mt-1 font-mono font-bold text-text-primary">
        {value === null
          ? "NO_DATA"
          : `${typeof value === "number" ? value.toLocaleString() : value}${suffix}`}
      </p>
    </div>
  );
}

function NoData({
  text,
}: {
  text: string;
}) {
  return (
    <div className="mt-4 rounded-lg border border-warning/20 bg-warning/10 p-4 text-sm text-text-muted">
      {text}
    </div>
  );
}
