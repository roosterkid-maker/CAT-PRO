import {
  lazy,
  Suspense,
} from "react";

import {
  Navigate,
  Route,
  Routes,
} from "react-router-dom";

import Dashboard
  from "@/pages/Dashboard";

import {
  APP_PAGE_PATHS,
} from "./routes";

export type {
  AppPage,
} from "./routes";

const BotDashboard = lazy(
  () => import("@/modules/bot/pages/BotDashboard"),
);

const ExecutionMonitoringDashboard =
  lazy(
    () =>
      import(
        "@/modules/execution-monitoring/pages/ExecutionMonitoringDashboard"
      ).then(
        (
          module,
        ) => ({
          default:
            module.ExecutionMonitoringDashboard,
        }),
      ),
  );

const MarketsDashboard = lazy(
  () =>
    import(
      "@/modules/market/pages/MarketsDashboard"
    ),
);

const ExchangeHealthDashboard =
  lazy(
    () =>
      import(
        "@/modules/exchange-health/pages/ExchangeHealthDashboard"
      ),
  );

const Arbitrage = lazy(
  () =>
    import(
      "@/pages/Arbitrage"
    ),
);

const PaperTrading = lazy(
  () =>
    import(
      "@/pages/PaperTrading"
    ),
);

const StrategyDashboard = lazy(
  () =>
    import(
      "@/modules/strategies/pages/StrategyDashboard"
    ),
);

const AutomationCenterDashboard =
  lazy(
    () =>
      import(
        "@/modules/automation/pages/AutomationCenterDashboard"
      ),
  );

const PerformanceAnalyticsDashboard =
  lazy(
    () =>
      import(
        "@/modules/performance/pages/PerformanceAnalyticsDashboard"
      ),
  );

const SystemHealth = lazy(
  () =>
    import(
      "@/pages/SystemHealth"
    ),
);

const ProductionSafetyDashboard =
  lazy(
    () =>
      import(
        "@/modules/production-safety/pages/ProductionSafetyDashboard"
      ),
  );

const RecoveryDiagnosticsDashboard =
  lazy(
    () =>
      import(
        "@/modules/recovery/pages/RecoveryDiagnosticsDashboard"
      ),
  );

const TinyLivePreflightDashboard =
  lazy(
    () =>
      import(
        "@/modules/tiny-live/pages/TinyLivePreflightDashboard"
      ),
  );

const Alerts = lazy(
  () =>
    import(
      "@/pages/Alerts"
    ),
);

const OperatorSettingsDashboard =
  lazy(
    () =>
      import(
        "@/modules/operator-settings/pages/OperatorSettingsDashboard"
      ),
  );

export default function AppRouter() {
  return (
    <Suspense
      fallback={
        <PageLoading />
      }
    >
      <Routes>
        <Route
          path={
            APP_PAGE_PATHS.dashboard
          }
          element={
            <Dashboard />
          }
        />

        <Route
          path={
            APP_PAGE_PATHS.strategies
          }
          element={
            <StrategyDashboard />
          }
        />

        <Route
          path={
            APP_PAGE_PATHS[
              "execution-monitoring"
            ]
          }
          element={
            <ExecutionMonitoringDashboard />
          }
        />

        <Route
          path={
            APP_PAGE_PATHS.bot
          }
          element={
            <BotDashboard />
          }
        />

        <Route
          path={
            APP_PAGE_PATHS.markets
          }
          element={
            <MarketsDashboard />
          }
        />

        <Route
          path={
            APP_PAGE_PATHS[
              "exchange-health"
            ]
          }
          element={
            <ExchangeHealthDashboard />
          }
        />

        <Route
          path={
            APP_PAGE_PATHS.arbitrage
          }
          element={
            <Arbitrage />
          }
        />

        <Route
          path={
            APP_PAGE_PATHS[
              "paper-trading"
            ]
          }
          element={
            <PaperTrading />
          }
        />

        <Route
          path={
            APP_PAGE_PATHS[
              "automation-center"
            ]
          }
          element={
            <AutomationCenterDashboard />
          }
        />

        <Route
          path={
            APP_PAGE_PATHS.performance
          }
          element={
            <PerformanceAnalyticsDashboard />
          }
        />

        <Route
          path={
            APP_PAGE_PATHS[
              "system-health"
            ]
          }
          element={
            <SystemHealth />
          }
        />

        <Route
          path={
            APP_PAGE_PATHS[
              "production-safety"
            ]
          }
          element={
            <ProductionSafetyDashboard />
          }
        />

        <Route
          path={
            APP_PAGE_PATHS.recovery
          }
          element={
            <RecoveryDiagnosticsDashboard />
          }
        />

        <Route
          path={
            APP_PAGE_PATHS[
              "tiny-live"
            ]
          }
          element={
            <TinyLivePreflightDashboard />
          }
        />

        <Route
          path={
            APP_PAGE_PATHS.alerts
          }
          element={
            <Alerts />
          }
        />

        <Route
          path={
            APP_PAGE_PATHS.settings
          }
          element={
            <OperatorSettingsDashboard />
          }
        />

        <Route
          path="*"
          element={
            <Navigate
              to={
                APP_PAGE_PATHS.dashboard
              }
              replace
            />
          }
        />
      </Routes>
    </Suspense>
  );
}

function PageLoading() {
  return (
    <section
      className="rounded-xl border border-border-default bg-panel p-6 text-sm text-text-muted"
      aria-live="polite"
    >
      Loading operator page...
    </section>
  );
}
