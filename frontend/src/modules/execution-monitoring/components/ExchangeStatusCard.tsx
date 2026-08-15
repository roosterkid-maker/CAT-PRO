import {
  Activity,
  CheckCircle2,
  CircleAlert,
  CircleDashed,
  Clock3,
  Gauge,
  ShieldAlert,
  Wifi,
  WifiOff,
} from "lucide-react";

import type {
  ExchangeExecutionHealth,
  ExchangeExecutionMetrics,
  ExecutionHealthStatus,
  LiveExecutionAdapterVerificationState,
} from "../services/executionMonitoringApi";

interface ExchangeStatusCardProps {
  exchange: string;

  health:
    | ExchangeExecutionHealth
    | null;

  metrics:
    | ExchangeExecutionMetrics
    | null;
}

const STATUS_CONFIG: Record<
  ExecutionHealthStatus,
  {
    label: string;
    className: string;
    icon: typeof CheckCircle2;
  }
> = {
  HEALTHY: {
    label: "Healthy",
    className:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
    icon:
      CheckCircle2,
  },

  DEGRADED: {
    label: "Degraded",
    className:
      "border-amber-500/30 bg-amber-500/10 text-amber-400",
    icon:
      CircleAlert,
  },

  UNHEALTHY: {
    label: "Unhealthy",
    className:
      "border-red-500/30 bg-red-500/10 text-red-400",
    icon:
      ShieldAlert,
  },

  NO_DATA: {
    label: "No Data",
    className:
      "border-border bg-panel-light text-text-muted",
    icon:
      CircleDashed,
  },
};

export function ExchangeStatusCard({
  exchange,
  health,
  metrics,
}: ExchangeStatusCardProps) {
  const status =
    health?.status ??
    "NO_DATA";

  const statusConfig =
    STATUS_CONFIG[status];

  const StatusIcon =
    statusConfig.icon;

  const verificationPresentation =
    getVerificationPresentation(
      health?.verificationState ??
      null,
    );

  const VerificationIcon =
    verificationPresentation.icon;

  const displayName =
    formatExchangeName(
      exchange,
    );

  const totalExecutions =
    metrics?.totalExecutions ??
    health?.totalExecutions ??
    0;

  const fillRate =
    metrics?.fillRatePercent ??
    health?.fillRatePercent ??
    0;

  const timeoutRate =
    metrics?.timeoutRatePercent ??
    health?.timeoutRatePercent ??
    0;

  const failureRate =
    metrics?.failureRatePercent ??
    health?.failureRatePercent ??
    0;

  const averageExecutionTime =
    metrics
      ?.averageExecutionTimeMs ??
    health
      ?.averageExecutionTimeMs ??
    0;

  const lastExecutionAt =
    metrics?.lastExecutionAt ??
    health?.lastExecutionAt ??
    null;

  return (
    <section className="rounded-xl border border-border bg-panel p-5">
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-panel-light text-primary">
              <Activity
                size={20}
              />
            </div>

            <div>
              <h2 className="text-lg font-semibold text-text-primary">
                {displayName}
              </h2>

              <div className="mt-1 flex items-center gap-2 text-xs">
                <VerificationIcon
                  size={14}
                  className={
                    verificationPresentation
                      .className
                  }
                />

                <span
                  className={
                    verificationPresentation
                      .className
                  }
                >
                  {
                    verificationPresentation
                      .label
                  }
                </span>
              </div>
            </div>
          </div>
        </div>

        <div
          className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${statusConfig.className}`}
        >
          <StatusIcon
            size={14}
          />

          {statusConfig.label}
        </div>
      </header>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <EvidenceItem
          label="Credentials"
          value={
            !health
              ? "Not reported"
              : health
                  .credentialsConfigured
                ? "Configured"
                : "Missing"
          }
        />

        <EvidenceItem
          label="Authentication"
          value={
            !health
              ? "Not reported"
              : health
                  .authenticationVerified
                ? "Verified"
                : "Unverified"
          }
        />

        <EvidenceItem
          label="Execution API"
          value={
            !health
              ? "Not reported"
              : health
                  .exchangeApiReachable
                ? "Reachable"
                : "Unverified"
          }
        />

        <EvidenceItem
          label="Execution Evidence"
          value={
            !health
              ? "Not reported"
              : health
                  .executionEvidenceAvailable
                ? "Available"
                : "None"
          }
        />

        <EvidenceItem
          label="Verification Fresh"
          value={
            !health
              ? "Not reported"
              : health
                  .readOnlyVerificationFresh
                ? "Yes"
                : "No"
          }
        />

        <EvidenceItem
          label="Verification Method"
          value={
            !health
              ? "Not reported"
              : health
                    .verificationMethod
                  ?.replaceAll(
                    "_",
                    " ",
                  ) ??
                "None"
          }
        />

        <EvidenceItem
          label="Last Verified"
          value={
            !health
              ? "Not reported"
              : formatVerificationTime(
                  health
                    .lastVerifiedAt,
                )
          }
        />

        <EvidenceItem
          label="LIVE Execution"
          value={
            !health
              ? "Not reported"
              : health
                  .liveExecutionEnabled
                ? "Enabled"
                : "Disabled"
          }
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <MetricItem
          label="Executions"
          value={String(
            totalExecutions,
          )}
          icon={
            <Activity
              size={16}
            />
          }
        />

        <MetricItem
          label="Average Time"
          value={`${averageExecutionTime.toFixed(
            0,
          )} ms`}
          icon={
            <Clock3
              size={16}
            />
          }
        />

        <MetricItem
          label="Fill Rate"
          value={`${fillRate.toFixed(
            2,
          )}%`}
          icon={
            <Gauge
              size={16}
            />
          }
        />

        <MetricItem
          label="Timeout Rate"
          value={`${timeoutRate.toFixed(
            2,
          )}%`}
          icon={
            <CircleAlert
              size={16}
            />
          }
        />

        <MetricItem
          label="Failure Rate"
          value={`${failureRate.toFixed(
            2,
          )}%`}
          icon={
            <ShieldAlert
              size={16}
            />
          }
        />

        <MetricItem
          label="Last Execution"
          value={
            formatLastExecution(
              lastExecutionAt,
            )
          }
          icon={
            <Clock3
              size={16}
            />
          }
        />
      </div>

      {health?.reasons.length ? (
        <div className="mt-5 border-t border-border pt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
            Health Details
          </p>

          <ul className="mt-2 space-y-1.5 text-xs text-text-muted">
            {health.reasons
              .slice(
                0,
                3,
              )
              .map(
                (
                  reason,
                ) => (
                  <li
                    key={
                      reason
                    }
                    className="flex gap-2"
                  >
                    <span>
                      •
                    </span>

                    <span>
                      {reason}
                    </span>
                  </li>
                ),
              )}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function EvidenceItem({
  label,
  value,
}: {
  label: string;

  value: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-panel-light/50 p-3">
      <p className="text-xs text-text-muted">
        {label}
      </p>

      <p className="mt-1 text-sm font-semibold text-text-primary">
        {value}
      </p>
    </div>
  );
}

interface MetricItemProps {
  label: string;

  value: string;

  icon: React.ReactNode;
}

function MetricItem({
  label,
  value,
  icon,
}: MetricItemProps) {
  return (
    <div className="rounded-lg border border-border bg-panel-light/50 p-3">
      <div className="flex items-center gap-2 text-text-muted">
        {icon}

        <span className="text-xs">
          {label}
        </span>
      </div>

      <p className="mt-2 text-base font-semibold text-text-primary">
        {value}
      </p>
    </div>
  );
}

function formatExchangeName(
  exchange: string,
): string {
  const normalized =
    exchange
      .trim()
      .toLowerCase();

  if (
    normalized ===
    "coindcx"
  ) {
    return "CoinDCX";
  }

  if (
    normalized ===
    "binance"
  ) {
    return "Binance";
  }

  return exchange
    .trim()
    .replace(
      /(^|\s)\S/g,
      (character) =>
        character.toUpperCase(),
    );
}

function getVerificationPresentation(
  state:
    | LiveExecutionAdapterVerificationState
    | null,
): {
  label: string;

  className: string;

  icon:
    typeof Wifi;
} {
  if (state === "VERIFIED") {
    return {
      label:
        "Authenticated",

      className:
        "text-emerald-400",

      icon:
        Wifi,
    };
  }

  if (
    state ===
    "CONFIGURED_UNVERIFIED"
  ) {
    return {
      label:
        "Configured, unverified",

      className:
        "text-amber-400",

      icon:
        CircleDashed,
    };
  }

  if (
    state ===
    "VERIFICATION_STALE"
  ) {
    return {
      label:
        "Verification stale",

      className:
        "text-amber-400",

      icon:
        Clock3,
    };
  }

  if (
    state ===
    "NOT_CONFIGURED"
  ) {
    return {
      label:
        "Not configured",

      className:
        "text-red-400",

      icon:
        WifiOff,
    };
  }

  return {
    label:
      "Not reported",

    className:
      "text-text-muted",

    icon:
      CircleDashed,
  };
}

function formatVerificationTime(
  timestamp:
    | number
    | null,
): string {
  if (
    timestamp ===
    null
  ) {
    return "Never";
  }

  return new Date(
    timestamp,
  ).toLocaleString();
}

function formatLastExecution(
  timestamp:
    | number
    | null,
): string {
  if (
    timestamp === null
  ) {
    return "No data";
  }

  const differenceMs =
    Date.now() -
    timestamp;

  if (
    differenceMs < 0
  ) {
    return "Just now";
  }

  const seconds =
    Math.floor(
      differenceMs /
      1_000,
    );

  if (
    seconds < 60
  ) {
    return `${seconds}s ago`;
  }

  const minutes =
    Math.floor(
      seconds /
      60,
    );

  if (
    minutes < 60
  ) {
    return `${minutes}m ago`;
  }

  const hours =
    Math.floor(
      minutes /
      60,
    );

  if (
    hours < 24
  ) {
    return `${hours}h ago`;
  }

  return new Date(
    timestamp,
  ).toLocaleString();
}
