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
    label: "LIVE",
    className: "bg-success text-white hover:bg-success",
  },
  connecting: {
    label: "CONNECTING",
    className: "bg-warning text-black hover:bg-warning",
  },
  disconnected: {
    label: "DISCONNECTED",
    className: "bg-danger text-white hover:bg-danger",
  },
} as const;

export default function MarketTableToolbar({
  search,
  onSearchChange,
  marketCount,
}: MarketTableToolbarProps) {
  const status = useSocketStore((state) => state.status);
  const badge = badgeConfig[status];

  return (
    <div className="mb-4 flex items-center justify-between gap-4">
      <Input
        placeholder="Search markets..."
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        className="max-w-sm"
      />

      <div className="flex items-center gap-2">
        <Badge variant="secondary">
          Markets: {marketCount}
        </Badge>

        <Badge className={badge.className}>
          {badge.label}
        </Badge>
      </div>
    </div>
  );
}