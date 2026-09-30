import type { Dictionary } from "@/lib/i18n/dictionaries";
import { TEMP_EMOJI, TEMP_TONE, type Temperature } from "@/lib/signals";

/** 🔥 Hot / 🌤️ Warm / 🧊 Cooling / ❄️ Cold — or just the sign (in lists). */
export function TemperatureBadge({ value, t, compact = false }: { value: Temperature; t: Dictionary; compact?: boolean }) {
  const label = t.signals.temperatures[value];
  if (compact) {
    return (
      <span title={label} aria-label={label} className={`grid size-7 shrink-0 place-items-center rounded-lg text-sm ${TEMP_TONE[value]}`}>
        {TEMP_EMOJI[value]}
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${TEMP_TONE[value]}`}>
      <span aria-hidden>{TEMP_EMOJI[value]}</span>
      {label}
    </span>
  );
}
