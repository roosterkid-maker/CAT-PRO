import type { ReactNode } from "react";

interface DecisionCardProps {
  title: string;
  color:
    | "green"
    | "yellow"
    | "red";

  children: ReactNode;
}

const styles = {
  green:
    "border-success/30 bg-success/10",

  yellow:
    "border-warning/30 bg-warning/10",

  red:
    "border-danger/30 bg-danger/10",
};

export default function DecisionCard({
  title,
  color,
  children,
}: DecisionCardProps) {
  return (
    <div
      className={`rounded-2xl border p-6 ${styles[color]}`}
    >
      <h2 className="text-2xl font-bold">
        {title}
      </h2>

      <div className="mt-5">
        {children}
      </div>
    </div>
  );
}