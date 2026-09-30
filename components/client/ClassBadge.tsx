import { Flame, Snowflake, Sun, type LucideIcon } from "lucide-react";

const STYLES = {
  A: "bg-danger/10 text-danger ring-danger/30",
  B: "bg-warning/10 text-warning ring-warning/30",
  C: "bg-sky-500/10 text-sky-500 ring-sky-500/30",
} as const;

/** A 🔥 hot, B ☀️ warm, C ❄️ cold — the icons (also on the class buttons of the client form). */
export const CLASS_ICONS: Record<"A" | "B" | "C", LucideIcon> = { A: Flame, B: Sun, C: Snowflake };
/** The same, where only text fits (a select's options). */
export const CLASS_EMOJI: Record<"A" | "B" | "C", string> = { A: "🔥", B: "☀️", C: "❄️" };

/** The class: its icon in a coloured square, with the letter small in the corner. */
export function ClassBadge({ value, title }: { value: string; title?: string }) {
  const key = (value in STYLES ? value : "C") as keyof typeof STYLES;
  const Icon = CLASS_ICONS[key];
  return (
    <span
      title={title}
      className={`relative grid size-7 shrink-0 place-items-center rounded-lg ring-1 ring-inset ${STYLES[key]}`}
    >
      <Icon className="size-4" aria-hidden />
      <span className="absolute -bottom-1 -right-1 grid h-3.5 min-w-3.5 place-items-center rounded bg-surface px-0.5 text-[9px] font-bold leading-none ring-1 ring-current">
        {key}
      </span>
    </span>
  );
}
