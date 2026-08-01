import { formatPrice } from "@/shared/utils/formatPrice";
import { formatUpdatedTime } from "@/shared/utils/formatUpdatedTime";
import {
  TableCell,
  TableRow,
} from "@/shared/ui/table";

import { useFavoritesStore } from "../store/favorites.store";
import type { MarketViewModel } from "@/types/MarketViewModel";

interface MarketTableRowProps {
  market: MarketViewModel;
}

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

  const priceClass =
    market.direction === "up"
      ? "text-success price-flash-up"
      : market.direction === "down"
        ? "text-danger price-flash-down"
        : "text-text-primary";

  const executableClass =
    market.executable
      ? "text-success"
      : "text-text-muted";

  return (
    <TableRow className="border-border-default hover:bg-panel-light">
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
          className={
            isFavorite
              ? "text-warning transition-transform hover:scale-110"
              : "text-text-muted transition-transform hover:scale-110 hover:text-warning"
          }
        >
          {isFavorite ? "★" : "☆"}
        </button>
      </TableCell>

      <TableCell className="font-medium">
        {market.market}
      </TableCell>

      <TableCell className="uppercase">
        {market.exchange}
      </TableCell>

      <TableCell
        key={`${market.exchange}-${market.market}-${market.timestamp}`}
        className={`text-right font-mono tabular-nums transition-colors ${priceClass}`}
      >
        {formatPrice(market.lastPrice)}
      </TableCell>

      <TableCell className="text-right font-mono tabular-nums">
        {formatPrice(
          market.bestBidPrice,
        )}
      </TableCell>

      <TableCell className="text-right font-mono tabular-nums">
        {formatPrice(
          market.bestAskPrice,
        )}
      </TableCell>

      <TableCell className="text-right font-mono tabular-nums text-text-muted">
        {formatPrice(
          market.bestBidQty,
        )}
      </TableCell>

      <TableCell className="text-right font-mono tabular-nums text-text-muted">
        {formatPrice(
          market.bestAskQty,
        )}
      </TableCell>

      <TableCell className="text-right font-mono tabular-nums">
        {formatPrice(market.spread)}
      </TableCell>

      <TableCell
        className={`text-center text-xs font-semibold uppercase ${executableClass}`}
      >
        {market.executable
          ? "Executable"
          : "Indicative"}
      </TableCell>

      <TableCell className="text-right text-text-muted">
        {formatUpdatedTime(
          market.timestamp,
        )}
      </TableCell>
    </TableRow>
  );
}