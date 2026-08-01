interface DashboardStatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
}

export default function DashboardStatCard({
  title,
  value,
  subtitle,
}: DashboardStatCardProps) {
  return (
    <div className="rounded-xl border border-border-default bg-panel p-5 transition-all hover:border-brand/40 hover:shadow-lg">
      <p className="text-sm text-text-muted">
        {title}
      </p>

      <h2 className="mt-2 text-3xl font-bold tracking-tight">
        {value}
      </h2>

      {subtitle && (
        <p className="mt-2 text-xs text-text-muted">
          {subtitle}
        </p>
      )}
    </div>
  );
}