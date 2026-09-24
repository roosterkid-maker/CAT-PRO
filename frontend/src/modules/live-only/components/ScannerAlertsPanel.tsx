import {
  useInrScanner,
} from "../hooks/useLiveOnlyRuntime";

import type {
  InrOpportunityWindow,
} from "../types/LiveOnlyRuntime";

/*
 * Arbitrage scanner alerts for the Alerts tab: every opportunity window that
 * stayed valid and executable past the alert delay, newest first. Read-only;
 * the scanner itself places no orders.
 */

const KIND_LABEL: Record<InrOpportunityWindow["kind"], string> = {
  USDT_USDT: "USDT↔USDT",
  INR_INR: "INR↔INR",
  INR_USDT: "USDT↔INR",
};

const VENUE: Record<string, string> = {
  coindcx: "CoinDCX",
  unocoin: "UnoCoin",
  coinswitch: "CoinSwitch",
  binance: "Binance",
  bybit: "Bybit",
};

export function ScannerAlertsPanel() {
  const query = useInrScanner();
  const report = query.data?.data;
  const alerts = report?.alerts ?? [];

  return (
    <section className="panel min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-default px-5 py-4">
        <h2 className="font-mono text-sm text-text-primary">
          Arbitrage scanner alerts
          <span className="ml-2 text-emerald-300">{alerts.length}</span>
        </h2>
        {report ? (
          <p className="font-mono text-[11px] text-text-muted">
            valid + executable only · net ≥ {report.config.minimumNetPercent}% · alert after {report.config.alertAfterMs / 1_000}s · {Math.round(report.config.alertCooldownMs / 60_000)}m cooldown per route
          </p>
        ) : null}
      </div>
      {query.isPending ? (
        <p className="p-5 text-xs text-text-muted">Loading scanner alerts…</p>
      ) : alerts.length === 0 ? (
        <p className="p-5 text-xs text-text-muted">No scanner alert yet.</p>
      ) : (
        <div className="max-h-[28rem] overflow-auto">
          <table className="w-full min-w-[52rem] text-left text-xs">
            <thead>
              <tr className="border-b border-border-default">
                <th className="px-5 py-3 font-normal">Alerted</th>
                <th className="px-3 py-3 font-normal">Coin</th>
                <th className="px-3 py-3 font-normal">Route</th>
                <th className="px-3 py-3 text-right font-normal">Peak net</th>
                <th className="px-3 py-3 text-right font-normal">Depth</th>
                <th className="px-3 py-3 text-right font-normal">Min order</th>
                <th className="px-5 py-3 text-right font-normal">Lasted</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((alert) => (
                <tr key={alert.id} className="border-b border-border-default/60">
                  <td className="px-5 py-2.5 font-mono text-text-muted">
                    <span className="block">{formatDay(alert.alertedAt ?? alert.startedAt)}</span>
                    <span className="text-text-primary">{formatClock(alert.alertedAt ?? alert.startedAt)}</span>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-sm text-text-primary">
                    {alert.coin}
                    {alert.endedAt === null ? <span className="ml-2 bg-emerald-400/15 px-1 text-[9px] text-emerald-300">LIVE</span> : null}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[11px] text-text-muted">
                    <span className="mr-1.5 bg-cyan-300/15 px-1 text-[9px] text-cyan-300">{KIND_LABEL[alert.kind]}</span>
                    buy {side(alert.buyVenue, alert.buyMarket)} → sell {side(alert.sellVenue, alert.sellMarket)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-emerald-300">+{alert.peakNetPercent.toFixed(2)}%</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-text-primary">{inr(alert.peakDepthInr)}</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-text-muted">{alert.minimumOrderInr === null ? "—" : inr(alert.minimumOrderInr)}</td>
                  <td className="px-5 py-2.5 text-right font-mono tabular-nums text-amber-300">{duration((alert.endedAt ?? alert.lastSeenAt) - alert.startedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function side(venue: string, market: string): string {
  return `${VENUE[venue] ?? venue} ${market.endsWith("INR") ? "INR" : "USDT"}`;
}

function inr(value: number): string {
  if (value >= 1e7) return `₹${(value / 1e7).toFixed(2)} Cr`;
  if (value >= 1e5) return `₹${(value / 1e5).toFixed(2)} L`;
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

function duration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1_000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes}m ${String(seconds % 60).padStart(2, "0")}s` : `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

function formatClock(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("en-GB", {hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false});
}

function formatDay(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-GB", {day: "2-digit", month: "2-digit"});
}
