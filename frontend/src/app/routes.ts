export type AppPage =
  | "dashboard"
  | "bot"
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
