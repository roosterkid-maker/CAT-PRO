import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  LockKeyhole,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import { useV18ProductionReadiness } from "../hooks/useV18ProductionReadiness";
import {
  useFiveExchangeGoNoGo,
} from "../hooks/useFiveExchangeGoNoGo";
import type {
  FiveExchangeGoNoGoReport,
} from "../types/FiveExchangeGoNoGo";
import type {
  V18AcceptanceGate,
  V18AcceptanceGateCategory,
  V18AcceptanceGateState,
} from "../types/V18Readiness";

const categoryOrder: V18AcceptanceGateCategory[] = [
  "PERSISTENCE",
  "RECOVERY",
  "ACCOUNTING",
  "SECURITY",
  "CLOCK",
  "ALERTING",
  "EXECUTION",
  "VALIDATION",
  "TINY_LIVE",
];

export default function ProductionSafetyDashboard() {
  const {
    data: response,
    isPending,
    isError,
    isFetching,
    refetch,
  } = useV18ProductionReadiness();

  const goNoGoQuery =
    useFiveExchangeGoNoGo();

  const report = response?.data;

  const goNoGo =
    goNoGoQuery.data?.data;

  if (isPending && !report) {
    return (
      <PageShell>
        <LoadingState />
      </PageShell>
    );
  }

  if (isError || !report) {
    return (
      <PageShell>
        <UnavailableState
          onRetry={() => void refetch()}
        />
      </PageShell>
    );
  }

  const generatedAt =
    new Date(
      report.generatedAt,
    ).toLocaleString();

  return (
    <PageShell>
      <section className="rounded-xl border border-border-default bg-panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-success">
              <ShieldCheck className="size-4" />

              <p className="text-xs font-semibold uppercase tracking-[0.18em]">
                Production Safety
              </p>
            </div>

            <h1 className="mt-2 text-3xl font-bold text-text-primary">
              V18 Readiness Dashboard
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">
              Operator-grade, read-only visibility into
              the final V18 production-hardening
              acceptance gate. This screen cannot arm
              LIVE trading, reserve capital, or submit
              exchange orders.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="rounded-full border border-success/30 bg-success/10 px-3 py-1 text-xs font-semibold text-success">
              READ ONLY
            </span>

            <button
              type="button"
              onClick={() =>
                void Promise.all([
                  refetch(),
                  goNoGoQuery.refetch(),
                ])
              }
              disabled={
                isFetching ||
                goNoGoQuery.isFetching
              }
              className="inline-flex items-center gap-2 rounded-md border border-border-default bg-panel-light px-3 py-2 text-xs font-semibold text-text-primary transition hover:border-brand/50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw
                className={`size-4 ${
                  isFetching ||
                  goNoGoQuery.isFetching
                    ? "animate-spin"
                    : ""
                }`}
              />

              Refresh
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <HeadlineMetric
            label="V18 Hardening"
            value={
              report.v18HardeningAccepted
                ? "ACCEPTED"
                : "BLOCKED"
            }
            state={
              report.v18HardeningAccepted
                ? "PASS"
                : "BLOCKED"
            }
          />

          <HeadlineMetric
            label="Tiny-LIVE"
            value={
              report.tinyLiveOperationalReady
                ? "READY"
                : "NOT READY"
            }
            state={
              report.tinyLiveOperationalReady
                ? "PASS"
                : "BLOCKED"
            }
          />

          <HeadlineMetric
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

          <HeadlineMetric
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

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-default bg-panel-light px-4 py-3 text-xs text-text-muted">
          <span>
            Status:{" "}
            <strong className="text-text-primary">
              {
                report.status
              }
            </strong>
          </span>

          <span>
            Version{" "}
            {report.version} ·
            Build{" "}
            {report.build}
          </span>

          <span className="inline-flex items-center gap-1.5">
            <Clock3 className="size-3.5" />
            Evidence generated{" "}
            {generatedAt}
          </span>
        </div>
      </section>

      {goNoGo ? (
        <FiveExchangeGoNoGoPanel
          report={
            goNoGo
          }
        />
      ) : (
        <section className="rounded-xl border border-warning/30 bg-warning/10 p-5 text-sm text-warning">
          V19.35 five-exchange
          go/no-go evidence is
          unavailable. Missing
          evidence remains NO-GO.
        </section>
      )}

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-xl border border-border-default bg-panel p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
                Acceptance Gates
              </p>

              <h2 className="mt-1 text-2xl font-bold text-text-primary">
                {
                  report.summary
                    .totalGates
                }{" "}
                Production Gates
              </h2>
            </div>

            <div className="flex flex-wrap gap-2 text-xs font-semibold">
              <CountPill
                state="PASS"
                value={
                  report.summary
                    .passed
                }
              />

              <CountPill
                state="WARNING"
                value={
                  report.summary
                    .warnings
                }
              />

              <CountPill
                state="BLOCKED"
                value={
                  report.summary
                    .blocked
                }
              />
            </div>
          </div>

          <div className="mt-5 space-y-6">
            {categoryOrder.map(
              (category) => {
                const gates =
                  report.gates.filter(
                    (
                      gate,
                    ) =>
                      gate.category ===
                      category,
                  );

                if (
                  gates.length ===
                  0
                ) {
                  return null;
                }

                return (
                  <GateCategorySection
                    key={
                      category
                    }
                    category={
                      category
                    }
                    gates={
                      gates
                    }
                  />
                );
              },
            )}
          </div>
        </div>

        <div className="space-y-4">
          <BlockerPanel
            title="V18 Acceptance Blockers"
            count={
              report.summary
                .v18AcceptanceBlockers
            }
            blockers={
              report.blockers
                .v18Acceptance
            }
            emptyText="No V18 acceptance blockers reported."
          />

          <BlockerPanel
            title="Tiny-LIVE Blockers"
            count={
              report.summary
                .tinyLiveBlockers
            }
            blockers={
              report.blockers
                .tinyLive
            }
            emptyText="No Tiny-LIVE blockers reported."
          />

          <section className="rounded-xl border border-border-default bg-panel p-5">
            <div className="flex items-center gap-2">
              <LockKeyhole className="size-5 text-brand" />

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
                  Safety Invariants
                </p>

                <h2 className="mt-1 text-lg font-bold text-text-primary">
                  Real-Money
                  Guardrails
                </h2>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <SafetyRow
                label="LIVE trading"
                value={
                  report.liveTradingEnabled
                    ? "ENABLED"
                    : "OFF"
                }
                safe={
                  !report.liveTradingEnabled
                }
              />

              <SafetyRow
                label="LIVE submission"
                value={
                  report.liveSubmissionAllowed
                    ? "ALLOWED"
                    : "OFF"
                }
                safe={
                  !report.liveSubmissionAllowed
                }
              />

              <SafetyRow
                label="Automatic promotion"
                value={
                  report.automaticLivePromotionAllowed
                    ? "ALLOWED"
                    : "DISABLED"
                }
                safe={
                  !report.automaticLivePromotionAllowed
                }
              />

              <SafetyRow
                label="Automatic order submission"
                value={
                  report.automaticOrderSubmissionAllowed
                    ? "ALLOWED"
                    : "DISABLED"
                }
                safe={
                  !report.automaticOrderSubmissionAllowed
                }
              />

              <SafetyRow
                label="Acceptance used real money"
                value={
                  report.safety
                    .realMoneyUsedByAcceptanceCheck
                    ? "YES"
                    : "NO"
                }
                safe={
                  !report.safety
                    .realMoneyUsedByAcceptanceCheck
                }
              />

              <SafetyRow
                label="Build 16 real-order submission"
                value={
                  report.safety
                    .realOrderSubmissionImplementedByBuild16
                    ? "IMPLEMENTED"
                    : "NOT IMPLEMENTED"
                }
                safe={
                  !report.safety
                    .realOrderSubmissionImplementedByBuild16
                }
              />
            </div>

            <div className="mt-4 rounded-lg border border-brand/20 bg-brand/10 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">
                Tiny-LIVE hard
                capital range
              </p>

              <p className="mt-1 text-2xl font-bold text-text-primary">
                ₹
                {
                  report.safety
                    .minimumTinyLiveCapital
                }
                –₹
                {
                  report.safety
                    .maximumTinyLiveCapital
                }
              </p>
            </div>
          </section>
        </div>
      </section>

      <section className="rounded-xl border border-border-default bg-panel p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
          Acceptance Notes
        </p>

        <h2 className="mt-1 text-xl font-bold text-text-primary">
          Backend Safety
          Evidence
        </h2>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {report.notes.map(
            (note) => (
              <div
                key={note}
                className="rounded-lg border border-border-default bg-panel-light p-4 text-sm leading-6 text-text-muted"
              >
                {note}
              </div>
            ),
          )}
        </div>
      </section>
    </PageShell>
  );
}

function PageShell({
  children,
}: {
  children:
    React.ReactNode;
}) {
  return (
    <section className="space-y-6">
      {children}
    </section>
  );
}

function LoadingState() {
  return (
    <section className="rounded-xl border border-border-default bg-panel p-6">
      <div className="flex items-center gap-3 text-text-muted">
        <RefreshCw className="size-5 animate-spin" />

        Loading V18
        production-safety
        evidence...
      </div>
    </section>
  );
}

function UnavailableState({
  onRetry,
}: {
  onRetry: () => void;
}) {
  return (
    <section className="rounded-xl border border-danger/30 bg-panel p-6">
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 size-6 shrink-0 text-danger" />

        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-danger">
            Safety evidence
            unavailable
          </h1>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">
            The operator UI cannot
            verify the V18
            production-readiness
            report. Missing evidence
            is not treated as
            healthy; LIVE readiness
            remains blocked from this
            screen&apos;s
            perspective.
          </p>

          <button
            type="button"
            onClick={onRetry}
            className="mt-4 inline-flex items-center gap-2 rounded-md border border-border-default bg-panel-light px-3 py-2 text-sm font-semibold text-text-primary hover:border-brand/50"
          >
            <RefreshCw className="size-4" />

            Retry
          </button>
        </div>
      </div>
    </section>
  );
}

function HeadlineMetric({
  label,
  value,
  state,
}: {
  label: string;
  value: string;
  state:
    V18AcceptanceGateState;
}) {
  return (
    <div className="rounded-lg border border-border-default bg-panel-light p-4">
      <p className="text-xs uppercase tracking-[0.16em] text-text-muted">
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

function CountPill({
  state,
  value,
}: {
  state:
    V18AcceptanceGateState;
  value: number;
}) {
  return (
    <span
      className={`rounded-full border px-3 py-1 ${stateBadgeClass(
        state,
      )}`}
    >
      {value} {state}
    </span>
  );
}

function GateCategorySection({
  category,
  gates,
}: {
  category:
    V18AcceptanceGateCategory;
  gates:
    V18AcceptanceGate[];
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-brand">
          {formatCategory(
            category,
          )}
        </h3>

        <span className="text-xs text-text-muted">
          {gates.length} gate(s)
        </span>
      </div>

      <div className="overflow-hidden rounded-lg border border-border-default">
        {gates.map(
          (
            gate,
            index,
          ) => (
            <GateRow
              key={
                gate.key
              }
              gate={gate}
              showBorder={
                index !==
                gates.length -
                  1
              }
            />
          ),
        )}
      </div>
    </div>
  );
}

function GateRow({
  gate,
  showBorder,
}: {
  gate:
    V18AcceptanceGate;
  showBorder: boolean;
}) {
  return (
    <div
      className={`bg-panel-light p-4 ${
        showBorder
          ? "border-b border-border-default"
          : ""
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StateIcon
              state={
                gate.state
              }
            />

            <p className="font-mono text-sm font-semibold text-text-primary">
              {gate.key}
            </p>

            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${stateBadgeClass(
                gate.state,
              )}`}
            >
              {gate.state}
            </span>
          </div>

          <p className="mt-2 text-sm leading-6 text-text-muted">
            {gate.message}
          </p>

          {gate.reasons
            .length > 0 ? (
            <ul className="mt-2 space-y-1 text-xs leading-5 text-danger">
              {gate.reasons.map(
                (
                  reason,
                ) => (
                  <li
                    key={
                      reason
                    }
                  >
                    • {reason}
                  </li>
                ),
              )}
            </ul>
          ) : null}
        </div>

        <div className="grid shrink-0 gap-1 text-right text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
          <span>
            V18:{" "}
            {gate.requiredForV18Acceptance
              ? "REQUIRED"
              : "INFO"}
          </span>

          <span>
            Tiny-LIVE:{" "}
            {gate.requiredForTinyLive
              ? "REQUIRED"
              : "INFO"}
          </span>
        </div>
      </div>
    </div>
  );
}

function BlockerPanel({
  title,
  count,
  blockers,
  emptyText,
}: {
  title: string;
  count: number;
  blockers: string[];
  emptyText: string;
}) {
  const blocked =
    count > 0;

  return (
    <section className="rounded-xl border border-border-default bg-panel p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {blocked ? (
            <ShieldAlert className="size-5 text-danger" />
          ) : (
            <CheckCircle2 className="size-5 text-success" />
          )}

          <h2 className="font-bold text-text-primary">
            {title}
          </h2>
        </div>

        <span
          className={`text-xl font-bold ${
            blocked
              ? "text-danger"
              : "text-success"
          }`}
        >
          {count}
        </span>
      </div>

      {blockers.length >
      0 ? (
        <div className="mt-4 space-y-2">
          {blockers.map(
            (
              blocker,
            ) => (
              <div
                key={
                  blocker
                }
                className="rounded-lg border border-danger/20 bg-danger/10 p-3 text-xs leading-5 text-text-primary"
              >
                {blocker}
              </div>
            ),
          )}
        </div>
      ) : (
        <p className="mt-4 rounded-lg border border-success/20 bg-success/10 p-3 text-sm text-success">
          {emptyText}
        </p>
      )}
    </section>
  );
}

function SafetyRow({
  label,
  value,
  safe,
}: {
  label: string;
  value: string;
  safe: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border-default pb-3 last:border-b-0 last:pb-0">
      <span className="text-sm text-text-muted">
        {label}
      </span>

      <span
        className={`font-mono text-xs font-bold ${
          safe
            ? "text-success"
            : "text-danger"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function StateIcon({
  state,
}: {
  state:
    V18AcceptanceGateState;
}) {
  if (state === "PASS") {
    return (
      <CheckCircle2 className="size-4 shrink-0 text-success" />
    );
  }

  if (
    state === "WARNING"
  ) {
    return (
      <AlertTriangle className="size-4 shrink-0 text-warning" />
    );
  }

  return (
    <XCircle className="size-4 shrink-0 text-danger" />
  );
}

function stateTextClass(
  state:
    V18AcceptanceGateState,
) {
  if (state === "PASS") {
    return "text-success";
  }

  if (
    state === "WARNING"
  ) {
    return "text-warning";
  }

  return "text-danger";
}

function stateBadgeClass(
  state:
    V18AcceptanceGateState,
) {
  if (state === "PASS") {
    return "border-success/30 bg-success/10 text-success";
  }

  if (
    state === "WARNING"
  ) {
    return "border-warning/30 bg-warning/10 text-warning";
  }

  return "border-danger/30 bg-danger/10 text-danger";
}

function formatCategory(
  category:
    V18AcceptanceGateCategory,
) {
  return category.replaceAll(
    "_",
    " ",
  );
}

function FiveExchangeGoNoGoPanel({
  report,
}: {
  report:
    FiveExchangeGoNoGoReport;
}) {
  const go =
    report.activationReviewEligible;

  return (
    <section className="rounded-xl border border-border-default bg-panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">
            V{report.version}
          </p>

          <h2 className="mt-1 text-2xl font-bold text-text-primary">
            Five-Exchange Tiny-LIVE Go / No-Go
          </h2>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">
            Unified rolling,
            hardening, recovery,
            alert, credential, clock,
            authenticated-read and
            adapter evidence. A GO
            can request an audited
            review only; it cannot
            activate LIVE.
          </p>
        </div>

        <span
          className={`rounded-full border px-4 py-2 text-sm font-bold ${
            go
              ? "border-success/30 bg-success/10 text-success"
              : "border-danger/30 bg-danger/10 text-danger"
          }`}
        >
          {report.decision.replaceAll(
            "_",
            " ",
          )}
        </span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <HeadlineMetric
          label="Required Gates"
          value={`${report.summary.requiredPassed}/${report.summary.requiredGates}`}
          state={
            report.summary.requiredBlocked ===
              0
              ? "PASS"
              : "BLOCKED"
          }
        />

        <HeadlineMetric
          label="Required Passing"
          value={String(
            report.summary.requiredPassed,
          )}
          state="PASS"
        />

        <HeadlineMetric
          label="Required Blocked"
          value={String(
            report.summary.requiredBlocked,
          )}
          state={
            report.summary.requiredBlocked ===
              0
              ? "PASS"
              : "BLOCKED"
          }
        />

        <HeadlineMetric
          label="Post-Activation Waiting"
          value={String(
            report.summary.postActivationBlocked,
          )}
          state={
            report.summary.postActivationBlocked ===
              0
              ? "PASS"
              : "BLOCKED"
          }
        />
      </div>

      <div className="mt-5 overflow-x-auto">
        <div className="min-w-[980px] space-y-2">
          <div className="grid grid-cols-[1fr_.8fr_.8fr_.8fr_.8fr_.8fr_.7fr] gap-3 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
            <span>Exchange</span>
            <span>Rolling</span>
            <span>Credentials</span>
            <span>Auth Read</span>
            <span>Clock</span>
            <span>Adapter</span>
            <span>Blockers</span>
          </div>

          {report.exchanges.map(
            (exchange) => (
              <div
                key={
                  exchange.exchange
                }
                className="grid grid-cols-[1fr_.8fr_.8fr_.8fr_.8fr_.8fr_.7fr] items-center gap-3 rounded-lg border border-border-default bg-panel-light px-3 py-3 text-xs"
              >
                <span className="font-semibold uppercase text-text-primary">
                  {exchange.exchange}
                </span>

                <EvidenceValue
                  passed={
                    exchange.rollingShadowStable &&
                    exchange.rollingPaperStable
                  }
                />

                <EvidenceValue
                  passed={
                    exchange.credentialsMonitored &&
                    exchange.credentialsConfigured
                  }
                />

                <EvidenceValue
                  passed={
                    exchange.authenticatedReadFresh
                  }
                />

                <EvidenceValue
                  passed={
                    exchange.clockMonitored &&
                    exchange.signedRequestAllowed
                  }
                />

                <EvidenceValue
                  passed={
                    exchange.liveAdapterRegistered
                  }
                />

                <span className="font-mono text-text-primary">
                  {exchange.blockers.length}
                </span>
              </div>
            ),
          )}
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-lg border border-border-default">
        {report.gates.map(
          (
            gate,
            index,
          ) => (
            <div
              key={
                gate.key
              }
              className={`flex flex-wrap items-start justify-between gap-3 bg-panel-light p-4 ${
                index !==
                  report.gates.length -
                    1
                  ? "border-b border-border-default"
                  : ""
              }`}
            >
              <div>
                <p className="font-mono text-xs font-bold text-text-primary">
                  {gate.key}
                </p>

                <p className="mt-1 text-sm text-text-muted">
                  {gate.message}
                </p>
              </div>

              <span
                className={`rounded-full border px-2 py-1 text-[10px] font-bold ${stateBadgeClass(
                  gate.state,
                )}`}
              >
                {gate.state}
                {gate.requiredForActivationReview
                  ? " · REQUIRED"
                  : " · POST-ACTIVATION"}
              </span>
            </div>
          ),
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-4 text-xs text-text-muted">
        <span>LIVE trading: OFF</span>
        <span>Order submitted: NO</span>
        <span>Capital reserved: NO</span>
        <span>Automatic promotion: DISABLED</span>
      </div>
    </section>
  );
}

function EvidenceValue({
  passed,
}: {
  passed: boolean;
}) {
  return (
    <span
      className={`w-fit rounded-full border px-2 py-1 font-mono text-[10px] font-bold ${
        passed
          ? "border-success/30 bg-success/10 text-success"
          : "border-danger/30 bg-danger/10 text-danger"
      }`}
    >
      {passed
        ? "PASS"
        : "BLOCKED"}
    </span>
  );
}
