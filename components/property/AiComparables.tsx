"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus, Sparkles } from "lucide-react";
import { addComparable } from "@/app/(app)/properties/comparable-actions";
import { useI18n } from "@/components/I18nProvider";
import { buttonClass } from "@/components/ui/form";
import { formatNumber, formatPrice } from "@/lib/format";
import { fmt } from "@/lib/i18n/dictionaries";
import type { FoundComparable } from "@/lib/rating";

/** Brix searches the portals for listings like this one; the broker ticks which to add. */
export function AiComparables({ propertyId, ready }: { propertyId: string; ready: boolean }) {
  const { t, lang } = useI18n();
  const [searching, setSearching] = useState(false);
  const [found, setFound] = useState<FoundComparable[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [adding, startAdding] = useTransition();

  if (!ready) return <p className="mt-3 text-xs text-subtle">{t.rating.aiOff}</p>;

  async function search() {
    setSearching(true);
    setError(null);
    setFound(null);
    try {
      const response = await fetch("/api/brix/comparables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId }),
      });
      const data = (await response.json().catch(() => ({}))) as { listings?: FoundComparable[]; error?: string };
      if (!response.ok || !data.listings) {
        setError(data.error === "limit" ? t.rating.aiLimit : t.rating.aiFailed);
      } else {
        setFound(data.listings);
        setPicked(new Set(data.listings.map((l) => l.url)));
      }
    } catch {
      setError(t.rating.aiFailed);
    }
    setSearching(false);
  }

  function addPicked() {
    const chosen = (found ?? []).filter((l) => picked.has(l.url));
    startAdding(async () => {
      let failed = false;
      for (const l of chosen) {
        const result = await addComparable(propertyId, { url: l.url, title: l.title, price: l.priceEur, area: l.area, floor: l.floor });
        if (!result.ok) failed = true;
      }
      if (failed) setError(t.errors.generic);
      setFound(null);
    });
  }

  const toggle = (url: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });

  return (
    <div className="mt-4">
      <button type="button" onClick={search} disabled={searching || adding} className={buttonClass.secondary}>
        {searching ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4 text-brand-cyan" />}
        {t.rating.aiFind}
      </button>
      {searching && <p className="mt-2 text-sm text-muted">{t.rating.aiSearching}</p>}
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}

      {found && found.length === 0 && <p className="mt-2 text-sm text-muted">{t.rating.aiNone}</p>}
      {found && found.length > 0 && (
        <div className="mt-3 rounded-2xl border border-line p-3">
          <p className="text-sm font-medium">{fmt(t.rating.aiFound, { n: found.length })}</p>
          <ul className="mt-2 divide-y divide-line-soft">
            {found.map((l) => (
              <li key={l.url}>
                <label className="flex cursor-pointer items-center gap-3 py-2 text-sm">
                  <input type="checkbox" checked={picked.has(l.url)} onChange={() => toggle(l.url)} className="size-4 accent-[var(--accent)]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {l.source ?? "—"}
                      {l.title && <span className="font-normal text-muted"> · {l.title}</span>}
                    </span>
                    <span className="block text-xs text-muted">
                      {formatNumber(l.area, lang, 1)} {t.units.sqm}
                      {l.floor !== null && ` · ${t.rating.floor.toLowerCase()} ${l.floor}`} · {formatNumber(l.priceEur / l.area, lang)} €/{t.units.sqm} ·{" "}
                      <a href={l.url} target="_blank" rel="noopener noreferrer" className="text-accent-fg hover:underline">
                        {t.rating.aiOpen}
                      </a>
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">{formatPrice(l.priceEur, "EUR", lang)}</span>
                </label>
              </li>
            ))}
          </ul>
          <button type="button" onClick={addPicked} disabled={adding || picked.size === 0} className={`${buttonClass.primary} mt-3`}>
            {adding ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            {t.rating.aiAdd}
          </button>
        </div>
      )}
    </div>
  );
}
