interface MetricBarProps {
  title: string;

  score: number;
}

export default function MetricBar({
  title,
  score,
}: MetricBarProps) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span>{title}</span>

        <span>{score}</span>
      </div>

      <div className="h-2 overflow-hidden rounded bg-panel-light">
        <div
          className="h-full rounded bg-success transition-all"
          style={{
            width: `${Math.max(
              0,
              Math.min(score, 100),
            )}%`,
          }}
        />
      </div>
    </div>
  );
}