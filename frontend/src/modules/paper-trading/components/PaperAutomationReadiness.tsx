import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import {
  Link,
} from "react-router-dom";

import {
  APP_PAGE_PATHS,
} from "@/app/routes";
import {
  usePaperTradingReadiness,
} from "../hooks/usePaperTrades";

export function PaperAutomationReadiness() {
  const {
    data,
    isPending,
    isError,
    isFetching,
    refetch,
  } = usePaperTradingReadiness();

  const readiness =
    data?.data;

  if (
    isPending &&
    !readiness
  ) {
    return (
      <section
        className="mb-6 rounded-xl border border-border-default bg-panel p-5"
        aria-live="polite"
      >
        <div className="flex items-center gap-3 text-sm text-text-muted">
          <RefreshCw className="size-4 animate-spin" />

          Verifying PAPER automation readiness...
        </div>
      </section>
    );
  }

  if (
    isError ||
    !readiness
  ) {
    return (
      <section
        className="mb-6 rounded-xl border border-danger/30 bg-panel p-5"
        aria-live="polite"
      >
        <div className="flex items-start gap-3">
          <XCircle className="mt-0.5 size-5 shrink-0 text-danger" />

          <div>
            <h2 className="font-semibold text-danger">
              PAPER readiness unavailable
            </h2>

            <p className="mt-1 text-sm leading-6 text-text-muted">
              Execution remains blocked when automation evidence cannot be verified.
            </p>

            <button
              type="button"
              onClick={() =>
                void refetch()
              }
              className="mt-3 inline-flex items-center gap-2 rounded-md border border-border-default bg-panel-light px-3 py-2 text-xs font-semibold text-text-primary"
            >
              <RefreshCw className="size-3.5" />

              Retry verification
            </button>
          </div>
        </div>
      </section>
    );
  }

  const summary =
    readiness.summary;

  const remainingSamples =
    summary.remainingShadowOutcomes;

  const evidenceTarget =
    summary.minimumShadowOutcomes;

  const evidenceProgress =
    evidenceTarget > 0
      ? Math.min(
          100,
          (summary.completedShadowOutcomes /
            evidenceTarget) *
            100,
        )
      : 0;

  const paperStatus =
    readiness.readyForPaperTrading
      ? "ELIGIBLE"
      : summary.paperExecutionArmed
        ? "ARMED / BLOCKED"
        : "NOT ARMED";

  const statusStyle =
    readiness.readyForPaperTrading
      ? "border-success/30 bg-success/10 text-success"
      : summary.paperExecutionArmed
        ? "border-warning/30 bg-warning/10 text-warning"
        : "border-danger/30 bg-danger/10 text-danger";

  return (
    <section
      className="mb-6 overflow-hidden rounded-xl border border-border-default bg-panel"
      aria-labelledby="paper-readiness-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border-default p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-lg border border-brand/20 bg-brand/10 p-2.5 text-brand">
            <ShieldCheck className="size-5" />
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">
              Genuine PAPER gate
            </p>

            <h2
              id="paper-readiness-heading"
              className="mt-1 text-xl font-bold text-text-primary"
            >
              {readiness.readyForPaperTrading
                ? "PAPER execution is eligible"
                : "PAPER execution remains safety-blocked"}
            </h2>

            <p className="mt-1 max-w-3xl text-sm leading-6 text-text-muted">
              Read-only evidence from the automation controller. Synthetic demo results do not increase this progress or create genuine trades.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full border px-3 py-1 text-xs font-bold ${statusStyle}`}
          >
            PAPER {paperStatus}
          </span>

          <span className="rounded-full border border-success/30 bg-success/10 px-3 py-1 text-xs font-bold text-success">
            LIVE OFF
          </span>

          <button
            type="button"
            aria-label="Refresh PAPER readiness"
            disabled={isFetching}
            onClick={() =>
              void refetch()
            }
            className="rounded-md border border-border-default bg-panel-light p-2 text-text-muted hover:text-text-primary disabled:opacity-60"
          >
            <RefreshCw
              className={`size-4 ${
                isFetching
                  ? "animate-spin"
                  : ""
              }`}
            />
          </button>
        </div>
      </div>

      <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.85fr)]">
        <div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <ReadinessMetric
              label="Scheduler"
              value={
                summary.schedulerRunning
                  ? "RUNNING"
                  : "STOPPED"
              }
              passed={summary.schedulerRunning}
            />

            <ReadinessMetric
              label="Shadow Evidence"
              value={
                `${summary.completedShadowOutcomes.toLocaleString()} / ${evidenceTarget.toLocaleString()}`
              }
              passed={gatePassed(
                readiness,
                "SHADOW_READY_FOR_PAPER",
              )}
            />

            <ReadinessMetric
              label="Readiness"
              value={summary.shadowReadinessLevel}
              passed={gatePassed(
                readiness,
                "SHADOW_READY_FOR_PAPER",
              )}
            />

            <ReadinessMetric
              label="PAPER Venues"
              value={`${summary.paperAvailableExchanges} / ${summary.targetExchangeCount} (min ${summary.minimumCrossExchangeVenues})`}
              passed={gatePassed(
                readiness,
                "CROSS_EXCHANGE_PAPER_AVAILABILITY",
              )}
            />
          </div>

          <div className="mt-4 rounded-lg border border-border-default bg-panel-light p-4">
            <div className="flex items-center justify-between gap-4 text-xs">
              <span className="font-semibold text-text-primary">
                Shadow sample progress
              </span>

              <span className="font-mono text-text-muted">
                {`${remainingSamples.toLocaleString()} remaining`}
              </span>
            </div>

            <div
              className="mt-3 h-2 overflow-hidden rounded-full bg-background"
              role="progressbar"
              aria-label="Completed shadow outcome progress"
              aria-valuemin={0}
              aria-valuemax={
                evidenceTarget ??
                undefined
              }
              aria-valuenow={summary.completedShadowOutcomes}
            >
              <div
                className="h-full rounded-full bg-brand transition-[width]"
                style={{
                  width: `${evidenceProgress}%`,
                }}
              />
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <GateStatus
                label="PAPER armed"
                passed={summary.paperExecutionArmed}
              />

              <GateStatus
                label="PAPER account mode"
                passed={summary.paperAccountMode}
              />

              <GateStatus
                label="Accounting integrity"
                passed={summary.accountingIntegrityPassed}
              />

              <GateStatus
                label="LIVE disabled"
                passed={
                  readiness.liveExecutionAllowed ===
                    false &&
                  readiness.orderSubmissionAllowed ===
                    false
                }
              />
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border-default bg-panel-light p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">
                Current blockers
              </p>

              <p className="mt-1 font-mono text-xs text-text-primary">
                {readiness.stage}
              </p>
            </div>

            <span className="font-mono text-xs text-text-muted">
              {readiness.blockers.length.toLocaleString()}
            </span>
          </div>

          {readiness.blockers.length > 0 ? (
            <div className="mt-3 space-y-2">
              {readiness.blockers.map(
                (blocker) => (
                  <div
                    key={blocker}
                    className="flex items-start gap-2 rounded-md border border-warning/20 bg-warning/10 p-2.5 text-xs leading-5 text-text-primary"
                  >
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />

                    <span>{blocker}</span>
                  </div>
                ),
              )}
            </div>
          ) : (
            <div className="mt-3 flex items-center gap-2 rounded-md border border-success/20 bg-success/10 p-3 text-xs text-success">
              <CheckCircle2 className="size-4" />

              No PAPER automation blockers reported.
            </div>
          )}

          <div className="mt-4 flex items-center justify-between gap-3 border-t border-border-default pt-4">
            <span className="text-xs text-text-muted">
              Attributed closed PAPER trades: {readNullableCount(
                readiness.soak
                  .attributedClosedTrades,
              )}
            </span>

            <Link
              to={APP_PAGE_PATHS["automation-center"]}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand hover:text-brand/80"
            >
              Full automation evidence

              <ExternalLink className="size-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function ReadinessMetric({
  label,
  value,
  passed,
}: {
  label: string;
  value: string;
  passed: boolean;
}) {
  return (
    <div className="rounded-lg border border-border-default bg-panel-light p-3">
      <p className="text-[10px] uppercase tracking-[0.13em] text-text-muted">
        {label}
      </p>

      <div className="mt-2 flex items-center gap-2">
        {passed ? (
          <CheckCircle2 className="size-4 shrink-0 text-success" />
        ) : (
          <AlertTriangle className="size-4 shrink-0 text-warning" />
        )}

        <span className="font-mono text-sm font-bold text-text-primary">
          {value}
        </span>
      </div>
    </div>
  );
}

function GateStatus({
  label,
  passed,
}: {
  label: string;
  passed: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border-default bg-panel px-3 py-2">
      <span className="text-xs text-text-muted">
        {label}
      </span>

      <span
        className={`font-mono text-[10px] font-bold ${
          passed
            ? "text-success"
            : "text-danger"
        }`}
      >
        {passed
          ? "PASS"
          : "BLOCKED"}
      </span>
    </div>
  );
}

function gatePassed(
  readiness: {
    gates: Array<{
      key: string;
      passed: boolean;
    }>;
  },
  key: string,
): boolean {
  return readiness.gates
    .find(
      (gate) =>
        gate.key ===
        key,
    )
    ?.passed ??
    false;
}

function readNullableCount(
  value: number | null,
): string {
  return value ===
    null
    ? "NO_DATA"
    : value.toLocaleString();
}
