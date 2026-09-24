import { useEffect, useState } from "react";

const CHECK_INTERVAL_MS = 30_000;
const RELOAD_DELAY_MS = 4_000;

/**
 * Reloads the dashboard when a newer build is deployed. Checks
 * /version.json every 30s and whenever the tab becomes visible again (e.g.
 * after the laptop wakes), so a long-open tab never keeps polling endpoints
 * that a deploy has retired. In local dev there is no version.json and the
 * check stays silent.
 */
export default function DeploymentWatcher() {
  const [pendingReload, setPendingReload] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      if (cancelled || pendingReload) return;
      try {
        const response = await fetch(`/version.json?ts=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) return;
        const body = (await response.json()) as { buildId?: unknown };
        if (typeof body.buildId === "string" && body.buildId !== __APP_BUILD_ID__) {
          setPendingReload(true);
        }
      } catch {
        // Offline or mid-deploy: try again on the next tick.
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };

    const id = window.setInterval(() => void check(), CHECK_INTERVAL_MS);
    document.addEventListener("visibilitychange", onVisible);
    void check();

    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pendingReload]);

  useEffect(() => {
    if (!pendingReload) return;
    const id = window.setTimeout(() => window.location.reload(), RELOAD_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [pendingReload]);

  if (!pendingReload) return null;

  return (
    <div className="term-deploy-banner" role="status">
      New version deployed — reloading…
      <button type="button" onClick={() => window.location.reload()}>
        Reload now
      </button>
    </div>
  );
}
