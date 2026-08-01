import { useMemo } from "react";

import { usePaperTrades } from "@/modules/paper-trading/hooks/usePaperTrades";
import type { PaperTrade } from "@/modules/paper-trading/types/PaperTrade";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDuration(
  openedAt: number,
  closedAt: number | null,
): string {
  const endTime = closedAt ?? Date.now();

  const elapsedSeconds = Math.max(
    0,
    Math.floor((endTime - openedAt) / 1000),
  );

  const hours = Math.floor(elapsedSeconds / 3600);

  const minutes = Math.floor(
    (elapsedSeconds % 3600) / 60,
  );

  const seconds = elapsedSeconds % 60;

  return [hours, minutes, seconds]
    .map((value) =>
      value.toString().padStart(2, "0"),
    )
    .join(":");
}

function profitClass(value: number): string {
  if (value > 0) {
    return "text-success";
  }

  if (value < 0) {
    return "text-danger";
  }

  return "text-text-muted";
}

function getStatusClass(
  status: PaperTrade["status"],
): string {
  switch (status) {
    case "closed":
    case "target-hit":
      return "text-success";

    case "failed":
      return "text-danger";

    case "cancelled":
      return "text-warning";

    case "monitoring":
    case "open":
    case "validated":
    case "detected":
    default:
      return "text-brand";
  }
}

function isActiveTrade(trade: PaperTrade): boolean {
  return (
    trade.status === "detected" ||
    trade.status === "validated" ||
    trade.status === "open" ||
    trade.status === "monitoring"
  );
}
export default function PaperTrading() {
  const {
    data,
    isLoading,
    isError,
    error,
  } = usePaperTrades();

  const trades = data?.data ?? [];

  const summary = useMemo(() => {
    const activeTrades = trades.filter(isActiveTrade);

  const closedTrades = trades.filter(
  (trade) =>
    trade.status === "closed" ||
    trade.status === "completed" ||
    trade.status === "target-hit",
);

    const winningTrades = closedTrades.filter(
      (trade) => (trade.actualProfit ?? 0) > 0,
    );

    const expectedProfit = trades.reduce(
      (total, trade) =>
        total + trade.expectedProfit,
      0,
    );

    const actualProfit = closedTrades.reduce(
      (total, trade) =>
        total + (trade.actualProfit ?? 0),
      0,
    );

    const winRate =
      closedTrades.length > 0
        ? (winningTrades.length /
            closedTrades.length) *
          100
        : 0;

    return {
      activeCount: activeTrades.length,
      closedCount: closedTrades.length,
      expectedProfit,
      actualProfit,
      winRate,
    };
  }, [trades]);

  if (isLoading) {
    return (
      <div className="text-text-muted">
        Loading paper trades...
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-danger">
        Failed to load paper trades:{" "}
        {error instanceof Error
          ? error.message
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
          Test arbitrage opportunities without risking real capital.
        </p>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <SummaryCard
          title="Active Trades"
          value={summary.activeCount.toLocaleString()}
        />

        <SummaryCard
          title="Completed"
          value={summary.closedCount.toLocaleString()}
        />

        <SummaryCard
          title="Win Rate"
          value={`${summary.winRate.toFixed(1)}%`}
        />

        <SummaryCard
          title="Expected Profit"
          value={formatCurrency(summary.expectedProfit)}
        />

        <SummaryCard
          title="Actual Profit"
          value={formatCurrency(summary.actualProfit)}
          success={summary.actualProfit > 0}
        />
      </div>

      <div className="overflow-auto rounded-xl border border-border-default bg-panel">
        <Table>
          <TableHeader className="bg-panel-light">
            <TableRow className="border-border-default hover:bg-panel-light">
              <TableHead>Market</TableHead>
              <TableHead>Buy</TableHead>
              <TableHead>Sell</TableHead>

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

              <TableHead>Duration</TableHead>

              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {trades.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="h-32 text-center text-text-muted"
                >
                  No paper trades yet.
                </TableCell>
              </TableRow>
            ) : (
              trades.map((trade) => (
                <TableRow
                  key={trade.id}
                  className="border-border-default hover:bg-panel-light"
                >
                  <TableCell className="font-semibold">
                    {trade.market}
                  </TableCell>

                  <TableCell className="uppercase text-success">
                    {trade.buyExchange}
                  </TableCell>

                  <TableCell className="uppercase text-danger">
                    {trade.sellExchange}
                  </TableCell>

                  <TableCell className="text-right font-mono tabular-nums">
                    {formatCurrency(trade.capital)}
                  </TableCell>

                  <TableCell
                    className={`text-right font-mono tabular-nums ${profitClass(
                      trade.currentProfit,
                    )}`}
                  >
                    {formatCurrency(
                      trade.currentProfit,
                    )}
                  </TableCell>

                  <TableCell
                    className={`text-right font-mono tabular-nums ${profitClass(
                      trade.highestProfit,
                    )}`}
                  >
                    {formatCurrency(
                      trade.highestProfit,
                    )}
                  </TableCell>

                  <TableCell
                    className={`text-right font-mono tabular-nums ${profitClass(
                      trade.lowestProfit,
                    )}`}
                  >
                    {formatCurrency(
                      trade.lowestProfit,
                    )}
                  </TableCell>

                  <TableCell className="font-mono tabular-nums">
                    {formatDuration(
                      trade.openedAt,
                      trade.closedAt,
                    )}
                  </TableCell>

                  <TableCell
                    className={`font-semibold uppercase ${getStatusClass(
                      trade.status,
                    )}`}
                  >
                    {trade.status}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <p className="mt-3 text-xs text-warning">
        Paper trading is a simulation. It does not guarantee that a live trade
        can execute at the same price, quantity, fees, or speed.
      </p>
    </section>
  );
}

interface SummaryCardProps {
  title: string;
  value: string;
  success?: boolean;
}

function SummaryCard({
  title,
  value,
  success = false,
}: SummaryCardProps) {
  return (
    <div className="rounded-xl border border-border-default bg-panel p-5">
      <p className="text-sm text-text-muted">
        {title}
      </p>

      <p
        className={`mt-2 text-2xl font-bold tabular-nums ${
          success
            ? "text-success"
            : "text-text-primary"
        }`}
      >
        {value}
      </p>
    </div>
  );
}