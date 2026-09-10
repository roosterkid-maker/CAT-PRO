import type { ReactNode } from "react";

import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Database,
  ExternalLink,
  Gauge,
  Landmark,
  RefreshCw,
  Route,
  ShieldCheck,
  WalletCards,
  XCircle,
} from "lucide-react";

import { useLiveOnlyIntelligence } from "../hooks/useTradeFlow";

import type {
  ExchangeFoundationCapability,
  LiveOnlyIntelligenceLegPlan,
  LiveOnlyIntelligenceOpportunity,
  LiveOnlyIntelligencePolicyCheck,
  LiveOnlyRecentAttempt,
} from "../types/TradeFlow";

export default function TradeFlowDashboard() {
  const {
    data: response,
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useLiveOnlyIntelligence();
  const report = response?.data;

  if (isLoading && !report) {
    return (
      <PageState
        title="Building current LIVE execution report"
        detail="Reading current opportunities, books, balances and safety gates. No order is submitted by this report."
        spinning
      />
    );
  }

  if (isError || !report) {
    return (
      <PageState
        title="LIVE execution intelligence unavailable"
        detail="The read model failed closed. No balance, threshold or execution readiness was inferred from missing evidence."
        onRetry={() => void refetch()}
      />
    );
  }

  const runtimeTone = report.runtime.halted
    ? "danger"
    : report.runtime.runtimeEnabled && report.runtime.running
      ? "success"
      : "warning";
  const readyCount = report.opportunities.filter(
    (opportunity) => opportunity.status === "READY_FOR_FINAL_EXECUTION",
  ).length;
  const blockedCount = report.opportunities.filter(
    (opportunity) => opportunity.status === "BLOCKED",
  ).length;

  return (
    <section className="space-y-5 pb-10">
      <header className="relative overflow-hidden rounded-2xl border border-cyan-400/30 bg-[linear-gradient(140deg,rgba(5,21,25,.98),rgba(7,16,31,.98)_58%,rgba(30,9,36,.92))] p-5 shadow-[0_18px_55px_rgba(0,0,0,.35)] sm:p-6">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-emerald-300 via-cyan-300 to-fuchsia-400" />
        <div className="relative flex flex-col justify-between gap-5 xl:flex-row xl:items-start">
          <div className="max-w-4xl">
            <div className="flex items-center gap-2 text-emerald-300">
              <ShieldCheck className="size-4" />
              <p className="text-[10px] font-black uppercase tracking-[0.22em]">
                Read-only · current LIVE evidence · auto refresh 3s
              </p>
            </div>
            <h1 className="mt-3 text-2xl font-black tracking-tight text-white sm:text-3xl">
              LIVE Execution Intelligence
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">
              Har opportunity ke liye exact BUY/SELL venue, coin quantity, required balance,
              available balance, shortage, thresholds aur execution blocker ek jagah. Yeh page
              sirf current evidence padhta hai—authority, transfer, withdrawal ya order submit nahi karta.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <StatusPill
              label={report.runtime.halted
                ? "RUNNER HALTED"
                : report.runtime.inFlight
                  ? "ORDER LIFECYCLE ACTIVE"
                  : report.runtime.running
                    ? "RUNNER WATCHING"
                    : "RUNNER STOPPED"}
              tone={runtimeTone}
            />
            <StatusPill label="REPORT · NO ORDER" tone="neutral" />
            <button
              type="button"
              disabled={isFetching}
              onClick={() => void refetch()}
              className="inline-flex items-center gap-2 rounded-lg border border-cyan-400/35 bg-cyan-400/10 px-3 py-2 text-xs font-bold text-cyan-200 transition hover:border-cyan-300/70 disabled:opacity-60"
            >
              <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>

        {report.runtime.haltedReason ? (
          <div className="relative mt-5 flex gap-3 border border-danger/35 bg-danger/10 p-3 text-xs leading-5 text-danger">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p><strong>Runner halted:</strong> {report.runtime.haltedReason}</p>
          </div>
        ) : null}
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
        <Metric icon={<Route />} label="Current opportunities" value={formatCount(report.sourceOpportunityCount)} detail={`${report.displayedOpportunityCount} fully inspected`} />
        <Metric icon={<CheckCircle2 />} label="Preflight ready" value={formatCount(readyCount)} detail="final last-look still required" tone="success" />
        <Metric icon={<XCircle />} label="Preflight blocked" value={formatCount(blockedCount)} detail="no order sent" tone={blockedCount ? "danger" : "neutral"} />
        <Metric icon={<Database />} label="Snapshots observed" value={formatCount(report.runtime.snapshotsObserved)} detail={`${report.runtime.candidatesObserved} candidates`} />
        <Metric icon={<Gauge />} label="Attempts / complete" value={`${report.runtime.attempts} / ${report.runtime.completed}`} detail={`${report.runtime.preflightBlocks} preflight blocks`} />
        <Metric icon={<CircleDollarSign />} label="Capital / leg" value={formatInr(report.policy.preferredCapitalPerLegInr)} detail={`${formatInr(report.policy.minimumCapitalPerLegInr)}–${formatInr(report.policy.maximumCapitalPerLegInr)}`} tone="success" />
      </section>

      <Panel>
        <SectionTitle
          icon={<Gauge />}
          eyebrow="Policy map"
          title="Bot ke automatic LIVE thresholds"
          detail="Yeh global policy reference hai. Neeche har opportunity par isi policy ka current PASS/BLOCKED result alag dikhega."
        />
        <div className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {report.policyReference.map((check) => (
            <PolicyCheck key={check.key} check={check} compact />
          ))}
        </div>
      </Panel>

      <Panel>
        <SectionTitle
          icon={<Landmark />}
          eyebrow="Current-route capital readiness"
          title="No persistence waiting"
          detail="Har current exact market + BUY exchange + SELL exchange ko present-time funding, recovery and execution gates par evaluate kiya jata hai."
        />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Fact label="Study service" value={report.capitalStudy.running ? "RUNNING" : "STOPPED"} good={report.capitalStudy.running} />
          <Fact label="Tracked routes" value={formatCount(report.capitalStudy.trackedRoutes)} good={report.capitalStudy.trackedRoutes > 0} />
          <Fact label="Route evidence ready now" value={formatCount(report.capitalStudy.executionStudyReadyRoutes)} good={report.capitalStudy.executionStudyReadyRoutes > 0} />
          <Fact label="Funding study complete now" value={formatCount(report.capitalStudy.capitalStudyReadyRoutes)} good={report.capitalStudy.capitalStudyReadyRoutes > 0} />
        </div>
        <p className="mt-3 text-[10px] leading-5 text-text-muted">
          Current-net gate: {report.policy.minimumCurrentNetProfitPercent.toFixed(2)}%.
          Post-stress floor {report.capitalStudy.policy.postStressNetHardFloorPercent.toFixed(2)}%, fresh books, depth, balances, recovery and ₹1,000 cap remain mandatory.
        </p>
      </Panel>

      <section className="space-y-4">
        <SectionTitle
          icon={<Route />}
          eyebrow="Current route inspection"
          title="Kaunsa coin, kahan BUY/SELL, aur kyun execute/blocked"
          detail="Opportunities current net profit ke order mein hain. READY ka matlab bhi final authority aur last-look se pehle order guarantee nahi hai."
        />

        {report.opportunities.length === 0 ? (
          <div className="rounded-xl border border-warning/30 bg-warning/10 p-6 text-center">
            <Clock3 className="mx-auto size-6 text-warning" />
            <h3 className="mt-3 font-black text-white">Abhi current accepted opportunity nahi hai</h3>
            <p className="mx-auto mt-2 max-w-2xl text-xs leading-5 text-text-muted">
              Scanner chal raha ho sakta hai, lekin is exact snapshot mein fee-positive aur engine-accepted route nahi mila.
              Report har 3 seconds mein fresh opportunity list dobara padhega.
            </p>
          </div>
        ) : (
          report.opportunities.map((opportunity, index) => (
            <OpportunityCard
              key={opportunity.opportunityId}
              opportunity={opportunity}
              rank={index + 1}
              minimumCurrentNetProfitPercent={report.policy.minimumCurrentNetProfitPercent}
              minimumPostStressNetProfitPercent={report.policy.minimumPostStressNetProfitPercent}
              maximumStatutoryCashWithholdingPercentPerAttempt={report.policy.maximumStatutoryCashWithholdingPercentPerAttempt}
            />
          ))
        )}
      </section>

      <section className="grid gap-5 2xl:grid-cols-2">
        <Panel>
          <SectionTitle
            icon={<WalletCards />}
            eyebrow="Capital manager"
            title="Fund movement readiness"
            detail="Opportunity shortfall samjha sakta hai; actual transfer alag bounded service aur whitelist se hi hoga."
          />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Fact label="Manager" value={report.capitalManager.enabled ? "ENABLED" : "DISABLED"} good={report.capitalManager.enabled} />
            <Fact label="Cross-exchange" value={report.capitalManager.crossExchangeEnabled ? "ENABLED" : "DISABLED"} good={report.capitalManager.crossExchangeEnabled} />
            <Fact label="Dedicated Binance key" value={report.capitalManager.dedicatedBinanceCredentialsConfigured ? "CONFIGURED" : "MISSING"} good={report.capitalManager.dedicatedBinanceCredentialsConfigured} />
            <Fact label="Withdrawal whitelist" value={`${report.capitalManager.withdrawalWhitelistEntries} entries`} good={report.capitalManager.withdrawalWhitelistEntries > 0} />
            <Fact label="Execution studies" value={`${report.capitalStudy.executionStudyReadyRoutes} ready`} good={report.capitalStudy.executionStudyReadyRoutes > 0} />
            <Fact label="Capital studies" value={`${report.capitalStudy.capitalStudyReadyRoutes} ready`} good={report.capitalStudy.capitalStudyReadyRoutes > 0} />
          </div>
          {report.capitalManager.enabled &&
          (!report.capitalManager.dedicatedBinanceCredentialsConfigured || report.capitalManager.withdrawalWhitelistEntries === 0) ? (
            <p className="mt-4 border border-warning/30 bg-warning/10 p-3 text-xs leading-5 text-warning">
              Capital Manager configured hai, lekin autonomous cross-exchange movement abhi fail-closed hai:
              dedicated rebalancer credentials aur approved withdrawal whitelist dono chahiye.
            </p>
          ) : null}
        </Panel>

        <Panel>
          <SectionTitle
            icon={<Clock3 />}
            eyebrow="Durable runner history"
            title="Recent execution decisions"
            detail="Order I/O hua ya nahi, exposure/recovery status aur exact first reason yahan dikhta hai."
          />
          <div className="mt-4 space-y-2">
            {report.recentAttempts.length ? report.recentAttempts.map((attempt) => (
              <AttemptRow key={`${attempt.opportunityId}-${attempt.startedAt}`} attempt={attempt} />
            )) : (
              <p className="border border-border-default bg-black/20 p-4 text-xs text-text-muted">
                Is durable LIVE-only runner mein abhi koi recorded attempt nahi hai.
              </p>
            )}
          </div>
        </Panel>
      </section>

      <Panel>
        <SectionTitle
          icon={<Database />}
          eyebrow="Exchange expansion"
          title="Giottus, Mudrex aur Bitbns integration foundation"
          detail="Cards visible hain, lekin API keys aur independently proven adapters ke bina in exchanges ko market-data count ya LIVE route pool mein include nahi kiya gaya."
        />
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {report.exchangeFoundations.map((exchange) => (
            <FoundationCard key={exchange.exchange} exchange={exchange} />
          ))}
        </div>
      </Panel>

      <footer className="border border-emerald-400/20 bg-emerald-400/5 px-4 py-3 text-[10px] leading-5 text-text-muted">
        Generated {formatTime(report.generatedAt)} · Source opportunities {report.sourceOpportunityCount}
        {report.truncated ? " · top 20 shown" : ""} · Report safety: no external request, balance mutation,
        transfer, withdrawal or order submission.
      </footer>
    </section>
  );
}

function OpportunityCard({
  opportunity,
  rank,
  minimumCurrentNetProfitPercent,
  minimumPostStressNetProfitPercent,
  maximumStatutoryCashWithholdingPercentPerAttempt,
}: {
  opportunity: LiveOnlyIntelligenceOpportunity;
  rank: number;
  minimumCurrentNetProfitPercent: number;
  minimumPostStressNetProfitPercent: number;
  maximumStatutoryCashWithholdingPercentPerAttempt: number;
}) {
  const tone = opportunity.status === "READY_FOR_FINAL_EXECUTION"
    ? "success"
    : opportunity.status === "BLOCKED"
      ? "danger"
      : "warning";
  const passes = opportunity.policyChecks.filter((check) => check.state === "PASS").length;
  const blocked = opportunity.policyChecks.filter((check) => check.state === "BLOCKED").length;

  return (
    <article className="overflow-hidden rounded-xl border border-border-default bg-[linear-gradient(145deg,rgba(8,24,27,.98),rgba(7,15,29,.98))] shadow-[0_14px_38px_rgba(0,0,0,.25)]">
      <div className="flex flex-col justify-between gap-4 border-b border-border-default p-4 lg:flex-row lg:items-center">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-cyan-400/25 bg-cyan-400/10 text-xs font-black text-cyan-300">#{rank}</span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-black text-white">{opportunity.market}</h3>
              <StatusPill label={statusLabel(opportunity.status)} tone={tone} />
              <StatusPill label={`ENGINE ${opportunity.engineDecision}`} tone={opportunity.engineDecision === "EXECUTE" ? "success" : "warning"} />
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs font-bold">
              <span className="text-emerald-300">{formatExchange(opportunity.buy.exchange)} BUY</span>
              <ArrowRight className="size-3 text-text-muted" />
              <span className="text-fuchsia-300">{formatExchange(opportunity.sell.exchange)} SELL</span>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-4 text-right text-xs">
          <Value label="Current net" value={`${formatNumber(opportunity.netProfitPercent, 3)}%`} good={opportunity.netProfitPercent >= minimumCurrentNetProfitPercent} />
          <Value label="Post-stress net" value={opportunity.postStressNetProfitPercent === null ? "Unavailable" : `${formatNumber(opportunity.postStressNetProfitPercent, 3)}%`} good={(opportunity.postStressNetProfitPercent ?? -1) >= minimumPostStressNetProfitPercent} />
          <Value label="TDS cash lock" value={opportunity.statutoryCashWithholdingPercent === null ? "Unavailable" : `${formatNumber(opportunity.statutoryCashWithholdingPercent, 3)}%`} good={(opportunity.statutoryCashWithholdingPercent ?? Number.POSITIVE_INFINITY) <= maximumStatutoryCashWithholdingPercentPerAttempt} />
          <Value label="Quality" value={`${opportunity.qualityScore}`} good={opportunity.qualityScore >= 80} />
        </div>
      </div>

      <div className="grid gap-4 p-4 xl:grid-cols-2">
        <LegCard leg={opportunity.buy} />
        <LegCard leg={opportunity.sell} />
      </div>

      {opportunity.capitalStudy ? (
        <div className="border-t border-border-default bg-cyan-400/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-300">Current-route capital readiness</p>
              <p className="mt-1 text-xs text-text-muted">{opportunity.capitalStudy.recommendationDetail}</p>
            </div>
            <StatusPill
              label={opportunity.capitalStudy.status.replaceAll("_", " ")}
              tone={opportunity.capitalStudy.executionQualified ? "success" : "warning"}
            />
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Fact label="Current execution gate" value={opportunity.capitalStudy.executionQualified ? "PASS" : "BLOCKED"} good={opportunity.capitalStudy.executionQualified} />
            <Fact label="Current net gate" value={`${opportunity.capitalStudy.effectiveMinimumCurrentNetProfitPercent.toFixed(2)}%`} good={opportunity.netProfitPercent >= opportunity.capitalStudy.effectiveMinimumCurrentNetProfitPercent} />
            <Fact label="Fund action" value={opportunity.capitalStudy.recommendation.replaceAll("_", " ")} good={opportunity.capitalStudy.recommendation === "FUNDED"} />
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 border-y border-border-default bg-black/15 p-4 sm:grid-cols-2 xl:grid-cols-4">
        <Fact label="Execution quantity" value={formatNullable(opportunity.executionQuantity)} good={opportunity.executionQuantity !== null} />
        <Fact label="Preferred capital / leg" value={formatInr(opportunity.requestedCapitalPerLegInr)} good />
        <Fact label="Estimated executable" value={formatNullableInr(opportunity.estimatedExecutableCapitalInr)} good={opportunity.estimatedExecutableCapitalInr !== null} />
        <Fact label="Estimated BUY need" value={formatNullableInr(opportunity.estimatedBuyRequirementInr)} good={opportunity.estimatedBuyRequirementInr !== null} />
        <Fact label="BUY taker fee" value={opportunity.buyTakerFeePercent === null ? "Unavailable" : `${formatNumber(opportunity.buyTakerFeePercent, 4)}%`} good={opportunity.buyTakerFeePercent !== null} />
        <Fact label="SELL taker fee" value={opportunity.sellTakerFeePercent === null ? "Unavailable" : `${formatNumber(opportunity.sellTakerFeePercent, 4)}%`} good={opportunity.sellTakerFeePercent !== null} />
        <Fact label="Trading fees" value={opportunity.tradingFees === null ? "Unavailable" : formatNumber(opportunity.tradingFees, 8)} good={opportunity.tradingFees !== null} />
        <Fact label="TDS cash withheld" value={opportunity.statutoryCashWithholding === null ? "Unavailable" : formatNumber(opportunity.statutoryCashWithholding, 8)} good={opportunity.statutoryCashWithholding !== null} />
        <Fact label="Gate score" value={`${passes} pass · ${blocked} blocked`} good={blocked === 0} />
      </div>

      <div className="grid gap-5 p-4 2xl:grid-cols-[.8fr_1.2fr]">
        <div className="space-y-4">
          <ReasonList
            title="Execution rokne ke exact reasons"
            items={opportunity.blockers}
            empty="Preflight blocker nahi mila; final last-look aur one-time authority abhi bhi mandatory hai."
            tone={opportunity.blockers.length ? "danger" : "success"}
          />
          <ReasonList
            title="Execute hone ke liye kya chahiye"
            items={opportunity.whatWouldMakeExecutable}
            empty="No additional remediation reported."
            tone="warning"
          />
        </div>
        <div>
          <h4 className="text-xs font-black uppercase tracking-[0.16em] text-cyan-300">All policy and safety gates</h4>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {opportunity.policyChecks.map((check) => (
              <PolicyCheck key={check.key} check={check} />
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}

function LegCard({ leg }: { leg: LiveOnlyIntelligenceLegPlan }) {
  const buy = leg.side === "BUY";
  return (
    <div className={`rounded-xl border p-4 ${buy ? "border-emerald-400/25 bg-emerald-400/5" : "border-fuchsia-400/25 bg-fuchsia-400/5"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`text-[10px] font-black uppercase tracking-[0.18em] ${buy ? "text-emerald-300" : "text-fuchsia-300"}`}>{leg.side} LEG</p>
          <h4 className="mt-1 text-lg font-black text-white">{formatExchange(leg.exchange)}</h4>
          <p className="mt-1 text-xs text-text-muted">
            {buy ? `${leg.asset} se coin kharidna hai` : `${leg.asset} coin bechna hai`}
          </p>
        </div>
        <StatusPill label={leg.balanceSufficient ? "BALANCE PASS" : "BALANCE BLOCKED"} tone={leg.balanceSufficient ? "success" : "danger"} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Value label="Price" value={formatNumber(leg.price, 8)} />
        <Value label="Qty" value={formatNullable(leg.quantity)} />
        <Value label="Required" value={`${formatNullable(leg.requiredBalance)} ${leg.asset}`} />
        <Value label="Available" value={`${formatNullable(leg.availableBalance)} ${leg.asset}`} good={leg.balanceSufficient} />
      </div>
      {!leg.balanceSufficient ? (
        <div className="mt-3 border border-danger/25 bg-danger/10 p-3 text-xs leading-5 text-danger">
          <strong>Shortfall:</strong> {leg.shortfall === null ? `fresh ${leg.asset} balance unavailable` : `${formatNumber(leg.shortfall, 8)} ${leg.asset}`}. {leg.explanation}
        </div>
      ) : (
        <p className="mt-3 text-[11px] leading-5 text-emerald-300">{leg.explanation}</p>
      )}
      <p className="mt-2 text-[9px] text-text-muted">
        Balance evidence age: {leg.balanceSnapshotAgeMs === null ? "unknown" : `${leg.balanceSnapshotAgeMs} ms`}
        {leg.maximumBalanceSnapshotAgeMs === null ? "" : ` · maximum ${leg.maximumBalanceSnapshotAgeMs} ms`}
      </p>
    </div>
  );
}

function PolicyCheck({
  check,
  compact = false,
}: {
  check: LiveOnlyIntelligencePolicyCheck;
  compact?: boolean;
}) {
  const styles = check.state === "PASS"
    ? "border-success/25 bg-success/5"
    : check.state === "BLOCKED"
      ? "border-danger/30 bg-danger/10"
      : "border-border-default bg-black/20";
  const color = check.state === "PASS"
    ? "text-success"
    : check.state === "BLOCKED"
      ? "text-danger"
      : "text-warning";

  return (
    <div className={`border p-3 ${styles}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-black text-white">{check.label}</p>
        <span className={`text-[9px] font-black ${color}`}>{check.state === "NOT_EVALUATED" ? "REFERENCE" : check.state}</span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
        <div><span className="block text-text-muted">Current</span><strong className="text-text-primary">{check.current}</strong></div>
        <div><span className="block text-text-muted">Required</span><strong className="text-text-primary">{check.required}</strong></div>
      </div>
      {!compact ? <p className="mt-2 text-[10px] leading-4 text-text-muted">{check.reason}</p> : null}
    </div>
  );
}

function AttemptRow({ attempt }: { attempt: LiveOnlyRecentAttempt }) {
  const dangerous = attempt.recoveryRequired || attempt.possibleExposure;
  return (
    <div className={`border p-3 ${dangerous ? "border-danger/30 bg-danger/10" : "border-border-default bg-black/20"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-black text-white">
          {attempt.market} · {formatExchange(attempt.buyExchange)} → {formatExchange(attempt.sellExchange)}
        </p>
        <StatusPill label={attempt.status} tone={dangerous ? "danger" : attempt.status === "COMPLETED" ? "success" : "warning"} />
      </div>
      <p className="mt-2 text-[10px] leading-4 text-text-muted">{attempt.reason}</p>
      <p className="mt-2 text-[9px] text-text-muted">
        {formatTime(attempt.completedAt)} · order I/O {attempt.orderSubmissionMayHaveOccurred ? "MAY HAVE OCCURRED" : "NO"} · recovery {attempt.recoveryRequired ? "REQUIRED" : "NO"}
      </p>
    </div>
  );
}

function FoundationCard({ exchange }: { exchange: ExchangeFoundationCapability }) {
  return (
    <article className="border border-border-default bg-black/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-black text-white">{exchange.displayName}</h3>
          <p className="mt-1 text-[10px] uppercase tracking-[.14em] text-text-muted">Official product: {exchange.documentedProduct.replaceAll("_", " ")}</p>
        </div>
        <StatusPill label={exchange.readinessState.replaceAll("_", " ")} tone="warning" />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
        <Fact label="Credentials" value={exchange.credentialsConfigured ? "CONFIGURED" : "PENDING"} good={exchange.credentialsConfigured} />
        <Fact label="Order adapter" value="NOT IMPLEMENTED" good={false} />
      </div>
      <ReasonList title="Current integration blockers" items={exchange.blockers} tone="warning" />
      <a
        href={exchange.officialDocumentationUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-cyan-300 hover:text-cyan-200"
      >
        Official API documentation <ExternalLink className="size-3" />
      </a>
    </article>
  );
}

function ReasonList({
  title,
  items,
  empty,
  tone,
}: {
  title: string;
  items: string[];
  empty?: string;
  tone: "success" | "warning" | "danger";
}) {
  const color = tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "text-warning";
  return (
    <div className="mt-3">
      <h4 className={`text-[10px] font-black uppercase tracking-[.14em] ${color}`}>{title}</h4>
      <ul className="mt-2 space-y-1 text-[11px] leading-5 text-text-muted">
        {items.length ? items.map((item, index) => (
          <li key={`${index}-${item}`} className="flex gap-2"><span className={color}>•</span><span>{item}</span></li>
        )) : <li>{empty}</li>}
      </ul>
    </div>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border-default bg-[linear-gradient(145deg,rgba(7,22,25,.96),rgba(7,14,27,.98))] p-4 shadow-[0_12px_34px_rgba(0,0,0,.24)] sm:p-5">
      {children}
    </section>
  );
}

function SectionTitle({
  icon,
  eyebrow,
  title,
  detail,
}: {
  icon: ReactNode;
  eyebrow: string;
  title: string;
  detail: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 text-cyan-300 [&>svg]:size-4">
        {icon}
        <p className="text-[9px] font-black uppercase tracking-[.2em]">{eyebrow}</p>
      </div>
      <h2 className="mt-1.5 text-lg font-black text-white">{title}</h2>
      <p className="mt-1 max-w-5xl text-[11px] leading-5 text-text-muted">{detail}</p>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  detail,
  tone = "neutral",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  tone?: "success" | "danger" | "neutral";
}) {
  const color = tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "text-cyan-300";
  return (
    <article className="border border-border-default bg-panel/80 p-3">
      <div className={`flex items-center justify-between gap-2 [&>svg]:size-4 ${color}`}>
        <p className="text-[8px] font-black uppercase tracking-[.15em] text-text-muted">{label}</p>
        {icon}
      </div>
      <p className="mt-3 text-lg font-black text-white">{value}</p>
      <p className="mt-1 text-[9px] text-text-muted">{detail}</p>
    </article>
  );
}

function Fact({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <div className="border border-border-default bg-black/20 p-3">
      <p className="text-[8px] font-black uppercase tracking-[.13em] text-text-muted">{label}</p>
      <p className={`mt-1 text-xs font-black ${good ? "text-success" : "text-warning"}`}>{value}</p>
    </div>
  );
}

function Value({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div>
      <p className="text-[8px] font-black uppercase tracking-[.12em] text-text-muted">{label}</p>
      <p className={`mt-1 font-black ${good === false ? "text-danger" : good === true ? "text-success" : "text-white"}`}>{value}</p>
    </div>
  );
}

function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: "success" | "warning" | "danger" | "neutral";
}) {
  const styles = {
    success: "border-success/30 bg-success/10 text-success",
    warning: "border-warning/30 bg-warning/10 text-warning",
    danger: "border-danger/30 bg-danger/10 text-danger",
    neutral: "border-border-default bg-black/30 text-text-muted",
  }[tone];
  return <span className={`whitespace-nowrap rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-wide ${styles}`}>{label}</span>;
}

function PageState({
  title,
  detail,
  spinning = false,
  onRetry,
}: {
  title: string;
  detail: string;
  spinning?: boolean;
  onRetry?: () => void;
}) {
  return (
    <div className="flex min-h-[28rem] items-center justify-center border border-border-default bg-panel/70 p-6 text-center">
      <div>
        <RefreshCw className={`mx-auto size-8 text-emerald-300 ${spinning ? "animate-spin" : ""}`} />
        <h1 className="mt-5 text-xl font-black text-white">{title}</h1>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-text-muted">{detail}</p>
        {onRetry ? (
          <button type="button" onClick={onRetry} className="mt-5 border border-emerald-400/35 bg-emerald-400/10 px-4 py-2 text-sm font-bold text-emerald-300">Retry report</button>
        ) : null}
      </div>
    </div>
  );
}

function statusLabel(status: LiveOnlyIntelligenceOpportunity["status"]): string {
  switch (status) {
    case "READY_FOR_FINAL_EXECUTION": return "PREFLIGHT READY";
    case "BLOCKED": return "EXECUTION BLOCKED";
    case "ANALYTICAL_ONLY": return "ANALYTICAL ONLY";
  }
}

function formatExchange(value: string): string {
  const labels: Record<string, string> = {
    binance: "Binance",
    bybit: "Bybit",
    coindcx: "CoinDCX",
    coinswitch: "CoinSwitch",
    unocoin: "UnoCoin",
    zebpay: "ZebPay",
    giottus: "Giottus",
    mudrex: "Mudrex",
    bitbns: "Bitbns",
  };
  return labels[value.trim().toLowerCase()] ?? value;
}

function formatInr(value: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value);
}

function formatNullableInr(value: number | null): string {
  return value === null ? "Unavailable" : formatInr(value);
}

function formatNullable(value: number | null): string {
  return value === null ? "Unavailable" : formatNumber(value, 8);
}

function formatNumber(value: number, maximumFractionDigits = 2): string {
  return value.toLocaleString("en-IN", { maximumFractionDigits });
}

function formatCount(value: number): string {
  return Math.max(0, value).toLocaleString("en-IN");
}

function formatTime(value: number): string {
  return new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
}
