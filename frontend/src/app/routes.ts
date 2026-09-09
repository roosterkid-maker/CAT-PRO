export type AppPage =
  | "dashboard"
  | "bot"
  | "agent-sakhondra"
  | "trade-intelligence"
  | "execution-monitoring"
  | "markets"
  | "exchange-health"
  | "arbitrage"
  | "strategies"
  | "paper-trading"
  | "automation-center"
  | "performance"
  | "system-health"
  | "production-safety"
  | "recovery"
  | "tiny-live"
  | "alerts"
  | "settings";

export const APP_PAGE_PATHS:
  Readonly<
    Record<
      AppPage,
      string
    >
  > = {
  dashboard:
    "/",

  bot:
    "/bot",

  "agent-sakhondra":
    "/agent-sakhondra",

  "trade-intelligence":
    "/trade-intelligence",

  "execution-monitoring":
    "/execution",

  markets:
    "/markets",

  "exchange-health":
    "/exchange-health",

  arbitrage:
    "/arbitrage",

  strategies:
    "/strategies",

  "paper-trading":
    "/paper-trading",

  "automation-center":
    "/automation",

  performance:
    "/performance",

  "system-health":
    "/system-health",

  "production-safety":
    "/production-safety",

  recovery:
    "/recovery",

  "tiny-live":
    "/tiny-live",

  alerts:
    "/alerts",

  settings:
    "/settings",
};

const PAGE_PRELOADERS:
  Partial<
    Record<
      AppPage,
      () => Promise<unknown>
    >
  > = {
  bot: () => import("@/modules/live-only/pages/LiveOnlyDashboard"),
  "trade-intelligence": () => import("@/modules/trade-flow/pages/TradeFlowDashboard"),
  "execution-monitoring": () => import("@/modules/execution-monitoring/pages/ExecutionMonitoringDashboard"),
  markets: () => import("@/modules/market/pages/MarketsDashboard"),
  "exchange-health": () => import("@/modules/exchange-health/pages/ExchangeHealthDashboard"),
  arbitrage: () => import("@/pages/Arbitrage"),
  "system-health": () => import("@/pages/SystemHealth"),
  recovery: () => import("@/modules/recovery/pages/RecoveryDiagnosticsDashboard"),
  alerts: () => import("@/pages/Alerts"),
};

export function preloadAppPage(
  page:
    AppPage,
): void {
  const preload =
    PAGE_PRELOADERS[
      page
    ];

  if (preload) {
    void preload().catch(
      () => undefined,
    );
  }
}

export function getAppPageFromPath(
  pathname: string,
): AppPage {
  const normalizedPath =
    normalizePath(
      pathname,
    );

  for (
    const [
      page,
      path,
    ] of Object.entries(
      APP_PAGE_PATHS,
    ) as Array<
      [
        AppPage,
        string,
      ]
    >
  ) {
    if (
      path ===
      normalizedPath
    ) {
      return page;
    }
  }

  return "dashboard";
}

function normalizePath(
  pathname: string,
): string {
  const normalized =
    pathname
      .trim()
      .toLowerCase()
      .replace(
        /\/+$/,
        "",
      );

  return normalized ||
    "/";
}
