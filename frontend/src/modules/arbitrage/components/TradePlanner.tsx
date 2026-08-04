import { useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";

import { useCreatePaperTrade } from "@/modules/paper-trading/hooks/usePaperTrades";
import { evaluateTradingIntelligence } from "@/modules/trading/services/tradingIntelligence";
import DecisionCard from "@/shared/ui/DecisionCard";
import { formatPrice } from "@/shared/utils/formatPrice";

import type { Opportunity } from "../types/Opportunity";
import { getExchangeUrl } from "../utils/exchangeLinks";

interface TradePlannerProps {
  opportunity: Opportunity;
}

interface MetricProps {
  title: string;
  value: string;
  success?: boolean;
}

const CAPITAL_PRESETS = [
  10_000,
  25_000,
  50_000,
  100_000,
  250_000,
  500_000,
];

function formatQuantity(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "0";
  }

  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: value >= 1 ? 2 : 8,
  }).format(value);
}

function formatCurrency(value: number): string {
  if (!Number.isFinite(value)) {
    return "₹0.00";
  }

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function Metric({
  title,
  value,
  success = false,
}: MetricProps) {
  return (
    <div className="rounded-xl border border-border-default p-4">
      <p className="text-xs uppercase tracking-wide text-text-muted">
        {title}
      </p>

      <p
        className={`mt-2 text-2xl font-bold tabular-nums ${
          success ? "text-success" : "text-text-primary"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

export default function TradePlanner({
  opportunity,
}: TradePlannerProps) {
  const [capital, setCapital] = useState(10_000);

  const createPaperTrade = useCreatePaperTrade();

  const intelligence =
    evaluateTradingIntelligence(opportunity);

  const decisionColor:
    | "green"
    | "yellow"
    | "red" =
    intelligence.decision.decision === "EXECUTE"
      ? "green"
      : intelligence.decision.decision === "REVIEW"
        ? "yellow"
        : "red";

  const isTradeSkipped =
    intelligence.decision.decision === "SKIP";

  const calculation = useMemo(() => {
    const safeCapital =
      Number.isFinite(capital) && capital > 0
        ? capital
        : 0;

    const quantity =
      opportunity.buyPrice > 0
        ? safeCapital / opportunity.buyPrice
        : 0;

    const grossProfit =
      quantity * opportunity.rawSpread;

    const totalFees =
      quantity * opportunity.estimatedFees;

    const netProfit =
      quantity * opportunity.netProfit;

    const roi =
      safeCapital > 0
        ? (netProfit / safeCapital) * 100
        : 0;

    return {
      quantity,
      grossProfit,
      totalFees,
      netProfit,
      roi,
    };
  }, [capital, opportunity]);

  const buyExchangeUrl = getExchangeUrl(
    opportunity.buyExchange,
    opportunity.market,
  );

  const sellExchangeUrl = getExchangeUrl(
    opportunity.sellExchange,
    opportunity.market,
  );

  const paperTradeError =
    createPaperTrade.error instanceof Error
      ? createPaperTrade.error.message
      : "Unable to start paper trade.";

  return (
    <div className="mb-6 rounded-2xl border border-border-default bg-panel p-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-brand">
        Trade Planner
      </p>

      <h2 className="mt-2 text-3xl font-bold">
        {opportunity.market}
      </h2>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-success/20 bg-success/5 p-5">
          <p className="text-xs uppercase tracking-wide text-text-muted">
            Buy
          </p>

          <h3 className="mt-2 text-xl font-semibold uppercase text-success">
            {opportunity.buyExchange}
          </h3>

          <p className="mt-3 font-mono text-lg tabular-nums">
            {formatPrice(opportunity.buyPrice)}
          </p>
        </div>

        <div className="rounded-xl border border-danger/20 bg-danger/5 p-5">
          <p className="text-xs uppercase tracking-wide text-text-muted">
            Sell
          </p>

          <h3 className="mt-2 text-xl font-semibold uppercase text-danger">
            {opportunity.sellExchange}
          </h3>

          <p className="mt-3 font-mono text-lg tabular-nums">
            {formatPrice(opportunity.sellPrice)}
          </p>
        </div>
      </div>

      <div className="mt-8">
        <label
          htmlFor="trading-capital"
          className="mb-3 block text-sm font-medium"
        >
          Trading Capital
        </label>

        <div className="mb-4 flex flex-wrap gap-2">
          {CAPITAL_PRESETS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                createPaperTrade.reset();
                setCapital(value);
              }}
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition-all ${
                capital === value
                  ? "border-brand bg-brand text-white"
                  : "border-border-default bg-panel-light text-text-muted hover:border-brand hover:text-text-primary"
              }`}
            >
              ₹
              {value >= 100_000
                ? `${value / 100_000}L`
                : `${value / 1_000}K`}
            </button>
          ))}
        </div>

        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-text-muted">
            ₹
          </span>

          <input
            id="trading-capital"
            type="number"
            min={0}
            step={1_000}
            value={capital}
            onChange={(event) => {
              createPaperTrade.reset();

              const value = Number(
                event.target.value,
              );

              setCapital(
                Number.isFinite(value)
                  ? Math.max(0, value)
                  : 0,
              );
            }}
            className="w-full rounded-lg border border-border-default bg-app-bg py-3 pl-9 pr-4 font-mono tabular-nums outline-none transition-colors focus:border-brand"
          />
        </div>

        {capital > 10_000 && (
          <p className="mt-2 text-xs text-warning">
            Current paper-trading limit is ₹10,000 per trade.
          </p>
        )}
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric
          title="You Receive"
          value={formatQuantity(
            calculation.quantity,
          )}
        />

        <Metric
          title="Gross Profit"
          value={formatCurrency(
            calculation.grossProfit,
          )}
        />

        <Metric
          title="Estimated Fees"
          value={formatCurrency(
            calculation.totalFees,
          )}
        />

        <Metric
          title="Net Profit"
          value={formatCurrency(
            calculation.netProfit,
          )}
          success
        />
      </div>

      <div className="mt-6 rounded-xl border border-success/20 bg-success/5 p-5">
        <p className="text-sm text-text-muted">
          Estimated ROI
        </p>

        <p className="mt-2 text-4xl font-bold tabular-nums text-success">
          {calculation.roi.toFixed(2)}%
        </p>
      </div>

      <div className="mt-6">
        <DecisionCard
          title={`Trade Decision: ${intelligence.decision.decision}`}
          color={decisionColor}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-text-muted">
                Confidence
              </p>

              <p className="mt-2 text-2xl font-bold tabular-nums">
                {
                  intelligence.confidence
                    .confidence
                }
                %
              </p>
            </div>

            <div>
              <p className="text-xs uppercase tracking-wide text-text-muted">
                Risk
              </p>

              <p className="mt-2 text-2xl font-bold">
                {intelligence.risk.risk}
              </p>
            </div>
          </div>

          <div className="mt-5">
            <p className="text-xs uppercase tracking-wide text-text-muted">
              Reasons
            </p>

            <div className="mt-3 space-y-2">
              {intelligence.summary.map(
                (reason) => (
                  <p
                    key={reason}
                    className="text-sm text-text-primary"
                  >
                    ✓ {reason}
                  </p>
                ),
              )}
            </div>
          </div>
        </DecisionCard>
      </div>

      <div className="mt-6">
        <button
          type="button"
          disabled={
            createPaperTrade.isPending ||
            capital <= 0 ||
            capital > 10_000 ||
            isTradeSkipped
          }
          onClick={() => {
            createPaperTrade.reset();

          createPaperTrade.mutate({
          opportunityId: opportunity.id,
          requestedCapital: capital,
          });
          }}
          className="w-full rounded-xl bg-brand px-6 py-4 text-lg font-semibold text-white transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {createPaperTrade.isPending
            ? "Starting Paper Trade..."
            : isTradeSkipped
              ? "Trade Not Recommended"
              : "Start Paper Trade"}
        </button>

        {isTradeSkipped && (
          <p className="mt-3 text-sm text-danger">
            Paper trade disabled because this opportunity is marked as SKIP.
          </p>
        )}

        {createPaperTrade.isError && (
          <p className="mt-3 text-sm text-danger">
            {paperTradeError}
          </p>
        )}

        {createPaperTrade.isSuccess && (
          <p className="mt-3 text-sm text-success">
            Paper trade created successfully.
          </p>
        )}
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {buyExchangeUrl ? (
          <a
            href={buyExchangeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-success px-5 py-3 font-semibold text-black transition-transform hover:-translate-y-0.5"
          >
            Buy on{" "}
            {opportunity.buyExchange.toUpperCase()}
            <ExternalLink size={17} />
          </a>
        ) : (
          <button
            type="button"
            disabled
            className="cursor-not-allowed rounded-lg bg-panel-light px-5 py-3 font-semibold text-text-muted opacity-60"
          >
            Buy exchange link unavailable
          </button>
        )}

        {sellExchangeUrl ? (
          <a
            href={sellExchangeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-danger px-5 py-3 font-semibold text-white transition-transform hover:-translate-y-0.5"
          >
            Sell on{" "}
            {opportunity.sellExchange.toUpperCase()}
            <ExternalLink size={17} />
          </a>
        ) : (
          <button
            type="button"
            disabled
            className="cursor-not-allowed rounded-lg bg-panel-light px-5 py-3 font-semibold text-text-muted opacity-60"
          >
            Sell exchange link unavailable
          </button>
        )}
      </div>

      <p className="mt-4 text-xs text-warning">
        Estimate only. Real results can change because of bid/ask prices,
        liquidity, slippage, transfer charges, taxes, and execution delay.
      </p>
    </div>
  );
}