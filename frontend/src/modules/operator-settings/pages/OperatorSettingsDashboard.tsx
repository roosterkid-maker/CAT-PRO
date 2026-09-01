import {
  useState,
} from "react";

import {
  AlertTriangle,
  CircleDollarSign,
  Clock3,
  Gauge,
  KeyRound,
  LockKeyhole,
  RefreshCw,
  Save,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";

import {
  useOperatorSettings,
  useResetPaperTradingData,
  useUpdatePaperCapitalConfiguration,
  useUpdatePaperDailyAttemptLimit,
} from "../hooks/useOperatorSettings";

import type {
  OperatorSettingsReport,
} from "../types/OperatorSettings";

export default function OperatorSettingsDashboard() {
  const {
    data:
      response,

    isPending,

    isError,

    isFetching,

    refetch,
  } =
    useOperatorSettings();

  const report =
    response?.data;

  if (
    isPending &&
    !report
  ) {
    return (
      <PageShell>
        <StatePanel
          title="Loading operator settings…"
        />
      </PageShell>
    );
  }

  if (
    isError ||
    !report
  ) {
    return (
      <PageShell>
        <StatePanel
          title="Operator settings unavailable"
          actionLabel="Retry"
          onAction={() =>
            void refetch()
          }
        />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <section className="rounded-xl border border-border-default bg-panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-brand">
              <Settings2 className="size-4" />

              <p className="text-xs font-semibold uppercase tracking-[0.18em]">
                Operator Configuration
              </p>
            </div>

            <h1 className="mt-2 text-3xl font-bold text-text-primary">
              Safe Settings Console
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">
              Centralized visibility into
              the active trading account,
              runtime configuration,
              execution thresholds,
              exposure limits,
              freshness policy,
              credential status,
              and production guardrails.
              General settings are read-only;
              only the bounded PAPER capital,
              daily-attempt, and confirmed reset
              controls below are editable.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="rounded-full border border-success/30 bg-success/10 px-3 py-1 text-xs font-semibold text-success">
              PAPER OPERATOR CONTROLS
            </span>

            <button
              type="button"
              onClick={() =>
                void refetch()
              }
              disabled={
                isFetching
              }
              className="inline-flex items-center gap-2 rounded-md border border-border-default bg-panel-light px-3 py-2 text-xs font-semibold text-text-primary transition hover:border-brand/50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw
                className={`size-4 ${
                  isFetching
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
            label="Account Mode"
            value={
              report.account
                .mode
            }
            safe={
              report.account
                .mode !==
              "LIVE"
            }
          />

          <HeadlineMetric
            label="LIVE Environment"
            value={
              report.runtime
                .liveTradingEnabled
                ? "ENABLED"
                : "OFF"
            }
            safe={
              !report.runtime
                .liveTradingEnabled
            }
          />

          <HeadlineMetric
            label="Emergency Stop"
            value={
              report.account
                .emergencyStop
                ? "ACTIVE"
                : "CLEAR"
            }
            safe={
              !report.account
                .emergencyStop
            }
          />

          <HeadlineMetric
            label="Credentials"
            value={
              report.credentials
                .allConfigured
                ? "CONFIGURED"
                : "INCOMPLETE"
            }
            safe={
              report.credentials
                .allConfigured
            }
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-default bg-panel-light px-4 py-3 text-xs text-text-muted">
          <span>
            General mutation:{" "}
            <strong className="text-text-primary">
              DISABLED
            </strong>
          </span>

          <span>
            Bounded PAPER mutation:{" "}
            <strong className="text-success">
              ENABLED
            </strong>
          </span>

          <span>
            Endpoint mode:{" "}
            <strong className="text-text-primary">
              {
                report.mode
              }
            </strong>
          </span>

          <span className="inline-flex items-center gap-1.5">
            <Clock3 className="size-3.5" />

            {
              new Date(
                report.generatedAt,
              ).toLocaleString()
            }
          </span>
        </div>
      </section>

      <PaperCapitalConfigurationCard
        key={`${report.paperCapital.revision}:${report.paperCapital.updatedAt}`}
        configuration={
          report.paperCapital
        }
      />

      <section className="grid gap-4 xl:grid-cols-2">
        <DailyAttemptLimitCard
          key={
            report.account
              .limits
              .maximumDailyTrades
          }
          maximumDailyAttempts={
            report.account
              .limits
              .maximumDailyTrades
          }
          attemptsToday={
            report.account
              .tradesToday
          }
          controls={
            report.paperControls
          }
        />

        <PaperDataResetCard />
      </section>

      <StrategyOnePolicyCard
        policy={
          report.strategyOnePolicy
        }
      />

      <section className="grid gap-4 xl:grid-cols-2">
        <SettingsCard
          icon={
            <CircleDollarSign className="size-5 text-brand" />
          }
          title="Trading Account & Capital Limits"
        >
          <SettingsGrid
            items={[
              [
                "Account",
                report.account
                  .name,
              ],

              [
                "Enabled",
                yesNo(
                  report.account
                    .enabled,
                ),
              ],

              [
                "Initial Capital",
                money(
                  report.account
                    .initialCapital,
                ),
              ],

              [
                "Current Capital",
                money(
                  report.account
                    .currentCapital,
                ),
              ],

              [
                "Available Capital",
                money(
                  report.account
                    .availableCapital,
                ),
              ],

              [
                "Account Hard Ceiling / Trade",
                money(
                  report.account
                    .limits
                    .maximumCapitalPerTrade,
                ),
              ],

              [
                "Max Daily Loss",
                money(
                  report.account
                    .limits
                    .maximumDailyLoss,
                ),
              ],

              [
                "Max Open Trades",
                String(
                  report.account
                    .limits
                    .maximumOpenTrades,
                ),
              ],

              [
                "Max Daily Trades",
                String(
                  report.account
                    .limits
                    .maximumDailyTrades,
                ),
              ],

              [
                "Trades Today",
                String(
                  report.account
                    .tradesToday,
                ),
              ],

              [
                "Open Trades",
                String(
                  report.account
                    .openTrades,
                ),
              ],

              [
                "Today Loss",
                money(
                  report.account
                    .todayLoss,
                ),
              ],
            ]}
          />
        </SettingsCard>

        <SettingsCard
          icon={
            <SlidersHorizontal className="size-5 text-brand" />
          }
          title="Discovery & Legacy Defaults"
        >
          <p className="mb-4 rounded-lg border border-warning/25 bg-warning/5 px-3 py-2 text-xs leading-5 text-text-muted">
            Visibility and legacy defaults only. These values do not authorize a LIVE order; the versioned Strategy #1 policy above owns execution lineage.
          </p>

          <SettingsGrid
            items={[
              [
                "Min Spread",
                percent(
                  report
                    .opportunityPolicy
                    .minimumSpreadPercent,
                ),
              ],

              [
                "Min Net Profit",
                percent(
                  report
                    .opportunityPolicy
                    .minimumNetProfitPercent,
                ),
              ],

              [
                "Reference Capital",
                money(
                  report
                    .opportunityPolicy
                    .referenceCapital,
                ),
              ],

              [
                "Min Liquidity",
                percent(
                  report
                    .opportunityPolicy
                    .minimumLiquidityPercent,
                ),
              ],

              [
                "Max Quote Age",
                ms(
                  report
                    .opportunityPolicy
                    .maximumQuoteAgeMs,
                ),
              ],

              [
                "Last Price Fallback",
                yesNo(
                  report
                    .opportunityPolicy
                    .allowLastPriceFallback,
                ),
              ],

              [
                "Legacy Execution Hard Ceiling",
                money(
                  report
                    .executionPolicy
                    .maximumCapitalPerTrade,
                ),
              ],

              [
                "Execution Min Profit",
                percent(
                  report
                    .executionPolicy
                    .minimumNetProfitPercent,
                ),
              ],

              [
                "Buy Slippage",
                percent(
                  report
                    .executionPolicy
                    .executableProfit
                    .buySlippagePercent,
                ),
              ],

              [
                "Sell Slippage",
                percent(
                  report
                    .executionPolicy
                    .executableProfit
                    .sellSlippagePercent,
                ),
              ],

              [
                "Safety Buffer",
                percent(
                  report
                    .executionPolicy
                    .executableProfit
                    .safetyBufferPercent,
                ),
              ],

              [
                "Kill Switch",
                yesNo(
                  report
                    .executionPolicy
                    .killSwitchEnabled,
                ),
              ],
            ]}
          />
        </SettingsCard>

        <SettingsCard
          icon={
            <ShieldCheck className="size-5 text-brand" />
          }
          title="Exposure & Freshness Guardrails"
        >
          <SettingsGrid
            items={[
              [
                "Total Open Capital",
                percent(
                  report
                    .exposureLimits
                    .maximumTotalOpenCapitalPercent,
                ),
              ],

              [
                "Single Position",
                percent(
                  report
                    .exposureLimits
                    .maximumSinglePositionPercent,
                ),
              ],

              [
                "Exchange Exposure",
                percent(
                  report
                    .exposureLimits
                    .maximumExchangeExposurePercent,
                ),
              ],

              [
                "Market Exposure",
                percent(
                  report
                    .exposureLimits
                    .maximumMarketExposurePercent,
                ),
              ],

              [
                "Warning Threshold",
                percent(
                  report
                    .exposureLimits
                    .warningThresholdPercentOfLimit,
                ),
              ],

              [
                "Eviction Interval",
                ms(
                  report
                    .freshness
                    .evictionIntervalMs,
                ),
              ],

              [
                "Default Quote Age",
                ms(
                  report
                    .freshness
                    .defaultRule
                    .maximumQuoteAgeMs,
                ),
              ],

              [
                "Default Pair Skew",
                ms(
                  report
                    .freshness
                    .defaultRule
                    .maximumPairSkewMs,
                ),
              ],

              ...Object.entries(
                report.freshness
                  .exchanges,
              ).map(
                (
                  [
                    exchange,
                    rule,
                  ],
                ) =>
                  [
                    `${exchange.toUpperCase()} Freshness`,

                    `${ms(
                      rule.maximumQuoteAgeMs,
                    )} / skew ${ms(
                      rule.maximumPairSkewMs,
                    )}`,
                  ] as [
                    string,
                    string,
                  ],
              ),
            ]}
          />
        </SettingsCard>

        <SettingsCard
          icon={
            <KeyRound className="size-5 text-brand" />
          }
          title="Credential Safety Status"
        >
          <div className="space-y-3">
            {
              report
                .credentials
                .exchanges
                .map(
                  (
                    exchange,
                  ) => (
                    <div
                      key={
                        exchange.exchange
                      }
                      className="rounded-lg border border-border-default bg-panel-light p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-text-primary">
                            {
                              exchange.exchange
                                .toUpperCase()
                            }
                          </p>

                          <p className="mt-1 text-xs text-text-muted">
                            Source:{" "}
                            {
                              exchange.source
                            }{" "}
                            · values hidden
                          </p>
                        </div>

                        <StatusPill
                          label={
                            exchange.configured
                              ? "CONFIGURED"
                              : "NOT CONFIGURED"
                          }
                          safe={
                            exchange.configured
                          }
                        />
                      </div>

                      <p className="mt-3 text-xs text-text-muted">
                        Required variables:{" "}
                        {
                          exchange
                            .requiredVariables
                            .join(
                              ", ",
                            )
                        }
                      </p>
                    </div>
                  ),
                )
            }

            <SettingsGrid
              items={[
                [
                  "Credential Values Returned",
                  yesNo(
                    report.credentials
                      .credentialValuesReturned,
                  ),
                ],

                [
                  "Log Redaction",
                  yesNo(
                    report.credentials
                      .logRedactionEnabled,
                  ),
                ],

                [
                  "Audit Redaction",
                  yesNo(
                    report.credentials
                      .auditRedactionEnabled,
                  ),
                ],
              ]}
            />
          </div>
        </SettingsCard>

        <SettingsCard
          icon={
            <LockKeyhole className="size-5 text-brand" />
          }
          title="Tiny-LIVE Guardrail"
        >
          <SettingsGrid
            items={[
              [
                "Mode",
                "PREFLIGHT ONLY",
              ],

              [
                "Minimum Capital",
                money(
                  report.tinyLive
                    .minimumCapital,
                ),
              ],

              [
                "Maximum Capital",
                money(
                  report.tinyLive
                    .maximumCapital,
                ),
              ],

              [
                "Currency",
                report.tinyLive
                  .currency,
              ],

              [
                "Order Submission From Settings",
                "DISABLED",
              ],
            ]}
          />
        </SettingsCard>

        <SettingsCard
          icon={
            <Settings2 className="size-5 text-brand" />
          }
          title="Runtime Environment"
        >
          <SettingsGrid
            items={[
              [
                "Node Environment",
                report.runtime
                  .nodeEnv,
              ],

              [
                "Trading Mode",
                report.runtime
                  .tradingMode,
              ],

              [
                "Frontend Origin",
                report.runtime
                  .frontendOrigin,
              ],

              [
                "Execution Timeout",
                ms(
                  report.runtime
                    .executionTimeoutMs,
                ),
              ],

              [
                "Polling Interval",
                ms(
                  report.runtime
                    .executionPollingIntervalMs,
                ),
              ],

              [
                "Cancel On Timeout",
                yesNo(
                  report.runtime
                    .executionCancelOnTimeout,
                ),
              ],

              [
                "Runtime Quote Age",
                ms(
                  report.runtime
                    .maximumQuoteAgeMs,
                ),
              ],

              [
                "Runtime Min Profit",
                percent(
                  report.runtime
                    .minimumNetProfitPercent,
                ),
              ],

              [
                "Runtime Min Liquidity",
                percent(
                  report.runtime
                    .minimumLiquidityPercent,
                ),
              ],

              [
                "Log Level",
                report.runtime
                  .logLevel,
              ],

              [
                "Log Directory",
                report.runtime
                  .logDirectory,
              ],
            ]}
          />
        </SettingsCard>
      </section>

      <section className="rounded-xl border border-border-default bg-panel p-5">
        <div className="flex items-center gap-2">
          <LockKeyhole className="size-5 text-success" />

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
              Safety Invariants
            </p>

            <h2 className="mt-1 text-lg font-bold text-text-primary">
              Settings cannot bypass
              production safety
            </h2>
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {
            report
              .safetyInvariants
              .map(
                (
                  item,
                ) => (
                  <div
                    key={
                      item
                    }
                    className="flex gap-3 rounded-lg border border-success/20 bg-success/5 p-3 text-sm leading-6 text-text-muted"
                  >
                    <ShieldCheck className="mt-1 size-4 shrink-0 text-success" />

                    <span>
                      {
                        item
                      }
                    </span>
                  </div>
                ),
              )
          }
        </div>
      </section>
    </PageShell>
  );
}

function StrategyOnePolicyCard({
  policy,
}: {
  policy:
    OperatorSettingsReport["strategyOnePolicy"];
}) {
  const active =
    policy.active;

  const values =
    active.values;

  const shortHash =
    active.policyHash.slice(
      0,
      12,
    );

  const stages = [
    {
      name: "01 · Discovery",
      state: "OBSERVE",
      rows: [
        `Spread ≥ ${percent(values.discovery.minimumSpreadPercent)}`,
        `Visible net ≥ ${percent(values.discovery.minimumNetProfitPercent)}`,
        `Reference ${money(values.discovery.referenceCapitalInr)}`,
        `Quote age ≤ ${ms(values.discovery.maximumQuoteAgeMs)}`,
      ],
    },
    {
      name: "02 · Qualification",
      state: "PERSIST",
      rows: [
        `Net ≥ ${percent(values.qualification.minimumNetProfitPercent)}`,
        `${values.qualification.minimumConsecutiveObservations} observations / ${ms(values.qualification.minimumPersistenceMs)}`,
        `Liquidity score ≥ ${values.qualification.minimumLiquidityScore}`,
        `Freshness score ≥ ${values.qualification.minimumFreshnessScore}`,
      ],
    },
    {
      name: "03 · PAPER",
      state: "EXECUTE",
      rows: [
        `Net ≥ ${percent(values.paper.minimumNetProfitPercent)}`,
        `Snapshot ≤ ${ms(values.paper.maximumSnapshotAgeMs)}`,
        `Max ${money(values.paper.maximumCapitalPerTradeInr)} / trade`,
        "100% two-leg depth required",
      ],
    },
    {
      name: "04 · Tiny-LIVE",
      state: "PREFLIGHT ONLY",
      rows: [
        `${money(values.tinyLive.capitalPerLegInr)} / leg · one trade`,
        `Net ≥ ${percent(values.tinyLive.minimumNetProfitPercent)}`,
        "Parallel + pre-funded required",
        "Order-time quote TTL not calibrated",
      ],
    },
  ];

  return (
    <section className="overflow-hidden rounded-xl border border-cyan-400/30 bg-panel">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border-default bg-cyan-400/5 px-5 py-4">
        <div className="flex items-start gap-3">
          <span className="rounded-lg border border-cyan-400/30 bg-cyan-400/10 p-2 text-cyan-300">
            <SlidersHorizontal className="size-5" />
          </span>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-300">
              V102 Strategy #1 Policy Lineage
            </p>

            <h2 className="mt-1 text-lg font-bold text-text-primary">
              {active.label}
            </h2>

            <p className="mt-1 max-w-3xl text-xs leading-5 text-text-muted">
              {active.rationale}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] font-bold">
          <span className="rounded-full border border-success/30 bg-success/10 px-3 py-1 text-success">
            ACTIVE · REV {active.revision}
          </span>

          <span className="rounded-full border border-danger/30 bg-danger/10 px-3 py-1 text-danger">
            LIVE ORDERS OFF
          </span>

          <span className="rounded-full border border-border-default bg-panel-light px-3 py-1 text-text-muted">
            SHA {shortHash}
          </span>
        </div>
      </div>

      <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-4">
        {stages.map(
          (
            stage,
          ) => (
            <div
              key={stage.name}
              className="rounded-lg border border-border-default bg-panel-light p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-brand">
                  {stage.name}
                </p>

                <span className="font-mono text-[9px] font-bold text-text-muted">
                  {stage.state}
                </span>
              </div>

              <div className="mt-3 space-y-2">
                {stage.rows.map(
                  (
                    row,
                  ) => (
                    <p
                      key={row}
                      className="font-mono text-[11px] text-text-primary"
                    >
                      {row}
                    </p>
                  ),
                )}
              </div>
            </div>
          ),
        )}
      </div>

      <div className="grid gap-3 border-t border-border-default px-5 py-4 lg:grid-cols-[1fr_1fr]">
        <div className={`rounded-lg border px-4 py-3 text-xs ${
          policy.activationGuard.clear
            ? "border-success/25 bg-success/5 text-success"
            : "border-warning/25 bg-warning/5 text-warning"
        }`}>
          <p className="font-bold">
            Atomic policy switch: {policy.activationGuard.clear ? "GUARD CLEAR" : "BLOCKED"}
          </p>

          <p className="mt-1 leading-5 text-text-muted">
            Bot paused + zero open positions, sessions, locks, orders and recovery incidents are mandatory before a different registered policy can activate.
          </p>
        </div>

        <div className="rounded-lg border border-danger/25 bg-danger/5 px-4 py-3 text-xs">
          <p className="font-bold text-danger">
            Last-look LIVE gate: NOT READY
          </p>

          <p className="mt-1 leading-5 text-text-muted">
            Millisecond order-time quote TTL, audited IOC/FOK behavior, websocket fill confirmation and bounded residual recovery remain fail-closed for the next execution-risk build.
          </p>
        </div>
      </div>
    </section>
  );
}

type PaperCapitalFormState = {
  capitalBudgetInr: string;
  minimumCapitalPerTrade: string;
  maximumCapitalPerTrade: string;
  capitalStep: string;
  maximumExecutionsPerBatch: string;
  maximumBatchCapital: string;
};

function DailyAttemptLimitCard({
  maximumDailyAttempts,
  attemptsToday,
  controls,
}: {
  maximumDailyAttempts:
    number;
  attemptsToday:
    number;
  controls:
    OperatorSettingsReport["paperControls"];
}) {
  const update =
    useUpdatePaperDailyAttemptLimit();

  const [
    value,
    setValue,
  ] =
    useState(
      String(
        maximumDailyAttempts,
      ),
    );

  const parsed =
    Number(
      value,
    );

  const valid =
    Number.isSafeInteger(
      parsed,
    ) &&
    parsed >=
      controls.minimumDailyAttemptLimit &&
    parsed <=
      controls.maximumDailyAttemptLimit;

  return (
    <section className="overflow-hidden rounded-xl border border-brand/25 bg-panel">
      <div className="flex items-start gap-3 border-b border-border-default bg-brand/5 px-5 py-4">
        <span className="rounded-lg border border-brand/30 bg-brand/10 p-2 text-brand">
          <Gauge className="size-5" />
        </span>

        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">
            PAPER throughput control
          </p>

          <h2 className="mt-1 text-lg font-bold text-text-primary">
            Daily attempt safety limit
          </h2>

          <p className="mt-1 text-xs leading-5 text-text-muted">
            Controls capital-reservation attempts per local day. It does not enable LIVE trading or bypass risk checks.
          </p>
        </div>
      </div>

      <div className="grid gap-4 p-5 sm:grid-cols-[1fr_auto] sm:items-end">
        <label>
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
            Maximum attempts / day
          </span>

          <span className="mt-2 flex items-center rounded-md border border-border-default bg-panel-light px-3 py-2 focus-within:border-brand/60">
            <input
              type="number"
              min={
                controls.minimumDailyAttemptLimit
              }
              max={
                controls.maximumDailyAttemptLimit
              }
              step="1"
              value={
                value
              }
              onChange={
                (
                  event,
                ) =>
                  setValue(
                    event.target.value,
                  )
              }
              className="min-w-0 flex-1 bg-transparent font-mono text-base font-bold text-text-primary outline-none"
            />
          </span>

          <span className="mt-1.5 block text-[10px] text-text-muted">
            Allowed {controls.minimumDailyAttemptLimit}–{controls.maximumDailyAttemptLimit} · used today {attemptsToday}
          </span>
        </label>

        <button
          type="button"
          onClick={
            () =>
              update.mutate({
                maximumDailyAttempts:
                  parsed,

                confirmation:
                  "UPDATE_PAPER_DAILY_ATTEMPT_LIMIT",
              })
          }
          disabled={
            !valid ||
            parsed ===
              maximumDailyAttempts ||
            update.isPending
          }
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand px-4 text-xs font-bold text-white transition hover:bg-brand/85 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Save className="size-4" />

          {
            update.isPending
              ? "Saving…"
              : "Save daily limit"
          }
        </button>
      </div>

      {
        update.isSuccess
          ? (
              <p className="mx-5 mb-5 rounded-lg border border-success/25 bg-success/10 px-3 py-2 text-[11px] text-success">
                Daily PAPER attempt limit saved. The value remains active after restart.
              </p>
            )
          : null
      }

      {
        update.isError
          ? (
              <p className="mx-5 mb-5 rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-[11px] text-danger">
                {
                  getMutationErrorMessage(
                    update.error,
                  )
                }
              </p>
            )
          : null
      }
    </section>
  );
}

function PaperDataResetCard() {
  const reset =
    useResetPaperTradingData();

  const [
    confirmation,
    setConfirmation,
  ] =
    useState(
      "",
    );

  const confirmed =
    confirmation ===
    "RESET PAPER";

  const executeReset =
    () => {
      reset.mutate(
        {
          confirmation:
            "RESET_ALL_PAPER_TRADING_DATA",
        },

        {
          onSuccess:
            () =>
              setConfirmation(
                "",
              ),
        },
      );
    };

  return (
    <section className="overflow-hidden rounded-xl border border-danger/30 bg-panel">
      <div className="flex items-start gap-3 border-b border-danger/20 bg-danger/5 px-5 py-4">
        <span className="rounded-lg border border-danger/30 bg-danger/10 p-2 text-danger">
          <AlertTriangle className="size-5" />
        </span>

        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-danger">
            Danger zone
          </p>

          <h2 className="mt-1 text-lg font-bold text-text-primary">
            Reset all PAPER trading data
          </h2>

          <p className="mt-1 text-xs leading-5 text-text-muted">
            Permanently clears PAPER trades, attempts, P&amp;L, journals, simulated inventory, soak evidence, and central PAPER state. Capital settings, credentials, market data, and LIVE evidence stay untouched. BOT will remain OFF.
          </p>
        </div>
      </div>

      <div className="p-5">
        <label>
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
            Type RESET PAPER to confirm
          </span>

          <input
            type="text"
            autoComplete="off"
            spellCheck={
              false
            }
            value={
              confirmation
            }
            onChange={
              (
                event,
              ) =>
                setConfirmation(
                  event.target.value,
                )
            }
            className="mt-2 w-full rounded-md border border-border-default bg-panel-light px-3 py-2 font-mono text-sm font-bold text-text-primary outline-none focus:border-danger/60"
          />
        </label>

        <button
          type="button"
          onClick={
            executeReset
          }
          disabled={
            !confirmed ||
            reset.isPending
          }
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-danger/40 bg-danger/15 px-4 py-2.5 text-xs font-bold text-danger transition hover:bg-danger/25 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <Trash2 className="size-4" />

          {
            reset.isPending
              ? "Resetting PAPER data…"
              : "Reset PAPER data"
          }
        </button>

        {
          reset.isSuccess
            ? (
                <p className="mt-3 rounded-lg border border-success/25 bg-success/10 px-3 py-2 text-[11px] leading-5 text-success">
                  Reset complete: {reset.data.reset.cleared.paperTrades} trades and {reset.data.reset.cleared.dailyReservationAttempts} daily attempts cleared. BOT is OFF.
                </p>
              )
            : null
        }

        {
          reset.isError
            ? (
                <p className="mt-3 rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-[11px] leading-5 text-danger">
                  {
                    getMutationErrorMessage(
                      reset.error,
                    )
                  }
                </p>
              )
            : null
        }
      </div>
    </section>
  );
}

function PaperCapitalConfigurationCard({
  configuration,
}: {
  configuration:
    OperatorSettingsReport["paperCapital"];
}) {
  const update =
    useUpdatePaperCapitalConfiguration();

  const [
    form,
    setForm,
  ] =
    useState<PaperCapitalFormState>(
      () =>
        toPaperCapitalForm(
          configuration,
        ),
    );

  const setField =
    (
      field:
        keyof PaperCapitalFormState,

      value:
        string,
    ) => {
      setForm(
        (
          current,
        ) => ({
          ...current,
          [field]:
            value,
        }),
      );
    };

  const save =
    () => {
      update.mutate({
        capitalBudgetInr:
          Number(
            form.capitalBudgetInr,
          ),

        minimumCapitalPerTrade:
          Number(
            form.minimumCapitalPerTrade,
          ),

        maximumCapitalPerTrade:
          Number(
            form.maximumCapitalPerTrade,
          ),

        capitalStep:
          Number(
            form.capitalStep,
          ),

        maximumExecutionsPerBatch:
          Number(
            form.maximumExecutionsPerBatch,
          ),

        maximumBatchCapital:
          Number(
            form.maximumBatchCapital,
          ),

        confirmation:
          "UPDATE_PAPER_CAPITAL_CONFIGURATION",
      });
    };

  return (
    <section className="overflow-hidden rounded-xl border border-brand/30 bg-panel">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border-default bg-brand/5 px-5 py-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 rounded-lg border border-brand/30 bg-brand/10 p-2 text-brand">
            <CircleDollarSign className="size-5" />
          </span>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">
              V86 Unified Capital Owner
            </p>

            <h2 className="mt-1 text-lg font-bold text-text-primary">
              Strategy #1 PAPER Capital
            </h2>

            <p className="mt-1 max-w-3xl text-xs leading-5 text-text-muted">
              This deployable budget controls the allocator, scheduler, and PAPER execution controller together. Accounting equity and settled P&amp;L history are preserved.
            </p>
          </div>
        </div>

        <div className="text-right">
          <span className="rounded-full border border-success/30 bg-success/10 px-3 py-1 font-mono text-[10px] font-bold text-success">
            PAPER ONLY · REV {configuration.revision}
          </span>

          <p className="mt-2 font-mono text-[10px] text-text-muted">
            LIVE OFF · ORDERS OFF
          </p>
        </div>
      </div>

      <div className="grid gap-5 p-5 xl:grid-cols-[1.7fr_.8fr]">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <CapitalInput
            label="Deployable PAPER budget"
            value={form.capitalBudgetInr}
            onChange={
              (
                value,
              ) =>
                setField(
                  "capitalBudgetInr",
                  value,
                )
            }
            detail="Upper bound; does not reset equity"
          />

          <CapitalInput
            label="Minimum / trade"
            value={form.minimumCapitalPerTrade}
            min={100}
            max={1_000}
            onChange={
              (
                value,
              ) =>
                setField(
                  "minimumCapitalPerTrade",
                  value,
                )
            }
            detail="Hard minimum ₹100"
          />

          <CapitalInput
            label="Maximum / trade"
            value={form.maximumCapitalPerTrade}
            min={100}
            max={1_000}
            onChange={
              (
                value,
              ) =>
                setField(
                  "maximumCapitalPerTrade",
                  value,
                )
            }
            detail="Hard safety ceiling ₹1,000"
          />

          <CapitalInput
            label="Capital step"
            value={form.capitalStep}
            onChange={
              (
                value,
              ) =>
                setField(
                  "capitalStep",
                  value,
                )
            }
            detail="Optimizer tests ₹100 increments"
          />

          <CapitalInput
            label="Executions / batch"
            value={form.maximumExecutionsPerBatch}
            onChange={
              (
                value,
              ) =>
                setField(
                  "maximumExecutionsPerBatch",
                  value,
                )
            }
            detail="Whole number from 1 to 10"
            prefix=""
          />

          <CapitalInput
            label="Maximum batch capital"
            value={form.maximumBatchCapital}
            onChange={
              (
                value,
              ) =>
                setField(
                  "maximumBatchCapital",
                  value,
                )
            }
            detail="Shared ceiling across selected routes"
          />
        </div>

        <div className="rounded-xl border border-border-default bg-panel-light/45 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
            Accounting snapshot
          </p>

          <div className="mt-3 space-y-2 text-xs">
            <CapitalSummaryRow
              label="Configured budget"
              value={
                money(
                  configuration.capitalBudgetInr,
                )
              }
            />

            <CapitalSummaryRow
              label="Current equity"
              value={
                money(
                  configuration.accountingEquityInr,
                )
              }
            />

            <CapitalSummaryRow
              label="Available equity"
              value={
                money(
                  configuration.availableAccountingEquityInr,
                )
              }
            />

            <CapitalSummaryRow
              label="Adaptive range"
              value={`${money(configuration.minimumCapitalPerTrade)} – ${money(configuration.maximumCapitalPerTrade)}`}
            />
          </div>

          <button
            type="button"
            onClick={
              save
            }
            disabled={
              update.isPending
            }
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-xs font-bold text-white transition hover:bg-brand/85 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save className="size-4" />

            {
              update.isPending
                ? "Saving…"
                : "Save PAPER capital"
            }
          </button>

          {
            update.isSuccess
              ? (
                  <p className="mt-3 rounded-lg border border-success/25 bg-success/10 px-3 py-2 text-[11px] text-success">
                    Capital limits saved and applied to the next PAPER allocation.
                  </p>
                )
              : null
          }

          {
            update.isError
              ? (
                  <p className="mt-3 rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-[11px] leading-5 text-danger">
                    {
                      getMutationErrorMessage(
                        update.error,
                      )
                    }
                  </p>
                )
              : null
          }
        </div>
      </div>
    </section>
  );
}

function CapitalInput({
  label,
  value,
  detail,
  onChange,
  prefix = "₹",
  min = 1,
  max,
}: {
  label: string;
  value: string;
  detail: string;
  onChange: (
    value:
      string,
  ) => void;
  prefix?: string;
  min?: number;
  max?: number;
}) {
  return (
    <label className="rounded-lg border border-border-default bg-panel-light/35 p-3">
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
        {label}
      </span>

      <span className="mt-2 flex items-center gap-2 rounded-md border border-border-default bg-panel px-3 py-2 focus-within:border-brand/60">
        {
          prefix
            ? (
                <span className="font-mono text-xs font-bold text-brand">
                  {prefix}
                </span>
              )
            : null
        }

        <input
          type="number"
          min={min}
          max={max}
          step="1"
          value={
            value
          }
          onChange={
            (
              event,
            ) =>
              onChange(
                event.target.value,
              )
          }
          className="min-w-0 flex-1 bg-transparent font-mono text-sm font-bold text-text-primary outline-none"
        />
      </span>

      <span className="mt-1.5 block text-[10px] leading-4 text-text-muted">
        {detail}
      </span>
    </label>
  );
}

function CapitalSummaryRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border-default/70 pb-2 last:border-0 last:pb-0">
      <span className="text-text-muted">
        {label}
      </span>

      <span className="font-mono font-bold text-text-primary">
        {value}
      </span>
    </div>
  );
}

function toPaperCapitalForm(
  configuration:
    OperatorSettingsReport["paperCapital"],
): PaperCapitalFormState {
  return {
    capitalBudgetInr:
      String(
        configuration.capitalBudgetInr,
      ),

    minimumCapitalPerTrade:
      String(
        configuration.minimumCapitalPerTrade,
      ),

    maximumCapitalPerTrade:
      String(
        configuration.maximumCapitalPerTrade,
      ),

    capitalStep:
      String(
        configuration.capitalStep,
      ),

    maximumExecutionsPerBatch:
      String(
        configuration.maximumExecutionsPerBatch,
      ),

    maximumBatchCapital:
      String(
        configuration.maximumBatchCapital,
      ),
  };
}

function getMutationErrorMessage(
  error:
    unknown,
): string {
  const responseMessage =
    (
      error as {
        response?: {
          data?: {
            message?: unknown;
          };
        };
      }
    )?.response?.data?.message;

  if (
    typeof responseMessage ===
      "string"
  ) {
    return responseMessage;
  }

  return error instanceof Error
    ? error.message
    : "Unable to update PAPER settings.";
}

function PageShell({
  children,
}: {
  children:
    React.ReactNode;
}) {
  return (
    <div className="space-y-4 p-5">
      {children}
    </div>
  );
}

function StatePanel({
  title,
  actionLabel,
  onAction,
}: {
  title:
    string;

  actionLabel?:
    string;

  onAction?:
    () => void;
}) {
  return (
    <section className="rounded-xl border border-border-default bg-panel p-8 text-center">
      <p className="text-sm font-semibold text-text-primary">
        {title}
      </p>

      {
        actionLabel &&
        onAction
          ? (
              <button
                type="button"
                onClick={
                  onAction
                }
                className="mt-4 rounded-md border border-border-default bg-panel-light px-4 py-2 text-xs font-semibold text-text-primary"
              >
                {
                  actionLabel
                }
              </button>
            )
          : null
      }
    </section>
  );
}

function HeadlineMetric({
  label,
  value,
  safe,
}: {
  label:
    string;

  value:
    string;

  safe:
    boolean;
}) {
  return (
    <div className="rounded-lg border border-border-default bg-panel-light p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">
        {label}
      </p>

      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-lg font-bold text-text-primary">
          {value}
        </p>

        <StatusPill
          label={
            safe
              ? "SAFE"
              : "CHECK"
          }
          safe={
            safe
          }
        />
      </div>
    </div>
  );
}

function StatusPill({
  label,
  safe,
}: {
  label:
    string;

  safe:
    boolean;
}) {
  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
        safe
          ? "border-success/30 bg-success/10 text-success"
          : "border-warning/30 bg-warning/10 text-warning"
      }`}
    >
      {label}
    </span>
  );
}

function SettingsCard({
  icon,
  title,
  children,
}: {
  icon:
    React.ReactNode;

  title:
    string;

  children:
    React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border-default bg-panel p-5">
      <div className="flex items-center gap-2">
        {icon}

        <h2 className="text-lg font-bold text-text-primary">
          {title}
        </h2>
      </div>

      <div className="mt-4">
        {children}
      </div>
    </section>
  );
}

function SettingsGrid({
  items,
}: {
  items:
    Array<
      [
        string,
        string,
      ]
    >;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {
        items.map(
          (
            [
              label,
              value,
            ],
          ) => (
            <div
              key={
                label
              }
              className="rounded-lg border border-border-default bg-panel-light px-3 py-3"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">
                {label}
              </p>

              <p className="mt-1 break-words text-sm font-semibold text-text-primary">
                {value}
              </p>
            </div>
          ),
        )
      }
    </div>
  );
}

function money(
  value:
    number,
): string {
  return new Intl.NumberFormat(
    "en-IN",
    {
      style:
        "currency",

      currency:
        "INR",

      maximumFractionDigits:
        2,
    },
  ).format(
    value,
  );
}

function percent(
  value:
    number,
): string {
  return `${value}%`;
}

function ms(
  value:
    number,
): string {
  return value >=
    1_000
    ? `${value / 1_000}s`
    : `${value}ms`;
}

function yesNo(
  value:
    boolean,
): string {
  return value
    ? "YES"
    : "NO";
}
