import {
  useCallback,
  useEffect,
} from "react";

import {
  useLocation,
  useNavigate,
} from "react-router-dom";

import AppRouter from "@/app/AppRouter";

import {
  APP_PAGE_PATHS,
  getAppPageFromPath,
} from "@/app/routes";

import type {
  AppPage,
} from "@/app/routes";

import MainLayout from "@/layouts/MainLayout";

import {
  NotificationCenter,
} from "@/modules/notifications/components/NotificationCenter";

import {
  NotificationEventBridge,
} from "@/modules/notifications/components/NotificationEventBridge";

import {
  startSocketManager,
  stopSocketManager,
} from "@/socket/socketManager";

function App() {
  const location =
    useLocation();

  const navigate =
    useNavigate();

  const page =
    getAppPageFromPath(
      location.pathname,
    );

  const navigateToPage =
    useCallback(
      (
        nextPage:
          AppPage,
      ) => {
        void navigate(
          APP_PAGE_PATHS[
            nextPage
          ],
        );
      },
      [
        navigate,
      ],
    );

  useEffect(
    () => {
      startSocketManager();

      return () => {
        stopSocketManager();
      };
    },
    [],
  );

  return (
    <>
      <MainLayout
        currentPage={
          page
        }
        onPageChange={
          navigateToPage
        }
      >
        <AppRouter />
      </MainLayout>

      <NotificationEventBridge />

      <NotificationCenter />
    </>
  );
}

export default App;
