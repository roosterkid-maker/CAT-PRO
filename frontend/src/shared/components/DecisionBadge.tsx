interface DecisionBadgeProps {
  decision:
    | "EXECUTE"
    | "REVIEW"
    | "SKIP";

  scope?:
    | "DEFAULT"
    | "ANALYTICAL";
}

export default function DecisionBadge({
  decision,
  scope = "DEFAULT",
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

  const label =
    scope === "ANALYTICAL" &&
    decision === "EXECUTE"
      ? "ENGINE EXECUTE · NO ORDER"
      : decision;

  const style =
    scope === "ANALYTICAL" &&
    decision === "EXECUTE"
      ? "bg-brand/15 text-brand border-brand/30"
      : styles[decision];

  const icon =
    scope === "ANALYTICAL" &&
    decision === "EXECUTE"
      ? "◉"
      : icons[decision];

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1 text-sm font-semibold ${style}`}
    >
      <span>{icon}</span>

      <span>{label}</span>
    </div>
  );
}
