import {
  AlertTriangle,
  CheckCircle2,
  FlaskConical,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import {
  useState,
} from "react";

import {
  useV18ProductionReadiness,
} from "@/modules/production-safety/hooks/useV18ProductionReadiness";

import {
  useRunTinyLivePreflight,
  useSealTinyLiveEvidencePackage,
  useTinyLiveCapability,
  useTinyLiveEvidenceArchive,
  useTinyLiveEvidencePackage,
  useTinyLiveReadinessClosure,
} from "../hooks/useTinyLivePreflight";

import type {
  TinyLiveClosureAction,
  TinyLiveEvidenceArchive,
  TinyLiveEvidencePackage,
  TinyLivePreflightGate,
  TinyLiveReadinessClosureReport,
} from "../types/TinyLivePreflight";

const PREFLIGHT_TOKEN =
  "RUN_TINY_LIVE_PREFLIGHT_ONLY";

export default function TinyLivePreflightDashboard() {
  const capabilityQuery =
    useTinyLiveCapability();

  const readinessQuery =
    useV18ProductionReadiness();

  const preflightMutation =
    useRunTinyLivePreflight();

  const evidenceQuery =
    useTinyLiveEvidencePackage();

  const archiveQuery =
    useTinyLiveEvidenceArchive();

  const closureQuery =
    useTinyLiveReadinessClosure();

  const sealMutation =
    useSealTinyLiveEvidencePackage();

  const [
    requestedCapital,
    setRequestedCapital,
  ] =
    useState(100);

  const [
    market,
    setMarket,
  ] =
    useState("");

  const [
    buyExchange,
    setBuyExchange,
  ] =
    useState("binance");

  const [
    sellExchange,
    setSellExchange,
  ] =
    useState("coindcx");

  const [
    buyAsset,
    setBuyAsset,
  ] =
    useState("");

  const [
    buyRequiredAmount,
    setBuyRequiredAmount,
  ] =
    useState(0);

  const [
    sellAsset,
    setSellAsset,
  ] =
    useState("");

  const [
    sellRequiredAmount,
    setSellRequiredAmount,
  ] =
    useState(0);

  const [
    understood,
    setUnderstood,
  ] =
    useState(false);

  const [
    sealUnderstood,
    setSealUnderstood,
  ] =
    useState(false);

  const capability =
    capabilityQuery.data?.data;

  const readiness =
    readinessQuery.data?.data;

  const report =
    preflightMutation.data?.data;

  const evidencePackage =
    evidenceQuery.data?.data;

  const evidenceArchive =
    archiveQuery.data?.data;

  const closure =
    closureQuery.data?.data;

  const formValid =
    requestedCapital >=
      100 &&
    requestedCapital <=
      500 &&
    market.trim().length >
      0 &&
    buyExchange.trim().length >
      0 &&
    sellExchange.trim().length >
      0 &&
    buyExchange.trim().toLowerCase() !==
      sellExchange.trim().toLowerCase() &&
    buyAsset.trim().length >
      0 &&
    sellAsset.trim().length >
      0 &&
    buyRequiredAmount >
      0 &&
    sellRequiredAmount >
      0 &&
    understood;

  const runPreflight =
    () => {
      if (!formValid) {
        return;
      }

      preflightMutation.mutate({
        requestedCapital,

        market:
          market
            .trim()
            .toUpperCase(),

        buyExchange:
          buyExchange
            .trim()
            .toLowerCase(),

        sellExchange:
          sellExchange
            .trim()
            .toLowerCase(),

        confirmationToken:
          PREFLIGHT_TOKEN,

        balanceRequirements: [
          {
            exchange:
              buyExchange
                .trim()
                .toLowerCase(),

            asset:
              buyAsset
                .trim()
                .toUpperCase(),

            requiredAmount:
              buyRequiredAmount,
          },

          {
            exchange:
              sellExchange
                .trim()
                .toLowerCase(),

            asset:
              sellAsset
                .trim()
                .toUpperCase(),

            requiredAmount:
              sellRequiredAmount,
          },
        ],
      });
    };

  return (
    <section className="space-y-6">
      <section className="rounded-xl border border-border-default bg-panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-success">
              <ShieldCheck className="size-4" />

              <p className="text-xs font-semibold uppercase tracking-[0.18em]">
                Tiny-LIVE Safety
              </p>
            </div>

            <h1 className="mt-2 text-3xl font-bold text-text-primary">
              Tiny-LIVE
              Preflight Console
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">
              Controlled eligibility
              evaluation for the
              ₹100–₹500 Tiny-LIVE
              phase. This console
              validates safety
              evidence only. It
              cannot submit an
              exchange order,
              reserve capital or
              create a LIVE
              execution session.
            </p>
          </div>

          <div className="flex flex-col items-end gap-2">
            <span className="rounded-full border border-warning/30 bg-warning/10 px-3 py-1 text-xs font-bold text-warning">
              PREFLIGHT ONLY
            </span>

            <span className="rounded-full border border-success/30 bg-success/10 px-3 py-1 text-xs font-bold text-success">
              ORDER SUBMISSION DISABLED
            </span>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <TopMetric
            label="Capital Floor"
            value={
              capability
                ? `₹${capability.minimumCapital}`
                : "₹100"
            }
            good
          />

          <TopMetric
            label="Capital Ceiling"
            value={
              capability
                ? `₹${capability.maximumCapital}`
                : "₹500"
            }
            good
          />

          <TopMetric
            label="V18 Hardening"
            value={
              readiness
                ? readiness.v18HardeningAccepted
                  ? "ACCEPTED"
                  : "BLOCKED"
                : "UNKNOWN"
            }
            good={
              readiness?.v18HardeningAccepted ??
              false
            }
          />

          <TopMetric
            label="Tiny-LIVE Operational"
            value={
              readiness
                ? readiness.tinyLiveOperationalReady
                  ? "READY"
                  : "NOT READY"
                : "UNKNOWN"
            }
            good={
              readiness?.tinyLiveOperationalReady ??
              false
            }
          />
        </div>
      </section>

      {closure ? (
        <ReadinessClosurePanel
          report={closure}
        />
      ) : (
        <section className="rounded-xl border border-warning/30 bg-warning/10 p-5 text-sm text-warning">
          V22.19 readiness
          closure evidence is
          unavailable. Tiny-LIVE
          remains blocked.
        </section>
      )}

      {evidencePackage &&
      evidenceArchive ? (
        <EvidencePackagePanel
          evidencePackage={
            evidencePackage
          }
          archive={
            evidenceArchive
          }
          sealUnderstood={
            sealUnderstood
          }
          onSealUnderstoodChange={
            setSealUnderstood
          }
          sealing={
            sealMutation.isPending
          }
          sealedPackage={
            sealMutation.data?.data ??
            null
          }
          sealError={
            sealMutation.isError
              ? sealMutation.error instanceof
                  Error
                ? sealMutation.error.message
                : "Evidence sealing failed."
              : null
          }
          onSeal={() => {
            if (
              sealUnderstood
            ) {
              sealMutation.mutate();
            }
          }}
        />
      ) : (
        <section className="rounded-xl border border-warning/30 bg-warning/10 p-5 text-sm text-warning">
          V19.36 content-addressed
          evidence is unavailable.
          Missing package evidence
          remains NO-GO.
        </section>
      )}

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="rounded-xl border border-border-default bg-panel p-5">
          <div className="flex items-center gap-2">
            <FlaskConical className="size-5 text-brand" />

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
                Preflight Request
              </p>

              <h2 className="mt-1 text-xl font-bold text-text-primary">
                Candidate Inputs
              </h2>
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Field
              label="Requested Capital (INR)"
            >
              <input
                type="number"
                min={100}
                max={500}
                step={1}
                value={
                  requestedCapital
                }
                onChange={(
                  event,
                ) =>
                  setRequestedCapital(
                    Number(
                      event.target.value,
                    ),
                  )
                }
                className={inputClass}
              />
            </Field>

            <Field
              label="Market"
            >
              <input
                value={
                  market
                }
                onChange={(
                  event,
                ) =>
                  setMarket(
                    event.target.value,
                  )
                }
                placeholder="Example: BTCUSDT"
                className={inputClass}
              />
            </Field>

            <Field
              label="Buy Exchange"
            >
              <select
                value={
                  buyExchange
                }
                onChange={(
                  event,
                ) =>
                  setBuyExchange(
                    event.target.value,
                  )
                }
                className={inputClass}
              >
                <option value="binance">
                  Binance
                </option>

                <option value="coindcx">
                  CoinDCX
                </option>

                <option value="bybit">
                  Bybit
                </option>
              </select>
            </Field>

            <Field
              label="Sell Exchange"
            >
              <select
                value={
                  sellExchange
                }
                onChange={(
                  event,
                ) =>
                  setSellExchange(
                    event.target.value,
                  )
                }
                className={inputClass}
              >
                <option value="coindcx">
                  CoinDCX
                </option>

                <option value="binance">
                  Binance
                </option>

                <option value="bybit">
                  Bybit
                </option>
              </select>
            </Field>
          </div>

          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            <BalanceRequirement
              title="Buy-side Balance Requirement"
              exchange={
                buyExchange
              }
              asset={
                buyAsset
              }
              amount={
                buyRequiredAmount
              }
              onAssetChange={
                setBuyAsset
              }
              onAmountChange={
                setBuyRequiredAmount
              }
            />

            <BalanceRequirement
              title="Sell-side Balance Requirement"
              exchange={
                sellExchange
              }
              asset={
                sellAsset
              }
              amount={
                sellRequiredAmount
              }
              onAssetChange={
                setSellAsset
              }
              onAmountChange={
                setSellRequiredAmount
              }
            />
          </div>

          <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 p-4">
            <input
              type="checkbox"
              checked={
                understood
              }
              onChange={(
                event,
              ) =>
                setUnderstood(
                  event.target.checked,
                )
              }
              className="mt-1 size-4"
            />

            <span className="text-sm leading-6 text-text-primary">
              I understand this
              action runs the
              Build 15 Tiny-LIVE
              <strong>
                {" "}
                preflight only
              </strong>
              . It does not submit
              an order, reserve
              capital or create a
              LIVE trading session.
            </span>
          </label>

          <button
            type="button"
            disabled={
              !formValid ||
              preflightMutation.isPending
            }
            onClick={
              runPreflight
            }
            className="mt-5 inline-flex items-center gap-2 rounded-md border border-brand/40 bg-brand/10 px-4 py-3 text-sm font-bold text-brand disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RefreshCw
              className={`size-4 ${
                preflightMutation.isPending
                  ? "animate-spin"
                  : ""
              }`}
            />

            {preflightMutation.isPending
              ? "Running Safety Checks..."
              : "Run Tiny-LIVE Preflight"}
          </button>
        </div>

        <div className="space-y-5">
          <section className="rounded-xl border border-border-default bg-panel p-5">
            <div className="flex items-center gap-2">
              <LockKeyhole className="size-5 text-success" />

              <h2 className="text-lg font-bold text-text-primary">
                Hard Safety
                Invariants
              </h2>
            </div>

            <div className="mt-4 space-y-3">
              <SafetyRow
                label="Real order submission"
                value="DISABLED"
              />

              <SafetyRow
                label="Capital reservation"
                value="DISABLED"
              />

              <SafetyRow
                label="Automatic cancel"
                value="DISABLED"
              />

              <SafetyRow
                label="Automatic hedge"
                value="DISABLED"
              />

              <SafetyRow
                label="Automatic unwind"
                value="DISABLED"
              />

              <SafetyRow
                label="Confirmation"
                value="REQUIRED"
              />
            </div>
          </section>

          <section className="rounded-xl border border-border-default bg-panel p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
              V18 Readiness
            </p>

            <h2 className="mt-1 text-lg font-bold text-text-primary">
              Current Blocking
              Evidence
            </h2>

            {!readiness ? (
              <p className="mt-4 text-sm text-warning">
                Readiness
                evidence
                unavailable.
              </p>
            ) : readiness.blockers
                .tinyLive.length >
              0 ? (
              <div className="mt-4 space-y-2">
                {readiness.blockers.tinyLive.map(
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
            ) : (
              <div className="mt-4 rounded-lg border border-success/20 bg-success/10 p-3 text-sm text-success">
                V18 readiness
                reports no
                Tiny-LIVE
                blockers.
              </div>
            )}
          </section>
        </div>
      </section>

      {preflightMutation.isError ? (
        <section className="rounded-xl border border-danger/30 bg-danger/10 p-5 text-danger">
          {preflightMutation.error instanceof
          Error
            ? preflightMutation.error.message
            : "Tiny-LIVE preflight request failed."}
        </section>
      ) : null}

      {report ? (
        <PreflightReport
          report={
            report
          }
        />
      ) : (
        <section className="rounded-xl border border-border-default bg-panel p-5 text-sm text-text-muted">
          No Tiny-LIVE
          preflight has been
          executed in this UI
          session yet.
        </section>
      )}
    </section>
  );
}

function ReadinessClosurePanel({
  report,
}: {
  report:
    TinyLiveReadinessClosureReport;
}) {
  const blocked =
    report.decision ===
    "BLOCKED";

  return (
    <section className="rounded-xl border border-border-default bg-panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">
            V{report.version} Readiness Closure
          </p>

          <h2 className="mt-1 text-2xl font-bold text-text-primary">
            Tiny-LIVE Ordered Closure Plan
          </h2>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">
            One fail-closed plan
            combining market data,
            credentials,
            authenticated reads,
            clocks, alert history,
            adapters and rolling
            evidence. It performs no
            account or order action.
          </p>
        </div>

        <span
          className={`rounded-full border px-4 py-2 text-sm font-bold ${
            blocked
              ? "border-danger/30 bg-danger/10 text-danger"
              : "border-success/30 bg-success/10 text-success"
          }`}
        >
          {report.decision.replaceAll(
            "_",
            " ",
          )}
        </span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <TopMetric
          label="Closure Progress"
          value={`${report.summary.completedPrerequisites}/${report.summary.prerequisiteActions}`}
          good={
            report.activationReviewEligible
          }
        />

        <TopMetric
          label="Progress"
          value={`${report.summary.progressPercent}%`}
          good={
            report.activationReviewEligible
          }
        />

        <TopMetric
          label="Action Required"
          value={String(
            report.summary.actionRequired,
          )}
          good={
            report.summary.actionRequired ===
            0
          }
        />

        <TopMetric
          label="Waiting Evidence"
          value={String(
            report.summary.waitingForEvidence,
          )}
          good={
            report.summary.waitingForEvidence ===
            0
          }
        />

        <TopMetric
          label="Deferred"
          value={String(
            report.summary.deferred,
          )}
          good={
            report.summary.deferred ===
            0
          }
        />
      </div>

      {report.nextAction ? (
        <div className="mt-5 rounded-lg border border-warning/30 bg-warning/10 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <AlertTriangle className="size-4 text-warning" />

            <p className="text-xs font-bold uppercase tracking-[0.16em] text-warning">
              Next Exact Action
            </p>

            <span className="rounded-full border border-warning/30 px-2 py-0.5 text-[10px] font-bold text-warning">
              {report.nextAction.priority}
            </span>

            <span className="rounded-full border border-border-default bg-panel px-2 py-0.5 text-[10px] font-bold text-text-muted">
              OWNER: {report.nextAction.owner}
            </span>
          </div>

          <p className="mt-2 font-bold text-text-primary">
            {report.nextAction.title}
          </p>

          <p className="mt-1 text-sm leading-6 text-text-muted">
            {report.nextAction.summary}
          </p>

          <ol className="mt-3 space-y-1 pl-5 text-xs leading-5 text-text-primary">
            {report.nextAction.steps.map(
              (step) => (
                <li
                  key={step}
                  className="list-decimal"
                >
                  {step}
                </li>
              ),
            )}
          </ol>
        </div>
      ) : null}

      <div className="mt-5 grid gap-3 xl:grid-cols-2">
        {report.actions.map(
          (action) => (
            <ClosureActionCard
              key={action.key}
              action={action}
            />
          ),
        )}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-4">
        <SafetyProof
          label="Read-only Report"
          value="YES"
        />

        <SafetyProof
          label="Auto Promotion"
          value="NO"
        />

        <SafetyProof
          label="Account Changed"
          value="NO"
        />

        <SafetyProof
          label="Order Submitted"
          value="NO"
        />
      </div>
    </section>
  );
}

function ClosureActionCard({
  action,
}: {
  action:
    TinyLiveClosureAction;
}) {
  const stateClass =
    action.state ===
    "COMPLETE"
      ? "border-success/30 bg-success/10 text-success"
      : action.state ===
          "DEFERRED"
        ? "border-border-default bg-panel text-text-muted"
        : action.state ===
            "WAITING_FOR_EVIDENCE"
          ? "border-warning/30 bg-warning/10 text-warning"
          : "border-danger/30 bg-danger/10 text-danger";

  return (
    <article className="rounded-lg border border-border-default bg-panel-light p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          {action.state ===
          "COMPLETE" ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
          ) : action.state ===
            "DEFERRED" ? (
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-text-muted" />
          ) : (
            <XCircle className="mt-0.5 size-4 shrink-0 text-danger" />
          )}

          <div>
            <p className="font-bold text-text-primary">
              {action.title}
            </p>

            <p className="mt-1 text-xs leading-5 text-text-muted">
              {action.summary}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-1">
          <span className="rounded-full border border-border-default bg-panel px-2 py-0.5 text-[10px] font-bold text-text-muted">
            {action.priority}
          </span>

          <span className="rounded-full border border-border-default bg-panel px-2 py-0.5 text-[10px] font-bold text-text-muted">
            {action.owner}
          </span>

          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${stateClass}`}
          >
            {action.state.replaceAll(
              "_",
              " ",
            )}
          </span>
        </div>
      </div>

      {action.evidence.length >
      0 ? (
        <ul className="mt-3 space-y-1 border-t border-border-default pt-3 text-xs leading-5 text-text-muted">
          {action.evidence
            .slice(
              0,
              3,
            )
            .map(
              (
                item,
                index,
              ) => (
                <li
                  key={`${action.key}-${index}`}
                  className="flex gap-2"
                >
                  <span aria-hidden="true">
                    -
                  </span>

                  <span>{item}</span>
                </li>
              ),
            )}
        </ul>
      ) : null}
    </article>
  );
}

function PreflightReport({
  report,
}: {
  report: {
    approved: boolean;

    requestedCapital: number;

    market: string;

    buyExchange: string;

    sellExchange: string;

    generatedAt: number;

    liveOrderSubmissionPerformed: false;

    capitalReserved: false;

    liveSessionCreated: false;

    gates:
      TinyLivePreflightGate[];

    blockers:
      string[];

    notes:
      string[];
  };
}) {
  const passed =
    report.gates.filter(
      (
        gate,
      ) =>
        gate.state ===
        "PASS",
    ).length;

  const blocked =
    report.gates.length -
    passed;

  return (
    <section className="rounded-xl border border-border-default bg-panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
            Evaluation Result
          </p>

          <h2
            className={`mt-1 text-2xl font-bold ${
              report.approved
                ? "text-success"
                : "text-danger"
            }`}
          >
            {report.approved
              ? "PREFLIGHT APPROVED"
              : "PREFLIGHT BLOCKED"}
          </h2>

          <p className="mt-2 text-sm text-text-muted">
            {
              report.market
            }
            {" · "}
            <span className="uppercase">
              {
                report.buyExchange
              }
            </span>
            {" → "}
            <span className="uppercase">
              {
                report.sellExchange
              }
            </span>
            {" · ₹"}
            {
              report.requestedCapital
            }
          </p>
        </div>

        <div className="flex gap-2">
          <span className="rounded-full border border-success/30 bg-success/10 px-3 py-1 text-xs font-bold text-success">
            {passed} PASS
          </span>

          <span className="rounded-full border border-danger/30 bg-danger/10 px-3 py-1 text-xs font-bold text-danger">
            {blocked} BLOCKED
          </span>
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-lg border border-border-default">
        {report.gates.map(
          (
            gate,
            index,
          ) => (
            <GateRow
              key={
                gate.key
              }
              gate={
                gate
              }
              border={
                index !==
                report.gates.length -
                  1
              }
            />
          ),
        )}
      </div>

      {report.blockers.length >
      0 ? (
        <div className="mt-5">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-danger">
            Blocking Evidence
          </p>

          <div className="mt-3 space-y-2">
            {report.blockers.map(
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
        </div>
      ) : null}

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <SafetyProof
          label="Order Submitted"
          value={
            report.liveOrderSubmissionPerformed
              ? "YES"
              : "NO"
          }
        />

        <SafetyProof
          label="Capital Reserved"
          value={
            report.capitalReserved
              ? "YES"
              : "NO"
          }
        />

        <SafetyProof
          label="LIVE Session Created"
          value={
            report.liveSessionCreated
              ? "YES"
              : "NO"
          }
        />
      </div>
    </section>
  );
}

function EvidencePackagePanel({
  evidencePackage,
  archive,
  sealUnderstood,
  onSealUnderstoodChange,
  sealing,
  sealedPackage,
  sealError,
  onSeal,
}: {
  evidencePackage:
    TinyLiveEvidencePackage;

  archive:
    TinyLiveEvidenceArchive;

  sealUnderstood: boolean;

  onSealUnderstoodChange:
    (value: boolean) => void;

  sealing: boolean;

  sealedPackage:
    TinyLiveEvidencePackage | null;

  sealError:
    string | null;

  onSeal: () => void;
}) {
  const noGo =
    evidencePackage.decision ===
    "NO_GO";

  return (
    <section className="rounded-xl border border-border-default bg-panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">
            V{evidencePackage.milestone}
          </p>

          <h2 className="mt-1 text-2xl font-bold text-text-primary">
            Content-Addressed Tiny-LIVE Evidence Package
          </h2>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">
            Preview the current
            evidence decision and,
            with explicit
            confirmation, append an
            immutable SHA-256 record
            to the restart-safe
            archive. Sealing records
            evidence only.
          </p>
        </div>

        <span
          className={`rounded-full border px-4 py-2 text-sm font-bold ${
            noGo
              ? "border-danger/30 bg-danger/10 text-danger"
              : "border-success/30 bg-success/10 text-success"
          }`}
        >
          {evidencePackage.decision.replaceAll(
            "_",
            " ",
          )}
        </span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <TopMetric
          label="Rolling Status"
          value={
            evidencePackage.evidence
              .rollingReadiness.status
          }
          good={
            evidencePackage.evidence
              .rollingReadiness.status ===
            "STABLE"
          }
        />

        <TopMetric
          label="Observations"
          value={`${evidencePackage.evidence.rollingReadiness.observationEvidence.observationsInWindow}/${evidencePackage.evidence.rollingReadiness.policy.minimumObservations}`}
          good={
            evidencePackage.evidence
              .rollingReadiness
              .observationEvidence
              .observationRequirementMet
          }
        />

        <TopMetric
          label="Go/No-Go Gates"
          value={`${evidencePackage.evidence.goNoGo.summary.passed}/${evidencePackage.evidence.goNoGo.summary.totalGates}`}
          good={
            evidencePackage.evidence
              .goNoGo
              .activationReviewEligible
          }
        />

        <TopMetric
          label="Integrity"
          value="SHA-256"
          good={
            evidencePackage.integrity
              .verifiedAtGeneration
          }
        />

        <TopMetric
          label="Sealed Archive"
          value={String(
            archive.totalSealedPackages,
          )}
          good={
            archive.persistenceHealthy
          }
        />
      </div>

      <div className="mt-5 rounded-lg border border-border-default bg-panel-light p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
          Preview package ID
        </p>

        <p className="mt-2 break-all font-mono text-xs text-text-primary">
          {evidencePackage.packageId}
        </p>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-danger">
            Current blockers ({evidencePackage.blockers.length})
          </p>

          <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
            {evidencePackage.blockers
              .slice(
                0,
                20,
              )
              .map(
                (blocker) => (
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
        </div>

        <div className="rounded-lg border border-border-default bg-panel-light p-4">
          <div className="flex items-center gap-2">
            <LockKeyhole className="size-4 text-brand" />

            <p className="text-sm font-bold text-text-primary">
              Seal current snapshot
            </p>
          </div>

          <label className="mt-4 flex items-start gap-3 text-xs leading-5 text-text-muted">
            <input
              type="checkbox"
              checked={
                sealUnderstood
              }
              onChange={(
                event,
              ) =>
                onSealUnderstoodChange(
                  event.target.checked,
                )
              }
              className="mt-1"
            />

            I understand sealing
            preserves the current
            decision—including
            NO-GO—and performs no
            trading action.
          </label>

          <button
            type="button"
            disabled={
              !sealUnderstood ||
              sealing
            }
            onClick={onSeal}
            className="mt-4 w-full rounded-md border border-brand/40 bg-brand/10 px-3 py-2 text-sm font-bold text-brand disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sealing
              ? "Sealing evidence..."
              : "Seal Evidence Snapshot"}
          </button>

          {sealedPackage ? (
            <div className="mt-3 rounded-lg border border-success/20 bg-success/10 p-3 text-xs text-success">
              Sealed package {sealedPackage.packageId.slice(
                0,
                24,
              )}…
            </div>
          ) : null}

          {sealError ? (
            <div className="mt-3 rounded-lg border border-danger/20 bg-danger/10 p-3 text-xs text-danger">
              {sealError}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-4">
        <SafetyProof
          label="LIVE Trading"
          value="OFF"
        />

        <SafetyProof
          label="Order Submitted"
          value="NO"
        />

        <SafetyProof
          label="Capital Reserved"
          value="NO"
        />

        <SafetyProof
          label="Account Mode Changed"
          value="NO"
        />
      </div>
    </section>
  );
}

function GateRow({
  gate,
  border,
}: {
  gate:
    TinyLivePreflightGate;

  border: boolean;
}) {
  return (
    <div
      className={`bg-panel-light p-4 ${
        border
          ? "border-b border-border-default"
          : ""
      }`}
    >
      <div className="flex items-start gap-3">
        {gate.state ===
        "PASS" ? (
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />
        ) : (
          <XCircle className="mt-0.5 size-5 shrink-0 text-danger" />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-mono text-sm font-bold text-text-primary">
              {gate.key}
            </p>

            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                gate.state ===
                "PASS"
                  ? "border-success/30 bg-success/10 text-success"
                  : "border-danger/30 bg-danger/10 text-danger"
              }`}
            >
              {gate.state}
            </span>
          </div>

          <p className="mt-1 text-sm text-text-muted">
            {gate.message}
          </p>

          {gate.reasons.length >
          0 ? (
            <ul className="mt-2 space-y-1 text-xs leading-5 text-danger">
              {gate.reasons.map(
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
          ) : null}
        </div>
      </div>
    </div>
  );
}

function BalanceRequirement({
  title,
  exchange,
  asset,
  amount,
  onAssetChange,
  onAmountChange,
}: {
  title: string;

  exchange: string;

  asset: string;

  amount: number;

  onAssetChange:
    (
      value: string,
    ) => void;

  onAmountChange:
    (
      value: number,
    ) => void;
}) {
  return (
    <div className="rounded-lg border border-border-default bg-panel-light p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-text-muted">
        {title}
      </p>

      <p className="mt-1 text-sm font-bold uppercase text-text-primary">
        {exchange}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Field
          label="Asset"
        >
          <input
            value={
              asset
            }
            onChange={(
              event,
            ) =>
              onAssetChange(
                event.target.value,
              )
            }
            placeholder="USDT / BTC"
            className={inputClass}
          />
        </Field>

        <Field
          label="Required Amount"
        >
          <input
            type="number"
            min={0}
            step="any"
            value={
              amount
            }
            onChange={(
              event,
            ) =>
              onAmountChange(
                Number(
                  event.target.value,
                ),
              )
            }
            className={inputClass}
          />
        </Field>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;

  children:
    React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">
        {label}
      </span>

      <div className="mt-2">
        {children}
      </div>
    </label>
  );
}

function TopMetric({
  label,
  value,
  good,
}: {
  label: string;

  value: string;

  good: boolean;
}) {
  return (
    <div className="rounded-lg border border-border-default bg-panel-light p-4">
      <p className="text-xs uppercase tracking-[0.14em] text-text-muted">
        {label}
      </p>

      <div className="mt-2 flex items-center gap-2">
        {good ? (
          <CheckCircle2 className="size-4 text-success" />
        ) : (
          <AlertTriangle className="size-4 text-warning" />
        )}

        <p className="font-mono text-sm font-bold text-text-primary">
          {value}
        </p>
      </div>
    </div>
  );
}

function SafetyRow({
  label,
  value,
}: {
  label: string;

  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border-default pb-2 last:border-b-0 last:pb-0">
      <span className="text-sm text-text-muted">
        {label}
      </span>

      <span className="font-mono text-xs font-bold text-success">
        {value}
      </span>
    </div>
  );
}

function SafetyProof({
  label,
  value,
}: {
  label: string;

  value: string;
}) {
  return (
    <div className="rounded-lg border border-success/20 bg-success/10 p-4">
      <p className="text-xs uppercase tracking-[0.13em] text-text-muted">
        {label}
      </p>

      <p className="mt-2 font-mono text-lg font-bold text-success">
        {value}
      </p>
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-border-default bg-panel px-3 py-2 text-sm text-text-primary outline-none transition focus:border-brand/60";
