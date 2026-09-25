const STYLES: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  reserved: "bg-amber-50 text-amber-700 ring-amber-600/20",
  sold: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
  rented: "bg-sky-50 text-sky-700 ring-sky-600/20",
  withdrawn: "bg-slate-100 text-slate-600 ring-slate-500/20",
};

export function StatusBadge({ status, label }: { status: string; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${
        STYLES[status] ?? STYLES.withdrawn
      }`}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}
