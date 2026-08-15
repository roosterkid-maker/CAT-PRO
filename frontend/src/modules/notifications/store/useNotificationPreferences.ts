import {
  create,
} from "zustand";

import {
  persist,
} from "zustand/middleware";

export interface NotificationPreferences {
  opportunityAlerts:
    boolean;

  executionSuccessAlerts:
    boolean;

  executionFailureAlerts:
    boolean;

  exchangeConnectionAlerts:
    boolean;

  soundEnabled:
    boolean;

  setOpportunityAlerts: (
    enabled: boolean,
  ) => void;

  setExecutionSuccessAlerts: (
    enabled: boolean,
  ) => void;

  setExecutionFailureAlerts: (
    enabled: boolean,
  ) => void;

  setExchangeConnectionAlerts: (
    enabled: boolean,
  ) => void;

  setSoundEnabled: (
    enabled: boolean,
  ) => void;
}

export const useNotificationPreferences =
  create<NotificationPreferences>()(
    persist(
      (
        set,
      ) => ({
        opportunityAlerts:
          true,

        executionSuccessAlerts:
          true,

        executionFailureAlerts:
          true,

        exchangeConnectionAlerts:
          true,

        soundEnabled:
          false,

        setOpportunityAlerts:
          (
            enabled,
          ) => {
            set({
              opportunityAlerts:
                enabled,
            });
          },

        setExecutionSuccessAlerts:
          (
            enabled,
          ) => {
            set({
              executionSuccessAlerts:
                enabled,
            });
          },

        setExecutionFailureAlerts:
          (
            enabled,
          ) => {
            set({
              executionFailureAlerts:
                enabled,
            });
          },

        setExchangeConnectionAlerts:
          (
            enabled,
          ) => {
            set({
              exchangeConnectionAlerts:
                enabled,
            });
          },

        setSoundEnabled:
          (
            enabled,
          ) => {
            set({
              soundEnabled:
                enabled,
            });
          },
      }),
      {
        name:
          "cat-pro-notification-preferences",
      },
    ),
  );