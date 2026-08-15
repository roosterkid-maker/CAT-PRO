import type {
  ReactNode,
} from "react";

interface StatCardProps {
  title: string;

  value:
    | string
    | number;

  description?: string;

  icon?: ReactNode;

  trend?: {
    label: string;

    direction:
      | "up"
      | "down"
      | "neutral";
  };
}

export function StatCard({
  title,
  value,
  description,
  icon,
  trend,
}: StatCardProps) {
  const trendClassName =
    trend?.direction === "up"
      ? "text-emerald-400"
      : trend?.direction === "down"
        ? "text-red-400"
        : "text-text-muted";

  return (
    <section className="rounded-xl border border-border bg-panel p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-text-muted">
            {title}
          </p>

          <p className="mt-2 text-2xl font-semibold tracking-tight text-text-primary">
            {value}
          </p>
        </div>

        {icon ? (
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-panel-light text-primary">
            {icon}
          </div>
        ) : null}
      </div>

      {description || trend ? (
        <div className="mt-4 flex items-center justify-between gap-3 text-xs">
          <span className="text-text-muted">
            {description}
          </span>

          {trend ? (
            <span className={trendClassName}>
              {trend.label}
            </span>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}