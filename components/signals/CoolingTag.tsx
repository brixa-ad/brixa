import { ArrowDown } from "lucide-react";
import type { Dictionary } from "@/lib/i18n/dictionaries";

/** "↓ cooling" — on top of the class: an A or B client going quiet (call before the class drops). */
export function CoolingTag({ t }: { t: Dictionary }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-sky-500/10 px-2 py-0.5 text-[11px] font-semibold text-sky-500">
      <ArrowDown className="size-3" aria-hidden />
      {t.signals.cooling}
    </span>
  );
}
