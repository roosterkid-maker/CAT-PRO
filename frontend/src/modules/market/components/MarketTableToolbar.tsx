import { Badge } from "@/shared/ui/badge";
import { Input } from "@/shared/ui/input";
import { useSocketStore } from "@/store/socket.store";

interface MarketTableToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  marketCount: number;
}

const badgeConfig = {
  connected: {
    label: "● LIVE",
    className:
      "bg-success text-white hover:bg-success",
  },

  connecting: {
    label: "● CONNECTING",
    className:
      "bg-warning text-black hover:bg-warning",
  },

  disconnected: {
    label: "● OFFLINE",
    className:
      "bg-danger text-white hover:bg-danger",
  },
} as const;

export default function MarketTableToolbar({
  search,
  onSearchChange,
  marketCount,
}: MarketTableToolbarProps) {
  const status = useSocketStore(
    (state) => state.status,
  );

  const badge = badgeConfig[status];

  return (
    <div className="mb-5 rounded-xl border border-border-default bg-panel p-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-1 items-center gap-4">
          <Input
            placeholder="Search market, exchange..."
            value={search}
            onChange={(event) =>
              onSearchChange(
                event.target.value,
              )
            }
            className="max-w-md"
          />

          {/* Sprint 20.6 */}

          <select
            disabled
            className="rounded-lg border border-border-default bg-panel-light px-3 py-2 text-sm text-text-muted"
          >
            <option>
              All Exchanges
            </option>
          </select>

          {/* Sprint 20.7 */}

          <label className="flex items-center gap-2 text-sm text-text-muted">
            <input
              disabled
              type="checkbox"
            />

            Favorites
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">
            Markets {marketCount}
          </Badge>

          <Badge variant="secondary">
            Terminal
          </Badge>

          <Badge
            className={badge.className}
          >
            {badge.label}
          </Badge>
        </div>
      </div>
    </div>
  );
}