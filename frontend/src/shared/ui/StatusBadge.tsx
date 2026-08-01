interface StatusBadgeProps {
  status: "success" | "warning" | "danger" | "info";
  children: React.ReactNode;
}

const styles = {
  success:
    "bg-success/15 text-success border-success/30",
  warning:
    "bg-warning/15 text-warning border-warning/30",
  danger:
    "bg-danger/15 text-danger border-danger/30",
  info:
    "bg-brand/15 text-brand border-brand/30",
};

export default function StatusBadge({
  status,
  children,
}: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${styles[status]}`}
    >
      ● {children}
    </span>
  );
}