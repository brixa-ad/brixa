// Dark, mostly opaque bases so the badge stays readable on top of photos too.
const STYLES: Record<string, string> = {
  active: "bg-emerald-950/85 text-emerald-300 ring-emerald-400/30",
  reserved: "bg-amber-950/85 text-amber-300 ring-amber-400/30",
  sold: "bg-indigo-950/85 text-indigo-300 ring-indigo-400/30",
  rented: "bg-sky-950/85 text-sky-300 ring-sky-400/30",
  withdrawn: "bg-zinc-900/85 text-zinc-300 ring-white/15",
};

export function StatusBadge({ status, label }: { status: string; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset backdrop-blur ${
        STYLES[status] ?? STYLES.withdrawn
      }`}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}
