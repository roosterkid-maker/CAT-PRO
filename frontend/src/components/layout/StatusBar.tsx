import { useSocketStore } from "@/store/socket.store";

const statusConfig = {
  connected: {
    label: "Connected",
    className: "text-success",
  },
  connecting: {
    label: "Connecting",
    className: "text-warning",
  },
  disconnected: {
    label: "Disconnected",
    className: "text-danger",
  },
} as const;

export default function StatusBar() {
  const status = useSocketStore((state) => state.status);
  const socketStatus = statusConfig[status];

  return (
    <footer className="flex h-9 shrink-0 items-center justify-between border-t border-border-default bg-panel px-4 text-xs text-text-muted">
      <span>
        CoinDCX <span className="text-success">● Connected</span>
      </span>

      <span>
        Backend <span className={socketStatus.className}>
          ● {socketStatus.label}
        </span>
      </span>

      <span>
        Socket <span className={socketStatus.className}>
          ● {socketStatus.label}
        </span>
      </span>
    </footer>
  );
}