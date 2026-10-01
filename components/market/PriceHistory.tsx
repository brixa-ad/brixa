import { formatDayMonth, formatNumber } from "@/lib/format";
import type { Lang } from "@/lib/i18n/dictionaries";

/** The average € per m² day by day: a line, with the first and last value. */
export function PriceHistory({
  points,
  unit,
  lang,
}: {
  points: { day: string; value: number }[];
  unit: string;
  lang: Lang;
}) {
  const W = 640;
  const H = 180;
  const PAD = { top: 16, right: 12, bottom: 24, left: 12 };
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || max * 0.05 || 1;
  const low = min - span * 0.15;
  const high = max + span * 0.15;
  const x = (i: number) => PAD.left + (points.length === 1 ? (W - PAD.left - PAD.right) / 2 : (i / (points.length - 1)) * (W - PAD.left - PAD.right));
  const y = (v: number) => PAD.top + (1 - (v - low) / (high - low)) * (H - PAD.top - PAD.bottom);
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${H - PAD.bottom} L${x(0).toFixed(1)},${H - PAD.bottom} Z`;
  const last = points[points.length - 1];
  const label = (v: number) => `${formatNumber(v, lang)} ${unit}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={label(last.value)}>
      <defs>
        <linearGradient id="price-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.25" />
          <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#price-fill)" />
      <path d={line} fill="none" stroke="var(--color-accent)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <circle key={p.day} cx={x(i)} cy={y(p.value)} r={points.length > 40 ? 0 : 3} fill="var(--color-accent)" />
      ))}
      <circle cx={x(points.length - 1)} cy={y(last.value)} r="4.5" fill="var(--color-accent)" stroke="var(--color-surface)" strokeWidth="2" />
      <text x={PAD.left} y={H - 6} className="fill-subtle text-[11px]">
        {formatDayMonth(points[0].day, lang)}
      </text>
      <text x={W - PAD.right} y={H - 6} textAnchor="end" className="fill-subtle text-[11px]">
        {formatDayMonth(last.day, lang)}
      </text>
    </svg>
  );
}
