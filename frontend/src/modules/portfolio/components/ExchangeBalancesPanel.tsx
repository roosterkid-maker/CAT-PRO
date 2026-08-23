import {
  AlertTriangle,
  Clock3,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  WalletCards,
} from "lucide-react";

import {
  useExchangeBalances,
  useRefreshExchangeBalances,
} from "../hooks/useExchangeBalances";

import type {
  ExchangeBalanceExchange,
  ExchangeBalanceStatus,
} from "../types/ExchangeBalances";

const STATUS_PRESENTATION:
  Record<
    ExchangeBalanceStatus,
    {
      label: string;

      className: string;
    }
  > = {
  SYNCHRONIZED: {
    label:
      "LIVE BALANCE",
    className:
      "border-success/30 bg-success/10 text-success",
  },
  STALE: {
    label:
      "STALE",
    className:
      "border-warning/30 bg-warning/10 text-warning",
  },
  FAILED: {
    label:
      "READ FAILED",
    className:
      "border-danger/30 bg-danger/10 text-danger",
  },
  NOT_CONFIGURED: {
    label:
      "NOT CONFIGURED",
    className:
      "border-border-default bg-background-subtle text-text-muted",
  },
  PENDING: {
    label:
      "WAITING",
    className:
      "border-warning/30 bg-warning/10 text-warning",
  },
};

export default function ExchangeBalancesPanel() {
  const query =
    useExchangeBalances();

  const refresh =
    useRefreshExchangeBalances();

  const report =
    query.data?.data;

  const refreshing =
    query.isFetching ||
    refresh.isPending ||
    report
      ?.synchronizationInProgress ===
      true;

  return (
    <section className="dashboard-balance-deck overflow-hidden rounded-xl border border-border-default bg-panel">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border-default px-5 py-5">
        <div>
          <div className="flex items-center gap-2 text-accent-primary">
            <WalletCards className="size-4" />

            <p className="text-xs font-semibold uppercase tracking-[0.18em]">
              Authenticated wallet evidence
            </p>
          </div>

          <h2 className="mt-2 text-2xl font-bold text-text-primary">
            Exchange Balances
          </h2>

          <p className="mt-1 max-w-3xl text-sm text-text-muted">
            Fresh read-only balances from every CAT PRO exchange. Amounts stay in their native asset units; currencies are never added together.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {report ? (
            <div className="rounded-lg border border-border-default bg-background-subtle px-3 py-2 text-right">
              <p className="text-[10px] uppercase tracking-[0.16em] text-text-muted">
                Fresh exchanges
              </p>

              <p className="mt-1 font-mono text-lg font-bold text-text-primary">
                {report.totals.synchronized}/{report.totals.exchanges}
              </p>
            </div>
          ) : null}

          <button
            type="button"
            disabled={
              refresh.isPending
            }
            onClick={() =>
              refresh.mutate()
            }
            className="inline-flex items-center gap-2 rounded-lg border border-accent-primary/40 bg-accent-primary/10 px-4 py-2.5 text-sm font-semibold text-accent-primary transition hover:bg-accent-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw
              className={`size-4 ${refreshing ? "animate-spin" : ""}`}
            />

            Refresh balances
          </button>
        </div>
      </div>

      {query.isPending && !report ? (
        <PanelMessage
          icon={
            <RefreshCw className="size-5 animate-spin" />
          }
          title="Loading exchange balances"
          detail="Waiting for authenticated read-only evidence from the backend."
        />
      ) : query.isError || !report ? (
        <PanelMessage
          danger
          icon={
            <AlertTriangle className="size-5" />
          }
          title="Exchange balances unavailable"
          detail="The backend balance report could not be loaded. No zero balance is inferred."
        />
      ) : (
        <>
          <div className="grid gap-px bg-border-default md:grid-cols-2 2xl:grid-cols-5">
            {report.exchanges.map(
              (exchange) => (
                <ExchangeBalanceCard
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

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-default bg-background-subtle px-5 py-3 text-xs text-text-muted">
            <span>
              {report.totals.positiveAssets} positive asset balances across {report.totals.exchanges} exchanges
            </span>

            <span className="inline-flex items-center gap-1.5">
              <LockKeyhole className="size-3.5" />

              Read-only account endpoints · no order, transfer or withdrawal
            </span>
          </div>
        </>
      )}

      {refresh.isError ? (
        <div className="border-t border-danger/30 bg-danger/10 px-5 py-3 text-sm text-danger">
          Manual refresh failed at the dashboard transport layer. Existing balances were not replaced with zero.
        </div>
      ) : null}
    </section>
  );
}

function ExchangeBalanceCard({
  exchange,
}: {
  exchange:
    ExchangeBalanceExchange;
}) {
  const presentation =
    STATUS_PRESENTATION[
      exchange.status
    ];

  return (
    <article className="dashboard-balance-card min-w-0 bg-panel p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
            Exchange
          </p>

          <h3 className="mt-1 truncate text-lg font-bold text-text-primary">
            {exchange.displayName}
          </h3>
        </div>

        <span className={`shrink-0 rounded-full border px-2 py-1 text-[9px] font-bold ${presentation.className}`}>
          {presentation.label}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <MiniMetric
          label="Positive"
          value={
            exchange.positiveAssetCount
          }
        />

        <MiniMetric
          label="Fetched"
          value={
            exchange.synchronizedAssetCount
          }
        />
      </div>

      <div className="mt-4 flex items-center gap-2 border-y border-border-default py-2 text-[11px] text-text-muted">
        <Clock3 className="size-3.5 shrink-0" />

        <span>
          {exchange.lastSynchronizedAt ===
          null
            ? "Never synchronized"
            : `Synced ${formatAge(exchange.balanceAgeMs)} ago`}
        </span>
      </div>

      {exchange.assets.length >
      0 ? (
        <div className="mt-3 max-h-64 overflow-auto">
          <table className="w-full min-w-[320px] text-left text-[11px]">
            <thead className="sticky top-0 bg-panel text-[9px] uppercase tracking-[0.12em] text-text-muted">
              <tr>
                <th className="pb-2 font-semibold">
                  Asset
                </th>

                <th className="pb-2 text-right font-semibold">
                  Free
                </th>

                <th className="pb-2 text-right font-semibold">
                  Locked
                </th>

                <th className="pb-2 text-right font-semibold">
                  Total
                </th>
              </tr>
            </thead>

            <tbody>
              {exchange.assets.map(
                (asset) => (
                  <tr
                    key={
                      asset.asset
                    }
                    className="border-t border-border-default/70"
                  >
                    <td className="py-2 font-bold text-text-primary">
                      {asset.asset}
                    </td>

                    <td className="py-2 text-right font-mono tabular-nums text-success">
                      {formatBalance(
                        asset.availableBalance,
                        asset.asset,
                      )}
                    </td>

                    <td className="py-2 text-right font-mono tabular-nums text-text-muted">
                      {formatBalance(
                        asset.lockedBalance,
                        asset.asset,
                      )}
                    </td>

                    <td className="py-2 text-right font-mono font-semibold tabular-nums text-text-primary">
                      {formatBalance(
                        asset.totalBalance,
                        asset.asset,
                      )}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-3 rounded-lg border border-border-default bg-background-subtle p-3 text-xs text-text-muted">
          {exchange.status ===
          "SYNCHRONIZED"
            ? "Authenticated read succeeded; no positive holdings were returned."
            : exchange.reasons[0] ??
              "Balance evidence is unavailable."}
        </div>
      )}

      {exchange.retainedAfterFailure ? (
        <p className="mt-3 text-[11px] leading-relaxed text-warning">
          Last-known balances retained after the latest read failed; do not treat them as fresh.
        </p>
      ) : exchange.assets.length >
          0 &&
        (
          exchange.status ===
            "FAILED" ||
          exchange.status ===
            "STALE"
        ) ? (
        <p className="mt-3 text-[11px] leading-relaxed text-danger">
          {exchange.reasons[0] ??
            "Fresh balance evidence is unavailable."}
        </p>
      ) : null}

      {exchange.status ===
      "SYNCHRONIZED" ? (
        <div className="mt-3 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-success">
          <ShieldCheck className="size-3.5" />

          Authenticated read verified
        </div>
      ) : null}
    </article>
  );
}

function MiniMetric({
  label,
  value,
}: {
  label: string;

  value: number;
}) {
  return (
    <div className="rounded-lg border border-border-default bg-background-subtle px-3 py-2">
      <p className="text-[9px] uppercase tracking-[0.14em] text-text-muted">
        {label}
      </p>

      <p className="mt-1 font-mono text-base font-bold text-text-primary">
        {value}
      </p>
    </div>
  );
}

function PanelMessage({
  icon,
  title,
  detail,
  danger =
    false,
}: {
  icon: React.ReactNode;

  title: string;

  detail: string;

  danger?: boolean;
}) {
  return (
    <div className={`m-5 flex items-start gap-3 rounded-lg border p-4 ${danger ? "border-danger/30 bg-danger/10 text-danger" : "border-border-default bg-background-subtle text-text-muted"}`}>
      {icon}

      <div>
        <p className="font-semibold">
          {title}
        </p>

        <p className="mt-1 text-sm opacity-80">
          {detail}
        </p>
      </div>
    </div>
  );
}

function formatAge(
  ageMs:
    number | null,
): string {
  if (ageMs ===
    null) {
    return "unknown";
  }

  if (ageMs <
    1_000) {
    return "<1s";
  }

  if (ageMs <
    60_000) {
    return `${Math.floor(ageMs / 1_000)}s`;
  }

  return `${Math.floor(ageMs / 60_000)}m`;
}

function formatBalance(
  value: number,
  asset: string,
): string {
  if (
    value >
      0 &&
    value <
      0.00000001
  ) {
    return "<0.00000001";
  }

  return new Intl.NumberFormat(
    "en-IN",
    {
      minimumFractionDigits:
        asset ===
        "INR"
          ? 2
          : 0,
      maximumFractionDigits:
        asset ===
        "INR"
          ? 2
          : 8,
    },
  ).format(
    value,
  );
}
