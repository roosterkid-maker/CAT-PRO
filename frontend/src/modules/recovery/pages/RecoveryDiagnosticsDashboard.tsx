import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Fingerprint,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

import {
  useMemo,
  useState,
} from "react";

import {
  useApproveStrategyOneResidualRecovery,
  useExecuteStrategyOneConfirmedRejectSecondAttempt,
  useExecuteStrategyOneResidualRecovery,
  useInspectStrategyOneResidualRecovery,
  useOrderLifecyclePersistence,
  useRecoveryOverview,
  useResolveDurableRecovery,
  useRuntimeRecovery,
  useSettlementAccountingPersistence,
  useStrategyOneResidualExecutionDiagnostics,
} from "../hooks/useRecoveryDiagnostics";

import type {
  RecoveryResolutionRecord,
  RestartRecoveryFinding,
} from "../types/RecoveryDiagnostics";

export default function RecoveryDiagnosticsDashboard() {
  const overviewQuery =
    useRecoveryOverview();

  const runtimeQuery =
    useRuntimeRecovery();

  const lifecycleQuery =
    useOrderLifecyclePersistence();

  const accountingQuery =
    useSettlementAccountingPersistence();

  const residualExecutionQuery =
    useStrategyOneResidualExecutionDiagnostics();

  const resolveMutation =
    useResolveDurableRecovery();

  const inspectResidualMutation =
    useInspectStrategyOneResidualRecovery();

  const approveResidualMutation =
    useApproveStrategyOneResidualRecovery();

  const executeResidualMutation =
    useExecuteStrategyOneResidualRecovery();

  const executeSecondAttemptMutation =
    useExecuteStrategyOneConfirmedRejectSecondAttempt();

  const [
    selectedSessionId,
    setSelectedSessionId,
  ] =
    useState<string | null>(
      null,
    );

  const [
    resolutionNote,
    setResolutionNote,
  ] =
    useState("");

  const [
    residualApprovalDraft,
    setResidualApprovalDraft,
  ] = useState<{
    readonly requiredPhrase: string | null;
    readonly value: string;
  }>({
    requiredPhrase: null,
    value: "",
  });

  const [
    residualLossCap,
    setResidualLossCap,
  ] = useState("0.55");

  const [
    residualLossAuthorization,
    setResidualLossAuthorization,
  ] = useState("");

  const [
    residualExecutionConfirmation,
    setResidualExecutionConfirmation,
  ] = useState("");

  const [
    residualExecutionNote,
    setResidualExecutionNote,
  ] = useState("");

  const [
    residualExecutionAcknowledged,
    setResidualExecutionAcknowledged,
  ] = useState(false);

  const overview =
    overviewQuery.data?.data;

  const runtime =
    runtimeQuery.data?.data;

  const lifecycle =
    lifecycleQuery.data?.data
      .evidence;

  const accounting =
    accountingQuery.data?.data
      .persistence;

  const refreshing =
    overviewQuery.isFetching ||
    runtimeQuery.isFetching ||
    lifecycleQuery.isFetching ||
    accountingQuery.isFetching ||
    residualExecutionQuery.isFetching;

  const partialEvidence =
    overviewQuery.isError ||
    runtimeQuery.isError ||
    lifecycleQuery.isError ||
    accountingQuery.isError ||
    residualExecutionQuery.isError;

  const sessionIds =
    useMemo(
      () =>
        Array.from(
          new Set(
            (
              overview
                ?.recoveryGate
                .findings ??
              []
            )
              .map(
                (
                  finding,
                ) =>
                  finding.sessionId,
              )
              .filter(
                (
                  value,
                ): value is string =>
                  Boolean(
                    value,
                  ),
              ),
          ),
        ),
      [
        overview?.recoveryGate
          .findings,
      ],
    );

  const selectedResolution =
    overview?.resolutions.resolutions.find(
      (
        resolution,
      ) =>
        resolution.sessionId ===
        selectedSessionId,
    ) ?? null;

  const residualPreview =
    approveResidualMutation.data?.data ??
    inspectResidualMutation.data?.data ??
    null;

  const residualApprovalConfirmation =
    residualApprovalDraft.requiredPhrase ===
      residualPreview?.requiredApprovalPhrase
      ? residualApprovalDraft.value
      : "";

  const residualLossBlocked =
    residualPreview?.state === "BLOCKED" &&
    residualPreview.blockers.some((blocker) =>
      blocker.startsWith("Estimated recovery loss "));

  const parsedResidualLossCap = Number(residualLossCap);

  const residualLossCapIsValid =
    Number.isFinite(parsedResidualLossCap) &&
    parsedResidualLossCap > 0 &&
    parsedResidualLossCap <= 1;

  const requiredResidualLossAuthorization =
    residualLossBlocked &&
    residualPreview?.residual.side &&
    residualPreview.residual.exactQuantity > 0 &&
    residualLossCapIsValid
      ? `APPROVE ONE-TIME ${residualPreview.market.endsWith("USDT")
        ? residualPreview.market.slice(0, -4)
        : residualPreview.market} RECOVERY ${residualPreview.residual.side} ${formatApprovalNumber(
        residualPreview.residual.exactQuantity,
      )} MAX LOSS ${parsedResidualLossCap.toFixed(2)} USDT`
      : "";

  const confirmedRejectSecondAttempt =
    residualExecutionQuery.data?.data
      .confirmedRejectSecondAttempts
      .find((item) =>
        item.sessionId === selectedSessionId && item.eligible) ??
    null;

  const residualExecutionHistory =
    residualExecutionQuery.data?.data.records
      .filter((record) => record.sessionId === selectedSessionId) ??
    [];

  const blockedSecondAttemptAssessment =
    residualExecutionQuery.data?.data
      .confirmedRejectSecondAttempts
      .find((item) =>
        item.sessionId === selectedSessionId && !item.eligible) ??
    null;

  const residualExecutionBoundaryAvailable =
    confirmedRejectSecondAttempt !== null ||
    residualExecutionHistory.length === 0;

  const requiredResidualExecutionPhrase =
    residualPreview && residualExecutionBoundaryAvailable
    ? confirmedRejectSecondAttempt
      ? `EXECUTE CONFIRMED-REJECT SECOND ATTEMPT ${confirmedRejectSecondAttempt.priorExecutionId} ${residualPreview.id}`
      : `EXECUTE ONE-TIME RECOVERY ${residualPreview.id}`
    : "";

  const selectRecoverySession = (sessionId: string | null) => {
    setSelectedSessionId(sessionId);
    inspectResidualMutation.reset();
    approveResidualMutation.reset();
    executeResidualMutation.reset();
    executeSecondAttemptMutation.reset();
    setResidualApprovalDraft({
      requiredPhrase: null,
      value: "",
    });
    setResidualLossAuthorization("");
    setResidualExecutionConfirmation("");
    setResidualExecutionNote("");
    setResidualExecutionAcknowledged(false);
  };

  const refreshAll =
    async () => {
      await Promise.all([
        overviewQuery.refetch(),
        runtimeQuery.refetch(),
        lifecycleQuery.refetch(),
        accountingQuery.refetch(),
        residualExecutionQuery.refetch(),
      ]);
    };

  if (
    overviewQuery.isPending &&
    !overview
  ) {
    return (
      <section className="rounded-xl border border-border-default bg-panel p-6">
        <div className="flex items-center gap-3 text-text-muted">
          <RefreshCw className="size-5 animate-spin" />

          Loading restart-recovery
          evidence...
        </div>
      </section>
    );
  }

  if (!overview) {
    return (
      <section className="rounded-xl border border-danger/30 bg-panel p-6">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 size-6 text-danger" />

          <div>
            <h1 className="text-xl font-bold text-danger">
              Recovery evidence
              unavailable
            </h1>

            <p className="mt-2 text-sm text-text-muted">
              Durable
              restart-recovery
              evidence could not be
              verified. Missing
              evidence is not treated
              as clean.
            </p>

            <button
              type="button"
              onClick={() =>
                void refreshAll()
              }
              className="mt-4 inline-flex items-center gap-2 rounded-md border border-border-default bg-panel-light px-3 py-2 text-sm font-semibold text-text-primary"
            >
              <RefreshCw className="size-4" />

              Retry
            </button>
          </div>
        </div>
      </section>
    );
  }

  const gate =
    overview.recoveryGate;

  const resolutions =
    overview.resolutions;

  return (
    <section className="space-y-6">
      <section className="rounded-xl border border-border-default bg-panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-success">
              <ShieldCheck className="size-4" />

              <p className="text-xs font-semibold uppercase tracking-[0.18em]">
                Recovery Diagnostics
              </p>
            </div>

            <h1 className="mt-2 text-3xl font-bold text-text-primary">
              Restart & Recovery
              Control Surface
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">
              Durable restart
              evidence,
              duplicate-order
              protection,
              settlement-accounting
              integrity and explicit
              recovery resolutions.
              Alert resolution does
              not clear recovery
              evidence.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="rounded-full border border-success/30 bg-success/10 px-3 py-1 text-xs font-semibold text-success">
              FAIL CLOSED
            </span>

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
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <HeadlineMetric
            label="Classification"
            value={
              gate.classification
            }
            healthy={
              gate.classification ===
              "CLEAN"
            }
          />

          <HeadlineMetric
            label="Interrupted Sessions"
            value={String(
              gate.summary
                .interruptedRealSessions,
            )}
            healthy={
              gate.summary
                .interruptedRealSessions ===
              0
            }
          />

          <HeadlineMetric
            label="Possible Open Orders"
            value={String(
              gate.summary
                .possibleOpenOrders,
            )}
            healthy={
              gate.summary
                .possibleOpenOrders ===
              0
            }
          />

          <HeadlineMetric
            label="Exposure Sessions"
            value={String(
              gate.summary
                .possibleExposureSessions,
            )}
            healthy={
              gate.summary
                .possibleExposureSessions ===
              0
            }
          />

          <HeadlineMetric
            label="New LIVE Preparation"
            value={
              gate.allowNewLivePreparation
                ? "ALLOWED"
                : "BLOCKED"
            }
            healthy={
              gate.allowNewLivePreparation
            }
          />
        </div>
      </section>

      {partialEvidence ? (
        <section className="rounded-xl border border-warning/30 bg-warning/10 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-5 text-warning" />

            <div>
              <p className="font-semibold text-warning">
                Partial recovery
                evidence unavailable
              </p>

              <p className="mt-1 text-sm text-text-muted">
                One or more
                secondary persistence
                sources could not be
                loaded. Unknown
                evidence remains
                unknown.
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-2">
        <EvidenceCard
          title="Order Lifecycle Persistence"
          icon={
            <Fingerprint className="size-5 text-brand" />
          }
        >
          {lifecycle ? (
            <div className="space-y-3">
              <DataRow
                label="Restored"
                value={yesNo(
                  lifecycle.restored,
                )}
              />

              <DataRow
                label="Restored Real Orders"
                value={String(
                  lifecycle.restoredRealOrders,
                )}
              />

              <DataRow
                label="Possible Submitted Real Orders"
                value={String(
                  lifecycle.possibleSubmittedRealOrders,
                )}
              />

              <DataRow
                label="Duplicate Guard Entries"
                value={String(
                  lifecycle.duplicateGuardEntries,
                )}
              />

              <DataRow
                label="Duplicate Submission Risk"
                value={
                  lifecycle.duplicateSubmissionRisk
                    ? "RISK"
                    : "NONE"
                }
                danger={
                  lifecycle.duplicateSubmissionRisk
                }
              />

              <DataRow
                label="Write Failures"
                value={String(
                  lifecycle.writeFailures,
                )}
                danger={
                  lifecycle.writeFailures >
                  0
                }
              />
            </div>
          ) : (
            <Unavailable />
          )}
        </EvidenceCard>

        <EvidenceCard
          title="Settlement Accounting Persistence"
          icon={
            <Database className="size-5 text-brand" />
          }
        >
          {accounting ? (
            <div className="space-y-3">
              <DataRow
                label="Restored"
                value={yesNo(
                  accounting.restored,
                )}
              />

              <DataRow
                label="Settled Sessions"
                value={String(
                  accounting.settledSessions,
                )}
              />

              <DataRow
                label="Accounting Applied"
                value={String(
                  accounting.accountingApplied,
                )}
              />

              <DataRow
                label="Accounting Uncertain"
                value={String(
                  accounting.accountingUncertain,
                )}
                danger={
                  accounting.accountingUncertain >
                  0
                }
              />

              <DataRow
                label="Duplicate Settlement Protection"
                value={yesNo(
                  accounting.duplicateSettlementProtectionActive,
                )}
              />

              <DataRow
                label="Automatic Replay"
                value={
                  accounting.automaticAccountingReplayAllowed
                    ? "ENABLED"
                    : "DISABLED"
                }
                danger={
                  accounting.automaticAccountingReplayAllowed
                }
              />
            </div>
          ) : (
            <Unavailable />
          )}
        </EvidenceCard>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="rounded-xl border border-border-default bg-panel p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
                Restart Gate
              </p>

              <h2 className="mt-1 text-xl font-bold text-text-primary">
                Findings & Blockers
              </h2>
            </div>

            <span className="font-mono text-xs text-text-muted">
              {
                gate.summary.findings
              }{" "}
              finding(s)
            </span>
          </div>

          {gate.findings.length ===
          0 ? (
            <div className="mt-4 rounded-lg border border-success/30 bg-success/10 p-4 text-sm text-success">
              No restart-recovery
              findings.
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {gate.findings.map(
                (
                  finding,
                ) => (
                  <FindingCard
                    key={`${finding.key}:${finding.sessionId ?? "none"}:${finding.orderId ?? "none"}`}
                    finding={
                      finding
                    }
                    onSelectSession={
                      selectRecoverySession
                    }
                  />
                ),
              )}
            </div>
          )}

          {gate.blockers.length >
          0 ? (
            <div className="mt-5 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-danger">
                Gate Blockers
              </p>

              {gate.blockers.map(
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
          ) : null}
        </div>

        <div className="rounded-xl border border-border-default bg-panel p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
            Runtime Recovery
            Engine
          </p>

          <h2 className="mt-1 text-xl font-bold text-text-primary">
            Incident Monitor
          </h2>

          {runtime ? (
            <div className="mt-4 space-y-3">
              <DataRow
                label="Engine Running"
                value={yesNo(
                  runtime.running,
                )}
              />

              <DataRow
                label="Scans"
                value={runtime.scans.toLocaleString()}
              />

              <DataRow
                label="Sessions Evaluated"
                value={runtime.sessionsEvaluated.toLocaleString()}
              />

              <DataRow
                label="Open Incidents"
                value={String(
                  runtime.openIncidents,
                )}
                danger={
                  runtime.openIncidents >
                  0
                }
              />

              <DataRow
                label="Critical Incidents"
                value={String(
                  runtime.criticalIncidents,
                )}
                danger={
                  runtime.criticalIncidents >
                  0
                }
              />

              <DataRow
                label="Automatic Emergency Submission"
                value={
                  runtime.automaticEmergencySubmissionEnabled
                    ? "ENABLED"
                    : "DISABLED"
                }
                danger={
                  runtime.automaticEmergencySubmissionEnabled
                }
              />
            </div>
          ) : (
            <Unavailable />
          )}
        </div>
      </section>

      <section className="rounded-xl border border-border-default bg-panel p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
              Durable Resolution
              Store
            </p>

            <h2 className="mt-1 text-xl font-bold text-text-primary">
              Evidence-backed
              Recovery Resolutions
            </h2>
          </div>

          <div className="flex gap-2 text-xs">
            <CountBadge
              label="Total"
              value={
                resolutions.totalResolutions
              }
            />

            <CountBadge
              label="Valid"
              value={
                resolutions.currentlyValidResolutions
              }
            />

            <CountBadge
              label="Stale"
              value={
                resolutions.staleResolutions
              }
              warning={
                resolutions.staleResolutions >
                0
              }
            />
          </div>
        </div>

        {resolutions.resolutions
          .length ===
        0 ? (
          <div className="mt-4 rounded-lg border border-border-default bg-panel-light p-4 text-sm text-text-muted">
            No durable recovery
            resolutions recorded
            yet.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-lg border border-border-default">
            <table className="w-full min-w-[900px] text-left text-xs">
              <thead className="bg-panel-light text-text-muted">
                <tr>
                  <th className="px-4 py-3">
                    Session
                  </th>

                  <th className="px-4 py-3">
                    Basis
                  </th>

                  <th className="px-4 py-3">
                    Orders Checked
                  </th>

                  <th className="px-4 py-3">
                    BUY Filled
                  </th>

                  <th className="px-4 py-3">
                    SELL Filled
                  </th>

                  <th className="px-4 py-3">
                    Resolved
                  </th>
                </tr>
              </thead>

              <tbody>
                {resolutions.resolutions.map(
                  (
                    resolution,
                  ) => (
                    <ResolutionRow
                      key={`${resolution.sessionId}:${resolution.evidenceFingerprint}`}
                      resolution={
                        resolution
                      }
                    />
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {sessionIds.length > 0 ? (
        <section className="rounded-xl border border-danger/30 bg-panel p-5">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-1 size-5 shrink-0 text-danger" />

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-danger">
                One-time LIVE residual recovery
              </p>

              <h2 className="mt-1 text-xl font-bold text-text-primary">
                Inspect → approve evidence → execute exact FOK recovery
              </h2>

              <p className="mt-2 max-w-4xl text-sm leading-6 text-text-muted">
                This control can submit one real compensating order only while
                PAPER mode and the emergency stop are active. It journals before
                exchange I/O, uses the approved exact quantity and price limit,
                and never retries, replaces, cancels, transfers or withdraws
                automatically. A partial, cancelled, unknown or fee-incomplete
                result remains blocked.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">
                Unresolved session
              </label>

              <select
                value={selectedSessionId ?? ""}
                onChange={(event) =>
                  selectRecoverySession(event.target.value || null)}
                className="mt-2 w-full rounded-md border border-border-default bg-panel-light p-3 text-sm text-text-primary outline-none"
              >
                <option value="">Select recovery session</option>
                {sessionIds.map((sessionId) => (
                  <option key={sessionId} value={sessionId}>
                    {sessionId}
                  </option>
                ))}
              </select>

              <button
                type="button"
                disabled={!selectedSessionId || inspectResidualMutation.isPending}
                onClick={() => {
                  if (!selectedSessionId) return;
                  approveResidualMutation.reset();
                  executeResidualMutation.reset();
                  executeSecondAttemptMutation.reset();
                  setResidualApprovalDraft({
                    requiredPhrase: null,
                    value: "",
                  });
                  setResidualExecutionConfirmation("");
                  setResidualExecutionAcknowledged(false);
                  inspectResidualMutation.mutate({
                    sessionId: selectedSessionId,
                  });
                }}
                className="mt-3 w-full rounded-md border border-border-default bg-panel-light px-3 py-2 text-sm font-semibold text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                {inspectResidualMutation.isPending
                  ? "Inspecting signed evidence..."
                  : "1. Inspect exact residual"}
              </button>
            </div>

            <div className="space-y-4">
              {residualPreview ? (
                <div className="rounded-lg border border-border-default bg-panel-light p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-xs text-text-muted">
                      {residualPreview.market} · {residualPreview.residual.venue ?? "unknown"}
                    </span>
                    <span className={`rounded-full border px-2 py-1 text-[10px] font-bold ${
                      residualPreview.state === "BLOCKED"
                        ? "border-danger/30 bg-danger/10 text-danger"
                        : "border-success/30 bg-success/10 text-success"
                    }`}>
                      {residualPreview.state}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <DataRow
                      label="Recovery side"
                      value={`${residualPreview.residual.side ?? "—"} ${residualPreview.residual.executableQuantity ?? "—"}`}
                    />
                    <DataRow
                      label="Limit / TIF"
                      value={`${residualPreview.executionPreview.limitPrice ?? "—"} / ${residualPreview.executionPreview.selectedTimeInForce ?? "—"}`}
                    />
                    <DataRow
                      label="Depth fill"
                      value={`${residualPreview.executionPreview.fillPercent ?? "—"}%`}
                    />
                    <DataRow
                      label="Balance"
                      value={`${residualPreview.executionPreview.availableBalance ?? "—"} ${residualPreview.executionPreview.balanceAsset ?? ""}`}
                    />
                  </div>

                  {residualPreview.blockers.length > 0 ? (
                    <div className="mt-4 space-y-2">
                      {residualPreview.blockers.map((blocker) => (
                        <div
                          key={blocker}
                          className="rounded-md border border-danger/20 bg-danger/10 p-3 text-xs text-danger"
                        >
                          {blocker}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {selectedSessionId &&
              residualPreview?.state !== "BALANCED_NO_ACTION" &&
              residualPreview?.state !== "READY_FOR_OPERATOR_REVIEW" &&
              residualPreview?.state !== "OPERATOR_APPROVED_EVIDENCE_ONLY" ? (
                <div className="rounded-lg border border-warning/30 bg-warning/10 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-warning">
                    One-time loss ceiling — inspection only
                  </p>
                  <p className="mt-2 text-xs leading-5 text-text-muted">
                    This does not arm the scanner or place an order. It permits
                    one fresh preview only when the exact session, side,
                    quantity and typed maximum loss match. The hard ceiling is
                    1.00 USDT and execution still requires separate evidence
                    approval plus final LIVE confirmation.
                  </p>

                  <label className="mt-3 block text-xs font-semibold text-text-muted">
                    Maximum accepted recovery loss (USDT)
                  </label>
                  <input
                    type="number"
                    min="0.01"
                    max="1"
                    step="0.01"
                    value={residualLossCap}
                    onChange={(event) => {
                      setResidualLossCap(event.target.value);
                      setResidualLossAuthorization("");
                    }}
                    className="mt-2 w-full rounded-md border border-border-default bg-panel p-3 font-mono text-xs text-text-primary outline-none"
                  />

                  {requiredResidualLossAuthorization ? (
                    <>
                      <p className="mt-3 break-all font-mono text-xs text-text-primary">
                        {requiredResidualLossAuthorization}
                      </p>
                      <input
                        value={residualLossAuthorization}
                        onChange={(event) =>
                          setResidualLossAuthorization(event.target.value)}
                        placeholder="Type the exact one-time loss authorization phrase"
                        className="mt-3 w-full rounded-md border border-border-default bg-panel p-3 font-mono text-xs text-text-primary outline-none"
                      />
                    </>
                  ) : (
                    <p className="mt-3 text-xs leading-5 text-text-muted">
                      Paste the exact operator authorization phrase. The
                      backend derives the required market, side and quantity
                      from the selected unresolved session and rejects any
                      mismatch.
                    </p>
                  )}

                  {!requiredResidualLossAuthorization ? (
                    <input
                      value={residualLossAuthorization}
                      onChange={(event) =>
                        setResidualLossAuthorization(event.target.value)}
                      placeholder="APPROVE ONE-TIME … MAX LOSS … USDT"
                      className="mt-3 w-full rounded-md border border-border-default bg-panel p-3 font-mono text-xs text-text-primary outline-none"
                    />
                  ) : null}

                  <button
                    type="button"
                    disabled={
                      !residualLossCapIsValid ||
                      residualLossAuthorization.trim().length === 0 ||
                      (requiredResidualLossAuthorization.length > 0 &&
                        residualLossAuthorization.trim() !==
                          requiredResidualLossAuthorization) ||
                      inspectResidualMutation.isPending
                    }
                    onClick={() =>
                      inspectResidualMutation.mutate({
                        sessionId: selectedSessionId,
                        maximumLossQuote: parsedResidualLossCap,
                        lossAuthorization:
                          residualLossAuthorization.trim(),
                      })}
                    className="mt-3 rounded-md border border-warning/40 bg-panel px-3 py-2 text-sm font-semibold text-warning disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Re-inspect with exact one-time ceiling
                  </button>
                </div>
              ) : null}

              {residualPreview?.state === "READY_FOR_OPERATOR_REVIEW" &&
              residualPreview.requiredApprovalPhrase ? (
                <div className="rounded-lg border border-warning/30 bg-warning/10 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-warning">
                    Evidence approval only — no order yet
                  </p>
                  <p className="mt-2 break-all font-mono text-xs text-text-primary">
                    {residualPreview.requiredApprovalPhrase}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-text-secondary">
                    This evidence-only preview remains current for 120 seconds.
                    Execution still performs fresh action-time safety checks.
                  </p>
                  <input
                    value={residualApprovalConfirmation}
                    onChange={(event) =>
                      setResidualApprovalDraft({
                        requiredPhrase:
                          residualPreview.requiredApprovalPhrase,
                        value: event.target.value,
                      })}
                    placeholder="Type the exact evidence approval phrase"
                    className="mt-3 w-full rounded-md border border-border-default bg-panel p-3 font-mono text-xs text-text-primary outline-none"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setResidualApprovalDraft({
                        requiredPhrase:
                          residualPreview.requiredApprovalPhrase,
                        value:
                          residualPreview.requiredApprovalPhrase ?? "",
                      })}
                    className="mt-3 rounded-md border border-border-default bg-panel px-3 py-2 text-xs font-semibold text-text-secondary"
                  >
                    Use current exact phrase — fills text only
                  </button>
                  <button
                    type="button"
                    disabled={
                      residualApprovalConfirmation.trim() !==
                        residualPreview.requiredApprovalPhrase ||
                      approveResidualMutation.isPending
                    }
                    onClick={() =>
                      approveResidualMutation.mutate({
                        previewId: residualPreview.id,
                        confirmation: residualApprovalConfirmation.trim(),
                      })}
                    className="ml-2 mt-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm font-semibold text-warning disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {approveResidualMutation.isPending
                      ? "Approving evidence..."
                      : "2. Approve exact recovery evidence"}
                  </button>
                </div>
              ) : null}

              {residualPreview?.state === "OPERATOR_APPROVED_EVIDENCE_ONLY" &&
              residualExecutionBoundaryAvailable ? (
                <div className="rounded-lg border border-danger/40 bg-danger/10 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-danger">
                    Final LIVE submission boundary
                  </p>
                  <p className="mt-2 text-sm leading-6 text-text-primary">
                    The next button can place one real {residualPreview.residual.side}{" "}
                    {residualPreview.residual.executableQuantity} {residualPreview.executionPreview.balanceAsset}{" "}
                    order on {residualPreview.residual.venue}. No automatic retry is permitted.
                  </p>

                  {confirmedRejectSecondAttempt ? (
                    <div className="mt-3 rounded-md border border-warning/30 bg-warning/10 p-3 text-xs leading-5 text-warning">
                      The original request has a deterministic Binance HTTP{" "}
                      {confirmedRejectSecondAttempt.confirmedExchangeHttpStatus}{" "}
                      rejection ({confirmedRejectSecondAttempt.confirmedExchangeCode})
                      with no order ID or fill. This is one separately authorized
                      second attempt with a new durable idempotency key; the original
                      record remains immutable.
                    </div>
                  ) : null}

                  <label className="mt-4 flex items-start gap-3 text-sm text-text-primary">
                    <input
                      type="checkbox"
                      checked={residualExecutionAcknowledged}
                      onChange={(event) =>
                        setResidualExecutionAcknowledged(event.target.checked)}
                      className="mt-1"
                    />
                    <span>
                      I understand this submits one real exact-sized recovery
                      order {confirmedRejectSecondAttempt
                        ? "as the sole confirmed-reject second attempt "
                        : ""}
                      and any partial, unknown or failed evidence remains
                      emergency-blocked.
                    </span>
                  </label>

                  <p className="mt-4 break-all font-mono text-xs text-danger">
                    {requiredResidualExecutionPhrase}
                  </p>
                  <input
                    value={residualExecutionConfirmation}
                    onChange={(event) =>
                      setResidualExecutionConfirmation(event.target.value)}
                    placeholder="Type the exact one-time execution phrase"
                    className="mt-3 w-full rounded-md border border-danger/30 bg-panel p-3 font-mono text-xs text-text-primary outline-none"
                  />
                  <textarea
                    value={residualExecutionNote}
                    onChange={(event) =>
                      setResidualExecutionNote(event.target.value)}
                    placeholder="Required durable resolution note"
                    className="mt-3 min-h-24 w-full rounded-md border border-danger/30 bg-panel p-3 text-sm text-text-primary outline-none"
                  />
                  <button
                    type="button"
                    disabled={
                      !residualExecutionAcknowledged ||
                      residualExecutionConfirmation.trim() !==
                        requiredResidualExecutionPhrase ||
                      residualExecutionNote.trim().length === 0 ||
                      executeResidualMutation.isPending ||
                      executeSecondAttemptMutation.isPending
                    }
                    onClick={() => {
                      const input = {
                        previewId: residualPreview.id,
                        confirmation: residualExecutionConfirmation.trim(),
                        resolutionNote: residualExecutionNote.trim(),
                      };
                      if (confirmedRejectSecondAttempt) {
                        executeSecondAttemptMutation.mutate({
                          ...input,
                          priorExecutionId:
                            confirmedRejectSecondAttempt.priorExecutionId,
                        });
                        return;
                      }
                      executeResidualMutation.mutate(input);
                    }}
                    className="mt-3 rounded-md border border-danger bg-danger/20 px-4 py-2 text-sm font-bold text-danger disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {executeResidualMutation.isPending ||
                    executeSecondAttemptMutation.isPending
                      ? "Submitting exact recovery..."
                      : confirmedRejectSecondAttempt
                        ? "3. Execute confirmed-reject second attempt"
                        : "3. Execute one-time LIVE recovery"}
                  </button>
                </div>
              ) : null}

              {residualPreview?.state === "OPERATOR_APPROVED_EVIDENCE_ONLY" &&
              !residualExecutionBoundaryAvailable ? (
                <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
                  <p className="font-semibold">
                    No additional recovery submission is authorized.
                  </p>
                  <p className="mt-2 leading-6">
                    This session already has durable execution ownership. A new
                    order is blocked unless the original record proves the one
                    eligible deterministic pre-accept rejection and no second
                    attempt has been journaled.
                  </p>
                  {blockedSecondAttemptAssessment?.reasons.length ? (
                    <div className="mt-3 space-y-1 font-mono text-xs">
                      {blockedSecondAttemptAssessment.reasons.map((reason) => (
                        <p key={reason}>{reason}</p>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {inspectResidualMutation.isError ||
              approveResidualMutation.isError ||
              executeResidualMutation.isError ||
              executeSecondAttemptMutation.isError ? (
                <div className="rounded-lg border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
                  {executeSecondAttemptMutation.error instanceof Error
                    ? executeSecondAttemptMutation.error.message
                    : executeResidualMutation.error instanceof Error
                    ? executeResidualMutation.error.message
                    : approveResidualMutation.error instanceof Error
                      ? approveResidualMutation.error.message
                      : inspectResidualMutation.error instanceof Error
                        ? inspectResidualMutation.error.message
                        : "Residual recovery failed closed."}
                </div>
              ) : null}

              {(executeSecondAttemptMutation.data?.data ??
              executeResidualMutation.data?.data) ? (
                <div className={`rounded-lg border p-4 text-sm ${
                  (executeSecondAttemptMutation.data?.data ??
                  executeResidualMutation.data?.data)?.state === "COMPLETED_RESOLVED"
                    ? "border-success/30 bg-success/10 text-success"
                    : "border-danger/30 bg-danger/10 text-danger"
                }`}>
                  Recovery state: {(executeSecondAttemptMutation.data?.data ??
                    executeResidualMutation.data?.data)?.state}.
                  {" "}{(executeSecondAttemptMutation.data?.data ??
                    executeResidualMutation.data?.data)?.reasons.join(" | ")}
                </div>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {sessionIds.length >
      0 ? (
        <section className="rounded-xl border border-border-default bg-panel p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
            Operator Action
          </p>

          <h2 className="mt-1 text-xl font-bold text-text-primary">
            Explicit Durable
            Recovery Resolution
          </h2>

          <p className="mt-2 max-w-3xl text-sm text-text-muted">
            This action performs
            authoritative status
            inspection only. It does
            not cancel, hedge,
            unwind or resubmit
            orders. Unsafe or
            ambiguous evidence is
            rejected by the backend.
          </p>

          <div className="mt-5 grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">
                Session
              </label>

              <select
                value={
                  selectedSessionId ??
                  ""
                }
                onChange={(
                  event,
                ) =>
                  selectRecoverySession(
                    event.target.value ||
                      null,
                  )
                }
                className="mt-2 w-full rounded-md border border-border-default bg-panel-light p-3 text-sm text-text-primary outline-none"
              >
                <option value="">
                  Select recovery
                  session
                </option>

                {sessionIds.map(
                  (
                    sessionId,
                  ) => (
                    <option
                      key={
                        sessionId
                      }
                      value={
                        sessionId
                      }
                    >
                      {sessionId}
                    </option>
                  ),
                )}
              </select>

              {selectedResolution ? (
                <div className="mt-3 rounded-lg border border-success/20 bg-success/10 p-3 text-xs text-success">
                  A durable
                  resolution already
                  exists for this
                  session. Current
                  validity remains
                  determined by the
                  backend evidence
                  fingerprint.
                </div>
              ) : null}
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">
                Resolution Note
              </label>

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
                placeholder="Required: describe the authoritative evidence verified before requesting durable resolution"
                className="mt-2 min-h-28 w-full rounded-md border border-border-default bg-panel-light p-3 text-sm text-text-primary outline-none"
              />

              <button
                type="button"
                disabled={
                  !selectedSessionId ||
                  resolutionNote
                    .trim()
                    .length ===
                    0 ||
                  resolveMutation.isPending
                }
                onClick={() => {
                  if (
                    !selectedSessionId
                  ) {
                    return;
                  }

                  resolveMutation.mutate({
                    sessionId:
                      selectedSessionId,

                    resolutionNote:
                      resolutionNote.trim(),
                  });
                }}
                className="mt-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm font-semibold text-danger disabled:cursor-not-allowed disabled:opacity-50"
              >
                {resolveMutation.isPending
                  ? "Verifying Evidence..."
                  : "Verify & Record Durable Resolution"}
              </button>
            </div>
          </div>

          {resolveMutation.isError ? (
            <div className="mt-4 rounded-lg border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
              {resolveMutation.error instanceof
              Error
                ? resolveMutation.error.message
                : "Durable recovery resolution was rejected."}
            </div>
          ) : null}

          {resolveMutation.isSuccess ? (
            <div className="mt-4 rounded-lg border border-success/30 bg-success/10 p-4 text-sm text-success">
              Durable resolution
              recorded from
              backend-verified
              evidence. Recovery
              gate has been
              refreshed.
            </div>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}

function HeadlineMetric({
  label,
  value,
  healthy,
}: {
  label: string;

  value: string;

  healthy: boolean;
}) {
  return (
    <div className="rounded-lg border border-border-default bg-panel-light p-4">
      <p className="text-xs uppercase tracking-[0.14em] text-text-muted">
        {label}
      </p>

      <div className="mt-2 flex items-center gap-2">
        {healthy ? (
          <CheckCircle2 className="size-4 text-success" />
        ) : (
          <AlertTriangle className="size-4 text-warning" />
        )}

        <p className="break-words font-mono text-sm font-bold text-text-primary">
          {value}
        </p>
      </div>
    </div>
  );
}

function EvidenceCard({
  title,
  icon,
  children,
}: {
  title: string;

  icon:
    React.ReactNode;

  children:
    React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border-default bg-panel p-5">
      <div className="flex items-center gap-2">
        {icon}

        <h2 className="text-xl font-bold text-text-primary">
          {title}
        </h2>
      </div>

      <div className="mt-5">
        {children}
      </div>
    </section>
  );
}

function DataRow({
  label,
  value,
  danger = false,
}: {
  label: string;

  value: string;

  danger?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border-default pb-2 text-sm last:border-b-0 last:pb-0">
      <span className="text-text-muted">
        {label}
      </span>

      <span
        className={`text-right font-mono text-xs font-semibold ${
          danger
            ? "text-danger"
            : "text-text-primary"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function FindingCard({
  finding,
  onSelectSession,
}: {
  finding:
    RestartRecoveryFinding;

  onSelectSession:
    (
      sessionId: string,
    ) => void;
}) {
  return (
    <div className="rounded-lg border border-border-default bg-panel-light p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full border px-2 py-1 text-[10px] font-bold ${severityClass(
                finding.severity,
              )}`}
            >
              {
                finding.severity
              }
            </span>

            <span className="font-mono text-xs text-text-muted">
              {
                finding.source
              }
            </span>
          </div>

          <p className="mt-2 text-sm text-text-primary">
            {
              finding.message
            }
          </p>

          {finding.sessionId ? (
            <p className="mt-2 font-mono text-[10px] text-text-muted">
              Session:{" "}
              {
                finding.sessionId
              }
            </p>
          ) : null}

          {finding.orderId ? (
            <p className="mt-1 font-mono text-[10px] text-text-muted">
              Order:{" "}
              {
                finding.orderId
              }
            </p>
          ) : null}
        </div>

        {finding.sessionId ? (
          <button
            type="button"
            onClick={() =>
              onSelectSession(
                finding.sessionId!,
              )
            }
            className="rounded-md border border-border-default px-3 py-1.5 text-xs font-semibold text-text-primary"
          >
            Select Session
          </button>
        ) : null}
      </div>
    </div>
  );
}

function ResolutionRow({
  resolution,
}: {
  resolution:
    RecoveryResolutionRecord;
}) {
  return (
    <tr className="border-t border-border-default">
      <td className="px-4 py-3 font-mono text-text-primary">
        {
          resolution.sessionId
        }
      </td>

      <td className="px-4 py-3 text-text-muted">
        {
          resolution.basis
        }
      </td>

      <td className="px-4 py-3 font-mono">
        {
          resolution.authoritativeOrdersChecked
        }
      </td>

      <td className="px-4 py-3 font-mono">
        {
          resolution.authoritativeFilledBuyQuantity
        }
      </td>

      <td className="px-4 py-3 font-mono">
        {
          resolution.authoritativeFilledSellQuantity
        }
      </td>

      <td className="px-4 py-3 text-text-muted">
        {new Date(
          resolution.resolvedAt,
        ).toLocaleString()}
      </td>
    </tr>
  );
}

function CountBadge({
  label,
  value,
  warning = false,
}: {
  label: string;

  value: number;

  warning?: boolean;
}) {
  return (
    <span
      className={`rounded-full border px-3 py-1 ${
        warning
          ? "border-warning/30 bg-warning/10 text-warning"
          : "border-border-default bg-panel-light text-text-muted"
      }`}
    >
      {label}: {value}
    </span>
  );
}

function Unavailable() {
  return (
    <div className="rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
      Evidence unavailable.
    </div>
  );
}

function yesNo(
  value: boolean,
): string {
  return value
    ? "YES"
    : "NO";
}

function formatApprovalNumber(
  value: number,
): string {
  return Number.isInteger(value)
    ? value.toFixed(0)
    : value.toString();
}

function severityClass(
  severity:
    | "INFO"
    | "WARNING"
    | "CRITICAL",
): string {
  if (
    severity ===
    "CRITICAL"
  ) {
    return "border-danger/30 bg-danger/10 text-danger";
  }

  if (
    severity ===
    "WARNING"
  ) {
    return "border-warning/30 bg-warning/10 text-warning";
  }

  return "border-brand/30 bg-brand/10 text-brand";
}
