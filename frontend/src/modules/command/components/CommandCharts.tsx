import {
  useState,
} from "react";

/*
 * Hand-built SVG charts for the Command Center (no chart dependency). Thin
 * marks, surface gaps between segments, legends beside every multi-series
 * chart, and hover that updates in place - never a pop-up.
 */

export interface DonutSegment {
  readonly label: string;
  readonly value: number;
  readonly color: string;
}

export function Donut({
  segments,
  centerLabel,
  centerValue,
  format,
  size = 168,
}: {
  segments: readonly DonutSegment[];
  centerLabel: string;
  centerValue: string;
  format: (value: number) => string;
  size?: number;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const total = segments.reduce((sum, segment) => sum + Math.max(0, segment.value), 0);
  const radius = size / 2 - 10;
  const circumference = 2 * Math.PI * radius;
  const gap = segments.length > 1 ? 3 : 0;
  let offset = 0;
  const active = hovered !== null ? segments[hovered] : null;

  return (
    <div className="flex items-center gap-5">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0" role="img" aria-label={centerLabel}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--border-subtle)" strokeWidth={14} />
        {total > 0
          ? segments.map((segment, index) => {
              const length = (Math.max(0, segment.value) / total) * circumference;
              const dash = Math.max(0, length - gap);
              const element = (
                <circle
                  key={segment.label}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={segment.color}
                  strokeWidth={hovered === index ? 18 : 14}
                  strokeDasharray={`${dash} ${circumference - dash}`}
                  strokeDashoffset={-offset}
                  transform={`rotate(-90 ${size / 2} ${size / 2})`}
                  style={{transition: "stroke-width 120ms", filter: hovered === index ? `drop-shadow(0 0 6px ${segment.color})` : undefined}}
                  onMouseEnter={() => setHovered(index)}
                  onMouseLeave={() => setHovered(null)}
                />
              );
              offset += length;
              return element;
            })
          : null}
        <text x="50%" y="46%" textAnchor="middle" className="fill-[var(--text-label)] font-mono" fontSize={9} letterSpacing="0.2em">
          {(active?.label ?? centerLabel).toUpperCase()}
        </text>
        <text x="50%" y="60%" textAnchor="middle" className="fill-[var(--text-primary)] font-mono" fontSize={15} fontWeight={600}>
          {active ? format(active.value) : centerValue}
        </text>
      </svg>
      <ul className="min-w-0 flex-1 space-y-1.5 font-mono text-[11px]">
        {segments.map((segment, index) => (
          <li
            key={segment.label}
            className={`flex items-center gap-2 ${hovered === index ? "text-text-primary" : "text-text-muted"}`}
            onMouseEnter={() => setHovered(index)}
            onMouseLeave={() => setHovered(null)}
          >
            <span className="inline-block size-2 shrink-0" style={{background: segment.color}} />
            <span className="truncate">{segment.label}</span>
            <span className="ml-auto tabular-nums text-text-primary">{total > 0 ? `${((segment.value / total) * 100).toFixed(0)}%` : "—"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Bars({
  values,
  labels,
  color,
  height = 120,
  format,
  highlightIndex,
}: {
  values: readonly number[];
  labels: readonly string[];
  color: string;
  height?: number;
  format: (value: number) => string;
  highlightIndex?: number;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const peak = Math.max(0, ...values);
  const shown = hovered ?? highlightIndex ?? null;

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between font-mono text-[11px]">
        <span className="text-text-muted">{shown !== null ? labels[shown] : "hover a bar"}</span>
        <span className="tabular-nums text-text-primary">{shown !== null ? format(values[shown] ?? 0) : `peak ${format(peak)}`}</span>
      </div>
      <div className="flex items-end gap-[2px]" style={{height}}>
        {values.map((value, index) => (
          <div
            key={index}
            className="flex h-full flex-1 cursor-crosshair items-end"
            onMouseEnter={() => setHovered(index)}
            onMouseLeave={() => setHovered(null)}
          >
            <div
              className="w-full rounded-t-[2px]"
              style={{
                height: peak > 0 && value > 0 ? `${Math.max(3, (value / peak) * 100)}%` : "2px",
                background: value > 0 ? color : "var(--border-subtle)",
                opacity: shown === null || shown === index ? 1 : 0.35,
                boxShadow: shown === index && value > 0 ? `0 0 10px ${color}` : undefined,
              }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[9px] text-text-muted">
        <span>{labels[0]}</span>
        <span>{labels[Math.floor(labels.length / 2)]}</span>
        <span>{labels[labels.length - 1]}</span>
      </div>
    </div>
  );
}

export function Sparkline({
  points,
  color,
  height = 56,
  baseline,
}: {
  points: readonly number[];
  color: string;
  height?: number;
  baseline?: number;
}) {
  const width = 320;
  if (points.length < 2) {
    return <div className="flex items-center justify-center font-mono text-[10px] text-text-muted" style={{height}}>collecting…</div>;
  }
  const maximum = Math.max(baseline ?? 0, ...points, 0.0001);
  const step = width / (points.length - 1);
  const y = (value: number) => height - 4 - (Math.max(0, value) / maximum) * (height - 8);
  const line = points.map((value, index) => `${index === 0 ? "M" : "L"}${(index * step).toFixed(1)},${y(value).toFixed(1)}`).join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;
  const id = `spark-${color.replace(/[^a-z0-9]/giu, "")}`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="w-full" style={{height}}>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.35} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {baseline !== undefined ? (
        <line x1={0} x2={width} y1={y(baseline)} y2={y(baseline)} stroke="var(--neon-orange)" strokeWidth={1} strokeDasharray="4 4" opacity={0.7} />
      ) : null}
      <path d={area} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Semicircle meter: share of a limit used, red past 80%. */
export function Gauge({
  used,
  limit,
  label,
  valueText,
}: {
  used: number;
  limit: number;
  label: string;
  valueText: string;
}) {
  const share = limit > 0 ? Math.min(1, Math.max(0, used / limit)) : 0;
  const radius = 54;
  const circumference = Math.PI * radius;
  const color = share >= 0.8 ? "var(--neon-red)" : share >= 0.5 ? "var(--neon-orange)" : "var(--neon-green)";
  return (
    <svg viewBox="0 0 140 80" className="w-full max-w-[180px]" role="img" aria-label={label}>
      <path d="M16 72 A54 54 0 0 1 124 72" fill="none" stroke="var(--border-subtle)" strokeWidth={10} strokeLinecap="round" />
      <path
        d="M16 72 A54 54 0 0 1 124 72"
        fill="none"
        stroke={color}
        strokeWidth={10}
        strokeLinecap="round"
        strokeDasharray={`${share * circumference} ${circumference}`}
        style={{filter: `drop-shadow(0 0 5px ${color})`}}
      />
      <text x="70" y="58" textAnchor="middle" className="fill-[var(--text-primary)] font-mono" fontSize={14} fontWeight={600}>{valueText}</text>
      <text x="70" y="74" textAnchor="middle" className="fill-[var(--text-label)] font-mono" fontSize={7} letterSpacing="0.2em">{label.toUpperCase()}</text>
    </svg>
  );
}
