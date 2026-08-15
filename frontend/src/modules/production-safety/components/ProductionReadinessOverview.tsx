import {
  LockKeyhole,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

import type {
  V18AcceptanceGateState,
  V18ProductionReadinessReport,
} from "../types/V18Readiness";

interface ProductionReadinessOverviewProps {
  report:
    | V18ProductionReadinessReport
    | undefined;

  loading: boolean;

  unavailable: boolean;
}

export default function ProductionReadinessOverview({
  report,
  loading,
  unavailable,
}: ProductionReadinessOverviewProps) {
  if (
    loading &&
    !report
  ) {
    return (
      <Shell>
        <p className="text-sm text-text-muted">
          Loading production safety
          evidence...
        </p>
      </Shell>
    );
  }

  if (
    unavailable ||
    !report
  ) {
    return (
      <Shell>
        <div className="flex items-start gap-3 rounded-lg border border-danger/30 bg-danger/10 p-4">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-danger" />

          <div>
            <p className="font-semibold text-danger">
              Safety evidence unavailable
            </p>

            <p className="mt-1 text-sm text-text-muted">
              The frontend cannot verify V18
              production readiness. Treat LIVE
              readiness as blocked until backend
              evidence is available.
            </p>
          </div>
        </div>
      </Shell>
    );
  }

  const accepted =
    report.v18HardeningAccepted;

  const tinyLiveReady =
    report.tinyLiveOperationalReady;

  const liveLocked =
    !report.liveTradingEnabled &&
    !report.liveSubmissionAllowed;

  return (
    <Shell>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="V18 Hardening"
          value={
            accepted
              ? "ACCEPTED"
              : "BLOCKED"
          }
          state={
            accepted
              ? "PASS"
              : "BLOCKED"
          }
        />

        <Metric
          label="Tiny-LIVE"
          value={
            tinyLiveReady
              ? "READY"
              : "NOT READY"
          }
          state={
            tinyLiveReady
              ? "PASS"
              : "BLOCKED"
          }
        />

        <Metric
          label="LIVE Submission"
          value={
            report.liveSubmissionAllowed
              ? "ALLOWED"
              : "OFF"
          }
          state={
            report.liveSubmissionAllowed
              ? "WARNING"
              : "PASS"
          }
        />

        <Metric
          label="Acceptance Blockers"
          value={String(
            report.summary
              .v18AcceptanceBlockers,
          )}
          state={
            report.summary
              .v18AcceptanceBlockers ===
            0
              ? "PASS"
              : "BLOCKED"
          }
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-lg border border-border-default bg-panel-light p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
                Gate Summary
              </p>

              <p className="mt-1 text-lg font-bold text-text-primary">
                {report.summary.passed} pass
                {" · "}
                {report.summary.warnings} warning
                {" · "}
                {report.summary.blocked} blocked
              </p>
            </div>

            <span className="rounded-full border border-border-default bg-panel px-3 py-1 font-mono text-xs text-text-muted">
              V{report.version} / Build{" "}
              {report.build}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <GateCount
              label="PASS"
              value={
                report.summary.passed
              }
              state="PASS"
            />

            <GateCount
              label="WARNING"
              value={
                report.summary.warnings
              }
              state="WARNING"
            />

            <GateCount
              label="BLOCKED"
              value={
                report.summary.blocked
              }
              state="BLOCKED"
            />
          </div>

          {report.blockers.tinyLive
            .length > 0 ? (
            <div className="mt-4 rounded-lg border border-warning/30 bg-warning/10 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-warning">
                Tiny-LIVE blockers
              </p>

              <ul className="mt-2 space-y-1 text-sm text-text-primary">
                {report.blockers.tinyLive
                  .slice(
                    0,
                    4,
                  )
                  .map(
                    (
                      blocker,
                    ) => (
                      <li
                        key={
                          blocker
                        }
                      >
                        • {blocker}
                      </li>
                    ),
                  )}
              </ul>
            </div>
          ) : (
            <div className="mt-4 rounded-lg border border-success/30 bg-success/10 p-4 text-sm text-success">
              No Tiny-LIVE blockers
              reported by the backend
              readiness gate.
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border-default bg-panel-light p-4">
          <div className="flex items-start gap-3">
            <LockKeyhole className="mt-0.5 size-5 shrink-0 text-text-muted" />

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
                Real-Money Safety
              </p>

              <p
                className={`mt-1 text-xl font-bold ${
                  liveLocked
                    ? "text-success"
                    : "text-danger"
                }`}
              >
                {liveLocked
                  ? "LIVE LOCKED"
                  : "REVIEW REQUIRED"}
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-3 text-sm">
            <SafetyLine
              label="Automatic promotion"
              value={
                report
                  .automaticLivePromotionAllowed
                  ? "ALLOWED"
                  : "DISABLED"
              }
            />

            <SafetyLine
              label="Automatic submission"
              value={
                report
                  .automaticOrderSubmissionAllowed
                  ? "ALLOWED"
                  : "DISABLED"
              }
            />

            <SafetyLine
              label="Tiny-LIVE capital"
              value={`₹${report.safety.minimumTinyLiveCapital}–₹${report.safety.maximumTinyLiveCapital}`}
            />

            <SafetyLine
              label="Acceptance used real money"
              value={
                report.safety
                  .realMoneyUsedByAcceptanceCheck
                  ? "YES"
                  : "NO"
              }
            />
          </div>
        </div>
      </div>
    </Shell>
  );
}

function Shell({
  children,
}: {
  children:
    React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border-default bg-panel p-5">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-success">
            <ShieldCheck className="size-4" />

            <p className="text-xs font-semibold uppercase tracking-[0.18em]">
              Production Safety
            </p>
          </div>

          <h2 className="mt-1 text-2xl font-bold text-text-primary">
            V18 Readiness Control Surface
          </h2>

          <p className="mt-1 max-w-3xl text-sm text-text-muted">
            Read-only operator visibility.
            This panel does not arm LIVE
            trading or submit orders.
          </p>
        </div>

        <span className="rounded-full border border-success/30 bg-success/10 px-3 py-1 text-xs font-semibold text-success">
          READ ONLY
        </span>
      </div>

      {children}
    </section>
  );
}

interface MetricProps {
  label: string;

  value: string;

  state:
    V18AcceptanceGateState;
}

function Metric({
  label,
  value,
  state,
}: MetricProps) {
  return (
    <div className="rounded-lg border border-border-default bg-panel-light p-4">
      <p className="text-xs uppercase tracking-[0.14em] text-text-muted">
        {label}
      </p>

      <p
        className={`mt-2 text-xl font-bold ${stateTextClass(
          state,
        )}`}
      >
        {value}
      </p>
    </div>
  );
}

interface GateCountProps {
  label: string;

  value: number;

  state:
    V18AcceptanceGateState;
}

function GateCount({
  label,
  value,
  state,
}: GateCountProps) {
  return (
    <div className="rounded-lg border border-border-default bg-panel p-3 text-center">
      <p
        className={`text-2xl font-bold tabular-nums ${stateTextClass(
          state,
        )}`}
      >
        {value}
      </p>

      <p className="mt-1 text-[11px] font-semibold tracking-[0.14em] text-text-muted">
        {label}
      </p>
    </div>
  );
}

function SafetyLine({
  label,
  value,
}: {
  label: string;

  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border-default pb-2 last:border-b-0 last:pb-0">
      <span className="text-text-muted">
        {label}
      </span>

      <span className="font-mono font-semibold text-text-primary">
        {value}
      </span>
    </div>
  );
}

function stateTextClass(
  state:
    V18AcceptanceGateState,
): string {
  switch (state) {
    case "PASS":
      return "text-success";

    case "WARNING":
      return "text-warning";

    case "BLOCKED":
      return "text-danger";
  }
}