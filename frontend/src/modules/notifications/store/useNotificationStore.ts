import {
  create,
} from "zustand";

export type NotificationSeverity =
  | "success"
  | "warning"
  | "error"
  | "info";

export interface AppNotification {
  id: string;

  title: string;

  message: string;

  severity:
    NotificationSeverity;

  createdAt: number;

  durationMs: number;
}

export interface CreateNotificationInput {
  title: string;

  message: string;

  severity:
    NotificationSeverity;

  durationMs: number;
}

interface NotificationStoreState {
  notifications:
    AppNotification[];

  pushNotification: (
    notification:
      CreateNotificationInput,
  ) => string;

  dismissNotification: (
    id: string,
  ) => void;

  clearNotifications:
    () => void;
}

function createNotificationId():
string {
  if (
    typeof crypto !==
      "undefined" &&
    typeof crypto.randomUUID ===
      "function"
  ) {
    return crypto.randomUUID();
  }

  return [
    "notification",
    Date.now(),
    Math.random()
      .toString(36)
      .slice(2),
  ].join("-");
}

export const useNotificationStore =
  create<NotificationStoreState>(
    (
      set,
    ) => ({
      notifications:
        [],

      pushNotification:
        (
          notification,
        ) => {
          const id =
            createNotificationId();

          const item:
            AppNotification = {
            ...notification,

            id,

            createdAt:
              Date.now(),
          };

          set(
            (
              state,
            ) => ({
              notifications: [
                item,
                ...state.notifications,
              ].slice(
                0,
                10,
              ),
            }),
          );

          return id;
        },

      dismissNotification:
        (
          id,
        ) => {
          set(
            (
              state,
            ) => ({
              notifications:
                state.notifications.filter(
                  (
                    notification,
                  ) =>
                    notification.id !==
                    id,
                ),
            }),
          );
        },

      clearNotifications:
        () => {
          set({
            notifications:
              [],
          });
        },
    }),
  );