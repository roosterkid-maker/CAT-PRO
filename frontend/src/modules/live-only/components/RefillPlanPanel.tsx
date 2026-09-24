import {
  useRefillPlan,
} from "../hooks/useLiveOnlyRuntime";

import type {
  RefillAction,
  RefillPlanResponse,
} from "../types/LiveOnlyRuntime";

/*
 * Capital manager: how the capital that exists is split across the coins
 * with live opportunity (allocation), and the refill plan that gets each
 * coin's stock and cash in place. AUTO actions are carried out by the
 * capital manager within its caps; MANUAL actions are exact instructions
 * for the operator.
 */

const VENUE: Record<string, string> = {
  coindcx: "CoinDCX",
  unocoin: "UnoCoin",
  coinswitch: "CoinSwitch",
  binance: "Binance",
  bybit: "Bybit",
};

const KIND: Record<RefillAction["kind"], string> = {
  MOVE_USDT: "Move USDT",
  MOVE_COIN: "Move coin",
  BUY_COIN: "Buy coin",
  DEPOSIT_INR: "Deposit INR",
};

export function RefillPlanPanel() {
  const query = useRefillPlan();
  const plan = query.data?.data;
  const actions = plan?.actions ?? [];
  const autoCount = actions.filter((action) => action.mode === "AUTO").length;

  return (
    <section className="panel min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-default px-5 py-4">
        <h2 className="font-mono text-sm tracking-[0.14em] text-text-primary">
          CAPITAL MANAGER · REFILL PLAN
          <span className="ml-3 text-[11px] tracking-normal text-text-muted">splits capital by live opportunity</span>
        </h2>
        {plan ? (
          <p className="font-mono text-[11px] text-text-muted">
            <span className={plan.automation.enabled ? "text-emerald-300" : "text-amber-300"}>
              auto {plan.automation.enabled ? "ON" : "OFF"}
            </span>
            {plan.automation.enabled ? (
              <>
                {" "}· Binance USDT → {plan.automation.autoUsdtDestinations.map((venue) => VENUE[venue] ?? venue).join(", ") || "none whitelisted"}
                {" "}· ≤ ${plan.automation.maximumPerTransferUsdt}/transfer, ${plan.automation.maximumPerDayUsdt}/day
              </>
            ) : null}
            {plan.automation.autoBuy?.enabled ? (
              <>
                {" "}· auto-buy ₹{Math.round(plan.automation.autoBuy.spentTodayInr).toLocaleString("en-IN")} / ₹{plan.automation.autoBuy.dailyCapInr.toLocaleString("en-IN")} today · keeps ₹{plan.automation.autoBuy.cashFloorInr.toLocaleString("en-IN")} cash
              </>
            ) : null}
            {plan.automation.autoSell?.enabled ? (
              <>
                {" "}· auto-sell ₹{Math.round(plan.automation.autoSell.spentTodayInr).toLocaleString("en-IN")} / ₹{plan.automation.autoSell.dailyCapInr.toLocaleString("en-IN")} · {plan.automation.autoSell.minimumHoldHours} h hold
              </>
            ) : null}
            {" "}· {autoCount} auto · {actions.length - autoCount} manual
          </p>
        ) : null}
      </div>

      {plan && Object.keys(plan.automation.blocked ?? {}).length > 0 ? (
        <div className="border-b border-border-default bg-amber-400/5 px-5 py-3 font-mono text-[11px] text-amber-300">
          {Object.entries(plan.automation.blocked).map(([venue, block]) => (
            <p key={venue}>
              Auto top-up to {VENUE[venue] ?? venue} paused until {new Date(block.until).toLocaleString("en-GB", {hour12: false})}: {block.reason}
            </p>
          ))}
        </div>
      ) : null}

      {plan?.venuePlan ? (
        <div className="border-b border-border-default px-5 py-3">
          <p className="mb-2 font-mono text-[11px] text-text-muted">
            Capital plan by exchange · where your capital should sit for every current opportunity (coins change; this adapts)
            {plan.allocation ? (
              <>
                {" "}· per leg ₹{plan.allocation.perLegInr.toLocaleString("en-IN")}
                {plan.allocation.dynamicLeg.enabled
                  ? ` (auto: grows with capital, ₹${plan.allocation.configuredLegInr.toLocaleString("en-IN")}–₹${plan.allocation.dynamicLeg.maximumInr.toLocaleString("en-IN")})`
                  : ""}
              </>
            ) : null}
          </p>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {plan.venuePlan.rows.map((row) => (
              <VenueCard key={row.key} row={row} usdtInr={plan.usdtInr} />
            ))}
          </div>
          {plan.venuePlan.misplaced.length > 0 ? (
            <p className="mt-2 font-mono text-[11px] text-amber-300">
              Stock on the wrong exchange (move by hand):{" "}
              {plan.venuePlan.misplaced.slice(0, 6).map((item) =>
                `${item.coin} ₹${Math.round(item.valueInr).toLocaleString("en-IN")} ${VENUE[item.venue] ?? item.venue} → ${VENUE[item.toVenue] ?? item.toVenue}`).join(" · ")}
            </p>
          ) : null}
        </div>
      ) : null}

      {plan?.allocation ? (
        <div className="border-b border-border-default">
          <p className="px-5 pt-3 font-mono text-[11px] text-text-muted">
            Allocation · budget ₹{Math.round(plan.allocation.budgetInr).toLocaleString("en-IN")} · allocated ₹{Math.round(plan.allocation.allocatedInr).toLocaleString("en-IN")}
            {" "}· weighted by the last {plan.allocation.liveSignalHours} h of opportunity
            {plan.allocation.unfunded.length > 0
              ? ` · waiting for capital: ${plan.allocation.unfunded.slice(0, 8).map((coin) => `${coin} (${poolLabel(plan.allocation?.unfundedBy?.[coin])})`).join(", ")}`
              : ""}
          </p>
          {plan.allocation.coins.length === 0 ? (
            <p className="px-5 pb-3 pt-1 text-xs text-text-muted">No coin has produced executable opportunity recently; nothing allocated.</p>
          ) : (
            <div className="overflow-auto">
              <table className="w-full min-w-[52rem] text-left text-xs">
                <thead>
                  <tr className="text-text-muted">
                    <th className="px-5 py-2 font-normal">Coin</th>
                    <th className="px-3 py-2 text-right font-normal">Weight</th>
                    <th className="px-3 py-2 text-right font-normal">Trades</th>
                    <th className="px-3 py-2 font-normal">Coin side</th>
                    <th className="px-3 py-2 font-normal">Cash side</th>
                    <th className="px-5 py-2 text-right font-normal">Est. ₹/day</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.allocation.coins.map((coin) => (
                    <tr key={coin.coin} className="border-t border-border-default/60 font-mono">
                      <td className="px-5 py-2 text-text-primary">{coin.coin}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{coin.weightPercent.toFixed(0)}%</td>
                      <td className="px-3 py-2 text-right tabular-nums text-text-primary">{coin.trades} × ₹{coin.perTradeInr.toLocaleString("en-IN")}</td>
                      <td className="px-3 py-2">
                        <Side have={coin.coinHaveInr} need={coin.coinNeedInr} label={`${coin.coin} on ${VENUE[coin.coinVenue] ?? coin.coinVenue}`} />
                      </td>
                      <td className="px-3 py-2">
                        <Side have={coin.cashHaveInr} need={coin.cashNeedInr} label={`${coin.cashAsset} on ${VENUE[coin.cashVenue] ?? coin.cashVenue}`} />
                      </td>
                      <td className="px-5 py-2 text-right tabular-nums">₹{Math.round(coin.expectedDailyProfitInr).toLocaleString("en-IN")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {plan.automation.autoSell?.enabled && plan.automation.autoSell.lastSkip ? (
            <p className="px-5 pb-3 pt-1 font-mono text-[11px] text-text-muted">
              Stock sell held back: {plan.automation.autoSell.lastSkip.reason}
            </p>
          ) : null}
        </div>
      ) : null}

      {query.isPending ? (
        <p className="p-5 text-xs text-text-muted">Loading refill plan…</p>
      ) : query.isError ? (
        <p className="p-5 text-xs text-red-300">Refill plan is unavailable.</p>
      ) : actions.length === 0 ? (
        <p className="p-5 text-xs text-emerald-300">Every core coin's sell side and buy side hold at least half of target. Nothing to refill.</p>
      ) : (
        <div className="max-h-[30rem] overflow-auto">
          <table className="w-full min-w-[60rem] text-left text-xs">
            <thead>
              <tr className="border-b border-border-default text-text-muted">
                <th className="px-5 py-3 font-normal">Mode</th>
                <th className="px-3 py-3 font-normal">For</th>
                <th className="px-3 py-3 font-normal">Action</th>
                <th className="px-3 py-3 text-right font-normal">Amount</th>
                <th className="px-5 py-3 font-normal">How</th>
              </tr>
            </thead>
            <tbody>
              {actions.map((action) => (
                <tr key={action.id} className="border-b border-border-default/60 align-top">
                  <td className="px-5 py-2.5 font-mono">
                    <span className={`px-1.5 py-0.5 text-[10px] ${action.mode === "AUTO" ? "bg-emerald-400/15 text-emerald-300" : "bg-amber-400/15 text-amber-300"}`}>{action.mode}</span>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-text-primary">{action.coins.join(", ")}</td>
                  <td className="px-3 py-2.5 font-mono">
                    <span className="text-text-primary">{KIND[action.kind]} {action.asset}</span>
                    <span className="block text-[11px] text-text-muted">
                      {action.fromVenue ? `${VENUE[action.fromVenue] ?? action.fromVenue} → ` : ""}{VENUE[action.toVenue] ?? action.toVenue}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-text-primary">
                    ₹{Math.round(action.amountInr).toLocaleString("en-IN")}
                    {action.quantity !== null ? (
                      <span className="block text-[10px] text-text-muted">≈{formatQuantity(action.quantity)} {action.asset}</span>
                    ) : null}
                  </td>
                  <td className="px-5 py-2.5 text-[11px] text-text-muted">
                    <span className="block text-text-primary">{action.howTo}</span>
                    {action.reason}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {plan && plan.recentExecutions.length > 0 ? (
        <div className="border-t border-border-default px-5 py-3 font-mono text-[11px]">
          <p className="mb-1 text-text-muted">Recent automatic actions</p>
          {plan.recentExecutions.slice(0, 6).map((execution) => {
            const ok = ["EXECUTED", "BUY_FILLED", "BUY_PARTIAL", "SELL_FILLED", "SELL_PARTIAL"].includes(execution.status);
            return (
              <p key={`${execution.at}-${execution.actionId}`} className={ok ? "text-emerald-300" : "text-amber-300"}>
                {new Date(execution.at).toLocaleString("en-GB", {hour12: false})} ·{" "}
                {execution.kind === "STOCK_BUY" || execution.kind === "STOCK_SELL"
                  ? `${execution.kind === "STOCK_BUY" ? "buy" : "sell"} ${execution.coin} on ${VENUE[execution.toVenue] ?? execution.toVenue} · ₹${Math.round(execution.spentInr ?? 0).toLocaleString("en-IN")}`
                  : execution.kind === "FUNDING_SWEEP"
                    ? execution.detail
                    : `${execution.amountUsdt} USDT ${execution.actionId.includes("|bybit>") ? "Bybit" : "Binance"} → ${VENUE[execution.toVenue] ?? execution.toVenue}`}
                {" "}· {execution.status}
                {!ok ? <span className="text-text-muted"> · {execution.detail}</span> : null}
              </p>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

type VenueRow = NonNullable<RefillPlanResponse["data"]["venuePlan"]>["rows"][number];

const ROW_NAME: Record<string, string> = {
  "binance+bybit": "Binance + Bybit",
  coindcx: "CoinDCX",
  coinswitch: "CoinSwitch",
  unocoin: "UnoCoin",
};

function VenueCard({row, usdtInr}: {row: VenueRow; usdtInr: number | null}) {
  const short = row.gapInr >= 300;
  const surplus = row.gapInr <= -300;
  const inUsdt = (inr: number) => (usdtInr ? `≈$${Math.round(inr / usdtInr).toLocaleString("en-IN")}` : "");
  return (
    <div className="border border-border-default/70 px-3 py-2 font-mono text-[11px]">
      <p className="text-text-primary">{ROW_NAME[row.key] ?? row.key} <span className="text-text-muted">· {row.fundWith}</span></p>
      <p className="mt-1 tabular-nums">
        <span className={short ? "text-amber-300" : "text-emerald-300"}>₹{row.haveInr.toLocaleString("en-IN")}</span>
        <span className="text-text-muted"> / ₹{row.targetInr.toLocaleString("en-IN")} target</span>
      </p>
      <p className="text-[10px] text-text-muted">cash ₹{row.cashTargetInr.toLocaleString("en-IN")} · stock ₹{row.stockTargetInr.toLocaleString("en-IN")}</p>
      <p className={`mt-1 ${short ? "text-amber-300" : surplus ? "text-sky-300" : "text-emerald-300"}`}>
        {short
          ? row.fundWith === "USDT"
            ? `Add ₹${row.gapInr.toLocaleString("en-IN")} ${inUsdt(row.gapInr)} USDT`
            : `Deposit ₹${row.gapInr.toLocaleString("en-IN")} INR`
          : surplus
            ? `₹${(-row.gapInr).toLocaleString("en-IN")} above its share`
            : "Balanced"}
      </p>
    </div>
  );
}

function poolLabel(pool: string | undefined): string {
  if (!pool || pool === "budget") return "more capital";
  if (pool === "USDT") return "USDT";
  const [venue, asset] = pool.split(":");
  return `${asset} on ${VENUE[venue ?? ""] ?? venue}`;
}

function Side({have, need, label}: {have: number | null; need: number; label: string}) {
  const ready = have !== null && have >= need * 0.5;
  return (
    <span className={ready ? "text-emerald-300" : "text-amber-300"}>
      ₹{have === null ? "?" : Math.round(have).toLocaleString("en-IN")} / ₹{need.toLocaleString("en-IN")}
      <span className="block text-[10px] text-text-muted">{label}</span>
    </span>
  );
}

function formatQuantity(value: number): string {
  return value >= 100 ? value.toFixed(0) : value >= 1 ? value.toFixed(2) : value.toPrecision(3);
}
