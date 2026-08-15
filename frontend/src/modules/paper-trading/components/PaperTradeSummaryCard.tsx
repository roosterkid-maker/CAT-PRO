interface PaperTradeSummaryCardProps {
  title: string;
  value: string;
  tone?: "default" | "success" | "danger" | "warning";
}

function getValueClass(
  tone: PaperTradeSummaryCardProps["tone"],
): string {
  switch (tone) {
    case "success":
      return "text-success";

    case "danger":
      return "text-danger";

    case "warning":
      return "text-warning";

    case "default":
    default:
      return "text-text-primary";
  }
}

export function PaperTradeSummaryCard({
  title,
  value,
  tone = "default",
}: PaperTradeSummaryCardProps) {
  return (
    <div className="rounded-xl border border-border-default bg-panel p-5">
      <p className="text-sm text-text-muted">
        {title}
      </p>

      <p
        className={`mt-2 text-2xl font-bold tabular-nums ${getValueClass(
          tone,
        )}`}
      >
        {value}
      </p>
    </div>
  );
}