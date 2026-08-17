import {
  Badge,
} from "@/shared/ui/badge";

import {
  Input,
} from "@/shared/ui/input";

import {
  useSocketStore,
} from "@/store/socket.store";

interface MarketTableToolbarProps {
  search:
    string;

  onSearchChange:
    (
      value:
        string,
    ) => void;

  marketCount:
    number;

  exchange:
    string;

  exchanges:
    string[];

  onExchangeChange:
    (
      value:
        string,
    ) => void;

  favoritesOnly:
    boolean;

  onFavoritesOnlyChange:
    (
      value:
        boolean,
    ) => void;
}

const badgeConfig = {
  connected: {
    label:
      "● MARKET DATA LIVE",

    className:
      "bg-success text-white hover:bg-success",
  },

  connecting: {
    label:
      "● CONNECTING",

    className:
      "bg-warning text-black hover:bg-warning",
  },

  disconnected: {
    label:
      "● OFFLINE",

    className:
      "bg-danger text-white hover:bg-danger",
  },
} as const;

export default function MarketTableToolbar({
  search,
  onSearchChange,
  marketCount,
  exchange,
  exchanges,
  onExchangeChange,
  favoritesOnly,
  onFavoritesOnlyChange,
}: MarketTableToolbarProps) {
  const status =
    useSocketStore(
      (state) =>
        state.status,
    );

  const badge =
    badgeConfig[
      status
    ];

  return (
    <div className="mb-5 rounded-xl border border-border-default bg-panel p-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <Input
            placeholder="Search market, exchange..."
            value={
              search
            }
            onChange={(
              event,
            ) =>
              onSearchChange(
                event.target.value,
              )
            }
            className="min-w-64 max-w-md"
          />

          <select
            value={
              exchange
            }
            onChange={(
              event,
            ) =>
              onExchangeChange(
                event.target.value,
              )
            }
            className="rounded-lg border border-border-default bg-panel-light px-3 py-2 text-sm text-text-primary outline-none transition focus:border-brand"
          >
            <option value="ALL">
              All Exchanges
            </option>

            {exchanges.map(
              (
                item,
              ) => (
                <option
                  key={
                    item
                  }
                  value={
                    item
                  }
                >
                  {
                    item
                  }
                </option>
              ),
            )}
          </select>

          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border-default bg-panel-light px-3 py-2 text-sm text-text-muted">
            <input
              type="checkbox"
              checked={
                favoritesOnly
              }
              onChange={(
                event,
              ) =>
                onFavoritesOnlyChange(
                  event.target.checked,
                )
              }
            />

            Favorites only
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">
            Markets{" "}
            {
              marketCount
            }
          </Badge>

          <Badge variant="secondary">
            Read-only market view
          </Badge>

          <Badge
            className={
              badge.className
            }
          >
            {
              badge.label
            }
          </Badge>
        </div>
      </div>
    </div>
  );
}