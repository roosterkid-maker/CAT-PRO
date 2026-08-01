interface ScoreBadgeProps {
  score: number;
}

export default function ScoreBadge({
  score,
}: ScoreBadgeProps) {
  const color =
    score >= 85
      ? "text-success"

      : score >= 65
        ? "text-warning"

        : "text-danger";

  return (
    <div className="text-center">
      <p className="text-xs text-text-muted">
        Overall Score
      </p>

      <p
        className={`text-4xl font-bold ${color}`}
      >
        {score}
      </p>
    </div>
  );
}