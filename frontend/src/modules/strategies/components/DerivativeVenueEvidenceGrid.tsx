import {
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";

export interface DerivativeVenueEvidenceView {
  exchange: string;
  state: "READY" | "DEGRADED" | "NO_DATA";
  authenticatedReadReady: boolean;
  positionMarkets: number;
  availableMargin: number | null;
  availableMarginUnit: "USDT" | "ACCOUNT_USD_VALUE" | null;
  targetMarginCovered: boolean;
  feeConfigured: boolean;
  paperEvidenceReady: boolean;
  lastError: string | null;
}

export function DerivativeVenueEvidenceGrid({
  venues,
}: {
  venues: readonly DerivativeVenueEvidenceView[];
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {venues.map((venue) => (
        <article key={venue.exchange} className="rounded-md border border-border-default bg-panel p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold text-text-primary">{venue.exchange.toUpperCase()}</p>
            <span className={`rounded-full border px-2 py-1 font-mono text-[10px] font-bold ${
              venue.paperEvidenceReady
                ? "border-success/30 bg-success/10 text-success"
                : "border-danger/30 bg-danger/10 text-danger"
            }`}>{venue.state}</span>
          </div>
          <div className="mt-3 space-y-2 text-xs">
            <Gate label="Authenticated positions" passed={venue.authenticatedReadReady}
              value={`${venue.positionMarkets} market(s)`} />
            <Gate label="Explicit derivative fee" passed={venue.feeConfigured}
              value={venue.feeConfigured ? "CONFIGURED" : "MISSING"} />
            <Gate label="Target margin covered" passed={venue.targetMarginCovered}
              value={venue.availableMargin === null ? "NO_DATA" : `${formatNumber(venue.availableMargin)} ${venue.availableMarginUnit ?? ""}`} />
          </div>
          {venue.lastError ? (
            <p className="mt-3 break-words rounded-md border border-danger/20 bg-danger/5 p-2 font-mono text-[10px] leading-4 text-danger">
              {venue.lastError}
            </p>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function Gate({label, value, passed}: {label: string; value: string; passed: boolean}) {
  return <div className="flex items-center justify-between gap-3"><span className="text-text-muted">{label}</span><span className={`inline-flex items-center gap-1 font-mono text-[10px] font-bold ${passed ? "text-success" : "text-danger"}`}>{passed ? <CheckCircle2 className="size-3" /> : <AlertTriangle className="size-3" />}{value}</span></div>;
}

function formatNumber(value: number): string {
  return value.toLocaleString("en-IN", {maximumFractionDigits: 6});
}
