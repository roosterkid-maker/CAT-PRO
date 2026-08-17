import {
  Activity,
  AlertTriangle,
  RefreshCw,
  SearchCheck,
  ShieldAlert,
} from "lucide-react";

import {
  useState,
} from "react";

import type {
  FormEvent,
  ReactNode,
} from "react";

import {
  useAccountFeeVerification,
  useFeeAwareStrategyAnalytics,
  useOpportunityNearMissAnalytics,
} from "../hooks/useOpportunityEconomicsDiagnostics";

import type {
  AccountFeeVerificationExchange,
  AccountFeeVerificationReport,
  FeeAwareStrategyAnalyticsReport,
  OpportunityNearMissAnalyticsReport,
} from "../types/OpportunityEconomicsDiagnostics";

const SYMBOL_PATTERN =
  /^[A-Z0-9]{4,24}$/;

export default function OpportunityEconomicsDiagnosticsPanel() {
  const nearMissQuery =
    useOpportunityNearMissAnalytics();

  const feeStrategyQuery =
    useFeeAwareStrategyAnalytics();

  const accountFeeMutation =
    useAccountFeeVerification();

  const [
    symbolInput,
    setSymbolInput,
  ] = useState(
    "BTCUSDT",
  );

  const nearMiss =
    nearMissQuery.data?.data;

  const feeStrategy =
    feeStrategyQuery.data?.data;

  const accountFees =
    accountFeeMutation.data?.data;

  const normalizedSymbol =
    symbolInput
      .trim()
      .toUpperCase();

  const symbolValid =
    SYMBOL_PATTERN.test(
      normalizedSymbol,
    );

  const refreshing =
    nearMissQuery.isFetching ||
    feeStrategyQuery.isFetching;

  const refreshDiagnostics =
    async () => {
      await Promise.all([
        nearMissQuery.refetch(),
        feeStrategyQuery.refetch(),
      ]);
    };

  const verifyAccountFees =
    (
      event:
        FormEvent<HTMLFormElement>,
    ) => {
      event.preventDefault();

      if (!symbolValid) {
        return;
      }

      accountFeeMutation.reset();

      accountFeeMutation.mutate(
        normalizedSymbol,
      );
    };

  return (
    <section className="space-y-5 rounded-xl border border-border-default bg-panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-brand">
            <Activity className="size-4" />

            <p className="text-xs font-semibold uppercase tracking-[0.18em]">
              V19.20 - V19.22
            </p>
          </div>

          <h2 className="mt-1 text-2xl font-bold text-text-primary">
            Opportunity Economics Diagnostics
          </h2>

          <p className="mt-2 max-w-4xl text-sm leading-6 text-text-muted">
            Current-scan near misses, configured-fee scenarios and
            operator-triggered account fee verification. These diagnostics
            do not submit orders, change thresholds or mutate the fee
            registry.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded-full border border-success/30 bg-success/10 px-3 py-1 text-xs font-semibold text-success">
            READ ONLY
          </span>

          <button
            type="button"
            disabled={
              refreshing
            }
            onClick={() =>
              void refreshDiagnostics()
            }
            className="inline-flex items-center gap-2 rounded-md border border-border-default bg-panel-light px-3 py-2 text-xs font-semibold text-text-primary hover:border-brand/50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw
              className={`size-4 ${
                refreshing
                  ? "animate-spin"
                  : ""
              }`}
            />

            Refresh Scan
          </button>
        </div>
      </div>

      <NearMissPanel
        report={
          nearMiss
        }
        loading={
          nearMissQuery.isPending
        }
        error={
          nearMissQuery.isError
        }
      />

      <FeeStrategyPanel
        report={
          feeStrategy
        }
        loading={
          feeStrategyQuery.isPending
        }
        error={
          feeStrategyQuery.isError
        }
      />

      <AccountFeePanel
        report={
          accountFees
        }
        symbolInput={
          symbolInput
        }
        symbolValid={
          symbolValid
        }
        pending={
          accountFeeMutation.isPending
        }
        error={
          accountFeeMutation.isError
        }
        onSymbolChange={
          setSymbolInput
        }
        onSubmit={
          verifyAccountFees
        }
      />
    </section>
  );
}

function NearMissPanel({
  report,
  loading,
  error,
}: {
  report:
    | OpportunityNearMissAnalyticsReport
    | undefined;

  loading: boolean;

  error: boolean;
}) {
  return (
    <DiagnosticSection
      eyebrow="V19.20 / Current Scan"
      title="Opportunity Near Misses"
      generatedAt={
        report?.generatedAt
      }
    >
      {!report ? (
        <EvidenceState
          loading={
            loading
          }
          error={
            error
          }
          label="near-miss analytics"
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Metric
              label="Cached Quotes"
              value={
                report.pipeline.cachedQuotes
              }
            />

            <Metric
              label="Eligible Quotes"
              value={
                report.pipeline.executionQualityEligibleQuotes
              }
            />

            <Metric
              label="Economic Pairs"
              value={
                report.pipeline.economicallyEvaluatedPairs
              }
            />

            <Metric
              label="Accepted"
              value={
                report.pipeline.acceptedOpportunities
              }
            />

            <Metric
              label="Current Rejects"
              value={
                report.rejectionSummary.totalCurrentScanRejections
              }
            />
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
            <div className="rounded-lg border border-border-default bg-panel-light p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">
                Spread Bands
              </p>

              <div className="mt-3 space-y-2">
                <CountRow
                  label="Negative"
                  value={
                    report.spreadBands.negative
                  }
                />

                <CountRow
                  label="Zero to discovery"
                  value={
                    report.spreadBands.zeroToDiscovery
                  }
                />

                <CountRow
                  label="Discovery to qualification"
                  value={
                    report.spreadBands.discoveryToQualification
                  }
                />

                <CountRow
                  label="Qualification to LIVE threshold"
                  value={
                    report.spreadBands.qualificationToLive
                  }
                />

                <CountRow
                  label="At or above LIVE threshold"
                  value={
                    report.spreadBands.livePlus
                  }
                />
              </div>

              <p className="mt-3 text-xs leading-5 text-text-muted">
                A threshold band is diagnostic evidence only and never
                indicates LIVE readiness or permission.
              </p>
            </div>

            <div className="overflow-hidden rounded-lg border border-border-default bg-panel-light">
              <div className="border-b border-border-default px-4 py-3">
                <p className="font-semibold text-text-primary">
                  Top Rejected Economic Routes
                </p>
              </div>

              {report.topNearMisses.length ===
              0 ? (
                <EmptyState text="No economically evaluated near misses were reported for this scan." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-panel">
                      <tr className="text-left text-xs text-text-muted">
                        <th className="px-4 py-3">
                          Route
                        </th>

                        <th className="px-4 py-3 text-right">
                          Raw
                        </th>

                        <th className="px-4 py-3 text-right">
                          Net
                        </th>

                        <th className="px-4 py-3 text-right">
                          To Qualification
                        </th>

                        <th className="px-4 py-3">
                          Rejection
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {report.topNearMisses.map(
                        (
                          route,
                          index,
                        ) => (
                          <tr
                            key={`${route.market}-${route.buyExchange}-${route.sellExchange}-${route.rejectionCode ?? "none"}-${index}`}
                            className="border-t border-border-default"
                          >
                            <td className="px-4 py-3">
                              <p className="font-semibold text-text-primary">
                                {route.market}
                              </p>

                              <p className="mt-1 text-xs uppercase text-text-muted">
                                {route.buyExchange}
                                {" -> "}
                                {route.sellExchange}
                              </p>
                            </td>

                            <td className="px-4 py-3 text-right font-mono">
                              {formatPercent(
                                route.rawSpreadPercent,
                              )}
                            </td>

                            <td className="px-4 py-3 text-right font-mono">
                              {formatPercent(
                                route.netProfitPercent,
                              )}
                            </td>

                            <td className="px-4 py-3 text-right font-mono">
                              {formatPercent(
                                route.distanceToQualificationPercent,
                              )}
                            </td>

                            <td className="max-w-72 px-4 py-3 text-xs text-text-muted">
                              {route.rejectionCode ??
                                route.rejectionStage ??
                                "Not reported"}
                            </td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </DiagnosticSection>
  );
}

function FeeStrategyPanel({
  report,
  loading,
  error,
}: {
  report:
    | FeeAwareStrategyAnalyticsReport
    | undefined;

  loading: boolean;

  error: boolean;
}) {
  return (
    <DiagnosticSection
      eyebrow="V19.21 / Fee Scenarios"
      title="Fee-Aware Strategy Economics"
      generatedAt={
        report?.generatedAt
      }
    >
      {!report ? (
        <EvidenceState
          loading={
            loading
          }
          error={
            error
          }
          label="fee-strategy analytics"
        />
      ) : (
        <>
          <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 p-4">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" />

            <p className="text-sm leading-6 text-text-primary">
              {report.feeRegistryWarning}
            </p>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric
              label="Analyzed Routes"
              value={
                report.analyzedRoutes
              }
            />

            <Metric
              label="Fee Source"
              value={
                report.feeRegistrySource
              }
            />

            <Metric
              label="Qualification Net"
              value={formatPercent(
                report.profitPolicy.qualificationMinimumNetProfitPercent,
              )}
            />

            <Metric
              label="LIVE Net Threshold"
              value={formatPercent(
                report.profitPolicy.liveMinimumNetProfitPercent,
              )}
            />
          </div>

          <div className="mt-4 overflow-hidden rounded-lg border border-border-default bg-panel-light">
            {report.routes.length ===
            0 ? (
              <EmptyState text="No fee-strategy routes were available from the current near-miss scan." />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-panel">
                    <tr className="text-left text-xs text-text-muted">
                      <th className="px-4 py-3">
                        Route
                      </th>

                      <th className="px-4 py-3 text-right">
                        Raw Spread
                      </th>

                      <th className="px-4 py-3 text-right">
                        Current Taker Net
                      </th>

                      <th className="px-4 py-3">
                        Best Fee-Only Style
                      </th>

                      <th className="px-4 py-3 text-right">
                        Best Fee-Only Net
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {report.routes.map(
                      (
                        route,
                      ) => (
                        <tr
                          key={`${route.market}-${route.buyExchange}-${route.sellExchange}`}
                          className="border-t border-border-default"
                        >
                          <td className="px-4 py-3">
                            <p className="font-semibold text-text-primary">
                              {route.market}
                            </p>

                            <p className="mt-1 text-xs uppercase text-text-muted">
                              {route.buyExchange}
                              {" -> "}
                              {route.sellExchange}
                            </p>
                          </td>

                          <td className="px-4 py-3 text-right font-mono">
                            {formatPercent(
                              route.rawSpreadPercent,
                            )}
                          </td>

                          <td className="px-4 py-3 text-right font-mono">
                            {formatPercent(
                              route.currentTakerTakerNetProfitPercent,
                            )}
                          </td>

                          <td className="px-4 py-3 font-mono text-xs">
                            {formatLabel(
                              route.bestFeeOnlyScenario,
                            )}
                          </td>

                          <td className="px-4 py-3 text-right font-mono">
                            {formatPercent(
                              route.bestFeeOnlyNetPercent,
                            )}
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <p className="mt-3 text-xs leading-5 text-text-muted">
            Best fee-only scenarios can include hypothetical maker orders.
            Fill probability, adverse selection, slippage and safety buffers
            are not included and no scenario grants execution permission.
          </p>
        </>
      )}
    </DiagnosticSection>
  );
}

function AccountFeePanel({
  report,
  symbolInput,
  symbolValid,
  pending,
  error,
  onSymbolChange,
  onSubmit,
}: {
  report:
    | AccountFeeVerificationReport
    | undefined;

  symbolInput: string;

  symbolValid: boolean;

  pending: boolean;

  error: boolean;

  onSymbolChange:
    (value: string) => void;

  onSubmit:
    (
      event:
        FormEvent<HTMLFormElement>,
    ) => void;
}) {
  return (
    <DiagnosticSection
      eyebrow="V19.22 / Operator Triggered"
      title="Account Fee Verification"
      generatedAt={
        report?.generatedAt
      }
    >
      <div className="rounded-lg border border-border-default bg-panel-light p-4">
        <form
          onSubmit={
            onSubmit
          }
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
        >
          <label className="flex-1">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">
              Spot Symbol
            </span>

            <input
              value={
                symbolInput
              }
              onChange={
                (
                  event,
                ) =>
                  onSymbolChange(
                    event.target.value.toUpperCase(),
                  )
              }
              autoComplete="off"
              spellCheck={false}
              className="mt-2 w-full rounded-md border border-border-default bg-app-bg px-3 py-2 font-mono text-sm text-text-primary outline-none focus:border-brand"
              aria-invalid={
                !symbolValid
              }
            />
          </label>

          <button
            type="submit"
            disabled={
              pending ||
              !symbolValid
            }
            className="inline-flex items-center justify-center gap-2 rounded-md border border-brand/40 bg-brand/10 px-4 py-2 text-sm font-semibold text-brand hover:bg-brand/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <SearchCheck
              className={`size-4 ${
                pending
                  ? "animate-pulse"
                  : ""
              }`}
            />

            {pending
              ? "Verifying..."
              : "Verify Account Fees"}
          </button>
        </form>

        {!symbolValid ? (
          <p className="mt-2 text-xs text-warning">
            Use a 4-24 character uppercase exchange symbol containing only
            letters and numbers.
          </p>
        ) : null}

        <p className="mt-3 text-xs leading-5 text-text-muted">
          No authenticated fee request is made until this button is pressed.
          API secret values and opaque exchange metadata are never rendered.
        </p>
      </div>

      {error ? (
        <div className="mt-4 rounded-lg border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
          Account fee verification failed. Review sanitized backend logs;
          no upstream authentication details are displayed here.
        </div>
      ) : null}

      {!report &&
      !error ? (
        <div className="mt-4 rounded-lg border border-border-default bg-panel-light p-4 text-sm text-text-muted">
          Account fee verification has not been run in this operator session.
        </div>
      ) : null}

      {report ? (
        <AccountFeeReport
          report={
            report
          }
        />
      ) : null}
    </DiagnosticSection>
  );
}

function AccountFeeReport({
  report,
}: {
  report:
    AccountFeeVerificationReport;
}) {
  return (
    <div className="mt-4 space-y-4">
      <div
        className={`flex items-start gap-3 rounded-lg border p-4 ${
          report.safeToTrustStaticRegistryForLive
            ? "border-success/30 bg-success/10"
            : "border-danger/30 bg-danger/10"
        }`}
      >
        <ShieldAlert
          className={`mt-0.5 size-5 shrink-0 ${
            report.safeToTrustStaticRegistryForLive
              ? "text-success"
              : "text-danger"
          }`}
        />

        <div>
          <p className="font-semibold text-text-primary">
            {report.safeToTrustStaticRegistryForLive
              ? "All account fee checks match the static registry"
              : "Static fee evidence is not fully verified"}
          </p>

          <p className="mt-1 text-sm text-text-muted">
            This is fee evidence only. LIVE execution remains disabled and
            every independent production-safety gate still applies.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Symbol"
          value={
            report.symbol
          }
        />

        <Metric
          label="Verified"
          value={
            report.verifiedExchanges
          }
        />

        <Metric
          label="Mismatched"
          value={
            report.mismatchedExchanges
          }
        />

        <Metric
          label="Unresolved"
          value={
            report.unresolvedExchanges
          }
        />
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        {report.exchanges.map(
          (
            exchange,
          ) => (
            <ExchangeFeeCard
              key={
                exchange.exchange
              }
              exchange={
                exchange
              }
            />
          ),
        )}
      </div>

      {report.blockers.length >
      0 ? (
        <div className="rounded-lg border border-danger/30 bg-danger/10 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-danger">
            Fee Verification Blockers
          </p>

          <ul className="mt-2 space-y-1 text-sm text-text-primary">
            {report.blockers.map(
              (
                blocker,
              ) => (
                <li key={blocker}>
                  - {blocker}
                </li>
              ),
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function ExchangeFeeCard({
  exchange,
}: {
  exchange:
    AccountFeeVerificationExchange;
}) {
  const sensitiveFailure =
    exchange.status ===
      "AUTH_FAILED" ||
    exchange.status ===
      "FAILED";

  return (
    <article className="rounded-lg border border-border-default bg-panel-light p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bold uppercase text-text-primary">
            {exchange.exchange}
          </p>

          <p className="mt-1 font-mono text-xs text-text-muted">
            {formatLabel(
              exchange.evidenceQuality,
            )}
          </p>
        </div>

        <StatusBadge
          status={
            exchange.status
          }
        />
      </div>

      <div className="mt-4 space-y-2">
        <FeeRow
          label="Static maker"
          value={formatPercent(
            exchange.staticMakerPercent,
          )}
        />

        <FeeRow
          label="Static taker"
          value={formatPercent(
            exchange.staticTakerPercent,
          )}
        />

        <FeeRow
          label="Account maker"
          value={formatPercent(
            exchange.accountMakerPercent,
          )}
        />

        <FeeRow
          label="Account taker"
          value={formatPercent(
            exchange.accountTakerPercent,
          )}
        />
      </div>

      <p className="mt-4 text-xs leading-5 text-text-muted">
        {sensitiveFailure
          ? exchange.errorClassification
            ? `Verification unavailable (${formatLabel(
                exchange.errorClassification,
              )}). Raw upstream details are withheld.`
            : "Verification unavailable. Raw upstream details are withheld."
          : exchange.reasons.join(
              " ",
            ) ||
            "No verification reason was reported."}
      </p>
    </article>
  );
}

function DiagnosticSection({
  eyebrow,
  title,
  generatedAt,
  children,
}: {
  eyebrow: string;

  title: string;

  generatedAt:
    | number
    | undefined;

  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border-default bg-app-bg/30 p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
            {eyebrow}
          </p>

          <h3 className="mt-1 text-xl font-bold text-text-primary">
            {title}
          </h3>
        </div>

        <span className="font-mono text-xs text-text-muted">
          {generatedAt ===
          undefined
            ? "Evidence unavailable"
            : `Generated ${formatTimestamp(
                generatedAt,
              )}`}
        </span>
      </div>

      {children}
    </section>
  );
}

function EvidenceState({
  loading,
  error,
  label,
}: {
  loading: boolean;

  error: boolean;

  label: string;
}) {
  return (
    <div
      className={`rounded-lg border p-4 text-sm ${
        error
          ? "border-danger/30 bg-danger/10 text-danger"
          : "border-border-default bg-panel-light text-text-muted"
      }`}
    >
      {loading
        ? `Loading ${label}...`
        : error
          ? `${label} are unavailable. No conclusions are inferred.`
          : `No ${label} were returned.`}
    </div>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;

  value:
    | string
    | number;
}) {
  return (
    <div className="rounded-lg border border-border-default bg-panel-light p-4">
      <p className="text-xs uppercase tracking-[0.12em] text-text-muted">
        {label}
      </p>

      <p className="mt-2 break-words font-mono text-lg font-bold text-text-primary">
        {typeof value ===
        "number"
          ? value.toLocaleString()
          : value}
      </p>
    </div>
  );
}

function CountRow({
  label,
  value,
}: {
  label: string;

  value: number;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border-default pb-2 text-sm last:border-b-0 last:pb-0">
      <span className="text-text-muted">
        {label}
      </span>

      <span className="font-mono font-bold text-text-primary">
        {value.toLocaleString()}
      </span>
    </div>
  );
}

function FeeRow({
  label,
  value,
}: {
  label: string;

  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-text-muted">
        {label}
      </span>

      <span className="font-mono font-semibold text-text-primary">
        {value}
      </span>
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status:
    AccountFeeVerificationExchange["status"];
}) {
  const className =
    status ===
    "VERIFIED"
      ? "border-success/30 bg-success/10 text-success"
      : status ===
          "MISMATCH"
        ? "border-danger/30 bg-danger/10 text-danger"
        : "border-warning/30 bg-warning/10 text-warning";

  return (
    <span
      className={`rounded-full border px-2 py-1 text-[10px] font-bold ${className}`}
    >
      {status}
    </span>
  );
}

function EmptyState({
  text,
}: {
  text: string;
}) {
  return (
    <p className="p-6 text-center text-sm text-text-muted">
      {text}
    </p>
  );
}

function formatPercent(
  value:
    | number
    | null,
): string {
  if (
    value === null ||
    !Number.isFinite(value)
  ) {
    return "Unavailable";
  }

  return `${value.toFixed(
    4,
  )}%`;
}

function formatTimestamp(
  value: number,
): string {
  if (
    !Number.isFinite(value) ||
    value <= 0
  ) {
    return "unavailable";
  }

  return new Date(
    value,
  ).toLocaleTimeString();
}

function formatLabel(
  value: string,
): string {
  return value
    .replaceAll(
      "_",
      " ",
    )
    .toLowerCase();
}
