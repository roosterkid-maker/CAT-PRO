interface DecisionBadgeProps {
  decision:
    | "EXECUTE"
    | "REVIEW"
    | "SKIP";
}

export default function DecisionBadge({
  decision,
}: DecisionBadgeProps) {
  const styles = {
    EXECUTE:
      "bg-success/20 text-success border-success/30",

    REVIEW:
      "bg-warning/20 text-warning border-warning/30",

    SKIP:
      "bg-danger/20 text-danger border-danger/30",
  };

  const icons = {
    EXECUTE: "🟢",

    REVIEW: "🟡",

    SKIP: "🔴",
  };

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1 text-sm font-semibold ${styles[decision]}`}
    >
      <span>{icons[decision]}</span>

      <span>{decision}</span>
    </div>
  );
}