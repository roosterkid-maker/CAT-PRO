import type { PaperTrade } from "../types/PaperTrade";

interface PaperTradeStatusBadgeProps {
  status: PaperTrade["status"];
}

function getStatusStyles(
  status: PaperTrade["status"],
): string {
  switch (status) {
    case "closed":
    case "target-hit":
      return "border-success/30 bg-success/10 text-success";

    case "failed":
      return "border-danger/30 bg-danger/10 text-danger";

    case "cancelled":
      return "border-warning/30 bg-warning/10 text-warning";

    case "monitoring":
    case "open":
      return "border-brand/30 bg-brand/10 text-brand";

    case "validated":
      return "border-blue-500/30 bg-blue-500/10 text-blue-400";

    case "detected":
    default:
      return "border-border-default bg-panel-light text-text-muted";
  }
}

function formatStatus(
  status: PaperTrade["status"],
): string {
  return status
    .split("-")
    .map(
      (word) =>
        word.charAt(0).toUpperCase() +
        word.slice(1),
    )
    .join(" ");
}

export function PaperTradeStatusBadge({
  status,
}: PaperTradeStatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusStyles(
        status,
      )}`}
    >
      {formatStatus(status)}
    </span>
  );
}