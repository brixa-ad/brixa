"use client";

import { useEffect, useMemo, useState } from "react";
import { MapPin, X } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { Combobox, type ComboOption } from "@/components/ui/Combobox";
import { settlementLabel } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type { Neighborhood, Region, Settlement } from "@/lib/types";

/** Several settlements, each optionally narrowed to some of its neighborhoods. */
export function MultiLocationPicker({
  regions,
  settlements,
  settlementIds,
  neighborhoodIds,
  onChange,
}: {
  regions: Region[];
  settlements: Settlement[];
  settlementIds: string[];
  neighborhoodIds: string[];
  onChange: (next: { settlementIds: string[]; neighborhoodIds: string[] }) => void;
}) {
  const { t } = useI18n();
  const [cache, setCache] = useState<Record<string, Neighborhood[]>>({});

  const settlementById = useMemo(() => new Map(settlements.map((s) => [s.id, s])), [settlements]);
  const regionById = useMemo(() => new Map(regions.map((r) => [r.id, r])), [regions]);

  const missing = settlementIds.filter((id) => !(id in cache));
  const missingKey = missing.join(",");

  useEffect(() => {
    if (!missingKey) return;
    let ignore = false;
    const ids = missingKey.split(",");

    createClient()
      .from("geo_neighborhoods")
      .select("id, settlement_id, name")
      .in("settlement_id", ids)
      .order("name")
      .then(({ data, error }) => {
        if (ignore) return;
        if (error) console.error("Loading neighborhoods failed:", error);
        setCache((current) => {
          const next = { ...current };
          for (const id of ids) next[id] = (data ?? []).filter((n) => n.settlement_id === id);
          return next;
        });
      });

    return () => {
      ignore = true;
    };
  }, [missingKey]);

  const options: ComboOption[] = useMemo(
    () =>
      settlements
        .filter((s) => !settlementIds.includes(s.id))
        .map((s) => ({
          value: s.id,
          label: settlementLabel(s),
          hint: `${t.location.regionPrefix} ${regionById.get(s.region_id)?.name ?? ""}`,
        })),
    [settlements, settlementIds, regionById, t.location.regionPrefix]
  );

  function add(id: string | null) {
    if (!id || settlementIds.includes(id)) return;
    onChange({ settlementIds: [...settlementIds, id], neighborhoodIds });
  }

  function remove(id: string) {
    const drop = new Set((cache[id] ?? []).map((n) => n.id));
    onChange({
      settlementIds: settlementIds.filter((s) => s !== id),
      neighborhoodIds: neighborhoodIds.filter((n) => !drop.has(n)),
    });
  }

  function toggleNeighborhood(id: string) {
    onChange({
      settlementIds,
      neighborhoodIds: neighborhoodIds.includes(id)
        ? neighborhoodIds.filter((n) => n !== id)
        : [...neighborhoodIds, id],
    });
  }

  return (
    <div className="space-y-3">
      <Combobox
        options={options}
        value={null}
        onChange={add}
        placeholder={t.clients.addLocation}
        emptyText={t.location.noMatches}
      />

      {settlementIds.length > 0 && (
        <ul className="space-y-2">
          {settlementIds.map((id) => {
            const settlement = settlementById.get(id);
            const hoods = cache[id] ?? [];
            return (
              <li key={id} className="rounded-xl border border-line bg-raised/50 p-3">
                <div className="flex items-center gap-2">
                  <MapPin className="size-4 shrink-0 text-accent-fg" />
                  <span className="flex-1 font-medium">
                    {settlement ? settlementLabel(settlement) : id}
                  </span>
                  <button
                    type="button"
                    onClick={() => remove(id)}
                    aria-label={t.photos.remove}
                    className="grid size-7 place-items-center rounded-md text-subtle hover:bg-overlay hover:text-fg"
                  >
                    <X className="size-4" />
                  </button>
                </div>
                {hoods.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5 pl-6">
                    {hoods.map((hood) => {
                      const on = neighborhoodIds.includes(hood.id);
                      return (
                        <button
                          key={hood.id}
                          type="button"
                          aria-pressed={on}
                          onClick={() => toggleNeighborhood(hood.id)}
                          className={`rounded-full border px-2.5 py-0.5 text-xs transition ${
                            on
                              ? "border-accent bg-accent text-on-accent"
                              : "border-line-strong text-fg-2 hover:border-subtle"
                          }`}
                        >
                          {hood.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
