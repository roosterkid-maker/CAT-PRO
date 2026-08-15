import type {
  ReactNode,
} from "react";

import {
  Bell,
  BellRing,
  CheckCircle2,
  PlugZap,
  ShieldAlert,
  Volume2,
} from "lucide-react";

import {
  useNotificationPreferences,
} from "../store/useNotificationPreferences";

import {
  useNotificationStore,
} from "../store/useNotificationStore";

export function NotificationSettingsCard() {
  const opportunityAlerts =
    useNotificationPreferences(
      (state) =>
        state.opportunityAlerts,
    );

  const executionSuccessAlerts =
    useNotificationPreferences(
      (state) =>
        state.executionSuccessAlerts,
    );

  const executionFailureAlerts =
    useNotificationPreferences(
      (state) =>
        state.executionFailureAlerts,
    );

  const exchangeConnectionAlerts =
    useNotificationPreferences(
      (state) =>
        state.exchangeConnectionAlerts,
    );

  const soundEnabled =
    useNotificationPreferences(
      (state) =>
        state.soundEnabled,
    );

  const setOpportunityAlerts =
    useNotificationPreferences(
      (state) =>
        state.setOpportunityAlerts,
    );

  const setExecutionSuccessAlerts =
    useNotificationPreferences(
      (state) =>
        state.setExecutionSuccessAlerts,
    );

  const setExecutionFailureAlerts =
    useNotificationPreferences(
      (state) =>
        state.setExecutionFailureAlerts,
    );

  const setExchangeConnectionAlerts =
    useNotificationPreferences(
      (state) =>
        state.setExchangeConnectionAlerts,
    );

  const setSoundEnabled =
    useNotificationPreferences(
      (state) =>
        state.setSoundEnabled,
    );

  const pushNotification =
    useNotificationStore(
      (state) =>
        state.pushNotification,
    );

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-panel">
      <header className="border-b border-border px-5 py-4">
        <div className="flex items-center gap-2">
          <Bell
            size={18}
            className="text-primary"
          />

          <h2 className="text-lg font-semibold text-text-primary">
            Notification Preferences
          </h2>
        </div>

        <p className="mt-1 text-sm text-text-muted">
          Choose which live trading events should trigger alerts.
        </p>
      </header>

      <div className="divide-y divide-border">
        <PreferenceRow
          icon={
            <BellRing
              size={17}
            />
          }
          title="Opportunity alerts"
          description="Notify when a new EXECUTE opportunity appears."
          checked={
            opportunityAlerts
          }
          onChange={
            setOpportunityAlerts
          }
        />

        <PreferenceRow
          icon={
            <CheckCircle2
              size={17}
            />
          }
          title="Successful executions"
          description="Notify when an order is filled successfully."
          checked={
            executionSuccessAlerts
          }
          onChange={
            setExecutionSuccessAlerts
          }
        />

        <PreferenceRow
          icon={
            <ShieldAlert
              size={17}
            />
          }
          title="Failures and timeouts"
          description="Notify for failed, rejected, cancelled or timed-out orders."
          checked={
            executionFailureAlerts
          }
          onChange={
            setExecutionFailureAlerts
          }
        />

        <PreferenceRow
          icon={
            <PlugZap
              size={17}
            />
          }
          title="Exchange connection changes"
          description="Notify when an exchange adapter disconnects or reconnects."
          checked={
            exchangeConnectionAlerts
          }
          onChange={
            setExchangeConnectionAlerts
          }
        />

        <PreferenceRow
          icon={
            <Volume2
              size={17}
            />
          }
          title="Notification sound"
          description="Play a short sound when a toast appears."
          checked={
            soundEnabled
          }
          onChange={
            setSoundEnabled
          }
        />
      </div>

      <footer className="flex flex-col gap-3 border-t border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-text-muted">
          Test your current toast and sound settings.
        </p>

        <button
          type="button"
          onClick={() => {
            pushNotification({
              title:
                "Notification test",

              message:
                "CAT PRO notification system is working correctly.",

              severity:
                "success",

              durationMs:
                5_000,
            });
          }}
          className="rounded-md border border-border bg-panel-light px-3 py-2 text-xs font-medium text-text-primary transition-colors hover:border-primary/40 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          Send Test
        </button>
      </footer>
    </section>
  );
}

interface PreferenceRowProps {
  icon: ReactNode;

  title: string;

  description: string;

  checked: boolean;

  onChange: (
    enabled: boolean,
  ) => void;
}

function PreferenceRow({
  icon,
  title,
  description,
  checked,
  onChange,
}: PreferenceRowProps) {
  return (
    <div className="flex items-center justify-between gap-6 px-5 py-4">
      <div className="flex min-w-0 items-start gap-3">
        <div className="mt-0.5 shrink-0 text-primary">
          {icon}
        </div>

        <div className="min-w-0">
          <p className="text-sm font-medium text-text-primary">
            {title}
          </p>

          <p className="mt-1 text-xs leading-5 text-text-muted">
            {description}
          </p>
        </div>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={
          checked
        }
        aria-label={
          title
        }
        onClick={() => {
          onChange(
            !checked,
          );
        }}
        className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
          checked
            ? "border-emerald-500/40 bg-emerald-500/30"
            : "border-border bg-panel-light"
        }`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
            checked
              ? "translate-x-5"
              : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}