import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";

import {
  useDynamicMarketMakingPaperClosure,
} from "../hooks/useStrategies";

import type {
  DynamicMarketMakingPaperClosureState,
} from "../types/DynamicMarketMakingPaperClosure";

export function DynamicMarketMakingPaperClosurePanel() {
  const query = useDynamicMarketMakingPaperClosure();
  const report = query.data?.data;

  if (query.isPending && !report) {
    return <PanelState title="Loading Strategy #7 closure evidence"
      detail="Reading post-only capability, authenticated inventory, public trade fills and modeled capture." />;
  }

  if (query.isError || !report) {
    return <PanelState danger title="Strategy #7 closure evidence unavailable"
      detail="No fill quality, inventory neutrality, modeled capture or PAPER eligibility is inferred while evidence is unavailable." />;
  }

  const route = report.routes.mostAdvancedRoute;
  const book = route?.diagnostics.book;
  const capability = route?.diagnostics.capability;
  const inventory = route?.diagnostics.inventory;
  const fill = route?.diagnostics.fillQuality;
  const economics = route?.diagnostics.economics;

  return (
    <section className="overflow-hidden rounded-xl border border-border-default bg-panel">
      <div className="border-b border-border-default p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-brand">
              <Activity className="size-5" />
              <p className="text-xs font-semibold uppercase tracking-[0.16em]">
                V72 Strategy #7 PAPER Closure
              </p>
            </div>
            <h2 className="mt-2 text-xl font-bold text-text-primary">
              Empirical passive-fill quality and inventory-neutral economics
            </h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-text-muted">{report.message}</p>
          </div>
          <div className="flex items-center gap-2">
            <StateBadge state={report.state} />
            <button type="button" aria-label="Refresh Strategy #7 PAPER closure"
              disabled={query.isFetching} onClick={() => void query.refetch()}
              className="rounded-md border border-border-default bg-panel-light p-2 text-text-muted hover:text-text-primary disabled:opacity-60">
              <RefreshCw className={`size-4 ${query.isFetching ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          <Metric label="Books" value={report.funnel.bookReadyMarkets} total={report.funnel.evaluatedMarkets} />
          <Metric label="Capability" value={report.funnel.capabilityReadyMarkets} total={report.funnel.evaluatedMarkets} />
          <Metric label="Inventory" value={report.funnel.inventoryReadyMarkets} total={report.funnel.evaluatedMarkets} />
          <Metric label="Trade tape" value={report.funnel.publicTradeReadyMarkets} total={report.funnel.evaluatedMarkets} />
          <Metric label="Fill qualified" value={report.funnel.fillProbabilityReadyMarkets} total={report.funnel.evaluatedMarkets} />
          <Metric label="Economics" value={report.funnel.economicallyEvaluableMarkets} total={report.funnel.evaluatedMarkets} />
          <Metric label="Signals" value={report.funnel.qualifiedMarkets} total={report.funnel.evaluatedMarkets} />
        </div>
      </div>

      <div className="grid gap-4 p-5 xl:grid-cols-2">
        <section className="rounded-lg border border-border-default bg-panel-light p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.13em] text-text-muted">Most advanced current route</p>
            {route ? <span className="font-mono text-xs font-bold text-text-primary">
              {route.exchange.toUpperCase()} / {route.market}
            </span> : null}
          </div>
          {route ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Fact label="Book spread" value={book ? formatPercent(book.bookSpreadPercent) : "NO_DATA"} />
              <Fact label="Volatility samples"
                value={book ? `${book.volatilitySampleCount}/${book.minimumVolatilitySamples}` : "NO_DATA"} />
              <Fact label="Post-only capability"
                value={capability ? (capability.postOnlySupported ? "SUPPORTED" : "UNSUPPORTED") : "NO_DATA"}
                danger={capability?.postOnlySupported === false} />
              <Fact label="Maker fee"
                value={capability ? formatPercent(capability.makerFeePercent) : "NO_DATA"} />
              <Fact label="Inventory base share"
                value={inventory?.baseSharePercent === null || inventory?.baseSharePercent === undefined
                  ? "NO_DATA" : formatPercent(inventory.baseSharePercent)} />
              <Fact label="Inventory target / skew"
                value={inventory?.skewPercent === null || inventory?.skewPercent === undefined
                  ? `${formatPercent(report.thresholds.inventoryTargetBasePercent)} / NO_DATA`
                  : `${formatPercent(inventory.targetBasePercent)} / ${formatSignedPercent(inventory.skewPercent)}`} />
              <Fact label="Public trades"
                value={fill ? `${fill.sampleCount}/${fill.minimumSamples}` : "NO_DATA"} />
              <Fact label="Bid / ask fill"
                value={fill?.bidFillProbabilityPercent === null || fill?.bidFillProbabilityPercent === undefined ||
                  fill.askFillProbabilityPercent === null
                  ? "NO_DATA"
                  : `${formatPercent(fill.bidFillProbabilityPercent)} / ${formatPercent(fill.askFillProbabilityPercent)}`} />
            </div>
          ) : <p className="mt-4 text-sm text-text-muted">No configured market book is currently evaluable.</p>}

          {economics ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-4">
              <Cost label="Gross capture" value={economics.modeledGrossCapturePercent} positive />
              <Cost label="Maker fees" value={economics.makerRoundTripFeePercent} />
              <Cost label="Safety buffer" value={economics.safetyBufferPercent} />
              <Cost label="Modeled net" value={economics.modeledNetCapturePercent} positive />
            </div>
          ) : (
            <p className="mt-3 rounded-md border border-warning/20 bg-warning/5 p-3 text-xs text-warning">
              Modeled quote economics remain NO_DATA until every earlier evidence gate passes.
            </p>
          )}
        </section>

        <section className="rounded-lg border border-border-default bg-panel-light p-4 xl:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-[0.13em] text-text-muted">Per-market gate attribution</p>
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {report.routes.marketReadiness.map((market) => (
              <article key={market.routeId} className="rounded-md border border-border-default bg-panel p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-mono text-xs font-bold text-text-primary">{market.market}</p>
                    <p className="mt-1 text-[10px] uppercase tracking-[0.1em] text-text-muted">
                      {market.exchange}
                    </p>
                  </div>
                  <span className={`rounded-full border px-2 py-1 font-mono text-[9px] font-bold ${
                    market.status === "QUALIFIED"
                      ? "border-success/30 bg-success/10 text-success"
                      : "border-warning/30 bg-warning/10 text-warning"
                  }`}>{market.status}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {market.blockers.length > 0 ? market.blockers.map((blocker) => (
                    <span key={blocker} className="rounded border border-warning/20 bg-warning/5 px-1.5 py-1 font-mono text-[8px] text-warning">
                      {blocker}
                    </span>
                  )) : <span className="text-[10px] text-success">All signal gates passed</span>}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-border-default bg-panel-light p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.13em] text-text-muted">
            Authenticated spot inventory evidence
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Metric label="Balances" value={report.inventoryEvidence.synchronizedBalances} />
            <Metric label="Fresh" value={report.inventoryEvidence.freshBalances} />
            <Metric label="Exchanges" value={report.inventoryEvidence.exchangesWithBalances} />
          </div>
          {report.inventoryEvidence.balances.length > 0 ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {report.inventoryEvidence.balances.slice(0, 8).map((balance) => (
                <Fact key={`${balance.exchange}:${balance.asset}`}
                  label={`${balance.exchange.toUpperCase()} ${balance.asset}`}
                  value={`${formatNumber(balance.availableBalance)} available`}
                  danger={!balance.fresh} />
              ))}
            </div>
          ) : (
            <p className="mt-3 rounded-md border border-danger/20 bg-danger/5 p-3 text-xs text-danger">
              No synchronized authenticated balance snapshot is currently available for configured venues.
            </p>
          )}
        </section>

        <section className="rounded-lg border border-border-default bg-panel-light p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.13em] text-text-muted">Dominant blockers</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {report.routes.dominantBlockers.length > 0 ? report.routes.dominantBlockers.map((blocker) => (
              <span key={blocker.code} className="rounded-md border border-warning/20 bg-warning/5 px-3 py-2 font-mono text-[10px] text-warning">
                {blocker.code} / {blocker.count}
              </span>
            )) : <span className="text-xs text-text-muted">No current blocker evidence.</span>}
          </div>
        </section>

        <section className="rounded-lg border border-border-default bg-panel-light p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.13em] text-text-muted">Central lineage</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Fact label="Signals now / observed"
              value={`${report.controller.currentSignals} / ${report.controller.totalSignalsObserved}`} />
            <Fact label="Plans admitted" value={report.lineage.plansAdmitted} />
            <Fact label="Latest intake" value={report.lineage.latestPlanIntakeState ?? "NO_DATA"} />
            <Fact label="Active / completed queue"
              value={`${report.lineage.activeQueue} / ${report.lineage.completedQueue}`} />
          </div>
        </section>

        <div className="xl:col-span-2 flex flex-wrap gap-2 border-t border-border-default pt-4 text-[10px] font-semibold uppercase tracking-[0.1em] text-text-muted">
          <Safety label="Authenticated inventory only" passed={report.safety.authenticatedInventoryOnly} />
          <Safety label="Post-only required" passed={report.safety.postOnlyRequired} />
          <Safety label="Queue position unknown" passed={!report.safety.queuePositionKnown} />
          <Safety label="Fill not inferred" passed={!report.safety.fillProbabilityInferred} />
          <Safety label="Capture not guaranteed" passed={!report.safety.modeledCaptureGuaranteed} />
          <Safety label="Thresholds unchanged" passed={!report.safety.profitabilityThresholdMutated} />
          <Safety label="LIVE / orders off" passed={!report.safety.liveExecutionAllowed && !report.safety.orderSubmissionAllowed} />
        </div>
      </div>
    </section>
  );
}

function Metric({label, value, total}: {label: string; value: number; total?: number}) {
  const good = total === undefined ? value > 0 : value === total && total > 0;
  return <div className="rounded-lg border border-border-default bg-panel-light p-3"><p className="text-[10px] uppercase tracking-[0.12em] text-text-muted">{label}</p><p className={`mt-2 font-mono text-lg font-bold ${good ? "text-success" : "text-warning"}`}>{value}{total === undefined ? "" : `/${total}`}</p></div>;
}

function Fact({label, value, danger = false}: {label: string; value: number | string; danger?: boolean}) {
  return <div className={`rounded-md border bg-panel px-3 py-2 ${danger ? "border-danger/30" : "border-border-default"}`}><p className="text-[10px] uppercase tracking-[0.1em] text-text-muted">{label}</p><p className={`mt-1 break-words font-mono text-xs font-bold ${danger ? "text-danger" : "text-text-primary"}`}>{value}</p></div>;
}

function Cost({label, value, positive = false}: {label: string; value: number; positive?: boolean}) {
  return <div className="rounded-md border border-warning/20 bg-warning/5 px-2 py-2"><p className="text-[9px] uppercase tracking-[0.08em] text-text-muted">{label}</p><p className={`mt-1 font-mono text-[10px] font-bold ${positive ? "text-success" : "text-warning"}`}>{positive ? "" : "-"}{formatPercent(value)}</p></div>;
}

function Safety({label, passed}: {label: string; passed: boolean}) {
  return <span className="inline-flex items-center gap-1 rounded-full border border-border-default bg-panel-light px-2 py-1">{passed ? <CheckCircle2 className="size-3 text-success" /> : <AlertTriangle className="size-3 text-danger" />}{label}</span>;
}

function StateBadge({state}: {state: DynamicMarketMakingPaperClosureState}) {
  const positive = state === "PAPER_QUEUED" || state === "SIGNAL_ADMITTED" || state === "SIGNAL_AVAILABLE";
  const danger = state === "NO_DATA" || state === "PAPER_BLOCKED" || state === "CAPABILITY_EVIDENCE_BLOCKED" || state === "INVENTORY_EVIDENCE_BLOCKED";
  return <span className={`rounded-full border px-3 py-1 font-mono text-[10px] font-bold ${positive ? "border-success/30 bg-success/10 text-success" : danger ? "border-danger/30 bg-danger/10 text-danger" : "border-warning/30 bg-warning/10 text-warning"}`}>{state.replaceAll("_", " ")}</span>;
}

function PanelState({title, detail, danger = false}: {title: string; detail: string; danger?: boolean}) {
  return <section className={`rounded-xl border p-5 ${danger ? "border-danger/30 bg-danger/5" : "border-border-default bg-panel"}`}><div className="flex items-start gap-3">{danger ? <AlertTriangle className="mt-0.5 size-5 text-danger" /> : <RefreshCw className="mt-0.5 size-5 animate-spin text-brand" />}<div><h2 className="font-bold text-text-primary">{title}</h2><p className="mt-1 text-sm text-text-muted">{detail}</p></div></div></section>;
}

function formatPercent(value: number): string {
  return `${value.toFixed(4)}%`;
}

function formatSignedPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(4)}%`;
}

function formatNumber(value: number): string {
  return value.toLocaleString("en-IN", {maximumFractionDigits: 6});
}
