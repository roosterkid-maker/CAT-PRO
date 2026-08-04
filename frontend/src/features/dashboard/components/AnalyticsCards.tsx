import { Card } from "@/shared/ui/card";

const cards = [
  "Total Profit",
  "ROI",
  "Win Rate",
  "Capital",
  "Open Trades",
  "Health",
];

export function AnalyticsCards() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
      {cards.map((title) => (
        <Card
          key={title}
          className="p-4"
        >
          <div className="text-xs text-muted-foreground">
            {title}
          </div>

          <div className="mt-2 text-2xl font-bold">
            --
          </div>
        </Card>
      ))}
    </div>
  );
}