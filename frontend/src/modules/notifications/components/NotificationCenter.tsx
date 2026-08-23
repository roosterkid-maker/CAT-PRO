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

    const now =
      audioContext.currentTime;

    const masterGain =
      audioContext.createGain();

    const echoDelay =
      audioContext.createDelay(
        0.2,
      );

    const echoGain =
      audioContext.createGain();

    masterGain.gain.setValueAtTime(
      0.72,
      now,
    );

    echoDelay.delayTime.setValueAtTime(
      0.085,
      now,
    );

    echoGain.gain.setValueAtTime(
      0.16,
      now,
    );

    masterGain.connect(
      audioContext.destination,
    );

    masterGain.connect(
      echoDelay,
    );

    echoDelay.connect(
      echoGain,
    );

    echoGain.connect(
      audioContext.destination,
    );

    let finalOscillator:
      OscillatorNode | null =
      null;

    for (
      const note
      of getFuturisticChime(
        severity,
      )
    ) {
      const startAt =
        now + note.delaySeconds;

      const stopAt =
        startAt + note.durationSeconds;

      const oscillator =
        audioContext.createOscillator();

      const shimmer =
        audioContext.createOscillator();

      const shimmerGain =
        audioContext.createGain();

      const envelope =
        audioContext.createGain();

      oscillator.type =
        "sine";

      shimmer.type =
        "triangle";

      oscillator.frequency.setValueAtTime(
        note.frequencyHz,
        startAt,
      );

      oscillator.frequency.exponentialRampToValueAtTime(
        note.frequencyHz * 1.012,
        stopAt,
      );

      shimmer.frequency.setValueAtTime(
        note.frequencyHz * 2.01,
        startAt,
      );

      shimmerGain.gain.setValueAtTime(
        0.11,
        startAt,
      );

      envelope.gain.setValueAtTime(
        0.0001,
        startAt,
      );

      envelope.gain.exponentialRampToValueAtTime(
        note.volume,
        startAt + 0.012,
      );

      envelope.gain.exponentialRampToValueAtTime(
        0.0001,
        stopAt,
      );

      oscillator.connect(
        envelope,
      );

      shimmer.connect(
        shimmerGain,
      );

      shimmerGain.connect(
        envelope,
      );

      envelope.connect(
        masterGain,
      );

      oscillator.start(
        startAt,
      );

      shimmer.start(
        startAt,
      );

      oscillator.stop(
        stopAt,
      );

      shimmer.stop(
        stopAt,
      );

      finalOscillator =
        oscillator;
    }

    finalOscillator?.addEventListener(
      "ended",
      () => {
        window.setTimeout(
          () => {
            void audioContext?.close();
          },
          140,
        );
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

interface FuturisticChimeNote {
  readonly frequencyHz: number;
  readonly delaySeconds: number;
  readonly durationSeconds: number;
  readonly volume: number;
}

function getFuturisticChime(
  severity:
    NotificationSeverity,
): readonly FuturisticChimeNote[] {
  switch (severity) {
    case "success":
      return [
        {
          frequencyHz: 659.25,
          delaySeconds: 0,
          durationSeconds: 0.24,
          volume: 0.085,
        },
        {
          frequencyHz: 987.77,
          delaySeconds: 0.085,
          durationSeconds: 0.3,
          volume: 0.078,
        },
        {
          frequencyHz: 1318.51,
          delaySeconds: 0.17,
          durationSeconds: 0.38,
          volume: 0.068,
        },
      ];

    case "warning":
      return [
        {
          frequencyHz: 659.25,
          delaySeconds: 0,
          durationSeconds: 0.22,
          volume: 0.08,
        },
        {
          frequencyHz: 554.37,
          delaySeconds: 0.095,
          durationSeconds: 0.28,
          volume: 0.076,
        },
        {
          frequencyHz: 830.61,
          delaySeconds: 0.2,
          durationSeconds: 0.32,
          volume: 0.066,
        },
      ];

    case "error":
      return [
        {
          frequencyHz: 440,
          delaySeconds: 0,
          durationSeconds: 0.23,
          volume: 0.082,
        },
        {
          frequencyHz: 349.23,
          delaySeconds: 0.09,
          durationSeconds: 0.28,
          volume: 0.076,
        },
        {
          frequencyHz: 261.63,
          delaySeconds: 0.18,
          durationSeconds: 0.36,
          volume: 0.07,
        },
      ];

    default:
      return [
        {
          frequencyHz: 587.33,
          delaySeconds: 0,
          durationSeconds: 0.22,
          volume: 0.078,
        },
        {
          frequencyHz: 880,
          delaySeconds: 0.085,
          durationSeconds: 0.28,
          volume: 0.072,
        },
        {
          frequencyHz: 1174.66,
          delaySeconds: 0.17,
          durationSeconds: 0.34,
          volume: 0.064,
        },
      ];
  }
}
