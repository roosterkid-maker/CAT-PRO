import {
  useMemo,
  useState,
} from "react";

import {
  PaperAutomationReadiness,
} from "@/modules/paper-trading/components/PaperAutomationReadiness";

import {
  PaperTradeDrawer,
} from "@/modules/paper-trading/components/PaperTradeDrawer";

import {
  PaperTradeSummaryCard,
} from "@/modules/paper-trading/components/PaperTradeSummaryCard";

import {
  PaperTradeTableRow,
} from "@/modules/paper-trading/components/PaperTradeTableRow";

import {
  SuccessfulTradeDemo,
} from "@/modules/paper-trading/components/SuccessfulTradeDemo";

import {
  usePaperTrades,
} from "@/modules/paper-trading/hooks/usePaperTrades";

import type {
  PaperTrade,
} from "@/modules/paper-trading/types/PaperTrade";

import {
  calculatePaperTradeMetrics,
} from "@/modules/paper-trading/utils/PaperTradeMetrics";

import {
  usePersonalStrategyOnePerformanceSummary,
} from "@/modules/strategies/hooks/useStrategies";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";

function formatCurrency(
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

      minimumFractionDigits:
        2,

      maximumFractionDigits:
        2,
    },
  ).format(
    value,
  );
}

function formatPercent(
  value:
    number | null,
): string {
  if (
    value ===
    null ||
    !Number.isFinite(
      value,
    )
  ) {
    return "—";
  }

  return `${value.toFixed(
    1,
  )}%`;
}

export default function PaperTrading() {
  const [
    historyCursor,
    setHistoryCursor,
  ] =
    useState<
      string | null
    >(
      null,
    );

  const [
    historyCursorStack,
    setHistoryCursorStack,
  ] =
    useState<
      (string | null)[]
    >(
      [],
    );

  const {
    data:
      paperTradesResponse,

    isLoading:
      paperTradesLoading,

    isError:
      paperTradesError,

    error:
      paperTradesLoadError,

    isFetching:
      paperTradesFetching,
  } =
    usePaperTrades(
      historyCursor,
    );

  const {
    data:
      personalBotResponse,

    isLoading:
      personalBotLoading,

    isError:
      personalBotError,

    error:
      personalBotLoadError,
  } =
    usePersonalStrategyOnePerformanceSummary();

  const [
    selectedTrade,
    setSelectedTrade,
  ] =
    useState<
      PaperTrade | null
    >(
      null,
    );

  const [
    drawerOpen,
    setDrawerOpen,
  ] =
    useState(
      false,
    );

  const trades =
    useMemo(
      () =>
        paperTradesResponse
          ?.data ??
        [],

      [
        paperTradesResponse
          ?.data,
      ],
    );

  /*
   * This is intentionally raw-store metadata only.
   *
   * It is NOT used for the authoritative Strategy #1
   * win rate or P&L cards.
   */
  const rawStoreMetrics =
    useMemo(
      () =>
        paperTradesResponse
          ?.summary ??
        calculatePaperTradeMetrics(
          trades,
        ),

      [
        paperTradesResponse
          ?.summary,
        trades,
      ],
    );

  const strategyOne =
    personalBotResponse
      ?.data ??
    null;

  const performance =
    strategyOne
      ?.performance ??
    null;

  const credibleCompleted =
    performance
      ?.successfulExecutions ??
    0;

  const credibleWinRate =
    performance
      ?.winRatePercent ??
    null;

  const credibleRealizedPnl =
    performance
      ?.realizedPnl ??
    0;

  const credibleToday =
    performance
      ?.successfulToday ??
    0;

  const credibleCurrentHour =
    performance
      ?.successfulCurrentClockHour ??
    0;

  const currentHourLabel =
    performance
      ?.currentClockHourLabel ??
    "—";

  const excludedDistorted =
    performance
      ?.excludedUncredibleExecutions ??
    0;

  const strategyStoredExecutions =
    performance
      ?.storedExecutions ??
    0;

  const excludedNonCredibleOrOpen =
    Math.max(
      0,

      strategyStoredExecutions -
        credibleCompleted,
    );

  function handleTradeSelect(
    trade:
      PaperTrade,
  ): void {
    setSelectedTrade(
      trade,
    );

    setDrawerOpen(
      true,
    );
  }

  function handleDrawerClose():
    void {
    setDrawerOpen(
      false,
    );
  }

  function handleNextHistoryPage():
    void {
    const nextCursor =
      paperTradesResponse
        ?.nextCursor ??
      null;

    if (
      !nextCursor
    ) {
      return;
    }

    setHistoryCursorStack(
      (
        current,
      ) => [
        ...current,
        historyCursor,
      ],
    );
    setHistoryCursor(
      nextCursor,
    );
  }

  function handlePreviousHistoryPage():
    void {
    if (
      historyCursorStack.length ===
      0
    ) {
      return;
    }

    setHistoryCursor(
      historyCursorStack[
        historyCursorStack.length -
        1
      ] ??
        null,
    );
    setHistoryCursorStack(
      historyCursorStack.slice(
        0,
        -1,
      ),
    );
  }

  if (
    paperTradesLoading ||
    personalBotLoading
  ) {
    return (
      <div className="text-text-muted">
        Loading authoritative PAPER
        performance...
      </div>
    );
  }

  if (
    paperTradesError
  ) {
    return (
      <div className="text-danger">
        Failed to load paper-trade
        history:{" "}
        {paperTradesLoadError instanceof
        Error
          ? paperTradesLoadError.message
          : "Unknown error"}
      </div>
    );
  }

  return (
    <section>
      <div className="mb-6">
        <h1 className="text-3xl font-semibold">
          Paper Trading
        </h1>

        <p className="mt-1 text-sm text-text-muted">
          Authoritative Strategy #1
          PAPER performance uses only
          attributed, closed and
          credible cross-exchange
          settlements.
        </p>
      </div>

      {personalBotError ? (
        <div className="mb-6 rounded-xl border border-danger/40 bg-danger/10 p-4">
          <p className="font-medium text-danger">
            Strategy #1 performance
            truth surface unavailable
          </p>

          <p className="mt-1 text-sm text-text-muted">
            The raw paper-trade
            history is still visible
            below, but CAT PRO will
            not infer credible P&amp;L
            from those records.
            {" "}
            {personalBotLoadError instanceof
            Error
              ? personalBotLoadError.message
              : ""}
          </p>
        </div>
      ) : null}

      <div className="mb-3 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <PaperTradeSummaryCard
          title="Credible Completed"
          value={
            personalBotError
              ? "—"
              : credibleCompleted
                  .toLocaleString()
          }
        />

        <PaperTradeSummaryCard
          title="Credible Win Rate"
          value={
            personalBotError
              ? "—"
              : formatPercent(
                  credibleWinRate,
                )
          }
        />

        <PaperTradeSummaryCard
          title="Credible PAPER P&L"
          value={
            personalBotError
              ? "—"
              : formatCurrency(
                  credibleRealizedPnl,
                )
          }
          tone={
            credibleRealizedPnl >
            0
              ? "success"
              : credibleRealizedPnl <
                  0
                ? "danger"
                : "default"
          }
        />

        <PaperTradeSummaryCard
          title="Successful Today"
          value={
            personalBotError
              ? "—"
              : credibleToday
                  .toLocaleString()
          }
        />

        <PaperTradeSummaryCard
          title="Current Hour"
          value={
            personalBotError
              ? "—"
              : credibleCurrentHour
                  .toLocaleString()
          }
        />
      </div>

      <div className="mb-6 rounded-xl border border-border-default bg-panel px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-text-muted">
          <span>
            Truth source:{" "}
            <strong className="text-text-primary">
              Strategy #1 personal bot
            </strong>
          </span>

          <span>
            Current IST bucket:{" "}
            <strong className="text-text-primary">
              {currentHourLabel}
            </strong>
          </span>

          <span>
            Strategy #1 stored
            executions:{" "}
            <strong className="text-text-primary">
              {personalBotError
                ? "—"
                : strategyStoredExecutions
                    .toLocaleString()}
            </strong>
          </span>

          <span>
            Distorted fills excluded:{" "}
            <strong className="text-warning">
              {personalBotError
                ? "—"
                : excludedDistorted
                    .toLocaleString()}
            </strong>
          </span>

          <span>
            Non-credible /
            non-settled Strategy #1
            records:{" "}
            <strong className="text-warning">
              {personalBotError
                ? "—"
                : excludedNonCredibleOrOpen
                    .toLocaleString()}
            </strong>
          </span>
        </div>
      </div>

      <PaperAutomationReadiness />

      <SuccessfulTradeDemo />

      <div className="mb-3 mt-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">
              Raw Paper Trade History
            </h2>

            <p className="mt-1 text-xs text-text-muted">
              Latest bounded history for
              fast operator review. Records
              shown here are not
              automatically counted as
              credible Strategy #1
              performance.
            </p>
          </div>

          <div className="text-right text-xs text-text-muted">
            <div>
              Showing latest:{" "}
              <span className="font-semibold text-text-primary">
                {trades.length
                  .toLocaleString()}
              </span>
              {paperTradesResponse
                ?.truncated
                ? ` of ${paperTradesResponse.count.toLocaleString()}`
                : ""}
            </div>

            <div>
              Stored records:{" "}
              <span className="font-semibold text-text-primary">
                {rawStoreMetrics
                  .totalStoredRecords
                  .toLocaleString()}
              </span>
            </div>

            <div>
              Raw closed records:{" "}
              <span className="font-semibold text-text-primary">
                {rawStoreMetrics
                  .closedStoredRecords
                  .toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-auto rounded-xl border border-border-default bg-panel">
        <Table>
          <TableHeader className="bg-panel-light">
            <TableRow className="border-border-default hover:bg-panel-light">
              <TableHead>
                Market
              </TableHead>

              <TableHead>
                Buy
              </TableHead>

              <TableHead>
                Sell
              </TableHead>

              <TableHead className="text-right">
                Capital
              </TableHead>

              <TableHead className="text-right">
                Current P&amp;L
              </TableHead>

              <TableHead className="text-right">
                Highest
              </TableHead>

              <TableHead className="text-right">
                Lowest
              </TableHead>

              <TableHead>
                Duration
              </TableHead>

              <TableHead>
                Status
              </TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {trades.length ===
            0 ? (
              <TableRow>
                <TableCell
                  colSpan={
                    9
                  }
                  className="h-32 text-center text-text-muted"
                >
                  No paper trades yet.
                </TableCell>
              </TableRow>
            ) : (
              trades.map(
                (
                  trade,
                ) => (
                  <PaperTradeTableRow
                    key={
                      trade.id
                    }
                    trade={
                      trade
                    }
                    onSelect={
                      handleTradeSelect
                    }
                  />
                ),
              )
            )}
          </TableBody>
        </Table>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-default bg-panel px-4 py-3 text-xs text-text-muted">
        <span>
          History page{" "}
          <strong className="text-text-primary">
            {(
              historyCursorStack.length +
              1
            ).toLocaleString()}
          </strong>
          {paperTradesFetching
            ? " · refreshing"
            : ""}
        </span>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={
              handlePreviousHistoryPage
            }
            disabled={
              historyCursorStack.length ===
                0 ||
              paperTradesFetching
            }
            className="rounded-md border border-border-default bg-panel-light px-3 py-2 font-semibold text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
          >
            Newer
          </button>

          <button
            type="button"
            onClick={
              handleNextHistoryPage
            }
            disabled={
              !paperTradesResponse
                ?.hasMore ||
              !paperTradesResponse
                .nextCursor ||
              paperTradesFetching
            }
            className="rounded-md border border-brand/40 bg-brand/10 px-3 py-2 font-semibold text-brand disabled:cursor-not-allowed disabled:opacity-40"
          >
            Older
          </button>
        </div>
      </div>

      <PaperTradeDrawer
        trade={
          selectedTrade
        }
        open={
          drawerOpen
        }
        onClose={
          handleDrawerClose
        }
      />

      <p className="mt-3 text-xs text-warning">
        PAPER trading remains a
        simulation. Credible PAPER
        settlement means the record
        passed CAT PRO&apos;s
        Strategy #1 attribution and
        executed-price credibility
        checks; it does not prove that
        an identical LIVE fill will be
        available.
      </p>
    </section>
  );
}
