import {
  useLiveTrades,
} from "../hooks/useLiveOnlyRuntime";

import type {
  LiveTrade,
  LiveTradeLeg,
  LiveTradeRoute,
  LiveTradeStatus,
} from "../types/LiveOnlyRuntime";

/*
 * Real live arbitrage trades, one row per trade with BOTH legs: where the
 * coin was bought and where it was sold, at what average prices and size,
 * and the net result. USDT<->USDT (Strategy #1) and the INR executor
 * (USDT<->INR, INR<->INR) share this feed. Attempts that filled nothing are
 * not trades and are not shown.
 */

const ROUTE_LABEL: Record<LiveTradeRoute, string> = {
  USDT_USDT: "USDT↔USDT",
  INR_USDT: "USDT↔INR",
  INR_INR: "INR↔INR",
};

const STATUS: Record<LiveTradeStatus, {label: string; className: string}> = {
  COMPLETED: {label: "DONE", className: "bg-emerald-400/15 text-emerald-300"},
  DUST_RESIDUAL: {label: "DONE · DUST", className: "bg-emerald-400/10 text-emerald-200"},
  ONE_LEG_FILLED: {label: "ONE LEG", className: "bg-red-400/15 text-red-300"},
  RECOVERY_REQUIRED: {label: "UNHEDGED", className: "bg-red-400/15 text-red-300"},
  POSSIBLE_EXPOSURE: {label: "UNKNOWN", className: "bg-red-400/15 text-red-300"},
};

const VENUE: Record<string, string> = {
  coindcx: "CoinDCX",
  unocoin: "UnoCoin",
  coinswitch: "CoinSwitch",
  binance: "Binance",
  bybit: "Bybit",
};

export function LiveTradesPanel() {
  const query = useLiveTrades();
  const report = query.data?.data;
  const trades = report?.trades ?? [];

  return (
    <section className="panel min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-default px-5 py-4">
        <h2 className="font-mono text-sm tracking-[0.14em] text-text-primary">
          LIVE TRADES
          <span className="ml-3 inline-flex items-center gap-1.5 text-[11px] tracking-normal text-text-muted">
            <span aria-hidden="true" className="size-2 bg-emerald-400" />
            {trades.length} recent
          </span>
        </h2>
        {report ? (
          <p className="font-mono text-[11px] text-text-muted">
            {report.totals.completed} done
            {report.totals.needingAttention > 0 ? (
              <span className="ml-2 text-red-300">{report.totals.needingAttention} need attention</span>
            ) : null}
            <span className={`ml-3 ${report.totals.netInr >= 0 ? "text-emerald-300" : "text-red-300"}`}>
              net {signedInr(report.totals.netInr)}
            </span>
          </p>
        ) : null}
      </div>

      {query.isPending ? (
        <p className="p-5 text-xs text-text-muted">Loading live trades…</p>
      ) : query.isError ? (
        <p className="p-5 text-xs text-red-300">Live trades are unavailable.</p>
      ) : trades.length === 0 ? (
        <p className="p-5 text-xs text-text-muted">
          No live trade yet. Every arbitrage appears here as one row with both halves: the BUY on the cheaper exchange and the SELL on the dearer one.
        </p>
      ) : (
        <div className="max-h-[30rem] overflow-auto">
          <table className="w-full min-w-[60rem] text-left text-xs">
            <thead>
              <tr className="border-b border-border-default text-text-muted">
                <th className="px-5 py-3 font-normal">Time</th>
                <th className="px-3 py-3 font-normal">Route</th>
                <th className="px-3 py-3 font-normal">Coin</th>
                <th className="px-3 py-3 font-normal">Buy</th>
                <th className="px-3 py-3 font-normal">Sell</th>
                <th className="px-3 py-3 text-right font-normal">Size</th>
                <th className="px-3 py-3 text-right font-normal">Net</th>
                <th className="px-5 py-3 text-right font-normal">Status</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((trade) => (
                <TradeRow key={trade.id} trade={trade} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function TradeRow({trade}: {trade: LiveTrade}) {
  const status = STATUS[trade.status];
  return (
    <tr className="border-b border-border-default/60 align-top">
      <td className="px-5 py-2.5 font-mono text-text-muted">
        <span className="block">{formatDay(trade.at)}</span>
        <span className="text-text-primary">{formatClock(trade.at)}</span>
      </td>
      <td className="px-3 py-2.5">
        <span className="bg-cyan-300/15 px-1.5 py-0.5 font-mono text-[10px] text-cyan-300">{ROUTE_LABEL[trade.route]}</span>
      </td>
      <td className="px-3 py-2.5 font-mono text-sm text-text-primary">{trade.coin}</td>
      <td className="px-3 py-2.5">
        <Leg side="BUY" leg={trade.buy} />
      </td>
      <td className="px-3 py-2.5">
        <Leg side="SELL" leg={trade.sell} />
      </td>
      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-text-primary">
        {trade.notionalInr === null ? "—" : inr(trade.notionalInr)}
        {trade.residualQuantity > 0 ? (
          <span className="block text-[10px] text-red-300">{formatQuantity(trade.residualQuantity)} unhedged</span>
        ) : null}
      </td>
      <td className={`px-3 py-2.5 text-right font-mono tabular-nums ${trade.netInr === null ? "text-text-muted" : trade.netInr >= 0 ? "text-emerald-300" : "text-red-300"}`}>
        {trade.netInr === null ? "—" : signedInr(trade.netInr)}
        {trade.netPercent !== null ? <span className="block text-[10px]">{trade.netPercent >= 0 ? "+" : ""}{trade.netPercent.toFixed(2)}%</span> : null}
      </td>
      <td className="px-5 py-2.5 text-right">
        <span className={`px-1.5 py-0.5 font-mono text-[10px] ${status.className}`}>{status.label}</span>
      </td>
    </tr>
  );
}

function Leg({side, leg}: {side: "BUY" | "SELL"; leg: LiveTradeLeg}) {
  const isInr = leg.market.toUpperCase().replace(/[^A-Z]/gu, "").endsWith("INR");
  return (
    <div className="font-mono">
      <span className={`mr-1.5 px-1 text-[9px] ${side === "BUY" ? "bg-emerald-400/15 text-emerald-300" : "bg-red-400/15 text-red-300"}`}>{side}</span>
      <span className="text-text-primary">{VENUE[leg.venue] ?? leg.venue}</span>
      <span className="ml-1 text-[10px] text-text-muted">{isInr ? "INR" : "USDT"}</span>
      <span className="block text-[11px] tabular-nums text-text-muted">
        {leg.averagePrice === null ? "not filled" : `${formatQuantity(leg.quantity ?? 0)} @ ${isInr ? "₹" : "$"}${formatPrice(leg.averagePrice)}`}
      </span>
    </div>
  );
}

function formatPrice(value: number): string {
  if (value >= 1_000) return value.toLocaleString("en-IN", {maximumFractionDigits: 2});
  if (value >= 1) return value.toFixed(4);
  return value.toPrecision(4);
}

function formatQuantity(value: number): string {
  return value >= 1_000
    ? value.toLocaleString("en-IN", {maximumFractionDigits: 2})
    : Number(value.toPrecision(6)).toString();
}

function inr(value: number): string {
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

function signedInr(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}₹${Math.abs(value).toLocaleString("en-IN", {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
}

function formatClock(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("en-GB", {hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false});
}

function formatDay(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-GB", {day: "2-digit", month: "2-digit"});
}
