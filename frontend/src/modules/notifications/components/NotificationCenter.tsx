import {
  useEffect,
} from "react";

import {
  AlertTriangle,
  CheckCircle2,
  CircleAlert,
  Info,
  X,
} from "lucide-react";

import type {
  AppNotification,
  NotificationSeverity,
} from "../store/useNotificationStore";

import {
  useNotificationPreferences,
} from "../store/useNotificationPreferences";

import {
  useNotificationStore,
} from "../store/useNotificationStore";

export function NotificationCenter() {
  const notifications =
    useNotificationStore(
      (state) =>
        state.notifications,
    );

  return (
    <div className="pointer-events-none fixed right-5 top-5 z-100 flex w-[calc(100%-2.5rem)] max-w-sm flex-col gap-3">
      {notifications.map(
        (
          notification,
        ) => (
          <NotificationToast
            key={
              notification.id
            }
            notification={
              notification
            }
          />
        ),
      )}
    </div>
  );
}

interface NotificationToastProps {
  notification:
    AppNotification;
}

function NotificationToast({
  notification,
}: NotificationToastProps) {
  const dismissNotification =
    useNotificationStore(
      (state) =>
        state.dismissNotification,
    );

  const soundEnabled =
    useNotificationPreferences(
      (state) =>
        state.soundEnabled,
    );

  useEffect(() => {
    if (soundEnabled) {
      void playNotificationSound(
        notification.severity,
      );
    }
  }, [
    notification.id,
    notification.severity,
    soundEnabled,
  ]);

  useEffect(() => {
    const normalizedDuration =
      Math.max(
        notification.durationMs,
        1_000,
      );

    const timer =
      window.setTimeout(
        () => {
          dismissNotification(
            notification.id,
          );
        },
        normalizedDuration,
      );

    return () => {
      window.clearTimeout(
        timer,
      );
    };
  }, [
    dismissNotification,
    notification.durationMs,
    notification.id,
  ]);

  const config =
    getNotificationConfig(
      notification.severity,
    );

  const Icon =
    config.icon;

  return (
    <article
      role={
        notification.severity ===
          "error" ||
        notification.severity ===
          "warning"
          ? "alert"
          : "status"
      }
      className={`pointer-events-auto overflow-hidden rounded-xl border bg-panel shadow-2xl ${config.borderClassName}`}
    >
      <div className="flex items-start gap-3 p-4">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${config.iconContainerClassName}`}
        >
          <Icon size={18} />
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-text-primary">
            {notification.title}
          </h3>

          <p className="mt-1 text-sm leading-5 text-text-muted">
            {notification.message}
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            dismissNotification(
              notification.id,
            );
          }}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-panel-light hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          aria-label="Dismiss notification"
        >
          <X size={15} />
        </button>
      </div>

      <div className="h-1 overflow-hidden bg-panel-light">
        <div
          className={`h-full origin-left ${config.progressClassName}`}
          style={{
            animation:
              `notification-progress ${Math.max(
                notification.durationMs,
                1_000,
              )}ms linear forwards`,
          }}
        />
      </div>
    </article>
  );
}

function getNotificationConfig(
  severity:
    NotificationSeverity,
) {
  switch (severity) {
    case "success":
      return {
        icon:
          CheckCircle2,

        borderClassName:
          "border-emerald-500/30",

        iconContainerClassName:
          "bg-emerald-500/10 text-emerald-400",

        progressClassName:
          "bg-emerald-400",
      };

    case "warning":
      return {
        icon:
          AlertTriangle,

        borderClassName:
          "border-amber-500/30",

        iconContainerClassName:
          "bg-amber-500/10 text-amber-400",

        progressClassName:
          "bg-amber-400",
      };

    case "error":
      return {
        icon:
          CircleAlert,

        borderClassName:
          "border-red-500/30",

        iconContainerClassName:
          "bg-red-500/10 text-red-400",

        progressClassName:
          "bg-red-400",
      };

    default:
      return {
        icon:
          Info,

        borderClassName:
          "border-brand/30",

        iconContainerClassName:
          "bg-brand/10 text-brand",

        progressClassName:
          "bg-brand",
      };
  }
}

async function playNotificationSound(
  severity:
    NotificationSeverity,
): Promise<void> {
  const AudioContextClass =
    window.AudioContext ??
    (
      window as typeof window & {
        webkitAudioContext?:
          typeof AudioContext;
      }
    ).webkitAudioContext;

  if (!AudioContextClass) {
    return;
  }

  let audioContext:
    AudioContext | null =
    null;

  try {
    audioContext =
      new AudioContextClass();

    if (
      audioContext.state ===
      "suspended"
    ) {
      await audioContext.resume();
    }

    const oscillator =
      audioContext.createOscillator();

    const gain =
      audioContext.createGain();

    const now =
      audioContext.currentTime;

    oscillator.type =
      "sine";

    oscillator.frequency.setValueAtTime(
      getSoundFrequency(
        severity,
      ),
      now,
    );

    gain.gain.setValueAtTime(
      0.0001,
      now,
    );

    gain.gain.exponentialRampToValueAtTime(
      0.12,
      now + 0.015,
    );

    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      now + 0.22,
    );

    oscillator.connect(
      gain,
    );

    gain.connect(
      audioContext.destination,
    );

    oscillator.start(
      now,
    );

    oscillator.stop(
      now + 0.24,
    );

    oscillator.addEventListener(
      "ended",
      () => {
        void audioContext?.close();
      },
      {
        once:
          true,
      },
    );
  } catch {
    if (
      audioContext &&
      audioContext.state !==
        "closed"
    ) {
      await audioContext
        .close()
        .catch(
          () => undefined,
        );
    }
  }
}

function getSoundFrequency(
  severity:
    NotificationSeverity,
): number {
  switch (severity) {
    case "success":
      return 880;

    case "warning":
      return 620;

    case "error":
      return 360;

    default:
      return 740;
  }
}