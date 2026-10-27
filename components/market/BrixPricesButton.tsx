"use client";

import { useState, useTransition } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { refreshPricesWithBrix } from "@/app/(app)/market/actions";
import { useI18n } from "@/components/I18nProvider";
import { buttonClass, inputClass } from "@/components/ui/form";

/** The owner or an office manager: Brix reads a town's prices from the portals now. */
export function BrixPricesButton({ towns }: { towns: { id: string; name: string; neighborhoods: unknown[] }[] }) {
  const { t } = useI18n();
  const priced = towns.filter((town) => town.neighborhoods.length > 0);
  const [town, setTown] = useState(priced[0]?.id ?? "");
  const [said, setSaid] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (priced.length === 0) return null;

  return (
    <div className="mb-4 space-y-2 rounded-xl border border-accent/30 bg-accent-soft/30 p-3">
      <p className="flex items-start gap-2 text-sm text-fg-2">
        <Sparkles className="mt-0.5 size-4 shrink-0 text-brand-cyan" />
        {t.market.brixAuto}
      </p>
      <div className="flex flex-wrap gap-2">
        {priced.length > 1 && (
          <select value={town} onChange={(e) => setTown(e.target.value)} className={`${inputClass} w-auto`}>
            {priced.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          disabled={pending || !town}
          onClick={() =>
            start(async () => {
              const result = await refreshPricesWithBrix(town);
              setSaid(result.ok ? t.market.brixStarted : t.market.brixToday);
            })
          }
          className={`${buttonClass.primary} px-3! py-1.5!`}
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {t.market.brixNow}
        </button>
      </div>
      {said && <p className="text-xs text-muted">{said}</p>}
    </div>
  );
}
