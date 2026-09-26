const STYLES = {
  A: "bg-danger/10 text-danger ring-danger/30",
  B: "bg-warning/10 text-warning ring-warning/30",
  C: "bg-sky-500/10 text-sky-500 ring-sky-500/30",
} as const;

/** A / B / C — hot, warm, cold. */
export function ClassBadge({ value, title }: { value: string; title?: string }) {
  const style = STYLES[value as keyof typeof STYLES] ?? STYLES.C;
  return (
    <span
      title={title}
      className={`grid size-7 shrink-0 place-items-center rounded-lg text-sm font-bold ring-1 ring-inset ${style}`}
    >
      {value}
    </span>
  );
}
