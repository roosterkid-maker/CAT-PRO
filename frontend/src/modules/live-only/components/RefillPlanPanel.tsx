import {
  useRefillPlan,
} from "../hooks/useLiveOnlyRuntime";

import type {
  RefillAction,
} from "../types/LiveOnlyRuntime";

/*
 * Capital manager refill plan: keeps the core coin basket stocked. AUTO
 * actions (USDT from Binance to a whitelisted exchange) are carried out by
 * the capital manager within its caps; MANUAL actions are exact
 * instructions for the operator.
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
          <span className="ml-3 text-[11px] tracking-normal text-text-muted">keeps the core basket stocked</span>
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
            {" "}· {autoCount} auto · {actions.length - autoCount} manual
          </p>
        ) : null}
      </div>

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
          <p className="mb-1 text-text-muted">Recent automatic transfers</p>
          {plan.recentExecutions.slice(0, 5).map((execution) => (
            <p key={`${execution.at}-${execution.actionId}`} className={execution.status === "EXECUTED" ? "text-emerald-300" : "text-amber-300"}>
              {new Date(execution.at).toLocaleString("en-GB", {hour12: false})} · {execution.amountUsdt} USDT → {VENUE[execution.toVenue] ?? execution.toVenue} · {execution.status}
              {execution.status !== "EXECUTED" ? <span className="text-text-muted"> · {execution.detail}</span> : null}
            </p>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function formatQuantity(value: number): string {
  return value >= 100 ? value.toFixed(0) : value >= 1 ? value.toFixed(2) : value.toPrecision(3);
}
