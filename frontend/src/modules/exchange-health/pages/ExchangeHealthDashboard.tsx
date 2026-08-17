import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Database,
  PlugZap,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import {
  useExchangeHealthEvidenceSnapshot,
} from "../hooks/useExchangeHealthEvidenceSnapshot";

import {
  useSynchronizeExchangeClocks,
} from "../hooks/useSynchronizeExchangeClocks";

import type {
  ExchangeHealthEvidenceSnapshot,
} from "../types/ExchangeHealthSnapshot";

import type {
  ExchangeFleetCapabilityReport,
} from "../types/ExchangeFleet";

import type {
  FiveExchangeReadinessObservationReport,
  FiveExchangePaperShadowReadinessReport,
} from "../types/PaperShadowReadiness";

const fallbackTargetExchanges = [
  "coindcx",
  "binance",
  "unocoin",
  "coinswitch",
  "bybit",
] as const;

export default function ExchangeHealthDashboard() {
  const {
    data:
      snapshot,

    isPending:
      snapshotPending,

    isError:
      snapshotError,

    isFetching:
      snapshotFetching,

    refetch:
      refetchSnapshot,
  } = useExchangeHealthEvidenceSnapshot();

  const synchronizeClockMutation =
    useSynchronizeExchangeClocks();

  const systemHealthSource =
    snapshot?.sources.systemHealth;

  const executionHealthSource =
    snapshot?.sources.executionHealth;

  const clockSource =
    snapshot?.sources.clockSafety;

  const fleetSource =
    snapshot?.sources.fleetCapabilities;

  const paperShadowSource =
    snapshot?.sources.paperShadowReadiness;

  const observationSource =
    snapshot?.sources.readinessObservations;

  const systemHealthResponse =
    systemHealthSource?.data;

  const executionHealth =
    executionHealthSource?.data;

  const clockResponse =
    clockSource?.data;

  const fleetResponse =
    fleetSource?.data;

  const paperShadowResponse =
    paperShadowSource?.data;

  const observationResponse =
    observationSource?.data;

  const systemHealthError =
    snapshotError ||
    Boolean(
      systemHealthSource?.error,
    );

  const executionHealthError =
    Boolean(
      executionHealthSource?.error,
    );

  const clockError =
    Boolean(
      clockSource?.error,
    );

  const fleetError =
    Boolean(
      fleetSource?.error,
    );

  const paperShadowError =
    Boolean(
      paperShadowSource?.error,
    );

  const observationError =
    Boolean(
      observationSource?.error,
    );

  const systemHealth =
    systemHealthResponse?.data;

  const clockReport =
    clockResponse?.data;

  const fleetReport =
    fleetResponse?.data;

  const paperShadowReport =
    paperShadowResponse?.data;

  const observationReport =
    observationResponse?.data;

  const targetExchanges =
    fleetReport?.exchanges.map(
      (exchange) =>
        exchange.exchange,
    ) ??
    fallbackTargetExchanges;

  const loading =
    snapshotPending;

  const refreshing =
    snapshotFetching;

  const synchronizeClock =
    async () => {
      try {
        await synchronizeClockMutation.mutateAsync();
        await refetchSnapshot();
      } catch {
        // Mutation failure is surfaced via state.
      }
    };

  const resolveClockStatus = synchronizeClockMutation.error
    ? synchronizeClockMutation.error instanceof Error
      ? synchronizeClockMutation.error.message
      : "Unable to synchronize exchange clocks right now."
    : synchronizeClockMutation.isSuccess &&
        "Clock synchronization command completed. Refreshing health evidence.";

  const refreshAll =
    async () => {
      await refetchSnapshot();
    };

  if (
    loading &&
    !systemHealth
  ) {
    return (
      <section className="rounded-xl border border-border-default bg-panel p-6">
        <div className="flex items-center gap-3 text-text-muted">
          <RefreshCw className="size-5 animate-spin" />

          Loading exchange
          health evidence...
        </div>
      </section>
    );
  }

  if (
    !systemHealth
  ) {
    return (
      <section className="rounded-xl border border-danger/30 bg-panel p-6">
        <div className="flex items-start gap-3">
          <XCircle className="mt-0.5 size-6 text-danger" />

          <div>
            <h1 className="text-xl font-bold text-danger">
              Exchange health
              unavailable
            </h1>

            <p className="mt-2 text-sm text-text-muted">
              Core system-health
              evidence could not be
              loaded. Missing evidence
              is not treated as
              healthy.
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

  const connectedCount =
    systemHealth.exchanges.filter(
      (
        exchange,
      ) =>
        exchange.connected,
    ).length;

  const totalExchanges =
    systemHealth.exchanges.length;

  const allConnected =
    totalExchanges > 0 &&
    connectedCount ===
      totalExchanges;

  return (
    <section className="space-y-6">
      <section className="rounded-xl border border-border-default bg-panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-success">
              <Activity className="size-4" />

              <p className="text-xs font-semibold uppercase tracking-[0.18em]">
                Exchange Health
              </p>
            </div>

            <h1 className="mt-2 text-3xl font-bold text-text-primary">
              Multi-Exchange
              Operations
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">
              Market-data connectivity,
              executable quote
              coverage, execution
              adapter state, and
              signed-request clock
              safety for the current
              exchange fleet.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={
                refreshing ||
                synchronizeClockMutation.isPending
              }
              onClick={() =>
                void synchronizeClock()
              }
              className="inline-flex items-center gap-2 rounded-md border border-warning/50 bg-warning/10 px-3 py-2 text-xs font-semibold text-warning hover:border-warning disabled:opacity-60"
            >
              <Clock3
                className={`size-4 ${
                  synchronizeClockMutation.isPending
                    ? "animate-spin"
                    : ""
                }`}
              />

              Resolve Clock Alerts
            </button>

            <button
              type="button"
              disabled={
                refreshing
              }
              onClick={() =>
                void refreshAll()
              }
              className="inline-flex items-center gap-2 rounded-md border border-border-default bg-panel-light px-3 py-2 text-xs font-semibold text-text-primary hover:border-brand/50 disabled:opacity-60"
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

        {resolveClockStatus ? (
          <p
            className={`mt-3 text-xs ${
              synchronizeClockMutation.error
                ? "text-danger"
                : "text-success"
            }`}
          >
            {resolveClockStatus}
          </p>
        ) : null}

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryMetric
            label="Market Data Connected"
            value={`${connectedCount}/${totalExchanges}`}
            healthy={
              allConnected
            }
          />

          <SummaryMetric
            label="Cached Quotes"
            value={systemHealth.cache.cachedQuotes.toLocaleString()}
            healthy={
              systemHealth.cache.cachedQuotes >
              0
            }
          />

          <SummaryMetric
            label="Executable Quote Books"
            value={systemHealth.cache.executableQuotes.toLocaleString()}
            healthy={
              systemHealth.cache.executableQuotes >
              0
            }
          />

          <SummaryMetric
            label="Shared Markets"
            value={systemHealth.engine.sharedMarkets.toLocaleString()}
            healthy={
              systemHealth.engine.sharedMarkets >
              0
            }
          />
        </div>
      </section>

      {snapshot ? (
        <EvidenceSnapshotStatus
          snapshot={
            snapshot
          }
        />
      ) : null}

      {(executionHealthError ||
        clockError ||
        fleetError ||
        paperShadowError ||
        observationError ||
        systemHealthError) && (
        <section className="rounded-xl border border-warning/30 bg-warning/10 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" />

            <div>
              <p className="font-semibold text-warning">
                Partial evidence
                unavailable
              </p>

              <p className="mt-1 text-sm text-text-muted">
                One or more
                secondary health
                sources could not be
                loaded. Unknown
                adapter or clock
                evidence remains
                explicitly unknown.
              </p>
            </div>
          </div>
        </section>
      )}

      {fleetReport && (
        <FleetCapabilityMatrix
          report={
            fleetReport
          }
        />
      )}

      {paperShadowReport ? (
        <PaperShadowReadinessMatrix
          report={
            paperShadowReport
          }
        />
      ) : (
        <section className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
          Paper/shadow readiness
          evidence is unavailable.
          Missing evidence is not
          treated as ready.
        </section>
      )}

      {observationReport ? (
        <RollingReadinessEvidence
          report={
            observationReport
          }
        />
      ) : null}

      <div className="grid gap-5 xl:grid-cols-3">
        {targetExchanges.map(
          (
            exchangeName,
          ) => {
            const connectivity =
              systemHealth.exchanges.find(
                (
                  exchange,
                ) =>
                  normalize(
                    exchange.name,
                  ) ===
                  exchangeName,
              );

            const quoteCoverage =
              systemHealth.cache.quotesByExchange.find(
                (
                  quote,
                ) =>
                  normalize(
                    quote.exchange,
                  ) ===
                  exchangeName,
              );

            const execution =
              executionHealth?.exchanges.find(
                (
                  item,
                ) =>
                  normalize(
                    item.exchange,
                  ) ===
                  exchangeName,
              );

            const clock =
              clockReport?.exchanges.find(
                (
                  item,
                ) =>
                  normalize(
                    item.exchange,
                  ) ===
                  exchangeName,
              );

            return (
              <ExchangeCard
                key={
                  exchangeName
                }
                name={
                  exchangeName
                }
                connected={
                  connectivity?.connected ??
                  false
                }
                connectivityKnown={
                  Boolean(
                    connectivity,
                  )
                }
                totalQuotes={
                  quoteCoverage?.totalQuotes ??
                  0
                }
                quoteBookTargets={
                  quoteCoverage?.quoteBookTargets ??
                  quoteCoverage?.totalQuotes ??
                  0
                }
                executableQuotes={
                  quoteCoverage?.executableQuotes ??
                  0
                }
                adapterRegistered={
                  execution?.adapterRegistered ??
                  false
                }
                adapterConnected={
                  execution?.adapterConnected ??
                  false
                }
                credentialsConfigured={
                  execution?.credentialsConfigured ??
                  false
                }
                authenticationVerified={
                  execution?.authenticationVerified ??
                  false
                }
                exchangeApiReachable={
                  execution?.exchangeApiReachable ??
                  false
                }
                verificationState={
                  execution?.verificationState ??
                  "NOT_CONFIGURED"
                }
                readOnlyVerificationFresh={
                  execution?.readOnlyVerificationFresh ??
                  false
                }
                lastVerifiedAt={
                  execution?.lastVerifiedAt ??
                  null
                }
                lastVerificationAttemptAt={
                  execution?.lastVerificationAttemptAt ??
                  null
                }
                verificationExpiresAt={
                  execution?.verificationExpiresAt ??
                  null
                }
                verificationMethod={
                  execution?.verificationMethod ??
                  null
                }
                lastVerificationError={
                  execution?.lastVerificationError ??
                  null
                }
                liveExecutionEnabled={
                  execution?.liveExecutionEnabled ??
                  false
                }
                executionEvidenceAvailable={
                  execution?.executionEvidenceAvailable ??
                  false
                }
                adapterKnown={
                  Boolean(
                    execution,
                  )
                }
                executionStatus={
                  execution?.status ??
                  "NOT_REPORTED"
                }
                executionReasons={
                  execution?.reasons ??
                  []
                }
                clockMode={
                  clock?.mode ??
                  null
                }
                clockHealth={
                  clock?.health ??
                  null
                }
                clockSynchronized={
                  clock?.synchronized ??
                  null
                }
                signedRequestAllowed={
                  clock?.signedRequestAllowed ??
                  null
                }
                clockAgeMs={
                  clock?.ageMs ??
                  null
                }
                clockReasons={
                  clock?.reasons ??
                  []
                }
              />
            );
          },
        )}
      </div>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-xl border border-border-default bg-panel p-5">
          <div className="flex items-center gap-2">
            <Database className="size-5 text-brand" />

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
                Market Data
              </p>

              <h2 className="mt-1 text-xl font-bold text-text-primary">
                Coverage Summary
              </h2>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            <DataRow
              label="Markets"
              value={systemHealth.engine.markets.toLocaleString()}
            />

            <DataRow
              label="Shared Markets"
              value={systemHealth.engine.sharedMarkets.toLocaleString()}
            />

            <DataRow
              label="Generated Exchange Pairs"
              value={systemHealth.engine.generatedPairs.toLocaleString()}
            />

            <DataRow
              label="Current Opportunities"
              value={systemHealth.engine.opportunities.toLocaleString()}
            />

            <DataRow
              label="Trading Readiness Score"
              value={`${systemHealth.trading.score.toFixed(
                0,
              )}/100`}
            />
          </div>
        </div>

        <div className="rounded-xl border border-border-default bg-panel p-5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-brand" />

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
                Signed Request
                Safety
              </p>

              <h2 className="mt-1 text-xl font-bold text-text-primary">
                Clock Evidence
              </h2>
            </div>
          </div>

          {!clockReport ? (
            <p className="mt-5 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
              Clock safety report
              unavailable.
            </p>
          ) : (
            <>
              <div className="mt-5 space-y-3">
                <DataRow
                  label="Server-Synchronized Clocks"
                  value={
                    clockReport.allServerSynchronizedClocksHealthy
                      ? "HEALTHY"
                      : "ATTENTION"
                  }
                />

                <DataRow
                  label="Signed Requests Fail Closed"
                  value={
                    clockReport.signedRequestsFailClosed
                      ? "YES"
                      : "NO"
                  }
                />

                <DataRow
                  label="Clock Blockers"
                  value={String(
                    clockReport.blockers.length,
                  )}
                />
              </div>

              {clockReport.blockers.length >
              0 ? (
                <div className="mt-4 space-y-2">
                  {clockReport.blockers.map(
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
            </>
          )}
        </div>
      </section>
    </section>
  );
}

interface ExchangeCardProps {
  name: string;

  connected: boolean;

  connectivityKnown: boolean;

  totalQuotes: number;

  quoteBookTargets: number;

  executableQuotes: number;

  adapterRegistered: boolean;

  adapterConnected: boolean;

  credentialsConfigured:
    boolean;

  authenticationVerified:
    boolean;

  exchangeApiReachable:
    boolean;

  verificationState:
    | "NOT_CONFIGURED"
    | "CONFIGURED_UNVERIFIED"
    | "VERIFICATION_STALE"
    | "VERIFIED";

  readOnlyVerificationFresh:
    boolean;

  lastVerifiedAt:
    | number
    | null;

  lastVerificationAttemptAt:
    | number
    | null;

  verificationExpiresAt:
    | number
    | null;

  verificationMethod:
    | "SIGNED_BALANCE_READ"
    | null;

  lastVerificationError:
    | string
    | null;

  liveExecutionEnabled:
    boolean;

  executionEvidenceAvailable:
    boolean;

  adapterKnown: boolean;

  executionStatus: string;

  executionReasons:
    string[];

  clockMode:
    | string
    | null;

  clockHealth:
    | string
    | null;

  clockSynchronized:
    | boolean
    | null;

  signedRequestAllowed:
    | boolean
    | null;

  clockAgeMs:
    | number
    | null;

  clockReasons:
    string[];
}

function ExchangeCard({
  name,
  connected,
  connectivityKnown,
  totalQuotes,
  quoteBookTargets,
  executableQuotes,
  adapterRegistered,
  adapterConnected,
  credentialsConfigured,
  authenticationVerified,
  exchangeApiReachable,
  verificationState,
  readOnlyVerificationFresh,
  lastVerifiedAt,
  lastVerificationAttemptAt,
  verificationExpiresAt,
  verificationMethod,
  lastVerificationError,
  liveExecutionEnabled,
  executionEvidenceAvailable,
  adapterKnown,
  executionStatus,
  executionReasons,
  clockMode,
  clockHealth,
  clockSynchronized,
  signedRequestAllowed,
  clockAgeMs,
  clockReasons,
}: ExchangeCardProps) {
  const executablePercent =
    quoteBookTargets > 0
      ? (
          executableQuotes /
          quoteBookTargets
        ) *
        100
      : 0;

  return (
    <article className="rounded-xl border border-border-default bg-panel p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-text-muted">
            Exchange
          </p>

          <h2 className="mt-1 text-2xl font-bold text-text-primary">
            {formatExchangeName(
              name,
            )}
          </h2>
        </div>

        <StatusBadge
          label={
            !connectivityKnown
              ? "UNKNOWN"
              : connected
                ? "CONNECTED"
                : "DISCONNECTED"
          }
          status={
            !connectivityKnown
              ? "warning"
              : connected
                ? "good"
                : "bad"
          }
        />
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3">
        <SmallMetric
          label="Market Catalog"
          value={totalQuotes.toLocaleString()}
        />

        <SmallMetric
          label="Quote-Book Targets"
          value={quoteBookTargets.toLocaleString()}
        />

        <SmallMetric
          label="Fresh Executable"
          value={executableQuotes.toLocaleString()}
        />
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between text-xs text-text-muted">
          <span>
            Quote-book executable
            target coverage
          </span>

          <span className="font-mono text-text-primary">
            {executablePercent.toFixed(
              1,
            )}
            %
          </span>
        </div>

        <div className="mt-2 h-2 overflow-hidden rounded-full bg-panel-light">
          <div
            className="h-full bg-success"
            style={{
              width: `${Math.min(
                100,
                executablePercent,
              )}%`,
            }}
          />
        </div>
      </div>

      <div className="mt-5 border-t border-border-default pt-4">
        <div className="flex items-center gap-2">
          <PlugZap className="size-4 text-brand" />

          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-text-muted">
            Execution Adapter
          </p>
        </div>

        <div className="mt-3 space-y-2">
          <DataRow
            label="Registered"
            value={
              !adapterKnown
                ? "NOT REPORTED"
                : adapterRegistered
                  ? "YES"
                  : "NO"
            }
          />

          <DataRow
            label="Credentials"
            value={
              !adapterKnown
                ? "NOT REPORTED"
                : credentialsConfigured
                  ? "CONFIGURED"
                  : "MISSING"
            }
          />

          <DataRow
            label="Authentication"
            value={
              !adapterKnown
                ? "NOT REPORTED"
                : authenticationVerified
                  ? "VERIFIED"
                  : "UNVERIFIED"
            }
          />

          <DataRow
            label="Execution API"
            value={
              !adapterKnown
                ? "NOT REPORTED"
                : exchangeApiReachable
                  ? "REACHABLE"
                  : "UNVERIFIED"
            }
          />

          <DataRow
            label="Verification State"
            value={
              !adapterKnown
                ? "NOT REPORTED"
                : verificationState
            }
          />

          <DataRow
            label="Verification Fresh"
            value={
              !adapterKnown
                ? "NOT REPORTED"
                : readOnlyVerificationFresh
                  ? "YES"
                  : "NO"
            }
          />

          <DataRow
            label="Verification Method"
            value={
              !adapterKnown
                ? "NOT REPORTED"
                : verificationMethod ??
                  "NONE"
            }
          />

          <DataRow
            label="LIVE Execution"
            value={
              !adapterKnown
                ? "NOT REPORTED"
                : liveExecutionEnabled
                  ? "ENABLED"
                  : "DISABLED"
            }
          />

          <DataRow
            label="LIVE Adapter Availability"
            value={
              !adapterKnown
                ? "NOT REPORTED"
                : adapterConnected
                  ? "AVAILABLE"
                  : "BLOCKED"
            }
          />

          <DataRow
            label="Last Verified"
            value={
              !adapterKnown
                ? "NOT REPORTED"
                : lastVerifiedAt ===
                    null
                  ? "NEVER"
                  : new Date(
                      lastVerifiedAt,
                    ).toLocaleString()
            }
          />

          <DataRow
            label="Last Attempt"
            value={
              !adapterKnown
                ? "NOT REPORTED"
                : lastVerificationAttemptAt ===
                    null
                  ? "NEVER"
                  : new Date(
                      lastVerificationAttemptAt,
                    ).toLocaleString()
            }
          />

          <DataRow
            label="Evidence Expires"
            value={
              !adapterKnown
                ? "NOT REPORTED"
                : verificationExpiresAt ===
                    null
                  ? "N/A"
                  : new Date(
                      verificationExpiresAt,
                    ).toLocaleString()
            }
          />

          <DataRow
            label="Last Verification Error"
            value={
              !adapterKnown
                ? "NOT REPORTED"
                : lastVerificationError ??
                  "NONE"
            }
          />

          <DataRow
            label="Execution Evidence"
            value={
              !adapterKnown
                ? "NOT REPORTED"
                : executionEvidenceAvailable
                  ? "AVAILABLE"
                  : "NONE"
            }
          />

          <DataRow
            label="Execution Health"
            value={
              executionStatus
            }
          />
        </div>

        {executionReasons.length >
        0 ? (
          <ReasonList
            reasons={
              executionReasons
            }
          />
        ) : null}
      </div>

      <div className="mt-5 border-t border-border-default pt-4">
        <div className="flex items-center gap-2">
          <Clock3 className="size-4 text-brand" />

          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-text-muted">
            Clock Safety
          </p>
        </div>

        {!clockMode ? (
          <div className="mt-3 rounded-lg border border-warning/20 bg-warning/10 p-3 text-xs text-warning">
            No clock-safety
            evidence reported for
            this exchange.
          </div>
        ) : (
          <>
            <div className="mt-3 space-y-2">
              <DataRow
                label="Mode"
                value={
                  clockMode
                }
              />

              <DataRow
                label="Health"
                value={
                  clockHealth ??
                  "UNKNOWN"
                }
              />

              <DataRow
                label="Synchronized"
                value={
                  clockSynchronized
                    ? "YES"
                    : "NO"
                }
              />

              <DataRow
                label="Signed Requests"
                value={
                  signedRequestAllowed
                    ? "ALLOWED"
                    : "BLOCKED"
                }
              />

              <DataRow
                label="Sync Age"
                value={
                  clockAgeMs ===
                  null
                    ? "N/A"
                    : formatDuration(
                        clockAgeMs,
                      )
                }
              />
            </div>

            {clockReasons.length >
            0 ? (
              <ReasonList
                reasons={
                  clockReasons
                }
              />
            ) : null}
          </>
        )}
      </div>
    </article>
  );
}

function SummaryMetric({
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
      <p className="text-xs uppercase tracking-[0.15em] text-text-muted">
        {label}
      </p>

      <div className="mt-2 flex items-center gap-2">
        {healthy ? (
          <CheckCircle2 className="size-4 text-success" />
        ) : (
          <AlertTriangle className="size-4 text-warning" />
        )}

        <p className="text-2xl font-bold text-text-primary">
          {value}
        </p>
      </div>
    </div>
  );
}

function EvidenceSnapshotStatus({
  snapshot,
}: {
  snapshot:
    ExchangeHealthEvidenceSnapshot;
}) {
  const complete =
    snapshot.successfulSourceCount ===
    snapshot.sourceCount;

  const withinTimeWindow =
    snapshot.sourceSkewMs !==
      null &&
    snapshot.sourceSkewMs <=
      5_000;

  const sources = [
    {
      label: "System",
      source:
        snapshot.sources.systemHealth,
    },
    {
      label: "Adapter",
      source:
        snapshot.sources.executionHealth,
    },
    {
      label: "Clock",
      source:
        snapshot.sources.clockSafety,
    },
    {
      label: "Fleet",
      source:
        snapshot.sources.fleetCapabilities,
    },
    {
      label: "Readiness",
      source:
        snapshot.sources.paperShadowReadiness,
    },
    {
      label: "Rolling",
      source:
        snapshot.sources.readinessObservations,
    },
  ];

  return (
    <section className="rounded-xl border border-border-default bg-panel p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">
            V{snapshot.version} ·
            Evidence Snapshot
          </p>

          <h2 className="mt-1 text-xl font-bold text-text-primary">
            One Batch, One Screen State
          </h2>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">
            Every panel below is
            committed from this one
            fetch batch. Sources no
            longer refresh and replace
            visible panels
            independently.
          </p>
        </div>

        <StatusBadge
          label={
            complete &&
            withinTimeWindow
              ? "BATCH COMMITTED"
              : "PARTIAL / SKEWED"
          }
          status={
            complete &&
            withinTimeWindow
              ? "good"
              : "warning"
          }
        />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SmallMetric
          label="Snapshot Committed"
          value={formatSnapshotTime(
            snapshot.completedAt,
          )}
        />

        <SmallMetric
          label="Sources Available"
          value={`${snapshot.successfulSourceCount}/${snapshot.sourceCount}`}
        />

        <SmallMetric
          label="Source Time Window"
          value={
            snapshot.sourceSkewMs ===
            null
              ? "N/A"
              : formatDuration(
                  snapshot.sourceSkewMs,
                )
          }
        />

        <SmallMetric
          label="Fetch Duration"
          value={formatDuration(
            snapshot.requestDurationMs,
          )}
        />
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
        {sources.map(
          ({
            label,
            source,
          }) => (
            <div
              key={label}
              className="rounded-lg border border-border-default bg-panel-light px-3 py-2"
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                {label}
              </p>

              <p
                className={`mt-1 font-mono text-xs font-semibold ${
                  source.error
                    ? "text-warning"
                    : "text-text-primary"
                }`}
              >
                {source.generatedAt ===
                null
                  ? "UNAVAILABLE"
                  : formatSnapshotTime(
                      source.generatedAt,
                    )}
              </p>
            </div>
          ),
        )}
      </div>
    </section>
  );
}

function FleetCapabilityMatrix({
  report,
}: {
  report:
    ExchangeFleetCapabilityReport;
}) {
  return (
    <section className="rounded-xl border border-border-default bg-panel p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">
            V{report.version}
          </p>

          <h2 className="mt-1 text-xl font-bold text-text-primary">
            Five-Exchange Capability Truth
          </h2>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">
            Implementation and runtime evidence are separate. Documented APIs are not reported as built until CAT PRO has an audited integration.
          </p>
        </div>

        <StatusBadge
          label="LIVE DISABLED"
          status="warning"
        />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <SmallMetric
          label="Target"
          value={`${report.targetExchangeCount}`}
        />

        <SmallMetric
          label="Market Data Built"
          value={`${report.summary.marketDataImplemented}/5`}
        />

        <SmallMetric
          label="Connected"
          value={`${report.summary.marketDataConnected}/5`}
        />

        <SmallMetric
          label="Rule Providers"
          value={`${report.summary.marketRuleProviders}/5`}
        />

        <SmallMetric
          label="Read Monitored"
          value={`${report.summary.authenticatedReadMonitored}/5`}
        />

        <SmallMetric
          label="Read Verified"
          value={`${report.summary.verifiedReadAccess}/5`}
        />
      </div>

      <div className="mt-5 overflow-x-auto">
        <div className="min-w-[820px] space-y-2">
          <div className="grid grid-cols-[1.15fr_1fr_1fr_1fr_1fr] gap-3 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
            <span>Exchange</span>
            <span>Market Data</span>
            <span>Market Rules</span>
            <span>Authenticated Read</span>
            <span>LIVE Adapter</span>
          </div>

          {report.exchanges.map(
            (exchange) => (
              <div
                key={
                  exchange.exchange
                }
                className="grid grid-cols-[1.15fr_1fr_1fr_1fr_1fr] items-center gap-3 rounded-lg border border-border-default bg-panel-light px-3 py-3 text-xs"
              >
                <div>
                  <p className="font-semibold text-text-primary">
                    {exchange.displayName}
                  </p>

                  <p className="mt-1 font-mono text-[10px] text-text-muted">
                    {exchange.exchange}
                  </p>
                </div>

                <CapabilityValue
                  implemented={
                    exchange.marketData.implementationState ===
                    "IMPLEMENTED"
                  }
                  positive={
                    exchange.marketData.connected
                  }
                  implementedLabel={
                    exchange.marketData.connected
                      ? "CONNECTED"
                      : exchange.marketData.adapterRegistered
                        ? "REGISTERED"
                        : "IMPLEMENTED"
                  }
                />

                <CapabilityValue
                  implemented={
                    exchange.marketRules.providerRegistered
                  }
                  positive={
                    exchange.marketRules.providerRegistered
                  }
                  implementedLabel="PROVIDER READY"
                />

                <CapabilityValue
                  implemented={
                    exchange.authenticatedRead.monitored
                  }
                  positive={
                    exchange.authenticatedRead.verificationState ===
                      "VERIFIED" &&
                    exchange.authenticatedRead.fresh
                  }
                  implementedLabel={
                    exchange.authenticatedRead.verificationState
                  }
                />

                <CapabilityValue
                  implemented={
                    exchange.liveOrderAdapter.adapterRegistered
                  }
                  positive={false}
                  implementedLabel="REGISTERED / OFF"
                />
              </div>
            ),
          )}
        </div>
      </div>

      <p className="mt-4 text-xs text-text-muted">
        Capability evidence generated {new Date(
          report.generatedAt,
        ).toLocaleString()} · LIVE
        submission allowed: NO
      </p>
    </section>
  );
}

function PaperShadowReadinessMatrix({
  report,
}: {
  report:
    FiveExchangePaperShadowReadinessReport;
}) {
  return (
    <section className="rounded-xl border border-border-default bg-panel p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">
            V{report.version}
          </p>

          <h2 className="mt-1 text-xl font-bold text-text-primary">
            Five-Exchange Paper / Shadow Readiness
          </h2>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">
            Capability-synchronized
            depth, fee evidence, and
            order rules are evaluated
            together for each target
            exchange. This stricter
            market-level count is
            intentionally different
            from the live quote-book
            count on exchange cards.
          </p>
        </div>

        <StatusBadge
          label="LIVE DISABLED"
          status="warning"
        />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SmallMetric
          label="Shadow Available"
          value={`${report.summary.shadowAvailableExchanges}/5`}
        />

        <SmallMetric
          label="Paper Available"
          value={`${report.summary.paperAvailableExchanges}/5`}
        />

        <SmallMetric
          label="Shadow-Eligible Markets"
          value={String(
            report.summary.totalShadowEligibleMarkets,
          )}
        />

        <SmallMetric
          label="Paper-Eligible Markets"
          value={String(
            report.summary.totalPaperEligibleMarkets,
          )}
        />
      </div>

      <div className="mt-5 overflow-x-auto">
        <div className="min-w-[980px] space-y-2">
          <div className="grid grid-cols-[1.15fr_.8fr_.8fr_.8fr_.8fr_.9fr_.9fr] gap-3 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
            <span>Exchange</span>
            <span>Depth-Ready</span>
            <span>Fee Evidence</span>
            <span>Order Rules</span>
            <span>Fee Source</span>
            <span>Shadow</span>
            <span>Paper</span>
          </div>

          {report.exchanges.map(
            (exchange) => {
              const feeSource =
                Object.entries(
                  exchange.feeEvidenceSources,
                )
                  .filter(([, count]) =>
                    count > 0,
                  )
                  .map(([source, count]) =>
                    `${source.replaceAll("_", " ")} ${count}`,
                  )
                  .join(" / ") ||
                "NONE";

              return (
                <div
                  key={
                    exchange.exchange
                  }
                  className="rounded-lg border border-border-default bg-panel-light px-3 py-3"
                >
                  <div className="grid grid-cols-[1.15fr_.8fr_.8fr_.8fr_.8fr_.9fr_.9fr] items-center gap-3 text-xs">
                    <div>
                      <p className="font-semibold text-text-primary">
                        {exchange.displayName}
                      </p>

                      <p className="mt-1 font-mono text-[10px] text-text-muted">
                        {exchange.exchange}
                      </p>
                    </div>

                    <span className="font-mono text-text-primary">
                      {exchange.executableMarkets}
                    </span>

                    <span className="font-mono text-text-primary">
                      {exchange.feeEvidenceMarkets}
                    </span>

                    <span className="font-mono text-text-primary">
                      {exchange.completeOrderRuleMarkets}
                    </span>

                    <span className="text-[10px] leading-4 text-text-muted">
                      {feeSource}
                    </span>

                    <StatusBadge
                      label={`${exchange.shadowAvailability} ${exchange.shadowEligibleMarkets}`}
                      status={
                        exchange.shadowAvailability ===
                        "AVAILABLE"
                          ? "good"
                          : "bad"
                      }
                    />

                    <StatusBadge
                      label={`${exchange.paperAvailability} ${exchange.paperEligibleMarkets}`}
                      status={
                        exchange.paperAvailability ===
                        "AVAILABLE"
                          ? "good"
                          : "bad"
                      }
                    />
                  </div>

                  {exchange.blockers.length >
                  0 ? (
                    <div className="mt-3 border-t border-border-default pt-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-warning">
                        Fail-closed blockers
                      </p>

                      <ul className="mt-2 space-y-1 text-xs leading-5 text-text-muted">
                        {exchange.blockers.map(
                          (blocker) => (
                            <li
                              key={
                                blocker
                              }
                            >
                              {blocker}
                            </li>
                          ),
                        )}
                      </ul>
                    </div>
                  ) : null}
                </div>
              );
            },
          )}
        </div>
      </div>

      <p className="mt-4 text-xs text-text-muted">
        Generated {new Date(
          report.generatedAt,
        ).toLocaleString()} · LIVE
        submission allowed: NO
      </p>
    </section>
  );
}

function RollingReadinessEvidence({
  report,
}: {
  report:
    FiveExchangeReadinessObservationReport;
}) {
  const status =
    report.status ===
      "STABLE"
      ? "good"
      : report.status ===
          "UNSTABLE"
        ? "bad"
        : "warning";

  return (
    <section className="rounded-xl border border-border-default bg-panel p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">
            V{report.version}
          </p>

          <h2 className="mt-1 text-xl font-bold text-text-primary">
            Persistent Rolling Readiness Evidence
          </h2>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">
            Restart-safe observations
            must earn both a minimum
            sample count and real
            elapsed duration. A green
            point-in-time snapshot is
            never backfilled into
            historical readiness.
          </p>
        </div>

        <StatusBadge
          label={
            report.status.replaceAll(
              "_",
              " ",
            )
          }
          status={status}
        />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SmallMetric
          label="Observations"
          value={`${report.evidence.observationsInWindow}/${report.policy.minimumObservations}`}
        />

        <SmallMetric
          label="Elapsed Evidence"
          value={`${formatDuration(report.evidence.observedDurationMs)} / ${formatDuration(report.policy.minimumDurationMs)}`}
        />

        <SmallMetric
          label="Required Availability"
          value={`${(
            report.policy.minimumAvailabilityRatio *
            100
          ).toFixed(1)}%`}
        />

        <SmallMetric
          label="Shadow Stable"
          value={
            report.allFiveRollingShadowStable
              ? "5/5"
              : "NO"
          }
        />

        <SmallMetric
          label="Paper Stable"
          value={
            report.allFiveRollingPaperStable
              ? "5/5"
              : "NO"
          }
        />
      </div>

      <div className="mt-5 overflow-x-auto">
        <div className="min-w-[820px] space-y-2">
          <div className="grid grid-cols-[1.1fr_.8fr_1fr_1fr_.9fr_.9fr] gap-3 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
            <span>Exchange</span>
            <span>Samples</span>
            <span>Shadow Ratio</span>
            <span>Paper Ratio</span>
            <span>Shadow Stable</span>
            <span>Paper Stable</span>
          </div>

          {report.exchanges.map(
            (exchange) => (
              <div
                key={
                  exchange.exchange
                }
                className="grid grid-cols-[1.1fr_.8fr_1fr_1fr_.9fr_.9fr] items-center gap-3 rounded-lg border border-border-default bg-panel-light px-3 py-3 text-xs"
              >
                <span className="font-semibold uppercase text-text-primary">
                  {exchange.exchange}
                </span>

                <span className="font-mono text-text-primary">
                  {exchange.observations}
                </span>

                <span className="font-mono text-text-primary">
                  {(exchange.shadowAvailabilityRatio *
                    100).toFixed(2)}%
                </span>

                <span className="font-mono text-text-primary">
                  {(exchange.paperAvailabilityRatio *
                    100).toFixed(2)}%
                </span>

                <StatusBadge
                  label={
                    exchange.rollingShadowStable
                      ? "STABLE"
                      : "NOT PROVEN"
                  }
                  status={
                    exchange.rollingShadowStable
                      ? "good"
                      : "warning"
                  }
                />

                <StatusBadge
                  label={
                    exchange.rollingPaperStable
                      ? "STABLE"
                      : "NOT PROVEN"
                  }
                  status={
                    exchange.rollingPaperStable
                      ? "good"
                      : "warning"
                  }
                />
              </div>
            ),
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-3 text-xs text-text-muted">
        <span>
          Persistence: {report.evidence.persistenceHealthy
            ? "HEALTHY"
            : "FAILED"}
        </span>

        <span>
          Write failures: {report.persistence.writeFailures}
        </span>

        <span>
          LIVE submission: NO
        </span>
      </div>

      {report.blockers.length >
      0 ? (
        <div className="mt-4 rounded-lg border border-warning/20 bg-warning/10 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-warning">
            Rolling evidence blockers
          </p>

          <ul className="mt-2 space-y-1 text-xs leading-5 text-text-muted">
            {report.blockers
              .slice(
                0,
                8,
              )
              .map(
                (blocker) => (
                  <li
                    key={
                      blocker
                    }
                  >
                    {blocker}
                  </li>
                ),
              )}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function CapabilityValue({
  implemented,
  positive,
  implementedLabel,
}: {
  implemented: boolean;
  positive: boolean;
  implementedLabel: string;
}) {
  const label =
    implemented
      ? implementedLabel
      : "DOCUMENTED / NOT BUILT";

  const classes =
    positive
      ? "border-success/30 bg-success/10 text-success"
      : "border-warning/30 bg-warning/10 text-warning";

  return (
    <span
      className={`w-fit rounded-full border px-2 py-1 font-mono text-[10px] font-semibold ${classes}`}
    >
      {label.replaceAll(
        "_",
        " ",
      )}
    </span>
  );
}

function SmallMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border-default bg-panel-light p-3">
      <p className="text-[10px] uppercase tracking-[0.14em] text-text-muted">
        {label}
      </p>

      <p className="mt-1 font-mono text-lg font-bold text-text-primary">
        {value}
      </p>
    </div>
  );
}

function DataRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border-default pb-2 text-sm last:border-b-0 last:pb-0">
      <span className="text-text-muted">
        {label}
      </span>

      <span className="max-w-[60%] break-words text-right font-mono text-xs font-semibold text-text-primary">
        {value}
      </span>
    </div>
  );
}

function StatusBadge({
  label,
  status,
}: {
  label: string;
  status:
    | "good"
    | "warning"
    | "bad";
}) {
  const classes =
    status === "good"
      ? "border-success/30 bg-success/10 text-success"
      : status ===
          "warning"
        ? "border-warning/30 bg-warning/10 text-warning"
        : "border-danger/30 bg-danger/10 text-danger";

  return (
    <span
      className={`rounded-full border px-3 py-1 text-[10px] font-bold ${classes}`}
    >
      {label}
    </span>
  );
}

function ReasonList({
  reasons,
}: {
  reasons: string[];
}) {
  return (
    <div className="mt-3 space-y-2">
      {reasons.map(
        (
          reason,
        ) => (
          <div
            key={
              reason
            }
            className="rounded-lg border border-warning/20 bg-warning/10 p-3 text-xs leading-5 text-text-muted"
          >
            {reason}
          </div>
        ),
      )}
    </div>
  );
}

function normalize(
  value: string,
): string {
  return value
    .trim()
    .toLowerCase();
}

function formatExchangeName(
  exchange: string,
): string {
  switch (
    normalize(exchange)
  ) {
    case "coindcx":
      return "CoinDCX";

    case "binance":
      return "Binance";

    case "unocoin":
      return "UnoCoin";

    case "coinswitch":
      return "CoinSwitch";

    case "bybit":
      return "Bybit";

    default:
      return exchange;
  }
}

function formatSnapshotTime(
  timestamp: number,
): string {
  return new Date(
    timestamp,
  ).toLocaleTimeString(
    [],
    {
      hour12: false,
    },
  );
}

function formatDuration(
  milliseconds: number,
): string {
  if (
    milliseconds <
    1_000
  ) {
    return `${Math.round(
      milliseconds,
    )} ms`;
  }

  const seconds =
    milliseconds /
    1_000;

  if (seconds < 60) {
    return `${seconds.toFixed(
      1,
    )} s`;
  }

  return `${(
    seconds / 60
  ).toFixed(1)} min`;
}
