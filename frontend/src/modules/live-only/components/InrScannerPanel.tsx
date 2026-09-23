import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  useNotificationPreferences,
} from "@/modules/notifications/store/useNotificationPreferences";

import {
  useNotificationStore,
} from "@/modules/notifications/store/useNotificationStore";

import {
  useInrScanner,
} from "../hooks/useLiveOnlyRuntime";

import type {
  InrCoinPersistence,
  InrEvidenceTier,
  InrOpportunityWindow,
  InrScannedRoute,
  InrScannerResponse,
} from "../types/LiveOnlyRuntime";

type Report = InrScannerResponse["data"];

/*
 * INR arbitrage scanner: live opportunities that clear the net threshold
 * with real book depth covering the venues' minimum order, how long each
 * lasts, per-coin persistence, near misses and the scanner's parameters.
 * Scan-only - nothing on this panel can place an order.
 */

const VENUE_SHORT: Record<string, string> = {
  coindcx: "CoinDCX",
  unocoin: "UnoCoin",
  coinswitch: "CoinSwitch",
  binance: "Binance",
  bybit: "Bybit",
};

const VENUE_ORDER = ["coindcx", "unocoin", "coinswitch", "binance", "bybit"];

export function InrScannerPanel() {
  const query = useInrScanner();
  const report = query.data?.data;
  const now = useNow(1_000);
  useScannerAlerts(report);

  return (
    <section className="panel min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-default px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-mono text-sm font-medium text-text-primary">INR arbitrage scanner</h2>
          <span className="border border-cyan-300/40 px-1.5 py-0.5 font-mono text-[10px] text-cyan-300">SCAN-ONLY · no orders</span>
          {report ? (
            <span className="flex items-center gap-1.5 font-mono text-[11px] text-text-muted">
              <span className={`inline-block size-1.5 ${report.running ? "bg-emerald-400 shadow-[0_0_8px_var(--neon-green)]" : "bg-red-400"}`} />
              {report.running ? "scanning" : "stopped"} · {report.routesEvaluated.toLocaleString("en-IN")} routes/scan · {report.lastScanDurationMs ?? "—"} ms
            </span>
          ) : null}
        </div>
        {report ? <ParameterChips report={report} /> : null}
      </div>

      {query.isPending ? (
        <p className="p-5 text-xs text-text-muted">Loading scanner…</p>
      ) : !report ? (
        <p className="p-5 text-xs text-amber-300">Scanner not running yet (waits for exchange market data).</p>
      ) : (
        <>
          <VenueStrip report={report} />
          <OpportunitiesTable report={report} now={now} />
          <div className="grid border-t border-border-default xl:grid-cols-2">
            <CoinPersistenceTable coins={report.coinPersistence} now={now} />
            <WindowsLog windows={report.recentWindows} />
          </div>
          <NearMissTable routes={report.nearMisses} report={report} />
          <p className="border-t border-border-default px-5 py-3 text-[11px] leading-5 text-text-muted">
            Net = gross − every taker fee on the route (INR↔USDT also pays one USDT/INR conversion fee). TDS is a recoverable cash lock shown separately; ? = venue TDS unverified.
            Evidence: BOOK = executable bid/ask with quantities; QUOTE = prices without quantities; TICKER = last trade only — only BOOK routes count as real.
            Depth @ {report.config.minimumNetPercent}% walks every published level while each extra unit still clears {report.config.minimumNetPercent}% net; Min order is the larger of both venues&apos; minimum order (INR).
            Gross above {report.config.suspectGrossPercent}% is marked SUSPECT (usually a stale order or a coin with closed deposits/withdrawals) and never alerted.
          </p>
        </>
      )}
    </section>
  );
}

function ParameterChips({report}: {report: Report}) {
  const config = report.config;
  const chips = [
    `min net ${config.minimumNetPercent}%`,
    `alert after ${config.alertAfterMs / 1_000}s`,
    `grace ${config.windowGraceMs / 1_000}s`,
    `suspect > ${config.suspectGrossPercent}% gross`,
    `book age ≤ ${(config.maximumBookAgeMs.coindcx ?? 5_000) / 1_000}s (UnoCoin ${(config.maximumBookAgeMs.unocoin ?? 20_000) / 1_000}s)`,
    "size: no cap",
  ];
  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <span key={chip} className="border border-border-default px-1.5 py-0.5 font-mono text-[10px] text-text-muted">{chip}</span>
      ))}
    </div>
  );
}

function VenueStrip({report}: {report: Report}) {
  return (
    <div className="grid grid-cols-2 border-b border-border-default sm:grid-cols-3 lg:grid-cols-6">
      {VENUE_ORDER.map((venue) => {
        const stats = report.venues[venue];
        return (
          <div key={venue} className="border-border-default px-4 py-3 not-last:border-r">
            <p className="text-label">{VENUE_SHORT[venue]}</p>
            <p className="mt-1 font-mono text-[11px] text-text-primary">
              {stats ? (
                <>
                  {stats.inrMarkets > 0 ? <>INR {stats.inrBooks}<span className="text-text-muted">/{stats.inrMarkets} books</span> · </> : null}
                  USDT {stats.usdtBooks}<span className="text-text-muted"> books</span>
                </>
              ) : "—"}
            </p>
          </div>
        );
      })}
      <div className="px-4 py-3">
        <p className="text-label">USDT/INR</p>
        <div className="mt-1 space-y-0.5 font-mono text-[11px]">
          {report.conversion.length === 0 ? (
            <p className="text-amber-300">no two-sided quote</p>
          ) : (
            report.conversion.map((rate) => (
              <p key={rate.venue} className="text-text-primary">
                {VENUE_SHORT[rate.venue] ?? rate.venue} {rate.bid}/{rate.ask}
                <span className={`ml-1 text-[9px] ${rate.evidence === "BOOK" ? "text-emerald-300" : "text-amber-300"}`}>{rate.evidence}</span>
              </p>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function OpportunitiesTable({report, now}: {report: Report; now: number}) {
  const windowsByRoute = new Map(report.activeWindows.map((window) => [window.routeKey, window]));
  const rows = report.opportunities;

  return (
    <div>
      <div className="flex items-center justify-between gap-3 px-5 py-3">
        <p className="font-mono text-xs text-text-primary">
          Live opportunities ≥ {report.config.minimumNetPercent}% net
          <span className="ml-2 text-emerald-300">{rows.length}</span>
        </p>
        <p className="font-mono text-[11px] text-text-muted">alerts today {report.alerts.filter((alert) => (alert.alertedAt ?? 0) > now - 86_400_000).length}</p>
      </div>
      {rows.length === 0 ? (
        <p className="border-t border-border-default px-5 py-4 text-xs text-text-muted">
          No route clears {report.config.minimumNetPercent}% net with real depth right now. The scanner keeps watching every second; near misses are listed below.
        </p>
      ) : (
        <div className="overflow-x-auto border-t border-border-default">
          <table className="w-full min-w-[64rem] text-left text-xs">
            <thead>
              <tr className="border-b border-border-default">
                <th className="px-5 py-3 font-normal">Coin</th>
                <th className="px-3 py-3 font-normal">Route</th>
                <th className="px-3 py-3 text-right font-normal">Net</th>
                <th className="px-3 py-3 text-right font-normal">Gross / fees</th>
                <th className="px-3 py-3 text-right font-normal">Depth @ {report.config.minimumNetPercent}%</th>
                <th className="px-3 py-3 text-right font-normal">Min order</th>
                <th className="px-3 py-3 text-right font-normal">Buy / sell ₹</th>
                <th className="px-3 py-3 text-right font-normal">TDS lock</th>
                <th className="px-5 py-3 text-right font-normal">Live for</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((route) => {
                const window = windowsByRoute.get(route.routeKey);
                return (
                  <tr key={route.routeKey} className="border-b border-border-default/60">
                    <td className="px-5 py-2.5 font-mono text-sm text-text-primary">{route.coin}</td>
                    <td className="px-3 py-2.5"><RouteLabel route={route} /></td>
                    <td className="px-3 py-2.5 text-right font-mono text-sm tabular-nums text-emerald-300 glow-green">+{route.netEdgePercent.toFixed(2)}%</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-text-muted">{route.grossEdgePercent.toFixed(2)}% / −{route.feesPercent.toFixed(2)}%</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-text-primary">
                      {formatInr(route.depthAtThresholdInr)}
                      {route.averageNetAtDepthPercent !== null ? <span className="block text-[10px] text-text-muted">avg {route.averageNetAtDepthPercent.toFixed(2)}%</span> : null}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-text-primary">{route.minimumOrderInr === null ? <span className="text-text-muted">—</span> : formatInr(route.minimumOrderInr)}</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-text-muted">{formatPrice(route.buyPriceInr)} / {formatPrice(route.sellPriceInr)}</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-text-muted">{route.cashLockedPercent.toFixed(1)}%{route.tdsVerified ? null : <span className="ml-0.5 text-amber-300" title="Venue TDS unverified">?</span>}</td>
                    <td className="px-5 py-2.5 text-right font-mono tabular-nums text-amber-300">
                      {window ? formatDuration(now - window.startedAt) : "0s"}
                      {window ? <span className="block text-[10px] text-text-muted">peak {window.peakNetPercent.toFixed(2)}%</span> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CoinPersistenceTable({coins, now}: {coins: InrCoinPersistence[]; now: number}) {
  return (
    <div className="min-w-0 border-border-default xl:border-r">
      <p className="border-b border-border-default px-5 py-3 font-mono text-xs text-text-primary">Coin persistence <span className="text-text-muted">· how long each coin&apos;s edge lasts</span></p>
      {coins.length === 0 ? (
        <p className="px-5 py-4 text-xs text-text-muted">No qualifying window recorded yet.</p>
      ) : (
        <div className="max-h-80 overflow-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border-default">
                <th className="px-5 py-2.5 font-normal">Coin</th>
                <th className="px-3 py-2.5 text-right font-normal">Windows</th>
                <th className="px-3 py-2.5 text-right font-normal">Longest</th>
                <th className="px-3 py-2.5 text-right font-normal">Average</th>
                <th className="px-3 py-2.5 text-right font-normal">Total</th>
                <th className="px-3 py-2.5 text-right font-normal">Best net</th>
                <th className="px-5 py-2.5 text-right font-normal">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {coins.map((coin) => (
                <tr key={coin.coin} className="border-b border-border-default/60" title={coin.routes.join(", ")}>
                  <td className="px-5 py-2 font-mono text-text-primary">
                    {coin.coin}
                    {coin.activeWindows > 0 ? <span className="ml-2 bg-emerald-400/15 px-1 text-[9px] text-emerald-300">LIVE</span> : null}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-text-primary">{coin.windows}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-amber-300">{formatDuration(coin.longestMs)}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-text-muted">{formatDuration(coin.averageMs)}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-text-muted">{formatDuration(coin.totalMs)}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-emerald-300">{coin.bestNetPercent.toFixed(2)}%</td>
                  <td className="px-5 py-2 text-right font-mono text-text-muted">{formatAgo(now, coin.lastSeenAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function WindowsLog({windows}: {windows: InrOpportunityWindow[]}) {
  return (
    <div className="min-w-0">
      <p className="border-b border-border-default px-5 py-3 font-mono text-xs text-text-primary">Opportunity windows <span className="text-text-muted">· closed, newest first</span></p>
      {windows.length === 0 ? (
        <p className="px-5 py-4 text-xs text-text-muted">No window has closed yet.</p>
      ) : (
        <div className="max-h-80 overflow-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border-default">
                <th className="px-5 py-2.5 font-normal">Started</th>
                <th className="px-3 py-2.5 font-normal">Coin · route</th>
                <th className="px-3 py-2.5 text-right font-normal">Lasted</th>
                <th className="px-3 py-2.5 text-right font-normal">Peak net</th>
                <th className="px-3 py-2.5 text-right font-normal">Depth</th>
                <th className="px-5 py-2.5 text-right font-normal">Min order</th>
              </tr>
            </thead>
            <tbody>
              {windows.map((window) => (
                <tr key={window.id} className="border-b border-border-default/60">
                  <td className="px-5 py-2 font-mono text-text-muted">
                    <span className="block">{formatDay(window.startedAt)}</span>
                    <span className="text-text-primary">{formatClock(window.startedAt)}</span>
                  </td>
                  <td className="px-3 py-2 font-mono">
                    <span className="text-text-primary">{window.coin}</span>
                    {window.alertedAt ? <span className="ml-1.5 bg-amber-400/15 px-1 text-[9px] text-amber-300">ALERT</span> : null}
                    <span className="block text-[10px] text-text-muted">{shortVenue(window.buyVenue, window.buyMarket)} → {shortVenue(window.sellVenue, window.sellMarket)}</span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-amber-300">{formatDuration(window.durationMs)}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-emerald-300">{window.peakNetPercent.toFixed(2)}%</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-text-primary">{formatInr(window.peakDepthInr)}</td>
                  <td className="px-5 py-2 text-right font-mono tabular-nums text-text-muted">{window.minimumOrderInr === null ? "—" : formatInr(window.minimumOrderInr)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function NearMissTable({routes, report}: {routes: InrScannedRoute[]; report: Report}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-border-default">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between px-5 py-3 text-left font-mono text-xs text-text-primary"
      >
        <span>
          Near misses ≥ {report.config.nearMissNetPercent}% net <span className="text-text-muted">· hints, thin depth, suspect</span>
          <span className="ml-2 text-amber-300">{routes.length}</span>
        </span>
        <span className="text-text-muted">{open ? "hide" : "show"}</span>
      </button>
      {open ? (
        routes.length === 0 ? (
          <p className="px-5 pb-4 text-xs text-text-muted">Nothing above {report.config.nearMissNetPercent}% net.</p>
        ) : (
          <div className="max-h-96 overflow-auto border-t border-border-default">
            <table className="w-full min-w-[56rem] text-left text-xs">
              <thead>
                <tr className="border-b border-border-default">
                  <th className="px-5 py-2.5 font-normal">Coin</th>
                  <th className="px-3 py-2.5 font-normal">Route</th>
                  <th className="px-3 py-2.5 font-normal">Why not real</th>
                  <th className="px-3 py-2.5 text-right font-normal">Net</th>
                  <th className="px-3 py-2.5 text-right font-normal">Gross</th>
                  <th className="px-3 py-2.5 text-right font-normal">Depth @ {report.config.minimumNetPercent}%</th>
                  <th className="px-5 py-2.5 text-right font-normal">Min order</th>
                </tr>
              </thead>
              <tbody>
                {routes.map((route) => (
                  <tr key={route.routeKey} className="border-b border-border-default/60">
                    <td className="px-5 py-2 font-mono text-text-primary">{route.coin}</td>
                    <td className="px-3 py-2"><RouteLabel route={route} /></td>
                    <td className="px-3 py-2 font-mono text-[10px] text-amber-300">{whyNotReal(route, report)}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-text-primary">{route.netEdgePercent.toFixed(2)}%</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-text-muted">{route.grossEdgePercent.toFixed(2)}%</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-text-muted">{route.depthAtThresholdInr === null ? "—" : formatInr(route.depthAtThresholdInr)}</td>
                    <td className="px-5 py-2 text-right font-mono tabular-nums text-text-muted">{route.minimumOrderInr === null ? "—" : formatInr(route.minimumOrderInr)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}
    </div>
  );
}

function RouteLabel({route}: {route: InrScannedRoute}) {
  return (
    <span className="font-mono text-[11px] text-text-muted">
      <span className={`mr-1.5 px-1 text-[9px] ${route.kind === "INR_INR" ? "bg-violet-400/15 text-violet-300" : "bg-cyan-300/15 text-cyan-300"}`}>
        {route.kind === "INR_INR" ? "INR↔INR" : "INR↔USDT"}
      </span>
      buy <span className="text-text-primary">{shortVenue(route.buyVenue, route.buyMarket)}</span> <EvidenceDot tier={route.buyEvidence} />
      {" → "}sell <span className="text-text-primary">{shortVenue(route.sellVenue, route.sellMarket)}</span> <EvidenceDot tier={route.sellEvidence} />
      {route.conversionVenue ? <span className="block text-[10px]">USDT/INR via {VENUE_SHORT[route.conversionVenue] ?? route.conversionVenue} @ {route.usdtInrRate}</span> : null}
    </span>
  );
}

function EvidenceDot({tier}: {tier: InrEvidenceTier}) {
  const tone = tier === "BOOK" ? "text-emerald-300" : tier === "QUOTE" ? "text-amber-300" : "text-red-300";
  return <span className={`text-[9px] ${tone}`} title={`${tier} evidence`}>{tier}</span>;
}

function whyNotReal(route: InrScannedRoute, report: Report): string {
  if (route.suspect) return `SUSPECT gross > ${report.config.suspectGrossPercent}%`;
  if (route.evidence !== "BOOK") return `${route.evidence} only — awaiting depth`;
  if (route.netEdgePercent < report.config.minimumNetPercent) return `below ${report.config.minimumNetPercent}% net`;
  if (route.depthAtThresholdInr !== null && route.minimumOrderInr !== null && route.depthAtThresholdInr < route.minimumOrderInr) return "depth < min order";
  return "no depth at threshold";
}

/* ---------------------------------------------------------------- alerts */

function useScannerAlerts(report: Report | undefined) {
  const pushNotification = useNotificationStore((state) => state.pushNotification);
  const opportunityAlerts = useNotificationPreferences((state) => state.opportunityAlerts);
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!report) return;
    const alerts = [...report.alerts, ...report.activeWindows.filter((window) => window.alertedAt !== null)];
    // First load only primes the set, so opening the page does not replay history.
    if (seen.current === null) {
      seen.current = new Set(alerts.map((window) => window.id));
      return;
    }
    for (const window of alerts) {
      if (seen.current.has(window.id)) continue;
      seen.current.add(window.id);
      if (!opportunityAlerts) continue;
      pushNotification({
        title: `${window.coin} INR arbitrage +${window.peakNetPercent.toFixed(2)}%`,
        message: `Buy ${shortVenue(window.buyVenue, window.buyMarket)} → sell ${shortVenue(window.sellVenue, window.sellMarket)}. Depth ${formatInr(window.peakDepthInr)} at ≥${report.config.minimumNetPercent}% net${window.minimumOrderInr !== null ? `, min order ${formatInr(window.minimumOrderInr)}` : ""}. Live ${formatDuration(window.lastSeenAt - window.startedAt)}. Scan-only — no order placed.`,
        severity: "success",
        durationMs: 12_000,
      });
    }
  }, [report, opportunityAlerts, pushNotification]);
}

/* ------------------------------------------------------------ formatting */

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

function shortVenue(venue: string, market: string): string {
  return `${VENUE_SHORT[venue] ?? venue} ${market.endsWith("INR") ? "INR" : "USDT"}`;
}

function formatInr(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  if (value >= 1e7) return `₹${(value / 1e7).toFixed(2)} Cr`;
  if (value >= 1e5) return `₹${(value / 1e5).toFixed(2)} L`;
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

function formatPrice(value: number): string {
  return value >= 100 ? value.toLocaleString("en-IN", {maximumFractionDigits: 2}) : value.toPrecision(4);
}

function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1_000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

function formatAgo(now: number, timestamp: number): string {
  return `${formatDuration(now - timestamp)} ago`;
}

function formatClock(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("en-GB", {hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false});
}

function formatDay(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-GB", {day: "2-digit", month: "2-digit"});
}
