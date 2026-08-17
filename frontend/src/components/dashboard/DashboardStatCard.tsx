interface DashboardStatCardProps {
  title: string;
  value:
    | string
    | number
    | null;
  subtitle?: string;
}

export default function DashboardStatCard({
  title,
  value,
  subtitle,
}: DashboardStatCardProps) {
  const available =
    value !== null;

  return (
    <div className="rounded-xl border border-border-default bg-panel p-5 transition-all hover:border-brand/40 hover:shadow-lg">
      <p className="text-sm text-text-muted">
        {title}
      </p>

      <h2
        className={`mt-2 text-3xl font-bold tracking-tight ${
          available
            ? "text-text-primary"
            : "text-text-muted"
        }`}
      >
        {available
          ? value
          : "Unavailable"}
      </h2>

      {subtitle && (
        <p className="mt-2 text-xs text-text-muted">
          {subtitle}
        </p>
      )}
    </div>
  );
}
