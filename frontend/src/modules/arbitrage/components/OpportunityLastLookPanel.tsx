import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  SearchCheck,
  XCircle,
} from "lucide-react";

import {
  useState,
} from "react";

import {
  fetchOpportunityLastLook,
} from "../services/opportunityApi";

import type {
  CandidateLastLookResult,
} from "../types/LastLook";

import type {
  Opportunity,
} from "../types/Opportunity";

interface OpportunityLastLookPanelProps {
  opportunity: Opportunity;
}

interface LastLookEvidenceState {
  opportunityId: string;

  result:
    | CandidateLastLookResult
    | null;

  error:
    | string
    | null;
}

export default function OpportunityLastLookPanel({
  opportunity,
}: OpportunityLastLookPanelProps) {
  const [
    evidence,
    setEvidence,
  ] =
    useState<LastLookEvidenceState | null>(
      null,
    );

  const [
    loadingOpportunityId,
    setLoadingOpportunityId,
  ] =
    useState<string | null>(
      null,
    );

  const result =
    evidence
      ?.opportunityId ===
    opportunity.id
      ? evidence.result
      : null;

  const error =
    evidence
      ?.opportunityId ===
    opportunity.id
      ? evidence.error
      : null;

  const loading =
    loadingOpportunityId ===
    opportunity.id;

  const evaluate =
    async () => {
      const opportunityId =
        opportunity.id;

      setLoadingOpportunityId(
        opportunityId,
      );

      setEvidence({
        opportunityId,
        result: null,
        error: null,
      });

      try {
        const response =
          await fetchOpportunityLastLook(
            opportunityId,
          );

        setEvidence({
          opportunityId,
          result: response.data,
          error: null,
        });
      } catch (
        lastLookError
      ) {
        setEvidence({
          opportunityId,
          result: null,
          error:
            lastLookError instanceof Error
            ? lastLookError.message
            : "Unable to evaluate last-look.",
        });
      } finally {
        setLoadingOpportunityId(
          (
            currentOpportunityId,
          ) =>
            currentOpportunityId ===
            opportunityId
              ? null
              : currentOpportunityId,
        );
      }
    };

  return (
    <section className="rounded-xl border border-border-default bg-panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-brand">
            <SearchCheck className="size-4" />

            <p className="text-xs font-semibold uppercase tracking-[0.18em]">
              Final Last-Look
            </p>
          </div>

          <h3 className="mt-1 text-xl font-bold text-text-primary">
            Pre-execution verification
          </h3>

          <p className="mt-1 max-w-2xl text-sm text-text-muted">
            Read-only candidate
            verification using the
            existing backend
            last-look engine. This
            action does not submit an
            exchange order.
          </p>
        </div>

        <button
          type="button"
          disabled={
            loading
          }
          onClick={() =>
            void evaluate()
          }
          className="inline-flex items-center gap-2 rounded-md border border-border-default bg-panel-light px-3 py-2 text-xs font-semibold text-text-primary transition hover:border-brand/50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw
            className={`size-4 ${
              loading
                ? "animate-spin"
                : ""
            }`}
          />

          {result
            ? "Re-run Last-Look"
            : "Run Last-Look"}
        </button>
      </div>

      {error ? (
        <div className="mt-4 rounded-lg border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
          {error}
        </div>
      ) : null}

      {!result &&
      !error ? (
        <div className="mt-4 rounded-lg border border-border-default bg-panel-light p-4 text-sm text-text-muted">
          Last-look has not
          been evaluated for
          this selected
          opportunity.
        </div>
      ) : null}

      {result ? (
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatusMetric
              label="Status"
              value={
                result.status
              }
              state={
                result.readyForPaperExecution
                  ? "good"
                  : "bad"
              }
            />

            <StatusMetric
              label="Paper Ready"
              value={
                result.readyForPaperExecution
                  ? "YES"
                  : "NO"
              }
              state={
                result.readyForPaperExecution
                  ? "good"
                  : "bad"
              }
            />

            <StatusMetric
              label="Final Capital"
              value={
                result.finalCapital ===
                null
                  ? "N/A"
                  : formatNumber(
                      result.finalCapital,
                    )
              }
              state="neutral"
            />

            <StatusMetric
              label="Observed Drift"
              value={
                result.priceDrift ===
                null
                  ? "N/A"
                  : `${result.priceDrift.maximumObservedAdverseDriftPercent.toFixed(
                      4,
                    )}%`
              }
              state={
                result
                  .priceDrift
                  ?.acceptable ===
                false
                  ? "bad"
                  : "neutral"
              }
            />
          </div>

          {result.priceDrift ? (
            <div className="grid gap-3 md:grid-cols-2">
              <DriftCard
                title="Buy-side drift"
                baseline={
                  result
                    .priceDrift
                    .baselineBuyPrice
                }
                current={
                  result
                    .priceDrift
                    .currentBuyPrice
                }
                drift={
                  result
                    .priceDrift
                    .buyAdverseDriftPercent
                }
              />

              <DriftCard
                title="Sell-side drift"
                baseline={
                  result
                    .priceDrift
                    .baselineSellPrice
                }
                current={
                  result
                    .priceDrift
                    .currentSellPrice
                }
                drift={
                  result
                    .priceDrift
                    .sellAdverseDriftPercent
                }
              />
            </div>
          ) : null}

          {result.reasons
            .length >
          0 ? (
            <div className="rounded-lg border border-warning/20 bg-warning/10 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-warning">
                Last-look reasons
              </p>

              <ul className="mt-2 space-y-1 text-sm text-text-primary">
                {result.reasons.map(
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
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function StatusMetric({
  label,
  value,
  state,
}: {
  label: string;

  value: string;

  state:
    | "good"
    | "bad"
    | "neutral";
}) {
  return (
    <div className="rounded-lg border border-border-default bg-panel-light p-4">
      <p className="text-xs uppercase tracking-[0.14em] text-text-muted">
        {label}
      </p>

      <div className="mt-2 flex items-start gap-2">
        {state ===
        "good" ? (
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
        ) : state ===
          "bad" ? (
          <XCircle className="mt-0.5 size-4 shrink-0 text-danger" />
        ) : (
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-text-muted" />
        )}

        <p className="break-all font-mono text-sm font-bold text-text-primary">
          {value}
        </p>
      </div>
    </div>
  );
}

function DriftCard({
  title,
  baseline,
  current,
  drift,
}: {
  title: string;

  baseline: number;

  current: number;

  drift: number;
}) {
  return (
    <div className="rounded-lg border border-border-default bg-panel-light p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">
        {title}
      </p>

      <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
        <Value
          label="Baseline"
          value={formatNumber(
            baseline,
          )}
        />

        <Value
          label="Current"
          value={formatNumber(
            current,
          )}
        />

        <Value
          label="Adverse"
          value={`${drift.toFixed(
            4,
          )}%`}
        />
      </div>
    </div>
  );
}

function Value({
  label,
  value,
}: {
  label: string;

  value: string;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-text-muted">
        {label}
      </p>

      <p className="mt-1 font-mono text-xs font-semibold text-text-primary">
        {value}
      </p>
    </div>
  );
}

function formatNumber(
  value: number,
): string {
  return new Intl.NumberFormat(
    "en-IN",
    {
      maximumFractionDigits:
        8,
    },
  ).format(
    value,
  );
}
