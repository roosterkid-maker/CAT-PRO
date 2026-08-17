import type { ReactNode } from "react";

interface HeroCardProps {
  title: string;
  subtitle?: string;
  status?: ReactNode;
  children: ReactNode;
}

export default function HeroCard({
  title,
  subtitle,
  status,
  children,
}: HeroCardProps) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border-default bg-panel shadow-sm">
      <header className="flex items-start justify-between border-b border-border-default px-6 py-5">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">
            {title}
          </h2>

          {subtitle && (
            <p className="mt-2 text-sm text-text-muted">
              {subtitle}
            </p>
          )}
        </div>

        {status}
      </header>

      <div className="p-6">
        {children}
      </div>
    </section>
  );
}