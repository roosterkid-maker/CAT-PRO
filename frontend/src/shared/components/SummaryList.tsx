interface SummaryListProps {
  items: string[];
}

export default function SummaryList({
  items,
}: SummaryListProps) {
  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div
          key={index}
          className="flex items-start gap-2 text-sm"
        >
          <span className="text-success">
            ✔
          </span>

          <span>{item}</span>
        </div>
      ))}
    </div>
  );
}