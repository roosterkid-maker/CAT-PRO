import { Input } from "@/shared/ui/input";

interface MarketSearchProps {
  value: string;
  onChange: (value: string) => void;
}

export default function MarketSearch({
  value,
  onChange,
}: MarketSearchProps) {
  return (
    <div className="mb-4">
      <Input
        placeholder="Search markets..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}