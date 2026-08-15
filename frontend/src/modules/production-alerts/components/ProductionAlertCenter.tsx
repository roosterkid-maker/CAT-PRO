import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  CircleAlert,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";

import {
  useMemo,
  useState,
} from "react";

import {
  useAcknowledgeProductionAlert,
  useProductionAlertHistory,
  useProductionAlerts,
  useResolveProductionAlert,
} from "../hooks/useProductionAlerts";

import type {
  ProductionAlertHistoryRecord,
  ProductionAlertLifecycleStatus,
  ProductionAlertReport,
  ProductionAlertSeverity,
} from "../types/ProductionAlerts";

type HistoryFilter =
  | "ALL"
  | ProductionAlertLifecycleStatus;

export default function ProductionAlertCenter() {
  const currentQuery =
    useProductionAlerts();

  const historyQuery =
    useProductionAlertHistory();

  const acknowledgeMutation =
    useAcknowledgeProductionAlert();

  const resolveMutation =
    useResolveProductionAlert();

  const [
    filter,
    setFilter,
  ] =
    useState<HistoryFilter>(
      "ALL",
    );

  const [
    selectedKey,
    setSelectedKey,
  ] =
    useState<string | null>(
      null,
    );

  const [
    note,
    setNote,
  ] =
    useState("");

  const [
    resolutionNote,
    setResolutionNote,
  ] =
    useState("");

  const [
    evidenceReviewed,
    setEvidenceReviewed,
  ] =
    useState(false);

  const current =
    currentQuery.data?.data;

  const history =
    historyQuery.data?.data;

  const selected =
    history?.alerts.find(
      (
        alert,
      ) =>
        alert.key ===
        selectedKey,
    ) ?? null;

  const filtered =
    useMemo(
      () =>
        (
          history?.alerts ??
          []
        )
          .filter(
            (
              alert,
            ) =>
              filter ===
                "ALL" ||
              alert.status ===
                filter,
          )
          .sort(
            (
              first,
              second,
            ) =>
              second.lastDetectedAt -
              first.lastDetectedAt,
          ),
      [
        filter,
        history?.alerts,
      ],
    );

  const unresolvedCritical =
    useMemo(
      () =>
        (
          history?.alerts ??
          []
        ).filter(
          (
            alert,
          ) =>
            alert.severity ===
              "CRITICAL" &&
            alert.status !==
              "RESOLVED" &&
            alert
              .blocksFutureLiveTrading,
        ),
      [
        history?.alerts,
      ],
    );

  const activeCritical =
    unresolvedCritical.filter(
      (
        alert,
      ) =>
        alert.conditionActive,
    );

  const readyForResolution =
    unresolvedCritical.filter(
      (
        alert,
      ) =>
        !alert.conditionActive,
    );

  const selectForReview = (
    alert:
      ProductionAlertHistoryRecord,
  ) => {
    setSelectedKey(
      alert.key,
    );

    setNote(
      alert.acknowledgementNote ??
        "",
    );

    setResolutionNote(
      alert.resolutionNote ??
        "",
    );

    setEvidenceReviewed(
      false,
    );

    window.requestAnimationFrame(
      () => {
        document
          .getElementById(
            "production-alert-operator-review",
          )
          ?.scrollIntoView({
            behavior:
              "smooth",

            block:
              "start",
          });
      },
    );
  };

  const refreshing =
    currentQuery.isFetching ||
    historyQuery.isFetching;

  const refreshAll =
    async () => {
      await Promise.all([
        currentQuery.refetch(),
        historyQuery.refetch(),
      ]);
    };

  const mutationError =
    acknowledgeMutation.error ??
    resolveMutation.error;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border-default bg-panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-success">
              <BellRing className="size-4" />

              <p className="text-xs font-semibold uppercase tracking-[0.18em]">
                Production Alerts
              </p>
            </div>

            <h2 className="mt-2 text-2xl font-bold text-text-primary">
              Persistent Alert
              Lifecycle
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">
              Current V18
              production alerts
              and persistent OPEN
              → ACKNOWLEDGED →
              RESOLVED history.
              Acknowledgement
              records operator
              review; resolution
              is allowed only
              after the
              underlying
              condition is
              inactive.
            </p>
          </div>

          <button
            type="button"
            disabled={
              refreshing
            }
            onClick={() =>
              void refreshAll()
            }
            className="inline-flex items-center gap-2 rounded-md border border-border-default bg-panel-light px-3 py-2 text-xs font-semibold text-text-primary disabled:opacity-60"
          >
            <RefreshCw
              className={`size-4 ${
                refreshing
                  ? "animate-spin"
                  : ""
              }`}
            />

            Refresh
          </button>
        </div>

        {current ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Metric
              label="System State"
              value={
                current.systemState
              }
              severity={
                current.systemState ===
                "OK"
                  ? "INFO"
                  : current.systemState ===
                      "ATTENTION"
                    ? "WARNING"
                    : "CRITICAL"
              }
            />

            <Metric
              label="Current Alerts"
              value={String(
                current.summary
                  .totalAlerts,
              )}
              severity={
                current.summary
                  .totalAlerts ===
                0
                  ? "INFO"
                  : "WARNING"
              }
            />

            <Metric
              label="Critical"
              value={String(
                current.summary
                  .critical,
              )}
              severity={
                current.summary
                  .critical >
                0
                  ? "CRITICAL"
                  : "INFO"
              }
            />

            <Metric
              label="LIVE Blocking"
              value={String(
                current.summary
                  .liveBlockingAlerts,
              )}
              severity={
                current.summary
                  .liveBlockingAlerts >
                0
                  ? "CRITICAL"
                  : "INFO"
              }
            />

            <Metric
              label="Manual Review"
              value={String(
                current.summary
                  .manualReviewAlerts,
              )}
              severity={
                current.summary
                  .manualReviewAlerts >
                0
                  ? "WARNING"
                  : "INFO"
              }
            />
          </div>
        ) : (
          <Unavailable text="Current production-alert report unavailable." />
        )}
      </section>

      {history ? (
        <section className="rounded-xl border border-border-default bg-panel p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-brand">
                <ShieldAlert className="size-4" />

                <p className="text-xs font-semibold uppercase tracking-[0.18em]">
                  V93 P0 Closure Queue
                </p>
              </div>

              <h3 className="mt-2 text-xl font-bold text-text-primary">
                LIVE-blocking alert reconciliation
              </h3>

              <p className="mt-2 max-w-4xl text-sm leading-6 text-text-muted">
                Current conditions and persisted history are evaluated separately.
                An inactive historical CRITICAL record still blocks future LIVE review
                until you inspect its evidence and record an explicit resolution note.
              </p>
            </div>

            <LifecycleBadge
              status={
                unresolvedCritical.length ===
                0
                  ? "RESOLVED"
                  : "OPEN"
              }
            />
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <ClosureMetric
              label="Active CRITICAL"
              value={
                activeCritical.length
              }
              tone={
                activeCritical.length >
                0
                  ? "danger"
                  : "success"
              }
            />

            <ClosureMetric
              label="Cleared / note pending"
              value={
                readyForResolution.length
              }
              tone={
                readyForResolution.length >
                0
                  ? "warning"
                  : "success"
              }
            />

            <ClosureMetric
              label="History persistence"
              value={
                history.persistenceHealthy
                  ? "HEALTHY"
                  : "UNHEALTHY"
              }
              tone={
                history.persistenceHealthy
                  ? "success"
                  : "danger"
              }
            />
          </div>

          {activeCritical.length >
          0 ? (
            <div className="mt-4 rounded-lg border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
              {activeCritical.length}{" "}
              active CRITICAL condition(s) must be fixed before resolution is allowed.
            </div>
          ) : null}

          {readyForResolution.length >
          0 ? (
            <div className="mt-4 space-y-3">
              {readyForResolution.map(
                (
                  alert,
                ) => (
                  <div
                    key={
                      alert.key
                    }
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/20 bg-warning/5 p-4"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-success/30 bg-success/10 px-2 py-1 text-[10px] font-semibold text-success">
                          CONDITION CLEARED
                        </span>

                        <span className="font-mono text-[10px] text-text-muted">
                          {
                            alert.source
                          }
                        </span>
                      </div>

                      <p className="mt-2 font-semibold text-text-primary">
                        {
                          alert.title
                        }
                      </p>

                      <p className="mt-1 font-mono text-[10px] text-text-muted">
                        {
                          alert.key
                        }
                      </p>

                      <p className="mt-2 text-xs text-text-muted">
                        {describeCurrentEvidence(
                          alert,
                          current,
                        )}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        selectForReview(
                          alert,
                        )
                      }
                      className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs font-semibold text-warning"
                    >
                      Review evidence
                    </button>
                  </div>
                ),
              )}
            </div>
          ) : unresolvedCritical.length ===
            0 ? (
            <div className="mt-4 flex gap-2 rounded-lg border border-success/30 bg-success/10 p-4 text-sm text-success">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />

              No unresolved CRITICAL alert remains in persistent history.
            </div>
          ) : null}

          <p className="mt-4 text-xs leading-5 text-text-muted">
            Alert resolution changes only the persisted alert lifecycle. It never
            cancels, resumes, hedges, unwinds or submits an exchange order.
          </p>
        </section>
      ) : null}

      {current &&
      current.alerts.length >
        0 ? (
        <section className="rounded-xl border border-border-default bg-panel p-5">
          <h3 className="text-lg font-bold text-text-primary">
            Active Conditions
          </h3>

          <div className="mt-4 space-y-3">
            {current.alerts.map(
              (
                alert,
              ) => (
                <div
                  key={
                    alert.key
                  }
                  className="rounded-lg border border-border-default bg-panel-light p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <SeverityBadge
                          severity={
                            alert.severity
                          }
                        />

                        <span className="font-mono text-xs text-text-muted">
                          {
                            alert.source
                          }
                        </span>
                      </div>

                      <h4 className="mt-2 font-semibold text-text-primary">
                        {
                          alert.title
                        }
                      </h4>

                      <p className="mt-1 text-sm text-text-muted">
                        {
                          alert.message
                        }
                      </p>
                    </div>

                    <div className="text-right text-xs text-text-muted">
                      <p>
                        {formatDate(
                          alert.detectedAt,
                        )}
                      </p>

                      {alert.blocksFutureLiveTrading ? (
                        <p className="mt-1 font-semibold text-danger">
                          BLOCKS LIVE
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              ),
            )}
          </div>
        </section>
      ) : null}

      <section className="rounded-xl border border-border-default bg-panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
              Persistent History
            </p>

            <h3 className="mt-1 text-xl font-bold text-text-primary">
              Alert Records
            </h3>
          </div>

          <div className="flex flex-wrap gap-2">
            {(
              [
                "ALL",
                "OPEN",
                "ACKNOWLEDGED",
                "RESOLVED",
              ] as HistoryFilter[]
            ).map(
              (
                item,
              ) => (
                <button
                  key={
                    item
                  }
                  type="button"
                  onClick={() =>
                    setFilter(
                      item,
                    )
                  }
                  className={`rounded-md border px-3 py-2 text-xs font-semibold ${
                    filter ===
                    item
                      ? "border-brand/50 bg-brand/10 text-brand"
                      : "border-border-default bg-panel-light text-text-muted"
                  }`}
                >
                  {item}
                </button>
              ),
            )}
          </div>
        </div>

        {history ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <HistoryMetric
              label="Open"
              value={
                history.summary
                  .open
              }
            />

            <HistoryMetric
              label="Acknowledged"
              value={
                history.summary
                  .acknowledged
              }
            />

            <HistoryMetric
              label="Resolved"
              value={
                history.summary
                  .resolved
              }
            />

            <HistoryMetric
              label="Unresolved Critical"
              value={
                history.summary
                  .unresolvedCritical
              }
            />
          </div>
        ) : null}

        <div className="mt-5 overflow-x-auto rounded-lg border border-border-default">
          <table className="w-full min-w-[1050px] text-left text-xs">
            <thead className="bg-panel-light text-text-muted">
              <tr>
                <th className="px-4 py-3">
                  Alert
                </th>

                <th className="px-4 py-3">
                  Severity
                </th>

                <th className="px-4 py-3">
                  Status
                </th>

                <th className="px-4 py-3">
                  Condition
                </th>

                <th className="px-4 py-3 text-right">
                  Occurrences
                </th>

                <th className="px-4 py-3">
                  Last Detected
                </th>

                <th className="px-4 py-3">
                  Action
                </th>
              </tr>
            </thead>

            <tbody>
              {filtered.length ===
              0 ? (
                <tr>
                  <td
                    colSpan={
                      7
                    }
                    className="px-4 py-10 text-center text-text-muted"
                  >
                    No alert
                    records match
                    this filter.
                  </td>
                </tr>
              ) : (
                filtered.map(
                  (
                    alert,
                  ) => (
                    <tr
                      key={
                        alert.key
                      }
                      className="border-t border-border-default"
                    >
                      <td className="px-4 py-3">
                        <p className="font-semibold text-text-primary">
                          {
                            alert.title
                          }
                        </p>

                        <p className="mt-1 font-mono text-[10px] text-text-muted">
                          {
                            alert.key
                          }
                        </p>
                      </td>

                      <td className="px-4 py-3">
                        <SeverityBadge
                          severity={
                            alert.severity
                          }
                        />
                      </td>

                      <td className="px-4 py-3">
                        <LifecycleBadge
                          status={
                            alert.status
                          }
                        />
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={
                            alert.conditionActive
                              ? "font-semibold text-danger"
                              : "font-semibold text-success"
                          }
                        >
                          {alert.conditionActive
                            ? "ACTIVE"
                            : "INACTIVE"}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-right font-mono">
                        {
                          alert.occurrenceCount
                        }
                      </td>

                      <td className="px-4 py-3 text-text-muted">
                        {formatDate(
                          alert.lastDetectedAt,
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() =>
                            selectForReview(
                              alert,
                            )
                          }
                          className="rounded-md border border-border-default bg-panel-light px-3 py-1.5 font-semibold text-text-primary"
                        >
                          Review
                        </button>
                      </td>
                    </tr>
                  ),
                )
              )}
            </tbody>
          </table>
        </div>

        {history ? (
          <div className="mt-4 rounded-lg border border-border-default bg-panel-light p-4 text-xs text-text-muted">
            <div className="grid gap-2 md:grid-cols-3">
              <span>
                Persistence:{" "}
                <strong
                  className={
                    history.persistenceHealthy
                      ? "text-success"
                      : "text-danger"
                  }
                >
                  {history.persistenceHealthy
                    ? "HEALTHY"
                    : "UNHEALTHY"}
                </strong>
              </span>

              <span>
                Writes:{" "}
                <strong className="text-text-primary">
                  {
                    history.persistence
                      .writes
                  }
                </strong>
              </span>

              <span>
                Write failures:{" "}
                <strong
                  className={
                    history.persistence
                      .writeFailures >
                    0
                      ? "text-danger"
                      : "text-text-primary"
                  }
                >
                  {
                    history.persistence
                      .writeFailures
                  }
                </strong>
              </span>
            </div>
          </div>
        ) : null}
      </section>

      {selected ? (
        <OperatorReview
          alert={
            selected
          }
          note={
            note
          }
          resolutionNote={
            resolutionNote
          }
          currentEvidence={
            describeCurrentEvidence(
              selected,
              current,
            )
          }
          suggestedResolutionNote={
            buildSuggestedResolutionNote(
              selected,
              current,
            )
          }
          evidenceReviewed={
            evidenceReviewed
          }
          setNote={
            setNote
          }
          setResolutionNote={
            setResolutionNote
          }
          setEvidenceReviewed={
            setEvidenceReviewed
          }
          acknowledgePending={
            acknowledgeMutation.isPending
          }
          resolvePending={
            resolveMutation.isPending
          }
          onAcknowledge={() =>
            acknowledgeMutation.mutate({
              key:
                selected.key,

              note,
            })
          }
          onResolve={() =>
            resolveMutation.mutate({
              key:
                selected.key,

              resolutionNote,
            }, {
              onSuccess: () => {
                setEvidenceReviewed(
                  false,
                );
              },
            })
          }
        />
      ) : null}

      {mutationError ? (
        <div className="rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
          {mutationError instanceof Error
            ? mutationError.message
            : "Unable to update production alert lifecycle."}
        </div>
      ) : null}
    </div>
  );
}

function OperatorReview({
  alert,
  note,
  resolutionNote,
  currentEvidence,
  suggestedResolutionNote,
  evidenceReviewed,
  setNote,
  setResolutionNote,
  setEvidenceReviewed,
  acknowledgePending,
  resolvePending,
  onAcknowledge,
  onResolve,
}: {
  alert: ProductionAlertHistoryRecord;

  note: string;

  resolutionNote: string;

  currentEvidence: string;

  suggestedResolutionNote: string;

  evidenceReviewed: boolean;

  setNote: (
    value: string,
  ) => void;

  setResolutionNote: (
    value: string,
  ) => void;

  setEvidenceReviewed: (
    value: boolean,
  ) => void;

  acknowledgePending: boolean;

  resolvePending: boolean;

  onAcknowledge: () => void;

  onResolve: () => void;
}) {
  const canAcknowledge =
    alert.status ===
    "OPEN";

  const canResolve =
    alert.status !==
      "RESOLVED" &&
    !alert.conditionActive &&
    evidenceReviewed &&
    resolutionNote
      .trim()
      .length >
      0;

  return (
    <section
      id="production-alert-operator-review"
      className="scroll-mt-24 rounded-xl border border-border-default bg-panel p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
            Operator Review
          </p>

          <h3 className="mt-1 text-xl font-bold text-text-primary">
            {alert.title}
          </h3>

          <p className="mt-2 max-w-3xl text-sm text-text-muted">
            {
              alert.message
            }
          </p>
        </div>

        <div className="flex gap-2">
          <SeverityBadge
            severity={
              alert.severity
            }
          />

          <LifecycleBadge
            status={
              alert.status
            }
          />
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <div className="rounded-lg border border-border-default bg-panel-light p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-text-muted">
            Current source evidence
          </p>

          <p className="mt-3 text-sm leading-6 text-text-primary">
            {
              currentEvidence
            }
          </p>
        </div>

        <div className="rounded-lg border border-border-default bg-panel-light p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-text-muted">
            Persisted metadata
          </p>

          <div className="mt-3 space-y-2">
            {Object.entries(
              alert.metadata,
            ).length ===
            0 ? (
              <p className="text-sm text-text-muted">
                No metadata was persisted.
              </p>
            ) : (
              Object.entries(
                alert.metadata,
              ).map(
                ([
                  key,
                  value,
                ]) => (
                  <div
                    key={
                      key
                    }
                    className="flex items-start justify-between gap-4 text-xs"
                  >
                    <span className="font-mono text-text-muted">
                      {key}
                    </span>

                    <span className="max-w-[65%] break-all text-right font-mono text-text-primary">
                      {formatMetadataValue(
                        value,
                      )}
                    </span>
                  </div>
                ),
              )
            )}
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <div className="rounded-lg border border-border-default bg-panel-light p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-text-muted">
            Acknowledge
          </p>

          <textarea
            value={
              note
            }
            onChange={(
              event,
            ) =>
              setNote(
                event.target.value,
              )
            }
            disabled={
              !canAcknowledge ||
              acknowledgePending
            }
            placeholder="Optional operator review note"
            className="mt-3 min-h-24 w-full rounded-md border border-border-default bg-panel p-3 text-sm text-text-primary outline-none"
          />

          <button
            type="button"
            disabled={
              !canAcknowledge ||
              acknowledgePending
            }
            onClick={
              onAcknowledge
            }
            className="mt-3 rounded-md border border-brand/40 bg-brand/10 px-3 py-2 text-sm font-semibold text-brand disabled:cursor-not-allowed disabled:opacity-50"
          >
            {acknowledgePending
              ? "Acknowledging..."
              : alert.status ===
                  "OPEN"
                ? "Acknowledge Alert"
                : "Already Acknowledged"}
          </button>
        </div>

        <div className="rounded-lg border border-border-default bg-panel-light p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-text-muted">
              Explicit Resolution
            </p>

            {alert.status !==
            "RESOLVED" ? (
              <button
                type="button"
                onClick={() =>
                  setResolutionNote(
                    suggestedResolutionNote,
                  )
                }
                className="rounded-md border border-border-default bg-panel px-2 py-1 text-[10px] font-semibold text-text-muted"
              >
                Insert evidence note
              </button>
            ) : null}
          </div>

          {alert.conditionActive ? (
            <div className="mt-3 flex gap-2 rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" />

              Underlying
              condition is still
              active. Resolution
              is locked.
            </div>
          ) : (
            <div className="mt-3 flex gap-2 rounded-md border border-success/30 bg-success/10 p-3 text-sm text-success">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />

              Condition is
              inactive.
              Evidence-backed
              manual resolution
              may be recorded.
            </div>
          )}

          <textarea
            value={
              resolutionNote
            }
            onChange={(
              event,
            ) =>
              setResolutionNote(
                event.target.value,
              )
            }
            disabled={
              alert.status ===
                "RESOLVED" ||
              resolvePending
            }
            placeholder="Required: explain why the underlying condition is verified clear"
            className="mt-3 min-h-24 w-full rounded-md border border-border-default bg-panel p-3 text-sm text-text-primary outline-none"
          />

          <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs leading-5 text-text-muted">
            <input
              type="checkbox"
              checked={
                evidenceReviewed
              }
              onChange={(
                event,
              ) =>
                setEvidenceReviewed(
                  event.target
                    .checked,
                )
              }
              disabled={
                alert.conditionActive ||
                alert.status ===
                  "RESOLVED" ||
                resolvePending
              }
              className="mt-1"
            />

            I reviewed the current source evidence and persisted metadata for this exact alert record.
          </label>

          <button
            type="button"
            disabled={
              !canResolve ||
              resolvePending
            }
            onClick={
              onResolve
            }
            className="mt-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm font-semibold text-danger disabled:cursor-not-allowed disabled:opacity-50"
          >
            {resolvePending
              ? "Resolving..."
              : alert.status ===
                  "RESOLVED"
                ? "Resolved"
                : "Resolve Inactive Alert"}
          </button>
        </div>
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  severity,
}: {
  label: string;

  value: string;

  severity:
    ProductionAlertSeverity;
}) {
  return (
    <div className="rounded-lg border border-border-default bg-panel-light p-4">
      <p className="text-xs uppercase tracking-[0.14em] text-text-muted">
        {label}
      </p>

      <div className="mt-2 flex items-center gap-2">
        {severity ===
        "CRITICAL" ? (
          <ShieldAlert className="size-4 text-danger" />
        ) : severity ===
          "WARNING" ? (
          <AlertTriangle className="size-4 text-warning" />
        ) : (
          <CheckCircle2 className="size-4 text-success" />
        )}

        <p className="font-mono text-lg font-bold text-text-primary">
          {value}
        </p>
      </div>
    </div>
  );
}

function HistoryMetric({
  label,
  value,
}: {
  label: string;

  value: number;
}) {
  return (
    <div className="rounded-lg border border-border-default bg-panel-light p-3">
      <p className="text-xs text-text-muted">
        {label}
      </p>

      <p className="mt-1 text-xl font-bold text-text-primary">
        {value}
      </p>
    </div>
  );
}

function SeverityBadge({
  severity,
}: {
  severity:
    ProductionAlertSeverity;
}) {
  const style =
    severity ===
    "CRITICAL"
      ? "border-danger/30 bg-danger/10 text-danger"
      : severity ===
          "WARNING"
        ? "border-warning/30 bg-warning/10 text-warning"
        : "border-brand/30 bg-brand/10 text-brand";

  return (
    <span
      className={`rounded-full border px-2 py-1 text-[10px] font-bold ${style}`}
    >
      {severity}
    </span>
  );
}

function LifecycleBadge({
  status,
}: {
  status:
    ProductionAlertLifecycleStatus;
}) {
  const style =
    status ===
    "RESOLVED"
      ? "border-success/30 bg-success/10 text-success"
      : status ===
          "ACKNOWLEDGED"
        ? "border-brand/30 bg-brand/10 text-brand"
        : "border-warning/30 bg-warning/10 text-warning";

  return (
    <span
      className={`rounded-full border px-2 py-1 text-[10px] font-bold ${style}`}
    >
      {status}
    </span>
  );
}

function Unavailable({
  text,
}: {
  text: string;
}) {
  return (
    <div className="mt-5 flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
      <CircleAlert className="size-4" />

      {text}
    </div>
  );
}

function formatDate(
  timestamp: number,
): string {
  return new Date(
    timestamp,
  ).toLocaleString();
}

function ClosureMetric({
  label,
  value,
  tone,
}: {
  label: string;

  value:
    string |
    number;

  tone:
    | "success"
    | "warning"
    | "danger";
}) {
  const toneClass =
    tone ===
    "success"
      ? "text-success"
      : tone ===
          "warning"
        ? "text-warning"
        : "text-danger";

  return (
    <div className="rounded-lg border border-border-default bg-panel-light p-4">
      <p className="text-xs uppercase tracking-[0.14em] text-text-muted">
        {label}
      </p>

      <p className={`mt-2 font-mono text-xl font-bold ${toneClass}`}>
        {value}
      </p>
    </div>
  );
}

function describeCurrentEvidence(
  alert:
    ProductionAlertHistoryRecord,
  current:
    ProductionAlertReport |
    undefined,
): string {
  if (
    !current
  ) {
    return "Current production-alert evidence is unavailable; refresh before resolution.";
  }

  const exactCurrent =
    current.alerts.find(
      (
        item,
      ) =>
        item.key ===
        alert.key,
    );

  if (
    exactCurrent
  ) {
    return `Matching current condition is ACTIVE: ${exactCurrent.message}`;
  }

  switch (
    alert.source
  ) {
    case "RESTART_RECOVERY":
      return `No matching current CRITICAL alert. Restart-recovery classification is ${current.sourceStates.restartRecovery}.`;

    case "ORDER_PERSISTENCE":
      return `No matching current CRITICAL alert. Current duplicate-submission risk is ${current.sourceStates.duplicateSubmissionRisk ? "DETECTED" : "NOT DETECTED"}.`;

    case "CLOCK_SAFETY":
      return `No matching current CRITICAL alert. Current signed-request clock fleet state is ${current.sourceStates.clockHealthy ? "HEALTHY" : "NOT HEALTHY"}.`;

    case "CREDENTIAL_SAFETY":
      return `No matching current CRITICAL alert. Current credential-configuration state is ${current.sourceStates.credentialConfigurationHealthy ? "HEALTHY" : "NOT HEALTHY"}.`;

    case "EXECUTION_HEALTH":
      return `No matching current CRITICAL alert. Current execution-health state is ${current.sourceStates.executionHealth}.`;

    case "SESSION_PERSISTENCE":
      return `No matching current CRITICAL alert. Current session-recovery-required state is ${current.sourceStates.sessionRecoveryRequired ? "YES" : "NO"}.`;

    case "SETTLEMENT_ACCOUNTING":
      return `No matching current CRITICAL alert. Current accounting-uncertain count is ${current.sourceStates.accountingUncertain}.`;

    default:
      return "No matching current alert condition is emitted by the production monitor.";
  }
}

function buildSuggestedResolutionNote(
  alert:
    ProductionAlertHistoryRecord,
  current:
    ProductionAlertReport |
    undefined,
): string {
  return [
    `Reviewed persisted alert ${alert.key}.`,
    describeCurrentEvidence(
      alert,
      current,
    ),
    "The historical condition is inactive and its persisted metadata was reviewed.",
    "This lifecycle resolution performs no exchange or trading action.",
  ].join(
    " ",
  );
}

function formatMetadataValue(
  value: unknown,
): string {
  if (
    value ===
      null ||
    value ===
      undefined
  ) {
    return "N/A";
  }

  if (
    typeof value ===
      "string" ||
    typeof value ===
      "number" ||
    typeof value ===
      "boolean"
  ) {
    return String(
      value,
    );
  }

  try {
    return JSON.stringify(
      value,
    );
  } catch {
    return "[unavailable]";
  }
}
