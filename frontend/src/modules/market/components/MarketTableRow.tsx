import {
  TableCell,
  TableRow,
} from "@/shared/ui/table";
import { formatPrice } from "@/shared/utils/formatPrice";
import { formatUpdatedTime } from "@/shared/utils/formatUpdatedTime";

import type { MarketViewModel } from "@/types/MarketViewModel";

import { useFavoritesStore } from "../store/favorites.store";

interface MarketTableRowProps {
  market: MarketViewModel;
}

type ExchangeIdentity = {
  symbol: string;
  label: string;
  className: string;
};

export default function MarketTableRow({
  market,
}: MarketTableRowProps) {
  const isFavorite = useFavoritesStore((state) =>
    state.isFavorite(
      market.exchange,
      market.market,
    ),
  );

  const toggleFavorite = useFavoritesStore(
    (state) => state.toggleFavorite,
  );

  const exchangeIdentity = getExchangeIdentity(
    market.exchange,
  );

  const priceClass =
    market.direction === "up"
      ? "text-success price-flash-up"
      : market.direction === "down"
        ? "text-danger price-flash-down"
        : "text-text-primary";

  const updateState = getUpdateState(
    market.timestamp,
  );

  const hasExecutableBid =
    market.executable &&
    market.bestBidPrice !== null;

  const hasExecutableAsk =
    market.executable &&
    market.bestAskPrice !== null;

  return (
    <TableRow className="group border-border-default transition-colors hover:bg-panel-light">
      <TableCell className="w-12 text-center">
        <button
          type="button"
          onClick={() =>
            toggleFavorite(
              market.exchange,
              market.market,
            )
          }
          aria-label={
            isFavorite
              ? `Remove ${market.market} on ${market.exchange} from favorites`
              : `Add ${market.market} on ${market.exchange} to favorites`
          }
          aria-pressed={isFavorite}
          className={
            isFavorite
              ? "text-lg text-warning transition-transform hover:scale-110"
              : "text-lg text-text-muted transition-all hover:scale-110 hover:text-warning"
          }
        >
          {isFavorite ? "★" : "☆"}
        </button>
      </TableCell>

      <TableCell className="min-w-40">
        <div>
          <p className="font-semibold text-text-primary">
            {market.market}
          </p>

          <div className="mt-1 flex items-center gap-2">
            <span
              className={`text-[10px] font-semibold uppercase tracking-wide ${
                market.executable
                  ? "text-success"
                  : "text-text-muted"
              }`}
            >
              {market.executable
                ? "Executable"
                : "Indicative"}
            </span>

            {market.spread !== null && (
              <span className="font-mono text-[10px] tabular-nums text-text-muted">
                Spread{" "}
                {formatPrice(
                  market.spread,
                )}
              </span>
            )}
          </div>
        </div>
      </TableCell>

      <TableCell className="min-w-32">
        <div
          className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold uppercase ${exchangeIdentity.className}`}
        >
          <span aria-hidden="true">
            {exchangeIdentity.symbol}
          </span>

          <span>
            {exchangeIdentity.label}
          </span>
        </div>
      </TableCell>

      <TableCell
        key={`${market.exchange}-${market.market}-${market.timestamp}`}
        className={`min-w-36 text-right font-mono font-semibold tabular-nums transition-colors ${priceClass}`}
      >
        {formatPrice(
          market.lastPrice,
        )}
      </TableCell>

      <TableCell className="min-w-32 text-right">
        {hasExecutableBid ? (
          <div>
            <p className="font-mono font-medium tabular-nums text-success">
              {formatPrice(
                market.bestBidPrice,
              )}
            </p>

            {market.bestBidQty !== null && (
              <p className="mt-1 font-mono text-[10px] tabular-nums text-text-muted">
                Qty{" "}
                {formatPrice(
                  market.bestBidQty,
                )}
              </p>
            )}
          </div>
        ) : (
          <WaitingValue />
        )}
      </TableCell>

      <TableCell className="min-w-32 text-right">
        {hasExecutableAsk ? (
          <div>
            <p className="font-mono font-medium tabular-nums text-danger">
              {formatPrice(
                market.bestAskPrice,
              )}
            </p>

            {market.bestAskQty !== null && (
              <p className="mt-1 font-mono text-[10px] tabular-nums text-text-muted">
                Qty{" "}
                {formatPrice(
                  market.bestAskQty,
                )}
              </p>
            )}
          </div>
        ) : (
          <WaitingValue />
        )}
      </TableCell>

      <TableCell className="min-w-28 text-right">
        <div className="flex flex-col items-end gap-1">
          <span
            className={`text-xs font-semibold uppercase ${updateState.className}`}
          >
            {updateState.label}
          </span>

          <span className="font-mono text-[10px] tabular-nums text-text-muted">
            {formatUpdatedTime(
              market.timestamp,
            )}
          </span>
        </div>
      </TableCell>
    </TableRow>
  );
}

function WaitingValue() {
  return (
    <span className="text-xs italic text-text-muted">
      Waiting…
    </span>
  );
}

function getExchangeIdentity(
  exchange: string,
): ExchangeIdentity {
  switch (
    exchange.trim().toLowerCase()
  ) {
    case "binance":
      return {
        symbol: "●",
        label: "Binance",
        className:
          "border-warning/30 bg-warning/10 text-warning",
      };

    case "coindcx":
      return {
        symbol: "●",
        label: "CoinDCX",
        className:
          "border-success/30 bg-success/10 text-success",
      };

    case "bybit":
      return {
        symbol: "●",
        label: "Bybit",
        className:
          "border-border-default bg-panel-light text-text-primary",
      };

    default:
      return {
        symbol: "●",
        label: exchange,
        className:
          "border-brand/30 bg-brand/10 text-brand",
      };
  }
}

function getUpdateState(
  timestamp: number,
): {
  label: string;
  className: string;
} {
  const ageMs = Math.max(
    0,
    Date.now() - timestamp,
  );

  if (ageMs <= 3_000) {
    return {
      label: "Live",
      className: "text-success",
    };
  }

  if (ageMs <= 10_000) {
    return {
      label: "Fresh",
      className: "text-brand",
    };
  }

  if (ageMs <= 30_000) {
    return {
      label: "Delayed",
      className: "text-warning",
    };
  }

  return {
    label: "Stale",
    className: "text-danger",
  };
}