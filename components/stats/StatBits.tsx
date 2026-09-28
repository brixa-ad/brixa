import type { Clock } from "lucide-react";

/** A thin bar, longest = max. */
export function Bar({ value, max }: { value: number; max: number }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-raised">
      <div
        className="h-full rounded-full bg-gradient-to-r from-accent to-brand-cyan"
        style={{ width: `${max > 0 ? Math.max(3, (value / max) * 100) : 0}%` }}
      />
    </div>
  );
}

export function CardTitle({ icon: Icon, children }: { icon: typeof Clock; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-2">
      <Icon className="size-4 text-brand-cyan" />
      {children}
    </span>
  );
}

/** A heading between the parts of a statistics page. */
export function SectionTitle({ icon: Icon, children }: { icon: typeof Clock; children: React.ReactNode }) {
  return (
    <h2 className="mb-3 mt-8 flex items-center gap-2 text-lg font-bold tracking-tight first-of-type:mt-0 print:break-after-avoid">
      <Icon className="size-5 text-brand-cyan" />
      {children}
    </h2>
  );
}

export type Tile = { label: string; value: string; hint?: string };

/** The headline numbers. */
export function StatTiles({ tiles }: { tiles: Tile[] }) {
  return (
    <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4 print:grid-cols-4">
      {tiles.map((tile) => (
        <div key={tile.label} className="rounded-2xl border border-line bg-surface p-4 shadow-xs print:break-inside-avoid">
          <p className="text-xs font-medium text-muted">{tile.label}</p>
          <p className="mt-1 truncate text-2xl font-bold tracking-tight tabular-nums">{tile.value}</p>
          {tile.hint && <p className="mt-0.5 truncate text-[11px] text-subtle">{tile.hint}</p>}
        </div>
      ))}
    </div>
  );
}
