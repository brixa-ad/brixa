"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import { Combobox } from "@/components/ui/Combobox";
import { inputClass } from "@/components/ui/form";
import { createClient } from "@/lib/supabase/client";
import type { Settlement } from "@/lib/types";

/** A town (searchable) and one of its neighborhoods — two fields, laid out by the parent's grid. */
export function TownPicker({
  settlements,
  settlementId,
  neighborhoodId,
  onChange,
  townLabel,
  neighborhoodLabel,
  noNeighborhood,
}: {
  settlements: Settlement[];
  settlementId: string | null;
  neighborhoodId: string | null;
  onChange: (next: { settlementId: string | null; neighborhoodId: string | null }) => void;
  townLabel: string;
  neighborhoodLabel: string;
  noNeighborhood: string;
}) {
  const { t } = useI18n();
  const [cache, setCache] = useState<Record<string, { id: string; name: string }[]>>({});
  const hoods = settlementId ? cache[settlementId] : undefined;

  useEffect(() => {
    if (!settlementId || cache[settlementId]) return;
    let ignore = false;
    createClient()
      .from("geo_neighborhoods")
      .select("id, name")
      .eq("settlement_id", settlementId)
      .order("name")
      .then(({ data }) => {
        if (!ignore) setCache((c) => ({ ...c, [settlementId]: data ?? [] }));
      });
    return () => {
      ignore = true;
    };
  }, [settlementId, cache]);

  const options = useMemo(() => settlements.map((s) => ({ value: s.id, label: `${s.settlement_type} ${s.name}` })), [settlements]);

  return (
    <>
      <div>
        <span className="mb-1.5 block text-sm font-medium text-fg-2">{townLabel}</span>
        <Combobox
          options={options}
          value={settlementId}
          onChange={(id) => onChange({ settlementId: id, neighborhoodId: null })}
          placeholder={t.form.choose}
          emptyText={t.location.noMatches}
          aria-label={townLabel}
        />
      </div>
      <label className="block text-sm font-medium text-fg-2">
        {neighborhoodLabel}
        <select
          value={neighborhoodId ?? ""}
          disabled={!settlementId || !hoods?.length}
          onChange={(e) => onChange({ settlementId, neighborhoodId: e.target.value || null })}
          className={`${inputClass} mt-1.5`}
        >
          <option value="">{noNeighborhood}</option>
          {(hoods ?? []).map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
