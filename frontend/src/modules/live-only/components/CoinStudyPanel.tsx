import {
  useCoinStudy,
} from "../hooks/useLiveOnlyRuntime";

import type {
  CoinStudyEntry,
} from "../types/LiveOnlyRuntime";

/*
 * Coin study: which coins keep producing valid, executable edges over the
 * last 7 days, in which direction and at which hours - and so which small
 * basket to hold, where (coin on the exchange it is SOLD on, cash on the
 * exchange it is BOUGHT on) and how much, next to what is held now.
 */

const VENUE: Record<string, string> = {
  coindcx: "CoinDCX",
  unocoin: "UnoCoin",
  coinswitch: "CoinSwitch",
  binance: "Binance",
  bybit: "Bybit",
};

export function CoinStudyPanel() {
  const query = useCoinStudy();
  const report = query.data?.data;
  const coins = report?.coins ?? [];

  return (
    <section className="panel min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-default px-5 py-4">
        <h2 className="font-mono text-sm tracking-[0.14em] text-text-primary">
          COIN STUDY
          <span className="ml-3 text-[11px] tracking-normal text-text-muted">last {report?.studyDays ?? 7} days · which coins to hold, where, how much</span>
        </h2>
        {report ? (
          <p className="font-mono text-[11px] text-text-muted">
            {report.totals.coins} coins · {Math.round(report.totals.edgeMinutes)} edge-min · {report.totals.windows} windows ·{" "}
            <span className={report.dataSufficient ? "text-emerald-300" : "text-amber-300"}>
              {formatSpan(report.dataSpanHours)} of data{report.dataSufficient ? "" : " — collect 24h+ before trusting"}
            </span>
          </p>
        ) : null}
      </div>

      {report && report.coreBasket.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-border-default px-5 py-3 font-mono text-[11px]">
          <span className="text-text-muted">CORE BASKET</span>
          {report.coreBasket.map((coin) => (
            <span key={coin} className="border border-emerald-400/40 bg-emerald-400/10 px-2 py-0.5 text-emerald-300">{coin}</span>
          ))}
          <span className="ml-auto text-text-muted">stock sized in ₹{report.tradeSizeInr.toLocaleString("en-IN")} trades</span>
        </div>
      ) : null}

      {query.isPending ? (
        <p className="p-5 text-xs text-text-muted">Loading coin study…</p>
      ) : query.isError ? (
        <p className="p-5 text-xs text-red-300">Coin study is unavailable.</p>
      ) : coins.length === 0 ? (
        <p className="p-5 text-xs text-text-muted">No valid edge recorded yet. The study fills in as the scanner closes opportunity windows.</p>
      ) : (
        <div className="max-h-[34rem] overflow-auto">
          <table className="w-full min-w-[72rem] text-left text-xs">
            <thead>
              <tr className="border-b border-border-default text-text-muted">
                <th className="px-5 py-3 font-normal">#</th>
                <th className="px-3 py-3 font-normal">Coin</th>
                <th className="px-3 py-3 font-normal">Share of edge time</th>
                <th className="px-3 py-3 text-right font-normal">Avg / best net</th>
                <th className="px-3 py-3 text-right font-normal">Avg depth</th>
                <th className="px-3 py-3 font-normal">Direction (buy → sell)</th>
                <th className="px-3 py-3 font-normal">Hours (IST)</th>
                <th className="px-3 py-3 font-normal">Hold coin on</th>
                <th className="px-5 py-3 font-normal">Hold cash on</th>
              </tr>
            </thead>
            <tbody>
              {coins.map((coin) => (
                <CoinRow key={coin.coin} coin={coin} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function CoinRow({coin}: {coin: CoinStudyEntry}) {
  const main = coin.directions[0];
  return (
    <tr className={`border-b border-border-default/60 align-top ${coin.core ? "" : "opacity-70"}`}>
      <td className="px-5 py-2.5 font-mono text-text-muted">{coin.rank}</td>
      <td className="px-3 py-2.5 font-mono">
        <span className="text-sm text-text-primary">{coin.coin}</span>
        {coin.core ? <span className="ml-2 bg-emerald-400/15 px-1 text-[9px] text-emerald-300">CORE</span> : null}
        {coin.twoWay ? <span className="ml-1 bg-cyan-300/15 px-1 text-[9px] text-cyan-300">2-WAY</span> : null}
        <span className="block text-[10px] text-text-muted">{coin.windows} windows · {coin.activeDays}d</span>
      </td>
      <td className="px-3 py-2.5 font-mono">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-24 bg-border-default">
            <span className="block h-full bg-emerald-400" style={{width: `${Math.min(100, coin.sharePercent)}%`}} />
          </span>
          <span className="tabular-nums text-text-primary">{coin.sharePercent.toFixed(1)}%</span>
        </div>
        <span className="text-[10px] text-text-muted">{formatMinutes(coin.edgeMinutes)} at edge</span>
      </td>
      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
        <span className="text-emerald-300">+{coin.averageNetPercent.toFixed(2)}%</span>
        <span className="block text-[10px] text-text-muted">best {coin.bestNetPercent.toFixed(2)}%</span>
      </td>
      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-text-primary">
        {coin.averageDepthInr === null ? "—" : inr(coin.averageDepthInr)}
      </td>
      <td className="px-3 py-2.5 font-mono text-[11px]">
        {coin.directions.slice(0, 2).map((direction, index) => (
          <span key={index} className={`block ${index === 0 ? "text-text-primary" : "text-text-muted"}`}>
            {VENUE[direction.buyVenue] ?? direction.buyVenue} {direction.buyQuote} → {VENUE[direction.sellVenue] ?? direction.sellVenue} {direction.sellQuote}
            <span className="ml-1 text-text-muted">{Math.round(direction.sharePercent)}%</span>
          </span>
        ))}
      </td>
      <td className="px-3 py-2.5 font-mono">
        <HourStrip minutes={coin.hourlyEdgeMinutes} />
        <span className="text-[10px] text-text-muted">
          peak {coin.peakHoursIst.map((hour) => `${String(hour).padStart(2, "0")}:00`).join(", ") || "—"}
        </span>
      </td>
      <td className="px-3 py-2.5 font-mono">
        {coin.placement.trades > 0 && main ? (
          <Holding venue={coin.placement.coin.venue} asset={coin.coin} have={coin.placement.coin.haveInr} need={coin.placement.coin.needInr} />
        ) : (
          <span className="text-text-muted">not core</span>
        )}
      </td>
      <td className="px-5 py-2.5 font-mono">
        {coin.placement.trades > 0 && main ? (
          <Holding venue={coin.placement.cash.venue} asset={coin.placement.cash.asset} have={coin.placement.cash.haveInr} need={coin.placement.cash.needInr} />
        ) : (
          <span className="text-text-muted">—</span>
        )}
      </td>
    </tr>
  );
}

function Holding({venue, asset, have, need}: {venue: string; asset: string; have: number | null; need: number}) {
  const ok = have !== null && have >= need * 0.8;
  return (
    <div>
      <span className="text-text-primary">{VENUE[venue] ?? venue}</span>
      <span className="ml-1 text-[10px] text-text-muted">{asset}</span>
      <span className={`block text-[11px] tabular-nums ${have === null ? "text-text-muted" : ok ? "text-emerald-300" : "text-amber-300"}`}>
        {have === null ? "?" : inr(have)} / {inr(need)}
      </span>
    </div>
  );
}

function HourStrip({minutes}: {minutes: readonly number[]}) {
  const peak = Math.max(0, ...minutes);
  return (
    <div className="mb-1 flex h-3 gap-px" aria-label="edge minutes by IST hour">
      {minutes.map((value, hour) => (
        <span
          key={hour}
          title={`${String(hour).padStart(2, "0")}:00 IST · ${value.toFixed(1)} min`}
          className="w-1.5 bg-emerald-400"
          style={{opacity: peak > 0 && value > 0 ? 0.2 + 0.8 * (value / peak) : 0.06}}
        />
      ))}
    </div>
  );
}

function inr(value: number): string {
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

function formatMinutes(minutes: number): string {
  if (minutes < 1) return `${Math.round(minutes * 60)}s`;
  if (minutes < 60) return `${minutes.toFixed(1)}m`;
  return `${Math.floor(minutes / 60)}h ${String(Math.round(minutes % 60)).padStart(2, "0")}m`;
}

function formatSpan(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 48) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}
