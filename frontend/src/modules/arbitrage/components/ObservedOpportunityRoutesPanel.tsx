import {
  Activity,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";

import type {
  OpportunityNearMissAnalyticsReport,
  OpportunityNearMissRoute,
} from "@/modules/opportunity-diagnostics/types/OpportunityEconomicsDiagnostics";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";

interface ObservedOpportunityRoutesPanelProps {
  report:
    | OpportunityNearMissAnalyticsReport
    | undefined;

  isLoading: boolean;

  isError: boolean;

  isFetching: boolean;
}

export default function ObservedOpportunityRoutesPanel({
  report,
  isLoading,
  isError,
  isFetching,
}: ObservedOpportunityRoutesPanelProps) {
  return (
    <section className="rounded-xl border border-border-default bg-panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-warning">
            <Activity className="size-4" />

            <p className="text-xs font-semibold uppercase tracking-[0.18em]">
              Live scanner evidence
            </p>
          </div>

          <h2 className="mt-2 text-xl font-bold text-text-primary">
            Observed Routes — Not Qualified
          </h2>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">
            These routes reached executable-price and fee evaluation, but did
            not pass the current opportunity rules. They are evidence, not
            executable opportunities.
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-full border border-border-default bg-panel-light px-3 py-1 text-xs font-semibold text-text-muted">
          <RefreshCw
            className={`size-3.5 ${
              isFetching
                ? "animate-spin text-brand"
                : ""
            }`}
          />

          {isFetching
            ? "UPDATING"
            : "READ ONLY"}
        </div>
      </div>

      {isLoading && !report ? (
        <PanelMessage>
          Loading the latest scanner evidence...
        </PanelMessage>
      ) : null}

      {isError && !report ? (
        <PanelMessage tone="danger">
          Scanner evidence is temporarily unavailable. The accepted
          opportunity board above is still live.
        </PanelMessage>
      ) : null}

      {report ? (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <EvidenceMetric
              label="Economically Checked"
              value={report.pipeline.economicallyEvaluatedPairs}
            />

            <EvidenceMetric
              label="Raw-positive Routes"
              value={report.pipeline.rawPositiveSpreads}
              tone={
                report.pipeline.rawPositiveSpreads > 0
                  ? "warning"
                  : "default"
              }
            />

            <EvidenceMetric
              label="Fee-positive Routes"
              value={report.pipeline.feePositiveSpreads}
              tone={
                report.pipeline.feePositiveSpreads > 0
                  ? "success"
                  : "default"
              }
            />

            <EvidenceMetric
              label="Current Rejects"
              value={report.rejectionSummary.totalCurrentScanRejections}
            />
          </div>

          {report.pipeline.acceptedOpportunities === 0 ? (
            <div className="mt-4 flex gap-3 rounded-lg border border-warning/30 bg-warning/10 p-4">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />

              <p className="text-sm leading-6 text-text-muted">
                Market data is live. {report.pipeline.rawPositiveSpreads}{" "}
                economically evaluated route
                {report.pipeline.rawPositiveSpreads === 1
                  ? " has"
                  : "s have"}{" "}
                positive raw spread; {report.pipeline.feePositiveSpreads}{" "}
                remain positive after fees. None passed the current engine
                rules, so the accepted board correctly remains empty.
              </p>
            </div>
          ) : null}

          <div className="mt-4 max-h-[42vh] overflow-auto rounded-lg border border-border-default">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-panel-light">
                <TableRow className="border-border-default hover:bg-panel-light">
                  <TableHead>Market</TableHead>
                  <TableHead>Observed Route</TableHead>
                  <TableHead className="text-right">Raw %</TableHead>
                  <TableHead className="text-right">After Fees %</TableHead>
                  <TableHead className="text-right">Discovery Gap</TableHead>
                  <TableHead className="text-right">Executable Capital</TableHead>
                  <TableHead>Why Rejected</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {report.topNearMisses.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="h-28 text-center text-text-muted"
                    >
                      No synchronized routes reached economic evaluation in
                      this scan.
                    </TableCell>
                  </TableRow>
                ) : (
                  report.topNearMisses.map(
                    (
                      route,
                      index,
                    ) => (
                      <ObservedRouteRow
                        key={`${route.market}-${route.buyExchange}-${route.sellExchange}-${index}`}
                        route={route}
                      />
                    ),
                  )
                )}
              </TableBody>
            </Table>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-text-muted">
            <span>
              Showing {report.topNearMisses.length} credible near-misses plus a
              bounded suspicious-book sample from the current scan.
            </span>

            <span>
              Thresholds and execution permissions are unchanged.
            </span>
          </div>
        </>
      ) : null}
    </section>
  );
}

function ObservedRouteRow({
  route,
}: {
  route: OpportunityNearMissRoute;
}) {
  const rawPositive =
    route.rawSpreadPercent !== null &&
    route.rawSpreadPercent > 0;

  const feePositive =
    route.netProfitPercent !== null &&
    route.netProfitPercent > 0;

  return (
    <TableRow className="border-border-default hover:bg-panel-light">
      <TableCell className="font-semibold text-text-primary">
        {route.market}
      </TableCell>

      <TableCell>
        <div className="flex items-center gap-2 text-xs">
          <span className="font-semibold uppercase text-success">
            {route.buyExchange}
          </span>

          <span className="text-text-muted">→</span>

          <span className="font-semibold uppercase text-danger">
            {route.sellExchange}
          </span>
        </div>
      </TableCell>

      <TableCell
        className={`text-right font-mono tabular-nums ${
          rawPositive
            ? "font-semibold text-warning"
            : "text-text-muted"
        }`}
      >
        {formatPercent(route.rawSpreadPercent)}
      </TableCell>

      <TableCell
        className={`text-right font-mono font-semibold tabular-nums ${
          feePositive
            ? "text-success"
            : "text-danger"
        }`}
      >
        {formatPercent(route.netProfitPercent)}
      </TableCell>

      <TableCell className="text-right font-mono tabular-nums text-text-muted">
        {formatGap(route.distanceToDiscoveryPercent)}
      </TableCell>

      <TableCell className="text-right font-mono tabular-nums">
        <p className="font-semibold text-text-primary">
          {formatInr(route.executableCapitalInr)}
        </p>

        {route.executableQuoteCapital !== null && route.quoteAsset ? (
          <p className="mt-1 text-[10px] text-text-muted">
            {formatNumber(route.executableQuoteCapital)} {route.quoteAsset}
          </p>
        ) : null}
      </TableCell>

      <TableCell>
        <div className="max-w-sm">
          <p
            className={`text-xs font-semibold ${
              route.classification === "SUSPICIOUS_BOOK"
                ? "text-danger"
                : "text-warning"
            }`}
          >
            {formatCode(route.classification)}
          </p>

          <div className="mt-1 space-y-1">
            {(route.blockers.length > 0
              ? route.blockers
              : route.rejectionReason
                ? [{
                    code: route.rejectionCode ?? "REJECTED",
                    reason: route.rejectionReason,
                    stage: route.rejectionStage ?? "UNKNOWN",
                  }]
                : []
            ).map((blocker) => (
              <p
                key={`${blocker.stage}-${blocker.code}`}
                className="text-xs leading-5 text-text-muted"
                title={blocker.reason}
              >
                <span className="font-semibold text-text-primary">
                  {formatCode(blocker.code)}:
                </span>{" "}
                {blocker.reason}
              </p>
            ))}
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
}

function EvidenceMetric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?:
    | "default"
    | "success"
    | "warning";
}) {
  const valueClass =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : "text-text-primary";

  return (
    <div className="rounded-lg border border-border-default bg-panel-light p-4">
      <p className="text-xs uppercase tracking-[0.14em] text-text-muted">
        {label}
      </p>

      <p className={`mt-2 text-2xl font-bold ${valueClass}`}>
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function PanelMessage({
  children,
  tone = "default",
}: {
  children: string;
  tone?:
    | "default"
    | "danger";
}) {
  return (
    <div
      className={`mt-5 rounded-lg border p-4 text-sm ${
        tone === "danger"
          ? "border-danger/30 bg-danger/10 text-danger"
          : "border-border-default bg-panel-light text-text-muted"
      }`}
    >
      {children}
    </div>
  );
}

function formatPercent(
  value:
    | number
    | null,
): string {
  if (value === null) {
    return "NO DATA";
  }

  return `${value >= 0 ? "+" : ""}${value.toFixed(4)}%`;
}

function formatGap(
  value:
    | number
    | null,
): string {
  if (value === null) {
    return "NO DATA";
  }

  return value === 0
    ? "MET"
    : `${value.toFixed(4)}%`;
}

function formatCode(
  value:
    | string
    | null,
): string {
  return value
    ? value.replaceAll(
        "_",
        " ",
      )
    : "REJECTED";
}

function formatInr(
  value:
    | number
    | null,
): string {
  if (value === null) {
    return "NO DATA";
  }

  return new Intl.NumberFormat(
    "en-IN",
    {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
    },
  ).format(value);
}

function formatNumber(
  value: number,
): string {
  return new Intl.NumberFormat(
    "en-IN",
    {
      maximumFractionDigits: 6,
    },
  ).format(value);
}
